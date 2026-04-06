"""Google Gemini vision provider.

Calls the ``generateContent`` REST endpoint with the extraction prompt and
the image as an inline base64 part. Parses the structured JSON reply and
maps it into an :class:`ExtractionResult`.

The provider raises :class:`VisionProviderNotConfigured` at construction
if ``GEMINI_API_KEY`` is not set — the factory then falls back to the
mock provider. Transport errors (HTTP 4xx/5xx, network timeouts) are
propagated to the caller so the pipeline can fall back to the Claude
provider or the mock.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict

import httpx

from .base import ExtractionResult, VisionProviderNotConfigured
from .prompts import EXTRACTION_PROMPT, build_prompt_parts

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-flash-latest"
DEFAULT_TIMEOUT_SECONDS = 45
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiVisionClient:
    """Production Gemini vision provider used in staging and demo."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not self._api_key:
            raise VisionProviderNotConfigured(
                "GEMINI_API_KEY is not set in the environment"
            )
        self._model = model or os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
        self._timeout = timeout_seconds

    # ------------------------------------------------------------------
    # VisionProvider protocol
    # ------------------------------------------------------------------
    def extract(self, image_bytes: bytes) -> ExtractionResult:
        started = time.perf_counter()
        payload = self._build_payload(image_bytes)
        url = f"{BASE_URL}/{self._model}:generateContent?key={self._api_key}"

        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
            body = response.json()

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        extraction = self._parse_response(body)
        return extraction.with_overrides(
            provider="gemini",
            model_version=self._model,
            extraction_ms=elapsed_ms,
        )

    def health(self) -> Dict[str, Any]:
        """Trivial round-trip ping to confirm the API key is live."""
        url = f"{BASE_URL}/{self._model}:generateContent?key={self._api_key}"
        payload = {
            "contents": [{"parts": [{"text": "OK"}]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 4},
        }
        try:
            with httpx.Client(timeout=10) as client:
                response = client.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()
        except Exception as exc:
            logger.warning("Gemini health check failed: %s", exc)
            return {"provider": "gemini", "status": "degraded", "model": self._model, "error": str(exc)}
        return {"provider": "gemini", "status": "ok", "model": self._model}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _build_payload(self, image_bytes: bytes) -> Dict[str, Any]:
        return {
            "contents": [
                {
                    "parts": build_prompt_parts(image_bytes),
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0,
                "maxOutputTokens": 2048,
            },
        }

    @staticmethod
    def _parse_response(body: Dict[str, Any]) -> ExtractionResult:
        """Parse the Gemini response into an ExtractionResult."""
        try:
            candidate = body["candidates"][0]
            parts = candidate["content"]["parts"]
            text_part = next(p["text"] for p in parts if "text" in p)
        except (KeyError, IndexError, StopIteration) as exc:
            logger.warning("Gemini response missing expected shape: %s", exc)
            return _empty_result(raw=body)

        # Gemini may return the JSON wrapped in code fences despite
        # response_mime_type — strip them defensively.
        cleaned = text_part.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            # drop an optional leading "json\n"
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].lstrip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("Gemini returned non-JSON text: %s (%.200s)", exc, cleaned)
            return _empty_result(raw={"body": body, "raw_text": text_part})

        # Reshape detected_issues -> detected_edge_cases for our unified shape
        detected_edge_cases = list(data.get("detected_issues") or data.get("detected_edge_cases") or [])
        if data.get("is_challan") is False and "non_challan" not in detected_edge_cases:
            detected_edge_cases.append("non_challan")

        return ExtractionResult(
            vendor_name=data.get("vendor_name"),
            gstin=data.get("gstin"),
            invoice_number=data.get("invoice_number"),
            invoice_amount=_as_float(data.get("invoice_amount")),
            invoice_date=data.get("invoice_date"),
            date_of_acceptance=data.get("date_of_acceptance"),
            currency=data.get("currency") or "INR",
            confidence=float(data.get("confidence") or 0.0),
            field_confidences=dict(data.get("field_confidences") or {}),
            missing_fields=list(data.get("missing_fields") or []),
            detected_edge_cases=detected_edge_cases,
            raw_response=data,
            is_challan=bool(data.get("is_challan", True)),
            orientation=data.get("orientation") or "ok",
            text_quality=data.get("text_quality") or "good",
        )


def _empty_result(raw: Dict[str, Any]) -> ExtractionResult:
    return ExtractionResult(
        confidence=0.0,
        missing_fields=[
            "vendor_name",
            "gstin",
            "invoice_number",
            "invoice_amount",
            "invoice_date",
            "date_of_acceptance",
        ],
        detected_edge_cases=["parse_error"],
        raw_response=raw,
    )


def _as_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
