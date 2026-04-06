"""Vision provider contract.

All VLM backends (Gemini, Claude, mock) implement the :class:`VisionProvider`
protocol and return an :class:`ExtractionResult` dataclass. The rest of the
pipeline — edge case detectors, postprocessors, state machine — only ever
talks to this contract, never the raw provider response.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


@dataclass
class ExtractionResult:
    """Normalized output of any vision provider.

    All fields are optional so partial extractions are representable.
    ``confidence`` is a best-effort aggregate in ``[0, 1]``;
    ``field_confidences`` carries per-field scores when the provider
    reports them. ``detected_edge_cases`` captures issues the VLM self-
    reported from the extraction prompt (e.g. ``"handwritten"``,
    ``"crumpled"``) which edge-case detectors can then act on.
    """

    vendor_name: Optional[str] = None
    gstin: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_amount: Optional[float] = None       # INR rupees (canonicalized)
    invoice_date: Optional[str] = None           # ISO YYYY-MM-DD
    date_of_acceptance: Optional[str] = None     # ISO YYYY-MM-DD — 43B(h) critical
    currency: str = "INR"
    confidence: float = 0.0                      # 0..1 aggregate
    field_confidences: Dict[str, float] = field(default_factory=dict)
    missing_fields: List[str] = field(default_factory=list)
    detected_edge_cases: List[str] = field(default_factory=list)
    raw_response: Dict[str, Any] = field(default_factory=dict)
    provider: str = ""
    model_version: str = ""
    extraction_ms: int = 0
    is_challan: bool = True
    orientation: str = "ok"                      # ok|rotated_90|rotated_180|rotated_270
    text_quality: str = "good"                   # good|poor|illegible

    # ------------------------------------------------------------------
    # Convenience helpers (pure — never mutate self)
    # ------------------------------------------------------------------
    def with_confidence(self, new_confidence: float) -> "ExtractionResult":
        """Return a copy with a recalibrated confidence score."""
        return ExtractionResult(
            vendor_name=self.vendor_name,
            gstin=self.gstin,
            invoice_number=self.invoice_number,
            invoice_amount=self.invoice_amount,
            invoice_date=self.invoice_date,
            date_of_acceptance=self.date_of_acceptance,
            currency=self.currency,
            confidence=new_confidence,
            field_confidences=dict(self.field_confidences),
            missing_fields=list(self.missing_fields),
            detected_edge_cases=list(self.detected_edge_cases),
            raw_response=dict(self.raw_response),
            provider=self.provider,
            model_version=self.model_version,
            extraction_ms=self.extraction_ms,
            is_challan=self.is_challan,
            orientation=self.orientation,
            text_quality=self.text_quality,
        )

    def with_overrides(self, **overrides: Any) -> "ExtractionResult":
        """Return a copy with arbitrary field overrides."""
        base = {
            "vendor_name": self.vendor_name,
            "gstin": self.gstin,
            "invoice_number": self.invoice_number,
            "invoice_amount": self.invoice_amount,
            "invoice_date": self.invoice_date,
            "date_of_acceptance": self.date_of_acceptance,
            "currency": self.currency,
            "confidence": self.confidence,
            "field_confidences": dict(self.field_confidences),
            "missing_fields": list(self.missing_fields),
            "detected_edge_cases": list(self.detected_edge_cases),
            "raw_response": dict(self.raw_response),
            "provider": self.provider,
            "model_version": self.model_version,
            "extraction_ms": self.extraction_ms,
            "is_challan": self.is_challan,
            "orientation": self.orientation,
            "text_quality": self.text_quality,
        }
        base.update(overrides)
        return ExtractionResult(**base)


@runtime_checkable
class VisionProvider(Protocol):
    """Every VLM backend implements this tiny surface."""

    def extract(self, image_bytes: bytes) -> ExtractionResult:
        """Extract challan fields from raw image bytes."""
        ...

    def health(self) -> Dict[str, Any]:
        """Lightweight health probe used by /api/healthz."""
        ...


class VisionProviderNotConfigured(Exception):
    """Raised when a provider's required env vars are missing.

    The factory ``get_vision_provider`` catches this and falls back to
    the mock provider, preserving demo runnability even with no keys.
    """
