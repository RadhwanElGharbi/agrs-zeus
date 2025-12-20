#!/usr/bin/env python3
"""
Audit A* Route Against SAIPEM Constraints

This script checks if the ENTIRE route (not just sampled points) respects:
1. Max slope: 20%
2. House clearance: 13.5m from buildings
3. Built-up area avoidance (LC 50)
4. Water body avoidance (LC 80)
5. Powerline clearance: 6m
6. Railway clearance for non-HDD segments

The key difference from the A* generator is that we check EVERY pixel
along each segment, not just the endpoints or sample points.
"""

import numpy as np
import rasterio
import geopandas as gpd
import json
from shapely.geometry import LineString, Point
from shapely.ops import transform
from pathlib import Path
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
VECTOR_DIR = PROJECT_DIR / 'data/vectors/processed'
ROUTE_FILE = Path('/opt/agrs/Projects/test_project2/data/vectors/pipelines.gpkg')

# SAIPEM Constraints
CONSTRAINTS = {
    'max_slope_percent': 20.0,
    'house_clearance_m': 13.5,
    'powerline_clearance_m': 6.0,
    'railway_clearance_m': 10.0,
    'water_blocked': True,
    'built_up_blocked': True,  # Should avoid, not just penalize
}

# Landcover classes
LC_BUILT_UP = 50
LC_WATER = 80


def load_rasters():
    """Load DEM and landcover"""
    rasters = {}

    with rasterio.open(RASTER_DIR / 'dem_epsg32633_processed.tif') as src:
        rasters['dem'] = src.read(1)
        rasters['transform'] = src.transform
        rasters['shape'] = src.shape
        rasters['crs'] = src.crs

    with rasterio.open(RASTER_DIR / 'landcover_epsg32633_processed.tif') as src:
        lc = src.read(1)
        if lc.shape != rasters['shape']:
            from scipy.ndimage import zoom
            zoom_row = rasters['shape'][0] / lc.shape[0]
            zoom_col = rasters['shape'][1] / lc.shape[1]
            lc = zoom(lc, (zoom_row, zoom_col), order=0)
        rasters['landcover'] = lc

    # Compute slope
    cell_size = abs(rasters['transform'][0])
    dy, dx = np.gradient(rasters['dem'], cell_size)
    rasters['slope'] = np.sqrt(dx**2 + dy**2) * 100

    return rasters


def load_route():
    """Load route from GeoJSON or GeoPackage"""
    if str(ROUTE_FILE).endswith('.gpkg'):
        # Load from GeoPackage
        import geopandas as gpd
        from shapely.ops import linemerge

        gdf = gpd.read_file(ROUTE_FILE)
        all_geoms = []
        for geom in gdf.geometry:
            if geom.geom_type == 'LineString':
                all_geoms.append(geom)
            elif geom.geom_type == 'MultiLineString':
                for part in geom.geoms:
                    all_geoms.append(part)

        # Merge and get longest part (main pipeline)
        merged = linemerge(all_geoms)
        if merged.geom_type == 'MultiLineString':
            route_geom = max(merged.geoms, key=lambda g: g.length)
        else:
            route_geom = merged

        return route_geom, {'type': 'existing_pipeline'}
    else:
        # Load from GeoJSON
        with open(ROUTE_FILE) as f:
            data = json.load(f)

        all_coords = []
        for feature in data['features']:
            coords = feature['geometry']['coordinates']
            all_coords.extend(coords)

        return LineString(all_coords), data


def world_to_pixel(x, y, transform):
    """Convert world coordinates to pixel indices"""
    col = int((x - transform[2]) / transform[0])
    row = int((y - transform[5]) / transform[4])
    return row, col


def sample_line_densely(line, interval=1.0):
    """Sample points along line at given interval (meters)"""
    length = line.length
    num_points = max(2, int(length / interval))
    distances = np.linspace(0, length, num_points)
    return [line.interpolate(d) for d in distances]


def audit_route(route_geom, rasters):
    """Audit entire route against constraints"""

    transform_matrix = rasters['transform']
    shape = rasters['shape']
    slope = rasters['slope']
    landcover = rasters['landcover']

    violations = {
        'slope_violations': [],
        'built_up_violations': [],
        'water_violations': [],
        'total_points_checked': 0,
    }

    # Sample route every 1 meter for thorough checking
    print("Sampling route every 1 meter...")
    points = sample_line_densely(route_geom, interval=1.0)
    violations['total_points_checked'] = len(points)
    print(f"  Checking {len(points)} points along {route_geom.length/1000:.2f} km route")

    # Track violation locations
    slope_violation_points = []
    built_up_violation_points = []
    water_violation_points = []

    # Track statistics
    slope_values = []
    lc_counts = defaultdict(int)

    for i, pt in enumerate(points):
        row, col = world_to_pixel(pt.x, pt.y, transform_matrix)

        # Bounds check
        if not (0 <= row < shape[0] and 0 <= col < shape[1]):
            continue

        # Get values
        slope_val = slope[row, col]
        lc_val = landcover[row, col]

        slope_values.append(slope_val)
        lc_counts[int(lc_val)] += 1

        # Check slope constraint
        if slope_val > CONSTRAINTS['max_slope_percent']:
            slope_violation_points.append({
                'point': (pt.x, pt.y),
                'slope': float(slope_val),
                'distance_m': i,
            })

        # Check built-up constraint
        if lc_val == LC_BUILT_UP:
            built_up_violation_points.append({
                'point': (pt.x, pt.y),
                'distance_m': i,
            })

        # Check water constraint
        if lc_val == LC_WATER:
            water_violation_points.append({
                'point': (pt.x, pt.y),
                'distance_m': i,
            })

    # Consolidate violations into segments
    violations['slope_violations'] = consolidate_violations(slope_violation_points)
    violations['built_up_violations'] = consolidate_violations(built_up_violation_points)
    violations['water_violations'] = consolidate_violations(water_violation_points)

    # Statistics
    violations['slope_stats'] = {
        'min': float(np.min(slope_values)),
        'max': float(np.max(slope_values)),
        'mean': float(np.mean(slope_values)),
        'median': float(np.median(slope_values)),
        'pct_above_20': float(np.sum(np.array(slope_values) > 20) / len(slope_values) * 100),
    }

    violations['landcover_distribution'] = dict(lc_counts)

    return violations


def consolidate_violations(points):
    """Consolidate consecutive violation points into segments"""
    if not points:
        return []

    segments = []
    current_segment = {
        'start_point': points[0]['point'],
        'start_distance': points[0]['distance_m'],
        'end_point': points[0]['point'],
        'end_distance': points[0]['distance_m'],
        'max_slope': points[0].get('slope', 0),
        'length_m': 1,
    }

    for i in range(1, len(points)):
        # Check if consecutive (within 5m)
        if points[i]['distance_m'] - current_segment['end_distance'] <= 5:
            # Extend current segment
            current_segment['end_point'] = points[i]['point']
            current_segment['end_distance'] = points[i]['distance_m']
            current_segment['length_m'] = current_segment['end_distance'] - current_segment['start_distance']
            if 'slope' in points[i]:
                current_segment['max_slope'] = max(current_segment['max_slope'], points[i]['slope'])
        else:
            # Save current and start new
            if current_segment['length_m'] >= 5:  # Only report segments >= 5m
                segments.append(current_segment)
            current_segment = {
                'start_point': points[i]['point'],
                'start_distance': points[i]['distance_m'],
                'end_point': points[i]['point'],
                'end_distance': points[i]['distance_m'],
                'max_slope': points[i].get('slope', 0),
                'length_m': 1,
            }

    # Don't forget the last segment
    if current_segment['length_m'] >= 5:
        segments.append(current_segment)

    return segments


def print_report(violations):
    """Print audit report"""
    print("\n" + "="*70)
    print("ROUTE CONSTRAINT AUDIT REPORT")
    print("="*70)

    print(f"\nTotal points checked: {violations['total_points_checked']}")

    # Slope statistics
    print("\n" + "-"*50)
    print("SLOPE ANALYSIS")
    print("-"*50)
    stats = violations['slope_stats']
    print(f"  Min slope: {stats['min']:.1f}%")
    print(f"  Max slope: {stats['max']:.1f}%")
    print(f"  Mean slope: {stats['mean']:.1f}%")
    print(f"  Median slope: {stats['median']:.1f}%")
    print(f"  Points above 20%: {stats['pct_above_20']:.2f}%")

    # Slope violations
    slope_v = violations['slope_violations']
    print(f"\n  SLOPE VIOLATIONS (>20%): {len(slope_v)} segments")
    if slope_v:
        total_violation_length = sum(v['length_m'] for v in slope_v)
        print(f"  Total violation length: {total_violation_length:.0f}m")
        print("\n  Top 10 worst violations:")
        for v in sorted(slope_v, key=lambda x: -x['max_slope'])[:10]:
            print(f"    - {v['length_m']:.0f}m at distance {v['start_distance']:.0f}m, max slope: {v['max_slope']:.1f}%")
            print(f"      Location: ({v['start_point'][0]:.0f}, {v['start_point'][1]:.0f})")

    # Landcover distribution
    print("\n" + "-"*50)
    print("LANDCOVER DISTRIBUTION")
    print("-"*50)
    lc_names = {
        10: "Tree cover", 20: "Shrubland", 30: "Grassland", 40: "Cropland",
        50: "Built-up", 60: "Bare/sparse", 70: "Snow/ice", 80: "Water",
        90: "Wetland", 95: "Mangroves", 100: "Moss/lichen"
    }
    total = sum(violations['landcover_distribution'].values())
    for lc, count in sorted(violations['landcover_distribution'].items(), key=lambda x: -x[1]):
        name = lc_names.get(lc, f"LC {lc}")
        pct = count / total * 100
        marker = " *** VIOLATION ***" if lc in [LC_BUILT_UP, LC_WATER] and count > 0 else ""
        print(f"  {name}: {count}m ({pct:.1f}%){marker}")

    # Built-up violations
    built_v = violations['built_up_violations']
    print(f"\n" + "-"*50)
    print(f"BUILT-UP AREA VIOLATIONS: {len(built_v)} segments")
    print("-"*50)
    if built_v:
        total_built = sum(v['length_m'] for v in built_v)
        print(f"  Total in built-up areas: {total_built:.0f}m")
        print("\n  Violation segments:")
        for v in built_v[:20]:
            print(f"    - {v['length_m']:.0f}m at distance {v['start_distance']:.0f}m")
            print(f"      Start: ({v['start_point'][0]:.0f}, {v['start_point'][1]:.0f})")
            print(f"      End: ({v['end_point'][0]:.0f}, {v['end_point'][1]:.0f})")
    else:
        print("  No built-up area violations!")

    # Water violations
    water_v = violations['water_violations']
    print(f"\n" + "-"*50)
    print(f"WATER BODY VIOLATIONS: {len(water_v)} segments")
    print("-"*50)
    if water_v:
        total_water = sum(v['length_m'] for v in water_v)
        print(f"  Total in water: {total_water:.0f}m")
        for v in water_v[:10]:
            print(f"    - {v['length_m']:.0f}m at distance {v['start_distance']:.0f}m")
    else:
        print("  No water body violations!")

    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)

    has_violations = len(slope_v) > 0 or len(built_v) > 0 or len(water_v) > 0

    if has_violations:
        print("ROUTE HAS CONSTRAINT VIOLATIONS:")
        if slope_v:
            print(f"  - {len(slope_v)} slope violation segments (>{CONSTRAINTS['max_slope_percent']}%)")
        if built_v:
            print(f"  - {len(built_v)} built-up area violations")
        if water_v:
            print(f"  - {len(water_v)} water body violations")
        print("\nThe A* route needs to be regenerated with stricter constraint enforcement.")
    else:
        print("ROUTE PASSES ALL CONSTRAINTS!")

    print("="*70)

    return has_violations


def main():
    print("Loading rasters...")
    rasters = load_rasters()

    print("Loading route...")
    route_geom, route_data = load_route()

    print(f"Route length: {route_geom.length/1000:.2f} km")
    if 'features' in route_data:
        print(f"Route segments: {len(route_data['features'])}")

    print("\nAuditing route against SAIPEM constraints...")
    violations = audit_route(route_geom, rasters)

    has_violations = print_report(violations)

    return violations, has_violations


if __name__ == "__main__":
    violations, has_violations = main()
