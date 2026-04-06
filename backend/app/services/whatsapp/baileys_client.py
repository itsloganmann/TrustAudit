"""Baileys WhatsApp provider — HTTP bridge to the Node sidecar.

The sidecar lives at ``backend/services/whatsapp_sidecar/`` and exposes a
tiny REST API for sending and downloading messages. The Python side never
loads the baileys SDK directly; it only talks HTTP.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx

from .base import InboundMessage

logger = logging.getLogger(__name__)

DEFAULT_SIDECAR_URL = "http://localhost:3001"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BaileysClient:
    """Talks to the Node baileys sidecar over HTTP."""

    def __init__(
        self,
        sidecar_url: Optional[str] = None,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        self._provider = "baileys"
        self.sidecar_url = (
            sidecar_url
            or os.environ.get("WHATSAPP_SIDECAR_URL")
            or DEFAULT_SIDECAR_URL
        ).rstrip("/")
        self._http = http_client

    def _post(self, path: str, json: dict) -> httpx.Response:
        url = f"{self.sidecar_url}{path}"
        if self._http is not None:
            return self._http.post(url, json=json)
        return httpx.post(url, json=json, timeout=10.0)

    def _get(self, path: str, timeout: float = 2.0) -> httpx.Response:
        url = f"{self.sidecar_url}{path}"
        if self._http is not None:
            return self._http.get(url)
        return httpx.get(url, timeout=timeout)

    def send_text(self, to_phone_e164: str, body: str) -> str:
        logger.info("[baileys.send_text] to=%s", to_phone_e164)
        resp = self._post("/wa/send", {"to": to_phone_e164, "body": body})
        resp.raise_for_status()
        data = resp.json()
        return str(data.get("sid") or "")

    def download_media(self, media_url: str) -> bytes:
        # The sidecar accepts either a media_id (from an inbound message) or
        # a raw URL. Pass both fields; the sidecar picks what it needs.
        logger.info("[baileys.download_media] %s", media_url)
        resp = self._post(
            "/wa/download",
            {"media_id": media_url, "media_url": media_url},
        )
        resp.raise_for_status()
        return resp.content

    def parse_inbound(self, payload: dict) -> InboundMessage:
        return InboundMessage(
            provider="baileys",
            from_phone_e164=str(payload.get("from") or payload.get("from_phone") or ""),
            message_sid=str(
                payload.get("message_sid")
                or payload.get("id")
                or f"baileys-{uuid.uuid4().hex}"
            ),
            text=payload.get("text") or payload.get("body"),
            media_url=payload.get("media_url") or payload.get("media_id"),
            media_content_type=payload.get("media_content_type") or payload.get("mime"),
            received_at_iso=_now_iso(),
        )

    def health(self) -> dict:
        try:
            resp = self._get("/wa/health", timeout=2.0)
            if 200 <= resp.status_code < 300:
                body = resp.json()
                body.setdefault("provider", "baileys")
                body["last_checked_at"] = _now_iso()
                return body
            return {
                "provider": "baileys",
                "status": "degraded",
                "http_status": resp.status_code,
                "last_checked_at": _now_iso(),
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("[baileys.health] unreachable: %s", exc)
            return {
                "provider": "baileys",
                "status": "unreachable",
                "error": str(exc),
                "last_checked_at": _now_iso(),
            }
