"""Vision provider health probes exposed via /api/healthz.

Returns a single dict the healthz endpoint can merge into its response.
Never raises — any provider-side error is captured and surfaced as
``status: "degraded"`` so the healthz route stays 200-friendly.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from . import get_vision_provider
from .base import VisionProviderNotConfigured

logger = logging.getLogger(__name__)


def check_vision_health() -> Dict[str, Any]:
    """Return a dict describing the active provider's health."""
    try:
        provider = get_vision_provider()
        return provider.health()
    except VisionProviderNotConfigured as exc:
        logger.warning("Vision provider not configured for health check: %s", exc)
        return {"provider": "unknown", "status": "degraded", "error": str(exc)}
    except Exception as exc:  # pragma: no cover — defensive
        logger.exception("Vision health check raised unexpectedly")
        return {"provider": "unknown", "status": "degraded", "error": str(exc)}
