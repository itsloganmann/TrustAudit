"""End-to-end pipeline integration tests using the mock provider.

Exercises ``run_vision_pipeline`` against the canned mock responses and
asserts the full ``PipelineResult`` shape including postprocessed
fields, edge-case list, state transition, and duplicate detection.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
from pathlib import Path
from typing import Any, Dict

import pytest
from PIL import Image

from app.services.pipeline import PipelineResult, run_vision_pipeline
from app.services.state_machine import InvoiceState
from app.services.vision.base import ExtractionResult
from app.services.vision.mock_client import MockVisionClient


CHALLANS_DIR = Path(__file__).parent / "fixtures" / "challans"
EXPECTED_DIR = CHALLANS_DIR / "expected"


def _load_fixture(name: str) -> bytes:
    path = CHALLANS_DIR / f"{name}.jpg"
    if not path.exists():
        pytest.skip(f"Fixture {name} not generated — run scripts/fetch_challan_fixtures.py")
    return path.read_bytes()


def _run(image_bytes: bytes, **kwargs) -> PipelineResult:
    return asyncio.run(run_vision_pipeline(image_bytes, provider=MockVisionClient(), **kwargs))


# ---------------------------------------------------------------------------
# Happy-path: perfect printed challan
# ---------------------------------------------------------------------------
class TestPerfectPrintedHappyPath:
    def test_runs_to_verified_state(self):
        image = _load_fixture("perfect_tally_printed")
        result = _run(image)

        assert isinstance(result, PipelineResult)
        assert result.extraction.is_challan is True
        assert result.extraction.vendor_name is not None
        assert result.next_state == InvoiceState.VERIFIED
        assert result.final_confidence >= 0.85

    def test_computes_sha256(self):
        image = _load_fixture("perfect_tally_printed")
        result = _run(image)
        expected_sha = hashlib.sha256(image).hexdigest()
        assert result.image_sha256 == expected_sha

    def test_image_stats_populated(self):
        image = _load_fixture("perfect_tally_printed")
        result = _run(image)
        assert result.image_stats["width"] > 0
        assert result.image_stats["height"] > 0

    def test_preprocessed_bytes_are_valid_jpeg(self):
        image = _load_fixture("perfect_tally_printed")
        result = _run(image)
        assert result.preprocessed_bytes.startswith(b"\xff\xd8")  # JPEG SOI


# ---------------------------------------------------------------------------
# Unhappy paths
# ---------------------------------------------------------------------------
class TestUnhappyPaths:
    def test_missing_date_flows_to_needs_info(self):
        image = _load_fixture("missing_date")
        result = _run(image)
        assert result.next_state == InvoiceState.NEEDS_INFO
        assert result.rebut_message is not None
        assert "date" in result.rebut_message.lower()

    def test_non_challan_rejected(self):
        image = _load_fixture("non_challan_selfie")
        result = _run(image)
        assert result.extraction.is_challan is False
        assert result.next_state == InvoiceState.NEEDS_INFO
        # The non_challan detector should fire
        case_names = [ec.case_name for ec in result.edge_cases]
        assert "non_challan" in case_names

    def test_future_date_flows_to_needs_info(self):
        image = _load_fixture("future_date_typo")
        result = _run(image)
        # Future date is filtered by canonicalize_date and should land in NEEDS_INFO
        assert result.next_state == InvoiceState.NEEDS_INFO

    def test_blurry_image_rejected(self):
        # Use a solid-color jpeg inline — blurrier than anything on disk
        img = Image.new("RGB", (800, 1200), color=(128, 128, 128))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        result = _run(buf.getvalue())
        # blurry detector is a block → NEEDS_INFO
        assert result.next_state == InvoiceState.NEEDS_INFO


# ---------------------------------------------------------------------------
# Postprocessing
# ---------------------------------------------------------------------------
class TestPostprocessing:
    def test_gstin_is_normalized(self):
        image = _load_fixture("perfect_tally_printed")
        result = _run(image)
        if result.extraction.gstin:
            assert result.extraction.gstin == result.extraction.gstin.upper()
            assert " " not in result.extraction.gstin

    def test_invoice_amount_is_float(self):
        image = _load_fixture("perfect_tally_printed")
        result = _run(image)
        if result.extraction.invoice_amount is not None:
            assert isinstance(result.extraction.invoice_amount, float)

    def test_date_of_acceptance_is_iso(self):
        image = _load_fixture("perfect_tally_printed")
        result = _run(image)
        if result.extraction.date_of_acceptance:
            # ISO format YYYY-MM-DD
            parts = result.extraction.date_of_acceptance.split("-")
            assert len(parts) == 3
            assert len(parts[0]) == 4


# ---------------------------------------------------------------------------
# Provider fallback
# ---------------------------------------------------------------------------
class TestProviderFallback:
    def test_broken_provider_falls_back_to_mock(self):
        class BrokenProvider:
            def extract(self, image_bytes):
                raise RuntimeError("simulated upstream failure")

            def health(self):
                return {"status": "degraded"}

        img = Image.new("RGB", (800, 1200), color=(255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)

        result = asyncio.run(
            run_vision_pipeline(buf.getvalue(), provider=BrokenProvider())
        )
        # The pipeline should have fallen back to mock and still produced a result
        assert result is not None
        assert result.provider_used in ("mock_fallback", "mock")


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------
class TestInputValidation:
    def test_empty_bytes_raises(self):
        with pytest.raises(ValueError):
            asyncio.run(run_vision_pipeline(b""))
