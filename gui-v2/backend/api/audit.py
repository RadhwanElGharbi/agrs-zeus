"""
Project-scoped audit logging utilities.

Audit events are stored in Postgres in the `audit_events` table and are intended
to provide a durable trail of *meaningful user actions* that mutate project state.

The frontend consumes these via `GET /api/projects/{project}/audit`.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .db_models import AuditEvent, User
from .projects_db import upsert_project_row

ANALYTICS_DIR = Path("/opt/agrs/analytics")
ANALYTICS_DIR.mkdir(parents=True, exist_ok=True)

_SENSITIVE_KEY_PARTS = (
    "password",
    "secret",
    "token",
    "authorization",
    "api_key",
    "apikey",
    "access_key",
    "refresh_token",
    "cookie",
)


def _is_sensitive_key(key: str) -> bool:
    k = key.strip().lower()
    return any(part in k for part in _SENSITIVE_KEY_PARTS)


def _sanitize_payload(value: Any) -> Any:
    if isinstance(value, dict):
        out: Dict[str, Any] = {}
        for key, child in value.items():
            k = str(key)
            if _is_sensitive_key(k):
                out[k] = "[REDACTED]"
            else:
                out[k] = _sanitize_payload(child)
        return out
    if isinstance(value, list):
        return [_sanitize_payload(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_payload(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _coerce_iso_utc(value: Any) -> str:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value.strip():
        raw = value.strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
        except Exception:
            return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _actor_username(actor: Dict[str, Any]) -> str:
    return (
        str(actor.get("email") or actor.get("username") or actor.get("name") or actor.get("id") or "unknown").strip()
        or "unknown"
    )


def mirror_audit_event_to_operations(
    *,
    event_type: str,
    project_name: str,
    actor: Dict[str, Any],
    payload: Optional[Dict[str, Any]] = None,
    audit_event_id: Optional[Any] = None,
    actor_user_id: Optional[Any] = None,
    timestamp: Optional[Any] = None,
) -> None:
    """
    Best-effort mirror of audit events into analytics operations JSONL.

    This powers live operations monitoring in the desktop dashboard without
    changing the canonical Postgres audit trail.
    """
    ts_iso = _coerce_iso_utc(timestamp)
    date_str = ts_iso[:10]
    log_file = ANALYTICS_DIR / f"operations_{date_str}.jsonl"

    actor_id = actor_user_id or actor.get("id")
    record = {
        "timestamp": ts_iso,
        "source": "audit_events",
        "audit_event_id": str(audit_event_id) if audit_event_id is not None else None,
        "event_type": str(event_type or "").strip(),
        "project_name": str(project_name or "").strip(),
        "username": _actor_username(actor),
        "role": actor.get("role"),
        "actor_user_id": str(actor_id) if actor_id is not None else None,
        "payload": _sanitize_payload(payload or {}),
    }

    with log_file.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, default=str) + "\n")


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
        try:
            mirror_audit_event_to_operations(
                event_type=row.event_type,
                project_name=project_name,
                actor=actor,
                payload=row.payload if isinstance(row.payload, dict) else (payload or {}),
                audit_event_id=row.id,
                actor_user_id=row.actor_user_id,
                timestamp=row.ts,
            )
        except Exception:
            pass
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


