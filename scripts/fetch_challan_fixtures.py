#!/usr/bin/env python3
"""Generate placeholder challan fixture images + expected extractions.

Creates 16 JPEG placeholder images (800x1200 white background with the
fixture name drawn on it) under ``backend/tests/fixtures/challans/``
and 16 matching ``<name>.expected.json`` files under
``backend/tests/fixtures/challans/expected/``.

These are deliberately synthetic — their only job is to give the test
suite deterministic bytes and paired expected extractions. Real challan
images can be swapped in later by replacing the JPEG writer with a
downloader; the expected.json files and the sha-based lookup in
``MockVisionClient._try_load_paired_expected`` remain valid.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: Pillow is required. Run `pip install Pillow`.", file=sys.stderr)
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parents[1]
CHALLANS_DIR = REPO_ROOT / "backend" / "tests" / "fixtures" / "challans"
EXPECTED_DIR = CHALLANS_DIR / "expected"


FIXTURES: List[Dict[str, Any]] = [
    {
        "name": "perfect_tally_printed",
        "vendor_name": "Gupta Steel Works",
        "gstin": "27AAFCG1234H1Z9",
        "invoice_number": "GSW/2026/0412",
        "invoice_amount": 412000.0,
        "invoice_date": "2026-03-21",
        "date_of_acceptance": "2026-03-21",
        "confidence": 0.97,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": [],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "handwritten_clear",
        "vendor_name": "Priya Textiles",
        "gstin": "27AABCP5678N1ZK",
        "invoice_number": "PT-2026-033",
        "invoice_amount": 185000.0,
        "invoice_date": "2026-03-15",
        "date_of_acceptance": "2026-03-16",
        "confidence": 0.82,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["handwritten"],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "missing_date",
        "vendor_name": "Sharma Packaging",
        "gstin": "09AAACS9999K2Z5",
        "invoice_number": "SP/INV/2026/015",
        "invoice_amount": 75000.0,
        "invoice_date": "2026-02-28",
        "date_of_acceptance": None,
        "confidence": 0.72,
        "is_challan": True,
        "missing_fields": ["date_of_acceptance"],
        "detected_edge_cases": [],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "missing_gstin",
        "vendor_name": "Kamal Traders",
        "gstin": None,
        "invoice_number": "KT/2026/0017",
        "invoice_amount": 34500.0,
        "invoice_date": "2026-03-10",
        "date_of_acceptance": "2026-03-11",
        "confidence": 0.78,
        "is_challan": True,
        "missing_fields": ["gstin"],
        "detected_edge_cases": [],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "multi_stamp_overlap",
        "vendor_name": "Ravi Industries",
        "gstin": "06AAACR7777P1Z9",
        "invoice_number": "RI/2026/221",
        "invoice_amount": 560000.0,
        "invoice_date": "2026-03-05",
        "date_of_acceptance": "2026-03-06",
        "confidence": 0.68,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["multi_stamp_overlap"],
        "text_quality": "poor",
        "orientation": "ok",
    },
    {
        "name": "crumpled_paper",
        "vendor_name": "Bharat Fasteners",
        "gstin": "24AAACB1122Q1Z3",
        "invoice_number": "BF/26/1005",
        "invoice_amount": 238500.0,
        "invoice_date": "2026-03-01",
        "date_of_acceptance": "2026-03-02",
        "confidence": 0.74,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["crumpled"],
        "text_quality": "poor",
        "orientation": "ok",
    },
    {
        "name": "bilingual_hindi_english",
        "vendor_name": "Lakshmi Enterprises",
        "gstin": "07AAACL8888M1Z1",
        "invoice_number": "LE/2026/042",
        "invoice_amount": 128000.0,
        "invoice_date": "2026-03-12",
        "date_of_acceptance": "2026-03-13",
        "confidence": 0.86,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["bilingual"],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "blurry_phone_photo",
        "vendor_name": None,
        "gstin": None,
        "invoice_number": None,
        "invoice_amount": None,
        "invoice_date": None,
        "date_of_acceptance": None,
        "confidence": 0.25,
        "is_challan": True,
        "missing_fields": [
            "vendor_name",
            "gstin",
            "invoice_number",
            "invoice_amount",
            "invoice_date",
            "date_of_acceptance",
        ],
        "detected_edge_cases": ["blurry"],
        "text_quality": "illegible",
        "orientation": "ok",
    },
    {
        "name": "rotated_upside_down",
        "vendor_name": "Mehta Hardware",
        "gstin": "27AAACM1010L1ZQ",
        "invoice_number": "MH-2026-077",
        "invoice_amount": 98000.0,
        "invoice_date": "2026-03-18",
        "date_of_acceptance": "2026-03-19",
        "confidence": 0.81,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": [],
        "text_quality": "good",
        "orientation": "rotated_180",
    },
    {
        "name": "low_light_night",
        "vendor_name": "Night Shift Traders",
        "gstin": "19AAACN3333D1ZX",
        "invoice_number": "NST/2026/009",
        "invoice_amount": 42500.0,
        "invoice_date": "2026-03-22",
        "date_of_acceptance": "2026-03-22",
        "confidence": 0.61,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["low_light"],
        "text_quality": "poor",
        "orientation": "ok",
    },
    {
        "name": "glare_flash",
        "vendor_name": "Shine Metals",
        "gstin": "27AAACS4444K1Z5",
        "invoice_number": "SM/2026/118",
        "invoice_amount": 315000.0,
        "invoice_date": "2026-03-14",
        "date_of_acceptance": "2026-03-15",
        "confidence": 0.66,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["glare"],
        "text_quality": "poor",
        "orientation": "ok",
    },
    {
        "name": "multi_invoice_stack",
        "vendor_name": "Mixed Vendors",
        "gstin": "27AAACX0000X1Z1",
        "invoice_number": "STACK-01",
        "invoice_amount": 50000.0,
        "invoice_date": "2026-03-20",
        "date_of_acceptance": "2026-03-20",
        "confidence": 0.70,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["multi_invoice"],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "digital_rephoto",
        "vendor_name": "Arjun Steels",
        "gstin": "27AAACA5555L1Z2",
        "invoice_number": "AS/2026/201",
        "invoice_amount": 1250000.0,
        "invoice_date": "2026-03-11",
        "date_of_acceptance": "2026-03-12",
        "confidence": 0.88,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": ["digital_rephoto"],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "composition_scheme_no_gstin",
        "vendor_name": "Small Farm Supplies (Composition)",
        "gstin": None,
        "invoice_number": "SFS/2026/0033",
        "invoice_amount": 22000.0,
        "invoice_date": "2026-03-08",
        "date_of_acceptance": "2026-03-09",
        "confidence": 0.85,
        "is_challan": True,
        "missing_fields": ["gstin"],
        "detected_edge_cases": ["composition_scheme"],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "future_date_typo",
        "vendor_name": "Tomorrow Traders",
        "gstin": "27AAACT6666R1Z8",
        "invoice_number": "TT/2099/001",
        "invoice_amount": 55000.0,
        "invoice_date": "2099-05-15",
        "date_of_acceptance": "2099-05-15",
        "confidence": 0.89,
        "is_challan": True,
        "missing_fields": [],
        "detected_edge_cases": [],
        "text_quality": "good",
        "orientation": "ok",
    },
    {
        "name": "non_challan_selfie",
        "vendor_name": None,
        "gstin": None,
        "invoice_number": None,
        "invoice_amount": None,
        "invoice_date": None,
        "date_of_acceptance": None,
        "confidence": 0.0,
        "is_challan": False,
        "missing_fields": [
            "vendor_name",
            "gstin",
            "invoice_number",
            "invoice_amount",
            "invoice_date",
            "date_of_acceptance",
        ],
        "detected_edge_cases": ["non_challan"],
        "text_quality": "good",
        "orientation": "ok",
    },
]


def _draw_placeholder(name: str, out_path: Path) -> bytes:
    """Write an 800x1200 white JPEG with the fixture name + summary text."""
    image = Image.new("RGB", (800, 1200), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)

    # Use the default PIL bitmap font — available everywhere without TTF.
    try:
        font = ImageFont.load_default()
    except Exception:
        font = None

    text_lines = [
        "TRUSTAUDIT — PLACEHOLDER CHALLAN",
        "",
        f"Fixture: {name}",
        "",
        "This is a synthetic placeholder image generated",
        "by scripts/fetch_challan_fixtures.py.",
        "",
        "Real challan photos can be dropped into this",
        "directory with the matching filename and the",
        "MockVisionClient will auto-load the paired",
        "<name>.expected.json from ./expected/.",
    ]

    y = 60
    for line in text_lines:
        draw.text((60, y), line, fill=(0, 0, 0), font=font)
        y += 28

    # Add a faint border so the image is visually distinct from blank JPEGs
    draw.rectangle([(10, 10), (789, 1189)], outline=(200, 200, 200), width=3)

    image.save(out_path, format="JPEG", quality=90)
    return out_path.read_bytes()


def main() -> int:
    CHALLANS_DIR.mkdir(parents=True, exist_ok=True)
    EXPECTED_DIR.mkdir(parents=True, exist_ok=True)

    for spec in FIXTURES:
        name = spec["name"]
        image_path = CHALLANS_DIR / f"{name}.jpg"
        image_bytes = _draw_placeholder(name, image_path)
        sha = hashlib.sha256(image_bytes).hexdigest()

        # Write the expected.json keyed on sha so the mock client can find it.
        expected_path = EXPECTED_DIR / f"{sha}.expected.json"
        expected_payload = {k: v for k, v in spec.items() if k != "name"}
        # Always include confidence and flag so the mock client respects it.
        expected_path.write_text(json.dumps(expected_payload, indent=2))

        # Also write a readable `<name>.expected.json` alongside for humans.
        readable_path = EXPECTED_DIR / f"{name}.expected.json"
        readable_path.write_text(json.dumps(expected_payload, indent=2))

        print(f"  {name:32s} -> {image_path.name} (sha {sha[:12]}...)")

    sources = CHALLANS_DIR / "SOURCES.md"
    sources.write_text(
        """# TrustAudit challan fixtures

These 16 JPEG files are **synthetic placeholders** generated by
`scripts/fetch_challan_fixtures.py`. Each 800x1200 image contains the
fixture name drawn in plain text on a white background — just enough
for the test suite to reason about deterministic bytes and hashes.

The paired expected-extraction JSON files live under `./expected/`:

- `<name>.expected.json` — human-readable, keyed by fixture name
- `<sha>.expected.json`  — keyed by SHA-256 of the JPEG bytes, used by
  `backend/app/services/vision/mock_client.py` to round-trip an
  extraction for a known image

To swap in real challan photos, drop a file with the matching
fixture name over the placeholder, re-run the script, and the mock
client will pick up the new sha automatically.

The 16 fixture names mirror the edge-case catalog in
`.claude/plans/snappy-twirling-mist.md`:

1. perfect_tally_printed
2. handwritten_clear
3. missing_date
4. missing_gstin
5. multi_stamp_overlap
6. crumpled_paper
7. bilingual_hindi_english
8. blurry_phone_photo
9. rotated_upside_down
10. low_light_night
11. glare_flash
12. multi_invoice_stack
13. digital_rephoto
14. composition_scheme_no_gstin
15. future_date_typo
16. non_challan_selfie
"""
    )

    print(f"\nCreated {len(FIXTURES)} fixtures in {CHALLANS_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
