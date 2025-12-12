"""
PIRL Route API Endpoints

Provides endpoints to discover and serve PIRL route GeoJSON files,
and to save PIRL configuration requests.
"""

import os
import csv
import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter()

# Base projects directory
PROJECTS_ROOT = Path("/opt/agrs/Projects")


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

    # Return GeoJSON file
    return FileResponse(
        route_file,
        media_type="application/geo+json",
        filename=route_file.name
    )


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
    Save a PIRL configuration request.

    Creates:
    - JSON file with complete configuration in docs/PIRL/requests/
    - CSV file with cost matrix data in the same directory

    Returns the paths to the created files.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    # Create the requests directory structure
    requests_dir = project_path / "docs" / "PIRL" / "requests"
    requests_dir.mkdir(parents=True, exist_ok=True)

    # Generate timestamp for unique filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Define file paths
    json_filename = f"pirl_request_{timestamp}.json"
    csv_filename = f"cost_matrix_{timestamp}.csv"
    json_path = requests_dir / json_filename
    csv_path = requests_dir / csv_filename

    try:
        # Prepare the JSON data with metadata
        json_data = {
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "project": project,
                "version": "1.0",
                "cost_matrix_file": csv_filename
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

        print(f"[PIRL] Saved request configuration to {json_path}")
        print(f"[PIRL] Saved cost matrix CSV to {csv_path}")

        return JSONResponse(
            status_code=201,
            content={
                "success": True,
                "message": "PIRL request saved successfully",
                "files": {
                    "json": str(json_path),
                    "csv": str(csv_path)
                },
                "request_id": timestamp
            }
        )

    except Exception as e:
        print(f"[PIRL] Error saving request: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save PIRL request: {str(e)}"
        )


@router.get("/pirl/{project}/requests")
async def list_pirl_requests(project: str):
    """
    List all saved PIRL requests for a project.

    Returns metadata about each saved request.
    """
    project_path = PROJECTS_ROOT / project

    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    requests_dir = project_path / "docs" / "PIRL" / "requests"

    if not requests_dir.exists():
        return []

    requests = []

    for json_file in requests_dir.glob("pirl_request_*.json"):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            requests.append({
                "filename": json_file.name,
                "created_at": data.get("metadata", {}).get("created_at"),
                "cost_matrix_file": data.get("metadata", {}).get("cost_matrix_file"),
                "primary_objective": data.get("objectives", {}).get("primary_objective")
            })
        except Exception as e:
            print(f"Error reading {json_file}: {e}")
            requests.append({"filename": json_file.name, "error": str(e)})

    # Sort by filename (timestamp) descending
    requests.sort(key=lambda x: x.get("filename", ""), reverse=True)

    return requests







