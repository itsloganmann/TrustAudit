"""SQLite database configuration for TrustAudit MVP."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./trustaudit.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency: yields a DB session, closes on completion."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
