"""SQLAlchemy models for TrustAudit — Invoice tracking with 43B(h) compliance.

This module has been extended for the YC-demo upgrade with an auth / identity
layer (users, identities, verification codes, sessions), an MSME / enterprise
domain model, and a challan event audit trail. All new columns on the existing
``Invoice`` table are nullable (or have defaults) to preserve backward
compatibility with the existing ``routes.py`` endpoints.
"""
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Date,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


# ---------------------------------------------------------------------------
# Enterprise / tenant
# ---------------------------------------------------------------------------
class Enterprise(Base):
    __tablename__ = "enterprises"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    legal_name = Column(String(255), nullable=True)
    pan = Column(String(10), nullable=True, index=True)
    logo_url = Column(String(512), nullable=True)
    demo_color_hex = Column(String(9), nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    msmes = relationship("MSME", back_populates="enterprise")
    users = relationship("User", back_populates="enterprise")

    def __repr__(self) -> str:
        return f"<Enterprise {self.id} {self.name}>"


# ---------------------------------------------------------------------------
# MSME — a vendor on an enterprise's supply chain
# ---------------------------------------------------------------------------
class MSME(Base):
    __tablename__ = "msmes"

    id = Column(Integer, primary_key=True, index=True)
    enterprise_id = Column(
        Integer, ForeignKey("enterprises.id"), nullable=False, index=True
    )
    vendor_name = Column(String(255), nullable=False)
    gstin = Column(String(15), nullable=False, index=True)
    udyam_number = Column(String(20), nullable=True)
    state_code = Column(String(2), nullable=True, index=True)
    industry = Column(String(80), nullable=True)
    primary_phone_e164 = Column(String(20), nullable=True, index=True)
    onboarded_at = Column(DateTime, server_default=func.now())

    enterprise = relationship("Enterprise", back_populates="msmes")
    users = relationship("User", back_populates="msme")
    invoices = relationship("Invoice", back_populates="msme")

    def __repr__(self) -> str:
        return f"<MSME {self.id} {self.vendor_name} {self.gstin}>"


# ---------------------------------------------------------------------------
# Users / identities / sessions
# ---------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(20), nullable=False, index=True)  # vendor | driver | admin
    enterprise_id = Column(
        Integer, ForeignKey("enterprises.id"), nullable=True, index=True
    )
    msme_id = Column(Integer, ForeignKey("msmes.id"), nullable=True, index=True)
    primary_email = Column(String(255), nullable=True, unique=True, index=True)
    primary_phone_e164 = Column(String(20), nullable=True, index=True)
    full_name = Column(String(255), nullable=True)
    pwd_hash = Column(String(255), nullable=True)
    email_verified = Column(Boolean, default=False, nullable=False)
    phone_verified = Column(Boolean, default=False, nullable=False)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    enterprise = relationship("Enterprise", back_populates="users")
    msme = relationship("MSME", back_populates="users")
    identities = relationship(
        "UserIdentity", back_populates="user", cascade="all, delete-orphan"
    )
    sessions = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.id} {self.role} {self.primary_email or self.primary_phone_e164}>"


class UserIdentity(Base):
    __tablename__ = "user_identities"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_user_identity_user_provider"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String(32), nullable=False)  # google|facebook|whatsapp_otp|email_magic|password
    provider_user_id = Column(String(255), nullable=True, index=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    raw_profile_json = Column(Text, nullable=True)
    linked_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="identities")

    def __repr__(self) -> str:
        return f"<UserIdentity u={self.user_id} {self.provider}>"


class VerificationCode(Base):
    __tablename__ = "verification_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    channel = Column(String(16), nullable=False)  # email | sms | whatsapp
    destination = Column(String(255), nullable=False, index=True)
    code_hash = Column(String(128), nullable=False)  # SHA-256 hex
    purpose = Column(String(32), nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self) -> str:
        return f"<VerificationCode {self.channel}:{self.destination} {self.purpose}>"


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, index=True)  # SHA-256 hex
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    last_seen_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="sessions")

    def __repr__(self) -> str:
        return f"<Session u={self.user_id} exp={self.expires_at}>"


# ---------------------------------------------------------------------------
# Invoice — existing model, additively extended for YC demo
# ---------------------------------------------------------------------------
class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    vendor_name = Column(String(255), nullable=False)
    gstin = Column(String(15), nullable=False)           # GSTIN of the MSME vendor
    invoice_number = Column(String(100), nullable=False)
    invoice_amount = Column(Float, nullable=False)
    invoice_date = Column(Date, nullable=False)
    date_of_acceptance = Column(Date, nullable=False)    # THE key date for 43B(h)
    deadline_43bh = Column(Date, nullable=False)         # acceptance + 45 days
    status = Column(String(20), default="PENDING")       # PENDING | VERIFIED | PAID (legacy)
    challan_image_url = Column(Text, nullable=True)      # Path to uploaded challan photo
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # ---- YC-demo additive columns (all nullable / defaulted) -----------
    enterprise_id = Column(
        Integer, ForeignKey("enterprises.id"), nullable=True, default=None, index=True
    )
    msme_id = Column(
        Integer, ForeignKey("msmes.id"), nullable=True, default=None, index=True
    )
    state = Column(
        String(30), default="PENDING", nullable=True, index=True
    )  # PENDING|VERIFYING|VERIFIED|NEEDS_INFO|SUBMITTED_TO_GOV|DISPUTED
    confidence_score = Column(Float, nullable=True)
    missing_fields = Column(Text, nullable=True)  # JSON array as string
    detected_edge_cases = Column(Text, nullable=True)  # JSON array as string
    raw_image_sha256 = Column(String(64), nullable=True, index=True)
    compliance_pdf_url = Column(String(512), nullable=True)
    submitted_to_gov_at = Column(DateTime, nullable=True)
    govt_submission_receipt = Column(String(255), nullable=True)

    # ---- Annotation overlay (Phase H) ----------------------------------
    # ``annotated_image_b64`` stores a base64-encoded PNG (NO data: prefix)
    # produced by services.vision.annotator. We store the full image in
    # the DB because Render's free tier has an ephemeral disk and the
    # ``uploads/`` directory is wiped on every restart — the annotation
    # absolutely has to survive.
    annotated_image_b64 = Column(Text, nullable=True)
    # ``annotated_boxes_json`` is a JSON array of FieldBox dicts, used by
    # the frontend to render an SVG overlay and by the 3D justification
    # canvas to show "available" vs "missing" field nodes.
    annotated_boxes_json = Column(Text, nullable=True)
    annotated_width = Column(Integer, nullable=True)
    annotated_height = Column(Integer, nullable=True)

    enterprise = relationship("Enterprise")
    msme = relationship("MSME", back_populates="invoices")
    disputes = relationship(
        "Dispute", back_populates="invoice", cascade="all, delete-orphan"
    )
    challan_events = relationship(
        "ChallanEvent", back_populates="invoice", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Invoice {self.invoice_number} | {self.vendor_name} | {self.status}>"


# ---------------------------------------------------------------------------
# Disputes
# ---------------------------------------------------------------------------
class Dispute(Base):
    __tablename__ = "disputes"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(
        Integer, ForeignKey("invoices.id"), nullable=False, index=True
    )
    reason_code = Column(String(64), nullable=False)
    status = Column(String(20), nullable=False, default="open", index=True)
    opened_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    invoice = relationship("Invoice", back_populates="disputes")
    opened_by = relationship("User", foreign_keys=[opened_by_user_id])

    def __repr__(self) -> str:
        return f"<Dispute inv={self.invoice_id} {self.status}>"


# ---------------------------------------------------------------------------
# Challan event audit trail
# ---------------------------------------------------------------------------
class ChallanEvent(Base):
    __tablename__ = "challan_events"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(
        Integer, ForeignKey("invoices.id"), nullable=False, index=True
    )
    event_type = Column(String(32), nullable=False, index=True)
    # received|ocr_started|vlm_extracted|edge_case_detected|needs_info|
    # verified|submitted_to_gov|disputed|rebut_sent|manual_override
    confidence_score = Column(Float, nullable=True)
    raw_ocr_json = Column(Text, nullable=True)
    vlm_response_json = Column(Text, nullable=True)
    detected_edge_cases_json = Column(Text, nullable=True)
    handler_actions_json = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    invoice = relationship("Invoice", back_populates="challan_events")

    def __repr__(self) -> str:
        return f"<ChallanEvent inv={self.invoice_id} {self.event_type}>"


# ---------------------------------------------------------------------------
# Rate limiting bucket
# ---------------------------------------------------------------------------
class RateLimit(Base):
    __tablename__ = "rate_limits"

    key = Column(String(255), primary_key=True)
    count = Column(Integer, default=0, nullable=False)
    window_started_at = Column(DateTime, nullable=False)

    def __repr__(self) -> str:
        return f"<RateLimit {self.key} n={self.count}>"
