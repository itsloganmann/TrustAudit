"""Thread-safe in-memory demo session store for the public /live feed.

This module owns the lightweight state that powers ``/api/live/invoices``
and ``/api/demo/*``. It is intentionally decoupled from the main SQL
database because the public demo dashboard has a very different
lifecycle from the real multi-tenant product:

* Rows auto-expire after 10 minutes (default) so the shared screen
  doesn't accumulate cruft between Zoom calls.
* Vendor names are anonymized to ``Vendor A/B/C`` so nothing identifying
  leaks onto the public URL.
* Multiple concurrent customer meetings run in parallel under distinct
  ``session_id`` keys and never cross-pollinate.

The store is a plain ``dict[str, SessionState]`` guarded by a
``threading.Lock``. It is deliberately ephemeral: a server restart
wipes all sessions, which is the correct behavior for a demo surface.

Every mutation returns a new dict/list — we never mutate objects that
have already been handed to callers. This keeps the API immutable
from the caller's perspective and makes reasoning about concurrency
much easier.
"""
from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

SESSION_ID_BYTES = 3  # 3 bytes -> 6 hex chars, plenty for a demo namespace
DEFAULT_MAX_AGE_SECONDS = 600  # 10 minutes — matches the plan spec


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SessionState:
    """Immutable snapshot of a demo session.

    ``invoices`` is a plain list of dicts. We treat it as immutable by
    convention — callers get a deep-ish copy via ``list_recent``.
    """

    session_id: str
    created_at: float
    invoices: List[Dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_sessions: Dict[str, SessionState] = {}


# ---------------------------------------------------------------------------
# Anonymization helpers
# ---------------------------------------------------------------------------


def _letter_for_index(index: int) -> str:
    """Map 0 -> A, 1 -> B, 25 -> Z, 26 -> AA, 27 -> AB, ..."""
    if index < 0:
        raise ValueError("index must be non-negative")
    result = ""
    index_plus = index + 1
    while index_plus > 0:
        index_plus, rem = divmod(index_plus - 1, 26)
        result = chr(ord("A") + rem) + result
    return result


def _anonymize(invoices: List[Dict]) -> List[Dict]:
    """Deterministically rename vendors to ``Vendor A/B/C...``.

    The mapping is stable for a given set of real vendor names within
    a single session: we sort real names alphabetically, then assign
    letters by that order. This means a vendor always gets the same
    letter within a session regardless of when their rows arrived.
    """
    real_names = sorted({str(inv.get("vendor_name", "Unknown")) for inv in invoices})
    mapping = {name: f"Vendor {_letter_for_index(i)}" for i, name in enumerate(real_names)}

    anonymized: List[Dict] = []
    for inv in invoices:
        copy = dict(inv)
        real = str(copy.get("vendor_name", "Unknown"))
        copy["vendor_display_name"] = mapping.get(real, "Vendor ?")
        # Never expose the real name back out of the anonymizer.
        copy.pop("vendor_name", None)
        anonymized.append(copy)
    return anonymized


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_session(session_id: Optional[str] = None) -> str:
    """Create a new demo session and return its id.

    If ``session_id`` is provided we use it as-is (useful for tests and
    for letting a CFO pick a human-readable id like ``acme-corp``).
    Otherwise we generate a 6-char hex id.
    """
    with _lock:
        sid = session_id or secrets.token_hex(SESSION_ID_BYTES)
        if sid not in _sessions:
            _sessions[sid] = SessionState(session_id=sid, created_at=time.time())
        return sid


def get_session(session_id: str) -> Optional[Dict]:
    """Return session metadata (not the full invoice list) or None."""
    with _lock:
        state = _sessions.get(session_id)
        if state is None:
            return None
        return {
            "session_id": state.session_id,
            "created_at": state.created_at,
            "invoice_count": len(state.invoices),
        }


def append_invoice(session_id: str, invoice: Dict) -> None:
    """Append an invoice to the session, auto-creating if needed.

    The stored row gets a ``created_at`` timestamp if the caller didn't
    provide one. We store a shallow copy so the caller's dict is not
    mutated by later writes.
    """
    entry = dict(invoice)
    entry.setdefault("created_at", time.time())
    entry.setdefault("session_id", session_id)

    with _lock:
        state = _sessions.get(session_id)
        if state is None:
            state = SessionState(
                session_id=session_id,
                created_at=time.time(),
                invoices=[],
            )
            _sessions[session_id] = state
        state.invoices.append(entry)


def list_recent(
    session_id: str, max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS
) -> List[Dict]:
    """Return anonymized rows from the last ``max_age_seconds`` seconds.

    Returns an empty list if the session doesn't exist or has nothing
    recent. The output is sorted newest-first so the UI can paint
    freshest rows at the top.
    """
    now = time.time()
    cutoff = now - max_age_seconds

    with _lock:
        state = _sessions.get(session_id)
        if state is None:
            return []
        recent = [
            dict(inv)
            for inv in state.invoices
            if float(inv.get("created_at", now)) >= cutoff
        ]

    anonymized = _anonymize(recent)
    anonymized.sort(key=lambda r: r.get("created_at", 0), reverse=True)
    return anonymized


def prune_expired(max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS) -> int:
    """Drop expired rows and empty sessions. Returns the count removed.

    Called periodically by the demo routes to keep the in-memory store
    from growing unbounded on a long-lived server.
    """
    now = time.time()
    cutoff = now - max_age_seconds
    removed = 0

    with _lock:
        for sid in list(_sessions.keys()):
            state = _sessions[sid]
            kept = [
                inv
                for inv in state.invoices
                if float(inv.get("created_at", now)) >= cutoff
            ]
            removed += len(state.invoices) - len(kept)
            if kept:
                _sessions[sid] = SessionState(
                    session_id=state.session_id,
                    created_at=state.created_at,
                    invoices=kept,
                )
            else:
                # Keep the empty session metadata around for a while so
                # /live?session=<id> still works for a just-opened tab.
                age = now - state.created_at
                if age > max_age_seconds:
                    del _sessions[sid]
    return removed


def active_session_count() -> int:
    with _lock:
        return len(_sessions)


def reset_all() -> None:
    """Test helper: nuke every session. Not for production use."""
    with _lock:
        _sessions.clear()
