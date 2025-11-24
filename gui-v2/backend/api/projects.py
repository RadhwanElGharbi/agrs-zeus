"""
Project Discovery API Endpoints

Provides endpoints to discover and manage projects following the AGRS standard structure.
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .project_utils import (
    discover_project_paths,
    resolve_project_path,
    load_json_file,
)

router = APIRouter()


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


