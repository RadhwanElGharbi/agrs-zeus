"""Explain Endpoint for segment analysis.

This module provides the /api/explain endpoint for running
AI agent analysis on pipeline route segments.
"""
import logging
import time
from typing import List

from fastapi import APIRouter, HTTPException, Response

from models.api import ExplainRequest, ExplainResponse, ErrorResponse
from data.route_loader import load_route, RouteNotFoundError
from data.segment_extractor import extract_segment_data, get_all_segment_ids
from agents.cache import get_cached_response, save_to_cache
from agents.fallback import get_fallback_response, should_use_fallback
from agents.executor import run_full_analysis
from config.settings import Settings


logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/explain",
    response_model=List[ExplainResponse],
    responses={
        404: {"model": ErrorResponse, "description": "Route or segment not found"},
        422: {"description": "Validation error"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    }
)
async def explain_segments(
    request: ExplainRequest,
    response: Response
) -> List[ExplainResponse]:
    """Analyze pipeline route segments using AI agents.

    Runs the full analysis pipeline (geotechnical, environmental,
    engineering, cost, and master synthesis) on requested segments.

    Args:
        request: ExplainRequest with route_id and segment_ids

    Returns:
        List of ExplainResponse objects, one per segment

    Raises:
        HTTPException: 404 if route or segments not found
    """
    start_time = time.time()
    route_id = request.route_id
    segment_ids = request.segment_ids

    logger.info(f"Explain request: route={route_id}, segments={segment_ids}")

    # Validate route exists
    try:
        route_data = load_route(route_id)
    except RouteNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' not found"
        )

    # Validate all segment IDs exist in route
    available_segments = get_all_segment_ids(route_id)
    missing_segments = [
        seg_id for seg_id in segment_ids
        if seg_id not in available_segments
    ]

    if missing_segments:
        raise HTTPException(
            status_code=404,
            detail=f"Segments not found in route '{route_id}': {missing_segments}"
        )

    # Process each segment
    results: List[ExplainResponse] = []

    for segment_id in segment_ids:
        segment_start = time.time()

        # Check cache first
        cached = get_cached_response(segment_id, route_id)
        if cached:
            logger.info(f"Cache hit for segment {segment_id}")
            results.append(ExplainResponse(**cached))
            continue

        # Check if we should use fallback mode
        if should_use_fallback():
            logger.info(f"Using fallback for segment {segment_id} (fallback mode enabled)")
            segment_data = extract_segment_data(route_id, segment_id)
            segment_dict = _segment_to_dict(segment_data) if segment_data else {}
            fallback = get_fallback_response(segment_id, segment_dict)
            results.append(ExplainResponse(**fallback))
            continue

        # Extract segment data
        segment_data = extract_segment_data(route_id, segment_id)
        if segment_data is None:
            logger.error(f"Failed to extract data for segment {segment_id}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to extract data for segment '{segment_id}'"
            )

        # Convert to dict for agent processing
        segment_dict = _segment_to_dict(segment_data)

        # Run full analysis
        try:
            analysis_result = await run_full_analysis(segment_dict)

            # Cache successful result
            save_to_cache(segment_id, route_id, analysis_result)

            results.append(ExplainResponse(**analysis_result))
            segment_time = time.time() - segment_start
            logger.info(f"Segment {segment_id} analyzed in {segment_time:.2f}s")

        except Exception as e:
            logger.error(f"Analysis failed for segment {segment_id}: {e}")

            # In dev mode, use fallback
            if Settings.DEV_MODE:
                logger.info(f"Using fallback for segment {segment_id} due to error")
                fallback = get_fallback_response(segment_id, segment_dict)
                results.append(ExplainResponse(**fallback))
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Analysis failed for segment '{segment_id}': {str(e)}"
                )

    # Add timing header
    total_time = time.time() - start_time
    response.headers["X-Processing-Time"] = f"{total_time:.2f}s"

    logger.info(
        f"Explain request completed: {len(results)} segments in {total_time:.2f}s"
    )

    return results


@router.post(
    "/explain/single",
    response_model=ExplainResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Route or segment not found"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    }
)
async def explain_single_segment(
    route_id: str,
    segment_id: str,
    response: Response,
    skip_cache: bool = False
) -> ExplainResponse:
    """Analyze a single pipeline route segment.

    Convenience endpoint for analyzing a single segment.

    Args:
        route_id: Route identifier
        segment_id: Segment identifier
        skip_cache: If True, bypass cache and force fresh analysis

    Returns:
        ExplainResponse for the segment
    """
    start_time = time.time()

    # Validate route exists
    try:
        load_route(route_id)
    except RouteNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' not found"
        )

    # Check cache unless skipped
    if not skip_cache:
        cached = get_cached_response(segment_id, route_id)
        if cached:
            logger.info(f"Cache hit for segment {segment_id}")
            response.headers["X-Cache"] = "HIT"
            return ExplainResponse(**cached)

    response.headers["X-Cache"] = "MISS"

    # Check if we should use fallback mode
    if should_use_fallback():
        logger.info(f"Using fallback for segment {segment_id} (fallback mode enabled)")
        segment_data = extract_segment_data(route_id, segment_id)
        segment_dict = _segment_to_dict(segment_data) if segment_data else {}
        fallback = get_fallback_response(segment_id, segment_dict)
        return ExplainResponse(**fallback)

    # Extract segment data
    segment_data = extract_segment_data(route_id, segment_id)
    if segment_data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Segment '{segment_id}' not found in route '{route_id}'"
        )

    # Convert to dict
    segment_dict = _segment_to_dict(segment_data)

    # Run full analysis
    try:
        analysis_result = await run_full_analysis(segment_dict)

        # Cache successful result
        save_to_cache(segment_id, route_id, analysis_result)

        total_time = time.time() - start_time
        response.headers["X-Processing-Time"] = f"{total_time:.2f}s"

        logger.info(f"Single segment {segment_id} analyzed in {total_time:.2f}s")
        return ExplainResponse(**analysis_result)

    except Exception as e:
        logger.error(f"Analysis failed for segment {segment_id}: {e}")

        if Settings.DEV_MODE:
            logger.info(f"Using fallback for segment {segment_id} due to error")
            fallback = get_fallback_response(segment_id, segment_dict)
            return ExplainResponse(**fallback)
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Analysis failed for segment '{segment_id}': {str(e)}"
            )


def _segment_to_dict(segment_data) -> dict:
    """Convert SegmentData model to dict for agent processing.

    Args:
        segment_data: SegmentData Pydantic model instance

    Returns:
        Dict representation suitable for agents
    """
    if segment_data is None:
        return {}

    return {
        "id": segment_data.id,
        "coordinates": {
            "start": segment_data.coordinates.start,
            "end": segment_data.coordinates.end,
            "crs": segment_data.coordinates.crs,
        },
        "metrics": {
            "length_m": segment_data.metrics.length_m,
            "start_elevation_m": segment_data.metrics.start_elevation_m,
            "end_elevation_m": segment_data.metrics.end_elevation_m,
            "avg_slope_degrees": segment_data.metrics.avg_slope_degrees,
            "max_slope_degrees": segment_data.metrics.max_slope_degrees,
            "slope_percent": segment_data.metrics.slope_percent,
            "max_slope_percent": segment_data.metrics.max_slope_percent,
            "reward": segment_data.metrics.reward,
            "cumulative_distance_m": segment_data.metrics.cumulative_distance_m,
            "total_reward_cumulative": segment_data.metrics.total_reward_cumulative,
            "distance_to_aoi_boundary_m": segment_data.metrics.distance_to_aoi_boundary_m,
        },
        "properties": {
            "terrain_class": segment_data.properties.terrain_class,
            "land_use": segment_data.properties.land_use,
            "soil_type": segment_data.properties.soil_type,
            "geological_zone": segment_data.properties.geological_zone,
            "raw_properties": segment_data.properties.raw_properties,
        },
        "step": segment_data.step,
        "route_id": segment_data.route_id,
    }
