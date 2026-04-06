"""Email + password auth provider.

Signup flow:
1. Validate the email is not already taken (``users.primary_email``).
2. Hash the password with bcrypt.
3. Create ``User(role=..., email_verified=False)``.
4. Create ``UserIdentity(provider='password')``.
5. Generate an ``email_verify`` verification code (24h TTL).
6. Send the verification email via the configured email provider.

Signin flow:
1. Look up user by email (case-insensitive).
2. Verify role matches the requested signin path (vendor vs driver).
3. Verify password with bcrypt (constant-time).
4. Require ``email_verified`` to be True.
5. Return user. Route layer creates the session cookie.

Errors are raised as typed exceptions so routes can map them to HTTP
status codes cleanly without leaking details.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from ...models import User, UserIdentity
from ...services.email import send_verify_email
from ..passwords import hash_password, verify_password
from ..tokens import generate_code

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# Public DTOs
# ---------------------------------------------------------------------
@dataclass
class SignupRequest:
    email: str
    password: str
    full_name: str
    role: str  # 'vendor' | 'driver'
    enterprise_id: Optional[int] = None
    msme_id: Optional[int] = None


@dataclass
class SigninRequest:
    email: str
    password: str
    role: str | None = None  # if set, the user's role MUST match this


# ---------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------
class AuthError(Exception):
    """Base class for all auth errors raised by providers."""


class EmailAlreadyExists(AuthError):
    """Signup with an email that's already registered."""


class InvalidCredentials(AuthError):
    """Wrong email or password on signin."""


class EmailNotVerified(AuthError):
    """Signin attempted before email verification."""


class WrongRoleError(AuthError):
    """User exists but under a different role than the signin path."""


class InvalidRoleError(AuthError):
    """Caller passed a role that isn't ``vendor`` or ``driver``."""


class WeakPasswordError(AuthError):
    """Password didn't meet the minimum length."""


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------
_ALLOWED_SIGNUP_ROLES = frozenset({"vendor", "driver"})
_MIN_PASSWORD_LENGTH = 8


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _lookup_user_by_email(db: DBSession, email: str) -> Optional[User]:
    """Case-insensitive lookup by primary_email."""
    normalized = _normalize_email(email)
    if not normalized:
        return None
    return (
        db.query(User)
        .filter(User.primary_email == normalized)
        .one_or_none()
    )


def _frontend_base_url() -> str:
    """URL the verification link should point at. Overridable via env."""
    return os.environ.get("TRUSTAUDIT_APP_BASE_URL", "http://localhost:5173").rstrip(
        "/"
    )


# ---------------------------------------------------------------------
# signup
# ---------------------------------------------------------------------
def signup(db: DBSession, req: SignupRequest) -> User:
    """Create a new user with password auth and send a verification email.

    Raises:
        EmailAlreadyExists: another user has this email.
        WeakPasswordError:  password shorter than 8 characters.
        InvalidRoleError:   role is not in ``{'vendor','driver'}``.
    """
    role = (req.role or "").strip().lower()
    if role not in _ALLOWED_SIGNUP_ROLES:
        raise InvalidRoleError(f"role must be vendor or driver, got {req.role!r}")
    if not req.password or len(req.password) < _MIN_PASSWORD_LENGTH:
        raise WeakPasswordError(
            f"password must be at least {_MIN_PASSWORD_LENGTH} characters"
        )

    email = _normalize_email(req.email)
    if not email:
        raise InvalidCredentials("email is required")

    existing = _lookup_user_by_email(db, email)
    if existing is not None:
        raise EmailAlreadyExists(email)

    user = User(
        role=role,
        enterprise_id=req.enterprise_id,
        msme_id=req.msme_id,
        primary_email=email,
        full_name=(req.full_name or "").strip() or None,
        pwd_hash=hash_password(req.password),
        email_verified=False,
    )
    db.add(user)
    db.flush()  # assign user.id

    identity = UserIdentity(
        user_id=user.id,
        provider="password",
        email=email,
    )
    db.add(identity)
    db.flush()

    # Generate the verification code and email the link.
    raw_code = generate_code(
        db,
        user=user,
        channel="email",
        destination=email,
        purpose="email_verify",
    )
    verify_url = f"{_frontend_base_url()}/auth/verify-email?token={raw_code}"
    try:
        send_verify_email(
            to=email,
            verify_url=verify_url,
            full_name=user.full_name or "there",
        )
    except Exception:
        # Don't let a flaky email provider break signup — log and move on.
        # The user can request a resend from the signin page.
        logger.exception("Failed to send verification email to %s", email)

    return user


# ---------------------------------------------------------------------
# signin
# ---------------------------------------------------------------------
def signin(db: DBSession, req: SigninRequest) -> User:
    """Authenticate an existing user by email + password.

    Raises:
        InvalidCredentials: user missing or password wrong.
        EmailNotVerified:   user exists but hasn't verified email yet.
        WrongRoleError:     role mismatch for the requested signin path.
    """
    email = _normalize_email(req.email)
    if not email or not req.password:
        raise InvalidCredentials("email and password are required")

    user = _lookup_user_by_email(db, email)
    # Constant-time-ish comparison: always run verify_password to avoid
    # leaking whether the email exists via timing.
    stored_hash = user.pwd_hash if user is not None else None
    ok = verify_password(req.password, stored_hash)

    if user is None or not ok:
        raise InvalidCredentials("invalid email or password")

    if req.role is not None and user.role != req.role:
        raise WrongRoleError(
            f"account role is {user.role!r}; please use the {user.role} signin page"
        )

    if not user.email_verified:
        raise EmailNotVerified("email not yet verified — check your inbox")

    return user
