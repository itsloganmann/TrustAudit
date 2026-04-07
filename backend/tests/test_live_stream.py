"""Tests for the Phase I Server-Sent Events stream.

Covers:

* Pub/sub delivery — one subscriber receives a frame after ``emit()``.
* Wildcard fan-out — subscribing to ``"*"`` receives events from every
  session id.
* Cleanup — disconnecting the consumer removes its queue from the
  subscriber set so subsequent emits don't leak memory.
* HTTP route — ``GET /api/live/stream?session=...`` returns the SSE
  media type and streams an initial ``stream.open`` frame followed by a
  real event after ``emit()``.

These tests deliberately avoid ``pytest-asyncio``: we drive the event
loop by hand via ``asyncio.new_event_loop().run_until_complete`` so the
backend test suite keeps a zero-plugin pytest config and nothing can
accidentally change collection behavior for the other 59 smoke tests.
"""
from __future__ import annotations

import asyncio
import json
from typing import List

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes.live_stream import HEARTBEAT_SECONDS, _event_stream, _format_sse
from app.services import demo_sessions


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_store():
    """Ensure every test starts from a clean pub/sub state."""
    demo_sessions.reset_all()
    yield
    demo_sessions.reset_all()


def _run(coro):
    """Run ``coro`` on a fresh event loop and return its result."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# Pub/sub — one subscriber gets an event after emit()
# ---------------------------------------------------------------------------


def test_pubsub_single_subscriber_receives_emit() -> None:
    session_id = "phase-i-basic"

    async def scenario() -> List[dict]:
        received: List[dict] = []

        async def consumer() -> None:
            async for frame in demo_sessions.subscribe(session_id):
                received.append(frame)
                return

        task = asyncio.create_task(consumer())
        # Yield so the async generator registers its queue.
        await asyncio.sleep(0)

        delivered = demo_sessions.emit(
            session_id,
            "invoice.extracted",
            {"invoice_id": 101, "state": "VERIFIED"},
        )
        assert delivered == 1

        await asyncio.wait_for(task, timeout=1.0)
        return received

    received = _run(scenario())
    assert len(received) == 1
    frame = received[0]
    assert frame["event"] == "invoice.extracted"
    assert frame["session_id"] == session_id
    assert frame["data"] == {"invoice_id": 101, "state": "VERIFIED"}


# ---------------------------------------------------------------------------
# Wildcard fan-out — subscribing to "*" sees events from all sessions
# ---------------------------------------------------------------------------


def test_wildcard_subscriber_sees_events_from_every_session() -> None:
    async def scenario() -> List[dict]:
        received: List[dict] = []
        want = 3

        async def consumer() -> None:
            async for frame in demo_sessions.subscribe("*"):
                received.append(frame)
                if len(received) >= want:
                    return

        task = asyncio.create_task(consumer())
        await asyncio.sleep(0)

        # Emit to the wildcard bucket directly, as the webhook layer
        # does with ``emit("*", ..., dict(payload, session_id=sid))``.
        # Three distinct sessions, one emit each.
        for sid in ("sess-alpha", "sess-bravo", "sess-charlie"):
            demo_sessions.emit(
                "*",
                "invoice.ingested",
                {"session_id": sid, "n": sid[-1]},
            )

        await asyncio.wait_for(task, timeout=1.0)
        return received

    received = _run(scenario())
    assert len(received) == 3
    seen_sids = {f["data"]["session_id"] for f in received}
    assert seen_sids == {"sess-alpha", "sess-bravo", "sess-charlie"}
    for frame in received:
        assert frame["event"] == "invoice.ingested"


# ---------------------------------------------------------------------------
# Cleanup — disconnecting removes the subscriber queue
# ---------------------------------------------------------------------------


def test_disconnect_cleans_up_subscriber_queue() -> None:
    session_id = "cleanup-phase-i"

    async def scenario() -> tuple[int, int, int, int]:
        before = demo_sessions.subscriber_count(session_id)

        async def consumer() -> None:
            async for _ in demo_sessions.subscribe(session_id):
                return

        task = asyncio.create_task(consumer())
        await asyncio.sleep(0)
        during = demo_sessions.subscriber_count(session_id)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        # The ``finally`` block in ``subscribe`` runs when the generator
        # is closed by the cancellation — yield once so it executes.
        await asyncio.sleep(0)
        after = demo_sessions.subscriber_count(session_id)

        # A later emit to the same session should be a total miss.
        delivered = demo_sessions.emit(session_id, "invoice.ingested", {"x": 1})
        return before, during, after, delivered

    before, during, after, delivered = _run(scenario())
    assert before == 0
    assert during == 1
    assert after == 0
    assert delivered == 0


# ---------------------------------------------------------------------------
# HTTP route — content-type and at least one real frame
# ---------------------------------------------------------------------------


def test_stream_route_returns_event_stream_content_type() -> None:
    """Smoke the ``/api/live/stream`` HTTP surface.

    We drive the ASGI app directly through a minimal ``receive``/``send``
    pair so we can inspect the ``http.response.start`` message (status +
    headers) without blocking on the infinite stream body. ``TestClient``
    and ``httpx``'s stream helpers both try to drain the body, which
    would hang until ``CONNECTION_MAX_SECONDS`` because the route
    legitimately streams forever.
    """

    async def scenario() -> tuple[int, dict[bytes, bytes], bytes]:
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/live/stream",
            "raw_path": b"/api/live/stream",
            "query_string": b"session=phase-i-route",
            "headers": [(b"host", b"testserver")],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
            "root_path": "",
        }

        async def receive() -> dict:
            # Block forever — the route never consumes a request body.
            await asyncio.sleep(3600)
            return {"type": "http.disconnect"}

        captured: dict = {"status": 0, "headers": {}, "first_body": b""}
        start_event = asyncio.Event()
        body_event = asyncio.Event()

        async def send(message: dict) -> None:
            if message["type"] == "http.response.start":
                captured["status"] = message["status"]
                captured["headers"] = {
                    k: v for k, v in message.get("headers", [])
                }
                start_event.set()
            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                if body and not captured["first_body"]:
                    captured["first_body"] = body
                    body_event.set()

        runner = asyncio.ensure_future(app(scope, receive, send))
        try:
            # Wait for the headers to flush.
            await asyncio.wait_for(start_event.wait(), timeout=2.0)
            # Wait for the first body chunk (the ``stream.open`` frame).
            await asyncio.wait_for(body_event.wait(), timeout=2.0)
        finally:
            runner.cancel()
            try:
                await runner
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

        return captured["status"], captured["headers"], captured["first_body"]

    status, headers, first_body = _run(asyncio.wait_for(scenario(), timeout=5.0))

    assert status == 200
    ctype = headers.get(b"content-type", b"").decode()
    assert ctype.startswith("text/event-stream"), ctype
    assert headers.get(b"cache-control", b"").decode().startswith("no-cache")
    assert headers.get(b"x-accel-buffering", b"") == b"no"

    body_text = first_body.decode("utf-8", errors="replace")
    assert "event: stream.open" in body_text
    assert "\ndata: " in body_text


def test_stream_route_rejects_missing_session_param() -> None:
    client = TestClient(app)
    response = client.get("/api/live/stream")
    # FastAPI's Query(..., min_length=1) -> 422 Unprocessable Entity.
    assert response.status_code == 422


def test_stream_route_rejects_empty_session_param() -> None:
    client = TestClient(app)
    response = client.get("/api/live/stream", params={"session": ""})
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Unit: SSE framing helper
# ---------------------------------------------------------------------------


def test_format_sse_frame_matches_wire_spec() -> None:
    frame = _format_sse("invoice.extracted", {"invoice_id": 1, "state": "VERIFIED"})
    # Must end with the mandatory blank line that separates frames.
    assert frame.endswith("\n\n")
    lines = frame.splitlines()
    assert lines[0] == "event: invoice.extracted"
    assert lines[1].startswith("data: ")
    # The data line must be valid JSON that round-trips.
    payload = json.loads(lines[1][len("data: "):])
    assert payload == {"invoice_id": 1, "state": "VERIFIED"}


# ---------------------------------------------------------------------------
# Integration: _event_stream emits stream.open and forwards real events
# ---------------------------------------------------------------------------


def test_event_stream_emits_stream_open_then_forwards_real_event() -> None:
    """Drive the async generator directly to avoid Render-style timeouts."""

    async def scenario() -> List[str]:
        gen = _event_stream("phase-i-direct")
        chunks: List[str] = []

        # First frame is the stream.open handshake.
        chunks.append(await gen.__anext__())

        # Fire a real emit and collect the next frame.
        demo_sessions.emit(
            "phase-i-direct",
            "invoice.extracted",
            {"invoice_id": 314, "state": "VERIFIED"},
        )
        chunks.append(await asyncio.wait_for(gen.__anext__(), timeout=1.0))

        await gen.aclose()
        return chunks

    chunks = _run(scenario())
    assert "event: stream.open" in chunks[0]
    assert "event: invoice.extracted" in chunks[1]
    # Sanity check: the heartbeat cadence is still the documented 15s.
    assert HEARTBEAT_SECONDS == 15.0
