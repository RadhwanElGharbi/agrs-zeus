"""Add project_folders table and folder_id/visibility columns to projects.

Revision ID: 0005_project_folders
Revises: 0004_user_settings
Create Date: 2026-02-20

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_project_folders"
down_revision = "0004_user_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False, unique=True),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
    )

    op.add_column("projects", sa.Column("folder_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("projects", sa.Column("visibility", sa.String(length=32), nullable=False, server_default="public"))
    op.create_foreign_key(
        "fk_projects_folder_id",
        "projects",
        "project_folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_projects_folder_id", "projects", ["folder_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_projects_folder_id", table_name="projects")
    op.drop_constraint("fk_projects_folder_id", "projects", type_="foreignkey")
    op.drop_column("projects", "visibility")
    op.drop_column("projects", "folder_id")
    op.drop_table("project_folders")
