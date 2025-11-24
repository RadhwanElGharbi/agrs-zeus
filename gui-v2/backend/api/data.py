"""
Vector and Raster Data API Endpoints

Provides endpoints to serve project datasets.
"""

import json
import math
import os
import subprocess
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response
from .project_utils import resolve_project_path

router = APIRouter()

# Cache for converted GeoJSON files
GEOJSON_CACHE = {}


def get_project_path_or_404(project: str) -> Path:
    """Resolve a project path or raise a 404 HTTPException."""
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project}' not found (missing project_metadata.json or pipeline_specs.json)"
        )
    return project_path


def mercator_tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """
    Calculate Web Mercator bounds for a given XYZ tile.
    Returns (minx, miny, maxx, maxy) in EPSG:3857 meters.
    """
    n = 2 ** z
    lon_left = x / n * 360.0 - 180.0
    lon_right = (x + 1) / n * 360.0 - 180.0

    def lat_for_tile(y_val: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y_val / n))))

    lat_top = lat_for_tile(y)
    lat_bottom = lat_for_tile(y + 1)

    def to_mercator(lon: float, lat: float) -> tuple[float, float]:
        # Clamp latitude to Web Mercator valid range
        lat = max(min(lat, 85.05112878), -85.05112878)
        x_merc = lon * 20037508.342789244 / 180.0
        y_merc = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * 6378137.0
        return x_merc, y_merc

    min_x, max_y = to_mercator(lon_left, lat_top)
    max_x, min_y = to_mercator(lon_right, lat_bottom)

    return min_x, min_y, max_x, max_y


@router.get("/data/{project}/vectors/{layer}")
async def get_vector_layer(project: str, layer: str):
    """
    Get a vector layer as GeoJSON
    
    Converts GeoPackage to GeoJSON on-the-fly using ogr2ogr.
    Results are cached for performance.
    """
    project_path = get_project_path_or_404(project)
    
    # Look for the vector file (symlink or regular file)
    vectors_dir = project_path / "data" / "vectors"
    vector_file = vectors_dir / f"{layer}.gpkg"
    
    if not vector_file.exists():
        raise HTTPException(status_code=404, detail=f"Vector layer '{layer}' not found in project '{project}'")
    
    # Check cache
    cache_key = f"{project}:{layer}"
    if cache_key in GEOJSON_CACHE:
        return JSONResponse(content=GEOJSON_CACHE[cache_key])
    
    try:
        # Convert GPKG to GeoJSON using ogr2ogr
        with tempfile.NamedTemporaryFile(mode='w', suffix='.geojson', delete=False) as tmp_file:
            tmp_path = tmp_file.name

        # Remove the placeholder file so ogr2ogr can create it cleanly
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        
        # Run ogr2ogr to convert GPKG to GeoJSON
        cmd = [
            'ogr2ogr',
            '-overwrite',
            '-f', 'GeoJSON',
            '-t_srs', 'EPSG:4326',  # Convert to WGS84 for web display
            tmp_path,
            str(vector_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"ogr2ogr failed: {result.stderr}")
        
        # Read the generated GeoJSON
        with open(tmp_path, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
        
        # Clean up temp file
        os.unlink(tmp_path)
        
        # Cache the result
        GEOJSON_CACHE[cache_key] = geojson_data
        
        return JSONResponse(content=geojson_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert vector layer: {str(e)}")


def render_raster_tile(raster_file: Path, z: int, x: int, y: int) -> bytes:
    """Render a single raster tile as PNG using gdalwarp."""
    min_x, min_y, max_x, max_y = mercator_tile_bounds(z, x, y)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

    nodata_value = None
    sidecar = raster_file.with_suffix(raster_file.suffix + ".json")
    if sidecar.exists():
        try:
            with open(sidecar, "r", encoding="utf-8") as f:
                meta = json.load(f)
            if "nodata_value" in meta and isinstance(meta["nodata_value"], (int, float)):
                nodata_value = str(meta["nodata_value"])
        except Exception:
            nodata_value = None

    cmd = [
        "gdalwarp",
        "-t_srs", "EPSG:3857",
        "-te", str(min_x), str(min_y), str(max_x), str(max_y),
        "-te_srs", "EPSG:3857",
        "-ts", "256", "256",
        "-dstalpha",
        "-r", "bilinear",
        "-of", "PNG",
    ]

    if nodata_value is not None:
        cmd.extend(["-srcnodata", nodata_value, "-dstnodata", nodata_value])

    cmd.extend([
        str(raster_file),
        str(tmp_path),
    ])

    result = subprocess.run(cmd, capture_output=True)

    if result.returncode != 0:
        try:
            os.unlink(tmp_path)
        finally:
            raise HTTPException(status_code=500, detail=f"gdalwarp failed: {result.stderr}")

    try:
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        os.unlink(tmp_path)


@router.get("/tiles/{project}/{layer}/{z}/{x}/{y}.png")
async def get_raster_tile(project: str, layer: str, z: int, x: int, y: int):
    """
    Serve map tiles for raster datasets.

    Tiles are rendered on the fly in Web Mercator to align with MapLibre.
    """
    project_path = get_project_path_or_404(project)
    raster_file = project_path / "data" / "rasters" / f"{layer}.tif"

    if not raster_file.exists():
        raise HTTPException(status_code=404, detail=f"Raster layer '{layer}' not found in project '{project}'")

    try:
        tile_bytes = render_raster_tile(raster_file, z, x, y)
        return Response(content=tile_bytes, media_type="image/png")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to render raster tile: {exc}")


@router.delete("/data/cache")
async def clear_cache():
    """
    Clear the GeoJSON conversion cache
    
    Useful for development or if datasets are updated.
    """
    global GEOJSON_CACHE
    cache_size = len(GEOJSON_CACHE)
    GEOJSON_CACHE = {}
    
    return {
        "message": f"Cache cleared ({cache_size} entries removed)",
        "status": "success"
    }
