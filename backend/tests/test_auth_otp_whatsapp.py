"""Tests for WhatsApp OTP provider and routes.

Covers:
- ``send_whatsapp_otp`` — generates a code, sends it via the mock WhatsApp
  provider, persists a ``verification_codes`` row.
- ``verify_whatsapp_otp`` — succeeds with the correct code, creates user
  and identity, fails with wrong code, fails after expiry, fails after
  the 5-attempt cap is hit.
- Route smoke tests — send/verify endpoints, rate limiting.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.providers.whatsapp_otp import (
    InvalidOTP,
    send_whatsapp_otp,
    verify_whatsapp_otp,
)
from app.database import Base, get_db
from app.models import User, UserIdentity, VerificationCode
from app.services import rate_limit as rl
from app.services.whatsapp import SENT_MESSAGES, reset_mock_state


CODE_RE = re.compile(r"\b(\d{6})\b")


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
def shared_session(shared_engine):
    SessionLocal = sessionmaker(bind=shared_engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _reset_state():
    """Force the mock WhatsApp provider and clear rate-limit buckets."""
    os.environ.pop("WHATSAPP_PROVIDER", None)  # default → mock
    from app.services.whatsapp import reset_provider_cache
    reset_provider_cache()
    reset_mock_state()
    rl.reset_rate_limit_state()
    yield
    reset_mock_state()
    rl.reset_rate_limit_state()
    reset_provider_cache()


def _last_sent_code(phone: str) -> Optional[str]:
    """Pull the most recent 6-digit code sent to a phone from mock state."""
    for msg in reversed(SENT_MESSAGES):
        if msg["to"] == phone:
            m = CODE_RE.search(msg["body"])
            if m:
                return m.group(1)
    return None


# ---------------------------------------------------------------------------
# Provider-level tests
# ---------------------------------------------------------------------------
class TestSendWhatsAppOtp:
    def test_send_creates_row_and_sends_message(self, shared_session):
        phone = "+919999999999"
        send_whatsapp_otp(shared_session, phone)
        shared_session.flush()

        rows = (
            shared_session.query(VerificationCode)
            .filter(
                VerificationCode.destination == phone,
                VerificationCode.channel == "whatsapp",
            )
            .all()
        )
        assert len(rows) == 1
        assert rows[0].purpose == "whatsapp_otp"
        assert rows[0].code_hash != ""
        # Message was dispatched via the mock provider.
        assert len(SENT_MESSAGES) == 1
        assert SENT_MESSAGES[0]["to"] == phone
        assert "TrustAudit" in SENT_MESSAGES[0]["body"]

    def test_send_rejects_non_e164(self, shared_session):
        with pytest.raises(InvalidOTP):
            send_whatsapp_otp(shared_session, "9999999999")

    def test_send_rejects_too_short(self, shared_session):
        with pytest.raises(InvalidOTP):
            send_whatsapp_otp(shared_session, "+99")


class TestVerifyWhatsAppOtp:
    def test_verify_success_creates_user(self, shared_session):
        phone = "+919999999999"
        send_whatsapp_otp(shared_session, phone)
        shared_session.flush()
        code = _last_sent_code(phone)
        assert code is not None

        user, created = verify_whatsapp_otp(shared_session, phone, code, default_role="driver")
        assert created is True
        assert user.primary_phone_e164 == phone
        assert user.phone_verified is True
        assert user.role == "driver"

        identities = (
            shared_session.query(UserIdentity)
            .filter(UserIdentity.user_id == user.id)
            .all()
        )
        assert len(identities) == 1
        assert identities[0].provider == "whatsapp_otp"

    def test_verify_second_time_same_code_fails(self, shared_session):
        phone = "+919999991111"
        send_whatsapp_otp(shared_session, phone)
        shared_session.flush()
        code = _last_sent_code(phone)
        # First consume succeeds
        verify_whatsapp_otp(shared_session, phone, code)
        # Second attempt with the now-consumed code fails
        with pytest.raises(InvalidOTP):
            verify_whatsapp_otp(shared_session, phone, code)

    def test_verify_wrong_code_fails(self, shared_session):
        phone = "+919999992222"
        send_whatsapp_otp(shared_session, phone)
        shared_session.flush()
        with pytest.raises(InvalidOTP):
            verify_whatsapp_otp(shared_session, phone, "000000")

    def test_verify_rejects_wrong_destination(self, shared_session):
        phone_a = "+919999993333"
        phone_b = "+919999994444"
        send_whatsapp_otp(shared_session, phone_a)
        shared_session.flush()
        code = _last_sent_code(phone_a)
        with pytest.raises(InvalidOTP):
            verify_whatsapp_otp(shared_session, phone_b, code)

    def test_verify_after_expiry_fails(self, shared_session):
        phone = "+919999995555"
        send_whatsapp_otp(shared_session, phone)
        shared_session.flush()
        code = _last_sent_code(phone)
        # Manually expire by rewriting expires_at to the past.
        row = (
            shared_session.query(VerificationCode)
            .filter(VerificationCode.destination == phone)
            .one()
        )
        row.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
        shared_session.add(row)
        shared_session.flush()

        with pytest.raises(InvalidOTP):
            verify_whatsapp_otp(shared_session, phone, code)

    def test_attempts_cap_after_five_wrong(self, shared_session):
        phone = "+919999996666"
        send_whatsapp_otp(shared_session, phone)
        shared_session.flush()
        # Five wrong attempts bump the counter to 5.
        for _ in range(5):
            with pytest.raises(InvalidOTP):
                verify_whatsapp_otp(shared_session, phone, "000000")
        # Now even the correct code should fail because attempts >= MAX.
        code = _last_sent_code(phone)
        with pytest.raises(InvalidOTP):
            verify_whatsapp_otp(shared_session, phone, code)

    def test_existing_user_phone_verified_flag_flipped(self, shared_session):
        phone = "+919999997777"
        existing = User(
            role="driver",
            primary_phone_e164=phone,
            phone_verified=False,
        )
        shared_session.add(existing)
        shared_session.flush()

        send_whatsapp_otp(shared_session, phone)
        shared_session.flush()
        code = _last_sent_code(phone)
        user, created = verify_whatsapp_otp(shared_session, phone, code)
        assert created is False
        assert user.id == existing.id
        assert user.phone_verified is True


# ---------------------------------------------------------------------------
# Route-level smoke tests
# ---------------------------------------------------------------------------
@pytest.fixture()
def app_client(shared_engine, shared_session):
    from app.routes.auth.otp import router as otp_router

    app = FastAPI()
    app.include_router(otp_router, prefix="/api/auth")
    SessionLocal = sessionmaker(bind=shared_engine, autoflush=False, autocommit=False)

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as client:
        yield client


class TestWhatsAppOtpRoutes:
    def test_send_then_verify_happy_path(self, app_client):
        phone = "+919998887777"
        r1 = app_client.post(
            "/api/auth/otp/whatsapp/send",
            json={"phone": phone, "role": "driver"},
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["ok"] is True

        code = _last_sent_code(phone)
        assert code is not None

        r2 = app_client.post(
            "/api/auth/otp/whatsapp/verify",
            json={"phone": phone, "code": code, "role": "driver"},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["user"]["phone"] == phone
        assert r2.json()["user"]["role"] == "driver"
        assert "trustaudit_session" in r2.cookies

    def test_verify_wrong_code_returns_401(self, app_client):
        phone = "+919998887000"
        app_client.post(
            "/api/auth/otp/whatsapp/send",
            json={"phone": phone, "role": "vendor"},
        )
        r = app_client.post(
            "/api/auth/otp/whatsapp/verify",
            json={"phone": phone, "code": "000000", "role": "vendor"},
        )
        assert r.status_code == 401

    def test_send_rate_limited_at_5_per_minute(self, app_client):
        phone = "+919998886000"
        # 5 sends should pass, the 6th should be rate-limited.
        for _ in range(5):
            r = app_client.post(
                "/api/auth/otp/whatsapp/send",
                json={"phone": phone, "role": "vendor"},
            )
            assert r.status_code == 200
        r6 = app_client.post(
            "/api/auth/otp/whatsapp/send",
            json={"phone": phone, "role": "vendor"},
        )
        assert r6.status_code == 429
