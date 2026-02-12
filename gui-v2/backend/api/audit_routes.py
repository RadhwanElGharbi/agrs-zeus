"""
Audit API routes (project-scoped).

Frontend consumer:
- `gui-v2/frontend/src/components/Project/ProjectAuditDialog.tsx`
- `gui-v2/frontend/src/lib/api/dataClient.ts` (`fetchProjectAudit`)
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from .audit import write_audit_event
from .auth import require_auth
from .db import get_db
from .db_models import AuditEvent, User
from .projects_db import upsert_project_row


router = APIRouter(tags=["audit"])


class AuditWriteRequest(BaseModel):
    event_type: str = Field(min_length=1, max_length=128)
    payload: Dict[str, Any] = Field(default_factory=dict)


@router.get("/projects/{project_name}/audit")
def get_project_audit(
    project_name: str,
    user_id: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Return project-scoped audit events from Postgres.

    Output shape matches frontend expectation (`AuditEventRow` + pagination fields).
    """

    db_project = upsert_project_row(db, project_name)

    filters = [AuditEvent.project_id == db_project.id]
    if user_id:
        try:
            uid = uuid.UUID(str(user_id))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid user_id") from exc
        filters.append(AuditEvent.actor_user_id == uid)
    if event_type:
        filters.append(AuditEvent.event_type == event_type)

    count = db.scalar(select(func.count()).select_from(AuditEvent).where(*filters)) or 0

    stmt = (
        select(AuditEvent, User)
        .join(User, User.id == AuditEvent.actor_user_id)
        .where(*filters)
        .order_by(desc(AuditEvent.ts))
        .limit(limit)
        .offset(offset)
    )

    rows = db.execute(stmt).all()
    events = []
    for ev, u in rows:
        events.append(
            {
                "id": str(ev.id),
                "ts": ev.ts.isoformat() if ev.ts else None,
                "event_type": ev.event_type,
                "payload": ev.payload or {},
                "actor": {
                    "id": str(u.id),
                    "email": u.email,
                    "serial_number": u.serial_number,
                    "full_name": u.full_name,
                    "role": u.role,
                },
            }
        )

    return {
        "project_name": project_name,
        "user_id": str(actor.get("id") or ""),
        "events": events,
        "count": int(count),
        "limit": int(limit),
        "offset": int(offset),
    }


@router.post("/projects/{project_name}/audit")
def post_project_audit_event(
    project_name: str,
    body: AuditWriteRequest,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Explicit audit event ingress endpoint.

    This is intended for client-side actions that don't naturally hit a state-changing
    backend endpoint (e.g., a purely client-side toggle) but still need to be audited.
    """

    event_id = write_audit_event(
        db,
        project_name=project_name,
        actor=actor,
        event_type=body.event_type,
        payload=body.payload,
        required=True,
    )
    return {"ok": True, "id": event_id}














