"""WhatsApp provider package.

Exposes a single factory :func:`get_whatsapp_provider` that selects the
concrete implementation at runtime based on the ``WHATSAPP_PROVIDER`` env
var. Falls back to :class:`MockClient` whenever the requested provider
cannot be configured — the demo and tests must always work without
credentials.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from .base import (
    InboundMessage,
    WhatsAppProvider,
    WhatsAppProviderNotConfigured,
)
from .baileys_client import BaileysClient
from .mock_client import MockClient, SENT_MESSAGES, reset_mock_state
from .twilio_client import TwilioClient

logger = logging.getLogger(__name__)

_cached_provider: Optional[WhatsAppProvider] = None


def get_whatsapp_provider() -> WhatsAppProvider:
    """Return the active WhatsApp provider, caching at module level."""
    global _cached_provider
    if _cached_provider is not None:
        return _cached_provider

    chosen = os.environ.get("WHATSAPP_PROVIDER", "mock").lower()
    try:
        if chosen == "twilio":
            _cached_provider = TwilioClient()
            return _cached_provider
        if chosen == "baileys":
            _cached_provider = BaileysClient()
            return _cached_provider
    except WhatsAppProviderNotConfigured as exc:
        logger.warning("Falling back to mock WhatsApp provider: %s", exc)

    _cached_provider = MockClient()
    return _cached_provider


def reset_provider_cache() -> None:
    """Test helper: forget the cached provider so env var changes take effect."""
    global _cached_provider
    _cached_provider = None


__all__ = [
    "InboundMessage",
    "WhatsAppProvider",
    "WhatsAppProviderNotConfigured",
    "BaileysClient",
    "MockClient",
    "TwilioClient",
    "SENT_MESSAGES",
    "get_whatsapp_provider",
    "reset_mock_state",
    "reset_provider_cache",
]
