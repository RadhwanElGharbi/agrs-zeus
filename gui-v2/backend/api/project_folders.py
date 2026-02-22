"""
Project Folders & Visibility API for AGRS ZEUS.

Superadmin-only endpoints for organising projects into folders
and controlling per-project visibility.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import require_auth
from .db import get_db
from .db_models import Project, ProjectFolder, ProjectMembership, User
from .projects_db import upsert_project_row

router = APIRouter(tags=["project-folders"])


def _require_superadmin(user: Dict[str, Any] = Depends(require_auth)) -> Dict[str, Any]:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class FolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    color: Optional[str] = Field(default=None, max_length=32)
    position: int = Field(default=0)


class FolderUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=128)
    color: Optional[str] = Field(default=None, max_length=32)
    position: Optional[int] = None


class FolderResponse(BaseModel):
    id: str
    name: str
    color: Optional[str] = None
    position: int
    project_count: int = 0


class ProjectFolderAssignRequest(BaseModel):
    folder_id: Optional[str] = None


class ProjectVisibilityRequest(BaseModel):
    visibility: str = Field(pattern=r"^(public|restricted)$")


# ---------------------------------------------------------------------------
# Folder CRUD
# ---------------------------------------------------------------------------

@router.get("/project-folders", response_model=List[FolderResponse])
def list_folders(
    _: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(
            ProjectFolder.id,
            ProjectFolder.name,
            ProjectFolder.color,
            ProjectFolder.position,
            func.count(Project.id).label("project_count"),
        )
        .outerjoin(Project, Project.folder_id == ProjectFolder.id)
        .group_by(
            ProjectFolder.id,
            ProjectFolder.name,
            ProjectFolder.color,
            ProjectFolder.position,
        )
        .order_by(ProjectFolder.position.asc(), ProjectFolder.name.asc())
    ).all()

    return [
        FolderResponse(
            id=str(folder_id),
            name=name,
            color=color,
            position=position,
            project_count=count,
        )
        for folder_id, name, color, position, count in rows
    ]


@router.post("/project-folders", status_code=201, response_model=FolderResponse)
def create_folder(
    payload: FolderCreateRequest,
    actor: Dict[str, Any] = Depends(_require_superadmin),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    if db.execute(select(ProjectFolder.id).where(func.lower(ProjectFolder.name) == name.lower())).first():
        raise HTTPException(status_code=409, detail="Folder name already exists")

    actor_id: Optional[uuid.UUID] = None
    try:
        actor_id = uuid.UUID(str(actor.get("id")))
    except Exception:
        pass

    folder = ProjectFolder(
        name=name,
        color=payload.color,
        position=payload.position,
        created_by_user_id=actor_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    return FolderResponse(
        id=str(folder.id),
        name=folder.name,
        color=folder.color,
        position=folder.position,
        project_count=0,
    )


@router.patch("/project-folders/{folder_id}", response_model=FolderResponse)
def update_folder(
    folder_id: str,
    payload: FolderUpdateRequest,
    _: Dict[str, Any] = Depends(_require_superadmin),
    db: Session = Depends(get_db),
):
    try:
        fid = uuid.UUID(folder_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid folder id") from exc

    folder = db.execute(select(ProjectFolder).where(ProjectFolder.id == fid)).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if payload.name is not None:
        name = payload.name.strip()
        conflict = db.execute(
            select(ProjectFolder.id).where(func.lower(ProjectFolder.name) == name.lower(), ProjectFolder.id != fid)
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Folder name already exists")
        folder.name = name
    if payload.color is not None:
        folder.color = payload.color
    if payload.position is not None:
        folder.position = payload.position

    db.commit()
    db.refresh(folder)

    count = db.scalar(select(func.count(Project.id)).where(Project.folder_id == fid)) or 0

    return FolderResponse(
        id=str(folder.id),
        name=folder.name,
        color=folder.color,
        position=folder.position,
        project_count=count,
    )


@router.delete("/project-folders/{folder_id}", status_code=204)
def delete_folder(
    folder_id: str,
    _: Dict[str, Any] = Depends(_require_superadmin),
    db: Session = Depends(get_db),
):
    try:
        fid = uuid.UUID(folder_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid folder id") from exc

    folder = db.execute(select(ProjectFolder).where(ProjectFolder.id == fid)).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    db.delete(folder)
    db.commit()


# ---------------------------------------------------------------------------
# Project folder assignment & visibility
# ---------------------------------------------------------------------------

@router.put("/projects/{project_name}/folder")
def assign_project_folder(
    project_name: str,
    payload: ProjectFolderAssignRequest,
    _: Dict[str, Any] = Depends(_require_superadmin),
    db: Session = Depends(get_db),
):
    db_project = upsert_project_row(db, project_name)

    if payload.folder_id:
        try:
            fid = uuid.UUID(payload.folder_id)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid folder id") from exc
        folder = db.execute(select(ProjectFolder).where(ProjectFolder.id == fid)).scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        db_project.folder_id = fid
    else:
        db_project.folder_id = None

    db.commit()
    db.refresh(db_project)

    folder_name = None
    if db_project.folder_id and db_project.folder:
        folder_name = db_project.folder.name

    return {
        "project_name": db_project.project_name,
        "folder_id": str(db_project.folder_id) if db_project.folder_id else None,
        "folder_name": folder_name,
    }


@router.put("/projects/{project_name}/visibility")
def set_project_visibility(
    project_name: str,
    payload: ProjectVisibilityRequest,
    _: Dict[str, Any] = Depends(_require_superadmin),
    db: Session = Depends(get_db),
):
    db_project = upsert_project_row(db, project_name)
    db_project.visibility = payload.visibility
    db.commit()
    db.refresh(db_project)

    return {
        "project_name": db_project.project_name,
        "visibility": db_project.visibility,
    }


# ---------------------------------------------------------------------------
# Bulk org-info lookup (used internally by list_projects)
# ---------------------------------------------------------------------------

def get_project_org_map(db: Session) -> Dict[str, Dict[str, Any]]:
    """
    Return {project_name: {folder_id, folder_name, folder_color, visibility}} for all
    DB-tracked projects.
    """
    rows = db.execute(
        select(Project, ProjectFolder)
        .outerjoin(ProjectFolder, Project.folder_id == ProjectFolder.id)
    ).all()

    result: Dict[str, Dict[str, Any]] = {}
    for proj, folder in rows:
        result[proj.project_name] = {
            "folder_id": str(proj.folder_id) if proj.folder_id else None,
            "folder_name": folder.name if folder else None,
            "folder_color": folder.color if folder else None,
            "visibility": proj.visibility or "public",
        }
    return result


def get_user_project_names(db: Session, user_id: uuid.UUID) -> set[str]:
    """Return the set of project_names the user is an active member of."""
    rows = db.execute(
        select(Project.project_name)
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .where(ProjectMembership.user_id == user_id, ProjectMembership.left_at.is_(None))
    ).scalars().all()
    return set(rows)
