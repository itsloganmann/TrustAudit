"""Edge case detectors for the 39-case catalog.

Each detector is a pure function:

    def detect_<name>(image_bytes, extraction) -> Optional[EdgeCaseResult]

``None`` return means the case did not fire. Non-None return means the
case fired and the handler field tells the pipeline what to do.

Severity levels:
  - ``info``     — observational, no workflow impact
  - ``warning``  — trims confidence but does not block VERIFIED
  - ``block``    — forces NEEDS_INFO or outright reject

Handler suggestions:
  - ``retry_with_preprocess`` — pipeline reruns extraction after a
    PIL-based image repair (shadow boost, highlight compression, etc.)
  - ``needs_info``            — reply to driver asking for clarification
  - ``reject``                — reply with failure, do not accept
  - ``accept_with_tag``       — accept but surface a UI badge

Infrastructural cases (duplicate image, mime type check, provider quota,
expired media URL) are marked as stubs and return None — they are
enforced higher in the stack by the webhook handler and provider
factory, not by pure image/extraction analysis.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional

from .base import ExtractionResult
from .preprocessors import image_stats

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# EdgeCaseResult
# ---------------------------------------------------------------------------
@dataclass
class EdgeCaseResult:
    """Result of a single detector."""

    case_id: int
    case_name: str
    severity: str                          # "info" | "warning" | "block"
    detected: bool
    suggested_handler: str                 # "retry_with_preprocess" | "needs_info" | "reject" | "accept_with_tag"
    rebut_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# Severity constants (avoid typos)
INFO = "info"
WARNING = "warning"
BLOCK = "block"

# Handler constants
RETRY_WITH_PREPROCESS = "retry_with_preprocess"
NEEDS_INFO = "needs_info"
REJECT = "reject"
ACCEPT_WITH_TAG = "accept_with_tag"


# ===========================================================================
# Document quality detectors — cases 1..10
# ===========================================================================
def detect_perfect_printed(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#1 — perfect printed Tally/SAP GRN. Purely informational."""
    if not extraction.is_challan:
        return None
    if extraction.confidence < 0.95:
        return None
    if extraction.missing_fields:
        return None
    return EdgeCaseResult(
        case_id=1,
        case_name="perfect_printed",
        severity=INFO,
        detected=True,
        suggested_handler=ACCEPT_WITH_TAG,
        metadata={"confidence": extraction.confidence},
    )


def detect_handwritten_legible(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#2 — handwritten but legible. Amber badge on dashboard."""
    if "handwritten" not in extraction.detected_edge_cases:
        return None
    if not (0.7 <= extraction.confidence < 0.95):
        return None
    return EdgeCaseResult(
        case_id=2,
        case_name="handwritten_legible",
        severity=INFO,
        detected=True,
        suggested_handler=ACCEPT_WITH_TAG,
        metadata={"badge": "handwritten"},
    )


def detect_illegible_handwriting(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#3 — illegible handwriting. Force NEEDS_INFO."""
    is_illegible_quality = extraction.text_quality == "illegible"
    low_confidence = extraction.confidence < 0.5
    if not (is_illegible_quality or low_confidence):
        return None
    return EdgeCaseResult(
        case_id=3,
        case_name="illegible_handwriting",
        severity=BLOCK,
        detected=True,
        suggested_handler=NEEDS_INFO,
        rebut_message=(
            "We couldn't read the handwriting on your challan clearly. "
            "Could you please reply with the date (DD-MM-YYYY) and "
            "amount in rupees?"
        ),
    )


def detect_crumpled_paper(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#4 — crumpled / folded paper. Retry with tonal boost."""
    if "crumpled" not in extraction.detected_edge_cases:
        return None
    return EdgeCaseResult(
        case_id=4,
        case_name="crumpled_paper",
        severity=WARNING,
        detected=True,
        suggested_handler=RETRY_WITH_PREPROCESS,
        metadata={"preprocessor": "boost_shadows"},
    )


def detect_low_light(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#5 — shadows / low-light. Retry with shadow boost."""
    stats = image_stats(image_bytes)
    if stats["mean_brightness"] >= 60:
        return None
    return EdgeCaseResult(
        case_id=5,
        case_name="low_light",
        severity=WARNING,
        detected=True,
        suggested_handler=RETRY_WITH_PREPROCESS,
        metadata={
            "mean_brightness": stats["mean_brightness"],
            "preprocessor": "boost_shadows",
        },
    )


def detect_glare(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#6 — reflective glare / flash washout."""
    stats = image_stats(image_bytes)
    if stats["saturated_ratio"] <= 0.15:
        return None
    return EdgeCaseResult(
        case_id=6,
        case_name="glare",
        severity=WARNING,
        detected=True,
        suggested_handler=RETRY_WITH_PREPROCESS,
        rebut_message="Please retake the photo without flash — there's a bright reflection on the challan.",
        metadata={
            "saturated_ratio": stats["saturated_ratio"],
            "preprocessor": "compress_highlights",
        },
    )


def detect_blurry(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#7 — blurry / out of focus."""
    stats = image_stats(image_bytes)
    if stats["laplacian_variance_proxy"] >= 100:
        return None
    return EdgeCaseResult(
        case_id=7,
        case_name="blurry",
        severity=BLOCK,
        detected=True,
        suggested_handler=REJECT,
        rebut_message="The photo is too blurry to read. Please retake with the camera steady.",
        metadata={"sharpness": stats["laplacian_variance_proxy"]},
    )


def detect_rotated(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#8 — rotated / upside-down."""
    if extraction.orientation == "ok":
        return None
    return EdgeCaseResult(
        case_id=8,
        case_name="rotated",
        severity=INFO,
        detected=True,
        suggested_handler=RETRY_WITH_PREPROCESS,
        metadata={"orientation": extraction.orientation, "preprocessor": "auto_orient"},
    )


def detect_low_resolution(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#9 — very low resolution (<600 px wide)."""
    stats = image_stats(image_bytes)
    if stats["width"] == 0 or stats["width"] >= 600:
        return None
    return EdgeCaseResult(
        case_id=9,
        case_name="low_resolution",
        severity=BLOCK,
        detected=True,
        suggested_handler=REJECT,
        rebut_message="Please send a larger photo — at least a full screen width.",
        metadata={"width": stats["width"]},
    )


def detect_oversized_file(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#10 & #33 — file too large for provider (>20 MB)."""
    if len(image_bytes) <= 20_000_000:
        return None
    return EdgeCaseResult(
        case_id=10,
        case_name="oversized_file",
        severity=WARNING,
        detected=True,
        suggested_handler=RETRY_WITH_PREPROCESS,
        metadata={"bytes": len(image_bytes), "preprocessor": "downsize_if_large"},
    )


# ===========================================================================
# Content ambiguity detectors — cases 11..18
# ===========================================================================
def detect_missing_date_of_acceptance(
    image_bytes: bytes, extraction: ExtractionResult
) -> Optional[EdgeCaseResult]:
    """#11 — missing date_of_acceptance. The critical 43B(h) field."""
    if "date_of_acceptance" not in extraction.missing_fields and extraction.date_of_acceptance:
        return None
    return EdgeCaseResult(
        case_id=11,
        case_name="missing_date_of_acceptance",
        severity=BLOCK,
        detected=True,
        suggested_handler=NEEDS_INFO,
        rebut_message=(
            "I couldn't find the date of acceptance on your challan. "
            "Please reply with just the acceptance date in DD-MM-YYYY format."
        ),
    )


def detect_missing_gstin(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#12 — missing GSTIN (may be composition-scheme MSME)."""
    if "gstin" not in extraction.missing_fields and extraction.gstin:
        return None
    return EdgeCaseResult(
        case_id=12,
        case_name="missing_gstin",
        severity=WARNING,
        detected=True,
        # Handler looks up the MSME — if composition-scheme, auto-fills and proceeds.
        suggested_handler=NEEDS_INFO,
        rebut_message=(
            "I couldn't see the GSTIN on the challan. "
            "If you're registered under the Composition Scheme please reply 'composition' — "
            "otherwise please reply with your 15-character GSTIN."
        ),
    )


def detect_ambiguous_date(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#13 — date is ambiguous (e.g. 03/04/26)."""
    if "date_ambiguous" not in extraction.detected_edge_cases:
        return None
    return EdgeCaseResult(
        case_id=13,
        case_name="ambiguous_date",
        severity=WARNING,
        detected=True,
        suggested_handler=NEEDS_INFO,
        rebut_message=(
            "The date on the challan is ambiguous. "
            "Could you confirm whether it's DD-MM or MM-DD?"
        ),
    )


def detect_multi_stamp_overlap(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#14 & #15 — overlapping rubber stamps obscure fields."""
    if "multi_stamp_overlap" not in extraction.detected_edge_cases:
        return None
    return EdgeCaseResult(
        case_id=14,
        case_name="multi_stamp_overlap",
        severity=WARNING,
        detected=True,
        suggested_handler=RETRY_WITH_PREPROCESS,
        metadata={"preprocessor": "focus_on_text_prompt"},
    )


def detect_bilingual(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#17 — bilingual Hindi + English. Accept with a badge."""
    if "bilingual" not in extraction.detected_edge_cases:
        return None
    return EdgeCaseResult(
        case_id=17,
        case_name="bilingual",
        severity=INFO,
        detected=True,
        suggested_handler=ACCEPT_WITH_TAG,
        metadata={"badge": "bilingual"},
    )


def detect_digital_rephoto(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#18 — photo of a computer screen."""
    if "digital_rephoto" not in extraction.detected_edge_cases:
        return None
    return EdgeCaseResult(
        case_id=18,
        case_name="digital_rephoto",
        severity=INFO,
        detected=True,
        suggested_handler=ACCEPT_WITH_TAG,
        metadata={"source": "digital_rephoto"},
    )


# ===========================================================================
# Data integrity — cases 23, 25, 28
# ===========================================================================
def detect_duplicate_image(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#23 — duplicate image submission. DB-dependent, stub returns None."""
    # TODO: wire to webhook_idempotency.find_invoice_by_image_hash in the
    # pipeline orchestrator, not here.
    return None


def detect_future_date(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#25 — acceptance date is in the future. Human typo on the challan."""
    if not extraction.date_of_acceptance:
        return None
    try:
        parsed = date.fromisoformat(extraction.date_of_acceptance)
    except ValueError:
        return None
    if parsed <= date.today():
        return None
    return EdgeCaseResult(
        case_id=25,
        case_name="future_date",
        severity=BLOCK,
        detected=True,
        suggested_handler=NEEDS_INFO,
        rebut_message=(
            "The acceptance date on your challan looks like it's in the future "
            f"({extraction.date_of_acceptance}). Could you double-check and resend?"
        ),
        metadata={"date_of_acceptance": extraction.date_of_acceptance},
    )


def detect_lakh_crore_notation(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#28 — lakh/crore notation was canonicalized by the prompt.

    Informational flag if the amount looks like it went through unit
    conversion (round multiple of 100k or 10M).
    """
    amt = extraction.invoice_amount
    if amt is None or amt <= 0:
        return None
    # Flag clean multiples of 1 lakh
    if amt >= 100_000 and amt % 1000 == 0:
        return EdgeCaseResult(
            case_id=28,
            case_name="lakh_crore_notation",
            severity=INFO,
            detected=True,
            suggested_handler=ACCEPT_WITH_TAG,
            metadata={"amount": amt, "human_readable": _humanize_amount(amt)},
        )
    return None


def _humanize_amount(amt: float) -> str:
    if amt >= 10_000_000:
        return f"{amt / 10_000_000:.2f} Cr"
    if amt >= 100_000:
        return f"{amt / 100_000:.2f} L"
    return f"₹{amt:,.0f}"


# ===========================================================================
# Adversarial — cases 29, 30, 33
# ===========================================================================
def detect_non_challan(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#29 — image is not a challan (selfie, meme, NSFW)."""
    if extraction.is_challan:
        return None
    return EdgeCaseResult(
        case_id=29,
        case_name="non_challan",
        severity=BLOCK,
        detected=True,
        suggested_handler=REJECT,
        rebut_message=(
            "That doesn't look like a delivery challan. "
            "Please send a clear photo of the paper challan."
        ),
    )


def detect_non_image_media(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#30 — voice/video/sticker. Mime-type check happens in webhook handler."""
    # TODO: enforced at webhook handler via Twilio MediaContentType check.
    return None


# ===========================================================================
# Connectivity / provider — cases 35, 38 (stubs)
# ===========================================================================
def detect_provider_quota_exceeded(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#35 — Gemini returns 429. Detected at provider level."""
    # TODO: the pipeline catches httpx.HTTPStatusError and switches provider.
    return None


def detect_expired_media_url(image_bytes: bytes, extraction: ExtractionResult) -> Optional[EdgeCaseResult]:
    """#38 — Twilio MediaUrl0 returned 404."""
    # TODO: webhook handler reports this when MediaUrl fetch 404s.
    return None


# ===========================================================================
# Pipeline entrypoint
# ===========================================================================
_ALL_DETECTORS = [
    detect_perfect_printed,               # 1
    detect_handwritten_legible,           # 2
    detect_illegible_handwriting,         # 3
    detect_crumpled_paper,                # 4
    detect_low_light,                     # 5
    detect_glare,                         # 6
    detect_blurry,                        # 7
    detect_rotated,                       # 8
    detect_low_resolution,                # 9
    detect_oversized_file,                # 10
    detect_missing_date_of_acceptance,    # 11
    detect_missing_gstin,                 # 12
    detect_ambiguous_date,                # 13
    detect_multi_stamp_overlap,           # 14/15
    detect_bilingual,                     # 17
    detect_digital_rephoto,               # 18
    detect_duplicate_image,               # 23 (stub)
    detect_future_date,                   # 25
    detect_lakh_crore_notation,           # 28
    detect_non_challan,                   # 29
    detect_non_image_media,               # 30 (stub)
    detect_provider_quota_exceeded,       # 35 (stub)
    detect_expired_media_url,             # 38 (stub)
]


def run_edge_case_pipeline(
    image_bytes: bytes, extraction: ExtractionResult
) -> List[EdgeCaseResult]:
    """Run every detector and return the non-None results."""
    results: List[EdgeCaseResult] = []
    for detector in _ALL_DETECTORS:
        try:
            result = detector(image_bytes, extraction)
        except Exception as exc:  # pragma: no cover — defensive
            logger.exception("Edge-case detector %s failed: %s", detector.__name__, exc)
            continue
        if result is not None and result.detected:
            results.append(result)
    return results
