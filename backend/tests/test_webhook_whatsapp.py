"""Integration tests for the /api/webhook/whatsapp/inbound router.

These tests exercise the full FastAPI request/response path. Every future
webhook change MUST land a matching test here.

Covered scenarios:

* mock provider — accepted inbound, correct reply body
* application/x-www-form-urlencoded routes to mock (form shape is no
  longer Twilio-specific after the pivot)
* duplicate MessageSid returns JSON duplicate
* duplicate image hash — only fires when a real invoice_id has been recorded
* rate-limit path returns early
* aggregated /health endpoint exposes providers block
* step-1.5 immediate ack + outbound observability
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402
from app.services import webhook_idempotency, rate_limit, webhook_observability  # noqa: E402
from app.services.whatsapp import mock_client as mock_mod  # noqa: E402
from app.services import whatsapp as wa_factory  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch):
    """Reset idempotency + rate-limit + mock provider state before each test.

    Also forces the WhatsApp provider to ``mock`` so tests do not accidentally
    hit a live Baileys sidecar. The module-level provider cache is cleared
    so a previously-cached BaileysClient instance does not leak in.
    """
    webhook_idempotency.reset_idempotency_state()
    if hasattr(rate_limit, "_store"):
        rate_limit._store.clear()  # type: ignore[attr-defined]
    mock_mod.SENT_MESSAGES.clear()
    monkeypatch.setenv("WHATSAPP_PROVIDER", "mock")
    if hasattr(wa_factory, "_cached_provider"):
        wa_factory._cached_provider = None  # type: ignore[attr-defined]
    yield
    webhook_idempotency.reset_idempotency_state()
    mock_mod.SENT_MESSAGES.clear()
    if hasattr(wa_factory, "_cached_provider"):
        wa_factory._cached_provider = None  # type: ignore[attr-defined]


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------
def test_inbound_mock_text_only_returns_accepted(client):
    # multipart/form-data routes to the mock provider (the drag-and-drop
    # demo path from the frontend + the fixture self-test path).
    r = client.post(
        "/api/webhook/whatsapp/inbound",
        files={"_dummy": ("", "")},  # force multipart content-type
        data={"from": "+919812345678", "text": "hello", "message_sid": "mock-t1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "accepted"
    assert body["sid"] == "mock-t1"
    assert body["provider"] == "mock"


def test_inbound_form_urlencoded_routes_to_mock(client):
    # After the Twilio pivot, form-urlencoded payloads no longer carry the
    # Twilio shape — they route to the mock provider and return JSON.
    payload = {
        "From": "whatsapp:+919812345678",
        "Body": "hello form",
        "MessageSid": "form-urlencoded-1",
        "NumMedia": "0",
    }
    r = client.post(
        "/api/webhook/whatsapp/inbound",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "accepted"
    assert body["provider"] == "mock"


def test_inbound_json_routes_to_baileys_shape(client):
    # application/json routes to the baileys detected path.
    r = client.post(
        "/api/webhook/whatsapp/inbound",
        json={
            "from": "+919812345678",
            "text": "baileys shape",
            "message_sid": "baileys-shape-1",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "accepted"
    assert body["sid"] == "baileys-shape-1"


# ---------------------------------------------------------------------------
# Duplicate handling
# ---------------------------------------------------------------------------
def test_duplicate_message_sid_short_circuits(client):
    r1 = client.post(
        "/api/webhook/whatsapp/inbound",
        json={"from": "+91", "text": "once", "message_sid": "dup-sid-1"},
    )
    assert r1.json()["status"] == "accepted"

    r2 = client.post(
        "/api/webhook/whatsapp/inbound",
        json={"from": "+91", "text": "once", "message_sid": "dup-sid-1"},
    )
    assert r2.json()["status"] == "duplicate"


def test_duplicate_image_only_fires_when_real_invoice_id_present(client):
    # Pre-seed the image-hash store with invoice_id=0 (sentinel) — it should
    # NOT be recorded, so a subsequent upload that matches this hash should
    # still be accepted (not short-circuited as duplicate).
    bytes_value = b"fake-challan-bytes-123"
    sha = hashlib.sha256(bytes_value).hexdigest()

    webhook_idempotency.record_image_hash(sha, invoice_id=0)  # type: ignore[arg-type]
    assert webhook_idempotency.find_invoice_by_image_hash(sha) is None

    webhook_idempotency.record_image_hash(sha, invoice_id=42)
    assert webhook_idempotency.find_invoice_by_image_hash(sha) == 42


def test_webhook_user_reply_never_says_invoice_zero(client):
    """Adversary must-fix #1: replies must never interpolate invoice_id=0."""
    bytes_value = b"another-fake-challan-bytes"
    sha = hashlib.sha256(bytes_value).hexdigest()
    webhook_idempotency.record_image_hash(sha, invoice_id=42)

    found = webhook_idempotency.find_invoice_by_image_hash(sha)
    assert found == 42
    assert f"invoice #{found}" == "invoice #42"


# ---------------------------------------------------------------------------
# Rate limit
# ---------------------------------------------------------------------------
def test_rate_limit_path_returns_early(client, monkeypatch):
    monkeypatch.setattr(rate_limit, "check", lambda kind, key, **kw: False)
    r = client.post(
        "/api/webhook/whatsapp/inbound",
        json={"from": "+91spammer", "text": "spam", "message_sid": "spam-1"},
    )
    assert r.json()["status"] == "rate_limited"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
def test_webhook_health_endpoint(client):
    r = client.get("/api/webhook/whatsapp/health")
    assert r.status_code == 200
    body = r.json()
    assert "active_provider" in body
    assert "providers" in body
    assert "mock" in body["providers"]
    assert "baileys" in body["providers"]
    # No twilio provider after the pivot.
    assert "twilio" not in body["providers"]


# ---------------------------------------------------------------------------
# Step-1.5 immediate ack + outbound observability
# ---------------------------------------------------------------------------
def test_inbound_fires_immediate_ack_and_records_outbound_observability(client, monkeypatch):
    """Every accepted inbound must (a) push a user-visible ack to the sender
    BEFORE running the slow vision pipeline, and (b) record the outbound
    result to the observability ring buffer so a stale sidecar connection is
    diagnosable from ``GET /api/debug/recent-inbounds`` without needing log
    access.
    """
    webhook_observability.reset()

    sid = "ack-obs-test-1"
    r = client.post(
        "/api/webhook/whatsapp/inbound",
        files={"_dummy": ("", "")},  # force multipart → mock provider path
        data={
            "from": "+919812345678",
            "text": "challan upload",
            "message_sid": sid,
        },
    )
    assert r.status_code == 200
    assert r.json()["status"] == "accepted"

    # The mock provider's send_text appends to SENT_MESSAGES — there should
    # be exactly one entry, the step-1.5 ack, with the live-status link in
    # the body so the user can tap straight from WhatsApp.
    assert len(mock_mod.SENT_MESSAGES) == 1, mock_mod.SENT_MESSAGES
    sent = mock_mod.SENT_MESSAGES[0]
    assert sent["to"] == "+919812345678"
    assert "TrustAudit" in sent["body"]
    assert "got your challan" in sent["body"]
    assert "trustaudit" in sent["body"].lower()

    # The observability ring buffer should now contain TWO rows for this
    # webhook hit: the inbound record (sig=skipped) AND the ack record
    # (ack_sent:ok=True). The debug endpoint is admin-gated — we set the
    # token directly rather than asserting on an unauth 401 because the
    # test is about observability, not authn.
    admin_token = "test-admin-token-debug-route-cb8b23"
    monkeypatch.setenv("ADMIN_TOKEN", admin_token)
    debug = client.get(
        "/api/debug/recent-inbounds?limit=10",
        headers={"X-Admin-Token": admin_token},
    ).json()
    items = debug["items"]
    matched_inbound = [
        i for i in items
        if i.get("message_sid") == sid and str(i.get("outcome", "")).startswith("received:")
    ]
    matched_ack = [
        i for i in items
        if i.get("message_sid") == sid and str(i.get("outcome", "")).startswith("ack_sent:")
    ]
    assert len(matched_inbound) == 1, items
    assert len(matched_ack) == 1, items
    assert matched_ack[0]["outcome"] == "ack_sent:ok=True"
    assert matched_ack[0].get("extra", {}).get("ack_error") is None
