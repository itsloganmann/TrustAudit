"""Email provider protocol and shared types.

Providers implement ``EmailProvider.send`` and may raise
``EmailProviderNotConfigured`` on construction if required env vars are
missing — the factory in ``services.email.__init__`` catches that and
falls back to the mock provider.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol


class EmailProviderNotConfigured(Exception):
    """Raised when a provider's required env vars are missing."""


@dataclass(frozen=True)
class EmailSendResult:
    """Return value from ``EmailProvider.send``.

    ``provider`` is the short name ('mock' | 'resend' | 'smtp').
    ``message_id`` is provider-supplied (Resend returns one; SMTP doesn't).
    ``raw`` contains any provider-specific response for debugging.
    """
    provider: str
    message_id: str | None
    to: str
    subject: str
    raw: Mapping[str, Any] = field(default_factory=dict)


class EmailProvider(Protocol):
    """Send transactional email. Implementations are synchronous."""

    name: str

    def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
        from_addr: str | None = None,
    ) -> EmailSendResult: ...
