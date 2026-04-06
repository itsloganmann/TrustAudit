"""Tests for the email magic-link provider and routes."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.providers.email_magic import (
    InvalidMagicLinkToken,
    WrongRoleError,
    consume_magic_link,
    request_magic_link,
)
from app.auth.providers.password import InvalidRoleError
from app.auth.tokens import generate_code
from app.database import Base, get_db
import app.models  # noqa: F401 — register tables on Base
from app.models import User, UserIdentity, VerificationCode
from app.routes.auth import router as auth_router
from app.services import rate_limit as rl
from app.services.email import (
    get_sent_emails,
    reset_email_provider,
    reset_mock_inbox,
)


# ---------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _reset_state():
    rl.reset_rate_limit_state()
    reset_mock_inbox()
    reset_email_provider()
    yield
    rl.reset_rate_limit_state()
    reset_mock_inbox()
    reset_email_provider()


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


@pytest.fixture()
def app_client(shared_engine):
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/auth")
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


# ---------------------------------------------------------------------
# Provider-level tests
# ---------------------------------------------------------------------
class TestRequestMagicLink:
    def test_request_creates_user_code_and_sends_email(self, shared_session):
        request_magic_link(shared_session, "new@bharat.demo", "vendor")
        shared_session.commit()

        # New user created with the requested role.
        user = (
            shared_session.query(User)
            .filter_by(primary_email="new@bharat.demo")
            .one()
        )
        assert user.role == "vendor"
        assert user.email_verified is False

        # Verification code row exists.
        code_row = (
            shared_session.query(VerificationCode)
            .filter_by(purpose="email_magic", destination="new@bharat.demo")
            .one()
        )
        assert code_row.consumed_at is None
        assert len(code_row.code_hash) == 64  # sha256 hex

        # Mock email sent with the magic-link URL.
        sent = get_sent_emails()
        assert len(sent) == 1
        assert sent[0].to == "new@bharat.demo"
        assert "/auth/magic/consume?token=" in sent[0].html

    def test_request_existing_user_same_role_reuses(self, shared_session):
        request_magic_link(shared_session, "same@bharat.demo", "vendor")
        shared_session.commit()
        request_magic_link(shared_session, "same@bharat.demo", "vendor")
        shared_session.commit()

        users = (
            shared_session.query(User)
            .filter_by(primary_email="same@bharat.demo")
            .all()
        )
        assert len(users) == 1  # not duplicated

        codes = (
            shared_session.query(VerificationCode)
            .filter_by(purpose="email_magic", destination="same@bharat.demo")
            .all()
        )
        assert len(codes) == 2  # one per request

    def test_request_wrong_role_raises(self, shared_session):
        request_magic_link(shared_session, "mix@bharat.demo", "vendor")
        shared_session.commit()
        with pytest.raises(WrongRoleError):
            request_magic_link(shared_session, "mix@bharat.demo", "driver")

    def test_request_invalid_role_raises(self, shared_session):
        with pytest.raises(InvalidRoleError):
            request_magic_link(shared_session, "x@bharat.demo", "admin")


# ---------------------------------------------------------------------
# consume_magic_link
# ---------------------------------------------------------------------
class TestConsumeMagicLink:
    def _issue(self, db, email="user@bharat.demo", role="vendor"):
        # Create user + generate code directly to capture the raw token.
        user = User(role=role, primary_email=email, email_verified=False)
        db.add(user)
        db.flush()
        raw = generate_code(
            db,
            user=user,
            channel="email",
            destination=email,
            purpose="email_magic",
        )
        db.commit()
        return user, raw

    def test_consume_valid_token_verifies_email_and_creates_identity(
        self, shared_session
    ):
        user, raw = self._issue(shared_session)

        signed_in = consume_magic_link(shared_session, raw)
        shared_session.commit()

        assert signed_in.id == user.id
        assert signed_in.email_verified is True

        ident = (
            shared_session.query(UserIdentity)
            .filter_by(user_id=user.id, provider="email_magic")
            .one()
        )
        assert ident.email == user.primary_email

    def test_consume_unknown_token_raises(self, shared_session):
        with pytest.raises(InvalidMagicLinkToken):
            consume_magic_link(shared_session, "not-a-real-token-1234")

    def test_consume_already_consumed_raises(self, shared_session):
        _user, raw = self._issue(shared_session)
        consume_magic_link(shared_session, raw)
        shared_session.commit()
        with pytest.raises(InvalidMagicLinkToken):
            consume_magic_link(shared_session, raw)

    def test_consume_expired_raises(self, shared_session):
        user, raw = self._issue(shared_session)
        # Age the row out of its window.
        row = (
            shared_session.query(VerificationCode)
            .filter_by(user_id=user.id, purpose="email_magic")
            .one()
        )
        row.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
            minutes=5
        )
        shared_session.add(row)
        shared_session.commit()
        with pytest.raises(InvalidMagicLinkToken):
            consume_magic_link(shared_session, raw)


# ---------------------------------------------------------------------
# HTTP route integration
# ---------------------------------------------------------------------
class TestMagicLinkRoutes:
    def test_request_happy_path(self, app_client):
        resp = app_client.post(
            "/api/auth/magic/request",
            json={"email": "alice@bharat.demo", "role": "vendor"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["sent"] is True
        assert len(get_sent_emails()) == 1

    def test_request_invalid_role_422(self, app_client):
        resp = app_client.post(
            "/api/auth/magic/request",
            json={"email": "alice@bharat.demo", "role": "admin"},
        )
        # Pydantic pattern validator returns 422.
        assert resp.status_code == 422

    def test_consume_endpoint_sets_session_cookie(self, app_client, shared_session):
        # Request a magic link for a brand-new email.
        app_client.post(
            "/api/auth/magic/request",
            json={"email": "click@bharat.demo", "role": "vendor"},
        )
        # Retrieve the raw token by regenerating one ourselves — the mock
        # provider never stores the raw token, only the hash, so we issue
        # a fresh code directly via the provider layer.
        shared_session.expire_all()
        user = (
            shared_session.query(User)
            .filter_by(primary_email="click@bharat.demo")
            .one()
        )
        raw = generate_code(
            shared_session,
            user=user,
            channel="email",
            destination="click@bharat.demo",
            purpose="email_magic",
        )
        shared_session.commit()

        resp = app_client.get(f"/api/auth/magic/consume?token={raw}")
        assert resp.status_code == 200, resp.text
        assert "trustaudit_session" in resp.cookies
        assert resp.json()["user"]["email"] == "click@bharat.demo"

        # /me works with the session cookie.
        me = app_client.get("/api/auth/me")
        assert me.status_code == 200
        assert me.json()["email_verified"] is True

    def test_consume_bad_token_400(self, app_client):
        resp = app_client.get("/api/auth/magic/consume?token=definitely-bad-token")
        assert resp.status_code == 400
