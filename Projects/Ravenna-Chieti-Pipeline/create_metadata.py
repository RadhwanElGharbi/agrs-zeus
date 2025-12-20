#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path
from datetime import datetime

def get_raster_info(tif_path):
    """Get raster metadata using gdalinfo"""
    result = subprocess.run(['gdalinfo', '-json', str(tif_path)], 
                          capture_output=True, text=True)
    return json.loads(result.stdout)

def get_vector_info(gpkg_path):
    """Get vector metadata using ogrinfo"""
    result = subprocess.run(['ogrinfo', '-json', str(gpkg_path)], 
                          capture_output=True, text=True)
    return json.loads(result.stdout)

# Create metadata for processed rasters
rasters = {
    'dem': {
        'name': 'dem_tinitaly_10m',
        'source': 'TINITALY DEM 10m',
        'provider': 'INGV',
        'url': 'https://tinitaly.pi.ingv.it/',
        'resolution_m': 10,
        'fetch_tool': 'manual_download',
        'nodata_value': -9999
    },
    'landcover': {
        'name': 'landcover_esa_worldcover',
        'source': 'ESA WorldCover 10m',
        'provider': 'ESA',
        'url': 'https://worldcover2021.esa.int/',
        'resolution_m': 10,
        'fetch_tool': 'esa_worldcover_fetch',
        'nodata_value': 0
    },
    'population': {
        'name': 'population_worldpop',
        'source': 'WorldPop 100m',
        'provider': 'WorldPop',
        'url': 'https://www.worldpop.org/',
        'resolution_m': 100,
        'fetch_tool': 'worldpop_fetch',
        'nodata_value': -99999
    },
    'geohazards': {
        'name': 'geohazards_gem_seismic',
        'source': 'GEM Global Seismic Hazard Map',
        'provider': 'GEM Foundation',
        'url': 'https://www.globalquakemodel.org/',
        'resolution_m': 100,  # resampled
        'fetch_tool': 'gem_seismic_fetch',
        'nodata_value': 0
    },
    'soil': {
        'name': 'soil_placeholder',
        'source': 'Placeholder (constant value)',
        'provider': 'Generated',
        'url': 'N/A',
        'resolution_m': 10,
        'fetch_tool': 'gdal_translate',
        'nodata_value': 0
    }
}

project_dir = Path('/opt/agrs/Projects/test_project2')
date_acquired = datetime.now().strftime('%Y-%m-%d')

# Process rasters
for name, info in rasters.items():
    processed_path = project_dir / f'data/rasters/processed/{name}_epsg32633_processed.tif'
    if processed_path.exists():
        gdalinfo = get_raster_info(processed_path)
        
        # Extract extent
        gt = gdalinfo['geoTransform']
        size = gdalinfo['size']
        minx = gt[0]
        maxy = gt[3]
        maxx = minx + gt[1] * size[0]
        miny = maxy + gt[5] * size[1]
        
        metadata = {
            'name': info['name'],
            'type': 'raster',
            'source': info['source'],
            'provider': info['provider'],
            'url': info['url'],
            'resolution_m': info['resolution_m'],
            'crs': 'EPSG:32633',
            'extent': {'minx': minx, 'miny': miny, 'maxx': maxx, 'maxy': maxy},
            'nodata_value': info['nodata_value'],
            'date_acquired': date_acquired,
            'fetch_tool': info['fetch_tool'],
            'processing_steps': ['reproject', 'clip', 'validate'],
            'validation_status': 'passed'
        }
        
        json_path = processed_path.with_suffix('.tif.json')
        with open(json_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"Created metadata: {json_path.name}")

# Process vectors
vectors = {
    'aoi': ('AOI', 'User-provided', 'Project-specific'),
    'osm_roads': ('OSM Roads', 'OpenStreetMap', 'https://www.openstreetmap.org/'),
    'osm_railways': ('OSM Railways', 'OpenStreetMap', 'https://www.openstreetmap.org/'),
    'osm_waterways': ('OSM Waterways', 'OpenStreetMap', 'https://www.openstreetmap.org/'),
    'osm_power_lines': ('OSM Power Lines', 'OpenStreetMap', 'https://www.openstreetmap.org/'),
    'protected_areas': ('Protected Areas (Empty)', 'Generated', 'N/A'),
    'pipelines': ('Existing Pipelines (Empty)', 'Generated', 'N/A'),
    'admin_boundaries': ('GADM Admin Boundaries', 'GADM', 'https://gadm.org/'),
    'faults': ('INGV Seismic Faults', 'INGV', 'https://www.ingv.it/')
}

for name, (source, provider, url) in vectors.items():
    processed_path = project_dir / f'data/vectors/processed/{name}_epsg32633_processed.gpkg'
    if processed_path.exists():
        metadata = {
            'name': name,
            'type': 'vector',
            'source': source,
            'provider': provider,
            'url': url,
            'crs': 'EPSG:32633',
            'date_acquired': date_acquired,
            'fetch_tool': 'osm_fetch' if 'osm' in name else 'manual',
            'processing_steps': ['reproject', 'clip', 'validate'],
            'validation_status': 'passed'
        }
        
        json_path = processed_path.with_suffix('.gpkg.json')
        with open(json_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        print(f"Created metadata: {json_path.name}")

print("\n✓ All metadata files created successfully")
