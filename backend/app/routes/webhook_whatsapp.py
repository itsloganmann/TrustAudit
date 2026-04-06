"""WhatsApp inbound webhook router.

Exposes:

* ``POST /api/webhook/whatsapp/inbound`` — unified entry point that accepts
  Twilio form-encoded payloads, baileys JSON, or mock multipart uploads
  (used by the frontend's drag-and-drop demo UI).
* ``GET /api/webhook/whatsapp/health`` — aggregated provider health.

The router is exported as ``router`` for W10 to wire into ``main.py``.
It does NOT register itself.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request

from ..services import rate_limit, webhook_idempotency
from ..services.whatsapp import (
    InboundMessage,
    WhatsAppProvider,
    get_whatsapp_provider,
)
from ..services.whatsapp.health import aggregated_health, record_inbound_now
from ..services.whatsapp.mock_client import MockClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook/whatsapp", tags=["whatsapp-webhook"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
UPLOADS_DIR = Path(__file__).resolve().parents[2] / "uploads"


def _ensure_uploads_dir() -> Path:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOADS_DIR


async def _parse_body(request: Request) -> tuple[str, Dict[str, Any]]:
    """Return (detected_provider, payload_dict) from raw request."""
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


def _run_vision_pipeline_stub(invoice_id: Optional[int], image_path: Path) -> None:
    """Lazy-import the vision pipeline and call it.

    # TODO: W3-integration — the real ``backend.app.services.pipeline`` module
    # is still in progress; until it lands we log and return.
    """
    try:
        from ..services.pipeline import run_vision_pipeline  # type: ignore
    except ImportError:
        logger.info(
            "vision pipeline not yet wired (W3): invoice_id=%s path=%s",
            invoice_id,
            image_path,
        )
        return
    try:
        run_vision_pipeline(invoice_id, image_path.read_bytes())  # type: ignore[misc]
    except Exception as exc:  # noqa: BLE001 -- downstream failures must not break webhook
        logger.error("vision pipeline failed for %s: %s", image_path, exc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/inbound")
async def inbound_webhook(request: Request) -> Dict[str, Any]:
    detected, payload = await _parse_body(request)
    provider = _pick_provider(detected)
    inbound: InboundMessage = provider.parse_inbound(payload)
    record_inbound_now()

    # 1. Idempotency — duplicate MessageSid / id
    if webhook_idempotency.is_duplicate_message(inbound.message_sid):
        logger.info("duplicate webhook sid=%s ignored", inbound.message_sid)
        return {"status": "duplicate", "sid": inbound.message_sid}
    webhook_idempotency.mark_message_seen(inbound.message_sid)

    # 2. Rate limit per phone number
    if inbound.from_phone_e164 and not rate_limit.check(
        "phone", inbound.from_phone_e164
    ):
        try:
            provider.send_text(
                inbound.from_phone_e164,
                "You're sending messages too fast — please wait a moment and try again.",
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("rate-limit notice send failed: %s", exc)
        return {"status": "rate_limited", "sid": inbound.message_sid}

    # 3. Media handling — download, hash, dedup, persist, call pipeline
    saved_path: Optional[Path] = None
    image_sha256: Optional[str] = None
    if inbound.media_url:
        try:
            image_bytes = provider.download_media(inbound.media_url)
        except Exception as exc:  # noqa: BLE001
            logger.error("media download failed: %s", exc)
            return {
                "status": "media_download_failed",
                "sid": inbound.message_sid,
                "error": str(exc),
            }

        image_sha256 = hashlib.sha256(image_bytes).hexdigest()
        existing_invoice = webhook_idempotency.find_invoice_by_image_hash(image_sha256)
        if existing_invoice is not None:
            try:
                provider.send_text(
                    inbound.from_phone_e164,
                    f"Already received this challan (invoice #{existing_invoice}).",
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("dup-image reply failed: %s", exc)
            return {
                "status": "duplicate_image",
                "sid": inbound.message_sid,
                "invoice_id": existing_invoice,
            }

        uploads = _ensure_uploads_dir()
        filename = f"{uuid.uuid4().hex}.jpg"
        saved_path = uploads / filename
        saved_path.write_bytes(image_bytes)
        webhook_idempotency.record_image_hash(image_sha256, invoice_id=0)

        _run_vision_pipeline_stub(None, saved_path)

    # 4. Reply to the sender
    if inbound.from_phone_e164:
        try:
            provider.send_text(inbound.from_phone_e164, "Received — processing...")
        except Exception as exc:  # noqa: BLE001
            logger.warning("ack send failed: %s", exc)

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
