#!/usr/bin/env python3
"""
Compare existing pipeline vs A* generated route using the same cost matrix.
Truncates both to the same latitude for fair comparison.
Includes detailed cost breakdowns by category.
"""

import numpy as np
import rasterio
import geopandas as gpd
import json
from shapely.geometry import LineString, Point
from shapely.ops import linemerge, split, snap
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
# CALIBRATED COST MATRIX - Based on Real-World EU/SNAM Data
# ==============================================================================
# Target: EU Average pipeline cost ~€3.4M/km (~$3.7M/km)
# Reference: SNAM Ravenna-Chieti reconstruction, Global Energy Monitor data
#
# Structure:
#   Total Cost = Base Construction + Terrain Adder + Landcover Adder + Crossings
#   Then apply Regional Multiplier (1.2x for Western Europe/Italy)
#
# Base construction includes: materials, labor, equipment, ROW (rural avg)
# Terrain/Landcover are ADDERS on top of base (not multipliers)
# ==============================================================================

COST_MATRIX = {
    # Base construction cost (26" steel pipe, open trench)
    # Includes: pipe ($500/m), coating ($80/m), labor ($800/m), equipment ($200/m)
    # ROW averaged in (~$100/km rural = $100/m amortized over typical project)
    'base_cost_per_m': 1800.0,  # $1,800/m base = $1.8M/km before adders

    # Terrain difficulty ADDERS (additional cost on top of base)
    # Based on increased equipment needs, slower progress, safety requirements
    'terrain_adders_per_m': {
        'flat': 0.0,          # <5% slope - no additional cost
        'rolling': 200.0,     # 5-15% slope - +$200/m for grade work
        'hilly': 500.0,       # 15-25% slope - +$500/m significant earthwork
        'mountainous': 1000.0, # 25-35% slope - +$1000/m heavy equipment
        'extreme': 2000.0,    # >35% slope - +$2000/m specialized techniques
    },

    # Landcover ADDERS (additional cost on top of base)
    # Includes: clearing, grubbing, restoration, compensation
    'landcover_adders': {
        0: 0.0,      # No data - assume flat/clear
        10: 150.0,   # Tree cover - clearing and grubbing
        20: 50.0,    # Shrubland - light clearing
        30: 20.0,    # Grassland - minimal work
        40: 80.0,    # Cropland - compensation + restoration
        50: 500.0,   # Built-up - urban complexity, utilities
        60: 10.0,    # Bare/sparse vegetation - easy
        70: 200.0,   # Snow and ice - seasonal constraints
        80: 3000.0,  # Permanent water - special construction (rare on land)
        90: 300.0,   # Herbaceous wetland - environmental mitigation
        95: 500.0,   # Mangroves - protected ecosystem
        100: 150.0,  # Moss and lichen - remote access
    },

    'landcover_names': {
        0: 'No data',
        10: 'Tree cover',
        20: 'Shrubland',
        30: 'Grassland',
        40: 'Cropland',
        50: 'Built-up',
        60: 'Bare/sparse',
        70: 'Snow/ice',
        80: 'Water bodies',
        90: 'Wetland',
        95: 'Mangroves',
        100: 'Moss/lichen',
    },

    # Infrastructure crossing costs - validated against industry data
    # HDD costs: $1,500-3,000/m, typical crossing 50-200m
    'crossing_costs': {
        'road_minor': 80000.0,      # Open cut or short bore, 50-80m
        'road_major': 200000.0,     # HDD required, 100-150m, permits
        'road_avg': 150000.0,       # Weighted average for mixed roads
        'railway': 1000000.0,       # Mandatory HDD, 150-200m, railroad coordination
        'powerline': 150000.0,      # HDD under, safety requirements
        'waterway_small': 120000.0, # <10m, open cut or short HDD
        'waterway_medium': 350000.0, # 10-50m, HDD required
        'waterway_large': 600000.0,  # >50m, long HDD, environmental permits
        'waterway_avg': 150000.0,   # Weighted average (mostly small in this region)
    },

    # Geohazard ADDERS (per meter in affected zones)
    'geohazard_adders_per_m': {
        1: 0.0,     # Low risk - standard construction
        2: 100.0,   # Medium risk - enhanced monitoring
        3: 300.0,   # High risk - special engineering
        4: 500.0,   # Very high risk - major mitigation
    },

    'geohazard_names': {
        1: 'Low risk',
        2: 'Medium risk',
        3: 'High risk',
        4: 'Very high risk',
    },

    # Regional multiplier (Western Europe/Italy)
    'regional_multiplier': 1.2,
}


def resample_to_shape(src_array, src_shape, dst_shape):
    """Resample array to match destination shape using nearest neighbor"""
    from scipy.ndimage import zoom
    zoom_row = dst_shape[0] / src_shape[0]
    zoom_col = dst_shape[1] / src_shape[1]
    return zoom(src_array, (zoom_row, zoom_col), order=0)


def load_datasets():
    """Load raster and vector datasets"""
    print("Loading datasets...")
    datasets = {}

    # Load DEM
    with rasterio.open(RASTER_DIR / 'dem_epsg32633_processed.tif') as src:
        datasets['dem'] = src.read(1)
        datasets['transform'] = src.transform
        datasets['crs'] = src.crs
        datasets['shape'] = src.shape
        datasets['bounds'] = src.bounds

    ref_shape = datasets['shape']

    # Load landcover
    with rasterio.open(RASTER_DIR / 'landcover_epsg32633_processed.tif') as src:
        lc = src.read(1)
        if lc.shape != ref_shape:
            datasets['landcover'] = resample_to_shape(lc, lc.shape, ref_shape)
        else:
            datasets['landcover'] = lc

    # Load geohazards
    with rasterio.open(RASTER_DIR / 'geohazards_epsg32633_processed.tif') as src:
        gh = src.read(1)
        if gh.shape != ref_shape:
            datasets['geohazards'] = resample_to_shape(gh, gh.shape, ref_shape)
        else:
            datasets['geohazards'] = gh

    # Load vectors
    datasets['roads'] = gpd.read_file(VECTOR_DIR / 'osm_roads_epsg32633_processed.gpkg')
    datasets['railways'] = gpd.read_file(VECTOR_DIR / 'osm_railways_epsg32633_processed.gpkg')
    datasets['powerlines'] = gpd.read_file(VECTOR_DIR / 'osm_power_lines_epsg32633_processed.gpkg')
    datasets['waterways'] = gpd.read_file(VECTOR_DIR / 'osm_waterways_epsg32633_processed.gpkg')

    print(f"  DEM shape: {datasets['dem'].shape}")
    return datasets


def get_pixel_value(x, y, raster, transform):
    """Get raster value at a coordinate"""
    col, row = ~transform * (x, y)
    row, col = int(row), int(col)
    if 0 <= row < raster.shape[0] and 0 <= col < raster.shape[1]:
        return raster[row, col]
    return None


def calculate_slope(x1, y1, x2, y2, dem, transform):
    """Calculate slope percentage between two points"""
    elev1 = get_pixel_value(x1, y1, dem, transform)
    elev2 = get_pixel_value(x2, y2, dem, transform)

    if elev1 is None or elev2 is None:
        return 0.0

    dist = np.sqrt((x2-x1)**2 + (y2-y1)**2)
    if dist < 0.1:
        return 0.0

    return abs(elev2 - elev1) / dist * 100


def get_terrain_category(slope_percent):
    """Get terrain category based on slope - matches COST_MATRIX_COMPLETE.csv"""
    if slope_percent < 5:
        return 'flat'
    elif slope_percent < 15:
        return 'rolling'
    elif slope_percent < 25:
        return 'hilly'
    elif slope_percent < 35:
        return 'mountainous'
    else:
        return 'extreme'


def count_crossings(line, datasets):
    """Count infrastructure crossings for a line"""
    crossings = {
        'road': 0,
        'railway': 0,
        'powerline': 0,
        'waterway': 0,
    }

    for _, road in datasets['roads'].iterrows():
        if line.intersects(road.geometry):
            crossings['road'] += 1

    for _, rail in datasets['railways'].iterrows():
        if line.intersects(rail.geometry):
            crossings['railway'] += 1

    for _, pl in datasets['powerlines'].iterrows():
        if line.intersects(pl.geometry):
            crossings['powerline'] += 1

    for _, ww in datasets['waterways'].iterrows():
        if line.intersects(ww.geometry):
            crossings['waterway'] += 1

    return crossings


def analyze_route(geometry, datasets, sample_interval=50):
    """Analyze a route geometry and calculate total costs with detailed breakdowns.

    CALIBRATED COST MODEL (Dec 2025):
    Based on EU average ~€3.4M/km and SNAM Ravenna-Chieti project data.

    Cost Structure:
      Per-meter: Base Cost + Terrain Adder + Landcover Adder + Geohazard Adder
      Plus: Infrastructure Crossing Costs (per crossing)
      Finally: Apply Regional Multiplier (1.2x for Italy/Western Europe)
    """
    if isinstance(geometry, list):
        geometry = linemerge(geometry)

    if geometry.geom_type == 'MultiLineString':
        # Try to merge again
        geometry = linemerge(geometry)

    # Handle MultiLineString by processing each part separately
    # This avoids the issue where interpolate() jumps between disconnected parts
    if geometry.geom_type == 'MultiLineString':
        geometries = list(geometry.geoms)
    else:
        geometries = [geometry]

    # Total length is sum of all parts
    total_length = sum(g.length for g in geometries)

    # Cost breakdowns
    base_cost_total = 0
    terrain_costs = defaultdict(lambda: {'distance': 0, 'adder_cost': 0})
    landcover_costs = defaultdict(lambda: {'distance': 0, 'adder_cost': 0})
    geohazard_costs = defaultdict(lambda: {'distance': 0, 'adder_cost': 0})

    slopes = []
    elevations = []

    # Process each geometry part separately to avoid interpolation jumps
    for geom_part in geometries:
        part_length = geom_part.length
        num_samples = max(2, int(part_length / sample_interval))

        # Get points along this part
        distances = np.linspace(0, part_length, num_samples + 1)
        points = [geom_part.interpolate(d) for d in distances]

        for i in range(len(points) - 1):
            p1, p2 = points[i], points[i+1]
            segment_length = np.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2)

            # Base construction cost (always applied)
            base_cost_total += COST_MATRIX['base_cost_per_m'] * segment_length

            # Terrain/slope analysis - ADDER on top of base
            slope = calculate_slope(p1.x, p1.y, p2.x, p2.y, datasets['dem'], datasets['transform'])
            slopes.append(slope)

            terrain_cat = get_terrain_category(slope)
            terrain_adder = COST_MATRIX['terrain_adders_per_m'][terrain_cat]
            terrain_adder_cost = terrain_adder * segment_length
            terrain_costs[terrain_cat]['distance'] += segment_length
            terrain_costs[terrain_cat]['adder_cost'] += terrain_adder_cost

            # Elevation
            midx, midy = (p1.x + p2.x) / 2, (p1.y + p2.y) / 2
            elev = get_pixel_value(midx, midy, datasets['dem'], datasets['transform'])
            if elev is not None:
                elevations.append(elev)

            # Landcover - ADDER on top of base
            lc_value = get_pixel_value(midx, midy, datasets['landcover'], datasets['transform'])
            lc_code = int(lc_value) if lc_value is not None else 0
            lc_adder = COST_MATRIX['landcover_adders'].get(lc_code, 20.0)
            lc_adder_cost = lc_adder * segment_length
            landcover_costs[lc_code]['distance'] += segment_length
            landcover_costs[lc_code]['adder_cost'] += lc_adder_cost

            # Geohazard - ADDER on top of base
            gh_value = get_pixel_value(midx, midy, datasets['geohazards'], datasets['transform'])
            gh_code = int(gh_value) if gh_value is not None else 1
            gh_adder = COST_MATRIX['geohazard_adders_per_m'].get(gh_code, 0.0)
            gh_adder_cost = gh_adder * segment_length
            geohazard_costs[gh_code]['distance'] += segment_length
            geohazard_costs[gh_code]['adder_cost'] += gh_adder_cost

    # Count crossings
    crossings = count_crossings(geometry, datasets)

    # Crossing costs breakdown
    crossing_costs_breakdown = {
        'road': crossings['road'] * COST_MATRIX['crossing_costs']['road_avg'],
        'railway': crossings['railway'] * COST_MATRIX['crossing_costs']['railway'],
        'powerline': crossings['powerline'] * COST_MATRIX['crossing_costs']['powerline'],
        'waterway': crossings['waterway'] * COST_MATRIX['crossing_costs']['waterway_avg'],
    }
    total_crossing_cost = sum(crossing_costs_breakdown.values())

    # Calculate totals (before regional multiplier)
    total_terrain_adder = sum(t['adder_cost'] for t in terrain_costs.values())
    total_landcover_adder = sum(l['adder_cost'] for l in landcover_costs.values())
    total_geohazard_adder = sum(g['adder_cost'] for g in geohazard_costs.values())

    # Subtotal before regional multiplier
    subtotal = (
        base_cost_total +
        total_terrain_adder +
        total_landcover_adder +
        total_geohazard_adder +
        total_crossing_cost
    )

    # Apply regional multiplier (Italy = Western Europe = 1.2x)
    regional_multiplier = COST_MATRIX['regional_multiplier']
    total_cost = subtotal * regional_multiplier

    return {
        'total_length_m': total_length,
        'total_length_km': total_length / 1000,

        # Cost totals
        'base_cost': base_cost_total,
        'terrain_adder': total_terrain_adder,
        'landcover_adder': total_landcover_adder,
        'geohazard_adder': total_geohazard_adder,
        'crossing_cost': total_crossing_cost,
        'subtotal': subtotal,
        'regional_multiplier': regional_multiplier,
        'total_cost': total_cost,
        'cost_per_km': total_cost / (total_length / 1000) if total_length > 0 else 0,

        # Breakdowns
        'terrain_breakdown': dict(terrain_costs),
        'landcover_breakdown': dict(landcover_costs),
        'geohazard_breakdown': dict(geohazard_costs),
        'crossing_breakdown': crossing_costs_breakdown,
        'crossings': crossings,

        # Statistics
        'avg_slope': np.mean(slopes) if slopes else 0,
        'max_slope': np.max(slopes) if slopes else 0,
        'min_elevation': np.min(elevations) if elevations else 0,
        'max_elevation': np.max(elevations) if elevations else 0,
        'elevation_gain': np.sum(np.maximum(np.diff(elevations), 0)) if len(elevations) > 1 else 0,
    }


def truncate_route_to_latitude(geometry, min_y):
    """Truncate a route to only include parts above a minimum Y coordinate"""
    if geometry.geom_type == 'MultiLineString':
        geometry = linemerge(geometry)

    if geometry.geom_type == 'LineString':
        coords = list(geometry.coords)
        new_coords = []
        for x, y in coords:
            if y >= min_y:
                new_coords.append((x, y))
            else:
                if new_coords:
                    last_x, last_y = new_coords[-1]
                    if last_y > min_y:
                        t = (min_y - last_y) / (y - last_y) if (y - last_y) != 0 else 0
                        cut_x = last_x + t * (x - last_x)
                        new_coords.append((cut_x, min_y))
                break

        if len(new_coords) >= 2:
            return LineString(new_coords)

    return geometry


def print_cost_breakdown(name, analysis):
    """Print detailed cost breakdown for a route"""
    print(f"\n{'='*70}")
    print(f"DETAILED COST BREAKDOWN: {name}")
    print(f"{'='*70}")

    print(f"\n   Route Length: {analysis['total_length_km']:.2f} km")

    print(f"\n1. BASE CONSTRUCTION COST")
    print(f"   Rate: ${COST_MATRIX['base_cost_per_m']:,.0f}/m")
    print(f"   Total: ${analysis['base_cost']:,.0f}")

    print(f"\n2. TERRAIN DIFFICULTY ADDERS")
    print(f"   {'Category':<15} {'Adder/m':>10} {'Distance (km)':>15} {'Adder Cost ($)':>15}")
    print(f"   {'-'*55}")
    for cat in ['flat', 'rolling', 'hilly', 'mountainous', 'extreme']:
        if cat in analysis['terrain_breakdown']:
            data = analysis['terrain_breakdown'][cat]
            adder = COST_MATRIX['terrain_adders_per_m'][cat]
            print(f"   {cat:<15} ${adder:>9.0f} {data['distance']/1000:>15.2f} ${data['adder_cost']:>14,.0f}")
    print(f"   {'TOTAL':<15} {'':<10} {analysis['total_length_km']:>15.2f} ${analysis['terrain_adder']:>14,.0f}")

    print(f"\n3. LANDCOVER ADDERS")
    print(f"   {'Type':<20} {'Adder/m':>10} {'Distance (km)':>15} {'Adder Cost ($)':>15}")
    print(f"   {'-'*60}")
    for lc_code, data in sorted(analysis['landcover_breakdown'].items(), key=lambda x: -x[1]['adder_cost']):
        lc_name = COST_MATRIX['landcover_names'].get(lc_code, f'Type {lc_code}')
        lc_adder = COST_MATRIX['landcover_adders'].get(lc_code, 20)
        if data['distance'] > 0:
            print(f"   {lc_name:<20} ${lc_adder:>9,.0f} {data['distance']/1000:>15.2f} ${data['adder_cost']:>14,.0f}")
    print(f"   {'TOTAL':<20} {'':<10} {analysis['total_length_km']:>15.2f} ${analysis['landcover_adder']:>14,.0f}")

    print(f"\n4. GEOHAZARD ADDERS")
    print(f"   {'Risk Level':<20} {'Adder/m':>10} {'Distance (km)':>15} {'Adder Cost ($)':>15}")
    print(f"   {'-'*60}")
    for gh_code, data in sorted(analysis['geohazard_breakdown'].items()):
        gh_name = COST_MATRIX['geohazard_names'].get(gh_code, f'Level {gh_code}')
        gh_adder = COST_MATRIX['geohazard_adders_per_m'].get(gh_code, 0.0)
        if data['distance'] > 0:
            print(f"   {gh_name:<20} ${gh_adder:>9.0f} {data['distance']/1000:>15.2f} ${data['adder_cost']:>14,.0f}")
    print(f"   {'TOTAL':<20} {'':<10} {analysis['total_length_km']:>15.2f} ${analysis['geohazard_adder']:>14,.0f}")

    print(f"\n5. INFRASTRUCTURE CROSSING COSTS")
    print(f"   {'Type':<20} {'Count':>10} {'Cost/Crossing':>15} {'Total Cost ($)':>15}")
    print(f"   {'-'*60}")
    crossing_types = [
        ('Road (avg)', 'road', COST_MATRIX['crossing_costs']['road_avg']),
        ('Railway', 'railway', COST_MATRIX['crossing_costs']['railway']),
        ('Powerline', 'powerline', COST_MATRIX['crossing_costs']['powerline']),
        ('Waterway (avg)', 'waterway', COST_MATRIX['crossing_costs']['waterway_avg']),
    ]
    for name, key, cost in crossing_types:
        count = analysis['crossings'][key]
        total = analysis['crossing_breakdown'][key]
        print(f"   {name:<20} {count:>10} ${cost:>14,.0f} ${total:>14,.0f}")
    print(f"   {'TOTAL':<20} {sum(analysis['crossings'].values()):>10} {'':<15} ${analysis['crossing_cost']:>14,.0f}")

    print(f"\n{'='*70}")
    print(f"COST SUMMARY (Calibrated to EU Average ~$3.4M/km)")
    print(f"{'='*70}")
    print(f"   Base Construction:            ${analysis['base_cost']:>14,.0f}")
    print(f"   + Terrain Adders:             ${analysis['terrain_adder']:>14,.0f}")
    print(f"   + Landcover Adders:           ${analysis['landcover_adder']:>14,.0f}")
    print(f"   + Geohazard Adders:           ${analysis['geohazard_adder']:>14,.0f}")
    print(f"   + Infrastructure Crossings:   ${analysis['crossing_cost']:>14,.0f}")
    print(f"   {'-'*50}")
    print(f"   SUBTOTAL:                     ${analysis['subtotal']:>14,.0f}")
    print(f"   x Regional Multiplier (Italy): {analysis['regional_multiplier']:.1f}x")
    print(f"   {'-'*50}")
    print(f"   TOTAL COST:                   ${analysis['total_cost']:>14,.0f}")
    print(f"   Cost per km:                  ${analysis['cost_per_km']:>14,.0f}")

    print(f"\n   Terrain Stats:")
    print(f"     Average slope: {analysis['avg_slope']:.1f}%")
    print(f"     Maximum slope: {analysis['max_slope']:.1f}%")
    print(f"     Elevation range: {analysis['min_elevation']:.0f}m - {analysis['max_elevation']:.0f}m")
    print(f"     Total elevation gain: {analysis['elevation_gain']:.0f}m")


def main():
    print("=" * 70)
    print("PIPELINE ROUTE COST COMPARISON")
    print("Existing Pipeline vs A* Generated Route")
    print("=" * 70)

    # Load datasets
    datasets = load_datasets()

    # Load existing pipeline
    print("\nLoading existing pipeline...")
    existing_gdf = gpd.read_file(PROJECT_DIR / 'data/vectors/pipelines.gpkg')
    existing_lines = existing_gdf.geometry.tolist()
    existing_merged = linemerge(existing_lines)

    # Get existing pipeline bounds
    existing_bounds = existing_gdf.total_bounds
    existing_min_y = existing_bounds[1]
    existing_max_y = existing_bounds[3]

    print(f"  Existing pipeline Y range: {existing_min_y:.2f} to {existing_max_y:.2f}")
    print(f"  Existing pipeline total length: {existing_merged.length/1000:.2f} km")

    # Load A* route
    print("\nLoading A* generated route...")
    with open(ASTAR_ROUTE) as f:
        astar_data = json.load(f)

    astar_lines = []
    for feat in astar_data['features']:
        if feat['geometry']['type'] == 'LineString':
            coords = feat['geometry']['coordinates']
            astar_lines.append(LineString(coords))

    astar_merged = linemerge(astar_lines)

    # Get A* route bounds
    astar_bounds = astar_merged.bounds
    print(f"  A* route Y range: {astar_bounds[1]:.2f} to {astar_bounds[3]:.2f}")
    print(f"  A* route total length: {astar_merged.length/1000:.2f} km")

    # Truncate A* route
    print(f"\n{'='*70}")
    print("TRUNCATING A* ROUTE FOR FAIR COMPARISON")
    print(f"Cutoff latitude (Y): {existing_min_y:.2f}")
    print(f"{'='*70}")

    astar_truncated = truncate_route_to_latitude(astar_merged, existing_min_y)

    print(f"\nExisting pipeline: {existing_merged.length/1000:.2f} km")
    print(f"A* route (truncated): {astar_truncated.length/1000:.2f} km")

    # Analyze both routes
    print(f"\nAnalyzing routes (this may take a moment)...")
    existing_analysis = analyze_route(existing_merged, datasets)
    astar_analysis = analyze_route(astar_truncated, datasets)

    # Print detailed breakdowns
    print_cost_breakdown("EXISTING PIPELINE", existing_analysis)
    print_cost_breakdown("A* GENERATED ROUTE (Truncated)", astar_analysis)

    # Comparison summary
    print(f"\n{'='*70}")
    print("SIDE-BY-SIDE COMPARISON")
    print(f"{'='*70}")

    print(f"\n{'Metric':<35} {'Existing':>18} {'A* Route':>18} {'Diff %':>10}")
    print("-" * 85)

    comparisons = [
        ('Total Length (km)', existing_analysis['total_length_km'], astar_analysis['total_length_km']),
        ('Base Construction ($)', existing_analysis['base_cost'], astar_analysis['base_cost']),
        ('Terrain Adders ($)', existing_analysis['terrain_adder'], astar_analysis['terrain_adder']),
        ('Landcover Adders ($)', existing_analysis['landcover_adder'], astar_analysis['landcover_adder']),
        ('Geohazard Adders ($)', existing_analysis['geohazard_adder'], astar_analysis['geohazard_adder']),
        ('Crossing Costs ($)', existing_analysis['crossing_cost'], astar_analysis['crossing_cost']),
        ('Subtotal ($)', existing_analysis['subtotal'], astar_analysis['subtotal']),
        ('TOTAL COST ($)', existing_analysis['total_cost'], astar_analysis['total_cost']),
        ('Cost per km ($)', existing_analysis['cost_per_km'], astar_analysis['cost_per_km']),
        ('Average Slope (%)', existing_analysis['avg_slope'], astar_analysis['avg_slope']),
        ('Max Slope (%)', existing_analysis['max_slope'], astar_analysis['max_slope']),
    ]

    for name, ex_val, as_val in comparisons:
        diff_pct = ((as_val - ex_val) / ex_val * 100) if ex_val != 0 else 0
        if 'Cost' in name or 'km' in name.lower():
            print(f"{name:<35} {ex_val:>18,.0f} {as_val:>18,.0f} {diff_pct:>+9.1f}%")
        else:
            print(f"{name:<35} {ex_val:>18.2f} {as_val:>18.2f} {diff_pct:>+9.1f}%")

    # Final verdict
    savings = existing_analysis['total_cost'] - astar_analysis['total_cost']
    savings_pct = (savings / existing_analysis['total_cost'] * 100) if existing_analysis['total_cost'] != 0 else 0

    print(f"\n{'='*70}")
    print("FINAL VERDICT")
    print(f"{'='*70}")

    if savings > 0:
        print(f"\n  A* ROUTE IS CHEAPER BY: ${savings:,.0f} ({savings_pct:.1f}% savings)")
    else:
        print(f"\n  EXISTING PIPELINE IS CHEAPER BY: ${-savings:,.0f} ({-savings_pct:.1f}% savings)")

    length_diff = astar_analysis['total_length_km'] - existing_analysis['total_length_km']
    length_pct = (length_diff / existing_analysis['total_length_km'] * 100) if existing_analysis['total_length_km'] > 0 else 0

    if length_diff > 0:
        print(f"  A* route is {length_diff:.2f} km LONGER ({length_pct:.1f}%)")
    else:
        print(f"  A* route is {-length_diff:.2f} km SHORTER ({-length_pct:.1f}%)")

    print(f"\n  Cost efficiency comparison:")
    print(f"    Existing pipeline: ${existing_analysis['cost_per_km']:,.0f}/km")
    print(f"    A* generated route: ${astar_analysis['cost_per_km']:,.0f}/km")

    efficiency_diff = existing_analysis['cost_per_km'] - astar_analysis['cost_per_km']
    if efficiency_diff > 0:
        print(f"    A* route is ${efficiency_diff:,.0f}/km MORE EFFICIENT")
    else:
        print(f"    Existing pipeline is ${-efficiency_diff:,.0f}/km MORE EFFICIENT")


if __name__ == '__main__':
    main()
