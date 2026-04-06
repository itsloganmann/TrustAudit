"""Resend email provider (https://resend.com).

Uses the free tier (100 emails/day). Reads ``RESEND_API_KEY`` from the
environment; raises ``EmailProviderNotConfigured`` if missing.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from .base import EmailProvider, EmailProviderNotConfigured, EmailSendResult

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"
DEFAULT_FROM = "TrustAudit <noreply@trustaudit.in>"


class ResendEmailClient:
    name = "resend"

    def __init__(self, api_key: str | None = None, default_from: str | None = None):
        key = api_key if api_key is not None else os.environ.get("RESEND_API_KEY")
        if not key:
            raise EmailProviderNotConfigured(
                "RESEND_API_KEY is not set — cannot use Resend provider"
            )
        self._api_key = key
        self._default_from = default_from or os.environ.get(
            "RESEND_FROM", DEFAULT_FROM
        )

    def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
        from_addr: str | None = None,
    ) -> EmailSendResult:
        payload: dict[str, Any] = {
            "from": from_addr or self._default_from,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(RESEND_API_URL, json=payload, headers=headers)
                resp.raise_for_status()
                body = resp.json()
        except httpx.HTTPError as exc:
            logger.error("Resend send failed: %s", exc)
            raise
        message_id = body.get("id") if isinstance(body, dict) else None
        return EmailSendResult(
            provider="resend",
            message_id=message_id,
            to=to,
            subject=subject,
            raw=body if isinstance(body, dict) else {},
        )
