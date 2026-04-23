"""Admin-gated debug endpoint for the deployed webhook.

Exposes the in-memory webhook ring buffer at
``GET /api/debug/recent-inbounds`` so an operator can answer
"did the inbound webhook fire and what payload arrived?"
without Render log access.

Security: this endpoint requires an ``X-Admin-Token`` header whose
value matches ``ADMIN_TOKEN`` in the environment. If that env var is
unset or blank, every request 401s (no empty-string bypass). The
previous implementation was unauthenticated, which leaked sender
phone numbers and raw message previews to anyone who guessed the
URL. PII must stay behind the admin token.
"""
from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Header, HTTPException, Query, status

from ..services import webhook_observability

router = APIRouter(tags=["debug"])


def _require_admin(x_admin_token: str | None) -> None:
    expected = os.getenv("ADMIN_TOKEN", "").strip()
    supplied = (x_admin_token or "").strip()
    if not expected or not supplied:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="admin token required",
        )
    if not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="admin token invalid",
        )


@router.get("/debug/recent-inbounds")
def recent_inbounds(
    limit: int = Query(20, ge=1, le=50),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> dict:
    """Return the most recent inbound webhook hits, newest-first.

    Admin-only. Pass the operator's ``ADMIN_TOKEN`` as an
    ``X-Admin-Token`` header. Used to verify the baileys/twilio
    webhook is forwarding traffic correctly.
    """
    _require_admin(x_admin_token)
    items = webhook_observability.snapshot(limit=limit)
    return {
        "count": len(items),
        "items": items,
    }
