"""Fallback Response System for agent failures.

This module provides pre-defined and generated fallback responses for use
when agent analysis fails or when running in demo/dev mode.
"""
import logging
from typing import Any, Dict, Optional

from config.settings import Settings


logger = logging.getLogger(__name__)


# Pre-defined fallback responses for key demo segments
# These are manually crafted high-quality responses for important segments
FALLBACK_RESPONSES: Dict[str, Dict[str, Any]] = {
    # Example fallback for a known favorable segment
    "seg_favorable_001": {
        "segment_id": "seg_favorable_001",
        "overall_assessment": "favorable",
        "confidence": "high",
        "executive_summary": (
            "This segment presents favorable conditions for pipeline installation. "
            "Gentle terrain with slopes under 5%, agricultural land use with no "
            "protected area conflicts, and standard trenching construction is suitable."
        ),
        "key_metrics": {
            "length_km": 1.2,
            "avg_slope": 3.5,
            "terrain": "flat",
            "land_use": "agricultural",
            "construction_method": "standard_trenching",
            "estimated_cost": "EUR 950,000",
        },
        "specialist_summaries": {
            "geotechnical": "Favorable terrain with low slope and stable soil conditions.",
            "environmental": "Agricultural land with no protected areas or sensitive habitats nearby.",
            "engineering": "Standard trenching viable, no special crossings required.",
            "cost": "Base costs apply, no significant multipliers.",
        },
        "saipem_compliance": {
            "criteria_met": ["slope_under_20pct", "standard_construction"],
            "criteria_violated": [],
            "compliance_notes": "Meets all SAIPEM routing criteria.",
        },
        "flags": [],
        "recommendations": [
            "Proceed with standard design parameters.",
            "Coordinate with landowners for ROW acquisition.",
        ],
        "conflicts": [],
        "_fallback": True,
        "_fallback_type": "pre_defined",
    },

    # Example fallback for a challenging segment
    "seg_challenging_001": {
        "segment_id": "seg_challenging_001",
        "overall_assessment": "challenging",
        "confidence": "high",
        "executive_summary": (
            "This segment presents significant challenges requiring special attention. "
            "Steep terrain exceeds standard slope limits, proximity to protected areas "
            "requires environmental mitigation, and HDD crossing is needed for the river."
        ),
        "key_metrics": {
            "length_km": 0.8,
            "avg_slope": 18.5,
            "terrain": "mountainous",
            "land_use": "forest",
            "construction_method": "HDD",
            "estimated_cost": "EUR 2,100,000",
        },
        "specialist_summaries": {
            "geotechnical": "Steep slopes require specialized equipment and erosion control.",
            "environmental": "Forest crossing near Natura 2000 site requires EIA and permits.",
            "engineering": "HDD required for river crossing, slope exceeds 15% in sections.",
            "cost": "2.2x terrain multiplier plus HDD crossing adds significant cost.",
        },
        "saipem_compliance": {
            "criteria_met": ["hdd_for_water_crossing"],
            "criteria_violated": ["slope_over_20pct"],
            "compliance_notes": "Slope violation requires design modification or route adjustment.",
        },
        "flags": [
            "steep_slope_violation",
            "protected_area_proximity",
            "hdd_required",
            "elevated_cost",
        ],
        "recommendations": [
            "Consider route realignment to reduce maximum slope.",
            "Engage environmental consultant for EIA preparation.",
            "Obtain HDD crossing permits early in project timeline.",
            "Budget for 2.2x cost multiplier for this section.",
        ],
        "conflicts": [],
        "_fallback": True,
        "_fallback_type": "pre_defined",
    },
}


def get_fallback_response(
    segment_id: str,
    segment_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Get a fallback response for a segment.

    Returns a pre-defined fallback if available, otherwise generates
    a generic fallback based on available segment data.

    Args:
        segment_id: Unique segment identifier
        segment_data: Optional segment data for generating generic fallback

    Returns:
        Dict containing fallback analysis response
    """
    # Check for pre-defined fallback
    if segment_id in FALLBACK_RESPONSES:
        logger.info(f"Using pre-defined fallback for segment {segment_id}")
        return FALLBACK_RESPONSES[segment_id].copy()

    # Generate generic fallback
    logger.info(f"Generating generic fallback for segment {segment_id}")
    return generate_generic_fallback(segment_id, segment_data)


def generate_generic_fallback(
    segment_id: str,
    segment_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate a generic fallback response from segment data.

    Creates a reasonable default response based on available segment
    information, marked with low confidence.

    Args:
        segment_id: Unique segment identifier
        segment_data: Optional segment data dictionary

    Returns:
        Dict containing generic fallback response
    """
    segment_data = segment_data or {}
    metrics = segment_data.get("metrics", {})
    properties = segment_data.get("properties", {})

    # Extract available data
    length_m = metrics.get("length_m", 0)
    length_km = length_m / 1000.0 if length_m else "unknown"
    avg_slope = metrics.get("avg_slope_degrees", 0)
    slope_percent = metrics.get("slope_percent") or metrics.get("max_slope_percent", 0)
    terrain = properties.get("terrain_class", "unknown")
    land_use = properties.get("land_use", "unknown")

    # Determine assessment based on available data
    flags = []
    assessment = "caution"  # Default to caution

    if avg_slope > 15 or slope_percent > 20:
        assessment = "challenging"
        flags.append("steep_slope")
    elif avg_slope < 5 and terrain in ["flat", "gentle", "rolling_hills"]:
        assessment = "favorable"

    # Check for crossings
    if properties.get("water_crossing"):
        flags.append("water_crossing")
    if properties.get("road_crossing"):
        flags.append("road_crossing")

    # Check protected areas
    protected_dist = properties.get("protected_area_distance_m")
    if protected_dist is not None and protected_dist < 500:
        flags.append("protected_area_proximity")
        if assessment == "favorable":
            assessment = "caution"

    return {
        "segment_id": segment_id,
        "overall_assessment": assessment,
        "confidence": "low",
        "executive_summary": (
            f"Generic assessment for segment {segment_id}. "
            f"Detailed analysis unavailable - using fallback response based on available data. "
            f"Slope: {avg_slope}°, Terrain: {terrain}, Land use: {land_use}."
        ),
        "key_metrics": {
            "length_km": length_km,
            "avg_slope": avg_slope,
            "terrain": terrain,
            "land_use": land_use,
            "construction_method": "to_be_determined",
            "estimated_cost": "requires_analysis",
        },
        "specialist_summaries": {
            "geotechnical": "Detailed geotechnical analysis not available.",
            "environmental": "Detailed environmental analysis not available.",
            "engineering": "Detailed engineering analysis not available.",
            "cost": "Cost estimation requires full analysis.",
        },
        "saipem_compliance": {
            "criteria_met": [],
            "criteria_violated": [],
            "compliance_notes": "Compliance check requires full analysis.",
        },
        "flags": flags + ["fallback_response"],
        "recommendations": [
            "Run full analysis for detailed assessment.",
            "Verify data completeness before proceeding.",
        ],
        "conflicts": [],
        "_fallback": True,
        "_fallback_type": "generated",
    }


def should_use_fallback() -> bool:
    """Check if fallback mode should be used.

    Based on DEV_MODE and USE_CACHED_RESPONSES settings.

    Returns:
        True if fallback mode is enabled
    """
    return Settings.DEV_MODE and Settings.USE_CACHED_RESPONSES


def add_predefined_fallback(segment_id: str, response: Dict[str, Any]) -> None:
    """Add a pre-defined fallback response for a segment.

    Useful for caching high-quality responses for demo segments.

    Args:
        segment_id: Unique segment identifier
        response: Pre-defined response to store
    """
    response = response.copy()
    response["segment_id"] = segment_id
    response["_fallback"] = True
    response["_fallback_type"] = "pre_defined"
    FALLBACK_RESPONSES[segment_id] = response
    logger.info(f"Added pre-defined fallback for segment {segment_id}")


def remove_predefined_fallback(segment_id: str) -> bool:
    """Remove a pre-defined fallback response.

    Args:
        segment_id: Unique segment identifier

    Returns:
        True if removed, False if didn't exist
    """
    if segment_id in FALLBACK_RESPONSES:
        del FALLBACK_RESPONSES[segment_id]
        logger.info(f"Removed pre-defined fallback for segment {segment_id}")
        return True
    return False


def list_predefined_fallbacks() -> list:
    """Get list of segment IDs with pre-defined fallbacks.

    Returns:
        List of segment IDs
    """
    return list(FALLBACK_RESPONSES.keys())


def is_fallback_response(response: Dict[str, Any]) -> bool:
    """Check if a response is a fallback.

    Args:
        response: Analysis response dict

    Returns:
        True if response is a fallback
    """
    return response.get("_fallback", False)
