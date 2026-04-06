"""Authenticated identity-linking routes.

Endpoints::

    GET    /api/auth/identities              → list the current user's linked providers
    POST   /api/auth/identities/google       → link a Google account to the current user
    DELETE /api/auth/identities/{identity_id}→ unlink (refuses if it's the last identity)

The ``current_user`` dependency lives in W5's ``auth.dependencies``
module. Until W5 lands it, we provide a local fallback dependency that
reads the session cookie directly via ``auth.sessions.load_session`` —
this lets the module import and tests run without W5 being ready.

Once W5 ships ``current_user``, the fallback below can remain as a
defensive backup (both return a :class:`User` instance) since the fleet
coordination is collaborative.

BLOCKED_ON_W5: prefers ``auth.dependencies.current_user`` but falls back
to a local cookie-based reader so this module is importable today.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...database import get_db
from ...models import User, UserIdentity
from ...auth.providers.google import (
    GoogleAuthError,
    GoogleNotConfigured,
    verify_google_id_token,
)

logger = logging.getLogger(__name__)

router = APIRouter()

SESSION_COOKIE_NAME = "trustaudit_session"


def _load_current_user(request: Request, db: DBSession) -> User:
    """Resolve the current user from the session cookie.

    Preference order:
      1. W5's ``auth.dependencies.current_user`` (if it exists).
      2. Local fallback that calls ``auth.sessions.load_session`` directly.
    """
    # Try W5's dependency first — it's a function, not a FastAPI dep here;
    # we call it manually to sidestep FastAPI's Depends resolution.
    try:
        from ...auth import dependencies as w5_deps  # BLOCKED_ON_W5

        fn = getattr(w5_deps, "current_user", None)
        if callable(fn):
            try:
                # If W5 provides a plain callable(request, db) we use it.
                result = fn(request=request, db=db)  # type: ignore[call-arg]
                if isinstance(result, User):
                    return result
            except TypeError:
                # Signature mismatch — fall through to the local reader.
                pass
    except ImportError:
        pass

    # Local fallback — keeps identities.py usable without W5.
    from ...auth.sessions import load_session  # BLOCKED_ON_W5

    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    session = load_session(db, raw_token)
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.query(User).filter(User.id == session.user_id).one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def _serialize_identity(identity: UserIdentity) -> dict:
    return {
        "id": identity.id,
        "provider": identity.provider,
        "provider_user_id": identity.provider_user_id,
        "email": identity.email,
        "phone": identity.phone,
        "linked_at": identity.linked_at.isoformat() if identity.linked_at else None,
    }


class LinkGoogleRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=8192)


@router.get("/identities")
def list_identities(request: Request, db: DBSession = Depends(get_db)):
    user = _load_current_user(request, db)
    rows = (
        db.query(UserIdentity)
        .filter(UserIdentity.user_id == user.id)
        .order_by(UserIdentity.linked_at.asc())
        .all()
    )
    return {"identities": [_serialize_identity(i) for i in rows]}


@router.post("/identities/google")
def link_google(
    payload: LinkGoogleRequest,
    request: Request,
    db: DBSession = Depends(get_db),
):
    user = _load_current_user(request, db)

    try:
        claims = verify_google_id_token(payload.id_token)
    except GoogleNotConfigured as exc:
        raise HTTPException(status_code=503, detail="Google sign-in not configured") from exc
    except GoogleAuthError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google sign-in token") from exc

    google_sub = str(claims["sub"])
    email = claims.get("email")

    # Reject if this Google account is already linked to a DIFFERENT user.
    existing = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.provider == "google",
            UserIdentity.provider_user_id == google_sub,
        )
        .one_or_none()
    )
    if existing is not None:
        if existing.user_id != user.id:
            raise HTTPException(
                status_code=409,
                detail="This Google account is already linked to another TrustAudit user.",
            )
        # Already linked to us — idempotent success.
        return {"identity": _serialize_identity(existing)}

    identity = UserIdentity(
        user_id=user.id,
        provider="google",
        provider_user_id=google_sub,
        email=email,
    )
    db.add(identity)
    db.flush()
    db.commit()
    return {"identity": _serialize_identity(identity)}


@router.delete("/identities/{identity_id}")
def unlink_identity(
    identity_id: int,
    request: Request,
    db: DBSession = Depends(get_db),
):
    user = _load_current_user(request, db)

    identity = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.id == identity_id,
            UserIdentity.user_id == user.id,
        )
        .one_or_none()
    )
    if identity is None:
        raise HTTPException(status_code=404, detail="Identity not found")

    count = (
        db.query(UserIdentity)
        .filter(UserIdentity.user_id == user.id)
        .count()
    )
    if count <= 1:
        raise HTTPException(
            status_code=400,
            detail="Cannot unlink your only remaining identity.",
        )

    db.delete(identity)
    db.commit()
    return {"ok": True}
