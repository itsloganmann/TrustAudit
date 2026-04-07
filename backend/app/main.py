"""TrustAudit MVP -- FastAPI Entry Point.

Serves both the API and the built React frontend as a single service.
In development, Vite proxies /api requests here.
In production, FastAPI serves the static frontend from ../frontend/dist.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import os
import re

from .database import engine, Base
from .routes import router  # legacy routes (backward compat with simulate_driver.py)
from .routes.webhook_whatsapp import router as whatsapp_webhook_router
from .routes.auth import router as auth_router
from .routes.demo import router as demo_router
from .routes.invoices_public import router as invoices_public_router
from .routes.disputes import router as disputes_router
from .routes.compliance import router as compliance_router
from .routes.verification import router as verification_router
from .routes.invoice_insights import router as invoice_insights_router
from .routes.live_stream import router as live_stream_router

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TrustAudit -- Tax Shield API",
    description="43B(h) compliance engine for Indian MSME payments",
    version="0.1.0",
)

# CORS -- explicit allowlist (adversary 7926af6 #5).
#
# ``allow_origins=["*"]`` plus ``allow_credentials=True`` is invalid per
# the CORS spec — browsers refuse to send the cookie, so cross-origin
# auth fails silently. We therefore enumerate exact origins, and let
# operators extend the list via the ``CORS_ALLOWED_ORIGINS`` env var
# (comma-separated).
_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8000",
    "https://trustaudit-wxd7.onrender.com",
    "https://trustaudit.onrender.com",
    "https://trustaudit.in",
    "https://www.trustaudit.in",
]
_extra = [o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()]
ALLOWED_ORIGINS = sorted(set(_DEFAULT_ALLOWED_ORIGINS + _extra))

# Optional preview-deploy regex (e.g. ``https://trustaudit-pr-\d+.onrender.com``)
_preview_regex = os.environ.get("CORS_ALLOWED_ORIGIN_REGEX", "").strip() or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=_preview_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["content-type", "authorization", "x-requested-with", "x-demo-seed-token"],
)

# Serve uploaded challan images
uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Serve bundled test fixture images so the autonomous smoke pipeline can
# point ``MediaUrl0`` at a publicly reachable URL on the deployed host.
# These are the same JPGs used by ``backend/tests/test_*.py`` — bundled
# with the Docker image at build time.
fixtures_dir = os.path.join(
    os.path.dirname(__file__), "..", "tests", "fixtures", "challans"
)
if os.path.isdir(fixtures_dir):
    app.mount(
        "/fixtures/challans",
        StaticFiles(directory=fixtures_dir),
        name="fixtures",
    )

# Register API routes
app.include_router(router, prefix="/api")  # legacy: /api/invoices, /api/stats, /api/webhook/whatsapp, /api/activity
app.include_router(whatsapp_webhook_router, prefix="/api")  # new: /api/webhook/whatsapp/inbound
app.include_router(auth_router, prefix="/api/auth")  # signup, signin, magic, oauth, otp, identities, me, signout
app.include_router(demo_router, prefix="/api")  # /api/demo/new-session, /api/demo/qr, /api/demo/health
app.include_router(invoices_public_router, prefix="/api")  # /api/live/invoices (anonymized)
app.include_router(disputes_router, prefix="/api")  # /api/disputes (vendor/admin scoped, W9)
app.include_router(compliance_router, prefix="/api")  # /api/invoices/{id}/compliance.pdf, /submit-to-gov (W9)
app.include_router(verification_router, prefix="/api")  # /api/verify/{id} (PUBLIC, no auth, W9)
app.include_router(invoice_insights_router, prefix="/api")  # /api/invoices/{id}/annotation + /justification
app.include_router(live_stream_router, prefix="/api")  # /api/live/stream?session=... (SSE)

# Resolve the frontend dist directory
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@app.get("/health")
def health_check():
    return {"status": "healthy"}


# Serve the built React frontend (production)
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(request: Request, full_path: str):
        """Catch-all: serve index.html for client-side routing."""
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
else:
    @app.get("/")
    def root():
        return {
            "service": "TrustAudit Tax Shield API",
            "status": "operational",
            "version": "0.1.0",
            "docs": "/docs",
        }
