from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from fastapi import HTTPException

from ..project_utils import resolve_project_path


PROJECTS_ROOT = Path("/opt/agrs/Projects")


@dataclass(frozen=True)
class ResolvedAlignmentInputs:
    project: str
    project_dir: Path
    route_arg: str
    route_path: Path
    project_crs_epsg: Optional[int] = None
    route_crs_epsg: Optional[int] = None


def _parse_epsg(value) -> Optional[int]:
    try:
        if value is None:
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            m = re.search(r"(?i)epsg[^0-9]*(\d{3,6})", s)
            if m:
                return int(m.group(1))
            # Try raw integer string
            if s.isdigit():
                return int(s)
    except Exception:
        return None
    return None


def _project_epsg_from_metadata(project_dir: Path) -> Optional[int]:
    meta_path = project_dir / "project_metadata.json"
    if not meta_path.exists():
        return None
    try:
        import json

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception:
        return None

    if isinstance(meta, dict):
        epsg = _parse_epsg(meta.get("crs_epsg"))
        if epsg is not None:
            return epsg
        crs = meta.get("crs")
        if isinstance(crs, dict):
            epsg = _parse_epsg(crs.get("epsg"))
            if epsg is not None:
                return epsg
    return None


def _infer_route_epsg_from_geojson(route_geojson: dict) -> Optional[int]:
    """
    Best-effort EPSG extraction from GeoJSON `crs` block.
    Examples seen:
      - {"crs":{"type":"name","properties":{"name":"EPSG:32613"}}}
      - urn forms like "urn:ogc:def:crs:EPSG::32613"
    """
    try:
        crs = route_geojson.get("crs")
        if not isinstance(crs, dict):
            return None
        props = crs.get("properties")
        if not isinstance(props, dict):
            return None
        name = props.get("name")
        return _parse_epsg(name)
    except Exception:
        return None


def _safe_resolve_route_file(outputs_dir: Path, route_arg: str) -> Optional[Path]:
    """
    Resolve a route file under outputs_dir, allowing subpaths like:
      production_run/route_x
    but preventing path traversal outside outputs_dir.
    """
    if not isinstance(route_arg, str) or not route_arg.strip():
        return None

    candidate = outputs_dir / route_arg
    if not candidate.exists() and not route_arg.lower().endswith(".geojson"):
        candidate = outputs_dir / f"{route_arg}.geojson"

    try:
        outputs_root = outputs_dir.resolve()
        resolved = candidate.resolve()
        if outputs_root not in resolved.parents and resolved != outputs_root:
            return None
    except Exception:
        # If resolve fails, fall back to existence checks only.
        pass

    if not candidate.exists() or candidate.suffix.lower() != ".geojson":
        return None
    return candidate


def resolve_alignment_inputs(project: str, route: str) -> ResolvedAlignmentInputs:
    """
    Resolve the correct project directory (metadata/specs/datasets) and
    the route GeoJSON path across common Zeus project layouts.

    This is required because some repos store:
      - metadata/specs/datasets under Projects/<X>/<X>/...
      - PIRL outputs under Projects/<X>/PIRL/outputs/...
    """
    project_dir = resolve_project_path(project)
    if not project_dir or not project_dir.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    project_epsg = _project_epsg_from_metadata(project_dir)

    outputs_candidates: list[Path] = []
    outputs_candidates.append(project_dir / "PIRL" / "outputs")
    if project_dir.parent and project_dir.parent != project_dir:
        outputs_candidates.append(project_dir.parent / "PIRL" / "outputs")

    direct = PROJECTS_ROOT / project
    if direct.exists():
        outputs_candidates.append(direct / "PIRL" / "outputs")

    route_path: Optional[Path] = None
    for out_dir in outputs_candidates:
        if not out_dir.exists():
            continue
        found = _safe_resolve_route_file(out_dir, route)
        if found is not None:
            route_path = found
            break

    if route_path is None:
        tried = ", ".join(str(p) for p in outputs_candidates)
        raise HTTPException(status_code=404, detail=f"Route '{route}' not found under any PIRL outputs dir. Tried: {tried}")

    # Best-effort route EPSG extraction (used for preview/debug; engine will reproject if needed)
    route_epsg: Optional[int] = None
    try:
        import json

        with open(route_path, "r", encoding="utf-8") as f:
            route_geojson = json.load(f)
        if isinstance(route_geojson, dict):
            route_epsg = _infer_route_epsg_from_geojson(route_geojson)
    except Exception:
        route_epsg = None

    return ResolvedAlignmentInputs(
        project=project,
        project_dir=project_dir,
        route_arg=route,
        route_path=route_path,
        project_crs_epsg=project_epsg,
        route_crs_epsg=route_epsg,
    )















