"""Master Synthesis Agent for integrated route assessment.

This agent synthesizes findings from all specialist agents into a coherent
executive summary for technical decision-makers.
"""
import json
from typing import Any, Dict, List, Optional

from agents.base import BaseAgent
from config.settings import Settings
from models.segment import slope_degrees_to_percent


class MasterAgent(BaseAgent):
    """Master synthesis agent for comprehensive segment assessment.

    Synthesizes analyses from:
    - Geotechnical Agent
    - Environmental Agent
    - Engineering Agent
    - Cost Agent

    Produces executive summaries with:
    - Integrated assessment
    - Key metrics from all domains
    - Prioritized flags and recommendations
    - Conflict identification and resolution
    """

    @property
    def agent_name(self) -> str:
        """Return the unique name identifier for this agent."""
        return "master"

    @property
    def prompt_file(self) -> str:
        """Return the prompt filename."""
        return "master.txt"

    @property
    def model(self) -> str:
        """Return the model to use for synthesis.

        Uses the more capable master model for synthesis quality.
        """
        return Settings.ANTHROPIC_MODEL_MASTER

    def synthesize(
        self,
        segment_data: Dict[str, Any],
        all_agent_responses: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Synthesize all specialist analyses into comprehensive assessment.

        This is the primary entry point for the master agent, renamed from
        analyze() for semantic clarity.

        Args:
            segment_data: Dictionary containing segment information
            all_agent_responses: Dict mapping agent names to their responses

        Returns:
            Dict containing comprehensive synthesis
        """
        return self.analyze(segment_data, context=all_agent_responses)

    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the user message for synthesis.

        Args:
            segment_data: Dictionary containing segment information
            context: Dict mapping agent names to their responses

        Returns:
            Formatted user message for the API call
        """
        all_agent_responses = context or {}

        # Extract segment overview
        segment_id = segment_data.get("id", "unknown")

        coordinates = segment_data.get("coordinates", {})
        start_coords = coordinates.get("start", (0, 0))
        end_coords = coordinates.get("end", (0, 0))
        crs = coordinates.get("crs", "unknown")

        metrics = segment_data.get("metrics", {})
        length_m = metrics.get("length_m", 0)
        length_km = length_m / 1000.0

        avg_slope_degrees = metrics.get("avg_slope_degrees", 0)
        slope_percent = metrics.get("slope_percent") or metrics.get("max_slope_percent")

        if slope_percent and not avg_slope_degrees:
            from models.segment import slope_percent_to_degrees
            avg_slope_degrees = slope_percent_to_degrees(slope_percent)

        if avg_slope_degrees and not slope_percent:
            slope_percent = slope_degrees_to_percent(avg_slope_degrees)

        properties = segment_data.get("properties", {})
        terrain_class = properties.get("terrain_class", "unknown")
        land_use = properties.get("land_use", "unknown")

        # Format specialist responses
        geo_response = self._format_full_response(
            all_agent_responses.get("geotechnical", {}),
            "Geotechnical"
        )
        env_response = self._format_full_response(
            all_agent_responses.get("environmental", {}),
            "Environmental"
        )
        eng_response = self._format_full_response(
            all_agent_responses.get("engineering", {}),
            "Engineering"
        )
        cost_response = self._format_full_response(
            all_agent_responses.get("cost", {}),
            "Cost"
        )

        # Build the message
        message = f"""Synthesize the following specialist analyses into a comprehensive segment assessment:

=== SEGMENT OVERVIEW ===
Segment ID: {segment_id}
Length: {length_m:.2f} m ({length_km:.3f} km)
Coordinates: ({start_coords[0]:.2f}, {start_coords[1]:.2f}) to ({end_coords[0]:.2f}, {end_coords[1]:.2f})
CRS: {crs}
Slope: {avg_slope_degrees:.2f}° ({slope_percent:.2f}%)
Terrain: {terrain_class}
Land Use: {land_use}

=== SPECIALIST ANALYSES ===

{geo_response}

{env_response}

{eng_response}

{cost_response}

=== INSTRUCTIONS ===
Synthesize the above analyses into a comprehensive assessment.
Include SAIPEM optimization criteria compliance status.
Prioritize flags by severity.
Identify any conflicts between specialists and suggest resolution.
Provide actionable recommendations.

Respond with a JSON object following the specified output format.
"""
        return message

    def _format_full_response(
        self,
        agent_response: Dict[str, Any],
        agent_name: str
    ) -> str:
        """Format an agent's full response for inclusion in synthesis.

        Args:
            agent_response: Complete response from the specialist agent
            agent_name: Name of the agent for labeling

        Returns:
            Formatted string representation of the agent's response
        """
        if not agent_response:
            return f"--- {agent_name} Analysis ---\nNo analysis available."

        # Format as pretty JSON for clarity
        try:
            formatted_json = json.dumps(agent_response, indent=2, default=str)
        except (TypeError, ValueError):
            formatted_json = str(agent_response)

        return f"--- {agent_name} Analysis ---\n{formatted_json}"

    def _validate_synthesis(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and complete synthesis response structure.

        Ensures all required fields are present with sensible defaults.

        Args:
            response: Parsed response from the API

        Returns:
            Validated response with any missing fields added
        """
        # Required top-level fields
        defaults = {
            "segment_id": response.get("segment_id", "unknown"),
            "overall_assessment": response.get("overall_assessment", "caution"),
            "confidence": response.get("confidence", "medium"),
            "executive_summary": response.get(
                "executive_summary",
                "Assessment synthesized from specialist analyses."
            ),
            "key_metrics": response.get("key_metrics", {}),
            "specialist_summaries": response.get("specialist_summaries", {}),
            "saipem_compliance": response.get("saipem_compliance", {
                "criteria_met": [],
                "criteria_violated": [],
                "compliance_notes": "Compliance status not fully determined."
            }),
            "flags": response.get("flags", []),
            "recommendations": response.get("recommendations", []),
            "conflicts": response.get("conflicts", [])
        }

        # Ensure specialist_summaries has all four agents
        specialist_defaults = {
            "geotechnical": "Assessment pending.",
            "environmental": "Assessment pending.",
            "engineering": "Assessment pending.",
            "cost": "Assessment pending."
        }

        for agent, default_summary in specialist_defaults.items():
            if agent not in defaults["specialist_summaries"]:
                defaults["specialist_summaries"][agent] = default_summary

        # Merge with response, keeping response values where present
        for key, default_value in defaults.items():
            if key not in response or response[key] is None:
                response[key] = default_value

        return response

    def analyze(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyze and synthesize segment data with specialist responses.

        Extends base analyze to add validation.

        Args:
            segment_data: Dictionary containing segment information
            context: Dict mapping agent names to their responses

        Returns:
            Dict containing validated synthesis response
        """
        result = super().analyze(segment_data, context)
        return self._validate_synthesis(result)
