"""WhatsApp inbound webhook router.

Exposes:

* ``POST /api/webhook/whatsapp/inbound`` — unified entry point that accepts
  Twilio form-encoded payloads, baileys JSON, or mock multipart uploads
  (used by the frontend's drag-and-drop demo UI).
* ``GET /api/webhook/whatsapp/health`` — aggregated provider health.

The router is exported as ``router`` for ``main.py`` to include.

Security
--------

For the Twilio-detected path this handler verifies the ``X-Twilio-Signature``
header via HMAC-SHA1 against ``TWILIO_AUTH_TOKEN``. Requests failing validation
are rejected with 403 before any side effects. Gate with
``TWILIO_VALIDATE_SIGNATURE=0`` to bypass in local dev only.

Concurrency
-----------

The handler is ``async def`` so the FastAPI event loop does not stall.
Provider calls into ``send_text`` and ``download_media`` use synchronous
``httpx`` under the hood (to keep the dep footprint small), so they are
dispatched via ``asyncio.to_thread(...)`` so one slow inbound does not block
every other request. This eliminates the Twilio retry-storm foot-gun called
out by the adversary review of 6293462 (must-fix #4).

Idempotency
-----------

Uses the atomic ``mark_seen_if_new`` helper from ``webhook_idempotency`` so
two concurrent retries cannot both pass the check-then-mark gate. The
image-hash dedup layer only records ``(sha256, invoice_id)`` pairs when
there is an actual invoice id available — the old "invoice #0" sentinel
that leaked into user-facing WhatsApp replies is gone.

Vision pipeline
---------------

On media receive, the raw bytes are passed directly to
``backend.app.services.pipeline.run_vision_pipeline`` (an ``async`` function).
Calls are ``await``-ed with the correct argument order
``(image_bytes, invoice_id=None)``. Import is lazy so the module still works
if the pipeline isn't available.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response

from ..services import rate_limit, webhook_idempotency
from ..services.whatsapp import (
    InboundMessage,
    WhatsAppProvider,
    get_whatsapp_provider,
)
from ..services.whatsapp.health import aggregated_health, record_inbound_now
from ..services.whatsapp.mock_client import MockClient
from ..services.whatsapp.twilio_signature import (
    is_validation_enabled as twilio_sig_enabled,
    verify_twilio_signature,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook/whatsapp", tags=["whatsapp-webhook"])

UPLOADS_DIR = Path(__file__).resolve().parents[2] / "uploads"

# TwiML empty reply — Twilio's preferred ack body for a POST it will retry on
# non-2xx. We still send the user-visible acknowledgement via the async
# ``send_text`` call so the TwiML body stays minimal.
_EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>'


def _ensure_uploads_dir() -> Path:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOADS_DIR


async def _parse_body(request: Request) -> tuple[str, Dict[str, Any]]:
    """Return (detected_provider, payload_dict) from a raw request."""
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()

    if content_type == "application/json":
        try:
            data = await request.json()
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}")
        if not isinstance(data, dict):
            raise HTTPException(status_code=400, detail="JSON body must be an object")
        return "baileys", data

    if content_type == "application/x-www-form-urlencoded":
        form = await request.form()
        return "twilio", dict(form)

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        return "mock", dict(form)

    # Fall back to raw form parse — some clients send without headers.
    try:
        form = await request.form()
        return "mock", dict(form)
    except Exception:
        raise HTTPException(status_code=415, detail=f"Unsupported content type: {content_type}")


def _pick_provider(detected: str) -> WhatsAppProvider:
    """Prefer the env-configured provider unless the payload shape conflicts."""
    configured = os.environ.get("WHATSAPP_PROVIDER", "mock").lower()
    if configured == detected:
        return get_whatsapp_provider()
    # If the env says mock but the payload is clearly Twilio, parse it with Twilio.
    if detected == "twilio":
        from ..services.whatsapp.twilio_client import TwilioClient
        from ..services.whatsapp.base import WhatsAppProviderNotConfigured

        try:
            return TwilioClient()
        except WhatsAppProviderNotConfigured:
            return MockClient()
    if detected == "baileys":
        from ..services.whatsapp.baileys_client import BaileysClient

        return BaileysClient()
    return get_whatsapp_provider()


async def _run_vision_pipeline_async(image_bytes: bytes) -> None:
    """Invoke the vision pipeline if available.

    Fixed in response to adversary review of 6293462 (must-fix #2):
    uses the correct ``(image_bytes, invoice_id=None)`` argument order and
    actually ``await``-s the coroutine. Falls back to a no-op if the pipeline
    module hasn't been imported in this build.
    """
    try:
        from ..services.pipeline import run_vision_pipeline  # lazy
    except ImportError:
        logger.info("vision pipeline not yet wired — skipping")
        return
    try:
        await run_vision_pipeline(image_bytes, invoice_id=None)
    except Exception as exc:  # noqa: BLE001 — never break the webhook on pipeline failure
        logger.error("vision pipeline failed: %s", exc, exc_info=True)


async def _send_text_async(provider: WhatsAppProvider, to: str, body: str) -> None:
    """Dispatch a provider.send_text call off the event loop so a slow
    provider (e.g. Twilio API timing out) cannot stall every other inbound.
    Failures are logged but never raised to the webhook caller.
    """
    if not to:
        return
    try:
        await asyncio.to_thread(provider.send_text, to, body)
    except Exception as exc:  # noqa: BLE001
        logger.warning("send_text failed: %s", exc)


async def _download_media_async(provider: WhatsAppProvider, media_url: str) -> bytes:
    """Download media off the event loop so a slow Twilio media fetch cannot
    stall every other inbound."""
    return await asyncio.to_thread(provider.download_media, media_url)


def _validate_twilio_signature(request: Request, payload: Dict[str, Any]) -> None:
    """Raise 403 if the ``X-Twilio-Signature`` header does not match.

    No-op if validation is disabled via env var (mock/local dev path).
    """
    if not twilio_sig_enabled():
        return
    full_url = str(request.url)
    sig = request.headers.get("X-Twilio-Signature", "")
    # Twilio signs only string-typed params; form values from starlette are
    # already strings.
    string_params = {k: str(v) for k, v in payload.items()}
    if not verify_twilio_signature(full_url, string_params, sig):
        logger.warning(
            "twilio signature rejected url=%s sid=%s",
            full_url,
            payload.get("MessageSid") or payload.get("message_sid") or "(none)",
        )
        raise HTTPException(status_code=403, detail="invalid twilio signature")


def _twiml_response() -> Response:
    """Return an empty TwiML body. Twilio prefers ``text/xml`` for webhook
    acks and logs a warning when we return JSON."""
    return Response(content=_EMPTY_TWIML, media_type="application/xml")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/inbound")
async def inbound_webhook(request: Request):
    detected, payload = await _parse_body(request)

    # Security — reject forged Twilio webhooks before any side effects.
    if detected == "twilio":
        _validate_twilio_signature(request, payload)

    provider = _pick_provider(detected)
    inbound: InboundMessage = provider.parse_inbound(payload)
    record_inbound_now()

    # 1. Idempotency — atomic check-and-mark.
    if not webhook_idempotency.mark_seen_if_new(inbound.message_sid):
        logger.info("duplicate webhook sid=%s ignored", inbound.message_sid)
        if detected == "twilio":
            return _twiml_response()
        return {"status": "duplicate", "sid": inbound.message_sid}

    # 2. Rate limit per phone number
    if inbound.from_phone_e164 and not rate_limit.check(
        "phone", inbound.from_phone_e164
    ):
        await _send_text_async(
            provider,
            inbound.from_phone_e164,
            "You're sending messages too fast — please wait a moment and try again.",
        )
        if detected == "twilio":
            return _twiml_response()
        return {"status": "rate_limited", "sid": inbound.message_sid}

    # 3. Media handling — download, hash, dedup, persist, call pipeline
    saved_path: Optional[Path] = None
    image_sha256: Optional[str] = None
    if inbound.media_url:
        try:
            image_bytes = await _download_media_async(provider, inbound.media_url)
        except Exception as exc:  # noqa: BLE001
            logger.error("media download failed: %s", exc)
            await _send_text_async(
                provider,
                inbound.from_phone_e164,
                "We couldn't download your photo in time — please send it again.",
            )
            if detected == "twilio":
                return _twiml_response()
            return {
                "status": "media_download_failed",
                "sid": inbound.message_sid,
                "error": str(exc),
            }

        image_sha256 = hashlib.sha256(image_bytes).hexdigest()
        existing_invoice = webhook_idempotency.find_invoice_by_image_hash(image_sha256)
        if existing_invoice:
            # Only short-circuit if we actually have a real invoice id.
            # See adversary review of 6293462 (must-fix #1, P1-7): the old
            # code recorded ``invoice_id=0`` and leaked "invoice #0" to the
            # user; we now record nothing until the pipeline creates a real
            # invoice row, and dedup only short-circuits for ids >= 1.
            await _send_text_async(
                provider,
                inbound.from_phone_e164,
                f"Already received this challan — invoice #{existing_invoice} is in the dashboard.",
            )
            if detected == "twilio":
                return _twiml_response()
            return {
                "status": "duplicate_image",
                "sid": inbound.message_sid,
                "invoice_id": existing_invoice,
            }

        uploads = _ensure_uploads_dir()
        filename = f"{uuid.uuid4().hex}.jpg"
        saved_path = uploads / filename
        saved_path.write_bytes(image_bytes)

        # Kick the vision pipeline. The pipeline itself is responsible for
        # eventually creating the Invoice row and calling
        # ``record_image_hash(sha256, invoice_id)`` once the id is known.
        await _run_vision_pipeline_async(image_bytes)

    # 4. Reply to the sender (non-blocking, errors are logged)
    await _send_text_async(
        provider, inbound.from_phone_e164, "Received — processing..."
    )

    # Twilio expects ``text/xml`` TwiML for webhook responses; other providers
    # (baileys, mock) are fine with JSON for observability.
    if detected == "twilio":
        return _twiml_response()
    return {
        "status": "accepted",
        "sid": inbound.message_sid,
        "provider": inbound.provider,
        "media_sha256": image_sha256,
        "stored_path": str(saved_path) if saved_path else None,
    }


@router.get("/health")
def health_check() -> Dict[str, Any]:
    return aggregated_health()
