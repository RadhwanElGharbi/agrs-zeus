"""
API Routes for AGRS ZEUS GUI v2
"""

from fastapi import APIRouter
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



