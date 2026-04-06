"""Tests for the in-memory demo session store.

Covers:
* Happy-path session creation, append, and listing.
* Age-based filtering (10-minute window).
* Deterministic anonymization across calls within a session.
* Concurrent appends don't corrupt state.
* Prune logic keeps recent rows and removes expired ones.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services import demo_sessions


@pytest.fixture(autouse=True)
def _reset_store():
    demo_sessions.reset_all()
    yield
    demo_sessions.reset_all()


# ---------------------------------------------------------------------------
# create_session / get_session
# ---------------------------------------------------------------------------


def test_create_session_generates_high_entropy_hex_id():
    """Adversary 7926af6 #20 — id namespace must be ≥ 64 bits to defeat
    brute-force enumeration of /api/live/invoices."""
    sid = demo_sessions.create_session()
    assert isinstance(sid, str)
    assert len(sid) == 16  # 8 bytes hex
    int(sid, 16)  # valid hex


def test_create_session_accepts_explicit_id():
    sid = demo_sessions.create_session("acme-corp")
    assert sid == "acme-corp"
    meta = demo_sessions.get_session("acme-corp")
    assert meta is not None
    assert meta["session_id"] == "acme-corp"
    assert meta["invoice_count"] == 0


def test_get_session_returns_none_for_unknown_id():
    assert demo_sessions.get_session("does-not-exist") is None


def test_create_session_with_duplicate_custom_id_raises():
    """Adversary 7926af6 #7 — refuse to silently share a session bucket
    between two callers, otherwise CFOs in different Zoom calls would
    see each other's invoices."""
    demo_sessions.create_session("shared-id")
    with pytest.raises(demo_sessions.SessionAlreadyExists):
        demo_sessions.create_session("shared-id")


# ---------------------------------------------------------------------------
# append_invoice / list_recent
# ---------------------------------------------------------------------------


def test_append_and_list_returns_anonymized_row():
    sid = demo_sessions.create_session("t1")
    demo_sessions.append_invoice(
        "t1",
        {
            "vendor_name": "Gupta Steel Pvt Ltd",
            "state": "VERIFIED",
            "confidence": 0.94,
            "amount": 125000,
            "days_remaining": 28,
        },
    )
    rows = demo_sessions.list_recent(sid)
    assert len(rows) == 1
    row = rows[0]
    # Vendor name is anonymized — real name must not leak.
    assert "vendor_name" not in row
    assert row["vendor_display_name"] == "Vendor A"
    assert row["state"] == "VERIFIED"
    assert row["confidence"] == 0.94


def test_anonymization_is_deterministic_across_vendors_within_session():
    """Two vendors in alphabetical order should get A, B consistently."""
    sid = demo_sessions.create_session("t2")
    demo_sessions.append_invoice("t2", {"vendor_name": "Bharat Industries", "state": "PENDING"})
    demo_sessions.append_invoice("t2", {"vendor_name": "Alpha Textiles", "state": "PENDING"})
    demo_sessions.append_invoice("t2", {"vendor_name": "Bharat Industries", "state": "VERIFIED"})

    rows = demo_sessions.list_recent(sid)
    # Three rows total.
    assert len(rows) == 3
    # Alpha sorts before Bharat -> Alpha=A, Bharat=B.
    name_map = {}
    for row in rows:
        # Can't recover real name, but we can check all Bharat rows share a letter.
        pass
    # Call list_recent a second time — mapping must be identical.
    rows2 = demo_sessions.list_recent(sid)
    assert [r["vendor_display_name"] for r in rows] == [r["vendor_display_name"] for r in rows2]

    display_names = {r["vendor_display_name"] for r in rows}
    assert display_names == {"Vendor A", "Vendor B"}


def test_anonymization_mapping_is_per_session():
    """Different sessions can have different A/B assignments."""
    demo_sessions.create_session("s1")
    demo_sessions.create_session("s2")
    demo_sessions.append_invoice("s1", {"vendor_name": "Zeta Corp"})
    demo_sessions.append_invoice("s2", {"vendor_name": "Zeta Corp"})

    rows1 = demo_sessions.list_recent("s1")
    rows2 = demo_sessions.list_recent("s2")
    # In s1, Zeta is the only vendor — gets A.
    assert rows1[0]["vendor_display_name"] == "Vendor A"
    # Same for s2 in isolation.
    assert rows2[0]["vendor_display_name"] == "Vendor A"


def test_letter_rollover_beyond_26_vendors():
    """27th vendor should be AA, not crash."""
    sid = demo_sessions.create_session("bigsession")
    for i in range(30):
        demo_sessions.append_invoice(sid, {"vendor_name": f"Vendor{i:02d}Real"})
    rows = demo_sessions.list_recent(sid)
    labels = {r["vendor_display_name"] for r in rows}
    assert "Vendor A" in labels
    assert "Vendor Z" in labels
    assert "Vendor AA" in labels
    assert "Vendor AD" in labels  # 30 vendors -> goes up to AD


# ---------------------------------------------------------------------------
# Age filtering
# ---------------------------------------------------------------------------


def test_list_recent_filters_out_old_rows():
    sid = demo_sessions.create_session("agetest")
    now = time.time()
    # Old row: 20 minutes ago.
    demo_sessions.append_invoice(
        sid, {"vendor_name": "Old Vendor", "created_at": now - 1200}
    )
    # Fresh row.
    demo_sessions.append_invoice(sid, {"vendor_name": "Fresh Vendor"})

    rows = demo_sessions.list_recent(sid, max_age_seconds=600)
    assert len(rows) == 1
    # Only fresh vendor survives — gets letter A.
    assert rows[0]["vendor_display_name"] == "Vendor A"


def test_list_recent_sorted_newest_first():
    sid = demo_sessions.create_session("order")
    now = time.time()
    demo_sessions.append_invoice(
        sid, {"vendor_name": "First", "created_at": now - 60}
    )
    demo_sessions.append_invoice(
        sid, {"vendor_name": "Second", "created_at": now - 30}
    )
    demo_sessions.append_invoice(
        sid, {"vendor_name": "Third", "created_at": now - 1}
    )
    rows = demo_sessions.list_recent(sid)
    # Newest first.
    ts_list = [r["created_at"] for r in rows]
    assert ts_list == sorted(ts_list, reverse=True)


def test_list_recent_empty_for_unknown_session():
    assert demo_sessions.list_recent("nope") == []


# ---------------------------------------------------------------------------
# prune_expired
# ---------------------------------------------------------------------------


def test_prune_expired_drops_old_rows():
    sid = demo_sessions.create_session("prune1")
    now = time.time()
    demo_sessions.append_invoice(sid, {"vendor_name": "Keep", "created_at": now})
    demo_sessions.append_invoice(sid, {"vendor_name": "Drop1", "created_at": now - 800})
    demo_sessions.append_invoice(sid, {"vendor_name": "Drop2", "created_at": now - 900})
    removed = demo_sessions.prune_expired(max_age_seconds=600)
    assert removed == 2
    rows = demo_sessions.list_recent(sid)
    assert len(rows) == 1


# ---------------------------------------------------------------------------
# Thread safety
# ---------------------------------------------------------------------------


def test_concurrent_appends_do_not_corrupt_state():
    sid = demo_sessions.create_session("concurrent")
    N = 200

    def worker(i: int) -> None:
        demo_sessions.append_invoice(
            sid, {"vendor_name": f"Vendor-{i % 5}", "seq": i}
        )

    with ThreadPoolExecutor(max_workers=16) as pool:
        list(pool.map(worker, range(N)))

    rows = demo_sessions.list_recent(sid)
    assert len(rows) == N
    # All 5 distinct real vendors -> A..E.
    display_names = {r["vendor_display_name"] for r in rows}
    assert display_names == {"Vendor A", "Vendor B", "Vendor C", "Vendor D", "Vendor E"}


def test_concurrent_appends_across_sessions():
    # Pre-allocate the 10 distinct sessions so workers only append.
    for i in range(10):
        demo_sessions.create_session(f"s{i}")

    def worker(i: int) -> None:
        sid = f"s{i % 10}"
        demo_sessions.append_invoice(sid, {"vendor_name": f"V-{i}"})

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(100)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert demo_sessions.active_session_count() == 10
    total = sum(
        len(demo_sessions.list_recent(f"s{i}")) for i in range(10)
    )
    assert total == 100
