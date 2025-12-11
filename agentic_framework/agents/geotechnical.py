"""Geotechnical Agent for terrain and slope analysis.

This agent analyzes terrain, slope stability, soil mechanics, geological hazards,
and earthwork requirements for pipeline construction feasibility.
"""
import json
from typing import Any, Dict, Optional

from agents.base import BaseAgent
from models.segment import slope_degrees_to_percent


class GeotechnicalAgent(BaseAgent):
    """Geotechnical specialist agent for terrain analysis.

    Analyzes:
    - Terrain classification and slope conditions
    - Soil stability and bearing capacity
    - Geological hazards (landslide zones, seismic risks)
    - Earthwork requirements
    """

    @property
    def agent_name(self) -> str:
        """Return the unique name identifier for this agent."""
        return "geotechnical"

    @property
    def prompt_file(self) -> str:
        """Return the prompt filename."""
        return "geotechnical.txt"

    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the user message for geotechnical analysis.

        Args:
            segment_data: Dictionary containing segment information
            context: Optional additional context (not used for this agent)

        Returns:
            Formatted user message for the API call
        """
        # Extract segment ID
        segment_id = segment_data.get("id", "unknown")

        # Extract coordinates
        coordinates = segment_data.get("coordinates", {})
        start_coords = coordinates.get("start", (0, 0))
        end_coords = coordinates.get("end", (0, 0))
        crs = coordinates.get("crs", "unknown")

        # Extract metrics
        metrics = segment_data.get("metrics", {})
        length_m = metrics.get("length_m", 0)
        start_elevation = metrics.get("start_elevation_m", 0)
        end_elevation = metrics.get("end_elevation_m", 0)
        elevation_change = end_elevation - start_elevation

        # Get slope values - check both degrees and percent
        avg_slope_degrees = metrics.get("avg_slope_degrees", 0)
        max_slope_degrees = metrics.get("max_slope_degrees", 0)
        slope_percent = metrics.get("slope_percent") or metrics.get("max_slope_percent")

        # If we have percent but not degrees, convert
        if slope_percent and not avg_slope_degrees:
            from models.segment import slope_percent_to_degrees
            avg_slope_degrees = slope_percent_to_degrees(slope_percent)

        # If we have degrees but not percent, convert
        if avg_slope_degrees and not slope_percent:
            slope_percent = slope_degrees_to_percent(avg_slope_degrees)

        # Ensure we have max slope percent for display
        max_slope_percent = metrics.get("max_slope_percent")
        if max_slope_degrees and not max_slope_percent:
            max_slope_percent = slope_degrees_to_percent(max_slope_degrees)

        # Extract properties
        properties = segment_data.get("properties", {})
        terrain_class = properties.get("terrain_class", "unknown")
        soil_type = properties.get("soil_type", "unknown")
        geological_zone = properties.get("geological_zone", "unknown")

        # Build the message
        message = f"""Analyze this pipeline segment for geotechnical feasibility:

SEGMENT INFORMATION:
- Segment ID: {segment_id}
- Length: {length_m:.2f} m
- Coordinate System: {crs}
- Start Coordinates: ({start_coords[0]:.2f}, {start_coords[1]:.2f})
- End Coordinates: ({end_coords[0]:.2f}, {end_coords[1]:.2f})

ELEVATION DATA:
- Start Elevation: {start_elevation:.2f} m
- End Elevation: {end_elevation:.2f} m
- Elevation Change: {elevation_change:.2f} m

SLOPE DATA:
- Average Slope: {avg_slope_degrees:.2f} degrees ({slope_percent:.2f}% grade)
- Maximum Slope: {max_slope_degrees:.2f} degrees ({max_slope_percent:.2f}% grade if available)

TERRAIN PROPERTIES:
- Terrain Class: {terrain_class}
- Soil Type: {soil_type}
- Geological Zone: {geological_zone}

Provide your geotechnical assessment as a JSON object following the specified output format.
"""
        return message
