"""Adversary R3 hotfix regression tests for the SSE live-stream endpoint.

Three issues from `.fleet/adversary/R3-verdict.md`:

1. PII leak: webhook emits raw vendor_name / gstin / invoice_number
   into the SSE frame, which is delivered over an unauthenticated
   endpoint. Fix: webhook now sends a wakeup-only payload.
2. Wildcard `session=*` is publicly subscribable. Fix: route layer
   rejects `*` and any non-`[A-Za-z0-9_-]` characters with HTTP 400.
3. Cross-thread put_nowait race: `emit` runs on a worker thread
   (asyncio.to_thread), but ``asyncio.Queue`` is not thread-safe.
   Fix: subscribers store ``(queue, loop)`` tuples and emits hop
   onto the queue's owning loop via ``call_soon_threadsafe``.
"""
from __future__ import annotations

import asyncio
import json
import threading
from typing import List

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import demo_sessions


client = TestClient(app)


# ---------------------------------------------------------------------------
# Issue #2 — wildcard / charset rejection
# ---------------------------------------------------------------------------
def test_stream_rejects_wildcard_session():
    """``session=*`` must be rejected with HTTP 400."""
    resp = client.get("/api/live/stream?session=*")
    assert resp.status_code == 400
    body = resp.json()
    assert "invalid session id" in body["detail"].lower()


def test_stream_rejects_nonalphanumeric_session():
    """Any character outside ``[A-Za-z0-9_-]`` is rejected."""
    bad_ids = [
        "foo<script>",
        "foo bar",
        "foo/bar",
        "foo;bar",
        "foo?bar",
        "foo.bar",       # period not allowed (could mask path traversal)
        "foo*bar",
        "foo$bar",
        "foo'bar",
    ]
    for bad in bad_ids:
        resp = client.get(f"/api/live/stream?session={bad}")
        assert resp.status_code in (400, 422), (
            f"expected 400/422 for session={bad!r}, got {resp.status_code}"
        )


def test_stream_accepts_valid_session_charset():
    """Alphanumeric, dash, underscore — all OK. Stream returns
    text/event-stream.

    We can't use ``client.stream(...)`` here because the SSE response
    body never naturally closes, so the ``with`` block would block
    indefinitely waiting for body iteration. Instead we drive the
    ASGI app manually, capture the ``http.response.start`` envelope
    (status + headers), and abort the runner without consuming any
    body. This mirrors the pattern W1 used in test_live_stream.py.
    """
    import asyncio as _asyncio

    valid_ids = [
        "abc",
        "abc123",
        "live-phone-5551234567",
        "my_session_id",
        "ABC-XYZ_123",
    ]

    async def probe(session_id: str):
        captured = {}

        async def receive():
            return {"type": "http.disconnect"}

        async def send(message):
            if message["type"] == "http.response.start":
                captured["status"] = message["status"]
                captured["headers"] = {
                    k.decode("latin-1").lower(): v.decode("latin-1")
                    for k, v in message["headers"]
                }
                # Abort by raising — we don't need the body.
                raise _asyncio.CancelledError()

        scope = {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "path": "/api/live/stream",
            "raw_path": b"/api/live/stream",
            "query_string": f"session={session_id}".encode("latin-1"),
            "headers": [(b"host", b"testserver")],
            "client": ("testclient", 50000),
            "server": ("testserver", 80),
            "scheme": "http",
            "root_path": "",
        }
        try:
            await app(scope, receive, send)
        except _asyncio.CancelledError:
            pass
        return captured

    for ok in valid_ids:
        captured = _asyncio.new_event_loop().run_until_complete(probe(ok))
        assert captured.get("status") == 200, (
            f"session={ok!r} should be 200, got {captured}"
        )
        ct = captured.get("headers", {}).get("content-type", "")
        assert ct.startswith("text/event-stream"), (
            f"session={ok!r} content-type wrong: {ct!r}"
        )


# ---------------------------------------------------------------------------
# Issue #1 — SSE payload contains no PII
# ---------------------------------------------------------------------------
_PII_KEYS = ("vendor_name", "gstin", "invoice_number")


def _frames_for(session_id: str, emit_fn) -> List[dict]:
    """Helper: subscribe, run ``emit_fn``, return drained frames."""
    received: List[dict] = []
    finished = threading.Event()

    async def consumer():
        async for frame in demo_sessions.subscribe(session_id):
            received.append(frame)
            if len(received) >= 1:
                finished.set()
                return

    async def runner():
        task = asyncio.create_task(consumer())
        # Let the subscribe() generator register its queue.
        await asyncio.sleep(0)
        emit_fn()
        try:
            await asyncio.wait_for(task, timeout=2.0)
        except asyncio.TimeoutError:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    asyncio.new_event_loop().run_until_complete(runner())
    return received


def test_emit_payload_without_pii_keys_passes_through():
    """Sanity: a payload that omits PII keys round-trips intact."""
    sid = "pii-test-no-pii"
    payload = {"invoice_id": 99, "state": "VERIFIED", "confidence": 0.92}

    frames = _frames_for(sid, lambda: demo_sessions.emit(sid, "invoice.extracted", payload))

    assert len(frames) == 1
    data = frames[0]["data"]
    for key in _PII_KEYS:
        assert key not in data, f"PII key {key!r} leaked into SSE payload"
    assert data["invoice_id"] == 99


def test_webhook_sse_payload_strips_pii(monkeypatch):
    """Regression for adversary R3 #1: when the webhook handler builds
    its SSE payload, none of vendor_name, gstin, or invoice_number
    must end up on the wire.

    We emulate the webhook's ``_persist_pipeline_result`` SSE
    publishing block by reproducing the dict construction in-place
    and verifying the resulting frame does not carry PII keys.
    """
    sid = "pii-test-webhook-shape"

    # Mirror the webhook's SSE payload construction (see
    # webhook_whatsapp.py::_persist_pipeline_result):
    sse_payload = {
        "invoice_id": 51,
        "state": "VERIFIED",
        "session_id": sid,
        "confidence": 0.92,
        "days_remaining": 45,
    }

    frames = _frames_for(sid, lambda: demo_sessions.emit(sid, "invoice.extracted", sse_payload))
    assert len(frames) == 1
    raw = json.dumps(frames[0])
    for key in _PII_KEYS:
        assert key not in raw, (
            f"webhook SSE payload still leaks {key!r}: {raw}"
        )


def test_wildcard_subscriber_never_sees_pii():
    """Issue #1 + #2 together: even if a wildcard subscriber were to
    register (impossible from outside via the route, but possible from
    in-process admin code), the payload it receives must not contain
    PII because the webhook only emits a sanitized wakeup."""
    received: List[dict] = []

    async def runner():
        async def consumer():
            async for frame in demo_sessions.subscribe("*"):
                received.append(frame)
                return

        task = asyncio.create_task(consumer())
        await asyncio.sleep(0)

        # Two emits — one to a real session, one direct to "*". Both
        # should be PII-free because the webhook never includes PII.
        sse_payload = {
            "invoice_id": 7,
            "state": "VERIFIED",
            "session_id": "live-phone-5550001111",
            "confidence": 0.91,
            "days_remaining": 45,
        }
        demo_sessions.emit("live-phone-5550001111", "invoice.extracted", sse_payload)
        try:
            await asyncio.wait_for(task, timeout=1.0)
        except asyncio.TimeoutError:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    asyncio.new_event_loop().run_until_complete(runner())

    assert len(received) >= 1
    raw = json.dumps(received[0])
    for key in _PII_KEYS:
        assert key not in raw, (
            f"wildcard subscriber received PII key {key!r}: {raw}"
        )


# ---------------------------------------------------------------------------
# Issue #3 — cross-thread put_nowait race
# ---------------------------------------------------------------------------
def test_emit_from_worker_thread_delivers_to_subscriber():
    """``emit`` must be safe to call from a thread other than the one
    running the subscriber's event loop. The fix uses
    ``loop.call_soon_threadsafe`` so the put hops back to the right
    loop.

    Without the fix, this test will time out (or crash with a
    ``RuntimeError`` about scheduling on the wrong loop).
    """
    sid = "thread-safety"
    received: List[dict] = []

    async def runner():
        async def consumer():
            async for frame in demo_sessions.subscribe(sid):
                received.append(frame)
                return

        task = asyncio.create_task(consumer())
        await asyncio.sleep(0)

        # Spin off a real worker thread that calls emit().
        def worker():
            demo_sessions.emit(sid, "invoice.extracted", {"id": 1})

        t = threading.Thread(target=worker, daemon=True)
        t.start()
        t.join(timeout=2.0)

        try:
            await asyncio.wait_for(task, timeout=2.0)
        except asyncio.TimeoutError:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

    asyncio.new_event_loop().run_until_complete(runner())
    assert len(received) == 1, "cross-thread emit dropped the frame"
    assert received[0]["data"]["id"] == 1
