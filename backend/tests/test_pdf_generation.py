"""Unit tests for the 43B(h) compliance form PDF renderer.

The WeasyPrint native libs (pango, cairo, glib) are not always
available on dev hosts. The HTML render path is exercised
unconditionally; the binary PDF path is wrapped in a graceful skip
when WeasyPrint cannot be imported.
"""
from __future__ import annotations

import base64

import pytest

from app.services.pdf import (
    COMPOSITION_SCHEME_DISPLAY,
    ComplianceFormContext,
    PDFRenderingUnavailable,
    build_template_dict,
    compute_audit_hash,
    generate_qr_data_uri,
    is_valid_data_uri,
    render_compliance_html,
    render_compliance_pdf,
)


# ---------------------------------------------------------------------------
# Fixture builder
# ---------------------------------------------------------------------------
def _make_ctx(**overrides) -> ComplianceFormContext:
    base = dict(
        invoice_id=1138,
        enterprise_name="Bharat Industries Pvt Ltd",
        enterprise_pan="AAACB1234D",
        msme_vendor_name="Sharma Steel Works",
        msme_gstin="29ABCDE1234F1Z5",
        msme_udyam="UDYAM-MH-04-0012345",
        invoice_number="INV-2026-1138",
        invoice_date="2026-03-21",
        invoice_amount_inr=412350.00,
        date_of_acceptance="2026-03-21",
        deadline_43bh="2026-05-05",
        days_remaining_at_generation=29,
        confidence_score=0.94,
        extraction_model="gemini-flash-latest",
        extracted_at="2026-04-06T15:30:00Z",
        audit_trail=(
            ("2026-03-21T14:01:00Z", "received", "Photo received"),
            ("2026-03-21T14:01:08Z", "vlm_extracted", "Confidence 0.94"),
            ("2026-03-21T14:01:09Z", "verified", "Auto-verified"),
        ),
        verification_url="https://trustaudit.onrender.com/verify/1138",
    )
    base.update(overrides)
    return ComplianceFormContext(**base)


# ---------------------------------------------------------------------------
# QR codes
# ---------------------------------------------------------------------------
class TestQRCodes:
    def test_generate_qr_data_uri_returns_base64_png(self):
        uri = generate_qr_data_uri("https://trustaudit.onrender.com/verify/42")
        assert uri.startswith("data:image/png;base64,")
        payload = uri.split(",", 1)[1]
        decoded = base64.b64decode(payload, validate=True)
        # PNG magic header
        assert decoded[:8] == b"\x89PNG\r\n\x1a\n"

    def test_is_valid_data_uri_round_trip(self):
        uri = generate_qr_data_uri("ping")
        assert is_valid_data_uri(uri)

    def test_is_valid_data_uri_rejects_garbage(self):
        assert not is_valid_data_uri("")
        assert not is_valid_data_uri("not-a-data-uri")
        assert not is_valid_data_uri("data:image/png;base64,")
        assert not is_valid_data_uri("data:image/png;base64,!!!not_base64!!!")

    def test_generate_qr_data_uri_rejects_empty(self):
        with pytest.raises(ValueError):
            generate_qr_data_uri("")
        with pytest.raises(ValueError):
            generate_qr_data_uri("   ")


# ---------------------------------------------------------------------------
# Template dict / HTML rendering
# ---------------------------------------------------------------------------
class TestBuildTemplateDict:
    def test_happy_path_fields_present(self):
        ctx = _make_ctx()
        d = build_template_dict(ctx)
        assert d["invoice_id"] == 1138
        assert "Bharat Industries" in d["enterprise_name"]
        assert d["msme_gstin_display"] == "29ABCDE1234F1Z5"
        assert d["confidence_pct"] == 94
        assert d["confidence_color"] == "#15803d"  # high
        assert d["past_deadline_class"] == ""
        assert "29 days" in d["days_value_display"]
        assert "₹4.12 lakh" in d["invoice_amount_lakh"]
        assert "4,12,350.00" in d["invoice_amount_numeric"]

    def test_composition_scheme_branch(self):
        ctx = _make_ctx(is_composition_scheme=True, msme_gstin="UNREGISTERED")
        d = build_template_dict(ctx)
        assert d["msme_gstin_display"] == COMPOSITION_SCHEME_DISPLAY

    def test_past_deadline_branch(self):
        ctx = _make_ctx(days_remaining_at_generation=-7)
        d = build_template_dict(ctx)
        assert d["past_deadline_class"] == "past-deadline"
        assert "OVERDUE" in d["days_value_display"]
        assert "PAST" in d["callout_title"].upper()

    def test_low_confidence_color(self):
        ctx = _make_ctx(confidence_score=0.45)
        d = build_template_dict(ctx)
        assert d["confidence_color"] == "#b91c1c"  # red
        assert d["confidence_pct"] == 45

    def test_medium_confidence_color(self):
        ctx = _make_ctx(confidence_score=0.72)
        d = build_template_dict(ctx)
        assert d["confidence_color"] == "#b45309"  # amber

    def test_inr_lakh_for_crore_amount(self):
        ctx = _make_ctx(invoice_amount_inr=23_50_00_000.0)
        d = build_template_dict(ctx)
        assert "crore" in d["invoice_amount_lakh"]

    def test_empty_audit_trail_renders_placeholder_row(self):
        ctx = _make_ctx(audit_trail=())
        d = build_template_dict(ctx)
        assert "No prior chain-of-custody" in d["audit_trail_rows"]
        assert d["audit_trail_count"] == 0

    def test_html_escapes_dangerous_input(self):
        ctx = _make_ctx(enterprise_name="<script>alert(1)</script>")
        d = build_template_dict(ctx)
        assert "<script>" not in d["enterprise_name"]
        assert "&lt;script&gt;" in d["enterprise_name"]


class TestComputeAuditHash:
    def test_hash_is_deterministic(self):
        ctx = _make_ctx()
        h1 = compute_audit_hash(ctx)
        h2 = compute_audit_hash(ctx)
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex
        # All-hex
        int(h1, 16)

    def test_hash_changes_with_amount(self):
        a = compute_audit_hash(_make_ctx(invoice_amount_inr=1000))
        b = compute_audit_hash(_make_ctx(invoice_amount_inr=2000))
        assert a != b


class TestRenderHtml:
    def test_render_returns_full_html_document(self):
        ctx = _make_ctx()
        html = render_compliance_html(ctx)
        assert html.startswith("<!DOCTYPE html>")
        assert "Form under Section 43B(h)" in html
        assert "Bharat Industries" in html
        assert "29ABCDE1234F1Z5" in html
        assert "INV-2026-1138" in html
        assert "TRUSTAUDIT VERIFIED" in html
        # No leftover format placeholders
        import re
        assert not re.search(r"\{[a-z_]+\}", html)

    def test_render_handles_composition_scheme(self):
        ctx = _make_ctx(is_composition_scheme=True, msme_gstin="UNREGISTERED")
        html = render_compliance_html(ctx)
        assert COMPOSITION_SCHEME_DISPLAY in html
        assert "29ABCDE1234F1Z5" not in html

    def test_render_includes_qr_data_uri(self):
        ctx = _make_ctx()
        html = render_compliance_html(ctx)
        assert "data:image/png;base64," in html


# ---------------------------------------------------------------------------
# Full PDF render &mdash; requires WeasyPrint native libs
# ---------------------------------------------------------------------------
def _weasyprint_available() -> bool:
    try:
        import weasyprint  # noqa: F401
        return True
    except (ImportError, OSError):
        return False


@pytest.mark.skipif(
    not _weasyprint_available(),
    reason="WeasyPrint native libs (pango/cairo/glib) not available on this host",
)
class TestRenderPdf:
    def test_pdf_starts_with_pdf_magic(self):
        ctx = _make_ctx()
        pdf = render_compliance_pdf(ctx)
        assert isinstance(pdf, bytes)
        assert pdf.startswith(b"%PDF-")
        # Real one-page A4 form should be well over 1 KB
        assert len(pdf) > 1024

    def test_pdf_has_eof_marker(self):
        ctx = _make_ctx()
        pdf = render_compliance_pdf(ctx)
        # PDFs end with %%EOF (possibly followed by trailing whitespace)
        assert b"%%EOF" in pdf[-128:]

    def test_pdf_for_composition_scheme(self):
        ctx = _make_ctx(is_composition_scheme=True, msme_gstin="UNREGISTERED")
        pdf = render_compliance_pdf(ctx)
        assert pdf.startswith(b"%PDF-")
        assert len(pdf) > 1024

    def test_pdf_for_past_deadline(self):
        ctx = _make_ctx(days_remaining_at_generation=-12)
        pdf = render_compliance_pdf(ctx)
        assert pdf.startswith(b"%PDF-")


def test_render_pdf_raises_when_weasyprint_unavailable(monkeypatch):
    """If WeasyPrint genuinely cannot be imported, we get a clear error."""
    import sys

    # Force the import inside render_compliance_pdf to fail by injecting
    # a sentinel module that raises on attribute access. Easier: monkey
    # patch builtins.__import__ for the weasyprint name.
    real_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

    def fake_import(name, *args, **kwargs):
        if name == "weasyprint":
            raise ImportError("forced for test")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", fake_import)

    ctx = _make_ctx()
    with pytest.raises(PDFRenderingUnavailable):
        render_compliance_pdf(ctx)
