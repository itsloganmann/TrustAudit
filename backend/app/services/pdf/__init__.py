"""PDF generation services for TrustAudit.

Public surface
--------------
- :class:`ComplianceFormContext` &mdash; frozen DTO consumed by the renderer.
- :func:`render_compliance_pdf` &mdash; produces print-ready PDF bytes.
- :func:`render_compliance_html` &mdash; renders the populated HTML
  without invoking WeasyPrint (useful for tests on hosts without the
  native libs).
- :func:`compute_audit_hash` &mdash; deterministic hash of the canonical
  form fields, also exposed via the public verification endpoint.
- :func:`generate_qr_data_uri` &mdash; QR PNG data URI helper.
- :class:`PDFRenderingUnavailable` &mdash; raised when WeasyPrint can't be
  loaded.
"""
from .compliance_form import (  # noqa: F401
    COMPOSITION_SCHEME_DISPLAY,
    ComplianceFormContext,
    PDFRenderingUnavailable,
    build_template_dict,
    compute_audit_hash,
    render_compliance_html,
    render_compliance_pdf,
)
from .qr_codes import generate_qr_data_uri, is_valid_data_uri  # noqa: F401

__all__ = [
    "COMPOSITION_SCHEME_DISPLAY",
    "ComplianceFormContext",
    "PDFRenderingUnavailable",
    "build_template_dict",
    "compute_audit_hash",
    "generate_qr_data_uri",
    "is_valid_data_uri",
    "render_compliance_html",
    "render_compliance_pdf",
]
