"""Database-backed session management.

Design:
- Raw session token = 256 bits of entropy from ``secrets.token_urlsafe(32)``.
- Raw token lives only in the httpOnly ``trustaudit_session`` cookie.
- DB stores ``sha256(raw_token)`` in ``sessions.token_hash``. An attacker
  with read access to the DB cannot impersonate a user without also
  having the raw cookie.
- Sessions expire after 30 days. Every authenticated request touches
  ``last_seen_at`` for an at-a-glance audit trail.
- ``revoke_session`` sets ``revoked_at`` — we never hard-delete rows so
  that audit history is preserved.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session as DBSession

from ..models import Session as SessionModel, User

logger = logging.getLogger(__name__)

SESSION_TTL = timedelta(days=30)


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _naive_utc(dt: datetime) -> datetime:
    """SQLite doesn't carry tz — strip tzinfo before writing."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def create_session(
    db: DBSession,
    user: User,
    ip: str | None = None,
    user_agent: str | None = None,
) -> Tuple[str, SessionModel]:
    """Create a new session row and return ``(raw_token, session)``.

    The caller must place the raw token into an httpOnly cookie named
    ``trustaudit_session`` and must NOT store it anywhere else.
    """
    raw_token = secrets.token_urlsafe(32)
    now = _utcnow()
    expires = now + SESSION_TTL
    row = SessionModel(
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        ip=(ip or "")[:64] or None,
        user_agent=(user_agent or "")[:512] or None,
        created_at=_naive_utc(now),
        last_seen_at=_naive_utc(now),
        expires_at=_naive_utc(expires),
        revoked_at=None,
    )
    db.add(row)
    db.flush()
    return raw_token, row


def load_session(db: DBSession, raw_token: str | None) -> Optional[SessionModel]:
    """Return the active session for the given raw token, or None.

    Returns None if:
    - token is missing or empty
    - no row matches the hash
    - row is revoked
    - row is expired
    """
    if not raw_token:
        return None
    token_hash = _hash_token(raw_token)
    row = (
        db.query(SessionModel)
        .filter(SessionModel.token_hash == token_hash)
        .one_or_none()
    )
    if row is None:
        return None
    if row.revoked_at is not None:
        return None
    if row.expires_at is not None:
        # Treat stored timestamp as UTC whether or not it has tzinfo.
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= _utcnow():
            return None
    return row


def touch_session(db: DBSession, session: SessionModel) -> None:
    """Update ``last_seen_at``. Call on every authenticated request."""
    session.last_seen_at = _naive_utc(_utcnow())
    db.add(session)
    db.flush()


def revoke_session(db: DBSession, raw_token: str | None) -> bool:
    """Mark a session as revoked. Returns True if a row was updated."""
    if not raw_token:
        return False
    token_hash = _hash_token(raw_token)
    row = (
        db.query(SessionModel)
        .filter(SessionModel.token_hash == token_hash)
        .one_or_none()
    )
    if row is None:
        return False
    if row.revoked_at is None:
        row.revoked_at = _naive_utc(_utcnow())
        db.add(row)
        db.flush()
    return True


def revoke_all_for_user(db: DBSession, user_id: int) -> int:
    """Revoke every active session for ``user_id``. Returns count affected."""
    now_naive = _naive_utc(_utcnow())
    rows = (
        db.query(SessionModel)
        .filter(SessionModel.user_id == user_id, SessionModel.revoked_at.is_(None))
        .all()
    )
    for row in rows:
        row.revoked_at = now_naive
        db.add(row)
    db.flush()
    return len(rows)
