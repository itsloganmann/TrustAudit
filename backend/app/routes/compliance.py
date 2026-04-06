"""43B(h) compliance form rendering + government submission gate.

Endpoints
---------
* ``GET  /api/invoices/{id}/compliance.pdf``
    Returns the print-ready PDF for an invoice. Vendor or driver
    scoped to the invoice's enterprise / MSME.

* ``POST /api/invoices/{id}/submit-to-gov``
    Vendor / admin only. Verifies the invoice is in ``VERIFIED``
    state, has a confidence score above the configured threshold,
    and has no open dispute. Transitions the invoice to
    ``SUBMITTED_TO_GOV``, stamps ``submitted_to_gov_at``, and writes
    a ``submitted_to_gov`` row to the audit trail.

The router is exported as ``router`` and is registered on
``main.py`` by W10 &mdash; this module never touches ``main.py``.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from ..auth.dependencies import current_user, require_role
from ..database import get_db
from ..models import ChallanEvent, Dispute, Enterprise, Invoice, MSME, User
from ..services.pdf import (
    ComplianceFormContext,
    PDFRenderingUnavailable,
    render_compliance_pdf,
)
from ..services.state_machine import (
    InvalidTransitionError,
    InvoiceState,
    USER_SUBMITS_TO_GOV,
    next_state,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["compliance"])


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
def _submit_threshold() -> float:
    """Read SUBMIT_CONFIDENCE_THRESHOLD on every call so tests can monkeypatch."""
    raw = os.environ.get("SUBMIT_CONFIDENCE_THRESHOLD", "0.85")
    try:
        return float(raw)
    except ValueError:
        return 0.85


def _verification_base_url() -> str:
    return os.environ.get(
        "VERIFICATION_BASE_URL",
        "https://trustaudit.onrender.com",
    ).rstrip("/")


# Where to persist generated PDFs so subsequent requests can hit the
# cache instead of re-rendering. We deliberately reuse the existing
# uploads dir which ``main.py`` already mounts at ``/uploads``.
PDF_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "compliance_pdfs"


def _ensure_cache_dir() -> Path:
    PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return PDF_CACHE_DIR


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _user_can_view_invoice(user: User, invoice: Invoice) -> bool:
    if user.role == "admin":
        return True
    if user.role == "vendor":
        return user.enterprise_id is not None and user.enterprise_id == invoice.enterprise_id
    if user.role == "driver":
        # Drivers see invoices for the MSME they belong to.
        return user.msme_id is not None and user.msme_id == invoice.msme_id
    return False


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _calc_days_remaining(deadline) -> int:
    if deadline is None:
        return 0
    today = datetime.now(timezone.utc).date()
    if hasattr(deadline, "date"):
        deadline_date = deadline.date()
    else:
        deadline_date = deadline
    return (deadline_date - today).days


def _build_audit_trail(
    db: DBSession, invoice_id: int, limit: int = 5
) -> List[Tuple[str, str, str]]:
    rows: List[ChallanEvent] = (
        db.query(ChallanEvent)
        .filter(ChallanEvent.invoice_id == invoice_id)
        .order_by(ChallanEvent.created_at.desc())
        .limit(limit)
        .all()
    )
    rows.reverse()  # chronological order on the form
    out: List[Tuple[str, str, str]] = []
    for r in rows:
        ts = r.created_at.isoformat() if r.created_at else ""
        summary = _summarise_event(r)
        out.append((ts, r.event_type or "", summary))
    return out


def _summarise_event(event: ChallanEvent) -> str:
    """Best-effort one-line summary of a challan event for the audit trail."""
    if event.handler_actions_json:
        try:
            payload = json.loads(event.handler_actions_json)
            via = payload.get("via")
            note = payload.get("note") or payload.get("reason_code")
            if via and note:
                return f"{note} ({via})"
            if via:
                return f"Recorded via {via}"
        except Exception:
            pass
    if event.confidence_score is not None:
        return f"Confidence: {event.confidence_score:.2f}"
    return event.event_type or "Event recorded"


def _build_context(
    db: DBSession,
    invoice: Invoice,
    enterprise: Optional[Enterprise],
    msme: Optional[MSME],
) -> ComplianceFormContext:
    deadline_str = invoice.deadline_43bh.isoformat() if invoice.deadline_43bh else ""
    invoice_date_str = invoice.invoice_date.isoformat() if invoice.invoice_date else ""
    acceptance_str = (
        invoice.date_of_acceptance.isoformat() if invoice.date_of_acceptance else ""
    )
    extracted_at_str = (
        invoice.verified_at.isoformat()
        if invoice.verified_at is not None
        else (invoice.created_at.isoformat() if invoice.created_at else "")
    )

    is_composition = bool(
        msme
        and msme.gstin
        and (
            msme.gstin.upper().startswith("UNREG")
            or msme.gstin.upper().startswith("COMP")
            or msme.gstin.upper() == "NA"
        )
    )

    return ComplianceFormContext(
        invoice_id=invoice.id,
        enterprise_name=(enterprise.name if enterprise else "TrustAudit Customer"),
        enterprise_pan=(enterprise.pan if enterprise and enterprise.pan else "PAN ON FILE"),
        msme_vendor_name=(msme.vendor_name if msme else invoice.vendor_name),
        msme_gstin=(msme.gstin if msme else invoice.gstin),
        msme_udyam=(msme.udyam_number if msme else None),
        invoice_number=invoice.invoice_number,
        invoice_date=invoice_date_str,
        invoice_amount_inr=float(invoice.invoice_amount or 0.0),
        date_of_acceptance=acceptance_str,
        deadline_43bh=deadline_str,
        days_remaining_at_generation=_calc_days_remaining(invoice.deadline_43bh),
        confidence_score=float(invoice.confidence_score or 0.0),
        extraction_model="gemini-flash-latest",
        extracted_at=extracted_at_str,
        audit_trail=tuple(_build_audit_trail(db, invoice.id)),
        verification_url=f"{_verification_base_url()}/verify/{invoice.id}",
        is_composition_scheme=is_composition,
    )


def _load_invoice_or_404(db: DBSession, invoice_id: int) -> Invoice:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).one_or_none()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/invoices/{invoice_id}/compliance.pdf")
def get_compliance_pdf(
    invoice_id: int,
    db: DBSession = Depends(get_db),
    user: User = Depends(current_user),
) -> Response:
    invoice = _load_invoice_or_404(db, invoice_id)
    if not _user_can_view_invoice(user, invoice):
        raise HTTPException(status_code=403, detail="Not authorised for this invoice")

    # Cache hit?
    cached_path: Optional[Path] = None
    if invoice.compliance_pdf_url:
        candidate = Path(invoice.compliance_pdf_url)
        if candidate.exists():
            cached_path = candidate

    if cached_path is not None:
        try:
            pdf_bytes = cached_path.read_bytes()
            return Response(content=pdf_bytes, media_type="application/pdf")
        except OSError:
            logger.warning("compliance pdf cache read failed for invoice %s", invoice_id)

    enterprise = (
        db.query(Enterprise).filter(Enterprise.id == invoice.enterprise_id).one_or_none()
        if invoice.enterprise_id
        else None
    )
    msme = (
        db.query(MSME).filter(MSME.id == invoice.msme_id).one_or_none()
        if invoice.msme_id
        else None
    )

    ctx = _build_context(db, invoice, enterprise, msme)
    try:
        pdf_bytes = render_compliance_pdf(ctx)
    except PDFRenderingUnavailable as exc:
        logger.error("PDF rendering unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Compliance PDF rendering is unavailable on this server. "
                "Please try again later."
            ),
        ) from exc

    # Persist to cache & record on the invoice row.
    cache_dir = _ensure_cache_dir()
    cache_path = cache_dir / f"invoice_{invoice.id}.pdf"
    try:
        cache_path.write_bytes(pdf_bytes)
        invoice.compliance_pdf_url = str(cache_path)
        db.add(invoice)
        db.commit()
    except OSError:
        logger.warning("compliance pdf cache write failed for invoice %s", invoice_id)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'inline; filename="trustaudit-43bh-invoice-{invoice.id}.pdf"'
            ),
            "Cache-Control": "private, max-age=300",
        },
    )


# ---------------------------------------------------------------------------
# Submit-to-government
# ---------------------------------------------------------------------------
class SubmitResponse(BaseModel):
    invoice_id: int
    state: str
    submitted_to_gov_at: Optional[str]
    govt_submission_receipt: Optional[str]
    compliance_pdf_url: Optional[str]
    audit_hash: Optional[str] = None


@router.post(
    "/invoices/{invoice_id}/submit-to-gov",
    response_model=SubmitResponse,
)
def submit_to_government(
    invoice_id: int,
    db: DBSession = Depends(get_db),
    user: User = Depends(require_role("vendor", "admin")),
) -> SubmitResponse:
    invoice = _load_invoice_or_404(db, invoice_id)
    if not _user_can_view_invoice(user, invoice):
        raise HTTPException(status_code=403, detail="Not authorised for this invoice")

    # Gate 1: state must be VERIFIED
    if invoice.state != InvoiceState.VERIFIED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invoice must be in VERIFIED state to submit "
                f"(current: {invoice.state})"
            ),
        )

    # Gate 2: confidence threshold
    threshold = _submit_threshold()
    confidence = float(invoice.confidence_score or 0.0)
    if confidence < threshold:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Confidence {confidence:.2f} is below the required "
                f"threshold of {threshold:.2f}. Resolve any extraction "
                "issues before submitting."
            ),
        )

    # Gate 3: no open dispute
    open_dispute = (
        db.query(Dispute)
        .filter(
            Dispute.invoice_id == invoice.id,
            Dispute.status.in_(("open", "in_review")),
        )
        .first()
    )
    if open_dispute is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot submit while dispute {open_dispute.id} is "
                f"{open_dispute.status}. Resolve the dispute first."
            ),
        )

    # Generate the PDF if missing
    enterprise = (
        db.query(Enterprise).filter(Enterprise.id == invoice.enterprise_id).one_or_none()
        if invoice.enterprise_id
        else None
    )
    msme = (
        db.query(MSME).filter(MSME.id == invoice.msme_id).one_or_none()
        if invoice.msme_id
        else None
    )
    ctx = _build_context(db, invoice, enterprise, msme)

    if not invoice.compliance_pdf_url or not Path(invoice.compliance_pdf_url).exists():
        try:
            pdf_bytes = render_compliance_pdf(ctx)
        except PDFRenderingUnavailable as exc:
            logger.error("PDF rendering unavailable for submission: %s", exc)
            raise HTTPException(
                status_code=503,
                detail=(
                    "Compliance PDF rendering is unavailable on this server. "
                    "Submission was not recorded; please retry."
                ),
            ) from exc
        cache_dir = _ensure_cache_dir()
        cache_path = cache_dir / f"invoice_{invoice.id}.pdf"
        try:
            cache_path.write_bytes(pdf_bytes)
            invoice.compliance_pdf_url = str(cache_path)
        except OSError:
            logger.warning("submission cache write failed for invoice %s", invoice_id)

    # State machine transition
    try:
        new_state, _actions = next_state(
            invoice.state,
            USER_SUBMITS_TO_GOV,
            context={
                "confidence": confidence,
                "missing_fields": [],
            },
        )
    except InvalidTransitionError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    invoice.state = new_state.value
    invoice.status = new_state.value  # keep legacy column in sync
    invoice.submitted_to_gov_at = _utcnow_naive()
    if not invoice.govt_submission_receipt:
        invoice.govt_submission_receipt = (
            f"TA-RECEIPT-{invoice.id}-{int(invoice.submitted_to_gov_at.timestamp())}"
        )
    db.add(invoice)
    db.flush()

    # Audit trail
    audit_hash = None
    try:
        from ..services.pdf import compute_audit_hash
        audit_hash = compute_audit_hash(ctx)
    except Exception:
        logger.debug("audit hash compute failed", exc_info=True)

    challan = ChallanEvent(
        invoice_id=invoice.id,
        event_type="submitted_to_gov",
        confidence_score=confidence,
        handler_actions_json=json.dumps(
            {
                "via": "POST /api/invoices/{id}/submit-to-gov",
                "actor_user_id": user.id,
                "receipt": invoice.govt_submission_receipt,
                "audit_hash": audit_hash,
            },
            sort_keys=True,
        ),
    )
    db.add(challan)
    db.commit()
    db.refresh(invoice)

    return SubmitResponse(
        invoice_id=invoice.id,
        state=invoice.state,
        submitted_to_gov_at=(
            invoice.submitted_to_gov_at.isoformat() if invoice.submitted_to_gov_at else None
        ),
        govt_submission_receipt=invoice.govt_submission_receipt,
        compliance_pdf_url=invoice.compliance_pdf_url,
        audit_hash=audit_hash,
    )
