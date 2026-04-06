"""Tests for ``auth.dependencies`` — current_user / current_user_optional / require_role."""
from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import (
    current_user,
    current_user_optional,
    require_role,
    SESSION_COOKIE_NAME,
)
from app.auth.sessions import create_session
from app.database import Base, get_db
import app.models  # noqa: F401 — register tables on Base
from app.models import User


# ---------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------
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
def app(shared_engine, SessionLocal):
    """A minimal FastAPI app exposing endpoints that exercise each dependency."""
    app = FastAPI()

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    @app.get("/public-or-auth")
    def public_or_auth(user: User | None = Depends(current_user_optional)):
        if user is None:
            return {"anonymous": True}
        return {"anonymous": False, "user_id": user.id}

    @app.get("/must-be-authed")
    def must_be_authed(user: User = Depends(current_user)):
        return {"user_id": user.id, "role": user.role}

    @app.get("/vendor-only")
    def vendor_only(user: User = Depends(require_role("vendor"))):
        return {"user_id": user.id, "role": user.role}

    @app.get("/vendor-or-admin")
    def vendor_or_admin(
        user: User = Depends(require_role("vendor", "admin")),
    ):
        return {"user_id": user.id, "role": user.role}

    return app


@pytest.fixture()
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def seed_users_and_sessions(SessionLocal):
    """Create one vendor and one driver, plus a session for each."""
    session = SessionLocal()
    try:
        vendor = User(role="vendor", primary_email="v@bharat.demo", email_verified=True)
        driver = User(role="driver", primary_email="d@bharat.demo", email_verified=True)
        session.add_all([vendor, driver])
        session.flush()
        vendor_token, _ = create_session(session, vendor, ip="127.0.0.1", user_agent="pytest")
        driver_token, _ = create_session(session, driver, ip="127.0.0.1", user_agent="pytest")
        session.commit()
        return {
            "vendor_id": vendor.id,
            "driver_id": driver.id,
            "vendor_token": vendor_token,
            "driver_token": driver_token,
        }
    finally:
        session.close()


# ---------------------------------------------------------------------
# current_user_optional
# ---------------------------------------------------------------------
class TestCurrentUserOptional:
    def test_returns_none_without_cookie(self, client):
        resp = client.get("/public-or-auth")
        assert resp.status_code == 200
        assert resp.json() == {"anonymous": True}

    def test_returns_user_with_valid_cookie(self, client, seed_users_and_sessions):
        client.cookies.set(SESSION_COOKIE_NAME, seed_users_and_sessions["vendor_token"])
        resp = client.get("/public-or-auth")
        assert resp.status_code == 200
        assert resp.json()["anonymous"] is False
        assert resp.json()["user_id"] == seed_users_and_sessions["vendor_id"]

    def test_returns_none_with_invalid_cookie(self, client):
        client.cookies.set(SESSION_COOKIE_NAME, "not-a-real-token")
        resp = client.get("/public-or-auth")
        assert resp.status_code == 200
        assert resp.json() == {"anonymous": True}


# ---------------------------------------------------------------------
# current_user
# ---------------------------------------------------------------------
class TestCurrentUser:
    def test_raises_401_without_cookie(self, client):
        resp = client.get("/must-be-authed")
        assert resp.status_code == 401

    def test_raises_401_with_invalid_cookie(self, client):
        client.cookies.set(SESSION_COOKIE_NAME, "totally-wrong")
        resp = client.get("/must-be-authed")
        assert resp.status_code == 401

    def test_returns_200_with_valid_cookie(self, client, seed_users_and_sessions):
        client.cookies.set(SESSION_COOKIE_NAME, seed_users_and_sessions["driver_token"])
        resp = client.get("/must-be-authed")
        assert resp.status_code == 200
        assert resp.json()["role"] == "driver"


# ---------------------------------------------------------------------
# require_role
# ---------------------------------------------------------------------
class TestRequireRole:
    def test_vendor_passes_vendor_only(self, client, seed_users_and_sessions):
        client.cookies.set(SESSION_COOKIE_NAME, seed_users_and_sessions["vendor_token"])
        resp = client.get("/vendor-only")
        assert resp.status_code == 200
        assert resp.json()["role"] == "vendor"

    def test_driver_rejected_from_vendor_only(self, client, seed_users_and_sessions):
        client.cookies.set(SESSION_COOKIE_NAME, seed_users_and_sessions["driver_token"])
        resp = client.get("/vendor-only")
        assert resp.status_code == 403

    def test_unauthenticated_gets_401_not_403(self, client):
        resp = client.get("/vendor-only")
        assert resp.status_code == 401

    def test_multi_role_allow_list(self, client, seed_users_and_sessions):
        client.cookies.set(SESSION_COOKIE_NAME, seed_users_and_sessions["vendor_token"])
        resp = client.get("/vendor-or-admin")
        assert resp.status_code == 200

    def test_require_role_needs_at_least_one_role(self):
        with pytest.raises(ValueError):
            require_role()
