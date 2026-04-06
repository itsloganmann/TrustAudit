"""Email magic-link (passwordless) auth provider.

Flow:
1. ``request_magic_link(email, role)``
   - Find existing user by email or create a new one with this role.
   - If existing user has a different role, raise ``WrongRoleError``.
   - Generate a magic-link token (15-min TTL, single-use).
   - Send the link via the email provider.
2. ``consume_magic_link(raw_code)``
   - Look up the code, verify not expired / not already consumed.
   - Mark the user ``email_verified = True`` (click proves ownership of
     the mailbox).
   - Ensure a ``UserIdentity(provider='email_magic')`` exists.
   - Return the user.

The route layer creates the session cookie after ``consume_magic_link``
succeeds.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from ...models import User, UserIdentity
from ...services.email import send_magic_link
from ..tokens import consume_code, generate_code
from .password import (
    AuthError,
    InvalidRoleError,
    WrongRoleError,
    _frontend_base_url,
    _normalize_email,
)

logger = logging.getLogger(__name__)


class MagicLinkError(AuthError):
    """Generic magic-link failure (invalid / expired / consumed)."""


class InvalidMagicLinkToken(MagicLinkError):
    """Token not found, already used, or expired."""


_ALLOWED_ROLES = frozenset({"vendor", "driver"})


def _find_existing_user(db: DBSession, email: str, role: str) -> Optional[User]:
    """Locate an existing user for a magic-link request.

    Adversary 7926af6 #10 — we MUST NOT auto-create a user row inside
    ``request_magic_link``. An attacker can otherwise pollute the
    ``users`` table with arbitrary email addresses (spam, occupying
    namespaces, denial-of-signup). The user is created lazily during
    ``consume_magic_link`` if and only if a real user clicks the link.
    """
    normalized = _normalize_email(email)
    existing = (
        db.query(User)
        .filter(User.primary_email == normalized)
        .one_or_none()
    )
    if existing is not None and existing.role != role:
        raise WrongRoleError(
            f"account role is {existing.role!r}; please use the {existing.role} sign-in"
        )
    return existing


def request_magic_link(db: DBSession, email: str, role: str) -> None:
    """Send a passwordless sign-in link to ``email``.

    Adversary 7926af6 #10 — we silently no-op for unknown emails
    instead of creating a user row. This trades email enumeration
    (already exposed by the signup flow) for not letting attackers
    pollute the users table with arbitrary addresses.

    Raises:
        InvalidRoleError: role isn't ``vendor`` or ``driver``.
        WrongRoleError:   user exists but with a different role.
    """
    role = (role or "").strip().lower()
    if role not in _ALLOWED_ROLES:
        raise InvalidRoleError(f"role must be vendor or driver, got {role!r}")

    normalized = _normalize_email(email)
    if not normalized:
        raise AuthError("email is required")

    user = _find_existing_user(db, normalized, role)
    if user is None:
        # No row exists for this email — silently succeed so the API
        # doesn't act as a presence oracle. The user must sign up first.
        logger.info("magic-link request for unknown email %s — silently dropped", normalized)
        return

    raw_code = generate_code(
        db,
        user=user,
        channel="email",
        destination=normalized,
        purpose="email_magic",
    )
    magic_url = f"{_frontend_base_url()}/auth/magic/consume?token={raw_code}"
    try:
        send_magic_link(
            to=normalized,
            magic_url=magic_url,
            full_name=user.full_name or "there",
        )
    except Exception:
        logger.exception("Failed to send magic link to %s", normalized)
        raise


def consume_magic_link(db: DBSession, raw_code: str) -> User:
    """Validate and consume a magic-link token. Returns the authenticated user.

    Raises:
        InvalidMagicLinkToken: token missing, expired, or already used.
    """
    if not raw_code:
        raise InvalidMagicLinkToken("missing token")

    row = consume_code(db, raw_code, purpose="email_magic")
    if row is None:
        raise InvalidMagicLinkToken("invalid, expired, or already-used token")

    # row.user_id should be set (we always create a user first).
    if row.user_id is None:
        raise InvalidMagicLinkToken("token has no associated user")

    user = db.query(User).filter(User.id == row.user_id).one_or_none()
    if user is None:
        raise InvalidMagicLinkToken("user no longer exists")

    # Clicking the magic link proves ownership of the mailbox.
    if not user.email_verified:
        user.email_verified = True
        db.add(user)

    # Ensure an email_magic identity row exists.
    existing_identity = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.user_id == user.id,
            UserIdentity.provider == "email_magic",
        )
        .one_or_none()
    )
    if existing_identity is None:
        db.add(
            UserIdentity(
                user_id=user.id,
                provider="email_magic",
                email=user.primary_email,
            )
        )
    db.flush()
    return user
