#!/usr/bin/env python3
"""
Final Route Comparison

Compare the existing pipeline with A* and Dijkstra routes using:
1. Correct endpoints (matching existing pipeline Part 0)
2. Detailed cost analysis

Existing Pipeline Part 0: 35.19 km from (397199, 4782587) to (379620, 4805075)
"""

import numpy as np
import geopandas as gpd
import rasterio
import json
from shapely.geometry import LineString, Point, MultiLineString
from shapely.ops import linemerge
from pathlib import Path
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
VECTOR_DIR = PROJECT_DIR / 'data/vectors/processed'

# Route files
EXISTING_PIPELINE = PROJECT_DIR / 'data/vectors/pipelines.gpkg'
ASTAR_ROUTE = Path('/opt/agrs/agentic_framework/data/routes/test_project2_astar_saipem_compliant.geojson')
DIJKSTRA_ROUTE = Path('/opt/agrs/agentic_framework/data/routes/test_project2_dijkstra_shortest.geojson')

# Detailed cost matrix
DETAILED_COSTS = {
    'base_construction_per_m': 800.0,
    'trenching_per_m': {
        'soft_soil': 200.0,
        'medium_soil': 350.0,
        'hard_soil': 500.0,
        'rock_mixed': 800.0,
        'hard_rock': 1500.0,
    },
    'landcover_per_m': {
        0: 50.0,
        10: 400.0,
        20: 150.0,
        30: 80.0,
        40: 200.0,
        50: 1000.0,
        60: 50.0,
        70: 300.0,
        80: 5000.0,
        90: 600.0,
        95: 800.0,
        100: 200.0,
    },
    'road_crossings': {
        'footway': 30000.0,
        'path': 30000.0,
        'track': 40000.0,
        'service': 50000.0,
        'residential': 80000.0,
        'unclassified': 80000.0,
        'tertiary': 100000.0,
        'secondary': 150000.0,
        'primary': 250000.0,
        'trunk': 400000.0,
        'motorway': 800000.0,
        'motorway_link': 500000.0,
        'trunk_link': 300000.0,
        'primary_link': 200000.0,
        'default': 100000.0,
    },
    'railway_crossings': {
        'rail': 1200000.0,
        'light_rail': 800000.0,
        'subway': 1500000.0,
        'tram': 600000.0,
        'disused': 200000.0,
        'abandoned': 100000.0,
        'default': 1000000.0,
    },
    'waterway_crossings': {
        'stream': 80000.0,
        'ditch': 30000.0,
        'drain': 40000.0,
        'canal': 300000.0,
        'river': 500000.0,
        'default': 150000.0,
    },
    'powerline_crossing': 150000.0,
    'regional_multiplier': 1.2,
}


def load_rasters():
    """Load DEM and landcover rasters"""
    rasters = {}

    with rasterio.open(RASTER_DIR / 'dem_epsg32633_processed.tif') as src:
        rasters['dem'] = src.read(1)
        rasters['transform'] = src.transform
        rasters['shape'] = src.shape

    with rasterio.open(RASTER_DIR / 'landcover_epsg32633_processed.tif') as src:
        lc = src.read(1)
        if lc.shape != rasters['shape']:
            from scipy.ndimage import zoom
            zoom_row = rasters['shape'][0] / lc.shape[0]
            zoom_col = rasters['shape'][1] / lc.shape[1]
            lc = zoom(lc, (zoom_row, zoom_col), order=0)
        rasters['landcover'] = lc

    return rasters


def load_vectors():
    """Load vector layers"""
    vectors = {}
    vectors['roads'] = gpd.read_file(VECTOR_DIR / 'osm_roads_epsg32633_processed.gpkg')
    vectors['railways'] = gpd.read_file(VECTOR_DIR / 'osm_railways_epsg32633_processed.gpkg')
    vectors['powerlines'] = gpd.read_file(VECTOR_DIR / 'osm_power_lines_epsg32633_processed.gpkg')
    vectors['waterways'] = gpd.read_file(VECTOR_DIR / 'osm_waterways_epsg32633_processed.gpkg')
    return vectors


def compute_slope(dem, transform):
    """Compute slope percentage"""
    cell_size = abs(transform[0])
    dy, dx = np.gradient(dem, cell_size)
    return np.sqrt(dx**2 + dy**2) * 100


def get_slope_category(slope_pct):
    """Get trenching cost category from slope"""
    if slope_pct <= 5:
        return 'soft_soil'
    elif slope_pct <= 10:
        return 'medium_soil'
    elif slope_pct <= 15:
        return 'hard_soil'
    elif slope_pct <= 25:
        return 'rock_mixed'
    else:
        return 'hard_rock'


def sample_route(geometry, rasters, sample_interval=10):
    """Sample raster values along route"""
    dem = rasters['dem']
    landcover = rasters['landcover']
    transform = rasters['transform']
    shape = rasters['shape']

    slope = compute_slope(dem, transform)

    # Handle different geometry types
    if geometry.geom_type == 'MultiLineString':
        geometries = list(geometry.geoms)
    else:
        geometries = [geometry]

    samples = {
        'slope': [],
        'landcover': [],
        'distances': [],
    }

    for geom_part in geometries:
        length = geom_part.length
        num_samples = max(2, int(length / sample_interval))
        distances = np.linspace(0, length, num_samples + 1)

        for d in distances:
            point = geom_part.interpolate(d)
            col = int((point.x - transform[2]) / transform[0])
            row = int((point.y - transform[5]) / transform[4])

            if 0 <= row < shape[0] and 0 <= col < shape[1]:
                samples['slope'].append(slope[row, col])
                samples['landcover'].append(landcover[row, col])
                samples['distances'].append(d)

    return samples


def count_crossings(geometry, vectors):
    """Count infrastructure crossings"""
    crossings = {
        'roads': defaultdict(int),
        'railways': defaultdict(int),
        'waterways': defaultdict(int),
        'powerlines': 0,
    }

    # Buffer for intersection detection
    route_buffer = geometry.buffer(5)

    # Road crossings
    for _, row in vectors['roads'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            hw_type = row.get('highway', 'default')
            if hw_type is None:
                hw_type = 'default'
            crossings['roads'][hw_type] += 1

    # Railway crossings
    for _, row in vectors['railways'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            rw_type = row.get('railway', 'default')
            if rw_type is None:
                rw_type = 'default'
            crossings['railways'][rw_type] += 1

    # Waterway crossings
    for _, row in vectors['waterways'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            ww_type = row.get('waterway', 'default')
            if ww_type is None:
                ww_type = 'default'
            crossings['waterways'][ww_type] += 1

    # Powerline crossings
    for _, row in vectors['powerlines'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            crossings['powerlines'] += 1

    return crossings


def calculate_detailed_cost(geometry, rasters, vectors, name="Route"):
    """Calculate detailed route cost"""
    length = geometry.length
    length_km = length / 1000

    print(f"\n{'='*60}")
    print(f"Analyzing: {name}")
    print(f"{'='*60}")
    print(f"Length: {length_km:.2f} km")

    # Sample terrain
    samples = sample_route(geometry, rasters)

    # 1. Base construction
    base_cost = length * DETAILED_COSTS['base_construction_per_m']
    print(f"\n1. Base Construction: ${base_cost:,.0f}")

    # 2. Trenching by terrain
    trenching_cost = 0
    slope_distribution = defaultdict(float)
    for i, slope_val in enumerate(samples['slope']):
        segment_length = length / len(samples['slope'])
        category = get_slope_category(slope_val)
        cost = segment_length * DETAILED_COSTS['trenching_per_m'][category]
        trenching_cost += cost
        slope_distribution[category] += segment_length

    print(f"\n2. Trenching by Terrain: ${trenching_cost:,.0f}")
    for cat, dist in sorted(slope_distribution.items()):
        rate = DETAILED_COSTS['trenching_per_m'][cat]
        print(f"   - {cat}: {dist/1000:.2f} km @ ${rate:,.0f}/m = ${dist * rate:,.0f}")

    # 3. Landcover costs
    landcover_cost = 0
    lc_distribution = defaultdict(float)
    for i, lc_val in enumerate(samples['landcover']):
        segment_length = length / len(samples['landcover'])
        cost_per_m = DETAILED_COSTS['landcover_per_m'].get(int(lc_val), 100)
        cost = segment_length * cost_per_m
        landcover_cost += cost
        lc_distribution[int(lc_val)] += segment_length

    print(f"\n3. Landcover: ${landcover_cost:,.0f}")
    lc_names = {10: "tree_cover", 20: "shrub", 30: "grass", 40: "crop",
                50: "built_up", 60: "bare", 80: "water", 90: "wetland"}
    for lc, dist in sorted(lc_distribution.items(), key=lambda x: -x[1])[:5]:
        rate = DETAILED_COSTS['landcover_per_m'].get(lc, 100)
        name_str = lc_names.get(lc, f"lc_{lc}")
        print(f"   - {name_str}: {dist/1000:.2f} km @ ${rate:,.0f}/m = ${dist * rate:,.0f}")

    # 4. Crossings
    crossings = count_crossings(geometry, vectors)
    crossing_cost = 0

    print(f"\n4. Infrastructure Crossings:")

    # Roads
    road_cost = 0
    for road_type, count in crossings['roads'].items():
        rate = DETAILED_COSTS['road_crossings'].get(road_type, DETAILED_COSTS['road_crossings']['default'])
        cost = count * rate
        road_cost += cost
    crossing_cost += road_cost
    total_roads = sum(crossings['roads'].values())
    print(f"   - Roads: {total_roads} crossings = ${road_cost:,.0f}")

    # Railways
    rail_cost = 0
    for rail_type, count in crossings['railways'].items():
        rate = DETAILED_COSTS['railway_crossings'].get(rail_type, DETAILED_COSTS['railway_crossings']['default'])
        cost = count * rate
        rail_cost += cost
    crossing_cost += rail_cost
    total_rails = sum(crossings['railways'].values())
    print(f"   - Railways: {total_rails} crossings = ${rail_cost:,.0f}")

    # Waterways
    water_cost = 0
    for ww_type, count in crossings['waterways'].items():
        rate = DETAILED_COSTS['waterway_crossings'].get(ww_type, DETAILED_COSTS['waterway_crossings']['default'])
        cost = count * rate
        water_cost += cost
    crossing_cost += water_cost
    total_waterways = sum(crossings['waterways'].values())
    print(f"   - Waterways: {total_waterways} crossings = ${water_cost:,.0f}")

    # Powerlines
    power_cost = crossings['powerlines'] * DETAILED_COSTS['powerline_crossing']
    crossing_cost += power_cost
    print(f"   - Powerlines: {crossings['powerlines']} crossings = ${power_cost:,.0f}")

    print(f"   TOTAL CROSSINGS: ${crossing_cost:,.0f}")

    # Subtotal
    subtotal = base_cost + trenching_cost + landcover_cost + crossing_cost

    # Regional multiplier
    total = subtotal * DETAILED_COSTS['regional_multiplier']

    print(f"\n{'='*40}")
    print(f"SUBTOTAL: ${subtotal:,.0f}")
    print(f"Regional Multiplier (1.2x): ${total - subtotal:,.0f}")
    print(f"TOTAL COST: ${total:,.0f}")
    print(f"Cost per km: ${total/length_km:,.0f}")
    print(f"{'='*40}")

    return {
        'name': name,
        'length_km': length_km,
        'base_cost': base_cost,
        'trenching_cost': trenching_cost,
        'landcover_cost': landcover_cost,
        'crossing_cost': crossing_cost,
        'subtotal': subtotal,
        'total_cost': total,
        'cost_per_km': total / length_km,
        'crossings': {
            'roads': total_roads,
            'railways': total_rails,
            'waterways': total_waterways,
            'powerlines': crossings['powerlines'],
        }
    }


def load_route_geometry(filepath, route_type="geojson"):
    """Load route geometry from file"""
    if route_type == "gpkg":
        gdf = gpd.read_file(filepath)
        # Get the main pipeline part (Part 0 = 35.19 km)
        all_geoms = []
        for geom in gdf.geometry:
            if geom.geom_type == 'LineString':
                all_geoms.append(geom)
            elif geom.geom_type == 'MultiLineString':
                for part in geom.geoms:
                    all_geoms.append(part)

        # Merge and find the longest connected part
        merged = linemerge(all_geoms)
        if merged.geom_type == 'MultiLineString':
            # Return the longest part
            longest = max(merged.geoms, key=lambda g: g.length)
            return longest
        return merged

    else:  # GeoJSON
        with open(filepath) as f:
            data = json.load(f)

        coords = []
        for feature in data['features']:
            geom = feature['geometry']
            if geom['type'] == 'LineString':
                coords.extend(geom['coordinates'])
            elif geom['type'] == 'MultiLineString':
                for part in geom['coordinates']:
                    coords.extend(part)

        return LineString(coords)


def main():
    print("="*70)
    print("FINAL ROUTE COMPARISON - CORRECT ENDPOINTS")
    print("="*70)
    print("\nExisting Pipeline Part 0: 35.19 km")
    print("Start: (397199, 4782587) | End: (379620, 4805075)")
    print()

    # Load data
    print("Loading rasters...")
    rasters = load_rasters()

    print("Loading vectors...")
    vectors = load_vectors()

    results = []

    # 1. Existing pipeline
    print("\n" + "="*70)
    existing_geom = load_route_geometry(EXISTING_PIPELINE, "gpkg")
    result_existing = calculate_detailed_cost(existing_geom, rasters, vectors, "Existing SNAM Pipeline")
    results.append(result_existing)

    # 2. A* route
    if ASTAR_ROUTE.exists():
        print("\n" + "="*70)
        astar_geom = load_route_geometry(ASTAR_ROUTE, "geojson")
        result_astar = calculate_detailed_cost(astar_geom, rasters, vectors, "A* Optimized Route")
        results.append(result_astar)

    # 3. Dijkstra route
    if DIJKSTRA_ROUTE.exists():
        print("\n" + "="*70)
        dijkstra_geom = load_route_geometry(DIJKSTRA_ROUTE, "geojson")
        result_dijkstra = calculate_detailed_cost(dijkstra_geom, rasters, vectors, "Dijkstra Shortest Path")
        results.append(result_dijkstra)

    # Summary comparison
    print("\n" + "="*70)
    print("COMPARISON SUMMARY")
    print("="*70)

    # Sort by total cost
    results.sort(key=lambda x: x['total_cost'])

    baseline = results[-1]['total_cost'] if results else 0

    print(f"\n{'Route':<30} {'Length':<10} {'Total Cost':<15} {'Cost/km':<12} {'vs Baseline':<12}")
    print("-"*70)

    for r in results:
        diff = r['total_cost'] - baseline
        diff_str = f"+${abs(diff/1e6):.2f}M" if diff > 0 else f"-${abs(diff/1e6):.2f}M"
        if diff == 0:
            diff_str = "BASELINE"
        print(f"{r['name']:<30} {r['length_km']:>7.2f} km  ${r['total_cost']/1e6:>10.2f}M  ${r['cost_per_km']/1e6:>7.2f}M  {diff_str:>12}")

    # Winner
    print("\n" + "="*70)
    winner = results[0]
    if winner['name'] != "Existing SNAM Pipeline":
        savings = results[-1]['total_cost'] - winner['total_cost']
        print(f"WINNER: {winner['name']}")
        print(f"Savings vs Existing: ${savings/1e6:.2f}M ({savings/results[-1]['total_cost']*100:.1f}%)")
    else:
        print("EXISTING PIPELINE IS MOST COST-EFFECTIVE")
    print("="*70)

    return results


if __name__ == "__main__":
    main()
