"""Tests for the Facebook OAuth provider and route.

Since the production Facebook app isn't configured yet (no ``FACEBOOK_APP_ID``),
the primary contract we test is **graceful degradation**: provider raises
``FacebookNotConfigured`` when the env var is missing, and the route
returns 503 with a clear message.

We also exercise the ``/me`` fallback path by mocking ``httpx`` so the
happy-path upsert logic is covered even without real Facebook credentials.
"""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.providers import facebook as fb_mod
from app.auth.providers.facebook import (
    FacebookAuthError,
    FacebookNotConfigured,
    signin_with_facebook,
    verify_facebook_access_token,
)
from app.database import Base, get_db
from app.models import User, UserIdentity


TEST_APP_ID = "test-fb-app-1234"


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeClient:
    def __init__(self, response_map: dict):
        """``response_map`` keys are URL substrings, values are ``_FakeResponse``."""
        self._map = response_map

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get(self, url: str, params: dict | None = None):
        for needle, resp in self._map.items():
            if needle in url:
                return resp
        return _FakeResponse({"error": "not mocked"}, status_code=500)


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
def _clear_fb_env():
    old_id = os.environ.get("FACEBOOK_APP_ID")
    old_secret = os.environ.get("FACEBOOK_APP_SECRET")
    os.environ.pop("FACEBOOK_APP_ID", None)
    os.environ.pop("FACEBOOK_APP_SECRET", None)
    yield
    for k, v in (("FACEBOOK_APP_ID", old_id), ("FACEBOOK_APP_SECRET", old_secret)):
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


# ---------------------------------------------------------------------------
# Graceful degradation (the primary production contract right now)
# ---------------------------------------------------------------------------
class TestFacebookNotConfigured:
    def test_verify_raises_when_app_id_missing(self):
        with pytest.raises(FacebookNotConfigured):
            verify_facebook_access_token("any-token")

    def test_signin_raises_when_app_id_missing(self, shared_session):
        with pytest.raises(FacebookNotConfigured):
            signin_with_facebook(shared_session, "any-token")

    def test_route_returns_503_when_not_configured(self, shared_engine, shared_session):
        from app.routes.auth.oauth_facebook import router as fb_router

        app = FastAPI()
        app.include_router(fb_router, prefix="/api/auth")
        SessionLocal = sessionmaker(bind=shared_engine, autoflush=False, autocommit=False)

        def _override_get_db():
            db = SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = _override_get_db
        with TestClient(app) as client:
            r = client.post(
                "/api/auth/oauth/facebook",
                json={"access_token": "anything", "role": "vendor"},
            )
        assert r.status_code == 503
        assert "not configured" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# /me fallback path (weak verification — dev/demo only)
# ---------------------------------------------------------------------------
class TestFacebookMeFallback:
    def test_verify_via_me_endpoint(self):
        os.environ["FACEBOOK_APP_ID"] = TEST_APP_ID
        # No FACEBOOK_APP_SECRET set → /me fallback path.
        fake_me = _FakeResponse(
            {"id": "fb-123", "email": "fb@example.com", "name": "Face Book"}
        )
        fake_client = _FakeClient({"/me": fake_me})
        with patch.object(fb_mod.httpx, "Client", lambda *a, **k: fake_client):
            profile = verify_facebook_access_token("dummy-token")
        assert profile["id"] == "fb-123"
        assert profile["email"] == "fb@example.com"

    def test_signin_upserts_user(self, shared_session):
        os.environ["FACEBOOK_APP_ID"] = TEST_APP_ID
        fake_me = _FakeResponse(
            {"id": "fb-999", "email": "new@example.com", "name": "Shiny User"}
        )
        fake_client = _FakeClient({"/me": fake_me})
        with patch.object(fb_mod.httpx, "Client", lambda *a, **k: fake_client):
            user, created = signin_with_facebook(
                shared_session, "dummy-token", default_role="vendor"
            )
        assert created is True
        assert user.primary_email == "new@example.com"
        assert user.role == "vendor"
        identities = (
            shared_session.query(UserIdentity)
            .filter(UserIdentity.user_id == user.id)
            .all()
        )
        assert len(identities) == 1
        assert identities[0].provider == "facebook"
        assert identities[0].provider_user_id == "fb-999"

    def test_signin_reuses_existing_identity(self, shared_session):
        os.environ["FACEBOOK_APP_ID"] = TEST_APP_ID
        fake_me = _FakeResponse({"id": "fb-reuse", "email": "r@example.com", "name": "R"})
        fake_client = _FakeClient({"/me": fake_me})
        with patch.object(fb_mod.httpx, "Client", lambda *a, **k: fake_client):
            u1, c1 = signin_with_facebook(shared_session, "dummy-token")
            u2, c2 = signin_with_facebook(shared_session, "dummy-token")
        assert c1 is True
        assert c2 is False
        assert u1.id == u2.id

    def test_me_error_raises_facebook_auth_error(self):
        os.environ["FACEBOOK_APP_ID"] = TEST_APP_ID
        fake_me = _FakeResponse({"error": "bad token"}, status_code=400)
        fake_client = _FakeClient({"/me": fake_me})
        with patch.object(fb_mod.httpx, "Client", lambda *a, **k: fake_client):
            with pytest.raises(FacebookAuthError):
                verify_facebook_access_token("dummy-token")


# ---------------------------------------------------------------------------
# debug_token path (strong verification with app secret)
# ---------------------------------------------------------------------------
class TestFacebookDebugTokenPath:
    def test_rejects_token_from_different_app(self):
        os.environ["FACEBOOK_APP_ID"] = TEST_APP_ID
        os.environ["FACEBOOK_APP_SECRET"] = "app-secret"
        fake_debug = _FakeResponse(
            {"data": {"is_valid": True, "app_id": "a-totally-different-app"}}
        )
        fake_client = _FakeClient({"/debug_token": fake_debug})
        with patch.object(fb_mod.httpx, "Client", lambda *a, **k: fake_client):
            with pytest.raises(FacebookAuthError):
                verify_facebook_access_token("dummy-token")

    def test_rejects_invalid_token(self):
        os.environ["FACEBOOK_APP_ID"] = TEST_APP_ID
        os.environ["FACEBOOK_APP_SECRET"] = "app-secret"
        fake_debug = _FakeResponse(
            {"data": {"is_valid": False, "app_id": TEST_APP_ID}}
        )
        fake_client = _FakeClient({"/debug_token": fake_debug})
        with patch.object(fb_mod.httpx, "Client", lambda *a, **k: fake_client):
            with pytest.raises(FacebookAuthError):
                verify_facebook_access_token("dummy-token")

    def test_debug_token_happy_path(self):
        os.environ["FACEBOOK_APP_ID"] = TEST_APP_ID
        os.environ["FACEBOOK_APP_SECRET"] = "app-secret"
        fake_debug = _FakeResponse(
            {"data": {"is_valid": True, "app_id": TEST_APP_ID}}
        )
        fake_me = _FakeResponse(
            {"id": "fb-debug-1", "email": "d@example.com", "name": "Debug"}
        )
        fake_client = _FakeClient({"/debug_token": fake_debug, "/me": fake_me})
        with patch.object(fb_mod.httpx, "Client", lambda *a, **k: fake_client):
            profile = verify_facebook_access_token("dummy-token")
        assert profile["id"] == "fb-debug-1"
