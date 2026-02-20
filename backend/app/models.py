"""SQLAlchemy models for TrustAudit — Invoice tracking with 43B(h) compliance."""
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text
from sqlalchemy.sql import func
from .database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    vendor_name = Column(String(255), nullable=False)
    gstin = Column(String(15), nullable=False)           # GSTIN of the MSME vendor
    invoice_number = Column(String(100), nullable=False)
    invoice_amount = Column(Float, nullable=False)
    invoice_date = Column(Date, nullable=False)
    date_of_acceptance = Column(Date, nullable=False)    # THE key date for 43B(h)
    deadline_43bh = Column(Date, nullable=False)         # acceptance + 45 days
    status = Column(String(20), default="PENDING")       # PENDING | VERIFIED | PAID
    challan_image_url = Column(Text, nullable=True)      # Path to uploaded challan photo
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    def __repr__(self):
        return f"<Invoice {self.invoice_number} | {self.vendor_name} | {self.status}>"
