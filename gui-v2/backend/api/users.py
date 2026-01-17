"""
User Management API (Postgres-backed).

- Admin CRUD for users
- Self profile endpoints
- Profile image upload/serve (stored on backend filesystem)
"""

from __future__ import annotations

import mimetypes
import os
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .auth import require_auth
from .db import get_db
from .db_models import User
from .security import hash_password
from .user_payload import build_user_payload


router = APIRouter(tags=["users"])


def require_superadmin(user: Dict[str, Any] = Depends(require_auth)) -> Dict[str, Any]:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user


def _profile_image_root() -> Path:
    root = os.getenv("PROFILE_IMAGE_ROOT", "/opt/agrs/gui-v2/backend/profile_images")
    path = Path(root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _safe_filename(name: str) -> str:
    base = os.path.basename(name or "")
    base = base.replace("..", "__").replace("/", "_").replace("\\", "_").strip()
    return base or "file"


def _resolve_user_or_404(db: Session, user_id: str) -> User:
    try:
        uid = uuid.UUID(str(user_id))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    user = db.execute(select(User).where(User.id == uid)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _generate_serial_number(db: Session) -> str:
    """
    Generate a human-friendly serial number.

    This is a simple v1 strategy. If you want stronger guarantees under high concurrency,
    switch to a dedicated DB sequence later.
    """
    count = db.scalar(select(func.count()).select_from(User)) or 0
    candidate = f"AGRS-{int(count) + 1:06d}"
    # Avoid collisions if users were deleted or imported.
    i = 0
    while db.execute(select(User.id).where(User.serial_number == candidate)).first():
        i += 1
        candidate = f"AGRS-{int(count) + 1 + i:06d}"
    return candidate


def bootstrap_initial_admin(db: Session) -> None:
    """
    Bootstrap an initial admin user if env vars are provided.

    Env vars:
    - INITIAL_ADMIN_EMAIL
    - INITIAL_ADMIN_PASSWORD
    - INITIAL_ADMIN_FULL_NAME (optional)
    - INITIAL_ADMIN_SERIAL_NUMBER (optional)
    """
    email = (os.getenv("INITIAL_ADMIN_EMAIL") or "").strip().lower()
    password = os.getenv("INITIAL_ADMIN_PASSWORD") or ""
    if not email or not password:
        return

    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        return

    full_name = (os.getenv("INITIAL_ADMIN_FULL_NAME") or "AGRS Admin").strip() or "AGRS Admin"
    serial = (os.getenv("INITIAL_ADMIN_SERIAL_NUMBER") or "").strip() or _generate_serial_number(db)

    user = User(
        email=email,
        serial_number=serial,
        full_name=full_name,
        role="superadmin",
        organization=os.getenv("INITIAL_ADMIN_ORGANIZATION"),
        password_hash=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Do not auto-create any other accounts here; use the dedicated bootstrap below.


def _bootstrap_user_if_missing(
    db: Session,
    *,
    email: str,
    password: str,
    full_name: str,
    serial_number: Optional[str],
    role: str,
) -> None:
    email_norm = (email or "").strip().lower()
    password_norm = password or ""
    if not email_norm or not password_norm.strip():
        return

    existing = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()
    if existing:
        return

    serial = (serial_number or "").strip() or _generate_serial_number(db)
    # Ensure serial uniqueness
    if db.execute(select(User.id).where(User.serial_number == serial)).first():
        serial = _generate_serial_number(db)

    user = User(
        email=email_norm,
        serial_number=serial,
        full_name=(full_name or "").strip() or email_norm,
        role=role,
        password_hash=hash_password(password_norm),
        is_active=True,
    )
    db.add(user)
    db.commit()


def bootstrap_rad_admin(db: Session) -> None:
    """
    Bootstrap RAD admin user if RAD_ADMIN_PASSWORD is provided.

    Defaults:
    - RAD_ADMIN_EMAIL defaults to radwan@agrsglobal.com (per deployment requirement)
    - RAD_ADMIN_SERIAL_NUMBER defaults to rad_admin (to preserve legacy handle in logs)
    """
    password = os.getenv("RAD_ADMIN_PASSWORD") or ""
    email = (os.getenv("RAD_ADMIN_EMAIL") or "radwan@agrsglobal.com").strip()
    full_name = (os.getenv("RAD_ADMIN_FULL_NAME") or "RAD Admin").strip()
    serial = (os.getenv("RAD_ADMIN_SERIAL_NUMBER") or "rad_admin").strip()

    _bootstrap_user_if_missing(
        db,
        email=email,
        password=password,
        full_name=full_name,
        serial_number=serial,
        role="superadmin",
    )

    # Ensure role is superadmin for this account (deployment invariant).
    email_norm = (email or "").strip().lower()
    existing = db.execute(select(User).where(User.email == email_norm)).scalar_one_or_none()
    if existing and existing.role != "superadmin":
        existing.role = "superadmin"
        db.commit()


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=8, max_length=256)

    serial_number: Optional[str] = Field(default=None, max_length=64)
    organization: Optional[str] = Field(default=None, max_length=256)
    position: Optional[str] = Field(default=None, max_length=256)
    department: Optional[str] = Field(default=None, max_length=256)
    station: Optional[str] = Field(default=None, max_length=256)
    work_phone: Optional[str] = Field(default=None, max_length=64)
    superior_user_id: Optional[str] = None
    role: str = Field(default="member", max_length=32)
    access_level: Optional[str] = Field(default=None, max_length=64)


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=256)
    serial_number: Optional[str] = Field(default=None, max_length=64)
    organization: Optional[str] = Field(default=None, max_length=256)
    position: Optional[str] = Field(default=None, max_length=256)
    department: Optional[str] = Field(default=None, max_length=256)
    station: Optional[str] = Field(default=None, max_length=256)
    work_phone: Optional[str] = Field(default=None, max_length=64)
    superior_user_id: Optional[str] = None
    role: Optional[str] = Field(default=None, max_length=32)
    access_level: Optional[str] = Field(default=None, max_length=64)
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=8, max_length=256)


class UserSelfUpdateRequest(BaseModel):
    # Keep self-update intentionally narrow (admin can change the rest).
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=256)
    organization: Optional[str] = Field(default=None, max_length=256)
    position: Optional[str] = Field(default=None, max_length=256)
    department: Optional[str] = Field(default=None, max_length=256)
    station: Optional[str] = Field(default=None, max_length=256)
    work_phone: Optional[str] = Field(default=None, max_length=64)


@router.get("/users/me")
def get_me(user: Dict[str, Any] = Depends(require_auth), db: Session = Depends(get_db)):
    db_user = _resolve_user_or_404(db, user.get("id"))
    return JSONResponse(build_user_payload(db_user))


@router.patch("/users/me")
def patch_me(payload: UserSelfUpdateRequest, user: Dict[str, Any] = Depends(require_auth), db: Session = Depends(get_db)):
    db_user = _resolve_user_or_404(db, user.get("id"))
    if payload.full_name is not None:
        db_user.full_name = payload.full_name
    if payload.organization is not None:
        db_user.organization = payload.organization
    if payload.position is not None:
        db_user.position = payload.position
    if payload.department is not None:
        db_user.department = payload.department
    if payload.station is not None:
        db_user.station = payload.station
    if payload.work_phone is not None:
        db_user.work_phone = payload.work_phone
    db.commit()
    db.refresh(db_user)
    return JSONResponse(build_user_payload(db_user))


@router.post("/users", status_code=201)
def create_user(payload: UserCreateRequest, _: Dict[str, Any] = Depends(require_superadmin), db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    if db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Email already exists")

    serial = (payload.serial_number or "").strip() or _generate_serial_number(db)
    if db.execute(select(User.id).where(User.serial_number == serial)).first():
        raise HTTPException(status_code=409, detail="Serial number already exists")

    superior_id = None
    if payload.superior_user_id:
        superior = _resolve_user_or_404(db, payload.superior_user_id)
        superior_id = superior.id

    role = (payload.role or "member").strip().lower()
    if role == "user":
        role = "member"
    if role not in {"member", "admin", "superadmin"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    user_row = User(
        email=email,
        serial_number=serial,
        full_name=payload.full_name,
        organization=payload.organization,
        position=payload.position,
        department=payload.department,
        station=payload.station,
        work_phone=payload.work_phone,
        superior_user_id=superior_id,
        role=role,
        access_level=payload.access_level,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user_row)
    db.commit()
    db.refresh(user_row)
    return JSONResponse(build_user_payload(user_row), status_code=201)


@router.get("/users")
def list_users(
    q: Optional[str] = Query(default=None, description="Search by email, serial number, or full name"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: Dict[str, Any] = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    stmt = select(User)
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(term),
                func.lower(User.serial_number).like(term),
                func.lower(User.full_name).like(term),
            )
        )
    stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(limit)
    users = db.execute(stmt).scalars().all()
    return {"users": [build_user_payload(u) for u in users], "count": len(users), "limit": limit, "offset": offset}


@router.get("/users/directory")
def user_directory(
    q: Optional[str] = Query(default=None, description="Search by email, serial number, or full name"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Authenticated user directory lookup (non-admin).

    Used by Operator workflows (e.g., Sorties) to add registered ZEUS users as participants.
    """
    stmt = select(User).where(User.is_active.is_(True))
    if q and q.strip():
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(term),
                func.lower(User.serial_number).like(term),
                func.lower(User.full_name).like(term),
            )
        )
    stmt = stmt.order_by(User.full_name.asc()).offset(offset).limit(limit)
    users = db.execute(stmt).scalars().all()
    return {"users": [build_user_payload(u) for u in users], "count": len(users), "limit": limit, "offset": offset}


@router.get("/users/{user_id}")
def get_user(user_id: str, _: Dict[str, Any] = Depends(require_superadmin), db: Session = Depends(get_db)):
    u = _resolve_user_or_404(db, user_id)
    return JSONResponse(build_user_payload(u))


@router.patch("/users/{user_id}")
def patch_user(user_id: str, payload: UserUpdateRequest, _: Dict[str, Any] = Depends(require_superadmin), db: Session = Depends(get_db)):
    u = _resolve_user_or_404(db, user_id)

    if payload.full_name is not None:
        u.full_name = payload.full_name
    if payload.serial_number is not None:
        serial = payload.serial_number.strip()
        if serial and serial != u.serial_number and db.execute(select(User.id).where(User.serial_number == serial)).first():
            raise HTTPException(status_code=409, detail="Serial number already exists")
        if serial:
            u.serial_number = serial
    if payload.organization is not None:
        u.organization = payload.organization
    if payload.position is not None:
        u.position = payload.position
    if payload.department is not None:
        u.department = payload.department
    if payload.station is not None:
        u.station = payload.station
    if payload.work_phone is not None:
        u.work_phone = payload.work_phone
    if payload.access_level is not None:
        u.access_level = payload.access_level
    if payload.role is not None:
        role = (payload.role or "").strip().lower()
        if role == "user":
            role = "member"
        if role and role not in {"member", "admin", "superadmin"}:
            raise HTTPException(status_code=400, detail="Invalid role")
        u.role = role or u.role
    if payload.is_active is not None:
        u.is_active = bool(payload.is_active)

    if payload.superior_user_id is not None:
        if payload.superior_user_id == "":
            u.superior_user_id = None
        else:
            superior = _resolve_user_or_404(db, payload.superior_user_id)
            u.superior_user_id = superior.id

    if payload.password is not None:
        u.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(u)
    return JSONResponse(build_user_payload(u))


@router.post("/users/{user_id}/avatar")
def upload_avatar(
    user_id: str,
    file: UploadFile = File(...),
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    # Allow self or admin
    if actor.get("role") != "superadmin" and str(actor.get("id")) != str(user_id):
        raise HTTPException(status_code=403, detail="Forbidden")

    u = _resolve_user_or_404(db, user_id)

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")

    root = _profile_image_root()
    safe = _safe_filename(file.filename)
    suffix = Path(safe).suffix
    stored_name = f"{uuid.uuid4().hex}{suffix}"

    user_dir = root / str(u.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    target_path = user_dir / stored_name

    with open(target_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    # Store relative key inside PROFILE_IMAGE_ROOT
    u.profile_image_key = f"{u.id}/{stored_name}"
    db.commit()
    db.refresh(u)
    return JSONResponse(build_user_payload(u))


@router.get("/users/{user_id}/avatar")
def get_avatar(user_id: str, db: Session = Depends(get_db)):
    u = _resolve_user_or_404(db, user_id)
    if not u.profile_image_key:
        raise HTTPException(status_code=404, detail="Avatar not set")

    root = _profile_image_root().resolve()
    candidate = (root / u.profile_image_key).resolve()
    if not str(candidate).startswith(str(root)):
        raise HTTPException(status_code=400, detail="Invalid avatar path")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Avatar not found")

    media_type, _ = mimetypes.guess_type(str(candidate))
    return FileResponse(str(candidate), media_type=media_type or "application/octet-stream")


