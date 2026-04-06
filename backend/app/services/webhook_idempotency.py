"""In-memory idempotency store for WhatsApp webhooks.

Two independent dedup layers:

1. **Message SID** — a provider-specific unique id (Twilio ``MessageSid``,
   baileys message id, or our generated mock UUID). Prevents a retried
   webhook from re-ingesting the same payload.
2. **Image SHA-256** — the hash of the raw uploaded bytes. Prevents a user
   from re-uploading an already-processed challan photo.

Both layers use a simple sliding-window TTL. This is a placeholder for the
future DB-backed implementation.

# TODO: replace with rate_limits table when W10 wires the DB session dep
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

logger = logging.getLogger(__name__)

DEFAULT_MESSAGE_TTL_SECONDS = 3600  # 1 hour
DEFAULT_IMAGE_TTL_SECONDS = 24 * 3600  # 24 hours


class _IdempotencyStore:
    """Thread-safe in-memory store used by all module-level helpers."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._seen_message_sids: Dict[str, datetime] = {}
        self._seen_image_hashes: Dict[str, tuple[int, datetime]] = {}

    # ------------------------------------------------------------------
    # Message SID dedup
    # ------------------------------------------------------------------
    def is_duplicate_message(
        self,
        sid: str,
        *,
        ttl_seconds: int = DEFAULT_MESSAGE_TTL_SECONDS,
    ) -> bool:
        if not sid:
            return False
        now = datetime.now(timezone.utc)
        with self._lock:
            self._gc_messages(now, ttl_seconds)
            return sid in self._seen_message_sids

    def mark_message_seen(self, sid: str) -> None:
        if not sid:
            return
        with self._lock:
            self._seen_message_sids[sid] = datetime.now(timezone.utc)

    def mark_seen_if_new(
        self,
        sid: str,
        *,
        ttl_seconds: int = DEFAULT_MESSAGE_TTL_SECONDS,
    ) -> bool:
        """Atomic check-and-set. Returns True if this SID is new (and now marked),
        False if it was already present within the TTL window.

        Used by the async webhook handler to eliminate the check-then-mark race
        flagged by the adversary review of 6293462."""
        if not sid:
            return True
        now = datetime.now(timezone.utc)
        with self._lock:
            self._gc_messages(now, ttl_seconds)
            if sid in self._seen_message_sids:
                return False
            self._seen_message_sids[sid] = now
            return True

    def _gc_messages(self, now: datetime, ttl_seconds: int) -> None:
        cutoff = now - timedelta(seconds=ttl_seconds)
        expired = [k for k, ts in self._seen_message_sids.items() if ts < cutoff]
        for k in expired:
            self._seen_message_sids.pop(k, None)

    # ------------------------------------------------------------------
    # Image hash dedup
    # ------------------------------------------------------------------
    def find_invoice_by_image_hash(
        self,
        sha256_hex: str,
        *,
        ttl_seconds: int = DEFAULT_IMAGE_TTL_SECONDS,
    ) -> Optional[int]:
        if not sha256_hex:
            return None
        now = datetime.now(timezone.utc)
        with self._lock:
            self._gc_images(now, ttl_seconds)
            hit = self._seen_image_hashes.get(sha256_hex)
            return hit[0] if hit else None

    def record_image_hash(self, sha256_hex: str, invoice_id: Optional[int]) -> None:
        """Record an image hash → invoice mapping.

        If ``invoice_id`` is falsy (0 or None), the record is skipped entirely so
        the dedup layer is not polluted with a sentinel "invoice #0" value that
        would later leak into user-facing replies. See adversary review of
        6293462 (must-fix #1 and P1-7).
        """
        if not sha256_hex or not invoice_id:
            return
        with self._lock:
            self._seen_image_hashes[sha256_hex] = (
                invoice_id,
                datetime.now(timezone.utc),
            )

    def _gc_images(self, now: datetime, ttl_seconds: int) -> None:
        cutoff = now - timedelta(seconds=ttl_seconds)
        expired = [
            k for k, (_, ts) in self._seen_image_hashes.items() if ts < cutoff
        ]
        for k in expired:
            self._seen_image_hashes.pop(k, None)

    # ------------------------------------------------------------------
    # Test helper
    # ------------------------------------------------------------------
    def clear(self) -> None:
        with self._lock:
            self._seen_message_sids.clear()
            self._seen_image_hashes.clear()


_store = _IdempotencyStore()


# Module-level functional API --------------------------------------------------


def is_duplicate_message(
    sid: str,
    *,
    ttl_seconds: int = DEFAULT_MESSAGE_TTL_SECONDS,
) -> bool:
    return _store.is_duplicate_message(sid, ttl_seconds=ttl_seconds)


def mark_message_seen(sid: str) -> None:
    _store.mark_message_seen(sid)


def mark_seen_if_new(
    sid: str,
    *,
    ttl_seconds: int = DEFAULT_MESSAGE_TTL_SECONDS,
) -> bool:
    """Atomic check-and-set. True if new, False if already seen."""
    return _store.mark_seen_if_new(sid, ttl_seconds=ttl_seconds)


def find_invoice_by_image_hash(
    sha256_hex: str,
    *,
    ttl_seconds: int = DEFAULT_IMAGE_TTL_SECONDS,
) -> Optional[int]:
    return _store.find_invoice_by_image_hash(sha256_hex, ttl_seconds=ttl_seconds)


def record_image_hash(sha256_hex: str, invoice_id: Optional[int]) -> None:
    _store.record_image_hash(sha256_hex, invoice_id)


def reset_idempotency_state() -> None:
    """Test helper: clear both dedup layers."""
    _store.clear()
