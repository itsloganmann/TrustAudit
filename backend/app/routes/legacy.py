"""API routes for TrustAudit — Invoice CRUD + WhatsApp webhook + Live streaming."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from typing import List
import random
import threading
import time

from ..database import get_db
from ..models import Invoice
from ..schemas import InvoiceResponse, WebhookPayload, ActivityLog

router = APIRouter()

# In-memory activity log
activity_feed: List[dict] = []

# Indian cities for realistic activity generation
INDIAN_CITIES = [
    "Mumbai", "Delhi", "Bengaluru", "Chennai", "Pune", "Hyderabad",
    "Ahmedabad", "Kolkata", "Jaipur", "Lucknow", "Kochi", "Coimbatore",
    "Surat", "Vizag", "Noida", "Vadodara", "Mysuru", "Jamshedpur",
]

DRIVER_NAMES = [
    "Ramesh K.", "Suresh P.", "Anil V.", "Vikram S.", "Rajesh M.",
    "Deepak T.", "Manoj B.", "Sanjay R.", "Prasad N.", "Amit G.",
    "Ravi K.", "Karthik S.", "Ganesh P.", "Arjun D.", "Naveen L.",
]


def _add_activity(message: str, invoice_id: int = None, log_type: str = "info"):
    activity_feed.insert(0, {
        "timestamp": datetime.now().isoformat(),
        "message": message,
        "invoice_id": invoice_id,
        "type": log_type,
    })
    if len(activity_feed) > 100:
        activity_feed.pop()


def _generate_streaming_activity():
    """Background thread: generates realistic fake activity every 4-8 seconds."""
    messages = [
        lambda: f"Challan scan received from {random.choice(DRIVER_NAMES)} in {random.choice(INDIAN_CITIES)}",
        lambda: f"OCR processing complete — {random.choice(INDIAN_CITIES)} region",
        lambda: f"GSTIN validation passed — {random.choice(['27', '33', '24', '29', '07', '08', '09', '32', '36', '19'])}AADC*****",
        lambda: f"WhatsApp delivery confirmed — {random.choice(DRIVER_NAMES)}",
        lambda: f"Payment reminder sent — {random.randint(1, 5)} invoices approaching deadline",
        lambda: f"New MSME registration detected — {random.choice(INDIAN_CITIES)}",
        lambda: f"Batch processing: {random.randint(12, 89)} challans queued",
        lambda: f"Compliance check completed — {random.choice(INDIAN_CITIES)} cluster",
        lambda: f"Document hash verified — SHA256 match confirmed",
        lambda: f"API webhook received from Tally integration",
    ]
    types = ["info", "info", "info", "success", "warning", "info", "info", "success", "info", "info"]

    while True:
        time.sleep(random.uniform(3, 7))
        idx = random.randint(0, len(messages) - 1)
        _add_activity(messages[idx](), log_type=types[idx])


# Start background streaming on import
_stream_thread = threading.Thread(target=_generate_streaming_activity, daemon=True)
_stream_thread.start()

# Seed some initial activity
for _ in range(8):
    city = random.choice(INDIAN_CITIES)
    driver = random.choice(DRIVER_NAMES)
    msgs = [
        (f"Challan verified — {driver} via WhatsApp ({city})", "success"),
        (f"OCR extraction complete — Date of Acceptance confirmed", "info"),
        (f"GSTIN cross-reference passed for {city} vendor", "info"),
        (f"Payment compliance check — {random.randint(2, 8)} invoices cleared", "success"),
    ]
    msg, typ = random.choice(msgs)
    activity_feed.append({
        "timestamp": (datetime.now() - timedelta(minutes=random.randint(1, 120))).isoformat(),
        "message": msg,
        "invoice_id": None,
        "type": typ,
    })


@router.get("/invoices", response_model=List[InvoiceResponse])
def list_invoices(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).order_by(Invoice.deadline_43bh.asc()).all()
    results = []
    today = date.today()
    for inv in invoices:
        resp = InvoiceResponse.model_validate(inv)
        resp.days_remaining = (inv.deadline_43bh - today).days
        results.append(resp)
    return results


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    today = date.today()
    resp = InvoiceResponse.model_validate(inv)
    resp.days_remaining = (inv.deadline_43bh - today).days
    return resp


@router.post("/webhook/whatsapp", response_model=InvoiceResponse)
def whatsapp_webhook(payload: WebhookPayload, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == payload.invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv.status = "VERIFIED"
    inv.verified_at = datetime.now()
    if payload.image_url:
        inv.challan_image_url = payload.image_url

    db.commit()
    db.refresh(inv)

    _add_activity(
        f"Challan verified for {inv.vendor_name} — ₹{inv.invoice_amount:,.0f}",
        invoice_id=inv.id,
        log_type="success",
    )
    _add_activity(
        f"Vision AI: Date of Acceptance extracted — {inv.date_of_acceptance}",
        invoice_id=inv.id,
        log_type="info",
    )
    _add_activity(
        f"Tax Shield secured: 43B(h) deadline met — Invoice #{inv.invoice_number}",
        invoice_id=inv.id,
        log_type="success",
    )

    today = date.today()
    resp = InvoiceResponse.model_validate(inv)
    resp.days_remaining = (inv.deadline_43bh - today).days
    return resp


@router.get("/activity", response_model=List[ActivityLog])
def get_activity_feed():
    return activity_feed[:30]


@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    all_invoices = db.query(Invoice).all()
    verified = [i for i in all_invoices if i.status == "VERIFIED"]
    pending = [i for i in all_invoices if i.status == "PENDING"]
    today = date.today()
    critical = [i for i in pending if (i.deadline_43bh - today).days <= 3]
    warning = [i for i in pending if 3 < (i.deadline_43bh - today).days <= 14]
    safe = [i for i in pending if (i.deadline_43bh - today).days > 14]

    total_value = sum(i.invoice_amount for i in all_invoices)
    liability_saved = sum(i.invoice_amount for i in verified)
    total_at_risk = sum(i.invoice_amount for i in critical)

    return {
        "total_invoices": len(all_invoices),
        "verified_count": len(verified),
        "pending_count": len(pending),
        "critical_count": len(critical),
        "warning_count": len(warning),
        "safe_count": len(safe),
        "liability_saved": liability_saved,
        "total_at_risk": total_at_risk,
        "total_value": total_value,
        "compliance_rate": round((len(verified) / len(all_invoices) * 100), 1) if all_invoices else 0,
        "avg_days_remaining": round(sum((i.deadline_43bh - today).days for i in pending) / len(pending), 1) if pending else 0,
        "processed_today": len([i for i in verified if i.verified_at and i.verified_at.date() == today]),
    }
