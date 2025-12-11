"""Environmental Agent for environmental compliance assessment.

This agent evaluates environmental impact, protected area proximity, water resources,
habitat protection, and permitting requirements for pipeline routes.
"""
from typing import Any, Dict, Optional

from agents.base import BaseAgent


class EnvironmentalAgent(BaseAgent):
    """Environmental compliance specialist agent.

    Analyzes:
    - Environmental impact assessment requirements
    - Protected area regulations (EU Habitats Directive, Natura 2000, WDPA)
    - Water resource protection
    - Habitat and biodiversity protection
    - Permitting complexity
    """

    @property
    def agent_name(self) -> str:
        """Return the unique name identifier for this agent."""
        return "environmental"

    @property
    def prompt_file(self) -> str:
        """Return the prompt filename."""
        return "environmental.txt"

    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the user message for environmental analysis.

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

        # Extract properties
        properties = segment_data.get("properties", {})
        land_use = properties.get("land_use", "unknown")
        terrain_class = properties.get("terrain_class", "unknown")

        # Environmental-specific properties
        protected_area_distance_m = properties.get("protected_area_distance_m")
        water_body_distance_m = properties.get("water_body_distance_m")
        water_crossing = properties.get("water_crossing", False)
        river_width_m = properties.get("river_width_m")

        # Check raw properties for additional environmental data
        raw_props = properties.get("raw_properties", {})
        wetland_present = raw_props.get("wetland", False) or raw_props.get("wetland_present", False)
        habitat_sensitivity = raw_props.get("habitat_sensitivity", "unknown")
        env_zone = raw_props.get("environmental_zone", raw_props.get("env_zone", "unknown"))

        # Build protected area info string
        if protected_area_distance_m is not None:
            pa_info = f"{protected_area_distance_m:.1f} m"
        else:
            pa_info = "unknown"

        # Build water body info string
        if water_body_distance_m is not None:
            wb_info = f"{water_body_distance_m:.1f} m"
        else:
            wb_info = "unknown"

        # Build the message
        message = f"""Analyze this pipeline segment for environmental compliance:

SEGMENT INFORMATION:
- Segment ID: {segment_id}
- Length: {length_m:.2f} m
- Coordinate System: {crs}
- Start Coordinates: ({start_coords[0]:.2f}, {start_coords[1]:.2f})
- End Coordinates: ({end_coords[0]:.2f}, {end_coords[1]:.2f})

LAND USE & TERRAIN:
- Land Use Classification: {land_use}
- Terrain Class: {terrain_class}

ENVIRONMENTAL DATA:
- Distance to Protected Area: {pa_info}
- Distance to Water Body: {wb_info}
- Water Crossing Required: {"Yes" if water_crossing else "No"}
- River Width (if crossing): {f"{river_width_m:.1f} m" if river_width_m else "N/A"}
- Wetland Present: {"Yes" if wetland_present else "No/Unknown"}
- Habitat Sensitivity: {habitat_sensitivity}
- Environmental Zone: {env_zone}

Provide your environmental compliance assessment as a JSON object following the specified output format.
Include the permits_likely field listing permits that may be required.
"""
        return message
