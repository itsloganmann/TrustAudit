"""In-memory ring buffer for the last N inbound webhook hits.

Lets a developer (or a debug-mode UI) ask the running server "did
Twilio actually POST to /api/webhook/whatsapp/inbound recently, and
what happened?" without needing log access.

The buffer is process-local, capped at 50 entries, and intentionally
NOT persisted — restart resets it. Output is a snapshot copy so the
caller cannot mutate the live state.

Used by ``GET /api/debug/recent-inbounds`` (added in the same hotfix)
and by future production observability if needed.
"""
from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict, List, Optional

_LOCK = threading.Lock()
_BUFFER: Deque[Dict] = deque(maxlen=50)


def record(
    *,
    source: str,
    method: str = "POST",
    path: str = "",
    client_ip: Optional[str] = None,
    has_signature: bool = False,
    signature_valid: Optional[bool] = None,
    signature_skipped: bool = False,
    message_sid: Optional[str] = None,
    from_phone: Optional[str] = None,
    num_media: Optional[int] = None,
    body_preview: Optional[str] = None,
    outcome: str = "received",
    extra: Optional[Dict] = None,
) -> None:
    """Append a single observation to the ring buffer.

    All fields are optional except `source` and `outcome` so callers
    can record whatever level of detail they have.
    """
    entry: Dict = {
        "ts": round(time.time(), 3),
        "source": source,
        "method": method,
        "path": path,
        "client_ip": client_ip,
        "has_signature": bool(has_signature),
        "signature_valid": signature_valid,
        "signature_skipped": bool(signature_skipped),
        "message_sid": message_sid,
        "from_phone": from_phone,
        "num_media": num_media,
        "body_preview": (body_preview or "")[:120] if body_preview else None,
        "outcome": outcome,
    }
    if extra:
        entry["extra"] = extra
    with _LOCK:
        _BUFFER.append(entry)


def snapshot(limit: int = 50) -> List[Dict]:
    """Return a copy of the buffer, newest-first, capped at ``limit``."""
    with _LOCK:
        items = list(_BUFFER)
    items.reverse()  # newest first
    return items[: max(1, min(limit, 50))]


def reset() -> None:
    """Clear the buffer (test-only)."""
    with _LOCK:
        _BUFFER.clear()
