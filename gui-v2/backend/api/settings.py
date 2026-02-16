"""
User settings API for AGRS ZEUS.

Provides persistent per-user settings with optional per-device scoping.
Device-specific settings (e.g. resolution) are keyed by a client-generated
device ID so the same user can have different values on different machines.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import require_auth
from .db import get_db
from .db_models import UserSetting

router = APIRouter(tags=["settings"])

GLOBAL_DEVICE_ID = "_global"


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SettingsResponse(BaseModel):
    settings: Dict[str, Any] = Field(default_factory=dict)


class SettingsPatchRequest(BaseModel):
    """
    Patch one or more settings keys.

    - If `device_id` is provided, the keys are stored in the device-specific
      row (e.g. resolution).
    - If `device_id` is omitted / null, the keys go into the global row.
    """
    settings: Dict[str, Any]
    device_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_create_row(db: Session, user_id: uuid.UUID, device_id: str) -> UserSetting:
    """Return the UserSetting row for (user_id, device_id), creating it if needed."""
    row = db.execute(
        select(UserSetting).where(
            UserSetting.user_id == user_id,
            UserSetting.device_id == device_id,
        )
    ).scalar_one_or_none()

    if row is None:
        row = UserSetting(
            id=uuid.uuid4(),
            user_id=user_id,
            device_id=device_id,
            settings={},
        )
        db.add(row)
        db.flush()

    return row


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/user/settings", response_model=SettingsResponse)
async def get_user_settings(
    device_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Return the merged settings for the current user.

    Merging order: global settings ← device-specific overrides.
    """
    uid_str = user.get("id")
    if not uid_str:
        # Demo / non-DB user – return empty; frontend falls back to localStorage.
        return SettingsResponse(settings={})

    uid = uuid.UUID(uid_str)

    # Fetch global row
    global_row = db.execute(
        select(UserSetting).where(
            UserSetting.user_id == uid,
            UserSetting.device_id == GLOBAL_DEVICE_ID,
        )
    ).scalar_one_or_none()

    merged: Dict[str, Any] = {}
    if global_row:
        merged.update(global_row.settings or {})

    # Overlay device-specific settings
    if device_id and device_id != GLOBAL_DEVICE_ID:
        device_row = db.execute(
            select(UserSetting).where(
                UserSetting.user_id == uid,
                UserSetting.device_id == device_id,
            )
        ).scalar_one_or_none()
        if device_row:
            merged.update(device_row.settings or {})

    return SettingsResponse(settings=merged)


@router.patch("/user/settings", response_model=SettingsResponse)
async def patch_user_settings(
    body: SettingsPatchRequest,
    user: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Upsert one or more settings keys.

    Keys present in `body.settings` are merged into the stored JSONB; keys
    not mentioned are left untouched.  Pass a value of `null` to delete a key.
    """
    uid_str = user.get("id")
    if not uid_str:
        raise HTTPException(status_code=400, detail="Settings persistence requires a database-backed account.")

    uid = uuid.UUID(uid_str)
    target_device = body.device_id or GLOBAL_DEVICE_ID

    row = _get_or_create_row(db, uid, target_device)

    # Merge: existing ← incoming (null values remove the key)
    current = dict(row.settings or {})
    for key, value in body.settings.items():
        if value is None:
            current.pop(key, None)
        else:
            current[key] = value

    # Force SQLAlchemy to detect the mutation on the JSONB column
    row.settings = current

    db.commit()
    db.refresh(row)

    return SettingsResponse(settings=row.settings)
