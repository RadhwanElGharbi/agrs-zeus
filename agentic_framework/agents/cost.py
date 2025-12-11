"""Cost Agent for pipeline construction cost estimation.

This agent estimates construction costs based on terrain factors, crossing
requirements, and analyses from other specialist agents.
"""
import json
from typing import Any, Dict, Optional

from agents.base import BaseAgent
from models.segment import slope_degrees_to_percent


class CostAgent(BaseAgent):
    """Cost estimation specialist agent.

    Analyzes:
    - Pipeline construction cost estimation
    - Terrain-based cost factors and multipliers
    - Crossing cost impacts
    - Value engineering and optimization opportunities
    - Construction method cost implications

    Note: This agent requires context from other specialists to provide
    accurate cost estimates.
    """

    @property
    def agent_name(self) -> str:
        """Return the unique name identifier for this agent."""
        return "cost"

    @property
    def prompt_file(self) -> str:
        """Return the prompt filename."""
        return "cost.txt"

    def analyze(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyze segment for cost estimation.

        Overrides base analyze to require context from other agents.

        Args:
            segment_data: Dictionary containing segment information
            context: Required context from other specialist agents

        Returns:
            Dict containing cost analysis

        Note:
            While context is recommended for accurate estimates, the agent
            will still function without it (with lower confidence).
        """
        if context is None:
            context = {}

        return super().analyze(segment_data, context)

    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the user message for cost analysis.

        Args:
            segment_data: Dictionary containing segment information
            context: Context from other specialist agents

        Returns:
            Formatted user message for the API call
        """
        context = context or {}

        # Extract segment ID
        segment_id = segment_data.get("id", "unknown")

        # Extract metrics
        metrics = segment_data.get("metrics", {})
        length_m = metrics.get("length_m", 0)
        length_km = length_m / 1000.0

        # Get slope values
        avg_slope_degrees = metrics.get("avg_slope_degrees", 0)
        max_slope_degrees = metrics.get("max_slope_degrees", 0)
        slope_percent = metrics.get("slope_percent") or metrics.get("max_slope_percent")

        if slope_percent and not avg_slope_degrees:
            from models.segment import slope_percent_to_degrees
            avg_slope_degrees = slope_percent_to_degrees(slope_percent)

        if avg_slope_degrees and not slope_percent:
            slope_percent = slope_degrees_to_percent(avg_slope_degrees)

        # Extract properties
        properties = segment_data.get("properties", {})
        terrain_class = properties.get("terrain_class", "unknown")
        land_use = properties.get("land_use", "unknown")

        # Format specialist context
        geo_context = self._format_agent_context(context.get("geotechnical", {}), "Geotechnical")
        env_context = self._format_agent_context(context.get("environmental", {}), "Environmental")
        eng_context = self._format_agent_context(context.get("engineering", {}), "Engineering")

        # Build the message
        message = f"""Estimate construction costs for this pipeline segment:

SEGMENT INFORMATION:
- Segment ID: {segment_id}
- Length: {length_m:.2f} m ({length_km:.3f} km)

TERRAIN DATA:
- Terrain Class: {terrain_class}
- Land Use: {land_use}
- Average Slope: {avg_slope_degrees:.2f}° ({slope_percent:.2f}%)
- Maximum Slope: {max_slope_degrees:.2f}°

=== SPECIALIST ANALYSES ===

{geo_context}

{env_context}

{eng_context}

Based on the segment data and specialist analyses above, provide your cost estimate
as a JSON object following the specified output format.

Include:
- cost_drivers list
- optimization_notes with any cost-saving suggestions
- confidence level based on data availability
"""
        return message

    def _format_agent_context(self, agent_response: Dict[str, Any], agent_name: str) -> str:
        """Format an agent's response for inclusion in context.

        Args:
            agent_response: Response from the specialist agent
            agent_name: Name of the agent for labeling

        Returns:
            Formatted string summary of the agent's findings
        """
        if not agent_response:
            return f"--- {agent_name} Assessment ---\nNo data available."

        assessment = agent_response.get("assessment", "unknown")
        explanation = agent_response.get("explanation", "No explanation provided.")
        flags = agent_response.get("flags", [])
        metrics = agent_response.get("metrics", {})

        # Format flags
        flags_text = ", ".join(flags) if flags else "None"

        # Format key metrics
        metrics_lines = []
        for key, value in metrics.items():
            if value is not None:
                metrics_lines.append(f"  - {key}: {value}")
        metrics_text = "\n".join(metrics_lines) if metrics_lines else "  No metrics available"

        # Add agent-specific fields
        extra_info = []
        if agent_name == "Engineering":
            construction_method = agent_response.get("construction_method")
            crossings = agent_response.get("crossings", [])
            if construction_method:
                extra_info.append(f"Construction Method: {construction_method}")
            if crossings:
                crossing_count = len(crossings)
                crossing_types = [c.get("type", "unknown") for c in crossings]
                extra_info.append(f"Crossings ({crossing_count}): {', '.join(crossing_types)}")

        elif agent_name == "Environmental":
            permits = agent_response.get("permits_likely", [])
            if permits:
                extra_info.append(f"Permits Likely: {', '.join(permits)}")

        extra_text = "\n".join(f"  {info}" for info in extra_info) if extra_info else ""

        result = f"""--- {agent_name} Assessment ---
Assessment: {assessment}
Explanation: {explanation}
Flags: {flags_text}
Key Metrics:
{metrics_text}"""

        if extra_text:
            result += f"\nAdditional Info:\n{extra_text}"

        return result
