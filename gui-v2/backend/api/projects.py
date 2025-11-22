"""
Project Discovery API Endpoints

Provides endpoints to discover and manage projects following the AGRS standard structure.
"""

import os
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Base projects directory
PROJECTS_ROOT = Path("/opt/agrs/Projects")


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


def is_valid_project(project_path: Path) -> bool:
    """Check if a directory is a valid AGRS project"""
    metadata_file = project_path / "project_metadata.json"
    return metadata_file.exists()


def load_json_file(file_path: Path) -> Optional[Dict[str, Any]]:
    """Load a JSON file safely"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return None


@router.get("/projects", response_model=List[ProjectMetadata])
async def list_projects():
    """
    Discover and list all valid projects in /opt/agrs/Projects/
    
    A valid project must have a project_metadata.json file.
    """
    projects = []
    
    if not PROJECTS_ROOT.exists():
        return projects
    
    for project_dir in PROJECTS_ROOT.iterdir():
        if not project_dir.is_dir():
            continue
        
        if is_valid_project(project_dir):
            metadata_file = project_dir / "project_metadata.json"
            metadata = load_json_file(metadata_file)
            
            if metadata:
                projects.append(ProjectMetadata(**metadata))
    
    return projects


@router.get("/projects/{project_name}/metadata", response_model=ProjectMetadata)
async def get_project_metadata(project_name: str):
    """
    Get full metadata for a specific project
    """
    project_path = PROJECTS_ROOT / project_name
    
    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
    
    if not is_valid_project(project_path):
        raise HTTPException(status_code=400, detail=f"Invalid project structure for '{project_name}'")
    
    metadata_file = project_path / "project_metadata.json"
    metadata = load_json_file(metadata_file)
    
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
    project_path = PROJECTS_ROOT / project_name
    
    if not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
    
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
                metadata_file = item.with_suffix('.tif.json')
                
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
                metadata_file = item.with_suffix('.gpkg.json')
                
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

