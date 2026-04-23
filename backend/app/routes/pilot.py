"""Pilot-program intake routes.

Endpoints
---------
* ``POST /api/pilot/applications`` — public, rate-limited form intake.
  Persists the row, fires a best-effort email to the founders, and
  returns the created record.
* ``GET  /api/pilot/applications`` — admin-token-guarded listing.

Rate limiting
-------------
Public POST is capped at 5 submissions per hour per client IP (using
the in-memory sliding-window limiter in :mod:`app.services.rate_limit`).
The limiter is hermetic to the test suite's ``reset_rate_limit_state``
helper so parallel tests can't poison each other.

Admin auth
----------
The GET endpoint requires an ``X-Admin-Token`` header whose value matches
``PILOT_ADMIN_TOKEN`` in the environment. If that env var is unset (or the
token is blank) the endpoint always 401s — no empty-string bypass.

Email notification
------------------
The founders' addresses are hard-coded here (``FOUNDER_NOTIFICATION_EMAILS``)
so an operator misconfiguration can't accidentally route the email to a
random external address. If the email provider blows up the request still
returns 201 — losing the form submission itself would be far worse than
losing the notification. Failures are logged with ``logger.warning``.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models import PilotApplication
from ..schemas import PilotApplicationCreate, PilotApplicationResponse
from ..services import rate_limit as rl

logger = logging.getLogger(__name__)

router = APIRouter(tags=["pilot"])


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Hard-coded founder recipients per spec — not configurable via env so a
# misconfigured deploy can't silently reroute the notification.
FOUNDER_NOTIFICATION_EMAILS: tuple[str, ...] = (
    "loganmann@ucsb.edu",
    "arnavbhardwaj@berkeley.edu",
)

# Rate limit: 5 submissions per hour per IP. The spec says "6th request
# from same IP in 1 hour" triggers the 429, so the bucket is exactly 5.
_RATE_LIMIT_MAX = 5
_RATE_LIMIT_WINDOW_SECONDS = 60 * 60  # 1 hour


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _client_ip(request: Request) -> str:
    """Return the best-available client IP.

    Respects ``X-Forwarded-For`` (first hop) when present because Render
    sits behind a reverse proxy; falls back to ``request.client.host``
    otherwise. We do NOT trust the raw header in production to bucket
    admin actions — this is only the rate-limit key for a public form,
    and the worst an attacker can do by spoofing it is increase their
    own quota, which is already cheap to re-raise.
    """
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        # "client, proxy1, proxy2" — take the leftmost entry.
        first = fwd.split(",")[0].strip()
        if first:
            return first
    client = request.client
    if client and client.host:
        return client.host
    return "unknown"


def _build_notification_body(app_row: PilotApplication) -> tuple[str, str]:
    """Return (subject, plain-text body) for the founder notification."""
    subject = f"New pilot application: {app_row.company_name}"
    created = (
        app_row.created_at.isoformat()
        if app_row.created_at is not None
        else "just now"
    )
    sectors = ", ".join(app_row.sectors or [])
    channels = ", ".join(app_row.proof_channels or [])
    body = (
        "A new pilot application just came in on trustaudit.in.\n"
        "\n"
        f"Company:           {app_row.company_name}\n"
        f"Contact:           {app_row.contact_name} ({app_row.role})\n"
        f"Email:             {app_row.contact_email}\n"
        f"Phone:             {app_row.phone or '-'}\n"
        f"AP volume tier:    {app_row.ap_volume_tier}\n"
        f"Sectors:           {sectors}\n"
        f"Proof channels:    {channels}\n"
        f"Submitted at:      {created}\n"
        "\n"
        "Biggest blocker:\n"
        f"{app_row.biggest_blocker}\n"
    )
    return subject, body


def _fire_founder_email(app_row: PilotApplication) -> None:
    """Best-effort notification to BOTH founders.

    Any provider failure is swallowed with a WARNING log; the request
    still returns 201. This is deliberate — we'd rather have the row
    saved and the email queue drained manually than tell a reviewer
    "try again in 5 minutes" because Resend is down.
    """
    from ..services import email as email_mod

    try:
        provider = email_mod.get_email_provider()
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("pilot: could not resolve email provider: %s", exc)
        return

    subject, text = _build_notification_body(app_row)
    # Plain-text HTML so every client renders predictably. No user-
    # controlled data lands in href="..." attributes so the render helper
    # isn't strictly needed here; we just escape via <pre>-style text.
    html = (
        "<p>A new pilot application just came in on trustaudit.in.</p>"
        "<pre style=\"font: 13px/1.5 ui-monospace, monospace; "
        "white-space: pre-wrap;\">" + _html_escape(text) + "</pre>"
    )

    for addr in FOUNDER_NOTIFICATION_EMAILS:
        try:
            provider.send(to=addr, subject=subject, html=html, text=text)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(
                "pilot: email send to %s failed (app_id=%s): %s",
                addr,
                app_row.id,
                exc,
            )


def _html_escape(value: str) -> str:
    """Minimal HTML escape so the plain-text body is safe to embed in
    a ``<pre>`` block without letting a submitted blocker inject markup."""
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _serialize(row: PilotApplication) -> Dict[str, Any]:
    """Turn a model row into the response payload shape.

    The SQLAlchemy JSON column already gives us real lists, so no manual
    decode step is needed.
    """
    return {
        "id": row.id,
        "company_name": row.company_name,
        "contact_name": row.contact_name,
        "role": row.role,
        "contact_email": row.contact_email,
        "phone": row.phone,
        "ap_volume_tier": row.ap_volume_tier,
        "sectors": list(row.sectors or []),
        "proof_channels": list(row.proof_channels or []),
        "biggest_blocker": row.biggest_blocker,
        "created_at": row.created_at,
    }


def _require_admin_token(x_admin_token: Optional[str]) -> None:
    """401 unless the supplied header equals ``PILOT_ADMIN_TOKEN``.

    Empty / missing env var always 401s (no empty-string bypass).
    """
    expected = os.environ.get("PILOT_ADMIN_TOKEN") or ""
    if not expected or not x_admin_token or x_admin_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin token required",
        )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post(
    "/pilot/applications",
    response_model=PilotApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_pilot_application(
    payload: PilotApplicationCreate,
    request: Request,
    db: DBSession = Depends(get_db),
) -> Dict[str, Any]:
    """Public intake — persist the row and notify the founders."""
    ip_key = _client_ip(request)
    if not rl.check(
        kind="ip",
        key=f"pilot:{ip_key}",
        max_per_window=_RATE_LIMIT_MAX,
        window_seconds=_RATE_LIMIT_WINDOW_SECONDS,
    ):
        logger.info("pilot: rate-limited IP=%s", ip_key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many pilot applications from this IP, try again later.",
        )

    row = PilotApplication(
        company_name=payload.company_name.strip(),
        contact_name=payload.contact_name.strip(),
        role=payload.role.strip(),
        contact_email=payload.contact_email.strip().lower(),
        phone=(payload.phone.strip() if payload.phone else None),
        ap_volume_tier=payload.ap_volume_tier,
        sectors=list(payload.sectors),
        proof_channels=list(payload.proof_channels),
        biggest_blocker=payload.biggest_blocker.strip(),
        source_ip=ip_key,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Best-effort notification — do NOT let this fail the request.
    try:
        _fire_founder_email(row)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("pilot: founder notification failed: %s", exc)

    return _serialize(row)


@router.get(
    "/pilot/applications",
    response_model=List[PilotApplicationResponse],
)
def list_pilot_applications(
    db: DBSession = Depends(get_db),
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
) -> List[Dict[str, Any]]:
    """Admin-only listing. Newest first."""
    _require_admin_token(x_admin_token)
    rows = (
        db.query(PilotApplication)
        .order_by(PilotApplication.created_at.desc(), PilotApplication.id.desc())
        .all()
    )
    return [_serialize(r) for r in rows]
