"""Pure invoice state machine.

No DB, no side effects, no I/O. Callers load an Invoice from SQLAlchemy,
call :func:`next_state`, and persist the returned state. All guard
conditions are expressed in terms of the ``context`` dict so this module
never depends on the ORM.

State diagram (from plan §"End-to-End Pipeline" and §"Confidence
Threshold and Submit Gate"):

    PENDING
      │ photo_received
      ▼
    VERIFYING ──────────────────┐
      │ extraction_complete     │ extraction_complete
      │ (high conf, no missing) │ (low conf or missing)
      ▼                         ▼
    VERIFIED                   NEEDS_INFO
      │                         │ driver_provided_text
      │                         ▼
      │                       VERIFYING
      │                         │ vendor_override
      │                         ▼
      │                       VERIFIED
      │ user_submits_to_gov
      ▼
    SUBMITTED_TO_GOV
      │ vendor_flags_dispute
      ▼
    DISPUTED
      │ dispute_resolved
      ▼
    VERIFIED

Action strings emitted alongside the new state are suggestions for the
caller (e.g. "send_whatsapp_reply", "generate_pdf", "emit_sse") — the
caller chooses whether to invoke them.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple


class InvoiceState(str, Enum):
    PENDING = "PENDING"
    VERIFYING = "VERIFYING"
    VERIFIED = "VERIFIED"
    NEEDS_INFO = "NEEDS_INFO"
    SUBMITTED_TO_GOV = "SUBMITTED_TO_GOV"
    DISPUTED = "DISPUTED"


# Events --------------------------------------------------------------------
PHOTO_RECEIVED = "photo_received"
EXTRACTION_COMPLETE = "extraction_complete"
EDGE_CASES_FOUND = "edge_cases_found"
DRIVER_PROVIDED_TEXT = "driver_provided_text"
VENDOR_OVERRIDE = "vendor_override"
USER_SUBMITS_TO_GOV = "user_submits_to_gov"
VENDOR_FLAGS_DISPUTE = "vendor_flags_dispute"
DISPUTE_RESOLVED = "dispute_resolved"


# Actions -------------------------------------------------------------------
ACTION_START_EXTRACTION = "start_extraction"
ACTION_SEND_NEEDS_INFO_REPLY = "send_needs_info_reply"
ACTION_SEND_VERIFIED_REPLY = "send_verified_reply"
ACTION_GENERATE_PDF = "generate_pdf"
ACTION_EMIT_SSE = "emit_sse"
ACTION_WRITE_CHALLAN_EVENT = "write_challan_event"
ACTION_RECORD_SUBMISSION = "record_submission"
ACTION_NOTIFY_ADMIN = "notify_admin"
ACTION_RESET_DISPUTE = "reset_dispute"


DEFAULT_CONFIDENCE_THRESHOLD = 0.85


class InvalidTransitionError(Exception):
    """Raised when an event is not valid from the current state."""


@dataclass(frozen=True)
class Transition:
    from_state: InvoiceState
    event: str
    to_state: InvoiceState
    actions: Tuple[str, ...]
    guard: Optional[Callable[[Dict[str, Any]], bool]] = None

    def applies(self, current: InvoiceState, event: str, context: Dict[str, Any]) -> bool:
        if self.from_state != current or self.event != event:
            return False
        if self.guard is None:
            return True
        return bool(self.guard(context))


# ---------------------------------------------------------------------------
# Guards
# ---------------------------------------------------------------------------
def _guard_extraction_high_quality(ctx: Dict[str, Any]) -> bool:
    """High confidence AND no missing fields — drive to VERIFIED."""
    threshold = ctx.get("confidence_threshold", DEFAULT_CONFIDENCE_THRESHOLD)
    confidence = ctx.get("confidence", 0.0) or 0.0
    missing = ctx.get("missing_fields") or []
    has_block_case = ctx.get("has_block_edge_case", False)
    return (
        confidence >= threshold
        and len(missing) == 0
        and not has_block_case
    )


def _guard_extraction_low_quality(ctx: Dict[str, Any]) -> bool:
    """Inverse of the high-quality guard."""
    return not _guard_extraction_high_quality(ctx)


# ---------------------------------------------------------------------------
# Transition table
# ---------------------------------------------------------------------------
_TRANSITIONS: List[Transition] = [
    # PENDING --photo_received--> VERIFYING
    Transition(
        from_state=InvoiceState.PENDING,
        event=PHOTO_RECEIVED,
        to_state=InvoiceState.VERIFYING,
        actions=(ACTION_START_EXTRACTION, ACTION_WRITE_CHALLAN_EVENT, ACTION_EMIT_SSE),
    ),
    # VERIFYING --extraction_complete(high)--> VERIFIED
    Transition(
        from_state=InvoiceState.VERIFYING,
        event=EXTRACTION_COMPLETE,
        to_state=InvoiceState.VERIFIED,
        guard=_guard_extraction_high_quality,
        actions=(
            ACTION_GENERATE_PDF,
            ACTION_SEND_VERIFIED_REPLY,
            ACTION_WRITE_CHALLAN_EVENT,
            ACTION_EMIT_SSE,
        ),
    ),
    # VERIFYING --extraction_complete(low)--> NEEDS_INFO
    Transition(
        from_state=InvoiceState.VERIFYING,
        event=EXTRACTION_COMPLETE,
        to_state=InvoiceState.NEEDS_INFO,
        guard=_guard_extraction_low_quality,
        actions=(
            ACTION_SEND_NEEDS_INFO_REPLY,
            ACTION_WRITE_CHALLAN_EVENT,
            ACTION_EMIT_SSE,
        ),
    ),
    # NEEDS_INFO --driver_provided_text--> VERIFYING
    Transition(
        from_state=InvoiceState.NEEDS_INFO,
        event=DRIVER_PROVIDED_TEXT,
        to_state=InvoiceState.VERIFYING,
        actions=(ACTION_START_EXTRACTION, ACTION_WRITE_CHALLAN_EVENT, ACTION_EMIT_SSE),
    ),
    # NEEDS_INFO --vendor_override--> VERIFIED
    Transition(
        from_state=InvoiceState.NEEDS_INFO,
        event=VENDOR_OVERRIDE,
        to_state=InvoiceState.VERIFIED,
        actions=(
            ACTION_GENERATE_PDF,
            ACTION_SEND_VERIFIED_REPLY,
            ACTION_WRITE_CHALLAN_EVENT,
            ACTION_EMIT_SSE,
        ),
    ),
    # VERIFIED --user_submits_to_gov--> SUBMITTED_TO_GOV
    Transition(
        from_state=InvoiceState.VERIFIED,
        event=USER_SUBMITS_TO_GOV,
        to_state=InvoiceState.SUBMITTED_TO_GOV,
        actions=(
            ACTION_RECORD_SUBMISSION,
            ACTION_WRITE_CHALLAN_EVENT,
            ACTION_EMIT_SSE,
        ),
    ),
    # VERIFIED --vendor_flags_dispute--> DISPUTED
    Transition(
        from_state=InvoiceState.VERIFIED,
        event=VENDOR_FLAGS_DISPUTE,
        to_state=InvoiceState.DISPUTED,
        actions=(ACTION_NOTIFY_ADMIN, ACTION_WRITE_CHALLAN_EVENT, ACTION_EMIT_SSE),
    ),
    # SUBMITTED_TO_GOV --vendor_flags_dispute--> DISPUTED
    Transition(
        from_state=InvoiceState.SUBMITTED_TO_GOV,
        event=VENDOR_FLAGS_DISPUTE,
        to_state=InvoiceState.DISPUTED,
        actions=(ACTION_NOTIFY_ADMIN, ACTION_WRITE_CHALLAN_EVENT, ACTION_EMIT_SSE),
    ),
    # DISPUTED --dispute_resolved--> VERIFIED
    Transition(
        from_state=InvoiceState.DISPUTED,
        event=DISPUTE_RESOLVED,
        to_state=InvoiceState.VERIFIED,
        actions=(ACTION_RESET_DISPUTE, ACTION_WRITE_CHALLAN_EVENT, ACTION_EMIT_SSE),
    ),
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def next_state(
    current: InvoiceState | str,
    event: str,
    context: Optional[Dict[str, Any]] = None,
) -> Tuple[InvoiceState, List[str]]:
    """Compute the next state + actions for ``current`` on ``event``.

    Raises :class:`InvalidTransitionError` if no transition matches.
    """
    ctx = context or {}
    state = current if isinstance(current, InvoiceState) else InvoiceState(current)

    for transition in _TRANSITIONS:
        if transition.applies(state, event, ctx):
            return transition.to_state, list(transition.actions)

    raise InvalidTransitionError(
        f"No transition from {state.value} on event {event!r} "
        f"(context keys: {sorted(ctx.keys())})"
    )


def can_transition(
    current: InvoiceState | str,
    event: str,
    context: Optional[Dict[str, Any]] = None,
) -> bool:
    """Non-raising variant for UI checks."""
    try:
        next_state(current, event, context)
        return True
    except InvalidTransitionError:
        return False


def determine_target_state_after_extraction(
    confidence: float,
    missing_fields: List[str],
    has_block_edge_case: bool = False,
    threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> InvoiceState:
    """Shortcut helper used by the pipeline orchestrator.

    Returns the target state VERIFYING-after-extraction will transition
    to (VERIFIED or NEEDS_INFO) without requiring the caller to
    construct a context dict.
    """
    ctx = {
        "confidence": confidence,
        "missing_fields": missing_fields,
        "has_block_edge_case": has_block_edge_case,
        "confidence_threshold": threshold,
    }
    if _guard_extraction_high_quality(ctx):
        return InvoiceState.VERIFIED
    return InvoiceState.NEEDS_INFO
