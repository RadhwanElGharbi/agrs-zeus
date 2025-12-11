"""Segment extractor for extracting and processing segment data from routes."""
import math
from typing import Dict, Any, List, Tuple, Optional
from functools import lru_cache

from pyproj import Transformer

from models.segment import (
    SegmentCoordinates,
    SegmentMetrics,
    SegmentProperties,
    SegmentData,
    slope_percent_to_degrees,
)
from .route_loader import load_route


def get_route_crs(route_data: Dict[str, Any]) -> Optional[str]:
    """Extract CRS from route GeoJSON.

    Args:
        route_data: The parsed GeoJSON route

    Returns:
        CRS string (e.g., 'EPSG:32613') or None
    """
    # Check standard GeoJSON CRS location
    crs_obj = route_data.get("crs", {})
    if isinstance(crs_obj, dict):
        props = crs_obj.get("properties", {})
        if "name" in props:
            return props["name"]

    # Check metadata
    metadata = route_data.get("metadata", {})
    if "crs" in metadata:
        return metadata["crs"]

    return None


@lru_cache(maxsize=32)
def _get_transformer(src_crs: str, dst_crs: str = "EPSG:4326") -> Transformer:
    """Get cached coordinate transformer."""
    return Transformer.from_crs(src_crs, dst_crs, always_xy=True)


def transform_coords_to_wgs84(
    coords: List[Tuple[float, float]],
    src_crs: Optional[str]
) -> List[Tuple[float, float]]:
    """Transform coordinates from source CRS to WGS84.

    Args:
        coords: List of (x, y) coordinate tuples
        src_crs: Source CRS string (e.g., 'EPSG:32613')

    Returns:
        List of (lng, lat) tuples in WGS84
    """
    if not src_crs or src_crs == "EPSG:4326":
        return coords

    try:
        transformer = _get_transformer(src_crs, "EPSG:4326")
        result = []
        for x, y in coords:
            lng, lat = transformer.transform(x, y)
            result.append((lng, lat))
        return result
    except Exception:
        # If transform fails, return original coords
        return coords


def get_segment_feature(route_id: str, segment_id: str, project: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get a specific segment feature from a route by segment ID.

    Args:
        route_id: The route identifier
        segment_id: The segment identifier to find (can be string or will match integer)
        project: Optional project name for project-specific routes

    Returns:
        The segment feature dict if found, None otherwise
    """
    route_data = load_route(route_id, project)

    features = route_data.get("features", [])
    for feature in features:
        props = feature.get("properties", {})

        # Skip full_route feature (feature 0 in PIRL outputs)
        if props.get("type") == "full_route":
            continue

        # Check for segment_id in properties (PIRL format uses integer)
        feature_segment_id = props.get("segment_id")
        if feature_segment_id is not None:
            # Match as string or integer
            if str(feature_segment_id) == str(segment_id):
                return feature

        # Also check for 'id' in properties or at feature level (legacy format)
        feature_id = props.get("id") or feature.get("id")
        if feature_id is not None and str(feature_id) == str(segment_id):
            return feature

    return None


def extract_coordinates(feature: Dict[str, Any]) -> List[Tuple[float, float]]:
    """Extract coordinate array from a GeoJSON feature geometry.

    Args:
        feature: A GeoJSON feature dict

    Returns:
        List of (x, y) or (longitude, latitude) tuples
    """
    geometry = feature.get("geometry", {})
    coords = geometry.get("coordinates", [])
    geom_type = geometry.get("type")

    # Handle LineString coordinates (list of [x, y] or [x, y, z])
    if geom_type == "LineString":
        return [(c[0], c[1]) for c in coords]

    # Handle Point (single coordinate)
    if geom_type == "Point":
        return [(coords[0], coords[1])]

    # Handle MultiLineString (list of LineStrings) - used in PIRL full_route
    if geom_type == "MultiLineString":
        all_coords = []
        for line in coords:
            all_coords.extend([(c[0], c[1]) for c in line])
        return all_coords

    return []


def extract_properties(feature: Dict[str, Any]) -> Dict[str, Any]:
    """Extract properties dictionary from a GeoJSON feature.

    Args:
        feature: A GeoJSON feature dict

    Returns:
        Properties dictionary
    """
    return feature.get("properties", {})


def haversine_distance(
    lon1: float, lat1: float, lon2: float, lat2: float
) -> float:
    """Calculate the great-circle distance between two points using Haversine formula.

    Note: Only use this for WGS84 coordinates. For projected coordinates, use euclidean.

    Args:
        lon1, lat1: First point (longitude, latitude) in degrees
        lon2, lat2: Second point (longitude, latitude) in degrees

    Returns:
        Distance in meters
    """
    # Earth's radius in meters
    R = 6371000

    # Convert to radians
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    # Haversine formula
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def euclidean_distance(x1: float, y1: float, x2: float, y2: float) -> float:
    """Calculate Euclidean distance between two points.

    Use for projected coordinate systems (UTM, etc.) where coordinates are in meters.

    Args:
        x1, y1: First point (x, y) in meters
        x2, y2: Second point (x, y) in meters

    Returns:
        Distance in meters
    """
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def calculate_segment_length(
    coordinates: List[Tuple[float, float]],
    crs: Optional[str] = None
) -> float:
    """Calculate the total length of a segment from its coordinates.

    Args:
        coordinates: List of (x, y) or (longitude, latitude) tuples
        crs: Coordinate reference system. If projected (not 4326), uses Euclidean.

    Returns:
        Total length in meters
    """
    if len(coordinates) < 2:
        return 0.0

    # Determine if we should use Euclidean (projected) or Haversine (geographic)
    use_euclidean = crs is not None and "4326" not in crs

    total_length = 0.0
    for i in range(len(coordinates) - 1):
        x1, y1 = coordinates[i]
        x2, y2 = coordinates[i + 1]

        if use_euclidean:
            total_length += euclidean_distance(x1, y1, x2, y2)
        else:
            total_length += haversine_distance(x1, y1, x2, y2)

    return total_length


def calculate_slope_from_elevation(
    start_elev: float, end_elev: float, length_m: float
) -> float:
    """Calculate slope in degrees from elevation change and horizontal distance.

    Args:
        start_elev: Start elevation in meters
        end_elev: End elevation in meters
        length_m: Horizontal distance in meters

    Returns:
        Slope in degrees (0-90)
    """
    if length_m <= 0:
        return 0.0

    elevation_change = abs(end_elev - start_elev)
    slope_radians = math.atan(elevation_change / length_m)
    slope_degrees = math.degrees(slope_radians)

    # Clamp to valid range
    return min(max(slope_degrees, 0.0), 90.0)


def classify_terrain_from_slope(slope_degrees: float) -> str:
    """Classify terrain based on slope.

    Args:
        slope_degrees: Slope in degrees

    Returns:
        Terrain classification string
    """
    if slope_degrees <= 2.0:
        return "flat"
    elif slope_degrees <= 5.0:
        return "rolling_hills"
    elif slope_degrees <= 12.0:
        return "hilly"
    else:
        return "mountainous"


def extract_segment_data(route_id: str, segment_id: str, project: Optional[str] = None) -> Optional[SegmentData]:
    """Extract complete segment data from a route.

    Loads the route, finds the segment, extracts coordinates and properties,
    and calculates any derived metrics that aren't present.

    Supports both PIRL-generated routes and legacy test formats.

    Args:
        route_id: The route identifier
        segment_id: The segment identifier
        project: Optional project name for project-specific routes

    Returns:
        SegmentData model instance if segment found, None otherwise
    """
    route_data = load_route(route_id, project)
    feature = get_segment_feature(route_id, segment_id, project)

    if feature is None:
        return None

    # Get route-level CRS
    crs = get_route_crs(route_data)

    # Extract raw data
    coords = extract_coordinates(feature)
    props = extract_properties(feature)

    if len(coords) < 2:
        return None

    # Get start and end coordinates
    start_coord = coords[0]
    end_coord = coords[-1]

    # === Extract or calculate length ===
    length_m = props.get("length_m")
    if length_m is None:
        length_m = calculate_segment_length(coords, crs)

    # === Extract elevations ===
    start_elev = (
        props.get("elevation_start_m")
        or props.get("start_elevation_m")
        or props.get("start_elevation")
        or 0.0
    )
    end_elev = (
        props.get("elevation_end_m")
        or props.get("end_elevation_m")
        or props.get("end_elevation")
        or 0.0
    )

    # === Extract slopes (PIRL uses percent, legacy uses degrees) ===
    slope_percent = props.get("slope_percent")
    max_slope_percent = props.get("max_slope_percent")

    avg_slope_deg = props.get("avg_slope_degrees") or props.get("avg_slope")
    max_slope_deg = props.get("max_slope_degrees") or props.get("max_slope")

    # Convert percent to degrees if needed
    if slope_percent is not None and avg_slope_deg is None:
        avg_slope_deg = slope_percent_to_degrees(slope_percent)
    if max_slope_percent is not None and max_slope_deg is None:
        max_slope_deg = slope_percent_to_degrees(max_slope_percent)

    # Calculate from elevation if still missing
    if avg_slope_deg is None:
        avg_slope_deg = calculate_slope_from_elevation(start_elev, end_elev, length_m)
    if max_slope_deg is None:
        max_slope_deg = avg_slope_deg

    # Ensure max >= avg
    if max_slope_deg < avg_slope_deg:
        max_slope_deg = avg_slope_deg

    # === Extract terrain properties ===
    terrain_class = props.get("terrain_class") or props.get("terrain")
    if terrain_class is None:
        terrain_class = classify_terrain_from_slope(avg_slope_deg)

    land_use = props.get("land_use") or props.get("landuse") or "unknown"
    soil_type = props.get("soil_type") or props.get("soil")
    geological_zone = props.get("geological_zone") or props.get("geology")

    # === Extract PIRL-specific fields ===
    reward = props.get("reward")
    cumulative_distance = props.get("cumulative_distance_m")
    total_reward_cumulative = props.get("total_reward_cumulative")
    distance_to_aoi = props.get("distance_to_aoi_boundary_m")
    step = props.get("step")

    # Build SegmentData
    try:
        segment_data = SegmentData(
            id=str(segment_id),
            coordinates=SegmentCoordinates(
                start=start_coord,
                end=end_coord,
                crs=crs
            ),
            metrics=SegmentMetrics(
                length_m=length_m,
                start_elevation_m=start_elev,
                end_elevation_m=end_elev,
                avg_slope_degrees=avg_slope_deg,
                max_slope_degrees=max_slope_deg,
                slope_percent=slope_percent,
                max_slope_percent=max_slope_percent,
                reward=reward,
                cumulative_distance_m=cumulative_distance,
                total_reward_cumulative=total_reward_cumulative,
                distance_to_aoi_boundary_m=distance_to_aoi,
            ),
            properties=SegmentProperties(
                terrain_class=terrain_class,
                land_use=land_use,
                soil_type=soil_type,
                geological_zone=geological_zone,
                raw_properties=props,
            ),
            step=step,
            route_id=route_id,
        )
        return segment_data
    except Exception:
        # Handle validation errors gracefully
        return None


def get_all_segment_ids(route_id: str, project: Optional[str] = None) -> List[str]:
    """Get all segment IDs from a route.

    Args:
        route_id: The route identifier
        project: Optional project name for project-specific routes

    Returns:
        List of segment IDs (as strings)
    """
    route_data = load_route(route_id, project)
    features = route_data.get("features", [])

    segment_ids = []
    for feature in features:
        props = feature.get("properties", {})

        # Skip full_route feature
        if props.get("type") == "full_route":
            continue

        # Get segment_id (PIRL format) or id (legacy format)
        segment_id = props.get("segment_id")
        if segment_id is not None:
            segment_ids.append(str(segment_id))
            continue

        feature_id = props.get("id") or feature.get("id")
        if feature_id is not None:
            segment_ids.append(str(feature_id))

    return segment_ids


def get_route_metadata(route_id: str, project: Optional[str] = None) -> Dict[str, Any]:
    """Get route-level metadata.

    Args:
        route_id: The route identifier
        project: Optional project name for project-specific routes

    Returns:
        Metadata dictionary
    """
    route_data = load_route(route_id, project)
    metadata = route_data.get("metadata", {})

    # Also extract from first feature if it's full_route
    features = route_data.get("features", [])
    if features:
        first_props = features[0].get("properties", {})
        if first_props.get("type") == "full_route":
            # Merge full_route properties into metadata
            metadata = {**first_props, **metadata}

    # Add CRS
    metadata["crs"] = get_route_crs(route_data)

    return metadata


def get_full_route_geometry(route_id: str, project: Optional[str] = None) -> Optional[List[Tuple[float, float]]]:
    """Get the full route geometry as a list of coordinates.

    Args:
        route_id: The route identifier
        project: Optional project name for project-specific routes

    Returns:
        List of coordinates for the full route, or None
    """
    route_data = load_route(route_id, project)
    features = route_data.get("features", [])

    if not features:
        return None

    # First feature is typically the full route
    first_feature = features[0]
    first_props = first_feature.get("properties", {})

    if first_props.get("type") == "full_route":
        return extract_coordinates(first_feature)

    # Otherwise, concatenate all segment coordinates
    all_coords = []
    for feature in features:
        coords = extract_coordinates(feature)
        if coords:
            # Add first point, skip duplicates
            if not all_coords or coords[0] != all_coords[-1]:
                all_coords.extend(coords)
            else:
                all_coords.extend(coords[1:])

    return all_coords
