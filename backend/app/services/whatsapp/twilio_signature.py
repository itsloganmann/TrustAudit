"""Twilio webhook signature verification.

Twilio signs every webhook POST with an ``X-Twilio-Signature`` header computed
as the base64-encoded HMAC-SHA1 of ``URL + sorted(key1 + value1 + key2 + value2 + ...)``
keyed by the Twilio Auth Token.

Reference: https://www.twilio.com/docs/usage/security#validating-requests

Added in response to adversary review of 6293462 (must-fix #3). Without this,
anyone who can reach ``/api/webhook/whatsapp/inbound`` can forge inbound
messages, trigger fake verifications, pollute the idempotency cache, or spam
the rate limiter.
"""
from __future__ import annotations

import base64
import hmac
import hashlib
import logging
import os
from typing import Mapping

logger = logging.getLogger(__name__)


class TwilioSignatureInvalid(Exception):
    """Raised when the X-Twilio-Signature header does not match the computed HMAC."""


def compute_twilio_signature(url: str, params: Mapping[str, str], auth_token: str) -> str:
    """Compute the expected X-Twilio-Signature value for a given URL + params.

    ``url`` must be the full URL Twilio POSTed to, exactly as Twilio saw it
    (including scheme, host, path, and any query string — but NOT the raw
    POST body). ``params`` is the decoded form body.
    """
    s = url
    for key in sorted(params.keys()):
        s += key + str(params[key])
    mac = hmac.new(auth_token.encode("utf-8"), s.encode("utf-8"), hashlib.sha1)
    return base64.b64encode(mac.digest()).decode("utf-8")


def verify_twilio_signature(
    url: str,
    params: Mapping[str, str],
    signature_header: str,
    *,
    auth_token: str | None = None,
) -> bool:
    """Return True iff ``signature_header`` matches the expected HMAC for
    (url, params). Uses ``hmac.compare_digest`` for constant-time comparison.

    Reads ``TWILIO_AUTH_TOKEN`` from the environment if ``auth_token`` is not
    provided. Returns False (never raises) if the token is missing so the
    caller can reject with 401/403 uniformly.
    """
    token = auth_token if auth_token is not None else os.environ.get("TWILIO_AUTH_TOKEN", "")
    if not token or not signature_header:
        return False
    try:
        expected = compute_twilio_signature(url, params, token)
    except Exception as exc:  # noqa: BLE001 — never raise from a signature check
        logger.warning("twilio signature compute failed: %s", exc)
        return False
    return hmac.compare_digest(expected, signature_header)


def is_validation_enabled() -> bool:
    """Gate signature validation via env var so mock / dev paths still work.

    Set ``TWILIO_VALIDATE_SIGNATURE=0`` to disable (useful for local curl
    testing). Default is enabled whenever ``TWILIO_AUTH_TOKEN`` is set.
    """
    override = os.environ.get("TWILIO_VALIDATE_SIGNATURE")
    if override is not None:
        return override.strip().lower() not in ("0", "false", "no", "off", "")
    return bool(os.environ.get("TWILIO_AUTH_TOKEN"))
