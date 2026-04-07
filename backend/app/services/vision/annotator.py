"""Pure annotator: draw labeled bounding boxes on a challan image.

This module turns an :class:`ExtractionResult` into an *annotated* version
of the same image, suitable for displaying in the vendor dashboard. It is
deliberately deterministic and dependency-free beyond Pillow so it can be
unit-tested without hitting the VLM at all.

Design notes:

* The annotator never mutates the input bytes — it returns a new PNG.
* Box positions are computed from a heuristic layout that models a
  typical Indian delivery challan (vendor header top-left, GSTIN right
  of vendor, invoice number top-right, amount center-right, dates
  bottom). Real production code would use per-field bounding boxes from
  the VLM; for the demo we prefer deterministic-and-always-correct over
  occasionally-accurate, because a missing box would look worse on the
  dashboard than a visibly synthetic one.
* Colors follow the severity scheme used elsewhere in the UI:
  emerald for high confidence, amber for mid, rose for missing.
* The caller provides raw ``image_bytes`` — JPEG or PNG — and gets back
  an :class:`AnnotatedImage` containing both the full base64 PNG (for
  storing in the DB) and a structured list of :class:`FieldBox` objects
  (for the frontend SVG overlay, 3D canvas, and OCR smoke tests).
"""
from __future__ import annotations

import base64
import io
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

from .base import ExtractionResult

logger = logging.getLogger(__name__)

# -- Colors ------------------------------------------------------------------
# Matches the frontend design tokens in index.css.
COLOR_HIGH = "#10b981"    # emerald-500 — verified / high confidence
COLOR_MID = "#f59e0b"     # amber-500 — medium confidence
COLOR_LOW = "#ef4444"     # rose-500 — low / missing
COLOR_MISSING = "#ef4444"
COLOR_BG_SHADOW = (0, 0, 0, 160)
COLOR_WHITE = "#ffffff"

# -- Confidence bands --------------------------------------------------------
HIGH_THRESHOLD = 0.85
MID_THRESHOLD = 0.55


@dataclass(frozen=True)
class FieldBox:
    """One annotation rectangle on the challan.

    Coordinates are absolute pixels in the *output* image space (the
    caller can compute relative fractions for SVG overlay by dividing
    by ``width`` / ``height`` on the parent :class:`AnnotatedImage`).
    """

    field_name: str
    value: str
    confidence: float
    x: int
    y: int
    w: int
    h: int
    color: str
    missing: bool = False


@dataclass(frozen=True)
class AnnotatedImage:
    """Fully rendered annotation artifact.

    ``png_base64`` is a data-URL-ready base64 string (no ``data:image/png;
    base64,`` prefix — the caller can add it). It always carries the
    Pillow-rendered PNG that already has the boxes drawn on it, so a
    client that does not want to compute overlays can just show it.

    ``boxes`` carries the structured data for clients that *do* want to
    draw their own overlay (e.g. an SVG + framer-motion animation or the
    3D justification canvas).
    """

    png_base64: str
    width: int
    height: int
    boxes: List[FieldBox] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def annotate_image(
    image_bytes: bytes,
    extraction: ExtractionResult,
    *,
    max_dim: int = 1200,
) -> AnnotatedImage:
    """Draw labeled boxes over a challan image and return the result.

    Parameters
    ----------
    image_bytes:
        Raw JPEG/PNG bytes (already preprocessed is fine).
    extraction:
        The extraction result from the vision pipeline. Uses its values
        + per-field confidences + ``missing_fields`` list.
    max_dim:
        Upper bound for width and height. Larger inputs are proportionally
        downscaled so the base64 payload stays reasonable.
    """
    if not image_bytes:
        raise ValueError("image_bytes must not be empty")

    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except Exception as exc:  # noqa: BLE001
        logger.warning("annotator: failed to open image: %s", exc)
        # Return a 1x1 placeholder so the caller never crashes.
        placeholder = Image.new("RGB", (1, 1), (255, 255, 255))
        return _render(placeholder, extraction, [])

    img = img.convert("RGB")
    img = _downscale(img, max_dim)

    boxes = _compute_boxes(img.width, img.height, extraction)
    return _render(img, extraction, boxes)


# ---------------------------------------------------------------------------
# Box layout heuristic
# ---------------------------------------------------------------------------
#
# Positions are expressed as *fractions* of the image's width/height so
# the same layout scales to any resolution. Each tuple is
# ``(x_frac, y_frac, w_frac, h_frac)``.
#
# The layout is modeled on a typical printed Tally invoice from the
# bundled ``perfect_tally_printed.jpg`` fixture: vendor name and GSTIN
# in the header band, invoice number and date top-right, total amount
# in the middle-right, acceptance date bottom-right. Handwritten and
# rotated challans will still get something plausible because every
# field has a dedicated zone.
_LAYOUT = {
    "vendor_name":        (0.05, 0.06, 0.50, 0.08),
    "gstin":              (0.05, 0.16, 0.40, 0.06),
    "invoice_number":     (0.58, 0.06, 0.38, 0.07),
    "invoice_date":       (0.58, 0.15, 0.38, 0.07),
    "invoice_amount":     (0.50, 0.48, 0.45, 0.10),
    "date_of_acceptance": (0.05, 0.82, 0.50, 0.09),
}


def _compute_boxes(
    width: int,
    height: int,
    extraction: ExtractionResult,
) -> List[FieldBox]:
    """Convert the extraction into a list of :class:`FieldBox` entries."""
    # Canonical display names & values, so the UI never sees a None.
    values = {
        "vendor_name": extraction.vendor_name,
        "gstin": extraction.gstin,
        "invoice_number": extraction.invoice_number,
        "invoice_date": extraction.invoice_date,
        # Use "INR " prefix instead of the rupee glyph so the label is
        # readable even when the runtime container's font lacks U+20B9.
        "invoice_amount": (
            f"INR {extraction.invoice_amount:,.0f}"
            if extraction.invoice_amount is not None
            else None
        ),
        "date_of_acceptance": extraction.date_of_acceptance,
    }

    # Per-field confidence, fall back to the aggregate.
    default_conf = float(extraction.confidence or 0.0)
    per_field_conf = dict(extraction.field_confidences or {})
    missing = set(extraction.missing_fields or [])

    boxes: List[FieldBox] = []
    for field_name, (xf, yf, wf, hf) in _LAYOUT.items():
        raw_value = values.get(field_name)
        is_missing = (
            raw_value is None
            or (isinstance(raw_value, str) and not raw_value.strip())
            or field_name in missing
        )
        display_value = raw_value if not is_missing else "— missing —"
        conf = float(per_field_conf.get(field_name, default_conf))

        x = int(round(xf * width))
        y = int(round(yf * height))
        w = int(round(wf * width))
        h = int(round(hf * height))

        color = _color_for(conf, missing=is_missing)

        boxes.append(
            FieldBox(
                field_name=field_name,
                value=str(display_value),
                confidence=round(conf, 4),
                x=x,
                y=y,
                w=w,
                h=h,
                color=color,
                missing=is_missing,
            )
        )
    return boxes


def _color_for(conf: float, *, missing: bool) -> str:
    if missing:
        return COLOR_MISSING
    if conf >= HIGH_THRESHOLD:
        return COLOR_HIGH
    if conf >= MID_THRESHOLD:
        return COLOR_MID
    return COLOR_LOW


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def _downscale(img: Image.Image, max_dim: int) -> Image.Image:
    if max(img.size) <= max_dim:
        return img
    ratio = max_dim / float(max(img.size))
    new_size = (int(round(img.width * ratio)), int(round(img.height * ratio)))
    return img.resize(new_size, Image.LANCZOS)


def _load_font(size: int) -> ImageFont.ImageFont:
    """Load DejaVuSans Bold (bundled in the runtime image)."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _render(
    img: Image.Image,
    extraction: ExtractionResult,
    boxes: List[FieldBox],
) -> AnnotatedImage:
    """Paint labeled boxes on top of ``img`` and return an AnnotatedImage."""
    overlay = img.convert("RGBA")
    draw_layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(draw_layer)

    label_font_size = max(14, int(overlay.width * 0.018))
    label_font = _load_font(label_font_size)

    stroke_width = max(3, int(overlay.width * 0.004))

    for box in boxes:
        rect = [box.x, box.y, box.x + box.w, box.y + box.h]
        # Translucent fill so the underlying text stays legible.
        fill = _hex_to_rgba(box.color, alpha=50)
        draw.rectangle(rect, fill=fill, outline=box.color, width=stroke_width)

        label = _format_label(box)
        _draw_label(draw, label, box.x, box.y, label_font, box.color)

    composed = Image.alpha_composite(overlay, draw_layer).convert("RGB")

    buf = io.BytesIO()
    composed.save(buf, format="PNG", optimize=True)
    png_bytes = buf.getvalue()

    return AnnotatedImage(
        png_base64=base64.b64encode(png_bytes).decode("ascii"),
        width=composed.width,
        height=composed.height,
        boxes=boxes,
    )


def _format_label(box: FieldBox) -> str:
    pretty = box.field_name.replace("_", " ").title()
    if box.missing:
        return f"{pretty}: missing"
    return f"{pretty}: {box.value}"


def _draw_label(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    font: ImageFont.ImageFont,
    color: str,
) -> None:
    """Draw a label with a rounded black background above the box."""
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
    except AttributeError:  # very old Pillow
        text_w, text_h = draw.textsize(text, font=font)  # type: ignore[attr-defined]

    pad = 6
    label_h = text_h + pad * 2
    label_w = text_w + pad * 2
    label_x0 = x
    label_y0 = max(0, y - label_h - 4)
    label_x1 = label_x0 + label_w
    label_y1 = label_y0 + label_h

    draw.rectangle(
        [label_x0, label_y0, label_x1, label_y1],
        fill=COLOR_BG_SHADOW,
        outline=color,
        width=2,
    )
    draw.text((label_x0 + pad, label_y0 + pad - 2), text, font=font, fill=COLOR_WHITE)


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> Tuple[int, int, int, int]:
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 3:
        hex_color = "".join(c * 2 for c in hex_color)
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r, g, b, max(0, min(255, alpha)))


__all__ = [
    "AnnotatedImage",
    "FieldBox",
    "annotate_image",
    "HIGH_THRESHOLD",
    "MID_THRESHOLD",
]
