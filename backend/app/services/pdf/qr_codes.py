"""QR code generation helpers for the 43B(h) compliance form PDF.

The compliance form embeds a QR code that links to the public
``/verify/<invoice_id>`` page. To keep the WeasyPrint template fully
self-contained (no external image fetches at PDF render time) we
encode the QR as a base64 PNG data URI and inject it into the HTML.

This module is intentionally tiny so it can be unit-tested without
WeasyPrint or any other heavy dependency.
"""
from __future__ import annotations

import base64
import io
import logging
from typing import Final

logger = logging.getLogger(__name__)


# Default QR sizing tuned for the compliance form footer cell:
# ~180 px renders at roughly 4.8 cm at 96 dpi which is comfortably
# scannable from a printed page held at arm's length.
DEFAULT_BOX_SIZE: Final[int] = 6
DEFAULT_BORDER: Final[int] = 2

PNG_DATA_URI_PREFIX: Final[str] = "data:image/png;base64,"


def generate_qr_data_uri(
    url: str,
    box_size: int = DEFAULT_BOX_SIZE,
    border: int = DEFAULT_BORDER,
) -> str:
    """Render ``url`` as a QR code and return a base64 PNG data URI.

    Raises:
        ValueError: if ``url`` is empty/whitespace.
        RuntimeError: if the qrcode library is not installed on the
            current interpreter (caller decides how to surface this).
    """
    if not url or not url.strip():
        raise ValueError("url must be a non-empty string")
    try:
        import qrcode  # type: ignore
        from qrcode.constants import ERROR_CORRECT_M  # type: ignore
    except ImportError as exc:  # pragma: no cover - deploy guard
        logger.warning("qrcode library missing: %s", exc)
        raise RuntimeError(
            "qrcode[pil] is required to render compliance form QR codes."
        ) from exc

    qr = qrcode.QRCode(
        version=None,  # auto-fit so the QR scales with payload size
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#0b1e3a", back_color="#ffffff")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return PNG_DATA_URI_PREFIX + encoded


def is_valid_data_uri(value: str) -> bool:
    """Lightweight predicate used by tests to assert the prefix shape."""
    if not value or not value.startswith(PNG_DATA_URI_PREFIX):
        return False
    payload = value[len(PNG_DATA_URI_PREFIX):]
    if not payload:
        return False
    try:
        base64.b64decode(payload, validate=True)
        return True
    except Exception:
        return False
