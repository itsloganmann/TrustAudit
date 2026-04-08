"""Database configuration for TrustAudit.

Reads ``DATABASE_URL`` from the environment so the same code path works
for:

- Local dev: defaults to ``sqlite:///./trustaudit.db`` (no env var needed).
- Render prod: Render Postgres add-on injects ``DATABASE_URL`` in the
  ``postgres://user:pass@host/db`` form, which we normalize to the
  ``postgresql+psycopg://`` dialect SQLAlchemy 2.x expects.
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./trustaudit.db",  # local-dev fallback
)

# Render Postgres gives us the legacy ``postgres://`` scheme; SQLAlchemy 2.x
# wants ``postgresql+psycopg://`` (the psycopg3 driver).
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

_connect_args = (
    {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency: yields a DB session, closes on completion."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
