#!/usr/bin/env python3
"""
Generate Route Metadata Sidecar Files

This script generates JSON sidecar files for each route in PIRL/outputs.
The sidecar contains:
1. Generation method (A*, Dijkstra, PIRL, etc.)
2. Cost matrix used
3. Constraint compliance audit
4. Detailed cost breakdown
5. Terrain/landcover/crossing statistics

Sidecar naming: {route_name}.metadata.json
"""

import json
import numpy as np
import geopandas as gpd
import rasterio
from shapely.geometry import LineString, MultiLineString
from shapely.ops import linemerge
from pathlib import Path
from collections import defaultdict
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
VECTOR_DIR = PROJECT_DIR / 'data/vectors/processed'
PIRL_OUTPUTS = PROJECT_DIR / 'PIRL/outputs'

# SAIPEM Constraints
SAIPEM_CONSTRAINTS = {
    'max_slope_percent': 20.0,
    'house_clearance_m': 13.5,
    'powerline_clearance_m': 6.0,
    'railway_clearance_m': 10.0,
    'water_blocked': True,
    'built_up_blocked': True,
}

# Detailed Cost Matrix (calibrated Dec 2025)
DETAILED_COST_MATRIX = {
    'version': '2.0',
    'calibration_date': '2025-12-12',
    'reference': 'SNAM Ravenna-Chieti reconstruction, EU pipeline benchmarks',

    'base_construction_per_m': 800.0,

    'trenching_per_m': {
        'soft_soil': {'slope_range': '0-5%', 'cost': 200.0, 'description': 'Alluvial plains, easy excavation'},
        'medium_soil': {'slope_range': '5-10%', 'cost': 350.0, 'description': 'Mixed soil, standard equipment'},
        'hard_soil': {'slope_range': '10-15%', 'cost': 500.0, 'description': 'Compact soil, soft rock'},
        'rock_mixed': {'slope_range': '15-25%', 'cost': 800.0, 'description': 'Rock outcrops, ripping needed'},
        'hard_rock': {'slope_range': '>25%', 'cost': 1500.0, 'description': 'Solid rock, blasting required'},
    },

    'landcover_per_m': {
        '0': {'name': 'No data', 'cost': 50.0},
        '10': {'name': 'Tree cover', 'cost': 400.0, 'description': 'Clearing + grubbing + restoration'},
        '20': {'name': 'Shrubland', 'cost': 150.0, 'description': 'Light clearing'},
        '30': {'name': 'Grassland', 'cost': 80.0, 'description': 'Minimal, topsoil handling'},
        '40': {'name': 'Cropland', 'cost': 200.0, 'description': 'Compensation + restoration'},
        '50': {'name': 'Built-up', 'cost': 1000.0, 'description': 'Utility relocation, permits'},
        '60': {'name': 'Bare/sparse', 'cost': 50.0, 'description': 'Easiest terrain'},
        '70': {'name': 'Snow/ice', 'cost': 300.0, 'description': 'Seasonal constraints'},
        '80': {'name': 'Water bodies', 'cost': 5000.0, 'description': 'Special construction'},
        '90': {'name': 'Wetland', 'cost': 600.0, 'description': 'Environmental mitigation'},
        '95': {'name': 'Mangroves', 'cost': 800.0, 'description': 'Protected ecosystem'},
        '100': {'name': 'Moss/lichen', 'cost': 200.0, 'description': 'Remote access'},
    },

    'road_crossings': {
        'footway': 30000, 'path': 30000, 'track': 40000,
        'service': 50000, 'residential': 80000, 'unclassified': 80000,
        'tertiary': 100000, 'secondary': 150000, 'primary': 250000,
        'trunk': 400000, 'motorway': 800000,
        'motorway_link': 500000, 'trunk_link': 300000, 'primary_link': 200000,
        'default': 100000,
    },

    'railway_crossings': {
        'rail': 1200000, 'light_rail': 800000, 'subway': 1500000,
        'tram': 600000, 'disused': 200000, 'abandoned': 100000,
        'default': 1000000,
    },

    'waterway_crossings': {
        'stream': 80000, 'ditch': 30000, 'drain': 40000,
        'canal': 300000, 'river': 500000, 'default': 150000,
    },

    'powerline_crossing': 150000,
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

    # Compute slope
    cell_size = abs(rasters['transform'][0])
    dy, dx = np.gradient(rasters['dem'], cell_size)
    rasters['slope'] = np.sqrt(dx**2 + dy**2) * 100

    return rasters


def load_vectors():
    """Load vector layers for crossing analysis"""
    vectors = {}
    vectors['roads'] = gpd.read_file(VECTOR_DIR / 'osm_roads_epsg32633_processed.gpkg')
    vectors['railways'] = gpd.read_file(VECTOR_DIR / 'osm_railways_epsg32633_processed.gpkg')
    vectors['powerlines'] = gpd.read_file(VECTOR_DIR / 'osm_power_lines_epsg32633_processed.gpkg')
    vectors['waterways'] = gpd.read_file(VECTOR_DIR / 'osm_waterways_epsg32633_processed.gpkg')
    return vectors


def load_route_geometry(filepath):
    """Load route geometry from GeoJSON or GeoPackage"""
    if str(filepath).endswith('.gpkg'):
        gdf = gpd.read_file(filepath)
        all_geoms = []
        for geom in gdf.geometry:
            if geom.geom_type == 'LineString':
                all_geoms.append(geom)
            elif geom.geom_type == 'MultiLineString':
                for part in geom.geoms:
                    all_geoms.append(part)
        merged = linemerge(all_geoms)
        if merged.geom_type == 'MultiLineString':
            return max(merged.geoms, key=lambda g: g.length)
        return merged
    else:
        with open(filepath) as f:
            data = json.load(f)

        coords = []
        for feature in data.get('features', []):
            geom = feature.get('geometry', {})
            if geom.get('type') == 'LineString':
                coords.extend(geom.get('coordinates', []))
            elif geom.get('type') == 'MultiLineString':
                for part in geom.get('coordinates', []):
                    coords.extend(part)

        if not coords:
            return None
        return LineString(coords)


def sample_route(geometry, rasters, sample_interval=1.0):
    """Sample raster values along route at 1m intervals"""
    if geometry is None:
        return None

    dem = rasters['dem']
    landcover = rasters['landcover']
    slope = rasters['slope']
    transform = rasters['transform']
    shape = rasters['shape']

    length = geometry.length
    num_samples = max(2, int(length / sample_interval))

    samples = {
        'slope': [],
        'landcover': [],
        'elevation': [],
    }

    for i in range(num_samples + 1):
        d = (i / num_samples) * length
        point = geometry.interpolate(d)

        col = int((point.x - transform[2]) / transform[0])
        row = int((point.y - transform[5]) / transform[4])

        if 0 <= row < shape[0] and 0 <= col < shape[1]:
            samples['slope'].append(float(slope[row, col]))
            samples['landcover'].append(int(landcover[row, col]))
            samples['elevation'].append(float(dem[row, col]))

    return samples


def audit_constraints(samples):
    """Audit route against SAIPEM constraints"""
    if not samples:
        return None

    violations = {
        'slope': {
            'compliant': True,
            'max_allowed': SAIPEM_CONSTRAINTS['max_slope_percent'],
            'violations': [],
            'total_violation_length_m': 0,
        },
        'built_up': {
            'compliant': True,
            'violations': [],
            'total_violation_length_m': 0,
        },
        'water': {
            'compliant': True,
            'violations': [],
            'total_violation_length_m': 0,
        },
    }

    # Slope violations
    slope_violations = []
    for i, s in enumerate(samples['slope']):
        if s > SAIPEM_CONSTRAINTS['max_slope_percent']:
            slope_violations.append({'index': i, 'slope': s})

    if slope_violations:
        violations['slope']['compliant'] = False
        violations['slope']['max_found'] = max(v['slope'] for v in slope_violations)
        violations['slope']['violation_count'] = len(slope_violations)
        violations['slope']['total_violation_length_m'] = len(slope_violations)  # 1m sampling

    # Built-up violations
    built_up_count = sum(1 for lc in samples['landcover'] if lc == 50)
    if built_up_count > 0:
        violations['built_up']['compliant'] = False
        violations['built_up']['total_violation_length_m'] = built_up_count

    # Water violations
    water_count = sum(1 for lc in samples['landcover'] if lc == 80)
    if water_count > 0:
        violations['water']['compliant'] = False
        violations['water']['total_violation_length_m'] = water_count

    # Overall compliance
    violations['overall_compliant'] = (
        violations['slope']['compliant'] and
        violations['built_up']['compliant'] and
        violations['water']['compliant']
    )

    return violations


def calculate_terrain_stats(samples):
    """Calculate terrain statistics"""
    if not samples:
        return None

    slopes = samples['slope']
    elevations = samples['elevation']

    return {
        'slope': {
            'min': float(np.min(slopes)),
            'max': float(np.max(slopes)),
            'mean': float(np.mean(slopes)),
            'median': float(np.median(slopes)),
            'std': float(np.std(slopes)),
        },
        'elevation': {
            'min': float(np.min(elevations)),
            'max': float(np.max(elevations)),
            'range': float(np.max(elevations) - np.min(elevations)),
            'total_gain': float(sum(max(0, elevations[i+1] - elevations[i]) for i in range(len(elevations)-1))),
        },
        'terrain_distribution': {
            'flat_pct': float(sum(1 for s in slopes if s <= 5) / len(slopes) * 100),
            'rolling_pct': float(sum(1 for s in slopes if 5 < s <= 10) / len(slopes) * 100),
            'hilly_pct': float(sum(1 for s in slopes if 10 < s <= 15) / len(slopes) * 100),
            'mountainous_pct': float(sum(1 for s in slopes if 15 < s <= 20) / len(slopes) * 100),
            'steep_pct': float(sum(1 for s in slopes if s > 20) / len(slopes) * 100),
        },
    }


def calculate_landcover_stats(samples, length_m):
    """Calculate landcover distribution"""
    if not samples:
        return None

    lc_counts = defaultdict(int)
    for lc in samples['landcover']:
        lc_counts[lc] += 1

    total = len(samples['landcover'])

    lc_names = {
        10: 'tree_cover', 20: 'shrubland', 30: 'grassland', 40: 'cropland',
        50: 'built_up', 60: 'bare_sparse', 70: 'snow_ice', 80: 'water',
        90: 'wetland', 95: 'mangroves', 100: 'moss_lichen',
    }

    distribution = {}
    for lc, count in lc_counts.items():
        name = lc_names.get(lc, f'lc_{lc}')
        distribution[name] = {
            'length_m': float(count * length_m / total),
            'percentage': float(count / total * 100),
            'landcover_class': lc,
        }

    return distribution


def count_crossings(geometry, vectors):
    """Count infrastructure crossings by type"""
    if geometry is None:
        return None

    crossings = {
        'roads': {'total': 0, 'by_type': defaultdict(int), 'cost': 0},
        'railways': {'total': 0, 'by_type': defaultdict(int), 'cost': 0},
        'waterways': {'total': 0, 'by_type': defaultdict(int), 'cost': 0},
        'powerlines': {'total': 0, 'cost': 0},
    }

    route_buffer = geometry.buffer(5)

    # Roads
    for _, row in vectors['roads'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            hw_type = row.get('highway', 'default') or 'default'
            crossings['roads']['by_type'][hw_type] += 1
            crossings['roads']['total'] += 1
            crossings['roads']['cost'] += DETAILED_COST_MATRIX['road_crossings'].get(
                hw_type, DETAILED_COST_MATRIX['road_crossings']['default']
            )

    # Railways
    for _, row in vectors['railways'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            rw_type = row.get('railway', 'default') or 'default'
            crossings['railways']['by_type'][rw_type] += 1
            crossings['railways']['total'] += 1
            crossings['railways']['cost'] += DETAILED_COST_MATRIX['railway_crossings'].get(
                rw_type, DETAILED_COST_MATRIX['railway_crossings']['default']
            )

    # Waterways
    for _, row in vectors['waterways'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            ww_type = row.get('waterway', 'default') or 'default'
            crossings['waterways']['by_type'][ww_type] += 1
            crossings['waterways']['total'] += 1
            crossings['waterways']['cost'] += DETAILED_COST_MATRIX['waterway_crossings'].get(
                ww_type, DETAILED_COST_MATRIX['waterway_crossings']['default']
            )

    # Powerlines
    for _, row in vectors['powerlines'].iterrows():
        if row.geometry and route_buffer.intersects(row.geometry):
            crossings['powerlines']['total'] += 1
            crossings['powerlines']['cost'] += DETAILED_COST_MATRIX['powerline_crossing']

    # Convert defaultdicts to regular dicts for JSON serialization
    crossings['roads']['by_type'] = dict(crossings['roads']['by_type'])
    crossings['railways']['by_type'] = dict(crossings['railways']['by_type'])
    crossings['waterways']['by_type'] = dict(crossings['waterways']['by_type'])

    return crossings


def calculate_detailed_cost(geometry, samples, crossings):
    """Calculate detailed cost breakdown"""
    if geometry is None or samples is None:
        return None

    length_m = geometry.length

    # Base construction
    base_cost = length_m * DETAILED_COST_MATRIX['base_construction_per_m']

    # Trenching by terrain
    trenching_cost = 0
    trenching_breakdown = defaultdict(lambda: {'length_m': 0, 'cost': 0})

    for slope in samples['slope']:
        segment_length = length_m / len(samples['slope'])

        if slope <= 5:
            category = 'soft_soil'
        elif slope <= 10:
            category = 'medium_soil'
        elif slope <= 15:
            category = 'hard_soil'
        elif slope <= 25:
            category = 'rock_mixed'
        else:
            category = 'hard_rock'

        cost = segment_length * DETAILED_COST_MATRIX['trenching_per_m'][category]['cost']
        trenching_cost += cost
        trenching_breakdown[category]['length_m'] += segment_length
        trenching_breakdown[category]['cost'] += cost

    # Landcover
    landcover_cost = 0
    landcover_breakdown = defaultdict(lambda: {'length_m': 0, 'cost': 0})

    for lc in samples['landcover']:
        segment_length = length_m / len(samples['landcover'])
        lc_str = str(lc)
        cost_info = DETAILED_COST_MATRIX['landcover_per_m'].get(lc_str, {'cost': 100})
        cost = segment_length * cost_info['cost']
        landcover_cost += cost

        name = cost_info.get('name', f'LC {lc}')
        landcover_breakdown[name]['length_m'] += segment_length
        landcover_breakdown[name]['cost'] += cost

    # Crossings
    crossing_cost = (
        crossings['roads']['cost'] +
        crossings['railways']['cost'] +
        crossings['waterways']['cost'] +
        crossings['powerlines']['cost']
    ) if crossings else 0

    # Subtotal and regional multiplier
    subtotal = base_cost + trenching_cost + landcover_cost + crossing_cost
    regional_mult = DETAILED_COST_MATRIX['regional_multiplier']
    total = subtotal * regional_mult

    return {
        'base_construction': {
            'cost': base_cost,
            'rate_per_m': DETAILED_COST_MATRIX['base_construction_per_m'],
        },
        'trenching': {
            'cost': trenching_cost,
            'breakdown': dict(trenching_breakdown),
        },
        'landcover': {
            'cost': landcover_cost,
            'breakdown': dict(landcover_breakdown),
        },
        'crossings': {
            'cost': crossing_cost,
            'breakdown': {
                'roads': crossings['roads']['cost'] if crossings else 0,
                'railways': crossings['railways']['cost'] if crossings else 0,
                'waterways': crossings['waterways']['cost'] if crossings else 0,
                'powerlines': crossings['powerlines']['cost'] if crossings else 0,
            },
        },
        'subtotal': subtotal,
        'regional_multiplier': regional_mult,
        'total': total,
        'cost_per_km': total / (length_m / 1000) if length_m > 0 else 0,
    }


def detect_generation_method(filepath, geojson_data=None):
    """
    Detect the method used to generate the route.

    IMPORTANT: Only report what can be definitively determined from:
    1. Embedded metadata in the GeoJSON file
    2. Filename patterns for routes we generated in this session

    For legacy routes without embedded metadata, report as "Unknown" rather than guessing.
    """
    filename = Path(filepath).name.lower()

    # First check for embedded metadata - this is the authoritative source
    if geojson_data:
        metadata = geojson_data.get('metadata', {})

        # Check for explicit algorithm field
        if 'algorithm' in metadata:
            return {
                'method': metadata.get('algorithm'),
                'algorithm': metadata.get('algorithm'),
                'constraint_enforcement': metadata.get('constraint_enforcement', 'unknown'),
                'description': metadata.get('description', 'From embedded metadata'),
                'source': 'embedded_metadata',
            }

        # Check criteria field (our A* routes have this)
        if 'criteria' in metadata:
            return {
                'method': 'A* with SAIPEM Criteria',
                'algorithm': 'A*',
                'constraint_enforcement': 'cost_weighted',
                'description': 'A* pathfinding using SAIPEM routing criteria',
                'source': 'embedded_metadata',
            }

    # Only identify routes we KNOW were generated in this session
    # These specific filenames are from our current work
    known_routes = {
        'test_project2_astar_saipem_compliant.geojson': {
            'method': 'A* with Hard SAIPEM Constraints',
            'algorithm': 'A*',
            'constraint_enforcement': 'hard',
            'description': 'A* pathfinding with hard blocks for slope >20% and built-up areas',
            'source': 'known_generation',
        },
        'test_project2_astar_saipem_correct_endpoints.geojson': {
            'method': 'A* Cost Optimization',
            'algorithm': 'A*',
            'constraint_enforcement': 'soft',
            'description': 'A* pathfinding with cost penalties (not hard blocks)',
            'source': 'known_generation',
        },
        'test_project2_dijkstra_shortest.geojson': {
            'method': 'Dijkstra Shortest Path',
            'algorithm': 'Dijkstra',
            'constraint_enforcement': 'slope_only',
            'description': 'Shortest feasible path with slope constraint',
            'source': 'known_generation',
        },
    }

    if filename in known_routes:
        return known_routes[filename]

    # For any other route, we don't know how it was generated
    # Return unknown rather than guessing
    return {
        'method': 'Unknown',
        'algorithm': 'Unknown',
        'constraint_enforcement': 'unknown',
        'description': 'Generation method not available - no embedded metadata',
        'source': 'not_available',
    }


def generate_metadata(filepath, rasters, vectors):
    """Generate complete metadata for a route"""
    print(f"Processing: {filepath.name}")

    # Load route geometry
    geometry = load_route_geometry(filepath)
    if geometry is None:
        print(f"  Could not load geometry from {filepath}")
        return None

    # Load original GeoJSON for method detection
    geojson_data = None
    if str(filepath).endswith('.geojson'):
        with open(filepath) as f:
            geojson_data = json.load(f)

    # Sample route
    samples = sample_route(geometry, rasters)

    # Count crossings
    crossings = count_crossings(geometry, vectors)

    # Generate all metadata components
    metadata = {
        'route_file': filepath.name,
        'generated_at': datetime.now().isoformat(),
        'metadata_version': '1.0',

        'route_info': {
            'length_m': geometry.length,
            'length_km': geometry.length / 1000,
            'start_point': list(geometry.coords[0])[:2],
            'end_point': list(geometry.coords[-1])[:2],
            'crs': 'EPSG:32633',
        },

        'generation_method': detect_generation_method(filepath, geojson_data),

        'cost_matrix': DETAILED_COST_MATRIX,

        'saipem_constraints': SAIPEM_CONSTRAINTS,

        'constraint_compliance': audit_constraints(samples),

        'terrain_statistics': calculate_terrain_stats(samples),

        'landcover_distribution': calculate_landcover_stats(samples, geometry.length),

        'infrastructure_crossings': crossings,

        'cost_breakdown': calculate_detailed_cost(geometry, samples, crossings),
    }

    return metadata


def main(specific_files=None):
    """
    Generate metadata sidecars for routes.

    Args:
        specific_files: List of specific filenames to process. If None, processes all.
    """
    print("="*60)
    print("Generating Route Metadata Sidecars")
    print("="*60)

    # Load rasters and vectors
    print("\nLoading rasters...")
    rasters = load_rasters()

    print("Loading vectors...")
    vectors = load_vectors()

    # Find route files to process
    if specific_files:
        route_files = [PIRL_OUTPUTS / f for f in specific_files if (PIRL_OUTPUTS / f).exists()]
    else:
        route_files = list(PIRL_OUTPUTS.glob('*.geojson'))

    print(f"\nProcessing {len(route_files)} route files")

    # Generate metadata for each
    for route_file in route_files:
        try:
            metadata = generate_metadata(route_file, rasters, vectors)

            if metadata:
                # Write sidecar file
                sidecar_path = route_file.with_suffix('.metadata.json')
                with open(sidecar_path, 'w') as f:
                    json.dump(metadata, f, indent=2)
                print(f"  Created: {sidecar_path.name}")

                # Print summary
                compliance = metadata.get('constraint_compliance', {})
                cost = metadata.get('cost_breakdown', {})
                print(f"    Length: {metadata['route_info']['length_km']:.2f} km")
                print(f"    Total Cost: ${cost.get('total', 0)/1e6:.2f}M")
                print(f"    Compliant: {'YES' if compliance.get('overall_compliant') else 'NO'}")
        except Exception as e:
            print(f"  Error processing {route_file.name}: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "="*60)
    print("Done!")
    print("="*60)


if __name__ == "__main__":
    import sys

    # Process specific routes from command line, or key routes by default
    if len(sys.argv) > 1:
        files = sys.argv[1:]
    else:
        # Default: only process routes we generated in this session
        files = [
            'test_project2_astar_saipem_compliant.geojson',
            'test_project2_astar_saipem_correct_endpoints.geojson',
            'test_project2_dijkstra_shortest.geojson',
        ]

    main(specific_files=files)
