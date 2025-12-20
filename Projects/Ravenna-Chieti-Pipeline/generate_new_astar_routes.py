#!/usr/bin/env python3
"""
Generate new A* routes from project start to end point.
Creates two routes with different distance weights for comparison.
"""

import numpy as np
import rasterio
import geopandas as gpd
from shapely.geometry import Point, LineString
import heapq
import json
from pathlib import Path
from pyproj import Transformer
import warnings
warnings.filterwarnings('ignore')

# Project paths - UPDATED FOR RENAMED PROJECT
PROJECT_DIR = Path('/opt/agrs/Projects/Ravenna-Chieti-Pipeline')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
VECTOR_DIR = PROJECT_DIR / 'data/vectors/processed'
OUTPUT_DIR = PROJECT_DIR / 'PIRL/outputs'

# Load project AOI for start/end points
with open(PROJECT_DIR / 'aoi/project_aoi.json') as f:
    aoi_config = json.load(f)

# Start and end points from project config (WGS84)
START_WGS84 = (aoi_config['start_point']['longitude'], aoi_config['start_point']['latitude'])
END_WGS84 = (aoi_config['end_point']['longitude'], aoi_config['end_point']['latitude'])

# Transform to UTM 33N (EPSG:32633)
transformer = Transformer.from_crs("EPSG:4326", "EPSG:32633", always_xy=True)
START_UTM = transformer.transform(START_WGS84[0], START_WGS84[1])
END_UTM = transformer.transform(END_WGS84[0], END_WGS84[1])

print(f"Start point: WGS84 {START_WGS84} -> UTM {START_UTM}")
print(f"End point: WGS84 {END_WGS84} -> UTM {END_UTM}")

# SAIPEM Criteria
CRITERIA = {
    'max_slope_percent': 20.0,
    'powerline_clearance_m': 6.0,
    'house_clearance_m': 13.5,
    'railway_clearance_m': 10.0,
    'pipeline_parallel_bonus_m': 100.0,
    'min_pipeline_distance_m': 0.5,
}

# Calibrated Cost Matrix
COST_MATRIX = {
    'base_cost_per_m': 1800.0,
    'terrain_adders': {
        'flat': 0.0,
        'rolling': 200.0,
        'hilly': 500.0,
        'mountainous': 1000.0,
        'steep': 5000.0,
    },
    'landcover_adders': {
        0: 0.0, 10: 150.0, 20: 50.0, 30: 20.0, 40: 80.0,
        50: 500.0, 60: 10.0, 70: 200.0, 80: 10000.0, 90: 300.0,
        95: 500.0, 100: 150.0,
    },
    'crossing_costs': {
        'major_road': 200000.0, 'minor_road': 100000.0,
        'railway': 1000000.0, 'powerline': 150000.0,
        'waterway_small': 120000.0, 'waterway_large': 500000.0,
    },
    'geohazard_adders': {0: 0.0, 1: 0.0, 2: 100.0, 3: 300.0, 4: 500.0},
    'regional_multiplier': 1.2,
}


def resample_to_shape(src_array, src_shape, dst_shape):
    """Resample array to match destination shape"""
    from scipy.ndimage import zoom
    zoom_row = dst_shape[0] / src_shape[0]
    zoom_col = dst_shape[1] / src_shape[1]
    return zoom(src_array, (zoom_row, zoom_col), order=0)


def load_datasets():
    """Load all datasets"""
    print("Loading datasets...")
    datasets = {}

    with rasterio.open(RASTER_DIR / 'dem_epsg32633_processed.tif') as src:
        datasets['dem'] = src.read(1)
        datasets['transform'] = src.transform
        datasets['crs'] = src.crs
        datasets['shape'] = src.shape
        datasets['bounds'] = src.bounds

    ref_shape = datasets['shape']

    with rasterio.open(RASTER_DIR / 'landcover_epsg32633_processed.tif') as src:
        lc = src.read(1)
        if lc.shape != ref_shape:
            datasets['landcover'] = resample_to_shape(lc, lc.shape, ref_shape)
        else:
            datasets['landcover'] = lc

    with rasterio.open(RASTER_DIR / 'geohazards_epsg32633_processed.tif') as src:
        gh = src.read(1)
        if gh.shape != ref_shape:
            datasets['geohazards'] = resample_to_shape(gh, gh.shape, ref_shape)
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

    return datasets


def compute_slope(dem, transform):
    """Compute slope in percent"""
    cell_size = abs(transform[0])
    dy, dx = np.gradient(dem, cell_size)
    return np.sqrt(dx**2 + dy**2) * 100


def rasterize_vectors(gdf, shape, transform, buffer_m=0):
    """Rasterize vector geometries"""
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
    """Build cost surface"""
    print("Building cost surface...")

    dem = datasets['dem']
    transform = datasets['transform']
    shape = datasets['shape']
    cell_size = abs(transform[0])

    # Compute slope
    slope = compute_slope(dem, transform)

    # Initialize cost surface with base cost
    cost_surface = np.full(shape, COST_MATRIX['base_cost_per_m'] * cell_size, dtype=np.float32)

    # Add terrain costs
    terrain_cost = np.zeros(shape, dtype=np.float32)
    terrain_cost[slope < 5] = COST_MATRIX['terrain_adders']['flat']
    terrain_cost[(slope >= 5) & (slope < 10)] = COST_MATRIX['terrain_adders']['rolling']
    terrain_cost[(slope >= 10) & (slope < 15)] = COST_MATRIX['terrain_adders']['hilly']
    terrain_cost[(slope >= 15) & (slope < 20)] = COST_MATRIX['terrain_adders']['mountainous']
    terrain_cost[slope >= 20] = COST_MATRIX['terrain_adders']['steep']
    cost_surface += terrain_cost * cell_size

    # Add landcover costs
    landcover = datasets['landcover']
    lc_cost = np.zeros(shape, dtype=np.float32)
    for lc_val, cost in COST_MATRIX['landcover_adders'].items():
        lc_cost[landcover == lc_val] = cost
    cost_surface += lc_cost * cell_size

    # Add geohazard costs
    geohazards = datasets['geohazards']
    gh_cost = np.zeros(shape, dtype=np.float32)
    for gh_val, cost in COST_MATRIX['geohazard_adders'].items():
        gh_cost[geohazards == gh_val] = cost
    cost_surface += gh_cost * cell_size

    # Rasterize infrastructure for crossing costs
    road_mask = rasterize_vectors(datasets['roads'], shape, transform, buffer_m=20)
    railway_mask = rasterize_vectors(datasets['railways'], shape, transform, buffer_m=30)
    powerline_mask = rasterize_vectors(datasets['powerlines'], shape, transform, buffer_m=20)
    waterway_mask = rasterize_vectors(datasets['waterways'], shape, transform, buffer_m=50)

    cost_surface[road_mask > 0] += 5000 * cell_size
    cost_surface[railway_mask > 0] += 33000 * cell_size
    cost_surface[powerline_mask > 0] += 7500 * cell_size
    cost_surface[waterway_mask > 0] += 5000 * cell_size

    # Hard constraints - set very high cost
    BLOCKED_COST = 1e12
    cost_surface[slope > 35] = BLOCKED_COST  # Relaxed slope for pathfinding
    cost_surface[landcover == 80] = BLOCKED_COST  # Water bodies
    cost_surface[landcover == 50] = BLOCKED_COST  # Built-up/urban areas - MUST AVOID

    # AOI constraint
    aoi_mask = rasterize_vectors(datasets['aoi'], shape, transform)
    cost_surface[aoi_mask == 0] = BLOCKED_COST

    print(f"  Cost surface range: {cost_surface.min():.0f} - {cost_surface.max():.0f}")

    return cost_surface, slope


def world_to_pixel(x, y, transform):
    """Convert world coordinates to pixel coordinates"""
    col = int((x - transform.c) / transform.a)
    row = int((y - transform.f) / transform.e)
    return (row, col)


def pixel_to_world(row, col, transform):
    """Convert pixel coordinates to world coordinates"""
    x = transform.c + col * transform.a + transform.a / 2
    y = transform.f + row * transform.e + transform.e / 2
    return (x, y)


def astar(cost_surface, start_pixel, end_pixel, slope=None, distance_weight=1.0):
    """A* pathfinding algorithm"""
    print(f"Running A* from {start_pixel} to {end_pixel} (distance_weight={distance_weight})...")

    rows, cols = cost_surface.shape
    start_r, start_c = start_pixel
    end_r, end_c = end_pixel

    # Clamp to bounds
    start_r = max(0, min(rows-1, start_r))
    start_c = max(0, min(cols-1, start_c))
    end_r = max(0, min(rows-1, end_r))
    end_c = max(0, min(cols-1, end_c))

    # Check if start/end are blocked
    if cost_surface[start_r, start_c] > 1e10:
        print("  Warning: Start point is blocked, searching nearby...")
        for dr in range(-10, 11):
            for dc in range(-10, 11):
                nr, nc = start_r + dr, start_c + dc
                if 0 <= nr < rows and 0 <= nc < cols and cost_surface[nr, nc] < 1e10:
                    start_r, start_c = nr, nc
                    break
            else:
                continue
            break

    if cost_surface[end_r, end_c] > 1e10:
        print("  Warning: End point is blocked, searching nearby...")
        for dr in range(-10, 11):
            for dc in range(-10, 11):
                nr, nc = end_r + dr, end_c + dc
                if 0 <= nr < rows and 0 <= nc < cols and cost_surface[nr, nc] < 1e10:
                    end_r, end_c = nr, nc
                    break
            else:
                continue
            break

    # 8-directional movement
    directions = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    dist_mult = [1.0, 1.0, 1.0, 1.0, 1.414, 1.414, 1.414, 1.414]

    # Heuristic: Euclidean distance
    def heuristic(r, c):
        return np.sqrt((r - end_r)**2 + (c - end_c)**2) * COST_MATRIX['base_cost_per_m'] * 30

    # Priority queue: (f_score, g_score, row, col)
    open_set = [(heuristic(start_r, start_c), 0, start_r, start_c)]
    came_from = {}
    g_score = {(start_r, start_c): 0}

    visited = 0
    while open_set:
        _, current_g, r, c = heapq.heappop(open_set)

        if (r, c) in came_from and current_g > g_score.get((r, c), float('inf')):
            continue

        visited += 1
        if visited % 50000 == 0:
            dist_to_end = np.sqrt((r - end_r)**2 + (c - end_c)**2)
            print(f"  Visited {visited} nodes, current dist to end: {dist_to_end:.0f} cells")

        if r == end_r and c == end_c:
            print(f"  Path found! Visited {visited} nodes")
            path = []
            current = (r, c)
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append((start_r, start_c))
            path.reverse()
            return path

        for i, (dr, dc) in enumerate(directions):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                cell_cost = cost_surface[nr, nc]
                if cell_cost > 1e10:
                    continue

                move_cost = cell_cost * dist_mult[i]
                tentative_g = current_g + move_cost

                if tentative_g < g_score.get((nr, nc), float('inf')):
                    came_from[(nr, nc)] = (r, c)
                    g_score[(nr, nc)] = tentative_g
                    f_score = tentative_g + heuristic(nr, nc) * distance_weight
                    heapq.heappush(open_set, (f_score, tentative_g, nr, nc))

    print(f"  No path found after visiting {visited} nodes")
    return None


LANDCOVER_NAMES = {
    0: 'unknown', 10: 'tree_cover', 20: 'shrubland', 30: 'grassland',
    40: 'cropland', 50: 'built_up', 60: 'bare_sparse', 70: 'snow_ice',
    80: 'water', 90: 'wetland', 95: 'mangroves', 100: 'moss_lichen'
}


def get_terrain_class(slope_pct):
    """Get terrain class from slope percentage"""
    if slope_pct < 5:
        return 'flat'
    elif slope_pct < 10:
        return 'rolling'
    elif slope_pct < 15:
        return 'hilly'
    elif slope_pct < 20:
        return 'mountainous'
    else:
        return 'steep'


def path_to_geojson(path, transform, datasets, slope, max_segment_length=400.0):
    """Convert path to segmented GeoJSON with detailed attributes"""
    features = []
    total_length = 0
    total_cost = 0

    dem = datasets['dem']
    landcover = datasets['landcover']
    geohazards = datasets['geohazards']

    # Cost rate per meter using same as reference route
    BASE_COST_PER_M = 800.0
    REGIONAL_MULT = 1.2

    # Convert path to world coordinates and collect raster values
    path_data = []
    for r, c in path:
        x, y = pixel_to_world(r, c, transform)
        # Clamp to raster bounds
        r_safe = max(0, min(r, dem.shape[0]-1))
        c_safe = max(0, min(c, dem.shape[1]-1))
        elev = float(dem[r_safe, c_safe])
        slp = float(slope[r_safe, c_safe])
        lc = int(landcover[r_safe, c_safe])
        gh = float(geohazards[r_safe, c_safe])
        path_data.append({
            'x': x, 'y': y, 'elev': elev, 'slope': slp,
            'landcover': lc, 'geohazard': gh
        })

    # Create segments
    current_segment = [path_data[0]]
    segment_length = 0
    segment_idx = 1
    cumulative_cost = 0
    cumulative_distance = 0

    for i in range(1, len(path_data)):
        prev = path_data[i-1]
        curr = path_data[i]
        dist = np.sqrt((curr['x'] - prev['x'])**2 + (curr['y'] - prev['y'])**2)

        if segment_length + dist > max_segment_length and len(current_segment) > 1:
            # Calculate segment properties
            coords = [[round(p['x'], 6), round(p['y'], 6)] for p in current_segment]
            seg_len = sum(np.sqrt((current_segment[j+1]['x']-current_segment[j]['x'])**2 +
                                  (current_segment[j+1]['y']-current_segment[j]['y'])**2)
                         for j in range(len(current_segment)-1))

            # Average properties for segment
            avg_slope = np.mean([p['slope'] for p in current_segment])
            avg_lc = int(np.median([p['landcover'] for p in current_segment]))
            avg_gh = np.mean([p['geohazard'] for p in current_segment])
            elev_start = current_segment[0]['elev']
            elev_end = current_segment[-1]['elev']

            # Calculate cost - matching the reference route format
            seg_cost = seg_len * BASE_COST_PER_M * REGIONAL_MULT
            cumulative_cost += seg_cost
            cumulative_distance += seg_len

            features.append({
                "type": "Feature",
                "properties": {
                    "segment_id": segment_idx,
                    "step": segment_idx,
                    "length_m": round(seg_len, 2),
                    "elevation_start": round(elev_start, 2),
                    "elevation_end": round(elev_end, 2),
                    "slope_percent": round(avg_slope, 2),
                    "cost_usd": round(seg_cost, 2),
                    "cost_per_m": BASE_COST_PER_M,
                    "cumulative_cost": round(cumulative_cost, 2),
                    "cumulative_distance_m": round(cumulative_distance, 2),
                    "land_cover_class": avg_lc,
                    "land_cover_name": LANDCOVER_NAMES.get(avg_lc, 'unknown'),
                    "geohazard_risk": round(avg_gh, 1),
                    "terrain_class": get_terrain_class(avg_slope),
                    "crs": "EPSG:32633"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords
                }
            })

            total_length += seg_len
            total_cost += seg_cost
            segment_idx += 1
            current_segment = [current_segment[-1]]
            segment_length = 0

        current_segment.append(curr)
        segment_length += dist

    # Save final segment
    if len(current_segment) > 1:
        coords = [[round(p['x'], 6), round(p['y'], 6)] for p in current_segment]
        seg_len = sum(np.sqrt((current_segment[j+1]['x']-current_segment[j]['x'])**2 +
                              (current_segment[j+1]['y']-current_segment[j]['y'])**2)
                     for j in range(len(current_segment)-1))

        avg_slope = np.mean([p['slope'] for p in current_segment])
        avg_lc = int(np.median([p['landcover'] for p in current_segment]))
        avg_gh = np.mean([p['geohazard'] for p in current_segment])
        elev_start = current_segment[0]['elev']
        elev_end = current_segment[-1]['elev']

        seg_cost = seg_len * BASE_COST_PER_M * REGIONAL_MULT
        cumulative_cost += seg_cost
        cumulative_distance += seg_len

        features.append({
            "type": "Feature",
            "properties": {
                "segment_id": segment_idx,
                "step": segment_idx,
                "length_m": round(seg_len, 2),
                "elevation_start": round(elev_start, 2),
                "elevation_end": round(elev_end, 2),
                "slope_percent": round(avg_slope, 2),
                "cost_usd": round(seg_cost, 2),
                "cost_per_m": BASE_COST_PER_M,
                "cumulative_cost": round(cumulative_cost, 2),
                "cumulative_distance_m": round(cumulative_distance, 2),
                "land_cover_class": avg_lc,
                "land_cover_name": LANDCOVER_NAMES.get(avg_lc, 'unknown'),
                "geohazard_risk": round(avg_gh, 1),
                "terrain_class": get_terrain_class(avg_slope),
                "crs": "EPSG:32633"
            },
            "geometry": {
                "type": "LineString",
                "coordinates": coords
            }
        })
        total_length += seg_len
        total_cost += seg_cost

    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::32633"}},
        "metadata": {
            "project_name": "Ravenna-Chieti-Pipeline",
            "algorithm": "A* with SAIPEM criteria",
            "crs": "EPSG:32633",
            "total_segments": len(features),
            "total_length_m": round(total_length, 2),
            "total_cost_usd": round(total_cost, 2),
            "cost_per_km": round(total_cost / (total_length / 1000), 2) if total_length > 0 else 0,
            "max_segment_length_m": max_segment_length,
            "criteria": CRITERIA,
            "generated_at": __import__('datetime').datetime.now().isoformat()
        },
        "features": features
    }

    return geojson


def generate_route(datasets, cost_surface, slope, distance_weight, route_name):
    """Generate a single route"""
    print(f"\n{'='*60}")
    print(f"Generating route: {route_name} (distance_weight={distance_weight})")
    print(f"{'='*60}")

    transform = datasets['transform']

    # Convert start/end to pixel coordinates
    start_pixel = world_to_pixel(START_UTM[0], START_UTM[1], transform)
    end_pixel = world_to_pixel(END_UTM[0], END_UTM[1], transform)

    print(f"Start: UTM {START_UTM} -> pixel {start_pixel}")
    print(f"End: UTM {END_UTM} -> pixel {end_pixel}")

    # Run A*
    path = astar(cost_surface, start_pixel, end_pixel, slope, distance_weight=distance_weight)

    if path is None:
        print("ERROR: No path found!")
        return None

    print(f"Path found with {len(path)} points")

    # Convert to GeoJSON with detailed attributes
    geojson = path_to_geojson(path, transform, datasets, slope)

    # Add route-specific metadata
    geojson['metadata']['route_id'] = route_name
    geojson['metadata']['name'] = route_name.replace('_', ' ').title()
    geojson['metadata']['distance_weight'] = distance_weight
    geojson['metadata']['start_point'] = {'utm': START_UTM, 'wgs84': START_WGS84}
    geojson['metadata']['end_point'] = {'utm': END_UTM, 'wgs84': END_WGS84}

    # Save
    output_file = OUTPUT_DIR / f'{route_name}.geojson'
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    print(f"\nRoute saved to: {output_file}")
    print(f"Total segments: {geojson['metadata']['total_segments']}")
    print(f"Total length: {geojson['metadata']['total_length_m']/1000:.2f} km")
    print(f"Estimated cost: ${geojson['metadata']['total_cost_usd']:,.0f}")

    return geojson


def main():
    """Generate two new A* routes with different parameters"""
    print("=" * 60)
    print("A* Route Generator - Project Start to End Points")
    print("=" * 60)

    # Load datasets
    datasets = load_datasets()

    # Build cost surface
    cost_surface, slope = build_cost_surface(datasets)

    # Generate Route 1: Standard cost-optimized
    route1 = generate_route(
        datasets, cost_surface, slope,
        distance_weight=1.0,
        route_name="Ravenna-Chieti-Pipeline_astar_cost_optimized"
    )

    # Generate Route 2: Distance-optimized (shorter route preference)
    route2 = generate_route(
        datasets, cost_surface, slope,
        distance_weight=2.0,
        route_name="Ravenna-Chieti-Pipeline_astar_distance_optimized"
    )

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    if route1:
        print(f"\nRoute 1 (Cost Optimized, dw=1.0):")
        print(f"  Length: {route1['metadata']['total_length_m']/1000:.2f} km")
        print(f"  Cost: ${route1['metadata']['total_cost_usd']:,.0f}")

    if route2:
        print(f"\nRoute 2 (Distance Optimized, dw=2.0):")
        print(f"  Length: {route2['metadata']['total_length_m']/1000:.2f} km")
        print(f"  Cost: ${route2['metadata']['total_cost_usd']:,.0f}")


if __name__ == "__main__":
    main()
