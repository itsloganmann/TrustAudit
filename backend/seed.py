"""
TrustAudit Production Seed — 50 realistic Indian MSME invoices.
Covers Maharashtra, Tamil Nadu, Gujarat, Karnataka, Delhi, Rajasthan, UP, Kerala, Telangana, WB.
Mix: 15 VERIFIED, 12 CRITICAL (≤3 days), 23 PENDING (various timelines).
"""
import sys, os, random
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from app.database import engine, SessionLocal, Base
from app.models import Invoice
from datetime import datetime

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
db = SessionLocal()
today = date.today()
tomorrow = today + timedelta(days=1)

# State code prefixes for GSTIN
# 27=MH, 33=TN, 24=GJ, 29=KA, 07=DL, 08=RJ, 09=UP, 32=KL, 36=TS, 19=WB

vendors = [
    # ═══ CRITICAL — Deadline tomorrow or today ═══
    ("Gupta Steel Fabricators", "09AADCG9012H1Z1", "GSF-2026-0234", 412000, -44, 1),
    ("Priya Textiles & Co", "24AADCP3456I2Z6", "PTC-2026-0567", 328750, -44, 1),
    ("Mumbai Logistics Solutions", "27AADCM7890J3Z9", "MLS-2026-0123", 156200, -44, 1),
    ("Shree Balaji Polymers", "27AADCS2345K4Z2", "SBP-2026-0891", 567000, -43, 1),
    ("Patel Brothers Engineering", "24AADCP6789L5Z5", "PBE-2026-0342", 234500, -44, 1),
    ("Anand Precision Tools", "33AADCA1234M6Z8", "APT-2026-0678", 189000, -43, 1),
    ("Kolkata Jute Industries", "19AADCK5678N7Z1", "KJI-2026-0445", 723000, -44, 1),
    ("Sharma Auto Components", "08AADCS9012O8Z4", "SAC-2026-0889", 145000, -44, 0),
    ("Vijay Packaging Solutions", "29AADCV3456P9Z7", "VPS-2026-0112", 298000, -43, 1),
    ("Deepak Chemical Works", "27AADCD7890Q1Z0", "DCW-2026-0667", 876500, -44, 1),
    ("Telangana Pharma Ltd", "36AADCT2345R2Z3", "TPL-2026-0223", 445000, -43, 1),
    ("Kerala Spice Exports", "32AADCK6789S3Z6", "KSE-2026-0998", 167800, -44, 0),

    # ═══ WARNING — 4-14 days remaining ═══
    ("Sunrise Electronics Pvt Ltd", "29AADCS1234T4Z9", "SEP-2026-0334", 534000, -35, 10),
    ("Bharat Heavy Electricals", "07AADCB5678U5Z2", "BHE-2026-0771", 1250000, -38, 7),
    ("Mahalaxmi Textiles", "27AADCM9012V6Z5", "MLT-2026-0556", 378000, -37, 8),
    ("Coimbatore Castings Ltd", "33AADCC3456W7Z8", "CCL-2026-0112", 456000, -40, 5),
    ("Ahmedabad Paper Mills", "24AADCA7890X8Z1", "APM-2026-0889", 289000, -34, 11),
    ("Rajasthan Marble Corp", "08AADCR2345Y9Z4", "RMC-2026-0443", 678000, -39, 6),
    ("Noida Software Solutions", "09AADCN6789Z1Z7", "NSS-2026-0221", 912000, -36, 9),
    ("Hyderabad Bulk Drugs", "36AADCH1234A2Z0", "HBD-2026-0667", 345000, -41, 4),

    # ═══ SAFE — 15-40 days remaining ═══
    ("Rajesh Auto Parts Pvt Ltd", "27AADCR1234F1Z5", "RAP-2026-0451", 245000, -8, 37),
    ("Srinivasan Engineering Works", "33AADCS5678G2Z8", "SEW-2026-0892", 187500, -12, 33),
    ("Tata Metaliks Limited", "19AADCT9012B3Z3", "TML-2026-0334", 1890000, -5, 40),
    ("Infosys BPO Services", "29AADCI3456C4Z6", "IBS-2026-0778", 2340000, -10, 35),
    ("Wipro Enterprises Ltd", "29AADCW7890D5Z9", "WEL-2026-0993", 567000, -7, 38),
    ("Jindal Stainless Steel", "07AADCJ2345E6Z2", "JSS-2026-0112", 3450000, -6, 39),
    ("Godrej Industries", "27AADCG6789F7Z5", "GIL-2026-0556", 1234000, -15, 30),
    ("Lupin Pharmaceuticals", "27AADCL1234G8Z8", "LPH-2026-0889", 789000, -12, 33),
    ("Dabur India Ltd", "07AADCD5678H9Z1", "DIL-2026-0223", 456000, -20, 25),
    ("Sun Pharma Advanced", "24AADCS9012I1Z4", "SPA-2026-0667", 2100000, -18, 27),
    ("Mahindra & Mahindra", "27AADCM3456J2Z7", "MAM-2026-0443", 4500000, -14, 31),
    ("Bajaj Auto Components", "27AADCB7890K3Z0", "BAC-2026-0998", 890000, -9, 36),
    ("Ashok Leyland Parts", "33AADCA2345L4Z3", "ALP-2026-0112", 567000, -11, 34),
    ("Hero MotoCorp Supplies", "07AADCH6789M5Z6", "HMS-2026-0334", 1230000, -13, 32),
    ("Maruti Suzuki Vendors", "07AADCM1234N6Z9", "MSV-2026-0778", 3400000, -16, 29),
    ("Reliance Industrial Svcs", "27AADCR5678O7Z2", "RIS-2026-0556", 5670000, -19, 26),
    ("ITC Agri Business", "19AADCI9012P8Z5", "IAB-2026-0889", 345000, -8, 37),
    ("Hindalco Raw Materials", "27AADCH3456Q9Z8", "HRM-2026-0223", 2340000, -10, 35),

    # ═══ ALREADY VERIFIED ═══
    ("Chennai Silks Trading", "33AADCC7890R1Z1", "CST-2026-0112", 234000, -30, 15),
    ("Bengaluru Tech Components", "29AADCB2345S2Z4", "BTC-2026-0667", 890000, -25, 20),
    ("Delhi Auto Ancillaries", "07AADCD6789T3Z7", "DAA-2026-0334", 567000, -28, 17),
    ("Pune Engineering Works", "27AADCP1234U4Z0", "PEW-2026-0443", 1234000, -22, 23),
    ("Jamshedpur Steel Traders", "19AADCJ5678V5Z3", "JST-2026-0998", 3450000, -35, 10),
    ("Vadodara Chemical Corp", "24AADCV9012W6Z6", "VCC-2026-0556", 678000, -20, 25),
    ("Mysuru Silk Industries", "29AADCM3456X7Z9", "MSI-2026-0889", 189000, -18, 27),
    ("Lucknow Textile Mills", "09AADCL7890Y8Z2", "LTM-2026-0223", 456000, -32, 13),
    ("Kochi Marine Exports", "32AADCK2345Z9Z5", "KME-2026-0778", 1230000, -27, 18),
    ("Vizag Steel & Alloys", "36AADCV6789A1Z8", "VSA-2026-0112", 2100000, -24, 21),
    ("Surat Diamond Trading", "24AADCS1234B2Z1", "SDT-2026-0667", 8900000, -15, 30),
    ("Kanpur Leather Works", "09AADCK5678C3Z4", "KLW-2026-0443", 345000, -29, 16),
]

print("\n🛡️  TrustAudit — Production Database Seed")
print("=" * 60)

verified_names = {v[0] for v in vendors[-12:]}  # Last 12 are VERIFIED
critical_count = 0
verified_count = 0
pending_count = 0
total_amount = 0

for name, gstin, inv_num, amount, accept_offset, days_left in vendors:
    acceptance = today + timedelta(days=accept_offset)
    deadline = today + timedelta(days=days_left)
    inv_date = acceptance - timedelta(days=random.randint(2, 8))

    is_verified = name in verified_names
    is_critical = days_left <= 1

    status = "VERIFIED" if is_verified else "PENDING"
    verified_at = datetime.now() - timedelta(hours=random.randint(1, 72)) if is_verified else None

    inv = Invoice(
        vendor_name=name,
        gstin=gstin,
        invoice_number=inv_num,
        invoice_amount=float(amount),
        invoice_date=inv_date,
        date_of_acceptance=acceptance,
        deadline_43bh=deadline,
        status=status,
        verified_at=verified_at,
        challan_image_url="/uploads/challan_demo.jpg" if is_verified else None,
    )
    db.add(inv)
    total_amount += amount

    if is_verified:
        verified_count += 1
        tag = "  ✓ VERIFIED"
    elif is_critical:
        critical_count += 1
        tag = "  ✗ CRITICAL"
    else:
        pending_count += 1
        tag = "  ○ PENDING "

    print(f"{tag}  {name:<35} ₹{amount:>12,}  |  {days_left:>2}d left  |  {gstin}")

db.commit()
db.close()

print("=" * 60)
print(f"\n  Total invoices:  {len(vendors)}")
print(f"  Verified:        {verified_count}")
print(f"  Pending:         {pending_count}")
print(f"  Critical:        {critical_count}")
print(f"  Total value:     ₹{total_amount:,}")
print(f"  At risk:         ₹{sum(v[3] for v in vendors if v[5] <= 1):,}")
print(f"\n  Ready for production demo. 🚀\n")
