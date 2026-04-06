"""Tests for the in-memory sliding-window rate limiter."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services import rate_limit as rl


@pytest.fixture(autouse=True)
def _reset():
    rl.reset_rate_limit_state()
    yield
    rl.reset_rate_limit_state()


def test_normal_traffic_passes():
    for _ in range(5):
        assert rl.check("phone", "+919812345678", max_per_window=5) is True


def test_over_limit_is_rejected():
    assert rl.check("phone", "+91", max_per_window=2) is True
    assert rl.check("phone", "+91", max_per_window=2) is True
    assert rl.check("phone", "+91", max_per_window=2) is False


def test_different_keys_have_independent_buckets():
    for _ in range(3):
        assert rl.check("phone", "+A", max_per_window=3) is True
    # Different key is still fresh.
    assert rl.check("phone", "+B", max_per_window=3) is True
    assert rl.check("phone", "+A", max_per_window=3) is False


def test_kind_is_part_of_key():
    rl.check("phone", "123", max_per_window=1)
    # Same raw key, different kind, must not collide.
    assert rl.check("ip", "123", max_per_window=1) is True


def test_sliding_window_expires_old_entries():
    key = "+slide"
    # Fill the bucket.
    for _ in range(3):
        assert rl.check("phone", key, max_per_window=3, window_seconds=60) is True
    assert rl.check("phone", key, max_per_window=3, window_seconds=60) is False

    # Rewrite bucket timestamps to be outside the window.
    bucket = rl._limiter._buckets["phone:+slide"]  # noqa: SLF001
    old = datetime.now(timezone.utc) - timedelta(seconds=120)
    for i in range(len(bucket)):
        bucket[i] = old

    assert rl.check("phone", key, max_per_window=3, window_seconds=60) is True


def test_block_rejects_further_requests():
    rl.block("+spammer", seconds=60)
    assert rl.is_blocked("+spammer") is True
    assert rl.check("phone", "+spammer", max_per_window=100) is False


def test_block_expires_after_duration():
    rl.block("+later", seconds=60)
    # Rewrite expiry to be in the past.
    rl._limiter._blocklist["phone:+later"] = datetime.now(timezone.utc) - timedelta(  # noqa: SLF001
        seconds=1
    )
    assert rl.is_blocked("+later") is False
    assert rl.check("phone", "+later", max_per_window=5) is True
