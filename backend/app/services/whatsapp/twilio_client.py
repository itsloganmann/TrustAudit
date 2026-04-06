"""Twilio WhatsApp provider using raw ``httpx`` (no twilio SDK).

We keep the dependency footprint small by calling the Twilio REST API
directly. If ``TWILIO_ACCOUNT_SID`` / ``TWILIO_AUTH_TOKEN`` are missing, the
factory falls back to :class:`MockClient` via :class:`WhatsAppProviderNotConfigured`.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

from .base import InboundMessage, WhatsAppProviderNotConfigured

logger = logging.getLogger(__name__)

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"
DEFAULT_FROM = "whatsapp:+14155238886"  # Twilio sandbox sender


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_whatsapp_prefix(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.removeprefix("whatsapp:")


class TwilioClient:
    """Real Twilio WhatsApp provider."""

    def __init__(
        self,
        account_sid: Optional[str] = None,
        auth_token: Optional[str] = None,
        from_number: Optional[str] = None,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        self._provider = "twilio"
        self.account_sid = account_sid or os.environ.get("TWILIO_ACCOUNT_SID")
        self.auth_token = auth_token or os.environ.get("TWILIO_AUTH_TOKEN")
        self.from_number = (
            from_number
            or os.environ.get("TWILIO_SANDBOX_FROM")
            or DEFAULT_FROM
        )
        if not self.from_number.startswith("whatsapp:"):
            self.from_number = f"whatsapp:{self.from_number}"

        if not self.account_sid or not self.auth_token:
            raise WhatsAppProviderNotConfigured(
                "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set"
            )
        self._http = http_client  # allow injection in tests

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _auth(self) -> tuple[str, str]:
        return (self.account_sid or "", self.auth_token or "")

    def _post(self, url: str, data: Dict[str, Any]) -> httpx.Response:
        if self._http is not None:
            return self._http.post(url, data=data, auth=self._auth())
        return httpx.post(url, data=data, auth=self._auth(), timeout=10.0)

    def _get(self, url: str) -> httpx.Response:
        if self._http is not None:
            return self._http.get(url, auth=self._auth())
        return httpx.get(url, auth=self._auth(), timeout=10.0)

    def _head(self, url: str) -> httpx.Response:
        if self._http is not None:
            return self._http.head(url, auth=self._auth())
        return httpx.head(url, auth=self._auth(), timeout=5.0)

    # ------------------------------------------------------------------
    # Provider protocol
    # ------------------------------------------------------------------
    def send_text(self, to_phone_e164: str, body: str) -> str:
        url = f"{TWILIO_API_BASE}/Accounts/{self.account_sid}/Messages.json"
        to = to_phone_e164
        if not to.startswith("whatsapp:"):
            to = f"whatsapp:{to}"
        payload = {"From": self.from_number, "To": to, "Body": body}
        logger.info("[twilio.send_text] to=%s", to)
        resp = self._post(url, payload)
        resp.raise_for_status()
        data = resp.json()
        sid = data.get("sid") or ""
        return str(sid)

    def download_media(self, media_url: str) -> bytes:
        logger.info("[twilio.download_media] %s", media_url)
        resp = self._get(media_url)
        resp.raise_for_status()
        return resp.content

    def parse_inbound(self, payload: dict) -> InboundMessage:
        from_raw = payload.get("From") or payload.get("from") or ""
        num_media_raw = payload.get("NumMedia") or payload.get("num_media") or "0"
        try:
            num_media = int(num_media_raw)
        except (TypeError, ValueError):
            num_media = 0
        media_url = None
        media_ct = None
        if num_media > 0:
            media_url = payload.get("MediaUrl0") or payload.get("media_url_0")
            media_ct = (
                payload.get("MediaContentType0")
                or payload.get("media_content_type_0")
            )
        return InboundMessage(
            provider="twilio",
            from_phone_e164=_strip_whatsapp_prefix(from_raw),
            message_sid=str(payload.get("MessageSid") or payload.get("message_sid") or ""),
            text=payload.get("Body") or payload.get("body"),
            media_url=media_url,
            media_content_type=media_ct,
            received_at_iso=_now_iso(),
        )

    def health(self) -> dict:
        url = f"{TWILIO_API_BASE}/Accounts/{self.account_sid}.json"
        result = {
            "provider": "twilio",
            "status": "unknown",
            "last_checked_at": _now_iso(),
        }
        try:
            resp = self._head(url)
            if 200 <= resp.status_code < 300:
                result["status"] = "ok"
            else:
                result["status"] = "degraded"
                result["http_status"] = resp.status_code
        except Exception as exc:  # noqa: BLE001 -- surface all connectivity errors
            logger.warning("[twilio.health] failed: %s", exc)
            result["status"] = "degraded"
            result["error"] = str(exc)
        return result
