"""
DB helpers for filesystem-backed projects.

This keeps the filesystem as the source of project metadata, while ensuring
there is a canonical Postgres row for membership + audit joins.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import Project
from .project_utils import load_json_file, resolve_project_path


def infer_project_id(project_path: Path, project_name: str) -> str:
    """
    Read project_id from project_metadata.json if present, otherwise fall back to a deterministic id.
    """
    metadata_file = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_file) if metadata_file.exists() else None
    if isinstance(metadata, dict):
        pid = metadata.get("project_id")
        if isinstance(pid, str) and pid.strip():
            return pid.strip()
    return f"FS_{project_name}"


def upsert_project_row(db: Session, project_name: str) -> Project:
    """
    Ensure there is a DB row for the filesystem project.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    pid = infer_project_id(project_path, project_name)
    row = db.execute(select(Project).where(Project.project_name == project_name)).scalar_one_or_none()
    if row:
        # Keep DB in sync if the filesystem project_id changes.
        if row.project_id != pid:
            row.project_id = pid
            db.commit()
            db.refresh(row)
        return row

    row = Project(project_name=project_name, project_id=pid)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


















