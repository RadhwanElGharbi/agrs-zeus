"""
Project data sync endpoints.

Provides:
- Manifest + file download for client-side sync (Electron downloads to user workstation)
- Push endpoint for uploading local changes back to server (with admin approval gate)
- Push request management (list / approve / reject)
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .auth import require_auth
from .project_utils import resolve_project_path

router = APIRouter(tags=["project-data-sync"])

# ---------------------------------------------------------------------------
# In-memory push request store (production would use DB)
# ---------------------------------------------------------------------------

PUSH_REQUESTS: Dict[str, dict] = {}
PUSH_STAGING_ROOT = Path(os.getenv("AGRS_PUSH_STAGING_DIR", "/opt/agrs/gui-v2/backend/.push_staging"))


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class DataManifestEntry(BaseModel):
    relative_path: str
    size_bytes: int
    mtime_ns: int
    sha256: str


class DataManifestResponse(BaseModel):
    project_name: str
    root: str = "data"
    generated_at: str
    file_count: int
    total_size_bytes: int
    fingerprint: str
    files: List[DataManifestEntry] = Field(default_factory=list)


class PushRequestResponse(BaseModel):
    id: str
    project_name: str
    user_email: str
    user_name: str
    file_count: int
    files: List[str]
    status: str
    created_at: str


class PushRequestListResponse(BaseModel):
    requests: List[PushRequestResponse] = Field(default_factory=list)


class PushResponse(BaseModel):
    status: str
    message: str
    request_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _scan_dir_to_manifest_entries(
    root: Path,
    prefix: str,
    files_out: List[DataManifestEntry],
) -> int:
    """Recursively scan a directory and add entries with the given prefix."""
    total = 0
    if not root.exists() or not root.is_dir():
        return 0
    for candidate in sorted(root.rglob("*")):
        if not candidate.is_file():
            continue
        stat = candidate.stat()
        relative_path = f"{prefix}/{candidate.relative_to(root).as_posix()}" if prefix else candidate.relative_to(root).as_posix()
        sha256 = _sha256_file(candidate)
        size_bytes = int(stat.st_size)
        mtime_ns = int(stat.st_mtime_ns)
        files_out.append(DataManifestEntry(relative_path=relative_path, size_bytes=size_bytes, mtime_ns=mtime_ns, sha256=sha256))
        total += size_bytes
    return total


def _build_data_manifest(project_name: str, project_path: Path) -> DataManifestResponse:
    """Build manifest covering data/, aoi/, and project_metadata.json."""
    files: List[DataManifestEntry] = []
    total_size_bytes = 0

    # data/ directory (the primary sync target)
    total_size_bytes += _scan_dir_to_manifest_entries(project_path / "data", "data", files)

    # aoi/ directory (start/end points, AOI files)
    total_size_bytes += _scan_dir_to_manifest_entries(project_path / "aoi", "aoi", files)

    # project_metadata.json at project root
    meta_file = project_path / "project_metadata.json"
    if meta_file.exists() and meta_file.is_file():
        stat = meta_file.stat()
        sha256 = _sha256_file(meta_file)
        size_bytes = int(stat.st_size)
        mtime_ns = int(stat.st_mtime_ns)
        files.append(DataManifestEntry(relative_path="project_metadata.json", size_bytes=size_bytes, mtime_ns=mtime_ns, sha256=sha256))
        total_size_bytes += size_bytes

    # pipeline_specs.json at project root
    specs_file = project_path / "pipeline_specs.json"
    if specs_file.exists() and specs_file.is_file():
        stat = specs_file.stat()
        sha256 = _sha256_file(specs_file)
        size_bytes = int(stat.st_size)
        mtime_ns = int(stat.st_mtime_ns)
        files.append(DataManifestEntry(relative_path="pipeline_specs.json", size_bytes=size_bytes, mtime_ns=mtime_ns, sha256=sha256))
        total_size_bytes += size_bytes

    files.sort(key=lambda f: f.relative_path)

    fingerprint_hasher = hashlib.sha256()
    for f in files:
        fingerprint_hasher.update(f"{f.relative_path}|{f.size_bytes}|{f.mtime_ns}|{f.sha256}\n".encode("utf-8"))

    return DataManifestResponse(
        project_name=project_name,
        generated_at=datetime.now(timezone.utc).isoformat(),
        file_count=len(files),
        total_size_bytes=total_size_bytes,
        fingerprint=fingerprint_hasher.hexdigest(),
        files=files,
    )


def _empty_manifest(project_name: str) -> DataManifestResponse:
    return DataManifestResponse(
        project_name=project_name,
        generated_at=datetime.now(timezone.utc).isoformat(),
        file_count=0, total_size_bytes=0,
        fingerprint=hashlib.sha256(b"").hexdigest(),
        files=[],
    )


def _resolve_safe_data_file(data_root: Path, raw_relative_path: str) -> Path:
    candidate_raw = (raw_relative_path or "").strip()
    if not candidate_raw:
        raise HTTPException(status_code=400, detail="Query parameter 'path' is required.")
    relative = Path(candidate_raw.replace("\\", "/"))
    if relative.is_absolute():
        raise HTTPException(status_code=400, detail="Absolute paths are not allowed.")
    data_root_resolved = data_root.resolve()
    target = (data_root_resolved / relative).resolve()
    try:
        target.relative_to(data_root_resolved)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Path traversal is not allowed.") from exc
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Requested data file was not found.")
    return target


def _is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") in ("admin", "superadmin")


# ---------------------------------------------------------------------------
# Endpoints: manifest + file download (used by Electron to sync)
# ---------------------------------------------------------------------------

@router.get("/projects/{project_name}/data/manifest", response_model=DataManifestResponse)
async def get_project_data_manifest(
    project_name: str,
    _user: Dict[str, Any] = Depends(require_auth),
):
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")
    return _build_data_manifest(project_name, project_path)


@router.get("/projects/{project_name}/data/file")
async def download_project_data_file(
    project_name: str,
    relative_path: str = Query(..., alias="path"),
    _user: Dict[str, Any] = Depends(require_auth),
):
    """Download a file from the project directory (data/, aoi/, or root-level files)."""
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")
    # Serve from project root (not just data/) so aoi/ and metadata are accessible
    target = _resolve_safe_data_file(project_path, relative_path)
    return FileResponse(str(target))


# ---------------------------------------------------------------------------
# Endpoints: push local changes to server
# ---------------------------------------------------------------------------

@router.post("/projects/{project_name}/data/push", response_model=PushResponse)
async def push_project_data(
    project_name: str,
    relative_path: str = Form(...),
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(require_auth),
):
    """
    Upload a single file from the user's local workstation to the server project.

    - Admin/Superadmin: file is applied immediately to server data/.
    - Regular member: a push request is created for admin approval.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    rel = Path(relative_path.replace("\\", "/"))
    if rel.is_absolute() or ".." in rel.parts:
        raise HTTPException(status_code=400, detail="Invalid relative path.")

    data = await file.read()

    if _is_admin(user):
        target = project_path / "data" / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + f".tmp-{os.getpid()}")
        try:
            tmp.write_bytes(data)
            tmp.replace(target)
        except Exception:
            if tmp.exists():
                tmp.unlink(missing_ok=True)
            raise
        return PushResponse(status="applied", message=f"File '{relative_path}' applied to server.")

    request_id = str(uuid.uuid4())
    staging_dir = PUSH_STAGING_ROOT / request_id
    staging_dir.mkdir(parents=True, exist_ok=True)
    staged_file = staging_dir / rel
    staged_file.parent.mkdir(parents=True, exist_ok=True)
    staged_file.write_bytes(data)

    now_iso = datetime.now(timezone.utc).isoformat()
    PUSH_REQUESTS[request_id] = {
        "id": request_id,
        "project_name": project_name,
        "user_email": user.get("email", ""),
        "user_name": user.get("name") or user.get("full_name", ""),
        "files": [relative_path],
        "file_count": 1,
        "status": "pending",
        "created_at": now_iso,
        "staging_dir": str(staging_dir),
    }

    return PushResponse(status="pending", message="Push request created. Awaiting admin approval.", request_id=request_id)


@router.get("/projects/{project_name}/data/push-requests", response_model=PushRequestListResponse)
async def list_push_requests(
    project_name: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required.")
    requests = [
        PushRequestResponse(
            id=r["id"], project_name=r["project_name"],
            user_email=r["user_email"], user_name=r["user_name"],
            file_count=r["file_count"], files=r["files"],
            status=r["status"], created_at=r["created_at"],
        )
        for r in PUSH_REQUESTS.values()
        if r["project_name"] == project_name
    ]
    requests.sort(key=lambda r: r.created_at, reverse=True)
    return PushRequestListResponse(requests=requests)


@router.post("/projects/{project_name}/data/push-requests/{request_id}/approve", response_model=PushResponse)
async def approve_push_request(
    project_name: str,
    request_id: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required.")
    req = PUSH_REQUESTS.get(request_id)
    if not req or req["project_name"] != project_name:
        raise HTTPException(status_code=404, detail="Push request not found.")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}.")

    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    staging_dir = Path(req["staging_dir"])
    if staging_dir.exists():
        for staged_file in staging_dir.rglob("*"):
            if not staged_file.is_file():
                continue
            rel = staged_file.relative_to(staging_dir)
            target = project_path / "data" / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(staged_file), str(target))

    req["status"] = "approved"

    if staging_dir.exists():
        shutil.rmtree(staging_dir, ignore_errors=True)

    return PushResponse(status="approved", message="Push request approved and files applied.", request_id=request_id)


@router.post("/projects/{project_name}/data/push-requests/{request_id}/reject", response_model=PushResponse)
async def reject_push_request(
    project_name: str,
    request_id: str,
    user: Dict[str, Any] = Depends(require_auth),
):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin access required.")
    req = PUSH_REQUESTS.get(request_id)
    if not req or req["project_name"] != project_name:
        raise HTTPException(status_code=404, detail="Push request not found.")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}.")

    req["status"] = "rejected"

    staging_dir = Path(req.get("staging_dir", ""))
    if staging_dir.exists():
        shutil.rmtree(staging_dir, ignore_errors=True)

    return PushResponse(status="rejected", message="Push request rejected.", request_id=request_id)
