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

from .database import engine, Base
from .routes import router

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TrustAudit -- Tax Shield API",
    description="43B(h) compliance engine for Indian MSME payments",
    version="0.1.0",
)

# CORS -- allow Vite dev server and any production origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded challan images
uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Register API routes
app.include_router(router, prefix="/api")

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
