"""
Project Discovery API Endpoints

Provides endpoints to discover and manage projects following the AGRS standard structure.
"""
import csv
import re
from functools import lru_cache
from pathlib import Path
from typing import List, Dict, Any, Optional, List as ListType

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .project_utils import (
    discover_project_paths,
    resolve_project_path,
    load_json_file,
)

router = APIRouter()

PERPLEXITY_ROOT = Path("/opt/agrs/docs/Perplexity")
COUNTRY_COVERAGE_CSV = PERPLEXITY_ROOT / "COUNTRY_COVERAGE_LONG.csv"
ISO_CODES_CSV = PERPLEXITY_ROOT / "iso_countries.csv"
COUNTRY_DATASETS_DIR = PERPLEXITY_ROOT / "Country Coverage" / "Country Datasets"
TIER1_DATASETS_CSV = PERPLEXITY_ROOT / "TIER1_BEST_DATASETS.csv"
DATASET_FETCH_PROTOCOL = "/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md"


class ProjectMetadata(BaseModel):
    """Project metadata model"""
    project_name: str
    project_code: Optional[str] = None
    client: Optional[str] = None
    date_created: Optional[str] = None
    status: Optional[str] = None
    crs: Optional[Dict[str, Any]] = None
    aoi: Optional[Dict[str, Any]] = None
    measurement_system: Optional[str] = None
    units: Optional[Dict[str, str]] = None


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
            projects.append(ProjectMetadata(**metadata))
        else:
            # Minimal response if metadata is missing
            projects.append(ProjectMetadata(project_name=project_dir.name))

    return projects


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
    
    return ProjectMetadata(**metadata)


@router.get("/projects/{project_name}/datasets", response_model=ProjectDatasets)
async def list_project_datasets(project_name: str):
    """
    List all available datasets for a project
    
    Scans data/rasters/ and data/vectors/ directories for symlinks and files.
    Reads metadata from .json sidecars if available.
    """
    project_path = resolve_project_path(project_name)
    
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found (missing project root with project_metadata.json or pipeline_specs.json)")
    
    rasters_dir = project_path / "data" / "rasters"
    vectors_dir = project_path / "data" / "vectors"
    
    rasters = []
    vectors = []
    
    # Scan rasters directory
    if rasters_dir.exists():
        for item in rasters_dir.iterdir():
            # Look for .tif files (symlinks or regular files)
            if item.suffix == '.tif':
                dataset_name = item.stem
                
                # Resolve symlink to find the actual file (likely in processed/)
                # This handles the requirement to pull metadata from /processed folders
                try:
                    real_path = item.resolve()
                    metadata_file = real_path.with_name(f"{real_path.name}.json")
                except Exception:
                    # Fallback to sidecar next to the link if resolve fails
                    metadata_file = item.with_name(f"{item.name}.json")
                
                dataset_info = DatasetInfo(
                    name=dataset_name,
                    type='raster',
                    path=str(item.relative_to(project_path))
                )
                
                # Load metadata if available
                if metadata_file.exists():
                    dataset_info.metadata = load_json_file(metadata_file)
                
                rasters.append(dataset_info)
    
    # Scan vectors directory
    if vectors_dir.exists():
        for item in vectors_dir.iterdir():
            # Look for .gpkg files (symlinks or regular files)
            if item.suffix == '.gpkg':
                dataset_name = item.stem
                
                # Resolve symlink to find the actual file (likely in processed/)
                try:
                    real_path = item.resolve()
                    metadata_file = real_path.with_name(f"{real_path.name}.json")
                except Exception:
                     # Fallback to sidecar next to the link if resolve fails
                    metadata_file = item.with_name(f"{item.name}.json")
                
                dataset_info = DatasetInfo(
                    name=dataset_name,
                    type='vector',
                    path=str(item.relative_to(project_path))
                )
                
                # Load metadata if available
                if metadata_file.exists():
                    dataset_info.metadata = load_json_file(metadata_file)
                
                vectors.append(dataset_info)
    
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


