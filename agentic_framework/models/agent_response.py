"""Agent response models for pipeline route optimization."""
from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class AssessmentLevel(str, Enum):
    """Assessment levels for segment analysis."""
    favorable = "favorable"
    caution = "caution"
    challenging = "challenging"


class BaseAgentResponse(BaseModel):
    """Base response model for all specialist agents."""
    agent: str = Field(..., description="Name of the agent providing the response")
    segment_id: str = Field(..., description="ID of the analyzed segment")
    assessment: AssessmentLevel = Field(..., description="Overall assessment level")
    explanation: str = Field(..., description="2-3 sentence explanation of the assessment")
    flags: List[str] = Field(default_factory=list, description="List of concern flags")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Agent-specific metrics")


class GeotechnicalResponse(BaseAgentResponse):
    """Response model for the Geotechnical Agent.

    Metrics typically include: slope data, elevation, terrain classification,
    soil stability indicators, and geological hazard assessments.
    """
    pass  # Inherits all from BaseAgentResponse, metrics dict holds slope/elevation/terrain data


class EnvironmentalResponse(BaseAgentResponse):
    """Response model for the Environmental Agent.

    Metrics typically include: land use classification, protected area proximity,
    water body distances, and habitat sensitivity indicators.
    """
    permits_likely: List[str] = Field(
        default_factory=list,
        description="List of permits likely to be required"
    )


class EngineeringResponse(BaseAgentResponse):
    """Response model for the Engineering Agent.

    Metrics typically include: construction feasibility, crossing requirements,
    access considerations, and geometric constraints.
    """
    construction_method: str = Field(
        ...,
        description="Recommended construction method (e.g., trenching, HDD, boring)"
    )


class CostResponse(BaseAgentResponse):
    """Response model for the Cost Estimation Agent.

    Metrics typically include: base cost per km, terrain multipliers,
    crossing adders, and total estimated cost.
    """
    cost_drivers: List[str] = Field(
        default_factory=list,
        description="Main factors driving the cost estimate"
    )
    optimization_notes: Optional[str] = Field(
        None,
        description="Suggestions for cost optimization"
    )
