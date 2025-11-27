"""
Shared project discovery utilities for the AGRS API.

Handles locating valid project folders that follow the AGRS structure.
Projects are identified by the presence of either project_metadata.json
or pipeline_specs.json (per the project structure standard).
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, Optional

# Base projects directory
PROJECTS_ROOT = Path("/opt/agrs/Projects")

# Simple in-memory cache so we do not rescan the filesystem for every request
_PROJECT_CACHE: Dict[str, Path] = {}
_CACHE_LOCK = threading.Lock()


def load_json_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Load a JSON file safely."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Error loading {file_path}: {exc}")
        return None


def discover_project_paths(force_refresh: bool = False) -> Dict[str, Path]:
    """
    Discover all project directories under the PROJECTS_ROOT.

    A valid project directory must contain either project_metadata.json or
    pipeline_specs.json at its root. The project name is taken from the
    metadata file when available; otherwise the directory name is used.
    """
    global _PROJECT_CACHE

    with _CACHE_LOCK:
        if _PROJECT_CACHE and not force_refresh:
            return dict(_PROJECT_CACHE)

        discovered: Dict[str, Path] = {}

        if not PROJECTS_ROOT.exists():
            _PROJECT_CACHE = {}
            return {}

        # Prioritize directories that contain project_metadata.json
        for metadata_path in PROJECTS_ROOT.rglob("project_metadata.json"):
            project_dir = metadata_path.parent
            metadata = load_json_file(metadata_path)
            project_name = metadata.get("project_name") if metadata else project_dir.name
            discovered[project_name] = project_dir

        # Also allow folders that only contain pipeline_specs.json
        for pipeline_path in PROJECTS_ROOT.rglob("pipeline_specs.json"):
            project_dir = pipeline_path.parent
            metadata_path = project_dir / "project_metadata.json"
            metadata = load_json_file(metadata_path) if metadata_path.exists() else None
            project_name = (
                metadata.get("project_name")
                if metadata and metadata.get("project_name")
                else project_dir.name
            )
            discovered.setdefault(project_name, project_dir)

        _PROJECT_CACHE = discovered
        return dict(_PROJECT_CACHE)


def resolve_project_path(project_name: str) -> Optional[Path]:
    """
    Resolve a project name to its directory path.

    Looks up the cached discovered projects first, then falls back to
    directory-name matching (supports nested folders such as /Projects/US_PIPELINE/US_PIPELINE).
    """
    projects = discover_project_paths()
    if project_name in projects:
        return projects[project_name]

    # Fallback: direct child path
    direct_path = PROJECTS_ROOT / project_name
    if (direct_path / "project_metadata.json").exists() or (direct_path / "pipeline_specs.json").exists():
        return direct_path

    # Fallback: search for nested directories that match the project name
    for candidate in PROJECTS_ROOT.rglob(project_name):
        if candidate.is_dir():
            if (candidate / "project_metadata.json").exists() or (candidate / "pipeline_specs.json").exists():
                return candidate

    return None
