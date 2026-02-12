"""
PIRL Route API Endpoints

Provides endpoints to discover and serve PIRL route GeoJSON files,
and to save PIRL configuration requests.
"""

import os
import csv
import json
import hashlib
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .project_utils import resolve_project_path, load_json_file
from .audit import write_audit_event
from .auth import get_current_user, require_auth
from .db import get_db

try:
    from pyproj import Transformer
    HAS_PYPROJ = True
except ImportError:
    HAS_PYPROJ = False

router = APIRouter()

# Base projects directory
PROJECTS_ROOT = Path("/opt/agrs/Projects")


# ============================================================================
# Coordinate Transformation Helpers
# ============================================================================

def get_project_crs(project_path: Path) -> Optional[int]:
    """Get the EPSG code for a project from its metadata."""
    metadata_file = project_path / "project_metadata.json"
    if metadata_file.exists():
        try:
            with open(metadata_file) as f:
                metadata = json.load(f)
            return metadata.get("crs", {}).get("epsg")
        except Exception:
            pass
    return None


def transform_coordinates(coords: List, from_epsg: int, to_epsg: int = 4326) -> List:
    """
    Transform coordinates from one CRS to another.

    Args:
        coords: Coordinate array (can be nested for LineString, Polygon, etc.)
        from_epsg: Source EPSG code
        to_epsg: Target EPSG code (default WGS84)

    Returns:
        Transformed coordinate array
    """
    if not HAS_PYPROJ:
        return coords

    transformer = Transformer.from_crs(f"EPSG:{from_epsg}", f"EPSG:{to_epsg}", always_xy=True)

    def transform_point(point: List) -> List:
        if len(point) >= 2:
            x, y = transformer.transform(point[0], point[1])
            if len(point) > 2:
                return [x, y] + point[2:]
            return [x, y]
        return point

    def transform_nested(arr: List) -> List:
        if not arr:
            return arr
        # Check if this is a coordinate pair (list of numbers)
        if isinstance(arr[0], (int, float)):
            return transform_point(arr)
        # Otherwise recurse
        return [transform_nested(item) for item in arr]

    return transform_nested(coords)


def transform_geojson(geojson: Dict, from_epsg: int, to_epsg: int = 4326) -> Dict:
    """
    Transform all coordinates in a GeoJSON object from one CRS to another.

    Args:
        geojson: GeoJSON dictionary
        from_epsg: Source EPSG code
        to_epsg: Target EPSG code (default WGS84)

    Returns:
        GeoJSON with transformed coordinates
    """
    if not HAS_PYPROJ or from_epsg == to_epsg:
        return geojson

    result = geojson.copy()

    if "features" in result:
        # FeatureCollection
        result["features"] = [
            transform_geojson(feature, from_epsg, to_epsg)
            for feature in result["features"]
        ]
    elif "geometry" in result:
        # Feature
        result = result.copy()
        result["geometry"] = transform_geojson(result["geometry"], from_epsg, to_epsg)
    elif "coordinates" in result:
        # Geometry object
        result = result.copy()
        result["coordinates"] = transform_coordinates(result["coordinates"], from_epsg, to_epsg)

    return result


def coords_need_transformation(coords: List) -> bool:
    """
    Check if coordinates appear to be in a projected CRS (not WGS84).

    UTM coordinates are typically large numbers (100,000s to millions),
    while WGS84 lat/lng are -180 to 180 and -90 to 90.
    """
    def get_first_point(arr: List) -> Optional[List]:
        if not arr:
            return None
        if isinstance(arr[0], (int, float)):
            return arr
        return get_first_point(arr[0])

    point = get_first_point(coords)
    if point and len(point) >= 2:
        x, y = point[0], point[1]
        # If values are outside WGS84 bounds, likely projected
        if abs(x) > 180 or abs(y) > 90:
            return True
    return False


# ============================================================================
# PIRL Request Models (for saving configuration)
# Matches frontend TypeScript interfaces in PirlAiDialog.tsx
# ============================================================================

# --- Objectives Models ---
class PrimaryWeights(BaseModel):
    costOptimization: float = 80
    constructionSpeed: float = 40
    regulatoryMinimization: float = 60
    environmentalImpact: float = 70

class GeometricPreferences(BaseModel):
    existingRowUsage: float = 90
    minimizeCrossings: float = 50
    terrainFlatness: float = 60

class ObjectivesData(BaseModel):
    primaryWeights: PrimaryWeights
    geometricPreferences: GeometricPreferences
    activeProfile: str = "Cost Aggressive"


# --- Hydraulics Models ---
class MechanicalData(BaseModel):
    outerDiameter: float = 660.4
    wallThickness: float = 11.0
    grade: str = "483"
    locationClass: str = "1"
    designFactor: str = "0.72"
    jointFactor: str = "1.0"
    tempDerating: str = "1.0"
    maop: str = "9930"

class OperatingData(BaseModel):
    inletPressure: str = "75.0"
    deliveryPressure: str = "45.0"
    flowRate: str = "1.0"
    inletTemp: str = "288.15"
    groundTemp: str = "283.15"
    roughness: str = "0.045"

class FluidCompositionData(BaseModel):
    methane: str = "92.5"
    ethane: str = "4.2"
    propane: str = "1.5"
    butane: str = "0.8"
    nitrogen: str = "0.6"
    co2: str = "0.4"
    h2s: str = "0.0"
    waterContent: str = "< 7"
    specificGravity: str = "0.58"
    viscosity: str = "1.1e-5"
    critPressure: str = "46.0"
    critTemp: str = "190.6"

class HydraulicsData(BaseModel):
    mechanical: MechanicalData
    operating: OperatingData
    fluidComposition: FluidCompositionData


# --- Cost Matrix Models ---
class MaterialCostRow(BaseModel):
    diameter: str
    wallThickness: str
    grade: str
    costPerMeter: str
    weight: str

class LaborRateRow(BaseModel):
    region: str
    welder: str
    equipmentOperator: str
    laborer: str
    engineer: str

class EquipmentRentalRow(BaseModel):
    equipment: str
    capacity: str
    dailyRate: str
    monthlyRate: str

class TerrainMultiplierRow(BaseModel):
    terrainType: str
    multiplier: str
    costPerKm: str
    rationale: str

class RowAcquisitionRow(BaseModel):
    landUse: str
    permanentEasement: str
    temporaryEasement: str
    totalPerKm: str

class WaterCrossingRow(BaseModel):
    type: str
    width: str
    openCut: str
    hddCost: str
    hddMultiplier: str

class InfrastructureCrossingRow(BaseModel):
    infrastructure: str
    costPerCrossing: str
    method: str
    notes: str

class RegionalFactorRow(BaseModel):
    region: str
    costPerKm: str
    laborIndex: str
    materialIndex: str
    notes: str

class PermittingRow(BaseModel):
    item: str
    costRange: str
    timeline: str

class IndirectCostRow(BaseModel):
    item: str
    cost: str
    description: str

class CostMatrixData(BaseModel):
    materialCosts: List[MaterialCostRow] = []
    laborRates: List[LaborRateRow] = []
    equipmentRental: List[EquipmentRentalRow] = []
    terrainMultipliers: List[TerrainMultiplierRow] = []
    rowAcquisition: List[RowAcquisitionRow] = []
    waterCrossings: List[WaterCrossingRow] = []
    infrastructureCrossings: List[InfrastructureCrossingRow] = []
    regionalFactors: List[RegionalFactorRow] = []
    permitting: List[PermittingRow] = []
    indirectCosts: List[IndirectCostRow] = []


# --- Constraints Models ---
class GeographicalExclusions(BaseModel):
    protectedAreas: bool = True
    urbanDensity: bool = True
    indigenousLands: bool = True
    waterBodies: bool = True
    culturalHeritage: bool = False
    militaryZones: bool = True
    geohazards: bool = True

class ConstructabilityLimits(BaseModel):
    maxLongSlope: str = "30"
    maxSideSlope: str = "15"
    minBendRadius: str = "20"
    maxBendAngle: str = "90"
    minDepthOfCover: str = "1.2"
    rowWidth: str = "30"
    buoyancyControl: str = "1.1"
    strainLimit: str = "0.5"

class ConstraintsData(BaseModel):
    geographicalExclusions: GeographicalExclusions
    constructabilityLimits: ConstructabilityLimits


# --- Main Request Model ---
class PirlRequestData(BaseModel):
    """Complete PIRL request configuration - matches frontend PirlFormData"""
    objectives: ObjectivesData
    hydraulics: HydraulicsData
    costMatrix: CostMatrixData
    constraints: ConstraintsData


class RouteMetadata(BaseModel):
    """PIRL route metadata model"""
    filename: str
    total_reward: Optional[float] = None
    success: Optional[bool] = None
    num_segments: Optional[int] = None
    num_points: Optional[int] = None
    total_length_m: Optional[float] = None
    total_cost_usd: Optional[float] = None
    model_path: Optional[str] = None
    timestamp: Optional[str] = None
    # Enhanced metadata from sidecar files
    has_metadata_sidecar: Optional[bool] = False
    generation_method: Optional[str] = None
    constraint_compliant: Optional[bool] = None
    cost_per_km: Optional[float] = None
    is_real_route: Optional[bool] = False  # True for actual infrastructure data


def extract_route_metadata(geojson_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract metadata from GeoJSON file"""
    metadata = {}
    
    # Check for metadata at root level
    if 'metadata' in geojson_data:
        metadata.update(geojson_data['metadata'])
    
    # Check for metadata in first feature (full_route)
    if 'features' in geojson_data and len(geojson_data['features']) > 0:
        first_feature = geojson_data['features'][0]
        if 'properties' in first_feature:
            props = first_feature['properties']
            if 'total_reward' in props:
                metadata['total_reward'] = props['total_reward']
            if 'success' in props:
                metadata['success'] = props['success']
            if 'total_segments' in props:
                metadata['num_segments'] = props['total_segments']
            if 'total_length_m' in props:
                metadata['total_length_m'] = props['total_length_m']
            if 'total_cost_usd' in props:
                metadata['total_cost_usd'] = props['total_cost_usd']
            if 'model_path' in props:
                metadata['model_path'] = props['model_path']
            if 'generated_at' in props:
                metadata['timestamp'] = props['generated_at']
    
    return metadata


def load_sidecar_metadata(geojson_file: Path) -> Optional[Dict[str, Any]]:
    """Load metadata from sidecar JSON file if it exists"""
    sidecar_path = geojson_file.with_suffix('.metadata.json')
    if sidecar_path.exists():
        try:
            with open(sidecar_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading sidecar {sidecar_path}: {e}")
    return None

def load_sidecar_metadata_summary(geojson_file: Path) -> Optional[Dict[str, Any]]:
    """
    Load a *small* summary from a route .metadata.json sidecar without parsing huge payloads.

    Why:
    - Our Ravenna-style metadata includes `crossings_detailed.crossings` which can be hundreds+
      of records and makes the JSON sidecar large.
    - The routes list endpoint (`GET /pirl/{project}/routes`) only needs a few summary fields.

    How:
    - Read the file line-by-line, stop once we reach `"crossings_detailed"` (which appears
      after the summary sections in our pretty-printed JSON).
    - Extract only the small set of keys the list endpoint needs using a shallow state machine.
    """
    sidecar_path = geojson_file.with_suffix(".metadata.json")
    if not sidecar_path.exists():
        return None

    wanted: Dict[str, Any] = {}

    section: Optional[str] = None
    section_depth: Optional[int] = None
    depth = 0

    def _try_parse_value(line: str) -> Optional[Any]:
        # Expect: "key": <json_value>,
        if ":" not in line:
            return None
        _, raw = line.split(":", 1)
        raw = raw.strip()
        if raw.endswith(","):
            raw = raw[:-1].rstrip()
        try:
            return json.loads(raw)
        except Exception:
            return None

    try:
        with open(sidecar_path, "r", encoding="utf-8") as f:
            for line in f:
                # Stop before heavy payload.
                if '"crossings_detailed"' in line:
                    break

                # Track very rough nesting depth for section exit.
                depth += line.count("{") - line.count("}")

                if section is not None and section_depth is not None and depth < section_depth:
                    section = None
                    section_depth = None

                # Enter sections we care about.
                if '"generation_method"' in line and "{" in line:
                    section = "generation_method"
                    section_depth = depth
                    continue
                if '"constraint_compliance"' in line and "{" in line:
                    section = "constraint_compliance"
                    section_depth = depth
                    continue
                if '"cost_breakdown"' in line and "{" in line:
                    section = "cost_breakdown"
                    section_depth = depth
                    continue
                if '"route_info"' in line and "{" in line:
                    section = "route_info"
                    section_depth = depth
                    continue

                # Extract summary keys within those sections.
                if section == "generation_method":
                    if '"method"' in line and "generation_method" not in wanted:
                        val = _try_parse_value(line)
                        if isinstance(val, str):
                            wanted["generation_method_method"] = val
                    if '"is_real_route"' in line and "generation_method_is_real_route" not in wanted:
                        val = _try_parse_value(line)
                        if isinstance(val, bool):
                            wanted["generation_method_is_real_route"] = val

                elif section == "constraint_compliance":
                    if '"overall_compliant"' in line and "constraint_overall_compliant" not in wanted:
                        val = _try_parse_value(line)
                        if isinstance(val, bool):
                            wanted["constraint_overall_compliant"] = val

                elif section == "cost_breakdown":
                    if '"total"' in line and "cost_total" not in wanted:
                        val = _try_parse_value(line)
                        if isinstance(val, (int, float)):
                            wanted["cost_total"] = float(val)
                    if '"cost_per_km"' in line and "cost_per_km" not in wanted:
                        val = _try_parse_value(line)
                        if isinstance(val, (int, float)):
                            wanted["cost_per_km"] = float(val)

                elif section == "route_info":
                    if '"length_m"' in line and "route_length_m" not in wanted:
                        val = _try_parse_value(line)
                        if isinstance(val, (int, float)):
                            wanted["route_length_m"] = float(val)

                # Early exit once we have everything the list endpoint uses.
                if (
                    "generation_method_method" in wanted
                    and "constraint_overall_compliant" in wanted
                    and "cost_total" in wanted
                    and "cost_per_km" in wanted
                    and "route_length_m" in wanted
                ):
                    # We can stop reading early; don't wait for crossings_detailed marker.
                    break

        return wanted
    except Exception as e:
        print(f"Error reading sidecar summary {sidecar_path}: {e}")
        return None


@router.get("/pirl/{project}/routes", response_model=List[RouteMetadata])
async def list_routes(project: str):
    """
    List all available PIRL routes for a project

    Scans PIRL/outputs/ directory for *.geojson files.
    Also loads enhanced metadata from sidecar .metadata.json files if present.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    pirl_outputs_dir = project_path / "PIRL" / "outputs"

    if not pirl_outputs_dir.exists():
        return []

    routes = []

    # Scan for all *.geojson files (not just route_*)
    for geojson_file in pirl_outputs_dir.glob("*.geojson"):
        # Skip metadata sidecar files
        if geojson_file.name.endswith('.metadata.json'):
            continue

        try:
            # For large routes, loading full GeoJSON can be very slow (multi-thousand segments).
            # Prefer sidecar-based summary when available.
            metadata: Dict[str, Any] = {"filename": geojson_file.name}

            sidecar_summary = load_sidecar_metadata_summary(geojson_file)
            if sidecar_summary:
                metadata["has_metadata_sidecar"] = True
                metadata["generation_method"] = sidecar_summary.get("generation_method_method", "Unknown")
                metadata["is_real_route"] = sidecar_summary.get("generation_method_is_real_route", False)
                metadata["constraint_compliant"] = sidecar_summary.get("constraint_overall_compliant")
                metadata["total_cost_usd"] = sidecar_summary.get("cost_total")
                metadata["cost_per_km"] = sidecar_summary.get("cost_per_km")
                metadata["total_length_m"] = sidecar_summary.get("route_length_m")
            else:
                # Fall back: small/legacy routes might not have sidecars.
                with open(geojson_file, 'r', encoding='utf-8') as f:
                    geojson_data = json.load(f)
                metadata.update(extract_route_metadata(geojson_data))
                metadata['filename'] = geojson_file.name

            routes.append(RouteMetadata(**metadata))
        except Exception as e:
            print(f"Error reading {geojson_file}: {e}")
            routes.append(RouteMetadata(filename=geojson_file.name))

    # Also check subdirectories
    for subdir in pirl_outputs_dir.iterdir():
        if subdir.is_dir():
            for geojson_file in subdir.glob("*.geojson"):
                if geojson_file.name.endswith('.metadata.json'):
                    continue
                try:
                    with open(geojson_file, 'r', encoding='utf-8') as f:
                        geojson_data = json.load(f)

                    metadata = extract_route_metadata(geojson_data)
                    metadata['filename'] = f"{subdir.name}/{geojson_file.name}"

                    # Check for sidecar
                    sidecar_data = load_sidecar_metadata(geojson_file)
                    if sidecar_data:
                        metadata['has_metadata_sidecar'] = True
                        gen_method = sidecar_data.get('generation_method', {})
                        metadata['generation_method'] = gen_method.get('method', 'Unknown')
                        metadata['is_real_route'] = gen_method.get('is_real_route', False)
                        compliance = sidecar_data.get('constraint_compliance', {})
                        metadata['constraint_compliant'] = compliance.get('overall_compliant')

                    routes.append(RouteMetadata(**metadata))
                except Exception as e:
                    print(f"Error reading {geojson_file}: {e}")
                    routes.append(RouteMetadata(filename=f"{subdir.name}/{geojson_file.name}"))

    return routes


@router.get("/pirl/{project}/routes/{route_name:path}/metadata")
async def get_route_metadata(project: str, route_name: str):
    """
    Get enhanced metadata for a specific route from sidecar file.

    Returns detailed metadata including:
    - Generation method and algorithm used
    - Cost matrix applied
    - SAIPEM constraint compliance audit
    - Detailed cost breakdown (trenching, landcover, crossings)
    - Terrain and landcover statistics

    NOTE: This endpoint must be defined BEFORE the general route endpoint
    to avoid path parameter conflicts with :path converter.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    pirl_outputs_dir = project_path / "PIRL" / "outputs"

    if not pirl_outputs_dir.exists():
        raise HTTPException(status_code=404, detail=f"PIRL outputs directory not found for '{project}'")

    # Construct route file path - handle both with and without .geojson extension
    route_file = pirl_outputs_dir / route_name
    if not route_file.exists() and not route_name.endswith('.geojson'):
        route_file = pirl_outputs_dir / f"{route_name}.geojson"

    if not route_file.exists():
        raise HTTPException(status_code=404, detail=f"Route '{route_name}' not found")

    # Look for sidecar metadata file
    sidecar_path = route_file.with_suffix('.metadata.json')

    if not sidecar_path.exists():
        # Return basic info if no sidecar exists
        return JSONResponse(content={
            "route_file": route_name,
            "has_sidecar": False,
            "message": "No detailed metadata available for this route. Metadata sidecar file not found."
        })

    try:
        with open(sidecar_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)

        metadata['has_sidecar'] = True
        return JSONResponse(content=metadata)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error reading metadata: {str(e)}"
        )


# ============================================================================
# Crossings (Route ∩ Vector datasets) - Detailed intersection logging
# ============================================================================

# Default vector dataset categories to consider for crossing detection.
DEFAULT_CROSSING_CATEGORIES = {
    "roads",
    "railways",
    "waterways",
    "hydrology",
    "powerlines",
    "pipelines",
}


def _build_display_name_from_metadata(metadata: dict, fallback_name: str) -> str:
    """
    Build display name from metadata JSON sidecar.
    Format: {category}_{dataset_name}_{target_crs}_processed
    Where dataset_name has spaces replaced with hyphens.
    target_crs is formatted as EPSGnumber (no colon).
    """
    category = (metadata.get("category") or "").strip()
    dataset_name = (metadata.get("dataset_name") or "").strip()
    target_crs = metadata.get("target_crs") or ""

    if isinstance(dataset_name, str) and dataset_name.endswith(" (Processed)"):
        dataset_name = dataset_name[:-12]
    if isinstance(dataset_name, str):
        dataset_name = dataset_name.replace(" ", "-")

    target_crs = str(target_crs).replace(":", "")

    if category and dataset_name and target_crs:
        return f"{category}_{dataset_name}_{target_crs}_processed"
    return fallback_name


def _list_crossing_vector_layers(project_path: Path, allow_categories: set[str]) -> list[dict]:
    """List processed vector datasets whose metadata.category is in allowlist."""
    vectors_processed_dir = project_path / "data" / "vectors" / "processed"
    if not vectors_processed_dir.exists():
        return []

    layers: list[dict] = []
    for item in vectors_processed_dir.iterdir():
        if not item.is_file() or item.suffix.lower() != ".gpkg":
            continue
        metadata_file = item.with_name(f"{item.name}.json")
        metadata = load_json_file(metadata_file) if metadata_file.exists() else None
        if not isinstance(metadata, dict):
            metadata = {}

        category = str(metadata.get("category") or "").strip().lower()
        if not category or category not in allow_categories:
            continue

        raw_name = item.stem
        fallback_name = re.sub(r"_epsg\\d+_processed$", "", raw_name, flags=re.IGNORECASE)
        fallback_name = re.sub(r"_processed$", "", fallback_name, flags=re.IGNORECASE)
        display_name = _build_display_name_from_metadata(metadata, fallback_name)

        layers.append(
            {
                "category": category,
                "display_name": display_name,
                "file_path": str(item),
                "metadata": metadata,
            }
        )

    layers.sort(key=lambda x: (x.get("category", ""), str(x.get("display_name", "")).lower()))

    # Prefer authoritative Canadian NHN waterways over OSM when both exist.
    # This keeps crossings consistent (and avoids double-counting) for large Canadian projects.
    try:
        waterways = [l for l in layers if l.get("category") == "waterways"]
        if waterways:
            def _stem(p: str) -> str:
                try:
                    return Path(p).stem.lower()
                except Exception:
                    return str(p).lower()

            has_authoritative = any(_stem(l.get("file_path", "")).startswith("waterways_epsg") for l in waterways)
            if has_authoritative:
                layers = [
                    l
                    for l in layers
                    if not (l.get("category") == "waterways" and _stem(l.get("file_path", "")).startswith("osm_waterways"))
                ]
                layers.sort(key=lambda x: (x.get("category", ""), str(x.get("display_name", "")).lower()))
    except Exception:
        pass

    return layers


def _safe_resolve_route_file(project_path: Path, route_name: str) -> Path:
    """Resolve a route file under {project}/PIRL/outputs, preventing path traversal."""
    pirl_outputs_dir = project_path / "PIRL" / "outputs"
    if not pirl_outputs_dir.exists():
        raise HTTPException(status_code=404, detail=f"PIRL outputs directory not found for '{project_path.name}'")

    candidate = pirl_outputs_dir / route_name
    if not candidate.exists() and not str(route_name).endswith(".geojson"):
        candidate = pirl_outputs_dir / f"{route_name}.geojson"

    try:
        outputs_root = pirl_outputs_dir.resolve()
        resolved = candidate.resolve()
        if outputs_root not in resolved.parents and resolved != outputs_root:
            raise HTTPException(status_code=400, detail="Invalid route path.")
    except HTTPException:
        raise
    except Exception:
        # If resolve fails for any reason, fall back to existence checks only.
        pass

    if not candidate.exists():
        raise HTTPException(status_code=404, detail=f"Route '{route_name}' not found")
    if candidate.suffix.lower() != ".geojson":
        raise HTTPException(status_code=400, detail="Route file must be a GeoJSON file")
    return candidate


def _parse_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, (int, float)):
            return int(value)
        s = str(value).strip()
        if not s:
            return None
        # Handle "2;3" or "2,3" etc by taking first token
        token = re.split(r"[^0-9\\-]+", s)[0]
        if token == "":
            return None
        return int(token)
    except Exception:
        return None


def _parse_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        if isinstance(value, bool):
            return float(value)
        if isinstance(value, (int, float)):
            return float(value)
        s = str(value).strip()
        if not s:
            return None
        token = re.split(r"[^0-9\\.\\-]+", s)[0]
        if token == "":
            return None
        return float(token)
    except Exception:
        return None


def _first(props: dict, keys: list[str]) -> Any:
    for k in keys:
        if k in props and props.get(k) is not None:
            return props.get(k)
        # also allow case-insensitive lookup
        for pk in props.keys():
            if isinstance(pk, str) and pk.lower() == k.lower():
                return props.get(pk)
    return None


def _derive_crossing_attributes(category: str, props: dict) -> dict:
    """Best-effort derivations (width, lanes, etc.) from common OSM-style attributes."""
    derived: dict = {}

    # Common name derivation (works for OSM + many authoritative datasets like NHN).
    name = _first(props, ["name", "NAME", "NAME_1", "NAME_2", "ref", "REF"])
    if isinstance(name, str):
        name = name.strip()
        if name:
            derived["name"] = name

    if category == "roads":
        lanes = _parse_int(_first(props, ["lanes", "LANES", "lanes:forward", "lanes:backward"]))
        highway = _first(props, ["highway", "HIGHWAY", "road_type", "type"])
        if lanes is not None and lanes > 0:
            derived["lanes"] = lanes
            derived["width_m"] = float(lanes) * 3.5
        else:
            # Fallback by highway type (approx.)
            if isinstance(highway, str):
                h = highway.lower()
                derived["highway"] = highway
                if "motorway" in h:
                    derived["width_m"] = 14.0
                elif any(t in h for t in ["primary", "tertiary"]):
                    derived["width_m"] = 10.5
                elif any(t in h for t in ["residential", "secondary", "service", "trunk"]):
                    derived["width_m"] = 7.0
                elif "track" in h:
                    derived["width_m"] = 3.5
                else:
                    derived["width_m"] = 7.0
            else:
                derived["width_m"] = 7.0

    elif category in {"waterways", "hydrology"}:
        waterway = _first(props, ["waterway", "WATERWAY", "type", "water_type"])
        width = _parse_float(_first(props, ["width_m", "width", "Width", "width:meters"]))
        if waterway is not None:
            if isinstance(waterway, str):
                derived["waterway"] = waterway
                w = waterway.lower()
                if w in {"dam", "weir"}:
                    derived["uncrossable"] = True
            elif isinstance(waterway, (int, float)):
                # NHN commonly encodes TYPE as an integer code.
                derived["waterway"] = f"TYPE {int(waterway)}"
        if width is not None and width > 0:
            derived["width_m"] = width
        else:
            if isinstance(waterway, str):
                w = waterway.lower()
                if w == "river":
                    derived["width_m"] = 20.0
                elif w == "stream":
                    derived["width_m"] = 5.0
                elif w == "canal":
                    derived["width_m"] = 10.0
                else:
                    derived["width_m"] = 10.0
            else:
                derived["width_m"] = 10.0

    elif category == "railways":
        gauge_mm = _parse_float(_first(props, ["gauge", "gauge_mm", "GAUGE"]))
        rail_type = _first(props, ["railway", "RAILWAY", "type"])
        if rail_type is not None:
            derived["railway"] = rail_type
        if gauge_mm is not None and gauge_mm > 0:
            derived["gauge_mm"] = gauge_mm
            derived["width_m"] = (gauge_mm * 4.0) / 1000.0
        else:
            derived["width_m"] = 5.74

    elif category == "powerlines":
        voltage = _parse_float(_first(props, ["voltage", "VOLTAGE", "kv", "kV"]))
        if voltage is not None:
            derived["voltage"] = voltage

    return derived


def _feature_id_for_crossing(feature: dict, dataset_layer: str, idx: int) -> str:
    fid = feature.get("id")
    if fid is not None:
        return str(fid)
    props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    for k in ["id", "ID", "fid", "FID", "osm_id", "osmId"]:
        if props.get(k) is not None:
            return str(props.get(k))
    return f"{dataset_layer}:{idx}"


def _compute_route_crossings(
    project: str,
    project_path: Path,
    route_geojson: dict,
    allow_categories: set[str],
) -> dict:
    """
    Compute intersections between a route geometry and selected crossing datasets.

    Returns a dict suitable for embedding under `crossings_detailed` in route sidecars.
    """
    try:
        from shapely.geometry import shape as shp_shape
        from shapely.geometry import mapping as shp_mapping
        from shapely.ops import unary_union
        from shapely.ops import transform as shp_transform
        from shapely.prepared import prep as shp_prep
        from shapely.strtree import STRtree
        from numbers import Integral
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Spatial dependencies not available for crossing detection.") from exc

    # Build route line geometry from GeoJSON (FeatureCollection of segments or a single Feature/Geometry)
    line_geoms = []
    try:
        if isinstance(route_geojson, dict) and route_geojson.get("type") == "FeatureCollection":
            for feat in route_geojson.get("features") or []:
                if not isinstance(feat, dict):
                    continue
                geom_raw = feat.get("geometry")
                if not isinstance(geom_raw, dict):
                    continue
                try:
                    geom = shp_shape(geom_raw)
                except Exception:
                    continue
                if geom.is_empty:
                    continue
                if geom.geom_type in {"LineString", "MultiLineString"}:
                    line_geoms.append(geom)
        elif isinstance(route_geojson, dict) and route_geojson.get("type") == "Feature":
            geom_raw = route_geojson.get("geometry")
            if isinstance(geom_raw, dict):
                geom = shp_shape(geom_raw)
                if not geom.is_empty and geom.geom_type in {"LineString", "MultiLineString"}:
                    line_geoms.append(geom)
        elif isinstance(route_geojson, dict) and "coordinates" in route_geojson:
            geom = shp_shape(route_geojson)
            if not geom.is_empty and geom.geom_type in {"LineString", "MultiLineString"}:
                line_geoms.append(geom)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid route GeoJSON geometry.") from exc

    if not line_geoms:
        return {
            "version": 1,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "categories_used": sorted(list(allow_categories)),
            "datasets_used": [],
            "crossings": [],
            "message": "No LineString geometry found in route."
        }

    route_geom = unary_union(line_geoms)
    route_prepared = shp_prep(route_geom)
    minx, miny, maxx, maxy = route_geom.bounds

    # Resolve crossing vector layers by metadata.category
    layers = _list_crossing_vector_layers(project_path, allow_categories)
    datasets_used = [{"category": l["category"], "layer": l["display_name"]} for l in layers]

    crossings: list[dict] = []
    seen: set[str] = set()

    # ---------------------------------------------------------------------
    # Fiona fast-path (no ogr2ogr -> GeoJSON conversion)
    #
    # Motivation:
    # - Large authoritative Canadian datasets (e.g., NHN waterways) can include non-UTF8 attribute
    #   bytes; converting to GeoJSON and then `json.load(..., encoding='utf-8')` can fail.
    # - Converting the full GPKG to GeoJSON is also expensive and unnecessary for crossings.
    #
    # Strategy:
    # - Compute intersections in the project CRS (GPKGs are stored in project CRS).
    # - Reproject marker points + intersection geometry to EPSG:4326 for MapLibre.
    # ---------------------------------------------------------------------
    try:
        import fiona  # type: ignore
        from pyproj import Transformer  # type: ignore
    except Exception:
        fiona = None  # type: ignore
        Transformer = None  # type: ignore

    project_epsg = get_project_crs(project_path)
    if fiona is not None and HAS_PYPROJ and project_epsg and project_epsg != 4326:
        # Determine if the route is already projected (not lon/lat).
        route_is_projected = abs(minx) > 180 or abs(miny) > 90 or abs(maxx) > 180 or abs(maxy) > 90

        to_proj = Transformer.from_crs("EPSG:4326", f"EPSG:{project_epsg}", always_xy=True)
        to_wgs = Transformer.from_crs(f"EPSG:{project_epsg}", "EPSG:4326", always_xy=True)

        def _to_proj_xy(x, y, z=None):
            return to_proj.transform(x, y)

        def _to_wgs_xy(x, y, z=None):
            return to_wgs.transform(x, y)

        route_geom_proj = route_geom if route_is_projected else shp_transform(_to_proj_xy, route_geom)
        route_prepared_proj = shp_prep(route_geom_proj)
        minx_p, miny_p, maxx_p, maxy_p = route_geom_proj.bounds

        def _json_sanitize(v):
            if v is None or isinstance(v, (str, int, float, bool)):
                return v
            if isinstance(v, list):
                return [_json_sanitize(x) for x in v]
            if isinstance(v, dict):
                return {str(k): _json_sanitize(x) for k, x in v.items()}
            try:
                return str(v)
            except Exception:
                return None

        def iter_points_from_geometry(g):
            if g is None:
                return
            try:
                if g.is_empty:
                    return
            except Exception:
                return
            gt = getattr(g, "geom_type", None)
            if gt == "Point":
                yield g
                return
            if gt == "MultiPoint":
                for p in getattr(g, "geoms", []) or []:
                    if getattr(p, "geom_type", None) == "Point" and not p.is_empty:
                        yield p
                return
            if gt in {"LineString", "LinearRing"}:
                try:
                    b = g.boundary
                except Exception:
                    return
                yield from iter_points_from_geometry(b)
                return
            if gt == "MultiLineString":
                for ls in getattr(g, "geoms", []) or []:
                    try:
                        b = ls.boundary
                    except Exception:
                        continue
                    yield from iter_points_from_geometry(b)
                return
            if gt in {"Polygon", "MultiPolygon"}:
                try:
                    b = g.boundary
                except Exception:
                    return
                yield from iter_points_from_geometry(b)
                return
            if gt == "GeometryCollection":
                for part in getattr(g, "geoms", []) or []:
                    yield from iter_points_from_geometry(part)
                return

        def add_record(category: str, dataset_layer: str, feature_id: str, props: dict, derived: dict, inter_geom, marker_x: float, marker_y: float):
            try:
                lon, lat = to_wgs.transform(marker_x, marker_y)
                inter_wgs = shp_transform(_to_wgs_xy, inter_geom)
                inter_geo = shp_mapping(inter_wgs)
            except Exception:
                return
            key = f"{category}|{dataset_layer}|{feature_id}|{round(lon,6)}|{round(lat,6)}|{inter_geo.get('type')}"
            if key in seen:
                return
            seen.add(key)
            crossing_id = hashlib.md5(key.encode("utf-8")).hexdigest()[:16]
            crossings.append(
                {
                    "id": crossing_id,
                    "category": category,
                    "dataset_layer": dataset_layer,
                    "feature_id": feature_id,
                    "point": [float(lon), float(lat)],
                    "intersection": inter_geo,
                    "feature_properties": _json_sanitize(props),
                    "derived": derived,
                }
            )

        for layer in layers:
            category = str(layer.get("category") or "")
            dataset_layer = str(layer.get("display_name") or "")
            file_path = layer.get("file_path")
            if not category or not dataset_layer or not file_path:
                continue

            gpkg_path = Path(str(file_path))
            try:
                layer_names = list(fiona.listlayers(gpkg_path))
            except Exception:
                layer_names = [None]

            for gpkg_layer in (layer_names or [None]):
                try:
                    src = fiona.open(gpkg_path, layer=gpkg_layer) if gpkg_layer else fiona.open(gpkg_path)
                except Exception:
                    continue

                with src:
                    try:
                        itr = src.filter(bbox=(minx_p, miny_p, maxx_p, maxy_p))
                    except Exception:
                        itr = src

                    for idx, feat in enumerate(itr):
                        geom_obj = feat.get("geometry")
                        if not geom_obj:
                            continue
                        try:
                            geom = shp_shape(geom_obj)
                        except Exception:
                            continue
                        if geom.is_empty:
                            continue
                        try:
                            if not route_prepared_proj.intersects(geom):
                                continue
                        except Exception:
                            continue

                        try:
                            inter = route_geom_proj.intersection(geom)
                        except Exception:
                            continue
                        if inter.is_empty:
                            continue

                        props = feat.get("properties") if isinstance(feat.get("properties"), dict) else {}
                        feature_dict = {"id": feat.get("id"), "properties": props}
                        feature_id = _feature_id_for_crossing(feature_dict, dataset_layer, idx)
                        derived = _derive_crossing_attributes(category, props)

                        # Derive exact marker points:
                        marker_points = []
                        try:
                            if inter.geom_type in {"Point", "MultiPoint"}:
                                marker_points = list(iter_points_from_geometry(inter))
                            elif geom.geom_type in {"Polygon", "MultiPolygon"}:
                                try:
                                    boundary_inter = route_geom_proj.intersection(geom.boundary)
                                except Exception:
                                    boundary_inter = None
                                marker_points = list(iter_points_from_geometry(boundary_inter))
                            if not marker_points:
                                marker_points = list(iter_points_from_geometry(inter))
                            if not marker_points:
                                try:
                                    rp = inter.representative_point()
                                    if rp and not rp.is_empty:
                                        marker_points = [rp]
                                except Exception:
                                    marker_points = []
                        except Exception:
                            marker_points = []

                        for p in marker_points:
                            try:
                                add_record(category, dataset_layer, feature_id, props, derived, inter, float(p.x), float(p.y))
                            except Exception:
                                continue

        return {
            "version": 1,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "categories_used": sorted({d["category"] for d in datasets_used}),
            "datasets_used": datasets_used,
            "crossings": crossings,
        }

    # Use the existing vector loader (cached + reprojected to EPSG:4326)
    from .data import _load_vector_geojson  # local import to avoid heavy module import at startup

    for layer in layers:
        category = str(layer.get("category") or "")
        dataset_layer = str(layer.get("display_name") or "")
        if not dataset_layer:
            continue

        try:
            vector_geojson = _load_vector_geojson(project, dataset_layer)
        except Exception:
            # If a dataset fails to load, skip it (do not fail entire route).
            continue

        features = vector_geojson.get("features")
        if not isinstance(features, list) or not features:
            continue

        candidate_geoms = []
        candidate_feats = []
        for idx, feat in enumerate(features):
            if not isinstance(feat, dict):
                continue
            geom_raw = feat.get("geometry")
            if not isinstance(geom_raw, dict):
                continue
            try:
                geom = shp_shape(geom_raw)
            except Exception:
                continue
            if geom.is_empty:
                continue
            # quick bbox reject against route bounds
            gx1, gy1, gx2, gy2 = geom.bounds
            if gx2 < minx or gx1 > maxx or gy2 < miny or gy1 > maxy:
                continue
            candidate_feats.append(feat)
            candidate_geoms.append(geom)

        if not candidate_geoms:
            continue

        # Build spatial index for candidates
        tree = STRtree(candidate_geoms)
        hits = tree.query(route_geom)

        # hits can be indices (shapely>=2) or geometries (shapely<2)
        hit_indices: list[int] = []
        if hits is None:
            hit_indices = []
        else:
            try:
                first = hits[0] if len(hits) > 0 else None
                if isinstance(first, Integral):
                    hit_indices = [int(i) for i in hits]
                else:
                    idx_by_id = {id(g): i for i, g in enumerate(candidate_geoms)}
                    hit_indices = [idx_by_id.get(id(g)) for g in hits if id(g) in idx_by_id]
                    hit_indices = [i for i in hit_indices if isinstance(i, int)]
            except Exception:
                hit_indices = []

        for geom_idx in hit_indices:
            feat = candidate_feats[geom_idx]
            geom = candidate_geoms[geom_idx]

            try:
                if not route_prepared.intersects(geom):
                    continue
            except Exception:
                continue

            try:
                inter = route_geom.intersection(geom)
            except Exception:
                continue

            if inter.is_empty:
                continue

            props = feat.get("properties") if isinstance(feat.get("properties"), dict) else {}
            feature_id = _feature_id_for_crossing(feat, dataset_layer, geom_idx)
            derived = _derive_crossing_attributes(category, props)

            def add_record(inter_geom, marker_lon: float, marker_lat: float):
                inter_geo = shp_mapping(inter_geom)
                key = f"{category}|{dataset_layer}|{feature_id}|{round(marker_lon,6)}|{round(marker_lat,6)}|{inter_geo.get('type')}"
                if key in seen:
                    return
                seen.add(key)
                crossing_id = hashlib.md5(key.encode("utf-8")).hexdigest()[:16]
                crossings.append(
                    {
                        "id": crossing_id,
                        "category": category,
                        "dataset_layer": dataset_layer,
                        "feature_id": feature_id,
                        "point": [marker_lon, marker_lat],
                        "intersection": inter_geo,
                        "feature_properties": props,
                        "derived": derived,
                    }
                )

            def iter_points_from_geometry(g):
                """
                Yield Point geometries representing exact intersection points.

                - For LineString/MultiLineString intersections (overlaps), yield boundary endpoints.
                - For GeometryCollection, recurse into parts.
                - For Polygon/MultiPolygon (should be rare when intersecting with a route line), yield boundary points.
                """
                if g is None:
                    return
                try:
                    if g.is_empty:
                        return
                except Exception:
                    return

                gt = getattr(g, "geom_type", None)
                if gt == "Point":
                    yield g
                    return
                if gt == "MultiPoint":
                    for p in getattr(g, "geoms", []) or []:
                        if getattr(p, "geom_type", None) == "Point" and not p.is_empty:
                            yield p
                    return
                if gt in {"LineString", "LinearRing"}:
                    # Boundary gives endpoints (exact overlap limits). For closed rings, boundary is empty.
                    try:
                        b = g.boundary
                    except Exception:
                        return
                    yield from iter_points_from_geometry(b)
                    return
                if gt == "MultiLineString":
                    for ls in getattr(g, "geoms", []) or []:
                        try:
                            b = ls.boundary
                        except Exception:
                            continue
                        yield from iter_points_from_geometry(b)
                    return
                if gt in {"Polygon", "MultiPolygon"}:
                    try:
                        b = g.boundary
                    except Exception:
                        return
                    yield from iter_points_from_geometry(b)
                    return
                if gt == "GeometryCollection":
                    for part in getattr(g, "geoms", []) or []:
                        yield from iter_points_from_geometry(part)
                    return

            # Marker points MUST be exact intersections between the route and the feature geometry.
            # For polygons, use route ∩ polygon-boundary to get entry/exit points.
            marker_points = []
            try:
                if inter.geom_type in {"Point", "MultiPoint"}:
                    marker_points = list(iter_points_from_geometry(inter))
                    # Store each point's own geometry in `intersection` for these simple cases.
                    for p in marker_points:
                        add_record(p, float(p.x), float(p.y))
                    continue

                if geom.geom_type in {"Polygon", "MultiPolygon"}:
                    try:
                        boundary_inter = route_geom.intersection(geom.boundary)
                    except Exception:
                        boundary_inter = None
                    marker_points = list(iter_points_from_geometry(boundary_inter))

                # Fallback for lines/collections/unknowns: pull exact endpoints/points from `inter` itself.
                if not marker_points:
                    marker_points = list(iter_points_from_geometry(inter))

                # If we still couldn't derive explicit points (e.g., closed overlap ring), fall back to any point on the
                # intersection geometry (still an exact intersection, just not necessarily an entry/exit).
                if not marker_points:
                    try:
                        rp = inter.representative_point()
                        if rp and not rp.is_empty:
                            marker_points = [rp]
                    except Exception:
                        marker_points = []

                for p in marker_points:
                    # Store full intersection geometry for non-point intersections, but locate marker at exact point.
                    add_record(inter, float(p.x), float(p.y))
            except Exception:
                continue

    return {
        "version": 1,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "categories_used": sorted({d["category"] for d in datasets_used}),
        "datasets_used": datasets_used,
        "crossings": crossings,
    }


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    tmp.replace(path)


@router.get("/pirl/{project}/routes/{route_name:path}/crossings")
async def get_route_crossings(
    project: str,
    route_name: str,
    compute_if_missing: bool = True,
    force: bool = False,
    actor: Optional[Dict[str, Any]] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get (and optionally compute) detailed crossings for a route.

    Crossings are persisted into the route sidecar (*.metadata.json) under `crossings_detailed`.
    """
    project_path = resolve_project_path(project) or (PROJECTS_ROOT / project)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    route_file = _safe_resolve_route_file(project_path, route_name)
    sidecar_path = route_file.with_suffix(".metadata.json")

    sidecar = load_json_file(sidecar_path) if sidecar_path.exists() else None
    if isinstance(sidecar, dict) and not force:
        existing = sidecar.get("crossings_detailed")
        if isinstance(existing, dict) and isinstance(existing.get("crossings"), list):
            return JSONResponse(
                content={
                    "project": project,
                    "route": route_name,
                    "computed": False,
                    "crossings_detailed": existing,
                }
            )

    if not compute_if_missing and not force:
        return JSONResponse(
            content={
                "project": project,
                "route": route_name,
                "computed": False,
                "crossings_detailed": None,
                "message": "Crossings not computed yet."
            }
        )

    # Computing crossings writes to disk (route sidecar) — require an authenticated actor for auditability.
    if not actor:
        raise HTTPException(status_code=401, detail="Authentication required to compute route crossings.")

    # Load route GeoJSON (and transform to WGS84 if needed)
    try:
        with open(route_file, "r", encoding="utf-8") as f:
            route_geojson = json.load(f)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read route file: {exc}") from exc

    # Transform route coordinates if needed
    needs_transform = False
    first_coords = None
    if isinstance(route_geojson, dict):
        if "features" in route_geojson and route_geojson.get("features"):
            first_geom = (route_geojson.get("features") or [{}])[0].get("geometry", {}) if isinstance((route_geojson.get("features") or [{}])[0], dict) else {}
            first_coords = first_geom.get("coordinates", []) if isinstance(first_geom, dict) else None
        elif "geometry" in route_geojson and isinstance(route_geojson.get("geometry"), dict):
            first_coords = route_geojson["geometry"].get("coordinates", [])
        elif "coordinates" in route_geojson:
            first_coords = route_geojson.get("coordinates")
    if first_coords and isinstance(first_coords, list) and coords_need_transformation(first_coords):
        needs_transform = True

    if needs_transform and HAS_PYPROJ:
        project_epsg = get_project_crs(project_path)
        if project_epsg and project_epsg != 4326:
            route_geojson = transform_geojson(route_geojson, project_epsg, 4326)

    allow = set(DEFAULT_CROSSING_CATEGORIES)
    crossings_block = _compute_route_crossings(project, project_path, route_geojson, allow)

    if not isinstance(sidecar, dict):
        sidecar = {}
    sidecar["crossings_detailed"] = crossings_block
    _write_json(sidecar_path, sidecar)

    write_audit_event(
        db,
        project_name=project,
        actor=actor,
        event_type="pirl.crossings.compute",
        payload={
            "route": route_name,
            "force": bool(force),
            "categories_used": crossings_block.get("categories_used") if isinstance(crossings_block, dict) else None,
        },
        required=True,
    )

    return JSONResponse(
        content={
            "project": project,
            "route": route_name,
            "computed": True,
            "crossings_detailed": crossings_block,
        }
    )


@router.post("/pirl/{project}/routes/{route_name:path}/crossings/compute")
async def compute_route_crossings(
    project: str,
    route_name: str,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Force recomputation of detailed crossings and persist to sidecar."""
    return await get_route_crossings(project, route_name, compute_if_missing=True, force=True, actor=actor, db=db)


@router.get("/pirl/{project}/routes/{route_name:path}")
async def get_route(project: str, route_name: str):
    """
    Get a specific PIRL route GeoJSON file

    Returns the GeoJSON directly for display on the map.
    Coordinates are automatically transformed to WGS84 (EPSG:4326) if needed.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    pirl_outputs_dir = project_path / "PIRL" / "outputs"

    if not pirl_outputs_dir.exists():
        raise HTTPException(status_code=404, detail=f"PIRL outputs directory not found for '{project}'")

    # Construct route file path
    route_file = pirl_outputs_dir / route_name

    if not route_file.exists():
        raise HTTPException(status_code=404, detail=f"Route '{route_name}' not found")

    if not route_file.suffix == '.geojson':
        raise HTTPException(status_code=400, detail="Route file must be a GeoJSON file")

    # Load GeoJSON
    try:
        with open(route_file) as f:
            geojson = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read route file: {str(e)}")

    # Check if coordinates need transformation (UTM to WGS84)
    needs_transform = False
    first_coords = None

    if "features" in geojson and geojson["features"]:
        first_geom = geojson["features"][0].get("geometry", {})
        first_coords = first_geom.get("coordinates", [])
    elif "geometry" in geojson:
        first_coords = geojson["geometry"].get("coordinates", [])
    elif "coordinates" in geojson:
        first_coords = geojson["coordinates"]

    if first_coords and coords_need_transformation(first_coords):
        needs_transform = True

    # Transform coordinates if needed
    if needs_transform and HAS_PYPROJ:
        project_epsg = get_project_crs(project_path)
        if project_epsg and project_epsg != 4326:
            geojson = transform_geojson(geojson, project_epsg, 4326)

    return JSONResponse(content=geojson, media_type="application/geo+json")


# ============================================================================
# PIRL Request Saving Endpoint
# ============================================================================

def write_cost_matrix_csv(cost_matrix: CostMatrixData, csv_path: Path) -> None:
    """
    Write cost matrix data to a CSV file.

    Creates a well-formatted CSV with all cost matrix tables from the PIRL configuration.
    """
    with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)

        # Write header section
        writer.writerow(['PIRL Cost Matrix Configuration'])
        writer.writerow(['Generated', datetime.now().isoformat()])
        writer.writerow([])

        # Material Costs
        if cost_matrix.materialCosts:
            writer.writerow(['=== MATERIAL COSTS (PIPE) ==='])
            writer.writerow(['Diameter', 'Wall Thickness', 'Grade', 'Cost per Meter', 'Weight (kg/m)'])
            for row in cost_matrix.materialCosts:
                writer.writerow([row.diameter, row.wallThickness, row.grade, row.costPerMeter, row.weight])
            writer.writerow([])

        # Labor Rates
        if cost_matrix.laborRates:
            writer.writerow(['=== LABOR RATES (HOURLY) ==='])
            writer.writerow(['Region', 'Welder', 'Equipment Operator', 'Laborer', 'Engineer'])
            for row in cost_matrix.laborRates:
                writer.writerow([row.region, row.welder, row.equipmentOperator, row.laborer, row.engineer])
            writer.writerow([])

        # Equipment Rental
        if cost_matrix.equipmentRental:
            writer.writerow(['=== EQUIPMENT RENTAL ==='])
            writer.writerow(['Equipment', 'Capacity', 'Daily Rate', 'Monthly Rate'])
            for row in cost_matrix.equipmentRental:
                writer.writerow([row.equipment, row.capacity, row.dailyRate, row.monthlyRate])
            writer.writerow([])

        # Terrain Multipliers
        if cost_matrix.terrainMultipliers:
            writer.writerow(['=== TERRAIN MULTIPLIERS ==='])
            writer.writerow(['Terrain Type', 'Cost Multiplier', 'Cost per km', 'Rationale'])
            for row in cost_matrix.terrainMultipliers:
                writer.writerow([row.terrainType, row.multiplier, row.costPerKm, row.rationale])
            writer.writerow([])

        # ROW Acquisition
        if cost_matrix.rowAcquisition:
            writer.writerow(['=== ROW ACQUISITION ==='])
            writer.writerow(['Land Use', 'Permanent Easement ($/acre)', 'Temporary Easement', 'Total per km'])
            for row in cost_matrix.rowAcquisition:
                writer.writerow([row.landUse, row.permanentEasement, row.temporaryEasement, row.totalPerKm])
            writer.writerow([])

        # Water Crossings
        if cost_matrix.waterCrossings:
            writer.writerow(['=== WATER CROSSINGS ==='])
            writer.writerow(['Type', 'Width', 'Open Cut ($/m)', 'HDD Cost ($/m)', 'HDD Multiplier'])
            for row in cost_matrix.waterCrossings:
                writer.writerow([row.type, row.width, row.openCut, row.hddCost, row.hddMultiplier])
            writer.writerow([])

        # Infrastructure Crossings
        if cost_matrix.infrastructureCrossings:
            writer.writerow(['=== INFRASTRUCTURE CROSSINGS ==='])
            writer.writerow(['Infrastructure', 'Cost per Crossing', 'Method', 'Notes'])
            for row in cost_matrix.infrastructureCrossings:
                writer.writerow([row.infrastructure, row.costPerCrossing, row.method, row.notes])
            writer.writerow([])

        # Regional Factors
        if cost_matrix.regionalFactors:
            writer.writerow(['=== REGIONAL COST MULTIPLIERS ==='])
            writer.writerow(['Region', 'Cost per km', 'Labor Index', 'Material Index', 'Notes'])
            for row in cost_matrix.regionalFactors:
                writer.writerow([row.region, row.costPerKm, row.laborIndex, row.materialIndex, row.notes])
            writer.writerow([])

        # Permitting
        if cost_matrix.permitting:
            writer.writerow(['=== PERMITTING & ENVIRONMENTAL ==='])
            writer.writerow(['Item', 'Cost Range', 'Timeline/Notes'])
            for row in cost_matrix.permitting:
                writer.writerow([row.item, row.costRange, row.timeline])
            writer.writerow([])

        # Indirect Costs
        if cost_matrix.indirectCosts:
            writer.writerow(['=== INDIRECT COSTS & FACILITIES ==='])
            writer.writerow(['Item', 'Cost', 'Description'])
            for row in cost_matrix.indirectCosts:
                writer.writerow([row.item, row.cost, row.description])


@router.post("/pirl/{project}/requests")
async def save_pirl_request(
    project: str,
    request_data: PirlRequestData,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Save a PIRL configuration request and create a job entry.

    Creates:
    - JSON file with complete configuration in PIRL/jobs/<job_id>/
    - CSV file with cost matrix data in the same directory
    - Job status file for tracking progress

    The job directory structure:
    <project>/PIRL/jobs/<timestamp>/
        ├── request.json          # Full configuration
        ├── cost_matrix.csv       # Cost matrix data
        └── status.json           # Job status and timer info

    Returns the job details including timer information.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    # Generate timestamp-based job ID
    job_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    created_at = datetime.now()

    # Create the job directory structure - clear path under project root
    # <project>/PIRL/jobs/<job_id>/
    jobs_dir = project_path / "PIRL" / "jobs" / job_id
    jobs_dir.mkdir(parents=True, exist_ok=True)

    # Define file paths within the job directory
    json_path = jobs_dir / "request.json"
    csv_path = jobs_dir / "cost_matrix.csv"
    status_path = jobs_dir / "status.json"

    try:
        # Calculate estimated completion time (24 hours from submission)
        estimated_completion = created_at + timedelta(hours=24)

        # Prepare the JSON data with metadata
        json_data = {
            "metadata": {
                "job_id": job_id,
                "created_at": created_at.isoformat(),
                "project": project,
                "version": "1.0",
                "cost_matrix_file": "cost_matrix.csv"
            },
            "objectives": request_data.objectives.model_dump(),
            "hydraulics": request_data.hydraulics.model_dump(),
            "costMatrix": request_data.costMatrix.model_dump(),
            "constraints": request_data.constraints.model_dump()
        }

        # Write JSON file
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, indent=2)

        # Write CSV file with cost matrix
        write_cost_matrix_csv(request_data.costMatrix, csv_path)

        # Create job status file with timer information
        status_data = {
            "job_id": job_id,
            "status": "processing",  # processing, completed, failed
            "created_at": created_at.isoformat(),
            "estimated_completion": estimated_completion.isoformat(),
            "duration_hours": 24,
            "progress_percent": 0,
            "current_phase": "Initializing PIRL agent",
            "phases": [
                {"name": "Initializing", "status": "in_progress"},
                {"name": "Data preprocessing", "status": "pending"},
                {"name": "Route optimization", "status": "pending"},
                {"name": "Cost analysis", "status": "pending"},
                {"name": "Results generation", "status": "pending"}
            ]
        }

        with open(status_path, 'w', encoding='utf-8') as f:
            json.dump(status_data, f, indent=2)

        print(f"[PIRL] Created job {job_id} at {jobs_dir}")
        print(f"[PIRL] Saved request configuration to {json_path}")
        print(f"[PIRL] Saved cost matrix CSV to {csv_path}")
        print(f"[PIRL] Job status file at {status_path}")

        write_audit_event(
            db,
            project_name=project,
            actor=actor,
            event_type="pirl.job.create",
            payload={
                "job_id": job_id,
                "active_profile": getattr(getattr(request_data, "objectives", None), "activeProfile", None),
                "directory": str(jobs_dir),
            },
            required=True,
        )

        return JSONResponse(
            status_code=201,
            content={
                "success": True,
                "message": "PIRL job created successfully",
                "job": {
                    "job_id": job_id,
                    "status": "processing",
                    "created_at": created_at.isoformat(),
                    "estimated_completion": estimated_completion.isoformat(),
                    "duration_hours": 24,
                    "directory": str(jobs_dir)
                },
                "files": {
                    "request": str(json_path),
                    "cost_matrix": str(csv_path),
                    "status": str(status_path)
                }
            }
        )

    except Exception as e:
        print(f"[PIRL] Error creating job: {e}")
        # Clean up on failure
        if jobs_dir.exists():
            import shutil
            shutil.rmtree(jobs_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create PIRL job: {str(e)}"
        )


@router.get("/pirl/{project}/jobs")
async def list_pirl_jobs(project: str):
    """
    List all PIRL jobs for a project with their current status and timer info.

    Jobs are stored in <project>/PIRL/jobs/<job_id>/
    Each job has:
    - request.json: Full configuration
    - cost_matrix.csv: Cost matrix data
    - status.json: Job status and timer info

    Returns list of jobs with status and remaining time.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    jobs_dir = project_path / "PIRL" / "jobs"

    if not jobs_dir.exists():
        return []

    jobs = []
    now = datetime.now()

    for job_path in jobs_dir.iterdir():
        if not job_path.is_dir():
            continue

        job_id = job_path.name
        status_file = job_path / "status.json"
        request_file = job_path / "request.json"

        try:
            # Read status file
            if status_file.exists():
                with open(status_file, 'r', encoding='utf-8') as f:
                    status_data = json.load(f)
            else:
                status_data = {"status": "unknown"}

            # Read request metadata
            request_metadata = {}
            if request_file.exists():
                with open(request_file, 'r', encoding='utf-8') as f:
                    request_data = json.load(f)
                    request_metadata = request_data.get("metadata", {})
                    objectives = request_data.get("objectives", {})

            # Calculate remaining time
            estimated_completion_str = status_data.get("estimated_completion")
            remaining_seconds = 0
            if estimated_completion_str:
                estimated_completion = datetime.fromisoformat(estimated_completion_str)
                remaining_delta = estimated_completion - now
                remaining_seconds = max(0, int(remaining_delta.total_seconds()))

            jobs.append({
                "job_id": job_id,
                "status": status_data.get("status", "unknown"),
                "created_at": status_data.get("created_at") or request_metadata.get("created_at"),
                "estimated_completion": estimated_completion_str,
                "remaining_seconds": remaining_seconds,
                "progress_percent": status_data.get("progress_percent", 0),
                "current_phase": status_data.get("current_phase", "Unknown"),
                "phases": status_data.get("phases", []),
                "active_profile": objectives.get("activeProfile", "Unknown"),
                "directory": str(job_path)
            })

        except Exception as e:
            print(f"[PIRL] Error reading job {job_id}: {e}")
            jobs.append({
                "job_id": job_id,
                "status": "error",
                "error": str(e),
                "directory": str(job_path)
            })

    # Sort by job_id (timestamp) descending - newest first
    jobs.sort(key=lambda x: x.get("job_id", ""), reverse=True)

    return jobs


@router.get("/pirl/{project}/jobs/{job_id}")
async def get_pirl_job(project: str, job_id: str):
    """
    Get details of a specific PIRL job.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    job_dir = project_path / "PIRL" / "jobs" / job_id

    if not job_dir.exists():
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

    status_file = job_dir / "status.json"
    request_file = job_dir / "request.json"

    result = {
        "job_id": job_id,
        "directory": str(job_dir)
    }

    # Read status
    if status_file.exists():
        with open(status_file, 'r', encoding='utf-8') as f:
            result["status_data"] = json.load(f)

        # Calculate remaining time
        now = datetime.now()
        estimated_completion_str = result["status_data"].get("estimated_completion")
        if estimated_completion_str:
            estimated_completion = datetime.fromisoformat(estimated_completion_str)
            remaining_delta = estimated_completion - now
            result["remaining_seconds"] = max(0, int(remaining_delta.total_seconds()))

    # Read full request
    if request_file.exists():
        with open(request_file, 'r', encoding='utf-8') as f:
            result["request_data"] = json.load(f)

    return result


@router.get("/pirl/{project}/requests")
async def list_pirl_requests(project: str):
    """
    List all PIRL jobs for a project (alias for /jobs endpoint for backwards compatibility).
    """
    return await list_pirl_jobs(project)







