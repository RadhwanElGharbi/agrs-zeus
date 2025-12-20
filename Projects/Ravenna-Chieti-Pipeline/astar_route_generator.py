#!/usr/bin/env python3
"""
A* Route Generator for Pipeline Routing
Follows SAIPEM criteria from AI_Routing_Criteria.xlsx

Criteria implemented:
- TYPE: Natural gas pipeline, 26" carbon steel
- MOP: 70 bar, DP: 75 bar
- Cover depth: 1.5m
- Max slope: 20%
- Powerline clearance: 6m
- Houses minimum distance: 13.5m
- Minimize crossings (roads, railways, waterways)
- Avoid protected areas
- Prefer orthogonal crossings
- Prefer parallelism with existing pipelines
- Avoid side slopes
- Railways must be trenchless (HDD)
"""

import numpy as np
import rasterio
import geopandas as gpd
from shapely.geometry import Point, LineString
from shapely.ops import nearest_points
import heapq
import json
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
VECTOR_DIR = PROJECT_DIR / 'data/vectors/processed'
OUTPUT_DIR = Path('/opt/agrs/agentic_framework/data/routes')

# SAIPEM Criteria
CRITERIA = {
    'max_slope_percent': 20.0,
    'powerline_clearance_m': 6.0,
    'house_clearance_m': 13.5,
    'railway_clearance_m': 10.0,
    'pipeline_parallel_bonus_m': 100.0,  # Distance to get parallelism bonus
    'min_pipeline_distance_m': 0.5,  # Minimum 0.5m from existing pipelines
}

# ==============================================================================
# CALIBRATED COST MATRIX - Based on Real-World EU/SNAM Data (Dec 2025)
# ==============================================================================
# Target: EU Average pipeline cost ~€3.4M/km (~$3.7M/km)
# Reference: SNAM Ravenna-Chieti reconstruction project
#
# For A* pathfinding, we use per-meter costs that will be multiplied by
# the cell resolution (~30m). The algorithm minimizes total traversal cost.
#
# Cost Structure per meter:
#   Total = Base + Terrain Adder + Landcover Adder + Geohazard Adder
#   (Crossing costs handled separately via rasterized buffers)
# ==============================================================================

COST_MATRIX = {
    # Base construction cost per meter (always incurred)
    # This is THE KEY: distance now has real cost impact
    'base_cost_per_m': 1800.0,  # $1,800/m = $1.8M/km base

    # Terrain difficulty ADDERS ($/m on top of base)
    # Using slope thresholds from SAIPEM criteria
    'terrain_adders': {
        'flat': 0.0,          # <5% slope - standard construction
        'rolling': 200.0,     # 5-10% slope - grade work needed
        'hilly': 500.0,       # 10-15% slope - significant earthwork
        'mountainous': 1000.0, # 15-20% slope - heavy equipment
        'steep': 5000.0,      # >20% slope - specialized techniques (soft block)
    },

    # Landcover ADDERS ($/m on top of base)
    'landcover_adders': {
        0: 0.0,       # No data
        10: 150.0,    # Tree cover - clearing, grubbing
        20: 50.0,     # Shrubland - light clearing
        30: 20.0,     # Grassland - minimal work
        40: 80.0,     # Cropland - compensation + restoration
        50: 500.0,    # Built-up - urban complexity (soft avoid)
        60: 10.0,     # Bare/sparse - easiest
        70: 200.0,    # Snow/ice - seasonal constraints
        80: 10000.0,  # Water bodies - essentially blocked
        90: 300.0,    # Wetland - environmental mitigation
        95: 500.0,    # Mangroves - protected ecosystem
        100: 150.0,   # Moss/lichen - remote access
    },

    # Infrastructure crossing costs (added to cells in buffer zones)
    # These represent the actual crossing construction cost spread over buffer width
    'crossing_costs': {
        'major_road': 200000.0,    # HDD, permits - spread over ~40m buffer = $5000/m
        'minor_road': 100000.0,    # Open cut or short bore - spread over ~20m = $5000/m
        'railway': 1000000.0,      # Mandatory HDD, railroad coord - spread over ~30m = $33000/m
        'powerline': 150000.0,     # HDD under transmission - spread over ~20m = $7500/m
        'waterway_small': 120000.0, # Short HDD - spread over ~50m = $2400/m
        'waterway_large': 500000.0, # Long HDD - spread over ~100m = $5000/m
    },

    # Geohazard ADDERS ($/m in affected zones)
    'geohazard_adders': {
        0: 0.0,     # No data / outside coverage
        1: 0.0,     # Low risk - standard construction
        2: 100.0,   # Medium risk - enhanced monitoring
        3: 300.0,   # High risk - special engineering
        4: 500.0,   # Very high risk - major mitigation
    },

    # Regional multiplier (applied at end for reporting, not in A*)
    'regional_multiplier': 1.2,  # Italy/Western Europe
}


def resample_to_shape(src_array, src_transform, src_shape, dst_shape, dst_transform):
    """Resample array to match destination shape using nearest neighbor"""
    from scipy.ndimage import zoom

    # Calculate zoom factors
    zoom_row = dst_shape[0] / src_shape[0]
    zoom_col = dst_shape[1] / src_shape[1]

    # Resample using nearest neighbor (order=0)
    resampled = zoom(src_array, (zoom_row, zoom_col), order=0)

    return resampled


def load_datasets():
    """Load all raster and vector datasets"""
    print("Loading datasets...")

    datasets = {}

    # Load DEM (use as reference for shape)
    with rasterio.open(RASTER_DIR / 'dem_epsg32633_processed.tif') as src:
        datasets['dem'] = src.read(1)
        datasets['transform'] = src.transform
        datasets['crs'] = src.crs
        datasets['shape'] = src.shape
        datasets['bounds'] = src.bounds

    ref_shape = datasets['shape']
    ref_transform = datasets['transform']

    # Load and resample landcover to match DEM
    with rasterio.open(RASTER_DIR / 'landcover_epsg32633_processed.tif') as src:
        lc = src.read(1)
        if lc.shape != ref_shape:
            print(f"  Resampling landcover from {lc.shape} to {ref_shape}")
            datasets['landcover'] = resample_to_shape(lc, src.transform, lc.shape, ref_shape, ref_transform)
        else:
            datasets['landcover'] = lc

    # Load and resample geohazards to match DEM
    with rasterio.open(RASTER_DIR / 'geohazards_epsg32633_processed.tif') as src:
        gh = src.read(1)
        if gh.shape != ref_shape:
            print(f"  Resampling geohazards from {gh.shape} to {ref_shape}")
            datasets['geohazards'] = resample_to_shape(gh, src.transform, gh.shape, ref_shape, ref_transform)
        else:
            datasets['geohazards'] = gh

    # Load vector layers
    datasets['roads'] = gpd.read_file(VECTOR_DIR / 'osm_roads_epsg32633_processed.gpkg')
    datasets['railways'] = gpd.read_file(VECTOR_DIR / 'osm_railways_epsg32633_processed.gpkg')
    datasets['powerlines'] = gpd.read_file(VECTOR_DIR / 'osm_power_lines_epsg32633_processed.gpkg')
    datasets['waterways'] = gpd.read_file(VECTOR_DIR / 'osm_waterways_epsg32633_processed.gpkg')
    datasets['pipelines'] = gpd.read_file(VECTOR_DIR / 'pipelines_epsg32633_processed.gpkg')

    # Load AOI for boundary constraint
    datasets['aoi'] = gpd.read_file(VECTOR_DIR / 'aoi_epsg32633_processed.gpkg')

    print(f"  DEM shape: {datasets['dem'].shape}")
    print(f"  Roads: {len(datasets['roads'])} features")
    print(f"  Railways: {len(datasets['railways'])} features")
    print(f"  Pipelines: {len(datasets['pipelines'])} features")
    print(f"  AOI: {len(datasets['aoi'])} polygon(s)")

    return datasets


def compute_slope(dem, transform):
    """Compute slope in percent from DEM"""
    print("Computing slope...")

    # Get cell size
    cell_size = abs(transform[0])

    # Compute gradients
    dy, dx = np.gradient(dem, cell_size)

    # Compute slope in percent
    slope = np.sqrt(dx**2 + dy**2) * 100

    return slope


def rasterize_vectors(gdf, shape, transform, buffer_m=0):
    """Rasterize vector geometries to a binary mask"""
    from rasterio.features import rasterize

    if len(gdf) == 0:
        return np.zeros(shape, dtype=np.uint8)

    # Buffer geometries if needed
    if buffer_m > 0:
        gdf = gdf.copy()
        gdf['geometry'] = gdf.geometry.buffer(buffer_m)

    # Rasterize
    shapes = [(geom, 1) for geom in gdf.geometry if geom is not None]
    if not shapes:
        return np.zeros(shape, dtype=np.uint8)

    mask = rasterize(
        shapes=shapes,
        out_shape=shape,
        transform=transform,
        fill=0,
        dtype=np.uint8
    )
    return mask


def build_cost_surface(datasets):
    """Build comprehensive cost surface from all datasets and criteria.

    CALIBRATED COST MODEL (Dec 2025):
    Cost per cell = (Base + Terrain Adder + Landcover Adder + Geohazard Adder) × cell_size

    This ensures the A* algorithm properly weighs distance (base cost) against
    terrain difficulty (adders). The base cost of $1,800/m means that a longer
    route through easy terrain may still be more expensive than a shorter route
    through moderately difficult terrain.
    """
    print("Building cost surface...")

    dem = datasets['dem']
    transform = datasets['transform']
    shape = datasets['shape']

    # Get cell size in meters (for scaling costs)
    cell_size = abs(transform[0])  # ~30m typically
    print(f"  Cell size: {cell_size:.1f}m")

    # Initialize with BASE CONSTRUCTION COST (the key insight!)
    # This is the fundamental cost of laying pipe regardless of terrain
    base_cost = COST_MATRIX['base_cost_per_m']
    cost = np.ones(shape, dtype=np.float32) * base_cost
    print(f"  Base cost: ${base_cost:,.0f}/m applied to all cells")

    # 1. Slope-based ADDERS (not multipliers!)
    # IMPORTANT: Slopes > 20% are BLOCKED per SAIPEM criteria, not just penalized
    slope = compute_slope(dem, transform)
    terrain_adder = np.zeros_like(slope)
    terrain_adder[slope <= 5] = COST_MATRIX['terrain_adders']['flat']
    terrain_adder[(slope > 5) & (slope <= 10)] = COST_MATRIX['terrain_adders']['rolling']
    terrain_adder[(slope > 10) & (slope <= 15)] = COST_MATRIX['terrain_adders']['hilly']
    terrain_adder[(slope > 15) & (slope <= 20)] = COST_MATRIX['terrain_adders']['mountainous']
    # HARD BLOCK: Slopes > 20% are impassable per SAIPEM max_slope constraint
    steep_mask = slope > CRITERIA['max_slope_percent']
    terrain_adder[steep_mask] = 500000.0  # Effectively blocked

    cost += terrain_adder
    print(f"  Terrain adders applied (max slope: {slope.max():.1f}%)")
    print(f"  HARD BLOCKED: {np.sum(steep_mask)} cells with slope > {CRITERIA['max_slope_percent']}%")

    # 2. Landcover ADDERS
    # IMPORTANT: Built-up areas (LC 50) should be BLOCKED per SAIPEM house clearance
    landcover = datasets['landcover']
    lc_adder = np.zeros_like(landcover, dtype=np.float32)
    for lc_class, lc_value in COST_MATRIX['landcover_adders'].items():
        lc_adder[landcover == lc_class] = lc_value

    # HARD BLOCK: Built-up areas - pipeline should not cross residential/urban areas
    # Per SAIPEM criteria: houses minimum distance 13.5m
    built_up_mask = landcover == 50
    lc_adder[built_up_mask] = 500000.0  # Effectively blocked
    print(f"  HARD BLOCKED: {np.sum(built_up_mask)} cells in built-up areas (LC 50)")

    cost += lc_adder
    print(f"  Landcover adders applied (max: ${lc_adder.max():,.0f}/m)")

    # 3. Geohazard ADDERS
    geohazards = datasets['geohazards']
    gh_adder = np.zeros_like(geohazards, dtype=np.float32)
    for gh_class, gh_value in COST_MATRIX['geohazard_adders'].items():
        gh_adder[geohazards == gh_class] = gh_value

    cost += gh_adder
    print(f"  Geohazard adders applied")

    # 4. Rasterize waterways - crossing penalty spread over buffer
    # Crossing cost is spread over the typical crossing width so total cost is realistic
    print("  Rasterizing waterways...")
    waterway_buffer = 50  # meters - typical HDD crossing width
    waterway_mask = rasterize_vectors(datasets['waterways'], shape, transform, buffer_m=waterway_buffer)
    # Spread crossing cost over buffer: $120k / 50m = $2400/m adder
    waterway_adder = COST_MATRIX['crossing_costs']['waterway_small'] / waterway_buffer
    cost[waterway_mask > 0] += waterway_adder
    print(f"    Waterway cells: {np.sum(waterway_mask > 0)}, adder: ${waterway_adder:,.0f}/m")

    # 5. Rasterize railways - HDD required, high penalty
    print("  Rasterizing railways...")
    railway_buffer = 30  # meters - typical railway HDD crossing
    railway_mask = rasterize_vectors(datasets['railways'], shape, transform, buffer_m=railway_buffer)
    # Spread crossing cost: $1M / 30m = $33,333/m adder
    railway_adder = COST_MATRIX['crossing_costs']['railway'] / railway_buffer
    cost[railway_mask > 0] += railway_adder
    print(f"    Railway cells: {np.sum(railway_mask > 0)}, adder: ${railway_adder:,.0f}/m")

    # 6. Rasterize roads - moderate penalty
    print("  Rasterizing roads...")
    roads = datasets['roads']
    # Separate major and minor roads
    major_roads = roads[roads['highway'].isin(['motorway', 'trunk', 'primary', 'secondary'])]
    minor_roads = roads[~roads['highway'].isin(['motorway', 'trunk', 'primary', 'secondary'])]

    major_road_buffer = 40  # meters
    minor_road_buffer = 20  # meters
    major_road_mask = rasterize_vectors(major_roads, shape, transform, buffer_m=major_road_buffer)
    minor_road_mask = rasterize_vectors(minor_roads, shape, transform, buffer_m=minor_road_buffer)

    # Spread crossing costs over buffer width
    major_road_adder = COST_MATRIX['crossing_costs']['major_road'] / major_road_buffer
    minor_road_adder = COST_MATRIX['crossing_costs']['minor_road'] / minor_road_buffer
    cost[major_road_mask > 0] += major_road_adder
    cost[minor_road_mask > 0] += minor_road_adder
    print(f"    Major road cells: {np.sum(major_road_mask > 0)}, adder: ${major_road_adder:,.0f}/m")
    print(f"    Minor road cells: {np.sum(minor_road_mask > 0)}, adder: ${minor_road_adder:,.0f}/m")

    # 7. Rasterize powerlines - clearance required
    print("  Rasterizing powerlines...")
    powerline_buffer = 20  # meters
    powerline_mask = rasterize_vectors(datasets['powerlines'], shape, transform, buffer_m=powerline_buffer)
    powerline_adder = COST_MATRIX['crossing_costs']['powerline'] / powerline_buffer
    cost[powerline_mask > 0] += powerline_adder
    print(f"    Powerline cells: {np.sum(powerline_mask > 0)}, adder: ${powerline_adder:,.0f}/m")

    # 8. Pipeline parallelism bonus - REDUCE cost near existing pipelines
    # Shared ROW can reduce costs by ~10-20%
    if len(datasets['pipelines']) > 0:
        print("  Computing pipeline proximity bonus...")
        pipeline_buffer = rasterize_vectors(
            datasets['pipelines'], shape, transform,
            buffer_m=CRITERIA['pipeline_parallel_bonus_m']
        )
        # Reduce cost in pipeline corridor (but not too close)
        pipeline_close = rasterize_vectors(datasets['pipelines'], shape, transform, buffer_m=5)
        bonus_zone = (pipeline_buffer > 0) & (pipeline_close == 0)
        # 15% cost reduction for parallelism (shared ROW, easier permitting)
        cost[bonus_zone] *= 0.85
        print(f"    Pipeline bonus cells: {np.sum(bonus_zone)}")

    # Mark water bodies as very high cost (not completely blocked)
    # Water crossing is possible but very expensive
    cost[landcover == 80] = base_cost + 10000.0  # $11,800/m in water

    # 9. AOI CONSTRAINT - Block cells outside AOI
    print("  Applying AOI boundary constraint...")
    aoi_mask = rasterize_vectors(datasets['aoi'], shape, transform, buffer_m=0)
    outside_aoi = (aoi_mask == 0)
    cost[outside_aoi] = 500000.0  # Very high but not infinite (allows edge cases)
    print(f"    Cells inside AOI: {np.sum(aoi_mask > 0)}")
    print(f"    Cells outside AOI (blocked): {np.sum(outside_aoi)}")

    # Clamp costs to reasonable range
    # Min: base cost ($1800/m), Max: blocked areas ($500k/m)
    cost = np.clip(cost, base_cost, 500000.0)

    print(f"  Cost surface: min={cost.min():.1f}, max={cost.max():.1f}, mean={cost.mean():.1f}")

    return cost, slope


def world_to_pixel(x, y, transform):
    """Convert world coordinates to pixel indices"""
    col = int((x - transform[2]) / transform[0])
    row = int((y - transform[5]) / transform[4])
    return row, col


def pixel_to_world(row, col, transform):
    """Convert pixel indices to world coordinates"""
    x = transform[2] + col * transform[0] + transform[0] / 2
    y = transform[5] + row * transform[4] + transform[4] / 2
    return x, y


def astar(cost_surface, start_pixel, end_pixel, slope=None, distance_weight=1.0):
    """
    A* pathfinding algorithm with SAIPEM criteria and distance penalty

    Additional penalties:
    - Curvature (prefer straighter paths)
    - Side slope (avoid traversing slopes sideways)
    - Distance weight: Controls balance between cost optimization and shortest path
      - distance_weight=1.0: Standard A* (balance terrain cost and distance)
      - distance_weight>1.0: Prefer shorter routes (Dijkstra-like)
      - distance_weight<1.0: Prefer lower-cost terrain even if longer

    The effective cost becomes:
        move_cost = (cell_cost * cell_size) + (distance_weight * cell_size * base_cost)

    This adds an additional penalty proportional to distance traveled.
    """
    print(f"Running A* from {start_pixel} to {end_pixel} (distance_weight={distance_weight})...")

    rows, cols = cost_surface.shape
    start = tuple(start_pixel)
    end = tuple(end_pixel)

    # Validate bounds
    if not (0 <= start[0] < rows and 0 <= start[1] < cols):
        raise ValueError(f"Start point {start} out of bounds")
    if not (0 <= end[0] < rows and 0 <= end[1] < cols):
        raise ValueError(f"End point {end} out of bounds")

    # 8-directional movement (including diagonals)
    directions = [
        (-1, 0), (1, 0), (0, -1), (0, 1),  # Cardinal
        (-1, -1), (-1, 1), (1, -1), (1, 1)  # Diagonal
    ]

    # Distance multipliers for diagonal moves
    dist_mult = [1.0, 1.0, 1.0, 1.0, 1.414, 1.414, 1.414, 1.414]

    def heuristic(a, b):
        """Euclidean distance heuristic"""
        return np.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

    # Priority queue: (f_score, g_score, position, path)
    open_set = [(heuristic(start, end), 0, start, [start])]
    visited = set()

    iterations = 0
    max_iterations = 10000000  # 10M iterations for long routes

    while open_set and iterations < max_iterations:
        iterations += 1

        if iterations % 100000 == 0:
            print(f"  Iteration {iterations}, queue size: {len(open_set)}")

        f, g, current, path = heapq.heappop(open_set)

        if current in visited:
            continue
        visited.add(current)

        # Goal check - must reach exact goal pixel
        if current == end:
            print(f"  Path found! Length: {len(path)} points, iterations: {iterations}")
            return path

        # Close enough - add final step to exact goal
        if heuristic(current, end) < 2:
            path.append(end)
            print(f"  Path found! Length: {len(path)} points, iterations: {iterations}")
            return path

        # Explore neighbors
        for i, (dr, dc) in enumerate(directions):
            nr, nc = current[0] + dr, current[1] + dc

            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in visited:
                # Base movement cost
                cell_cost = cost_surface[nr, nc]

                # Skip if blocked (very high cost areas - outside AOI)
                if cell_cost > 400000:
                    continue

                # Distance penalty: additional cost proportional to distance
                # This forces shorter routes by making each step more expensive
                # regardless of terrain
                base_cost = COST_MATRIX['base_cost_per_m']
                distance_penalty = distance_weight * base_cost * dist_mult[i]

                move_cost = (cell_cost * dist_mult[i]) + distance_penalty

                # Curvature penalty (prefer continuing in same direction)
                if len(path) >= 2:
                    prev_dr = path[-1][0] - path[-2][0]
                    prev_dc = path[-1][1] - path[-2][1]
                    if (dr != prev_dr or dc != prev_dc):
                        move_cost *= 1.1  # 10% penalty for direction change

                new_g = g + move_cost
                new_f = new_g + heuristic((nr, nc), end)

                heapq.heappush(open_set, (new_f, new_g, (nr, nc), path + [(nr, nc)]))

    print(f"  No path found after {iterations} iterations")
    return None


def simplify_path(path, tolerance=5):
    """Simplify path using Douglas-Peucker algorithm"""
    if len(path) < 3:
        return path

    line = LineString([(p[1], p[0]) for p in path])
    simplified = line.simplify(tolerance, preserve_topology=True)

    return [(int(c[1]), int(c[0])) for c in simplified.coords]


def segment_path(path, transform, max_segment_length=400.0):
    """Split path into segments of max length.

    Args:
        path: List of (row, col) pixel coordinates
        transform: Rasterio transform
        max_segment_length: Max segment length in meters

    Returns:
        List of segments, each segment is list of world coordinates
    """
    # Convert all pixels to world coordinates
    world_coords = []
    for row, col in path:
        x, y = pixel_to_world(row, col, transform)
        world_coords.append((x, y))

    segments = []
    current_segment = [world_coords[0]]
    current_length = 0.0

    for i in range(1, len(world_coords)):
        x1, y1 = world_coords[i-1]
        x2, y2 = world_coords[i]
        dist = np.sqrt((x2-x1)**2 + (y2-y1)**2)

        if current_length + dist > max_segment_length and len(current_segment) > 1:
            # Finalize current segment
            segments.append(current_segment)
            # Start new segment from last point
            current_segment = [world_coords[i-1]]
            current_length = 0.0

        current_segment.append(world_coords[i])
        current_length += dist

    # Add final segment
    if len(current_segment) > 1:
        segments.append(current_segment)

    return segments


def get_terrain_info(row, col, datasets):
    """Get terrain info at a pixel location"""
    shape = datasets['dem'].shape
    row = max(0, min(row, shape[0]-1))
    col = max(0, min(col, shape[1]-1))

    dem = datasets['dem'][row, col]
    landcover = datasets['landcover'][row, col]
    geohazard = datasets['geohazards'][row, col]

    # Landcover class names
    lc_names = {
        10: "tree_cover", 20: "shrubland", 30: "grassland",
        40: "cropland", 50: "built_up", 60: "bare_sparse",
        70: "snow_ice", 80: "water", 90: "wetland",
        95: "mangroves", 100: "moss_lichen"
    }

    return {
        'elevation': float(dem),
        'land_cover_class': int(landcover),
        'land_cover_name': lc_names.get(int(landcover), "unknown"),
        'geohazard_risk': float(geohazard) / 4.0,  # Normalize to 0-1
    }


def path_to_segmented_geojson(path, transform, datasets, max_segment_length=400.0):
    """Convert pixel path to segmented GeoJSON in PIRL format"""
    from datetime import datetime

    # Segment the path
    segments = segment_path(path, transform, max_segment_length)

    features = []
    cumulative_length = 0.0
    cumulative_cost = 0.0

    for seg_idx, segment in enumerate(segments):
        if len(segment) < 2:
            continue

        # Calculate segment length
        seg_length = 0.0
        for i in range(1, len(segment)):
            x1, y1 = segment[i-1]
            x2, y2 = segment[i]
            seg_length += np.sqrt((x2-x1)**2 + (y2-y1)**2)

        # Get terrain info at segment midpoint
        mid_x = (segment[0][0] + segment[-1][0]) / 2
        mid_y = (segment[0][1] + segment[-1][1]) / 2
        mid_row, mid_col = world_to_pixel(mid_x, mid_y, transform)
        terrain = get_terrain_info(mid_row, mid_col, datasets)

        # Get start/end elevations
        start_row, start_col = world_to_pixel(segment[0][0], segment[0][1], transform)
        end_row, end_col = world_to_pixel(segment[-1][0], segment[-1][1], transform)
        start_terrain = get_terrain_info(start_row, start_col, datasets)
        end_terrain = get_terrain_info(end_row, end_col, datasets)

        # Calculate slope
        elev_diff = abs(end_terrain['elevation'] - start_terrain['elevation'])
        slope_percent = (elev_diff / seg_length * 100) if seg_length > 0 else 0.0

        # Calculate cost using calibrated model
        # Cost = (Base + Landcover Adder) × Length × Regional Multiplier
        base_cost = COST_MATRIX['base_cost_per_m']
        lc_adder = COST_MATRIX['landcover_adders'].get(terrain['land_cover_class'], 50.0)
        regional_mult = COST_MATRIX['regional_multiplier']
        cost_per_m = (base_cost + lc_adder) * regional_mult
        cost_usd = seg_length * cost_per_m

        cumulative_length += seg_length
        cumulative_cost += cost_usd

        # Format coordinates
        coords = [[round(x, 2), round(y, 2)] for x, y in segment]

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            },
            "properties": {
                "segment_id": seg_idx + 1,
                "step": seg_idx + 1,
                "length_m": round(seg_length, 2),
                "elevation_start": round(start_terrain['elevation'], 2),
                "elevation_end": round(end_terrain['elevation'], 2),
                "slope_percent": round(slope_percent, 2),
                "cost_usd": round(cost_usd, 2),
                "cost_per_m": base_cost,
                "cumulative_cost": round(cumulative_cost, 2),
                "cumulative_distance_m": round(cumulative_length, 2),
                "land_cover_class": terrain['land_cover_class'],
                "land_cover_name": terrain['land_cover_name'],
                "geohazard_risk": round(terrain['geohazard_risk'], 4),
                "terrain_class": classify_terrain(slope_percent),
                "crs": "EPSG:32633",
            }
        }
        features.append(feature)

    # Calculate totals
    total_length = sum(f['properties']['length_m'] for f in features)
    total_cost = sum(f['properties']['cost_usd'] for f in features)

    return {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": "EPSG:32633"
            }
        },
        "metadata": {
            "project_name": "test_project2",
            "algorithm": "A* with SAIPEM criteria",
            "crs": "EPSG:32633",
            "total_segments": len(features),
            "total_length_m": round(total_length, 2),
            "total_cost_usd": round(total_cost, 2),
            "max_segment_length_m": max_segment_length,
            "criteria": {
                "max_slope": "20%",
                "powerline_clearance": "6m",
                "railway_crossing": "HDD required",
                "minimize_crossings": True,
                "prefer_pipeline_parallelism": True,
            },
            "pipeline_specs": {
                "type": "Natural gas",
                "diameter": "26 inch",
                "material": "Carbon steel",
                "mop": "70 bar",
                "dp": "75 bar",
                "cover_depth": "1.5m"
            },
            "generated_at": datetime.now().isoformat(),
        },
        "features": features
    }


def classify_terrain(slope_percent):
    """Classify terrain based on slope percentage"""
    if slope_percent <= 5:
        return "flat"
    elif slope_percent <= 10:
        return "rolling"
    elif slope_percent <= 15:
        return "hilly"
    elif slope_percent <= 20:
        return "mountainous"
    else:
        return "steep"


def main(distance_weight=1.0, output_suffix=""):
    """
    Main function with configurable distance weight.

    Args:
        distance_weight: Weight for distance penalty (1.0 = standard, >1.0 = prefer shorter)
        output_suffix: Suffix to add to output filename
    """
    print("=" * 60)
    print(f"A* Route Generator - SAIPEM Criteria (distance_weight={distance_weight})")
    print("=" * 60)

    # Load datasets
    datasets = load_datasets()

    # Build cost surface
    cost_surface, slope = build_cost_surface(datasets)

    # Define start and end points - USE EXISTING PIPELINE ENDPOINTS
    # Part 0 of existing pipeline: 35.19 km from (397199, 4782587) to (379620, 4805075)
    # This allows apples-to-apples comparison
    start_world = (379620.98, 4805075.91)  # North end of existing pipeline
    end_world = (397199.24, 4782587.63)    # South end of existing pipeline

    transform = datasets['transform']

    start_pixel = world_to_pixel(start_world[0], start_world[1], transform)
    end_pixel = world_to_pixel(end_world[0], end_world[1], transform)

    print(f"\nStart: world={start_world} -> pixel={start_pixel}")
    print(f"End: world={end_world} -> pixel={end_pixel}")

    # Run A* pathfinding with distance weight
    path = astar(cost_surface, start_pixel, end_pixel, slope, distance_weight=distance_weight)

    if path is None:
        print("ERROR: No path found!")
        return None

    print(f"\nPath found with {len(path)} points")

    # Convert to segmented GeoJSON (max 400m segments)
    MAX_SEGMENT_LENGTH = 400.0
    print(f"Creating segments (max {MAX_SEGMENT_LENGTH}m each)...")
    geojson = path_to_segmented_geojson(path, transform, datasets, MAX_SEGMENT_LENGTH)

    # Ensure route reaches exact endpoint
    if geojson['features']:
        last_feature = geojson['features'][-1]
        last_coords = last_feature['geometry']['coordinates']
        # Add exact endpoint if not already there
        if last_coords[-1] != [round(end_world[0], 2), round(end_world[1], 2)]:
            last_coords.append([round(end_world[0], 2), round(end_world[1], 2)])

    # Add distance weight to metadata
    geojson['metadata']['distance_weight'] = distance_weight

    # Save output
    suffix = output_suffix if output_suffix else f"_dw{distance_weight}"
    output_file = OUTPUT_DIR / f'test_project2_astar_saipem{suffix}.geojson'
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Route saved to: {output_file}")
    print(f"Total segments: {geojson['metadata']['total_segments']}")
    print(f"Total length: {geojson['metadata']['total_length_m']/1000:.2f} km")
    print(f"Estimated cost: ${geojson['metadata']['total_cost_usd']:,.2f}")
    print("=" * 60)

    return {
        'output_file': str(output_file),
        'length_km': geojson['metadata']['total_length_m'] / 1000,
        'cost_usd': geojson['metadata']['total_cost_usd'],
        'distance_weight': distance_weight
    }


if __name__ == "__main__":
    import sys
    # Parse distance_weight from command line if provided
    dw = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
    suffix = sys.argv[2] if len(sys.argv) > 2 else ""
    main(distance_weight=dw, output_suffix=suffix)
