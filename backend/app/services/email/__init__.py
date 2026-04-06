"""Email service — provider factory and template helpers.

Public API:
- ``get_email_provider()`` — return a cached provider selected by the
  ``EMAIL_PROVIDER`` env var. Defaults to ``mock``. Falls back to mock
  if the requested provider raises ``EmailProviderNotConfigured``.
- ``render_template(name, **kwargs)`` — load an HTML template from
  ``templates/`` and fill ``{{ placeholders }}`` using ``str.format``
  semantics (double-brace ``{{ }}`` converted to single-brace ``{ }``).
- ``send_verify_email``, ``send_magic_link``, ``send_dispute_notice`` —
  high-level helpers used by the auth providers and dispute routes.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from threading import Lock
from typing import Any

from .base import EmailProvider, EmailProviderNotConfigured, EmailSendResult
from .mock_client import MockEmailClient, reset_mock_inbox, SENT_EMAILS, get_sent_emails, last_sent_email

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).parent / "templates"

_provider_lock = Lock()
_cached_provider: EmailProvider | None = None


def _build_provider(name: str) -> EmailProvider:
    name = (name or "").strip().lower() or "mock"
    if name == "mock":
        return MockEmailClient()
    if name == "resend":
        from .resend_client import ResendEmailClient
        return ResendEmailClient()
    if name == "smtp":
        from .smtp_client import SMTPEmailClient
        return SMTPEmailClient()
    logger.warning("Unknown EMAIL_PROVIDER=%r — falling back to mock", name)
    return MockEmailClient()


def get_email_provider() -> EmailProvider:
    """Return a cached email provider.

    Call ``reset_email_provider()`` in tests to clear the cache between
    runs.
    """
    global _cached_provider
    with _provider_lock:
        if _cached_provider is not None:
            return _cached_provider
        requested = os.environ.get("EMAIL_PROVIDER", "mock")
        try:
            provider = _build_provider(requested)
        except EmailProviderNotConfigured as exc:
            logger.warning(
                "Email provider %r not configured (%s) — falling back to mock",
                requested,
                exc,
            )
            provider = MockEmailClient()
        _cached_provider = provider
        return provider


def reset_email_provider() -> None:
    """Test helper: drop the cached provider so the next call rebuilds."""
    global _cached_provider
    with _provider_lock:
        _cached_provider = None


def render_template(name: str, **values: Any) -> str:
    """Load ``templates/<name>`` and substitute ``{{ placeholders }}``.

    We use a tiny pseudo-Jinja approach: HTML literals keep their curly
    braces by being templated, and we only expand double-brace tokens
    so there's no collision with CSS ``{``/``}``.
    """
    path = _TEMPLATES_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Email template not found: {path}")
    raw = path.read_text(encoding="utf-8")
    out = raw
    for key, val in values.items():
        out = out.replace("{{" + key + "}}", str(val))
        out = out.replace("{{ " + key + " }}", str(val))
    return out


# ---------------------------------------------------------------------
# High-level helpers
# ---------------------------------------------------------------------
def send_verify_email(
    to: str,
    verify_url: str,
    full_name: str = "there",
) -> EmailSendResult:
    provider = get_email_provider()
    html = render_template(
        "verify_email.html",
        full_name=full_name,
        verify_url=verify_url,
    )
    text = (
        f"Hi {full_name},\n\n"
        f"Confirm your TrustAudit email by visiting:\n{verify_url}\n\n"
        f"If you didn't create this account, ignore this email.\n"
    )
    return provider.send(
        to=to,
        subject="Verify your TrustAudit email",
        html=html,
        text=text,
    )


def send_magic_link(
    to: str,
    magic_url: str,
    full_name: str = "there",
) -> EmailSendResult:
    provider = get_email_provider()
    html = render_template(
        "magic_link.html",
        full_name=full_name,
        magic_url=magic_url,
    )
    text = (
        f"Hi {full_name},\n\n"
        f"Sign in to TrustAudit with this one-time link (valid 15 minutes):\n"
        f"{magic_url}\n\n"
        f"If you didn't request this, ignore this email.\n"
    )
    return provider.send(
        to=to,
        subject="Your TrustAudit sign-in link",
        html=html,
        text=text,
    )


def send_dispute_notice(
    to: str,
    invoice_number: str,
    vendor_name: str,
    reason: str,
    dashboard_url: str,
) -> EmailSendResult:
    provider = get_email_provider()
    html = render_template(
        "dispute_notice.html",
        invoice_number=invoice_number,
        vendor_name=vendor_name,
        reason=reason,
        dashboard_url=dashboard_url,
    )
    text = (
        f"A dispute was opened on invoice {invoice_number} for {vendor_name}.\n"
        f"Reason: {reason}\n\nOpen the dashboard: {dashboard_url}\n"
    )
    return provider.send(
        to=to,
        subject=f"Dispute opened on invoice {invoice_number}",
        html=html,
        text=text,
    )


__all__ = [
    "EmailProvider",
    "EmailProviderNotConfigured",
    "EmailSendResult",
    "MockEmailClient",
    "SENT_EMAILS",
    "get_email_provider",
    "get_sent_emails",
    "last_sent_email",
    "render_template",
    "reset_email_provider",
    "reset_mock_inbox",
    "send_dispute_notice",
    "send_magic_link",
    "send_verify_email",
]
