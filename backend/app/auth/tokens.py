"""Single-use verification / magic-link / OTP tokens.

Distinct from session tokens (``auth.sessions``). These are short-lived,
single-use codes used for:

- ``email_verify``   — link clicked from the "verify your email" email
- ``email_magic``    — passwordless sign-in link
- ``password_reset`` — forgot-password flow
- ``whatsapp_otp``   — 6-digit code W6 sends via WhatsApp
- ``phone_otp``      — 6-digit code W6 sends via SMS

The raw code goes into a URL query param (``?token=...``) or is displayed
to the user (for OTPs). Only the SHA-256 hash lives in the DB.

Purposes share the same table (``verification_codes``) but have different
TTLs and attempt caps by convention — the caller picks when calling
``generate_code``.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from ..models import User, VerificationCode

logger = logging.getLogger(__name__)

# Default TTLs per purpose (minutes).
DEFAULT_TTL_MINUTES = {
    "email_verify": 60 * 24,   # 24h
    "email_magic": 15,         # 15 min
    "password_reset": 30,      # 30 min
    "whatsapp_otp": 10,        # 10 min
    "phone_otp": 10,           # 10 min
}

# Max attempts for OTP-style codes.
MAX_OTP_ATTEMPTS = 5


def _hash_code(raw_code: str) -> str:
    return hashlib.sha256(raw_code.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _generate_raw(purpose: str) -> str:
    """Shape of the raw code depends on the purpose."""
    if purpose in ("whatsapp_otp", "phone_otp"):
        # 6-digit numeric, cryptographically random.
        return f"{secrets.randbelow(1_000_000):06d}"
    # URL-safe 32-char token (256 bits).
    return secrets.token_urlsafe(32)


def generate_code(
    db: DBSession,
    user: User | None,
    channel: str,
    destination: str,
    purpose: str,
    ttl_minutes: int | None = None,
) -> str:
    """Create a verification-code row and return the raw code.

    Only the hash is stored. The caller is responsible for delivering the
    raw code (via email, WhatsApp, SMS, etc).
    """
    if channel not in ("email", "sms", "whatsapp"):
        raise ValueError(f"unsupported channel: {channel}")
    if not destination:
        raise ValueError("destination is required")
    if not purpose:
        raise ValueError("purpose is required")

    raw = _generate_raw(purpose)
    effective_ttl = ttl_minutes if ttl_minutes is not None else DEFAULT_TTL_MINUTES.get(
        purpose, 15
    )
    expires = _utcnow() + timedelta(minutes=effective_ttl)

    row = VerificationCode(
        user_id=user.id if user is not None else None,
        channel=channel,
        destination=destination[:255],
        code_hash=_hash_code(raw),
        purpose=purpose[:32],
        attempts=0,
        expires_at=_naive_utc(expires),
        consumed_at=None,
    )
    db.add(row)
    db.flush()
    return raw


def consume_code(
    db: DBSession,
    raw_code: str,
    purpose: str,
    destination: str | None = None,
) -> Optional[VerificationCode]:
    """Return and mark-consumed the row matching ``raw_code`` + ``purpose``.

    - Returns None if: not found, expired, already consumed, wrong purpose,
      or (for OTP-style codes) attempts exceeded.
    - On success, sets ``consumed_at = now``.
    - If ``destination`` is supplied, it must also match exactly.
    """
    if not raw_code or not purpose:
        return None
    code_hash = _hash_code(raw_code)
    q = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.code_hash == code_hash,
            VerificationCode.purpose == purpose,
        )
    )
    if destination is not None:
        q = q.filter(VerificationCode.destination == destination)
    row = q.one_or_none()
    if row is None:
        return None

    # Already consumed?
    if row.consumed_at is not None:
        return None

    # Expired?
    exp = row.expires_at
    if exp is not None:
        if exp.tzinfo is None:
            exp_aware = exp.replace(tzinfo=timezone.utc)
        else:
            exp_aware = exp
        if exp_aware <= _utcnow():
            return None

    # Attempts cap for OTP-style codes.
    if purpose in ("whatsapp_otp", "phone_otp"):
        if (row.attempts or 0) >= MAX_OTP_ATTEMPTS:
            return None

    row.consumed_at = _naive_utc(_utcnow())
    db.add(row)
    db.flush()
    return row


def record_failed_attempt(
    db: DBSession,
    destination: str,
    purpose: str,
) -> None:
    """Increment ``attempts`` on the most recent unconsumed row for this dest.

    Called by the OTP code path on a wrong code. Has no effect if no row
    matches. Safe to call many times — the cap is enforced on consume.
    """
    row = (
        db.query(VerificationCode)
        .filter(
            VerificationCode.destination == destination,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.id.desc())
        .first()
    )
    if row is None:
        return
    row.attempts = (row.attempts or 0) + 1
    db.add(row)
    db.flush()
