"""
PIRL Route API Endpoints

Provides endpoints to discover and serve PIRL route GeoJSON files,
and to save PIRL configuration requests.
"""

import os
import csv
import json
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

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
            with open(geojson_file, 'r', encoding='utf-8') as f:
                geojson_data = json.load(f)

            metadata = extract_route_metadata(geojson_data)
            metadata['filename'] = geojson_file.name

            # Check for enhanced metadata sidecar
            sidecar_data = load_sidecar_metadata(geojson_file)
            if sidecar_data:
                metadata['has_metadata_sidecar'] = True

                # Extract key info from sidecar
                gen_method = sidecar_data.get('generation_method', {})
                metadata['generation_method'] = gen_method.get('method', 'Unknown')
                metadata['is_real_route'] = gen_method.get('is_real_route', False)

                compliance = sidecar_data.get('constraint_compliance', {})
                metadata['constraint_compliant'] = compliance.get('overall_compliant')

                cost_breakdown = sidecar_data.get('cost_breakdown', {})
                metadata['total_cost_usd'] = cost_breakdown.get('total')
                metadata['cost_per_km'] = cost_breakdown.get('cost_per_km')

                route_info = sidecar_data.get('route_info', {})
                metadata['total_length_m'] = route_info.get('length_m')

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


@router.get("/pirl/{project}/routes/{route_name}/metadata")
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
async def save_pirl_request(project: str, request_data: PirlRequestData):
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







