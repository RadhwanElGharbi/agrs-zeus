"""
App update advertisement endpoint.

Serves the latest desktop app version and download URLs so clients
can show a notification prompting the user to download an update.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter(tags=["app-updates"])

# The canonical version file lives next to the backend (managed at build time).
# Fall back to reading gui-v2/frontend/package.json for the version string.
_VERSION_FILE = Path(__file__).resolve().parent.parent / "app_version.json"
_FRONTEND_PACKAGE = Path(__file__).resolve().parent.parent.parent / "frontend" / "package.json"


class DownloadLink(BaseModel):
    platform: str
    label: str
    url: str
    filename: Optional[str] = None


class LatestVersionResponse(BaseModel):
    version: str
    release_date: Optional[str] = None
    release_notes: Optional[str] = None
    downloads: List[DownloadLink] = Field(default_factory=list)


def _read_current_version() -> str:
    """Best-effort read of the canonical app version."""
    # 1. Explicit version file (written by CI / build script)
    if _VERSION_FILE.exists():
        try:
            data = json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
            v = data.get("version")
            if isinstance(v, str) and v.strip():
                return v.strip()
        except Exception:
            pass

    # 2. Frontend package.json
    if _FRONTEND_PACKAGE.exists():
        try:
            data = json.loads(_FRONTEND_PACKAGE.read_text(encoding="utf-8"))
            v = data.get("version")
            if isinstance(v, str) and v.strip():
                return v.strip()
        except Exception:
            pass

    return "0.0.0"


def _read_version_info() -> dict:
    """Read the full version info payload."""
    if _VERSION_FILE.exists():
        try:
            return json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


@router.get("/app/latest-version", response_model=LatestVersionResponse)
async def get_latest_version():
    """
    Return the latest available desktop app version and download links.

    Clients compare this against their running version to decide whether
    to show an update notification.
    """
    info = _read_version_info()
    version = info.get("version") or _read_current_version()
    release_date = info.get("release_date")
    release_notes = info.get("release_notes")

    # Download links can be configured in app_version.json or via env vars
    downloads: List[DownloadLink] = []

    configured = info.get("downloads")
    if isinstance(configured, list):
        for entry in configured:
            if isinstance(entry, dict) and entry.get("platform") and entry.get("url"):
                downloads.append(DownloadLink(**entry))

    # If no downloads configured, point to the build output directory
    if not downloads:
        base_url = os.getenv("APP_DOWNLOAD_BASE_URL", "").strip().rstrip("/")
        if base_url:
            downloads = [
                DownloadLink(
                    platform="windows",
                    label="Windows Installer (.exe)",
                    url=f"{base_url}/AGRS-ZEUS-GUI-v2-Setup-{version}.exe",
                    filename=f"AGRS-ZEUS-GUI-v2-Setup-{version}.exe",
                ),
                DownloadLink(
                    platform="linux",
                    label="Linux AppImage",
                    url=f"{base_url}/AGRS-ZEUS-GUI-v2-{version}.AppImage",
                    filename=f"AGRS-ZEUS-GUI-v2-{version}.AppImage",
                ),
            ]

    return LatestVersionResponse(
        version=version,
        release_date=release_date,
        release_notes=release_notes,
        downloads=downloads,
    )


# Build artifacts directory (electron-builder output)
_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@router.get("/app/downloads/{filename}")
async def download_app_build(filename: str):
    """
    Serve a built desktop app artifact (installer / AppImage / portable).

    Files are expected in gui-v2/frontend/dist/ (electron-builder output).
    """
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    candidate = _DIST_DIR / safe_name
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail=f"Build artifact '{safe_name}' not found. Run the build first.")

    return FileResponse(str(candidate), filename=safe_name)
