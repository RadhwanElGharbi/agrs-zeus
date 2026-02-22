"""
Project Discovery API Endpoints

Provides endpoints to discover and manage projects following the AGRS standard structure.
"""
import csv
import re
import math
import subprocess
import json
import sys
import shutil
import tempfile
import uuid
import zipfile
import urllib.request
import socket
import ipaddress
import mimetypes
from urllib.parse import urlparse
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import List, Dict, Any, Optional, List as ListType, Tuple

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union
from pyproj import Geod
import reverse_geocoder as rg
import pycountry
import fiona
import requests
from sqlalchemy import select
from sqlalchemy.orm import Session
from .project_utils import (
    discover_project_paths,
    resolve_project_path,
    load_json_file,
    PROJECTS_ROOT,
)
from .auth import get_current_user, require_auth
from .audit import write_audit_event
from .db import get_db
from .db_models import Project, ProjectMembership, User
from .projects_db import upsert_project_row

router = APIRouter()
security = HTTPBearer(auto_error=False)


def require_superadmin(user: Dict[str, Any] = Depends(require_auth)) -> Dict[str, Any]:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return user

DOCS_ROOT = Path("/opt/agrs/docs")


def _first_existing_path(*candidates: Path) -> Path:
    """
    Return the first existing path from candidates (or the first candidate if none exist).

    This keeps compatibility across legacy doc layouts (`Project Instructions`, `Research`)
    and the newer normalized layout (`datasets`, `research`, `standards`).
    """
    for candidate in candidates:
        try:
            if candidate.exists():
                return candidate
        except OSError:
            continue
    return candidates[0]


RESEARCH_ROOT = _first_existing_path(
    DOCS_ROOT / "research",
    DOCS_ROOT / "Research",
)
ISO_CODES_CSV = _first_existing_path(
    RESEARCH_ROOT / "iso_countries.csv",
    DOCS_ROOT / "research" / "iso_countries.csv",
    DOCS_ROOT / "Research" / "iso_countries.csv",
)
COUNTRY_COVERAGE_LONG_CSV = _first_existing_path(
    RESEARCH_ROOT / "COUNTRY_COVERAGE_LONG.csv",
    DOCS_ROOT / "research" / "COUNTRY_COVERAGE_LONG.csv",
    DOCS_ROOT / "Research" / "COUNTRY_COVERAGE_LONG.csv",
)
COUNTRY_DATASETS_DIR = _first_existing_path(
    RESEARCH_ROOT / "Country Coverage" / "Country Datasets",
    DOCS_ROOT / "research" / "Country Coverage" / "Country Datasets",
    DOCS_ROOT / "Research" / "Country Coverage" / "Country Datasets",
)
DATASET_FETCH_PROTOCOL = str(
    _first_existing_path(
        DOCS_ROOT / "datasets" / "DATASET_FETCHING_PROTOCOLS.md",
        DOCS_ROOT / "Project Instructions" / "DATASET_FETCHING_PROTOCOLS.md",
    )
)
DATASET_COVERAGE_CATALOG_CSV = _first_existing_path(
    DOCS_ROOT / "datasets" / "WORLD_DATASET_CATALOGUE.csv",
    DOCS_ROOT / "Project Instructions" / "WORLD_DATASET_CATALOGUE.csv",
)
PIPELINE_ENGINEERING_STANDARDS_CATALOG_CSV = _first_existing_path(
    DOCS_ROOT / "pipeline" / "WORLD_PIPELINE_ENGINEERING_STANDARDS_CATALOGUE.csv",
    DOCS_ROOT / "Project Instructions" / "WORLD_PIPELINE_ENGINEERING_STANDARDS_CATALOGUE.csv",
)
REGULATION_CATALOG_CSV = _first_existing_path(
    DOCS_ROOT / "standards" / "WORLD_REGULATION_CATALOGUE.csv",
    DOCS_ROOT / "Project Instructions" / "WORLD_REGULATION_CATALOGUE.csv",
)

# Boundary cache for AOI→jurisdiction (Admin0/Admin1) intersection
BOUNDARIES_ROOT = Path("/opt/agrs/data/boundaries")
NATURAL_EARTH_ADMIN0_URL = (
    "https://naturalearth.s3.amazonaws.com/50m_cultural/ne_50m_admin_0_countries.zip"
)
NATURAL_EARTH_ADMIN0_DIR = BOUNDARIES_ROOT / "naturalearth_admin0_50m"
NATURAL_EARTH_ADMIN0_SHP = NATURAL_EARTH_ADMIN0_DIR / "ne_50m_admin_0_countries.shp"
GADM_DIR = BOUNDARIES_ROOT / "gadm41"

GEOD = Geod(ellps="WGS84")

# Maximum AOI area limit in square kilometers.
# Set to None for unlimited (default).
MAX_AOI_AREA_KM2 = None

# Copernicus DEM EEA-10 coverage is commonly defined for the EEA member/cooperating
# country set (often referred to as "EEA-39"). We use this to avoid showing EEA-10
# as a selectable dataset for projects outside that coverage region.
#
# Note: XKX (Kosovo) is included as a commonly-used pseudo-ISO3.
EEA39_ISO3 = {
    # EU + EEA member countries
    "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC",
    "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK",
    "SVN", "ESP", "SWE",
    # EFTA/EEA members + other EEA/EEA-related members used by EEA-39 datasets
    "ISL", "LIE", "NOR", "CHE", "TUR",
    # Cooperating countries (EEA context)
    "ALB", "BIH", "MNE", "MKD", "SRB", "XKX",
    # Some Copernicus "EEA-39" products historically include the UK footprint
    "GBR",
}

# EU member states (EU-27) ISO3 codes, for matching supranational EU instruments.
EU27_ISO3 = {
    "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC",
    "HUN", "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK",
    "SVN", "ESP", "SWE",
}


def _download_url_to_path(url: str, dest: Path, timeout_s: int = 120) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:  # nosec - fixed allowlisted URLs only
            with tmp.open("wb") as out:
                shutil.copyfileobj(resp, out)
        if tmp.exists() and tmp.stat().st_size > 0:
            tmp.replace(dest)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def _ensure_naturalearth_admin0() -> Optional[Path]:
    """
    Ensure Natural Earth Admin0 boundaries exist on disk and return the .shp path.
    Falls back to None if download/extract fails.
    """
    try:
        if NATURAL_EARTH_ADMIN0_SHP.exists():
            return NATURAL_EARTH_ADMIN0_SHP
        NATURAL_EARTH_ADMIN0_DIR.mkdir(parents=True, exist_ok=True)
        zip_path = NATURAL_EARTH_ADMIN0_DIR / "ne_50m_admin_0_countries.zip"
        if not zip_path.exists():
            _download_url_to_path(NATURAL_EARTH_ADMIN0_URL, zip_path)
        if not zip_path.exists():
            return None
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(NATURAL_EARTH_ADMIN0_DIR)
        return NATURAL_EARTH_ADMIN0_SHP if NATURAL_EARTH_ADMIN0_SHP.exists() else None
    except Exception:
        return None


def _iso3_from_naturalearth_props(props: Dict[str, Any]) -> Optional[str]:
    # Natural Earth varies; use best-effort ISO3 extraction.
    candidates = [
        props.get("ISO_A3_EH"),
        props.get("ISO_A3"),
        props.get("ADM0_A3"),
        props.get("WB_A3"),
        props.get("SOV_A3"),
    ]
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        val = candidate.strip().upper()
        if len(val) == 3 and val.isalpha() and val != "-99":
            return val
    return None


@lru_cache(maxsize=1)
def _load_naturalearth_admin0_features() -> List[Tuple[str, Tuple[float, float, float, float], Any]]:
    """
    Returns list of (iso3, bounds, shapely_geom) for world Admin0.
    Cached in-process for fast AOI intersection.
    """
    shp = _ensure_naturalearth_admin0()
    if not shp:
        return []
    out: List[Tuple[str, Tuple[float, float, float, float], Any]] = []
    with fiona.open(str(shp)) as src:
        for feat in src:
            geom = feat.get("geometry")
            if not geom:
                continue
            props = feat.get("properties") or {}
            iso3 = _iso3_from_naturalearth_props(props)
            if not iso3:
                continue
            try:
                sgeom = shape(geom)
            except Exception:
                continue
            out.append((iso3, sgeom.bounds, sgeom))
    return out


def _bbox_intersects(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def _aoi_countries_admin0(geom: Any) -> List[str]:
    """
    Return ISO3 country codes intersecting the AOI polygon, using Natural Earth Admin0.
    """
    aoi_bounds = geom.bounds
    hits: List[str] = []
    seen: set[str] = set()
    for iso3, bounds, country_geom in _load_naturalearth_admin0_features():
        if iso3 in seen:
            continue
        if not _bbox_intersects(aoi_bounds, bounds):
            continue
        try:
            if country_geom.intersects(geom):
                seen.add(iso3)
                hits.append(iso3)
        except Exception:
            continue
    return hits


def _ensure_gadm_level(country_iso3: str, level: int) -> Optional[Path]:
    """
    Ensure a GADM level GeoPackage exists locally and return its path.
    Uses GADM 4.1 gpkg downloads and extracts a single level for performance.
    """
    iso3 = (country_iso3 or "").strip().upper()
    if len(iso3) != 3:
        return None
    GADM_DIR.mkdir(parents=True, exist_ok=True)

    extracted = GADM_DIR / f"gadm41_{iso3}_adm{level}.gpkg"
    if extracted.exists():
        return extracted

    full = GADM_DIR / f"gadm41_{iso3}.gpkg"
    if not full.exists():
        url = f"https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_{iso3}.gpkg"
        _download_url_to_path(url, full, timeout_s=300)
        if not full.exists():
            return None

    try:
        layers = list(fiona.listlayers(str(full)))
    except Exception:
        layers = []

    preferred = f"ADM_ADM_{level}"
    layer = preferred if preferred in layers else None
    if not layer:
        suffix = f"_{level}"
        for cand in layers:
            if isinstance(cand, str) and cand.endswith(suffix):
                layer = cand
                break
    if not layer and layers:
        layer = layers[0]
    if not layer:
        return None

    # Extract chosen layer into a smaller GPKG.
    temp_out = extracted.with_suffix(".gpkg.tmp")
    try:
        cmd = ["ogr2ogr", "-f", "GPKG", str(temp_out), str(full), layer]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if result.returncode != 0 or not temp_out.exists():
            if temp_out.exists():
                temp_out.unlink(missing_ok=True)  # type: ignore[arg-type]
            return None
        if extracted.exists():
            extracted.unlink(missing_ok=True)  # type: ignore[arg-type]
        temp_out.replace(extracted)
        return extracted
    except Exception:
        try:
            if temp_out.exists():
                temp_out.unlink()
        except OSError:
            pass
        return None


def _admin1_from_gadm_props(props: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """
    Return (admin1_name, admin1_code) best-effort from a GADM feature properties.
    """
    name_candidates = [
        props.get("NAME_1"),
        props.get("NAME"),
        props.get("VARNAME_1"),
        props.get("NAME_EN"),
    ]
    code_candidates = [
        props.get("ISO_1"),
        props.get("HASC_1"),
        props.get("GID_1"),
    ]
    name = next((str(v).strip() for v in name_candidates if isinstance(v, str) and v.strip()), None)
    code = next((str(v).strip() for v in code_candidates if isinstance(v, str) and v.strip()), None)
    return name, code


def _aoi_admin1_for_country(aoi_geom: Any, iso3: str) -> List[Dict[str, Optional[str]]]:
    """
    Return Admin1 units intersecting the AOI for a given ISO3 country.
    """
    path = _ensure_gadm_level(iso3, level=1)
    if not path:
        return []
    try:
        layers = list(fiona.listlayers(str(path)))
        layer = layers[0] if layers else None
    except Exception:
        layer = None
    if not layer:
        return []

    aoi_bounds = aoi_geom.bounds
    out: List[Dict[str, Optional[str]]] = []
    seen: set[str] = set()
    with fiona.open(str(path), layer=layer) as src:
        for feat in src:
            geom = feat.get("geometry")
            if not geom:
                continue
            try:
                fgeom = shape(geom)
            except Exception:
                continue
            if not _bbox_intersects(aoi_bounds, fgeom.bounds):
                continue
            try:
                if not fgeom.intersects(aoi_geom):
                    continue
            except Exception:
                continue
            props = feat.get("properties") or {}
            name, code = _admin1_from_gadm_props(props)
            key = (code or name or "").strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append({"iso3": iso3, "admin1_name": name, "admin1_code": code})
    return out


def compute_aoi_jurisdictions(aoi_feature_collection: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute AOI intersecting jurisdictions:
    - countries (Admin0): ISO3 list
    - admin1: list of { iso3, admin1_name, admin1_code }
    """
    geom = _collect_geometry(aoi_feature_collection)
    countries = _aoi_countries_admin0(geom)
    admin1: List[Dict[str, Optional[str]]] = []
    for iso3 in countries:
        admin1.extend(_aoi_admin1_for_country(geom, iso3))
    return {"countries_iso3": countries, "admin1": admin1}


def _global_row_applicable_to_project(row: Dict[str, str], project_iso3: str) -> bool:
    dataset = _sanitize_str(row.get("Dataset")) or ""
    if dataset.lower() == "copernicus dem eea-10":
        return project_iso3 in EEA39_ISO3
    return True


class ProjectMetadata(BaseModel):
    """Project metadata model"""
    project_name: str
    project_id: Optional[str] = None
    project_code: Optional[str] = None
    client: Optional[str] = None
    date_created: Optional[str] = None
    status: Optional[str] = None
    crs: Optional[Dict[str, Any]] = None
    aoi: Optional[Dict[str, Any]] = None
    measurement_system: Optional[str] = None
    units: Optional[Dict[str, str]] = None
    country: Optional[str] = None
    iso3: Optional[str] = None
    iso3_list: Optional[List[str]] = None
    countries: Optional[List[Dict[str, str]]] = None
    organization: Optional[str] = None
    department: Optional[str] = None
    project_creator: Optional[str] = None
    project_type: Optional[str] = None
    # Folder / visibility (populated from DB when available)
    folder_id: Optional[str] = None
    folder_name: Optional[str] = None
    folder_color: Optional[str] = None
    visibility: Optional[str] = "public"


class DatasetInfo(BaseModel):
    """Dataset information model"""
    name: str
    type: str  # 'raster' or 'vector'
    path: str
    metadata: Optional[Dict[str, Any]] = None


class ProjectDatasets(BaseModel):
    """Project datasets model"""
    rasters: List[DatasetInfo]
    vectors: List[DatasetInfo]


class DatasetCoverageEntry(BaseModel):
    dataset: str
    source: Optional[str] = None
    data_type: Optional[str] = None
    access: Optional[str] = None
    coverage: Optional[str] = None
    temporal_start: Optional[str] = None
    temporal_end: Optional[str] = None
    frequency: Optional[str] = None
    applies_globally: bool = False
    url: Optional[str] = None


class DatasetCoverageResponse(BaseModel):
    iso3: str
    country: Optional[str]
    entries: List[DatasetCoverageEntry]
    summary: Optional[str] = None
    protocol_reference: str


class EngineeringStandardEntry(BaseModel):
    """Engineering/design standard catalogue entry (non-regulatory)."""

    standard: str
    source: Optional[str] = None
    type: Optional[str] = None
    type_detail: Optional[str] = None
    access: Optional[str] = None
    temporal_start: Optional[str] = None
    temporal_end: Optional[str] = None
    frequency: Optional[str] = None
    coverage: Optional[str] = None
    url: Optional[str] = None
    resolution: Optional[str] = None
    quality: Optional[str] = None
    notes: Optional[str] = None
    api_available: Optional[str] = None
    origins: Optional[str] = None
    applies_globally: bool = False


class EngineeringStandardsResponse(BaseModel):
    iso3: str
    country: Optional[str]
    entries: List[EngineeringStandardEntry]
    catalog_reference: str


class RegulationCatalogueEntry(BaseModel):
    entry_id: str
    title: str
    entry_type: Optional[str] = None
    category: Optional[str] = None
    project_applicability: Optional[str] = None
    coverage_level: Optional[str] = None
    coverage_group: Optional[str] = None
    iso3: Optional[str] = None
    admin1_name: Optional[str] = None
    admin1_code: Optional[str] = None
    admin2_name: Optional[str] = None
    admin2_code: Optional[str] = None
    authority: Optional[str] = None
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    source_type: Optional[str] = None
    direct_download_url: Optional[str] = None
    direct_download_file_name: Optional[str] = None
    direct_download_content_type: Optional[str] = None
    filing_category: Optional[str] = None
    status: Optional[str] = None
    effective_date: Optional[str] = None
    last_amended_date: Optional[str] = None
    last_verified_date: Optional[str] = None
    language: Optional[str] = None
    notes: Optional[str] = None
    related_entry_ids: Optional[str] = None


class MatchedRegulationEntry(RegulationCatalogueEntry):
    match_scope: str
    match_reason: str


class RegulationsResponse(BaseModel):
    project: str
    generated_at: str
    catalog_reference: str
    countries_iso3: List[str]
    admin1: List[Dict[str, Optional[str]]]
    entries: List[MatchedRegulationEntry]
    snapshot_path: Optional[str] = None


class RegulationIndexResponse(BaseModel):
    stored_path: str
    filename: str
    category: str
    size_bytes: int
    media_type: Optional[str] = None


class ProjectCRSRecommendation(BaseModel):
    epsg: int
    name: str
    reason: str
    utm_zone: Optional[int] = None
    hemisphere: Optional[str] = None


class UpdateProjectCRSRequest(BaseModel):
    epsg: int
    name: str


class RegulatoryDoc(BaseModel):
    name: str
    category: str  # national, regional, local, technical, industry
    path: str
    size_bytes: Optional[int] = None
    last_modified: Optional[str] = None


class RegulatoryDocsResponse(BaseModel):
    documents: List[RegulatoryDoc]
    index_content: Optional[str] = None
    sources_content: Optional[str] = None


class AOIPreviewResponse(BaseModel):
    area_km2: float
    countries: List[str]
    iso3: Optional[str] = None
    country: Optional[str] = None
    centroid: Dict[str, float]
    recommended_crs: ProjectCRSRecommendation
    start_point_within: Optional[bool] = None
    end_point_within: Optional[bool] = None


def _sanitize_project_name(name: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9-]+", "-", name).strip("-")
    if not sanitized:
        raise HTTPException(status_code=400, detail="Project name must contain letters, numbers, or hyphens.")
    return sanitized


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=4)


@lru_cache(maxsize=512)
def _gdalinfo_json_cached(path_str: str, mtime_ns: int, include_stats: bool) -> Optional[Dict[str, Any]]:
    """
    Probe raster metadata with process-level memoization.

    Keyed by full path + mtime so repeat requests for unchanged rasters avoid
    expensive subprocess calls. This significantly reduces latency for
    /projects/{name}/datasets on large projects.
    """
    try:
        cmd = ["gdalinfo", "-json"]
        if include_stats:
            cmd.append("-stats")
        cmd.append(path_str)

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30 if include_stats else 12,
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except Exception:
        return None


def _gdalinfo_json(path: Path, include_stats: bool = False) -> Optional[Dict[str, Any]]:
    """
    Probe raster metadata using GDAL with mtime-aware memoization.
    """
    try:
        mtime_ns = int(path.stat().st_mtime_ns)
    except Exception:
        return None
    return _gdalinfo_json_cached(str(path), mtime_ns, include_stats)


def _raster_metadata_needs_probe(metadata: Dict[str, Any]) -> bool:
    """
    Return True when metadata is too sparse for map/data consumers.
    """
    if not isinstance(metadata, dict) or not metadata:
        return True

    required_keys = (
        "dataset_name",
        "data_type",
        "format",
        "probed_crs",
        "extent",
        "bbox_wgs84",
        "pixel_data_type",
        "dimensions",
    )
    for key in required_keys:
        value = metadata.get(key)
        if value in (None, "", [], {}):
            return True
    return False


def _extract_epsg_from_gdalinfo(info: Dict[str, Any]) -> Optional[str]:
    cs = info.get("coordinateSystem") or {}
    wkt = cs.get("wkt") if isinstance(cs, dict) else None
    if not isinstance(wkt, str) or not wkt:
        return None
    # Match EPSG authority codes in WKT fragments like: ID["EPSG",4326]
    matches = re.findall(r'ID\["EPSG",\s*(\d+)\]', wkt)
    if not matches:
        return None
    crs_codes = [int(m) for m in matches if not (8000 <= int(m) < 10000)]
    if crs_codes:
        return f"EPSG:{crs_codes[-1]}"
    return f"EPSG:{matches[-1]}"


def _collect_bounds_from_geojson(geom: Dict[str, Any]) -> Optional[Tuple[float, float, float, float]]:
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]

    def _walk(coords: Any) -> None:
        if coords is None:
            return
        if isinstance(coords, (list, tuple)):
            if coords and isinstance(coords[0], (int, float)):
                x, y = coords[:2]
                bounds[0] = min(bounds[0], float(x))
                bounds[1] = min(bounds[1], float(y))
                bounds[2] = max(bounds[2], float(x))
                bounds[3] = max(bounds[3], float(y))
            else:
                for part in coords:
                    _walk(part)

    def _collect(obj: Any) -> None:
        if obj is None:
            return
        geom_type = obj.get("type") if isinstance(obj, dict) else None
        if geom_type == "FeatureCollection":
            for feature in obj.get("features", []):
                _collect(feature.get("geometry"))
        elif geom_type == "Feature":
            _collect(obj.get("geometry"))
        elif geom_type == "GeometryCollection":
            for g in obj.get("geometries", []):
                _collect(g)
        else:
            if isinstance(obj, dict):
                _walk(obj.get("coordinates"))

    _collect(geom)
    if (
        float("inf") in bounds
        or float("-inf") in bounds
        or bounds[0] == bounds[2]
        or bounds[1] == bounds[3]
    ):
        return None
    return bounds[0], bounds[1], bounds[2], bounds[3]


def _bbox_from_wgs84_extent(extent_geom: Dict[str, Any]) -> Optional[Dict[str, float]]:
    bounds = _collect_bounds_from_geojson(extent_geom)
    if not bounds:
        return None
    minx, miny, maxx, maxy = bounds
    return {"west": minx, "south": miny, "east": maxx, "north": maxy, "crs": "EPSG:4326"}


def _extent_from_gdalinfo(info: Dict[str, Any], crs_override: Optional[str] = None) -> Optional[Dict[str, float]]:
    corners = info.get("cornerCoordinates")
    if not isinstance(corners, dict):
        return None
    xs: List[float] = []
    ys: List[float] = []
    for point in corners.values():
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            xs.append(float(point[0]))
            ys.append(float(point[1]))
    if not xs or not ys:
        return None
    native_crs = crs_override or _extract_epsg_from_gdalinfo(info) or "unknown"
    return {
        "minx": min(xs),
        "miny": min(ys),
        "maxx": max(xs),
        "maxy": max(ys),
        "crs": native_crs,
    }


def _gdal_type_bit_depth(gdal_type: Optional[str]) -> Optional[int]:
    if not gdal_type:
        return None
    t = str(gdal_type).strip()
    if not t:
        return None
    if t.lower() == "byte":
        return 8
    m = re.search(r"(\d+)", t)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _gdal_type_pixel_kind(gdal_type: Optional[str]) -> Optional[str]:
    if not gdal_type:
        return None
    t = str(gdal_type).strip().lower()
    if not t:
        return None
    if t.startswith(("cfloat", "complex")):
        return "complex"
    if t.startswith("float"):
        return "floating_point"
    if t.startswith(("int", "uint")) or t == "byte":
        return "integer"
    return None


def _extract_wgs84_center_lat(info: Dict[str, Any]) -> Optional[float]:
    wgs84 = info.get("wgs84Extent")
    if not isinstance(wgs84, dict):
        return None
    bbox = _bbox_from_wgs84_extent(wgs84)
    if not bbox:
        return None
    try:
        return (float(bbox["north"]) + float(bbox["south"])) / 2.0
    except (TypeError, ValueError, KeyError):
        return None


def _extract_raster_statistics_from_gdalinfo(info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    bands = info.get("bands")
    if not isinstance(bands, list) or not bands:
        return None

    def _safe_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    out: Dict[str, Any] = {
        "min": None,
        "max": None,
        "mean": None,
        "stddev": None,
    }
    band0 = bands[0] if isinstance(bands[0], dict) else {}
    out["min"] = _safe_float(band0.get("minimum"))
    out["max"] = _safe_float(band0.get("maximum"))
    out["mean"] = _safe_float(band0.get("mean"))
    out["stddev"] = _safe_float(band0.get("stdDev"))

    stats_meta = (band0.get("metadata") or {}).get("", {})
    if isinstance(stats_meta, dict):
        if out["min"] is None:
            out["min"] = _safe_float(stats_meta.get("STATISTICS_MINIMUM"))
        if out["max"] is None:
            out["max"] = _safe_float(stats_meta.get("STATISTICS_MAXIMUM"))
        if out["mean"] is None:
            out["mean"] = _safe_float(stats_meta.get("STATISTICS_MEAN"))
        if out["stddev"] is None:
            out["stddev"] = _safe_float(stats_meta.get("STATISTICS_STDDEV"))
        valid_pct = _safe_float(stats_meta.get("STATISTICS_VALID_PERCENT"))
        if valid_pct is not None:
            out["valid_percent"] = valid_pct

    if any(v is not None for v in out.values()):
        # Drop None values for cleanliness
        return {k: v for k, v in out.items() if v is not None}
    return None


def _extract_raster_technical_fields_from_gdalinfo(info: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}

    if info.get("driverShortName"):
        out["driver"] = str(info["driverShortName"])
    if info.get("driverLongName"):
        out["driver_long_name"] = str(info["driverLongName"])

    size = info.get("size")
    width: Optional[int] = None
    height: Optional[int] = None
    if isinstance(size, list) and len(size) >= 2:
        try:
            width = int(size[0])
            height = int(size[1])
            out["dimensions"] = {"width": width, "height": height}
        except (TypeError, ValueError):
            width = None
            height = None

    geo = info.get("geoTransform")
    if isinstance(geo, list) and len(geo) >= 6:
        out["geotransform"] = geo
        try:
            cell_x = abs(float(geo[1]))
            cell_y = abs(float(geo[5]))
            out["cell_size"] = {"x": cell_x, "y": cell_y}
        except (TypeError, ValueError):
            pass

    bands = info.get("bands")
    if isinstance(bands, list):
        out["band_count"] = len(bands)
        if bands:
            b0 = bands[0] if isinstance(bands[0], dict) else {}

            nodata = b0.get("noDataValue")
            if nodata is not None:
                out["nodata_value"] = nodata

            gdal_type = b0.get("type")
            if gdal_type:
                out["pixel_data_type"] = gdal_type
                bits = _gdal_type_bit_depth(str(gdal_type))
                if bits is not None:
                    out["pixel_depth_bits"] = bits
                    if width and height:
                        try:
                            out["uncompressed_size_bytes"] = (
                                int(width)
                                * int(height)
                                * max(1, len(bands))
                                * ((bits + 7) // 8)
                            )
                        except Exception:
                            pass
                kind = _gdal_type_pixel_kind(str(gdal_type))
                if kind:
                    out["pixel_type"] = kind

            block = b0.get("block")
            if isinstance(block, list) and len(block) >= 2:
                out["block_size"] = {"x": block[0], "y": block[1]}

            if b0.get("colorInterpretation"):
                out["color_interpretation"] = b0.get("colorInterpretation")

            out["has_colormap"] = "colorTable" in b0

            ovs = b0.get("overviews")
            if isinstance(ovs, list):
                out["pyramid_levels"] = len(ovs)
                out["overviews"] = ovs

            if b0.get("unitType"):
                out["unit_type"] = b0.get("unitType")

    md = info.get("metadata") or {}
    if isinstance(md, dict):
        img_struct = md.get("IMAGE_STRUCTURE") or {}
        if isinstance(img_struct, dict):
            if img_struct.get("COMPRESSION"):
                out["compression"] = img_struct.get("COMPRESSION")
            if img_struct.get("INTERLEAVE"):
                out["interleave"] = img_struct.get("INTERLEAVE")

    # Resolution meters-per-pixel
    if isinstance(geo, list) and len(geo) >= 6:
        try:
            cell_x_native = abs(float(geo[1]))
            cell_y_native = abs(float(geo[5]))
        except (TypeError, ValueError):
            cell_x_native = None
            cell_y_native = None

        cs = info.get("coordinateSystem") or {}
        wkt = cs.get("wkt") if isinstance(cs, dict) else None
        if isinstance(wkt, str) and cell_x_native and cell_y_native:
            wkt_top = wkt.lstrip().upper()
            is_geographic = wkt_top.startswith("GEOGCRS[") or wkt_top.startswith("GEOGCS[")
            if is_geographic:
                out["cell_size_units"] = "degree"
                lat = _extract_wgs84_center_lat(info)
                if lat is not None:
                    lat_rad = math.radians(float(lat))
                    x_m = cell_x_native * 111_320.0 * max(0.0, math.cos(lat_rad))
                    y_m = cell_y_native * 111_320.0
                    out["resolution_x_m"] = x_m
                    out["resolution_y_m"] = y_m
                    out["resolution_m"] = (x_m + y_m) / 2.0
            else:
                matches = re.findall(r'LENGTHUNIT\["([^"]+)",\s*([-0-9.eE\+]+)\]', wkt)
                unit_name = None
                unit_to_m = None
                if matches:
                    unit_name = matches[-1][0]
                    try:
                        unit_to_m = float(matches[-1][1])
                    except ValueError:
                        unit_to_m = None
                if unit_name:
                    out["cell_size_units"] = unit_name
                if unit_to_m is not None:
                    x_m = cell_x_native * unit_to_m
                    y_m = cell_y_native * unit_to_m
                    out["resolution_x_m"] = x_m
                    out["resolution_y_m"] = y_m
                    out["resolution_m"] = (x_m + y_m) / 2.0

    return out


def _save_upload_to_temp(upload: UploadFile, temp_dir: Path) -> Path:
    destination = temp_dir / upload.filename
    with destination.open("wb") as buffer:
        shutil.copyfileobj(upload.file, buffer)
    upload.file.seek(0)
    return destination


def _convert_vector_to_geojson(source_path: Path, temp_dir: Path) -> Dict[str, Any]:
    if source_path.suffix.lower() in [".json", ".geojson"]:
        with source_path.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    output = temp_dir / "converted.geojson"
    cmd = [
        "ogr2ogr",
        "-f",
        "GeoJSON",
        str(output),
        str(source_path),
        "-t_srs",
        "EPSG:4326",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=400, detail=f"Failed to convert AOI: {result.stderr}")
    with output.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _collect_geometry(feature_collection: Dict[str, Any]):
    features = feature_collection.get("features") or []
    geometries = []
    for feature in features:
        geometry = feature.get("geometry")
        if not geometry:
            continue
        geometries.append(shape(geometry))
    if not geometries:
        raise HTTPException(status_code=400, detail="No geometry found in AOI.")
    if len(geometries) == 1:
        return geometries[0]
    return unary_union(geometries)


def _calculate_area_km2(feature_collection: Dict[str, Any]) -> float:
    geom = _collect_geometry(feature_collection)
    area, _ = GEOD.geometry_area_perimeter(geom)
    return round(abs(area) / 1_000_000, 2)


def _infer_country_from_point(lat: float, lon: float) -> Tuple[Optional[str], Optional[str]]:
    try:
        results = rg.search([(lat, lon)], mode=1)
    except Exception:
        return None, None
    if not results:
        return None, None
    iso2 = results[0].get("cc")
    if not iso2:
        return None, None
    try:
        country = pycountry.countries.get(alpha_2=iso2.upper())
        if not country:
            return None, None
        return country.alpha_3, country.name
    except Exception:
        return None, None


def _create_point_feature(lat: float, lon: float) -> Dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {},
            }
        ],
    }


def _ensure_directories(base: Path) -> None:
    """Create all required directories per PROJECT_STRUCTURE_STANDARD.md"""
    directories = [
        base / "aoi",
        base / "data" / "rasters" / "raw",
        base / "data" / "rasters" / "processed",
        base / "data" / "vectors" / "raw",
        base / "data" / "vectors" / "processed",
        # Operator / Creator Mode (AOI/POI annotations)
        base / "data" / "creator" / "entries",
        base / "data" / "creator" / "attachments",
        base / "data" / "creator" / "changelog",
        # Operator Sorties (field visit sessions)
        base / "data" / "sorties" / "entries",
        base / "data" / "sorties" / "changelog",
        base / "inputs",
        base / "scripts",
        base / "derived" / "terrain_analysis",
        base / "derived" / "cost_surfaces",
        base / "derived" / "constraints",
        base / "outputs" / "routing_results",
        base / "outputs" / "reports",
        base / "outputs" / "figures",
        base / "PIRL" / "models" / "best_model",
        base / "PIRL" / "models" / "checkpoints",
        base / "PIRL" / "outputs",
        base / "PIRL" / "logs",
        base / "PIRL" / "parameter_tuner",
        base / "logs",
        base / "docs",
        base / "docs" / "cost_matrix",
        base / "docs" / "regulatory_docs" / "supranational",
        base / "docs" / "regulatory_docs" / "national",
        base / "docs" / "regulatory_docs" / "regional",
        base / "docs" / "regulatory_docs" / "local",
        base / "docs" / "regulatory_docs" / "technical",
        base / "docs" / "regulatory_docs" / "industry",
        base / "docs" / "perplexity_research" / "queries",
    ]
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)


def _touch_logs(base: Path) -> None:
    log_files = [
        base / "logs" / "project.log",
        base / "logs" / "fetch.log",
        base / "logs" / "dataset_fetch.log",
        base / "logs" / "processing.log",
        base / "logs" / "perplexity_queries.log",
    ]
    for log_file in log_files:
        log_file.touch(exist_ok=True)


def _copy_template_if_exists(source: Path, destination: Path) -> None:
    if source.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(source, destination)


def _process_aoi_to_gpkg(
    aoi_geojson_path: Path,
    output_dir: Path,
    epsg: int,
    date_acquired: str,
) -> None:
    """
    Convert AOI GeoJSON to GeoPackage, reproject to project CRS,
    and save to data/vectors/processed/ with metadata sidecar.
    """
    output_gpkg = output_dir / f"aoi_epsg{epsg}_processed.gpkg"
    output_json = output_dir / f"aoi_epsg{epsg}_processed.gpkg.json"
    
    # Use ogr2ogr to convert and reproject
    cmd = [
        "ogr2ogr",
        "-f", "GPKG",
        "-t_srs", f"EPSG:{epsg}",
        "-nln", "aoi",
        str(output_gpkg),
        str(aoi_geojson_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # Log error but don't fail project creation
        print(f"Warning: Failed to process AOI to GPKG: {result.stderr}")
        return
    
    # Create metadata sidecar
    metadata = {
        "dataset_name": "Area of Interest",
        "filename": output_gpkg.name,
        "category": "aoi",
        "type": "vector",
        "format": "GeoPackage",
        "geometry_type": "Polygon",
        "source": "User-provided AOI",
        "provider": "Project initialization",
        "target_crs": f"EPSG:{epsg}",
        "original_crs": "EPSG:4326",
        "reprojected": True,
        "date_acquired": date_acquired,
        "fetch_tool": "project_creation",
        "processing_steps": ["reproject", "convert"],
        "validation_status": "passed",
        "metadata_version": "2.0",
    }
    _write_json(output_json, metadata)


def _create_readme_files(base: Path, project_name: str) -> None:
    """Create standard README files per PROJECT_STRUCTURE_STANDARD.md"""
    
    # inputs/README.md
    inputs_readme = base / "inputs" / "README.md"
    inputs_readme.write_text(f"""# Input Materials - {project_name}

This directory contains client-provided materials for the project.

## Contents

| File | Description | Date Added |
|------|-------------|------------|
| (No files yet) | | |

## Notes

- Add all client-provided PDFs, drawings, specifications, and data here
- Update this index when adding new materials
- Do not modify original files; create copies in `scripts/` if processing is needed
""", encoding="utf-8")

    # scripts/README.md
    scripts_readme = base / "scripts" / "README.md"
    scripts_readme.write_text(f"""# Project Scripts - {project_name}

This directory contains project-specific scripts for data fetching, processing, and validation.

## Script Categories

### Data Fetching (`fetch_*.sh`)
Scripts for acquiring datasets from external sources.

### Processing (`process_*.sh`)
Scripts for geoprocessing operations (reprojection, clipping, mosaicking).

### Validation (`validate_*.py`)
Scripts for validating dataset quality and compliance.

## Usage

All scripts should be run from the project root directory:

```bash
cd /opt/agrs/Projects/{project_name}
./scripts/fetch_example.sh
```

## Notes

- Document all scripts with usage instructions
- Log all operations to `logs/` directory
- Follow the AGRS coding standards
""", encoding="utf-8")

    # docs/README.md
    docs_readme = base / "docs" / "README.md"
    docs_readme.write_text(f"""# Project Documentation - {project_name}

This directory contains all project documentation.

## Directory Structure

```
docs/
├── README.md                    # This file
├── data_sources.md              # Dataset sources and acquisition details
├── project_confirmation_report.md  # Project confirmation report
├── cost_matrix/                 # PIRL cost matrix data
│   ├── COST_MATRIX_COMPLETE.csv
│   ├── COST_MATRIX_COMPLETE.xlsx
│   └── COST_MATRIX_README.md
├── regulatory_docs/             # Regulatory documentation
│   ├── national/
│   ├── regional/
│   ├── local/
│   ├── regulatory_index.md
│   └── regulatory_document_sources.md
└── perplexity_research/         # AI research outputs
    ├── aoi_intelligence.md
    ├── regulatory_authorities.md
    ├── stakeholders.md
    ├── permitting.md
    ├── environmental_constraints.md
    ├── risk_assessment.md
    ├── research_summary.md
    └── queries/
```

## Required Documentation

See `/opt/agrs/docs/Project Instructions/PROJECT_STRUCTURE_STANDARD.md` for complete documentation requirements.
""", encoding="utf-8")

    # docs/regulatory_docs/regulatory_index.md
    reg_index = base / "docs" / "regulatory_docs" / "regulatory_index.md"
    reg_index.write_text(f"""# Regulatory Documentation Index - {project_name}

**Project:** {project_name}  
**Date Compiled:** (Pending)  
**Status:** Awaiting regulatory research

## National-Level Regulations

(To be populated after Perplexity research)

## Regional Regulations

(To be populated after Perplexity research)

## Local Regulations

(To be populated after Perplexity research)

## Technical Standards

(To be populated - ASME, ISO, API, etc.)

## Action Items

- [ ] Complete Perplexity regulatory research
- [ ] Download all relevant regulatory documents
- [ ] Review documents with legal team
- [ ] Identify required permits and applications
- [ ] Establish compliance checklist
- [ ] Schedule regulatory agency consultations

---

See `/opt/agrs/docs/Project Instructions/PROJECT_STRUCTURE_STANDARD.md` for regulatory documentation requirements.
""", encoding="utf-8")

    # docs/cost_matrix/COST_MATRIX_README.md
    cost_readme = base / "docs" / "cost_matrix" / "COST_MATRIX_README.md"
    cost_readme.write_text(f"""# Cost Matrix Documentation - {project_name}

This directory contains the cost matrix data used for PIRL training.

## Files

| File | Description |
|------|-------------|
| `COST_MATRIX_COMPLETE.csv` | Complete cost matrix in CSV format |
| `COST_MATRIX_COMPLETE.xlsx` | Cost matrix with formatting (optional) |

## Cost Categories

The cost matrix should include the following categories:

1. **Terrain Costs** - Slope, elevation change, terrain type
2. **Land Cover Costs** - Per-meter costs for different land cover classes
3. **Infrastructure Crossing Costs** - Roads, railways, pipelines, power lines
4. **Environmental Costs** - Protected areas, sensitive habitats
5. **Hydraulic Costs** - Compressor requirements, pressure drop
6. **Construction Costs** - Soil type, accessibility, seasonal factors

## Data Sources

Document all cost assumptions and data sources here:

- (To be populated)

## Notes

- All costs should be in consistent units (USD per meter or per crossing)
- Document any regional adjustments or multipliers
- Update when new cost data becomes available
""", encoding="utf-8")


def _generate_project_id(organization: str, project_name: str, iso3: Optional[str]) -> str:
    org = re.sub(r"[^A-Za-z0-9]+", "", organization.upper()) or "ORG"
    name = re.sub(r"[^A-Za-z0-9]+", "_", project_name).strip("_") or "PROJECT"
    iso = (iso3 or "UNK").upper()
    year = datetime.utcnow().year

    prefix = f"{org}_{name}_{iso}_{year}_"
    existing = discover_project_paths()
    seq = 1
    for project_dir in existing.values():
        metadata_path = project_dir / "project_metadata.json"
        metadata = load_json_file(metadata_path) if metadata_path.exists() else None
        project_id = metadata.get("project_id") if metadata else None
        if project_id and project_id.startswith(prefix):
            try:
                suffix = int(project_id.split("_")[-1])
                seq = max(seq, suffix + 1)
            except ValueError:
                continue
    return f"{prefix}{seq:03d}"


def _load_geojson_string(payload: str) -> Dict[str, Any]:
    try:
        data = json.loads(payload)
        if data.get("type") != "FeatureCollection":
            raise ValueError("Expected FeatureCollection")
        return data
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid GeoJSON payload: {exc}") from exc


def _prepare_aoi_payload(
    aoi_file: Optional[UploadFile],
    drawn_geojson: Optional[str],
    temp_dir: Path,
) -> Dict[str, Any]:
    if aoi_file:
        saved = _save_upload_to_temp(aoi_file, temp_dir)
        return _convert_vector_to_geojson(saved, temp_dir)
    if drawn_geojson:
        return _load_geojson_string(drawn_geojson)
    raise HTTPException(status_code=400, detail="AOI geometry is required.")


def _extract_point_from_file(upload: UploadFile, temp_dir: Path) -> Tuple[float, float]:
    saved = _save_upload_to_temp(upload, temp_dir)
    geojson = _convert_vector_to_geojson(saved, temp_dir)
    features = geojson.get("features") or []
    if not features:
        raise HTTPException(status_code=400, detail="Start/end point file is empty.")
    geom = features[0].get("geometry")
    if not geom or geom.get("type") != "Point":
        raise HTTPException(status_code=400, detail="Start/end point must contain a Point geometry.")
    coordinates = geom.get("coordinates") or []
    if len(coordinates) < 2:
        raise HTTPException(status_code=400, detail="Point geometry missing coordinates.")
    lon, lat = coordinates[:2]
    return float(lat), float(lon)


def _write_geojson(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh)


@router.post("/projects/aoi/preview", response_model=AOIPreviewResponse)
async def preview_aoi(
    aoi_file: Optional[UploadFile] = File(None),
    drawn_geojson: Optional[str] = Form(None),
    start_point_lat: Optional[float] = Form(None),
    start_point_lon: Optional[float] = Form(None),
    end_point_lat: Optional[float] = Form(None),
    end_point_lon: Optional[float] = Form(None),
):
    """
    Analyze AOI geometry to provide area, centroid, inferred countries, and recommended CRS.
    Optionally checks if start/end points are within the AOI.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_dir = Path(tmpdir)
        feature_collection = _prepare_aoi_payload(aoi_file, drawn_geojson, temp_dir)
        geom = _collect_geometry(feature_collection)
        area_km2 = _calculate_area_km2(feature_collection)
        centroid = geom.centroid
        iso3, country_name = _infer_country_from_point(centroid.y, centroid.x)
        zone, hemi, epsg = _calculate_utm_zone(centroid.x, centroid.y)
        crs_name = f"WGS 84 / UTM zone {zone}{hemi}"

        # Check if points are within AOI
        start_point_within = None
        end_point_within = None
        
        if start_point_lat is not None and start_point_lon is not None:
            start_pt = Point(start_point_lon, start_point_lat)
            start_point_within = geom.contains(start_pt) or geom.touches(start_pt)
        
        if end_point_lat is not None and end_point_lon is not None:
            end_pt = Point(end_point_lon, end_point_lat)
            end_point_within = geom.contains(end_pt) or geom.touches(end_pt)

        return AOIPreviewResponse(
            area_km2=area_km2,
            countries=[country_name] if country_name else [],
            iso3=iso3,
            country=country_name,
            centroid={"lat": centroid.y, "lon": centroid.x},
            recommended_crs=ProjectCRSRecommendation(
                epsg=epsg,
                name=crs_name,
                reason=f"AOI centroid at ({centroid.y:.4f}, {centroid.x:.4f})",
                utm_zone=zone,
                hemisphere=hemi,
            ),
            start_point_within=start_point_within,
            end_point_within=end_point_within,
        )


class PointPreviewResponse(BaseModel):
    latitude: float
    longitude: float


@router.post("/projects/point/preview", response_model=PointPreviewResponse)
async def preview_point(
    point_file: UploadFile = File(...),
):
    """
    Parse a point file (GeoJSON, KML, KMZ, GPKG) and return its coordinates.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_dir = Path(tmpdir)
        lat, lon = _extract_point_from_file(point_file, temp_dir)
        return PointPreviewResponse(latitude=lat, longitude=lon)


@router.get("/projects", response_model=List[ProjectMetadata])
async def list_projects(
    user: Optional[Dict[str, Any]] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Discover and list all valid projects in /opt/agrs/Projects/.

    Enriches each project with folder/visibility metadata from the DB.
    Restricted projects are hidden from non-members unless the caller is a superadmin.
    """
    from .project_folders import get_project_org_map, get_user_project_names

    org_map = get_project_org_map(db)

    member_names: set[str] = set()
    is_superadmin = False
    if user:
        is_superadmin = user.get("role") == "superadmin"
        if not is_superadmin:
            try:
                uid = uuid.UUID(str(user.get("id")))
                member_names = get_user_project_names(db, uid)
            except Exception:
                pass

    projects: list[ProjectMetadata] = []

    project_dirs = discover_project_paths()
    for _, project_dir in sorted(project_dirs.items()):
        pname = project_dir.name
        org = org_map.get(pname, {})
        vis = org.get("visibility", "public")

        if vis == "restricted" and not is_superadmin and pname not in member_names:
            continue

        metadata_file = project_dir / "project_metadata.json"
        metadata = load_json_file(metadata_file) if metadata_file.exists() else None

        if metadata:
            normalized = _normalize_project_metadata(metadata, project_dir)
            pm = ProjectMetadata(**normalized)
        else:
            pm = ProjectMetadata(project_name=pname)

        pm.folder_id = org.get("folder_id")
        pm.folder_name = org.get("folder_name")
        pm.folder_color = org.get("folder_color")
        pm.visibility = vis
        projects.append(pm)

    return projects


@router.get("/projects/my", response_model=List[ProjectMetadata])
async def list_my_projects(
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    List projects the current user is a member of (Postgres-backed membership).
    """
    try:
        actor_id = uuid.UUID(str(actor.get("id")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Invalid authenticated user id") from exc

    rows = db.execute(
        select(Project)
        .join(ProjectMembership, ProjectMembership.project_id == Project.id)
        .where(ProjectMembership.user_id == actor_id, ProjectMembership.left_at.is_(None))
        .order_by(Project.created_at.desc())
    ).scalars().all()

    results: List[ProjectMetadata] = []
    for proj in rows:
        project_path = resolve_project_path(proj.project_name)
        if not project_path or not project_path.exists():
            continue
        metadata_file = project_path / "project_metadata.json"
        metadata = load_json_file(metadata_file) if metadata_file.exists() else None
        if isinstance(metadata, dict) and metadata:
            normalized = _normalize_project_metadata(metadata, project_path)
            results.append(ProjectMetadata(**normalized))
        else:
            results.append(ProjectMetadata(project_name=proj.project_name, project_id=proj.project_id))
    return results


class AddProjectMemberRequest(BaseModel):
    email: EmailStr
    membership_role: Optional[str] = None


class ProjectMemberInfo(BaseModel):
    user_id: str
    email: str
    full_name: str
    serial_number: Optional[str] = None
    role: str
    membership_role: Optional[str] = None
    joined_at: Optional[str] = None


class ProjectMembersResponse(BaseModel):
    members: List[ProjectMemberInfo]
    count: int


@router.get("/projects/{project_name}/members", response_model=ProjectMembersResponse)
async def list_project_members(
    project_name: str,
    _: Dict[str, Any] = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """
    List active project members for visibility management.
    """
    db_project = upsert_project_row(db, project_name)
    rows = db.execute(
        select(ProjectMembership, User)
        .join(User, User.id == ProjectMembership.user_id)
        .where(
            ProjectMembership.project_id == db_project.id,
            ProjectMembership.left_at.is_(None),
        )
        .order_by(User.full_name.asc(), User.email.asc())
    ).all()

    members = [
        ProjectMemberInfo(
            user_id=str(user_row.id),
            email=user_row.email,
            full_name=user_row.full_name,
            serial_number=user_row.serial_number,
            role=user_row.role,
            membership_role=membership.membership_role,
            joined_at=membership.joined_at.isoformat() if membership.joined_at else None,
        )
        for membership, user_row in rows
    ]
    return ProjectMembersResponse(members=members, count=len(members))


@router.post("/projects/{project_name}/members")
async def add_project_member(
    project_name: str,
    payload: AddProjectMemberRequest,
    actor: Dict[str, Any] = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """
    Add a user to a project by corporate email.

    Current policy: global admin only (can be extended to project-admin later).
    """
    db_project = upsert_project_row(db, project_name)

    email = str(payload.email).strip().lower()
    user_row = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found")

    membership = db.execute(
        select(ProjectMembership).where(
            ProjectMembership.user_id == user_row.id,
            ProjectMembership.project_id == db_project.id,
        )
    ).scalar_one_or_none()

    if membership is None:
        db.add(
            ProjectMembership(
                user_id=user_row.id,
                project_id=db_project.id,
                membership_role=(payload.membership_role or None),
            )
        )
        db.commit()
    else:
        membership.left_at = None
        if payload.membership_role is not None:
            membership.membership_role = payload.membership_role or None
        db.commit()

    write_audit_event(
        db,
        project_name=project_name,
        actor=actor,
        event_type="project.member.add",
        payload={
            "member_user_id": str(user_row.id),
            "member_email": user_row.email,
            "membership_role": payload.membership_role or None,
        },
        required=True,
    )

    return {"success": True}


@router.delete("/projects/{project_name}/members/{user_id}")
async def remove_project_member(
    project_name: str,
    user_id: str,
    actor: Dict[str, Any] = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """
    Revoke project membership for a user (soft remove via left_at).
    """
    db_project = upsert_project_row(db, project_name)
    try:
        uid = uuid.UUID(str(user_id))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc

    membership = db.execute(
        select(ProjectMembership).where(
            ProjectMembership.user_id == uid,
            ProjectMembership.project_id == db_project.id,
            ProjectMembership.left_at.is_(None),
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="Active membership not found")

    membership.left_at = datetime.utcnow()
    db.commit()

    user_row = db.execute(select(User).where(User.id == uid)).scalar_one_or_none()
    write_audit_event(
        db,
        project_name=project_name,
        actor=actor,
        event_type="project.member.remove",
        payload={
            "member_user_id": str(uid),
            "member_email": user_row.email if user_row else None,
        },
        required=True,
    )

    return {"success": True}


def _normalize_project_metadata(raw: Dict[str, Any], project_path: Optional[Path] = None) -> Dict[str, Any]:
    """
    Normalize project metadata to ensure consistent structure.
    Converts flat crs_epsg/crs_name fields to nested crs object.
    Merges AOI data from project_aoi.json if available.
    """
    result = dict(raw)
    
    # Normalize CRS: convert flat fields to nested object
    if 'crs' not in result or result['crs'] is None:
        crs_obj = {}
        if 'crs_epsg' in result:
            crs_obj['epsg'] = result.pop('crs_epsg')
        if 'crs_name' in result:
            crs_obj['name'] = result.pop('crs_name')
        if 'crs_proj4' in result:
            crs_obj['proj4'] = result.pop('crs_proj4')
        if 'crs_units' in result:
            crs_obj['units'] = result.pop('crs_units')
        if crs_obj:
            result['crs'] = crs_obj
    
    # Normalize AOI: convert flat fields to nested object
    if 'aoi' not in result or result['aoi'] is None:
        aoi_obj = {}
        if 'aoi_file' in result:
            aoi_obj['file'] = result.pop('aoi_file')
        if 'aoi_area_km2' in result:
            aoi_obj['area_km2'] = result.pop('aoi_area_km2')
        if 'aoi_countries' in result:
            aoi_obj['countries'] = result.pop('aoi_countries')
        
        # Always try to load AOI from project_aoi.json if project_path is provided
        # This merges data even if some fields already exist
        if project_path:
            aoi_json_path = project_path / "aoi" / "project_aoi.json"
            if aoi_json_path.exists():
                aoi_data = load_json_file(aoi_json_path)
                if aoi_data:
                    # Extract aoi_file if not already set
                    if 'file' not in aoi_obj and 'aoi_file' in aoi_data:
                        aoi_obj['file'] = aoi_data['aoi_file']
                    
                    # Extract area from project_aoi.json first, then try to calculate
                    if 'area_km2' not in aoi_obj:
                        if 'aoi_area_km2' in aoi_data:
                            aoi_obj['area_km2'] = aoi_data['aoi_area_km2']
                        else:
                            # Calculate area if we have a GeoPackage
                            aoi_gpkg = project_path / "aoi" / "aoi.gpkg"
                            if aoi_gpkg.exists():
                                aoi_obj['file'] = str(aoi_gpkg)
                                area = _calculate_aoi_area(aoi_gpkg)
                                if area:
                                    aoi_obj['area_km2'] = area
                    
                    if 'countries' not in aoi_obj:
                        if 'iso3_list' in result and isinstance(result['iso3_list'], list) and result['iso3_list']:
                            _iso_map, _, _ = _load_iso_mappings()
                            aoi_obj['countries'] = [_iso_map.get(c, c) for c in result['iso3_list']]
                        elif 'countries' in result and isinstance(result['countries'], list) and result['countries']:
                            aoi_obj['countries'] = [
                                c.get('name', c.get('iso3', '')) if isinstance(c, dict) else str(c)
                                for c in result['countries']
                            ]
                        elif 'aoi_countries' in aoi_data:
                            aoi_obj['countries'] = aoi_data['aoi_countries']
                        elif 'country' in result:
                            aoi_obj['countries'] = [result['country']]
                        elif 'iso3' in result:
                            _iso_map, _, _ = _load_iso_mappings()
                            country_name = _iso_map.get(result['iso3'])
                            if country_name:
                                aoi_obj['countries'] = [country_name]
                    
                    # Extract start and end points
                    if 'start_point' not in aoi_obj and 'start_point' in aoi_data:
                        sp = aoi_data['start_point']
                        aoi_obj['start_point'] = {
                            'latitude': sp.get('latitude'),
                            'longitude': sp.get('longitude')
                        }
                    if 'end_point' not in aoi_obj and 'end_point' in aoi_data:
                        ep = aoi_data['end_point']
                        aoi_obj['end_point'] = {
                            'latitude': ep.get('latitude'),
                            'longitude': ep.get('longitude')
                        }
        
        if aoi_obj:
            result['aoi'] = aoi_obj
    
    return result


def _calculate_aoi_area(aoi_path: Path) -> Optional[float]:
    """
    Calculate AOI area in km² using ogr2ogr and basic geometry calculation.
    """
    try:
        # Use ogrinfo to get the geometry and calculate area
        cmd = ["ogrinfo", "-ro", "-al", "-geom=YES", str(aoi_path)]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return None
        
        # Parse extent from ogrinfo output to estimate area
        # Look for "Extent:" line
        for line in result.stdout.split('\n'):
            if 'Extent:' in line:
                # Format: Extent: (minx, miny) - (maxx, maxy)
                import re
                match = re.search(r'Extent:\s*\(([-\d.]+),\s*([-\d.]+)\)\s*-\s*\(([-\d.]+),\s*([-\d.]+)\)', line)
                if match:
                    minx, miny, maxx, maxy = map(float, match.groups())
                    # Rough area calculation (assuming projected coordinates in meters)
                    width_m = abs(maxx - minx)
                    height_m = abs(maxy - miny)
                    area_m2 = width_m * height_m
                    area_km2 = area_m2 / 1_000_000
                    return round(area_km2, 2)
        return None
    except Exception:
        return None


@router.get("/projects/{project_name}/metadata", response_model=ProjectMetadata)
async def get_project_metadata(project_name: str):
    """
    Get full metadata for a specific project
    """
    project_path = resolve_project_path(project_name)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found (missing project_metadata.json or pipeline_specs.json)")
    
    metadata_file = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_file) if metadata_file.exists() else None
    
    if not metadata:
        raise HTTPException(status_code=500, detail=f"Failed to load metadata for '{project_name}'")
    
    normalized = _normalize_project_metadata(metadata, project_path)

    if not normalized.get("iso3_list"):
        try:
            if NATURAL_EARTH_ADMIN0_SHP.exists():
                aoi_fc = _load_project_aoi_feature_collection(project_path)
                if isinstance(aoi_fc, dict):
                    geom = _collect_geometry(aoi_fc)
                    detected = _aoi_countries_admin0(geom)
                    if detected:
                        iso_map, _, _ = _load_iso_mappings()
                        names = [iso_map.get(c, c) for c in detected]
                        normalized["iso3_list"] = detected
                        normalized["countries"] = [
                            {"iso3": c, "name": n} for c, n in zip(detected, names)
                        ]
                        normalized["country"] = ", ".join(names)
                        aoi = normalized.get("aoi")
                        if isinstance(aoi, dict):
                            aoi["countries"] = names
        except Exception:
            pass

    return ProjectMetadata(**normalized)


@router.get("/projects/{project_name}/pipeline-specs")
async def get_pipeline_specs(project_name: str):
    """
    Get pipeline specifications for a project
    """
    project_path = resolve_project_path(project_name)

    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")

    specs_file = project_path / "pipeline_specs.json"

    if not specs_file.exists():
        raise HTTPException(status_code=404, detail=f"pipeline_specs.json not found for project '{project_name}'")

    specs = load_json_file(specs_file)

    if not specs:
        raise HTTPException(status_code=500, detail=f"Failed to load pipeline specs for '{project_name}'")

    # Backwards/forwards compatibility: always expose derived metric fields used by
    # multiple UI/eng modules (e.g., alignment sheets expects diameter_mm).
    if isinstance(specs, dict):
        specs = _enrich_pipeline_specs_with_mm(specs)

    return specs


def _normalize_measurement_system(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip().lower()
    if s in {"si", "metric"}:
        return "SI"
    if s in {"imperial", "imp", "us", "uscs"}:
        return "Imperial"
    # Preserve canonical formatting if already correct-ish
    if s.startswith("imp"):
        return "Imperial"
    return None


def _enrich_pipeline_specs_with_mm(specs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure the pipeline specs include mm-based diameter fields even when the
    project uses the "new" base-unit format:
      - SI: inner/outer are in meters
      - Imperial: inner/outer are in inches

    Adds/normalizes:
      - diameter_mm (outer diameter in mm)
      - inner_diameter_mm
      - wall_thickness_mm (and thickness_mm)
    """
    out: Dict[str, Any] = dict(specs)

    ms = _normalize_measurement_system(out.get("measurement_system"))
    # Default to SI if not specified
    if ms is None:
        ms = "SI"
        out.setdefault("measurement_system", "SI")

    inch_to_mm = 25.4

    def _as_float(v: Any) -> Optional[float]:
        try:
            if v is None:
                return None
            return float(v)
        except Exception:
            return None

    outer_mm = _as_float(out.get("diameter_mm"))
    inner_mm = _as_float(out.get("inner_diameter_mm"))

    outer_base = _as_float(out.get("outer_diameter"))
    inner_base = _as_float(out.get("inner_diameter"))

    # Derive outer/inner mm from base units when missing
    if outer_mm is None and outer_base is not None:
        outer_mm = outer_base * (1000.0 if ms == "SI" else inch_to_mm)
    if inner_mm is None and inner_base is not None:
        inner_mm = inner_base * (1000.0 if ms == "SI" else inch_to_mm)

    # Wall thickness: accept either key; otherwise derive from diameters
    wall_mm = _as_float(out.get("wall_thickness_mm"))
    if wall_mm is None:
        wall_mm = _as_float(out.get("thickness_mm"))
    if wall_mm is None and outer_mm is not None and inner_mm is not None:
        wall_mm = (outer_mm - inner_mm) / 2.0

    # If inner missing but wall present, derive
    if inner_mm is None and outer_mm is not None and wall_mm is not None:
        inner_mm = outer_mm - 2.0 * wall_mm

    # Write back derived values (best-effort; don't break callers if incomplete)
    if outer_mm is not None:
        out["diameter_mm"] = float(outer_mm)
    if inner_mm is not None:
        out["inner_diameter_mm"] = float(inner_mm)
    if wall_mm is not None:
        out["wall_thickness_mm"] = float(wall_mm)
        out["thickness_mm"] = float(wall_mm)

    return out


class PipelineSpecsUpdate(BaseModel):
    """
    Update payload for pipeline_specs.json.

    Supports either:
    - base-unit updates (outer_diameter/inner_diameter + measurement_system), or
    - metric updates (diameter_mm + wall_thickness_mm) as used by the PIRL AI dialog.
    """

    model_config = {"extra": "allow"}

    product: Optional[str] = None
    measurement_system: Optional[str] = None

    # Base unit values (SI: meters, Imperial: inches)
    inner_diameter: Optional[float] = None
    outer_diameter: Optional[float] = None

    # Derived / metric values
    diameter_mm: Optional[float] = None
    inner_diameter_mm: Optional[float] = None
    wall_thickness_mm: Optional[float] = None
    thickness_mm: Optional[float] = None


@router.put("/projects/{project_name}/pipeline-specs")
async def update_pipeline_specs(
    project_name: str,
    payload: PipelineSpecsUpdate,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Persist updates to pipeline_specs.json (used by PIRL AI dialog + alignment sheets).
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")

    specs_file = project_path / "pipeline_specs.json"
    existing = load_json_file(specs_file) if specs_file.exists() else {}
    if not isinstance(existing, dict):
        existing = {}

    ms = _normalize_measurement_system(payload.measurement_system) or _normalize_measurement_system(existing.get("measurement_system"))
    if ms is None:
        # Fall back to project metadata if present
        meta = load_json_file(project_path / "project_metadata.json") or {}
        ms = _normalize_measurement_system(meta.get("measurement_system")) or "SI"

    inch_to_mm = 25.4

    def _as_float(v: Any) -> Optional[float]:
        try:
            if v is None:
                return None
            return float(v)
        except Exception:
            return None

    # 1) Prefer metric payloads from UI (diameter_mm + wall_thickness_mm)
    outer_mm = _as_float(payload.diameter_mm)
    inner_mm = _as_float(payload.inner_diameter_mm)
    wall_mm = _as_float(payload.wall_thickness_mm) or _as_float(payload.thickness_mm)

    # 2) Fallback to base-unit payloads (outer_diameter/inner_diameter)
    if outer_mm is None and payload.outer_diameter is not None:
        outer_mm = float(payload.outer_diameter) * (1000.0 if ms == "SI" else inch_to_mm)
    if inner_mm is None and payload.inner_diameter is not None:
        inner_mm = float(payload.inner_diameter) * (1000.0 if ms == "SI" else inch_to_mm)

    # If wall missing but we have inner+outer, compute it
    if wall_mm is None and outer_mm is not None and inner_mm is not None:
        wall_mm = (outer_mm - inner_mm) / 2.0

    # If inner missing but we have wall+outer, compute it
    if inner_mm is None and outer_mm is not None and wall_mm is not None:
        inner_mm = outer_mm - 2.0 * wall_mm

    if outer_mm is None or inner_mm is None:
        raise HTTPException(
            status_code=400,
            detail="Must provide either (diameter_mm + wall_thickness_mm) or (outer_diameter + inner_diameter).",
        )

    if outer_mm <= inner_mm:
        raise HTTPException(status_code=400, detail="Outside diameter must be greater than inside diameter.")

    if wall_mm is None:
        wall_mm = (outer_mm - inner_mm) / 2.0

    if wall_mm <= 0:
        raise HTTPException(status_code=400, detail="Computed wall thickness must be positive.")

    # Convert back to base units for storage consistency
    if ms == "SI":
        outer_base = outer_mm / 1000.0
        inner_base = inner_mm / 1000.0
    else:
        outer_base = outer_mm / inch_to_mm
        inner_base = inner_mm / inch_to_mm

    updated: Dict[str, Any] = dict(existing)
    if payload.product is not None:
        updated["product"] = payload.product
    updated["measurement_system"] = ms
    updated["outer_diameter"] = float(outer_base)
    updated["inner_diameter"] = float(inner_base)
    updated["diameter_mm"] = float(outer_mm)
    updated["inner_diameter_mm"] = float(inner_mm)
    updated["wall_thickness_mm"] = float(wall_mm)
    updated["thickness_mm"] = float(wall_mm)

    # Persist
    _write_json(specs_file, updated)

    # Project-scoped audit event
    try:
        write_audit_event(
            db,
            project_name=project_name,
            actor=actor,
            event_type="project.pipeline_specs.update",
            payload={
                "measurement_system": ms,
                "outer_diameter": updated.get("outer_diameter"),
                "inner_diameter": updated.get("inner_diameter"),
                "diameter_mm": updated.get("diameter_mm"),
                "wall_thickness_mm": updated.get("wall_thickness_mm"),
            },
            required=False,
        )
    except Exception:
        pass

    return _enrich_pipeline_specs_with_mm(updated)


def _build_display_name_from_metadata(metadata: Optional[Dict[str, Any]], fallback_name: str) -> str:
    """
    Build display name from metadata JSON sidecar.
    Format: {category}_{dataset_name}_{target_crs}_processed
    Where dataset_name has spaces replaced with hyphens.
    target_crs is formatted as EPSGnumber (no colon).
    """
    if not isinstance(metadata, dict):
        return fallback_name

    category = metadata.get("category", "")
    dataset_name = metadata.get("dataset_name", "")
    target_crs = metadata.get("target_crs", "")
    
    # Clean up dataset_name - remove "(Processed)" suffix if present
    if dataset_name.endswith(" (Processed)"):
        dataset_name = dataset_name[:-12]
    
    # Replace spaces with hyphens
    dataset_name = dataset_name.replace(" ", "-")
    
    # Format CRS as EPSGnumber (remove colon)
    # e.g., "EPSG:32633" -> "EPSG32633"
    target_crs = target_crs.replace(":", "")
    
    # Build the display name
    if category and dataset_name and target_crs:
        return f"{category}_{dataset_name}_{target_crs}_processed"
    
    # Fallback to the filename-based approach
    return fallback_name


@router.get("/projects/{project_name}/datasets", response_model=ProjectDatasets)
async def list_project_datasets(project_name: str):
    """
    List all available datasets for a project
    
    Scans data/rasters/processed/ and data/vectors/processed/ directories directly.
    This is the canonical source - symlinks in parent folders are deprecated.
    Reads metadata from .json sidecars if available.
    
    Display names follow the format: {category}_{dataset_name}_{target_crs}_processed
    where dataset_name has spaces replaced with hyphens.
    """
    project_path = resolve_project_path(project_name)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found (missing project root with project_metadata.json or pipeline_specs.json)")
    
    rasters_processed_dir = project_path / "data" / "rasters" / "processed"
    vectors_processed_dir = project_path / "data" / "vectors" / "processed"
    
    rasters = []
    vectors = []
    
    # Scan rasters/processed directory
    if rasters_processed_dir.exists():
        for item in rasters_processed_dir.iterdir():
            # Look for .tif files (processed rasters)
            if item.suffix == '.tif' and not item.name.endswith('.json'):
                # Metadata sidecar is next to the file
                metadata_file = item.with_name(f"{item.name}.json")
                metadata: Dict[str, Any] = {}
                
                # Load metadata if available
                if metadata_file.exists():
                    loaded = load_json_file(metadata_file)
                    if isinstance(loaded, dict):
                        metadata = loaded
                
                # Build display name from metadata or fallback to filename
                import re
                raw_name = item.stem
                fallback_name = re.sub(r'_epsg\d+_processed$', '', raw_name, flags=re.IGNORECASE)
                fallback_name = re.sub(r'_processed$', '', fallback_name, flags=re.IGNORECASE)

                # Enrich legacy/partial metadata so the Map View Inspector can display
                # key raster properties (dimensions, cell size, pixel type/depth, compression, etc.).
                updated = False
                info = None

                if not metadata.get("dataset_name"):
                    metadata["dataset_name"] = fallback_name or raw_name
                    updated = True
                # Ensure semantic data_type remains "Raster" (pixel type lives in pixel_data_type)
                if metadata.get("data_type") in {None, "", "Float32", "Float64", "Int16", "Int32", "UInt16", "UInt32", "Byte"}:
                    metadata["data_type"] = "Raster"
                    updated = True
                if not metadata.get("format"):
                    metadata["format"] = "GeoTIFF"
                    updated = True

                # Probe only when sidecar is sparse. This avoids expensive gdalinfo calls
                # (especially with large rasters) on every datasets request.
                if _raster_metadata_needs_probe(metadata):
                    info = _gdalinfo_json(item, include_stats=False)
                if info:
                    epsg = _extract_epsg_from_gdalinfo(info)
                    if epsg and metadata.get("probed_crs") != epsg:
                        metadata["probed_crs"] = epsg
                        updated = True

                    tech = _extract_raster_technical_fields_from_gdalinfo(info)
                    for k, v in tech.items():
                        if metadata.get(k) != v:
                            metadata[k] = v
                            updated = True

                    extent = _extent_from_gdalinfo(info, crs_override=epsg)
                    if extent and metadata.get("extent") != extent:
                        metadata["extent"] = extent
                        updated = True

                    wgs84 = info.get("wgs84Extent")
                    if isinstance(wgs84, dict):
                        bbox = _bbox_from_wgs84_extent(wgs84)
                        if bbox and metadata.get("bbox_wgs84") != bbox:
                            metadata["bbox_wgs84"] = bbox
                            updated = True

                    stats = _extract_raster_statistics_from_gdalinfo(info)
                    if stats and metadata.get("statistics") != stats:
                        metadata["statistics"] = stats
                        updated = True

                if updated:
                    # Sidecar persistence is best-effort; listing datasets must remain read-safe.
                    try:
                        _write_json(metadata_file, metadata)
                    except Exception:
                        pass
                
                display_name = _build_display_name_from_metadata(metadata, fallback_name)
                
                dataset_info = DatasetInfo(
                    name=display_name,
                    type='raster',
                    path=str(item.relative_to(project_path))
                )
                
                if metadata:
                    dataset_info.metadata = metadata
                
                rasters.append(dataset_info)
    
    # Scan vectors/processed directory
    if vectors_processed_dir.exists():
        for item in vectors_processed_dir.iterdir():
            # Look for .gpkg files (processed vectors)
            if item.suffix == '.gpkg' and not item.name.endswith('.json'):
                # Metadata sidecar is next to the file
                metadata_file = item.with_name(f"{item.name}.json")
                metadata: Dict[str, Any] = {}
                
                # Load metadata if available
                if metadata_file.exists():
                    loaded = load_json_file(metadata_file)
                    if isinstance(loaded, dict):
                        metadata = loaded
                
                # Build display name from metadata or fallback to filename
                import re
                raw_name = item.stem
                fallback_name = re.sub(r'_epsg\d+_processed$', '', raw_name, flags=re.IGNORECASE)
                fallback_name = re.sub(r'_processed$', '', fallback_name, flags=re.IGNORECASE)
                
                display_name = _build_display_name_from_metadata(metadata, fallback_name)
                
                dataset_info = DatasetInfo(
                    name=display_name,
                    type='vector',
                    path=str(item.relative_to(project_path))
                )
                
                if metadata:
                    dataset_info.metadata = metadata
                
                vectors.append(dataset_info)
    
    # Sort by name for consistent ordering
    rasters.sort(key=lambda x: x.name.lower())
    vectors.sort(key=lambda x: x.name.lower())
    
    return ProjectDatasets(rasters=rasters, vectors=vectors)


class DatasetFingerprint(BaseModel):
    """Lightweight fingerprint for detecting dataset changes."""
    raster_count: int
    vector_count: int
    latest_modified: Optional[str] = None
    fingerprint: str  # Hash of filenames + mod times


@router.get("/projects/{project_name}/datasets/fingerprint", response_model=DatasetFingerprint)
async def get_dataset_fingerprint(project_name: str):
    """
    Get a lightweight fingerprint of project datasets for change detection.

    This endpoint is designed for frequent polling (every 10 seconds) to detect
    when new datasets have been added without fetching full dataset details.

    Returns:
        - raster_count: Number of processed raster files
        - vector_count: Number of processed vector files
        - latest_modified: ISO timestamp of most recently modified file
        - fingerprint: MD5 hash of all filenames + modification times
    """
    import hashlib

    project_path = resolve_project_path(project_name)

    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")

    rasters_processed_dir = project_path / "data" / "rasters" / "processed"
    vectors_processed_dir = project_path / "data" / "vectors" / "processed"

    raster_count = 0
    vector_count = 0
    latest_mtime = 0.0
    fingerprint_parts = []

    # Scan rasters
    if rasters_processed_dir.exists():
        for item in rasters_processed_dir.iterdir():
            if item.suffix == '.tif' and not item.name.endswith('.json'):
                raster_count += 1
                mtime = item.stat().st_mtime
                if mtime > latest_mtime:
                    latest_mtime = mtime
                fingerprint_parts.append(f"{item.name}:{mtime}")

    # Scan vectors
    if vectors_processed_dir.exists():
        for item in vectors_processed_dir.iterdir():
            if item.suffix == '.gpkg' and not item.name.endswith('.json'):
                vector_count += 1
                mtime = item.stat().st_mtime
                if mtime > latest_mtime:
                    latest_mtime = mtime
                fingerprint_parts.append(f"{item.name}:{mtime}")

    # Sort for consistent hash
    fingerprint_parts.sort()
    fingerprint_str = "|".join(fingerprint_parts)
    fingerprint_hash = hashlib.md5(fingerprint_str.encode()).hexdigest()

    # Convert latest_mtime to ISO string
    from datetime import datetime, timezone
    latest_modified = None
    if latest_mtime > 0:
        latest_modified = datetime.fromtimestamp(latest_mtime, tz=timezone.utc).isoformat()

    return DatasetFingerprint(
        raster_count=raster_count,
        vector_count=vector_count,
        latest_modified=latest_modified,
        fingerprint=fingerprint_hash
    )


def _sanitize_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    val = str(value).strip()
    return val or None


@lru_cache()
def _load_iso_mappings():
    iso_to_name: Dict[str, str] = {}
    name_to_iso: Dict[str, str] = {}
    alpha2_to_iso: Dict[str, str] = {}

    if not ISO_CODES_CSV.exists():
        return iso_to_name, name_to_iso, alpha2_to_iso

    with ISO_CODES_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = _sanitize_str(row.get("name"))
            alpha3 = _sanitize_str(row.get("alpha-3"))
            alpha2 = _sanitize_str(row.get("alpha-2"))
            if not alpha3:
                continue
            iso_to_name[alpha3.upper()] = name
            if name:
                normalized = re.sub(r"[^a-z0-9]+", "", name.lower())
                name_to_iso[normalized] = alpha3.upper()
            if alpha2:
                alpha2_to_iso[alpha2.upper()] = alpha3.upper()

    return iso_to_name, name_to_iso, alpha2_to_iso


def _normalize_country_value(value: Optional[str]) -> Optional[str]:
    val = _sanitize_str(value)
    if not val:
        return None

    # Common abbreviations that aren't standard ISO codes
    common_abbreviations = {
        "UAE": "ARE",
        "UK": "GBR",
        "USA": "USA",
        "US": "USA",
        "RUSSIA": "RUS",
    }

    iso_to_name, name_to_iso, alpha2_to_iso = _load_iso_mappings()
    upper = val.upper()

    # Check common abbreviations first
    if upper in common_abbreviations:
        return common_abbreviations[upper]

    if len(upper) == 3 and upper.isalpha():
        if upper in iso_to_name:
            return upper

    if len(upper) == 2 and upper.isalpha():
        return alpha2_to_iso.get(upper)

    normalized = re.sub(r"[^a-z0-9]+", "", val.lower())
    return name_to_iso.get(normalized)


def _extract_iso_from_dict(data: Dict[str, Any]) -> Optional[str]:
    candidate_keys = [
        "country_code",
        "country",
        "country_iso",
        "countryName",
        "iso3",
        "iso",
        "alpha3",
        "nation",
    ]
    for key in candidate_keys:
        if key in data:
            iso = _normalize_country_value(data.get(key))
            if iso:
                return iso
    return None


def _infer_project_iso3(project_path: Path) -> Optional[str]:
    metadata_path = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_path) if metadata_path.exists() else None
    if isinstance(metadata, dict):
        iso = _extract_iso_from_dict(metadata)
        if iso:
            return iso

    pipeline_specs = project_path / "pipeline_specs.json"
    specs = load_json_file(pipeline_specs) if pipeline_specs.exists() else None
    if isinstance(specs, dict):
        iso = _extract_iso_from_dict(specs)
        if iso:
            return iso

    data_dir = project_path / "data"
    candidate_dirs = [
        data_dir / "rasters" / "processed",
        data_dir / "rasters" / "raw",
        data_dir / "vectors" / "processed",
        data_dir / "vectors" / "raw",
    ]

    for directory in candidate_dirs:
        if not directory.exists():
            continue
        for json_path in directory.glob("**/*.json"):
            data = load_json_file(json_path)
            if isinstance(data, dict):
                iso = _extract_iso_from_dict(data)
                if iso:
                    return iso

    # Fallback 1: if metadata contains an AOI countries list, use it.
    try:
        countries = _countries_from_project_metadata(project_path)
        if countries:
            return countries[0]
    except Exception:
        pass

    # Fallback 2: infer from AOI geometry (representative point → reverse_geocoder).
    # This avoids network I/O (unlike downloading boundary datasets) and works well for
    # single-country AOIs.
    try:
        aoi_fc = _load_project_aoi_feature_collection(project_path)
        if isinstance(aoi_fc, dict):
            geom = _collect_geometry(aoi_fc)
            pt = geom.representative_point()
            iso, _ = _infer_country_from_point(float(pt.y), float(pt.x))
            normalized = _normalize_country_value(iso)
            if normalized:
                return normalized
    except Exception:
        pass

    # Fallback 3: if Natural Earth boundaries are already cached locally, intersect AOI.
    # Do not trigger downloads here (unit tests / airgapped deployments).
    try:
        if NATURAL_EARTH_ADMIN0_SHP.exists():
            aoi_fc = _load_project_aoi_feature_collection(project_path)
            if isinstance(aoi_fc, dict):
                jurisdictions = compute_aoi_jurisdictions(aoi_fc)
                countries = jurisdictions.get("countries_iso3") or []
                if countries:
                    return str(countries[0]).strip().upper()
    except Exception:
        pass

    return None


@lru_cache()
def _load_country_coverage_rows_cached(catalog_path: str, mtime: float) -> List[Dict[str, str]]:
    """
    Cached loader for dataset coverage catalog rows.

    Cache key includes `mtime` so updates to the CSV are picked up without a backend restart.
    """
    _ = mtime  # part of cache key
    path = Path(catalog_path)
    if not path.exists():
        return []
    rows: List[Dict[str, str]] = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows.extend(reader)
    return rows


def _try_build_dataset_coverage_catalog() -> None:
    """
    Best-effort: generate WORLD_DATASET_CATALOGUE.csv if it's missing.

    This keeps the Dataset Manager usable in fresh checkouts/minimal deployments where
    the consolidated catalogue hasn't been pre-generated yet.
    """
    if DATASET_COVERAGE_CATALOG_CSV.exists():
        return

    scripts_root = Path(__file__).resolve().parent.parent / "scripts"
    builder = scripts_root / "build_dataset_coverage_catalog.py"
    if not builder.exists():
        return

    try:
        subprocess.run(
            [sys.executable, str(builder)],
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
    except Exception:
        # Best-effort only. The API will fall back to COUNTRY_COVERAGE_LONG.csv.
        return


def _load_country_coverage_rows() -> List[Dict[str, str]]:
    """
    Load dataset coverage catalog rows.

    Prefer the consolidated catalogue (WORLD_DATASET_CATALOGUE.csv). If it's missing (fresh
    checkout / minimal deployment), fall back to the raw research table
    (COUNTRY_COVERAGE_LONG.csv) so country-specific datasets like TINITALY still surface.
    """
    if not DATASET_COVERAGE_CATALOG_CSV.exists():
        _try_build_dataset_coverage_catalog()
    catalog = DATASET_COVERAGE_CATALOG_CSV if DATASET_COVERAGE_CATALOG_CSV.exists() else COUNTRY_COVERAGE_LONG_CSV
    try:
        mtime = catalog.stat().st_mtime
    except OSError:
        mtime = -1.0
    return _load_country_coverage_rows_cached(str(catalog), float(mtime))


@lru_cache()
def _load_engineering_standards_rows():
    if not PIPELINE_ENGINEERING_STANDARDS_CATALOG_CSV.exists():
        return []
    rows: List[Dict[str, str]] = []
    with PIPELINE_ENGINEERING_STANDARDS_CATALOG_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows.extend(reader)
    return rows


@lru_cache()
def _load_regulation_catalog_rows():
    if not REGULATION_CATALOG_CSV.exists():
        return []
    rows: List[Dict[str, str]] = []
    with REGULATION_CATALOG_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows.extend(reader)
    return rows


def _row_to_regulation_entry(row: Dict[str, str]) -> RegulationCatalogueEntry:
    def _maybe(field: str) -> Optional[str]:
        return _sanitize_str(row.get(field))

    entry_id = _maybe("EntryID") or ""
    title = _maybe("Title") or ""
    return RegulationCatalogueEntry(
        entry_id=entry_id,
        title=title,
        entry_type=_maybe("EntryType"),
        category=_maybe("Category"),
        project_applicability=_maybe("ProjectApplicability"),
        coverage_level=_maybe("CoverageLevel"),
        coverage_group=_maybe("CoverageGroup"),
        iso3=_maybe("ISO3"),
        admin1_name=_maybe("Admin1Name"),
        admin1_code=_maybe("Admin1Code"),
        admin2_name=_maybe("Admin2Name"),
        admin2_code=_maybe("Admin2Code"),
        authority=_maybe("Authority"),
        source_title=_maybe("SourceTitle"),
        source_url=_maybe("SourceURL"),
        source_type=_maybe("SourceType"),
        direct_download_url=_maybe("DirectDownloadURL"),
        direct_download_file_name=_maybe("DirectDownloadFileName"),
        direct_download_content_type=_maybe("DirectDownloadContentType"),
        filing_category=_maybe("FilingCategory"),
        status=_maybe("Status"),
        effective_date=_maybe("EffectiveDate"),
        last_amended_date=_maybe("LastAmendedDate"),
        last_verified_date=_maybe("LastVerifiedDate"),
        language=_maybe("Language"),
        notes=_maybe("Notes"),
        related_entry_ids=_maybe("RelatedEntryIDs"),
    )


def _norm_key(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "", value.strip().lower())


def _regulations_snapshot_path(project_path: Path) -> Path:
    return project_path / "docs" / "regulatory_docs" / "compliance_matrix_snapshot.json"


def _load_project_aoi_feature_collection(project_path: Path) -> Optional[Dict[str, Any]]:
    """
    Load the project's AOI as a GeoJSON FeatureCollection (WGS84).

    Many projects store AOI geometry in non-GeoJSON formats (e.g. GPKG/KML/KMZ) and/or
    reference it via `project_metadata.json` / `aoi/project_aoi.json`. This loader:
    - prefers the AOI file referenced by metadata when present
    - falls back to common AOI locations within the project
    - converts non-GeoJSON vector formats to GeoJSON (EPSG:4326) via ogr2ogr
    """
    candidates: List[Path] = []

    # Prefer metadata-provided AOI path (project_metadata.json merged with project_aoi.json)
    try:
        metadata_path = project_path / "project_metadata.json"
        metadata = load_json_file(metadata_path) if metadata_path.exists() else None
        if isinstance(metadata, dict):
            normalized = _normalize_project_metadata(metadata, project_path)
            aoi_obj = normalized.get("aoi") if isinstance(normalized, dict) else None
            file_value: Optional[str] = None
            if isinstance(aoi_obj, dict):
                file_value = _sanitize_str(aoi_obj.get("file")) or _sanitize_str(aoi_obj.get("aoi_file"))
            if file_value:
                p = Path(file_value)
                # Support absolute paths and project-relative paths
                candidates.append(p if p.is_absolute() else (project_path / p))
    except Exception:
        # Best-effort only; continue with defaults
        pass

    # Common AOI paths across project variants
    candidates.extend(
        [
            project_path / "aoi" / "aoi.geojson",
            project_path / "aoi" / "aoi.json",
            project_path / "aoi" / "aoi.gpkg",
            project_path / "aoi" / "aoi.kml",
            project_path / "aoi" / "aoi.kmz",
            project_path / "data" / "vectors" / "aoi.gpkg",
        ]
    )

    # Processed AOI geopackages are common in older/imported projects
    processed_dir = project_path / "data" / "vectors" / "processed"
    if processed_dir.exists():
        try:
            candidates.extend(sorted(processed_dir.glob("aoi_*_processed.gpkg")))
        except Exception:
            pass

    # De-dupe while preserving order
    seen: set[str] = set()
    unique_candidates: List[Path] = []
    for p in candidates:
        try:
            key = str(p)
        except Exception:
            continue
        if not key or key in seen:
            continue
        seen.add(key)
        unique_candidates.append(p)

    for aoi_path in unique_candidates:
        try:
            if not aoi_path.exists():
                continue
        except Exception:
            continue
        try:
            suffix = aoi_path.suffix.lower()
            if suffix in {".json", ".geojson"}:
                data = json.loads(aoi_path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and data.get("type") == "FeatureCollection":
                    return data
                # Some sources may store a single Feature; normalize to FeatureCollection
                if isinstance(data, dict) and data.get("type") == "Feature":
                    return {"type": "FeatureCollection", "features": [data]}
                continue

            # Convert other vector formats to GeoJSON via ogr2ogr
            with tempfile.TemporaryDirectory() as tmpdir:
                fc = _convert_vector_to_geojson(aoi_path, Path(tmpdir))
                if isinstance(fc, dict) and fc.get("type") == "FeatureCollection":
                    return fc
        except Exception:
            continue

    return None


def _countries_from_project_metadata(project_path: Path) -> List[str]:
    """
    Best-effort Admin0 fallback from project metadata (when AOI geometry isn't available).
    Returns unique ISO3 codes in stable order.
    """
    metadata_path = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_path) if metadata_path.exists() else None
    if not isinstance(metadata, dict) or not metadata:
        return []

    normalized = _normalize_project_metadata(metadata, project_path)
    values: List[str] = []

    if isinstance(normalized, dict):
        aoi_obj = normalized.get("aoi")
        if isinstance(aoi_obj, dict):
            aoi_countries = aoi_obj.get("countries")
            if isinstance(aoi_countries, list):
                values.extend([str(v) for v in aoi_countries if v is not None and str(v).strip()])
            elif isinstance(aoi_countries, str) and aoi_countries.strip():
                values.append(aoi_countries)

        # Also consider iso3/country at the project level
        iso3 = _sanitize_str(normalized.get("iso3"))
        country = _sanitize_str(normalized.get("country"))
        if iso3:
            values.append(iso3)
        if country:
            values.append(country)

    iso3s: List[str] = []
    seen_iso: set[str] = set()
    for v in values:
        iso = _normalize_country_value(v)
        if not iso:
            continue
        if iso in seen_iso:
            continue
        seen_iso.add(iso)
        iso3s.append(iso)
    return iso3s


def _match_regulations_to_project(
    rows: List[Dict[str, str]],
    countries_iso3: List[str],
    admin1_units: List[Dict[str, Optional[str]]],
) -> List[MatchedRegulationEntry]:
    countries_set = {c.strip().upper() for c in countries_iso3 if isinstance(c, str) and c.strip()}

    admin1_codes: Dict[str, set[str]] = {}
    admin1_code_norms: Dict[str, set[str]] = {}
    admin1_names: Dict[str, set[str]] = {}
    for unit in admin1_units:
        iso3 = (unit.get("iso3") or "").strip().upper()
        if not iso3:
            continue
        admin1_codes.setdefault(iso3, set())
        admin1_code_norms.setdefault(iso3, set())
        admin1_names.setdefault(iso3, set())
        code = (unit.get("admin1_code") or "").strip().upper()
        name = _norm_key(unit.get("admin1_name"))
        if code:
            admin1_codes[iso3].add(code)
            admin1_code_norms[iso3].add(re.sub(r"[^A-Z0-9]+", "", code))
        if name:
            admin1_names[iso3].add(name)

    out: List[MatchedRegulationEntry] = []
    seen: set[str] = set()

    for row in rows:
        entry = _row_to_regulation_entry(row)
        entry_id = (entry.entry_id or "").strip()
        if not entry_id:
            continue
        if entry_id in seen:
            continue

        cov = (entry.coverage_level or "").strip().lower()
        cov_group = (entry.coverage_group or "").strip().upper()
        iso3 = (entry.iso3 or "").strip().upper()
        adm1_code = (entry.admin1_code or "").strip().upper()
        adm1_name = _norm_key(entry.admin1_name)

        match_scope = ""
        match_reason = ""

        if cov in {"global"}:
            match_scope = "global"
            match_reason = "CoverageLevel=global"
        elif cov in {"supranational"}:
            # Currently: EU-only matching.
            if cov_group == "EU" and any(c in EU27_ISO3 for c in countries_set):
                match_scope = "EU"
                match_reason = "CoverageLevel=supranational, CoverageGroup=EU"
        elif cov in {"country"}:
            if iso3 and iso3 in countries_set:
                match_scope = iso3
                match_reason = f"CoverageLevel=country, ISO3={iso3}"
        elif cov in {"admin1"}:
            if iso3 and iso3 in countries_set:
                codes = admin1_codes.get(iso3) or set()
                code_norms = admin1_code_norms.get(iso3) or set()
                names = admin1_names.get(iso3) or set()
                if adm1_code and adm1_code in codes:
                    match_scope = f"{iso3}:{adm1_code}"
                    match_reason = f"CoverageLevel=admin1, ISO3={iso3}, Admin1Code={adm1_code}"
                elif adm1_code:
                    norm_code = re.sub(r"[^A-Z0-9]+", "", adm1_code)
                    if norm_code and norm_code in code_norms:
                        match_scope = f"{iso3}:{adm1_code}"
                        match_reason = f"CoverageLevel=admin1, ISO3={iso3}, Admin1Code~={adm1_code}"
                elif adm1_name and adm1_name in names:
                    match_scope = f"{iso3}:{entry.admin1_name}"
                    match_reason = f"CoverageLevel=admin1, ISO3={iso3}, Admin1Name={entry.admin1_name}"
        elif cov in {"admin2"}:
            # Future: Admin2 support. For now, skip unless explicitly global/country.
            match_scope = ""
            match_reason = ""

        if not match_scope:
            continue

        seen.add(entry_id)
        out.append(
            MatchedRegulationEntry(
                **entry.model_dump(),
                match_scope=match_scope,
                match_reason=match_reason,
            )
        )

    return out


def _compute_regulations_response(project_name: str, project_path: Path, *, clear_cache: bool = False) -> RegulationsResponse:
    if clear_cache:
        try:
            _load_regulation_catalog_rows.cache_clear()  # type: ignore[attr-defined]
        except Exception:
            pass

    aoi_fc = _load_project_aoi_feature_collection(project_path)

    countries: List[str] = []
    admin1: List[Dict[str, Optional[str]]] = []
    if isinstance(aoi_fc, dict):
        try:
            geom = _collect_geometry(aoi_fc)
            countries = _aoi_countries_admin0(geom)
        except Exception:
            pass
        if countries:
            for iso3 in countries:
                try:
                    admin1.extend(_aoi_admin1_for_country(geom, iso3))
                except Exception:
                    pass

    if not countries:
        countries = _countries_from_project_metadata(project_path) or []
    if not countries:
        inferred = _infer_project_iso3(project_path)
        if inferred:
            countries = [inferred]

    rows = _load_regulation_catalog_rows()
    if not rows:
        raise HTTPException(status_code=500, detail="Regulation catalogue not available.")

    entries = _match_regulations_to_project(rows, countries_iso3=countries, admin1_units=admin1)

    snapshot_abs = _regulations_snapshot_path(project_path)
    try:
        snapshot_rel = str(snapshot_abs.relative_to(project_path))
    except Exception:
        snapshot_rel = str(snapshot_abs)
    resp = RegulationsResponse(
        project=project_name,
        generated_at=datetime.utcnow().isoformat(timespec="seconds") + "Z",
        catalog_reference=str(REGULATION_CATALOG_CSV),
        countries_iso3=countries,
        admin1=admin1,
        entries=entries,
        snapshot_path=snapshot_rel,
    )

    # Persist snapshot (best-effort; do not raise on failure).
    try:
        snapshot_abs.parent.mkdir(parents=True, exist_ok=True)
        with snapshot_abs.open("w", encoding="utf-8") as fh:
            json.dump(resp.model_dump(), fh, indent=2)
    except Exception:
        pass

    return resp


MAX_REGULATORY_INDEX_BYTES = 50 * 1024 * 1024  # 50 MB
MAX_REGULATORY_INDEX_REDIRECTS = 5
ALLOWED_REGULATORY_FILING_CATEGORIES = {
    "supranational",
    "national",
    "regional",
    "local",
    "technical",
    "industry",
}


def _safe_filename(value: str) -> str:
    """
    Sanitize an arbitrary filename (no path separators, no traversal, stable length).
    """
    raw = (value or "").strip()
    raw = raw.replace("\\", "/").split("/")[-1]
    raw = re.sub(r"[^A-Za-z0-9._ -]+", "_", raw).strip(" ._-")
    if not raw:
        return "document"
    if len(raw) > 200:
        stem, dot, ext = raw.rpartition(".")
        if dot and ext:
            raw = f"{stem[:180]}.{ext[:15]}"
        else:
            raw = raw[:200]
    return raw


def _url_host_is_private(hostname: str, port: int) -> bool:
    # Block obvious local hostnames
    host = (hostname or "").strip().lower()
    if host in {"localhost"} or host.endswith(".local"):
        return True

    try:
        # IP literal?
        ip = ipaddress.ip_address(host)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        )
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except Exception:
        # If we can't resolve, treat as unsafe.
        return True

    for info in infos:
        sockaddr = info[4]
        ip_str = sockaddr[0] if isinstance(sockaddr, tuple) and sockaddr else None
        if not ip_str:
            continue
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return True
    return False


def _validate_external_download_url(url: str) -> str:
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="DirectDownloadURL must be http/https")
    if not parsed.hostname:
        raise HTTPException(status_code=400, detail="DirectDownloadURL missing hostname")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="DirectDownloadURL must not contain credentials")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if _url_host_is_private(parsed.hostname, port):
        raise HTTPException(status_code=400, detail="DirectDownloadURL resolves to a disallowed host")
    return parsed.geturl()


def _download_stream_to_file(url: str, dest: Path) -> Tuple[int, Optional[str]]:
    """
    Download a URL to dest using streaming, enforcing size limits.
    Returns (bytes_written, media_type).
    """
    url = _validate_external_download_url(url)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")

    session = requests.Session()
    session.max_redirects = MAX_REGULATORY_INDEX_REDIRECTS

    bytes_written = 0
    media_type: Optional[str] = None
    resp: Optional[requests.Response] = None
    try:
        resp = session.get(
            url,
            stream=True,
            timeout=(10, 60),
            allow_redirects=True,
            headers={"User-Agent": "AGRS-RegulatoryIndexer/1.0"},
        )
        resp.raise_for_status()

        ct = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
        if ct:
            media_type = ct

        cl = resp.headers.get("Content-Length")
        if cl:
            try:
                if int(cl) > MAX_REGULATORY_INDEX_BYTES:
                    raise HTTPException(status_code=413, detail="Regulatory document too large to index")
            except ValueError:
                pass

        with tmp.open("wb") as out:
            for chunk in resp.iter_content(chunk_size=1024 * 128):
                if not chunk:
                    continue
                bytes_written += len(chunk)
                if bytes_written > MAX_REGULATORY_INDEX_BYTES:
                    raise HTTPException(status_code=413, detail="Regulatory document too large to index")
                out.write(chunk)

        tmp.replace(dest)
        return bytes_written, media_type
    finally:
        if resp is not None:
            try:
                resp.close()
            except Exception:
                pass
        try:
            session.close()
        except Exception:
            pass
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


def _row_to_entry(row: Dict[str, str], is_global: bool) -> DatasetCoverageEntry:
    def _maybe(field: str) -> Optional[str]:
        return _sanitize_str(row.get(field))

    return DatasetCoverageEntry(
        dataset=_maybe("Dataset") or "Unnamed dataset",
        source=_maybe("Source"),
        data_type=_maybe("Type"),
        access=_maybe("Access"),
        coverage=_maybe("Coverage"),
        temporal_start=_maybe("TemporalStart"),
        temporal_end=_maybe("TemporalEnd"),
        frequency=_maybe("Frequency"),
        applies_globally=is_global,
        url=_maybe("URL"),
    )


def _row_to_engineering_standard(row: Dict[str, str], is_global: bool) -> EngineeringStandardEntry:
    def _maybe(field: str) -> Optional[str]:
        return _sanitize_str(row.get(field))

    return EngineeringStandardEntry(
        standard=_maybe("Dataset") or "Unnamed standard",
        source=_maybe("Source"),
        type=_maybe("Type"),
        type_detail=_maybe("TypeDetail"),
        access=_maybe("Access"),
        temporal_start=_maybe("TemporalStart"),
        temporal_end=_maybe("TemporalEnd"),
        frequency=_maybe("Frequency"),
        coverage=_maybe("Coverage"),
        url=_maybe("URL"),
        resolution=_maybe("Resolution"),
        quality=_maybe("Quality"),
        notes=_maybe("Notes"),
        api_available=_maybe("APIAvailable"),
        origins=_maybe("Origins"),
        applies_globally=is_global,
    )


def _load_country_summary(country: Optional[str], iso3: Optional[str]) -> Optional[str]:
    candidates = []
    if country:
        candidates.append(country)
    if iso3:
        candidates.append(iso3)
    for candidate in candidates:
        sanitized = re.sub(r"[^A-Za-z0-9 _-]+", "", candidate or "").strip()
        if not sanitized:
            continue
        potential = COUNTRY_DATASETS_DIR / f"{sanitized}.txt"
        if potential.exists():
            try:
                return potential.read_text(encoding="utf-8").strip()
            except OSError:
                continue
    return None

@router.get(
    "/projects/{project_name}/dataset-coverage",
    response_model=DatasetCoverageResponse,
)
async def get_project_dataset_coverage(project_name: str):
    """
    Return datasets that are known to cover the project's AOI boundaries.

    Coverage catalog is sourced from the unified CSV at:
      /opt/agrs/docs/Project Instructions/WORLD_DATASET_CATALOGUE.csv
    and honors the workflow defined in DATASET_FETCHING_PROTOCOLS.md.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    # Detect ALL countries the AOI intersects (cross-country pipelines).
    # Uses _aoi_countries_admin0 directly (local Natural Earth, no GADM download)
    # to avoid HTTP errors when GADM admin1 data is unavailable for some countries.
    iso3_list: List[str] = []
    try:
        aoi_fc = _load_project_aoi_feature_collection(project_path)
        if isinstance(aoi_fc, dict) and NATURAL_EARTH_ADMIN0_SHP.exists():
            geom = _collect_geometry(aoi_fc)
            iso3_list = [str(c).strip().upper() for c in _aoi_countries_admin0(geom) if c]
    except Exception:
        pass

    if not iso3_list:
        try:
            aoi_fc = _load_project_aoi_feature_collection(project_path)
            if isinstance(aoi_fc, dict):
                geom = _collect_geometry(aoi_fc)
                pt = geom.representative_point()
                inferred, _ = _infer_country_from_point(float(pt.y), float(pt.x))
                norm = _normalize_country_value(inferred)
                if norm:
                    iso3_list = [norm]
        except Exception:
            pass

    if not iso3_list:
        single = _infer_project_iso3(project_path)
        if single:
            iso3_list = [single.strip().upper()]

    primary_iso3 = iso3_list[0] if iso3_list else "WLD"
    iso_to_name, _, _ = _load_iso_mappings()
    country_names = [iso_to_name.get(c, c) for c in iso3_list]
    country_name = ", ".join(n for n in country_names if n) or iso_to_name.get(primary_iso3)

    rows = _load_country_coverage_rows()
    if not rows:
        raise HTTPException(status_code=500, detail="Coverage catalog not available.")

    iso3_set = {c.upper() for c in iso3_list}

    local_rows: List[Dict[str, str]] = (
        []
        if not iso3_set or iso3_set == {"WLD"}
        else [row for row in rows if (row.get("ISO3") or "").strip().upper() in iso3_set]
    )
    local_entries = [_row_to_entry(row, is_global=False) for row in local_rows]

    global_rows = [
        row
        for row in rows
        if (row.get("ISO3") or "").strip().upper() == "WLD" and _global_row_applicable_to_project(row, primary_iso3)
    ]
    global_entries = [_row_to_entry(row, is_global=True) for row in global_rows]

    entries: List[DatasetCoverageEntry] = []
    seen_dataset_names: set[str] = set()
    for entry in (local_entries + global_entries):
        key = (entry.dataset or "").strip().lower()
        if not key or key in seen_dataset_names:
            continue
        seen_dataset_names.add(key)
        entries.append(entry)

    summary = _load_country_summary(country_name, primary_iso3)

    return DatasetCoverageResponse(
        iso3=primary_iso3,
        country=country_name,
        entries=entries,
        summary=summary,
        protocol_reference=DATASET_FETCH_PROTOCOL,
    )


@router.get(
    "/projects/{project_name}/engineering-standards",
    response_model=EngineeringStandardsResponse,
)
async def get_project_engineering_standards(project_name: str):
    """
    Return applicable pipeline engineering/design standards for the project's AOI.

    Standards are sourced from the catalogue CSV at:
      /opt/agrs/docs/Project Instructions/WORLD_PIPELINE_ENGINEERING_STANDARDS_CATALOGUE.csv

    Selection logic mirrors dataset coverage:
    - Include ISO3-specific rows for the inferred project ISO3
    - Include global rows (ISO3 == WLD)
    - De-duplicate by standard name (case-insensitive)
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    iso3_list: List[str] = []
    try:
        if NATURAL_EARTH_ADMIN0_SHP.exists():
            aoi_fc = _load_project_aoi_feature_collection(project_path)
            if isinstance(aoi_fc, dict):
                geom = _collect_geometry(aoi_fc)
                iso3_list = _aoi_countries_admin0(geom)
    except Exception:
        pass
    if not iso3_list:
        single = _infer_project_iso3(project_path)
        iso3_list = [single] if single else ["WLD"]

    primary_iso3 = iso3_list[0] if iso3_list else "WLD"
    iso_to_name, _, _ = _load_iso_mappings()
    country_names = [iso_to_name.get(c, c) for c in iso3_list]
    country_name = ", ".join(n for n in country_names if n) or iso_to_name.get(primary_iso3)

    rows = _load_engineering_standards_rows()
    if not rows:
        raise HTTPException(status_code=500, detail="Engineering standards catalogue not available.")

    iso3_set = {c.upper() for c in iso3_list}
    local_rows = [row for row in rows if (row.get("ISO3") or "").strip().upper() in iso3_set]
    global_rows = [row for row in rows if (row.get("ISO3") or "").strip().upper() == "WLD"]

    entries: List[EngineeringStandardEntry] = []
    seen: set[str] = set()
    for row in (local_rows + global_rows):
        standard_name = _sanitize_str(row.get("Dataset")) or ""
        key = standard_name.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        entries.append(_row_to_engineering_standard(row, is_global=(row.get("ISO3") == "WLD")))

    return EngineeringStandardsResponse(
        iso3=primary_iso3,
        country=country_name,
        entries=entries,
        catalog_reference=str(PIPELINE_ENGINEERING_STANDARDS_CATALOG_CSV),
    )


@router.post(
    "/projects/{project_name}/engineering-standards/scan",
    response_model=EngineeringStandardsResponse,
)
async def scan_project_engineering_standards(project_name: str):
    """
    Re-scan the engineering standards catalogue and return refreshed results.

    This exists because catalogue CSV reads are cached (lru_cache). Use this endpoint
    after updating the catalogue file to force the backend to reload it without a restart.
    """
    # Clear cached CSV rows so updates to the catalogue are reflected immediately.
    try:
        _load_engineering_standards_rows.cache_clear()  # type: ignore[attr-defined]
    except Exception:
        pass

    # Reuse the canonical selection logic.
    return await get_project_engineering_standards(project_name)


@router.get(
    "/projects/{project_name}/regulations",
    response_model=RegulationsResponse,
)
async def get_project_regulations(project_name: str):
    """
    Return AOI-applicable regulations and related compliance documents.

    Results are persisted to a project snapshot at:
      docs/regulatory_docs/compliance_matrix_snapshot.json
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    snapshot_abs = _regulations_snapshot_path(project_path)
    if snapshot_abs.exists():
        try:
            payload = json.loads(snapshot_abs.read_text(encoding="utf-8"))
            return RegulationsResponse(**payload)
        except Exception:
            # Fall through to recompute
            pass

    return _compute_regulations_response(project_name, project_path, clear_cache=False)


@router.post(
    "/projects/{project_name}/regulations/refresh",
    response_model=RegulationsResponse,
)
async def refresh_project_regulations(
    project_name: str,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Recompute AOI→jurisdiction matching and refresh the compliance matrix snapshot.

    Also clears the cached catalogue CSV rows so file edits are reflected without restart.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    resp = _compute_regulations_response(project_name, project_path, clear_cache=True)
    write_audit_event(
        db,
        project_name=project_name,
        actor=actor,
        event_type="regulations.refresh",
        payload={"snapshot_path": str(_regulations_snapshot_path(project_path).relative_to(project_path))},
        required=True,
    )
    return resp


@router.post(
    "/projects/{project_name}/regulations/{entry_id}/index",
    response_model=RegulationIndexResponse,
)
async def index_regulation_entry(
    project_name: str,
    entry_id: str,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Index (download) a regulation text into the project `docs/regulatory_docs/` folder so it can be viewed later.

    The indexed file path is determined by the catalogue `FilingCategory`.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    entry_id_norm = (entry_id or "").strip()
    if not entry_id_norm:
        raise HTTPException(status_code=400, detail="Missing EntryID")

    rows = _load_regulation_catalog_rows()
    target: Optional[Dict[str, str]] = None
    for row in rows:
        rid = _sanitize_str(row.get("EntryID"))
        if rid and rid.strip() == entry_id_norm:
            target = row
            break
    if not target:
        raise HTTPException(status_code=404, detail="Regulation entry not found in catalogue")

    entry = _row_to_regulation_entry(target)
    if not entry.direct_download_url:
        raise HTTPException(status_code=400, detail="This entry has no DirectDownloadURL")
    category = (entry.filing_category or "").strip().lower()
    if category not in ALLOWED_REGULATORY_FILING_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid or missing FilingCategory")

    dest_dir = project_path / "docs" / "regulatory_docs" / category
    dest_dir.mkdir(parents=True, exist_ok=True)

    parsed = urlparse(entry.direct_download_url)
    url_name = (parsed.path or "").split("/")[-1]
    filename_hint = entry.direct_download_file_name or url_name or entry.entry_id
    filename = _safe_filename(filename_hint)

    media_type_hint = (entry.direct_download_content_type or "").strip() or None
    if not Path(filename).suffix and media_type_hint == "application/pdf":
        filename = f"{filename}.pdf"

    dest_path = dest_dir / filename

    if dest_path.exists() and dest_path.is_file():
        stat = dest_path.stat()
        media_type = media_type_hint or mimetypes.guess_type(str(dest_path))[0]
        resp = RegulationIndexResponse(
            stored_path=str(dest_path.relative_to(project_path)),
            filename=filename,
            category=category,
            size_bytes=stat.st_size,
            media_type=media_type,
        )
        write_audit_event(
            db,
            project_name=project_name,
            actor=actor,
            event_type="regulations.index",
            payload={"entry_id": entry_id_norm, "stored_path": resp.stored_path, "category": category, "already_present": True},
            required=True,
        )
        return resp

    bytes_written, detected_type = _download_stream_to_file(entry.direct_download_url, dest_path)
    media_type = media_type_hint or detected_type or mimetypes.guess_type(str(dest_path))[0]

    resp = RegulationIndexResponse(
        stored_path=str(dest_path.relative_to(project_path)),
        filename=filename,
        category=category,
        size_bytes=bytes_written or dest_path.stat().st_size,
        media_type=media_type,
    )
    write_audit_event(
        db,
        project_name=project_name,
        actor=actor,
        event_type="regulations.index",
        payload={"entry_id": entry_id_norm, "stored_path": resp.stored_path, "category": category, "already_present": False},
        required=True,
    )
    return resp


def _calculate_utm_zone(lon: float, lat: float) -> Tuple[int, str, int]:
    """
    Calculate UTM zone and EPSG code for a given longitude/latitude.
    Returns (zone_number, hemisphere_char, epsg_code).
    """
    zone = math.floor((lon + 180) / 6) + 1
    hemisphere = 'N' if lat >= 0 else 'S'
    
    # EPSG: 326xx for North, 327xx for South
    base = 32600 if lat >= 0 else 32700
    epsg = base + zone
    
    return zone, hemisphere, epsg


def _get_project_bbox_latlon(project_path: Path) -> Optional[Tuple[float, float, float, float]]:
    """
    Get project AOI bounding box in WGS84 (min_lon, min_lat, max_lon, max_lat).
    """
    # Check for any processed AOI file
    vectors_dir = project_path / "data" / "vectors" / "processed"
    aoi_file = None
    
    if vectors_dir.exists():
        processed = list(vectors_dir.glob("aoi_*_processed.gpkg"))
        if processed:
            aoi_file = processed[0]
    
    if not aoi_file:
        # Try symlink
        symlink = project_path / "data" / "vectors" / "aoi.gpkg"
        if symlink.exists():
            aoi_file = symlink
            
    if not aoi_file:
        # Try raw folder (aoi/)
        raw_dir = project_path / "aoi"
        if raw_dir.exists():
            candidates = list(raw_dir.glob("*.gpkg")) + list(raw_dir.glob("*.kml")) + list(raw_dir.glob("*.kmz")) + list(raw_dir.glob("*.geojson"))
            if candidates:
                aoi_file = candidates[0]

    if aoi_file and aoi_file.exists():
        try:
            # Use ogr2ogr to output WGS84 GeoJSON to stdout
            cmd_geojson = [
                "ogr2ogr", "-f", "GeoJSON", "-t_srs", "EPSG:4326", "/vsistdout/", str(aoi_file)
            ]
            result = subprocess.run(cmd_geojson, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                geojson = json.loads(result.stdout)
                if "bbox" in geojson:
                    return tuple(geojson["bbox"]) # minx, miny, maxx, maxy
                
                # Calculate from features if no bbox
                features = geojson.get("features", [])
                if features:
                    coords = []
                    for f in features:
                        geom = f.get("geometry", {})
                        if not geom: continue
                        
                        def extract_coords(obj):
                            if isinstance(obj, list):
                                if len(obj) >= 2 and isinstance(obj[0], (int, float)):
                                    coords.append(obj)
                                else:
                                    for item in obj:
                                        extract_coords(item)
                        
                        extract_coords(geom.get("coordinates", []))
                    
                    if coords:
                        lons = [c[0] for c in coords]
                        lats = [c[1] for c in coords]
                        return (min(lons), min(lats), max(lons), max(lats))
        except Exception as e:
            print(f"Failed to extract bbox from {aoi_file}: {e}")
            pass

    return None


@router.get("/projects/{project_name}/crs/recommend", response_model=ProjectCRSRecommendation)
async def recommend_project_crs(project_name: str):
    """
    Analyze project AOI and recommend the best Coordinate Reference System (UTM).
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    bbox = _get_project_bbox_latlon(project_path)
    
    if not bbox:
        # Fallback: Try to infer from ISO3 if possible, or default to WGS84
        iso3 = _infer_project_iso3(project_path)
        if iso3 == "USA":
             return ProjectCRSRecommendation(
                epsg=4269,
                name="NAD83",
                reason="Country default for USA (AOI not found)"
            )
        
        # Default global
        return ProjectCRSRecommendation(
            epsg=4326,
            name="WGS 84",
            reason="AOI not defined, defaulting to Geographic WGS 84"
        )

    min_lon, min_lat, max_lon, max_lat = bbox
    
    # Calculate centroid
    center_lon = (min_lon + max_lon) / 2
    center_lat = (min_lat + max_lat) / 2
    
    # Calculate UTM
    zone, hemi, epsg = _calculate_utm_zone(center_lon, center_lat)
    
    crs_name = f"WGS 84 / UTM zone {zone}{hemi}"
    
    return ProjectCRSRecommendation(
        epsg=epsg,
        name=crs_name,
        reason=f"Best fit for AOI centroid ({center_lat:.2f}, {center_lon:.2f}) in UTM Zone {zone}{hemi}",
        utm_zone=zone,
        hemisphere=hemi
    )


@router.put("/projects/{project_name}/crs")
async def update_project_crs(
    project_name: str,
    request: UpdateProjectCRSRequest,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Update the CRS for a project. Writes to project_metadata.json.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    metadata_file = project_path / "project_metadata.json"
    
    # Load existing metadata
    metadata = load_json_file(metadata_file) if metadata_file.exists() else {}
    if not metadata:
        metadata = {"project_name": project_name}

    old_epsg = metadata.get("crs_epsg") or ((metadata.get("crs") or {}).get("epsg") if isinstance(metadata.get("crs"), dict) else None)
    old_name = metadata.get("crs_name") or ((metadata.get("crs") or {}).get("name") if isinstance(metadata.get("crs"), dict) else None)
    
    # Update CRS fields (use flat format for compatibility)
    metadata["crs_epsg"] = request.epsg
    metadata["crs_name"] = request.name
    
    # Also update nested format if it exists
    if "crs" in metadata and isinstance(metadata["crs"], dict):
        metadata["crs"]["epsg"] = request.epsg
        metadata["crs"]["name"] = request.name
    else:
        metadata["crs"] = {"epsg": request.epsg, "name": request.name}
    
    # Write back to file
    try:
        with open(metadata_file, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=4)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update project metadata: {e}")

    write_audit_event(
        db,
        project_name=project_name,
        actor=actor,
        event_type="project.crs.update",
        payload={
            "before": {"epsg": old_epsg, "name": old_name},
            "after": {"epsg": request.epsg, "name": request.name},
        },
        required=True,
    )
    
    return {"status": "success", "epsg": request.epsg, "name": request.name}


@router.get("/projects/{project_name}/regulatory-docs", response_model=RegulatoryDocsResponse)
async def list_regulatory_docs(project_name: str):
    """
    List regulatory documents for a project following the standard structure.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    docs_dir = project_path / "docs" / "regulatory_docs"
    documents = []
    
    if docs_dir.exists():
        # Scan categories defined in standard
        categories = ["supranational", "national", "regional", "local", "technical", "industry"]
        
        for item in docs_dir.iterdir():
            if item.is_dir() and item.name in categories:
                cat = item.name
                for f in item.iterdir():
                    if f.is_file() and not f.name.startswith("."):
                        stat = f.stat()
                        documents.append(RegulatoryDoc(
                            name=f.name,
                            category=cat,
                            path=str(f.relative_to(project_path)),
                            size_bytes=stat.st_size,
                            last_modified=str(stat.st_mtime)
                        ))
            elif item.is_file() and item.suffix == ".pdf":
                 stat = item.stat()
                 documents.append(RegulatoryDoc(
                    name=item.name,
                    category="uncategorized",
                    path=str(item.relative_to(project_path)),
                    size_bytes=stat.st_size,
                    last_modified=str(stat.st_mtime)
                ))
    
    index_content = None
    index_file = docs_dir / "regulatory_index.md"
    if index_file.exists():
        try:
            index_content = index_file.read_text(encoding="utf-8")
        except Exception:
            pass

    sources_content = None
    sources_file = docs_dir / "regulatory_document_sources.md"
    if sources_file.exists():
        try:
            sources_content = sources_file.read_text(encoding="utf-8")
        except Exception:
            pass

    return RegulatoryDocsResponse(
        documents=documents,
        index_content=index_content,
        sources_content=sources_content
    )


@router.get("/projects/{project_name}/regulatory-docs/file")
async def get_regulatory_doc_file(project_name: str, path: str):
    """
    Serve an indexed regulatory document for viewing/downloading.

    Security: only serves files under docs/regulatory_docs/ within the project.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    root = (project_path / "docs" / "regulatory_docs").resolve()
    candidate = (project_path / path).resolve()
    if not str(candidate).startswith(str(root)):
        raise HTTPException(status_code=400, detail="Invalid document path")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Document not found")

    media_type, _ = mimetypes.guess_type(str(candidate))
    return FileResponse(str(candidate), media_type=media_type or "application/octet-stream")


class PirlOutput(BaseModel):
    filename: str
    size_bytes: int
    last_modified: str
    path: str


@router.get("/projects/{project_name}/pirl/outputs", response_model=List[PirlOutput])
async def list_pirl_outputs(project_name: str):
    """
    List all GeoJSON output files in the project's PIRL/outputs directory.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    outputs_dir = project_path / "PIRL" / "outputs"
    results = []

    if outputs_dir.exists():
        for item in outputs_dir.glob("*.geojson"):
            if item.is_file():
                stat = item.stat()
                results.append(PirlOutput(
                    filename=item.name,
                    size_bytes=stat.st_size,
                    last_modified=str(datetime.fromtimestamp(stat.st_mtime)),
                    path=str(item.relative_to(project_path))
                ))
    
    # Sort by last modified desc
    results.sort(key=lambda x: x.last_modified, reverse=True)
    return results


@router.post("/projects/create")
async def create_project(
    request: Request,
    project_name: str = Form(...),
    organization: str = Form(...),
    project_creator: Optional[str] = Form(None),  # legacy / ignored (creator is the authenticated user)
    measurement_system: str = Form(...),
    product: str = Form(...),
    inner_diameter: float = Form(...),
    outer_diameter: float = Form(...),
    aoi_file: Optional[UploadFile] = File(None),
    drawn_geojson: Optional[str] = Form(None),
    start_point_file: Optional[UploadFile] = File(None),
    end_point_file: Optional[UploadFile] = File(None),
    start_point_lat: Optional[float] = Form(None),
    start_point_lon: Optional[float] = Form(None),
    end_point_lat: Optional[float] = Form(None),
    end_point_lon: Optional[float] = Form(None),
    crs_epsg: Optional[int] = Form(None),
    crs_name: Optional[str] = Form(None),
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Create a new project following the AGRS project structure standard.
    """
    if outer_diameter <= inner_diameter:
        raise HTTPException(status_code=400, detail="Outside diameter must be greater than inside diameter.")
    measurement_system_raw = measurement_system.upper()
    if measurement_system_raw not in {"SI", "IMPERIAL"}:
        raise HTTPException(status_code=400, detail="Measurement system must be 'SI' or 'Imperial'.")
    measurement_system_normalized = "SI" if measurement_system_raw == "SI" else "Imperial"

    sanitized_name = _sanitize_project_name(project_name)
    project_dir = PROJECTS_ROOT / sanitized_name
    if project_dir.exists():
        raise HTTPException(status_code=400, detail="A project with this name already exists.")

    # Authenticated creator (canonical)
    is_admin = actor.get("role") in {"admin", "superadmin"}

    with tempfile.TemporaryDirectory() as tmpdir:
        temp_dir = Path(tmpdir)
        feature_collection = _prepare_aoi_payload(aoi_file, drawn_geojson, temp_dir)
        area_km2 = _calculate_area_km2(feature_collection)

        # Optional area limit only for drawn AOIs (uploaded files can be any size).
        # Admin users bypass the area limit.
        if drawn_geojson and MAX_AOI_AREA_KM2 is not None and area_km2 > MAX_AOI_AREA_KM2 and not is_admin:
            raise HTTPException(
                status_code=400,
                detail=f"AOI area ({area_km2:.1f} km²) exceeds the maximum allowed limit of {MAX_AOI_AREA_KM2} km². Please draw a smaller area."
            )

        geom = _collect_geometry(feature_collection)
        centroid = geom.centroid
        iso3, country_name = _infer_country_from_point(centroid.y, centroid.x)

        # Determine CRS: use provided override or calculate UTM
        if crs_epsg and crs_name:
            epsg = crs_epsg
            crs_display_name = crs_name
        else:
            zone, hemi, epsg = _calculate_utm_zone(centroid.x, centroid.y)
            crs_display_name = f"WGS 84 / UTM zone {zone}{hemi}"

        if start_point_file:
            sp_lat, sp_lon = _extract_point_from_file(start_point_file, temp_dir)
        elif start_point_lat is not None and start_point_lon is not None:
            sp_lat, sp_lon = start_point_lat, start_point_lon
        else:
            sp_lat = sp_lon = None

        if end_point_file:
            ep_lat, ep_lon = _extract_point_from_file(end_point_file, temp_dir)
        elif end_point_lat is not None and end_point_lon is not None:
            ep_lat, ep_lon = end_point_lat, end_point_lon
        else:
            ep_lat = ep_lon = None

    project_dir.mkdir(parents=True, exist_ok=False)
    _ensure_directories(project_dir)
    _touch_logs(project_dir)
    _create_readme_files(project_dir, sanitized_name)

    # Persist AOI GeoJSON
    aoi_geojson_path = project_dir / "aoi" / "aoi.geojson"
    _write_geojson(aoi_geojson_path, feature_collection)

    # Create processed AOI GeoPackage in data/vectors/processed/
    # This is required for the Map View to display the AOI as a vector layer
    processed_aoi_name = f"aoi_epsg{epsg}_processed.gpkg"
    processed_aoi_path = project_dir / "data" / "vectors" / "processed" / processed_aoi_name
    try:
        result = subprocess.run(
            [
                "ogr2ogr",
                "-f", "GPKG",
                "-t_srs", f"EPSG:{epsg}",
                str(processed_aoi_path),
                str(aoi_geojson_path)
            ],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            # Create metadata sidecar
            aoi_metadata_sidecar = {
                "category": "aoi",
                "dataset_name": "aoi",
                "source_crs": "EPSG:4326",
                "target_crs": f"EPSG:{epsg}",
                "processing_date": datetime.utcnow().isoformat(timespec="seconds") + "Z"
            }
            _write_json(processed_aoi_path.with_name(f"{processed_aoi_name}.json"), aoi_metadata_sidecar)
            # Create symlink in parent directory
            symlink_path = project_dir / "data" / "vectors" / "aoi.gpkg"
            if not symlink_path.exists():
                symlink_path.symlink_to(f"processed/{processed_aoi_name}")
    except Exception as e:
        print(f"Warning: Failed to create processed AOI GeoPackage: {e}")

    start_point_entry = None
    end_point_entry = None

    if sp_lat is not None and sp_lon is not None:
        start_geojson = _create_point_feature(sp_lat, sp_lon)
        _write_geojson(project_dir / "aoi" / "start_point.geojson", start_geojson)
        start_point_entry = {"latitude": sp_lat, "longitude": sp_lon}

    if ep_lat is not None and ep_lon is not None:
        end_geojson = _create_point_feature(ep_lat, ep_lon)
        _write_geojson(project_dir / "aoi" / "end_point.geojson", end_geojson)
        end_point_entry = {"latitude": ep_lat, "longitude": ep_lon}

    # AOI metadata (per PROJECT_STRUCTURE_STANDARD.md)
    aoi_metadata = {
        "aoi_file": "aoi/aoi.geojson",
        "aoi_area_km2": area_km2,
        "aoi_countries": [country_name] if country_name else [],
        "crs_epsg": epsg,
        "crs_name": crs_display_name,
    }
    if start_point_entry:
        aoi_metadata["start_point"] = {
            "file": "aoi/start_point.geojson",
            "latitude": start_point_entry["latitude"],
            "longitude": start_point_entry["longitude"],
        }
    if end_point_entry:
        aoi_metadata["end_point"] = {
            "file": "aoi/end_point.geojson",
            "latitude": end_point_entry["latitude"],
            "longitude": end_point_entry["longitude"],
        }
    _write_json(project_dir / "aoi" / "project_aoi.json", aoi_metadata)

    project_id = _generate_project_id(organization, sanitized_name, iso3)
    creator_label = (
        (actor.get("full_name") or "").strip()
        or (actor.get("name") or "").strip()
        or (actor.get("email") or "").strip()
        or (actor.get("username") or "").strip()
        or "unknown"
    )
    metadata = {
        "project_name": sanitized_name,
        "project_id": project_id,
        "date_created": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "status": "active",
        "project_creator": creator_label,
        "collaborators": [],
        "organization": organization,
        "country": country_name,
        "iso3": iso3,
        "measurement_system": measurement_system_normalized,
        "crs": {
            "epsg": epsg,
            "name": crs_display_name,
        },
    }
    _write_json(project_dir / "project_metadata.json", metadata)

    # Pipeline specs: store both base units (m or in) and derived metric fields (mm)
    inch_to_mm = 25.4
    if measurement_system_normalized == "SI":
        outer_mm = outer_diameter * 1000.0
        inner_mm = inner_diameter * 1000.0
    else:
        outer_mm = outer_diameter * inch_to_mm
        inner_mm = inner_diameter * inch_to_mm
    wall_mm = (outer_mm - inner_mm) / 2.0

    pipeline_specs = {
        "product": product,
        "inner_diameter": inner_diameter,
        "outer_diameter": outer_diameter,
        "measurement_system": measurement_system_normalized,
        "diameter_mm": outer_mm,
        "inner_diameter_mm": inner_mm,
        "wall_thickness_mm": wall_mm,
        "thickness_mm": wall_mm,
    }
    _write_json(project_dir / "pipeline_specs.json", pipeline_specs)

    templates_root = Path("/opt/agrs/templates")
    _copy_template_if_exists(
        templates_root / "pirl_training_config_template.yaml",
        project_dir / "PIRL" / "pirl_training_config.yaml",
    )
    _copy_template_if_exists(
        templates_root / "pipeline_specs_hydraulics_defaults.json",
        project_dir / "PIRL" / "pipeline_specs_hydraulics_defaults.json",
    )

    # Process AOI and points to data/vectors/processed/ for map display
    date_acquired = datetime.utcnow().strftime("%Y-%m-%d")
    vectors_processed_dir = project_dir / "data" / "vectors" / "processed"
    
    # Process AOI to GeoPackage (only AOI goes to /processed, not start/end points)
    _process_aoi_to_gpkg(aoi_geojson_path, vectors_processed_dir, epsg, date_acquired)

    # Persist project + membership in Postgres (canonical global store)
    db_project = upsert_project_row(db, sanitized_name)
    try:
        actor_id = uuid.UUID(str(actor.get("id")))
    except Exception:
        actor_id = None
    if actor_id:
        membership = db.execute(
            select(ProjectMembership).where(
                ProjectMembership.user_id == actor_id,
                ProjectMembership.project_id == db_project.id,
            )
        ).scalar_one_or_none()
        if membership is None:
            db.add(ProjectMembership(user_id=actor_id, project_id=db_project.id, membership_role="owner"))
            db.commit()
        elif membership.left_at is not None:
            membership.left_at = None
            membership.membership_role = membership.membership_role or "owner"
            db.commit()

    # Build a compliance matrix snapshot on creation (best-effort; never block project creation).
    try:
        _compute_regulations_response(sanitized_name, project_dir, clear_cache=False)
    except Exception as exc:
        print(f"Warning: Failed to generate compliance matrix snapshot for {sanitized_name}: {exc}")

    # Project-scoped audit event
    write_audit_event(
        db,
        project_name=sanitized_name,
        actor=actor,
        event_type="project.create",
        payload={
            "project_id": project_id,
            "organization": organization,
            "country": country_name,
            "iso3": iso3,
            "measurement_system": measurement_system_normalized,
            "crs_epsg": epsg,
            "crs_name": crs_display_name,
            "aoi_area_km2": area_km2,
        },
        required=True,
    )

    return {
        "status": "success",
        "project_name": sanitized_name,
        "project_id": project_id,
        "iso3": iso3,
        "country": country_name,
    }




