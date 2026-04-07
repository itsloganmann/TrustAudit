"""Server-Sent Events (SSE) endpoint for the public live demo dashboard.

Route
-----
``GET /api/live/stream?session={session_id}``

Returns a ``text/event-stream`` response that fans out
``invoice.ingested`` / ``invoice.extracted`` frames from the in-memory
``demo_sessions`` pub/sub whenever the WhatsApp webhook persists a new
row for that session id.

Wire format
-----------
Each frame is encoded as an SSE block::

    event: invoice.extracted
    data: {"invoice_id": 51, "state": "VERIFIED", ...}

A comment heartbeat (``: keepalive\\n\\n``) is emitted every 15s so
Render's proxy does not close the connection as idle.

Design notes
------------
* This is an ``async def`` endpoint returning a ``StreamingResponse``.
  We do NOT use ``asyncio.to_thread`` — the subscribe queue is native
  asyncio.
* The endpoint is deliberately unauthenticated. It's backed by the
  same public demo session store as ``/api/live/invoices``, which is
  already sanitized (vendor names anonymized, no GSTIN). Adding auth
  would require session cookies over EventSource which is a known
  friction point.
* Flaky clients (tab close, mobile network drop) unsubscribe cleanly
  because the ``subscribe`` async generator removes its queue in a
  ``finally`` block when the generator is torn down.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from ..services import demo_sessions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/live", tags=["live-stream"])

# How often to emit a keepalive comment frame (seconds).
#
# Render's default idle timeout is 100s for HTTP/1.1 connections; the
# baileys sidecar uses 60s. 15s leaves headroom for proxy jitter and
# still doesn't flood the wire with junk.
HEARTBEAT_SECONDS = 15.0

# Max lifetime of a single SSE connection (seconds). Browsers will
# auto-reconnect via the default EventSource retry logic, so bounding
# the connection length prevents an extremely stale tab from holding
# onto a subscriber slot forever.
CONNECTION_MAX_SECONDS = 60 * 30  # 30 minutes


def _format_sse(event: str, data: dict) -> str:
    """Encode a dict as a named SSE frame.

    Each line of a multi-line payload would need its own ``data:``
    prefix, but we JSON-encode so there are no embedded newlines by
    default. Ends with the mandatory blank line that separates frames.
    """
    payload = json.dumps(data, default=str, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


async def _event_stream(session_id: str) -> AsyncIterator[str]:
    """Yield SSE-formatted strings for one subscriber.

    Emits an initial ``stream.open`` frame so the client can confirm
    the connection. Then multiplexes real ``emit`` frames with
    periodic keepalive comments.
    """
    yield _format_sse(
        "stream.open",
        {"session_id": session_id, "heartbeat_s": HEARTBEAT_SECONDS},
    )

    start_time = asyncio.get_event_loop().time()
    source = demo_sessions.subscribe(session_id)

    try:
        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > CONNECTION_MAX_SECONDS:
                yield _format_sse("stream.close", {"reason": "max_lifetime"})
                return

            try:
                frame = await asyncio.wait_for(
                    source.__anext__(), timeout=HEARTBEAT_SECONDS
                )
            except asyncio.TimeoutError:
                # Heartbeat comment — SSE spec says lines starting with
                # ``:`` are ignored by the client, so this keeps the
                # connection warm without firing an event on the DOM.
                yield ": keepalive\n\n"
                continue
            except StopAsyncIteration:
                return

            event_name = str(frame.get("event") or "message")
            data = frame.get("data") or {}
            if not isinstance(data, dict):
                data = {"value": data}
            yield _format_sse(event_name, data)
    finally:
        # Ensure the subscribe generator cleans up its queue.
        try:
            await source.aclose()
        except Exception:  # noqa: BLE001
            pass


@router.get("/stream")
async def stream_live_events(
    session: str = Query(..., min_length=1, max_length=128),
) -> StreamingResponse:
    """Open a named SSE stream for the given demo session id."""
    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # nginx: disable buffering
    }
    return StreamingResponse(
        _event_stream(session),
        media_type="text/event-stream",
        headers=headers,
    )
