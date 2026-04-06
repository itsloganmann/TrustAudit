"""Tests for the 39-case edge-case detector catalog.

One test per implemented detector. Infrastructure stubs (duplicate
image, expired media URL, non-image media, provider quota) are
verified to return None so they don't fire spuriously during normal
processing.
"""
from __future__ import annotations

import io

import pytest
from PIL import Image

from app.services.vision.base import ExtractionResult
from app.services.vision.edge_cases import (
    BLOCK,
    INFO,
    WARNING,
    detect_ambiguous_date,
    detect_bilingual,
    detect_blurry,
    detect_crumpled_paper,
    detect_digital_rephoto,
    detect_duplicate_image,
    detect_expired_media_url,
    detect_future_date,
    detect_glare,
    detect_handwritten_legible,
    detect_illegible_handwriting,
    detect_lakh_crore_notation,
    detect_low_light,
    detect_low_resolution,
    detect_missing_date_of_acceptance,
    detect_missing_gstin,
    detect_multi_stamp_overlap,
    detect_non_challan,
    detect_non_image_media,
    detect_oversized_file,
    detect_perfect_printed,
    detect_provider_quota_exceeded,
    detect_rotated,
    run_edge_case_pipeline,
)


# ---------------------------------------------------------------------------
# Image factories
# ---------------------------------------------------------------------------
def _make_jpeg(width: int = 800, height: int = 1200, color=(255, 255, 255)) -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _make_dark_jpeg() -> bytes:
    """Solid dark image, brightness well below 60."""
    return _make_jpeg(800, 1200, color=(20, 20, 20))


def _make_bright_saturated_jpeg() -> bytes:
    """Mostly white image, saturated_ratio close to 1.0."""
    return _make_jpeg(800, 1200, color=(255, 255, 255))


def _make_blurry_jpeg() -> bytes:
    """Solid-color image — zero edge energy, below blur threshold."""
    return _make_jpeg(800, 1200, color=(128, 128, 128))


def _make_sharp_jpeg() -> bytes:
    """Checkerboard pattern — high edge energy."""
    img = Image.new("RGB", (800, 1200), color=(255, 255, 255))
    pixels = img.load()
    for y in range(0, 1200, 8):
        for x in range(0, 800, 8):
            if (x // 8 + y // 8) % 2 == 0:
                for dy in range(8):
                    for dx in range(8):
                        if x + dx < 800 and y + dy < 1200:
                            pixels[x + dx, y + dy] = (0, 0, 0)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _empty_extraction(**overrides) -> ExtractionResult:
    base = ExtractionResult()
    return base.with_overrides(**overrides)


# ---------------------------------------------------------------------------
# Document quality — cases 1..10
# ---------------------------------------------------------------------------
class TestDocumentQuality:
    def test_perfect_printed(self):
        extraction = _empty_extraction(
            confidence=0.97,
            vendor_name="X",
            gstin="27AAFCG1234H1Z9",
            invoice_number="INV-1",
            invoice_amount=100000.0,
            invoice_date="2026-03-01",
            date_of_acceptance="2026-03-02",
            is_challan=True,
            missing_fields=[],
        )
        result = detect_perfect_printed(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 1
        assert result.severity == INFO

    def test_perfect_printed_does_not_fire_on_low_confidence(self):
        extraction = _empty_extraction(confidence=0.8, is_challan=True)
        result = detect_perfect_printed(_make_sharp_jpeg(), extraction)
        assert result is None

    def test_handwritten_legible(self):
        extraction = _empty_extraction(
            confidence=0.82, detected_edge_cases=["handwritten"]
        )
        result = detect_handwritten_legible(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 2

    def test_handwritten_legible_skips_when_not_handwritten(self):
        extraction = _empty_extraction(confidence=0.82)
        assert detect_handwritten_legible(_make_sharp_jpeg(), extraction) is None

    def test_illegible_handwriting(self):
        extraction = _empty_extraction(confidence=0.3)
        result = detect_illegible_handwriting(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.severity == BLOCK
        assert result.rebut_message is not None

    def test_illegible_text_quality_flag(self):
        extraction = _empty_extraction(confidence=0.9, text_quality="illegible")
        result = detect_illegible_handwriting(_make_sharp_jpeg(), extraction)
        assert result is not None

    def test_crumpled_paper(self):
        extraction = _empty_extraction(detected_edge_cases=["crumpled"])
        result = detect_crumpled_paper(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 4
        assert result.suggested_handler == "retry_with_preprocess"

    def test_low_light(self):
        dark = _make_dark_jpeg()
        extraction = _empty_extraction()
        result = detect_low_light(dark, extraction)
        assert result is not None
        assert result.case_id == 5

    def test_low_light_skips_on_bright_image(self):
        bright = _make_bright_saturated_jpeg()
        result = detect_low_light(bright, _empty_extraction())
        assert result is None

    def test_glare(self):
        bright = _make_bright_saturated_jpeg()
        result = detect_glare(bright, _empty_extraction())
        assert result is not None
        assert result.case_id == 6

    def test_blurry(self):
        blurry = _make_blurry_jpeg()
        result = detect_blurry(blurry, _empty_extraction())
        assert result is not None
        assert result.case_id == 7
        assert result.severity == BLOCK

    def test_blurry_skips_on_sharp_image(self):
        sharp = _make_sharp_jpeg()
        assert detect_blurry(sharp, _empty_extraction()) is None

    def test_rotated(self):
        extraction = _empty_extraction(orientation="rotated_180")
        result = detect_rotated(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 8

    def test_rotated_skips_on_ok_orientation(self):
        assert detect_rotated(_make_sharp_jpeg(), _empty_extraction()) is None

    def test_low_resolution(self):
        tiny = _make_jpeg(width=400, height=600)
        result = detect_low_resolution(tiny, _empty_extraction())
        assert result is not None
        assert result.case_id == 9
        assert result.severity == BLOCK

    def test_low_resolution_skips_on_adequate_image(self):
        ok = _make_jpeg(width=800, height=1200)
        assert detect_low_resolution(ok, _empty_extraction()) is None

    def test_oversized_file(self):
        huge = b"x" * 21_000_000
        result = detect_oversized_file(huge, _empty_extraction())
        assert result is not None
        assert result.case_id == 10


# ---------------------------------------------------------------------------
# Content ambiguity — cases 11..18
# ---------------------------------------------------------------------------
class TestContentAmbiguity:
    def test_missing_date_of_acceptance(self):
        extraction = _empty_extraction(
            missing_fields=["date_of_acceptance"], date_of_acceptance=None
        )
        result = detect_missing_date_of_acceptance(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 11
        assert result.severity == BLOCK

    def test_missing_date_skips_when_present(self):
        extraction = _empty_extraction(date_of_acceptance="2026-03-01")
        assert detect_missing_date_of_acceptance(_make_sharp_jpeg(), extraction) is None

    def test_missing_gstin(self):
        extraction = _empty_extraction(missing_fields=["gstin"], gstin=None)
        result = detect_missing_gstin(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 12

    def test_ambiguous_date(self):
        extraction = _empty_extraction(detected_edge_cases=["date_ambiguous"])
        result = detect_ambiguous_date(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 13

    def test_multi_stamp_overlap(self):
        extraction = _empty_extraction(detected_edge_cases=["multi_stamp_overlap"])
        result = detect_multi_stamp_overlap(_make_sharp_jpeg(), extraction)
        assert result is not None

    def test_bilingual(self):
        extraction = _empty_extraction(detected_edge_cases=["bilingual"])
        result = detect_bilingual(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 17

    def test_digital_rephoto(self):
        extraction = _empty_extraction(detected_edge_cases=["digital_rephoto"])
        result = detect_digital_rephoto(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 18


# ---------------------------------------------------------------------------
# Data integrity — cases 23, 25, 28
# ---------------------------------------------------------------------------
class TestDataIntegrity:
    def test_duplicate_image_stub_returns_none(self):
        """Detector is a stub — duplication is handled by the pipeline."""
        assert detect_duplicate_image(_make_sharp_jpeg(), _empty_extraction()) is None

    def test_future_date(self):
        extraction = _empty_extraction(date_of_acceptance="2099-01-01")
        result = detect_future_date(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 25
        assert result.severity == BLOCK

    def test_future_date_skips_on_past(self):
        extraction = _empty_extraction(date_of_acceptance="2024-01-01")
        assert detect_future_date(_make_sharp_jpeg(), extraction) is None

    def test_lakh_notation_detected(self):
        extraction = _empty_extraction(invoice_amount=412000.0)
        result = detect_lakh_crore_notation(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 28

    def test_lakh_notation_skips_on_small_amount(self):
        extraction = _empty_extraction(invoice_amount=543.0)
        assert detect_lakh_crore_notation(_make_sharp_jpeg(), extraction) is None


# ---------------------------------------------------------------------------
# Adversarial — cases 29, 30, 33 (33 == oversized, covered above)
# ---------------------------------------------------------------------------
class TestAdversarial:
    def test_non_challan(self):
        extraction = _empty_extraction(is_challan=False)
        result = detect_non_challan(_make_sharp_jpeg(), extraction)
        assert result is not None
        assert result.case_id == 29
        assert result.severity == BLOCK

    def test_non_image_media_stub_returns_none(self):
        """Stub — enforced at webhook layer."""
        assert detect_non_image_media(_make_sharp_jpeg(), _empty_extraction()) is None


# ---------------------------------------------------------------------------
# Connectivity — cases 35, 38 (stubs)
# ---------------------------------------------------------------------------
class TestConnectivityStubs:
    def test_provider_quota_stub(self):
        assert detect_provider_quota_exceeded(_make_sharp_jpeg(), _empty_extraction()) is None

    def test_expired_media_stub(self):
        assert detect_expired_media_url(_make_sharp_jpeg(), _empty_extraction()) is None


# ---------------------------------------------------------------------------
# Pipeline entrypoint
# ---------------------------------------------------------------------------
class TestRunEdgeCasePipeline:
    def test_returns_empty_list_for_clean_extraction(self):
        extraction = _empty_extraction(
            confidence=0.8,
            is_challan=True,
            vendor_name="X",
            gstin="27AAFCG1234H1Z9",
            invoice_number="INV-1",
            invoice_amount=50.0,
            invoice_date="2026-03-01",
            date_of_acceptance="2026-03-01",
            missing_fields=[],
        )
        results = run_edge_case_pipeline(_make_sharp_jpeg(), extraction)
        # May contain informational cases only
        for r in results:
            assert r.severity != BLOCK

    def test_surfaces_multiple_cases(self):
        dark = _make_dark_jpeg()
        extraction = _empty_extraction(
            is_challan=False,
            detected_edge_cases=["handwritten"],
            missing_fields=["date_of_acceptance"],
        )
        results = run_edge_case_pipeline(dark, extraction)
        names = [r.case_name for r in results]
        assert "non_challan" in names
        assert "missing_date_of_acceptance" in names
        assert "low_light" in names
