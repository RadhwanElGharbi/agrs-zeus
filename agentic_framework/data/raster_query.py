"""Raster query utilities for sampling geospatial data layers."""
import logging
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path

import numpy as np

try:
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import rowcol
    from rasterio.warp import transform as transform_coords
    RASTERIO_AVAILABLE = True
except ImportError:
    RASTERIO_AVAILABLE = False

logger = logging.getLogger(__name__)


# Land cover classification mapping (common schemes)
LANDCOVER_CLASSES = {
    # CORINE Land Cover classes
    1: "urban_continuous",
    2: "urban_discontinuous",
    3: "industrial",
    4: "road_rail",
    5: "port",
    6: "airport",
    7: "mineral_extraction",
    8: "dump_site",
    9: "construction",
    10: "green_urban",
    11: "sport_leisure",
    12: "arable_non_irrigated",
    13: "arable_irrigated",
    14: "rice_fields",
    15: "vineyards",
    16: "fruit_trees",
    17: "olive_groves",
    18: "pastures",
    19: "annual_permanent_crops",
    20: "complex_cultivation",
    21: "agriculture_vegetation",
    22: "agro_forestry",
    23: "broad_leaved_forest",
    24: "coniferous_forest",
    25: "mixed_forest",
    26: "natural_grassland",
    27: "moors_heathland",
    28: "sclerophyllous_vegetation",
    29: "transitional_woodland",
    30: "beaches_dunes",
    31: "bare_rock",
    32: "sparsely_vegetated",
    33: "burnt_areas",
    34: "glaciers",
    35: "inland_marshes",
    36: "peat_bogs",
    37: "salt_marshes",
    38: "salines",
    39: "intertidal_flats",
    40: "water_courses",
    41: "water_bodies",
    42: "coastal_lagoons",
    43: "estuaries",
    44: "sea_ocean",
    # Generic fallbacks
    0: "no_data",
    255: "no_data",
}


def query_raster_at_point(
    raster_path: str, lon: float, lat: float
) -> Optional[float]:
    """Query a raster value at a specific point.

    Args:
        raster_path: Path to the raster file
        lon: Longitude of the query point (WGS84)
        lat: Latitude of the query point (WGS84)

    Returns:
        The raster value at the point, or None if outside bounds or error
    """
    if not RASTERIO_AVAILABLE:
        logger.warning("rasterio not available, cannot query raster")
        return None

    raster_path = Path(raster_path)
    if not raster_path.exists():
        logger.error(f"Raster file not found: {raster_path}")
        return None

    try:
        with rasterio.open(raster_path) as src:
            # Transform coordinates if raster CRS differs from WGS84
            src_crs = src.crs
            if src_crs and not src_crs.is_geographic:
                # Transform from WGS84 to raster CRS
                xs, ys = transform_coords(
                    CRS.from_epsg(4326), src_crs, [lon], [lat]
                )
                x, y = xs[0], ys[0]
            else:
                x, y = lon, lat

            # Get row, col from coordinates
            try:
                row, col = rowcol(src.transform, x, y)
            except Exception:
                return None

            # Check bounds
            if row < 0 or row >= src.height or col < 0 or col >= src.width:
                return None

            # Read value
            value = src.read(1)[int(row), int(col)]

            # Handle nodata
            if src.nodata is not None and value == src.nodata:
                return None

            return float(value)

    except rasterio.errors.RasterioError as e:
        logger.error(f"Rasterio error querying {raster_path}: {e}")
        return None
    except Exception as e:
        logger.error(f"Error querying raster at point: {e}")
        return None


def query_raster_along_segment(
    raster_path: str, coordinates: List[Tuple[float, float]], num_samples: int = 10
) -> Optional[Dict[str, float]]:
    """Query raster values along a segment and return statistics.

    Args:
        raster_path: Path to the raster file
        coordinates: List of (longitude, latitude) tuples defining the segment
        num_samples: Number of points to sample along the segment

    Returns:
        Dict with min, max, mean, median values, or None if error
    """
    if not RASTERIO_AVAILABLE:
        logger.warning("rasterio not available, cannot query raster")
        return None

    if len(coordinates) < 2:
        return None

    # Generate sample points along the segment
    sample_points = []
    for i in range(num_samples):
        t = i / (num_samples - 1)  # 0 to 1

        # Interpolate along the coordinate list
        total_segments = len(coordinates) - 1
        segment_index = min(int(t * total_segments), total_segments - 1)
        local_t = (t * total_segments) - segment_index

        lon1, lat1 = coordinates[segment_index]
        lon2, lat2 = coordinates[min(segment_index + 1, len(coordinates) - 1)]

        sample_lon = lon1 + local_t * (lon2 - lon1)
        sample_lat = lat1 + local_t * (lat2 - lat1)
        sample_points.append((sample_lon, sample_lat))

    # Query each sample point
    values = []
    for lon, lat in sample_points:
        value = query_raster_at_point(raster_path, lon, lat)
        if value is not None:
            values.append(value)

    if not values:
        return None

    return {
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "mean": float(np.mean(values)),
        "median": float(np.median(values)),
        "samples": len(values),
    }


def get_landcover_class(code: int) -> str:
    """Map a land cover code to a human-readable label.

    Args:
        code: The land cover classification code

    Returns:
        Human-readable land cover class name
    """
    return LANDCOVER_CLASSES.get(code, f"class_{code}")


def get_raster_info(raster_path: str) -> Optional[Dict[str, Any]]:
    """Get basic information about a raster file.

    Args:
        raster_path: Path to the raster file

    Returns:
        Dict with raster info (crs, bounds, resolution, etc.) or None
    """
    if not RASTERIO_AVAILABLE:
        return None

    raster_path = Path(raster_path)
    if not raster_path.exists():
        return None

    try:
        with rasterio.open(raster_path) as src:
            return {
                "crs": str(src.crs) if src.crs else None,
                "bounds": {
                    "left": src.bounds.left,
                    "bottom": src.bounds.bottom,
                    "right": src.bounds.right,
                    "top": src.bounds.top,
                },
                "width": src.width,
                "height": src.height,
                "resolution": src.res,
                "nodata": src.nodata,
                "dtype": str(src.dtypes[0]),
                "count": src.count,
            }
    except Exception as e:
        logger.error(f"Error getting raster info: {e}")
        return None
