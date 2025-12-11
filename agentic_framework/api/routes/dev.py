"""Development Mode Endpoints.

This module provides endpoints for development/demo purposes,
including cache management and fallback mode toggle.
These endpoints are restricted in production mode.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config.settings import Settings
from agents.cache import clear_cache, get_cache_stats, clear_segment_cache
from agents.fallback import (
    list_predefined_fallbacks,
    add_predefined_fallback,
    remove_predefined_fallback,
)


logger = logging.getLogger(__name__)

router = APIRouter()


class FallbackModeRequest(BaseModel):
    """Request model for toggling fallback mode."""
    enabled: bool


class DevStatusResponse(BaseModel):
    """Response model for dev status."""
    dev_mode: bool
    use_cached_responses: bool
    cache_stats: dict
    predefined_fallbacks: list


def _check_dev_mode() -> None:
    """Check if dev mode is enabled.

    Raises:
        HTTPException: 403 if not in dev mode
    """
    if not Settings.DEV_MODE:
        raise HTTPException(
            status_code=403,
            detail="This endpoint is only available in DEV_MODE"
        )


@router.post("/fallback-mode")
async def set_fallback_mode(request: FallbackModeRequest) -> dict:
    """Enable or disable fallback mode.

    When enabled, the API will use pre-defined fallback responses
    instead of calling the AI agents.

    Args:
        request: FallbackModeRequest with enabled flag

    Returns:
        Dict with updated status

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    # Update the setting
    # Note: This modifies the class attribute, not environment variable
    Settings.USE_CACHED_RESPONSES = request.enabled

    logger.info(f"Fallback mode set to: {request.enabled}")

    return {
        "message": f"Fallback mode {'enabled' if request.enabled else 'disabled'}",
        "use_cached_responses": Settings.USE_CACHED_RESPONSES,
    }


@router.get("/fallback-mode")
async def get_fallback_mode() -> dict:
    """Get current fallback mode status.

    Returns:
        Dict with fallback mode status
    """
    _check_dev_mode()

    return {
        "use_cached_responses": Settings.USE_CACHED_RESPONSES,
        "dev_mode": Settings.DEV_MODE,
    }


@router.get("/cache/clear")
async def clear_cache_endpoint() -> dict:
    """Clear all cached responses.

    Returns:
        Dict with number of entries cleared

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    count = clear_cache()
    logger.info(f"Cache cleared: {count} entries removed")

    return {
        "message": f"Cache cleared: {count} entries removed",
        "entries_cleared": count,
    }


@router.delete("/cache/{route_id}/{segment_id}")
async def clear_segment_cache_endpoint(route_id: str, segment_id: str) -> dict:
    """Clear cached response for a specific segment.

    Args:
        route_id: Route identifier
        segment_id: Segment identifier

    Returns:
        Dict with result

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    success = clear_segment_cache(segment_id, route_id)

    if success:
        logger.info(f"Cache cleared for segment {segment_id} in route {route_id}")
        return {
            "message": f"Cache cleared for segment {segment_id}",
            "route_id": route_id,
            "segment_id": segment_id,
        }
    else:
        return {
            "message": "Failed to clear cache entry",
            "route_id": route_id,
            "segment_id": segment_id,
        }


@router.get("/cache/stats")
async def get_cache_stats_endpoint() -> dict:
    """Get cache statistics.

    Returns:
        Dict with cache statistics

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    stats = get_cache_stats()
    return stats


@router.get("/status", response_model=DevStatusResponse)
async def get_dev_status() -> DevStatusResponse:
    """Get development mode status and configuration.

    Returns:
        DevStatusResponse with current settings

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    return DevStatusResponse(
        dev_mode=Settings.DEV_MODE,
        use_cached_responses=Settings.USE_CACHED_RESPONSES,
        cache_stats=get_cache_stats(),
        predefined_fallbacks=list_predefined_fallbacks(),
    )


@router.get("/fallbacks")
async def list_fallbacks() -> dict:
    """List all pre-defined fallback responses.

    Returns:
        Dict with list of segment IDs with fallbacks

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    fallbacks = list_predefined_fallbacks()
    return {
        "count": len(fallbacks),
        "segment_ids": fallbacks,
    }


@router.post("/fallbacks/{segment_id}")
async def add_fallback(segment_id: str, response: dict) -> dict:
    """Add a pre-defined fallback response for a segment.

    Args:
        segment_id: Segment identifier
        response: Fallback response dict

    Returns:
        Dict with result

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    add_predefined_fallback(segment_id, response)
    logger.info(f"Added predefined fallback for segment {segment_id}")

    return {
        "message": f"Fallback added for segment {segment_id}",
        "segment_id": segment_id,
    }


@router.delete("/fallbacks/{segment_id}")
async def remove_fallback(segment_id: str) -> dict:
    """Remove a pre-defined fallback response.

    Args:
        segment_id: Segment identifier

    Returns:
        Dict with result

    Raises:
        HTTPException: 403 if not in DEV_MODE
        HTTPException: 404 if fallback doesn't exist
    """
    _check_dev_mode()

    if remove_predefined_fallback(segment_id):
        logger.info(f"Removed predefined fallback for segment {segment_id}")
        return {
            "message": f"Fallback removed for segment {segment_id}",
            "segment_id": segment_id,
        }
    else:
        raise HTTPException(
            status_code=404,
            detail=f"No predefined fallback found for segment '{segment_id}'"
        )


@router.post("/settings")
async def update_settings(
    dev_mode: bool = None,
    use_cached_responses: bool = None,
) -> dict:
    """Update development settings.

    Args:
        dev_mode: Enable/disable dev mode (cannot be changed at runtime)
        use_cached_responses: Enable/disable cached responses

    Returns:
        Dict with updated settings

    Raises:
        HTTPException: 403 if not in DEV_MODE
    """
    _check_dev_mode()

    if dev_mode is not None:
        logger.warning("DEV_MODE cannot be changed at runtime")

    if use_cached_responses is not None:
        Settings.USE_CACHED_RESPONSES = use_cached_responses
        logger.info(f"USE_CACHED_RESPONSES set to: {use_cached_responses}")

    return {
        "dev_mode": Settings.DEV_MODE,
        "use_cached_responses": Settings.USE_CACHED_RESPONSES,
    }
