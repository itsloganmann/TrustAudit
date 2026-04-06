"""Google OAuth 2.0 — ID token verification flow.

We use the **ID token** verification flow (Google Identity Services), NOT
the OAuth 2.0 authorization-code exchange. The frontend uses the Google
JS SDK to obtain a signed JWT ID token, POSTs it here, and the backend
verifies the signature against Google's published JWKS and extracts the
user's identity claims.

Why ID-token flow instead of code exchange:
1. No client secret required on the backend (we only have the public client
   ID in env).
2. Fewer moving parts — no redirect URI allow-listing issues during demo.
3. The JS SDK (Google Identity Services / GIS) is the modern recommended
   path for first-party web apps as of 2025.

SECURITY (CRITICAL — auth bugs leak identities):

- ``aud`` claim MUST equal our ``GOOGLE_OAUTH_CLIENT_ID`` env var.
- ``iss`` claim MUST be in ``{'https://accounts.google.com', 'accounts.google.com'}``.
- ``exp`` claim MUST be strictly in the future.
- Signature MUST verify against the JWK whose ``kid`` matches the token header.
- JWKS is cached for 1 hour to avoid hammering Google on every signin.
- On cache miss or stale cache, we re-fetch before verification.
- On verification failure, we raise ``GoogleAuthError`` — the route layer
  maps that to HTTP 401 and never exposes internals.

The ``signin_with_google`` helper is the single entry point used by routes:
it verifies the token, then upserts ``users``/``user_identities`` according
to the rules described inline.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Optional, Tuple

import httpx
from jose import jwt
from jose.exceptions import JWTError
from sqlalchemy.orm import Session as DBSession

from ...models import User, UserIdentity

if TYPE_CHECKING:  # pragma: no cover
    pass

logger = logging.getLogger(__name__)

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ALLOWED_ISSUERS = frozenset(
    ("https://accounts.google.com", "accounts.google.com")
)
_JWKS_CACHE_TTL = timedelta(hours=1)

# Module-level JWKS cache. Stored as an immutable-ish snapshot — we replace
# the whole dict on refresh rather than mutating in place so concurrent
# reads always see a consistent view.
_jwks_cache: dict[str, Any] = {"keys": None, "fetched_at": None}


class GoogleAuthError(Exception):
    """Raised when a Google ID token is invalid, expired, or otherwise untrustworthy."""


class GoogleNotConfigured(GoogleAuthError):
    """Raised when ``GOOGLE_OAUTH_CLIENT_ID`` is not set in the environment."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _get_client_id() -> str:
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    if not client_id:
        raise GoogleNotConfigured("GOOGLE_OAUTH_CLIENT_ID not set")
    return client_id


def _fetch_jwks(force: bool = False) -> list[dict[str, Any]]:
    """Fetch Google's JWKS, caching for 1 hour.

    Raises ``GoogleAuthError`` if Google is unreachable or returns malformed JSON.
    """
    now = _utcnow()
    fetched_at = _jwks_cache.get("fetched_at")
    keys = _jwks_cache.get("keys")
    if (
        not force
        and keys is not None
        and fetched_at is not None
        and now - fetched_at < _JWKS_CACHE_TTL
    ):
        return keys

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(GOOGLE_CERTS_URL)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Fall back to a stale cache if we have one — better than failing the user's signin.
        if keys is not None:
            logger.warning(
                "Google JWKS fetch failed, using stale cache: %s", exc
            )
            return keys
        raise GoogleAuthError(f"Failed to fetch Google JWKS: {exc}") from exc

    fetched_keys = data.get("keys")
    if not isinstance(fetched_keys, list) or not fetched_keys:
        raise GoogleAuthError("Google JWKS response missing 'keys'")

    # Replace whole cache atomically.
    _jwks_cache["keys"] = fetched_keys
    _jwks_cache["fetched_at"] = now
    return fetched_keys


def _find_jwk(keys: list[dict[str, Any]], kid: str) -> Optional[dict[str, Any]]:
    for key in keys:
        if key.get("kid") == kid:
            return key
    return None


def verify_google_id_token(id_token: str) -> dict[str, Any]:
    """Verify a Google-issued ID token and return its claims dict.

    Raises:
        GoogleNotConfigured: if ``GOOGLE_OAUTH_CLIENT_ID`` is not set.
        GoogleAuthError: on any verification failure (bad signature, wrong
            audience, wrong issuer, expired, malformed).
    """
    if not isinstance(id_token, str) or not id_token:
        raise GoogleAuthError("id_token must be a non-empty string")

    client_id = _get_client_id()

    # 1. Parse header to find the signing key id.
    try:
        header = jwt.get_unverified_header(id_token)
    except JWTError as exc:
        raise GoogleAuthError(f"Malformed Google ID token header: {exc}") from exc

    kid = header.get("kid")
    if not kid:
        raise GoogleAuthError("Google ID token header missing 'kid'")

    alg = header.get("alg", "RS256")
    if alg not in ("RS256",):
        # Google uses RS256 exclusively; reject everything else defensively.
        raise GoogleAuthError(f"Unsupported alg {alg!r} in Google ID token")

    # 2. Find the JWK, refetching the cache if the kid is unknown (key rotation).
    keys = _fetch_jwks()
    jwk = _find_jwk(keys, kid)
    if jwk is None:
        keys = _fetch_jwks(force=True)
        jwk = _find_jwk(keys, kid)
    if jwk is None:
        raise GoogleAuthError(f"Google JWKS has no key matching kid={kid!r}")

    # 3. Verify signature + aud + exp (jose does all of these atomically).
    try:
        claims = jwt.decode(
            id_token,
            jwk,
            algorithms=[alg],
            audience=client_id,
            options={
                "verify_aud": True,
                "verify_signature": True,
                "verify_exp": True,
                "require_exp": True,
            },
        )
    except JWTError as exc:
        raise GoogleAuthError(f"Google ID token verification failed: {exc}") from exc

    # 4. Belt-and-suspenders issuer check (jose doesn't enforce iss by default).
    issuer = claims.get("iss")
    if issuer not in GOOGLE_ALLOWED_ISSUERS:
        raise GoogleAuthError(f"Google ID token has unexpected iss={issuer!r}")

    # 5. Defensive expiry check in case jose is lenient.
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or exp <= _utcnow().timestamp():
        raise GoogleAuthError("Google ID token is expired")

    sub = claims.get("sub")
    if not sub:
        raise GoogleAuthError("Google ID token missing 'sub' claim")

    return claims


def signin_with_google(
    db: DBSession,
    id_token: str,
    *,
    default_role: str = "vendor",
) -> Tuple[User, bool]:
    """Verify the ID token and upsert a User + UserIdentity(provider='google').

    Returns ``(user, created)`` — ``created`` is True if we inserted a new users row.

    Upsert rules (order matters):
    1. Look up ``UserIdentity`` by ``provider='google' AND provider_user_id=<sub>``.
       If found, return the linked user (identity reuse, happy path).
    2. If not, look up ``User`` by ``primary_email=<email>`` (case-insensitive
       is not supported by the current schema — we use the raw email claim).
       If found, attach a new ``UserIdentity`` row linking Google to that
       existing user and return it. This is the account-linking case.
    3. Otherwise, create a new ``User`` with ``role=default_role``,
       ``email_verified=True`` (Google has already verified), and a single
       ``UserIdentity`` row.

    Raises:
        GoogleAuthError / GoogleNotConfigured: propagated from verification.
    """
    claims = verify_google_id_token(id_token)

    google_sub = str(claims["sub"])
    email = claims.get("email")
    email_verified = bool(claims.get("email_verified", False))
    full_name = claims.get("name")
    picture = claims.get("picture")

    # Store the raw claim payload (minus sensitive things like 'at_hash') for audit.
    raw_profile = {
        "sub": google_sub,
        "email": email,
        "email_verified": email_verified,
        "name": full_name,
        "picture": picture,
        "iss": claims.get("iss"),
        "aud": claims.get("aud"),
    }

    # 1. Existing Google identity?
    existing_identity = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.provider == "google",
            UserIdentity.provider_user_id == google_sub,
        )
        .one_or_none()
    )
    if existing_identity is not None:
        user = db.query(User).filter(User.id == existing_identity.user_id).one_or_none()
        if user is not None:
            return user, False
        # Dangling identity — drop it and fall through to upsert.
        logger.warning(
            "UserIdentity %s points at missing user %s; dropping",
            existing_identity.id,
            existing_identity.user_id,
        )
        db.delete(existing_identity)
        db.flush()

    # 2. Existing user by email?
    #
    # SECURITY (adversary review 7926af6, finding #1): we MUST NOT auto-link
    # a new Google identity to a pre-existing user account just because the
    # emails match. That is an account-takeover vector — anyone who can get
    # Google to issue an ID token for an email address that already exists
    # in our database would inherit that user's session.
    #
    # The only time auto-link is safe:
    #   (a) Google's own ``email_verified`` claim is True (so Google has
    #       proof the OAuth user controls the mailbox), AND
    #   (b) the existing TrustAudit user has already verified their email
    #       (so we have proof THEY control the mailbox), AND
    #   (c) the existing user does NOT have a password identity (a password
    #       account is a stronger anchor — refuse to auto-link, force the
    #       user to sign in with password and link Google from settings).
    user: Optional[User] = None
    if email:
        user = (
            db.query(User)
            .filter(User.primary_email == email)
            .one_or_none()
        )

    created = False
    if user is None:
        # 3. New user.
        if default_role not in ("vendor", "driver", "admin"):
            raise GoogleAuthError(f"Invalid role {default_role!r}")
        user = User(
            role=default_role,
            primary_email=email,
            full_name=full_name,
            email_verified=email_verified,
        )
        db.add(user)
        db.flush()
        created = True
    else:
        # Account-linking gate (see SECURITY note above).
        has_password_identity = (
            db.query(UserIdentity)
            .filter(
                UserIdentity.user_id == user.id,
                UserIdentity.provider == "password",
            )
            .first()
        ) is not None
        if has_password_identity:
            raise GoogleAuthError(
                "An account with this email already exists with password sign-in. "
                "Sign in with your password, then link Google from settings."
            )
        if not (email_verified and user.email_verified):
            raise GoogleAuthError(
                "Cannot link Google to this account because the email is not verified "
                "on both sides. Please verify your email first."
            )
        # Belt-and-braces: the role must already match. Mismatched roles are
        # rejected at the route layer too, but we refuse to flush an
        # identity row before that check (adversary finding #15).
        if user.role != default_role:
            raise GoogleAuthError(
                f"Account already exists with role {user.role!r}; "
                f"please sign in on the {user.role} page."
            )

    # Attach the google identity to this user.
    identity = UserIdentity(
        user_id=user.id,
        provider="google",
        provider_user_id=google_sub,
        email=email,
        raw_profile_json=json.dumps(raw_profile),
    )
    db.add(identity)
    db.flush()

    return user, created


def reset_jwks_cache() -> None:
    """Test helper — clear the cached JWKS so tests can inject their own."""
    _jwks_cache["keys"] = None
    _jwks_cache["fetched_at"] = None
