"""Tests for the dispute resolution routes.

These tests mount the disputes router on a fresh FastAPI app inside
the test (rather than importing ``app.main:app``) so they don't
collide with W10's eventual ``main.py`` registration order.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import SESSION_COOKIE_NAME
from app.auth.sessions import create_session
from app.database import Base, get_db
import app.models  # noqa: F401 — register tables
from app.models import ChallanEvent, Dispute, Enterprise, Invoice, MSME, User
from app.routes.disputes import router as disputes_router


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
def SessionLocal(shared_engine):
    return sessionmaker(bind=shared_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def app(SessionLocal):
    app = FastAPI()

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.include_router(disputes_router, prefix="/api")
    return app


@pytest.fixture()
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def seeded(SessionLocal):
    """Seed two enterprises, one MSME, one invoice, one vendor + driver + admin."""
    s = SessionLocal()
    try:
        ent_a = Enterprise(name="Bharat Industries", pan="AAACB1234D")
        ent_b = Enterprise(name="Other Corp", pan="OTHER1234E")
        s.add_all([ent_a, ent_b])
        s.flush()

        msme = MSME(
            enterprise_id=ent_a.id,
            vendor_name="Sharma Steel",
            gstin="29ABCDE1234F1Z5",
        )
        s.add(msme)
        s.flush()

        invoice = Invoice(
            vendor_name="Sharma Steel",
            gstin="29ABCDE1234F1Z5",
            invoice_number="INV-001",
            invoice_amount=412350.0,
            invoice_date=date(2026, 3, 21),
            date_of_acceptance=date(2026, 3, 21),
            deadline_43bh=date(2026, 5, 5),
            status="VERIFIED",
            state="VERIFIED",
            confidence_score=0.94,
            enterprise_id=ent_a.id,
            msme_id=msme.id,
        )
        s.add(invoice)
        s.flush()

        vendor = User(
            role="vendor",
            enterprise_id=ent_a.id,
            primary_email="v@bharat.demo",
            email_verified=True,
        )
        driver = User(
            role="driver",
            msme_id=msme.id,
            primary_email="d@bharat.demo",
            email_verified=True,
        )
        admin = User(
            role="admin",
            primary_email="a@trustaudit.demo",
            email_verified=True,
        )
        # User from a different enterprise &mdash; must not see invoice/disputes
        outsider = User(
            role="vendor",
            enterprise_id=ent_b.id,
            primary_email="x@other.demo",
            email_verified=True,
        )
        s.add_all([vendor, driver, admin, outsider])
        s.flush()

        v_token, _ = create_session(s, vendor)
        d_token, _ = create_session(s, driver)
        a_token, _ = create_session(s, admin)
        o_token, _ = create_session(s, outsider)
        s.commit()

        return {
            "enterprise_id": ent_a.id,
            "invoice_id": invoice.id,
            "vendor_token": v_token,
            "driver_token": d_token,
            "admin_token": a_token,
            "outsider_token": o_token,
        }
    finally:
        s.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
class TestDisputeRoleScoping:
    def test_driver_gets_403_listing_disputes(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["driver_token"])
        r = client.get("/api/disputes")
        assert r.status_code == 403

    def test_unauthenticated_gets_401(self, client, seeded):
        r = client.get("/api/disputes")
        assert r.status_code == 401

    def test_vendor_can_list_empty(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.get("/api/disputes")
        assert r.status_code == 200
        assert r.json()["count"] == 0


class TestCreateDispute:
    def test_vendor_creates_dispute_and_writes_challan_event(
        self, client, seeded, SessionLocal
    ):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.post(
            "/api/disputes",
            json={
                "invoice_id": seeded["invoice_id"],
                "reason_code": "wrong_amount",
                "notes": "Amount looks off by 10x",
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["invoice_id"] == seeded["invoice_id"]
        assert body["reason_code"] == "wrong_amount"
        assert body["status"] == "open"

        # Verify ChallanEvent was appended
        s = SessionLocal()
        try:
            events = (
                s.query(ChallanEvent)
                .filter(ChallanEvent.invoice_id == seeded["invoice_id"])
                .all()
            )
            assert len(events) == 1
            assert events[0].event_type == "disputed"
        finally:
            s.close()

    def test_unknown_reason_code_rejected(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.post(
            "/api/disputes",
            json={
                "invoice_id": seeded["invoice_id"],
                "reason_code": "totally_made_up",
            },
        )
        assert r.status_code == 400

    def test_outsider_cannot_create_dispute_on_other_enterprise(
        self, client, seeded
    ):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["outsider_token"])
        r = client.post(
            "/api/disputes",
            json={
                "invoice_id": seeded["invoice_id"],
                "reason_code": "wrong_amount",
            },
        )
        assert r.status_code == 404  # invoice "not in your enterprise"

    def test_duplicate_open_dispute_rejected(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        first = client.post(
            "/api/disputes",
            json={"invoice_id": seeded["invoice_id"], "reason_code": "wrong_date"},
        )
        assert first.status_code == 201
        second = client.post(
            "/api/disputes",
            json={"invoice_id": seeded["invoice_id"], "reason_code": "wrong_amount"},
        )
        assert second.status_code == 409


class TestUpdateDispute:
    def test_status_change_writes_challan_event(
        self, client, seeded, SessionLocal
    ):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        created = client.post(
            "/api/disputes",
            json={"invoice_id": seeded["invoice_id"], "reason_code": "extraction_error"},
        )
        dispute_id = created.json()["id"]

        r = client.patch(
            f"/api/disputes/{dispute_id}",
            json={"status": "resolved", "resolution_notes": "Fixed."},
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "resolved"
        assert r.json()["resolved_at"] is not None

        s = SessionLocal()
        try:
            events = (
                s.query(ChallanEvent)
                .filter(ChallanEvent.invoice_id == seeded["invoice_id"])
                .order_by(ChallanEvent.created_at.asc())
                .all()
            )
            event_types = [e.event_type for e in events]
            assert "disputed" in event_types
            assert "manual_override" in event_types
        finally:
            s.close()

    def test_invalid_status_rejected(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        created = client.post(
            "/api/disputes",
            json={"invoice_id": seeded["invoice_id"], "reason_code": "other"},
        )
        dispute_id = created.json()["id"]
        r = client.patch(
            f"/api/disputes/{dispute_id}",
            json={"status": "exploded"},
        )
        assert r.status_code == 400


class TestDeleteDispute:
    def test_admin_can_delete(self, client, seeded, SessionLocal):
        # Create as vendor
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        created = client.post(
            "/api/disputes",
            json={"invoice_id": seeded["invoice_id"], "reason_code": "duplicate_submission"},
        )
        dispute_id = created.json()["id"]
        # Delete as admin
        client.cookies.set(SESSION_COOKIE_NAME, seeded["admin_token"])
        r = client.delete(f"/api/disputes/{dispute_id}")
        assert r.status_code == 204
        # Verify gone
        s = SessionLocal()
        try:
            assert s.query(Dispute).filter(Dispute.id == dispute_id).one_or_none() is None
        finally:
            s.close()

    def test_vendor_cannot_delete(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        created = client.post(
            "/api/disputes",
            json={"invoice_id": seeded["invoice_id"], "reason_code": "not_my_invoice"},
        )
        dispute_id = created.json()["id"]
        r = client.delete(f"/api/disputes/{dispute_id}")
        assert r.status_code == 403


class TestGetDispute:
    def test_get_returns_full_dispute(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        created = client.post(
            "/api/disputes",
            json={"invoice_id": seeded["invoice_id"], "reason_code": "wrong_amount", "notes": "x"},
        )
        dispute_id = created.json()["id"]
        r = client.get(f"/api/disputes/{dispute_id}")
        assert r.status_code == 200
        assert r.json()["id"] == dispute_id
        assert r.json()["notes"] == "x"

    def test_get_nonexistent_returns_404(self, client, seeded):
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.get("/api/disputes/9999")
        assert r.status_code == 404
