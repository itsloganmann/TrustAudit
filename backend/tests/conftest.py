"""Shared pytest fixtures for the TrustAudit backend test suite.

Provides an in-memory SQLite ``db_session`` fixture so tests never touch
the real SQLite file at ``backend/trustaudit.db``.
"""
from __future__ import annotations

import os
import sys
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
