"""
Sorties API.

A Sortie represents a project-scoped collection session (field outing / flight / walkover)
that AOI/POI thread posts can reference for provenance.

Sorties are stored in Postgres (for indexing + linking) and mirrored to a canonical
project-scoped JSON file under:
  /opt/agrs/Projects/<project>/data/sorties/entries/<sortie_uuid>.json
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import require_auth
from .db import get_db
from .db_models import Sortie
from .project_utils import load_json_file, resolve_project_path
from .projects_db import upsert_project_row


router = APIRouter(tags=["sorties"])

SORTIE_SCHEMA_V1 = "agrs.sortie.v1"


# Best-effort geometry transform (WGS84 -> project CRS)
try:
    from pyproj import Transformer  # type: ignore

    HAS_PYPROJ = True
except Exception:
    HAS_PYPROJ = False


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _project_epsg(project_path: Path) -> int:
    meta = load_json_file(project_path / "project_metadata.json") or {}
    try:
        epsg = int(((meta.get("crs") or {}).get("epsg")) or (meta.get("crs_epsg") or 4326))
        return epsg
    except Exception:
        return 4326


def _sorties_root(project_path: Path) -> Path:
    return project_path / "data" / "sorties"


def _sortie_entry_path(project_path: Path, sortie_id: str) -> Path:
    return _sorties_root(project_path) / "entries" / f"{sortie_id}.json"


def _sortie_changelog_path(project_path: Path, sortie_id: str) -> Path:
    return _sorties_root(project_path) / "changelog" / f"{sortie_id}.jsonl"


def _ensure_sortie_dirs(project_path: Path) -> None:
    (_sorties_root(project_path) / "entries").mkdir(parents=True, exist_ok=True)
    (_sorties_root(project_path) / "changelog").mkdir(parents=True, exist_ok=True)


def _write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    tmp.replace(path)


def _append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _iter_xy(geom: Any) -> list[tuple[float, float]]:
    coords = (geom or {}).get("coordinates") if isinstance(geom, dict) else None
    out: list[tuple[float, float]] = []

    def walk(node: Any) -> None:
        if (
            isinstance(node, (list, tuple))
            and len(node) >= 2
            and isinstance(node[0], (int, float))
            and isinstance(node[1], (int, float))
        ):
            out.append((float(node[0]), float(node[1])))
            return
        if isinstance(node, (list, tuple)):
            for child in node:
                walk(child)

    walk(coords)
    return out


def _geometry_summary_wgs84(geom_wgs84: Optional[dict]) -> dict:
    if not isinstance(geom_wgs84, dict) or "type" not in geom_wgs84:
        return {"type": None, "vertex_count": 0, "bbox": None}
    pts = _iter_xy(geom_wgs84)
    if not pts:
        return {"type": geom_wgs84.get("type"), "vertex_count": 0, "bbox": None}
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    bbox = {"minx": min(xs), "miny": min(ys), "maxx": max(xs), "maxy": max(ys), "crs": "EPSG:4326"}
    return {"type": geom_wgs84.get("type"), "vertex_count": len(pts), "bbox": bbox}


def _transform_coords(coords: Any, transformer: Any) -> Any:
    if coords is None:
        return coords
    if isinstance(coords, (list, tuple)) and coords and isinstance(coords[0], (int, float)):
        if len(coords) < 2:
            return coords
        x, y = transformer.transform(coords[0], coords[1])
        if len(coords) > 2:
            return [x, y] + list(coords[2:])
        return [x, y]
    if isinstance(coords, list):
        return [_transform_coords(c, transformer) for c in coords]
    return coords


def _geometry_project_from_wgs84(geometry_wgs84: dict, project_epsg: int) -> dict:
    if not HAS_PYPROJ or project_epsg == 4326:
        return geometry_wgs84
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{project_epsg}", always_xy=True)
    out = dict(geometry_wgs84)
    if "coordinates" in out:
        out["coordinates"] = _transform_coords(out.get("coordinates"), transformer)
    return out


def _actor_payload(actor: Dict[str, Any]) -> dict:
    # Store a stable, minimal actor snapshot for audit.
    return {
        "id": actor.get("id"),
        "username": actor.get("username"),
        "name": actor.get("name") or actor.get("full_name"),
        "role": actor.get("role"),
        "company": actor.get("company") or actor.get("organization"),
        "organization": actor.get("organization"),
        "department": actor.get("department"),
        "position": actor.get("position"),
        "work_phone": actor.get("work_phone"),
        "superior_user_id": actor.get("superior_user_id"),
        "superior": actor.get("superior"),
        "email": actor.get("email"),
        "serial_number": actor.get("serial_number"),
    }


def _derive_status(existing: Optional[str], started_at: Optional[datetime], ended_at: Optional[datetime]) -> str:
    if isinstance(existing, str) and existing.strip():
        return existing.strip()
    now = datetime.now(timezone.utc)
    if ended_at and ended_at <= now:
        return "completed"
    if started_at and started_at > now:
        return "planned"
    if started_at and started_at <= now and not ended_at:
        return "active"
    return "planned"


def _build_sortie_document(
    *,
    project_name: str,
    project_id: str,
    sortie: Sortie,
    actor: Dict[str, Any],
    now_iso: str,
    project_epsg: int,
    metadata_input: Optional[Dict[str, Any]],
) -> dict:
    """
    Canonical v1 sortie document.

    Stored in:
    - Postgres: sorties.metadata (JSONB)
    - Filesystem: Projects/<project>/data/sorties/entries/<sortie_id>.json
    """
    incoming = metadata_input if isinstance(metadata_input, dict) else {}
    existing = sortie.metadata_ if isinstance(getattr(sortie, "metadata_", None), dict) else {}

    def section(key: str) -> dict:
        v = incoming.get(key)
        if isinstance(v, dict):
            return v
        v2 = existing.get(key)
        if isinstance(v2, dict):
            return v2
        return {}

    status_in = incoming.get("status") if isinstance(incoming.get("status"), str) else existing.get("status")
    status = _derive_status(status_in if isinstance(status_in, str) else None, sortie.started_at, sortie.ended_at)

    where_in = section("where")
    geom_wgs84 = where_in.get("geometry_wgs84") if isinstance(where_in, dict) else None
    if not isinstance(geom_wgs84, dict) or "type" not in geom_wgs84:
        geom_wgs84 = None
    geom_summary = _geometry_summary_wgs84(geom_wgs84)
    geom_project = _geometry_project_from_wgs84(geom_wgs84, project_epsg) if isinstance(geom_wgs84, dict) else None

    audit_existing = existing.get("audit") if isinstance(existing.get("audit"), dict) else {}
    created_at = audit_existing.get("created_at") if isinstance(audit_existing.get("created_at"), str) else None
    created_by = audit_existing.get("created_by") if isinstance(audit_existing.get("created_by"), dict) else None

    when_existing = section("when")

    doc = {
        "schema": SORTIE_SCHEMA_V1,
        "id": str(sortie.id),
        "project_name": project_name,
        "project_id": project_id,
        "code": sortie.code,
        "name": sortie.name,
        "status": status,
        "who": section("who"),
        "what": section("what"),
        "where": {
            **(where_in if isinstance(where_in, dict) else {}),
            "project_epsg": project_epsg,
            "geometry_wgs84": geom_wgs84,
            "geometry_project": geom_project,
            "geometry_summary_wgs84": geom_summary,
        },
        "when": {
            **(when_existing if isinstance(when_existing, dict) else {}),
            "started_at": sortie.started_at.isoformat() if sortie.started_at else None,
            "ended_at": sortie.ended_at.isoformat() if sortie.ended_at else None,
        },
        "why": section("why"),
        "notes": sortie.notes,
        "audit": {
            **(audit_existing if isinstance(audit_existing, dict) else {}),
            "created_at": created_at or now_iso,
            "created_by": created_by or _actor_payload(actor),
            "updated_at": now_iso,
            "updated_by": _actor_payload(actor),
        },
    }
    return doc


class SortieCreateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=128, description="Human Sortie ID / code")
    name: Optional[str] = Field(default=None, max_length=256)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SortieUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=256)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


def _to_sortie_payload(sortie: Sortie) -> Dict[str, Any]:
    return {
        "id": str(sortie.id),
        "project_id": str(sortie.project_id),
        "code": sortie.code,
        "name": sortie.name,
        "started_at": sortie.started_at.isoformat() if sortie.started_at else None,
        "ended_at": sortie.ended_at.isoformat() if sortie.ended_at else None,
        "notes": sortie.notes,
        "metadata": sortie.metadata_ if isinstance(sortie.metadata_, dict) else {},
        "created_by_user_id": str(sortie.created_by_user_id) if sortie.created_by_user_id else None,
        "created_at": sortie.created_at.isoformat() if getattr(sortie, "created_at", None) else None,
        "updated_at": sortie.updated_at.isoformat() if getattr(sortie, "updated_at", None) else None,
    }


@router.get("/projects/{project}/sorties")
def list_sorties(
    project: str,
    q: Optional[str] = Query(default=None, description="Search in code/name"),
    limit: int = Query(default=50, ge=1, le=200),
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    db_project = upsert_project_row(db, project)

    stmt = select(Sortie).where(Sortie.project_id == db_project.id).order_by(desc(Sortie.updated_at))

    q_norm = (q or "").strip()
    if q_norm:
        like = f"%{q_norm}%"
        stmt = stmt.where(or_(Sortie.code.ilike(like), Sortie.name.ilike(like)))

    rows = db.execute(stmt.limit(limit)).scalars().all()
    return {"project_name": project, "count": len(rows), "sorties": [_to_sortie_payload(s) for s in rows]}


@router.post("/projects/{project}/sorties")
def create_sortie(
    project: str,
    payload: SortieCreateRequest,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")

    db_project = upsert_project_row(db, project)

    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="code is required")

    if payload.started_at and payload.ended_at and payload.ended_at < payload.started_at:
        raise HTTPException(status_code=400, detail="ended_at must be >= started_at")

    created_by_user_id: Optional[uuid.UUID] = None
    try:
        if actor.get("id"):
            created_by_user_id = uuid.UUID(str(actor.get("id")))
    except Exception:
        created_by_user_id = None

    now_iso = _utc_now_iso()
    epsg = _project_epsg(project_path)

    sortie = Sortie(
        project_id=db_project.id,
        code=code,
        name=(payload.name or "").strip() or None,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
        notes=(payload.notes or "").strip() or None,
        metadata_={},  # filled after flush (requires id)
        created_by_user_id=created_by_user_id,
    )
    db.add(sortie)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Sortie code already exists for this project.") from exc

    doc = _build_sortie_document(
        project_name=project,
        project_id=str(db_project.id),
        sortie=sortie,
        actor=actor,
        now_iso=now_iso,
        project_epsg=epsg,
        metadata_input=payload.metadata,
    )
    sortie.metadata_ = doc

    _ensure_sortie_dirs(project_path)
    entry_path = _sortie_entry_path(project_path, str(sortie.id))
    _write_json_atomic(entry_path, doc)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            if entry_path.exists():
                entry_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to create sortie.") from exc

    db.refresh(sortie)

    # Best-effort changelog (do not fail request).
    try:
        _append_jsonl(
            _sortie_changelog_path(project_path, str(sortie.id)),
            {"ts": now_iso, "action": "create", "sortie_id": str(sortie.id), "actor": _actor_payload(actor), "document": doc},
        )
    except Exception:
        pass

    return _to_sortie_payload(sortie)


@router.get("/projects/{project}/sorties/{sortie_id}")
def get_sortie(
    project: str,
    sortie_id: str,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    db_project = upsert_project_row(db, project)

    try:
        sid = uuid.UUID(str(sortie_id))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid sortie_id") from exc

    sortie = db.execute(select(Sortie).where(Sortie.id == sid, Sortie.project_id == db_project.id)).scalar_one_or_none()
    if not sortie:
        raise HTTPException(status_code=404, detail="Sortie not found")
    return _to_sortie_payload(sortie)


@router.patch("/projects/{project}/sorties/{sortie_id}")
def update_sortie(
    project: str,
    sortie_id: str,
    payload: SortieUpdateRequest,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")

    db_project = upsert_project_row(db, project)

    try:
        sid = uuid.UUID(str(sortie_id))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid sortie_id") from exc

    sortie = db.execute(select(Sortie).where(Sortie.id == sid, Sortie.project_id == db_project.id)).scalar_one_or_none()
    if not sortie:
        raise HTTPException(status_code=404, detail="Sortie not found")

    fields = getattr(payload, "__fields_set__", set()) or set()
    if "name" in fields:
        sortie.name = (payload.name or "").strip() or None
    if "started_at" in fields:
        sortie.started_at = payload.started_at
    if "ended_at" in fields:
        sortie.ended_at = payload.ended_at
    if "notes" in fields:
        sortie.notes = (payload.notes or "").strip() or None

    if sortie.started_at and sortie.ended_at and sortie.ended_at < sortie.started_at:
        raise HTTPException(status_code=400, detail="ended_at must be >= started_at")

    now_iso = _utc_now_iso()
    epsg = _project_epsg(project_path)

    metadata_input = payload.metadata if "metadata" in fields else None
    doc = _build_sortie_document(
        project_name=project,
        project_id=str(db_project.id),
        sortie=sortie,
        actor=actor,
        now_iso=now_iso,
        project_epsg=epsg,
        metadata_input=metadata_input,
    )
    sortie.metadata_ = doc

    _ensure_sortie_dirs(project_path)
    entry_path = _sortie_entry_path(project_path, str(sortie.id))
    previous_bytes: Optional[bytes] = None
    try:
        if entry_path.exists():
            previous_bytes = entry_path.read_bytes()
    except Exception:
        previous_bytes = None
    _write_json_atomic(entry_path, doc)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            if previous_bytes is not None:
                entry_path.write_bytes(previous_bytes)
            elif entry_path.exists():
                entry_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to update sortie.") from exc

    db.refresh(sortie)
    try:
        _append_jsonl(
            _sortie_changelog_path(project_path, str(sortie.id)),
            {"ts": now_iso, "action": "update", "sortie_id": str(sortie.id), "actor": _actor_payload(actor), "document": doc},
        )
    except Exception:
        pass

    return _to_sortie_payload(sortie)


@router.delete("/projects/{project}/sorties/{sortie_id}")
def archive_sortie(
    project: str,
    sortie_id: str,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Soft-delete: archive a sortie by setting status=archived in the canonical document.
    """
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")

    db_project = upsert_project_row(db, project)

    try:
        sid = uuid.UUID(str(sortie_id))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid sortie_id") from exc

    sortie = db.execute(select(Sortie).where(Sortie.id == sid, Sortie.project_id == db_project.id)).scalar_one_or_none()
    if not sortie:
        raise HTTPException(status_code=404, detail="Sortie not found")

    now_iso = _utc_now_iso()
    epsg = _project_epsg(project_path)

    doc = _build_sortie_document(
        project_name=project,
        project_id=str(db_project.id),
        sortie=sortie,
        actor=actor,
        now_iso=now_iso,
        project_epsg=epsg,
        metadata_input=sortie.metadata_ if isinstance(sortie.metadata_, dict) else {},
    )
    doc["status"] = "archived"
    audit = doc.get("audit") if isinstance(doc.get("audit"), dict) else {}
    audit["archived_at"] = now_iso
    audit["archived_by"] = _actor_payload(actor)
    doc["audit"] = audit
    sortie.metadata_ = doc

    _ensure_sortie_dirs(project_path)
    entry_path = _sortie_entry_path(project_path, str(sortie.id))
    previous_bytes: Optional[bytes] = None
    try:
        if entry_path.exists():
            previous_bytes = entry_path.read_bytes()
    except Exception:
        previous_bytes = None
    _write_json_atomic(entry_path, doc)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            if previous_bytes is not None:
                entry_path.write_bytes(previous_bytes)
            elif entry_path.exists():
                entry_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Failed to archive sortie.") from exc

    db.refresh(sortie)
    try:
        _append_jsonl(
            _sortie_changelog_path(project_path, str(sortie.id)),
            {"ts": now_iso, "action": "archive", "sortie_id": str(sortie.id), "actor": _actor_payload(actor), "document": doc},
        )
    except Exception:
        pass

    return _to_sortie_payload(sortie)




