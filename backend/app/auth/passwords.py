"""Password hashing and verification.

Uses the ``bcrypt`` library directly (not via passlib) with cost factor 12.
Passlib 1.7.4 is incompatible with bcrypt >= 4.1's length check during
its internal init probe, so we bypass that layer entirely.

Also supports a legacy ``sha256-dev$<hex>`` format emitted by ``seed.py``
as a fallback when bcrypt wasn't installed in the venv yet. This keeps
already-seeded demo accounts signinable during the transition.

SECURITY:
- Never log raw passwords or hashes.
- ``verify_password`` is constant-time: bcrypt.checkpw uses a constant-time
  compare, and the sha256-dev branch uses ``secrets.compare_digest``.
- ``hash_password`` always produces a bcrypt hash, never the dev fallback.
- bcrypt caps input at 72 bytes — we truncate silently to match how
  bcrypt 5.x treats oversized inputs (the alternative is to reject with
  an error, but that would break already-hashed long passwords).
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets

import bcrypt

logger = logging.getLogger(__name__)

# Security checklist requirement: cost factor >= 12.
BCRYPT_ROUNDS = 12

_DEV_PREFIX = "sha256-dev$"
_BCRYPT_MAX_BYTES = 72  # bcrypt spec limit


def _to_bcrypt_bytes(raw: str) -> bytes:
    """Encode + truncate a password to bcrypt's 72-byte limit.

    Truncation is spec-compliant (original bcrypt silently truncated),
    and prevents the ``ValueError`` that bcrypt 4.1+ now raises.
    """
    return raw.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(raw: str) -> str:
    """Return a bcrypt hash of ``raw``. Always uses bcrypt — never the dev fallback."""
    if not isinstance(raw, str) or raw == "":
        raise ValueError("password must be a non-empty string")
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(_to_bcrypt_bytes(raw), salt)
    return hashed.decode("ascii")


def verify_password(raw: str, hashed: str | None) -> bool:
    """Check ``raw`` against ``hashed``.

    - ``None``/empty hashed → False (accounts without passwords can't sign in).
    - ``sha256-dev$...`` prefix → compare sha256 hex with ``secrets.compare_digest``.
    - Otherwise → delegate to bcrypt.

    Returns False on any exception; never raises (to avoid leaking whether
    an error or a bad password caused the failure).
    """
    if not hashed or not isinstance(raw, str):
        return False
    try:
        if hashed.startswith(_DEV_PREFIX):
            # Adversary 7926af6 #8 — refuse the dev fallback in
            # production no matter how it landed in the DB. Even if a
            # corrupted seed or restored backup ships ``sha256-dev$``
            # rows, we will not bypass bcrypt for them in prod.
            env = os.environ.get("APP_ENV", "").strip().lower()
            if env in ("prod", "production") or os.environ.get("RENDER") == "true":
                logger.error("Refusing to verify sha256-dev hash in production")
                return False
            want = hashed[len(_DEV_PREFIX):]
            got = hashlib.sha256(raw.encode("utf-8")).hexdigest()
            return secrets.compare_digest(want, got)
        return bcrypt.checkpw(_to_bcrypt_bytes(raw), hashed.encode("ascii"))
    except Exception:  # pragma: no cover - defensive
        logger.debug("verify_password: unexpected failure", exc_info=True)
        return False
