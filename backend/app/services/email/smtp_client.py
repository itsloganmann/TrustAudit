"""SMTP email provider (Gmail / any SMTP-SSL server).

Reads ``SMTP_HOST``, ``SMTP_PORT``, ``SMTP_USER``, ``SMTP_PASS``,
``SMTP_FROM`` from the environment. Missing any required var raises
``EmailProviderNotConfigured``.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

from .base import EmailProvider, EmailProviderNotConfigured, EmailSendResult

logger = logging.getLogger(__name__)


class SMTPEmailClient:
    name = "smtp"

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        password: str | None = None,
        default_from: str | None = None,
    ):
        host = host or os.environ.get("SMTP_HOST")
        port_raw = port if port is not None else os.environ.get("SMTP_PORT")
        user = user or os.environ.get("SMTP_USER")
        password = password or os.environ.get("SMTP_PASS")
        default_from = default_from or os.environ.get("SMTP_FROM") or user

        missing = [
            name
            for name, val in (
                ("SMTP_HOST", host),
                ("SMTP_PORT", port_raw),
                ("SMTP_USER", user),
                ("SMTP_PASS", password),
            )
            if not val
        ]
        if missing:
            raise EmailProviderNotConfigured(
                f"SMTP provider missing env vars: {', '.join(missing)}"
            )

        try:
            port_int = int(port_raw) if not isinstance(port_raw, int) else port_raw
        except (TypeError, ValueError) as exc:
            raise EmailProviderNotConfigured(
                f"SMTP_PORT is not a valid integer: {port_raw!r}"
            ) from exc

        self._host = host
        self._port = port_int
        self._user = user
        self._password = password
        self._default_from = default_from

    def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
        from_addr: str | None = None,
    ) -> EmailSendResult:
        msg = EmailMessage()
        msg["From"] = from_addr or self._default_from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(text or "This email requires an HTML-capable client.")
        msg.add_alternative(html, subtype="html")

        try:
            with smtplib.SMTP_SSL(self._host, self._port, timeout=20) as smtp:
                smtp.login(self._user, self._password)
                smtp.send_message(msg)
        except Exception as exc:
            logger.error("SMTP send failed: %s", exc)
            raise

        return EmailSendResult(
            provider="smtp",
            message_id=None,
            to=to,
            subject=subject,
            raw={"host": self._host, "port": self._port},
        )
