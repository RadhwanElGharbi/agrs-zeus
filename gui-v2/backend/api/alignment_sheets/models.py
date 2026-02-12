from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Any
from enum import Enum


class StationType(Enum):
    """Type of station point."""
    NORMAL = "normal"
    EQUATION = "equation"
    TERMINUS = "terminus"


@dataclass
class StationEquation:
    """
    Represents a station equation (where stationing changes).

    Attributes:
        measure_m (float): The continuous geometric length (measure) from the start of the route.
        back_station (float): The station value approaching this point (Back).
        ahead_station (float): The new station value starting at this point (Ahead).

    Example:
        At measure 1000m, station jumps from 10+00 to 12+00 (Gap).
        measure_m = 1000, back_station = 1000, ahead_station = 1200.
    """
    measure_m: float
    back_station: float
    ahead_station: float

    @property
    def is_gap(self) -> bool:
        return self.ahead_station > self.back_station

    @property
    def is_overlap(self) -> bool:
        return self.ahead_station < self.back_station


@dataclass
class ProjectContext:
    """Project metadata and specs."""
    project_name: str
    project_id: str
    organization: str
    country: str
    crs_epsg: int
    crs_name: str
    route_name: str
    total_length_m: float
    pipeline_diameter_mm: float
    pipeline_material: str
    pipeline_type: str
    depth_of_cover_m: float
    mop_bar: float
    date_generated: str

    # Metadata from PIRL
    algorithm: str = "Unknown"
    generation_date: str = ""
    total_cost_usd: float = 0.0
    max_slope_pct: float = 0.0
    house_clearance_m: float = 0.0

    # Pipeline spec extras (optional but useful for FEED tables)
    pipeline_wall_thickness_mm: float = 0.0
    pipeline_grade: str = ""
    pipeline_coating: str = ""


@dataclass
class GeoPoint:
    """A geographic point with measure and attributes."""
    x: float
    y: float
    z: float = 0.0
    m: float = 0.0  # Measure (geometric length)


@dataclass
class PipeSegment:
    """Physical properties of a pipe segment."""
    start_m: float
    end_m: float
    diameter_mm: float
    wall_thickness_mm: float
    grade: str
    coating: str
    material: str = "Steel"


@dataclass
class Crossing:
    """Infrastructure crossing."""
    measure_m: float
    type: str  # road, railway, water, etc.
    name: str
    width_m: float
    angle_deg: float
    owner: str = ""
    crossing_id: str = ""


@dataclass
class ProtectedArea:
    """Represents a protected area (Natura2000, EUAP, etc.) along the route."""
    start_m: float
    end_m: float
    name: str
    type: str  # natura2000, euap, national_park, etc.
    protection_level: str = ""


@dataclass
class LandUseSegment:
    """Represents a land use segment along the route."""
    start_m: float
    end_m: float
    land_use: str  # cultivated, forest, urban, pasture, wetland, etc.
    corine_code: int = 0


@dataclass
class MunicipalitySegment:
    """Represents a municipality segment along the route."""
    start_m: float
    end_m: float
    name: str
    province: str = ""
    region: str = ""


@dataclass
class SheetConfig:
    """Configuration for sheet generation."""
    sheet_length_m: float
    h_scale: int
    v_scale: int
    station_interval_m: float
    match_line_offset_m: float = 50.0  # Overlap between sheets
    preset_name: str = "standard"


@dataclass
class SheetData:
    """Data for a single alignment sheet."""
    sheet_number: int
    total_sheets: int
    start_m: float  # Geometric start measure
    end_m: float    # Geometric end measure

    # Context data for this specific sheet
    route_coords: List[Tuple[float, float]]  # Plan view geometry
    profile_points: List[Tuple[float, float]]  # Profile view geometry (measure, elev)

    # Features on this sheet
    stations: List[Any]  # Ticks
    crossings: List[Crossing]
    pipe_segments: List[PipeSegment]

    # Bounding box
    bbox_easting_min: float
    bbox_easting_max: float
    bbox_northing_min: float
    bbox_northing_max: float
    elevation_min: float
    elevation_max: float

    # Equation on this sheet?
    equations: List[StationEquation] = field(default_factory=list)

    # Environmental and administrative data
    protected_areas: List['ProtectedArea'] = field(default_factory=list)
    land_use_segments: List['LandUseSegment'] = field(default_factory=list)
    municipalities: List['MunicipalitySegment'] = field(default_factory=list)


