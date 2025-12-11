"""Synthesis response models for the Master Agent."""
import re
from typing import List, Dict, Any, Literal, Union
from pydantic import BaseModel, Field, field_validator, ConfigDict

from .agent_response import AssessmentLevel


def parse_slope_value(v: Any) -> float:
    """Parse slope value which may be a string like '25.17%' or a float."""
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        # Remove % sign and parse
        cleaned = v.replace('%', '').strip()
        try:
            return float(cleaned)
        except ValueError:
            return 0.0
    return 0.0


class KeyMetrics(BaseModel):
    """Key metrics extracted from specialist analyses."""
    length_km: float = Field(default=0.0, description="Segment length in kilometers")
    avg_slope: float = Field(default=0.0, description="Average slope in degrees")
    terrain: str = Field(default="unknown", description="Terrain classification")
    land_use: str = Field(default="unknown", description="Primary land use type")
    construction_method: str = Field(default="to_be_determined", description="Recommended construction method")
    estimated_cost: str = Field(default="requires_analysis", description="Estimated cost (e.g., '€1.2M - €1.5M')")

    model_config = ConfigDict(extra="allow")  # Allow extra fields like crossing_count

    @field_validator('avg_slope', mode='before')
    @classmethod
    def parse_avg_slope(cls, v: Any) -> float:
        """Parse avg_slope which may be a string like '25.17%'."""
        return parse_slope_value(v)


class SpecialistSummaries(BaseModel):
    """One-sentence summaries from each specialist agent."""
    geotechnical: str = Field(default="Assessment pending.", description="Summary of geotechnical analysis")
    environmental: str = Field(default="Assessment pending.", description="Summary of environmental analysis")
    engineering: str = Field(default="Assessment pending.", description="Summary of engineering analysis")
    cost: str = Field(default="Assessment pending.", description="Summary of cost analysis")


def normalize_list_to_strings(v: Any) -> List[str]:
    """Convert a list with mixed types to a list of strings."""
    if not isinstance(v, list):
        return []
    result = []
    for item in v:
        if isinstance(item, str):
            result.append(item)
        elif isinstance(item, dict):
            # Convert dict flags to strings - use 'code' or 'issue' key if available
            if 'code' in item:
                desc = item.get('description', item.get('message', ''))
                result.append(f"{item['code']}: {desc}" if desc else item['code'])
            elif 'issue' in item:
                resolution = item.get('resolution', '')
                result.append(f"{item['issue']}: {resolution}" if resolution else item['issue'])
            else:
                result.append(str(item))
        else:
            result.append(str(item))
    return result


class SaipemCompliance(BaseModel):
    """SAIPEM criteria compliance status."""
    criteria_met: List[str] = Field(default_factory=list, description="List of met criteria")
    criteria_violated: List[str] = Field(default_factory=list, description="List of violated criteria")
    compliance_notes: str = Field(default="Compliance check pending.", description="Notes on compliance")

    model_config = ConfigDict(extra="allow")

    @field_validator('criteria_met', 'criteria_violated', mode='before')
    @classmethod
    def normalize_criteria(cls, v: Any) -> List[str]:
        """Normalize criteria lists to strings."""
        return normalize_list_to_strings(v)


class SynthesisResponse(BaseModel):
    """Complete synthesis response from the Master Agent."""
    segment_id: str = Field(..., description="ID of the analyzed segment")
    overall_assessment: AssessmentLevel = Field(
        ...,
        description="Overall assessment combining all specialist inputs"
    )
    confidence: Literal["high", "medium", "low"] = Field(
        default="medium",
        description="Confidence level in the assessment"
    )
    executive_summary: str = Field(
        default="Assessment synthesized from specialist analyses.",
        description="2-3 sentence executive summary covering all domains"
    )
    key_metrics: KeyMetrics = Field(
        default_factory=KeyMetrics,
        description="Key metrics from all analyses"
    )
    specialist_summaries: SpecialistSummaries = Field(
        default_factory=SpecialistSummaries,
        description="One-sentence summary from each specialist"
    )
    saipem_compliance: SaipemCompliance = Field(
        default_factory=SaipemCompliance,
        description="SAIPEM criteria compliance status"
    )
    flags: List[str] = Field(
        default_factory=list,
        description="Prioritized list of concern flags"
    )
    recommendations: List[str] = Field(
        default_factory=list,
        description="Actionable recommendations"
    )
    conflicts: List[str] = Field(
        default_factory=list,
        description="Conflicts between specialist assessments"
    )

    model_config = ConfigDict(extra="allow")  # Allow extra fields from agent responses

    @field_validator('flags', 'conflicts', 'recommendations', mode='before')
    @classmethod
    def normalize_string_lists(cls, v: Any) -> List[str]:
        """Normalize lists to strings (handles dict items from AI response)."""
        return normalize_list_to_strings(v)

    @field_validator('confidence')
    @classmethod
    def validate_confidence(cls, v: str) -> str:
        """Ensure confidence is one of the allowed values."""
        allowed = {"high", "medium", "low"}
        if v not in allowed:
            raise ValueError(f"confidence must be one of {allowed}, got '{v}'")
        return v

    def to_dict(self) -> Dict[str, Any]:
        """Convert response to JSON-serializable dictionary."""
        return self.model_dump()

    def has_flags(self) -> bool:
        """Check if any flags exist."""
        return len(self.flags) > 0

    def is_problematic(self) -> bool:
        """Check if segment is problematic (challenging assessment or has flags)."""
        return (
            self.overall_assessment == AssessmentLevel.challenging
            or self.has_flags()
        )
