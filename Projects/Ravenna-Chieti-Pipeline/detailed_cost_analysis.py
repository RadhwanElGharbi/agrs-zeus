#!/usr/bin/env python3
"""
Detailed Pipeline Cost Analysis

This script performs a granular cost analysis considering:
1. Actual crossing characteristics (road type, waterway width, railway type)
2. Terrain geology and slope difficulty
3. Landcover clearing and restoration costs
4. ROW acquisition by land type
5. Special construction requirements

The goal is to identify whether the A* route can achieve lower CAPEX
through better corridor selection, even if it's longer.
"""

import numpy as np
import geopandas as gpd
import rasterio
import json
from shapely.geometry import LineString, Point
from shapely.ops import linemerge
from pathlib import Path
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
VECTOR_DIR = PROJECT_DIR / 'data/vectors/processed'
ASTAR_ROUTE = Path('/opt/agrs/agentic_framework/data/routes/test_project2_astar_saipem.geojson')

# ==============================================================================
# DETAILED COST MATRIX - Based on Real Construction Data
# ==============================================================================

DETAILED_COSTS = {
    # Base construction per meter (pipe, coating, labor, equipment)
    # This is the MINIMUM cost even in ideal conditions
    'base_construction_per_m': 800.0,  # $800/m for materials & basic labor

    # Trenching costs by soil type (derived from slope as proxy for geology)
    # Steeper terrain often correlates with harder rock/soil
    'trenching_per_m': {
        'soft_soil': 200.0,      # <5% slope, alluvial plains
        'medium_soil': 350.0,    # 5-10% slope, mixed soil
        'hard_soil': 500.0,      # 10-15% slope, compact soil/soft rock
        'rock_mixed': 800.0,     # 15-25% slope, rock outcrops
        'hard_rock': 1500.0,     # >25% slope, solid rock, blasting needed
    },

    # Landcover costs (clearing, grubbing, restoration, compensation)
    'landcover_per_m': {
        0: 50.0,        # No data - assume grassland
        10: 400.0,      # Tree cover - clearing $200 + grubbing $100 + restoration $100
        20: 150.0,      # Shrubland - light clearing + restoration
        30: 80.0,       # Grassland - minimal, just topsoil handling
        40: 200.0,      # Cropland - compensation $100 + restoration $100
        50: 1000.0,     # Built-up - utility relocation, traffic, permits
        60: 50.0,       # Bare/sparse - easiest
        70: 300.0,      # Snow/ice - seasonal work windows
        80: 5000.0,     # Water bodies - special construction
        90: 600.0,      # Wetland - environmental mitigation
        95: 800.0,      # Mangroves - protected, major permitting
        100: 200.0,     # Moss/lichen - remote access costs
    },

    # Road crossing costs by type
    'road_crossings': {
        'footway': 30000.0,       # Simple open cut
        'path': 30000.0,
        'track': 40000.0,
        'service': 50000.0,
        'residential': 80000.0,   # Paving restoration, traffic control
        'unclassified': 80000.0,
        'tertiary': 100000.0,     # More traffic, better restoration
        'secondary': 150000.0,    # May need HDD for busy roads
        'primary': 250000.0,      # Often HDD required
        'trunk': 400000.0,        # HDD required, major permits
        'motorway': 800000.0,     # HDD mandatory, extensive coordination
        'motorway_link': 500000.0,
        'trunk_link': 300000.0,
        'primary_link': 200000.0,
        'default': 100000.0,
    },

    # Railway crossing costs
    'railway_crossings': {
        'rail': 1200000.0,        # Active rail - HDD mandatory, RR coordination
        'light_rail': 800000.0,
        'subway': 1500000.0,      # Underground considerations
        'tram': 600000.0,
        'disused': 200000.0,      # Inactive - simpler
        'abandoned': 100000.0,
        'default': 1000000.0,
    },

    # Waterway crossing costs by estimated width (from waterway type)
    'waterway_crossings': {
        'stream': 80000.0,        # <5m typical, open cut
        'ditch': 30000.0,         # Small drainage
        'drain': 40000.0,
        'canal': 300000.0,        # Engineered, may be wide
        'river': 500000.0,        # Significant crossing, HDD likely
        'default': 150000.0,
    },

    # Powerline crossing costs
    'powerline_crossings': {
        'line': 120000.0,         # Standard transmission
        'cable': 80000.0,         # Underground cable crossing
        'minor_line': 60000.0,    # Distribution
        'default': 100000.0,
    },

    # Geohazard costs per meter in affected zones
    'geohazard_per_m': {
        0: 0.0,
        1: 0.0,       # Low risk
        2: 150.0,     # Medium - enhanced monitoring, minor mitigation
        3: 400.0,     # High - engineering solutions
        4: 800.0,     # Very high - major mitigation or avoidance
    },

    # Regional adjustment (Italy/EU)
    'regional_multiplier': 1.15,

    # Contingency
    'contingency_percent': 0.15,
}


def get_soil_category(slope_percent):
    """Map slope to soil difficulty category"""
    if slope_percent < 5:
        return 'soft_soil'
    elif slope_percent < 10:
        return 'medium_soil'
    elif slope_percent < 15:
        return 'hard_soil'
    elif slope_percent < 25:
        return 'rock_mixed'
    else:
        return 'hard_rock'


def load_datasets():
    """Load all datasets"""
    print("Loading datasets...")
    datasets = {}

    # Load DEM
    with rasterio.open(RASTER_DIR / 'dem_epsg32633_processed.tif') as src:
        datasets['dem'] = src.read(1)
        datasets['transform'] = src.transform
        datasets['crs'] = src.crs
        datasets['shape'] = src.shape

    # Compute slope
    cell_size = abs(datasets['transform'][0])
    dy, dx = np.gradient(datasets['dem'], cell_size)
    datasets['slope'] = np.sqrt(dx**2 + dy**2) * 100

    # Load landcover (resample if needed)
    from scipy.ndimage import zoom
    with rasterio.open(RASTER_DIR / 'landcover_epsg32633_processed.tif') as src:
        lc = src.read(1)
        if lc.shape != datasets['shape']:
            zoom_factors = (datasets['shape'][0]/lc.shape[0], datasets['shape'][1]/lc.shape[1])
            datasets['landcover'] = zoom(lc, zoom_factors, order=0)
        else:
            datasets['landcover'] = lc

    # Load geohazards
    with rasterio.open(RASTER_DIR / 'geohazards_epsg32633_processed.tif') as src:
        gh = src.read(1)
        if gh.shape != datasets['shape']:
            zoom_factors = (datasets['shape'][0]/gh.shape[0], datasets['shape'][1]/gh.shape[1])
            datasets['geohazards'] = zoom(gh, zoom_factors, order=0)
        else:
            datasets['geohazards'] = gh

    # Load vectors with attributes
    datasets['roads'] = gpd.read_file(VECTOR_DIR / 'osm_roads_epsg32633_processed.gpkg')
    datasets['railways'] = gpd.read_file(VECTOR_DIR / 'osm_railways_epsg32633_processed.gpkg')
    datasets['waterways'] = gpd.read_file(VECTOR_DIR / 'osm_waterways_epsg32633_processed.gpkg')
    datasets['powerlines'] = gpd.read_file(VECTOR_DIR / 'osm_power_lines_epsg32633_processed.gpkg')

    print(f"  DEM: {datasets['shape']}")
    print(f"  Roads: {len(datasets['roads'])} features")
    print(f"  Railways: {len(datasets['railways'])} features")
    print(f"  Waterways: {len(datasets['waterways'])} features")

    return datasets


def get_raster_value(x, y, raster, transform):
    """Get raster value at coordinate"""
    col = int((x - transform[2]) / transform[0])
    row = int((y - transform[5]) / transform[4])
    if 0 <= row < raster.shape[0] and 0 <= col < raster.shape[1]:
        return raster[row, col]
    return None


def analyze_crossings_detailed(line, datasets):
    """Analyze crossings with full attribute information"""
    crossings = {
        'roads': [],
        'railways': [],
        'waterways': [],
        'powerlines': [],
    }

    # Road crossings with type
    for _, road in datasets['roads'].iterrows():
        if line.intersects(road.geometry):
            road_type = road.get('highway', 'default')
            if road_type is None:
                road_type = 'default'
            crossings['roads'].append({
                'type': road_type,
                'cost': DETAILED_COSTS['road_crossings'].get(
                    road_type, DETAILED_COSTS['road_crossings']['default']
                )
            })

    # Railway crossings with type
    for _, rail in datasets['railways'].iterrows():
        if line.intersects(rail.geometry):
            rail_type = rail.get('railway', 'default')
            if rail_type is None:
                rail_type = 'default'
            crossings['railways'].append({
                'type': rail_type,
                'cost': DETAILED_COSTS['railway_crossings'].get(
                    rail_type, DETAILED_COSTS['railway_crossings']['default']
                )
            })

    # Waterway crossings with type
    for _, ww in datasets['waterways'].iterrows():
        if line.intersects(ww.geometry):
            ww_type = ww.get('waterway', 'default')
            if ww_type is None:
                ww_type = 'default'
            crossings['waterways'].append({
                'type': ww_type,
                'cost': DETAILED_COSTS['waterway_crossings'].get(
                    ww_type, DETAILED_COSTS['waterway_crossings']['default']
                )
            })

    # Powerline crossings
    for _, pl in datasets['powerlines'].iterrows():
        if line.intersects(pl.geometry):
            pl_type = pl.get('power', 'default')
            if pl_type is None:
                pl_type = 'default'
            crossings['powerlines'].append({
                'type': pl_type,
                'cost': DETAILED_COSTS['powerline_crossings'].get(
                    pl_type, DETAILED_COSTS['powerline_crossings']['default']
                )
            })

    return crossings


def analyze_route_detailed(name, geometry, datasets, truncate_y=None):
    """Perform detailed cost analysis on a route"""
    print(f"\n{'='*70}")
    print(f"DETAILED COST ANALYSIS: {name}")
    print(f"{'='*70}")

    # Handle geometry types
    if geometry.geom_type == 'MultiLineString':
        geometry = linemerge(geometry)

    if geometry.geom_type == 'MultiLineString':
        geometries = list(geometry.geoms)
    else:
        geometries = [geometry]

    # Truncate if needed
    if truncate_y is not None:
        new_geoms = []
        for geom in geometries:
            coords = list(geom.coords)
            new_coords = [(c[0], c[1]) for c in coords if c[1] >= truncate_y]
            if len(new_coords) >= 2:
                new_geoms.append(LineString(new_coords))
        if new_geoms:
            geometry = linemerge(new_geoms) if len(new_geoms) > 1 else new_geoms[0]
            if geometry.geom_type == 'MultiLineString':
                geometries = list(geometry.geoms)
            else:
                geometries = [geometry]

    # Calculate total length
    total_length = sum(g.length for g in geometries)
    total_length_km = total_length / 1000
    print(f"\nRoute Length: {total_length_km:.2f} km")

    # Sample route for terrain analysis
    sample_interval = 25  # meters

    # Cost accumulators
    base_cost = 0
    trenching_costs = defaultdict(lambda: {'distance': 0, 'cost': 0})
    landcover_costs = defaultdict(lambda: {'distance': 0, 'cost': 0})
    geohazard_costs = defaultdict(lambda: {'distance': 0, 'cost': 0})

    for geom in geometries:
        part_length = geom.length
        num_samples = max(2, int(part_length / sample_interval))
        distances = np.linspace(0, part_length, num_samples + 1)

        for i in range(len(distances) - 1):
            seg_length = distances[i+1] - distances[i]
            mid_dist = (distances[i] + distances[i+1]) / 2
            point = geom.interpolate(mid_dist)

            # Base construction cost
            base_cost += DETAILED_COSTS['base_construction_per_m'] * seg_length

            # Get slope and determine trenching difficulty
            slope = get_raster_value(point.x, point.y, datasets['slope'], datasets['transform'])
            if slope is not None:
                soil_cat = get_soil_category(slope)
                trench_cost = DETAILED_COSTS['trenching_per_m'][soil_cat] * seg_length
                trenching_costs[soil_cat]['distance'] += seg_length
                trenching_costs[soil_cat]['cost'] += trench_cost

            # Get landcover
            lc = get_raster_value(point.x, point.y, datasets['landcover'], datasets['transform'])
            if lc is not None:
                lc = int(lc)
                lc_cost = DETAILED_COSTS['landcover_per_m'].get(lc, 100) * seg_length
                landcover_costs[lc]['distance'] += seg_length
                landcover_costs[lc]['cost'] += lc_cost

            # Get geohazard
            gh = get_raster_value(point.x, point.y, datasets['geohazards'], datasets['transform'])
            if gh is not None:
                gh = int(gh)
                gh_cost = DETAILED_COSTS['geohazard_per_m'].get(gh, 0) * seg_length
                geohazard_costs[gh]['distance'] += seg_length
                geohazard_costs[gh]['cost'] += gh_cost

    # Analyze crossings
    full_geom = linemerge(geometries) if len(geometries) > 1 else geometries[0]
    crossings = analyze_crossings_detailed(full_geom, datasets)

    # Print detailed breakdown
    print(f"\n1. BASE CONSTRUCTION")
    print(f"   Materials, pipe, coating, basic labor")
    print(f"   Rate: ${DETAILED_COSTS['base_construction_per_m']:,.0f}/m × {total_length_km:.2f} km")
    print(f"   Cost: ${base_cost:,.0f}")

    print(f"\n2. TRENCHING (by soil difficulty)")
    print(f"   {'Category':<15} {'Rate ($/m)':<12} {'Distance (km)':<15} {'Cost ($)':<15}")
    print(f"   {'-'*57}")
    total_trenching = 0
    for cat in ['soft_soil', 'medium_soil', 'hard_soil', 'rock_mixed', 'hard_rock']:
        if cat in trenching_costs:
            data = trenching_costs[cat]
            rate = DETAILED_COSTS['trenching_per_m'][cat]
            print(f"   {cat:<15} ${rate:<11,.0f} {data['distance']/1000:<15.2f} ${data['cost']:>14,.0f}")
            total_trenching += data['cost']
    print(f"   {'TOTAL':<15} {'':<12} {total_length_km:<15.2f} ${total_trenching:>14,.0f}")

    lc_names = {
        0: 'No data', 10: 'Forest', 20: 'Shrubland', 30: 'Grassland',
        40: 'Cropland', 50: 'Built-up', 60: 'Bare', 70: 'Snow/ice',
        80: 'Water', 90: 'Wetland', 95: 'Mangroves', 100: 'Moss'
    }

    print(f"\n3. LANDCOVER (clearing, restoration, compensation)")
    print(f"   {'Type':<15} {'Rate ($/m)':<12} {'Distance (km)':<15} {'Cost ($)':<15}")
    print(f"   {'-'*57}")
    total_landcover = 0
    for lc, data in sorted(landcover_costs.items(), key=lambda x: -x[1]['cost']):
        if data['distance'] > 0:
            name = lc_names.get(lc, f'Type {lc}')[:15]
            rate = DETAILED_COSTS['landcover_per_m'].get(lc, 100)
            print(f"   {name:<15} ${rate:<11,.0f} {data['distance']/1000:<15.2f} ${data['cost']:>14,.0f}")
            total_landcover += data['cost']
    print(f"   {'TOTAL':<15} {'':<12} {total_length_km:<15.2f} ${total_landcover:>14,.0f}")

    print(f"\n4. GEOHAZARD MITIGATION")
    total_geohazard = sum(d['cost'] for d in geohazard_costs.values())
    print(f"   Total: ${total_geohazard:,.0f}")

    # Crossing costs
    print(f"\n5. INFRASTRUCTURE CROSSINGS")

    print(f"\n   ROAD CROSSINGS ({len(crossings['roads'])} total)")
    road_cost_total = 0
    road_by_type = defaultdict(lambda: {'count': 0, 'cost': 0})
    for c in crossings['roads']:
        road_by_type[c['type']]['count'] += 1
        road_by_type[c['type']]['cost'] += c['cost']
        road_cost_total += c['cost']

    print(f"   {'Type':<20} {'Count':<8} {'Unit Cost':<15} {'Total':<15}")
    print(f"   {'-'*58}")
    for rtype, data in sorted(road_by_type.items(), key=lambda x: -x[1]['cost']):
        unit = data['cost'] / data['count'] if data['count'] > 0 else 0
        print(f"   {rtype:<20} {data['count']:<8} ${unit:>13,.0f} ${data['cost']:>14,.0f}")
    print(f"   {'TOTAL':<20} {len(crossings['roads']):<8} {'':<15} ${road_cost_total:>14,.0f}")

    print(f"\n   RAILWAY CROSSINGS ({len(crossings['railways'])} total)")
    rail_cost_total = sum(c['cost'] for c in crossings['railways'])
    for c in crossings['railways']:
        print(f"   - {c['type']}: ${c['cost']:,.0f}")
    print(f"   Total: ${rail_cost_total:,.0f}")

    print(f"\n   WATERWAY CROSSINGS ({len(crossings['waterways'])} total)")
    ww_cost_total = 0
    ww_by_type = defaultdict(lambda: {'count': 0, 'cost': 0})
    for c in crossings['waterways']:
        ww_by_type[c['type']]['count'] += 1
        ww_by_type[c['type']]['cost'] += c['cost']
        ww_cost_total += c['cost']

    print(f"   {'Type':<20} {'Count':<8} {'Unit Cost':<15} {'Total':<15}")
    print(f"   {'-'*58}")
    for wtype, data in sorted(ww_by_type.items(), key=lambda x: -x[1]['cost']):
        unit = data['cost'] / data['count'] if data['count'] > 0 else 0
        print(f"   {wtype:<20} {data['count']:<8} ${unit:>13,.0f} ${data['cost']:>14,.0f}")
    print(f"   {'TOTAL':<20} {len(crossings['waterways']):<8} {'':<15} ${ww_cost_total:>14,.0f}")

    print(f"\n   POWERLINE CROSSINGS ({len(crossings['powerlines'])} total)")
    pl_cost_total = sum(c['cost'] for c in crossings['powerlines'])
    print(f"   Total: ${pl_cost_total:,.0f}")

    total_crossing_cost = road_cost_total + rail_cost_total + ww_cost_total + pl_cost_total

    # Summary
    subtotal = base_cost + total_trenching + total_landcover + total_geohazard + total_crossing_cost
    regional = subtotal * DETAILED_COSTS['regional_multiplier']
    contingency = regional * DETAILED_COSTS['contingency_percent']
    total = regional + contingency

    print(f"\n{'='*70}")
    print(f"COST SUMMARY")
    print(f"{'='*70}")
    print(f"   Base Construction:        ${base_cost:>15,.0f}")
    print(f"   Trenching:                ${total_trenching:>15,.0f}")
    print(f"   Landcover:                ${total_landcover:>15,.0f}")
    print(f"   Geohazard:                ${total_geohazard:>15,.0f}")
    print(f"   Crossings:                ${total_crossing_cost:>15,.0f}")
    print(f"   {'-'*40}")
    print(f"   Subtotal:                 ${subtotal:>15,.0f}")
    print(f"   Regional Factor (×{DETAILED_COSTS['regional_multiplier']}):")
    print(f"                             ${regional:>15,.0f}")
    print(f"   Contingency ({DETAILED_COSTS['contingency_percent']*100:.0f}%):       ${contingency:>15,.0f}")
    print(f"   {'-'*40}")
    print(f"   TOTAL CAPEX:              ${total:>15,.0f}")
    print(f"   Cost per km:              ${total/total_length_km:>15,.0f}")

    return {
        'length_km': total_length_km,
        'base_cost': base_cost,
        'trenching_cost': total_trenching,
        'landcover_cost': total_landcover,
        'geohazard_cost': total_geohazard,
        'crossing_cost': total_crossing_cost,
        'crossing_breakdown': {
            'roads': road_cost_total,
            'railways': rail_cost_total,
            'waterways': ww_cost_total,
            'powerlines': pl_cost_total,
        },
        'crossing_counts': {
            'roads': len(crossings['roads']),
            'railways': len(crossings['railways']),
            'waterways': len(crossings['waterways']),
            'powerlines': len(crossings['powerlines']),
        },
        'subtotal': subtotal,
        'total': total,
        'cost_per_km': total / total_length_km,
    }


def main():
    print("=" * 70)
    print("DETAILED PIPELINE COST ANALYSIS")
    print("Examining real cost drivers beyond simple length")
    print("=" * 70)

    datasets = load_datasets()

    # Load existing pipeline
    print("\nLoading existing pipeline...")
    existing_gdf = gpd.read_file(PROJECT_DIR / 'data/vectors/pipelines.gpkg')
    existing_geom = linemerge(existing_gdf.geometry.tolist())
    existing_bounds = existing_gdf.total_bounds
    truncate_y = existing_bounds[1]

    # Load A* route
    print("Loading A* generated route...")
    with open(ASTAR_ROUTE) as f:
        astar_data = json.load(f)

    astar_lines = [LineString(f['geometry']['coordinates'])
                   for f in astar_data['features']
                   if f['geometry']['type'] == 'LineString']
    astar_geom = linemerge(astar_lines)

    # Analyze both
    existing_results = analyze_route_detailed("EXISTING PIPELINE", existing_geom, datasets)
    astar_results = analyze_route_detailed("A* ROUTE (truncated)", astar_geom, datasets, truncate_y)

    # Comparison
    print(f"\n{'='*70}")
    print("SIDE-BY-SIDE COMPARISON")
    print(f"{'='*70}")

    print(f"\n{'Metric':<35} {'Existing':>18} {'A* Route':>18} {'Diff':>12}")
    print("-" * 85)

    metrics = [
        ('Length (km)', 'length_km', '{:.2f}'),
        ('Base Construction ($)', 'base_cost', '{:,.0f}'),
        ('Trenching ($)', 'trenching_cost', '{:,.0f}'),
        ('Landcover ($)', 'landcover_cost', '{:,.0f}'),
        ('Geohazard ($)', 'geohazard_cost', '{:,.0f}'),
        ('Total Crossings ($)', 'crossing_cost', '{:,.0f}'),
        ('  - Roads ($)', ('crossing_breakdown', 'roads'), '{:,.0f}'),
        ('  - Railways ($)', ('crossing_breakdown', 'railways'), '{:,.0f}'),
        ('  - Waterways ($)', ('crossing_breakdown', 'waterways'), '{:,.0f}'),
        ('  - Powerlines ($)', ('crossing_breakdown', 'powerlines'), '{:,.0f}'),
        ('TOTAL CAPEX ($)', 'total', '{:,.0f}'),
        ('Cost per km ($)', 'cost_per_km', '{:,.0f}'),
    ]

    for label, key, fmt in metrics:
        if isinstance(key, tuple):
            ex_val = existing_results[key[0]][key[1]]
            as_val = astar_results[key[0]][key[1]]
        else:
            ex_val = existing_results[key]
            as_val = astar_results[key]

        diff = as_val - ex_val
        diff_pct = (diff / ex_val * 100) if ex_val != 0 else 0

        ex_str = fmt.format(ex_val)
        as_str = fmt.format(as_val)
        diff_str = f"{diff_pct:+.1f}%"

        print(f"{label:<35} {ex_str:>18} {as_str:>18} {diff_str:>12}")

    print(f"\n{'='*70}")
    print("CROSSING COUNTS")
    print(f"{'='*70}")
    print(f"\n{'Type':<20} {'Existing':>15} {'A* Route':>15} {'Difference':>15}")
    print("-" * 65)
    for ctype in ['roads', 'railways', 'waterways', 'powerlines']:
        ex = existing_results['crossing_counts'][ctype]
        ar = astar_results['crossing_counts'][ctype]
        diff = ar - ex
        print(f"{ctype.title():<20} {ex:>15} {ar:>15} {diff:>+15}")

    # Final verdict
    total_diff = astar_results['total'] - existing_results['total']
    cpk_diff = astar_results['cost_per_km'] - existing_results['cost_per_km']

    print(f"\n{'='*70}")
    print("FINAL ANALYSIS")
    print(f"{'='*70}")

    print(f"\n  Total CAPEX Difference: ${total_diff:+,.0f}")
    print(f"  Cost per km Difference: ${cpk_diff:+,.0f}/km")

    if total_diff < 0:
        print(f"\n  >>> A* ROUTE IS ${-total_diff:,.0f} CHEAPER!")
        print(f"  >>> This represents {-total_diff/existing_results['total']*100:.1f}% savings")
    else:
        print(f"\n  >>> EXISTING PIPELINE IS ${total_diff:,.0f} CHEAPER")
        print(f"  >>> A* route is {total_diff/existing_results['total']*100:.1f}% more expensive")

    # Cost driver analysis
    print(f"\n  Key Cost Drivers (A* vs Existing):")
    drivers = [
        ('Base+Trenching (length-driven)',
         (astar_results['base_cost'] + astar_results['trenching_cost']) -
         (existing_results['base_cost'] + existing_results['trenching_cost'])),
        ('Landcover (corridor selection)',
         astar_results['landcover_cost'] - existing_results['landcover_cost']),
        ('Crossings (routing decisions)',
         astar_results['crossing_cost'] - existing_results['crossing_cost']),
    ]

    for name, diff in drivers:
        direction = "more" if diff > 0 else "less"
        print(f"    {name}: ${abs(diff):,.0f} {direction}")


if __name__ == '__main__':
    main()
