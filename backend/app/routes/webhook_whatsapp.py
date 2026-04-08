"""WhatsApp inbound webhook router.

Exposes:

* ``POST /api/webhook/whatsapp/inbound`` — unified entry point that accepts
  baileys JSON (production) or mock multipart uploads (used by the
  frontend's drag-and-drop demo UI and the fixture-based self-test path).
* ``GET /api/webhook/whatsapp/health`` — aggregated provider health.

The router is exported as ``router`` for ``main.py`` to include.

Concurrency
-----------

The handler is ``async def`` so the FastAPI event loop does not stall.
Provider calls into ``send_text`` and ``download_media`` use synchronous
``httpx`` under the hood (to keep the dep footprint small), so they are
dispatched via ``asyncio.to_thread(...)`` so one slow inbound does not block
every other request.

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
import json
import logging
import os
import re
import time
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session as DBSession

from ..database import get_db
from ..models import Invoice, MSME, User
from ..services import demo_sessions, rate_limit, webhook_idempotency
from ..services.whatsapp import (
    InboundMessage,
    WhatsAppProvider,
    get_whatsapp_provider,
)
from ..services.whatsapp.health import aggregated_health, record_inbound_now
from ..services.whatsapp.mock_client import MockClient
from ..services import webhook_observability

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook/whatsapp", tags=["whatsapp-webhook"])

# Uploads path: prefer the UPLOADS_DIR env var (used on Render so the
# persistent disk mount at /app/data/uploads survives deploys), fall back
# to the repo-local backend/uploads directory for dev.
UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))


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
        return "mock", dict(form)

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
    # Multipart-shaped payloads are unambiguously the local demo / fixture
    # path (the frontend drag-and-drop uploader and the in-repo smoke tests
    # both use this). Always route them to MockClient so ``mock://fixture/``
    # URLs resolve from disk regardless of which real provider the env is
    # configured for. Without this, a server running with
    # ``WHATSAPP_PROVIDER=baileys`` tries to fetch fixture URLs from the
    # baileys sidecar's pendingMedia map and 404s.
    if detected == "mock":
        return MockClient()
    if detected == "baileys":
        from ..services.whatsapp.baileys_client import BaileysClient

        return BaileysClient()
    return get_whatsapp_provider()


async def _run_vision_pipeline_async(image_bytes: bytes):
    """Invoke the vision pipeline if available and return the result.

    Fixed in response to adversary review of 6293462 (must-fix #2):
    uses the correct ``(image_bytes, invoice_id=None)`` argument order and
    actually ``await``-s the coroutine. Returns ``None`` on import or
    runtime failure (the webhook persistence step then no-ops).
    """
    try:
        from ..services.pipeline import run_vision_pipeline  # lazy
    except ImportError:
        logger.info("vision pipeline not yet wired — skipping")
        return None
    try:
        return await run_vision_pipeline(image_bytes, invoice_id=None)
    except Exception as exc:  # noqa: BLE001 — never break the webhook on pipeline failure
        logger.error("vision pipeline failed: %s", exc, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Persistence — convert a PipelineResult into an Invoice row + push to /live
# ---------------------------------------------------------------------------
def _safe_parse_date(value: Any) -> Optional[date]:
    """Parse an ISO date string (YYYY-MM-DD). Returns None on any failure."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except (ValueError, TypeError):
        return None


def _phone_to_session_id(phone: Optional[str]) -> str:
    """Map a WhatsApp From phone to a stable demo session id.

    Used so the public ``/live`` dashboard reacts to inbound submissions
    deterministically. The smoke test computes the same hash to assert
    its row appears.
    """
    if not phone:
        return "live-anonymous"
    digits = re.sub(r"[^0-9]", "", phone)
    return f"live-phone-{digits[-10:]}" if digits else "live-anonymous"


def _persist_pipeline_result(
    db: DBSession,
    result: Any,
    inbound: InboundMessage,
    saved_path: Path,
    image_sha256: str,
    image_bytes: bytes,
) -> Optional[Invoice]:
    """Materialise the pipeline output into an ``Invoice`` row.

    The webhook handler used to call the pipeline and discard the result,
    which meant a real WhatsApp inbound never produced any dashboard
    activity. This helper closes the loop:

    1. Look up the sender by phone to map enterprise/MSME scope (defaults
       to enterprise_id=1 / no-MSME if the phone is unknown).
    2. Build an ``Invoice`` row from the extraction, with sane defaults so
       a partial extraction still produces a viable record.
    3. Commit + record the SHA → invoice_id mapping for future dedup.
    4. Push a sanitized snapshot to the demo session store so the
       ``/live`` public dashboard reacts within the next poll.

    Returns the persisted Invoice row, or None on any failure.
    """
    try:
        extraction = result.extraction
    except AttributeError:
        return None

    user: Optional[User] = None
    if inbound.from_phone_e164:
        user = (
            db.query(User)
            .filter(User.primary_phone_e164 == inbound.from_phone_e164)
            .one_or_none()
        )

    msme: Optional[MSME] = None
    enterprise_id = 1  # default to the seeded "Bharat Industries" enterprise
    if user is not None:
        if user.enterprise_id:
            enterprise_id = user.enterprise_id
        if user.msme_id:
            msme = db.query(MSME).filter(MSME.id == user.msme_id).one_or_none()

    today = date.today()
    invoice_date = _safe_parse_date(extraction.invoice_date) or today
    accept_date = _safe_parse_date(extraction.date_of_acceptance) or today
    deadline = accept_date + timedelta(days=45)

    fallback_vendor = msme.vendor_name if msme else "WhatsApp inbound"
    fallback_gstin = msme.gstin if msme else "PENDING"

    new_state = "PENDING"
    try:
        new_state = result.next_state.value  # InvoiceState enum
    except AttributeError:
        pass

    invoice_number = (
        extraction.invoice_number
        or f"WA-{int(time.time())}-{uuid.uuid4().hex[:6]}"
    )

    # Render an annotated overlay of the challan. This is a pure Pillow
    # call, so it's safe to run inside the DB transaction — we don't want
    # to persist a half-row if annotation fails, but we also don't want
    # a rendering glitch to take down the webhook. Hence the try/except
    # that falls back to a None payload rather than raising.
    annotated_b64: Optional[str] = None
    annotated_boxes: Optional[str] = None
    annotated_w: Optional[int] = None
    annotated_h: Optional[int] = None
    try:
        from ..services.vision.annotator import annotate_image
        from dataclasses import asdict as _asdict

        annotated = annotate_image(image_bytes, extraction)
        annotated_b64 = annotated.png_base64
        annotated_boxes = json.dumps([_asdict(b) for b in annotated.boxes])
        annotated_w = annotated.width
        annotated_h = annotated.height
    except Exception as exc:  # noqa: BLE001 — never fail persistence on annotation
        logger.warning("annotation failed for sid=%s: %s", inbound.message_sid, exc)

    try:
        invoice = Invoice(
            vendor_name=(extraction.vendor_name or fallback_vendor)[:255],
            gstin=(extraction.gstin or fallback_gstin)[:15],
            invoice_number=invoice_number[:100],
            invoice_amount=float(extraction.invoice_amount or 0),
            invoice_date=invoice_date,
            date_of_acceptance=accept_date,
            deadline_43bh=deadline,
            status=new_state,
            challan_image_url=str(saved_path),
            enterprise_id=enterprise_id,
            msme_id=msme.id if msme else None,
            state=new_state,
            confidence_score=float(result.final_confidence or 0.0),
            missing_fields=(
                json.dumps(list(extraction.missing_fields))
                if extraction.missing_fields
                else None
            ),
            detected_edge_cases=(
                json.dumps(
                    [
                        {
                            "case_id": ec.case_id,
                            "case_name": ec.case_name,
                            "severity": ec.severity,
                            "rebut": ec.rebut_message,
                        }
                        for ec in result.edge_cases
                        if getattr(ec, "detected", False)
                    ]
                )
                if result.edge_cases
                else None
            ),
            raw_image_sha256=image_sha256,
            annotated_image_b64=annotated_b64,
            annotated_boxes_json=annotated_boxes,
            annotated_width=annotated_w,
            annotated_height=annotated_h,
        )
        db.add(invoice)
        db.commit()
        db.refresh(invoice)
    except Exception as exc:  # noqa: BLE001
        logger.error("failed to persist invoice from pipeline: %s", exc, exc_info=True)
        db.rollback()
        return None

    # Record the SHA → invoice_id mapping so future identical uploads
    # short-circuit via the existing dedup layer.
    webhook_idempotency.record_image_hash(image_sha256, invoice.id)

    # Push to the public live demo session feed so /live reacts, and
    # fan out an SSE frame to every subscribed dashboard.
    try:
        session_id = _phone_to_session_id(inbound.from_phone_e164)
        # The session might not exist yet — append_invoice auto-creates.
        days_remaining = (deadline - today).days

        # Pretty-label what we got vs what's missing so the public /live
        # row can render readable chips on click. Source of truth is the
        # extraction's missing_fields list — we invert it to derive the
        # extracted set so the two lists always sum to the full schema.
        _FIELD_LABELS = {
            "vendor_name": "Vendor name",
            "gstin": "GSTIN",
            "invoice_number": "Invoice number",
            "invoice_amount": "Amount",
            "invoice_date": "Invoice date",
            "date_of_acceptance": "Acceptance date",
        }
        _missing_set = {
            f for f in (extraction.missing_fields or []) if f in _FIELD_LABELS
        }
        missing_labels = [_FIELD_LABELS[f] for f in _FIELD_LABELS if f in _missing_set]
        extracted_labels = [
            _FIELD_LABELS[f] for f in _FIELD_LABELS if f not in _missing_set
        ]

        # Public image URL: the file is already mounted under /uploads.
        try:
            image_url = f"/uploads/{Path(saved_path).name}"
        except Exception:  # noqa: BLE001
            image_url = None

        feed_entry = {
            "invoice_id": invoice.id,
            "vendor_name": invoice.vendor_name,
            "state": invoice.state or invoice.status,
            "confidence": round(invoice.confidence_score or 0.0, 4),
            "amount": invoice.invoice_amount,
            "days_remaining": days_remaining,
            "invoice_number": invoice.invoice_number,
            "gstin": invoice.gstin,
            # Public-feed enrichment so the /live row can expand on click
            # and explain WHY it's NEEDS_INFO. Stored alongside the raw
            # PII; the public anonymizer keeps these but strips gstin +
            # invoice_number before they leave the server.
            "missing_fields": missing_labels,
            "extracted_fields": extracted_labels,
            "image_url": image_url,
        }
        demo_sessions.append_invoice(session_id, feed_entry)
        # SSE event name: ``invoice.extracted`` when we have a
        # confident extraction, ``invoice.ingested`` otherwise. Both
        # events share the same payload shape so the frontend can just
        # upsert into its table.
        event_name = (
            "invoice.extracted"
            if (invoice.confidence_score or 0.0) >= 0.5
            else "invoice.ingested"
        )
        # Adversary R3 hotfix #1 + #2: SSE frames are a wakeup signal
        # only — they MUST NOT carry vendor_name / gstin / invoice_number,
        # because the SSE endpoint is unauthenticated. The client uses
        # the wakeup to re-fetch /api/live/invoices, which goes through
        # the existing _anonymize() sanitiser. The wildcard "*" bucket
        # gets the same minimal payload so any admin/ops fan-out leak
        # also stays PII-free.
        sse_payload = {
            "invoice_id": invoice.id,
            "state": invoice.state or invoice.status,
            "session_id": session_id,
            "confidence": round(invoice.confidence_score or 0.0, 4),
            "days_remaining": days_remaining,
        }
        demo_sessions.emit(session_id, event_name, sse_payload)
        demo_sessions.emit("*", event_name, sse_payload)
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning("failed to push invoice %s to demo session: %s", invoice.id, exc)

    return invoice


async def _send_text_async(
    provider: WhatsAppProvider, to: str, body: str
) -> tuple[bool, Optional[str]]:
    """Dispatch a provider.send_text call off the event loop so a slow
    provider (e.g. Twilio API timing out) cannot stall every other inbound.

    Returns ``(ok, error)``. Failures are logged but never raised to the
    webhook caller — callers that don't care about the result can simply
    discard the tuple. The step-0.5 inbound ack uses the return value to
    record outbound send health in the observability ring buffer so a
    disconnected Baileys sidecar is visible from
    ``/api/debug/recent-inbounds`` without needing log access.
    """
    if not to:
        return False, "no recipient"
    try:
        await asyncio.to_thread(provider.send_text, to, body)
        return True, None
    except Exception as exc:  # noqa: BLE001
        logger.warning("send_text failed: %s", exc)
        return False, str(exc)


async def _download_media_async(provider: WhatsAppProvider, media_url: str) -> bytes:
    """Download media off the event loop so a slow media fetch cannot
    stall every other inbound."""
    return await asyncio.to_thread(provider.download_media, media_url)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/inbound")
async def inbound_webhook(
    request: Request,
    db: DBSession = Depends(get_db),
):
    # IP-based DoS guard — runs before any work so bogus-payload floods
    # are bounded even before we touch the event loop with JSON parsing.
    # The sidecar itself is whitelisted because it posts from localhost
    # (and from the internal Render address when both services run
    # inside the same VPC) — skipping the check there would also cause
    # self-DoS during bursts of legitimate media.
    client_ip = getattr(request.client, "host", None) or "unknown"
    _WEBHOOK_IP_ALLOWLIST = {"127.0.0.1", "localhost", "::1"}
    if client_ip not in _WEBHOOK_IP_ALLOWLIST and not rate_limit.check(
        "ip",
        client_ip,
        max_per_window=120,  # 2/sec average, room for legit bursty uploads
        window_seconds=60,
    ):
        logger.warning("ip rate limit tripped for %s", client_ip)
        return {"status": "rate_limited", "reason": "ip"}

    detected, payload = await _parse_body(request)

    # Observability — record every inbound regardless of outcome so a
    # demo operator can ask "did the sidecar actually hit me?" via
    # GET /api/debug/recent-inbounds. We no longer verify webhook
    # signatures (Twilio signature verification was removed with the
    # Baileys pivot); sig_status stays "skipped" for back-compat with
    # the observability ring buffer schema.
    sig_status = "skipped"
    has_sig_header = False

    try:
        webhook_observability.record(
            source=detected or "unknown",
            method="POST",
            path=str(request.url.path),
            client_ip=getattr(request.client, "host", None),
            has_signature=has_sig_header,
            signature_valid=(sig_status == "valid"),
            signature_skipped=(sig_status in ("skipped", "invalid")),
            message_sid=payload.get("MessageSid") or payload.get("message_sid"),
            from_phone=payload.get("From") or payload.get("from"),
            num_media=int(payload.get("NumMedia") or payload.get("num_media") or 0),
            body_preview=str(payload.get("Body") or payload.get("body") or ""),
            outcome=f"received:sig={sig_status}",
        )
    except Exception:  # noqa: BLE001 — never let observability take down a webhook
        pass

    provider = _pick_provider(detected)
    inbound: InboundMessage = provider.parse_inbound(payload)
    record_inbound_now()

    # 1. Idempotency — atomic check-and-mark.
    if not webhook_idempotency.mark_seen_if_new(inbound.message_sid):
        logger.info("duplicate webhook sid=%s ignored", inbound.message_sid)
        return {"status": "duplicate", "sid": inbound.message_sid}

    # 1.5. Immediate ack to the sender. Fires *before* the (potentially slow)
    # vision pipeline so the user sees a reply within ~1s. The result is
    # recorded to the observability ring buffer so an operator can
    # diagnose a disconnected Baileys sidecar from
    # /api/debug/recent-inbounds without log access.
    ack_ok, ack_err = await _send_text_async(
        provider,
        inbound.from_phone_e164,
        "TrustAudit: got your challan. Verifying now — "
        "live status at https://trustaudit-wxd7.onrender.com/live",
    )
    try:
        webhook_observability.record(
            source=detected or "unknown",
            method="POST",
            path=str(request.url.path),
            client_ip=getattr(request.client, "host", None),
            from_phone=inbound.from_phone_e164,
            message_sid=inbound.message_sid,
            outcome=f"ack_sent:ok={ack_ok}",
            extra={"ack_error": ack_err},
        )
    except Exception:  # noqa: BLE001 — never let observability take down a webhook
        pass

    # 2. Rate limit per phone number
    if inbound.from_phone_e164 and not rate_limit.check(
        "phone", inbound.from_phone_e164
    ):
        await _send_text_async(
            provider,
            inbound.from_phone_e164,
            "You're sending messages too fast — please wait a moment and try again.",
        )
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
            return {
                "status": "duplicate_image",
                "sid": inbound.message_sid,
                "invoice_id": existing_invoice,
            }

        uploads = _ensure_uploads_dir()
        filename = f"{uuid.uuid4().hex}.jpg"
        saved_path = uploads / filename
        saved_path.write_bytes(image_bytes)

        # Run the vision pipeline AND persist its result. The pipeline
        # itself is pure (no DB writes); the webhook handler is the
        # canonical place for the side effect of "create an Invoice
        # row + push to demo session feed".
        pipeline_result = await _run_vision_pipeline_async(image_bytes)
        if pipeline_result is not None:
            persisted = await asyncio.to_thread(
                _persist_pipeline_result,
                db,
                pipeline_result,
                inbound,
                saved_path,
                image_sha256,
                image_bytes,
            )
            if persisted is not None:
                logger.info(
                    "inbound %s persisted as invoice id=%s state=%s confidence=%.2f",
                    inbound.message_sid,
                    persisted.id,
                    persisted.state,
                    persisted.confidence_score or 0.0,
                )

    # NOTE: the user-visible ack already fired at step 1.5 (immediately
    # after idempotency, before the slow vision pipeline) so the sender
    # gets a reply within ~1s instead of after the entire pipeline runs.

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
