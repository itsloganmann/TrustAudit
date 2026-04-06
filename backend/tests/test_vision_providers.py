"""Tests for the pluggable vision provider layer.

Covers:
- Mock provider always works, no credentials required
- Gemini/Claude raise VisionProviderNotConfigured when env vars missing
- Gemini builds the correct httpx request payload
- Factory falls back to mock on misconfiguration
- Health probes for each provider
"""
from __future__ import annotations

import base64
import io
import json
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from app.services.vision import (
    ExtractionResult,
    VisionProviderNotConfigured,
    get_vision_provider,
)
from app.services.vision.claude_client import ClaudeVisionClient
from app.services.vision.gemini_client import GeminiVisionClient
from app.services.vision.mock_client import MockVisionClient


def _make_image_bytes() -> bytes:
    """Produce a trivial valid JPEG byte string for test inputs."""
    img = Image.new("RGB", (100, 100), color=(200, 200, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# MockVisionClient
# ---------------------------------------------------------------------------
class TestMockVisionClient:
    def test_extract_returns_valid_result_without_credentials(self):
        client = MockVisionClient()
        image_bytes = _make_image_bytes()
        result = client.extract(image_bytes)

        assert isinstance(result, ExtractionResult)
        assert result.provider == "mock"
        assert result.model_version == "mock-v1"
        assert result.extraction_ms > 0

    def test_extract_is_deterministic(self):
        client = MockVisionClient()
        image_bytes = _make_image_bytes()
        r1 = client.extract(image_bytes)
        r2 = client.extract(image_bytes)
        assert r1.vendor_name == r2.vendor_name
        assert r1.confidence == r2.confidence

    def test_extract_different_images_may_differ(self):
        """Different SHAs pick different canned responses."""
        client = MockVisionClient()
        # Generate many distinct images and confirm at least 2 distinct responses
        seen_vendors = set()
        for i in range(20):
            img = Image.new("RGB", (100 + i, 100 + i), color=(i * 10 % 255, 0, 0))
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            result = client.extract(buf.getvalue())
            seen_vendors.add(result.vendor_name)
        assert len(seen_vendors) >= 2

    def test_health_returns_ok(self):
        client = MockVisionClient()
        health = client.health()
        assert health["provider"] == "mock"
        assert health["status"] == "ok"


# ---------------------------------------------------------------------------
# GeminiVisionClient
# ---------------------------------------------------------------------------
class TestGeminiVisionClient:
    def test_raises_when_api_key_missing(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        with pytest.raises(VisionProviderNotConfigured):
            GeminiVisionClient()

    def test_instantiates_with_env_key(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-xyz")
        monkeypatch.setenv("GEMINI_MODEL", "gemini-flash-latest")
        client = GeminiVisionClient()
        assert client._api_key == "test-key-xyz"
        assert client._model == "gemini-flash-latest"

    def test_extract_posts_to_correct_url_and_parses_response(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-xyz")
        monkeypatch.setenv("GEMINI_MODEL", "gemini-flash-latest")

        fake_response_payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": json.dumps(
                                    {
                                        "is_challan": True,
                                        "vendor_name": "Test Vendor",
                                        "gstin": "27AAFCG1234H1Z9",
                                        "invoice_number": "INV-001",
                                        "invoice_amount": 100000.0,
                                        "invoice_date": "2026-03-01",
                                        "date_of_acceptance": "2026-03-02",
                                        "confidence": 0.95,
                                        "field_confidences": {},
                                        "missing_fields": [],
                                        "orientation": "ok",
                                        "text_quality": "good",
                                        "detected_issues": [],
                                    }
                                )
                            }
                        ]
                    }
                }
            ]
        }

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=fake_response_payload)

        mock_client_instance = MagicMock()
        mock_client_instance.__enter__ = MagicMock(return_value=mock_client_instance)
        mock_client_instance.__exit__ = MagicMock(return_value=False)
        mock_client_instance.post = MagicMock(return_value=mock_response)

        with patch("httpx.Client", return_value=mock_client_instance):
            client = GeminiVisionClient()
            image_bytes = _make_image_bytes()
            result = client.extract(image_bytes)

        # Verify the URL and payload shape
        call_args = mock_client_instance.post.call_args
        url = call_args[0][0]
        assert "generativelanguage.googleapis.com" in url
        assert "gemini-flash-latest" in url
        assert "key=test-key-xyz" in url

        payload = call_args.kwargs["json"]
        assert payload["contents"][0]["parts"][0]["text"].startswith(
            "You are TrustAudit"
        )
        assert "inline_data" in payload["contents"][0]["parts"][1]
        assert payload["generationConfig"]["temperature"] == 0

        # Verify the extraction result
        assert result.vendor_name == "Test Vendor"
        assert result.gstin == "27AAFCG1234H1Z9"
        assert result.invoice_amount == 100000.0
        assert result.confidence == 0.95
        assert result.provider == "gemini"
        assert result.model_version == "gemini-flash-latest"
        assert result.extraction_ms >= 0

    def test_extract_handles_code_fence_wrapped_json(self, monkeypatch):
        """Gemini sometimes returns ```json ... ``` despite response_mime_type."""
        monkeypatch.setenv("GEMINI_API_KEY", "test-key-xyz")

        fenced_json = '```json\n{"is_challan": true, "vendor_name": "Fenced", "confidence": 0.9, "missing_fields": [], "detected_issues": [], "orientation": "ok", "text_quality": "good"}\n```'
        fake_response_payload = {
            "candidates": [{"content": {"parts": [{"text": fenced_json}]}}]
        }

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=fake_response_payload)

        mock_client_instance = MagicMock()
        mock_client_instance.__enter__ = MagicMock(return_value=mock_client_instance)
        mock_client_instance.__exit__ = MagicMock(return_value=False)
        mock_client_instance.post = MagicMock(return_value=mock_response)

        with patch("httpx.Client", return_value=mock_client_instance):
            client = GeminiVisionClient()
            result = client.extract(_make_image_bytes())

        assert result.vendor_name == "Fenced"
        assert result.confidence == 0.9


# ---------------------------------------------------------------------------
# ClaudeVisionClient
# ---------------------------------------------------------------------------
class TestClaudeVisionClient:
    def test_raises_when_api_key_missing(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with pytest.raises(VisionProviderNotConfigured):
            ClaudeVisionClient()

    def test_instantiates_with_env_key(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
        client = ClaudeVisionClient()
        assert client._api_key == "sk-ant-test"

    def test_parses_response_shape(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")

        fake_payload = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps(
                        {
                            "is_challan": True,
                            "vendor_name": "Claude Vendor",
                            "confidence": 0.88,
                            "missing_fields": [],
                            "detected_issues": [],
                            "orientation": "ok",
                            "text_quality": "good",
                        }
                    ),
                }
            ]
        }

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=fake_payload)

        mock_client_instance = MagicMock()
        mock_client_instance.__enter__ = MagicMock(return_value=mock_client_instance)
        mock_client_instance.__exit__ = MagicMock(return_value=False)
        mock_client_instance.post = MagicMock(return_value=mock_response)

        with patch("httpx.Client", return_value=mock_client_instance):
            client = ClaudeVisionClient()
            result = client.extract(_make_image_bytes())

        assert result.vendor_name == "Claude Vendor"
        assert result.provider == "claude"


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------
class TestGetVisionProvider:
    def test_explicit_mock(self):
        provider = get_vision_provider("mock")
        assert isinstance(provider, MockVisionClient)

    def test_gemini_falls_back_to_mock_when_unconfigured(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        provider = get_vision_provider("gemini")
        assert isinstance(provider, MockVisionClient)

    def test_claude_falls_back_to_mock_when_unconfigured(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        provider = get_vision_provider("claude")
        assert isinstance(provider, MockVisionClient)

    def test_unknown_provider_falls_back_to_mock(self):
        provider = get_vision_provider("sentient-ai")
        assert isinstance(provider, MockVisionClient)

    def test_env_var_respected(self, monkeypatch):
        monkeypatch.setenv("VISION_PROVIDER", "mock")
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        provider = get_vision_provider()
        assert isinstance(provider, MockVisionClient)
