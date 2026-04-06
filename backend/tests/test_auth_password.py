"""Tests for password-based auth (signup + signin + rate limiting + roles).

Uses the in-memory SQLite ``db_session`` fixture from ``conftest.py``.
Exercises both the provider layer and the FastAPI routes via
``TestClient`` with a dependency-override on ``get_db``.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
import app.models  # noqa: F401 — register tables on Base
from app.auth.passwords import hash_password, verify_password
from app.auth.providers.password import (
    EmailAlreadyExists,
    EmailNotVerified,
    InvalidCredentials,
    SigninRequest,
    SignupRequest,
    WeakPasswordError,
    WrongRoleError,
    signin,
    signup,
)
from app.database import get_db
from app.models import User, UserIdentity, VerificationCode
from app.routes.auth import router as auth_router
from app.services import rate_limit as rl
from app.services.email import reset_email_provider, reset_mock_inbox, get_sent_emails


# ---------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _reset_state():
    """Clear rate-limit buckets and mock email inbox between tests."""
    rl.reset_rate_limit_state()
    reset_mock_inbox()
    reset_email_provider()
    yield
    rl.reset_rate_limit_state()
    reset_mock_inbox()
    reset_email_provider()


@pytest.fixture()
def shared_engine():
    """A single-connection in-memory SQLite engine shared across threads.

    TestClient runs handler code in a separate thread, so we need
    ``StaticPool`` to make the in-memory DB persist across connections
    (by actually only ever using one connection).
    """
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
def app_client(shared_engine, shared_session):
    """A TestClient with ``get_db`` overridden to yield a session on the shared engine."""
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
# passwords module — lowest-level sanity
# ---------------------------------------------------------------------
class TestPasswordHashing:
    def test_hash_then_verify_roundtrip(self):
        raw = "correct horse battery staple"
        hashed = hash_password(raw)
        assert hashed != raw
        assert hashed.startswith("$2")  # bcrypt identifier
        assert verify_password(raw, hashed) is True
        assert verify_password("wrong", hashed) is False

    def test_hash_empty_raises(self):
        with pytest.raises(ValueError):
            hash_password("")

    def test_verify_with_no_hash_returns_false(self):
        assert verify_password("anything", None) is False
        assert verify_password("anything", "") is False

    def test_verify_accepts_sha256_dev_fallback(self):
        import hashlib
        dev_hash = "sha256-dev$" + hashlib.sha256(b"demo").hexdigest()
        assert verify_password("demo", dev_hash) is True
        assert verify_password("not-demo", dev_hash) is False


# ---------------------------------------------------------------------
# provider.signup
# ---------------------------------------------------------------------
class TestProviderSignup:
    def test_signup_creates_user_identity_and_verification_code(self, db_session):
        user = signup(
            db_session,
            SignupRequest(
                email="Alice@Example.com",
                password="supersecret1",
                full_name="Alice Example",
                role="vendor",
            ),
        )
        # User fields
        assert user.id is not None
        assert user.role == "vendor"
        assert user.primary_email == "alice@example.com"  # normalized
        assert user.full_name == "Alice Example"
        assert user.email_verified is False
        assert user.pwd_hash is not None and user.pwd_hash.startswith("$2")

        # Identity row
        ident = (
            db_session.query(UserIdentity)
            .filter_by(user_id=user.id, provider="password")
            .one()
        )
        assert ident.email == "alice@example.com"

        # Verification code row
        codes = (
            db_session.query(VerificationCode)
            .filter_by(user_id=user.id, purpose="email_verify")
            .all()
        )
        assert len(codes) == 1
        # Hash is stored — not the raw token.
        assert len(codes[0].code_hash) == 64
        assert codes[0].consumed_at is None

        # Mock email was sent with the verification link.
        sent = get_sent_emails()
        assert len(sent) == 1
        assert sent[0].to == "alice@example.com"
        assert "verify" in sent[0].subject.lower()
        assert "/auth/verify-email?token=" in sent[0].html

    def test_signup_duplicate_email_raises(self, db_session):
        req = SignupRequest(
            email="dup@example.com",
            password="password1",
            full_name="Dup",
            role="vendor",
        )
        signup(db_session, req)
        with pytest.raises(EmailAlreadyExists):
            signup(db_session, req)

    def test_signup_weak_password_rejected(self, db_session):
        with pytest.raises(WeakPasswordError):
            signup(
                db_session,
                SignupRequest(
                    email="short@example.com",
                    password="1234567",  # 7 chars
                    full_name="Short",
                    role="vendor",
                ),
            )


# ---------------------------------------------------------------------
# provider.signin
# ---------------------------------------------------------------------
class TestProviderSignin:
    def _signup(self, db, role="vendor", verified=True):
        user = signup(
            db,
            SignupRequest(
                email=f"{role}@example.com",
                password="password1",
                full_name=f"{role.title()} User",
                role=role,
            ),
        )
        if verified:
            user.email_verified = True
            db.add(user)
            db.flush()
        return user

    def test_signin_success_after_verification(self, db_session):
        self._signup(db_session)
        u = signin(
            db_session,
            SigninRequest(email="vendor@example.com", password="password1", role="vendor"),
        )
        assert u.role == "vendor"

    def test_signin_before_email_verified_rejected(self, db_session):
        self._signup(db_session, verified=False)
        with pytest.raises(EmailNotVerified):
            signin(
                db_session,
                SigninRequest(
                    email="vendor@example.com",
                    password="password1",
                    role="vendor",
                ),
            )

    def test_signin_wrong_password_rejected(self, db_session):
        self._signup(db_session)
        with pytest.raises(InvalidCredentials):
            signin(
                db_session,
                SigninRequest(
                    email="vendor@example.com",
                    password="not-the-password",
                    role="vendor",
                ),
            )

    def test_signin_nonexistent_user_rejected(self, db_session):
        with pytest.raises(InvalidCredentials):
            signin(
                db_session,
                SigninRequest(
                    email="ghost@example.com", password="whatever", role="vendor"
                ),
            )

    def test_signin_wrong_role_rejected(self, db_session):
        self._signup(db_session, role="driver")
        with pytest.raises(WrongRoleError):
            signin(
                db_session,
                SigninRequest(
                    email="driver@example.com",
                    password="password1",
                    role="vendor",
                ),
            )


# ---------------------------------------------------------------------
# HTTP route integration tests
# ---------------------------------------------------------------------
class TestRoutes:
    def test_vendor_signup_happy_path(self, app_client, shared_session):
        resp = app_client.post(
            "/api/auth/vendor/signup",
            json={
                "email": "cfo@bharat.demo",
                "password": "longpassword1",
                "full_name": "CFO Demo",
            },
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["role"] == "vendor"
        assert data["email_verified"] is False
        # DB side effect — expire so we read fresh from DB after the route commit.
        shared_session.expire_all()
        assert (
            shared_session.query(User)
            .filter_by(primary_email="cfo@bharat.demo")
            .count()
            == 1
        )

    def test_duplicate_signup_returns_409(self, app_client):
        payload = {
            "email": "dup@bharat.demo",
            "password": "longpassword1",
            "full_name": "Dup",
        }
        first = app_client.post("/api/auth/vendor/signup", json=payload)
        assert first.status_code == 201
        second = app_client.post("/api/auth/vendor/signup", json=payload)
        assert second.status_code == 409

    def test_signup_weak_password_returns_422(self, app_client):
        resp = app_client.post(
            "/api/auth/vendor/signup",
            json={
                "email": "short@bharat.demo",
                "password": "short",
                "full_name": "Short",
            },
        )
        assert resp.status_code == 422

    def test_signin_before_verify_returns_409(self, app_client):
        app_client.post(
            "/api/auth/vendor/signup",
            json={
                "email": "unverified@bharat.demo",
                "password": "longpassword1",
                "full_name": "Unverified",
            },
        )
        resp = app_client.post(
            "/api/auth/vendor/signin",
            json={"email": "unverified@bharat.demo", "password": "longpassword1"},
        )
        assert resp.status_code == 409

    def test_signin_sets_cookie_and_me_returns_user(self, app_client, shared_session):
        # Signup
        app_client.post(
            "/api/auth/vendor/signup",
            json={
                "email": "alice@bharat.demo",
                "password": "longpassword1",
                "full_name": "Alice",
            },
        )
        # Mark verified directly (no verify-email HTTP hop here).
        shared_session.expire_all()
        user = (
            shared_session.query(User)
            .filter_by(primary_email="alice@bharat.demo")
            .one()
        )
        user.email_verified = True
        shared_session.add(user)
        shared_session.commit()

        resp = app_client.post(
            "/api/auth/vendor/signin",
            json={"email": "alice@bharat.demo", "password": "longpassword1"},
        )
        assert resp.status_code == 200, resp.text
        assert "trustaudit_session" in resp.cookies
        assert resp.json()["user"]["role"] == "vendor"

        # /me with the cookie should return the same user
        me = app_client.get("/api/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == "alice@bharat.demo"

    def test_signout_revokes_session(self, app_client, shared_session):
        # Signup + verify + signin
        app_client.post(
            "/api/auth/vendor/signup",
            json={
                "email": "bob@bharat.demo",
                "password": "longpassword1",
                "full_name": "Bob",
            },
        )
        shared_session.expire_all()
        user = (
            shared_session.query(User)
            .filter_by(primary_email="bob@bharat.demo")
            .one()
        )
        user.email_verified = True
        shared_session.add(user)
        shared_session.commit()

        signin_resp = app_client.post(
            "/api/auth/vendor/signin",
            json={"email": "bob@bharat.demo", "password": "longpassword1"},
        )
        assert signin_resp.status_code == 200

        signout_resp = app_client.post("/api/auth/signout")
        assert signout_resp.status_code == 200
        assert signout_resp.json()["signed_out"] is True

        # /me should now 401 — the session cookie was cleared and the row revoked.
        me = app_client.get("/api/auth/me")
        assert me.status_code == 401

    def test_wrong_role_signin_returns_401(self, app_client, shared_session):
        """Adversary 7926af6 #13 — wrong-role signin must collapse into
        the same 401 as a bad password so the endpoint isn't a
        password-correctness oracle for accounts in the *other* role.
        """
        app_client.post(
            "/api/auth/driver/signup",
            json={
                "email": "driver@bharat.demo",
                "password": "longpassword1",
                "full_name": "Driver",
            },
        )
        shared_session.expire_all()
        user = (
            shared_session.query(User)
            .filter_by(primary_email="driver@bharat.demo")
            .one()
        )
        user.email_verified = True
        shared_session.add(user)
        shared_session.commit()

        # Attempt to sign in on the vendor endpoint — collapses to 401
        # so an attacker can't use this as a "valid password / wrong
        # role" oracle.
        resp = app_client.post(
            "/api/auth/vendor/signin",
            json={"email": "driver@bharat.demo", "password": "longpassword1"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid email or password"
