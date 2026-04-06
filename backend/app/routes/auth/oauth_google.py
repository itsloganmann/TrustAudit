"""POST /api/auth/oauth/google — ID-token-based Google sign-in.

Request body::

    {
      "id_token": "<JWT issued by Google Identity Services>",
      "role": "vendor" | "driver"
    }

Response on success::

    200 {"user": {"id": ..., "role": ..., "email": ..., "full_name": ...}}

Role enforcement:
- If we upsert a brand-new user, they take the requested ``role``.
- If we link to an existing user whose role differs from the request,
  return 403 with a friendly message pointing at the other signin page.

Errors:
- 401 on invalid / expired / untrusted token.
- 403 on role mismatch.
- 503 when ``GOOGLE_OAUTH_CLIENT_ID`` env var is not set.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...database import get_db
from ...models import User
from ...auth.providers.google import (
    GoogleAuthError,
    GoogleNotConfigured,
    signin_with_google,
)

# Cookie + session name is shared across all auth routes in this partition.
# Keep in sync with W5's cookie reader in ``auth/dependencies.py``.
SESSION_COOKIE_NAME = "trustaudit_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days — matches sessions.SESSION_TTL


def _issue_session_cookie(
    db: DBSession,
    response: Response,
    user: User,
    request: Request,
) -> None:
    """Create a DB session row and attach the httpOnly cookie to ``response``.

    Delegates to W5's ``auth.sessions.create_session``. Lazy-imported to
    avoid blowing up this module's import if W5 hasn't landed it yet.
    """
    from ...auth.sessions import create_session  # BLOCKED_ON_W5

    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    raw_token, _session = create_session(db, user, ip=ip, user_agent=user_agent)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        secure=False,  # dev — W5 flips to True when BASE_URL is https
        samesite="lax",
        path="/",
    )

logger = logging.getLogger(__name__)

router = APIRouter()

VALID_ROLES = frozenset(("vendor", "driver"))


class GoogleSigninRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=8192)
    role: str = Field("vendor", pattern="^(vendor|driver)$")


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "role": user.role,
        "email": user.primary_email,
        "full_name": user.full_name,
        "email_verified": bool(user.email_verified),
    }


@router.post("/oauth/google")
def oauth_google(
    payload: GoogleSigninRequest,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
):
    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="role must be 'vendor' or 'driver'")

    try:
        user, _created = signin_with_google(
            db,
            payload.id_token,
            default_role=payload.role,
        )
    except GoogleNotConfigured as exc:
        logger.info("Google OAuth not configured: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured on this server yet.",
        ) from exc
    except GoogleAuthError as exc:
        logger.info("Google ID token rejected: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Google sign-in token") from exc

    # Role-mismatch guard.
    if user.role != payload.role:
        other = "driver" if payload.role == "vendor" else "vendor"
        raise HTTPException(
            status_code=403,
            detail=(
                f"Already registered as {user.role}. Use the {other} signin page."
            ),
        )

    # Create a session and set the httpOnly cookie.
    _issue_session_cookie(db, response, user, request)
    db.commit()
    return {"user": _serialize_user(user)}
