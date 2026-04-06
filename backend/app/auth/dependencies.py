"""FastAPI dependencies for protected routes.

Exports:
- ``SESSION_COOKIE_NAME`` — the cookie name used everywhere.
- ``current_user`` — raises 401 if no valid session.
- ``current_user_optional`` — returns ``None`` for unauthenticated requests.
- ``require_role(*roles)`` — factory returning a dependency that 403s when
  the signed-in user's role isn't in the allow-list.
- ``set_session_cookie`` / ``clear_session_cookie`` — cookie helpers
  shared by every ``/api/auth/*`` route.

Every call to ``current_user`` / ``current_user_optional`` that succeeds
calls ``touch_session`` to update ``last_seen_at``.
"""
from __future__ import annotations

import logging
import os
from typing import Awaitable, Callable, Optional

from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models import User
from .sessions import SESSION_TTL, load_session, touch_session

logger = logging.getLogger(__name__)

SESSION_COOKIE_NAME = "trustaudit_session"


def _extract_token(
    request: Request,
    cookie_value: str | None,
) -> str | None:
    """Prefer explicit cookie param, fall back to request.cookies.

    FastAPI's ``Cookie(None)`` already reads the cookie, but this helper
    makes tests that bypass the framework easier to reason about.
    """
    if cookie_value:
        return cookie_value
    return request.cookies.get(SESSION_COOKIE_NAME)


async def current_user(
    request: Request,
    db: DBSession = Depends(get_db),
    trustaudit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> User:
    """Return the signed-in user or raise 401.

    Touches ``last_seen_at`` on success.
    """
    token = _extract_token(request, trustaudit_session)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    session = load_session(db, token)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalid or expired",
        )
    user = db.query(User).filter(User.id == session.user_id).one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )
    try:
        touch_session(db, session)
        user.last_seen_at = session.last_seen_at
        db.add(user)
        db.flush()
    except Exception:  # pragma: no cover - defensive
        logger.debug("touch_session failed", exc_info=True)
    return user


async def current_user_optional(
    request: Request,
    db: DBSession = Depends(get_db),
    trustaudit_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Optional[User]:
    """Like ``current_user`` but returns None instead of raising."""
    token = _extract_token(request, trustaudit_session)
    if not token:
        return None
    session = load_session(db, token)
    if session is None:
        return None
    user = db.query(User).filter(User.id == session.user_id).one_or_none()
    if user is None:
        return None
    try:
        touch_session(db, session)
    except Exception:  # pragma: no cover
        logger.debug("touch_session failed", exc_info=True)
    return user


def _is_prod() -> bool:
    """True when we should set ``Secure`` on the session cookie."""
    env = os.environ.get("TRUSTAUDIT_ENV", "").strip().lower()
    if env in {"prod", "production"}:
        return True
    # Also mark Secure in explicit Render deployments.
    if os.environ.get("RENDER") == "true":
        return True
    return False


def set_session_cookie(response: Response, raw_token: str) -> None:
    """Attach the ``trustaudit_session`` cookie to ``response``.

    - ``HttpOnly`` — JS cannot read it.
    - ``Secure`` — only sent over HTTPS in prod.
    - ``SameSite=Lax`` — CSRF defense for the cross-site GET case.
    - ``Max-Age`` aligned with session TTL so browsers drop it client-side.

    TODO: add a CSRF token (double-submit cookie pattern) for
    cross-origin state-changing scenarios. SameSite=Lax covers the
    demo scope.
    """
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        secure=_is_prod(),
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    """Delete the session cookie on signout."""
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        samesite="lax",
        httponly=True,
        secure=_is_prod(),
    )


def require_role(*allowed: str) -> Callable[..., Awaitable[User]]:
    """Dependency factory — use like ``Depends(require_role('vendor'))``.

    403s when the signed-in user's role is not in ``allowed``.
    """
    if not allowed:
        raise ValueError("require_role needs at least one allowed role")

    allowed_set = frozenset(allowed)

    async def _dep(user: User = Depends(current_user)) -> User:
        if user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(sorted(allowed_set))}",
            )
        return user

    return _dep
