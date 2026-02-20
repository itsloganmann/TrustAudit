#!/bin/bash
# TrustAudit MVP — Start both backend and frontend servers.
# Usage: ./start.sh

set -e

echo "🛡️  TrustAudit Tax Shield — Starting servers..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Start Backend (FastAPI on port 8000)
echo -e "${BLUE}[Backend]${NC} Starting FastAPI on http://localhost:8000"
cd backend
if [ ! -d "venv" ]; then
    echo -e "${BLUE}[Backend]${NC} Creating virtual environment..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Start Frontend (Vite on port 5173)
echo -e "${GREEN}[Frontend]${NC} Starting Vite on http://localhost:5173"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "════════════════════════════════════════════════════════"
echo "  🛡️  TrustAudit Tax Shield — LIVE"
echo "  📊 Dashboard:  http://localhost:5173"
echo "  🔌 API:        http://localhost:8000"
echo "  📡 API Docs:   http://localhost:8000/docs"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to kill both processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# Wait for both
wait
