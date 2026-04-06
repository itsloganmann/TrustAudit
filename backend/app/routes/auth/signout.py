"""Signout route.

POST /api/auth/signout

Revokes the current session row (sets ``revoked_at``) and clears the
``trustaudit_session`` cookie. Always succeeds — an unauthenticated
caller still gets a 200 so the frontend can reuse the same handler.
"""
from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from ...auth.dependencies import SESSION_COOKIE_NAME, clear_session_cookie
from ...auth.sessions import revoke_session
from ...database import get_db

router = APIRouter()


class SignoutResponse(BaseModel):
    signed_out: bool


@router.post("/signout", response_model=SignoutResponse)
def signout(
    response: Response,
    db: DBSession = Depends(get_db),
    trustaudit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> SignoutResponse:
    revoked = False
    if trustaudit_session:
        revoked = revoke_session(db, trustaudit_session)
        db.commit()
    clear_session_cookie(response)
    return SignoutResponse(signed_out=revoked)
