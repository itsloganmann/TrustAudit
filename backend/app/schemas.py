"""Pydantic schemas for API request/response serialization."""
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import date, datetime
from typing import List, Literal, Optional


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


# ---------------------------------------------------------------------------
# Pilot-program intake schemas
# ---------------------------------------------------------------------------

# Closed enums for the multi-select and tier fields. Kept as tuples so
# FastAPI renders them as native OpenAPI enums and so Pydantic v2 emits
# a 422 (not a 500) when a client tries to smuggle a surprise value in.
PilotApVolumeTier = Literal["<1cr", "1-10cr", "10-100cr", "100cr+"]
PilotSector = Literal[
    "pharma", "manufacturing", "industrial", "distribution", "other"
]
PilotProofChannel = Literal["whatsapp", "email", "pdf", "erp", "physical"]


class PilotApplicationCreate(BaseModel):
    """Incoming form body for ``POST /api/pilot/applications``.

    All free-text fields are length-bounded to keep a malicious client
    from stuffing a megabyte of junk into the blocker field. Multi-select
    fields require at least one entry; Pydantic's ``Literal`` validation
    plus the ``min_length=1`` guard do the rest.
    """

    company_name: str = Field(..., min_length=1, max_length=255)
    contact_name: str = Field(..., min_length=1, max_length=255)
    role: str = Field(..., min_length=1, max_length=120)
    contact_email: EmailStr
    phone: Optional[str] = Field(None, max_length=40)
    ap_volume_tier: PilotApVolumeTier
    sectors: List[PilotSector] = Field(..., min_length=1, max_length=5)
    proof_channels: List[PilotProofChannel] = Field(
        ..., min_length=1, max_length=5
    )
    biggest_blocker: str = Field(..., min_length=1, max_length=2000)

    @field_validator("sectors", "proof_channels")
    @classmethod
    def _dedupe_preserving_order(cls, value: List[str]) -> List[str]:
        """Strip duplicates so downstream consumers see clean lists
        without worrying about set ordering."""
        seen: set[str] = set()
        out: List[str] = []
        for item in value:
            if item not in seen:
                seen.add(item)
                out.append(item)
        return out


class PilotApplicationResponse(BaseModel):
    id: int
    company_name: str
    contact_name: str
    role: str
    contact_email: str
    phone: Optional[str] = None
    ap_volume_tier: str
    sectors: List[str]
    proof_channels: List[str]
    biggest_blocker: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
