"""Admin endpoints for one-shot production tasks.

Gated by the ``ADMIN_TOKEN`` environment variable and the
``X-Admin-Token`` request header. If the env var is unset the router is
NOT registered (see :func:`app.main`), so hitting these URLs without
the token configured yields a 404.

Token transport: we require the token in an ``X-Admin-Token`` header,
not a query parameter. Query-parameter tokens show up verbatim in
Render access logs and any upstream proxy/CDN log, which is a leak.
Headers are not logged by default.

Comparison: we use ``hmac.compare_digest`` on the UTF-8 byte strings
of the supplied and expected tokens. The old ``token != expected``
short-circuited on the first differing byte, leaking token length and
prefix-match timing.

For backward compatibility with existing operator bookmarks we also
accept the legacy ``?token=...`` query parameter, but deprecated
usage logs a WARNING. Remove support after every operator is on the
header-based flow.

Current endpoints:

- ``GET /api/admin/baileys/pair-code`` — the current Baileys pairing
  code written by the sidecar during first-time pairing.
- ``GET /api/admin/baileys/qr`` — fallback, serves the raw QR string.
- ``GET /api/admin/baileys/status`` — proxies the sidecar's health endpoint.
"""
from __future__ import annotations

import hmac
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(
    x_admin_token: Optional[str], query_token: Optional[str] = None
) -> None:
    """Check the admin token (header preferred, legacy query param tolerated).

    404 (not 401/403) so the endpoint's existence stays hidden when the
    token is unset or wrong. Timing-safe via ``hmac.compare_digest``.
    """
    expected = (os.environ.get("ADMIN_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=404, detail="Not found")

    supplied = (x_admin_token or "").strip()
    legacy = (query_token or "").strip()
    if not supplied and legacy:
        logger.warning(
            "admin: legacy query-param token used; please switch to the X-Admin-Token header"
        )
        supplied = legacy
    if not supplied:
        raise HTTPException(status_code=404, detail="Not found")
    if not hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=404, detail="Not found")


def _sessions_dir() -> Path:
    return Path(os.environ.get("BAILEYS_SESSIONS_DIR") or "./sessions")


@router.get("/baileys/pair-code")
def baileys_pair_code(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
    token: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Return the current Baileys pairing code, if the sidecar has written one."""
    _require_admin(x_admin_token, token)
    pair_file = _sessions_dir() / "current_pair_code.txt"
    if not pair_file.exists():
        return {"status": "not_ready", "hint": "sidecar has not emitted a pairing code yet"}
    try:
        code = pair_file.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"pair-code read failed: {exc}") from exc
    if not code:
        return {"status": "not_ready"}
    return {"status": "ready", "code": code}


@router.get("/baileys/qr")
def baileys_qr(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
    token: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Fallback: return the raw QR string so the operator can render it."""
    _require_admin(x_admin_token, token)
    qr_file = _sessions_dir() / "current_qr.txt"
    if not qr_file.exists():
        return {"status": "not_ready", "hint": "sidecar has not emitted a QR yet"}
    try:
        qr = qr_file.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"qr read failed: {exc}") from exc
    return {
        "status": "ready",
        "qr": qr,
        "render_hint": (
            "Turn this into a scannable image via "
            "https://api.qrserver.com/v1/create-qr-code/?data=<url_encoded_qr>"
        ),
    }


@router.get("/baileys/status")
def baileys_status(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
    token: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Proxy the sidecar's /wa/health so we don't need render-ssh."""
    _require_admin(x_admin_token, token)
    sidecar_url = os.environ.get("WHATSAPP_SIDECAR_URL") or "http://localhost:3001"
    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(f"{sidecar_url.rstrip('/')}/wa/health")
    except httpx.HTTPError as exc:
        return {"status": "unreachable", "error": str(exc)}
    if response.status_code != 200:
        return {
            "status": "error",
            "http_status": response.status_code,
            "body": response.text[:500],
        }
    return response.json()
