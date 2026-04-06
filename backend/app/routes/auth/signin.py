"""Signin routes for vendors and drivers.

POST /api/auth/vendor/signin
POST /api/auth/driver/signin
    body: { email, password }

On success:
- 200 with { user: { id, full_name, role } }
- ``trustaudit_session`` httpOnly cookie set
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...auth.dependencies import set_session_cookie
from ...auth.providers.password import (
    EmailNotVerified,
    InvalidCredentials,
    SigninRequest,
    WrongRoleError,
    signin as password_signin,
)
from ...auth.sessions import create_session
from ...database import get_db
from ...services import rate_limit as rl

logger = logging.getLogger(__name__)

router = APIRouter()

_RATE_MAX = 10
_RATE_WINDOW = 60


_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class SigninPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=1, max_length=256)


class UserDTO(BaseModel):
    id: int
    full_name: str | None
    role: str
    email: str | None
    enterprise_id: int | None = None
    msme_id: int | None = None
    email_verified: bool = False


class SigninResponse(BaseModel):
    user: UserDTO


def _rate_limit_or_429(request: Request) -> None:
    ip = (request.client.host if request.client else "") or "unknown"
    if not rl.check("ip", ip, max_per_window=_RATE_MAX, window_seconds=_RATE_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, please slow down",
        )


def _do_signin(
    role: str,
    payload: SigninPayload,
    request: Request,
    response: Response,
    db: DBSession,
) -> SigninResponse:
    try:
        user = password_signin(
            db,
            SigninRequest(
                email=payload.email,
                password=payload.password,
                role=role,
            ),
        )
    except InvalidCredentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    except WrongRoleError:
        # Adversary 7926af6 #13 — collapse role-mismatch into the same
        # 401 as a bad password so the endpoint is not a password-
        # correctness oracle for accounts in the *other* role. The
        # `/me` page on a successful signin is the right place to
        # surface "wrong page" guidance.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    except EmailNotVerified as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
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


@router.post("/vendor/signin", response_model=SigninResponse)
def vendor_signin(
    payload: SigninPayload,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
) -> SigninResponse:
    _rate_limit_or_429(request)
    return _do_signin("vendor", payload, request, response, db)


@router.post("/driver/signin", response_model=SigninResponse)
def driver_signin(
    payload: SigninPayload,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
) -> SigninResponse:
    _rate_limit_or_429(request)
    return _do_signin("driver", payload, request, response, db)
