<p align="center">
  <img src="https://img.shields.io/badge/TrustAudit-Tax%20Shield-0f172a?style=for-the-badge&labelColor=020617" alt="TrustAudit" />
  <img src="https://img.shields.io/badge/Section-43B(h)-10b981?style=for-the-badge&labelColor=020617" alt="43B(h)" />
  <img src="https://img.shields.io/badge/Status-MVP-3b82f6?style=for-the-badge&labelColor=020617" alt="Status" />
</p>

# TrustAudit -- Tax Shield

> **Live Demo:** [https://trustaudit-wxd7.onrender.com](https://trustaudit-wxd7.onrender.com)

**Real-time 43B(h) compliance engine that turns WhatsApp challan photos into tax deduction shields.**

TrustAudit automates the critical "Date of Acceptance" extraction from paper challans sent via WhatsApp, ensuring MSME payments comply with India's Section 43B(h) -- the provision that disallows entire deductions if payments exceed 45 days.

---

## The Problem

Under Section 43B(h) of the Income Tax Act, if a buyer fails to pay an MSME vendor within 45 days of acceptance, the **entire invoice amount becomes non-deductible** -- a 30% overnight tax liability cliff. Most Indian enterprises still manage this with spreadsheets and paper trails.

## The Solution

TrustAudit provides a CFO dashboard that:

1. **Ingests challan photos** via a WhatsApp webhook (driver sends photo -> Vision AI extracts date)
2. **Monitors deadlines** with real-time countdown timers per invoice
3. **Calculates risk exposure** with a live Tax Savings Simulator
4. **Provides evidence trails** linking WhatsApp messages to extracted data for audit compliance

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy, SQLite |
| **Frontend** | React 19, Vite 6, Tailwind CSS 4, Recharts |
| **Animations** | Framer Motion |
| **Icons** | Lucide React |
| **Toasts** | Sonner |
| **Deployment** | [Render.com](https://trustaudit-wxd7.onrender.com) (free tier) |

---

## Project Structure

```
trustaudit/
  backend/
    app/
      __init__.py
      main.py          # FastAPI entry + static file serving
      database.py       # SQLAlchemy engine + session
      models.py         # Invoice ORM model
      routes.py         # API endpoints (/invoices, /stats, /webhook)
      schemas.py        # Pydantic request/response models
    seed.py             # Database seeder (5 demo invoices)
    simulate_driver.py  # Demo script: simulates WhatsApp upload
    requirements.txt
    uploads/            # Challan image storage
  frontend/
    src/
      App.jsx                   # Root: layout, polling, Sonner toasts
      index.css                 # Design system (glassmorphism, glow effects)
      main.jsx                  # React entry point
      lib/cn.js                 # clsx + tailwind-merge utility
      components/
        Dashboard.jsx           # Main grid: chart, simulator, table
        ComplianceChart.jsx     # AreaChart with gradient fills
        TaxSimulator.jsx        # 43B(h) risk model with slider
        ActivityTicker.jsx      # Live transaction stream feed
        InvoiceDetailSheet.jsx  # Evidence drawer (WhatsApp + extracted data)
        AnimatedCounter.jsx     # Smooth number interpolation
    vite.config.js
    package.json
  render.yaml           # Render.com deployment blueprint
  start.sh              # Local dev: runs both servers
  README.md
```

---

## Quick Start (Local Development)

### Prerequisites

- Python 3.11+
- Node.js 20+
- npm 10+

### Setup

```bash
# Clone the repository
git clone https://github.com/itsloganmann/TrustAudit.git
cd TrustAudit

# Backend
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
python seed.py              # Seed database with demo invoices
uvicorn app.main:app --reload --port 8000 &

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) -- the Vite dev server proxies `/api` requests to the FastAPI backend.

### One-Command Start

```bash
chmod +x start.sh
./start.sh
```

---

## Demo Simulation

The simulation script mimics a driver uploading a challan photo via WhatsApp:

```bash
cd backend
source venv/bin/activate
python simulate_driver.py
```

**What happens:**
1. Picks a random PENDING invoice from the database
2. Prints: `Simulating Driver Upload via WhatsApp...`
3. Sends the challan image to the `/api/webhook/whatsapp` endpoint
4. The dashboard updates in real-time (row flips from red to green)
5. A Sonner toast appears: _"Tax Shield Secured: INR X deduction protected."_

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/invoices` | List all invoices with computed deadline fields |
| `GET` | `/api/stats` | Aggregate stats (portfolio value, risk, savings) |
| `GET` | `/api/activity` | Recent activity/event log |
| `POST` | `/api/webhook/whatsapp` | WhatsApp challan upload webhook |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Interactive API documentation (Swagger) |

---

## Deployment

### Render.com (Recommended)

1. Push this repo to GitHub
2. Go to [render.com/new](https://render.com/new)
3. Select **Blueprint** and connect this repository
4. Render reads `render.yaml` and deploys automatically

The build process:
- Installs Node.js dependencies and builds the React frontend
- Installs Python dependencies and seeds the database
- Starts FastAPI serving both the API and the static frontend

### Manual Production Build

```bash
# Build frontend
cd frontend && npm install && npm run build

# Run production server
cd ../backend
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The app will be available at `http://localhost:8000` with the frontend served from `/frontend/dist`.

---

## Design System

- **Background:** Deep slate gradient (`slate-950` to `slate-900`)
- **Surfaces:** Glassmorphism (`bg-white/[0.03]` + `backdrop-blur-md` + `border-white/[0.06]`)
- **Accent (Verified):** Emerald (`#10b981`) with glow text-shadow
- **Accent (Risk):** Rose (`#f43f5e`) with glow text-shadow
- **Font:** Inter / system sans-serif, `tracking-tight` on headers
- **Icons:** Lucide React (zero emojis)

---

## Key Features

### Evidence Drawer
Click any invoice row to open a full-width slide-out panel showing:
- Left: Mock WhatsApp conversation with the driver (chat bubbles, embedded challan photo)
- Right: AI-extracted verification data with green checkmarks

### Tax Savings Simulator
Interactive slider modeling the 43B(h) "cliff" -- drag past 45 days to see deductions instantly disallowed. The number glows emerald (safe) or rose (danger).

### Live Transaction Stream
Server-log aesthetic activity feed with Framer Motion animations. New events slide in from the top with spring physics.

### Sonner Toast Notifications
When the simulation script verifies an invoice, a toast fires: _"Tax Shield Secured: INR 4,50,000 deduction protected."_

---

## License

MIT

---

<p align="center">
  <sub>Built for Berkeley SkyDeck Demo</sub>
</p>
