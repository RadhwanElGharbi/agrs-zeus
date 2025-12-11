"""API request and response models."""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

from .synthesis import SynthesisResponse


class ExplainRequest(BaseModel):
    """Request model for the /api/explain endpoint."""
    route_id: str = Field(..., description="ID of the route to analyze")
    segment_ids: List[str] = Field(..., description="List of segment IDs to explain")
    include_agents: Optional[List[str]] = Field(
        None,
        description="Optional filter for which agents to run (default: all)"
    )

    @field_validator('segment_ids')
    @classmethod
    def validate_segment_ids_not_empty(cls, v: List[str]) -> List[str]:
        """Ensure segment_ids list is not empty."""
        if not v:
            raise ValueError("segment_ids list cannot be empty")
        return v

    @field_validator('route_id')
    @classmethod
    def validate_route_id_not_empty(cls, v: str) -> str:
        """Ensure route_id is not empty."""
        if not v or not v.strip():
            raise ValueError("route_id cannot be empty")
        return v


class ExplainResponse(SynthesisResponse):
    """Response model for the /api/explain endpoint.

    Extends SynthesisResponse with same structure.
    """
    pass


class HealthResponse(BaseModel):
    """Response model for the /health endpoint."""
    status: str = Field(..., description="Health status ('ok' or 'degraded')")
    version: str = Field(..., description="API version")
    agents_available: List[str] = Field(
        ...,
        description="List of available agent names"
    )


class ErrorResponse(BaseModel):
    """Standard error response model."""
    error: str = Field(..., description="Error type/code")
    detail: str = Field(..., description="Detailed error message")
    segment_id: Optional[str] = Field(
        None,
        description="Segment ID if error is segment-specific"
    )
