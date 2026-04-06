"""WhatsApp OTP provider — 6-digit code delivered via our WhatsApp adapter.

Flow:
1. ``send_whatsapp_otp(db, phone, purpose)`` — generates a 6-digit code
   via ``auth.tokens.generate_code``, sends it over WhatsApp via the W2
   provider layer, and returns (does not leak the code to the caller).
2. ``verify_whatsapp_otp(db, phone, code, purpose)`` — consumes the code
   via ``auth.tokens.consume_code``, verifies the destination matches,
   upserts a ``User`` by phone, creates a ``UserIdentity(provider='whatsapp_otp')``
   link row, and returns the user.

SECURITY:
- ``generate_code`` / ``consume_code`` handle hashing, TTL, attempt cap,
  and the consumed_at idempotency flag — we never compare codes ourselves.
- ``verify_whatsapp_otp`` refuses to consume a code that doesn't match
  the destination phone exactly (belt-and-suspenders).
- The user-facing error message is intentionally generic ("Invalid or
  expired code") to avoid leaking whether the code was wrong vs. expired
  vs. used.
- All phone numbers are E.164 (leading ``+`` + country code + digits only).
  The caller is expected to have already normalized.

BLOCKED_ON_W5:
- ``auth.tokens.generate_code`` and ``auth.tokens.consume_code`` live in
  W5's partition. Until they land we rely on ``try/except ImportError``
  inside functions to defer the import (also breaks circular-import
  concerns with the tokens module).
"""
from __future__ import annotations

import logging
from typing import Optional, Tuple

from sqlalchemy.orm import Session as DBSession

from ...models import User, UserIdentity

logger = logging.getLogger(__name__)


class WhatsAppOtpError(Exception):
    """Base error for the WhatsApp OTP provider."""


class InvalidOTP(WhatsAppOtpError):
    """Raised when an OTP is wrong, expired, or already consumed."""


def _normalize_phone(phone_e164: str) -> str:
    """Strict E.164 normalization — preserve leading +, strip spaces."""
    if not isinstance(phone_e164, str):
        raise InvalidOTP("phone must be a string")
    cleaned = phone_e164.strip().replace(" ", "").replace("-", "")
    if not cleaned.startswith("+") or len(cleaned) < 8 or len(cleaned) > 20:
        raise InvalidOTP("phone must be E.164 (e.g. +919999999999)")
    return cleaned


def send_whatsapp_otp(
    db: DBSession,
    phone_e164: str,
    *,
    purpose: str = "whatsapp_otp",
) -> None:
    """Generate a WhatsApp OTP and dispatch it to the user's phone.

    ``purpose`` must match W5's canonical purpose strings so that the
    attempts cap in ``consume_code`` is applied (``whatsapp_otp`` triggers
    the 5-attempt cap).

    Raises:
        InvalidOTP: on malformed phone.
        Exception: propagated from token/whatsapp providers.
    """
    phone = _normalize_phone(phone_e164)

    # Lazy imports break circular imports between tokens and providers
    # and let this module import cleanly even if W5's tokens module isn't
    # ready yet (the import error surfaces only when the function is called).
    from ..tokens import generate_code  # BLOCKED_ON_W5

    from ...services.whatsapp import get_whatsapp_provider

    raw_code = generate_code(
        db,
        user=None,
        channel="whatsapp",
        destination=phone,
        purpose=purpose,
        ttl_minutes=10,
    )

    provider = get_whatsapp_provider()
    body = (
        f"Your TrustAudit verification code is: {raw_code}. "
        f"Valid for 10 minutes. Do not share this code with anyone."
    )
    provider.send_text(phone, body)
    logger.info("Sent WhatsApp OTP to %s (purpose=%s)", phone, purpose)


def verify_whatsapp_otp(
    db: DBSession,
    phone_e164: str,
    code: str,
    *,
    purpose: str = "whatsapp_otp",
    default_role: str = "vendor",
) -> Tuple[User, bool]:
    """Verify a WhatsApp OTP and upsert the user.

    Returns ``(user, created)``.

    Raises:
        InvalidOTP: on wrong code, expired code, wrong destination,
            or malformed phone.
    """
    phone = _normalize_phone(phone_e164)
    if not isinstance(code, str) or not code.strip():
        raise InvalidOTP("code must be a non-empty string")

    from ..tokens import consume_code, record_failed_attempt  # BLOCKED_ON_W5

    vc = consume_code(
        db,
        raw_code=code.strip(),
        purpose=purpose,
        destination=phone,
    )
    if vc is None:
        # Bump the attempts counter on the most recent unconsumed row so
        # repeated wrong guesses get capped.
        record_failed_attempt(db, destination=phone, purpose=purpose)
        raise InvalidOTP("Invalid or expired code")
    # consume_code already enforces destination match; double-check
    # channel for defense in depth.
    if vc.destination != phone or vc.channel != "whatsapp":
        raise InvalidOTP("Invalid or expired code")

    # Upsert user by phone.
    user = (
        db.query(User)
        .filter(User.primary_phone_e164 == phone)
        .one_or_none()
    )
    created = False
    if user is None:
        if default_role not in ("vendor", "driver", "admin"):
            raise InvalidOTP(f"Invalid role {default_role!r}")
        user = User(
            role=default_role,
            primary_phone_e164=phone,
            phone_verified=True,
        )
        db.add(user)
        db.flush()
        created = True
    else:
        if not user.phone_verified:
            user.phone_verified = True
            db.add(user)

    # Ensure an identity link row exists (don't insert duplicates).
    existing_identity = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.user_id == user.id,
            UserIdentity.provider == "whatsapp_otp",
        )
        .one_or_none()
    )
    if existing_identity is None:
        identity = UserIdentity(
            user_id=user.id,
            provider="whatsapp_otp",
            provider_user_id=phone,
            phone=phone,
        )
        db.add(identity)
        db.flush()

    return user, created
