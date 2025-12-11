"""Health Check Endpoint.

This module provides the /health endpoint for monitoring system status.
"""
import logging

from fastapi import APIRouter, Request

from models.api import HealthResponse
from agents.registry import get_available_agents
from agents.client import test_connection


logger = logging.getLogger(__name__)

# Application version - keep in sync with api/main.py
APP_VERSION = "1.0.0"

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    """Health check endpoint.

    Returns system status, version, and available agents.
    Checks Anthropic API connectivity to determine status.

    Returns:
        HealthResponse with status, version, and agents
    """
    # Get available agents
    agents = get_available_agents()

    # Check Anthropic API connectivity
    # Use cached state from startup if available
    anthropic_connected = getattr(request.app.state, "anthropic_connected", None)

    if anthropic_connected is None:
        # No cached state, try to connect
        try:
            anthropic_connected = test_connection()
        except Exception as e:
            logger.warning(f"Health check: Anthropic API unreachable: {e}")
            anthropic_connected = False

    # Determine overall status
    if anthropic_connected:
        status = "ok"
    else:
        status = "degraded"
        logger.warning("Health check: API status is degraded (Anthropic unreachable)")

    return HealthResponse(
        status=status,
        version=APP_VERSION,
        agents_available=agents,
    )


@router.get("/health/detailed")
async def health_check_detailed(request: Request) -> dict:
    """Detailed health check with component status.

    Returns detailed information about system components.

    Returns:
        Dict with detailed health information
    """
    from config.settings import Settings
    from agents.cache import get_cache_stats
    from data.route_loader import get_route_ids

    # Get basic health
    anthropic_connected = getattr(request.app.state, "anthropic_connected", False)

    # Get cache stats
    try:
        cache_stats = get_cache_stats()
    except Exception as e:
        cache_stats = {"error": str(e)}

    # Get available routes
    try:
        routes = get_route_ids()
    except Exception as e:
        routes = []
        logger.error(f"Failed to get route IDs: {e}")

    return {
        "status": "ok" if anthropic_connected else "degraded",
        "version": APP_VERSION,
        "components": {
            "anthropic_api": {
                "connected": anthropic_connected,
                "model": Settings.ANTHROPIC_MODEL,
            },
            "cache": cache_stats,
            "routes": {
                "available_count": len(routes),
                "route_ids": routes[:10],  # Limit to first 10
            },
        },
        "config": {
            "dev_mode": Settings.DEV_MODE,
            "use_cached_responses": Settings.USE_CACHED_RESPONSES,
        },
        "agents_available": get_available_agents(),
    }
