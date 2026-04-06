"""Tests for ``POST /api/invoices/{id}/submit-to-gov`` and the PDF endpoint."""
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
import app.models  # noqa: F401
from app.models import (
    ChallanEvent,
    Dispute,
    Enterprise,
    Invoice,
    MSME,
    User,
)
from app.routes.compliance import router as compliance_router
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
    app.include_router(compliance_router, prefix="/api")
    app.include_router(disputes_router, prefix="/api")
    return app


@pytest.fixture()
def client(app):
    with TestClient(app) as c:
        yield c


def _seed(SessionLocal, *, state="VERIFIED", confidence=0.94):
    s = SessionLocal()
    try:
        ent = Enterprise(name="Bharat Industries", pan="AAACB1234D")
        s.add(ent)
        s.flush()
        msme = MSME(
            enterprise_id=ent.id,
            vendor_name="Sharma Steel",
            gstin="29ABCDE1234F1Z5",
            udyam_number="UDYAM-MH-04-0012345",
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
            status=state,
            state=state,
            confidence_score=confidence,
            enterprise_id=ent.id,
            msme_id=msme.id,
            verified_at=datetime(2026, 3, 21, 14, 1, 9),
        )
        s.add(invoice)
        s.flush()
        vendor = User(
            role="vendor",
            enterprise_id=ent.id,
            primary_email="v@bharat.demo",
            email_verified=True,
        )
        admin = User(
            role="admin",
            primary_email="a@trustaudit.demo",
            email_verified=True,
        )
        driver = User(
            role="driver",
            msme_id=msme.id,
            primary_email="d@bharat.demo",
            email_verified=True,
        )
        s.add_all([vendor, admin, driver])
        s.flush()
        v_token, _ = create_session(s, vendor)
        a_token, _ = create_session(s, admin)
        d_token, _ = create_session(s, driver)
        s.commit()
        return {
            "enterprise_id": ent.id,
            "msme_id": msme.id,
            "invoice_id": invoice.id,
            "vendor_token": v_token,
            "admin_token": a_token,
            "driver_token": d_token,
        }
    finally:
        s.close()


def _weasyprint_available() -> bool:
    try:
        import weasyprint  # noqa: F401
        return True
    except (ImportError, OSError):
        return False


# ---------------------------------------------------------------------------
# Submit-to-gov gates
# ---------------------------------------------------------------------------
class TestSubmitGates:
    def test_state_not_verified_returns_400(self, client, SessionLocal):
        seeded = _seed(SessionLocal, state="PENDING")
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.post(f"/api/invoices/{seeded['invoice_id']}/submit-to-gov")
        assert r.status_code == 400
        assert "VERIFIED" in r.json()["detail"]

    def test_low_confidence_returns_400(self, client, SessionLocal, monkeypatch):
        monkeypatch.setenv("SUBMIT_CONFIDENCE_THRESHOLD", "0.85")
        seeded = _seed(SessionLocal, state="VERIFIED", confidence=0.55)
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.post(f"/api/invoices/{seeded['invoice_id']}/submit-to-gov")
        assert r.status_code == 400
        assert "threshold" in r.json()["detail"].lower()

    def test_open_dispute_blocks_submission(self, client, SessionLocal):
        seeded = _seed(SessionLocal)
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        # Open a dispute first
        d = client.post(
            "/api/disputes",
            json={
                "invoice_id": seeded["invoice_id"],
                "reason_code": "extraction_error",
            },
        )
        assert d.status_code == 201

        r = client.post(f"/api/invoices/{seeded['invoice_id']}/submit-to-gov")
        assert r.status_code == 400
        assert "dispute" in r.json()["detail"].lower()

    def test_driver_gets_403(self, client, SessionLocal):
        seeded = _seed(SessionLocal)
        client.cookies.set(SESSION_COOKIE_NAME, seeded["driver_token"])
        r = client.post(f"/api/invoices/{seeded['invoice_id']}/submit-to-gov")
        assert r.status_code == 403

    def test_unknown_invoice_returns_404(self, client, SessionLocal):
        seeded = _seed(SessionLocal)
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.post("/api/invoices/9999/submit-to-gov")
        assert r.status_code == 404


@pytest.mark.skipif(
    not _weasyprint_available(),
    reason="WeasyPrint native libs not available",
)
class TestSubmitHappyPath:
    def test_happy_path_transitions_state_and_appends_event(
        self, client, SessionLocal, monkeypatch, tmp_path
    ):
        # Redirect the cache dir to a tmpdir so we don't pollute uploads/.
        from app.routes import compliance as compliance_module
        monkeypatch.setattr(
            compliance_module, "PDF_CACHE_DIR", tmp_path / "compliance_pdfs"
        )

        seeded = _seed(SessionLocal)
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.post(f"/api/invoices/{seeded['invoice_id']}/submit-to-gov")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["state"] == "SUBMITTED_TO_GOV"
        assert body["submitted_to_gov_at"] is not None
        assert body["compliance_pdf_url"]
        assert body["audit_hash"]
        assert len(body["audit_hash"]) == 64

        # Check the audit trail row
        s = SessionLocal()
        try:
            events = (
                s.query(ChallanEvent)
                .filter(ChallanEvent.invoice_id == seeded["invoice_id"])
                .all()
            )
            event_types = [e.event_type for e in events]
            assert "submitted_to_gov" in event_types

            inv = s.query(Invoice).filter(Invoice.id == seeded["invoice_id"]).one()
            assert inv.state == "SUBMITTED_TO_GOV"
            assert inv.submitted_to_gov_at is not None
            assert inv.govt_submission_receipt is not None
        finally:
            s.close()


# ---------------------------------------------------------------------------
# GET compliance.pdf
# ---------------------------------------------------------------------------
@pytest.mark.skipif(
    not _weasyprint_available(),
    reason="WeasyPrint native libs not available",
)
class TestComplianceGet:
    def test_returns_pdf_for_authorised_vendor(
        self, client, SessionLocal, monkeypatch, tmp_path
    ):
        from app.routes import compliance as compliance_module
        monkeypatch.setattr(
            compliance_module, "PDF_CACHE_DIR", tmp_path / "compliance_pdfs"
        )

        seeded = _seed(SessionLocal)
        client.cookies.set(SESSION_COOKIE_NAME, seeded["vendor_token"])
        r = client.get(f"/api/invoices/{seeded['invoice_id']}/compliance.pdf")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.content.startswith(b"%PDF-")
        assert len(r.content) > 1024

    def test_driver_for_other_msme_gets_403(
        self, client, SessionLocal, monkeypatch, tmp_path
    ):
        from app.routes import compliance as compliance_module
        monkeypatch.setattr(
            compliance_module, "PDF_CACHE_DIR", tmp_path / "compliance_pdfs"
        )
        seeded = _seed(SessionLocal)
        # Create a driver in a different MSME
        s = SessionLocal()
        try:
            other_msme = MSME(
                enterprise_id=seeded["enterprise_id"],
                vendor_name="Other",
                gstin="OTHER",
            )
            s.add(other_msme)
            s.flush()
            other_driver = User(
                role="driver",
                msme_id=other_msme.id,
                primary_email="other@d.demo",
                email_verified=True,
            )
            s.add(other_driver)
            s.flush()
            token, _ = create_session(s, other_driver)
            s.commit()
        finally:
            s.close()
        client.cookies.set(SESSION_COOKIE_NAME, token)
        r = client.get(f"/api/invoices/{seeded['invoice_id']}/compliance.pdf")
        assert r.status_code == 403

    def test_unauthenticated_returns_401(self, client, SessionLocal):
        seeded = _seed(SessionLocal)
        r = client.get(f"/api/invoices/{seeded['invoice_id']}/compliance.pdf")
        assert r.status_code == 401
