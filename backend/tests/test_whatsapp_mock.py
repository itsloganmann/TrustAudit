"""Unit tests for the mock WhatsApp provider.

The mock provider is our always-on fallback. These tests verify:

* ``send_text`` records the outgoing message and returns a non-empty SID.
* ``download_media`` resolves ``mock://fixture/<name>`` URLs and falls
  back to a placeholder JPEG when the file is missing.
* ``parse_inbound`` builds a well-formed ``InboundMessage``.
* ``health`` reports the running count.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services.whatsapp.base import InboundMessage
from app.services.whatsapp.mock_client import MockClient, SENT_MESSAGES, reset_mock_state


@pytest.fixture(autouse=True)
def _reset_state():
    reset_mock_state()
    yield
    reset_mock_state()


def test_send_text_appends_to_sent_messages():
    client = MockClient()
    sid = client.send_text("+919812345678", "hello world")
    assert sid.startswith("mock-")
    assert len(SENT_MESSAGES) == 1
    assert SENT_MESSAGES[0]["to"] == "+919812345678"
    assert SENT_MESSAGES[0]["body"] == "hello world"
    assert SENT_MESSAGES[0]["sid"] == sid


def test_download_media_fallback_returns_placeholder():
    client = MockClient()
    data = client.download_media("mock://fixture/does_not_exist.jpg")
    assert isinstance(data, bytes)
    assert len(data) > 100  # placeholder JPEG has real bytes
    assert data.startswith(b"\xff\xd8")  # JPEG SOI marker


def test_download_media_reads_fixture_when_present(tmp_path, monkeypatch):
    """If the fixture exists on disk, its bytes are returned verbatim."""
    backend_dir = Path(__file__).resolve().parents[1]
    fixture_dir = backend_dir / "tests" / "fixtures" / "challans"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    fixture_file = fixture_dir / "sample_stub.bin"
    fixture_file.write_bytes(b"HELLO-CHALLAN")

    try:
        client = MockClient()
        data = client.download_media("mock://fixture/sample_stub.bin")
        assert data == b"HELLO-CHALLAN"
    finally:
        fixture_file.unlink(missing_ok=True)


def test_parse_inbound_builds_message():
    client = MockClient()
    payload = {
        "from": "+919812345678",
        "text": "here is the challan",
        "media_url": "mock://fixture/sample_stub.bin",
        "media_content_type": "image/jpeg",
    }
    msg = client.parse_inbound(payload)
    assert isinstance(msg, InboundMessage)
    assert msg.provider == "mock"
    assert msg.from_phone_e164 == "+919812345678"
    assert msg.text == "here is the challan"
    assert msg.media_url == "mock://fixture/sample_stub.bin"
    assert msg.message_sid  # auto-generated when not supplied


def test_parse_inbound_honors_supplied_sid():
    client = MockClient()
    msg = client.parse_inbound({"from": "+919812345678", "message_sid": "custom-123"})
    assert msg.message_sid == "custom-123"


def test_health_reports_sent_count():
    client = MockClient()
    assert client.health()["sent_count"] == 0
    client.send_text("+1", "hi")
    client.send_text("+2", "hi")
    h = client.health()
    assert h["provider"] == "mock"
    assert h["status"] == "ok"
    assert h["sent_count"] == 2
