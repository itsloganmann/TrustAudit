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

from .base import InboundMessage

logger = logging.getLogger(__name__)

# Module-level store so tests and the dashboard can inspect sent messages.
SENT_MESSAGES: List[Dict[str, Any]] = []

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
        """Resolve a ``mock://fixture/<name>`` URL to bytes on disk.

        Any non-matching URL returns a 1x1 JPEG placeholder so callers always
        receive valid image bytes.
        """
        prefix = "mock://fixture/"
        if media_url.startswith(prefix):
            name = media_url[len(prefix) :]
            # Fixture lookup: backend/tests/fixtures/challans/<name>
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

    def parse_inbound(self, payload: dict) -> InboundMessage:
        return InboundMessage(
            provider="mock",
            from_phone_e164=str(payload.get("from", "")),
            message_sid=str(payload.get("message_sid") or f"mock-{uuid.uuid4().hex}"),
            text=payload.get("text"),
            media_url=payload.get("media_url"),
            media_content_type=payload.get("media_content_type"),
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
