"""Dispute resolution routes for the 43B(h) compliance pipeline.

Endpoints
---------
* ``GET    /api/disputes``       — vendor list (scoped to enterprise).
* ``POST   /api/disputes``       — vendor opens a dispute on an invoice.
* ``GET    /api/disputes/{id}``  — single dispute (vendor scoped).
* ``PATCH  /api/disputes/{id}``  — vendor updates status.
* ``DELETE /api/disputes/{id}``  — admin only, hard-delete (audit retained).

Every status change appends a row to ``challan_events`` so the audit
trail in the compliance form PDF reflects the dispute lifecycle.

The router is exported as ``router`` for W10 to register on
``main.py`` &mdash; this module never touches ``main.py`` directly.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ..auth.dependencies import current_user, require_role
from ..database import get_db
from ..models import ChallanEvent, Dispute, Invoice, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["disputes"])


# ---------------------------------------------------------------------------
# Pydantic schemas (kept inline so we don't have to touch shared schemas.py)
# ---------------------------------------------------------------------------
ALLOWED_STATUSES = frozenset({"open", "in_review", "resolved", "rejected"})

# Reason codes that the dispute UI exposes &mdash; the values are
# intentionally short identifiers; the human label lives in the
# frontend so it can be localised.
ALLOWED_REASON_CODES = frozenset(
    {
        "wrong_amount",
        "wrong_date",
        "duplicate_submission",
        "not_my_invoice",
        "vendor_misclassified",
        "extraction_error",
        "other",
    }
)


class DisputeCreatePayload(BaseModel):
    invoice_id: int = Field(..., gt=0)
    reason_code: str = Field(..., min_length=2, max_length=64)
    notes: Optional[str] = Field(None, max_length=2000)


class DisputeUpdatePayload(BaseModel):
    status: str = Field(..., min_length=2, max_length=20)
    resolution_notes: Optional[str] = Field(None, max_length=2000)


class DisputeResponse(BaseModel):
    id: int
    invoice_id: int
    reason_code: str
    status: str
    opened_by_user_id: Optional[int]
    notes: Optional[str]
    resolution_notes: Optional[str]
    resolved_at: Optional[str]
    created_at: Optional[str]


class DisputeListResponse(BaseModel):
    count: int
    disputes: List[DisputeResponse]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _serialise(dispute: Dispute) -> DisputeResponse:
    return DisputeResponse(
        id=dispute.id,
        invoice_id=dispute.invoice_id,
        reason_code=dispute.reason_code,
        status=dispute.status,
        opened_by_user_id=dispute.opened_by_user_id,
        notes=dispute.notes,
        resolution_notes=dispute.resolution_notes,
        resolved_at=dispute.resolved_at.isoformat() if dispute.resolved_at else None,
        created_at=dispute.created_at.isoformat() if dispute.created_at else None,
    )


def _enterprise_scoped_invoice_query(db: DBSession, user: User):
    """Return a base query filtered to invoices the user can see.

    Vendor users see invoices for their enterprise. Admins see all.
    """
    q = db.query(Invoice)
    if user.role == "admin":
        return q
    if user.enterprise_id is None:
        # No enterprise scoping &mdash; user can see nothing.
        return q.filter(Invoice.id == -1)
    return q.filter(Invoice.enterprise_id == user.enterprise_id)


def _ensure_invoice_in_scope(db: DBSession, user: User, invoice_id: int) -> Invoice:
    invoice = _enterprise_scoped_invoice_query(db, user).filter(
        Invoice.id == invoice_id
    ).one_or_none()
    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found or not in your enterprise",
        )
    return invoice


def _append_challan_event(
    db: DBSession,
    invoice_id: int,
    event_type: str,
    handler_actions: dict,
) -> ChallanEvent:
    row = ChallanEvent(
        invoice_id=invoice_id,
        event_type=event_type,
        handler_actions_json=json.dumps(handler_actions, sort_keys=True),
    )
    db.add(row)
    db.flush()
    return row


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/disputes", response_model=DisputeListResponse)
def list_disputes(
    db: DBSession = Depends(get_db),
    user: User = Depends(require_role("vendor", "admin")),
) -> DisputeListResponse:
    """List disputes scoped to the user's enterprise (admins see all)."""
    q = (
        db.query(Dispute)
        .join(Invoice, Dispute.invoice_id == Invoice.id)
    )
    if user.role != "admin":
        if user.enterprise_id is None:
            return DisputeListResponse(count=0, disputes=[])
        q = q.filter(Invoice.enterprise_id == user.enterprise_id)
    rows = q.order_by(Dispute.created_at.desc()).all()
    return DisputeListResponse(
        count=len(rows),
        disputes=[_serialise(r) for r in rows],
    )


@router.post(
    "/disputes",
    response_model=DisputeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_dispute(
    payload: DisputeCreatePayload,
    db: DBSession = Depends(get_db),
    user: User = Depends(require_role("vendor", "admin")),
) -> DisputeResponse:
    if payload.reason_code not in ALLOWED_REASON_CODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unknown reason_code '{payload.reason_code}'. "
                f"Allowed: {sorted(ALLOWED_REASON_CODES)}"
            ),
        )

    invoice = _ensure_invoice_in_scope(db, user, payload.invoice_id)

    # Block creating a second open dispute on the same invoice
    existing_open = (
        db.query(Dispute)
        .filter(
            Dispute.invoice_id == invoice.id,
            Dispute.status.in_(("open", "in_review")),
        )
        .first()
    )
    if existing_open is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice already has an open dispute (id={existing_open.id})",
        )

    dispute = Dispute(
        invoice_id=invoice.id,
        reason_code=payload.reason_code,
        status="open",
        opened_by_user_id=user.id,
        notes=payload.notes,
    )
    db.add(dispute)
    db.flush()

    _append_challan_event(
        db,
        invoice.id,
        event_type="disputed",
        handler_actions={
            "dispute_id": dispute.id,
            "reason_code": payload.reason_code,
            "opened_by_user_id": user.id,
            "via": "POST /api/disputes",
        },
    )

    db.commit()
    db.refresh(dispute)
    return _serialise(dispute)


@router.get("/disputes/{dispute_id}", response_model=DisputeResponse)
def get_dispute(
    dispute_id: int,
    db: DBSession = Depends(get_db),
    user: User = Depends(require_role("vendor", "admin")),
) -> DisputeResponse:
    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).one_or_none()
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found")
    # Enforce enterprise scope
    _ensure_invoice_in_scope(db, user, dispute.invoice_id)
    return _serialise(dispute)


@router.patch("/disputes/{dispute_id}", response_model=DisputeResponse)
def update_dispute(
    dispute_id: int,
    payload: DisputeUpdatePayload,
    db: DBSession = Depends(get_db),
    user: User = Depends(require_role("vendor", "admin")),
) -> DisputeResponse:
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid status '{payload.status}'. "
                f"Allowed: {sorted(ALLOWED_STATUSES)}"
            ),
        )

    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).one_or_none()
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found")

    invoice = _ensure_invoice_in_scope(db, user, dispute.invoice_id)

    prev_status = dispute.status
    dispute.status = payload.status
    if payload.resolution_notes is not None:
        dispute.resolution_notes = payload.resolution_notes
    if payload.status in {"resolved", "rejected"}:
        dispute.resolved_at = _utcnow_naive()

    db.add(dispute)
    db.flush()

    _append_challan_event(
        db,
        invoice.id,
        event_type="manual_override",
        handler_actions={
            "dispute_id": dispute.id,
            "previous_status": prev_status,
            "new_status": payload.status,
            "actor_user_id": user.id,
            "via": "PATCH /api/disputes/{id}",
        },
    )

    db.commit()
    db.refresh(dispute)
    return _serialise(dispute)


@router.delete(
    "/disputes/{dispute_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_dispute(
    dispute_id: int,
    db: DBSession = Depends(get_db),
    user: User = Depends(require_role("admin")),
) -> None:
    dispute = db.query(Dispute).filter(Dispute.id == dispute_id).one_or_none()
    if dispute is None:
        raise HTTPException(status_code=404, detail="Dispute not found")

    invoice_id = dispute.invoice_id
    db.delete(dispute)
    db.flush()

    _append_challan_event(
        db,
        invoice_id,
        event_type="manual_override",
        handler_actions={
            "dispute_id": dispute_id,
            "action": "deleted",
            "actor_user_id": user.id,
            "via": "DELETE /api/disputes/{id}",
        },
    )
    db.commit()
    return None
