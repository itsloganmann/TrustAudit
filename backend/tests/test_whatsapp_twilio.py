"""Unit tests for the Twilio WhatsApp provider.

We don't hit the real Twilio API. Instead we inject a fake ``httpx.Client``
and verify the outbound request shape and response parsing.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest

from app.services.whatsapp.base import (
    InboundMessage,
    WhatsAppProviderNotConfigured,
)
from app.services.whatsapp.twilio_client import TwilioClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_client(http_mock):
    return TwilioClient(
        account_sid="AC_TEST_SID",
        auth_token="tok_test",
        from_number="+14155238886",
        http_client=http_mock,
    )


def _fake_response(
    status_code: int = 200,
    json_body: dict | None = None,
    content: bytes | None = None,
) -> httpx.Response:
    request = httpx.Request("GET", "https://example.test")
    if json_body is not None:
        import json as _json

        return httpx.Response(
            status_code,
            request=request,
            content=_json.dumps(json_body).encode("utf-8"),
            headers={"content-type": "application/json"},
        )
    return httpx.Response(status_code, request=request, content=content or b"")


# ---------------------------------------------------------------------------
# Init / configuration
# ---------------------------------------------------------------------------
def test_init_without_credentials_raises(monkeypatch):
    monkeypatch.delenv("TWILIO_ACCOUNT_SID", raising=False)
    monkeypatch.delenv("TWILIO_AUTH_TOKEN", raising=False)
    with pytest.raises(WhatsAppProviderNotConfigured):
        TwilioClient()


def test_init_reads_env(monkeypatch):
    monkeypatch.setenv("TWILIO_ACCOUNT_SID", "ACENV")
    monkeypatch.setenv("TWILIO_AUTH_TOKEN", "tok_env")
    client = TwilioClient()
    assert client.account_sid == "ACENV"
    assert client.from_number.startswith("whatsapp:")


# ---------------------------------------------------------------------------
# send_text
# ---------------------------------------------------------------------------
def test_send_text_builds_expected_request():
    http = MagicMock()
    http.post.return_value = _fake_response(200, {"sid": "SM123"})

    client = _make_client(http)
    sid = client.send_text("+919812345678", "hello")

    assert sid == "SM123"
    http.post.assert_called_once()
    _, kwargs = http.post.call_args
    # URL positional or keyword
    args = http.post.call_args.args
    called_url = args[0]
    assert (
        called_url
        == "https://api.twilio.com/2010-04-01/Accounts/AC_TEST_SID/Messages.json"
    )
    assert kwargs["data"] == {
        "From": "whatsapp:+14155238886",
        "To": "whatsapp:+919812345678",
        "Body": "hello",
    }
    assert kwargs["auth"] == ("AC_TEST_SID", "tok_test")


def test_send_text_preserves_whatsapp_prefix_if_present():
    http = MagicMock()
    http.post.return_value = _fake_response(200, {"sid": "SM456"})

    client = _make_client(http)
    client.send_text("whatsapp:+15551234567", "yo")

    _, kwargs = http.post.call_args
    assert kwargs["data"]["To"] == "whatsapp:+15551234567"


# ---------------------------------------------------------------------------
# download_media
# ---------------------------------------------------------------------------
def test_download_media_returns_bytes_and_uses_auth():
    http = MagicMock()
    http.get.return_value = _fake_response(200, content=b"JPEGBYTES")

    client = _make_client(http)
    data = client.download_media(
        "https://api.twilio.com/2010-04-01/Accounts/AC_TEST_SID/Messages/MM1/Media/ME1"
    )

    assert data == b"JPEGBYTES"
    _, kwargs = http.get.call_args
    assert kwargs["auth"] == ("AC_TEST_SID", "tok_test")


# ---------------------------------------------------------------------------
# parse_inbound
# ---------------------------------------------------------------------------
def test_parse_inbound_realistic_twilio_payload():
    client = _make_client(MagicMock())
    payload = {
        "From": "whatsapp:+919812345678",
        "To": "whatsapp:+14155238886",
        "Body": "here is my challan",
        "MessageSid": "SM0123456789abcdef",
        "NumMedia": "1",
        "MediaUrl0": "https://api.twilio.com/.../Media/ME1",
        "MediaContentType0": "image/jpeg",
    }
    msg = client.parse_inbound(payload)
    assert isinstance(msg, InboundMessage)
    assert msg.provider == "twilio"
    assert msg.from_phone_e164 == "+919812345678"  # whatsapp: prefix stripped
    assert msg.text == "here is my challan"
    assert msg.message_sid == "SM0123456789abcdef"
    assert msg.media_url == "https://api.twilio.com/.../Media/ME1"
    assert msg.media_content_type == "image/jpeg"


def test_parse_inbound_no_media():
    client = _make_client(MagicMock())
    msg = client.parse_inbound(
        {
            "From": "whatsapp:+1234",
            "Body": "text only",
            "MessageSid": "SMtext",
            "NumMedia": "0",
        }
    )
    assert msg.media_url is None
    assert msg.media_content_type is None


def test_parse_inbound_invalid_num_media_defaults_to_zero():
    client = _make_client(MagicMock())
    msg = client.parse_inbound(
        {
            "From": "whatsapp:+1234",
            "Body": "text only",
            "MessageSid": "SMoops",
            "NumMedia": "not a number",
        }
    )
    assert msg.media_url is None


# ---------------------------------------------------------------------------
# health
# ---------------------------------------------------------------------------
def test_health_ok_on_200():
    http = MagicMock()
    http.head.return_value = _fake_response(200)

    client = _make_client(http)
    h = client.health()
    assert h["provider"] == "twilio"
    assert h["status"] == "ok"


def test_health_degraded_on_error():
    http = MagicMock()
    http.head.side_effect = httpx.ConnectError("boom")

    client = _make_client(http)
    h = client.health()
    assert h["status"] == "degraded"
    assert "error" in h
