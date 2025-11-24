"""
Project discovery helpers.

Projects are located under /opt/agrs/Projects and are considered valid if
they contain either project_metadata.json or pipeline_specs.json at any depth.
The project name prefers the value inside project_metadata.json when present;
otherwise the directory name is used.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional, Set

PROJECTS_ROOT = Path("/opt/agrs/Projects")


def load_json_file(file_path: Path) -> Optional[dict]:
    """Load JSON with basic safety."""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"Error loading {file_path}: {exc}")
        return None


def discover_project_paths() -> Dict[str, Path]:
    """
    Discover all project directories under PROJECTS_ROOT.

    A project is any directory containing project_metadata.json or
    pipeline_specs.json (rglob). Returns a mapping of project_name -> path.
    """
    discovered: Dict[str, Path] = {}
    seen_dirs: Set[Path] = set()

    if not PROJECTS_ROOT.exists():
        return discovered

    # First prioritize directories with project_metadata.json
    for metadata_path in PROJECTS_ROOT.rglob("project_metadata.json"):
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
    for pipeline_path in PROJECTS_ROOT.rglob("pipeline_specs.json"):
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

    return discovered


def resolve_project_path(project_name: str) -> Optional[Path]:
    """
    Resolve project name to its directory path using discovered projects,
    falling back to direct child lookup.
    """
    projects = discover_project_paths()
    if project_name in projects:
        return projects[project_name]

    direct = PROJECTS_ROOT / project_name
    if (direct / "project_metadata.json").exists() or (direct / "pipeline_specs.json").exists():
        return direct

    return None
