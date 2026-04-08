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
FROM node:25-slim AS frontend-build
WORKDIR /app/frontend

# Vite bakes VITE_* env vars into the static bundle at build time. We
# accept them as build ARGs so Render's ``envVars`` block (see render.yaml)
# can flow them through on every build without rebuilding the image
# locally. ARGs default to the empty string; frontend/src/config/legal.js
# then falls back to its hard-coded TODO_LEGAL placeholders, which the
# Privacy/Terms pages render with a loud amber warning banner.
ARG VITE_LEGAL_COMPANY_NAME=""
ARG VITE_LEGAL_COMPANY_LEGAL_NAME=""
ARG VITE_LEGAL_COMPANY_REGISTRATION=""
ARG VITE_LEGAL_REGISTERED_ADDRESS=""
ARG VITE_LEGAL_JURISDICTION_CITY=""
ARG VITE_LEGAL_PRIVACY_EMAIL=""
ARG VITE_LEGAL_SUPPORT_EMAIL=""
ARG VITE_LEGAL_GRIEVANCE_OFFICER_NAME=""
ARG VITE_LEGAL_GRIEVANCE_OFFICER_EMAIL=""
ARG VITE_LEGAL_GRIEVANCE_OFFICER_PHONE=""
ARG VITE_LEGAL_GRIEVANCE_OFFICER_ADDRESS=""
ARG VITE_LEGAL_PRIVACY_LAST_UPDATED=""
ARG VITE_LEGAL_TERMS_LAST_UPDATED=""
ARG VITE_LEGAL_HOSTING_REGION=""
ARG VITE_LEGAL_PLANNED_HOSTING_REGION=""
ENV VITE_LEGAL_COMPANY_NAME=${VITE_LEGAL_COMPANY_NAME}
ENV VITE_LEGAL_COMPANY_LEGAL_NAME=${VITE_LEGAL_COMPANY_LEGAL_NAME}
ENV VITE_LEGAL_COMPANY_REGISTRATION=${VITE_LEGAL_COMPANY_REGISTRATION}
ENV VITE_LEGAL_REGISTERED_ADDRESS=${VITE_LEGAL_REGISTERED_ADDRESS}
ENV VITE_LEGAL_JURISDICTION_CITY=${VITE_LEGAL_JURISDICTION_CITY}
ENV VITE_LEGAL_PRIVACY_EMAIL=${VITE_LEGAL_PRIVACY_EMAIL}
ENV VITE_LEGAL_SUPPORT_EMAIL=${VITE_LEGAL_SUPPORT_EMAIL}
ENV VITE_LEGAL_GRIEVANCE_OFFICER_NAME=${VITE_LEGAL_GRIEVANCE_OFFICER_NAME}
ENV VITE_LEGAL_GRIEVANCE_OFFICER_EMAIL=${VITE_LEGAL_GRIEVANCE_OFFICER_EMAIL}
ENV VITE_LEGAL_GRIEVANCE_OFFICER_PHONE=${VITE_LEGAL_GRIEVANCE_OFFICER_PHONE}
ENV VITE_LEGAL_GRIEVANCE_OFFICER_ADDRESS=${VITE_LEGAL_GRIEVANCE_OFFICER_ADDRESS}
ENV VITE_LEGAL_PRIVACY_LAST_UPDATED=${VITE_LEGAL_PRIVACY_LAST_UPDATED}
ENV VITE_LEGAL_TERMS_LAST_UPDATED=${VITE_LEGAL_TERMS_LAST_UPDATED}
ENV VITE_LEGAL_HOSTING_REGION=${VITE_LEGAL_HOSTING_REGION}
ENV VITE_LEGAL_PLANNED_HOSTING_REGION=${VITE_LEGAL_PLANNED_HOSTING_REGION}

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
FROM node:25-slim AS sidecar-build
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

# NOTE: we intentionally do NOT run seed.py at build time any more. Once
# the DB backend became Render Postgres the build context has no network
# access to the DB, and running seed.py against SQLite at build time would
# write a stale file that the persistent disk then shadowed. Migrations +
# idempotent seed now run at container start (see start.sh).

# Render injects $PORT; default to 10000 if running locally.
EXPOSE 10000
ENV PORT=10000

# Health probe for Render's L7 checker.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-10000}/health || exit 1

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
