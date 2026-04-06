"""Email verification route.

GET /api/auth/verify-email?token=<raw>

Consumes the email_verify code, sets ``users.email_verified = True``,
and returns JSON describing the result. The frontend handles the
redirect to the sign-in page.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from ...auth.tokens import consume_code
from ...database import get_db
from ...models import User

logger = logging.getLogger(__name__)

router = APIRouter()


class VerifyEmailResponse(BaseModel):
    verified: bool
    role: str | None = None
    email: str | None = None
    message: str


@router.get("/verify-email", response_model=VerifyEmailResponse)
def verify_email(
    token: str = Query(min_length=8, max_length=256),
    db: DBSession = Depends(get_db),
) -> VerifyEmailResponse:
    row = consume_code(db, token, purpose="email_verify")
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification link invalid, expired, or already used",
        )
    user: User | None = None
    if row.user_id is not None:
        user = db.query(User).filter(User.id == row.user_id).one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token not linked to a valid user",
        )
    if not user.email_verified:
        user.email_verified = True
        db.add(user)
    db.commit()
    return VerifyEmailResponse(
        verified=True,
        role=user.role,
        email=user.primary_email,
        message="Email verified. You can now sign in.",
    )
