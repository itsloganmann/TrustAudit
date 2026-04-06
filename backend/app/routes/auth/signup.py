"""Signup routes for vendors and drivers.

POST /api/auth/vendor/signup
POST /api/auth/driver/signup
    body: { email, password, full_name }

Both endpoints follow the same flow:
1. Rate-limit by client IP (10/min).
2. Call the password provider's signup.
3. Return 201 with { user_id, role, email_verified: False }.

No session cookie is set — the user must verify their email first.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...auth.providers.password import (
    EmailAlreadyExists,
    InvalidRoleError,
    SignupRequest,
    WeakPasswordError,
    signup as password_signup,
)
from ...database import get_db
from ...services import rate_limit as rl

logger = logging.getLogger(__name__)

router = APIRouter()

_RATE_MAX = 10
_RATE_WINDOW = 60


_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class SignupPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=_EMAIL_PATTERN)
    password: str = Field(min_length=8, max_length=256)
    full_name: str = Field(min_length=1, max_length=255)


class SignupResponse(BaseModel):
    user_id: int
    role: str
    email_verified: bool
    message: str


def _rate_limit_or_429(request: Request) -> None:
    ip = (request.client.host if request.client else "") or "unknown"
    if not rl.check("ip", ip, max_per_window=_RATE_MAX, window_seconds=_RATE_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, please slow down",
        )


def _do_signup(
    role: str,
    payload: SignupPayload,
    db: DBSession,
) -> SignupResponse:
    try:
        user = password_signup(
            db,
            SignupRequest(
                email=payload.email,
                password=payload.password,
                full_name=payload.full_name,
                role=role,
            ),
        )
    except EmailAlreadyExists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        )
    except WeakPasswordError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except InvalidRoleError as exc:  # pragma: no cover - guarded above
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    db.commit()
    return SignupResponse(
        user_id=user.id,
        role=user.role,
        email_verified=bool(user.email_verified),
        message="Account created. Check your email to verify.",
    )


@router.post(
    "/vendor/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def vendor_signup(
    payload: SignupPayload,
    request: Request,
    db: DBSession = Depends(get_db),
) -> SignupResponse:
    _rate_limit_or_429(request)
    return _do_signup("vendor", payload, db)


@router.post(
    "/driver/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def driver_signup(
    payload: SignupPayload,
    request: Request,
    db: DBSession = Depends(get_db),
) -> SignupResponse:
    _rate_limit_or_429(request)
    return _do_signup("driver", payload, db)
