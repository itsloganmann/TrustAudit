"""Pydantic schemas for API request/response serialization."""
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class InvoiceBase(BaseModel):
    vendor_name: str
    gstin: str
    invoice_number: str
    invoice_amount: float
    invoice_date: date
    date_of_acceptance: date
    deadline_43bh: date


class InvoiceCreate(InvoiceBase):
    pass


class InvoiceResponse(InvoiceBase):
    id: int
    status: str
    challan_image_url: Optional[str] = None
    verified_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    days_remaining: Optional[int] = None

    model_config = {"from_attributes": True}


class WebhookPayload(BaseModel):
    invoice_id: int
    extracted_date: Optional[str] = None  # Date extracted from challan image
    image_url: Optional[str] = None


class ActivityLog(BaseModel):
    timestamp: str
    message: str
    invoice_id: Optional[int] = None
    type: str = "info"  # info | success | warning | error
