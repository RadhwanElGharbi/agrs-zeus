"""Segment data enrichment using geospatial layers."""
import logging
from typing import Dict, Any, Optional, Tuple, List

from models.segment import SegmentData, SegmentProperties
from .segment_extractor import extract_segment_data
from .layer_manager import (
    LayerType,
    query_all_layers_at_point,
    query_all_layers_for_segment,
    get_available_layers,
)
from .raster_query import get_landcover_class

logger = logging.getLogger(__name__)


# Slope classification thresholds (degrees)
SLOPE_THRESHOLDS = {
    "flat": 2.0,
    "gentle": 5.0,
    "moderate": 10.0,
    "steep": 15.0,
    "very_steep": 25.0,
}


# Terrain difficulty factors
TERRAIN_DIFFICULTY = {
    "flat": 1.0,
    "rolling_hills": 1.2,
    "hilly": 1.5,
    "mountainous": 2.0,
    "unknown": 1.3,
}


def get_slope_category(slope_degrees: float) -> str:
    """Classify slope into categories.

    Args:
        slope_degrees: Slope in degrees

    Returns:
        Slope category string
    """
    if slope_degrees <= SLOPE_THRESHOLDS["flat"]:
        return "flat"
    elif slope_degrees <= SLOPE_THRESHOLDS["gentle"]:
        return "gentle"
    elif slope_degrees <= SLOPE_THRESHOLDS["moderate"]:
        return "moderate"
    elif slope_degrees <= SLOPE_THRESHOLDS["steep"]:
        return "steep"
    elif slope_degrees <= SLOPE_THRESHOLDS["very_steep"]:
        return "very_steep"
    else:
        return "extreme"


def get_terrain_class(slope: float, roughness: Optional[float] = None) -> str:
    """Classify terrain based on slope and optional roughness.

    Args:
        slope: Average slope in degrees
        roughness: Optional terrain roughness value (0-1)

    Returns:
        Terrain classification string
    """
    # Base classification on slope
    if slope <= 2.0:
        terrain = "flat"
    elif slope <= 5.0:
        terrain = "rolling_hills"
    elif slope <= 12.0:
        terrain = "hilly"
    else:
        terrain = "mountainous"

    # Adjust for roughness if available
    if roughness is not None and roughness > 0.7:
        # Upgrade difficulty one level for rough terrain
        upgrade_map = {
            "flat": "rolling_hills",
            "rolling_hills": "hilly",
            "hilly": "mountainous",
            "mountainous": "mountainous",
        }
        terrain = upgrade_map.get(terrain, terrain)

    return terrain


def get_construction_difficulty(segment_data: SegmentData) -> str:
    """Estimate construction difficulty based on segment data.

    Args:
        segment_data: The segment data to analyze

    Returns:
        Difficulty classification: 'easy', 'moderate', 'difficult', 'very_difficult'
    """
    difficulty_score = 0.0

    # Slope factor
    avg_slope = segment_data.metrics.avg_slope_degrees
    if avg_slope > 20:
        difficulty_score += 3.0
    elif avg_slope > 12:
        difficulty_score += 2.0
    elif avg_slope > 5:
        difficulty_score += 1.0

    # Max slope factor (sudden steep sections)
    max_slope = segment_data.metrics.max_slope_degrees
    if max_slope > 25:
        difficulty_score += 2.0
    elif max_slope > 15:
        difficulty_score += 1.0

    # Terrain class factor
    terrain_factor = TERRAIN_DIFFICULTY.get(
        segment_data.properties.terrain_class.lower(), 1.3
    )
    difficulty_score += (terrain_factor - 1.0) * 2

    # Land use factor
    land_use = segment_data.properties.land_use.lower()
    if "urban" in land_use or "residential" in land_use:
        difficulty_score += 2.0
    elif "industrial" in land_use:
        difficulty_score += 1.5
    elif "forest" in land_use:
        difficulty_score += 1.0

    # Classify
    if difficulty_score < 1.5:
        return "easy"
    elif difficulty_score < 3.0:
        return "moderate"
    elif difficulty_score < 5.0:
        return "difficult"
    else:
        return "very_difficult"


def enrich_segment_data(
    segment_data: SegmentData,
    include_layer_stats: bool = True
) -> Dict[str, Any]:
    """Enrich segment data with additional computed and layer data.

    Args:
        segment_data: The base segment data to enrich
        include_layer_stats: Whether to include layer statistics

    Returns:
        Dict containing enriched segment data with additional fields
    """
    # Start with base segment data as dict
    enriched = segment_data.model_dump()

    # Add derived fields
    enriched["derived"] = {
        "elevation_change": segment_data.get_elevation_change(),
        "midpoint": segment_data.get_midpoint(),
        "slope_category": get_slope_category(segment_data.metrics.avg_slope_degrees),
        "terrain_class_computed": get_terrain_class(
            segment_data.metrics.avg_slope_degrees
        ),
        "construction_difficulty": get_construction_difficulty(segment_data),
    }

    # Query layers if available
    if include_layer_stats:
        available_layers = get_available_layers()

        if available_layers:
            # Get segment coordinates for line queries
            start = segment_data.coordinates.start
            end = segment_data.coordinates.end
            coords = [start, end]

            # Query layers along segment
            layer_stats = query_all_layers_for_segment(coords)
            enriched["layer_data"] = layer_stats

            # Query at midpoint for point values
            midpoint = segment_data.get_midpoint()
            point_values = query_all_layers_at_point(midpoint[0], midpoint[1])
            enriched["layer_point_values"] = point_values

            # Add interpreted values
            if point_values.get(LayerType.landcover.value) is not None:
                landcover_code = int(point_values[LayerType.landcover.value])
                enriched["derived"]["landcover_class"] = get_landcover_class(
                    landcover_code
                )
        else:
            enriched["layer_data"] = None
            enriched["layer_point_values"] = None

    return enriched


def enrich_from_route(
    route_id: str,
    segment_id: str,
    include_layer_stats: bool = True
) -> Optional[Dict[str, Any]]:
    """Extract and enrich segment data from a route.

    Convenience function combining extraction and enrichment.

    Args:
        route_id: The route identifier
        segment_id: The segment identifier
        include_layer_stats: Whether to include layer statistics

    Returns:
        Enriched segment data dict, or None if segment not found
    """
    segment_data = extract_segment_data(route_id, segment_id)

    if segment_data is None:
        return None

    return enrich_segment_data(segment_data, include_layer_stats)


def get_segment_summary(segment_data: SegmentData) -> Dict[str, Any]:
    """Generate a concise summary of segment characteristics.

    Args:
        segment_data: The segment data to summarize

    Returns:
        Dict with summary information suitable for agent input
    """
    return {
        "id": segment_data.id,
        "length_km": segment_data.metrics.length_m / 1000.0,
        "elevation_change_m": segment_data.get_elevation_change(),
        "avg_slope_deg": segment_data.metrics.avg_slope_degrees,
        "max_slope_deg": segment_data.metrics.max_slope_degrees,
        "terrain": segment_data.properties.terrain_class,
        "land_use": segment_data.properties.land_use,
        "soil_type": segment_data.properties.soil_type,
        "slope_category": get_slope_category(segment_data.metrics.avg_slope_degrees),
        "construction_difficulty": get_construction_difficulty(segment_data),
        "start_coords": segment_data.coordinates.start,
        "end_coords": segment_data.coordinates.end,
    }
