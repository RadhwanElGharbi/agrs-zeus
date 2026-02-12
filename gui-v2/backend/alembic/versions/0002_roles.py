"""Placeholder revision to satisfy Alembic history.

Revision ID: 0002_roles
Revises: None
Create Date: 2026-01-13

Why this exists:
`0003_sorties` references `0002_roles` as its parent revision, but that migration
file was missing. Alembic fails to start when the revision graph is incomplete
(even if the DB is already at the latest revision), which prevents the ZEUS
backend from launching via `scripts/agrs-control.sh` (it runs `alembic upgrade`).

This placeholder is intentionally a no-op so it is safe to apply to an existing
database that is already at `0003_sorties`.
"""

from __future__ import annotations


revision = "0002_roles"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op placeholder.
    return None


def downgrade() -> None:
    # No-op placeholder.
    return None








