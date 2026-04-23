"""Tests for the pilot-application route.

Covers the public POST (with rate limiting + email notification) and the
admin-token-guarded GET listing. Mirrors the hermetic style used by the
``test_disputes.py`` suite: we mount the pilot router on a fresh FastAPI
app rather than importing ``app.main:app``, so these tests never touch
the real SQLite file or interact with the legacy routers.
"""
from __future__ import annotations

import os
from typing import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
import app.models  # noqa: F401 — register tables on Base.metadata
from app.services import rate_limit as rl


# ---------------------------------------------------------------------------
# Fixtures — hermetic in-memory SQLite + fresh app per test
# ---------------------------------------------------------------------------
@pytest.fixture()
def shared_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def SessionLocal(shared_engine):
    return sessionmaker(bind=shared_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def app(SessionLocal):
    from app.routes.pilot import router as pilot_router

    app = FastAPI()

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.include_router(pilot_router, prefix="/api")
    return app


@pytest.fixture()
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_rate_limit_state() -> Iterator[None]:
    """Every test starts from a clean bucket so a noisy earlier test
    can't poison the 429 threshold we're about to assert on."""
    rl.reset_rate_limit_state()
    yield
    rl.reset_rate_limit_state()


@pytest.fixture(autouse=True)
def _reset_email_inbox() -> Iterator[None]:
    """Reset the mock email inbox + cached provider so each test sees
    exactly the emails it triggered. The route uses the mock provider
    unless EMAIL_PROVIDER=resend, which we never set here."""
    from app.services.email import reset_email_provider, reset_mock_inbox

    reset_email_provider()
    reset_mock_inbox()
    yield
    reset_email_provider()
    reset_mock_inbox()


@pytest.fixture()
def admin_token(monkeypatch) -> str:
    token = "pilot-admin-test-token"
    monkeypatch.setenv("PILOT_ADMIN_TOKEN", token)
    return token


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _valid_payload(**overrides):
    payload = {
        "company_name": "Acme Industries Pvt Ltd",
        "contact_name": "Priya Sharma",
        "role": "Head of AP",
        "contact_email": "priya@acme.example.com",
        "phone": "+91 98765 43210",
        "ap_volume_tier": "10-100cr",
        "sectors": ["pharma", "distribution"],
        "proof_channels": ["whatsapp", "email"],
        "biggest_blocker": "Our AP team can't keep up with 43B(h) deadlines "
        "because vendors send challans over WhatsApp and email with no "
        "structure.",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# POST /api/pilot/applications — happy path + validation
# ---------------------------------------------------------------------------
def test_post_happy_path_returns_201_with_id(client):
    resp = client.post("/api/pilot/applications", json=_valid_payload())
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert isinstance(body["id"], int) and body["id"] > 0
    assert body["company_name"] == "Acme Industries Pvt Ltd"
    assert body["contact_email"] == "priya@acme.example.com"
    assert body["sectors"] == ["pharma", "distribution"]
    assert body["proof_channels"] == ["whatsapp", "email"]
    assert "created_at" in body and body["created_at"]


def test_post_persists_row(client, SessionLocal):
    client.post("/api/pilot/applications", json=_valid_payload())
    s = SessionLocal()
    try:
        from app.models import PilotApplication

        rows = s.query(PilotApplication).all()
        assert len(rows) == 1
        row = rows[0]
        assert row.company_name == "Acme Industries Pvt Ltd"
        assert row.contact_email == "priya@acme.example.com"
        assert row.ap_volume_tier == "10-100cr"
        # JSON columns should round-trip as real Python lists.
        assert row.sectors == ["pharma", "distribution"]
        assert row.proof_channels == ["whatsapp", "email"]
    finally:
        s.close()


def test_post_accepts_optional_phone_null(client):
    payload = _valid_payload()
    payload.pop("phone")
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 201, resp.text
    assert resp.json()["phone"] is None


def test_post_missing_company_name_returns_422(client):
    payload = _valid_payload()
    payload.pop("company_name")
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 422


def test_post_missing_biggest_blocker_returns_422(client):
    payload = _valid_payload()
    payload.pop("biggest_blocker")
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 422


def test_post_invalid_email_returns_422(client):
    payload = _valid_payload(contact_email="not-an-email")
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 422


def test_post_invalid_ap_volume_tier_returns_422(client):
    payload = _valid_payload(ap_volume_tier="bazillion")
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 422


def test_post_invalid_sector_returns_422(client):
    payload = _valid_payload(sectors=["pharma", "not-a-real-sector"])
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 422


def test_post_empty_sectors_returns_422(client):
    payload = _valid_payload(sectors=[])
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 422


def test_post_biggest_blocker_too_long_returns_422(client):
    payload = _valid_payload(biggest_blocker="x" * 2001)
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Email notification
# ---------------------------------------------------------------------------
def test_post_sends_email_to_founders(client):
    from app.services.email import get_sent_emails

    resp = client.post("/api/pilot/applications", json=_valid_payload())
    assert resp.status_code == 201
    sent = get_sent_emails()
    # Should go to BOTH founder addresses (one send call per recipient).
    recipients = {e.to for e in sent}
    assert "loganmann@ucsb.edu" in recipients
    assert "arnavbhardwaj@berkeley.edu" in recipients
    # Subject line should include the company name so Gmail threading
    # groups them sensibly.
    assert any("Acme Industries Pvt Ltd" in e.subject for e in sent)


def test_post_still_201_when_email_fails(client, monkeypatch):
    """Email failures must never break the form — log and move on."""
    from app.services import email as email_mod

    def _boom(*_args, **_kwargs):
        raise RuntimeError("resend exploded")

    # Swap the module-level helper for a raising stub. The route should
    # catch this and still return 201.
    monkeypatch.setattr(email_mod, "get_email_provider", _boom)

    resp = client.post("/api/pilot/applications", json=_valid_payload())
    assert resp.status_code == 201, resp.text


# ---------------------------------------------------------------------------
# Rate limiting — 5 per hour per IP
# ---------------------------------------------------------------------------
def test_post_rate_limit_trips_on_sixth_request(client):
    payload = _valid_payload()
    for i in range(5):
        resp = client.post("/api/pilot/applications", json=payload)
        assert resp.status_code == 201, f"request #{i + 1} failed: {resp.text}"
    resp = client.post("/api/pilot/applications", json=payload)
    assert resp.status_code == 429
    body = resp.json()
    # FastAPI returns {"detail": "..."} for HTTPException.
    assert "detail" in body


def test_post_rate_limit_is_per_ip(client):
    """An unrelated IP should not be bucketed with the spammer."""
    payload = _valid_payload()
    # 5 hits from the default test client IP (127.0.0.1 via TestClient).
    for _ in range(5):
        assert client.post("/api/pilot/applications", json=payload).status_code == 201
    # Same client is now blocked.
    assert (
        client.post("/api/pilot/applications", json=payload).status_code == 429
    )
    # A forwarded IP is a different bucket.
    resp = client.post(
        "/api/pilot/applications",
        json=payload,
        headers={"X-Forwarded-For": "203.0.113.99"},
    )
    assert resp.status_code == 201, resp.text


# ---------------------------------------------------------------------------
# GET /api/pilot/applications — admin-token guarded
# ---------------------------------------------------------------------------
def test_get_without_token_returns_401(client):
    resp = client.get("/api/pilot/applications")
    assert resp.status_code == 401


def test_get_with_wrong_token_returns_401(client, admin_token):
    resp = client.get(
        "/api/pilot/applications", headers={"X-Admin-Token": "nope"}
    )
    assert resp.status_code == 401


def test_get_with_admin_token_returns_list(client, admin_token):
    # Seed two rows via the public POST.
    client.post(
        "/api/pilot/applications",
        json=_valid_payload(company_name="First Co"),
    )
    client.post(
        "/api/pilot/applications",
        json=_valid_payload(
            company_name="Second Co", contact_email="two@example.com"
        ),
    )
    resp = client.get(
        "/api/pilot/applications", headers={"X-Admin-Token": admin_token}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2
    names = {row["company_name"] for row in body}
    assert names == {"First Co", "Second Co"}
    # Every row should serialize the JSON list fields back to real lists.
    for row in body:
        assert isinstance(row["sectors"], list)
        assert isinstance(row["proof_channels"], list)


def test_get_is_not_configured_when_env_missing(client, monkeypatch):
    """If PILOT_ADMIN_TOKEN is unset the endpoint must not leak a bypass."""
    monkeypatch.delenv("PILOT_ADMIN_TOKEN", raising=False)
    resp = client.get(
        "/api/pilot/applications", headers={"X-Admin-Token": ""}
    )
    # Empty/missing token with unset env must still be 401 (not 200).
    assert resp.status_code == 401
