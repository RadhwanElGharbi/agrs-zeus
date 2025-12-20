#!/usr/bin/env python3
"""
A* Route Generator - MINIMIZE CROSSINGS variant
Creates a route that heavily penalizes all infrastructure crossings
(roads, railways, waterways, powerlines) to find a path with minimal crossings.

Based on astar_route_generator.py but with 10x crossing cost multipliers.
"""

import numpy as np
import rasterio
import geopandas as gpd
from shapely.geometry import Point, LineString
from shapely.ops import nearest_points
import heapq
import json
from pathlib import Path
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/Ravenna-Chieti-Pipeline')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
VECTOR_DIR = PROJECT_DIR / 'data/vectors/processed'
OUTPUT_DIR = PROJECT_DIR / 'PIRL/outputs'

# SAIPEM Criteria
CRITERIA = {
    'max_slope_percent': 20.0,
    'powerline_clearance_m': 6.0,
    'house_clearance_m': 13.5,
    'railway_clearance_m': 10.0,
    'pipeline_parallel_bonus_m': 100.0,
    'min_pipeline_distance_m': 0.5,
}

# COST MATRIX - WITH 10X CROSSING PENALTIES for minimum crossings optimization
COST_MATRIX = {
    'base_cost_per_m': 1800.0,  # $1,800/m base

    'terrain_adders': {
        'flat': 0.0,
        'rolling': 200.0,
        'hilly': 500.0,
        'mountainous': 1000.0,
        'steep': 5000.0,
    },

    'landcover_adders': {
        0: 0.0,
        10: 150.0,    # Tree cover
        20: 50.0,     # Shrubland
        30: 20.0,     # Grassland
        40: 80.0,     # Cropland
        50: 500.0,    # Built-up
        60: 10.0,     # Bare/sparse
        70: 200.0,    # Snow/ice
        80: 10000.0,  # Water bodies
        90: 300.0,    # Wetland
        95: 500.0,    # Mangroves
        100: 150.0,   # Moss/lichen
    },

    # CROSSING COSTS - 2X MULTIPLIER to minimize crossings
    'crossing_costs': {
        'major_road': 400000.0,     # 2x: was $200k, now $400k
        'minor_road': 200000.0,     # 2x: was $100k, now $200k
        'railway': 2000000.0,       # 2x: was $1M, now $2M
        'powerline': 300000.0,      # 2x: was $150k, now $300k
        'waterway_small': 240000.0, # 2x: was $120k, now $240k
        'waterway_large': 1000000.0, # 2x: was $500k, now $1M
    },

    'geohazard_adders': {
        0: 0.0,
        1: 0.0,
        2: 100.0,
        3: 300.0,
        4: 500.0,
    },

    'regional_multiplier': 1.2,
}


def resample_to_shape(src_array, src_transform, src_shape, dst_shape, dst_transform):
    """Resample array to match destination shape"""
    from scipy.ndimage import zoom
    zoom_row = dst_shape[0] / src_shape[0]
    zoom_col = dst_shape[1] / src_shape[1]
    return zoom(src_array, (zoom_row, zoom_col), order=0)


def load_datasets():
    """Load all raster and vector datasets"""
    print("Loading datasets...")
    datasets = {}

    with rasterio.open(RASTER_DIR / 'dem_epsg32633_processed.tif') as src:
        datasets['dem'] = src.read(1)
        datasets['transform'] = src.transform
        datasets['crs'] = src.crs
        datasets['shape'] = src.shape
        datasets['bounds'] = src.bounds

    ref_shape = datasets['shape']
    ref_transform = datasets['transform']

    with rasterio.open(RASTER_DIR / 'landcover_epsg32633_processed.tif') as src:
        lc = src.read(1)
        if lc.shape != ref_shape:
            datasets['landcover'] = resample_to_shape(lc, src.transform, lc.shape, ref_shape, ref_transform)
        else:
            datasets['landcover'] = lc

    with rasterio.open(RASTER_DIR / 'geohazards_epsg32633_processed.tif') as src:
        gh = src.read(1)
        if gh.shape != ref_shape:
            datasets['geohazards'] = resample_to_shape(gh, src.transform, gh.shape, ref_shape, ref_transform)
        else:
            datasets['geohazards'] = gh

    datasets['roads'] = gpd.read_file(VECTOR_DIR / 'osm_roads_epsg32633_processed.gpkg')
    datasets['railways'] = gpd.read_file(VECTOR_DIR / 'osm_railways_epsg32633_processed.gpkg')
    datasets['powerlines'] = gpd.read_file(VECTOR_DIR / 'osm_power_lines_epsg32633_processed.gpkg')
    datasets['waterways'] = gpd.read_file(VECTOR_DIR / 'osm_waterways_epsg32633_processed.gpkg')
    datasets['pipelines'] = gpd.read_file(VECTOR_DIR / 'pipelines_epsg32633_processed.gpkg')
    datasets['aoi'] = gpd.read_file(VECTOR_DIR / 'aoi_epsg32633_processed.gpkg')

    print(f"  DEM shape: {datasets['dem'].shape}")
    print(f"  Roads: {len(datasets['roads'])} features")
    print(f"  Railways: {len(datasets['railways'])} features")
    print(f"  Waterways: {len(datasets['waterways'])} features")
    print(f"  Powerlines: {len(datasets['powerlines'])} features")

    return datasets


def compute_slope(dem, transform):
    """Compute slope in percent from DEM"""
    cell_size = abs(transform[0])
    dy, dx = np.gradient(dem, cell_size)
    return np.sqrt(dx**2 + dy**2) * 100


def rasterize_vectors(gdf, shape, transform, buffer_m=0):
    """Rasterize vector geometries to a binary mask"""
    from rasterio.features import rasterize

    if len(gdf) == 0:
        return np.zeros(shape, dtype=np.uint8)

    if buffer_m > 0:
        gdf = gdf.copy()
        gdf['geometry'] = gdf.geometry.buffer(buffer_m)

    shapes = [(geom, 1) for geom in gdf.geometry if geom is not None]
    if not shapes:
        return np.zeros(shape, dtype=np.uint8)

    return rasterize(shapes=shapes, out_shape=shape, transform=transform, fill=0, dtype=np.uint8)


def build_cost_surface(datasets):
    """Build cost surface with HEAVILY PENALIZED CROSSINGS"""
    print("Building cost surface (MINIMIZE CROSSINGS mode - 2x crossing penalties)...")

    dem = datasets['dem']
    transform = datasets['transform']
    shape = datasets['shape']
    cell_size = abs(transform[0])

    base_cost = COST_MATRIX['base_cost_per_m']
    cost = np.ones(shape, dtype=np.float32) * base_cost
    print(f"  Base cost: ${base_cost:,.0f}/m")

    # Slope adders
    slope = compute_slope(dem, transform)
    terrain_adder = np.zeros_like(slope)
    terrain_adder[slope <= 5] = COST_MATRIX['terrain_adders']['flat']
    terrain_adder[(slope > 5) & (slope <= 10)] = COST_MATRIX['terrain_adders']['rolling']
    terrain_adder[(slope > 10) & (slope <= 15)] = COST_MATRIX['terrain_adders']['hilly']
    terrain_adder[(slope > 15) & (slope <= 20)] = COST_MATRIX['terrain_adders']['mountainous']
    steep_mask = slope > CRITERIA['max_slope_percent']
    terrain_adder[steep_mask] = 500000.0
    cost += terrain_adder
    print(f"  Terrain: BLOCKED {np.sum(steep_mask)} cells with slope > {CRITERIA['max_slope_percent']}%")

    # Landcover adders (match baseline - high penalty for built-up, not blocked)
    landcover = datasets['landcover']
    lc_adder = np.zeros_like(landcover, dtype=np.float32)
    for lc_class, lc_value in COST_MATRIX['landcover_adders'].items():
        lc_adder[landcover == lc_class] = lc_value
    built_up_mask = landcover == 50
    # High penalty for built-up but not blocked (match baseline)
    lc_adder[built_up_mask] = 500.0  # High penalty, not blocking
    cost += lc_adder
    print(f"  Landcover: HIGH PENALTY {np.sum(built_up_mask)} built-up cells")

    # Geohazard adders
    geohazards = datasets['geohazards']
    gh_adder = np.zeros_like(geohazards, dtype=np.float32)
    for gh_class, gh_value in COST_MATRIX['geohazard_adders'].items():
        gh_adder[geohazards == gh_class] = gh_value
    cost += gh_adder

    # HEAVY CROSSING PENALTIES (10x normal)
    print("  Applying 2x crossing penalties to minimize infrastructure crossings...")

    # Waterways - 10x penalty
    waterway_buffer = 50
    waterway_mask = rasterize_vectors(datasets['waterways'], shape, transform, buffer_m=waterway_buffer)
    waterway_adder = COST_MATRIX['crossing_costs']['waterway_small'] / waterway_buffer
    cost[waterway_mask > 0] += waterway_adder
    print(f"    Waterway: {np.sum(waterway_mask > 0)} cells, ${waterway_adder:,.0f}/m adder (2x)")

    # Railways - 2x penalty
    railway_buffer = 30
    railway_mask = rasterize_vectors(datasets['railways'], shape, transform, buffer_m=railway_buffer)
    railway_adder = COST_MATRIX['crossing_costs']['railway'] / railway_buffer
    cost[railway_mask > 0] += railway_adder
    print(f"    Railway: {np.sum(railway_mask > 0)} cells, ${railway_adder:,.0f}/m adder (2x)")

    # Roads - 2x penalty
    roads = datasets['roads']
    major_roads = roads[roads['highway'].isin(['motorway', 'trunk', 'primary', 'secondary'])]
    minor_roads = roads[~roads['highway'].isin(['motorway', 'trunk', 'primary', 'secondary'])]

    major_road_buffer = 40
    minor_road_buffer = 20
    major_road_mask = rasterize_vectors(major_roads, shape, transform, buffer_m=major_road_buffer)
    minor_road_mask = rasterize_vectors(minor_roads, shape, transform, buffer_m=minor_road_buffer)

    major_road_adder = COST_MATRIX['crossing_costs']['major_road'] / major_road_buffer
    minor_road_adder = COST_MATRIX['crossing_costs']['minor_road'] / minor_road_buffer
    cost[major_road_mask > 0] += major_road_adder
    cost[minor_road_mask > 0] += minor_road_adder
    print(f"    Major roads: {np.sum(major_road_mask > 0)} cells, ${major_road_adder:,.0f}/m adder (2x)")
    print(f"    Minor roads: {np.sum(minor_road_mask > 0)} cells, ${minor_road_adder:,.0f}/m adder (2x)")

    # Powerlines - 2x penalty
    powerline_buffer = 20
    powerline_mask = rasterize_vectors(datasets['powerlines'], shape, transform, buffer_m=powerline_buffer)
    powerline_adder = COST_MATRIX['crossing_costs']['powerline'] / powerline_buffer
    cost[powerline_mask > 0] += powerline_adder
    print(f"    Powerlines: {np.sum(powerline_mask > 0)} cells, ${powerline_adder:,.0f}/m adder (2x)")

    # Pipeline parallelism bonus
    if len(datasets['pipelines']) > 0:
        pipeline_buffer = rasterize_vectors(datasets['pipelines'], shape, transform, buffer_m=CRITERIA['pipeline_parallel_bonus_m'])
        pipeline_close = rasterize_vectors(datasets['pipelines'], shape, transform, buffer_m=5)
        bonus_zone = (pipeline_buffer > 0) & (pipeline_close == 0)
        cost[bonus_zone] *= 0.85
        print(f"    Pipeline bonus: {np.sum(bonus_zone)} cells get 15% discount")

    # Water bodies
    cost[landcover == 80] = base_cost + 10000.0

    # AOI constraint
    aoi_mask = rasterize_vectors(datasets['aoi'], shape, transform, buffer_m=0)
    outside_aoi = (aoi_mask == 0)
    cost[outside_aoi] = 500000.0
    print(f"  AOI: {np.sum(aoi_mask > 0)} cells inside, {np.sum(outside_aoi)} cells blocked")

    cost = np.clip(cost, base_cost, 500000.0)
    print(f"  Cost surface: min=${cost.min():,.0f}, max=${cost.max():,.0f}, mean=${cost.mean():,.0f}")

    return cost, slope


def world_to_pixel(x, y, transform):
    col = int((x - transform[2]) / transform[0])
    row = int((y - transform[5]) / transform[4])
    return row, col


def pixel_to_world(row, col, transform):
    x = transform[2] + col * transform[0] + transform[0] / 2
    y = transform[5] + row * transform[4] + transform[4] / 2
    return x, y


def astar(cost_surface, start_pixel, end_pixel, slope=None, distance_weight=1.0):
    """A* pathfinding with distance penalty"""
    print(f"Running A* from {start_pixel} to {end_pixel} (distance_weight={distance_weight})...")

    rows, cols = cost_surface.shape
    start = tuple(start_pixel)
    end = tuple(end_pixel)

    if not (0 <= start[0] < rows and 0 <= start[1] < cols):
        raise ValueError(f"Start point {start} out of bounds")
    if not (0 <= end[0] < rows and 0 <= end[1] < cols):
        raise ValueError(f"End point {end} out of bounds")

    directions = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    dist_mult = [1.0, 1.0, 1.0, 1.0, 1.414, 1.414, 1.414, 1.414]

    def heuristic(a, b):
        return np.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)

    open_set = [(heuristic(start, end), 0, start, [start])]
    visited = set()
    iterations = 0
    max_iterations = 10000000

    while open_set and iterations < max_iterations:
        iterations += 1
        if iterations % 100000 == 0:
            print(f"  Iteration {iterations}, queue size: {len(open_set)}")

        f, g, current, path = heapq.heappop(open_set)

        if current in visited:
            continue
        visited.add(current)

        if current == end:
            print(f"  Path found! Length: {len(path)} points, iterations: {iterations}")
            return path

        if heuristic(current, end) < 2:
            path.append(end)
            print(f"  Path found! Length: {len(path)} points, iterations: {iterations}")
            return path

        for i, (dr, dc) in enumerate(directions):
            nr, nc = current[0] + dr, current[1] + dc

            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in visited:
                cell_cost = cost_surface[nr, nc]
                if cell_cost > 400000:
                    continue

                base_cost = COST_MATRIX['base_cost_per_m']
                distance_penalty = distance_weight * base_cost * dist_mult[i]
                move_cost = (cell_cost * dist_mult[i]) + distance_penalty

                if len(path) >= 2:
                    prev_dr = path[-1][0] - path[-2][0]
                    prev_dc = path[-1][1] - path[-2][1]
                    if (dr != prev_dr or dc != prev_dc):
                        move_cost *= 1.1

                new_g = g + move_cost
                new_f = new_g + heuristic((nr, nc), end)
                heapq.heappush(open_set, (new_f, new_g, (nr, nc), path + [(nr, nc)]))

    print(f"  No path found after {iterations} iterations")
    return None


def simplify_path(path, tolerance=5):
    if len(path) < 3:
        return path
    line = LineString([(p[1], p[0]) for p in path])
    simplified = line.simplify(tolerance, preserve_topology=True)
    return [(int(c[1]), int(c[0])) for c in simplified.coords]


def segment_path(path, transform, max_segment_length=400.0):
    world_coords = [pixel_to_world(row, col, transform) for row, col in path]

    segments = []
    current_segment = [world_coords[0]]
    current_length = 0.0

    for i in range(1, len(world_coords)):
        x1, y1 = world_coords[i-1]
        x2, y2 = world_coords[i]
        dist = np.sqrt((x2-x1)**2 + (y2-y1)**2)

        if current_length + dist > max_segment_length and len(current_segment) > 1:
            segments.append(current_segment)
            current_segment = [world_coords[i-1]]
            current_length = 0.0

        current_segment.append(world_coords[i])
        current_length += dist

    if len(current_segment) > 1:
        segments.append(current_segment)

    return segments


def get_terrain_info(row, col, datasets):
    shape = datasets['dem'].shape
    row = max(0, min(row, shape[0]-1))
    col = max(0, min(col, shape[1]-1))

    lc_names = {
        10: "tree_cover", 20: "shrubland", 30: "grassland",
        40: "cropland", 50: "built_up", 60: "bare_sparse",
        70: "snow_ice", 80: "water", 90: "wetland",
        95: "mangroves", 100: "moss_lichen"
    }

    return {
        'elevation': float(datasets['dem'][row, col]),
        'land_cover_class': int(datasets['landcover'][row, col]),
        'land_cover_name': lc_names.get(int(datasets['landcover'][row, col]), "unknown"),
        'geohazard_risk': float(datasets['geohazards'][row, col]) / 4.0,
    }


def path_to_segmented_geojson(path, transform, datasets, slope, cost_surface, max_segment_length=400.0):
    """Convert path to segmented GeoJSON"""
    segments = segment_path(path, transform, max_segment_length)

    features = []
    cumulative_length = 0.0
    cumulative_cost = 0.0

    for seg_idx, segment in enumerate(segments):
        if len(segment) < 2:
            continue

        seg_length = sum(
            np.sqrt((segment[i][0]-segment[i-1][0])**2 + (segment[i][1]-segment[i-1][1])**2)
            for i in range(1, len(segment))
        )

        mid_idx = len(segment) // 2
        mid_x, mid_y = segment[mid_idx]
        mid_row, mid_col = world_to_pixel(mid_x, mid_y, transform)
        terrain = get_terrain_info(mid_row, mid_col, datasets)

        mid_slope = float(slope[mid_row, mid_col]) if 0 <= mid_row < slope.shape[0] and 0 <= mid_col < slope.shape[1] else 0.0

        if mid_slope <= 5:
            terrain_class = "flat"
        elif mid_slope <= 10:
            terrain_class = "rolling"
        elif mid_slope <= 15:
            terrain_class = "hilly"
        elif mid_slope <= 20:
            terrain_class = "mountainous"
        else:
            terrain_class = "steep"

        base_rate = COST_MATRIX['base_cost_per_m']
        terrain_rate = COST_MATRIX['terrain_adders'].get(terrain_class, 0)
        lc_rate = COST_MATRIX['landcover_adders'].get(terrain['land_cover_class'], 0)
        seg_cost = (base_rate + terrain_rate + lc_rate) * seg_length

        cumulative_length += seg_length
        cumulative_cost += seg_cost

        start_terrain = get_terrain_info(*world_to_pixel(segment[0][0], segment[0][1], transform), datasets)
        end_terrain = get_terrain_info(*world_to_pixel(segment[-1][0], segment[-1][1], transform), datasets)

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[round(x, 2), round(y, 2)] for x, y in segment]
            },
            "properties": {
                "segment_id": seg_idx + 1,
                "length_m": round(seg_length, 2),
                "cumulative_length_m": round(cumulative_length, 2),
                "elevation_start": round(start_terrain['elevation'], 1),
                "elevation_end": round(end_terrain['elevation'], 1),
                "slope_percent": round(mid_slope, 1),
                "terrain_class": terrain_class,
                "land_cover_class": terrain['land_cover_class'],
                "land_cover_name": terrain['land_cover_name'],
                "geohazard_risk": round(terrain['geohazard_risk'], 2),
                "cost_usd": round(seg_cost, 0),
                "cumulative_cost_usd": round(cumulative_cost, 0),
            }
        }
        features.append(feature)

    # Get start and end coords
    start_x, start_y = pixel_to_world(path[0][0], path[0][1], transform)
    end_x, end_y = pixel_to_world(path[-1][0], path[-1][1], transform)

    geojson = {
        "type": "FeatureCollection",
        "name": "Ravenna-Chieti-Pipeline_astar_min_crossings",
        "crs": {"type": "name", "properties": {"name": "EPSG:32633"}},
        "metadata": {
            "algorithm": "A* with 2x crossing penalties",
            "optimization": "minimize_crossings",
            "crossing_multiplier": 2,
            "generated": datetime.now().isoformat(),
            "total_segments": len(features),
            "total_length_m": round(cumulative_length, 2),
            "total_length_km": round(cumulative_length / 1000, 2),
            "total_cost_usd": round(cumulative_cost, 0),
            "cost_per_km_usd": round(cumulative_cost / (cumulative_length / 1000), 0) if cumulative_length > 0 else 0,
            "regional_multiplier": COST_MATRIX['regional_multiplier'],
            "start_point_utm": [round(start_x, 2), round(start_y, 2)],
            "end_point_utm": [round(end_x, 2), round(end_y, 2)],
        },
        "features": features
    }

    return geojson


def count_crossings(path, transform, datasets):
    """Count the number of infrastructure crossings in the path"""
    from shapely.geometry import LineString

    # Convert path to LineString
    coords = [pixel_to_world(r, c, transform) for r, c in path]
    if len(coords) < 2:
        return {}

    route_line = LineString(coords)

    crossings = {
        'roads': 0,
        'railways': 0,
        'waterways': 0,
        'powerlines': 0,
        'total': 0
    }

    # Count road crossings
    for _, road in datasets['roads'].iterrows():
        if road.geometry and route_line.intersects(road.geometry):
            crossings['roads'] += 1

    # Count railway crossings
    for _, rail in datasets['railways'].iterrows():
        if rail.geometry and route_line.intersects(rail.geometry):
            crossings['railways'] += 1

    # Count waterway crossings
    for _, water in datasets['waterways'].iterrows():
        if water.geometry and route_line.intersects(water.geometry):
            crossings['waterways'] += 1

    # Count powerline crossings
    for _, power in datasets['powerlines'].iterrows():
        if power.geometry and route_line.intersects(power.geometry):
            crossings['powerlines'] += 1

    crossings['total'] = sum([crossings['roads'], crossings['railways'], crossings['waterways'], crossings['powerlines']])

    return crossings


def main():
    print("=" * 70)
    print("A* ROUTE GENERATOR - MINIMIZE CROSSINGS VARIANT")
    print("=" * 70)
    print("This variant applies 2x penalties to all infrastructure crossings")
    print("to find a route with fewer crossings than the existing SNAM pipeline (92 total).\n")

    # Load data
    datasets = load_datasets()

    # Build cost surface with heavy crossing penalties
    cost_surface, slope = build_cost_surface(datasets)

    # Use SNAM pipeline endpoints for direct comparison
    # SNAM pipeline: Start (north) to End (south)
    # These are the actual endpoints from the existing SNAM pipeline
    start_x, start_y = 397199.24, 4782587.63  # SNAM start (south end)
    end_x, end_y = 379620.98, 4805075.91      # SNAM end (north end)
    print(f"\nUsing SNAM pipeline endpoints for direct comparison:")

    print(f"\nEndpoints:")
    print(f"  Start: ({start_x:.2f}, {start_y:.2f})")
    print(f"  End: ({end_x:.2f}, {end_y:.2f})")

    # Convert to pixels
    transform = datasets['transform']
    start_pixel = world_to_pixel(start_x, start_y, transform)
    end_pixel = world_to_pixel(end_x, end_y, transform)

    print(f"  Start pixel: {start_pixel}")
    print(f"  End pixel: {end_pixel}")

    # Run A* with standard distance weight
    path = astar(cost_surface, start_pixel, end_pixel, slope, distance_weight=1.0)

    if path is None:
        print("\nERROR: No path found!")
        return

    # Simplify path - use very low tolerance to preserve crossing avoidance
    print(f"\nSimplifying path...")
    simplified = simplify_path(path, tolerance=1)
    print(f"  Original: {len(path)} points -> Simplified: {len(simplified)} points")

    # Count crossings
    print("\nCounting infrastructure crossings...")
    crossings = count_crossings(simplified, transform, datasets)
    print(f"  Roads: {crossings['roads']}")
    print(f"  Railways: {crossings['railways']}")
    print(f"  Waterways: {crossings['waterways']}")
    print(f"  Powerlines: {crossings['powerlines']}")
    print(f"  TOTAL CROSSINGS: {crossings['total']}")

    # Convert to GeoJSON
    print("\nGenerating GeoJSON...")
    geojson = path_to_segmented_geojson(simplified, transform, datasets, slope, cost_surface)

    # Add crossing counts to metadata
    geojson['metadata']['crossings'] = crossings

    # Save output
    output_file = OUTPUT_DIR / 'Ravenna-Chieti-Pipeline_astar_min_crossings.geojson'
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    print(f"\n{'=' * 70}")
    print("ROUTE GENERATION COMPLETE")
    print(f"{'=' * 70}")
    print(f"Output: {output_file}")
    print(f"Total length: {geojson['metadata']['total_length_km']:.2f} km")
    print(f"Total segments: {geojson['metadata']['total_segments']}")
    print(f"Total crossings: {crossings['total']}")
    print(f"  - Roads: {crossings['roads']}")
    print(f"  - Railways: {crossings['railways']}")
    print(f"  - Waterways: {crossings['waterways']}")
    print(f"  - Powerlines: {crossings['powerlines']}")


if __name__ == '__main__':
    main()
