"""Read-only debug endpoints for the demo deployment.

Exposes the in-memory webhook ring buffer at
``GET /api/debug/recent-inbounds`` so an operator can answer
"did Twilio just hit me, and what happened?" without log access.

Returns at most 50 entries, newest-first. Each entry is a
shallow snapshot copy from `webhook_observability` — there is no
PII beyond the source phone number that the webhook itself
already accepted.

Security note: this endpoint is unauthenticated by design (it's
the only way to debug a misconfigured webhook from the outside).
The data it exposes is the same data the webhook receives — no
additional secrets are leaked.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..services import webhook_observability

router = APIRouter(tags=["debug"])


@router.get("/debug/recent-inbounds")
def recent_inbounds(limit: int = Query(20, ge=1, le=50)) -> dict:
    """Return the most recent inbound webhook hits, newest-first.

    Use this to verify that Twilio is forwarding messages to the
    deployed webhook URL. If this list is empty after a real
    WhatsApp send, the Twilio sandbox console webhook URL is not
    pointing to this Render service.
    """
    items = webhook_observability.snapshot(limit=limit)
    return {
        "count": len(items),
        "items": items,
    }
