"""Zero-credential vision provider for local dev and demos.

The mock provider is deterministic: identical image bytes always produce
an identical :class:`ExtractionResult`. The selection is driven by a hash
of the input bytes so tests can rely on a specific fixture always landing
on a specific canned response.

Canned responses live in ``backend/tests/fixtures/vlm_responses/mock_*.json``.
If the image's SHA-256 matches a ``<name>.expected.json`` file under
``backend/tests/fixtures/challans/expected/``, that file's extraction is used
directly — enabling realistic end-to-end pipeline tests that round-trip
through a provider without calling an external API.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List

from .base import ExtractionResult, VisionProvider

logger = logging.getLogger(__name__)

_FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "tests" / "fixtures"
_VLM_RESPONSES_DIR = _FIXTURE_ROOT / "vlm_responses"
_CHALLAN_EXPECTED_DIR = _FIXTURE_ROOT / "challans" / "expected"


def _load_canned_responses() -> List[Dict[str, Any]]:
    """Load every ``mock_*.json`` file from the vlm_responses fixture dir.

    Returns a small set of diverse responses (perfect, handwritten,
    low-confidence, non-challan, missing-date) so pipeline tests can
    exercise all happy / unhappy code paths.
    """
    if not _VLM_RESPONSES_DIR.exists():
        return _BUILTIN_RESPONSES

    out: List[Dict[str, Any]] = []
    for p in sorted(_VLM_RESPONSES_DIR.glob("mock_*.json")):
        try:
            out.append(json.loads(p.read_text()))
        except Exception as exc:  # pragma: no cover — fixture corruption
            logger.warning("Could not parse mock fixture %s: %s", p, exc)
    return out or _BUILTIN_RESPONSES


# Inline fallback set so the mock provider works even before fixtures exist.
_BUILTIN_RESPONSES: List[Dict[str, Any]] = [
    {
        "vendor_name": "Gupta Steel Works",
        "gstin": "27AAFCG1234H1Z9",
        "invoice_number": "GSW/2026/0412",
        "invoice_amount": 412000.0,
        "invoice_date": "2026-03-21",
        "date_of_acceptance": "2026-03-21",
        "confidence": 0.97,
        "field_confidences": {
            "vendor_name": 0.99,
            "gstin": 0.98,
            "invoice_number": 0.97,
            "invoice_amount": 0.98,
            "invoice_date": 0.97,
            "date_of_acceptance": 0.96,
        },
        "missing_fields": [],
        "detected_edge_cases": [],
        "is_challan": True,
        "orientation": "ok",
        "text_quality": "good",
    },
    {
        "vendor_name": "Priya Textiles",
        "gstin": "27AABCP5678N1ZK",
        "invoice_number": "PT-2026-033",
        "invoice_amount": 185000.0,
        "invoice_date": "2026-03-15",
        "date_of_acceptance": "2026-03-16",
        "confidence": 0.82,
        "field_confidences": {
            "vendor_name": 0.88,
            "gstin": 0.79,
            "invoice_number": 0.85,
            "invoice_amount": 0.81,
            "invoice_date": 0.83,
            "date_of_acceptance": 0.80,
        },
        "missing_fields": [],
        "detected_edge_cases": ["handwritten"],
        "is_challan": True,
        "orientation": "ok",
        "text_quality": "good",
    },
    {
        "vendor_name": "Sharma Packaging",
        "gstin": "09AAACS9999K2Z5",
        "invoice_number": None,
        "invoice_amount": 75000.0,
        "invoice_date": "2026-02-28",
        "date_of_acceptance": None,
        "confidence": 0.58,
        "field_confidences": {
            "vendor_name": 0.72,
            "gstin": 0.65,
            "invoice_number": 0.2,
            "invoice_amount": 0.7,
            "invoice_date": 0.68,
            "date_of_acceptance": 0.15,
        },
        "missing_fields": ["invoice_number", "date_of_acceptance"],
        "detected_edge_cases": ["handwritten", "low_light"],
        "is_challan": True,
        "orientation": "ok",
        "text_quality": "poor",
    },
    {
        "vendor_name": None,
        "gstin": None,
        "invoice_number": None,
        "invoice_amount": None,
        "invoice_date": None,
        "date_of_acceptance": None,
        "confidence": 0.0,
        "field_confidences": {},
        "missing_fields": [
            "vendor_name",
            "gstin",
            "invoice_number",
            "invoice_amount",
            "invoice_date",
            "date_of_acceptance",
        ],
        "detected_edge_cases": ["non_challan"],
        "is_challan": False,
        "orientation": "ok",
        "text_quality": "good",
    },
    {
        "vendor_name": "Bharat Fasteners",
        "gstin": "24AAACB1122Q1Z3",
        "invoice_number": "BF/26/1005",
        "invoice_amount": 238500.0,
        "invoice_date": "2026-03-01",
        "date_of_acceptance": "2026-03-02",
        "confidence": 0.92,
        "field_confidences": {
            "vendor_name": 0.94,
            "gstin": 0.96,
            "invoice_number": 0.93,
            "invoice_amount": 0.91,
            "invoice_date": 0.92,
            "date_of_acceptance": 0.89,
        },
        "missing_fields": [],
        "detected_edge_cases": ["crumpled"],
        "is_challan": True,
        "orientation": "rotated_90",
        "text_quality": "good",
    },
]


class MockVisionClient:
    """Deterministic VLM for local dev, tests, and demo fallback.

    This client never touches the network and never raises. Given an
    image, it returns one of a small set of canned responses chosen by
    hashing the image bytes.
    """

    def __init__(self) -> None:
        self._responses = _load_canned_responses()

    # ------------------------------------------------------------------
    # VisionProvider protocol
    # ------------------------------------------------------------------
    def extract(self, image_bytes: bytes) -> ExtractionResult:
        started = time.perf_counter()
        sha = hashlib.sha256(image_bytes).hexdigest()

        # First check for a paired expected.json fixture.
        paired = self._try_load_paired_expected(sha)
        if paired is not None:
            canned = paired
        else:
            idx = int(sha, 16) % len(self._responses)
            canned = self._responses[idx]

        elapsed_ms = max(50, int((time.perf_counter() - started) * 1000))
        # Add a realistic small variation so tests can assert non-zero latency.
        if elapsed_ms < 50:
            elapsed_ms = 50 + (int(sha, 16) % 250)

        return ExtractionResult(
            vendor_name=canned.get("vendor_name"),
            gstin=canned.get("gstin"),
            invoice_number=canned.get("invoice_number"),
            invoice_amount=canned.get("invoice_amount"),
            invoice_date=canned.get("invoice_date"),
            date_of_acceptance=canned.get("date_of_acceptance"),
            currency=canned.get("currency", "INR"),
            confidence=float(canned.get("confidence", 0.0)),
            field_confidences=dict(canned.get("field_confidences", {})),
            missing_fields=list(canned.get("missing_fields", [])),
            detected_edge_cases=list(canned.get("detected_edge_cases", [])),
            raw_response=dict(canned),
            provider="mock",
            model_version="mock-v1",
            extraction_ms=elapsed_ms,
            is_challan=bool(canned.get("is_challan", True)),
            orientation=canned.get("orientation", "ok"),
            text_quality=canned.get("text_quality", "good"),
        )

    def health(self) -> Dict[str, Any]:
        return {"provider": "mock", "status": "ok", "model": "mock-v1"}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _try_load_paired_expected(sha: str) -> Dict[str, Any] | None:
        """Look for ``<sha>.expected.json`` under the challans fixture dir."""
        if not _CHALLAN_EXPECTED_DIR.exists():
            return None
        # Look up by sha first (fast path), otherwise scan by filename prefix.
        by_sha = _CHALLAN_EXPECTED_DIR / f"{sha}.expected.json"
        if by_sha.exists():
            try:
                return json.loads(by_sha.read_text())
            except Exception:  # pragma: no cover
                return None
        return None
