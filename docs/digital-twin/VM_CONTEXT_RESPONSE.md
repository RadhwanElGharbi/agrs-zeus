# AGRS ZEUS - Digital Twin VM Context Response

**From:** VM Agent at `192.168.0.126`  
**To:** Windows UE5 Development Environment  
**Date:** November 28, 2025  
**Purpose:** Complete backend context for autonomous UE5 Digital Twin development

---

## Table of Contents

1. [Digital Twin API Implementation](#1-digital-twin-api-implementation)
2. [Response Models & Data Structures](#2-response-models--data-structures)
3. [Project Data Layer](#3-project-data-layer)
4. [Terrain Processing](#4-terrain-processing)
5. [Pipeline Route Processing](#5-pipeline-route-processing)
6. [Sensor Data System](#6-sensor-data-system)
7. [Backend Architecture](#7-backend-architecture)
8. [Test Project Data](#8-test-project-data)
9. [Coordinate System Handling](#9-coordinate-system-handling)
10. [API Response Examples](#10-api-response-examples)

---

## 1. Digital Twin API Implementation

### File Location

```
/opt/agrs/gui-v2/backend/api/digital_twin.py
```

### Complete Implementation

```python
"""
AGRS ZEUS Digital Twin API Endpoints

Provides data to the Unreal Engine 5 Digital Twin application:
- Terrain/DEM data for landscape generation
- Pipeline route geometry for 3D visualization
- Landcover classification for procedural object placement
- Real-time sensor data streaming via WebSocket
"""

import asyncio
import json
import base64
import struct
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
import random

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(prefix="/api/digital-twin", tags=["digital-twin"])

# ============================================================================
# Configuration
# ============================================================================

PROJECTS_ROOT = Path("/opt/agrs/Projects")


def resolve_project_path(project_name: str) -> Optional[Path]:
    """Resolve project path, handling nested structures."""
    direct = PROJECTS_ROOT / project_name
    if direct.exists():
        # Check for nested structure (e.g., US_PIPELINE/US_PIPELINE)
        nested = direct / project_name
        if nested.exists():
            return nested
        return direct
    return None


# ============================================================================
# Response Models
# ============================================================================

class TerrainResponse(BaseModel):
    """Terrain/DEM data for UE5 landscape generation."""
    project: str
    width: int
    height: int
    min_elevation: float
    max_elevation: float
    origin_lat: float
    origin_lon: float
    meters_per_pixel: float
    crs: str
    heightmap_base64: str  # Base64-encoded float32 array
    

class PipelineSegment(BaseModel):
    """Individual pipeline segment with geometry and properties."""
    id: str
    coordinates: List[List[float]]  # [[x, y, z], ...]
    length_m: float
    diameter_mm: float
    wall_thickness_mm: float
    material: str
    coating: Optional[str] = None
    start_elevation: float
    end_elevation: float
    slope_percent: float
    terrain_type: Optional[str] = None
    crossing_type: Optional[str] = None  # road, railway, waterway, etc.


class PipelineResponse(BaseModel):
    """Full pipeline route for UE5 visualization."""
    project: str
    total_length_km: float
    segment_count: int
    diameter_mm: float
    material: str
    segments: List[PipelineSegment]
    

class LandcoverClass(BaseModel):
    """Landcover classification mapping."""
    class_id: int
    name: str
    color_hex: str
    ue5_asset_hint: str  # Suggested UE5 asset type


class LandcoverResponse(BaseModel):
    """Landcover data for procedural content generation."""
    project: str
    width: int
    height: int
    origin_lat: float
    origin_lon: float
    meters_per_pixel: float
    classes: List[LandcoverClass]
    classification_base64: str  # Base64-encoded uint8 array


class SensorReading(BaseModel):
    """Real-time sensor reading for a pipeline segment."""
    segment_id: str
    timestamp: str
    pressure_bar: float
    flow_rate_m3h: float
    temperature_c: float
    vibration_hz: Optional[float] = None
    status: str  # normal, warning, critical
    anomaly_type: Optional[str] = None


class SensorDataResponse(BaseModel):
    """Batch of sensor readings."""
    project: str
    timestamp: str
    readings: List[SensorReading]


# ============================================================================
# Helper Functions
# ============================================================================

def _load_project_metadata(project_path: Path) -> Dict[str, Any]:
    """Load project metadata JSON."""
    metadata_file = project_path / "project_metadata.json"
    if metadata_file.exists():
        with open(metadata_file) as f:
            return json.load(f)
    return {}


def _load_pipeline_specs(project_path: Path) -> Dict[str, Any]:
    """Load pipeline specifications."""
    specs_file = project_path / "pipeline_specs.json"
    if specs_file.exists():
        with open(specs_file) as f:
            return json.load(f)
    return {}


def _find_dem_file(project_path: Path) -> Optional[Path]:
    """Find the processed DEM file."""
    processed_dir = project_path / "data" / "rasters" / "processed"
    if processed_dir.exists():
        dem_files = list(processed_dir.glob("dem_*_processed.tif"))
        if dem_files:
            return dem_files[0]
    return None


def _find_landcover_file(project_path: Path) -> Optional[Path]:
    """Find the processed landcover file."""
    processed_dir = project_path / "data" / "rasters" / "processed"
    if processed_dir.exists():
        lc_files = list(processed_dir.glob("landcover_*_processed.tif"))
        if lc_files:
            return lc_files[0]
    return None


def _find_pirl_route(project_path: Path) -> Optional[Path]:
    """Find the latest PIRL route GeoJSON."""
    outputs_dir = project_path / "PIRL" / "outputs"
    if outputs_dir.exists():
        routes = list(outputs_dir.glob("route_*.geojson"))
        if routes:
            # Return the most recently modified
            return max(routes, key=lambda p: p.stat().st_mtime)
    return None


def _extract_heightmap_metadata(dem_path: Path) -> Dict[str, Any]:
    """Extract metadata from DEM using GDAL."""
    try:
        from osgeo import gdal
        ds = gdal.Open(str(dem_path))
        if ds is None:
            return {}
        
        band = ds.GetRasterBand(1)
        stats = band.GetStatistics(True, True)
        gt = ds.GetGeoTransform()
        
        # Get CRS
        from osgeo import osr
        srs = osr.SpatialReference()
        srs.ImportFromWkt(ds.GetProjection())
        epsg = srs.GetAuthorityCode(None) or "unknown"
        
        return {
            "width": ds.RasterXSize,
            "height": ds.RasterYSize,
            "min_elevation": stats[0],
            "max_elevation": stats[1],
            "origin_x": gt[0],
            "origin_y": gt[3],
            "pixel_width": gt[1],
            "pixel_height": abs(gt[5]),
            "crs": f"EPSG:{epsg}"
        }
    except Exception as e:
        print(f"Error reading DEM metadata: {e}")
        return {}


def _read_heightmap_as_base64(dem_path: Path, max_size: int = 1024) -> str:
    """Read DEM and return as base64-encoded float32 array."""
    try:
        from osgeo import gdal
        import numpy as np
        
        ds = gdal.Open(str(dem_path))
        if ds is None:
            return ""
        
        band = ds.GetRasterBand(1)
        data = band.ReadAsArray()
        
        # Resample if too large
        if data.shape[0] > max_size or data.shape[1] > max_size:
            from scipy import ndimage
            scale_y = max_size / data.shape[0]
            scale_x = max_size / data.shape[1]
            scale = min(scale_y, scale_x)
            data = ndimage.zoom(data, scale, order=1)
        
        # Convert to float32 and encode
        data = data.astype(np.float32)
        return base64.b64encode(data.tobytes()).decode('ascii')
    except Exception as e:
        print(f"Error reading heightmap: {e}")
        return ""
```

### API Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/digital-twin/health` | GET | Health check |
| `/api/digital-twin/{project}/info` | GET | Project metadata and available data |
| `/api/digital-twin/{project}/terrain` | GET | DEM heightmap + metadata |
| `/api/digital-twin/{project}/pipeline` | GET | Pipeline route geometry |
| `/api/digital-twin/{project}/landcover` | GET | Landcover classification |
| `/api/digital-twin/{project}/sensors` | GET | Current sensor readings |
| `/api/digital-twin/{project}/sensors/stream` | WebSocket | Real-time sensor stream (1Hz) |

---

## 2. Response Models & Data Structures

### TerrainResponse

```python
class TerrainResponse(BaseModel):
    project: str                  # Project name
    width: int                    # Raster width in pixels
    height: int                   # Raster height in pixels
    min_elevation: float          # Minimum elevation in meters
    max_elevation: float          # Maximum elevation in meters
    origin_lat: float             # Center latitude (WGS84)
    origin_lon: float             # Center longitude (WGS84)
    meters_per_pixel: float       # Ground resolution
    crs: str                      # Coordinate reference system (e.g., "EPSG:32633")
    heightmap_base64: str         # Base64-encoded float32 array (row-major)
```

**Heightmap Data Format:**
- Encoding: Base64
- Data type: float32 (4 bytes per pixel)
- Layout: Row-major (top-to-bottom, left-to-right)
- Values: Elevation in meters above sea level
- NoData: Typically -9999.0 or NaN

**Decoding in C++:**
```cpp
// Decode base64 to bytes
TArray<uint8> DecodedBytes;
FBase64::Decode(HeightmapBase64, DecodedBytes);

// Interpret as float32 array
int32 NumFloats = DecodedBytes.Num() / sizeof(float);
TArray<float> HeightmapData;
HeightmapData.SetNum(NumFloats);
FMemory::Memcpy(HeightmapData.GetData(), DecodedBytes.GetData(), DecodedBytes.Num());

// Access pixel at (x, y)
float Elevation = HeightmapData[y * Width + x];
```

### PipelineSegment

```python
class PipelineSegment(BaseModel):
    id: str                       # Unique segment identifier
    coordinates: List[List[float]]  # [[x, y, z], ...] in project CRS
    length_m: float               # Segment length in meters
    diameter_mm: float            # Outer diameter in millimeters
    wall_thickness_mm: float      # Wall thickness in millimeters
    material: str                 # e.g., "Carbon Steel"
    coating: Optional[str]        # e.g., "FBE", "3LPE"
    start_elevation: float        # Elevation at start (meters)
    end_elevation: float          # Elevation at end (meters)
    slope_percent: float          # Slope percentage
    terrain_type: Optional[str]   # e.g., "flat", "hilly", "mountainous"
    crossing_type: Optional[str]  # e.g., "road", "railway", "waterway"
```

**Coordinate Format:**
- Coordinates are in the **project CRS** (typically UTM)
- Format: `[easting, northing, elevation]` or `[x, y, z]`
- Units: Meters
- For `test_project2`: EPSG:32633 (WGS 84 / UTM zone 33N)

### LandcoverClass

```python
class LandcoverClass(BaseModel):
    class_id: int          # Classification value (e.g., 10, 20, 30...)
    name: str              # Human-readable name
    color_hex: str         # Hex color for visualization
    ue5_asset_hint: str    # Suggested UE5 asset category
```

**ESA WorldCover Classes:**

| class_id | name | color_hex | ue5_asset_hint |
|----------|------|-----------|----------------|
| 10 | Tree cover | #006400 | Forest |
| 20 | Shrubland | #FFBB22 | Shrubs |
| 30 | Grassland | #FFFF4C | Grass |
| 40 | Cropland | #F096FF | Farmland |
| 50 | Built-up | #FA0000 | Buildings |
| 60 | Bare/sparse | #B4B4B4 | Rocks |
| 70 | Snow/Ice | #F0F0F0 | Snow |
| 80 | Water | #0064C8 | Water |
| 90 | Wetland | #0096A0 | Marsh |
| 95 | Mangroves | #00CF75 | Mangroves |
| 100 | Moss/lichen | #FAE6A0 | Tundra |

### SensorReading

```python
class SensorReading(BaseModel):
    segment_id: str           # Which pipeline segment
    timestamp: str            # ISO 8601 format
    pressure_bar: float       # Pressure in bar
    flow_rate_m3h: float      # Flow rate in m³/hour
    temperature_c: float      # Temperature in Celsius
    vibration_hz: Optional[float]  # Vibration frequency (if available)
    status: str               # "normal", "warning", "critical"
    anomaly_type: Optional[str]    # e.g., "pressure_drop", "temperature_spike"
```

---

## 3. Project Data Layer

### Project Directory Structure

```
/opt/agrs/Projects/<PROJECT_NAME>/
├── project_metadata.json          # Project configuration
├── pipeline_specs.json            # Pipeline specifications
├── aoi/                           # Area of Interest
│   ├── aoi.{geojson|gpkg|kml|kmz}
│   ├── project_aoi.json           # AOI metadata
│   ├── start_point.{kml|kmz|geojson}
│   └── end_point.{kml|kmz|geojson}
├── data/
│   ├── rasters/
│   │   ├── raw/                   # Original fetched rasters
│   │   │   ├── dem_*_raw.tif
│   │   │   ├── dem_*_raw.tif.json
│   │   │   ├── landcover_*_raw.tif
│   │   │   └── ...
│   │   └── processed/             # Reprojected, clipped (CANONICAL)
│   │       ├── dem_epsg{CRS}_processed.tif
│   │       ├── dem_epsg{CRS}_processed.tif.json
│   │       ├── landcover_epsg{CRS}_processed.tif
│   │       └── ...
│   └── vectors/
│       ├── raw/
│       └── processed/
│           ├── osm_roads_epsg{CRS}_processed.gpkg
│           ├── osm_railways_epsg{CRS}_processed.gpkg
│           ├── osm_waterways_epsg{CRS}_processed.gpkg
│           ├── osm_power_lines_epsg{CRS}_processed.gpkg
│           └── pipelines_epsg{CRS}_processed.gpkg
├── PIRL/
│   ├── outputs/                   # Generated routes
│   │   ├── route_*.geojson
│   │   └── ...
│   ├── models/                    # Trained models
│   └── logs/
└── docs/
```

### project_metadata.json

```json
{
    "project_name": "test_project2",
    "project_id": "AGRS_test_project2_ITA_2025_001",
    "date_created": "2025-10-27T15:37:05Z",
    "status": "active",
    "project_creator": "Radwan El-Gharbi",
    "collaborators": [],
    "organization": "AGRS",
    "country": "Italy",
    "iso3": "ITA",
    "measurement_system": "SI",
    "crs": {
        "epsg": 32633,
        "name": "WGS 84 / UTM zone 33N"
    }
}
```

### project_aoi.json

```json
{
    "aoi_file": "/opt/agrs/Projects/test_project2/aoi/aoi.kmz",
    "aoi_area_km2": 1505.19,
    "aoi_countries": ["Italy"],
    "start_point": {
        "kmz_file": "/opt/agrs/Projects/test_project2/aoi/start_point.kmz",
        "latitude": 43.388493,
        "longitude": 13.514053
    },
    "end_point": {
        "kmz_file": "/opt/agrs/Projects/test_project2/aoi/end_point.kmz",
        "latitude": 42.898254,
        "longitude": 13.877811
    }
}
```

### pipeline_specs.json

```json
{
  "diameter_mm": 660.4,
  "wall_thickness_mm": 11.1,
  "material": "Carbon Steel",
  "type": "Gas",
  "mop_bar": 70.0,
  "dp_bar": 75.0,
  "depth_of_cover_m": 1.5,
  "hdd_min_bend_radius_m": 792.48,
  "hdd_applicable": false,
  "hot_bend_angles_deg": [15.0, 30.0, 45.0, 60.0, 90.0],
  "hot_bend_min_radius_m": 1.981,
  "field_bend_max_angle_deg": 5.0,
  "house_min_distance_m": 13.0,
  "powerlines_min_distance_m": 10.0,
  "existing_pipelines_min_distance_m": 0.5,
  "max_slope_percent": 20.0,
  "prefer_orthogonal_crossings": true,
  "prefer_existing_rows": true,
  "hydraulics": {
    "initial_pressure_bar": 70.0,
    "min_delivery_pressure_bar": 45.0,
    "max_operating_pressure_bar": 75.0,
    "volumetric_flow_rate_m3_s": 1.0,
    "operating_temperature_k": 288.15,
    "gas_molecular_weight_kg_kmol": 16.8,
    "gas_specific_gravity": 0.58,
    "pipe_roughness_mm": 0.045,
    "enable_hydraulics": true,
    "enable_compressor_placement": true,
    "compressor_capex_per_kw_usd": 5000.0,
    "compressor_opex_fraction": 0.03,
    "energy_cost_usd_per_kwh": 0.05
  }
}
```

---

## 4. Terrain Processing

### DEM Source Format

- **Format:** GeoTIFF (Cloud Optimized GeoTIFF in raw)
- **Source:** Copernicus DEM 30m / NASA SRTM (auto-selected based on coverage)
- **Resolution:** ~30m (varies by latitude)
- **Data Type:** Float32
- **NoData Value:** -9999.0 or as specified in metadata

### Processed DEM Metadata (Sidecar JSON)

```json
{
  "dataset_name": "Global DEM 30m (Auto) (Processed)",
  "category": "dem",
  "project": "test_project2",
  "processing_date": "2025-11-26T07:56:34.157306Z",
  "target_crs": "EPSG:32633",
  "target_crs_name": "WGS 84 / UTM zone 33N",
  "data_type": "Raster",
  "format": "GeoTIFF",
  "processed_path": "/opt/agrs/Projects/test_project2/data/rasters/processed/dem_epsg32633_processed.tif",
  "raw_path": "/opt/agrs/Projects/test_project2/data/rasters/raw/dem_global_30m_raw.tif",
  "resolution_m": {
    "x": 26.67225341754051,
    "y": 26.66379453358876
  },
  "dimensions": {
    "width": 1445,
    "height": 2418
  },
  "extent": {
    "minx": 374835.242,
    "miny": 4745835.441,
    "maxx": 413376.649,
    "maxy": 4810308.496,
    "crs": "EPSG:32633"
  },
  "bbox_wgs84": {
    "west": 13.4534437,
    "south": 42.8548576,
    "east": 13.9396512,
    "north": 43.4406676
  },
  "statistics": {
    "min": -1.1697140932083,
    "max": 563.57995605469,
    "mean": 121.21172691014,
    "stddev": 97.532390355693,
    "valid_percent": 60.72
  }
}
```

### GDAL Info for test_project2 DEM

```
Driver: GTiff/GeoTIFF
Size is 1445, 2418
Coordinate System is: PROJCRS["WGS 84 / UTM zone 33N", ...]
Origin = (374835.242, 4810308.496)
Pixel Size = (26.672, -26.664)
Band 1 Type=Float32
  Min=-1.170, Max=563.580
```

### Heightmap Conversion Process

1. **Read GeoTIFF** using GDAL
2. **Extract statistics** (min, max, mean, stddev)
3. **Resample if needed** (max 1024x1024 for API response)
4. **Convert to float32 array** (row-major order)
5. **Base64 encode** the byte array
6. **Include metadata** for georeferencing

### UE5 Terrain Generation Notes

- **Scale Factor:** `meters_per_pixel` gives ground resolution
- **Height Scale:** Use `min_elevation` and `max_elevation` to normalize
- **Origin:** `origin_lat/lon` is the center point in WGS84
- **CRS Conversion:** Coordinates in API are in project CRS (UTM)

---

## 5. Pipeline Route Processing

### Source Format

- **Format:** GeoJSON (FeatureCollection)
- **Geometry Type:** LineString
- **Coordinate Order:** `[easting, northing]` or `[easting, northing, elevation]`
- **CRS:** Project CRS (e.g., EPSG:32633 for test_project2)

### Sample PIRL Route GeoJSON

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "full_route",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [379647.98, 4805029.95],
          [379685.12, 4804937.10],
          [379710.66, 4804840.42],
          [379723.32, 4804741.22],
          ...
        ]
      },
      "properties": {
        "segment_id": "full_route",
        "length_m": 72500.0,
        "cost_usd": 45000000.0,
        "crossings": {
          "roads": 45,
          "railways": 2,
          "waterways": 12
        }
      }
    }
  ]
}
```

### Coordinate Format Details

- **X (Easting):** Meters east of UTM zone origin
- **Y (Northing):** Meters north of equator
- **Z (Elevation):** Meters above sea level (if present)

### Available PIRL Routes (test_project2)

| File | Size | Description |
|------|------|-------------|
| `route_2M_final_PRUNED_CORRECTED_COSTS.geojson` | 1.2 MB | Production route with cost corrections |
| `route_2M_final_PRUNED.geojson` | 1.2 MB | Pruned production route |
| `route_2M_final.geojson` | 9.3 MB | Full 2M iteration route |
| `pirl_native_final_route.geojson` | 4.5 KB | Native PIRL final route |
| `checkpoint_100k_route.geojson` | 99 KB | 100k iteration checkpoint |

### Segmentation Logic

The API splits the route into segments based on:
1. **Crossing points** (roads, railways, waterways)
2. **Terrain changes** (slope thresholds)
3. **Maximum segment length** (for sensor placement)

---

## 6. Sensor Data System

### Data Source

Currently: **Simulated data** with realistic patterns

Future: Real sensor integration via:
- SCADA systems
- IoT sensor networks
- Database connections

### Update Frequency

- **HTTP GET `/sensors`:** On-demand, returns current snapshot
- **WebSocket `/sensors/stream`:** 1Hz continuous updates

### Sensor Types

| Measurement | Unit | Typical Range | Description |
|-------------|------|---------------|-------------|
| `pressure_bar` | bar | 40-75 | Internal pressure |
| `flow_rate_m3h` | m³/h | 800-1500 | Volumetric flow rate |
| `temperature_c` | °C | 10-30 | Pipeline temperature |
| `vibration_hz` | Hz | 0.1-5.0 | Vibration frequency (optional) |

### Status Values

| Status | Description | Visual Indicator |
|--------|-------------|------------------|
| `normal` | Operating within parameters | Green |
| `warning` | Approaching limits | Yellow |
| `critical` | Exceeds safe limits | Red |

### Anomaly Types

- `pressure_drop` - Sudden pressure decrease
- `flow_reduction` - Reduced flow rate
- `temperature_spike` - Abnormal temperature increase
- `vibration_anomaly` - Unusual vibration pattern

### WebSocket Message Format

```json
{
  "timestamp": "2025-11-28T10:34:15.145455",
  "readings": [
    {
      "segment_id": "segment_0",
      "pressure_bar": 45.2,
      "flow_rate_m3h": 1234.5,
      "temperature_c": 18.3,
      "status": "normal"
    },
    {
      "segment_id": "segment_1",
      "pressure_bar": 32.1,
      "flow_rate_m3h": 890.2,
      "temperature_c": 25.7,
      "status": "warning"
    }
  ]
}
```

---

## 7. Backend Architecture

### Framework

- **FastAPI** (Python 3.10+)
- **Uvicorn** ASGI server
- **Pydantic** for data validation

### File Structure

```
/opt/agrs/gui-v2/backend/
├── main.py                    # Application entry point
├── api/
│   ├── routes.py              # General API routes
│   ├── projects.py            # Project management
│   ├── pirl.py                # PIRL training endpoints
│   ├── data.py                # Data layer access
│   ├── dataset_fetch.py       # Dataset fetching with AI agent
│   └── digital_twin.py        # Digital Twin API (this file)
├── requirements.txt           # Python dependencies
├── venv/                      # Virtual environment
└── .env                       # Environment configuration
```

### Key Dependencies

```
fastapi>=0.104.0
uvicorn>=0.24.0
pydantic>=2.0.0
python-multipart>=0.0.6
websockets>=12.0
gdal>=3.6.0
numpy>=1.24.0
scipy>=1.10.0
shapely>=2.0.0
pyproj>=3.5.0
```

### Server Configuration

```python
# Default configuration
host = "0.0.0.0"  # Listen on all interfaces
port = 8000
reload = True     # Auto-reload on code changes (dev mode)
```

### Starting the Server

```bash
cd /opt/agrs/gui-v2/backend
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### CORS Configuration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 8. Test Project Data

### Available Projects

| Project | Location | CRS | Status |
|---------|----------|-----|--------|
| `test_project2` | Central Italy | EPSG:32633 | Active, complete |
| `US_PIPELINE` | United States | EPSG:32617 | Partial |

### test_project2 Details

**AOI Extent (WGS84):**
- West: 13.4534°
- East: 13.9397°
- South: 42.8549°
- North: 43.4407°
- Area: 1505.19 km²

**Pipeline Route:**
- Start: 43.388493°N, 13.514053°E
- End: 42.898254°N, 13.877811°E
- Approximate Length: ~72.5 km

**Available Datasets:**

| Category | File | Resolution | Status |
|----------|------|------------|--------|
| DEM | `dem_epsg32633_processed.tif` | ~27m | ✅ Available |
| Landcover | `landcover_epsg32633_processed.tif` | 10m | ✅ Available |
| Soil | `soil_epsg32633_processed.tif` | 250m | ✅ Available |
| Geohazards | `geohazards_epsg32633_processed.tif` | Variable | ✅ Available |
| Roads | `osm_roads_epsg32633_processed.gpkg` | Vector | ✅ Available |
| Railways | `osm_railways_epsg32633_processed.gpkg` | Vector | ✅ Available |
| Waterways | `osm_waterways_epsg32633_processed.gpkg` | Vector | ✅ Available |
| Power Lines | `osm_power_lines_epsg32633_processed.gpkg` | Vector | ✅ Available |
| Pipelines | `pipelines_epsg32633_processed.gpkg` | Vector | ✅ Available |

**PIRL Routes:**
- Multiple routes available in `PIRL/outputs/`
- Latest: `route_2M_final_PRUNED_CORRECTED_COSTS.geojson`

---

## 9. Coordinate System Handling

### Project CRS Determination

1. **Automatic:** Based on AOI centroid, calculate optimal UTM zone
2. **Manual Override:** User can specify EPSG code in project creation

### CRS for test_project2

```
EPSG:32633 - WGS 84 / UTM zone 33N

Origin: 500000m E, 0m N (Equator at 15°E)
Units: Meters
Bounds: 12°E to 18°E, Equator to 84°N
```

### Coordinate Transformations

**WGS84 (Lat/Lon) → UTM:**
```python
from pyproj import Transformer

# Create transformer
transformer = Transformer.from_crs("EPSG:4326", "EPSG:32633", always_xy=True)

# Transform
x, y = transformer.transform(lon, lat)  # Note: lon first!
```

**UTM → WGS84:**
```python
transformer = Transformer.from_crs("EPSG:32633", "EPSG:4326", always_xy=True)
lon, lat = transformer.transform(x, y)
```

### UE5 World Origin

**Recommended approach:**
1. Set UE5 world origin at the **center of the AOI**
2. Convert all coordinates relative to this origin
3. Use meters as the base unit (1 UE unit = 1 meter)

**Example for test_project2:**
```
AOI Center (UTM): X=394105.95, Y=4778071.97
UE5 Origin: (0, 0, 0)

To convert UTM to UE5:
UE5_X = UTM_X - 394105.95
UE5_Y = UTM_Y - 4778071.97
UE5_Z = Elevation
```

### Scale Considerations

- **Horizontal:** 1:1 (1 meter = 1 UE unit)
- **Vertical:** May need exaggeration for visualization (e.g., 2x or 5x)
- **Terrain:** Consider LOD for large areas

---

## 10. API Response Examples

### GET /api/digital-twin/health

```json
{
  "status": "ok",
  "service": "AGRS Digital Twin API",
  "timestamp": "2025-11-28T10:34:15.145455"
}
```

### GET /api/digital-twin/test_project2/info

```json
{
  "project": "test_project2",
  "path": "/opt/agrs/Projects/test_project2",
  "metadata": {
    "project_name": "test_project2",
    "project_id": "AGRS_test_project2_ITA_2025_001",
    "country": "Italy",
    "iso3": "ITA",
    "crs": {
      "epsg": 32633,
      "name": "WGS 84 / UTM zone 33N"
    }
  },
  "pipeline_specs": {
    "diameter_mm": 660.4,
    "wall_thickness_mm": 11.1,
    "material": "Carbon Steel",
    "type": "Gas",
    "mop_bar": 70.0
  },
  "available_data": {
    "terrain": true,
    "landcover": true,
    "pipeline_route": true
  },
  "timestamp": "2025-11-28T10:34:15.145455"
}
```

### GET /api/digital-twin/test_project2/terrain

```json
{
  "project": "test_project2",
  "width": 1024,
  "height": 1024,
  "min_elevation": -1.17,
  "max_elevation": 563.58,
  "origin_lat": 43.1477,
  "origin_lon": 13.6965,
  "meters_per_pixel": 26.67,
  "crs": "EPSG:32633",
  "heightmap_base64": "AAAA..."
}
```

### GET /api/digital-twin/test_project2/pipeline

```json
{
  "project": "test_project2",
  "total_length_km": 72.5,
  "segment_count": 15,
  "diameter_mm": 660.4,
  "material": "Carbon Steel",
  "segments": [
    {
      "id": "segment_0",
      "coordinates": [
        [379647.98, 4805029.95, 150.0],
        [379685.12, 4804937.10, 148.5],
        [379710.66, 4804840.42, 145.2]
      ],
      "length_m": 5200.0,
      "diameter_mm": 660.4,
      "wall_thickness_mm": 11.1,
      "material": "Carbon Steel",
      "coating": "FBE",
      "start_elevation": 150.0,
      "end_elevation": 145.2,
      "slope_percent": -0.92,
      "terrain_type": "hilly",
      "crossing_type": null
    }
  ]
}
```

### GET /api/digital-twin/test_project2/landcover

```json
{
  "project": "test_project2",
  "width": 1024,
  "height": 1024,
  "origin_lat": 43.1477,
  "origin_lon": 13.6965,
  "meters_per_pixel": 10.0,
  "classes": [
    {"class_id": 10, "name": "Tree cover", "color_hex": "#006400", "ue5_asset_hint": "Forest"},
    {"class_id": 20, "name": "Shrubland", "color_hex": "#FFBB22", "ue5_asset_hint": "Shrubs"},
    {"class_id": 30, "name": "Grassland", "color_hex": "#FFFF4C", "ue5_asset_hint": "Grass"},
    {"class_id": 40, "name": "Cropland", "color_hex": "#F096FF", "ue5_asset_hint": "Farmland"},
    {"class_id": 50, "name": "Built-up", "color_hex": "#FA0000", "ue5_asset_hint": "Buildings"},
    {"class_id": 80, "name": "Water", "color_hex": "#0064C8", "ue5_asset_hint": "Water"}
  ],
  "classification_base64": "CgoK..."
}
```

### GET /api/digital-twin/test_project2/sensors

```json
{
  "project": "test_project2",
  "timestamp": "2025-11-28T10:34:15.145455",
  "readings": [
    {
      "segment_id": "segment_0",
      "timestamp": "2025-11-28T10:34:15.145455",
      "pressure_bar": 45.2,
      "flow_rate_m3h": 1234.5,
      "temperature_c": 18.3,
      "vibration_hz": 1.2,
      "status": "normal",
      "anomaly_type": null
    },
    {
      "segment_id": "segment_1",
      "timestamp": "2025-11-28T10:34:15.145455",
      "pressure_bar": 32.1,
      "flow_rate_m3h": 890.2,
      "temperature_c": 25.7,
      "vibration_hz": null,
      "status": "warning",
      "anomaly_type": "pressure_drop"
    }
  ]
}
```

### WebSocket /api/digital-twin/test_project2/sensors/stream

**Connection:** `ws://192.168.0.126:8000/api/digital-twin/test_project2/sensors/stream`

**Message (every 1 second):**
```json
{
  "timestamp": "2025-11-28T10:34:16.145455",
  "readings": [
    {
      "segment_id": "segment_0",
      "pressure_bar": 45.3,
      "flow_rate_m3h": 1230.2,
      "temperature_c": 18.4,
      "status": "normal"
    }
  ]
}
```

---

## Quick Reference

### Base URL
```
http://192.168.0.126:8000
```

### Test Connectivity
```bash
curl http://192.168.0.126:8000/api/digital-twin/health
```

### Fetch Terrain
```bash
curl http://192.168.0.126:8000/api/digital-twin/test_project2/terrain
```

### Fetch Pipeline
```bash
curl http://192.168.0.126:8000/api/digital-twin/test_project2/pipeline
```

### WebSocket Test (using websocat)
```bash
websocat ws://192.168.0.126:8000/api/digital-twin/test_project2/sensors/stream
```

---

*This document provides complete context for autonomous UE5 Digital Twin development. For questions or updates, query the VM agent.*




