"""Engineering Agent for pipeline construction feasibility.

This agent assesses construction methods, geometric constraints, crossings,
access planning, and technical specifications for pipeline installation.
"""
import math
from typing import Any, Dict, Optional

from agents.base import BaseAgent
from models.segment import slope_degrees_to_percent


class EngineeringAgent(BaseAgent):
    """Pipeline engineering specialist agent.

    Analyzes:
    - Construction methods (trenching, HDD, boring, open-cut)
    - Geometric constraints and bend radius requirements
    - Infrastructure crossings (roads, railways, rivers, utilities)
    - Construction access planning
    - Pipeline specifications compliance
    """

    @property
    def agent_name(self) -> str:
        """Return the unique name identifier for this agent."""
        return "engineering"

    @property
    def prompt_file(self) -> str:
        """Return the prompt filename."""
        return "engineering.txt"

    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the user message for engineering analysis.

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

        # Calculate bearing
        dx = end_coords[0] - start_coords[0]
        dy = end_coords[1] - start_coords[1]
        bearing = (math.degrees(math.atan2(dx, dy)) + 360) % 360

        # Extract metrics
        metrics = segment_data.get("metrics", {})
        length_m = metrics.get("length_m", 0)
        start_elevation = metrics.get("start_elevation_m", 0)
        end_elevation = metrics.get("end_elevation_m", 0)

        # Get slope values
        avg_slope_degrees = metrics.get("avg_slope_degrees", 0)
        max_slope_degrees = metrics.get("max_slope_degrees", 0)
        slope_percent = metrics.get("slope_percent") or metrics.get("max_slope_percent")

        # Convert as needed
        if slope_percent and not avg_slope_degrees:
            from models.segment import slope_percent_to_degrees
            avg_slope_degrees = slope_percent_to_degrees(slope_percent)

        if avg_slope_degrees and not slope_percent:
            slope_percent = slope_degrees_to_percent(avg_slope_degrees)

        max_slope_percent = metrics.get("max_slope_percent")
        if max_slope_degrees and not max_slope_percent:
            max_slope_percent = slope_degrees_to_percent(max_slope_degrees)

        # Extract properties
        properties = segment_data.get("properties", {})
        terrain_class = properties.get("terrain_class", "unknown")

        # Crossing information
        road_crossing = properties.get("road_crossing", False)
        water_crossing = properties.get("water_crossing", False)
        river_width_m = properties.get("river_width_m")

        # Check raw properties for additional crossing data
        raw_props = properties.get("raw_properties", {})
        railway_crossing = raw_props.get("railway_crossing", False)
        utility_crossing = raw_props.get("utility_crossing", False)
        pipeline_proximity = raw_props.get("pipeline_proximity", False)
        pipeline_distance_m = raw_props.get("pipeline_distance_m")
        road_type = raw_props.get("road_type", "unknown")
        crossing_angle = raw_props.get("crossing_angle")

        # Access information
        access_points = raw_props.get("access_points", [])
        existing_row = raw_props.get("existing_row", False)

        # Build crossings list
        crossings_info = []
        if road_crossing:
            crossing_str = f"- Road crossing: {road_type}"
            if crossing_angle:
                crossing_str += f" at {crossing_angle}°"
            crossings_info.append(crossing_str)

        if railway_crossing:
            crossing_str = "- Railway crossing (HDD required)"
            if crossing_angle:
                crossing_str += f" at {crossing_angle}°"
            crossings_info.append(crossing_str)

        if water_crossing:
            crossing_str = "- Water crossing"
            if river_width_m:
                crossing_str += f": river width {river_width_m:.1f} m"
            crossings_info.append(crossing_str)

        if utility_crossing:
            crossings_info.append("- Utility crossing")

        if pipeline_proximity:
            crossing_str = "- Existing pipeline proximity"
            if pipeline_distance_m:
                crossing_str += f": {pipeline_distance_m:.1f} m"
            crossings_info.append(crossing_str)

        crossings_text = "\n".join(crossings_info) if crossings_info else "No crossings identified"

        # Build the message
        message = f"""Analyze this pipeline segment for construction engineering feasibility:

SEGMENT INFORMATION:
- Segment ID: {segment_id}
- Length: {length_m:.2f} m
- Coordinate System: {crs}
- Start Coordinates: ({start_coords[0]:.2f}, {start_coords[1]:.2f})
- End Coordinates: ({end_coords[0]:.2f}, {end_coords[1]:.2f})

GEOMETRIC DATA:
- Bearing: {bearing:.1f}°
- Start Elevation: {start_elevation:.2f} m
- End Elevation: {end_elevation:.2f} m

SLOPE DATA:
- Average Slope: {avg_slope_degrees:.2f}° ({slope_percent:.2f}%)
- Maximum Slope: {max_slope_degrees:.2f}° ({max_slope_percent:.2f}% if available)
- Maximum Allowable: 20% (11.3°)

TERRAIN:
- Terrain Class: {terrain_class}

CROSSINGS IDENTIFIED:
{crossings_text}

ACCESS & ROW:
- Existing Right-of-Way: {"Yes" if existing_row else "No/Unknown"}
- Access Points: {len(access_points) if access_points else "Unknown"}

Provide your engineering assessment as a JSON object following the specified output format.
Include the construction_method recommendation and crossings array.
"""
        return message
