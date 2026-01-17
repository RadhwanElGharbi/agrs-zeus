"""Add sorties table (project-scoped).

Revision ID: 0003_sorties
Revises: 0002_roles
Create Date: 2026-01-13

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0003_sorties"
down_revision = "0002_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sorties",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=256), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("project_id", "code", name="uq_sorties_project_code"),
    )
    op.create_index("ix_sorties_project_id", "sorties", ["project_id"], unique=False)
    op.create_index("ix_sorties_created_by_user_id", "sorties", ["created_by_user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_sorties_created_by_user_id", table_name="sorties")
    op.drop_index("ix_sorties_project_id", table_name="sorties")
    op.drop_table("sorties")




