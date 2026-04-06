"""Shared pytest fixtures for the TrustAudit backend test suite.

Provides:
* ``db_engine`` / ``db_session`` -- isolated in-memory SQLite for unit tests
  so they never touch the real ``backend/trustaudit.db`` file.
* ``api_client`` -- a ``TestClient`` bound to the real ``app.main:app``,
  used by smoke / integration tests that exercise the routed surface area.
* ``challan_fixture_path`` -- absolute path resolver for the synthetic
  challan JPGs under ``backend/tests/fixtures/challans/``.
* ``reset_mock_whatsapp_state`` -- clears the in-memory MockClient SENT_MESSAGES
  list between tests so prior runs cannot leak into ``health.sent_count`` checks.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Iterator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Make the backend package importable without installing it.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database import Base  # noqa: E402  (sys.path tweak must come first)
import app.models  # noqa: F401,E402  (register models on Base.metadata)


# ---------------------------------------------------------------------------
# Database fixtures (W1)
# ---------------------------------------------------------------------------
@pytest.fixture()
def db_engine():
    """A fresh in-memory SQLite engine per test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def db_session(db_engine) -> Iterator[Session]:
    """A transactional session that rolls back after each test."""
    SessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=db_engine
    )
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# ---------------------------------------------------------------------------
# HTTP fixtures (W10) -- a TestClient against the real app.main:app
# ---------------------------------------------------------------------------
@pytest.fixture()
def api_client():
    """``TestClient`` bound to the real FastAPI app.

    Use this for smoke + integration tests that need to exercise the
    routed surface area. Unit tests should prefer ``db_session`` instead
    so they remain hermetic.
    """
    from fastapi.testclient import TestClient  # local import keeps cold-start fast

    from app.main import app

    with TestClient(app) as client:
        yield client


# ---------------------------------------------------------------------------
# Filesystem fixtures (W10) -- challan fixture lookup
# ---------------------------------------------------------------------------
_FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "challans"


@pytest.fixture(scope="session")
def challan_fixture_dir() -> Path:
    """Return the absolute path to ``backend/tests/fixtures/challans/``."""
    if not _FIXTURE_DIR.is_dir():
        pytest.skip(f"challan fixtures dir missing: {_FIXTURE_DIR}")
    return _FIXTURE_DIR


@pytest.fixture()
def challan_fixture_path(challan_fixture_dir: Path):
    """Factory: ``path = challan_fixture_path('perfect_tally_printed.jpg')``."""

    def _resolve(name: str) -> Path:
        candidate = challan_fixture_dir / name
        if not candidate.is_file():
            pytest.skip(f"fixture not found: {candidate}")
        return candidate

    return _resolve


# ---------------------------------------------------------------------------
# WhatsApp mock-state reset (W10)
# ---------------------------------------------------------------------------
@pytest.fixture()
def reset_mock_whatsapp_state():
    """Clear the in-memory MockClient SENT_MESSAGES list before AND after a test.

    Tests that assert on ``health.sent_count`` should depend on this fixture
    so prior runs in the same pytest session do not leak counts.
    """
    from app.services.whatsapp.mock_client import reset_mock_state

    reset_mock_state()
    try:
        yield
    finally:
        reset_mock_state()
