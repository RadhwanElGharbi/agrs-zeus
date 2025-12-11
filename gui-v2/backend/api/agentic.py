"""Proxy routes to agentic framework service.

This module provides endpoints that proxy requests to the agentic framework
running on a separate port, enabling segment analysis functionality.
"""

import os
import logging
from typing import Optional, List, Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agentic"])

# Configuration
AGENTIC_BASE_URL = os.getenv("AGENTIC_BASE_URL", "http://localhost:8001")
AGENTIC_TIMEOUT = int(os.getenv("AGENTIC_TIMEOUT", "120"))


# ============================================================================
# Request/Response Models
# ============================================================================

class ExplainRequest(BaseModel):
    """Request model for segment analysis."""
    route_id: str
    segment_ids: List[str]


class AgenticHealthResponse(BaseModel):
    """Health response from agentic framework."""
    status: str
    version: str
    agents_available: List[str]


# ============================================================================
# Helper Functions
# ============================================================================

async def _proxy_get(path: str, params: Optional[dict] = None) -> Any:
    """Proxy a GET request to the agentic framework.

    Args:
        path: API path (e.g., "/health", "/api/routes")
        params: Optional query parameters

    Returns:
        JSON response from agentic framework

    Raises:
        HTTPException: On connection or HTTP errors
    """
    url = f"{AGENTIC_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=AGENTIC_TIMEOUT)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Agentic framework error: {response.text}"
                )
            return response.json()
    except httpx.ConnectError as e:
        logger.error(f"Cannot connect to agentic framework at {url}: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Agentic framework unavailable at {AGENTIC_BASE_URL}. Is it running?"
        )
    except httpx.TimeoutException as e:
        logger.error(f"Timeout connecting to agentic framework: {e}")
        raise HTTPException(
            status_code=504,
            detail=f"Agentic framework timeout after {AGENTIC_TIMEOUT}s"
        )
    except Exception as e:
        logger.error(f"Error proxying to agentic framework: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _proxy_post(path: str, json_body: Any) -> Any:
    """Proxy a POST request to the agentic framework.

    Args:
        path: API path (e.g., "/api/explain")
        json_body: Request body to send

    Returns:
        JSON response from agentic framework

    Raises:
        HTTPException: On connection or HTTP errors
    """
    url = f"{AGENTIC_BASE_URL}{path}"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json=json_body if isinstance(json_body, dict) else json_body.model_dump(),
                timeout=AGENTIC_TIMEOUT
            )
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Agentic framework error: {response.text}"
                )
            return response.json()
    except httpx.ConnectError as e:
        logger.error(f"Cannot connect to agentic framework at {url}: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Agentic framework unavailable at {AGENTIC_BASE_URL}. Is it running?"
        )
    except httpx.TimeoutException as e:
        logger.error(f"Timeout from agentic framework: {e}")
        raise HTTPException(
            status_code=504,
            detail=f"Analysis timeout after {AGENTIC_TIMEOUT}s. Try fewer segments."
        )
    except Exception as e:
        logger.error(f"Error proxying to agentic framework: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/agentic/health", response_model=AgenticHealthResponse)
async def agentic_health():
    """Check health of the agentic framework service.

    Returns:
        Health status including available agents
    """
    return await _proxy_get("/health")


@router.get("/agentic/routes")
async def list_agentic_routes():
    """List all routes available in the agentic framework.

    Returns:
        List of route IDs with segment counts
    """
    return await _proxy_get("/api/routes")


@router.get("/agentic/routes/{route_id}")
async def get_agentic_route(route_id: str):
    """Get details of a specific route.

    Args:
        route_id: Route identifier

    Returns:
        Route details including segment count and metadata
    """
    return await _proxy_get(f"/api/routes/{route_id}")


@router.get("/agentic/routes/{route_id}/segments")
async def list_agentic_segments(
    route_id: str,
    limit: Optional[int] = Query(None, description="Max segments to return"),
    offset: int = Query(0, description="Number of segments to skip")
):
    """List segments in a route.

    Args:
        route_id: Route identifier
        limit: Optional limit on results
        offset: Number to skip for pagination

    Returns:
        List of segment info
    """
    params = {"offset": offset}
    if limit is not None:
        params["limit"] = limit
    return await _proxy_get(f"/api/routes/{route_id}/segments", params=params)


@router.get("/agentic/routes/{route_id}/segments/{segment_id}")
async def get_agentic_segment(route_id: str, segment_id: str):
    """Get details of a specific segment.

    Args:
        route_id: Route identifier
        segment_id: Segment identifier

    Returns:
        Full segment data
    """
    return await _proxy_get(f"/api/routes/{route_id}/segments/{segment_id}")


@router.get("/agentic/routes/{route_id}/geometry")
async def get_agentic_route_geometry(route_id: str):
    """Get route geometry as GeoJSON.

    Args:
        route_id: Route identifier

    Returns:
        GeoJSON Feature or FeatureCollection
    """
    return await _proxy_get(f"/api/routes/{route_id}/geometry")


@router.get("/agentic/routes/{route_id}/segments/geometry")
async def get_agentic_segments_geometry(route_id: str):
    """Get route segments as GeoJSON FeatureCollection.

    Each segment is a Feature with segment_id, route_id, and metrics
    in properties - suitable for loading directly onto a map.

    Args:
        route_id: Route identifier

    Returns:
        GeoJSON FeatureCollection with segment features
    """
    return await _proxy_get(f"/api/routes/{route_id}/segments/geometry")


@router.post("/agentic/explain")
async def analyze_segments(request: ExplainRequest):
    """Analyze pipeline route segments using AI agents.

    This is the main endpoint for segment analysis. It runs the full
    analysis pipeline (geotechnical, environmental, engineering, cost,
    and master synthesis) on the requested segments.

    Args:
        request: ExplainRequest with route_id and segment_ids

    Returns:
        List of analysis results, one per segment, containing:
        - segment_id: Segment identifier
        - overall_assessment: "favorable", "caution", or "challenging"
        - confidence: "high", "medium", or "low"
        - executive_summary: 2-3 sentence summary
        - key_metrics: Length, slope, terrain, cost estimate
        - specialist_summaries: One-sentence from each agent
        - saipem_compliance: Criteria met/violated
        - flags: List of concern flags
        - recommendations: Actionable suggestions
    """
    logger.info(f"Analyze request: route={request.route_id}, segments={request.segment_ids}")
    return await _proxy_post("/api/explain", request)


@router.post("/agentic/explain/single")
async def analyze_single_segment(
    route_id: str = Query(..., description="Route identifier"),
    segment_id: str = Query(..., description="Segment identifier"),
    skip_cache: bool = Query(False, description="Bypass cache for fresh analysis")
):
    """Analyze a single pipeline route segment.

    Convenience endpoint for single-segment analysis.

    Args:
        route_id: Route identifier
        segment_id: Segment identifier
        skip_cache: If True, bypass cache

    Returns:
        Analysis result for the segment
    """
    logger.info(f"Single segment analysis: route={route_id}, segment={segment_id}")
    params = {"route_id": route_id, "segment_id": segment_id}
    if skip_cache:
        params["skip_cache"] = "true"

    url = f"{AGENTIC_BASE_URL}/api/explain/single"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, params=params, timeout=AGENTIC_TIMEOUT)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Agentic framework error: {response.text}"
                )
            return response.json()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Agentic framework unavailable at {AGENTIC_BASE_URL}"
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=f"Analysis timeout after {AGENTIC_TIMEOUT}s"
        )
