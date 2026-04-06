"""Public read-only invoice feed for the ``/live`` demo dashboard.

This router powers ``GET /api/live/invoices?session=<id>``. It is
intentionally decoupled from the authenticated invoice routes in
``routes.py``: the public feed is scoped to the in-memory
``demo_sessions`` store, it anonymizes vendor names, and it only
returns rows from the last 10 minutes.

Exported as ``router`` so W10 can register it on ``main.py`` without
this module having any side effects at import time.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..services import demo_sessions

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class PublicInvoiceRow(BaseModel):
    """One anonymized row on the /live dashboard.

    All fields are optional to stay forward-compatible with whatever
    state the pipeline happens to push into the session store — the
    public feed is read-only so a permissive schema is fine.
    """

    session_id: str
    created_at: float
    vendor_display_name: str
    state: str = Field(default="PENDING")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    amount: float = Field(default=0.0)
    days_remaining: int = Field(default=0)
    invoice_number: str = Field(default="")
    gstin: str = Field(default="")

    # Explicitly allow extras so the pipeline can push richer fields.
    class Config:
        extra = "allow"


class PublicInvoiceListResponse(BaseModel):
    session_id: str
    count: int
    max_age_seconds: int
    invoices: List[dict]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/live/invoices", response_model=PublicInvoiceListResponse)
def list_public_invoices(
    session: str = Query(..., min_length=1, max_length=64, description="Demo session id"),
    max_age: int = Query(
        demo_sessions.DEFAULT_MAX_AGE_SECONDS,
        ge=30,
        le=3600,
        description="Max row age in seconds (30s to 1h)",
    ),
) -> PublicInvoiceListResponse:
    """List anonymized rows for a demo session.

    We don't 404 on unknown sessions — the frontend creates the
    session id client-side before its first poll, so we just return an
    empty list and let the dashboard render its empty state.
    """
    # Opportunistic cleanup so long-running servers don't leak rows.
    demo_sessions.prune_expired()

    rows = demo_sessions.list_recent(session, max_age_seconds=max_age)
    return PublicInvoiceListResponse(
        session_id=session,
        count=len(rows),
        max_age_seconds=max_age,
        invoices=rows,
    )


@router.post("/live/invoices/{session}/_seed_demo")
def seed_demo_row(session: str) -> dict:
    """Dev-only helper: push a synthetic row into a session.

    Lets a CFO on a Zoom call with a flaky WhatsApp provider still see
    motion on the dashboard. Intentionally unauthenticated because the
    whole demo surface is public. W10 can gate this behind an env var
    in production if needed.
    """
    if not session:
        raise HTTPException(status_code=400, detail="session is required")
    import random
    import time as _time

    vendors = [
        "Bharat Industries",
        "Gupta Steel",
        "Hyderabad Pharma",
        "Alpha Textiles",
        "Delta Logistics",
    ]
    demo_sessions.append_invoice(
        session,
        {
            "vendor_name": random.choice(vendors),
            "state": random.choice(["PENDING", "VERIFYING", "VERIFIED", "NEEDS_INFO"]),
            "confidence": round(random.uniform(0.72, 0.98), 2),
            "amount": random.randint(50_000, 500_000),
            "days_remaining": random.randint(1, 44),
            "invoice_number": f"INV-{random.randint(1000, 9999)}",
            "gstin": "29ABCDE1234F1Z5",
            "created_at": _time.time(),
        },
    )
    return {"ok": True, "session": session}
