"""In-memory mock email provider.

Always works. Appends each call to a module-level list so tests can
inspect what was "sent". Dev mode also prints a one-line summary to
stdout so you can copy-paste a magic link from the terminal.
"""
from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import List

from .base import EmailProvider, EmailSendResult

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SentEmail:
    to: str
    subject: str
    html: str
    text: str | None = None
    from_addr: str | None = None


# Module-level inbox. Tests can import and inspect this directly.
SENT_EMAILS: List[SentEmail] = []


def get_sent_emails() -> List[SentEmail]:
    """Return a snapshot copy of everything sent so far."""
    return list(SENT_EMAILS)


def last_sent_email() -> SentEmail | None:
    return SENT_EMAILS[-1] if SENT_EMAILS else None


def reset_mock_inbox() -> None:
    """Test helper — clear the mock inbox."""
    SENT_EMAILS.clear()


class MockEmailClient:
    name = "mock"

    def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
        from_addr: str | None = None,
    ) -> EmailSendResult:
        entry = SentEmail(
            to=to,
            subject=subject,
            html=html,
            text=text,
            from_addr=from_addr,
        )
        SENT_EMAILS.append(entry)
        # Dev convenience: short log line so a magic link is greppable.
        logger.info("[email:mock] to=%s subject=%r", to, subject)
        return EmailSendResult(
            provider="mock",
            message_id=f"mock-{len(SENT_EMAILS)}",
            to=to,
            subject=subject,
            raw={"index": len(SENT_EMAILS) - 1},
        )


# Satisfy the Protocol check statically.
_provider: EmailProvider = MockEmailClient()
