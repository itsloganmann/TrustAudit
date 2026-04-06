"""Phone SMS OTP provider — Twilio Verify or Messages API fallback.

Two supported modes:

1. **Twilio Verify** (preferred) — Twilio manages the code lifecycle server-side.
   Requires ``TWILIO_ACCOUNT_SID``, ``TWILIO_AUTH_TOKEN``, and
   ``TWILIO_VERIFY_SERVICE_SID``. We just call ``POST /Verifications``
   to send and ``POST /VerificationCheck`` to verify.

2. **Twilio Messages API fallback** — if no Verify service is configured
   but ``TWILIO_PHONE_NUMBER`` is set, we generate our own code via the
   local ``auth.tokens`` module and send it as a plain SMS.

Graceful degradation:
- If Twilio credentials are entirely missing, ``send_phone_otp`` raises
  ``PhoneOtpNotConfigured`` and the route layer returns a helpful 503.
- Twilio API errors are caught and re-raised as ``PhoneOtpError`` with
  a safe-to-show message.

SECURITY:
- Twilio Verify is the strong path — codes live in Twilio's infra and we
  only hold the verification SID, never the raw code.
- In the fallback path, the code is generated + stored in our own DB
  via ``auth.tokens.generate_code``.
- The user-facing error message is intentionally generic.
- All phone numbers are E.164.

BLOCKED_ON_W5:
- ``auth.tokens.generate_code`` and ``auth.tokens.consume_code`` live in
  W5's partition. Lazy-imported inside functions.
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import httpx
from sqlalchemy.orm import Session as DBSession

from ...models import User, UserIdentity

logger = logging.getLogger(__name__)

TWILIO_BASE = "https://api.twilio.com"
TWILIO_VERIFY_BASE = "https://verify.twilio.com"


class PhoneOtpError(Exception):
    """Base error for the phone OTP provider."""


class PhoneOtpNotConfigured(PhoneOtpError):
    """Raised when Twilio credentials are not configured."""


class InvalidPhoneOTP(PhoneOtpError):
    """Raised when a submitted OTP is rejected by Twilio or our local store."""


def _normalize_phone(phone_e164: str) -> str:
    if not isinstance(phone_e164, str):
        raise InvalidPhoneOTP("phone must be a string")
    cleaned = phone_e164.strip().replace(" ", "").replace("-", "")
    if not cleaned.startswith("+") or len(cleaned) < 8 or len(cleaned) > 20:
        raise InvalidPhoneOTP("phone must be E.164 (e.g. +919999999999)")
    return cleaned


def _twilio_creds() -> Tuple[str, str]:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        raise PhoneOtpNotConfigured(
            "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set"
        )
    return sid, token


def _verify_service_sid() -> Optional[str]:
    return os.environ.get("TWILIO_VERIFY_SERVICE_SID") or None


def _sms_from_number() -> Optional[str]:
    return os.environ.get("TWILIO_PHONE_NUMBER") or None


# ---------------------------------------------------------------------------
# Twilio Verify path
# ---------------------------------------------------------------------------
def _twilio_verify_send(phone: str) -> dict:
    """POST to /Verifications to start a Twilio-managed verification."""
    sid, token = _twilio_creds()
    service_sid = _verify_service_sid()
    if not service_sid:
        raise PhoneOtpNotConfigured("TWILIO_VERIFY_SERVICE_SID not set")

    url = f"{TWILIO_VERIFY_BASE}/v2/Services/{service_sid}/Verifications"
    try:
        with httpx.Client(timeout=10.0, auth=(sid, token)) as client:
            response = client.post(
                url, data={"To": phone, "Channel": "sms"}
            )
    except httpx.HTTPError as exc:
        raise PhoneOtpError(f"Twilio Verify unreachable: {exc}") from exc

    if response.status_code >= 400:
        logger.warning(
            "Twilio Verify send failed: status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        raise PhoneOtpError(
            f"Twilio Verify returned {response.status_code}"
        )
    return response.json()


def _twilio_verify_check(phone: str, code: str) -> bool:
    """POST to /VerificationCheck. Returns True iff Twilio says 'approved'."""
    sid, token = _twilio_creds()
    service_sid = _verify_service_sid()
    if not service_sid:
        raise PhoneOtpNotConfigured("TWILIO_VERIFY_SERVICE_SID not set")

    url = f"{TWILIO_VERIFY_BASE}/v2/Services/{service_sid}/VerificationCheck"
    try:
        with httpx.Client(timeout=10.0, auth=(sid, token)) as client:
            response = client.post(
                url, data={"To": phone, "Code": code}
            )
    except httpx.HTTPError as exc:
        raise PhoneOtpError(f"Twilio Verify unreachable: {exc}") from exc

    if response.status_code >= 400:
        logger.warning(
            "Twilio Verify check failed: status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        return False

    payload = response.json()
    return str(payload.get("status", "")).lower() == "approved"


# ---------------------------------------------------------------------------
# Twilio Messages fallback path
# ---------------------------------------------------------------------------
def _twilio_sms_send(phone: str, body: str) -> dict:
    """POST to /Accounts/<SID>/Messages.json for a plain SMS."""
    sid, token = _twilio_creds()
    from_number = _sms_from_number()
    if not from_number:
        raise PhoneOtpNotConfigured("TWILIO_PHONE_NUMBER not set")

    url = f"{TWILIO_BASE}/2010-04-01/Accounts/{sid}/Messages.json"
    try:
        with httpx.Client(timeout=10.0, auth=(sid, token)) as client:
            response = client.post(
                url, data={"From": from_number, "To": phone, "Body": body}
            )
    except httpx.HTTPError as exc:
        raise PhoneOtpError(f"Twilio SMS unreachable: {exc}") from exc

    if response.status_code >= 400:
        logger.warning(
            "Twilio SMS send failed: status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        raise PhoneOtpError(
            f"Twilio Messages returned {response.status_code}"
        )
    return response.json()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def send_phone_otp(
    db: DBSession,
    phone_e164: str,
    *,
    purpose: str = "phone_otp",
) -> str:
    """Send an SMS OTP to the given phone.

    Returns the transport used: 'twilio_verify' or 'twilio_sms'.

    ``purpose`` must match W5's canonical purpose strings; ``phone_otp``
    triggers the 5-attempt cap in ``consume_code``.

    Raises:
        PhoneOtpNotConfigured: if no usable Twilio transport is configured.
        PhoneOtpError: on Twilio API errors.
    """
    phone = _normalize_phone(phone_e164)

    if _verify_service_sid():
        _twilio_verify_send(phone)
        logger.info("Sent Twilio Verify OTP to %s (purpose=%s)", phone, purpose)
        return "twilio_verify"

    # Fallback — generate our own code and send via plain SMS.
    from ..tokens import generate_code  # BLOCKED_ON_W5

    raw_code = generate_code(
        db,
        user=None,
        channel="sms",
        destination=phone,
        purpose=purpose,
        ttl_minutes=10,
    )
    body = (
        f"Your TrustAudit verification code is: {raw_code}. "
        f"Valid for 10 minutes."
    )
    _twilio_sms_send(phone, body)
    logger.info("Sent SMS OTP to %s via Twilio Messages (purpose=%s)", phone, purpose)
    return "twilio_sms"


def verify_phone_otp(
    db: DBSession,
    phone_e164: str,
    code: str,
    *,
    purpose: str = "phone_otp",
    default_role: str = "vendor",
) -> Tuple[User, bool]:
    """Verify a phone OTP and upsert the user.

    Uses Twilio Verify's check endpoint if a Verify service is configured,
    else verifies against our local ``verification_codes`` table.

    Returns ``(user, created)``.

    Raises:
        InvalidPhoneOTP: on wrong/expired code or malformed phone.
        PhoneOtpNotConfigured: if Twilio is not configured at all.
    """
    phone = _normalize_phone(phone_e164)
    if not isinstance(code, str) or not code.strip():
        raise InvalidPhoneOTP("code must be a non-empty string")
    code = code.strip()

    if _verify_service_sid():
        approved = _twilio_verify_check(phone, code)
        if not approved:
            raise InvalidPhoneOTP("Invalid or expired code")
    else:
        # Local-store path.
        from ..tokens import consume_code, record_failed_attempt  # BLOCKED_ON_W5

        # Sanity-check that Twilio SMS fallback is usable — prevents the
        # absurd state of "verify works but send never could".
        _twilio_creds()

        vc = consume_code(
            db,
            raw_code=code,
            purpose=purpose,
            destination=phone,
        )
        if vc is None:
            record_failed_attempt(db, destination=phone, purpose=purpose)
            raise InvalidPhoneOTP("Invalid or expired code")
        if vc.destination != phone or vc.channel != "sms":
            raise InvalidPhoneOTP("Invalid or expired code")

    # Upsert user by phone.
    user = (
        db.query(User)
        .filter(User.primary_phone_e164 == phone)
        .one_or_none()
    )
    created = False
    if user is None:
        if default_role not in ("vendor", "driver", "admin"):
            raise InvalidPhoneOTP(f"Invalid role {default_role!r}")
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

    existing_identity = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.user_id == user.id,
            UserIdentity.provider == "phone_otp",
        )
        .one_or_none()
    )
    if existing_identity is None:
        identity = UserIdentity(
            user_id=user.id,
            provider="phone_otp",
            provider_user_id=phone,
            phone=phone,
        )
        db.add(identity)
        db.flush()

    return user, created
