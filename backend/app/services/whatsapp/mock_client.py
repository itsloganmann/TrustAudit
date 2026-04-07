"""Mock WhatsApp provider.

Zero external dependencies. Used when:
- ``WHATSAPP_PROVIDER`` env var is unset or equals ``mock``.
- A real provider fails to initialize and we degrade gracefully.

``send_text`` appends to a module-level ``SENT_MESSAGES`` list so tests and
the demo UI can inspect what would have been sent.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import httpx

from .base import InboundMessage

logger = logging.getLogger(__name__)

# Module-level store so tests and the dashboard can inspect sent messages.
SENT_MESSAGES: List[Dict[str, Any]] = []

# Largest media payload we will accept from an http(s) URL. Twilio media is
# capped well below this in practice; the ceiling is here as a safety net
# against an attacker pointing ``MediaUrl0`` at a multi-GB file.
_MAX_MEDIA_BYTES = 5 * 1024 * 1024

# Allowed image mime prefixes when fetching over http(s). We accept any
# ``image/*`` so the smoke test can post PNGs or WEBPs as well as JPEGs.
_ALLOWED_MEDIA_PREFIXES = ("image/",)

# 1x1 white JPEG placeholder (631 bytes) returned when a fixture path can't be
# resolved. Generated once at module import from the hex below so we never need
# an external fixture file just to boot.
import base64 as _b64

_PLACEHOLDER_JPEG: bytes = _b64.b64decode(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U"
    "HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN"
    "DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
    "MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQF"
    "BgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEI"
    "I0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNk"
    "ZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLD"
    "xMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEB"
    "AQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJR"
    "B2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdI"
    "SUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeo"
    "qaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8vP09fb3+Pn6/9oA"
    "DAMBAAIRAxEAPwD3+iiigD//2Q=="
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MockClient:
    """Always-on WhatsApp provider used for demos and tests."""

    def __init__(self) -> None:
        self._provider = "mock"

    def send_text(self, to_phone_e164: str, body: str) -> str:
        sid = f"mock-{uuid.uuid4().hex}"
        SENT_MESSAGES.append(
            {
                "sid": sid,
                "to": to_phone_e164,
                "body": body,
                "sent_at": _now_iso(),
            }
        )
        logger.info("[mock.send_text] to=%s sid=%s", to_phone_e164, sid)
        return sid

    def download_media(self, media_url: str) -> bytes:
        """Resolve a media URL into raw image bytes.

        Three paths are supported:

        1. ``mock://fixture/<name>`` — reads
           ``backend/tests/fixtures/challans/<name>``. This is the path the
           in-repo tests exercise, and it does not touch the network.
        2. ``http://`` / ``https://`` — actually fetches the URL via
           ``httpx`` with a strict size + content-type check. This is what
           the autonomous smoke test uses to prove "real receipts from the
           internet" (GitHub raw URLs, etc.) flow through the exact same
           code path that Twilio's media-download step would.
        3. Anything else — returns a 1×1 placeholder JPEG so the caller
           always receives *some* valid image bytes and the webhook does
           not crash on malformed or unknown schemes.
        """
        prefix = "mock://fixture/"
        if media_url.startswith(prefix):
            name = media_url[len(prefix) :]
            here = Path(__file__).resolve()
            backend_dir = here.parents[3]  # .../backend
            fixture_path = backend_dir / "tests" / "fixtures" / "challans" / name
            if fixture_path.is_file():
                return fixture_path.read_bytes()
            logger.warning(
                "[mock.download_media] fixture %s not found at %s; returning placeholder",
                name,
                fixture_path,
            )
            return _PLACEHOLDER_JPEG

        if media_url.startswith(("http://", "https://")):
            try:
                with httpx.Client(
                    timeout=15.0,
                    follow_redirects=True,
                    headers={"User-Agent": "trustaudit-mock-whatsapp/1.0"},
                ) as client:
                    resp = client.get(media_url)
                    resp.raise_for_status()
                    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
                    if content_type and not any(
                        content_type.startswith(p) for p in _ALLOWED_MEDIA_PREFIXES
                    ):
                        logger.warning(
                            "[mock.download_media] refusing non-image content-type %s from %s",
                            content_type,
                            media_url,
                        )
                        return _PLACEHOLDER_JPEG
                    data = resp.content
                    if len(data) > _MAX_MEDIA_BYTES:
                        logger.warning(
                            "[mock.download_media] media %d bytes > cap %d, refusing",
                            len(data),
                            _MAX_MEDIA_BYTES,
                        )
                        return _PLACEHOLDER_JPEG
                    if not data:
                        logger.warning("[mock.download_media] empty body from %s", media_url)
                        return _PLACEHOLDER_JPEG
                    return data
            except httpx.HTTPError as exc:
                logger.warning("[mock.download_media] http fetch failed for %s: %s", media_url, exc)
                return _PLACEHOLDER_JPEG

        return _PLACEHOLDER_JPEG

    def parse_inbound(self, payload: dict) -> InboundMessage:
        # Accept both canonical mock keys AND the Twilio-shaped keys
        # (``MessageSid``, ``From``, ``Body``, ``MediaUrl0``,
        # ``MediaContentType0``). This lets MockClient gracefully handle
        # Twilio-shaped payloads when a test or fallback path routes them
        # here. Adversary review of 6293462 (P1 #5) flagged that the
        # previous lowercase-only lookup silently regenerated a fresh UUID
        # every call, defeating idempotency on Twilio retries.
        from_value = (
            payload.get("from")
            or payload.get("From")
            or ""
        )
        # Twilio prefixes WhatsApp phones with ``whatsapp:`` — strip it so
        # the rate limiter and audit log see canonical E.164.
        from_str = str(from_value)
        if from_str.lower().startswith("whatsapp:"):
            from_str = from_str.split(":", 1)[1]

        sid = (
            payload.get("message_sid")
            or payload.get("MessageSid")
            or f"mock-{uuid.uuid4().hex}"
        )

        return InboundMessage(
            provider="mock",
            from_phone_e164=from_str,
            message_sid=str(sid),
            text=payload.get("text") or payload.get("Body"),
            media_url=payload.get("media_url") or payload.get("MediaUrl0"),
            media_content_type=(
                payload.get("media_content_type")
                or payload.get("MediaContentType0")
            ),
            received_at_iso=_now_iso(),
        )

    def health(self) -> dict:
        return {
            "provider": "mock",
            "status": "ok",
            "sent_count": len(SENT_MESSAGES),
            "last_checked_at": _now_iso(),
        }


def reset_mock_state() -> None:
    """Test helper: clears SENT_MESSAGES between tests."""
    SENT_MESSAGES.clear()
