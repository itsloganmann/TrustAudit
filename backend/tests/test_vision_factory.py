"""Hardening tests for the vision provider factory + fallback path.

Regression coverage for the Phase L bug where Render was silently
producing ``confidence=0.0`` challan extractions because the
``MockVisionClient`` paired-expected lookup was keyed on the SHA of the
*raw* image bytes, while the pipeline actually called the provider with
the SHA of the *preprocessed* bytes (auto_orient → downsize → strip_exif).

The test surface in this file is deliberately narrow:

* ``get_vision_provider`` must return a :class:`MockVisionClient` when
  ``VISION_PROVIDER=gemini`` but ``GEMINI_API_KEY`` is absent or empty.
* ``run_vision_pipeline`` end-to-end against
  ``perfect_tally_printed.jpg`` must resolve to the "Gupta Steel Works"
  fixture — the demo's headline happy path.
* The mock provider must look up paired expected fixtures using the
  PREPROCESSED SHA, not the raw SHA. Proven by dropping a uniquely
  keyed fixture into a tmp expected dir and asserting we get that
  unique marker back from the pipeline.
* ``_safe_extract`` must fall back to the mock provider and tag the
  result with ``fallback_mock`` when the configured provider raises an
  unexpected ``RuntimeError``.
* The factory must treat whitespace-only ``GEMINI_API_KEY`` /
  ``VISION_PROVIDER`` values as unset (Render quirk).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path
from typing import Any, Dict

import pytest

from app.services import pipeline as pipeline_module
from app.services.pipeline import _safe_extract, run_vision_pipeline
from app.services.vision import (
    VisionProviderNotConfigured,
    get_vision_provider,
)
from app.services.vision import mock_client as mock_client_module
from app.services.vision.base import ExtractionResult
from app.services.vision.gemini_client import GeminiVisionClient
from app.services.vision.mock_client import MockVisionClient
from app.services.vision.preprocessors import (
    auto_orient,
    compute_sha256,
    downsize_if_large,
    strip_exif,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "challans"
EXPECTED_DIR = FIXTURE_DIR / "expected"
PERFECT_FIXTURE = FIXTURE_DIR / "perfect_tally_printed.jpg"


def _require_perfect_fixture() -> bytes:
    if not PERFECT_FIXTURE.exists():  # pragma: no cover — CI ships the fixture
        pytest.skip(f"fixture missing: {PERFECT_FIXTURE}")
    return PERFECT_FIXTURE.read_bytes()


def _preprocessed_sha(image_bytes: bytes) -> str:
    """Mirror ``pipeline._preprocess`` to compute the preprocessed SHA."""
    oriented = auto_orient(image_bytes)
    shrunk = downsize_if_large(oriented)
    cleaned = strip_exif(shrunk)
    return hashlib.sha256(cleaned).hexdigest()


# ---------------------------------------------------------------------------
# 1. Factory falls back to mock when Gemini key is missing / empty
# ---------------------------------------------------------------------------
class TestFactoryGuardrails:
    def test_gemini_without_key_returns_mock(self, monkeypatch):
        monkeypatch.setenv("VISION_PROVIDER", "gemini")
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)

        provider = get_vision_provider()

        assert isinstance(provider, MockVisionClient)
        assert not isinstance(provider, GeminiVisionClient)

    def test_gemini_with_empty_string_key_returns_mock(self, monkeypatch):
        """Render can leave ``GEMINI_API_KEY`` declared-but-blank."""
        monkeypatch.setenv("VISION_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "")

        provider = get_vision_provider()

        assert isinstance(provider, MockVisionClient)

    def test_gemini_with_whitespace_only_key_returns_mock(self, monkeypatch):
        """Whitespace in the Render dashboard value must not pass auth."""
        monkeypatch.setenv("VISION_PROVIDER", "gemini")
        monkeypatch.setenv("GEMINI_API_KEY", "   \t ")

        provider = get_vision_provider()

        assert isinstance(provider, MockVisionClient)

    def test_gemini_client_raises_on_whitespace_only_key(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "   ")
        with pytest.raises(VisionProviderNotConfigured):
            GeminiVisionClient()

    def test_vision_provider_env_var_whitespace_defaults_to_mock(self, monkeypatch):
        """``VISION_PROVIDER="   "`` on Render should not trip the
        ``unknown provider`` branch — treat it as unset."""
        monkeypatch.setenv("VISION_PROVIDER", "   ")
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)

        provider = get_vision_provider()

        assert isinstance(provider, MockVisionClient)


# ---------------------------------------------------------------------------
# 2. Happy path: perfect_tally_printed.jpg -> Gupta Steel Works
# ---------------------------------------------------------------------------
class TestPerfectTallyHappyPath:
    def test_pipeline_extracts_gupta_steel_works(self, monkeypatch):
        """Boot the factory under Render-like conditions (gemini
        configured but no key) and confirm the whole pipeline resolves
        to the signature demo vendor via the paired expected fixture."""
        monkeypatch.setenv("VISION_PROVIDER", "gemini")
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)

        image_bytes = _require_perfect_fixture()

        provider = get_vision_provider()
        assert isinstance(provider, MockVisionClient)

        result = asyncio.run(run_vision_pipeline(image_bytes, provider=provider))

        assert result.extraction.vendor_name == "Gupta Steel Works"
        assert result.extraction.is_challan is True
        assert result.final_confidence >= 0.85
        # ``provider_used`` should be the mock, not an empty string.
        assert result.provider_used in {"mock", "mock_fallback"}


# ---------------------------------------------------------------------------
# 3. Regression: mock loads paired expected by PREPROCESSED SHA, not raw SHA
# ---------------------------------------------------------------------------
class TestPreprocessedShaLookup:
    def test_mock_uses_preprocessed_sha_for_paired_expected(
        self, tmp_path, monkeypatch
    ):
        """Regression test for the Phase L bug.

        Strategy:
          1. Redirect ``_CHALLAN_EXPECTED_DIR`` to an empty tmp dir so
             none of the bundled fixtures interfere.
          2. Compute the PREPROCESSED SHA of the perfect fixture.
          3. Drop a uniquely-keyed expected.json file at that SHA with a
             marker vendor name that does NOT appear in any built-in
             response.
          4. Run the pipeline.
          5. Assert the marker vendor came back — which proves the mock
             looked up the expected fixture by the preprocessed SHA
             rather than the raw SHA or the round-robin fallback.
        """
        image_bytes = _require_perfect_fixture()

        raw_sha = compute_sha256(image_bytes)
        pre_sha = _preprocessed_sha(image_bytes)
        assert raw_sha != pre_sha, (
            "Regression test requires the preprocessing pipeline to change "
            "the SHA. If preprocessing is now a no-op, the original bug "
            "is moot and this test needs to be rewritten."
        )

        expected_dir = tmp_path / "expected"
        expected_dir.mkdir()
        marker_payload: Dict[str, Any] = {
            "vendor_name": "ZZZ_PREPROCESSED_SHA_MARKER_VENDOR",
            "gstin": "27AAZZZ9999Z9Z9",
            "invoice_number": "MARK-001",
            "invoice_amount": 12345.0,
            "invoice_date": "2026-03-15",
            "date_of_acceptance": "2026-03-16",
            "confidence": 0.93,
            "is_challan": True,
            "missing_fields": [],
            "detected_edge_cases": [],
            "text_quality": "good",
            "orientation": "ok",
        }
        (expected_dir / f"{pre_sha}.expected.json").write_text(
            json.dumps(marker_payload)
        )
        # Sanity: the raw SHA should NOT resolve under the tmp dir — we
        # only dropped the preprocessed file. If a future refactor copies
        # the file for both SHAs, this regression test stops being
        # meaningful and will fail loudly.
        assert not (expected_dir / f"{raw_sha}.expected.json").exists()

        monkeypatch.setattr(
            mock_client_module, "_CHALLAN_EXPECTED_DIR", expected_dir
        )

        provider = MockVisionClient()
        result = asyncio.run(run_vision_pipeline(image_bytes, provider=provider))

        assert result.extraction.vendor_name == marker_payload["vendor_name"]
        assert result.extraction.gstin == marker_payload["gstin"]
        # The raw SHA is stored in the result but the mock's paired lookup
        # used the preprocessed SHA internally — which is exactly what we
        # just proved by getting the marker payload back.
        assert result.image_sha256 == raw_sha


# ---------------------------------------------------------------------------
# 4. _safe_extract falls back to mock and tags the result
# ---------------------------------------------------------------------------
class _BrokenProvider:
    """Always explodes on extract() — exercises the ``except Exception`` path."""

    def extract(self, image_bytes: bytes) -> ExtractionResult:
        raise RuntimeError("simulated provider outage")

    def health(self) -> Dict[str, Any]:  # pragma: no cover
        return {"provider": "broken", "status": "degraded"}


class _UnconfiguredProvider:
    """Raises VisionProviderNotConfigured at call time (not at init)."""

    def extract(self, image_bytes: bytes) -> ExtractionResult:
        raise VisionProviderNotConfigured("key disappeared mid-request")

    def health(self) -> Dict[str, Any]:  # pragma: no cover
        return {"provider": "unconfigured", "status": "degraded"}


class TestSafeExtractFallback:
    def test_runtime_error_falls_back_to_mock_with_tag(self):
        image_bytes = _require_perfect_fixture()
        result = _safe_extract(_BrokenProvider(), image_bytes)

        assert result.provider == "mock_fallback"
        assert "fallback_mock" in result.detected_edge_cases
        # Preprocessing-less direct call: at minimum we should still get
        # a coherent ExtractionResult (not a raised RuntimeError).
        assert isinstance(result, ExtractionResult)

    def test_vision_provider_not_configured_falls_back_to_mock(self):
        image_bytes = _require_perfect_fixture()
        result = _safe_extract(_UnconfiguredProvider(), image_bytes)

        assert result.provider == "mock_fallback"
        assert "fallback_mock" in result.detected_edge_cases

    def test_pipeline_with_broken_provider_still_returns_result(self):
        """Full pipeline: a broken provider must not crash
        ``run_vision_pipeline`` — the mock fallback keeps the invoice
        extraction alive (even if at lower confidence)."""
        image_bytes = _require_perfect_fixture()

        result = asyncio.run(
            run_vision_pipeline(image_bytes, provider=_BrokenProvider())
        )

        # The fallback tag must propagate through the pipeline's
        # confidence calibration + postprocessing steps.
        assert "fallback_mock" in result.extraction.detected_edge_cases
        assert result.extraction.vendor_name is not None
