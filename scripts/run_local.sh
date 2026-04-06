#!/usr/bin/env bash
# run_local.sh -- bootstrap a complete TrustAudit dev environment.
#
# Starts in order:
#   1. Python venv + backend deps + DB seed
#   2. Frontend npm install
#   3. (optional) baileys WhatsApp sidecar
#   4. uvicorn (FastAPI) on :8000
#   5. vite dev server on :5173
#
# Usage:
#   ./scripts/run_local.sh                       # backend + frontend, mock WhatsApp
#   WHATSAPP_PROVIDER=baileys ./scripts/run_local.sh    # also boot the sidecar
#
# Press Ctrl+C to stop everything.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

WHATSAPP_PROVIDER="${WHATSAPP_PROVIDER:-mock}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

echo "TrustAudit -- local dev bootstrap"
echo "  repo:              ${REPO_ROOT}"
echo "  whatsapp_provider: ${WHATSAPP_PROVIDER}"
echo ""

# ---------------------------------------------------------------------------
# 1. Backend venv + deps
# ---------------------------------------------------------------------------
cd "${REPO_ROOT}/backend"
if [ ! -d venv ]; then
    echo "[backend] creating virtualenv..."
    python3 -m venv venv
fi
# shellcheck source=/dev/null
source venv/bin/activate
echo "[backend] installing requirements..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

if [ ! -f trustaudit.db ]; then
    echo "[backend] seeding database..."
    python seed.py
fi

# ---------------------------------------------------------------------------
# 2. Frontend deps
# ---------------------------------------------------------------------------
cd "${REPO_ROOT}/frontend"
if [ ! -d node_modules ]; then
    echo "[frontend] installing npm deps..."
    npm install --silent --no-audit --no-fund
fi

# ---------------------------------------------------------------------------
# 3. Optional: baileys sidecar
# ---------------------------------------------------------------------------
SIDECAR_PID=""
if [ "${WHATSAPP_PROVIDER}" = "baileys" ]; then
    SIDECAR_DIR="${REPO_ROOT}/backend/services/whatsapp_sidecar"
    if [ ! -d "${SIDECAR_DIR}/node_modules" ]; then
        echo "[sidecar] installing npm deps (this may take a minute)..."
        (cd "${SIDECAR_DIR}" && npm install --silent --no-audit --no-fund)
    fi
    echo "[sidecar] starting on http://localhost:3001 -- scan QR in this terminal"
    (
        cd "${SIDECAR_DIR}"
        BACKEND_URL="http://localhost:${BACKEND_PORT}" \
        PORT=3001 \
        node index.js
    ) &
    SIDECAR_PID=$!
fi

# ---------------------------------------------------------------------------
# 4. Backend (uvicorn)
# ---------------------------------------------------------------------------
cd "${REPO_ROOT}/backend"
# shellcheck source=/dev/null
source venv/bin/activate
echo "[backend] starting uvicorn on http://localhost:${BACKEND_PORT}"
WHATSAPP_PROVIDER="${WHATSAPP_PROVIDER}" \
uvicorn app.main:app --reload --host 127.0.0.1 --port "${BACKEND_PORT}" &
BACKEND_PID=$!

# ---------------------------------------------------------------------------
# 5. Frontend (vite)
# ---------------------------------------------------------------------------
cd "${REPO_ROOT}/frontend"
echo "[frontend] starting vite on http://localhost:${FRONTEND_PORT}"
npm run dev &
FRONTEND_PID=$!

cd "${REPO_ROOT}"

cleanup() {
    echo ""
    echo "Stopping..."
    [ -n "${BACKEND_PID}" ]  && kill "${BACKEND_PID}"  2>/dev/null || true
    [ -n "${FRONTEND_PID}" ] && kill "${FRONTEND_PID}" 2>/dev/null || true
    [ -n "${SIDECAR_PID}" ]  && kill "${SIDECAR_PID}"  2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "===================================================="
echo "  TrustAudit Tax Shield -- LIVE"
echo "  Frontend:  http://localhost:${FRONTEND_PORT}"
echo "  Backend:   http://localhost:${BACKEND_PORT}"
echo "  API docs:  http://localhost:${BACKEND_PORT}/docs"
if [ "${WHATSAPP_PROVIDER}" = "baileys" ]; then
    echo "  Sidecar:   http://localhost:3001"
fi
echo "===================================================="
echo ""
echo "Press Ctrl+C to stop everything."

wait
