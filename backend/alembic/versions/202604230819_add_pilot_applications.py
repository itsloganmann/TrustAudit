"""add pilot_applications table

Revision ID: c9a1f0d42b17
Revises: 7592483b522b
Create Date: 2026-04-23 08:19:00.000000

Adds the ``pilot_applications`` table that backs the "Request pilot" form
on trustaudit.in. Uses ``sa.JSON`` for ``sectors`` / ``proof_channels`` so
the column works identically on SQLite (JSON1) and Postgres (JSONB).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c9a1f0d42b17"
down_revision: Union[str, Sequence[str], None] = "7592483b522b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the ``pilot_applications`` table and its indexes."""
    op.create_table(
        "pilot_applications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=False),
        sa.Column("contact_name", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=120), nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("ap_volume_tier", sa.String(length=16), nullable=False),
        sa.Column("sectors", sa.JSON(), nullable=False),
        sa.Column("proof_channels", sa.JSON(), nullable=False),
        sa.Column("biggest_blocker", sa.Text(), nullable=False),
        sa.Column("source_ip", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_pilot_applications_id"),
        "pilot_applications",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_pilot_applications_contact_email"),
        "pilot_applications",
        ["contact_email"],
        unique=False,
    )


def downgrade() -> None:
    """Drop the ``pilot_applications`` table."""
    op.drop_index(
        op.f("ix_pilot_applications_contact_email"),
        table_name="pilot_applications",
    )
    op.drop_index(
        op.f("ix_pilot_applications_id"),
        table_name="pilot_applications",
    )
    op.drop_table("pilot_applications")
