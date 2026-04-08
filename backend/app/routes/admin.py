"""Admin endpoints for one-shot production tasks.

Gated by the ``ADMIN_TOKEN`` environment variable. If that env var is
unset the router is NOT registered (see :func:`app.main`), so hitting
these URLs without the token configured yields a 404.

Current endpoints:

- ``GET /api/admin/baileys/pair-code?token=...`` — serves the current
  Baileys pairing code written by the sidecar during the first-time
  pairing flow. Used to bootstrap the WhatsApp connection on Render's
  headless container without shell access.
- ``GET /api/admin/baileys/qr?token=...`` — fallback: serves the raw
  QR string if the pairing-code flow is unavailable. Turn it into a
  scannable image with https://api.qrserver.com/v1/create-qr-code/?data=<qr>.
- ``GET /api/admin/baileys/status?token=...`` — proxies the sidecar's
  ``/wa/health`` endpoint so the operator can verify pairing succeeded
  without render-ssh access.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(token: str) -> None:
    """Check the admin token. 404 (not 401/403) to avoid leaking the
    endpoint's existence when the token isn't configured or is wrong."""
    expected = os.environ.get("ADMIN_TOKEN")
    if not expected or token != expected:
        raise HTTPException(status_code=404, detail="Not found")


def _sessions_dir() -> Path:
    return Path(os.environ.get("BAILEYS_SESSIONS_DIR") or "./sessions")


@router.get("/baileys/pair-code")
def baileys_pair_code(token: str = Query(...)) -> Dict[str, Any]:
    """Return the current Baileys pairing code, if the sidecar has written one."""
    _require_admin(token)
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
def baileys_qr(token: str = Query(...)) -> Dict[str, Any]:
    """Fallback: return the raw QR string so the operator can render it."""
    _require_admin(token)
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
def baileys_status(token: str = Query(...)) -> Dict[str, Any]:
    """Proxy the sidecar's /wa/health so we don't need render-ssh."""
    _require_admin(token)
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
