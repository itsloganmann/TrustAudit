"""Abstract base types for WhatsApp providers.

All providers (baileys, mock) implement :class:`WhatsAppProvider`
and emit :class:`InboundMessage` records from their ``parse_inbound`` method.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol


class WhatsAppProviderNotConfigured(Exception):
    """Raised when a provider is selected but required env vars are missing.

    The :func:`get_whatsapp_provider` factory catches this and falls back to
    the mock client so local development and demos always work without
    credentials.
    """


@dataclass(frozen=True)
class InboundMessage:
    """An incoming WhatsApp message after it has been normalized.

    Immutable by design so downstream handlers cannot mutate shared state.
    """

    provider: str
    from_phone_e164: str
    message_sid: str
    text: Optional[str]
    media_url: Optional[str]
    media_content_type: Optional[str]
    received_at_iso: str


class WhatsAppProvider(Protocol):
    """Duck-typed interface every WhatsApp provider must satisfy."""

    def send_text(self, to_phone_e164: str, body: str) -> str: ...

    def download_media(self, media_url: str) -> bytes: ...

    def parse_inbound(self, payload: dict) -> InboundMessage: ...

    def health(self) -> dict: ...
