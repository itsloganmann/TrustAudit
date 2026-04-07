"""Vision pipeline — pluggable VLM providers + edge-case detectors.

Public API:

    from app.services.vision import (
        ExtractionResult,
        VisionProvider,
        VisionProviderNotConfigured,
        get_vision_provider,
    )

The provider factory selects a backend from the ``VISION_PROVIDER`` environment
variable (``gemini``, ``claude``, ``mock``). Any misconfiguration falls back to
the mock provider so the demo is always runnable.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from .base import (
    ExtractionResult,
    VisionProvider,
    VisionProviderNotConfigured,
)

logger = logging.getLogger(__name__)

__all__ = [
    "ExtractionResult",
    "VisionProvider",
    "VisionProviderNotConfigured",
    "get_vision_provider",
]


def get_vision_provider(name: Optional[str] = None) -> VisionProvider:
    """Return a vision provider, falling back to mock on any failure.

    Selection order:
      1. Explicit ``name`` argument
      2. ``VISION_PROVIDER`` env var
      3. ``"mock"`` default

    On ``VisionProviderNotConfigured`` (e.g. missing API key) we log a
    warning and return the mock provider so demos never crash.

    Empty or whitespace-only values (from either ``name`` or the env
    var) are treated as "unset" — Render sometimes declares an env key
    with no value, which would otherwise slip through ``or`` short-
    circuiting and land in the ``unknown provider`` branch.
    """
    explicit = (name or "").strip()
    from_env = (os.environ.get("VISION_PROVIDER") or "").strip()
    chosen = (explicit or from_env or "mock").lower()

    if chosen == "mock":
        from .mock_client import MockVisionClient

        return MockVisionClient()

    if chosen == "gemini":
        try:
            from .gemini_client import GeminiVisionClient

            return GeminiVisionClient()
        except VisionProviderNotConfigured as exc:
            logger.warning("Gemini provider unavailable, falling back to mock: %s", exc)
            from .mock_client import MockVisionClient

            return MockVisionClient()

    if chosen == "claude":
        try:
            from .claude_client import ClaudeVisionClient

            return ClaudeVisionClient()
        except VisionProviderNotConfigured as exc:
            logger.warning("Claude provider unavailable, falling back to mock: %s", exc)
            from .mock_client import MockVisionClient

            return MockVisionClient()

    logger.warning("Unknown vision provider %r, using mock", chosen)
    from .mock_client import MockVisionClient

    return MockVisionClient()
