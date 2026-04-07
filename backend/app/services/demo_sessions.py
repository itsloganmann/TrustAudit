"""Thread-safe in-memory demo session store for the public /live feed.

This module owns the lightweight state that powers ``/api/live/invoices``
and ``/api/demo/*``. It is intentionally decoupled from the main SQL
database because the public demo dashboard has a very different
lifecycle from the real multi-tenant product:

* Rows auto-expire after 10 minutes (default) so the shared screen
  doesn't accumulate cruft between Zoom calls.
* Vendor names are anonymized to ``Vendor A/B/C`` so nothing identifying
  leaks onto the public URL.
* Multiple concurrent customer meetings run in parallel under distinct
  ``session_id`` keys and never cross-pollinate.

The store is a plain ``dict[str, SessionState]`` guarded by a
``threading.Lock``. It is deliberately ephemeral: a server restart
wipes all sessions, which is the correct behavior for a demo surface.

Every mutation returns a new dict/list — we never mutate objects that
have already been handed to callers. This keeps the API immutable
from the caller's perspective and makes reasoning about concurrency
much easier.
"""
from __future__ import annotations

import asyncio
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import AsyncIterator, Dict, List, Optional, Set, Tuple

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------

SESSION_ID_BYTES = 8  # 8 bytes -> 16 hex chars (~64 bits) — adversary 7926af6 #20
DEFAULT_MAX_AGE_SECONDS = 600  # 10 minutes — matches the plan spec
MAX_INVOICES_PER_SESSION = 500  # adversary 7926af6 #21


class SessionAlreadyExists(ValueError):
    """Raised by ``create_session`` when a custom_id is already in use.

    Adversary 7926af6 #7 — silently handing out the same session bucket
    to two callers leaks invoices across CFO demos.
    """


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SessionState:
    """Immutable snapshot of a demo session.

    ``invoices`` is a plain list of dicts. We treat it as immutable by
    convention — callers get a deep-ish copy via ``list_recent``.
    """

    session_id: str
    created_at: float
    invoices: List[Dict] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal state
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_sessions: Dict[str, SessionState] = {}

# Pub/sub for Server-Sent Events (Phase I).
#
# Each ``subscribe`` call registers an ``asyncio.Queue`` keyed by
# session_id. ``emit`` fans out a payload to every subscriber for that
# session (and to the wildcard ``"*"`` bucket, for admin/ops streams).
#
# We use ``asyncio.Queue`` instead of ``threading.Queue`` because the
# SSE endpoint is an ``async def`` generator — mixing sync queues into
# an async loop would force us to ``run_in_executor`` for every frame.
#
# The queue list itself is guarded by ``_subscribers_lock`` (a plain
# ``threading.Lock``) because ``emit`` can be called from a sync
# thread (``asyncio.to_thread`` worker in the webhook persistence
# path). We hold the lock only long enough to snapshot the subscriber
# list; the actual ``put_nowait`` happens outside the lock to avoid
# deadlocks if a queue is full.
_subscribers_lock = threading.Lock()

# Adversary R3 hotfix #3:
# ``asyncio.Queue.put_nowait`` is NOT thread-safe. Earlier versions
# stored a bare ``Set[Queue]`` and called ``put_nowait`` from
# ``emit``, which the webhook handler invokes inside a worker thread
# via ``asyncio.to_thread``. Cross-thread puts can drop wakeups,
# leave futures inconsistent, and silently lose SSE frames during
# the demo. The fix is to capture the running event loop in
# ``subscribe`` and route every put through
# ``loop.call_soon_threadsafe``. We store ``(queue, loop)`` tuples
# so each subscriber knows which loop owns its queue.
_SubscriberKey = Tuple["asyncio.Queue[Dict]", asyncio.AbstractEventLoop]
_subscribers: Dict[str, Set[_SubscriberKey]] = {}
SUBSCRIBER_QUEUE_MAX = 64  # drop oldest on overflow, per-subscriber


def _safe_put(queue: "asyncio.Queue[Dict]", frame: Dict) -> None:
    """Bounded put — runs on the queue's owning event loop.

    Drops the oldest frame if the consumer has fallen behind so a
    stalled SSE tab cannot grow memory unbounded.
    """
    try:
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        queue.put_nowait(frame)
    except Exception:  # noqa: BLE001 — best-effort
        pass


# ---------------------------------------------------------------------------
# Anonymization helpers
# ---------------------------------------------------------------------------


def _letter_for_index(index: int) -> str:
    """Map 0 -> A, 1 -> B, 25 -> Z, 26 -> AA, 27 -> AB, ..."""
    if index < 0:
        raise ValueError("index must be non-negative")
    result = ""
    index_plus = index + 1
    while index_plus > 0:
        index_plus, rem = divmod(index_plus - 1, 26)
        result = chr(ord("A") + rem) + result
    return result


def _anonymize(invoices: List[Dict]) -> List[Dict]:
    """Deterministically rename vendors to ``Vendor A/B/C...``.

    The mapping is stable for a given set of real vendor names within
    a single session: we sort real names alphabetically, then assign
    letters by that order. This means a vendor always gets the same
    letter within a session regardless of when their rows arrived.
    """
    real_names = sorted({str(inv.get("vendor_name", "Unknown")) for inv in invoices})
    mapping = {name: f"Vendor {_letter_for_index(i)}" for i, name in enumerate(real_names)}

    anonymized: List[Dict] = []
    for inv in invoices:
        copy = dict(inv)
        real = str(copy.get("vendor_name", "Unknown"))
        copy["vendor_display_name"] = mapping.get(real, "Vendor ?")
        # Never expose the real name back out of the anonymizer.
        copy.pop("vendor_name", None)
        anonymized.append(copy)
    return anonymized


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_session(session_id: Optional[str] = None) -> str:
    """Create a new demo session and return its id.

    Adversary 7926af6 #7 — when a caller passes ``session_id`` (custom
    id), we refuse to create-or-reuse: if the id already exists we raise
    ``SessionAlreadyExists`` so the route layer can return 409. The
    server-generated path stays loop-until-unique because the 64-bit
    namespace makes collisions astronomically unlikely.
    """
    with _lock:
        if session_id:
            if session_id in _sessions:
                raise SessionAlreadyExists(
                    f"demo session {session_id!r} is already in use"
                )
            sid = session_id
        else:
            for _ in range(8):
                candidate = secrets.token_hex(SESSION_ID_BYTES)
                if candidate not in _sessions:
                    sid = candidate
                    break
            else:  # pragma: no cover - astronomically unlikely
                raise RuntimeError("could not allocate a unique session id")
        _sessions[sid] = SessionState(session_id=sid, created_at=time.time())
        return sid


def get_session(session_id: str) -> Optional[Dict]:
    """Return session metadata (not the full invoice list) or None."""
    with _lock:
        state = _sessions.get(session_id)
        if state is None:
            return None
        return {
            "session_id": state.session_id,
            "created_at": state.created_at,
            "invoice_count": len(state.invoices),
        }


def append_invoice(session_id: str, invoice: Dict) -> None:
    """Append an invoice to the session, auto-creating if needed.

    The stored row gets a ``created_at`` timestamp if the caller didn't
    provide one. We store a shallow copy so the caller's dict is not
    mutated by later writes.
    """
    entry = dict(invoice)
    entry.setdefault("created_at", time.time())
    entry.setdefault("session_id", session_id)

    with _lock:
        state = _sessions.get(session_id)
        if state is None:
            state = SessionState(
                session_id=session_id,
                created_at=time.time(),
                invoices=[],
            )
            _sessions[session_id] = state
        # Cap rows per session (adversary 7926af6 #21) so a flaky
        # webhook can't grow one bucket unbounded.
        if len(state.invoices) >= MAX_INVOICES_PER_SESSION:
            state.invoices.pop(0)
        state.invoices.append(entry)


def list_recent(
    session_id: str, max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS
) -> List[Dict]:
    """Return anonymized rows from the last ``max_age_seconds`` seconds.

    Returns an empty list if the session doesn't exist or has nothing
    recent. The output is sorted newest-first so the UI can paint
    freshest rows at the top.
    """
    now = time.time()
    cutoff = now - max_age_seconds

    with _lock:
        state = _sessions.get(session_id)
        if state is None:
            return []
        recent = [
            dict(inv)
            for inv in state.invoices
            if float(inv.get("created_at", now)) >= cutoff
        ]

    anonymized = _anonymize(recent)
    anonymized.sort(key=lambda r: r.get("created_at", 0), reverse=True)
    return anonymized


def prune_expired(max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS) -> int:
    """Drop expired rows and empty sessions. Returns the count removed.

    Called periodically by the demo routes to keep the in-memory store
    from growing unbounded on a long-lived server.
    """
    now = time.time()
    cutoff = now - max_age_seconds
    removed = 0

    with _lock:
        for sid in list(_sessions.keys()):
            state = _sessions[sid]
            kept = [
                inv
                for inv in state.invoices
                if float(inv.get("created_at", now)) >= cutoff
            ]
            removed += len(state.invoices) - len(kept)
            if kept:
                _sessions[sid] = SessionState(
                    session_id=state.session_id,
                    created_at=state.created_at,
                    invoices=kept,
                )
            else:
                # Keep the empty session metadata around for a while so
                # /live?session=<id> still works for a just-opened tab.
                age = now - state.created_at
                if age > max_age_seconds:
                    del _sessions[sid]
    return removed


def active_session_count() -> int:
    with _lock:
        return len(_sessions)


def reset_all() -> None:
    """Test helper: nuke every session. Not for production use."""
    with _lock:
        _sessions.clear()
    with _subscribers_lock:
        _subscribers.clear()


# ---------------------------------------------------------------------------
# Pub/sub — Server-Sent Events wiring (Phase I)
# ---------------------------------------------------------------------------
def emit(session_id: str, event: str, payload: Dict) -> int:
    """Broadcast ``payload`` to every subscriber for ``session_id`` + ``"*"``.

    Returns the number of subscribers the message was scheduled to.
    Safe to call from both sync and async contexts; never raises.

    Adversary R3 hotfix #3:
    ``emit`` may be called from a worker thread (the webhook calls
    ``_persist_pipeline_result`` via ``asyncio.to_thread``). Each
    subscriber tuple carries its own owning event loop, and we route
    the bounded put through ``loop.call_soon_threadsafe`` so the
    queue mutation always runs on the loop that owns it.

    The dict delivered to subscribers is a new object — we never
    share mutable state across subscribers.

    A subscriber registered under ``"*"`` receives every event
    exactly once, even when ``emit`` itself is called with
    ``session_id="*"``. We deduplicate the target set so a wildcard
    subscriber never gets the same frame twice.
    """
    frame = {
        "event": str(event),
        "session_id": str(session_id),
        "timestamp": time.time(),
        "data": dict(payload),
    }

    with _subscribers_lock:
        targets_set: Set[_SubscriberKey] = set()
        targets_set.update(_subscribers.get(session_id, set()))
        targets_set.update(_subscribers.get("*", set()))
        targets = list(targets_set)

    delivered = 0
    for queue, loop in targets:
        try:
            # Always hop onto the queue's owning loop. This makes
            # ``emit`` safe to call from any thread.
            if loop.is_closed():
                continue
            loop.call_soon_threadsafe(_safe_put, queue, dict(frame))
            delivered += 1
        except RuntimeError:
            # Loop has been shut down between snapshot and call.
            continue
        except Exception:  # noqa: BLE001 — best-effort, never break the caller
            continue
    return delivered


async def subscribe(session_id: str) -> AsyncIterator[Dict]:
    """Async generator yielding one frame dict per ``emit`` call.

    Usage::

        async for frame in subscribe(session_id):
            yield f"event: {frame['event']}\\n"
            yield f"data: {json.dumps(frame['data'])}\\n\\n"

    Heartbeats are handled by the caller (the SSE route) — this
    function only forwards real events. The subscriber queue is
    registered on entry and removed on cancellation so a disconnected
    client immediately stops receiving frames.

    Adversary R3 hotfix #3: captures the running event loop and
    stores it alongside the queue so cross-thread emits can hop
    back via ``loop.call_soon_threadsafe``.
    """
    loop = asyncio.get_running_loop()
    queue: "asyncio.Queue[Dict]" = asyncio.Queue(maxsize=SUBSCRIBER_QUEUE_MAX)
    key: _SubscriberKey = (queue, loop)
    with _subscribers_lock:
        _subscribers.setdefault(session_id, set()).add(key)
    try:
        while True:
            frame = await queue.get()
            yield frame
    finally:
        with _subscribers_lock:
            bucket = _subscribers.get(session_id)
            if bucket is not None:
                bucket.discard(key)
                if not bucket:
                    _subscribers.pop(session_id, None)


def subscriber_count(session_id: Optional[str] = None) -> int:
    """Return subscriber count for a session (or total if ``None``)."""
    with _subscribers_lock:
        if session_id is None:
            return sum(len(s) for s in _subscribers.values())
        return len(_subscribers.get(session_id, set()))
