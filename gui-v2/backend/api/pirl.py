"""
PIRL Route API Endpoints

Provides endpoints to discover and serve PIRL route GeoJSON files.
"""

import os
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter()

# Base projects directory
PROJECTS_ROOT = Path("/opt/agrs/Projects")


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


@router.get("/pirl/{project}/routes", response_model=List[RouteMetadata])
async def list_routes(project: str):
    """
    List all available PIRL routes for a project
    
    Scans PIRL/outputs/ directory for route_*.geojson files.
    """
    project_path = PROJECTS_ROOT / project
    
    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")
    
    pirl_outputs_dir = project_path / "PIRL" / "outputs"
    
    if not pirl_outputs_dir.exists():
        return []
    
    routes = []
    
    # Scan for route_*.geojson files
    for geojson_file in pirl_outputs_dir.glob("route_*.geojson"):
        try:
            with open(geojson_file, 'r', encoding='utf-8') as f:
                geojson_data = json.load(f)
            
            metadata = extract_route_metadata(geojson_data)
            metadata['filename'] = geojson_file.name
            
            routes.append(RouteMetadata(**metadata))
        except Exception as e:
            print(f"Error reading {geojson_file}: {e}")
            # Add route with filename only
            routes.append(RouteMetadata(filename=geojson_file.name))
    
    # Also check subdirectories
    for subdir in pirl_outputs_dir.iterdir():
        if subdir.is_dir():
            for geojson_file in subdir.glob("route_*.geojson"):
                try:
                    with open(geojson_file, 'r', encoding='utf-8') as f:
                        geojson_data = json.load(f)
                    
                    metadata = extract_route_metadata(geojson_data)
                    metadata['filename'] = f"{subdir.name}/{geojson_file.name}"
                    
                    routes.append(RouteMetadata(**metadata))
                except Exception as e:
                    print(f"Error reading {geojson_file}: {e}")
                    routes.append(RouteMetadata(filename=f"{subdir.name}/{geojson_file.name}"))
    
    return routes


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




