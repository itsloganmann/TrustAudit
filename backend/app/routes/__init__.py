"""Route package for TrustAudit.

- ``legacy`` module — original /invoices, /stats, /webhook/whatsapp, /activity endpoints.
  Preserved for backward compatibility with ``backend/simulate_driver.py`` and the
  existing frontend polling loop.
- ``webhook_whatsapp`` — new unified Twilio/baileys/mock inbound webhook.
- ``pilot`` — /api/pilot/applications (public POST + admin-gated GET).
- Future sub-routers (auth, disputes, compliance, demo, stream, etc.) will be added here
  by subsequent workers and imported explicitly by ``main.py``.

The top-level ``router`` exported from this package is the legacy router, so existing
imports of ``from .routes import router`` still work. New routers are registered
explicitly in ``main.py`` via ``include_router``.
"""
from .legacy import router  # noqa: F401  — re-export for backward compat
from .pilot import router as pilot_router  # noqa: F401
