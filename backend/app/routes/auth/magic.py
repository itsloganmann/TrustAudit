"""Email magic-link routes.

POST /api/auth/magic/request
    body: { email, role }
    Sends a passwordless sign-in link to the email.

GET  /api/auth/magic/consume?token=<raw>
    Consumes the token, creates a session, sets the cookie,
    returns JSON { user: {...} }. Frontend handles redirect.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from ...auth.dependencies import set_session_cookie
from ...auth.providers.email_magic import (
    InvalidMagicLinkToken,
    consume_magic_link,
    request_magic_link,
)
from ...auth.providers.password import (
    AuthError,
    InvalidRoleError,
    WrongRoleError,
)
from ...auth.sessions import create_session
from ...database import get_db
from ...services import rate_limit as rl

from .signin import SigninResponse, UserDTO

logger = logging.getLogger(__name__)

router = APIRouter()

_RATE_MAX = 5  # magic links are more sensitive than signup attempts
_RATE_WINDOW = 60


_EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class MagicRequestPayload(BaseModel):
    email: str = Field(min_length=3, max_length=254, pattern=_EMAIL_PATTERN)
    role: str = Field(pattern=r"^(vendor|driver)$")


class MagicRequestResponse(BaseModel):
    sent: bool
    message: str


def _rate_limit_or_429(request: Request) -> None:
    ip = (request.client.host if request.client else "") or "unknown"
    if not rl.check("ip", ip, max_per_window=_RATE_MAX, window_seconds=_RATE_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many magic-link requests — try again in a minute",
        )


@router.post("/magic/request", response_model=MagicRequestResponse)
def magic_request(
    payload: MagicRequestPayload,
    request: Request,
    db: DBSession = Depends(get_db),
) -> MagicRequestResponse:
    _rate_limit_or_429(request)
    try:
        request_magic_link(db, payload.email, payload.role)
    except WrongRoleError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        )
    except InvalidRoleError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception:
        logger.exception("magic/request failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email provider temporarily unavailable",
        )
    db.commit()
    return MagicRequestResponse(
        sent=True,
        message="Check your email for the sign-in link (valid 15 minutes).",
    )


# --- Adversary review 7926af6 #3 -------------------------------------------
# Magic-link consume MUST NOT be a GET. Corporate email scanners
# (Microsoft Defender ATP, Mimecast, Proofpoint, Gmail safe-link) GET
# every URL in inbound mail to scan for malware. A GET that consumes
# the token + mints a session would (a) burn the token before the user
# can click and (b) drop a session cookie on the scanner's request.
#
# We therefore expose:
#   GET  /api/auth/magic/consume?token=...   → tiny static HTML page with
#                                              a "Sign me in" button. The
#                                              GET is idempotent: it does
#                                              not touch the DB or set a
#                                              cookie. Email scanners that
#                                              follow the link see only
#                                              the confirmation page.
#   POST /api/auth/magic/consume             → JSON body { token }, this
#                                              is the path that actually
#                                              consumes the token + mints
#                                              the session.
# ---------------------------------------------------------------------------


_CONFIRMATION_PAGE_TEMPLATE = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Sign in to TrustAudit</title>
    <style>
      body {
        margin: 0;
        background: #020617;
        color: #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        max-width: 440px;
        width: 100%;
        background: rgba(255, 255, 255, 0.03);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 32px;
        text-align: center;
      }
      h1 { font-size: 22px; font-weight: 600; color: #f8fafc; margin: 0 0 8px 0; }
      p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 24px 0; }
      button {
        background: linear-gradient(135deg, #22d3ee, #3b82f6);
        color: #020617;
        font-weight: 600;
        font-size: 15px;
        padding: 14px 32px;
        border: none;
        border-radius: 10px;
        cursor: pointer;
      }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .err { color: #f43f5e; margin-top: 16px; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Sign in to TrustAudit</h1>
      <p>Click the button below to complete sign-in. This is a one-time link that expires in 15 minutes.</p>
      <button id="go" type="button">Sign me in</button>
      <p id="err" class="err" hidden></p>
    </div>
    <script>
      (function () {
        const btn = document.getElementById("go");
        const err = document.getElementById("err");
        btn.addEventListener("click", async function () {
          btn.disabled = true;
          btn.textContent = "Signing in...";
          try {
            const res = await fetch("/api/auth/magic/consume", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ token: __TOKEN__ }),
            });
            if (!res.ok) {
              const body = await res.json().catch(function () { return {}; });
              throw new Error(body.detail || "Sign-in failed");
            }
            const body = await res.json();
            const role = (body.user && body.user.role) || "vendor";
            window.location.href = "/" + role;
          } catch (e) {
            err.hidden = false;
            err.textContent = String(e.message || e);
            btn.disabled = false;
            btn.textContent = "Try again";
          }
        });
      })();
    </script>
  </body>
</html>
"""


@router.get("/magic/consume", response_class=HTMLResponse)
def magic_consume_landing(
    token: str = Query(min_length=8, max_length=256),
) -> HTMLResponse:
    """Idempotent landing page — does NOT consume the token. Renders a
    button that POSTs the token to actually mint the session.
    """
    safe_token = json.dumps(token)
    html = _CONFIRMATION_PAGE_TEMPLATE.replace("__TOKEN__", safe_token)
    return HTMLResponse(content=html)


class MagicConsumePayload(BaseModel):
    token: str = Field(min_length=8, max_length=256)


@router.post("/magic/consume", response_model=SigninResponse)
def magic_consume(
    payload: MagicConsumePayload,
    request: Request,
    response: Response,
    db: DBSession = Depends(get_db),
) -> SigninResponse:
    try:
        user = consume_magic_link(db, payload.token)
    except InvalidMagicLinkToken as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    ip = (request.client.host if request.client else "") or None
    user_agent = request.headers.get("user-agent")
    raw_token, _session = create_session(db, user, ip=ip, user_agent=user_agent)
    db.commit()
    set_session_cookie(response, raw_token)
    return SigninResponse(
        user=UserDTO(
            id=user.id,
            full_name=user.full_name,
            role=user.role,
            email=user.primary_email,
            enterprise_id=user.enterprise_id,
            msme_id=user.msme_id,
            email_verified=bool(user.email_verified),
        )
    )
