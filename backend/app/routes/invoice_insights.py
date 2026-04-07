"""Per-invoice insight endpoints — annotation overlay + tax justification.

Routes
------
* ``GET /api/invoices/{invoice_id}/annotation``
    Auth-gated. Returns the base64 PNG rendered by
    ``services.vision.annotator`` plus the structured box list, so the
    frontend can both display the raw PNG and overlay SVG labels.

* ``GET /api/invoices/{invoice_id}/justification``
    Auth-gated. Returns the deterministic JustificationPayload shaped
    by ``services.justification.build_justification`` — used by the
    InvoiceDetailSheet, the 3D canvas, and the smoke test.

Both endpoints share the same authorisation predicate used by the
compliance router: an invoice is visible to admins, to vendors of its
enterprise, and to drivers of its MSME. Anyone else gets 403.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ..auth.dependencies import current_user
from ..database import get_db
from ..models import Invoice, User
from ..services.justification import (
    build_justification,
    parse_edge_cases_json,
    parse_missing_fields_json,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["invoice-insights"])


# ---------------------------------------------------------------------------
# Authorisation
# ---------------------------------------------------------------------------
def _user_can_view_invoice(user: User, invoice: Invoice) -> bool:
    if user.role == "admin":
        return True
    if user.role == "vendor":
        return (
            user.enterprise_id is not None
            and user.enterprise_id == invoice.enterprise_id
        )
    if user.role == "driver":
        return user.msme_id is not None and user.msme_id == invoice.msme_id
    return False


def _load_or_403(
    db: DBSession, invoice_id: int, user: User
) -> Invoice:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).one_or_none()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if not _user_can_view_invoice(user, invoice):
        raise HTTPException(status_code=403, detail="Not authorised for this invoice")
    return invoice


# ---------------------------------------------------------------------------
# Annotation endpoint
# ---------------------------------------------------------------------------
class AnnotationBox(BaseModel):
    field_name: str
    value: str
    confidence: float
    x: int
    y: int
    w: int
    h: int
    color: str
    missing: bool = False


class AnnotationResponse(BaseModel):
    invoice_id: int
    image: str = Field(
        description="Data URL: data:image/png;base64,<payload>. "
        "Empty string when no annotation is available."
    )
    width: int
    height: int
    boxes: List[AnnotationBox]


@router.get(
    "/invoices/{invoice_id}/annotation",
    response_model=AnnotationResponse,
)
def get_invoice_annotation(
    invoice_id: int,
    db: DBSession = Depends(get_db),
    user: User = Depends(current_user),
) -> AnnotationResponse:
    invoice = _load_or_403(db, invoice_id, user)

    raw_b64 = invoice.annotated_image_b64 or ""
    boxes_raw = invoice.annotated_boxes_json or "[]"
    try:
        boxes_list = json.loads(boxes_raw)
    except json.JSONDecodeError:
        boxes_list = []

    parsed_boxes: List[AnnotationBox] = []
    for entry in boxes_list:
        if not isinstance(entry, dict):
            continue
        try:
            parsed_boxes.append(AnnotationBox(**entry))
        except Exception as exc:  # noqa: BLE001
            logger.debug("annotation box parse failed: %s", exc)
            continue

    if raw_b64:
        image_url = f"data:image/png;base64,{raw_b64}"
    else:
        image_url = ""

    return AnnotationResponse(
        invoice_id=invoice.id,
        image=image_url,
        width=int(invoice.annotated_width or 0),
        height=int(invoice.annotated_height or 0),
        boxes=parsed_boxes,
    )


# ---------------------------------------------------------------------------
# Justification endpoint
# ---------------------------------------------------------------------------
class FieldSummaryDTO(BaseModel):
    field_name: str
    label: str
    value: Optional[str]
    confidence: float
    impact_inr: float
    missing: bool


class RecommendationDTO(BaseModel):
    title: str
    rationale: str
    amount_inr: float
    edge_case: Optional[str] = None
    severity: str = "info"


class JustificationResponse(BaseModel):
    invoice_id: int
    confidence_score: float
    invoice_amount_inr: float
    deduction_estimate_inr: float
    total_recoverable_inr: float
    available_fields: List[FieldSummaryDTO]
    missing_fields: List[FieldSummaryDTO]
    recommendations: List[RecommendationDTO]


@router.get(
    "/invoices/{invoice_id}/justification",
    response_model=JustificationResponse,
)
def get_invoice_justification(
    invoice_id: int,
    db: DBSession = Depends(get_db),
    user: User = Depends(current_user),
) -> JustificationResponse:
    invoice = _load_or_403(db, invoice_id, user)

    # Derive per-field confidences from the annotated boxes when present.
    per_field_conf: Dict[str, float] = {}
    try:
        boxes_list: List[Dict[str, Any]] = json.loads(invoice.annotated_boxes_json or "[]")
        for entry in boxes_list:
            name = entry.get("field_name")
            conf = entry.get("confidence")
            if isinstance(name, str) and isinstance(conf, (int, float)):
                per_field_conf[name] = float(conf)
    except (json.JSONDecodeError, TypeError):
        pass

    # Shape the extracted field mapping for build_justification.
    extracted: Dict[str, Optional[str]] = {
        "vendor_name": invoice.vendor_name,
        "gstin": invoice.gstin if invoice.gstin and invoice.gstin != "PENDING" else None,
        "invoice_number": invoice.invoice_number,
        "invoice_amount": (
            f"{invoice.invoice_amount:.0f}" if invoice.invoice_amount else None
        ),
        "invoice_date": (
            invoice.invoice_date.isoformat() if invoice.invoice_date else None
        ),
        "date_of_acceptance": (
            invoice.date_of_acceptance.isoformat() if invoice.date_of_acceptance else None
        ),
    }

    missing = parse_missing_fields_json(invoice.missing_fields)
    edges = parse_edge_cases_json(invoice.detected_edge_cases)

    payload = build_justification(
        invoice_id=invoice.id,
        invoice_amount_inr=float(invoice.invoice_amount or 0.0),
        confidence_score=float(invoice.confidence_score or 0.0),
        extracted=extracted,
        field_confidences=per_field_conf,
        missing_fields=missing,
        edge_cases=edges,
    )

    return JustificationResponse(
        invoice_id=payload.invoice_id,
        confidence_score=payload.confidence_score,
        invoice_amount_inr=payload.invoice_amount_inr,
        deduction_estimate_inr=payload.deduction_estimate_inr,
        total_recoverable_inr=payload.total_recoverable_inr,
        available_fields=[FieldSummaryDTO(**asdict(f)) for f in payload.available_fields],
        missing_fields=[FieldSummaryDTO(**asdict(f)) for f in payload.missing_fields],
        recommendations=[RecommendationDTO(**asdict(r)) for r in payload.recommendations],
    )
