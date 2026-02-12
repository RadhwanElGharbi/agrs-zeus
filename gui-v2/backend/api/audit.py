"""
Project-scoped audit logging utilities.

Audit events are stored in Postgres in the `audit_events` table and are intended
to provide a durable trail of *meaningful user actions* that mutate project state.

The frontend consumes these via `GET /api/projects/{project}/audit`.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .db_models import AuditEvent, User
from .projects_db import upsert_project_row


def _resolve_actor_user_id(db: Session, actor: Dict[str, Any]) -> uuid.UUID:
    """
    Resolve the authenticated actor to a DB `users.id` UUID.

    `require_auth()` normally includes `id`, but some legacy/demo sessions may only
    include `email` / `username`. We best-effort look up the DB user in that case.
    """

    raw_id = actor.get("id")
    if raw_id:
        try:
            return uuid.UUID(str(raw_id))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid actor id") from exc

    email = (actor.get("email") or actor.get("username") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Authenticated user identity missing (no id/email).")

    row = db.query(User).filter(User.email == email).one_or_none()
    if not row:
        raise HTTPException(status_code=401, detail="Authenticated user not found in DB.")
    return row.id


def write_audit_event(
    db: Session,
    *,
    project_name: str,
    actor: Dict[str, Any],
    event_type: str,
    payload: Optional[Dict[str, Any]] = None,
    required: bool = True,
) -> Optional[str]:
    """
    Write a project-scoped audit event.

    If `required` is True, raises an HTTPException on failure.
    If `required` is False, failures are swallowed (best-effort logging).
    """

    try:
        row = build_audit_event(
            db,
            project_name=project_name,
            actor=actor,
            event_type=event_type,
            payload=payload,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return str(row.id)
    except HTTPException:
        if required:
            raise
        try:
            db.rollback()
        except Exception:
            pass
        return None
    except SQLAlchemyError as exc:
        try:
            db.rollback()
        except Exception:
            pass
        if required:
            raise HTTPException(status_code=500, detail=f"Failed to write audit event: {exc}") from exc
        return None
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        if required:
            raise HTTPException(status_code=500, detail=f"Failed to write audit event: {exc}") from exc
        return None


def build_audit_event(
    db: Session,
    *,
    project_name: str,
    actor: Dict[str, Any],
    event_type: str,
    payload: Optional[Dict[str, Any]] = None,
) -> AuditEvent:
    """
    Construct an `AuditEvent` ORM row *without committing*.

    Use this when you want the audit event to be committed atomically with other
    DB writes in the same transaction.
    """

    if not isinstance(event_type, str) or not event_type.strip():
        raise HTTPException(status_code=400, detail="event_type is required")
    event_type_norm = event_type.strip()

    actor_user_id = _resolve_actor_user_id(db, actor)
    db_project = upsert_project_row(db, project_name)

    return AuditEvent(
        actor_user_id=actor_user_id,
        project_id=db_project.id,
        event_type=event_type_norm,
        payload=payload or {},
    )


