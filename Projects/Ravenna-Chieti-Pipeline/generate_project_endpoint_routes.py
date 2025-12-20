#!/usr/bin/env python3
"""
Generate 3 PIRL routes using PROJECT ENDPOINTS (not SNAM endpoints):
1. PIRL_min_crossings_project_endpoints - 2x crossing penalties
2. PIRL_saipem_compliant_project_endpoints - Full SAIPEM compliance (blocks slope>20%, built-up, water)
3. PIRL_saipem_project_endpoints - Standard SAIPEM criteria (blocks slope>20%, built-up; water=high penalty)

All routes use the project endpoints:
  Start: (379647.98, 4805029.95) - North end
  End: (408344.71, 4750423.54) - South end
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

# PROJECT ENDPOINTS (different from SNAM endpoints)
PROJECT_START = (379647.98, 4805029.95)  # North end
PROJECT_END = (408344.71, 4750423.54)    # South end

# SAIPEM Criteria
CRITERIA = {
    'max_slope_percent': 20.0,
    'powerline_clearance_m': 6.0,
    'house_clearance_m': 13.5,
    'railway_clearance_m': 10.0,
    'pipeline_parallel_bonus_m': 100.0,
    'min_pipeline_distance_m': 0.5,
}

# Standard Cost Matrix for metadata
COST_MATRIX = {
    "version": "2.0",
    "calibration_date": "2025-12-13",
    "reference": "SNAM Ravenna-Chieti reconstruction, EU pipeline benchmarks",
    "base_construction_per_m": 800.0,
    "trenching_per_m": {
        "soft_soil": {"slope_range": "0-5%", "cost": 200.0, "description": "Alluvial plains, easy excavation"},
        "medium_soil": {"slope_range": "5-10%", "cost": 350.0, "description": "Mixed soil, standard equipment"},
        "hard_soil": {"slope_range": "10-15%", "cost": 500.0, "description": "Compact soil, soft rock"},
        "rock_mixed": {"slope_range": "15-25%", "cost": 800.0, "description": "Rock outcrops, ripping needed"},
        "hard_rock": {"slope_range": ">25%", "cost": 1500.0, "description": "Solid rock, blasting required"}
    },
    "landcover_per_m": {
        "cropland": {"class": 40, "cost": 80.0, "description": "Compensation + restoration"},
        "grassland": {"class": 30, "cost": 20.0, "description": "Minimal, topsoil handling"},
        "tree_cover": {"class": 10, "cost": 150.0, "description": "Clearing + grubbing + restoration"},
        "shrubland": {"class": 20, "cost": 50.0, "description": "Light clearing"},
        "built_up": {"class": 50, "cost": 500.0, "description": "Utility relocation, permits"},
        "bare_sparse": {"class": 60, "cost": 10.0, "description": "Easiest terrain"},
        "water": {"class": 80, "cost": 300.0, "description": "Special construction (HDD typically)"},
        "wetland": {"class": 90, "cost": 300.0, "description": "Environmental mitigation"},
        "snow_ice": {"class": 70, "cost": 200.0, "description": "Seasonal constraints"},
        "unknown": {"class": 0, "cost": 50.0, "description": "Default"}
    },
    "crossing_costs": {
        "road": 60000,
        "railway": 1200000,
        "waterway": 80000,
        "powerline": 150000
    },
    "regional_multiplier": 1.2
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


def build_cost_surface(datasets, mode='standard', crossing_multiplier=1.0):
    """
    Build cost surface with different modes:
    - 'standard': Standard SAIPEM (blocks slope>20%, built-up; water=high penalty)
    - 'compliant': Full compliance (blocks slope>20%, built-up, water)
    - 'min_crossings': 2x crossing penalties (blocks slope>20%; built-up/water=high penalty)
    """
    print(f"Building cost surface (mode={mode}, crossing_mult={crossing_multiplier})...")

    dem = datasets['dem']
    transform = datasets['transform']
    shape = datasets['shape']

    base_cost = 1800.0
    cost = np.ones(shape, dtype=np.float32) * base_cost

    # Slope
    slope = compute_slope(dem, transform)
    terrain_adder = np.zeros_like(slope)
    terrain_adder[slope <= 5] = 0.0
    terrain_adder[(slope > 5) & (slope <= 10)] = 200.0
    terrain_adder[(slope > 10) & (slope <= 15)] = 500.0
    terrain_adder[(slope > 15) & (slope <= 20)] = 1000.0
    # BLOCK slopes > 20%
    steep_mask = slope > CRITERIA['max_slope_percent']
    terrain_adder[steep_mask] = 500000.0
    cost += terrain_adder
    print(f"  Terrain: BLOCKED {np.sum(steep_mask)} cells with slope > {CRITERIA['max_slope_percent']}%")

    # Landcover
    landcover = datasets['landcover']
    lc_adder = np.zeros_like(landcover, dtype=np.float32)
    lc_adders = {0: 0.0, 10: 150.0, 20: 50.0, 30: 20.0, 40: 80.0, 50: 500.0, 60: 10.0, 70: 200.0, 80: 10000.0, 90: 300.0, 95: 500.0, 100: 150.0}
    for lc_class, lc_value in lc_adders.items():
        lc_adder[landcover == lc_class] = lc_value

    built_up_mask = landcover == 50
    water_mask = landcover == 80

    if mode == 'compliant':
        # Full compliance: very high penalty for built-up AND water (to avoid but not completely block)
        # This ensures the route avoids these areas as much as possible while still finding a path
        lc_adder[built_up_mask] = 100000.0  # Very high penalty
        lc_adder[water_mask] = 100000.0     # Very high penalty
        print(f"  VERY HIGH PENALTY (compliant): {np.sum(built_up_mask)} built-up cells, {np.sum(water_mask)} water cells")
    elif mode == 'standard':
        # Standard: very high penalty for built-up, high penalty for water
        lc_adder[built_up_mask] = 100000.0  # Very high penalty
        lc_adder[water_mask] = 10000.0
        print(f"  VERY HIGH PENALTY: {np.sum(built_up_mask)} built-up cells; HIGH PENALTY: {np.sum(water_mask)} water cells")
    else:  # min_crossings
        # Min crossings: high penalty for both (not blocked)
        lc_adder[built_up_mask] = 500.0
        lc_adder[water_mask] = 10000.0
        print(f"  HIGH PENALTY: {np.sum(built_up_mask)} built-up cells, {np.sum(water_mask)} water cells")

    cost += lc_adder

    # Geohazards
    geohazards = datasets['geohazards']
    gh_adder = np.zeros_like(geohazards, dtype=np.float32)
    gh_adders = {0: 0.0, 1: 0.0, 2: 100.0, 3: 300.0, 4: 500.0}
    for gh_class, gh_value in gh_adders.items():
        gh_adder[geohazards == gh_class] = gh_value
    cost += gh_adder

    # Infrastructure crossings with multiplier
    crossing_costs = {
        'major_road': 200000.0 * crossing_multiplier,
        'minor_road': 100000.0 * crossing_multiplier,
        'railway': 1000000.0 * crossing_multiplier,
        'powerline': 150000.0 * crossing_multiplier,
        'waterway_small': 120000.0 * crossing_multiplier,
        'waterway_large': 500000.0 * crossing_multiplier,
    }

    # Waterways
    waterway_buffer = 50
    waterway_mask = rasterize_vectors(datasets['waterways'], shape, transform, buffer_m=waterway_buffer)
    cost[waterway_mask > 0] += crossing_costs['waterway_small'] / waterway_buffer

    # Railways
    railway_buffer = 30
    railway_mask = rasterize_vectors(datasets['railways'], shape, transform, buffer_m=railway_buffer)
    cost[railway_mask > 0] += crossing_costs['railway'] / railway_buffer

    # Roads
    roads = datasets['roads']
    major_roads = roads[roads['highway'].isin(['motorway', 'trunk', 'primary', 'secondary'])]
    minor_roads = roads[~roads['highway'].isin(['motorway', 'trunk', 'primary', 'secondary'])]
    major_road_mask = rasterize_vectors(major_roads, shape, transform, buffer_m=40)
    minor_road_mask = rasterize_vectors(minor_roads, shape, transform, buffer_m=20)
    cost[major_road_mask > 0] += crossing_costs['major_road'] / 40
    cost[minor_road_mask > 0] += crossing_costs['minor_road'] / 20

    # Powerlines
    powerline_mask = rasterize_vectors(datasets['powerlines'], shape, transform, buffer_m=20)
    cost[powerline_mask > 0] += crossing_costs['powerline'] / 20

    # Pipeline parallelism bonus
    if len(datasets['pipelines']) > 0:
        pipeline_buffer = rasterize_vectors(datasets['pipelines'], shape, transform, buffer_m=CRITERIA['pipeline_parallel_bonus_m'])
        pipeline_close = rasterize_vectors(datasets['pipelines'], shape, transform, buffer_m=5)
        bonus_zone = (pipeline_buffer > 0) & (pipeline_close == 0)
        cost[bonus_zone] *= 0.85

    # AOI constraint
    aoi_mask = rasterize_vectors(datasets['aoi'], shape, transform, buffer_m=0)
    outside_aoi = (aoi_mask == 0)
    cost[outside_aoi] = 500000.0

    cost = np.clip(cost, base_cost, 500000.0)
    print(f"  Cost surface: min=${cost.min():,.0f}, max=${cost.max():,.0f}")

    return cost, slope


def world_to_pixel(x, y, transform):
    col = int((x - transform[2]) / transform[0])
    row = int((y - transform[5]) / transform[4])
    return row, col


def pixel_to_world(row, col, transform):
    x = transform[2] + col * transform[0] + transform[0] / 2
    y = transform[5] + row * transform[4] + transform[4] / 2
    return x, y


def astar(cost_surface, start_pixel, end_pixel, distance_weight=1.0):
    """A* pathfinding"""
    print(f"Running A* from {start_pixel} to {end_pixel}...")

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

        if current == end or heuristic(current, end) < 2:
            if current != end:
                path.append(end)
            print(f"  Path found! {len(path)} points, {iterations} iterations")
            return path

        for i, (dr, dc) in enumerate(directions):
            nr, nc = current[0] + dr, current[1] + dc

            if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in visited:
                cell_cost = cost_surface[nr, nc]
                if cell_cost > 400000:
                    continue

                base_cost = 1800.0
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


def simplify_path(path, tolerance=1):
    if len(path) < 3:
        return path
    line = LineString([(p[1], p[0]) for p in path])
    simplified = line.simplify(tolerance, preserve_topology=True)
    return [(int(c[1]), int(c[0])) for c in simplified.coords]


def count_crossings(path, transform, datasets):
    """Count infrastructure crossings"""
    coords = [pixel_to_world(r, c, transform) for r, c in path]
    if len(coords) < 2:
        return {'roads': 0, 'railways': 0, 'waterways': 0, 'powerlines': 0, 'total': 0}

    route_line = LineString(coords)
    crossings = {'roads': 0, 'railways': 0, 'waterways': 0, 'powerlines': 0}

    for _, road in datasets['roads'].iterrows():
        if road.geometry and route_line.intersects(road.geometry):
            crossings['roads'] += 1

    for _, rail in datasets['railways'].iterrows():
        if rail.geometry and route_line.intersects(rail.geometry):
            crossings['railways'] += 1

    for _, water in datasets['waterways'].iterrows():
        if water.geometry and route_line.intersects(water.geometry):
            crossings['waterways'] += 1

    for _, power in datasets['powerlines'].iterrows():
        if power.geometry and route_line.intersects(power.geometry):
            crossings['powerlines'] += 1

    crossings['total'] = sum(crossings.values())
    return crossings


def analyze_route(path, transform, datasets, slope):
    """Analyze route for terrain, landcover, compliance"""
    landcover = datasets['landcover']

    # Sample along route
    lc_counts = {}
    slope_values = []
    elevations = []
    built_up_length = 0
    water_length = 0
    slope_violation_length = 0

    cell_size = abs(transform[0])

    for i, (row, col) in enumerate(path):
        row = max(0, min(row, landcover.shape[0]-1))
        col = max(0, min(col, landcover.shape[1]-1))

        lc = int(landcover[row, col])
        lc_counts[lc] = lc_counts.get(lc, 0) + 1

        s = float(slope[row, col])
        slope_values.append(s)

        e = float(datasets['dem'][row, col])
        elevations.append(e)

        if lc == 50:
            built_up_length += cell_size
        if lc == 80:
            water_length += cell_size
        if s > CRITERIA['max_slope_percent']:
            slope_violation_length += cell_size

    total_cells = len(path)
    total_length = total_cells * cell_size

    # Landcover distribution
    lc_names = {10: "tree_cover", 20: "shrubland", 30: "grassland", 40: "cropland",
                50: "built_up", 60: "bare_sparse", 70: "snow_ice", 80: "water", 90: "wetland"}

    landcover_dist = {}
    for lc, count in lc_counts.items():
        name = lc_names.get(lc, f"class_{lc}")
        length_m = count * cell_size
        landcover_dist[name] = {
            "length_m": round(length_m, 2),
            "percentage": round(count / total_cells * 100, 2),
            "landcover_class": lc
        }

    # Terrain distribution
    flat = sum(1 for s in slope_values if s <= 5)
    rolling = sum(1 for s in slope_values if 5 < s <= 10)
    hilly = sum(1 for s in slope_values if 10 < s <= 15)
    mountainous = sum(1 for s in slope_values if 15 < s <= 20)
    steep = sum(1 for s in slope_values if s > 20)

    terrain_dist = {
        "flat_pct": round(flat / total_cells * 100, 2),
        "rolling_pct": round(rolling / total_cells * 100, 2),
        "hilly_pct": round(hilly / total_cells * 100, 2),
        "mountainous_pct": round(mountainous / total_cells * 100, 2),
        "steep_pct": round(steep / total_cells * 100, 2)
    }

    terrain_stats = {
        "slope": {
            "min": round(min(slope_values), 2),
            "max": round(max(slope_values), 2),
            "mean": round(np.mean(slope_values), 2),
            "median": round(np.median(slope_values), 2),
            "std": round(np.std(slope_values), 2)
        },
        "elevation": {
            "min": round(min(elevations), 2),
            "max": round(max(elevations), 2),
            "range": round(max(elevations) - min(elevations), 2),
            "total_gain": round(sum(max(0, elevations[i] - elevations[i-1]) for i in range(1, len(elevations))), 2)
        },
        "terrain_distribution": terrain_dist
    }

    # Compliance
    slope_compliant = slope_violation_length == 0
    built_up_compliant = built_up_length == 0
    water_compliant = water_length == 0

    compliance = {
        "slope": {
            "compliant": slope_compliant,
            "max_allowed": CRITERIA['max_slope_percent'],
            "violations": [],
            "total_violation_length_m": round(slope_violation_length, 0),
            "max_found": round(max(slope_values), 2) if slope_values else 0
        },
        "built_up": {
            "compliant": built_up_compliant,
            "violations": [],
            "total_violation_length_m": round(built_up_length, 0)
        },
        "water": {
            "compliant": water_compliant,
            "violations": [],
            "total_violation_length_m": round(water_length, 0)
        },
        "overall_compliant": slope_compliant and built_up_compliant and water_compliant
    }

    return {
        "landcover_distribution": landcover_dist,
        "terrain_statistics": terrain_stats,
        "constraint_compliance": compliance,
        "total_length_m": round(total_length, 2)
    }


def calculate_costs(analysis, crossings):
    """Calculate detailed cost breakdown"""
    total_length = analysis['total_length_m']
    landcover_dist = analysis['landcover_distribution']
    terrain_dist = analysis['terrain_statistics']['terrain_distribution']

    # Base construction
    base_cost = total_length * COST_MATRIX['base_construction_per_m']

    # Trenching based on terrain
    trenching_costs = COST_MATRIX['trenching_per_m']
    soft_length = total_length * terrain_dist['flat_pct'] / 100
    medium_length = total_length * terrain_dist['rolling_pct'] / 100
    hard_length = total_length * terrain_dist['hilly_pct'] / 100
    rock_length = total_length * terrain_dist['mountainous_pct'] / 100
    hard_rock_length = total_length * terrain_dist['steep_pct'] / 100

    trenching_breakdown = {
        "soft_soil": {"length_m": round(soft_length, 2), "cost": round(soft_length * trenching_costs['soft_soil']['cost'], 2)},
        "medium_soil": {"length_m": round(medium_length, 2), "cost": round(medium_length * trenching_costs['medium_soil']['cost'], 2)},
        "hard_soil": {"length_m": round(hard_length, 2), "cost": round(hard_length * trenching_costs['hard_soil']['cost'], 2)},
        "rock_mixed": {"length_m": round(rock_length, 2), "cost": round(rock_length * trenching_costs['rock_mixed']['cost'], 2)},
    }
    if hard_rock_length > 0:
        trenching_breakdown["hard_rock"] = {"length_m": round(hard_rock_length, 2), "cost": round(hard_rock_length * trenching_costs['hard_rock']['cost'], 2)}

    trenching_total = sum(v['cost'] for v in trenching_breakdown.values())

    # Landcover costs
    lc_costs = COST_MATRIX['landcover_per_m']
    landcover_breakdown = {}
    landcover_total = 0
    for name, data in landcover_dist.items():
        rate = lc_costs.get(name, lc_costs['unknown'])['cost']
        cost = data['length_m'] * rate
        landcover_breakdown[name] = {
            "length_m": round(data['length_m'], 2),
            "cost": round(cost, 2),
            "rate": rate
        }
        landcover_total += cost

    # Crossing costs
    crossing_costs = COST_MATRIX['crossing_costs']
    crossings_breakdown = {
        "roads": crossings['roads'] * crossing_costs['road'],
        "railways": crossings['railways'] * crossing_costs['railway'],
        "waterways": crossings['waterways'] * crossing_costs['waterway'],
        "powerlines": crossings['powerlines'] * crossing_costs['powerline']
    }
    crossings_total = sum(crossings_breakdown.values())

    subtotal = base_cost + trenching_total + landcover_total + crossings_total
    total = subtotal * COST_MATRIX['regional_multiplier']

    return {
        "base_construction": {"cost": round(base_cost, 2), "rate_per_m": COST_MATRIX['base_construction_per_m']},
        "trenching": {"cost": round(trenching_total, 2), "breakdown": trenching_breakdown},
        "landcover": {"cost": round(landcover_total, 2), "breakdown": landcover_breakdown},
        "crossings": {"cost": crossings_total, "breakdown": crossings_breakdown},
        "subtotal": round(subtotal, 2),
        "regional_multiplier": COST_MATRIX['regional_multiplier'],
        "total": round(total, 2),
        "cost_per_km": round(total / (total_length / 1000), 2) if total_length > 0 else 0
    }


def save_route_and_metadata(path, transform, datasets, slope, route_name, method_info):
    """Save route GeoJSON and metadata"""
    # Convert path to world coordinates
    coords = [pixel_to_world(r, c, transform) for r, c in path]

    # Create GeoJSON
    features = []
    for i in range(len(coords) - 1):
        segment = [coords[i], coords[i+1]]
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[round(x, 2), round(y, 2)] for x, y in segment]
            },
            "properties": {"segment_id": i + 1}
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "name": route_name,
        "crs": {"type": "name", "properties": {"name": "EPSG:32633"}},
        "features": features
    }

    # Save GeoJSON
    geojson_file = OUTPUT_DIR / f"{route_name}.geojson"
    with open(geojson_file, 'w') as f:
        json.dump(geojson, f, indent=2)
    print(f"  Saved: {geojson_file}")

    # Analyze route
    analysis = analyze_route(path, transform, datasets, slope)
    crossings = count_crossings(path, transform, datasets)
    costs = calculate_costs(analysis, crossings)

    # Calculate actual length from coordinates
    total_length = sum(np.sqrt((coords[i][0]-coords[i-1][0])**2 + (coords[i][1]-coords[i-1][1])**2) for i in range(1, len(coords)))

    # Create metadata
    metadata = {
        "route_file": f"{route_name}.geojson",
        "generated_at": datetime.now().isoformat(),
        "metadata_version": "1.0",
        "route_info": {
            "length_m": round(total_length, 2),
            "length_km": round(total_length / 1000, 2),
            "start_point": [round(coords[0][0], 2), round(coords[0][1], 2)],
            "end_point": [round(coords[-1][0], 2), round(coords[-1][1], 2)],
            "crs": "EPSG:32633"
        },
        "generation_method": method_info,
        "saipem_constraints": {
            "max_slope_percent": CRITERIA['max_slope_percent'],
            "house_clearance_m": CRITERIA['house_clearance_m'],
            "powerline_clearance_m": CRITERIA['powerline_clearance_m'],
            "railway_clearance_m": CRITERIA['railway_clearance_m'],
            "water_blocked": method_info.get('water_blocked', True),
            "built_up_blocked": method_info.get('built_up_blocked', True)
        },
        "constraint_compliance": analysis['constraint_compliance'],
        "terrain_statistics": analysis['terrain_statistics'],
        "landcover_distribution": analysis['landcover_distribution'],
        "infrastructure_crossings": {
            "roads": {"total": crossings['roads'], "by_type": {"all_types": crossings['roads']}, "cost": costs['crossings']['breakdown']['roads']},
            "railways": {"total": crossings['railways'], "by_type": {"rail": crossings['railways']}, "cost": costs['crossings']['breakdown']['railways']},
            "waterways": {"total": crossings['waterways'], "by_type": {"all_types": crossings['waterways']}, "cost": costs['crossings']['breakdown']['waterways']},
            "powerlines": {"total": crossings['powerlines'], "cost": costs['crossings']['breakdown']['powerlines']}
        },
        "cost_breakdown": costs,
        "cost_matrix": COST_MATRIX
    }

    # Save metadata
    metadata_file = OUTPUT_DIR / f"{route_name}.metadata.json"
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"  Saved: {metadata_file}")

    return metadata


def main():
    print("=" * 70)
    print("GENERATING 3 ROUTES WITH PROJECT ENDPOINTS")
    print("=" * 70)
    print(f"Start: {PROJECT_START}")
    print(f"End: {PROJECT_END}")
    print()

    # Load datasets
    datasets = load_datasets()
    transform = datasets['transform']

    # Convert endpoints to pixels
    start_pixel = world_to_pixel(PROJECT_START[0], PROJECT_START[1], transform)
    end_pixel = world_to_pixel(PROJECT_END[0], PROJECT_END[1], transform)
    print(f"Start pixel: {start_pixel}")
    print(f"End pixel: {end_pixel}")
    print()

    results = []

    # =====================================================================
    # Route 1: PIRL_min_crossings_project_endpoints (2x crossing penalties)
    # SKIPPED - Already generated successfully
    # =====================================================================
    print("=" * 70)
    print("Route 1: PIRL_min_crossings_project_endpoints - SKIPPED (already exists)")
    print("=" * 70)
    print()

    # =====================================================================
    # Route 2: PIRL_saipem_compliant_project_endpoints (full compliance)
    # =====================================================================
    print("=" * 70)
    print("Route 2: PIRL_saipem_compliant_project_endpoints")
    print("=" * 70)

    cost_surface, slope = build_cost_surface(datasets, mode='compliant', crossing_multiplier=1.0)
    path = astar(cost_surface, start_pixel, end_pixel)

    if path:
        path = simplify_path(path, tolerance=1)
        metadata = save_route_and_metadata(
            path, transform, datasets, slope,
            "Ravenna-Chieti-Pipeline_PIRL_saipem_compliant_project_endpoints",
            {
                "method": "A* with SAIPEM criteria",
                "algorithm": "A* with SAIPEM criteria",
                "constraint_enforcement": "hard_block",
                "description": "Fully SAIPEM compliant route (blocks slope>20%, built-up, water) using project endpoints",
                "source": "generated",
                "water_blocked": True,
                "built_up_blocked": True
            }
        )
        results.append(("PIRL_saipem_compliant_project_endpoints", metadata))
        print(f"  Length: {metadata['route_info']['length_km']:.2f} km")
        print(f"  Crossings: {sum(metadata['infrastructure_crossings'][k]['total'] for k in ['roads', 'railways', 'waterways', 'powerlines'])}")
        print(f"  Total Cost: ${metadata['cost_breakdown']['total']:,.0f}")
    else:
        print("  ERROR: No path found!")
    print()

    # =====================================================================
    # Route 3: PIRL_saipem_project_endpoints (standard SAIPEM)
    # =====================================================================
    print("=" * 70)
    print("Route 3: PIRL_saipem_project_endpoints")
    print("=" * 70)

    cost_surface, slope = build_cost_surface(datasets, mode='standard', crossing_multiplier=1.0)
    path = astar(cost_surface, start_pixel, end_pixel)

    if path:
        path = simplify_path(path, tolerance=1)
        metadata = save_route_and_metadata(
            path, transform, datasets, slope,
            "Ravenna-Chieti-Pipeline_PIRL_saipem_project_endpoints",
            {
                "method": "A* with SAIPEM criteria",
                "algorithm": "A* with SAIPEM criteria",
                "constraint_enforcement": "hard_and_soft",
                "description": "Standard SAIPEM criteria route (blocks slope>20%, built-up; water=high penalty) using project endpoints",
                "source": "generated",
                "water_blocked": False,
                "built_up_blocked": True
            }
        )
        results.append(("PIRL_saipem_project_endpoints", metadata))
        print(f"  Length: {metadata['route_info']['length_km']:.2f} km")
        print(f"  Crossings: {sum(metadata['infrastructure_crossings'][k]['total'] for k in ['roads', 'railways', 'waterways', 'powerlines'])}")
        print(f"  Total Cost: ${metadata['cost_breakdown']['total']:,.0f}")
    else:
        print("  ERROR: No path found!")
    print()

    # =====================================================================
    # Summary
    # =====================================================================
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"{'Route':<50} {'Length':>10} {'Cross':>8} {'Total Cost':>15}")
    print("-" * 85)
    for name, meta in results:
        length = meta['route_info']['length_km']
        crossings = sum(meta['infrastructure_crossings'][k]['total'] for k in ['roads', 'railways', 'waterways', 'powerlines'])
        cost = meta['cost_breakdown']['total']
        print(f"{name:<50} {length:>8.2f}km {crossings:>8} ${cost:>14,.0f}")
    print("=" * 70)


if __name__ == '__main__':
    main()
