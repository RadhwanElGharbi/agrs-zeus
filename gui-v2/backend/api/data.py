"""
Vector and Raster Data API Endpoints

Provides endpoints to serve project datasets.
"""

import os
import json
import subprocess
from pathlib import Path
from typing import Dict, Any
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
import tempfile

router = APIRouter()

# Base projects directory
PROJECTS_ROOT = Path("/opt/agrs/Projects")

# Cache for converted GeoJSON files
GEOJSON_CACHE = {}


@router.get("/data/{project}/vectors/{layer}")
async def get_vector_layer(project: str, layer: str):
    """
    Get a vector layer as GeoJSON
    
    Converts GeoPackage to GeoJSON on-the-fly using ogr2ogr.
    Results are cached for performance.
    """
    project_path = PROJECTS_ROOT / project
    
    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")
    
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
        
        # Run ogr2ogr to convert GPKG to GeoJSON
        cmd = [
            'ogr2ogr',
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

