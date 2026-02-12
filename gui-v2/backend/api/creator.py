"""
Creator Mode (AOI/POI) API

File-backed AOI/POI annotations with attachments and changelog, stored under:
  /opt/agrs/Projects/{project}/data/creator/

This module was previously a stub; ZEUS backend startup imports `router` from here.
"""

from __future__ import annotations

import copy
import json
import mimetypes
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user, require_auth
from .audit import write_audit_event
from .db import get_db
from .db_models import Sortie
from .project_utils import load_json_file, resolve_project_path

try:
    from pyproj import Transformer

    HAS_PYPROJ = True
except Exception:
    HAS_PYPROJ = False


router = APIRouter()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _actor_payload(actor: Dict[str, Any]) -> Dict[str, Any]:
    """
    Store a stable, minimal actor snapshot for thread/audit records.
    """

    if not isinstance(actor, dict):
        return {}
    return {
        "id": actor.get("id"),
        "email": actor.get("email"),
        "serial_number": actor.get("serial_number"),
        "username": actor.get("username"),
        "name": actor.get("name"),
        "full_name": actor.get("full_name"),
        "role": actor.get("role"),
        "company": actor.get("company") or actor.get("organization"),
        "organization": actor.get("organization"),
        "department": actor.get("department"),
        "position": actor.get("position"),
    }


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


def _geometry_summary_wgs84(geom_wgs84: Any) -> Dict[str, Any]:
    if not isinstance(geom_wgs84, dict) or "type" not in geom_wgs84:
        return {"type": None, "vertex_count": 0, "bbox": None}
    pts = _iter_xy(geom_wgs84)
    if not pts:
        return {"type": geom_wgs84.get("type"), "vertex_count": 0, "bbox": None}
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    bbox = {"minx": min(xs), "miny": min(ys), "maxx": max(xs), "maxy": max(ys), "crs": "EPSG:4326"}
    return {"type": geom_wgs84.get("type"), "vertex_count": len(pts), "bbox": bbox}


def _safe_filename(name: str) -> str:
    # Keep it simple: strip path separators and control chars.
    name = (name or "").strip()
    name = name.replace("\\", "_").replace("/", "_")
    name = re.sub(r"[\x00-\x1f\x7f]", "_", name)
    return name or f"file-{uuid4().hex[:8]}"


def _get_project_epsg(project_path: Path) -> int:
    meta = load_json_file(project_path / "project_metadata.json") or {}
    try:
        epsg = int(((meta.get("crs") or {}).get("epsg")) or 4326)
        return epsg
    except Exception:
        return 4326


def _transform_coords(coords: Any, transformer: Any) -> Any:
    """
    Transform a nested GeoJSON coordinates array.
    Preserves extra dimensions if present.
    """
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


def _creator_root(project_path: Path) -> Path:
    return project_path / "data" / "creator"


def _entry_path(project_path: Path, entry_id: str) -> Path:
    return _creator_root(project_path) / "entries" / f"{entry_id}.json"


def _changelog_path(project_path: Path, entry_id: str) -> Path:
    return _creator_root(project_path) / "changelog" / f"{entry_id}.jsonl"


def _attachments_dir(project_path: Path, entry_id: str) -> Path:
    return _creator_root(project_path) / "attachments" / entry_id


def _load_entry(project_path: Path, entry_id: str) -> dict:
    path = _entry_path(project_path, entry_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Creator entry not found.")
    data = load_json_file(path)
    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail="Creator entry is corrupt.")
    return data


def _write_entry(project_path: Path, entry: dict) -> None:
    path = _entry_path(project_path, entry["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(entry, f, indent=2, ensure_ascii=False)
    tmp.replace(path)


def _append_changelog(project_path: Path, entry_id: str, record: dict) -> None:
    path = _changelog_path(project_path, entry_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _sortie_dict(db: Optional[Session], sortie_id: Optional[str]) -> Optional[dict]:
    if not db or not sortie_id:
        return None
    try:
        sid = UUID(str(sortie_id))
    except Exception:
        return None
    row = db.execute(select(Sortie).where(Sortie.id == sid)).scalar_one_or_none()
    if not row:
        return None
    return {
        "id": str(row.id),
        "code": row.code,
        "name": row.name,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "ended_at": row.ended_at.isoformat() if row.ended_at else None,
    }


def _parse_json_maybe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return json.loads(s)
        except Exception:
            return None
    return None


def _attachments_from_uploads(
    project_path: Path,
    entry_id: str,
    uploads: Optional[List[UploadFile]],
) -> List[dict]:
    if not uploads:
        return []
    out: List[dict] = []
    adir = _attachments_dir(project_path, entry_id)
    adir.mkdir(parents=True, exist_ok=True)

    for upload in uploads:
        if not upload:
            continue
        filename = _safe_filename(getattr(upload, "filename", "") or "")
        dst = adir / filename
        try:
            with open(dst, "wb") as f:
                shutil.copyfileobj(upload.file, f)
        finally:
            try:
                upload.file.close()
            except Exception:
                pass

        size = 0
        try:
            size = dst.stat().st_size
        except Exception:
            size = 0

        mime = getattr(upload, "content_type", None) or mimetypes.guess_type(filename)[0] or "application/octet-stream"
        out.append(
            {
                "filename": filename,
                "path": str(dst.relative_to(project_path)),
                "size_bytes": int(size),
                "mime": mime,
                "uploaded_at": _utc_now_iso(),
            }
        )

    return out


def _remove_attachments(project_path: Path, entry_id: str, filenames: List[str]) -> None:
    if not filenames:
        return
    adir = _attachments_dir(project_path, entry_id)
    for name in filenames:
        safe = _safe_filename(name)
        p = adir / safe
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass


async def create_creator_entry(
    project: str,
    entry_type: str,
    title: str,
    category: str,
    category_other: Optional[str],
    comment: Optional[str],
    datasets: Optional[str],
    sortie_id: Optional[str],
    survey_json: Optional[str],
    dataset_features_json: Optional[str],
    geometry_wgs84: str,
    attachments: Optional[List[UploadFile]],
    user: Dict[str, Any],
    db: Session,
) -> dict:
    project_path = resolve_project_path(project)
    if not project_path:
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")

    project_epsg = _get_project_epsg(project_path)
    try:
        geom_wgs = json.loads(geometry_wgs84)
        if not isinstance(geom_wgs, dict) or "type" not in geom_wgs:
            raise ValueError("Invalid geometry")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid geometry_wgs84") from exc

    entry_id = uuid4().hex
    now = _utc_now_iso()
    datasets_parsed = _parse_json_maybe(datasets)
    survey_parsed = _parse_json_maybe(survey_json) or {}
    dataset_features_parsed = _parse_json_maybe(dataset_features_json) or []

    entry = {
        "id": entry_id,
        "type": entry_type,
        "status": "active",
        "project_name": project,
        "project_epsg": project_epsg,
        "title": title,
        "category": category,
        "category_other": category_other,
        "comment": comment or "",
        "datasets": datasets_parsed or [],
        "survey": survey_parsed or {},
        "dataset_features": dataset_features_parsed or [],
        "geometry_wgs84": geom_wgs,
        "geometry_project": _geometry_project_from_wgs84(geom_wgs, project_epsg),
        "attachments": [],
        "created_at": now,
        "created_by": user or {},
        "updated_at": now,
        "updated_by": user or {},
        "deleted_at": None,
        "deleted_by": None,
        "sortie_id": (sortie_id.strip() if isinstance(sortie_id, str) and sortie_id.strip() else None),
    }

    entry["attachments"] = _attachments_from_uploads(project_path, entry_id, attachments)
    _write_entry(project_path, entry)

    attachments_added = [a.get("filename") for a in (entry.get("attachments") or []) if isinstance(a, dict) and a.get("filename")]
    changes_fields: List[dict] = []
    if (entry.get("comment") or "").strip():
        changes_fields.append({"field": "comment", "from": "", "to": entry.get("comment")})

    changelog_record = {
        "timestamp": now,
        "action": "create",
        "entry_id": entry_id,
        "actor": _actor_payload(user or {}),
        "changes": {
            "fields": changes_fields,
            "attachments_added": attachments_added,
            "attachments_removed": [],
            "geometry": {"after": _geometry_summary_wgs84(entry.get("geometry_wgs84"))},
        },
        "sortie": _sortie_dict(db, sortie_id),
        "survey": survey_parsed or {},
        "dataset_features": dataset_features_parsed or [],
    }
    _append_changelog(project_path, entry_id, changelog_record)

    # DB audit event (project-scoped)
    write_audit_event(
        db,
        project_name=project,
        actor=user or {},
        event_type="creator.entry.create",
        payload={
            "entry_id": entry_id,
            "entry_type": entry_type,
            "title": title,
            "category": category,
            "attachments_added": attachments_added,
            "geometry_summary_wgs84": _geometry_summary_wgs84(entry.get("geometry_wgs84")),
        },
        required=True,
    )
    return entry


async def update_creator_entry(
    project: str,
    entry_id: str,
    title: Optional[str],
    category: Optional[str],
    category_other: Optional[str],
    comment: Optional[str],
    datasets: Optional[str],
    sortie_id: Optional[str],
    survey_json: Optional[str],
    dataset_features_json: Optional[str],
    geometry_wgs84: Optional[str],
    remove_attachments: Optional[str],
    attachments: Optional[List[UploadFile]],
    user: Dict[str, Any],
    db: Session,
) -> dict:
    project_path = resolve_project_path(project)
    if not project_path:
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")

    entry = _load_entry(project_path, entry_id)
    before_entry = copy.deepcopy(entry)
    if entry.get("status") == "deleted":
        raise HTTPException(status_code=400, detail="Cannot update a deleted entry.")

    project_epsg = _get_project_epsg(project_path)
    now = _utc_now_iso()

    if isinstance(title, str) and title.strip():
        entry["title"] = title
    if isinstance(category, str) and category.strip():
        entry["category"] = category
    if category_other is not None:
        entry["category_other"] = category_other
    if comment is not None:
        entry["comment"] = comment

    datasets_parsed = _parse_json_maybe(datasets)
    if datasets_parsed is not None:
        entry["datasets"] = datasets_parsed

    survey_parsed = _parse_json_maybe(survey_json)
    if isinstance(survey_parsed, dict):
        entry["survey"] = survey_parsed

    dataset_features_parsed = _parse_json_maybe(dataset_features_json)
    if isinstance(dataset_features_parsed, list):
        entry["dataset_features"] = dataset_features_parsed

    if geometry_wgs84 is not None:
        try:
            geom_wgs = json.loads(geometry_wgs84)
            if not isinstance(geom_wgs, dict) or "type" not in geom_wgs:
                raise ValueError("Invalid geometry")
            entry["geometry_wgs84"] = geom_wgs
            entry["geometry_project"] = _geometry_project_from_wgs84(geom_wgs, project_epsg)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid geometry_wgs84") from exc

    if sortie_id is not None:
        entry["sortie_id"] = sortie_id.strip() if isinstance(sortie_id, str) and sortie_id.strip() else None

    attachments_removed: List[str] = []
    remove_list = _parse_json_maybe(remove_attachments)
    if isinstance(remove_list, list) and remove_list:
        attachments_removed = [str(x) for x in remove_list]
        _remove_attachments(project_path, entry_id, attachments_removed)
        entry["attachments"] = [a for a in (entry.get("attachments") or []) if a.get("filename") not in set(attachments_removed)]

    new_attachments = _attachments_from_uploads(project_path, entry_id, attachments)
    if new_attachments:
        entry["attachments"] = (entry.get("attachments") or []) + new_attachments

    entry["updated_at"] = now
    entry["updated_by"] = user or {}
    _write_entry(project_path, entry)

    attachments_added = [a.get("filename") for a in (new_attachments or []) if isinstance(a, dict) and a.get("filename")]

    changes_fields: List[dict] = []
    for key in ("title", "category", "category_other", "sortie_id", "status"):
        if before_entry.get(key) != entry.get(key):
            changes_fields.append({"field": key, "from": before_entry.get(key), "to": entry.get(key)})

    if comment is not None:
        # Thread semantics: treat an incoming comment as a new post (we store it in `to` for UI rendering).
        changes_fields.append({"field": "comment", "from": before_entry.get("comment"), "to": comment})

    if datasets_parsed is not None and before_entry.get("datasets") != entry.get("datasets"):
        changes_fields.append({"field": "datasets", "from": before_entry.get("datasets"), "to": entry.get("datasets")})
    if isinstance(survey_parsed, dict) and before_entry.get("survey") != entry.get("survey"):
        changes_fields.append({"field": "survey", "from": before_entry.get("survey"), "to": entry.get("survey")})
    if isinstance(dataset_features_parsed, list) and before_entry.get("dataset_features") != entry.get("dataset_features"):
        changes_fields.append(
            {"field": "dataset_features", "from": before_entry.get("dataset_features"), "to": entry.get("dataset_features")}
        )

    geom_before = _geometry_summary_wgs84(before_entry.get("geometry_wgs84"))
    geom_after = _geometry_summary_wgs84(entry.get("geometry_wgs84"))
    geom_changed = geom_before != geom_after

    changes: Dict[str, Any] = {
        "fields": changes_fields,
        "attachments_added": attachments_added,
        "attachments_removed": attachments_removed,
    }
    if geom_changed:
        changes["geometry"] = {"before": geom_before, "after": geom_after}

    changelog_record = {
        "timestamp": now,
        "action": "update",
        "entry_id": entry_id,
        "actor": _actor_payload(user or {}),
        "changes": changes,
        "sortie": _sortie_dict(db, entry.get("sortie_id")),
        "survey": entry.get("survey") or {},
        "dataset_features": entry.get("dataset_features") or [],
    }
    _append_changelog(project_path, entry_id, changelog_record)

    write_audit_event(
        db,
        project_name=project,
        actor=user or {},
        event_type="creator.entry.update",
        payload={
            "entry_id": entry_id,
            "changed_fields": [f.get("field") for f in changes_fields if isinstance(f, dict) and f.get("field")],
            "attachments_added": attachments_added,
            "attachments_removed": attachments_removed,
            "geometry_changed": bool(geom_changed),
        },
        required=True,
    )
    return entry


async def delete_creator_entry(project: str, entry_id: str, user: Dict[str, Any], db: Session) -> dict:
    project_path = resolve_project_path(project)
    if not project_path:
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")

    entry = _load_entry(project_path, entry_id)
    before_entry = copy.deepcopy(entry)
    if entry.get("status") == "deleted":
        return entry

    now = _utc_now_iso()
    entry["status"] = "deleted"
    entry["deleted_at"] = now
    entry["deleted_by"] = user or {}
    entry["updated_at"] = now
    entry["updated_by"] = user or {}
    _write_entry(project_path, entry)

    changes_fields: List[dict] = []
    if before_entry.get("status") != entry.get("status"):
        changes_fields.append({"field": "status", "from": before_entry.get("status"), "to": entry.get("status")})
    changes_fields.append({"field": "deleted_at", "from": before_entry.get("deleted_at"), "to": now})

    changelog_record = {
        "timestamp": now,
        "action": "delete",
        "entry_id": entry_id,
        "actor": _actor_payload(user or {}),
        "changes": {"fields": changes_fields, "attachments_added": [], "attachments_removed": []},
        "sortie": _sortie_dict(db, entry.get("sortie_id")),
        "survey": entry.get("survey") or {},
        "dataset_features": entry.get("dataset_features") or [],
    }
    _append_changelog(project_path, entry_id, changelog_record)

    write_audit_event(
        db,
        project_name=project,
        actor=user or {},
        event_type="creator.entry.delete",
        payload={"entry_id": entry_id},
        required=True,
    )
    return entry


async def get_creator_geojson(project: str, include_deleted: bool = False) -> dict:
    project_path = resolve_project_path(project)
    if not project_path:
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")

    entries_dir = _creator_root(project_path) / "entries"
    features: List[dict] = []
    if entries_dir.exists():
        for p in entries_dir.glob("*.json"):
            data = load_json_file(p)
            if not isinstance(data, dict):
                continue
            if not include_deleted and data.get("status") == "deleted":
                continue
            geom = data.get("geometry_wgs84")
            if not isinstance(geom, dict) or "type" not in geom:
                continue
            props = {
                "creator_id": data.get("id"),
                "creator_type": data.get("type"),
                "title": data.get("title"),
                "category": data.get("category"),
                "category_other": data.get("category_other"),
                "comment": data.get("comment"),
                "datasets": data.get("datasets") or [],
                "status": data.get("status"),
                "created_at": data.get("created_at"),
                "updated_at": data.get("updated_at"),
                "created_by": (data.get("created_by") or {}).get("username"),
                "updated_by": (data.get("updated_by") or {}).get("username"),
                "sortie_id": data.get("sortie_id"),
            }
            features.append(
                {
                    "type": "Feature",
                    "id": data.get("id"),
                    "geometry": geom,
                    "properties": props,
                }
            )

    return {"type": "FeatureCollection", "features": features}


async def get_creator_changelog(project: str, entry_id: str) -> list[dict]:
    project_path = resolve_project_path(project)
    if not project_path:
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")
    path = _changelog_path(project_path, entry_id)
    if not path.exists():
        return []
    out: List[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    return out


# ============================================================================
# HTTP endpoints (mounted under /api via main.py)
# ============================================================================


@router.get("/projects/{project}/creator/geojson")
async def api_get_creator_geojson(
    project: str,
    include_deleted: bool = Query(False),
    _user: Optional[Dict[str, Any]] = Depends(get_current_user),
):
    # Read-only feed; auth is optional.
    return JSONResponse(content=await get_creator_geojson(project=project, include_deleted=include_deleted))


@router.get("/projects/{project}/creator/entries/{entry_id}")
async def api_get_creator_entry(project: str, entry_id: str):
    project_path = resolve_project_path(project)
    if not project_path:
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")
    return JSONResponse(content=_load_entry(project_path, entry_id))


@router.get("/projects/{project}/creator/entries/{entry_id}/changelog")
async def api_get_creator_entry_changelog(project: str, entry_id: str):
    return JSONResponse(content=await get_creator_changelog(project=project, entry_id=entry_id))


@router.get("/projects/{project}/creator/entries/{entry_id}/attachments/{filename}")
async def api_get_creator_attachment(project: str, entry_id: str, filename: str):
    project_path = resolve_project_path(project)
    if not project_path:
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found.")
    path = _attachments_dir(project_path, entry_id) / _safe_filename(filename)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Attachment not found.")
    return FileResponse(str(path))


@router.post("/projects/{project}/creator/entries")
async def api_create_creator_entry(
    project: str,
    entry_type: str = Form(...),
    title: str = Form(...),
    category: str = Form(...),
    category_other: Optional[str] = Form(None),
    comment: Optional[str] = Form(None),
    datasets: Optional[str] = Form(None),
    sortie_id: Optional[str] = Form(None),
    survey_json: Optional[str] = Form(None),
    dataset_features_json: Optional[str] = Form(None),
    geometry_wgs84: str = Form(...),
    attachments: Optional[List[UploadFile]] = File(None),
    user: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    created = await create_creator_entry(
        project=project,
        entry_type=entry_type,
        title=title,
        category=category,
        category_other=category_other,
        comment=comment,
        datasets=datasets,
        sortie_id=sortie_id,
        survey_json=survey_json,
        dataset_features_json=dataset_features_json,
        geometry_wgs84=geometry_wgs84,
        attachments=attachments,
        user=user,
        db=db,
    )
    return JSONResponse(content=created)


@router.put("/projects/{project}/creator/entries/{entry_id}")
async def api_update_creator_entry(
    project: str,
    entry_id: str,
    title: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    category_other: Optional[str] = Form(None),
    comment: Optional[str] = Form(None),
    datasets: Optional[str] = Form(None),
    sortie_id: Optional[str] = Form(None),
    survey_json: Optional[str] = Form(None),
    dataset_features_json: Optional[str] = Form(None),
    geometry_wgs84: Optional[str] = Form(None),
    remove_attachments: Optional[str] = Form(None),
    attachments: Optional[List[UploadFile]] = File(None),
    user: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    updated = await update_creator_entry(
        project=project,
        entry_id=entry_id,
        title=title,
        category=category,
        category_other=category_other,
        comment=comment,
        datasets=datasets,
        sortie_id=sortie_id,
        survey_json=survey_json,
        dataset_features_json=dataset_features_json,
        geometry_wgs84=geometry_wgs84,
        remove_attachments=remove_attachments,
        attachments=attachments,
        user=user,
        db=db,
    )
    return JSONResponse(content=updated)


@router.delete("/projects/{project}/creator/entries/{entry_id}")
async def api_delete_creator_entry(
    project: str,
    entry_id: str,
    user: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    deleted = await delete_creator_entry(project=project, entry_id=entry_id, user=user, db=db)
    return JSONResponse(content=deleted)


