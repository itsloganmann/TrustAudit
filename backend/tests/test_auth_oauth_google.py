"""Tests for the Google OAuth provider and route.

Covers:
- ``verify_google_id_token`` — valid token, wrong aud, wrong iss, expired,
  bad signature, missing kid, unknown kid (triggers JWKS refetch).
- ``signin_with_google`` — first-signin creates user, second reuses,
  email-match links a new identity to an existing user, dangling identity
  recovery.
- Route-level smoke test via ``TestClient`` — happy path plus role mismatch.

The tests mock ``httpx.Client`` (used inside the google provider) so we
never hit Google during CI. We generate a real RSA keypair and sign a
real JWT so the path through ``jose.jwt`` exercises actual signature
verification.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwk, jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base

from app.auth.providers import google as google_mod
from app.auth.providers.google import (
    GoogleAuthError,
    GoogleNotConfigured,
    reset_jwks_cache,
    signin_with_google,
    verify_google_id_token,
)
from app.database import get_db
from app.models import User, UserIdentity


# ---------------------------------------------------------------------------
# RSA keypair + JWKS helpers
# ---------------------------------------------------------------------------
TEST_CLIENT_ID = "166888028367-86gi8h6lttlepkhl0ri7dqcllk53l8vk.apps.googleusercontent.com"
TEST_KID = "test-kid-1"


@pytest.fixture(scope="module")
def rsa_keypair():
    """Module-scoped RSA keypair so all tests share the same signing key."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    # Derive a JWK (dict form) from the public key via jose.
    public_jwk = jwk.construct(public_pem, algorithm="RS256").to_dict()
    public_jwk["kid"] = TEST_KID
    public_jwk["use"] = "sig"
    public_jwk["alg"] = "RS256"
    return {
        "private_pem": pem,
        "public_jwk": public_jwk,
    }


def _make_id_token(
    rsa_keypair,
    *,
    sub: str = "google-user-123",
    email: str = "user@example.com",
    email_verified: bool = True,
    name: str = "Example User",
    aud: str = TEST_CLIENT_ID,
    iss: str = "https://accounts.google.com",
    exp_seconds_from_now: int = 3600,
    kid: str = TEST_KID,
) -> str:
    now = int(time.time())
    claims: dict[str, Any] = {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "name": name,
        "picture": "https://example.com/avatar.png",
        "aud": aud,
        "iss": iss,
        "iat": now,
        "exp": now + exp_seconds_from_now,
    }
    token = jwt.encode(
        claims,
        rsa_keypair["private_pem"],
        algorithm="RS256",
        headers={"kid": kid},
    )
    return token


class _FakeHttpxResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> dict:
        return self._payload


class _FakeHttpxClient:
    def __init__(self, jwks_payload: dict):
        self._jwks_payload = jwks_payload
        self.get_calls = 0

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get(self, url: str) -> _FakeHttpxResponse:
        self.get_calls += 1
        return _FakeHttpxResponse(self._jwks_payload)


@pytest.fixture(autouse=True)
def _set_client_id_env():
    old = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    os.environ["GOOGLE_OAUTH_CLIENT_ID"] = TEST_CLIENT_ID
    reset_jwks_cache()
    yield
    reset_jwks_cache()
    if old is None:
        os.environ.pop("GOOGLE_OAUTH_CLIENT_ID", None)
    else:
        os.environ["GOOGLE_OAUTH_CLIENT_ID"] = old


@pytest.fixture()
def patched_jwks(rsa_keypair):
    """Replace httpx.Client in the google module with a fake that returns our JWK."""
    jwks_payload = {"keys": [rsa_keypair["public_jwk"]]}
    fake_client = _FakeHttpxClient(jwks_payload)

    def _factory(*a, **kw):
        return fake_client

    with patch.object(google_mod.httpx, "Client", _factory):
        yield fake_client


# ---------------------------------------------------------------------------
# verify_google_id_token — happy + sad paths
# ---------------------------------------------------------------------------
class TestVerifyGoogleIdToken:
    def test_verifies_valid_token(self, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair)
        claims = verify_google_id_token(token)
        assert claims["sub"] == "google-user-123"
        assert claims["email"] == "user@example.com"
        assert claims["iss"] == "https://accounts.google.com"
        assert claims["aud"] == TEST_CLIENT_ID

    def test_caches_jwks_between_calls(self, rsa_keypair, patched_jwks):
        token1 = _make_id_token(rsa_keypair)
        token2 = _make_id_token(rsa_keypair, sub="google-user-456", email="b@x.com")
        verify_google_id_token(token1)
        verify_google_id_token(token2)
        # Exactly one JWKS fetch thanks to the 1h cache.
        assert patched_jwks.get_calls == 1

    def test_accepts_bare_issuer(self, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair, iss="accounts.google.com")
        claims = verify_google_id_token(token)
        assert claims["iss"] == "accounts.google.com"

    def test_rejects_wrong_audience(self, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair, aud="someone-elses-client-id")
        with pytest.raises(GoogleAuthError):
            verify_google_id_token(token)

    def test_rejects_wrong_issuer(self, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair, iss="https://evil.example.com")
        with pytest.raises(GoogleAuthError):
            verify_google_id_token(token)

    def test_rejects_expired_token(self, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair, exp_seconds_from_now=-60)
        with pytest.raises(GoogleAuthError):
            verify_google_id_token(token)

    def test_rejects_bad_signature(self, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair)
        # Corrupt the signature
        head, payload, sig = token.split(".")
        corrupted = f"{head}.{payload}.{sig[:-4]}AAAA"
        with pytest.raises(GoogleAuthError):
            verify_google_id_token(corrupted)

    def test_rejects_missing_kid(self, rsa_keypair, patched_jwks):
        now = int(time.time())
        token = jwt.encode(
            {"sub": "x", "aud": TEST_CLIENT_ID, "iss": "https://accounts.google.com",
             "exp": now + 3600},
            rsa_keypair["private_pem"],
            algorithm="RS256",
            # no headers kwarg → no kid
        )
        with pytest.raises(GoogleAuthError):
            verify_google_id_token(token)

    def test_refetches_jwks_on_unknown_kid(self, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair, kid="rotated-kid-2")
        # Our fake JWKS only has TEST_KID, so this triggers a refetch (but still
        # won't find the rotated kid, so we expect failure).
        with pytest.raises(GoogleAuthError):
            verify_google_id_token(token)
        # We should have attempted at least two fetches (initial + forced).
        assert patched_jwks.get_calls >= 2

    def test_not_configured_raises_when_env_missing(self, rsa_keypair, patched_jwks):
        os.environ.pop("GOOGLE_OAUTH_CLIENT_ID", None)
        token = _make_id_token(rsa_keypair)
        with pytest.raises(GoogleNotConfigured):
            verify_google_id_token(token)

    def test_empty_token_raises(self, patched_jwks):
        with pytest.raises(GoogleAuthError):
            verify_google_id_token("")


# ---------------------------------------------------------------------------
# signin_with_google — upsert rules
# ---------------------------------------------------------------------------
class TestSigninWithGoogle:
    def test_first_signin_creates_user_and_identity(
        self, db_session, rsa_keypair, patched_jwks
    ):
        token = _make_id_token(rsa_keypair, sub="g-1", email="first@example.com")
        user, created = signin_with_google(db_session, token, default_role="vendor")
        assert created is True
        assert user.id is not None
        assert user.primary_email == "first@example.com"
        assert user.role == "vendor"
        assert user.email_verified is True

        identities = (
            db_session.query(UserIdentity)
            .filter(UserIdentity.user_id == user.id)
            .all()
        )
        assert len(identities) == 1
        assert identities[0].provider == "google"
        assert identities[0].provider_user_id == "g-1"
        assert identities[0].email == "first@example.com"

    def test_second_signin_reuses_existing_identity(
        self, db_session, rsa_keypair, patched_jwks
    ):
        token = _make_id_token(rsa_keypair, sub="g-2", email="second@example.com")
        user1, created1 = signin_with_google(db_session, token)
        user2, created2 = signin_with_google(db_session, token)
        assert created1 is True
        assert created2 is False
        assert user1.id == user2.id
        # Still only one identity row.
        identities = (
            db_session.query(UserIdentity)
            .filter(UserIdentity.user_id == user1.id)
            .all()
        )
        assert len(identities) == 1

    def test_email_match_with_password_account_is_rejected(
        self, db_session, rsa_keypair, patched_jwks
    ):
        """Adversary review 7926af6 #1 — auto-linking a Google identity to
        an existing password account is an account takeover vector. The
        provider must refuse and direct the user to sign in with password
        first, then link Google from settings.
        """
        existing = User(
            role="vendor",
            primary_email="linkme@example.com",
            email_verified=True,
        )
        db_session.add(existing)
        db_session.flush()
        # Pre-existing password identity is the strong-account anchor.
        db_session.add(
            UserIdentity(
                user_id=existing.id,
                provider="password",
                email="linkme@example.com",
            )
        )
        db_session.flush()

        token = _make_id_token(rsa_keypair, sub="g-3", email="linkme@example.com")
        with pytest.raises(GoogleAuthError, match="password sign-in"):
            signin_with_google(db_session, token)

        # No Google identity must have been created.
        google_identities = (
            db_session.query(UserIdentity)
            .filter(
                UserIdentity.user_id == existing.id,
                UserIdentity.provider == "google",
            )
            .all()
        )
        assert google_identities == []

    def test_email_match_without_password_requires_verified_on_both_sides(
        self, db_session, rsa_keypair, patched_jwks
    ):
        """Auto-link is allowed only when both Google AND TrustAudit have
        verified the email AND the existing account has no password
        identity.
        """
        existing = User(
            role="vendor",
            primary_email="linkok@example.com",
            email_verified=True,
        )
        db_session.add(existing)
        db_session.flush()
        existing_id = existing.id

        token = _make_id_token(
            rsa_keypair,
            sub="g-3-ok",
            email="linkok@example.com",
            email_verified=True,
        )
        user, created = signin_with_google(db_session, token)

        assert created is False
        assert user.id == existing_id

        google_identities = (
            db_session.query(UserIdentity)
            .filter(
                UserIdentity.user_id == existing_id,
                UserIdentity.provider == "google",
            )
            .all()
        )
        assert len(google_identities) == 1

    def test_email_match_unverified_google_is_rejected(
        self, db_session, rsa_keypair, patched_jwks
    ):
        existing = User(
            role="vendor",
            primary_email="unv@example.com",
            email_verified=True,
        )
        db_session.add(existing)
        db_session.flush()

        token = _make_id_token(
            rsa_keypair,
            sub="g-unv",
            email="unv@example.com",
            email_verified=False,
        )
        with pytest.raises(GoogleAuthError, match="not verified"):
            signin_with_google(db_session, token)

    def test_email_match_unverified_trustaudit_is_rejected(
        self, db_session, rsa_keypair, patched_jwks
    ):
        existing = User(
            role="vendor",
            primary_email="unv2@example.com",
            email_verified=False,
        )
        db_session.add(existing)
        db_session.flush()

        token = _make_id_token(
            rsa_keypair,
            sub="g-unv2",
            email="unv2@example.com",
            email_verified=True,
        )
        with pytest.raises(GoogleAuthError, match="not verified"):
            signin_with_google(db_session, token)

    def test_new_user_with_driver_role(self, db_session, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair, sub="g-4", email="driver@example.com")
        user, created = signin_with_google(db_session, token, default_role="driver")
        assert created is True
        assert user.role == "driver"

    def test_invalid_role_rejected(self, db_session, rsa_keypair, patched_jwks):
        token = _make_id_token(rsa_keypair, sub="g-5", email="x@example.com")
        with pytest.raises(GoogleAuthError):
            signin_with_google(db_session, token, default_role="hacker")


# ---------------------------------------------------------------------------
# Route-level happy path + role mismatch
# ---------------------------------------------------------------------------
@pytest.fixture()
def shared_engine():
    """A single in-memory SQLite engine shared across all connections in a test.

    ``StaticPool`` + ``sqlite://`` ensures every session reuses the same DB
    file (it only exists in memory), so ``db.commit()`` inside a route
    handler doesn't lose the schema.
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
    from app.routes.auth.oauth_google import router as google_router

    app = FastAPI()
    app.include_router(google_router, prefix="/api/auth")
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


class TestOAuthGoogleRoute:
    def test_happy_path_returns_user_and_sets_cookie(
        self, app_client, rsa_keypair, patched_jwks
    ):
        token = _make_id_token(rsa_keypair, sub="g-route-1", email="r1@example.com")
        response = app_client.post(
            "/api/auth/oauth/google",
            json={"id_token": token, "role": "vendor"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["user"]["email"] == "r1@example.com"
        assert body["user"]["role"] == "vendor"
        # Cookie set
        cookies = response.cookies
        assert "trustaudit_session" in cookies

    def test_role_mismatch_returns_403(
        self, app_client, rsa_keypair, patched_jwks
    ):
        """User signs up via Google as a driver, then later tries to sign
        in on the vendor page with the same Google identity. Step 2 of
        ``signin_with_google`` returns the existing user (existing
        identity short-circuit), and the route layer's role guard fires
        and returns 403 — the canonical wrong-page error path.
        """
        token = _make_id_token(rsa_keypair, sub="g-route-2", email="driver-rt@example.com")
        first = app_client.post(
            "/api/auth/oauth/google",
            json={"id_token": token, "role": "driver"},
        )
        assert first.status_code == 200, first.text

        second = app_client.post(
            "/api/auth/oauth/google",
            json={"id_token": token, "role": "vendor"},
        )
        assert second.status_code == 403
        assert "driver" in second.json()["detail"].lower()

    def test_link_to_password_account_returns_401(
        self, app_client, shared_session, rsa_keypair, patched_jwks
    ):
        """Adversary review 7926af6 #1 — Google sign-in must refuse to
        auto-link to an existing password account. The route should
        return 401 (not 200, not a session cookie).
        """
        existing = User(
            role="vendor",
            primary_email="hasppw@example.com",
            email_verified=True,
        )
        shared_session.add(existing)
        shared_session.flush()
        shared_session.add(
            UserIdentity(
                user_id=existing.id,
                provider="password",
                email="hasppw@example.com",
            )
        )
        shared_session.commit()

        token = _make_id_token(rsa_keypair, sub="g-takeover", email="hasppw@example.com")
        response = app_client.post(
            "/api/auth/oauth/google",
            json={"id_token": token, "role": "vendor"},
        )
        assert response.status_code == 401, response.text
        assert "trustaudit_session" not in response.cookies

    def test_invalid_token_returns_401(self, app_client, patched_jwks):
        response = app_client.post(
            "/api/auth/oauth/google",
            json={"id_token": "not-a-real-jwt", "role": "vendor"},
        )
        assert response.status_code == 401

    def test_not_configured_returns_503(self, app_client, rsa_keypair, patched_jwks):
        os.environ.pop("GOOGLE_OAUTH_CLIENT_ID", None)
        token = "anything"
        response = app_client.post(
            "/api/auth/oauth/google",
            json={"id_token": token, "role": "vendor"},
        )
        assert response.status_code == 503
