"""Demo-session orchestration routes.

Endpoints:

* ``POST /api/demo/new-session`` — create a fresh demo session id.
* ``GET  /api/demo/qr`` — render a QR code PNG for any text payload.
* ``GET  /api/demo/health`` — lightweight health probe.

The router is exported as ``router`` for W10 to wire into ``main.py``.
"""
from __future__ import annotations

import io
import logging
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from ..services import demo_sessions
from ..services.demo_sessions import SessionAlreadyExists

logger = logging.getLogger(__name__)

router = APIRouter()

# Twilio WhatsApp Sandbox number + join code, as documented in the plan.
# Displayed on the landing page and baked into every wa.me deep link.
WHATSAPP_NUMBER = "+14155238886"
WHATSAPP_JOIN_CODE = "crop-conversation"


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class NewSessionResponse(BaseModel):
    session_id: str
    wa_link: str
    live_url: str
    whatsapp_number: str
    join_code: str


class HealthResponse(BaseModel):
    healthy: bool
    active_sessions: int
    whatsapp_number: str
    join_code: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_wa_link(join_code: str) -> str:
    """Return a wa.me deep link that pre-fills the sandbox join message."""
    # wa.me strips the leading '+' from numbers.
    number = WHATSAPP_NUMBER.lstrip("+")
    text = quote(f"join {join_code}")
    return f"https://wa.me/{number}?text={text}"


def _build_live_url(session_id: str) -> str:
    return f"/live?session={session_id}"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/demo/new-session", response_model=NewSessionResponse)
def new_session(custom_id: Optional[str] = Query(default=None, max_length=64)) -> NewSessionResponse:
    """Create a new demo session id.

    Accepts an optional ``custom_id`` query param so a Zoom host can
    pin a human-readable id like ``acme-corp``. Adversary 7926af6 #7 —
    a duplicate ``custom_id`` returns 409 instead of silently sharing
    the same in-memory bucket between two CFOs.
    """
    try:
        sid = demo_sessions.create_session(custom_id)
    except SessionAlreadyExists as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return NewSessionResponse(
        session_id=sid,
        wa_link=_build_wa_link(WHATSAPP_JOIN_CODE),
        live_url=_build_live_url(sid),
        whatsapp_number=WHATSAPP_NUMBER,
        join_code=WHATSAPP_JOIN_CODE,
    )


_QR_ALLOWED_PREFIXES = (
    "https://wa.me/",
    "https://trustaudit.in/",
    "https://www.trustaudit.in/",
    "https://trustaudit.onrender.com/",
    "https://trustaudit-wxd7.onrender.com/",
    "/live?session=",
    "/auth/",
)


@router.get("/demo/qr")
def demo_qr(
    text: str = Query(..., min_length=1, max_length=512, description="Payload to encode"),
    box_size: int = Query(default=10, ge=2, le=20),
    border: int = Query(default=2, ge=0, le=8),
) -> Response:
    """Render ``text`` as a QR code PNG.

    Adversary 7926af6 #11 — the QR text is restricted to a known-good
    prefix list so an attacker can't host a phishing QR on our domain
    pointing at their own URL.
    """
    if not text.startswith(_QR_ALLOWED_PREFIXES):
        raise HTTPException(
            status_code=400,
            detail="QR text must point at TrustAudit, a TrustAudit auth path, or wa.me/",
        )
    try:
        import qrcode  # type: ignore
        from qrcode.image.pil import PilImage  # type: ignore
    except ImportError as exc:  # pragma: no cover - deploy-time guard
        logger.warning("qrcode library missing: %s", exc)
        raise HTTPException(
            status_code=501,
            detail="QR generation unavailable: install qrcode[pil] on the server.",
        ) from exc

    try:
        qr = qrcode.QRCode(
            version=None,  # auto-fit
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=border,
        )
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(
            fill_color="#f8fafc",     # slate-50 (matches dashboard accent)
            back_color="#020617",     # slate-950 (matches app bg)
            image_factory=PilImage,
        )
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(
            content=buf.getvalue(),
            media_type="image/png",
            headers={
                # Short cache so the QR can be regenerated if the join
                # code rotates, but still avoids hammering the server.
                "Cache-Control": "public, max-age=60",
            },
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("QR generation failed")
        raise HTTPException(status_code=500, detail=f"QR generation failed: {exc}")


@router.get("/demo/health", response_model=HealthResponse)
def demo_health() -> HealthResponse:
    """Cheap health probe for UptimeRobot + the /live dashboard footer."""
    demo_sessions.prune_expired()
    return HealthResponse(
        healthy=True,
        active_sessions=demo_sessions.active_session_count(),
        whatsapp_number=WHATSAPP_NUMBER,
        join_code=WHATSAPP_JOIN_CODE,
    )
