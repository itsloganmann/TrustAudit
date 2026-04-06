"""Pure-PIL image preprocessors for the vision pipeline.

Everything here is idempotent and side-effect free: given input bytes,
return new output bytes. Upstream callers pick which operations to apply
based on the image_stats output and the edge cases detected.

If Pillow is not importable (shouldn't happen in production — it's in
requirements.txt) these functions degrade to no-ops with a warning so
the pipeline still completes.
"""
from __future__ import annotations

import hashlib
import io
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

try:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageStat

    _PIL_OK = True
except ImportError:  # pragma: no cover — Pillow should always be present
    _PIL_OK = False
    logger.warning("Pillow not available — preprocessors will no-op")


MAX_DIMENSION_DEFAULT = 2048


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------
def compute_sha256(image_bytes: bytes) -> str:
    """SHA-256 hex digest of the raw bytes — used for dedup."""
    return hashlib.sha256(image_bytes).hexdigest()


# ---------------------------------------------------------------------------
# Orientation & size
# ---------------------------------------------------------------------------
def auto_orient(image_bytes: bytes) -> bytes:
    """Rotate the image per its EXIF orientation tag, return JPEG bytes."""
    if not _PIL_OK:
        return image_bytes
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            oriented = ImageOps.exif_transpose(img)
            if oriented is None:
                return image_bytes
            return _to_jpeg_bytes(oriented)
    except Exception as exc:
        logger.warning("auto_orient failed: %s", exc)
        return image_bytes


def downsize_if_large(image_bytes: bytes, max_px: int = MAX_DIMENSION_DEFAULT) -> bytes:
    """Resize so the max dimension is ``max_px``. No-op if already smaller."""
    if not _PIL_OK:
        return image_bytes
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            w, h = img.size
            if max(w, h) <= max_px:
                return image_bytes
            scale = max_px / float(max(w, h))
            new_size = (int(w * scale), int(h * scale))
            resized = img.resize(new_size, Image.LANCZOS)
            return _to_jpeg_bytes(resized)
    except Exception as exc:
        logger.warning("downsize_if_large failed: %s", exc)
        return image_bytes


def strip_exif(image_bytes: bytes) -> bytes:
    """Re-encode without EXIF data so nothing leaks in stored images."""
    if not _PIL_OK:
        return image_bytes
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            # Create a clean copy with no EXIF by re-saving.
            clean = Image.new(img.mode, img.size)
            clean.paste(img)
            return _to_jpeg_bytes(clean)
    except Exception as exc:
        logger.warning("strip_exif failed: %s", exc)
        return image_bytes


# ---------------------------------------------------------------------------
# Tonal adjustments
# ---------------------------------------------------------------------------
def boost_shadows(image_bytes: bytes, brightness: float = 1.25, contrast: float = 1.15) -> bytes:
    """Lift shadows on underexposed challans before re-extracting."""
    if not _PIL_OK:
        return image_bytes
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            bright = ImageEnhance.Brightness(img).enhance(brightness)
            contrasted = ImageEnhance.Contrast(bright).enhance(contrast)
            return _to_jpeg_bytes(contrasted)
    except Exception as exc:
        logger.warning("boost_shadows failed: %s", exc)
        return image_bytes


def compress_highlights(image_bytes: bytes, brightness: float = 0.85, contrast: float = 1.1) -> bytes:
    """Reduce washed-out glare regions."""
    if not _PIL_OK:
        return image_bytes
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            darker = ImageEnhance.Brightness(img).enhance(brightness)
            contrasted = ImageEnhance.Contrast(darker).enhance(contrast)
            return _to_jpeg_bytes(contrasted)
    except Exception as exc:
        logger.warning("compress_highlights failed: %s", exc)
        return image_bytes


# ---------------------------------------------------------------------------
# Image statistics — used by edge-case detectors
# ---------------------------------------------------------------------------
def image_stats(image_bytes: bytes) -> Dict[str, Any]:
    """Return width/height/brightness/saturated-ratio/sharpness-proxy.

    Used both by the edge-case detectors and by the pipeline's preprocessing
    decision tree. All values are best-effort: if PIL is missing or the
    image is corrupt, we still return a dict with sensible defaults so
    downstream code doesn't have to special-case None.
    """
    default = {
        "width": 0,
        "height": 0,
        "format": None,
        "mean_brightness": 128.0,
        "saturated_ratio": 0.0,
        "laplacian_variance_proxy": 1000.0,
        "bytes_len": len(image_bytes),
    }
    if not _PIL_OK:
        return default
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            width, height = img.size
            fmt = img.format
            gray = img.convert("L")
            stat = ImageStat.Stat(gray)
            mean_brightness = float(stat.mean[0])

            # Saturated ratio: fraction of pixels at or near 255.
            hist = gray.histogram()
            total = sum(hist) or 1
            saturated = sum(hist[240:]) / total

            # Laplacian variance proxy — run a 3x3 edge filter and
            # compute the stdev**2 of the result. High variance means
            # more edges means sharper image.
            edges = gray.filter(ImageFilter.FIND_EDGES)
            edge_stat = ImageStat.Stat(edges)
            sharpness_proxy = float(edge_stat.stddev[0] ** 2)

            return {
                "width": width,
                "height": height,
                "format": fmt,
                "mean_brightness": mean_brightness,
                "saturated_ratio": saturated,
                "laplacian_variance_proxy": sharpness_proxy,
                "bytes_len": len(image_bytes),
            }
    except Exception as exc:
        logger.warning("image_stats failed: %s", exc)
        return default


# ---------------------------------------------------------------------------
# Internal
# ---------------------------------------------------------------------------
def _to_jpeg_bytes(img: "Image.Image") -> bytes:
    """Encode a PIL Image to JPEG bytes, handling RGBA inputs."""
    buf = io.BytesIO()
    target = img
    if target.mode in ("RGBA", "P"):
        target = target.convert("RGB")
    target.save(buf, format="JPEG", quality=90)
    return buf.getvalue()
