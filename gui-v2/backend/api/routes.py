"""
API Routes for AGRS ZEUS GUI v2
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
import datetime

router = APIRouter()

# Response Models
class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str
    services: Dict[str, str]

class ProjectInfo(BaseModel):
    id: str
    name: str
    description: str
    created_at: str
    status: str

class ConfigResponse(BaseModel):
    mapbox_token: str
    api_version: str
    features: List[str]

# Health Check Endpoint
@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint to verify API is operational
    """
    return HealthResponse(
        status="healthy",
        timestamp=datetime.datetime.now().isoformat(),
        version="2.0.0",
        services={
            "api": "operational",
            "database": "not_configured",
            "cpp_core": "not_integrated"
        }
    )

# Projects Endpoint
@router.get("/projects", response_model=List[ProjectInfo])
async def get_projects():
    """
    Get list of all projects (placeholder data for now)
    """
    # TODO: Integrate with C++ core to get real project data
    return [
        ProjectInfo(
            id="test_project2",
            name="Test Project 2",
            description="Test project with PIRL training",
            created_at="2025-01-15T10:00:00Z",
            status="active"
        ),
        ProjectInfo(
            id="US_PIPELINE",
            name="US Pipeline Project",
            description="US pipeline routing optimization",
            created_at="2025-11-20T14:30:00Z",
            status="active"
        )
    ]

# Configuration Endpoint
@router.get("/config", response_model=ConfigResponse)
async def get_config():
    """
    Get application configuration
    """
    return ConfigResponse(
        mapbox_token="pk.placeholder_token_for_now",
        api_version="2.0.0",
        features=[
            "mapping",
            "project_management",
            "pirl_training",
            "dataset_visualization"
        ]
    )

# Project Details Endpoint
@router.get("/projects/{project_id}")
async def get_project_details(project_id: str):
    """
    Get detailed information about a specific project
    """
    # TODO: Integrate with C++ core
    if project_id not in ["test_project2", "US_PIPELINE"]:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {
        "id": project_id,
        "name": project_id.replace("_", " ").title(),
        "description": f"Details for {project_id}",
        "metadata": {
            "datasets": [],
            "routes": [],
            "pirl_models": []
        }
    }

