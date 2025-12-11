"""Layer manager for managing and querying geospatial data layers."""
import logging
from enum import Enum
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

from config.settings import settings
from .raster_query import query_raster_at_point, query_raster_along_segment

logger = logging.getLogger(__name__)


class LayerType(str, Enum):
    """Types of geospatial data layers available from SAIPEM data package."""
    # Raster layers
    dem = "dem"
    dem_high_res = "dem_high_res"  # TIN Italy 10m
    slope = "slope"  # Derived from DEM
    landcover = "landcover"
    seismic = "seismic"
    flood = "flood"
    water_occurrence = "water_occurrence"
    population = "population"

    # Vector layers
    protected_areas = "protected_areas"
    natura2000 = "natura2000"
    roads = "roads"
    railways = "railways"
    powerlines = "powerlines"
    waterways = "waterways"
    pipelines = "pipelines"
    boundaries = "boundaries"


# Local SAIPEM data layer file paths (in data/layers/)
# Using processed files from PIRL test_project2
LOCAL_LAYER_PATHS: Dict[LayerType, Tuple[str, str]] = {
    # (filename, "raster" or "vector")
    # Rasters
    LayerType.dem: ("dem_epsg32633_processed.tif", "raster"),
    LayerType.landcover: ("landcover_epsg32633_processed.tif", "raster"),
    LayerType.seismic: ("geohazards_epsg32633_processed.tif", "raster"),
    LayerType.population: ("population_epsg32633_processed.tif", "raster"),
    # Vectors
    LayerType.protected_areas: ("protected_areas_epsg32633_processed.gpkg", "vector"),
    LayerType.roads: ("osm_roads_epsg32633_processed.gpkg", "vector"),
    LayerType.railways: ("osm_railways_epsg32633_processed.gpkg", "vector"),
    LayerType.powerlines: ("osm_power_lines_epsg32633_processed.gpkg", "vector"),
    LayerType.waterways: ("osm_waterways_epsg32633_processed.gpkg", "vector"),
    LayerType.pipelines: ("pipelines_epsg32633_processed.gpkg", "vector"),
    LayerType.boundaries: ("admin_boundaries_epsg32633_processed.gpkg", "vector"),
}

# Original SAIPEM Data Package layer file paths (external package)
# Rasters relative to SAIPEM_RASTERS_DIR, Vectors relative to SAIPEM_VECTORS_DIR
SAIPEM_LAYER_PATHS: Dict[LayerType, Tuple[str, str]] = {
    # (filename, "raster" or "vector")
    LayerType.dem: ("dem_copernicus_30m.tif", "raster"),
    LayerType.dem_high_res: ("dem_tinitaly_10m.tif", "raster"),
    LayerType.landcover: ("landcover_esa_worldcover_10m.tif", "raster"),
    LayerType.seismic: ("seismic_hazard_pga.tif", "raster"),
    LayerType.flood: ("flood_risk.tif", "raster"),
    LayerType.water_occurrence: ("water_occurrence_jrc.tif", "raster"),
    LayerType.population: ("worldpop_population.tif", "raster"),
    LayerType.protected_areas: ("wdpa_protected_areas.gpkg", "vector"),
    LayerType.natura2000: ("natura2000_sites.gpkg", "vector"),
    LayerType.roads: ("osm_roads.gpkg", "vector"),
    LayerType.railways: ("osm_railways.gpkg", "vector"),
    LayerType.powerlines: ("osm_power_lines.gpkg", "vector"),
    LayerType.waterways: ("osm_waterways.gpkg", "vector"),
    LayerType.pipelines: ("scigrid_gas_pipelines.gpkg", "vector"),
    LayerType.boundaries: ("gadm_boundaries.gpkg", "vector"),
}

# Legacy layer paths (relative to LAYERS_DIR) for backwards compatibility
LAYER_PATHS: Dict[LayerType, str] = {
    LayerType.dem: "dem.tif",
    LayerType.slope: "slope.tif",
    LayerType.landcover: "landcover.tif",
    LayerType.protected_areas: "protected_areas.tif",
}


def get_layer_path(layer_type: LayerType, use_saipem: bool = True) -> Path:
    """Get the full path for a layer file.

    Checks local layers first (data/layers/), then falls back to SAIPEM package.

    Args:
        layer_type: The type of layer
        use_saipem: If True, use SAIPEM data package paths as fallback

    Returns:
        Full path to the layer file
    """
    # First check local layers (preferred - these are bundled with the project)
    if layer_type in LOCAL_LAYER_PATHS:
        filename, _ = LOCAL_LAYER_PATHS[layer_type]
        local_path = settings.LAYERS_DIR / filename
        if local_path.exists():
            return local_path

    # Then check SAIPEM external package
    if use_saipem and layer_type in SAIPEM_LAYER_PATHS:
        filename, layer_class = SAIPEM_LAYER_PATHS[layer_type]
        if layer_class == "raster":
            saipem_path = settings.SAIPEM_RASTERS_DIR / filename
        else:
            saipem_path = settings.SAIPEM_VECTORS_DIR / filename
        if saipem_path.exists():
            return saipem_path
        # Return SAIPEM path even if doesn't exist (for error messages)
        return saipem_path

    # Fallback to legacy paths
    if layer_type in LAYER_PATHS:
        return settings.LAYERS_DIR / LAYER_PATHS[layer_type]

    raise ValueError(f"No path configured for layer type: {layer_type}")


def layer_exists(layer_type: LayerType, use_saipem: bool = True) -> bool:
    """Check if a layer file exists.

    Args:
        layer_type: The type of layer to check
        use_saipem: If True, check SAIPEM paths first

    Returns:
        True if the layer file exists, False otherwise
    """
    try:
        path = get_layer_path(layer_type, use_saipem)
        return path.exists()
    except ValueError:
        return False


def get_available_layers(use_saipem: bool = True) -> List[LayerType]:
    """Get list of available (existing) layer types.

    Args:
        use_saipem: If True, check SAIPEM data package

    Returns:
        List of LayerType values for layers that exist
    """
    return [lt for lt in LayerType if layer_exists(lt, use_saipem)]


def get_raster_layers() -> List[LayerType]:
    """Get list of raster layer types."""
    return [
        lt for lt in LayerType
        if lt in SAIPEM_LAYER_PATHS and SAIPEM_LAYER_PATHS[lt][1] == "raster"
    ]


def get_vector_layers() -> List[LayerType]:
    """Get list of vector layer types."""
    return [
        lt for lt in LayerType
        if lt in SAIPEM_LAYER_PATHS and SAIPEM_LAYER_PATHS[lt][1] == "vector"
    ]


def is_raster_layer(layer_type: LayerType) -> bool:
    """Check if a layer type is a raster layer."""
    if layer_type in LOCAL_LAYER_PATHS:
        return LOCAL_LAYER_PATHS[layer_type][1] == "raster"
    if layer_type in SAIPEM_LAYER_PATHS:
        return SAIPEM_LAYER_PATHS[layer_type][1] == "raster"
    return layer_type in [LayerType.dem, LayerType.slope, LayerType.landcover]


def query_layer_at_point(
    layer_type: LayerType, lon: float, lat: float, use_saipem: bool = True
) -> Optional[float]:
    """Query a specific raster layer at a point.

    Args:
        layer_type: The type of layer to query
        lon: Longitude (WGS84)
        lat: Latitude (WGS84)
        use_saipem: If True, use SAIPEM data paths

    Returns:
        Layer value at point, or None if not available
    """
    if not is_raster_layer(layer_type):
        logger.warning(f"Layer {layer_type.value} is not a raster, cannot query at point")
        return None

    if not layer_exists(layer_type, use_saipem):
        logger.debug(f"Layer {layer_type.value} not available")
        return None

    layer_path = get_layer_path(layer_type, use_saipem)
    return query_raster_at_point(str(layer_path), lon, lat)


def query_all_layers_at_point(
    lon: float, lat: float, use_saipem: bool = True
) -> Dict[str, Optional[float]]:
    """Query all available raster layers at a single point.

    Args:
        lon: Longitude (WGS84)
        lat: Latitude (WGS84)
        use_saipem: If True, use SAIPEM data paths

    Returns:
        Dict mapping layer names to values (None if not available)
    """
    results = {}
    for layer_type in get_raster_layers():
        if layer_exists(layer_type, use_saipem):
            value = query_layer_at_point(layer_type, lon, lat, use_saipem)
            results[layer_type.value] = value
        else:
            logger.debug(f"Layer {layer_type.value} not found, skipping")
            results[layer_type.value] = None

    return results


def query_layer_for_segment(
    layer_type: LayerType,
    coordinates: List[Tuple[float, float]],
    num_samples: int = 10,
    use_saipem: bool = True
) -> Optional[Dict[str, float]]:
    """Query a specific raster layer along a segment.

    Args:
        layer_type: The type of layer to query
        coordinates: List of (lon, lat) tuples defining the segment
        num_samples: Number of points to sample
        use_saipem: If True, use SAIPEM data paths

    Returns:
        Dict with statistics (min, max, mean, median) or None
    """
    if not is_raster_layer(layer_type):
        logger.warning(f"Layer {layer_type.value} is not a raster, cannot query segment")
        return None

    if not layer_exists(layer_type, use_saipem):
        logger.debug(f"Layer {layer_type.value} not available")
        return None

    layer_path = get_layer_path(layer_type, use_saipem)
    return query_raster_along_segment(str(layer_path), coordinates, num_samples)


def query_all_layers_for_segment(
    coordinates: List[Tuple[float, float]],
    num_samples: int = 10,
    use_saipem: bool = True
) -> Dict[str, Optional[Dict[str, float]]]:
    """Query all available raster layers along a segment.

    Args:
        coordinates: List of (lon, lat) tuples defining the segment
        num_samples: Number of points to sample per layer
        use_saipem: If True, use SAIPEM data paths

    Returns:
        Dict mapping layer names to statistics dicts (None if not available)
    """
    results = {}
    for layer_type in get_raster_layers():
        if layer_exists(layer_type, use_saipem):
            stats = query_layer_for_segment(layer_type, coordinates, num_samples, use_saipem)
            results[layer_type.value] = stats
        else:
            logger.debug(f"Layer {layer_type.value} not found, skipping")
            results[layer_type.value] = None

    return results


def register_layer(layer_type: LayerType, file_path: str) -> None:
    """Register a custom path for a layer type.

    This allows overriding the default layer paths.

    Args:
        layer_type: The layer type to register
        file_path: Path to the layer file (relative to LAYERS_DIR)
    """
    LAYER_PATHS[layer_type] = file_path
    logger.info(f"Registered custom path for {layer_type.value}: {file_path}")


def get_layer_info(use_saipem: bool = True) -> Dict[str, Dict[str, Any]]:
    """Get information about all layers.

    Args:
        use_saipem: If True, use SAIPEM data paths

    Returns:
        Dict mapping layer names to info dicts (exists, path, type)
    """
    info = {}
    for layer_type in LayerType:
        try:
            path = get_layer_path(layer_type, use_saipem)
            layer_class = "unknown"
            if layer_type in SAIPEM_LAYER_PATHS:
                layer_class = SAIPEM_LAYER_PATHS[layer_type][1]
            info[layer_type.value] = {
                "exists": path.exists(),
                "path": str(path),
                "type": layer_class,
                "filename": path.name,
            }
        except ValueError:
            info[layer_type.value] = {
                "exists": False,
                "path": None,
                "type": "unknown",
                "filename": None,
            }
    return info


# ESA WorldCover landcover class codes
LANDCOVER_CLASSES = {
    10: "Tree cover",
    20: "Shrubland",
    30: "Grassland",
    40: "Cropland",
    50: "Built-up",
    60: "Bare / sparse vegetation",
    70: "Snow and ice",
    80: "Permanent water bodies",
    90: "Herbaceous wetland",
    95: "Mangroves",
    100: "Moss and lichen",
}


def get_landcover_class(code: int) -> str:
    """Map landcover raster code to human-readable label.

    Args:
        code: ESA WorldCover class code

    Returns:
        Human-readable landcover class name
    """
    return LANDCOVER_CLASSES.get(code, f"Unknown ({code})")
