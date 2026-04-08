"""WhatsApp OTP routes.

Endpoints::

    POST /api/auth/otp/whatsapp/send     {phone, role}       → 200 {ok: true}
    POST /api/auth/otp/whatsapp/verify   {phone, code, role} → 200 {user}

Every send endpoint is rate-limited at 5 requests per 60 seconds per
phone number via the shared ``services.rate_limit.check`` helper. A 429
is returned when the limit is exceeded.

Phone/SMS OTP was removed with the Twilio pivot — we no longer ship a
phone-number signup path. Signup goes through Google OAuth, email magic
link, or WhatsApp OTP.

Errors:
- 400 on malformed phone.
- 401 on invalid OTP.
- 403 on role mismatch.
- 429 on rate limit.
- 503 if the provider is not configured.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...database import get_db
from ...models import User
from ...services import rate_limit
from ...auth.dependencies import set_session_cookie
from ...auth.sessions import create_session
from ...auth.providers.whatsapp_otp import (
    InvalidOTP,
    WhatsAppOtpError,
    send_whatsapp_otp,
    verify_whatsapp_otp,
    _normalize_phone,
)

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_ROLES = frozenset(("vendor", "driver"))


def _issue_session_cookie(
    db: DBSession, response: Response, user: User, request: Request
) -> None:
    """Create a session row + attach the canonical session cookie
    (Secure in prod — adversary 7926af6 #2).
    """
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    raw_token, _session = create_session(db, user, ip=ip, user_agent=user_agent)
    set_session_cookie(response, raw_token)


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "role": user.role,
        "email": user.primary_email,
        "phone": user.primary_phone_e164,
        "full_name": user.full_name,
        "phone_verified": bool(user.phone_verified),
    }


def _enforce_rate_limit(
    kind_label: str,
    raw_phone: str,
    request: Optional[Request] = None,
) -> None:
    """Rate-limit OTP requests by *normalized* phone (adversary 7926af6 #9)
    AND by client IP, so rotating the phone number does not bypass the
    bucket.

    Without normalization an attacker can rotate ``+919999999999``,
    ``+91 9999999999``, ``+91-9999999999`` and bypass the bucket.
    """
    try:
        phone = _normalize_phone(raw_phone)
    except Exception:
        # Malformed input will be rejected downstream — still rate-limit
        # the malformed-input attempts on the raw value so brute-forcers
        # don't get free passes.
        phone = (raw_phone or "").strip()
    ok = rate_limit.check(
        "phone",
        f"{kind_label}:{phone}",
        max_per_window=5,
        window_seconds=60,
    )
    if not ok:
        raise HTTPException(
            status_code=429,
            detail="Too many OTP requests. Please wait a minute and try again.",
        )
    if request is not None:
        client_ip = (request.client.host if request.client else "") or "unknown"
        ok_ip = rate_limit.check(
            "ip",
            f"{kind_label}:{client_ip}",
            max_per_window=20,  # 20/min per IP across all phones
            window_seconds=60,
        )
        if not ok_ip:
            raise HTTPException(
                status_code=429,
                detail="Too many OTP requests from this network. Please wait and try again.",
            )


class OtpSendRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    role: str = Field("vendor", pattern="^(vendor|driver)$")


class OtpVerifyRequest(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    code: str = Field(..., min_length=4, max_length=10)
    role: str = Field("vendor", pattern="^(vendor|driver)$")


# ---------------------------------------------------------------------------
# WhatsApp OTP
# ---------------------------------------------------------------------------
@router.post("/otp/whatsapp/send")
def otp_whatsapp_send(
    payload: OtpSendRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    _enforce_rate_limit("whatsapp_send", payload.phone, request=request)
    try:
        send_whatsapp_otp(db, payload.phone, purpose="whatsapp_otp")
    except InvalidOTP as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except WhatsAppOtpError as exc:
        logger.warning("WhatsApp OTP send failed: %s", exc)
        raise HTTPException(status_code=502, detail="WhatsApp OTP send failed") from exc
    db.commit()
    return {"ok": True}


@router.post("/otp/whatsapp/verify")
def otp_whatsapp_verify(
    payload: OtpVerifyRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    _enforce_rate_limit("whatsapp_verify", payload.phone, request=request)
    try:
        user, _created = verify_whatsapp_otp(
            db,
            payload.phone,
            payload.code,
            purpose="whatsapp_otp",
            default_role=payload.role,
        )
    except InvalidOTP as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired code") from exc

    if user.role != payload.role:
        other = "driver" if payload.role == "vendor" else "vendor"
        raise HTTPException(
            status_code=403,
            detail=f"Already registered as {user.role}. Use the {other} signin page.",
        )

    _issue_session_cookie(db, response, user, request)
    db.commit()
    return {"user": _serialize_user(user)}


# Phone (SMS) OTP endpoints were removed with the Twilio pivot.
# See backend/app/routes/auth/otp.py history if a non-Twilio SMS provider
# is reintroduced.
