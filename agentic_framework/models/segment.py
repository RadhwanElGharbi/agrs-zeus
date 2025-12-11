"""Segment data models for pipeline route optimization."""
import math
from typing import Tuple, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SegmentCoordinates(BaseModel):
    """Geographic coordinates for segment start and end points.

    Supports both WGS84 (lon/lat) and projected (x/y in meters) coordinate systems.
    """
    start: Tuple[float, float] = Field(..., description="Start point (x, y) or (longitude, latitude)")
    end: Tuple[float, float] = Field(..., description="End point (x, y) or (longitude, latitude)")
    crs: Optional[str] = Field(None, description="Coordinate reference system (e.g., 'EPSG:32613', 'EPSG:4326')")


class SegmentMetrics(BaseModel):
    """Physical and terrain metrics for a pipeline segment.

    Supports slope in both degrees and percent formats used by different systems.
    """
    length_m: float = Field(..., gt=0, description="Segment length in meters")
    start_elevation_m: float = Field(..., description="Elevation at start point in meters")
    end_elevation_m: float = Field(..., description="Elevation at end point in meters")

    # Slope can be in degrees or percent - we normalize to degrees internally
    avg_slope_degrees: float = Field(default=0.0, ge=0, le=90, description="Average slope in degrees")
    max_slope_degrees: float = Field(default=0.0, ge=0, le=90, description="Maximum slope in degrees")

    # Original values if from PIRL (stored as percent)
    slope_percent: Optional[float] = Field(None, description="Slope in percent (from PIRL output)")
    max_slope_percent: Optional[float] = Field(None, description="Maximum slope in percent (from PIRL output)")

    # PIRL-specific metrics
    reward: Optional[float] = Field(None, description="RL reward for this segment")
    cumulative_distance_m: Optional[float] = Field(None, description="Cumulative distance along route")
    total_reward_cumulative: Optional[float] = Field(None, description="Cumulative reward up to this segment")
    distance_to_aoi_boundary_m: Optional[float] = Field(None, description="Distance to AOI boundary")

    @model_validator(mode='after')
    def normalize_slopes(self):
        """Convert slope_percent to degrees if provided and degrees not set."""
        if self.slope_percent is not None and self.avg_slope_degrees == 0.0:
            self.avg_slope_degrees = slope_percent_to_degrees(self.slope_percent)
        if self.max_slope_percent is not None and self.max_slope_degrees == 0.0:
            self.max_slope_degrees = slope_percent_to_degrees(self.max_slope_percent)
        # Ensure max >= avg
        if self.max_slope_degrees < self.avg_slope_degrees:
            self.max_slope_degrees = self.avg_slope_degrees
        return self


class SegmentProperties(BaseModel):
    """Environmental and geological properties of a segment.

    Properties may be derived from data layers or provided directly.
    """
    terrain_class: str = Field(default="unknown", description="Terrain classification (e.g., flat, rolling, mountainous)")
    land_use: str = Field(default="unknown", description="Land use type (e.g., agricultural, urban, forest)")
    soil_type: Optional[str] = Field(None, description="Soil type classification")
    geological_zone: Optional[str] = Field(None, description="Geological zone classification")

    # Extended properties from data layers
    protected_area_distance_m: Optional[float] = Field(None, description="Distance to nearest protected area")
    water_body_distance_m: Optional[float] = Field(None, description="Distance to nearest water body")
    road_crossing: Optional[bool] = Field(None, description="Whether segment crosses a road")
    water_crossing: Optional[bool] = Field(None, description="Whether segment crosses water")
    river_width_m: Optional[float] = Field(None, description="Width of river if crossing")

    # Raw properties passthrough
    raw_properties: Optional[Dict[str, Any]] = Field(None, description="Original properties from GeoJSON")


class SegmentData(BaseModel):
    """Complete data model for a pipeline route segment.

    Compatible with both synthetic test data and PIRL-generated route segments.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "1",
                "coordinates": {
                    "start": [484838.28, 4933184.19],
                    "end": [484812.5, 4933146.65],
                    "crs": "EPSG:32613"
                },
                "metrics": {
                    "length_m": 45.54,
                    "start_elevation_m": 1207.98,
                    "end_elevation_m": 1211.47,
                    "max_slope_percent": 25.17
                },
                "properties": {
                    "terrain_class": "hilly",
                    "land_use": "unknown"
                }
            }
        }
    )

    id: str = Field(..., description="Unique segment identifier")
    coordinates: SegmentCoordinates = Field(..., description="Start and end coordinates")
    metrics: SegmentMetrics = Field(..., description="Physical and terrain metrics")
    properties: SegmentProperties = Field(..., description="Environmental and geological properties")

    # Route-level context
    step: Optional[int] = Field(None, description="Step number in route sequence")
    route_id: Optional[str] = Field(None, description="Parent route identifier")

    def get_elevation_change(self) -> float:
        """Calculate elevation change from start to end.

        Returns:
            Elevation change in meters (positive = uphill, negative = downhill)
        """
        return self.metrics.end_elevation_m - self.metrics.start_elevation_m

    def get_midpoint(self) -> Tuple[float, float]:
        """Calculate midpoint coordinates of the segment.

        Returns:
            Tuple of (x, y) or (longitude, latitude) for the midpoint
        """
        start_x, start_y = self.coordinates.start
        end_x, end_y = self.coordinates.end

        mid_x = (start_x + end_x) / 2
        mid_y = (start_y + end_y) / 2

        return (mid_x, mid_y)

    def get_slope_percent(self) -> float:
        """Get slope as percent (rise/run * 100).

        Returns:
            Slope in percent
        """
        if self.metrics.max_slope_percent is not None:
            return self.metrics.max_slope_percent
        return slope_degrees_to_percent(self.metrics.avg_slope_degrees)

    def get_bearing(self) -> float:
        """Calculate bearing from start to end in degrees.

        Returns:
            Bearing in degrees (0-360, clockwise from north)
        """
        start_x, start_y = self.coordinates.start
        end_x, end_y = self.coordinates.end

        dx = end_x - start_x
        dy = end_y - start_y

        bearing = math.degrees(math.atan2(dx, dy))
        return (bearing + 360) % 360


def slope_percent_to_degrees(slope_percent: float) -> float:
    """Convert slope from percent to degrees.

    Args:
        slope_percent: Slope in percent (rise/run * 100)

    Returns:
        Slope in degrees (0-90)
    """
    # slope_percent = tan(angle) * 100
    # angle = atan(slope_percent / 100)
    radians = math.atan(slope_percent / 100.0)
    degrees = math.degrees(radians)
    return min(max(degrees, 0.0), 90.0)


def slope_degrees_to_percent(slope_degrees: float) -> float:
    """Convert slope from degrees to percent.

    Args:
        slope_degrees: Slope in degrees

    Returns:
        Slope in percent (rise/run * 100)
    """
    radians = math.radians(slope_degrees)
    return math.tan(radians) * 100.0
