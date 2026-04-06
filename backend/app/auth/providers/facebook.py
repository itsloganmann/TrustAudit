"""Facebook Login — access-token verification flow.

We accept a Facebook user access token from the frontend (obtained via
the Facebook JS SDK) and verify it by calling the Facebook Graph API.

There are two modes of verification:

1. **debug_token flow (preferred, requires app secret)** — calls
   ``GET /debug_token?input_token=<user_token>&access_token=<APP_ID>|<APP_SECRET>``
   which returns the issuing app ID, expiry, and scopes. This is the
   authoritative check — it proves the token was issued to *our* app.

2. **``me`` fallback flow (dev only, no app secret)** — calls
   ``GET /me?access_token=<user_token>&fields=id,email,name``.
   If this succeeds, the token is at least currently valid and we can
   trust the identity fields (Graph signed the response with TLS), but
   we cannot prove the token was issued to *our* app. A malicious user
   could in principle paste a token from a different Facebook app.
   Acceptable for demo/dev but NOT for production.

SECURITY:
- In dev-mode, log a loud warning so it's obvious this path is running.
- When the debug_token flow is used, verify ``data.app_id == FACEBOOK_APP_ID``
  and ``data.is_valid is True`` before trusting the token.
- Never persist the raw access token — only the Facebook user ID.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional, Tuple

import httpx
from sqlalchemy.orm import Session as DBSession

from ...models import User, UserIdentity

logger = logging.getLogger(__name__)

FACEBOOK_GRAPH_BASE = "https://graph.facebook.com"
FACEBOOK_GRAPH_VERSION = "v18.0"


class FacebookAuthError(Exception):
    """Raised when a Facebook access token is invalid or unverifiable."""


class FacebookNotConfigured(FacebookAuthError):
    """Raised when ``FACEBOOK_APP_ID`` is not set in the environment."""


def _get_app_id() -> str:
    app_id = os.environ.get("FACEBOOK_APP_ID")
    if not app_id:
        raise FacebookNotConfigured("FACEBOOK_APP_ID not set")
    return app_id


def _get_app_secret() -> Optional[str]:
    return os.environ.get("FACEBOOK_APP_SECRET")


def _verify_with_debug_token(
    user_token: str, app_id: str, app_secret: str
) -> dict[str, Any]:
    """Authoritative Facebook token verification via debug_token endpoint."""
    app_access = f"{app_id}|{app_secret}"
    url = f"{FACEBOOK_GRAPH_BASE}/debug_token"
    params = {"input_token": user_token, "access_token": app_access}
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, params=params)
    except httpx.HTTPError as exc:
        raise FacebookAuthError(f"debug_token request failed: {exc}") from exc

    if response.status_code != 200:
        raise FacebookAuthError(
            f"debug_token returned HTTP {response.status_code}"
        )

    payload = response.json()
    data = payload.get("data") or {}
    if not data.get("is_valid"):
        raise FacebookAuthError(
            f"Facebook says token is not valid: {data.get('error', {}).get('message', 'unknown')}"
        )
    if str(data.get("app_id")) != str(app_id):
        raise FacebookAuthError(
            "Facebook token was issued to a different app"
        )
    return data


def _fetch_user_profile(user_token: str) -> dict[str, Any]:
    """Fetch the token owner's basic profile from /me."""
    url = f"{FACEBOOK_GRAPH_BASE}/{FACEBOOK_GRAPH_VERSION}/me"
    params = {"access_token": user_token, "fields": "id,email,name,picture"}
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, params=params)
    except httpx.HTTPError as exc:
        raise FacebookAuthError(f"/me request failed: {exc}") from exc

    if response.status_code != 200:
        raise FacebookAuthError(f"/me returned HTTP {response.status_code}")

    data = response.json()
    if "id" not in data:
        raise FacebookAuthError("Facebook /me response missing 'id' field")
    return data


def verify_facebook_access_token(user_token: str) -> dict[str, Any]:
    """Verify a Facebook user access token and return the profile dict.

    Uses debug_token when ``FACEBOOK_APP_SECRET`` is set, else falls back
    to a ``/me`` lookup which is weaker (see module docstring).

    Returns a normalized profile dict with keys: id, email, name, picture.

    Raises:
        FacebookNotConfigured: when ``FACEBOOK_APP_ID`` is not set.
        FacebookAuthError: on verification failure.
    """
    if not isinstance(user_token, str) or not user_token:
        raise FacebookAuthError("access_token must be a non-empty string")

    app_id = _get_app_id()
    app_secret = _get_app_secret()

    if app_secret:
        # Strong path — verify token was issued to our app.
        _verify_with_debug_token(user_token, app_id, app_secret)
    else:
        # Weak path — acceptable for dev/demo only.
        logger.warning(
            "Facebook token verification is running WITHOUT FACEBOOK_APP_SECRET; "
            "token cannot be proven to belong to this app. "
            "# TODO: FACEBOOK_APP_SECRET needed for production."
        )

    profile = _fetch_user_profile(user_token)
    return profile


def signin_with_facebook(
    db: DBSession,
    access_token: str,
    *,
    default_role: str = "vendor",
) -> Tuple[User, bool]:
    """Verify the Facebook token and upsert User + UserIdentity(provider='facebook').

    Returns ``(user, created)`` — same semantics as ``signin_with_google``.

    Raises:
        FacebookNotConfigured / FacebookAuthError: on verification failure.
    """
    profile = verify_facebook_access_token(access_token)

    fb_id = str(profile["id"])
    email = profile.get("email")
    full_name = profile.get("name")

    raw_profile = {
        "id": fb_id,
        "email": email,
        "name": full_name,
        "picture": profile.get("picture"),
    }

    # 1. Existing Facebook identity?
    existing_identity = (
        db.query(UserIdentity)
        .filter(
            UserIdentity.provider == "facebook",
            UserIdentity.provider_user_id == fb_id,
        )
        .one_or_none()
    )
    if existing_identity is not None:
        user = db.query(User).filter(User.id == existing_identity.user_id).one_or_none()
        if user is not None:
            return user, False
        logger.warning(
            "UserIdentity %s points at missing user %s; dropping",
            existing_identity.id,
            existing_identity.user_id,
        )
        db.delete(existing_identity)
        db.flush()

    # 2. Existing user by email?
    user: Optional[User] = None
    if email:
        user = (
            db.query(User)
            .filter(User.primary_email == email)
            .one_or_none()
        )

    created = False
    if user is None:
        if default_role not in ("vendor", "driver", "admin"):
            raise FacebookAuthError(f"Invalid role {default_role!r}")
        user = User(
            role=default_role,
            primary_email=email,
            full_name=full_name,
            # Facebook has verified the email IFF they return it at all.
            email_verified=bool(email),
        )
        db.add(user)
        db.flush()
        created = True

    identity = UserIdentity(
        user_id=user.id,
        provider="facebook",
        provider_user_id=fb_id,
        email=email,
        raw_profile_json=json.dumps(raw_profile),
    )
    db.add(identity)
    db.flush()

    return user, created
