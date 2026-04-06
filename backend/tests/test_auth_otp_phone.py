"""Tests for phone SMS OTP provider and routes.

Two modes under test:

1. **Twilio Verify path** — ``TWILIO_VERIFY_SERVICE_SID`` set. We mock the
   httpx client to return Twilio-shaped responses and test that our
   request bodies, error handling, and approved/denied states all map
   correctly.

2. **Local-store fallback path** — no ``TWILIO_VERIFY_SERVICE_SID``, just
   ``TWILIO_PHONE_NUMBER``. Exercises ``generate_code``/``consume_code``
   against an in-memory SQLite DB. We also mock httpx for the outbound
   SMS call.

3. **Not-configured path** — no Twilio creds at all → provider raises
   ``PhoneOtpNotConfigured`` and the route returns 503.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.providers import phone_otp as phone_mod
from app.auth.providers.phone_otp import (
    InvalidPhoneOTP,
    PhoneOtpError,
    PhoneOtpNotConfigured,
    send_phone_otp,
    verify_phone_otp,
)
from app.database import Base, get_db
from app.models import User, UserIdentity, VerificationCode
from app.services import rate_limit as rl


CODE_RE = re.compile(r"\b(\d{6})\b")


# ---------------------------------------------------------------------------
# Fake httpx — shared across modes
# ---------------------------------------------------------------------------
class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, response_map: dict, captured_calls: list):
        self._map = response_map
        self._calls = captured_calls

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url: str, data: dict | None = None):
        self._calls.append({"url": url, "data": data or {}})
        for needle, resp in self._map.items():
            if needle in url:
                return resp
        return _FakeResponse({"error": "not mocked"}, status_code=500)


# ---------------------------------------------------------------------------
# Fixtures
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
def shared_session(shared_engine):
    SessionLocal = sessionmaker(bind=shared_engine, autoflush=False, autocommit=False)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _reset_twilio_env():
    keys = [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_VERIFY_SERVICE_SID",
        "TWILIO_PHONE_NUMBER",
    ]
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ.pop(k, None)
    rl.reset_rate_limit_state()
    yield
    rl.reset_rate_limit_state()
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


# ---------------------------------------------------------------------------
# Not-configured path
# ---------------------------------------------------------------------------
class TestPhoneOtpNotConfigured:
    def test_send_raises_when_creds_missing(self, shared_session):
        with pytest.raises(PhoneOtpNotConfigured):
            send_phone_otp(shared_session, "+919999999999")

    def test_verify_raises_when_creds_missing(self, shared_session):
        with pytest.raises(PhoneOtpNotConfigured):
            verify_phone_otp(shared_session, "+919999999999", "123456")


# ---------------------------------------------------------------------------
# Twilio Verify path
# ---------------------------------------------------------------------------
class TestTwilioVerifyPath:
    def _configure_verify(self):
        os.environ["TWILIO_ACCOUNT_SID"] = "ACtest"
        os.environ["TWILIO_AUTH_TOKEN"] = "tok"
        os.environ["TWILIO_VERIFY_SERVICE_SID"] = "VAtest"

    def test_send_calls_verify_api(self, shared_session):
        self._configure_verify()
        calls = []
        fake = _FakeClient(
            {"/Verifications": _FakeResponse({"sid": "VE123", "status": "pending"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            transport = send_phone_otp(shared_session, "+919999999999")
        assert transport == "twilio_verify"
        assert len(calls) == 1
        assert "/Verifications" in calls[0]["url"]
        assert calls[0]["data"]["To"] == "+919999999999"
        assert calls[0]["data"]["Channel"] == "sms"

    def test_verify_approved(self, shared_session):
        self._configure_verify()
        calls = []
        fake = _FakeClient(
            {"/VerificationCheck": _FakeResponse({"status": "approved"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            user, created = verify_phone_otp(
                shared_session, "+919999999999", "123456", default_role="vendor"
            )
        assert created is True
        assert user.primary_phone_e164 == "+919999999999"
        assert user.phone_verified is True
        identities = (
            shared_session.query(UserIdentity)
            .filter(UserIdentity.user_id == user.id)
            .all()
        )
        assert len(identities) == 1
        assert identities[0].provider == "phone_otp"

    def test_verify_denied(self, shared_session):
        self._configure_verify()
        calls = []
        fake = _FakeClient(
            {"/VerificationCheck": _FakeResponse({"status": "pending"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            with pytest.raises(InvalidPhoneOTP):
                verify_phone_otp(shared_session, "+919999999999", "000000")

    def test_verify_twilio_http_error(self, shared_session):
        self._configure_verify()
        calls = []
        fake = _FakeClient(
            {"/VerificationCheck": _FakeResponse({"code": 20404}, status_code=404)},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            with pytest.raises(InvalidPhoneOTP):
                verify_phone_otp(shared_session, "+919999999999", "000000")

    def test_send_twilio_error_raises(self, shared_session):
        self._configure_verify()
        calls = []
        fake = _FakeClient(
            {"/Verifications": _FakeResponse({"code": 20003}, status_code=401)},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            with pytest.raises(PhoneOtpError):
                send_phone_otp(shared_session, "+919999999999")


# ---------------------------------------------------------------------------
# Twilio Messages fallback path
# ---------------------------------------------------------------------------
class TestTwilioMessagesFallbackPath:
    def _configure_sms(self):
        os.environ["TWILIO_ACCOUNT_SID"] = "ACtest"
        os.environ["TWILIO_AUTH_TOKEN"] = "tok"
        os.environ["TWILIO_PHONE_NUMBER"] = "+18005550123"

    def test_send_generates_local_code_and_calls_messages_api(self, shared_session):
        self._configure_sms()
        calls = []
        fake = _FakeClient(
            {"/Messages.json": _FakeResponse({"sid": "SM123", "status": "queued"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            transport = send_phone_otp(shared_session, "+919999998888")
        assert transport == "twilio_sms"
        # Row written to verification_codes
        rows = (
            shared_session.query(VerificationCode)
            .filter(VerificationCode.destination == "+919999998888")
            .all()
        )
        assert len(rows) == 1
        assert rows[0].channel == "sms"
        assert rows[0].purpose == "phone_otp"
        # Body contained a 6-digit code
        assert len(calls) == 1
        body = calls[0]["data"]["Body"]
        m = CODE_RE.search(body)
        assert m is not None

    def test_verify_against_local_store_happy_path(self, shared_session):
        self._configure_sms()
        calls = []
        fake = _FakeClient(
            {"/Messages.json": _FakeResponse({"sid": "SM123", "status": "queued"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            send_phone_otp(shared_session, "+919999997777")
            shared_session.flush()

        # Pull the code out of the sent body
        body = calls[0]["data"]["Body"]
        code = CODE_RE.search(body).group(1)

        user, created = verify_phone_otp(
            shared_session, "+919999997777", code, default_role="driver"
        )
        assert created is True
        assert user.role == "driver"
        assert user.primary_phone_e164 == "+919999997777"

    def test_verify_wrong_code_fails(self, shared_session):
        self._configure_sms()
        calls = []
        fake = _FakeClient(
            {"/Messages.json": _FakeResponse({"sid": "SM123", "status": "queued"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            send_phone_otp(shared_session, "+919999996666")
            shared_session.flush()
        with pytest.raises(InvalidPhoneOTP):
            verify_phone_otp(shared_session, "+919999996666", "000000")


# ---------------------------------------------------------------------------
# Route-level smoke tests (uses local-store fallback for simplicity)
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


class TestPhoneOtpRoutes:
    def test_send_not_configured_returns_503(self, app_client):
        r = app_client.post(
            "/api/auth/otp/phone/send",
            json={"phone": "+919999900000", "role": "vendor"},
        )
        assert r.status_code == 503

    def test_send_happy_path_with_sms_fallback(self, app_client):
        os.environ["TWILIO_ACCOUNT_SID"] = "ACtest"
        os.environ["TWILIO_AUTH_TOKEN"] = "tok"
        os.environ["TWILIO_PHONE_NUMBER"] = "+18005550123"

        calls = []
        fake = _FakeClient(
            {"/Messages.json": _FakeResponse({"sid": "SM", "status": "queued"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            r = app_client.post(
                "/api/auth/otp/phone/send",
                json={"phone": "+919998880000", "role": "vendor"},
            )
            assert r.status_code == 200, r.text

            # Pull the code from the outgoing body
            body = calls[0]["data"]["Body"]
            code = CODE_RE.search(body).group(1)

            r2 = app_client.post(
                "/api/auth/otp/phone/verify",
                json={"phone": "+919998880000", "code": code, "role": "vendor"},
            )
            assert r2.status_code == 200, r2.text
            assert "trustaudit_session" in r2.cookies

    def test_send_rate_limited(self, app_client):
        os.environ["TWILIO_ACCOUNT_SID"] = "ACtest"
        os.environ["TWILIO_AUTH_TOKEN"] = "tok"
        os.environ["TWILIO_PHONE_NUMBER"] = "+18005550123"

        calls = []
        fake = _FakeClient(
            {"/Messages.json": _FakeResponse({"sid": "SM", "status": "queued"})},
            calls,
        )
        with patch.object(phone_mod.httpx, "Client", lambda *a, **k: fake):
            for _ in range(5):
                r = app_client.post(
                    "/api/auth/otp/phone/send",
                    json={"phone": "+919998885555", "role": "vendor"},
                )
                assert r.status_code == 200
            r6 = app_client.post(
                "/api/auth/otp/phone/send",
                json={"phone": "+919998885555", "role": "vendor"},
            )
            assert r6.status_code == 429
