"""Routes Endpoint for route listing and details.

This module provides endpoints for listing available routes
and retrieving route metadata and segment information.
"""
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from data.route_loader import load_route, get_route_ids, RouteNotFoundError
from data.segment_extractor import (
    get_all_segment_ids,
    get_route_metadata,
    extract_segment_data,
    get_full_route_geometry,
    get_route_crs,
    transform_coords_to_wgs84,
)


logger = logging.getLogger(__name__)

router = APIRouter()


class RouteListItem(BaseModel):
    """Model for route list item."""
    route_id: str
    segment_count: Optional[int] = None
    # Enhanced metadata from sidecar files
    generation_method: Optional[str] = None
    is_real_route: Optional[bool] = False
    constraint_compliant: Optional[bool] = None
    total_length_m: Optional[float] = None
    cost_per_km: Optional[float] = None


class RouteDetail(BaseModel):
    """Model for route detail response."""
    route_id: str
    segment_count: int
    metadata: dict
    bounds: Optional[dict] = None


class SegmentListItem(BaseModel):
    """Model for segment list item."""
    segment_id: str
    length_m: Optional[float] = None
    start_coord: Optional[tuple] = None
    end_coord: Optional[tuple] = None


def load_sidecar_metadata(route_id: str, project: Optional[str] = None) -> Optional[dict]:
    """Load metadata from sidecar JSON file if it exists."""
    import json
    from pathlib import Path

    if project:
        base_path = Path(f"/opt/agrs/Projects/{project}/PIRL/outputs")
    else:
        base_path = Path("/opt/agrs/agentic_framework/data/routes")

    # Try with .geojson suffix
    route_filename = route_id if route_id.endswith('.geojson') else f"{route_id}.geojson"
    sidecar_path = base_path / route_filename.replace('.geojson', '.metadata.json')

    if sidecar_path.exists():
        try:
            with open(sidecar_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Error reading sidecar {sidecar_path}: {e}")
    return None


@router.get("/routes", response_model=List[RouteListItem])
async def list_routes(project: Optional[str] = None) -> List[RouteListItem]:
    """List all available routes.

    Args:
        project: Optional project name. If provided, routes are loaded from
                 /opt/agrs/Projects/{project}/PIRL/outputs/

    Returns:
        List of route IDs with optional segment counts and metadata
    """
    route_ids = get_route_ids(project)
    logger.info(f"Listing {len(route_ids)} routes for project={project}")

    results = []
    for route_id in route_ids:
        try:
            segment_ids = get_all_segment_ids(route_id, project)

            # Load sidecar metadata if available
            sidecar = load_sidecar_metadata(route_id, project)

            item = RouteListItem(
                route_id=route_id,
                segment_count=len(segment_ids)
            )

            if sidecar:
                gen_method = sidecar.get('generation_method', {})
                item.generation_method = gen_method.get('method')
                item.is_real_route = gen_method.get('is_real_route', False)

                compliance = sidecar.get('constraint_compliance', {})
                item.constraint_compliant = compliance.get('overall_compliant')

                route_info = sidecar.get('route_info', {})
                item.total_length_m = route_info.get('length_m')

                cost_breakdown = sidecar.get('cost_breakdown', {})
                item.cost_per_km = cost_breakdown.get('cost_per_km')

            results.append(item)
        except Exception as e:
            logger.warning(f"Failed to get segment count for route {route_id}: {e}")
            results.append(RouteListItem(route_id=route_id))

    return results


@router.get("/routes/{route_id}", response_model=RouteDetail)
async def get_route_detail(route_id: str, project: Optional[str] = None) -> RouteDetail:
    """Get detailed information about a route.

    Args:
        route_id: Route identifier
        project: Optional project name for project-specific routes

    Returns:
        RouteDetail with segment count, metadata, and bounds

    Raises:
        HTTPException: 404 if route not found
    """
    try:
        load_route(route_id, project)  # Validate route exists
    except RouteNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' not found"
        )

    # Get segment IDs
    segment_ids = get_all_segment_ids(route_id, project)

    # Get route metadata
    metadata = get_route_metadata(route_id, project)

    # Calculate bounds from geometry
    bounds = None
    try:
        geometry = get_full_route_geometry(route_id, project)
        if geometry:
            x_coords = [p[0] for p in geometry]
            y_coords = [p[1] for p in geometry]
            bounds = {
                "min_x": min(x_coords),
                "min_y": min(y_coords),
                "max_x": max(x_coords),
                "max_y": max(y_coords),
            }
    except Exception as e:
        logger.warning(f"Failed to calculate bounds for route {route_id}: {e}")

    return RouteDetail(
        route_id=route_id,
        segment_count=len(segment_ids),
        metadata=metadata,
        bounds=bounds,
    )


@router.get("/routes/{route_id}/segments", response_model=List[SegmentListItem])
async def list_route_segments(
    route_id: str,
    limit: Optional[int] = None,
    offset: int = 0,
    project: Optional[str] = None
) -> List[SegmentListItem]:
    """List segments in a route with basic info.

    Args:
        route_id: Route identifier
        limit: Maximum number of segments to return
        offset: Number of segments to skip
        project: Optional project name for project-specific routes

    Returns:
        List of segment IDs with basic information

    Raises:
        HTTPException: 404 if route not found
    """
    try:
        load_route(route_id, project)
    except RouteNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' not found"
        )

    # Get all segment IDs
    segment_ids = get_all_segment_ids(route_id, project)

    # Apply pagination
    if offset > 0:
        segment_ids = segment_ids[offset:]
    if limit is not None:
        segment_ids = segment_ids[:limit]

    # Build response with basic info for each segment
    results = []
    for segment_id in segment_ids:
        try:
            segment_data = extract_segment_data(route_id, segment_id, project)
            if segment_data:
                results.append(SegmentListItem(
                    segment_id=segment_id,
                    length_m=segment_data.metrics.length_m,
                    start_coord=segment_data.coordinates.start,
                    end_coord=segment_data.coordinates.end,
                ))
            else:
                results.append(SegmentListItem(segment_id=segment_id))
        except Exception as e:
            logger.warning(f"Failed to get data for segment {segment_id}: {e}")
            results.append(SegmentListItem(segment_id=segment_id))

    return results


# NOTE: segments/geometry must come BEFORE segments/{segment_id} for proper route matching
@router.get("/routes/{route_id}/segments/geometry")
async def get_segments_geometry(route_id: str, project: Optional[str] = None) -> dict:
    """Get route segments as a GeoJSON FeatureCollection.

    Each segment is returned as a Feature with properties including
    segment_id, route_id, and basic metrics for map display.

    Args:
        route_id: Route identifier
        project: Optional project name for project-specific routes

    Returns:
        GeoJSON FeatureCollection with segment features

    Raises:
        HTTPException: 404 if route not found
    """
    try:
        route_data = load_route(route_id, project)
    except RouteNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' not found"
        )

    # Get CRS for coordinate transformation
    src_crs = get_route_crs(route_data)
    segment_ids = get_all_segment_ids(route_id, project)
    features = []

    for segment_id in segment_ids:
        try:
            segment_data = extract_segment_data(route_id, segment_id, project)
            if segment_data and segment_data.coordinates.start and segment_data.coordinates.end:
                # Transform coordinates to WGS84 for map display
                coords_raw = [
                    segment_data.coordinates.start,
                    segment_data.coordinates.end
                ]
                coords_wgs84 = transform_coords_to_wgs84(coords_raw, src_crs)

                feature = {
                    "type": "Feature",
                    "properties": {
                        "segment_id": segment_id,
                        "route_id": route_id,
                        "length_m": segment_data.metrics.length_m,
                        "avg_slope_percent": segment_data.metrics.slope_percent,
                        "terrain_class": segment_data.properties.terrain_class,
                        "land_use": segment_data.properties.land_use,
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [list(c) for c in coords_wgs84]
                    }
                }
                features.append(feature)
        except Exception as e:
            logger.warning(f"Failed to build geometry for segment {segment_id}: {e}")

    # Fallback: if no segments found, return full route geometry as single feature
    if not features:
        full_geometry = get_full_route_geometry(route_id, project)
        if full_geometry:
            # Transform to WGS84
            coords_wgs84 = transform_coords_to_wgs84(full_geometry, src_crs)

            # Get metadata for properties
            metadata = get_route_metadata(route_id, project)

            feature = {
                "type": "Feature",
                "properties": {
                    "segment_id": "0",
                    "route_id": route_id,
                    "name": metadata.get("name", route_id),
                    "algorithm": metadata.get("algorithm", "unknown"),
                    "length_m": metadata.get("total_length_m"),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [list(c) for c in coords_wgs84]
                }
            }
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.get("/routes/{route_id}/segments/{segment_id}")
async def get_segment_detail(route_id: str, segment_id: str, project: Optional[str] = None) -> dict:
    """Get detailed information about a specific segment.

    Args:
        route_id: Route identifier
        segment_id: Segment identifier
        project: Optional project name for project-specific routes

    Returns:
        Full segment data as dict

    Raises:
        HTTPException: 404 if route or segment not found
    """
    try:
        load_route(route_id, project)
    except RouteNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' not found"
        )

    segment_data = extract_segment_data(route_id, segment_id, project)
    if segment_data is None:
        raise HTTPException(
            status_code=404,
            detail=f"Segment '{segment_id}' not found in route '{route_id}'"
        )

    return {
        "segment_id": segment_data.id,
        "route_id": route_id,
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
        },
        "properties": {
            "terrain_class": segment_data.properties.terrain_class,
            "land_use": segment_data.properties.land_use,
            "soil_type": segment_data.properties.soil_type,
            "geological_zone": segment_data.properties.geological_zone,
        },
        "step": segment_data.step,
    }


@router.get("/routes/{route_id}/geometry")
async def get_route_geometry(route_id: str, project: Optional[str] = None) -> dict:
    """Get the full route geometry as GeoJSON.

    Args:
        route_id: Route identifier
        project: Optional project name for project-specific routes

    Returns:
        GeoJSON geometry object with coordinates transformed to WGS84

    Raises:
        HTTPException: 404 if route not found
    """
    try:
        route_data = load_route(route_id, project)
    except RouteNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Route '{route_id}' not found"
        )

    # Get full route geometry
    geometry = get_full_route_geometry(route_id, project)

    if geometry is None:
        return {
            "type": "FeatureCollection",
            "features": route_data.get("features", []),
        }

    # Transform coordinates to WGS84 for map display
    crs = get_route_crs(route_data)
    if crs and crs != "EPSG:4326":
        geometry = transform_coords_to_wgs84(geometry, crs)

    return {
        "type": "Feature",
        "properties": get_route_metadata(route_id, project),
        "geometry": {
            "type": "LineString",
            "coordinates": geometry,
        },
        "crs": "EPSG:4326"  # Always return WGS84 for map display
    }
