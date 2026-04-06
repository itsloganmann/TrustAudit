"""POST /api/auth/oauth/facebook — Facebook Login sign-in.

Request body::

    {
      "access_token": "<Facebook user access token from JS SDK>",
      "role": "vendor" | "driver"
    }

Response on success::

    200 {"user": {"id": ..., "role": ..., "email": ..., "full_name": ...}}

Errors:
- 401 on invalid / unverifiable token.
- 403 on role mismatch.
- 503 when ``FACEBOOK_APP_ID`` env var is not set.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...database import get_db
from ...models import User
from ...auth.dependencies import set_session_cookie
from ...auth.sessions import create_session
from ...auth.providers.facebook import (
    FacebookAuthError,
    FacebookNotConfigured,
    signin_with_facebook,
)

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_ROLES = frozenset(("vendor", "driver"))


def _issue_session_cookie(
    db: DBSession, response: Response, user: User, request: Request
) -> None:
    """Create a DB session row and attach the httpOnly cookie via the
    canonical helper (sets ``Secure`` in prod — adversary 7926af6 #2).
    """
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    raw_token, _session = create_session(db, user, ip=ip, user_agent=user_agent)
    set_session_cookie(response, raw_token)


class FacebookSigninRequest(BaseModel):
    access_token: str = Field(..., min_length=1, max_length=8192)
    role: str = Field("vendor", pattern="^(vendor|driver)$")


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "role": user.role,
        "email": user.primary_email,
        "full_name": user.full_name,
        "email_verified": bool(user.email_verified),
    }


@router.post("/oauth/facebook")
def oauth_facebook(
    payload: FacebookSigninRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="role must be 'vendor' or 'driver'")

    try:
        user, _created = signin_with_facebook(
            db,
            payload.access_token,
            default_role=payload.role,
        )
    except FacebookNotConfigured as exc:
        logger.info("Facebook OAuth not configured: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Facebook login not configured yet. "
                "Set FACEBOOK_APP_ID (and optionally FACEBOOK_APP_SECRET) in the backend env."
            ),
        ) from exc
    except FacebookAuthError as exc:
        logger.info("Facebook token rejected: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Facebook sign-in token") from exc

    if user.role != payload.role:
        other = "driver" if payload.role == "vendor" else "vendor"
        raise HTTPException(
            status_code=403,
            detail=(
                f"Already registered as {user.role}. Use the {other} signin page."
            ),
        )

    _issue_session_cookie(db, response, user, request)
    db.commit()
    return {"user": _serialize_user(user)}
