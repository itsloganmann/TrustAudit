# syntax=docker/dockerfile:1.6
#
# TrustAudit -- multi-stage container for Render.com.
#
# Stage 1 builds the React frontend bundle with Node 20.
# Stage 2 installs the baileys WhatsApp sidecar npm tree (separate Node process).
# Stage 3 runs Python 3.11 + Node 20 (for the sidecar) + the WeasyPrint
#         system libs (cairo, pango, gdk-pixbuf, libffi, fonts) so PDF
#         generation works inside the slim base image.
#
# The container runs ``start.sh`` which:
#   1. (optionally) launches the baileys sidecar in the background when
#      WHATSAPP_PROVIDER=baileys
#   2. execs uvicorn on $PORT (Render injects 10000 by default)
#

# ---------------------------------------------------------------------------
# Stage 1: build the frontend (Vite -> static files in frontend/dist)
# ---------------------------------------------------------------------------
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend

# Use a clean, reproducible install if a lockfile is present, fall back to
# ``npm install`` so the build never wedges on a missing lockfile.
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then \
        npm ci --no-audit --no-fund; \
    else \
        npm install --no-audit --no-fund; \
    fi

COPY frontend/ ./
RUN npm run build


# ---------------------------------------------------------------------------
# Stage 2: install the baileys sidecar's npm dependencies
# ---------------------------------------------------------------------------
FROM node:20-slim AS sidecar-build
WORKDIR /app/sidecar

# baileys' transitive deps include a git-source package (libsignal-node).
# node:20-slim does not ship git, so npm install fails with
# "errno -2 / enoent / unknown git error". Install git + ca-certificates
# in this build stage only — the runtime image is unaffected because we
# only COPY --from=sidecar-build the resolved node_modules tree.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY backend/services/whatsapp_sidecar/package*.json ./
RUN if [ -f package-lock.json ]; then \
        npm ci --omit=dev --no-audit --no-fund; \
    else \
        npm install --omit=dev --no-audit --no-fund; \
    fi

COPY backend/services/whatsapp_sidecar/ ./


# ---------------------------------------------------------------------------
# Stage 3: runtime image (Python 3.11 + Node 20 + WeasyPrint deps)
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# WeasyPrint system libraries on Debian Bookworm slim:
#   * libcairo2, libpango-1.0-0, libpangocairo-1.0-0 -- text/PDF rendering
#   * libgdk-pixbuf-2.0-0 -- image decoding inside HTML
#   * libffi-dev, shared-mime-info -- runtime FFI + MIME sniffing
#   * fonts-dejavu-core, fonts-liberation -- glyphs so PDFs aren't blank
# Plus Node 20 (NodeSource) for the WhatsApp sidecar.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf-2.0-0 \
        libffi-dev \
        shared-mime-info \
        fonts-dejavu-core \
        fonts-liberation \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Bring in the built frontend from stage 1.
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Bring in the sidecar (with node_modules already installed) from stage 2.
COPY --from=sidecar-build /app/sidecar /app/backend/services/whatsapp_sidecar

# Backend Python source.
COPY backend /app/backend

# Install Python deps. ``--no-cache-dir`` keeps the layer small.
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Seed the SQLite DB at build time so the first request to /api/invoices
# returns the 50 fixture rows. The seed script is idempotent.
RUN cd /app/backend && python seed.py

# Render injects $PORT; default to 10000 if running locally.
EXPOSE 10000
ENV PORT=10000

# Health probe for Render's L7 checker.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-10000}/health || exit 1

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
