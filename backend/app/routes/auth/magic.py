"""Email magic-link routes.

POST /api/auth/magic/request
    body: { email, role }
    Sends a passwordless sign-in link to the email.

GET  /api/auth/magic/consume?token=<raw>
    Consumes the token, creates a session, sets the cookie,
    returns JSON { user: {...} }. Frontend handles redirect.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...auth.dependencies import set_session_cookie
from ...auth.providers.email_magic import (
    InvalidMagicLinkToken,
    consume_magic_link,
    request_magic_link,
)
from ...auth.providers.password import (
    AuthError,
    InvalidRoleError,
    WrongRoleError,
)
from ...auth.sessions import create_session
from ...database import get_db
from ...services import rate_limit as rl

from .signin import SigninResponse, UserDTO

logger = logging.getLogger(__name__)

router = APIRouter()

_RATE_MAX = 5  # magic links are more sensitive than signup attempts
_RATE_WINDOW = 60


_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class MagicRequestPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=_EMAIL_PATTERN)
    role: str = Field(pattern=r"^(vendor|driver)$")


class MagicRequestResponse(BaseModel):
    sent: bool
    message: str


def _rate_limit_or_429(request: Request) -> None:
    ip = (request.client.host if request.client else "") or "unknown"
    if not rl.check("ip", ip, max_per_window=_RATE_MAX, window_seconds=_RATE_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many magic-link requests — try again in a minute",
        )


@router.post("/magic/request", response_model=MagicRequestResponse)
def magic_request(
    payload: MagicRequestPayload,
    request: Request,
    db: DBSession = Depends(get_db),
) -> MagicRequestResponse:
    _rate_limit_or_429(request)
    try:
        request_magic_link(db, payload.email, payload.role)
    except WrongRoleError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        )
    except InvalidRoleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception:
        logger.exception("magic/request failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email provider temporarily unavailable",
        )
    db.commit()
    return MagicRequestResponse(
        sent=True,
        message="Check your email for the sign-in link (valid 15 minutes).",
    )


@router.get("/magic/consume", response_model=SigninResponse)
def magic_consume(
    request: Request,
    response: Response,
    token: str = Query(min_length=8, max_length=256),
    db: DBSession = Depends(get_db),
) -> SigninResponse:
    try:
        user = consume_magic_link(db, token)
    except InvalidMagicLinkToken as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    ip = (request.client.host if request.client else "") or None
    user_agent = request.headers.get("user-agent")
    raw_token, _session = create_session(db, user, ip=ip, user_agent=user_agent)
    db.commit()
    set_session_cookie(response, raw_token)
    return SigninResponse(
        user=UserDTO(
            id=user.id,
            full_name=user.full_name,
            role=user.role,
            email=user.primary_email,
            enterprise_id=user.enterprise_id,
            msme_id=user.msme_id,
            email_verified=bool(user.email_verified),
        )
    )
