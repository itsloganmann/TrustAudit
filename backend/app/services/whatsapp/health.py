"""Aggregated health endpoint for all WhatsApp providers.

Called by the ``/api/webhook/whatsapp/health`` route. Reports the active
provider and the last time an inbound message was observed.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .baileys_client import BaileysClient
from .mock_client import MockClient


_last_inbound_at_iso: Optional[str] = None


def record_inbound_now() -> None:
    """Module-level clock: called whenever a webhook is accepted."""
    global _last_inbound_at_iso
    _last_inbound_at_iso = datetime.now(timezone.utc).isoformat()


def last_inbound_at_iso() -> Optional[str]:
    return _last_inbound_at_iso


def _safe_baileys_health() -> Dict[str, Any]:
    try:
        return BaileysClient().health()
    except Exception as exc:  # noqa: BLE001
        return {"provider": "baileys", "status": "error", "error": str(exc)}


def aggregated_health() -> Dict[str, Any]:
    """Return health for every known provider plus the active selection."""
    active = os.environ.get("WHATSAPP_PROVIDER", "mock")
    return {
        "active_provider": active,
        "last_inbound_at": _last_inbound_at_iso,
        "providers": {
            "mock": MockClient().health(),
            "baileys": _safe_baileys_health(),
        },
    }
