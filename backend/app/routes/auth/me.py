"""Current-user endpoint.

GET /api/auth/me

Requires a valid session cookie. Used by the frontend RequireAuth
wrapper to decide whether to render the dashboard or redirect to the
sign-in page.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ...auth.dependencies import current_user
from ...models import User

router = APIRouter()


class MeResponse(BaseModel):
    id: int
    role: str
    email: str | None
    full_name: str | None
    email_verified: bool
    phone_verified: bool
    enterprise_id: int | None = None
    msme_id: int | None = None


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(current_user)) -> MeResponse:
    return MeResponse(
        id=user.id,
        role=user.role,
        email=user.primary_email,
        full_name=user.full_name,
        email_verified=bool(user.email_verified),
        phone_verified=bool(user.phone_verified),
        enterprise_id=user.enterprise_id,
        msme_id=user.msme_id,
    )
