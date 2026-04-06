"""43B(h) compliance form PDF rendering.

Pure data-in / bytes-out service that turns a frozen
``ComplianceFormContext`` into a print-ready A4 PDF via WeasyPrint.

Design notes
------------
- The HTML template lives at ``app/templates/compliance_form.html`` and
  is loaded once on first call (module-level cache). It is a plain
  ``str.format`` template &mdash; we deliberately avoid Jinja2 to keep
  the dependency footprint minimal and the template trivially diffable.
- WeasyPrint is imported lazily inside :func:`render_compliance_pdf`
  so the rest of the codebase (and the test suite) can import this
  module on systems where WeasyPrint's native libs (pango, cairo, glib)
  are not installed. Render-time failures raise
  :class:`PDFRenderingUnavailable` with a clear remediation hint.
- All formatting is centralised in :func:`build_template_dict` so the
  unit tests can verify the substitution surface without running
  WeasyPrint.
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from .qr_codes import generate_qr_data_uri

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TEMPLATE_PATH = Path(__file__).resolve().parent.parent.parent / "templates" / "compliance_form.html"

# Default copy when the seed data omits an address (the demo seeds
# don't currently store addresses but the form must still print).
DEFAULT_ADDRESS = "Address on file with the Reporting Entity"
COMPOSITION_SCHEME_DISPLAY = "Composition Scheme — No GSTIN"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ComplianceFormContext:
    """Frozen DTO consumed by :func:`render_compliance_pdf`.

    Every value here is what gets printed onto the form &mdash; the
    caller is responsible for translating ORM rows + audit-trail
    queries into this shape. Keeping the renderer free of SQLAlchemy
    is what lets the test suite run a full PDF round-trip without a
    database.
    """

    invoice_id: int
    enterprise_name: str
    enterprise_pan: str
    msme_vendor_name: str
    msme_gstin: str
    msme_udyam: Optional[str]
    invoice_number: str
    invoice_date: str          # ISO YYYY-MM-DD
    invoice_amount_inr: float
    date_of_acceptance: str    # ISO YYYY-MM-DD
    deadline_43bh: str         # ISO YYYY-MM-DD
    days_remaining_at_generation: int
    confidence_score: float
    extraction_model: str
    extracted_at: str          # ISO datetime (UTC)
    audit_trail: Sequence[Tuple[str, str, str]] = field(default_factory=tuple)
    verification_url: str = ""
    is_composition_scheme: bool = False
    enterprise_address: str = DEFAULT_ADDRESS
    msme_address: str = DEFAULT_ADDRESS


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class PDFRenderingUnavailable(RuntimeError):
    """Raised when WeasyPrint or its native libs cannot be loaded."""


# ---------------------------------------------------------------------------
# Template loading
# ---------------------------------------------------------------------------
_template_cache: Optional[str] = None


def _load_template() -> str:
    """Read the HTML template once and cache it for the process lifetime."""
    global _template_cache
    if _template_cache is None:
        if not TEMPLATE_PATH.exists():
            raise FileNotFoundError(
                f"Compliance form template missing: {TEMPLATE_PATH}"
            )
        _template_cache = TEMPLATE_PATH.read_text(encoding="utf-8")
    return _template_cache


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------
def _format_inr_numeric(amount: float) -> str:
    """Format an INR amount with the Indian lakh/crore comma grouping.

    Example: ``1234567.5`` -> ``"12,34,567.50"``.
    """
    rupees = int(round(amount))
    paise = int(round((amount - rupees) * 100))
    if paise < 0 or paise >= 100:
        # Floating-point edge case &mdash; recompute defensively.
        rupees = int(amount)
        paise = int(round((amount - rupees) * 100))
    sign = "-" if rupees < 0 else ""
    rupees = abs(rupees)
    s = str(rupees)
    if len(s) <= 3:
        grouped = s
    else:
        last3 = s[-3:]
        rest = s[:-3]
        # Group the rest in pairs from the right.
        chunks: List[str] = []
        while len(rest) > 2:
            chunks.append(rest[-2:])
            rest = rest[:-2]
        if rest:
            chunks.append(rest)
        grouped = ",".join(reversed(chunks)) + "," + last3
    return f"{sign}{grouped}.{paise:02d}"


def _format_inr_lakh(amount: float) -> str:
    """Express an INR amount in lakh / crore notation.

    Examples
    --------
    ``75000``     -> ``"₹0.75 lakh"``
    ``412000``    -> ``"₹4.12 lakh"``
    ``25000000``  -> ``"₹2.50 crore"``
    """
    if amount >= 1_00_00_000:
        return f"₹{amount / 1_00_00_000:.2f} crore"
    if amount >= 1_00_000:
        return f"₹{amount / 1_00_000:.2f} lakh"
    return f"₹{amount:,.2f}"


def _parse_iso_date(value: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        try:
            return datetime.fromisoformat(value).date()
        except ValueError:
            return None


def _format_human_date(value: str) -> str:
    """ISO date -> ``"21 Mar 2026"`` style for the printed form."""
    parsed = _parse_iso_date(value)
    if parsed is None:
        return value or "—"
    return parsed.strftime("%d %b %Y")


def _format_human_datetime(value: str) -> str:
    if not value:
        return "—"
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%d %b %Y %H:%M UTC")


def _confidence_color(score: float) -> str:
    """Map a 0..1 confidence score to a printable hex colour."""
    if score >= 0.85:
        return "#15803d"  # emerald-700 — high confidence
    if score >= 0.65:
        return "#b45309"  # amber-700 — medium confidence
    return "#b91c1c"      # red-700 — low confidence


def _assessment_year(today: Optional[date] = None) -> str:
    """Return the Indian assessment year string, e.g. ``"AY 2026-27"``.

    Indian AY runs Apr 1 to Mar 31. AY = FY + 1.
    """
    today = today or date.today()
    if today.month >= 4:
        fy_start = today.year
    else:
        fy_start = today.year - 1
    return f"AY {fy_start + 1}-{str(fy_start + 2)[-2:]}"


def _short_hash(s: str, length: int = 12) -> str:
    return s[:length] if s else "—"


def compute_audit_hash(ctx: ComplianceFormContext) -> str:
    """Deterministic SHA-256 over the canonical form fields.

    The hash is what the public ``/api/verify/{id}`` endpoint exposes,
    so the same fields must be hashable from both the form-render path
    and the verification path. Keeping it here centralises the format.
    """
    canonical = "|".join(
        [
            str(ctx.invoice_id),
            ctx.enterprise_pan or "",
            ctx.msme_gstin or "",
            ctx.invoice_number or "",
            ctx.invoice_date or "",
            f"{ctx.invoice_amount_inr:.2f}",
            ctx.date_of_acceptance or "",
            ctx.deadline_43bh or "",
            ctx.extraction_model or "",
            ctx.extracted_at or "",
            f"{ctx.confidence_score:.4f}",
        ]
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _format_audit_trail_rows(
    audit_trail: Sequence[Tuple[str, str, str]],
) -> str:
    """Render the audit trail as <tr> rows. Empty trail -> placeholder row."""
    if not audit_trail:
        return (
            "        <tr><td colspan=\"3\" style=\"text-align:center; color:#475569;\">"
            "No prior chain-of-custody events recorded for this invoice.</td></tr>"
        )
    rows: List[str] = []
    for ts, event_type, summary in audit_trail:
        ts_display = _format_human_datetime(ts)
        rows.append(
            "        <tr>"
            f"<td>{_html_escape(ts_display)}</td>"
            f"<td>{_html_escape(event_type or '')}</td>"
            f"<td>{_html_escape(summary or '')}</td>"
            "</tr>"
        )
    return "\n".join(rows)


def _html_escape(value: str) -> str:
    """Tiny HTML escape for the audit-trail cells.

    We only ever inject ASCII server-controlled strings here, so we
    don't need a full library &mdash; just neutralise the five chars
    that would corrupt the layout.
    """
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _shorten_url(url: str, max_len: int = 38) -> str:
    if not url:
        return "—"
    if len(url) <= max_len:
        return url
    return url[: max_len - 1] + "…"


# ---------------------------------------------------------------------------
# Template substitution
# ---------------------------------------------------------------------------
def build_template_dict(ctx: ComplianceFormContext) -> dict:
    """Translate ``ctx`` into the substitution dict the template expects.

    Pure function &mdash; no I/O. Tested directly so we don't need
    WeasyPrint to verify rendering correctness.
    """
    days_remaining = ctx.days_remaining_at_generation
    past = days_remaining < 0

    if past:
        callout_title = "PAST 43B(h) STATUTORY DEADLINE"
        days_label = "Days Past Deadline"
        days_value = f"{abs(days_remaining)} day{'s' if abs(days_remaining) != 1 else ''} OVERDUE"
        past_deadline_class = "past-deadline"
    else:
        callout_title = "Section 43B(h) Critical Dates"
        days_label = "Days Remaining"
        days_value = f"{days_remaining} day{'s' if days_remaining != 1 else ''}"
        past_deadline_class = ""

    confidence_pct = max(0, min(100, int(round(ctx.confidence_score * 100))))

    audit_hash_full = compute_audit_hash(ctx)
    audit_hash_short = _short_hash(audit_hash_full)

    qr_url = ctx.verification_url or ""
    if qr_url:
        try:
            qr_data_uri = generate_qr_data_uri(qr_url)
        except (RuntimeError, ValueError) as exc:
            logger.warning("QR generation failed (%s); using empty placeholder", exc)
            qr_data_uri = ""
    else:
        qr_data_uri = ""

    if ctx.is_composition_scheme:
        gstin_display = COMPOSITION_SCHEME_DISPLAY
    else:
        gstin_display = ctx.msme_gstin or "—"

    udyam_display = ctx.msme_udyam or "Not on record"

    place_date = f"India &middot; {date.today().strftime('%d %b %Y')}"

    return {
        "invoice_id": ctx.invoice_id,
        "audit_hash_short": audit_hash_short,
        "audit_hash_full": audit_hash_full,
        "generated_at": datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC"),
        "assessment_year": _assessment_year(),

        "enterprise_name": _html_escape(ctx.enterprise_name or "—"),
        "enterprise_pan": _html_escape(ctx.enterprise_pan or "—"),
        "enterprise_address": _html_escape(ctx.enterprise_address or DEFAULT_ADDRESS),

        "msme_vendor_name": _html_escape(ctx.msme_vendor_name or "—"),
        "msme_gstin_display": _html_escape(gstin_display),
        "msme_udyam_display": _html_escape(udyam_display),
        "msme_address": _html_escape(ctx.msme_address or DEFAULT_ADDRESS),

        "invoice_number": _html_escape(ctx.invoice_number or "—"),
        "invoice_date_display": _format_human_date(ctx.invoice_date),
        "invoice_amount_numeric": _format_inr_numeric(ctx.invoice_amount_inr),
        "invoice_amount_lakh": _format_inr_lakh(ctx.invoice_amount_inr),

        "callout_title": callout_title,
        "past_deadline_class": past_deadline_class,
        "date_of_acceptance_display": _format_human_date(ctx.date_of_acceptance),
        "deadline_display": _format_human_date(ctx.deadline_43bh),
        "days_label": days_label,
        "days_value_display": days_value,

        "extraction_model": _html_escape(ctx.extraction_model or "—"),
        "extracted_at_display": _format_human_datetime(ctx.extracted_at),
        "confidence_pct": confidence_pct,
        "confidence_color": _confidence_color(ctx.confidence_score),

        "audit_trail_count": len(ctx.audit_trail),
        "audit_trail_rows": _format_audit_trail_rows(ctx.audit_trail),

        "qr_data_uri": qr_data_uri,
        "verification_url_short": _html_escape(_shorten_url(qr_url)),
        "place_date": place_date,
    }


def render_compliance_html(ctx: ComplianceFormContext) -> str:
    """Render the populated HTML for the form (no PDF conversion).

    Useful in tests &mdash; lets us assert all template fields were
    substituted correctly without depending on WeasyPrint native libs.
    """
    template = _load_template()
    return template.format(**build_template_dict(ctx))


def render_compliance_pdf(ctx: ComplianceFormContext) -> bytes:
    """Render the compliance form to a print-ready PDF.

    Raises:
        PDFRenderingUnavailable: if WeasyPrint cannot be imported (e.g.
            missing pango / cairo on the host).
    """
    html_str = render_compliance_html(ctx)
    try:
        from weasyprint import HTML  # type: ignore
    except (ImportError, OSError) as exc:
        raise PDFRenderingUnavailable(
            "WeasyPrint is not available on this host. "
            "Install pango, cairo and glib (e.g. `brew install pango`) "
            "and ensure DYLD_FALLBACK_LIBRARY_PATH includes /opt/homebrew/lib."
        ) from exc

    pdf_bytes = HTML(string=html_str).write_pdf()
    if pdf_bytes is None:
        raise PDFRenderingUnavailable("WeasyPrint returned None for write_pdf()")
    return pdf_bytes
