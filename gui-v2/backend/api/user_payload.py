"""
User payload helpers.

The backend uses a SQLAlchemy `User` model (`api.db_models.User`) for persistence,
but the frontend expects a JSON-friendly profile shape with a few legacy fields
(`username`, `name`, `company`) for compatibility.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from .db_models import User


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return str(dt)


def build_user_payload(u: User) -> Dict[str, Any]:
    """
    Convert a `User` ORM row into a JSON payload used by the frontend.
    """

    user_id = str(getattr(u, "id", ""))
    email = getattr(u, "email", None)
    full_name = getattr(u, "full_name", None)
    org = getattr(u, "organization", None)

    profile_image_key = getattr(u, "profile_image_key", None)
    profile_image_url = f"/api/users/{user_id}/avatar" if profile_image_key else None

    return {
        "id": user_id,
        "serial_number": getattr(u, "serial_number", None),
        "email": email,
        # Compatibility fields (legacy auth payload shape)
        "username": email or user_id,
        "full_name": full_name,
        "name": full_name,
        "organization": org,
        "company": org,
        "position": getattr(u, "position", None),
        "department": getattr(u, "department", None),
        "station": getattr(u, "station", None),
        "work_phone": getattr(u, "work_phone", None),
        "superior_user_id": str(getattr(u, "superior_user_id", "")) if getattr(u, "superior_user_id", None) else None,
        "role": getattr(u, "role", None),
        "access_level": getattr(u, "access_level", None),
        "is_active": bool(getattr(u, "is_active", True)),
        "profile_image_url": profile_image_url,
        "created_at": _iso(getattr(u, "created_at", None)),
        "updated_at": _iso(getattr(u, "updated_at", None)),
    }
