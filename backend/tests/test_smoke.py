"""End-to-end smoke tests for the TrustAudit FastAPI app.

These tests boot the real ``app.main:app`` via ``TestClient`` (so they hit
the real SQLite DB at ``backend/trustaudit.db`` that ``seed.py`` populates).

The goal is to catch any regression that would break the live deployment
the moment the container starts: missing routes, broken auth, missing
seed data, mis-wired routers. They are deliberately tolerant of optional
fields (e.g. providers) so they keep passing as W2/W6 evolve the
WhatsApp + auth surface area.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# /health -- Render's L7 probe + UptimeRobot pingbacks
# ---------------------------------------------------------------------------
def test_health_returns_healthy() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


# ---------------------------------------------------------------------------
# /api/invoices + /api/stats -- legacy dashboard data
# ---------------------------------------------------------------------------
def test_legacy_invoices_returns_50() -> None:
    response = client.get("/api/invoices")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    # seed.py inserts exactly 50 invoices for the YC demo dashboard
    assert len(body) == 50

    first = body[0]
    for key in ("id", "vendor_name", "invoice_amount", "status", "deadline_43bh"):
        assert key in first, f"missing field {key} on invoice payload"


def test_stats_has_required_fields() -> None:
    response = client.get("/api/stats")

    assert response.status_code == 200
    body = response.json()
    required = (
        "total_invoices",
        "verified_count",
        "critical_count",
        "liability_saved",
        "total_at_risk",
        "compliance_rate",
    )
    for key in required:
        assert key in body, f"/api/stats missing field {key}"

    assert isinstance(body["total_invoices"], int)
    assert body["total_invoices"] == 50


# ---------------------------------------------------------------------------
# /api/webhook/whatsapp/health -- aggregated provider health
# ---------------------------------------------------------------------------
def test_webhook_health_returns_provider_state() -> None:
    response = client.get("/api/webhook/whatsapp/health")

    assert response.status_code == 200
    body = response.json()
    assert "active_provider" in body
    assert "providers" in body
    # All three providers (mock, twilio, baileys) should at least surface
    # *some* status string -- even when twilio/baileys are not configured
    # they degrade gracefully via _safe_*_health.
    providers = body["providers"]
    for name in ("mock", "twilio", "baileys"):
        assert name in providers, f"provider {name} missing from health body"
        assert "status" in providers[name]


# ---------------------------------------------------------------------------
# /api/demo/health -- /live page footer + UptimeRobot
# ---------------------------------------------------------------------------
def test_demo_health_returns_session_count() -> None:
    response = client.get("/api/demo/health")

    assert response.status_code == 200
    body = response.json()
    assert "healthy" in body
    assert body["healthy"] is True
    assert "active_sessions" in body


# ---------------------------------------------------------------------------
# /api/auth/vendor/signin -- seeded demo account
# ---------------------------------------------------------------------------
def test_auth_signin_with_seeded_demo_account() -> None:
    response = client.post(
        "/api/auth/vendor/signin",
        json={"email": "vendor@bharat.demo", "password": "demo"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user"]["role"] == "vendor"
    assert body["user"]["email"] == "vendor@bharat.demo"
    # Session cookie should be set so the frontend stays logged in.
    assert "trustaudit_session" in response.cookies


# ---------------------------------------------------------------------------
# /api/webhook/whatsapp/inbound -- mock multipart upload using a real fixture
# ---------------------------------------------------------------------------
def test_webhook_inbound_accepts_mock_multipart_with_fixture() -> None:
    """Verify the webhook ingests a mock-style multipart payload end-to-end.

    Uses the ``mock://fixture/perfect_tally_printed.jpg`` URL pattern that
    ``MockClient.download_media`` understands -- this exercises the full
    download -> hash -> dedup -> pipeline path without requiring real
    Twilio or baileys credentials.
    """
    # Use ``files=`` so httpx encodes as ``multipart/form-data`` -- the
    # webhook router detects this content-type as the "mock" provider path,
    # which is what we want for credential-free smoke tests.
    payload = {
        "from": (None, "+15551234567"),
        "message_sid": (None, "smoke-test-sid-001"),
        "text": (None, "smoke test"),
        "media_url": (None, "mock://fixture/perfect_tally_printed.jpg"),
        "media_content_type": (None, "image/jpeg"),
    }

    response = client.post("/api/webhook/whatsapp/inbound", files=payload)

    # Either accepted (first time) or duplicate_image (replayed) -- both are
    # success paths from the test harness's perspective.
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] in {
        "accepted",
        "duplicate",
        "duplicate_image",
        "rate_limited",
    }
    if body["status"] == "accepted":
        assert body.get("media_sha256"), "accepted webhook should report media_sha256"
        assert body.get("provider") == "mock"
