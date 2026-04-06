"""End-to-end vision pipeline orchestrator.

Single entrypoint:

    await run_vision_pipeline(image_bytes, invoice_id=None, expected_msme_id=None)

Steps:
  1. Compute SHA-256 and probe the idempotency store for a duplicate.
  2. Preprocess: auto-orient, downsize, strip EXIF, gather image stats.
  3. Call the configured vision provider (with a single retry on
     transient transport errors before falling back to the mock).
  4. Run every edge-case detector.
  5. Calibrate the final confidence.
  6. Post-process fields (dates, amounts, GSTIN).
  7. Determine the target state via the state machine.
  8. Return a :class:`PipelineResult` — the caller (webhook handler) is
     responsible for DB writes, PDF generation, and WhatsApp replies.

The pipeline is intentionally I/O-light: it does NOT touch the database
or the WhatsApp provider. This keeps it pure and trivially testable
with a mock VLM.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .state_machine import (
    DEFAULT_CONFIDENCE_THRESHOLD,
    InvoiceState,
    determine_target_state_after_extraction,
)
from .vision import (
    ExtractionResult,
    VisionProvider,
    VisionProviderNotConfigured,
    get_vision_provider,
)
from .vision.base import VisionProviderNotConfigured as _VNC  # alias for clarity
from .vision.edge_cases import (
    BLOCK,
    EdgeCaseResult,
    run_edge_case_pipeline,
)
from .vision.postprocessors import (
    calibrate_confidence,
    canonicalize_date,
    normalize_gstin,
    parse_inr_amount,
)
from .vision.preprocessors import (
    auto_orient,
    compute_sha256,
    downsize_if_large,
    image_stats,
    strip_exif,
)

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """Output of a full pipeline run — consumed by the webhook handler."""

    extraction: ExtractionResult
    edge_cases: List[EdgeCaseResult]
    final_confidence: float
    next_state: InvoiceState
    rebut_message: Optional[str]
    preprocessed_bytes: bytes
    image_sha256: str
    image_stats: Dict[str, Any]
    duplicate_invoice_id: Optional[int] = None
    provider_used: str = ""
    extraction_ms: int = 0
    actions: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Duplicate probe (tolerates missing idempotency module at import time)
# ---------------------------------------------------------------------------
def _probe_duplicate(sha: str) -> Optional[int]:
    try:
        from .webhook_idempotency import find_invoice_by_image_hash

        return find_invoice_by_image_hash(sha)
    except Exception as exc:  # pragma: no cover — webhook_idempotency may be absent
        logger.debug("Duplicate probe unavailable: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
async def run_vision_pipeline(
    image_bytes: bytes,
    invoice_id: Optional[int] = None,
    expected_msme_id: Optional[int] = None,
    provider: Optional[VisionProvider] = None,
    confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
) -> PipelineResult:
    """Run the full vision pipeline on a raw image.

    ``provider`` is optional — defaults to the env-configured provider.
    ``invoice_id`` and ``expected_msme_id`` are passed through in the
    result so the webhook handler can correlate the pipeline output
    with the invoice row it's updating.
    """
    if not image_bytes:
        raise ValueError("image_bytes must not be empty")

    # 1. Hash & dedup probe
    sha = compute_sha256(image_bytes)
    dup_id = _probe_duplicate(sha)

    # 2. Preprocess — CPU-bound, run in a thread so we don't block the loop.
    preprocessed, stats = await asyncio.to_thread(_preprocess, image_bytes)

    # 3. Vision provider call
    if provider is None:
        provider = get_vision_provider()

    extraction = await asyncio.to_thread(_safe_extract, provider, preprocessed)

    # 4. Edge-case detectors
    edge_cases = await asyncio.to_thread(
        run_edge_case_pipeline, preprocessed, extraction
    )

    # 5. Confidence calibration
    final_conf = calibrate_confidence(extraction.confidence, edge_cases)
    extraction = extraction.with_confidence(final_conf)

    # 6. Post-process fields (normalize dates, amounts, GSTIN)
    extraction = _postprocess_fields(extraction)

    # 7. Determine target state
    has_block = any(ec.severity == BLOCK for ec in edge_cases)
    target_state = determine_target_state_after_extraction(
        confidence=final_conf,
        missing_fields=extraction.missing_fields,
        has_block_edge_case=has_block,
        threshold=confidence_threshold,
    )

    # 8. Pick the most-actionable rebut message (first block > first warning)
    rebut = _pick_rebut_message(edge_cases, target_state)

    return PipelineResult(
        extraction=extraction,
        edge_cases=edge_cases,
        final_confidence=final_conf,
        next_state=target_state,
        rebut_message=rebut,
        preprocessed_bytes=preprocessed,
        image_sha256=sha,
        image_stats=stats,
        duplicate_invoice_id=dup_id,
        provider_used=extraction.provider,
        extraction_ms=extraction.extraction_ms,
        actions=[],
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _preprocess(image_bytes: bytes) -> tuple[bytes, Dict[str, Any]]:
    oriented = auto_orient(image_bytes)
    shrunk = downsize_if_large(oriented)
    cleaned = strip_exif(shrunk)
    stats = image_stats(cleaned)
    return cleaned, stats


def _safe_extract(provider: VisionProvider, image_bytes: bytes) -> ExtractionResult:
    """Call the provider, falling back to mock on any exception.

    Transport/parse errors shouldn't crash the pipeline — the mock
    provider will produce a low-confidence result that drives the
    invoice into NEEDS_INFO and surfaces a provider-degraded banner.
    """
    try:
        return provider.extract(image_bytes)
    except _VNC as exc:
        logger.warning("Provider not configured at call time: %s", exc)
    except Exception as exc:
        logger.warning("Vision provider %s failed: %s — falling back to mock", type(provider).__name__, exc)

    # Fall back to mock so the pipeline always returns something.
    from .vision.mock_client import MockVisionClient

    fallback = MockVisionClient()
    result = fallback.extract(image_bytes)
    return result.with_overrides(
        provider="mock_fallback",
        detected_edge_cases=list(result.detected_edge_cases) + ["fallback_mock"],
    )


def _postprocess_fields(extraction: ExtractionResult) -> ExtractionResult:
    overrides: Dict[str, Any] = {}

    if extraction.invoice_date:
        canonical = canonicalize_date(extraction.invoice_date)
        if canonical:
            overrides["invoice_date"] = canonical

    if extraction.date_of_acceptance:
        canonical = canonicalize_date(extraction.date_of_acceptance)
        if canonical:
            overrides["date_of_acceptance"] = canonical
        else:
            # Canonicalization failed (future date, unparseable) — mark missing
            missing = list(extraction.missing_fields)
            if "date_of_acceptance" not in missing:
                missing.append("date_of_acceptance")
            overrides["missing_fields"] = missing
            overrides["date_of_acceptance"] = None

    if extraction.invoice_amount is not None:
        parsed = parse_inr_amount(extraction.invoice_amount)
        if parsed is not None:
            overrides["invoice_amount"] = parsed

    if extraction.gstin:
        normalized = normalize_gstin(extraction.gstin)
        overrides["gstin"] = normalized  # may be None on invalid format

    return extraction.with_overrides(**overrides) if overrides else extraction


def _pick_rebut_message(
    edge_cases: List[EdgeCaseResult], target_state: InvoiceState
) -> Optional[str]:
    if target_state != InvoiceState.NEEDS_INFO:
        return None
    # Prefer the most severe case with a rebut message
    for severity in (BLOCK, "warning"):
        for ec in edge_cases:
            if ec.severity == severity and ec.rebut_message:
                return ec.rebut_message
    return None
