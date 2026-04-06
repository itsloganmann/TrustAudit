"""Unit tests for the baileys WhatsApp provider.

The Python side is a thin HTTP client; we mock the injected ``httpx.Client``
and assert the outbound request shape plus response parsing.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import httpx

from app.services.whatsapp.base import InboundMessage
from app.services.whatsapp.baileys_client import BaileysClient


def _fake_response(
    status_code: int = 200,
    json_body: dict | None = None,
    content: bytes | None = None,
) -> httpx.Response:
    request = httpx.Request("GET", "https://example.test")
    if json_body is not None:
        return httpx.Response(
            status_code,
            request=request,
            content=json.dumps(json_body).encode("utf-8"),
            headers={"content-type": "application/json"},
        )
    return httpx.Response(status_code, request=request, content=content or b"")


def _make_client(http_mock):
    return BaileysClient(sidecar_url="http://sidecar.test", http_client=http_mock)


def test_send_text_posts_to_sidecar():
    http = MagicMock()
    http.post.return_value = _fake_response(200, {"sid": "BA123", "status": "sent"})

    client = _make_client(http)
    sid = client.send_text("+919812345678", "hey")
    assert sid == "BA123"

    args, kwargs = http.post.call_args
    assert args[0] == "http://sidecar.test/wa/send"
    assert kwargs["json"] == {"to": "+919812345678", "body": "hey"}


def test_download_media_returns_raw_bytes():
    http = MagicMock()
    http.post.return_value = _fake_response(200, content=b"IMAGEBYTES")

    client = _make_client(http)
    data = client.download_media("msg-id-42")

    assert data == b"IMAGEBYTES"
    args, kwargs = http.post.call_args
    assert args[0] == "http://sidecar.test/wa/download"
    assert kwargs["json"]["media_id"] == "msg-id-42"


def test_parse_inbound_baileys_payload():
    client = _make_client(MagicMock())
    payload = {
        "provider": "baileys",
        "id": "3EB01234",
        "from": "+919812345678",
        "text": "hello",
        "media_url": "3EB01234",
        "media_content_type": "image/jpeg",
    }
    msg = client.parse_inbound(payload)
    assert isinstance(msg, InboundMessage)
    assert msg.provider == "baileys"
    assert msg.from_phone_e164 == "+919812345678"
    assert msg.message_sid == "3EB01234"
    assert msg.media_url == "3EB01234"


def test_parse_inbound_generates_sid_when_missing():
    client = _make_client(MagicMock())
    msg = client.parse_inbound({"from": "+1", "text": "yo"})
    assert msg.message_sid.startswith("baileys-") or msg.message_sid != ""


def test_health_ok_from_sidecar():
    http = MagicMock()
    http.get.return_value = _fake_response(
        200, {"provider": "baileys", "status": "connected", "phone": "+919812345678"}
    )

    client = _make_client(http)
    h = client.health()
    assert h["status"] == "connected"
    assert h["provider"] == "baileys"


def test_health_unreachable_on_exception():
    http = MagicMock()
    http.get.side_effect = httpx.ConnectError("no sidecar")

    client = _make_client(http)
    h = client.health()
    assert h["provider"] == "baileys"
    assert h["status"] == "unreachable"
    assert "error" in h
