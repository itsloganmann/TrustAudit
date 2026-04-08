#!/bin/bash
# TrustAudit container entrypoint.
#
# Behavior:
#   * If WHATSAPP_PROVIDER=baileys, launch the Node sidecar in the background
#     so the Python backend can hit it on http://localhost:3001.
#   * Always exec uvicorn on $PORT (Render injects this; default 10000).
#
# When run locally without /app, falls back to the repo layout for ./start.sh
# in dev mode.
set -euo pipefail

PORT="${PORT:-10000}"
WHATSAPP_PROVIDER="${WHATSAPP_PROVIDER:-mock}"

# ---------------------------------------------------------------------------
# Container path (Docker / Render)
# ---------------------------------------------------------------------------
if [ -d /app/backend ]; then
    cd /app/backend

    # Ensure persistent-disk directories exist before anything tries to
    # write to them. Render mounts /app/data empty on the first deploy.
    mkdir -p "${BAILEYS_SESSIONS_DIR:-/app/data/baileys_sessions}"
    mkdir -p "${UPLOADS_DIR:-/app/data/uploads}"

    # Run Alembic migrations before anything else touches the DB.
    # Idempotent: a no-op if we're already at head.
    echo "[start.sh] running alembic migrations..."
    if ! alembic upgrade head; then
        echo "[start.sh] FATAL: alembic upgrade head failed" >&2
        exit 1
    fi

    # Seed demo data (idempotent — skipped if DB already has invoices).
    echo "[start.sh] seeding demo data (no-op if already populated)..."
    python seed.py || echo "[start.sh] WARNING: seed.py exited non-zero, continuing"

    if [ "${WHATSAPP_PROVIDER}" = "baileys" ]; then
        if [ -d /app/backend/services/whatsapp_sidecar ]; then
            echo "[start.sh] launching baileys sidecar (background)..."
            (
                cd /app/backend/services/whatsapp_sidecar
                BACKEND_URL="http://localhost:${PORT}" \
                PORT=3001 \
                BAILEYS_SESSIONS_DIR="${BAILEYS_SESSIONS_DIR:-/app/data/baileys_sessions}" \
                PAIRING_PHONE="${PAIRING_PHONE:-}" \
                node index.js &
            )
        else
            echo "[start.sh] WARNING: WHATSAPP_PROVIDER=baileys but sidecar dir missing"
        fi
    fi

    echo "[start.sh] starting uvicorn on 0.0.0.0:${PORT} (whatsapp_provider=${WHATSAPP_PROVIDER})"
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
fi

# ---------------------------------------------------------------------------
# Local dev path (run from repo root)
# ---------------------------------------------------------------------------
echo "TrustAudit Tax Shield -- Starting dev servers..."

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "${REPO_ROOT}/backend"

if [ ! -d "venv" ]; then
    echo "[backend] creating virtualenv..."
    python3 -m venv venv
fi
# shellcheck source=/dev/null
source venv/bin/activate
pip install -r requirements.txt -q

uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd "${REPO_ROOT}"

cd "${REPO_ROOT}/frontend"
npm run dev &
FRONTEND_PID=$!
cd "${REPO_ROOT}"

echo ""
echo "===================================================="
echo "  TrustAudit Tax Shield -- LIVE"
echo "  Dashboard:  http://localhost:5173"
echo "  API:        http://localhost:8000"
echo "  API Docs:   http://localhost:8000/docs"
echo "===================================================="
echo ""
echo "Press Ctrl+C to stop both servers."

trap 'kill ${BACKEND_PID} ${FRONTEND_PID} 2>/dev/null || true; exit' SIGINT SIGTERM
wait
