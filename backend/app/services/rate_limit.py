"""In-memory sliding-window rate limiter.

Keyed by a composite of ``{kind}:{key}`` where ``kind`` is one of
``phone`` or ``ip``. Holds a per-key deque of request timestamps and
rejects once the window exceeds the configured threshold.

A separate blocklist stores temporary bans (e.g., for repeat offenders).

This is intentionally simple; a future revision can back it with
redis or the ``rate_limits`` DB table W1 is adding.
"""
from __future__ import annotations

import logging
import threading
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, Tuple

logger = logging.getLogger(__name__)


class _RateLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: Dict[str, Deque[datetime]] = {}
        self._blocklist: Dict[str, datetime] = {}  # key -> expires_at

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def check(
        self,
        kind: str,
        key: str,
        *,
        max_per_window: int = 10,
        window_seconds: int = 60,
    ) -> bool:
        """Return True if the request is allowed, False if rate-limited."""
        composite = f"{kind}:{key}"
        now = datetime.now(timezone.utc)
        with self._lock:
            # 1. Blocklist
            expires = self._blocklist.get(composite)
            if expires is not None:
                if expires > now:
                    return False
                self._blocklist.pop(composite, None)

            # 2. Sliding window
            bucket = self._buckets.setdefault(composite, deque())
            cutoff = now - timedelta(seconds=window_seconds)
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= max_per_window:
                return False
            bucket.append(now)
            return True

    def block(self, key: str, *, kind: str = "phone", seconds: int = 3600) -> None:
        """Add a composite key to the blocklist for ``seconds`` seconds."""
        composite = f"{kind}:{key}"
        expires = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        with self._lock:
            self._blocklist[composite] = expires

    def is_blocked(self, key: str, *, kind: str = "phone") -> bool:
        composite = f"{kind}:{key}"
        now = datetime.now(timezone.utc)
        with self._lock:
            expires = self._blocklist.get(composite)
            if expires is None:
                return False
            if expires <= now:
                self._blocklist.pop(composite, None)
                return False
            return True

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._blocklist.clear()

    def _peek_bucket(self, kind: str, key: str) -> Tuple[int, int]:
        """Test helper — returns (bucket_size, blocklist_size)."""
        composite = f"{kind}:{key}"
        with self._lock:
            bucket = self._buckets.get(composite, deque())
            return len(bucket), len(self._blocklist)


_limiter = _RateLimiter()


def check(
    kind: str,
    key: str,
    *,
    max_per_window: int = 10,
    window_seconds: int = 60,
) -> bool:
    return _limiter.check(
        kind, key, max_per_window=max_per_window, window_seconds=window_seconds
    )


def block(key: str, *, kind: str = "phone", seconds: int = 3600) -> None:
    _limiter.block(key, kind=kind, seconds=seconds)


def is_blocked(key: str, *, kind: str = "phone") -> bool:
    return _limiter.is_blocked(key, kind=kind)


def reset_rate_limit_state() -> None:
    """Test helper: clear every bucket and blocklist entry."""
    _limiter.reset()
