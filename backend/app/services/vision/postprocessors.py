"""Postprocessors — normalize dates, amounts, GSTINs; calibrate confidence.

All functions are pure: they take primitives and return primitives (or
None on parse failure), never mutating the ExtractionResult.
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime
from typing import List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Date canonicalization
# ---------------------------------------------------------------------------
_DATE_FORMATS: List[str] = [
    "%Y-%m-%d",
    "%d-%m-%Y",
    "%d/%m/%Y",
    "%d-%m-%y",
    "%d/%m/%y",
    "%m-%d-%Y",
    "%m/%d/%Y",
    "%Y/%m/%d",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d %Y",
    "%B %d %Y",
    "%d-%b-%Y",
    "%d-%B-%Y",
]


def canonicalize_date(s: Optional[str], today: Optional[date] = None) -> Optional[str]:
    """Parse a date string in any common Indian format and return ISO YYYY-MM-DD.

    Returns None if unparseable OR if the parsed date is in the future
    (signaling an extraction error — edge case #25 handles the actual
    block at a higher layer).
    """
    if not s:
        return None
    if not isinstance(s, str):
        return None

    cleaned = s.strip()
    if not cleaned:
        return None

    today = today or date.today()
    parsed: Optional[date] = None

    for fmt in _DATE_FORMATS:
        try:
            parsed = datetime.strptime(cleaned, fmt).date()
            break
        except ValueError:
            continue

    if parsed is None:
        return None

    if parsed > today:
        logger.info("Date %s is in the future — flagging as ambiguous", cleaned)
        return None

    return parsed.isoformat()


# ---------------------------------------------------------------------------
# INR amount parsing
# ---------------------------------------------------------------------------
_AMOUNT_UNITS = {
    "l": 100_000,
    "lakh": 100_000,
    "lac": 100_000,
    "lacs": 100_000,
    "lakhs": 100_000,
    "cr": 10_000_000,
    "crore": 10_000_000,
    "crores": 10_000_000,
    "crs": 10_000_000,
}

_AMOUNT_REGEX = re.compile(
    r"""
    (?:rs\.?|inr|₹)?     # optional currency prefix
    \s*
    ([\d,]+(?:\.\d+)?)   # the numeric body with Indian-style commas
    \s*
    (lakhs?|lacs?|l|crores?|crs?|cr)?  # optional unit
    """,
    re.IGNORECASE | re.VERBOSE,
)


def parse_inr_amount(raw: Optional[str | float | int]) -> Optional[float]:
    """Parse an INR amount string into rupees as a float.

    Handles:
      - plain numerics: 412000, 412000.50
      - with currency: "₹4,12,000", "Rs. 4,12,000/-", "INR 15,00,000"
      - unit notation: "4.12 L", "4.12 Lakh", "1.5 Cr", "1.5 crore"
      - Indian-style commas: "4,12,000"
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    if not isinstance(raw, str):
        return None

    cleaned = raw.strip()
    if not cleaned:
        return None

    # Remove trailing "/-" common on Indian receipts and stray "only" words
    cleaned = re.sub(r"/-+$", "", cleaned)
    cleaned = re.sub(r"\s+only\b", "", cleaned, flags=re.IGNORECASE)

    match = _AMOUNT_REGEX.search(cleaned)
    if not match:
        return None

    number_str = match.group(1).replace(",", "")
    unit = (match.group(2) or "").lower()

    try:
        value = float(number_str)
    except ValueError:
        return None

    multiplier = _AMOUNT_UNITS.get(unit, 1)
    return value * multiplier


# ---------------------------------------------------------------------------
# GSTIN normalization
# ---------------------------------------------------------------------------
_GSTIN_REGEX = re.compile(
    r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
)


def normalize_gstin(raw: Optional[str]) -> Optional[str]:
    """Uppercase, strip whitespace, validate 15-char GSTIN format.

    Returns None on invalid format. Does NOT validate the checksum digit
    mathematically — that's P2 scope.
    """
    if not raw:
        return None
    if not isinstance(raw, str):
        return None
    cleaned = re.sub(r"\s+", "", raw).upper()
    if not _GSTIN_REGEX.match(cleaned):
        return None
    return cleaned


# ---------------------------------------------------------------------------
# Confidence calibration
# ---------------------------------------------------------------------------
def calibrate_confidence(raw_confidence: float, edge_cases: List) -> float:
    """Return a final confidence ∈ [0, 1] after applying edge-case penalties.

    Each ``warning``-severity case shaves off 0.05 (bounded ≤ 0.15).
    Each ``block``-severity case caps the result at 0.4 — so any blocking
    case forces the invoice into NEEDS_INFO regardless of the raw score.
    """
    base = max(0.0, min(1.0, float(raw_confidence or 0.0)))
    warnings = 0
    has_block = False

    for ec in edge_cases:
        severity = getattr(ec, "severity", None) or (ec.get("severity") if isinstance(ec, dict) else None)
        if severity == "warning":
            warnings += 1
        elif severity == "block":
            has_block = True

    penalty = min(0.15, warnings * 0.05)
    calibrated = base - penalty
    if has_block:
        calibrated = min(calibrated, 0.4)
    return max(0.0, min(1.0, calibrated))
