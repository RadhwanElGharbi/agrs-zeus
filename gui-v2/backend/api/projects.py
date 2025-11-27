"""
Project Discovery API Endpoints

Provides endpoints to discover and manage projects following the AGRS standard structure.
"""
import csv
import re
import math
import subprocess
import json
import shutil
import tempfile
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import List, Dict, Any, Optional, List as ListType, Tuple

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union
from pyproj import Geod
import reverse_geocoder as rg
import pycountry
from .project_utils import (
    discover_project_paths,
    resolve_project_path,
    load_json_file,
    PROJECTS_ROOT,
)

router = APIRouter()

PERPLEXITY_ROOT = Path("/opt/agrs/docs/Perplexity")
COUNTRY_COVERAGE_CSV = PERPLEXITY_ROOT / "COUNTRY_COVERAGE_LONG.csv"
ISO_CODES_CSV = PERPLEXITY_ROOT / "iso_countries.csv"
COUNTRY_DATASETS_DIR = PERPLEXITY_ROOT / "Country Coverage" / "Country Datasets"
TIER1_DATASETS_CSV = PERPLEXITY_ROOT / "TIER1_BEST_DATASETS.csv"
DATASET_FETCH_PROTOCOL = "/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md"
GEOD = Geod(ellps="WGS84")


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
    organization: Optional[str] = None
    department: Optional[str] = None
    project_creator: Optional[str] = None
    project_type: Optional[str] = None


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


class DatasetCoverageResponse(BaseModel):
    iso3: str
    country: Optional[str]
    entries: List[DatasetCoverageEntry]
    summary: Optional[str] = None
    protocol_reference: str


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


def _sanitize_project_name(name: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9-]+", "-", name).strip("-")
    if not sanitized:
        raise HTTPException(status_code=400, detail="Project name must contain letters, numbers, or hyphens.")
    return sanitized


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=4)


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
    directories = [
        base / "aoi",
        base / "data" / "rasters" / "raw",
        base / "data" / "rasters" / "processed",
        base / "data" / "vectors" / "raw",
        base / "data" / "vectors" / "processed",
        base / "inputs",
        base / "scripts",
        base / "derived",
        base / "outputs",
        base / "PIRL" / "models" / "best_model",
        base / "PIRL" / "models" / "checkpoints",
        base / "PIRL" / "outputs",
        base / "PIRL" / "logs",
        base / "PIRL" / "parameter_tuner",
        base / "logs",
        base / "docs",
        base / "docs" / "cost_matrix",
        base / "docs" / "regulatory_docs" / "national",
        base / "docs" / "regulatory_docs" / "regional",
        base / "docs" / "regulatory_docs" / "local",
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
):
    """
    Analyze AOI geometry to provide area, centroid, inferred countries, and recommended CRS.
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
async def list_projects():
    """
    Discover and list all valid projects in /opt/agrs/Projects/
    
    A valid project must have a project_metadata.json or pipeline_specs.json file.
    """
    projects = []

    project_dirs = discover_project_paths()
    for _, project_dir in sorted(project_dirs.items()):
        metadata_file = project_dir / "project_metadata.json"
        metadata = load_json_file(metadata_file) if metadata_file.exists() else None

        if metadata:
            normalized = _normalize_project_metadata(metadata, project_dir)
            projects.append(ProjectMetadata(**normalized))
        else:
            # Minimal response if metadata is missing
            projects.append(ProjectMetadata(project_name=project_dir.name))

    return projects


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
                    
                    # Extract countries: prefer project_aoi.json, then project metadata
                    if 'countries' not in aoi_obj:
                        if 'aoi_countries' in aoi_data:
                            aoi_obj['countries'] = aoi_data['aoi_countries']
                        elif 'country' in result:
                            aoi_obj['countries'] = [result['country']]
                        elif 'iso3' in result:
                            iso_to_name, _, _ = _load_iso_mappings()
                            country_name = iso_to_name.get(result['iso3'])
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
    return ProjectMetadata(**normalized)


def _build_display_name_from_metadata(metadata: dict, fallback_name: str) -> str:
    """
    Build display name from metadata JSON sidecar.
    Format: {category}_{dataset_name}_{target_crs}_processed
    Where dataset_name has spaces replaced with hyphens.
    target_crs is formatted as EPSGnumber (no colon).
    """
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
                metadata = {}
                
                # Load metadata if available
                if metadata_file.exists():
                    metadata = load_json_file(metadata_file)
                
                # Build display name from metadata or fallback to filename
                import re
                raw_name = item.stem
                fallback_name = re.sub(r'_epsg\d+_processed$', '', raw_name, flags=re.IGNORECASE)
                fallback_name = re.sub(r'_processed$', '', fallback_name, flags=re.IGNORECASE)
                
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
                metadata = {}
                
                # Load metadata if available
                if metadata_file.exists():
                    metadata = load_json_file(metadata_file)
                
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

    iso_to_name, name_to_iso, alpha2_to_iso = _load_iso_mappings()
    upper = val.upper()

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

    return None


@lru_cache()
def _load_country_coverage_rows():
    if not COUNTRY_COVERAGE_CSV.exists():
        return []
    rows = []
    with COUNTRY_COVERAGE_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows.extend(reader)
    return rows


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


@lru_cache()
def _load_tier1_rows() -> Dict[str, ListType[ListType[str]]]:
    tier1_map: Dict[str, ListType[ListType[str]]] = {}
    if not TIER1_DATASETS_CSV.exists():
        return tier1_map

    iso_to_name, name_to_iso, _ = _load_iso_mappings()
    valid_isos = set(iso_to_name.keys())

    with TIER1_DATASETS_CSV.open("r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            first = row[0].strip()
            if not first or first.startswith("#") or first.lower() == "country":
                continue
            iso = _normalize_country_value(first)
            if not iso or iso not in valid_isos:
                continue
            tier1_map.setdefault(iso, []).append(row)
    return tier1_map


def _tier1_row_to_entry(row: ListType[str]) -> DatasetCoverageEntry:
    get = lambda idx: _sanitize_str(row[idx]) if idx < len(row) else None
    category = get(1)
    dataset_name = get(2) or category or "Unnamed dataset"
    resolution = get(4)
    temporal = get(5)
    notes = get(11)

    coverage_parts = [part for part in [resolution, notes] if part]
    coverage = " | ".join(coverage_parts) if coverage_parts else None

    return DatasetCoverageEntry(
        dataset=dataset_name,
        source=get(3),
        data_type=category,
        access=get(7),
        coverage=coverage,
        temporal_start=temporal,
        frequency=get(6),
        applies_globally=False,
    )


@router.get(
    "/projects/{project_name}/dataset-coverage",
    response_model=DatasetCoverageResponse,
)
async def get_project_dataset_coverage(project_name: str):
    """
    Return datasets that are known to cover the project's AOI boundaries.

    Coverage catalog references /opt/agrs/docs/Perplexity and honors the
    workflow defined in DATASET_FETCHING_PROTOCOLS.md.
    """
    project_path = resolve_project_path(project_name)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found.")

    iso3 = _infer_project_iso3(project_path) or "WLD"
    iso_to_name, _, _ = _load_iso_mappings()
    country_name = iso_to_name.get(iso3)

    rows = _load_country_coverage_rows()
    if not rows:
        raise HTTPException(status_code=500, detail="Coverage catalog not available.")

    tier1_rows_map = _load_tier1_rows()
    is_tier1 = iso3 in tier1_rows_map

    if is_tier1:
        local_entries = [_tier1_row_to_entry(row) for row in tier1_rows_map[iso3]]
    else:
        local_rows = [row for row in rows if row.get("ISO3") == iso3]
        local_entries = [_row_to_entry(row, is_global=False) for row in local_rows]

    global_rows = [row for row in rows if row.get("ISO3") == "WLD"]
    global_entries = [_row_to_entry(row, is_global=True) for row in global_rows]

    entries = local_entries + global_entries

    summary = _load_country_summary(country_name, iso3)

    return DatasetCoverageResponse(
        iso3=iso3,
        country=country_name,
        entries=entries,
        summary=summary,
        protocol_reference=DATASET_FETCH_PROTOCOL,
    )


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
async def update_project_crs(project_name: str, request: UpdateProjectCRSRequest):
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
        categories = ["national", "regional", "local", "technical", "industry"]
        
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


@router.post("/projects/create")
async def create_project(
    project_name: str = Form(...),
    organization: str = Form(...),
    project_creator: str = Form(...),
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

    with tempfile.TemporaryDirectory() as tmpdir:
        temp_dir = Path(tmpdir)
        feature_collection = _prepare_aoi_payload(aoi_file, drawn_geojson, temp_dir)
        area_km2 = _calculate_area_km2(feature_collection)
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

    # Persist AOI GeoJSON
    aoi_geojson_path = project_dir / "aoi" / "aoi.geojson"
    _write_geojson(aoi_geojson_path, feature_collection)

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

    # AOI metadata
    aoi_metadata = {
        "aoi_file": "aoi/aoi.geojson",
        "aoi_area_km2": area_km2,
        "aoi_countries": [country_name] if country_name else [],
    }
    if start_point_entry:
        aoi_metadata["start_point"] = start_point_entry
    if end_point_entry:
        aoi_metadata["end_point"] = end_point_entry
    _write_json(project_dir / "aoi" / "project_aoi.json", aoi_metadata)

    project_id = _generate_project_id(organization, sanitized_name, iso3)
    metadata = {
        "project_name": sanitized_name,
        "project_id": project_id,
        "date_created": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "status": "active",
        "project_creator": project_creator,
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

    pipeline_specs = {
        "product": product,
        "inner_diameter": inner_diameter,
        "outer_diameter": outer_diameter,
        "measurement_system": measurement_system_normalized,
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

    return {
        "status": "success",
        "project_name": sanitized_name,
        "project_id": project_id,
        "iso3": iso3,
        "country": country_name,
    }




