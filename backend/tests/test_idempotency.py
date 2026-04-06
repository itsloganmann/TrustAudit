"""Tests for the in-memory webhook idempotency store."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services import webhook_idempotency as idem


@pytest.fixture(autouse=True)
def _reset():
    idem.reset_idempotency_state()
    yield
    idem.reset_idempotency_state()


def test_unseen_message_is_not_duplicate():
    assert idem.is_duplicate_message("SM1") is False


def test_mark_and_detect_duplicate():
    idem.mark_message_seen("SM1")
    assert idem.is_duplicate_message("SM1") is True


def test_blank_sid_is_never_duplicate():
    assert idem.is_duplicate_message("") is False
    idem.mark_message_seen("")
    assert idem.is_duplicate_message("") is False


def test_message_sid_ttl_expiry(monkeypatch):
    idem.mark_message_seen("SMold")
    # Simulate an entry inserted long ago by rewriting the store's timestamp.
    store = idem._store  # noqa: SLF001
    store._seen_message_sids["SMold"] = datetime.now(timezone.utc) - timedelta(
        seconds=7200
    )
    assert idem.is_duplicate_message("SMold", ttl_seconds=3600) is False


def test_image_hash_round_trip():
    sha = "a" * 64
    assert idem.find_invoice_by_image_hash(sha) is None
    idem.record_image_hash(sha, invoice_id=42)
    assert idem.find_invoice_by_image_hash(sha) == 42


def test_image_hash_ttl_expiry():
    sha = "b" * 64
    idem.record_image_hash(sha, invoice_id=7)
    store = idem._store  # noqa: SLF001
    store._seen_image_hashes[sha] = (
        7,
        datetime.now(timezone.utc) - timedelta(days=5),
    )
    assert idem.find_invoice_by_image_hash(sha, ttl_seconds=3600) is None


def test_blank_image_hash_returns_none():
    assert idem.find_invoice_by_image_hash("") is None
    idem.record_image_hash("", invoice_id=1)
    assert idem.find_invoice_by_image_hash("") is None
