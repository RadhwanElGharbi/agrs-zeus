"""
Project discovery helpers.

Projects default to /opt/agrs/Projects (overridable via AGRS_PROJECTS_ROOT)
and are considered valid if they contain either project_metadata.json or
pipeline_specs.json at any depth.
The project name prefers the value inside project_metadata.json when present;
otherwise the directory name is used.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Dict, Optional, Set

PROJECTS_ROOT_ENV_VAR = "AGRS_PROJECTS_ROOT"
DEFAULT_PROJECTS_ROOT = Path("/opt/agrs/Projects")
# Keep a module-level constant for backwards compatibility with existing imports.
PROJECTS_ROOT = Path(os.getenv(PROJECTS_ROOT_ENV_VAR, str(DEFAULT_PROJECTS_ROOT)))

_DISCOVERY_CACHE_TTL_SECONDS = max(
    0.0,
    float(os.getenv("AGRS_PROJECT_DISCOVERY_CACHE_TTL_SECONDS", "15")),
)
_DISCOVERY_CACHE_LOCK = threading.Lock()
_DISCOVERY_CACHE_ROOT: Optional[Path] = None
_DISCOVERY_CACHE_LOADED_AT: float = 0.0
_DISCOVERY_CACHE_PROJECTS: Dict[str, Path] = {}


def get_projects_root() -> Path:
    """
    Return the effective projects root.

    Supports overriding the canonical root via `AGRS_PROJECTS_ROOT`.
    """
    raw = os.getenv(PROJECTS_ROOT_ENV_VAR, str(DEFAULT_PROJECTS_ROOT)).strip()
    if not raw:
        raw = str(DEFAULT_PROJECTS_ROOT)
    return Path(raw)


def load_json_file(file_path: Path) -> Optional[dict]:
    """Load JSON with basic safety."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Error loading {file_path}: {exc}")
        return None


def _is_project_dir(directory: Path) -> bool:
    return (directory / "project_metadata.json").exists() or (directory / "pipeline_specs.json").exists()


def discover_project_paths(force_refresh: bool = False) -> Dict[str, Path]:
    """
    Discover all project directories under PROJECTS_ROOT.

    A project is any directory containing project_metadata.json or
    pipeline_specs.json (rglob). Returns a mapping of project_name -> path.
    """
    global _DISCOVERY_CACHE_ROOT
    global _DISCOVERY_CACHE_LOADED_AT
    global _DISCOVERY_CACHE_PROJECTS

    discovered: Dict[str, Path] = {}
    seen_dirs: Set[Path] = set()

    projects_root = get_projects_root()
    now = time.time()

    if not force_refresh and _DISCOVERY_CACHE_TTL_SECONDS > 0:
        with _DISCOVERY_CACHE_LOCK:
            is_fresh = (now - _DISCOVERY_CACHE_LOADED_AT) <= _DISCOVERY_CACHE_TTL_SECONDS
            same_root = _DISCOVERY_CACHE_ROOT == projects_root
            if is_fresh and same_root:
                return dict(_DISCOVERY_CACHE_PROJECTS)

    if not projects_root.exists():
        with _DISCOVERY_CACHE_LOCK:
            _DISCOVERY_CACHE_ROOT = projects_root
            _DISCOVERY_CACHE_LOADED_AT = now
            _DISCOVERY_CACHE_PROJECTS = {}
        return discovered

    # First prioritize directories with project_metadata.json
    for metadata_path in projects_root.rglob("project_metadata.json"):
        project_dir = metadata_path.parent
        if not project_dir.is_dir():
            continue
        if project_dir in seen_dirs:
            continue
        metadata = load_json_file(metadata_path)
        project_name = metadata.get("project_name") if metadata else project_dir.name
        if project_name not in discovered:
            discovered[project_name] = project_dir
            seen_dirs.add(project_dir)

    # Also include folders that only have pipeline_specs.json
    for pipeline_path in projects_root.rglob("pipeline_specs.json"):
        project_dir = pipeline_path.parent
        if not project_dir.is_dir():
            continue
        if project_dir in seen_dirs:
            continue
        metadata_path = project_dir / "project_metadata.json"
        metadata = load_json_file(metadata_path) if metadata_path.exists() else None
        project_name = (
            metadata.get("project_name")
            if metadata and metadata.get("project_name")
            else project_dir.name
        )
        if project_name not in discovered:
            discovered[project_name] = project_dir
            seen_dirs.add(project_dir)

    with _DISCOVERY_CACHE_LOCK:
        _DISCOVERY_CACHE_ROOT = projects_root
        _DISCOVERY_CACHE_LOADED_AT = now
        _DISCOVERY_CACHE_PROJECTS = dict(discovered)

    return discovered


def resolve_project_path(project_name: str) -> Optional[Path]:
    """
    Resolve project name to its directory path using discovered projects,
    falling back to direct child lookup.
    """
    # Fast-path: direct child lookup avoids expensive recursive scan in common cases.
    direct = get_projects_root() / project_name
    if _is_project_dir(direct):
        return direct

    projects = discover_project_paths()
    resolved = projects.get(project_name)
    if resolved:
        return resolved

    # Retry once with a forced refresh so newly created projects become visible immediately.
    refreshed = discover_project_paths(force_refresh=True)
    return refreshed.get(project_name)
