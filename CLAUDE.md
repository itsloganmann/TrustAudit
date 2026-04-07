# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrustAudit is a single-service demo of an India Section 43B(h) compliance dashboard. A FastAPI backend ingests "WhatsApp challan" verifications via a webhook and exposes invoice/stats/activity APIs; a React + Vite frontend polls those endpoints every 2s and renders a live CFO dashboard. In production a single FastAPI process serves both the JSON API and the built React SPA.

This is an MVP/demo (built for Berkeley SkyDeck), not production software — there is no auth, no real OCR, no migrations, and the SQLite DB is wiped and reseeded on every deploy via `seed.py`.

## Common Commands

### Local development (two processes)
```bash
./start.sh                              # Boots backend (8000) + frontend (5173) together
```

Or manually:
```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python seed.py                          # Drops + recreates tables, inserts 50 demo invoices
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                             # Vite dev server on :5173, proxies /api → :8000
```

### Frontend
```bash
cd frontend
npm run dev                             # Dev server with HMR
npm run build                           # Production build → frontend/dist
npm run lint                            # ESLint (flat config in eslint.config.js)
npm run preview                         # Preview production build
```

### Backend
```bash
cd backend
source venv/bin/activate
python seed.py                          # Reset DB to demo state (DESTRUCTIVE — drops tables)
python simulate_driver.py               # Demo: hits /api/webhook/whatsapp, flips a PENDING invoice → VERIFIED
uvicorn app.main:app --reload --port 8000
```

There is no test suite in this repo yet. Swagger UI is at `http://localhost:8000/docs`.

### Production build (single container)
```bash
docker build -t trustaudit .            # Multi-stage: builds frontend, installs backend, runs seed.py
# Render reads render.yaml and uses this Dockerfile; healthcheck = /health
```

## Architecture

### Single-service serving model
`backend/app/main.py` is the only entry point in production. On startup it:
1. Calls `Base.metadata.create_all()` against `sqlite:///./trustaudit.db` (no Alembic, no migrations).
2. Mounts `/uploads` for challan images.
3. Mounts `/api` for the router in `routes.py`.
4. **If `frontend/dist` exists**, mounts `/assets` and registers a catch-all `GET /{full_path:path}` that serves `index.html` for SPA routing. This means in production a single uvicorn process is both the API and the static host.

Locally the catch-all is skipped (because `frontend/dist` doesn't exist during dev), and Vite's proxy in `frontend/vite.config.js` forwards `/api` to `localhost:8000`.

### Backend layout (`backend/app/`)
- `database.py` — SQLAlchemy engine + `SessionLocal` + `get_db()` dependency. SQLite with `check_same_thread=False`.
- `models.py` — Single `Invoice` ORM model. The key field is `deadline_43bh` (acceptance date + 45 days); `status` is a free-form string `PENDING | VERIFIED | PAID`.
- `schemas.py` — Pydantic v2 models. `InvoiceResponse` uses `model_config = {"from_attributes": True}` and adds a computed `days_remaining` field that routes set manually after `model_validate`.
- `routes.py` — All endpoints live here. Notable behaviors:
  - On import, spawns a **daemon thread** (`_generate_streaming_activity`) that pushes synthetic activity strings into a module-level `activity_feed: list[dict]` every 3–7 seconds. This list is capped at 100 entries and is the source for `GET /api/activity`. It is in-memory only — restarting the server clears it.
  - `POST /api/webhook/whatsapp` is the demo's pivot point: it flips an invoice's `status` to `VERIFIED`, sets `verified_at`, and appends 3 success/info entries to `activity_feed`. There is **no real OCR or vision call** — `simulate_driver.py` just POSTs JSON.
  - `GET /api/invoices` and `GET /api/invoices/{id}` recompute `days_remaining` against `date.today()` on every request.
  - `GET /api/stats` derives all dashboard counters (critical/warning/safe buckets, compliance rate, liability saved, at-risk total) from a single `db.query(Invoice).all()` plus list comprehensions — there is no caching, the frontend polls every 2s.

### Frontend layout (`frontend/src/`)
- `App.jsx` — Owns all data fetching. Polls `/api/invoices`, `/api/stats`, `/api/activity` every 2 seconds via `setInterval`. Tracks `prevStatusMap` in a ref so it can fire a Sonner toast the moment a previously-PENDING invoice flips to VERIFIED. Holds tab/search filter state and the `selectedInvoice` for the evidence drawer.
- `components/Dashboard.jsx` — Main grid layout (chart + simulator + invoice table).
- `components/ComplianceChart.jsx` — Recharts AreaChart with gradient fills.
- `components/TaxSimulator.jsx` — Interactive 43B(h) "cliff" slider.
- `components/InvoiceDetailSheet.jsx` — Slide-out evidence drawer (mock WhatsApp chat + extracted fields).
- `components/ActivityTicker.jsx` — Live transaction stream backed by `/api/activity`.
- `components/SupplierNetwork.jsx`, `ExamplePipeline.jsx` — Marketing/visualization sections appended to the dashboard.
- `components/AnimatedCounter.jsx` — Smooth number interpolation for header metrics.
- `lib/cn.js` — `clsx + tailwind-merge` helper, used everywhere for conditional classes.
- `index.css` — Defines the design system (glassmorphism utility classes like `.glass`, glow shadows `.glow-emerald` / `.glow-rose`, ticker scroll keyframes).

### Demo flow (what the simulation actually does)
1. `seed.py` creates 50 invoices bucketed into CRITICAL (≤1d), WARNING (4–14d), SAFE (15–40d), and VERIFIED. Last 12 vendors in the list are pre-marked VERIFIED.
2. Frontend polls `/api/invoices` every 2s and groups them into the four tabs.
3. Operator runs `python simulate_driver.py`, which picks a PENDING invoice and POSTs to `/api/webhook/whatsapp`.
4. Backend flips the row to VERIFIED, the next poll picks it up, `App.jsx` notices the status transition via `prevStatusMap`, and Sonner fires a "Tax Shield Secured" toast while the row animates from rose → emerald.

## Things to know before changing code

- **Don't introduce a real database here.** SQLite + drop-and-reseed via `seed.py` is intentional for the demo. The Dockerfile runs `python seed.py` at build time, so any persisted data is wiped on every deploy.
- **`activity_feed` is process-local in-memory state.** Don't assume it persists across restarts or scales beyond a single uvicorn worker. The background thread starts on module import — be careful not to spawn it multiple times if you restructure routes.
- **CORS is wide open** (`allow_origins=["*"]`) — fine for the demo, do not copy this into anything real.
- **No auth, no rate limiting, no input sanitization on the webhook.** This is a single-tenant demo only.
- **The frontend expects the backend at `/api`** (relative). In dev that works via the Vite proxy; in prod it works because FastAPI serves the SPA from the same origin. Don't hardcode `localhost:8000` into components.
- **`days_remaining` is computed at request time**, not stored. If you add caching, the cache must be invalidated daily or computation must stay request-scoped.
- **The frontend is plain JSX** (not TypeScript). ESLint config ignores `dist/` and uses `varsIgnorePattern: '^[A-Z_]'` so PascalCase imports won't trip the unused-vars rule.
- **Tailwind v4** is used via `@tailwindcss/vite` — there is no `tailwind.config.js`; configuration lives in `index.css`.
- **Polling, not websockets.** All "live" behavior is a 2-second interval in `App.jsx`. If something feels laggy in the demo, that's the lower bound.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
