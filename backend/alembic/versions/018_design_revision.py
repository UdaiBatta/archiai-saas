"""add a revision counter to designs, for revision-safe saving

Every write to a design bumps `revision`; a save that names the revision it
was based on only succeeds if it is still current (see design_service).

Revision ID: 018
Revises: 017
Create Date: 2026-10-14
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "designs",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("designs", "revision")
