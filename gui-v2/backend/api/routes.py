"""
API Routes for AGRS ZEUS GUI v2
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Dict, Any
import datetime

router = APIRouter()


# Debug endpoint to check what headers the backend receives
@router.get("/debug/headers")
async def debug_headers(request: Request):
    """Debug endpoint to see what headers are received by the backend."""
    return {
        "client_host": request.client.host if request.client else None,
        "client_port": request.client.port if request.client else None,
        "x_real_ip": request.headers.get("x-real-ip"),
        "x_forwarded_for": request.headers.get("x-forwarded-for"),
        "x_forwarded_proto": request.headers.get("x-forwarded-proto"),
        "cf_connecting_ip": request.headers.get("cf-connecting-ip"),
        "host_header": request.headers.get("host"),
        "all_headers": dict(request.headers),
    }

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






