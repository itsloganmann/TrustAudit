#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║  TrustAudit — Simulation Driver                             ║
║  THE DEMO SCRIPT. This is what George watches live.         ║
║                                                             ║
║  Flow:                                                      ║
║  1. Pick a CRITICAL (PENDING) invoice from the DB           ║
║  2. Simulate a driver uploading a challan photo via WhatsApp ║
║  3. Simulate Vision AI extracting the Date of Acceptance     ║
║  4. Hit the webhook → status flips RED → GREEN on dashboard  ║
║                                                             ║
║  Usage: cd backend && source venv/bin/activate               ║
║         python simulate_driver.py                           ║
╚══════════════════════════════════════════════════════════════╝
"""
import sys
import os
import time
import random
import httpx

# ──── Config ────
API_BASE = "http://localhost:8000/api"

# ──── Dramatic print helpers ────
def slow_print(text, delay=0.03):
    """Print text character by character for dramatic effect."""
    for char in text:
        sys.stdout.write(char)
        sys.stdout.flush()
        time.sleep(delay)
    print()

def step(emoji, message, delay_after=1.5):
    """Print a step with emoji prefix and a dramatic pause."""
    print()
    slow_print(f"  {emoji}  {message}")
    time.sleep(delay_after)

def banner():
    """Print the opening banner."""
    print()
    print("  ╔══════════════════════════════════════════════════════╗")
    print("  ║                                                      ║")
    print("  ║   🛡️  TrustAudit — Tax Shield Simulation             ║")
    print("  ║       WhatsApp Challan Verification Demo             ║")
    print("  ║                                                      ║")
    print("  ╚══════════════════════════════════════════════════════╝")
    print()

def divider():
    print("  ─────────────────────────────────────────────────────")


# ──── Main Simulation ────
def main():
    banner()

    # Step 1: Fetch pending invoices
    step("📋", "Fetching pending invoices from TrustAudit...", delay_after=1.0)

    try:
        resp = httpx.get(f"{API_BASE}/invoices")
        resp.raise_for_status()
        invoices = resp.json()
    except httpx.ConnectError:
        print("\n  ❌  ERROR: Cannot connect to backend at localhost:8000")
        print("     Make sure the backend is running: ./start.sh")
        sys.exit(1)

    # Filter to PENDING + CRITICAL (days_remaining <= 3)
    critical = [i for i in invoices if i["status"] == "PENDING" and i.get("days_remaining", 99) <= 3]

    if not critical:
        pending = [i for i in invoices if i["status"] == "PENDING"]
        if pending:
            print(f"\n  ℹ️  No critical invoices found. {len(pending)} pending but not critical.")
            print("     Run 'python seed.py' to reset demo data.")
        else:
            print("\n  ✅  All invoices are already VERIFIED! Nothing to do.")
            print("     Run 'python seed.py' to reset demo data.")
        sys.exit(0)

    # Pick one CRITICAL invoice (random for variety if run multiple times)
    invoice = random.choice(critical)
    inv_id = invoice["id"]

    print(f"\n  📊 Found {len(critical)} CRITICAL invoices. Selecting one...\n")
    divider()

    # Step 2: Show the selected invoice
    step("🏭", f"Vendor:    {invoice['vendor_name']}")
    step("🧾", f"Invoice:   #{invoice['invoice_number']}", delay_after=0.5)
    step("💰", f"Amount:    ₹{invoice['invoice_amount']:,.0f}", delay_after=0.5)
    step("📅", f"Deadline:  {invoice['deadline_43bh']} ({invoice['days_remaining']} day{'s' if invoice['days_remaining'] != 1 else ''} remaining)", delay_after=0.5)
    step("⚠️ ", f"Status:    {invoice['status']} — RISK OF 43B(h) DISALLOWANCE", delay_after=1.5)

    divider()

    # Step 3: Simulate driver uploading challan via WhatsApp
    step("📱", "Simulating driver upload via WhatsApp...", delay_after=2.0)
    step("📸", "Reading WhatsApp Image: challan_photo_2026.jpg", delay_after=1.5)

    # Step 4: Simulate Vision AI processing
    step("🤖", "Vision AI processing challan image...", delay_after=2.0)
    slow_print(f"       ├── Extracting text via OCR...")
    time.sleep(1.0)
    slow_print(f"       ├── Identifying payment date fields...")
    time.sleep(1.0)
    slow_print(f"       ├── Cross-referencing GSTIN: {invoice['gstin']}")
    time.sleep(0.8)
    slow_print(f"       └── ✅ Date Found: {invoice['date_of_acceptance']}")
    time.sleep(1.5)

    divider()

    # Step 5: Hit the webhook
    step("🔌", "Sending verification to TrustAudit webhook...", delay_after=1.0)

    payload = {
        "invoice_id": inv_id,
        "extracted_date": invoice["date_of_acceptance"],
        "image_url": "/uploads/challan_demo.jpg",
    }

    try:
        resp = httpx.post(f"{API_BASE}/webhook/whatsapp", json=payload)
        resp.raise_for_status()
        result = resp.json()
    except Exception as e:
        print(f"\n  ❌  Webhook call failed: {e}")
        sys.exit(1)

    time.sleep(1.0)

    # Step 6: Celebrate
    divider()
    print()
    print("  ╔══════════════════════════════════════════════════════╗")
    print("  ║                                                      ║")
    print(f"  ║   ✅ SUCCESS — Invoice #{invoice['invoice_number']:<17}       ║")
    print(f"  ║   🛡️  Tax Shield SECURED                             ║")
    print("  ║                                                      ║")
    print(f"  ║   Vendor:  {invoice['vendor_name']:<40} ║")
    print(f"  ║   Amount:  ₹{invoice['invoice_amount']:>12,.0f}                              ║")
    print(f"  ║   Status:  PENDING → VERIFIED ✅                    ║")
    print("  ║                                                      ║")
    print("  ║   📊 Dashboard updated in real-time.                 ║")
    print("  ║   🔄 CFO can see the change NOW.                    ║")
    print("  ║                                                      ║")
    print("  ╚══════════════════════════════════════════════════════╝")
    print()

    # Show remaining critical count
    remaining = len(critical) - 1
    if remaining > 0:
        print(f"  ⚠️  {remaining} critical invoice{'s' if remaining != 1 else ''} still pending. Run again to verify more.")
    else:
        print("  🎉 All critical invoices for this batch are now verified!")
    print()


if __name__ == "__main__":
    main()
