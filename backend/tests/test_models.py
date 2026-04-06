"""Tests for the extended TrustAudit data model.

Covers:
    * All new tables can be created against an in-memory SQLite engine
    * ``user_identities`` uniqueness constraint on (user_id, provider)
    * ``Invoice`` backward compatibility (legacy-only fields still work)
    * ``Invoice`` can be created with all new YC-demo fields populated
    * ``Invoice.state`` defaults to ``'PENDING'`` when not specified
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import Base
from app.models import (
    ChallanEvent,
    Dispute,
    Enterprise,
    Invoice,
    MSME,
    RateLimit,
    Session as SessionModel,
    User,
    UserIdentity,
    VerificationCode,
)


# ---------------------------------------------------------------------------
# Schema creation
# ---------------------------------------------------------------------------
def test_metadata_create_all_registers_every_new_table(db_engine):
    """All YC-demo tables must be present after ``create_all``."""
    expected = {
        "enterprises",
        "msmes",
        "users",
        "user_identities",
        "verification_codes",
        "sessions",
        "invoices",
        "disputes",
        "challan_events",
        "rate_limits",
    }
    registered = set(Base.metadata.tables.keys())
    missing = expected - registered
    assert not missing, f"Missing tables in metadata: {missing}"

    # And every one of them actually made it into the live schema.
    from sqlalchemy import inspect

    inspector = inspect(db_engine)
    live_tables = set(inspector.get_table_names())
    assert expected.issubset(live_tables), (
        f"create_all did not build: {expected - live_tables}"
    )


def test_enterprise_and_msme_round_trip(db_session):
    ent = Enterprise(
        name="Acme Industries",
        legal_name="Acme Industries Pvt Ltd",
        pan="AAAAA0000A",
        demo_color_hex="#123456",
    )
    db_session.add(ent)
    db_session.flush()

    msme = MSME(
        enterprise_id=ent.id,
        vendor_name="Acme Steel",
        gstin="27AAAAA0000A1Z5",
        state_code="27",
        industry="Steel",
    )
    db_session.add(msme)
    db_session.flush()

    assert msme.id is not None
    assert msme.enterprise is ent
    assert ent.msmes[0].vendor_name == "Acme Steel"


# ---------------------------------------------------------------------------
# Users / identities / sessions / verification codes
# ---------------------------------------------------------------------------
def _make_user(db_session, **overrides) -> User:
    defaults = {
        "role": "vendor",
        "primary_email": "user@example.com",
        "full_name": "Jane Doe",
        "email_verified": True,
    }
    defaults.update(overrides)
    user = User(**defaults)
    db_session.add(user)
    db_session.flush()
    return user


def test_user_identity_unique_constraint(db_session):
    user = _make_user(db_session, primary_email="dup@example.com")

    db_session.add(
        UserIdentity(
            user_id=user.id,
            provider="google",
            provider_user_id="g-1",
            email="dup@example.com",
            raw_profile_json=json.dumps({"sub": "g-1"}),
        )
    )
    db_session.flush()

    db_session.add(
        UserIdentity(
            user_id=user.id,
            provider="google",
            provider_user_id="g-2",
            email="dup@example.com",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_verification_code_and_session_insert(db_session):
    user = _make_user(db_session, primary_email="code@example.com")

    vc = VerificationCode(
        user_id=user.id,
        channel="email",
        destination="code@example.com",
        code_hash="a" * 64,
        purpose="signin",
        expires_at=datetime.now() + timedelta(minutes=10),
    )
    sess = SessionModel(
        user_id=user.id,
        token_hash="b" * 64,
        ip="127.0.0.1",
        user_agent="pytest",
        expires_at=datetime.now() + timedelta(days=7),
    )
    db_session.add_all([vc, sess])
    db_session.flush()

    assert vc.attempts == 0
    assert sess.user_id == user.id


def test_rate_limit_primary_key(db_session):
    rl = RateLimit(
        key="phone:+919812345678",
        count=3,
        window_started_at=datetime.now(),
    )
    db_session.add(rl)
    db_session.flush()
    assert (
        db_session.query(RateLimit)
        .filter_by(key="phone:+919812345678")
        .one()
        .count
        == 3
    )


# ---------------------------------------------------------------------------
# Invoice backward compat + new YC-demo fields
# ---------------------------------------------------------------------------
LEGACY_KW = dict(
    vendor_name="Legacy Vendor",
    gstin="27AAAAA0000A1Z5",
    invoice_number="INV-LEGACY-1",
    invoice_amount=12345.67,
    invoice_date=date(2026, 1, 1),
    date_of_acceptance=date(2026, 1, 2),
    deadline_43bh=date(2026, 2, 16),
)


def test_invoice_legacy_fields_only_still_work(db_session):
    inv = Invoice(**LEGACY_KW)
    db_session.add(inv)
    db_session.flush()

    assert inv.id is not None
    assert inv.status == "PENDING"  # server default
    assert inv.vendor_name == "Legacy Vendor"


def test_invoice_state_defaults_to_pending(db_session):
    kwargs = {**LEGACY_KW, "invoice_number": "INV-STATE-DEFAULT"}
    inv = Invoice(**kwargs)
    db_session.add(inv)
    db_session.flush()
    db_session.refresh(inv)

    assert inv.state == "PENDING"


def test_invoice_full_new_fields_populated(db_session):
    ent = Enterprise(name="Bharat", legal_name="Bharat Pvt Ltd", pan="AABCB1234F")
    db_session.add(ent)
    db_session.flush()

    msme = MSME(
        enterprise_id=ent.id,
        vendor_name="Legacy Vendor",
        gstin="27AAAAA0000A1Z5",
        state_code="27",
        industry="Steel",
    )
    db_session.add(msme)
    db_session.flush()

    inv = Invoice(
        **{**LEGACY_KW, "invoice_number": "INV-NEW-1"},
        enterprise_id=ent.id,
        msme_id=msme.id,
        state="VERIFYING",
        confidence_score=0.97,
        missing_fields=json.dumps([]),
        detected_edge_cases=json.dumps(["blurry_stamp"]),
        raw_image_sha256="f" * 64,
        compliance_pdf_url="/uploads/compliance/INV-NEW-1.pdf",
        submitted_to_gov_at=datetime(2026, 1, 3, 12, 0, 0),
        govt_submission_receipt="GST-2026-0001",
    )
    db_session.add(inv)
    db_session.flush()

    # Attach a dispute + a challan event to exercise the relationships.
    opener = _make_user(db_session, primary_email="opener@example.com")
    dispute = Dispute(
        invoice_id=inv.id,
        reason_code="amount_mismatch",
        status="open",
        opened_by_user_id=opener.id,
        notes="Vendor disputes amount",
    )
    event = ChallanEvent(
        invoice_id=inv.id,
        event_type="vlm_extracted",
        confidence_score=0.97,
        raw_ocr_json=json.dumps({"raw": "text"}),
        vlm_response_json=json.dumps({"model": "claude"}),
    )
    db_session.add_all([dispute, event])
    db_session.flush()

    db_session.refresh(inv)
    assert inv.state == "VERIFYING"
    assert inv.confidence_score == pytest.approx(0.97)
    assert inv.msme.vendor_name == "Legacy Vendor"
    assert len(inv.disputes) == 1
    assert inv.disputes[0].status == "open"
    assert len(inv.challan_events) == 1
    assert inv.challan_events[0].event_type == "vlm_extracted"
