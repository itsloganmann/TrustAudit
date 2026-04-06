"""Anthropic Claude vision fallback provider.

Used when Gemini is unavailable (429, network failure) or as the primary
when ``VISION_PROVIDER=claude`` is set. Implements the same
:class:`VisionProvider` contract as Gemini.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Any, Dict

import httpx

from .base import ExtractionResult, VisionProviderNotConfigured
from .prompts import EXTRACTION_PROMPT, build_claude_content

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_TIMEOUT_SECONDS = 45
API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"


class ClaudeVisionClient:
    """Claude vision fallback — invoked when Gemini fails."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not self._api_key:
            raise VisionProviderNotConfigured(
                "ANTHROPIC_API_KEY is not set in the environment"
            )
        self._model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)
        self._timeout = timeout_seconds

    # ------------------------------------------------------------------
    # VisionProvider protocol
    # ------------------------------------------------------------------
    def extract(self, image_bytes: bytes) -> ExtractionResult:
        started = time.perf_counter()
        payload = self._build_payload(image_bytes)

        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(
                API_URL,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": self._api_key,
                    "anthropic-version": API_VERSION,
                },
            )
            response.raise_for_status()
            body = response.json()

        elapsed_ms = int((time.perf_counter() - started) * 1000)
        extraction = self._parse_response(body)
        return extraction.with_overrides(
            provider="claude",
            model_version=self._model,
            extraction_ms=elapsed_ms,
        )

    def health(self) -> Dict[str, Any]:
        payload = {
            "model": self._model,
            "max_tokens": 4,
            "messages": [{"role": "user", "content": "OK"}],
        }
        try:
            with httpx.Client(timeout=10) as client:
                response = client.post(
                    API_URL,
                    json=payload,
                    headers={
                        "Content-Type": "application/json",
                        "x-api-key": self._api_key,
                        "anthropic-version": API_VERSION,
                    },
                )
                response.raise_for_status()
        except Exception as exc:
            logger.warning("Claude health check failed: %s", exc)
            return {"provider": "claude", "status": "degraded", "model": self._model, "error": str(exc)}
        return {"provider": "claude", "status": "ok", "model": self._model}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _build_payload(self, image_bytes: bytes) -> Dict[str, Any]:
        return {
            "model": self._model,
            "max_tokens": 2048,
            "system": EXTRACTION_PROMPT,
            "messages": [
                {
                    "role": "user",
                    "content": build_claude_content(image_bytes),
                }
            ],
        }

    @staticmethod
    def _parse_response(body: Dict[str, Any]) -> ExtractionResult:
        try:
            blocks = body["content"]
            text_block = next(b for b in blocks if b.get("type") == "text")
            text = text_block["text"]
        except (KeyError, IndexError, StopIteration) as exc:
            logger.warning("Claude response missing expected shape: %s", exc)
            return _empty_result(raw=body)

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].lstrip()

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.warning("Claude returned non-JSON text: %s (%.200s)", exc, cleaned)
            return _empty_result(raw={"body": body, "raw_text": text})

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
