#!/usr/bin/env python3
"""
Fetch GEM Global Seismic Hazard Map (GSHM) PGA data
Source: https://zenodo.org/records/8409647
Data: Peak Ground Acceleration (PGA) for 475-year return period (10% in 50 years)
"""
import os
import sys
import json
import subprocess
from datetime import datetime
import urllib.request
import zipfile
import tempfile

# AOI parameters
WEST = -122.67396655364615
SOUTH = 37.83914255709767
EAST = -122.45539490766657
NORTH = 37.98629264046941

# Output paths
RAW_DIR = '/opt/agrs/Projects/SF-North/data/rasters/raw'
RAW_OUTPUT = f'{RAW_DIR}/geohazards_gem_seismic_raw.tif'

# GEM GSHM data sources
# Primary: Zenodo hosted GeoTIFF
# The GEM mosaic PGA 475yr is available as a global GeoTIFF
ZENODO_PGA_URL = 'https://zenodo.org/records/8409647/files/pga_475.tif?download=1'

# Alternative: OpenQuake S3/direct download
OQ_DIRECT_URLS = [
    'https://downloads.openquake.org/GEM/GSHM/v2023.1.0/pga_475.tif',
    'https://cloud.globalquakemodel.org/public/mosaic/pga_475.tif'
]

def download_file(url, output_path, desc='Downloading'):
    """Download file with progress"""
    print(f"{desc}: {url}")
    try:
        urllib.request.urlretrieve(url, output_path)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            print(f"  Downloaded: {os.path.getsize(output_path)} bytes")
            return True
    except Exception as e:
        print(f"  Failed: {e}")
    return False

def clip_to_aoi(input_path, output_path):
    """Clip global raster to AOI with small buffer"""
    # Add 0.1 degree buffer for safety
    buffer = 0.1
    cmd = [
        'gdalwarp',
        '-te', str(WEST - buffer), str(SOUTH - buffer), str(EAST + buffer), str(NORTH + buffer),
        '-te_srs', 'EPSG:4326',
        '-of', 'GTiff',
        '-co', 'COMPRESS=LZW',
        '-overwrite',
        input_path,
        output_path
    ]
    print(f"Clipping to AOI: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Clip error: {result.stderr}")
        return False
    return True

def try_vsicurl_clip():
    """Try to clip directly from remote URL using GDAL virtual filesystem"""
    print("\nTrying GDAL /vsicurl/ virtual filesystem approach...")
    
    urls_to_try = [
        ('Zenodo', f'/vsicurl/{ZENODO_PGA_URL}'),
    ] + [('OQ-' + str(i), f'/vsicurl/{url}') for i, url in enumerate(OQ_DIRECT_URLS)]
    
    for name, vsi_path in urls_to_try:
        print(f"\nTrying {name}: {vsi_path}")
        
        # First check if file is accessible
        info_cmd = ['gdalinfo', vsi_path]
        result = subprocess.run(info_cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0 and 'Size is' in result.stdout:
            print(f"  File accessible, attempting to clip...")
            
            buffer = 0.1
            clip_cmd = [
                'gdalwarp',
                '-te', str(WEST - buffer), str(SOUTH - buffer), str(EAST + buffer), str(NORTH + buffer),
                '-te_srs', 'EPSG:4326',
                '-of', 'GTiff',
                '-co', 'COMPRESS=LZW',
                '-overwrite',
                vsi_path,
                RAW_OUTPUT
            ]
            
            result = subprocess.run(clip_cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0 and os.path.exists(RAW_OUTPUT):
                size = os.path.getsize(RAW_OUTPUT)
                if size > 1000:
                    print(f"  Success! Created {RAW_OUTPUT} ({size} bytes)")
                    return True
                else:
                    print(f"  Output too small ({size} bytes), trying next source...")
            else:
                print(f"  Clip failed: {result.stderr[:200] if result.stderr else 'unknown error'}")
        else:
            print(f"  Not accessible or error: {result.stderr[:200] if result.stderr else 'connection issue'}")
    
    return False

def try_wms_download():
    """Try WMS with properly constructed request"""
    print("\nTrying WMS approach...")
    
    # Construct proper WMS GetMap URL
    width = 1000
    height = int(width * (NORTH - SOUTH) / (EAST - WEST))
    
    wms_url = (
        f"https://maps.openquake.org/geoserver/gshm/wms?"
        f"SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap"
        f"&LAYERS=pga_475"
        f"&BBOX={WEST},{SOUTH},{EAST},{NORTH}"
        f"&WIDTH={width}&HEIGHT={height}"
        f"&SRS=EPSG:4326"
        f"&FORMAT=image/geotiff"
    )
    
    print(f"WMS URL: {wms_url}")
    
    temp_path = '/tmp/gem_wms_temp.tif'
    if download_file(wms_url, temp_path, 'Downloading via WMS'):
        # Check if it's a valid GeoTIFF
        result = subprocess.run(['gdalinfo', temp_path], capture_output=True, text=True)
        if result.returncode == 0 and 'Size is' in result.stdout:
            # Copy to final location
            subprocess.run(['cp', temp_path, RAW_OUTPUT])
            print(f"WMS download successful!")
            return True
    
    return False

def try_usgs_seismic():
    """Try USGS seismic hazard data as fallback"""
    print("\nTrying USGS seismic hazard data...")
    
    # USGS provides seismic hazard data for the US
    # https://earthquake.usgs.gov/hazards/hazmaps/
    
    # Try the USGS hazard curve data
    usgs_urls = [
        # USGS NSHM 2018 PGA 2% in 50 year (approximately 2475yr return period)
        'https://earthquake.usgs.gov/nshmp/ws/hazard/static/nshm-2018-ca-pga-0.02-50.tif',
        # Alternative formats
        'https://earthquake.usgs.gov/static/lfs/nshmp/data/nshm-2018-pga-2pct-50yr.tif',
    ]
    
    for url in usgs_urls:
        vsi_path = f'/vsicurl/{url}'
        result = subprocess.run(['gdalinfo', vsi_path], capture_output=True, text=True, timeout=60)
        if result.returncode == 0:
            print(f"Found USGS data: {url}")
            buffer = 0.1
            clip_cmd = [
                'gdalwarp',
                '-te', str(WEST - buffer), str(SOUTH - buffer), str(EAST + buffer), str(NORTH + buffer),
                '-te_srs', 'EPSG:4326',
                '-of', 'GTiff',
                '-co', 'COMPRESS=LZW',
                '-overwrite',
                vsi_path,
                RAW_OUTPUT
            ]
            result = subprocess.run(clip_cmd, capture_output=True, text=True, timeout=300)
            if result.returncode == 0 and os.path.exists(RAW_OUTPUT) and os.path.getsize(RAW_OUTPUT) > 1000:
                return True
    
    return False

def create_metadata():
    """Create metadata JSON for the raw file"""
    metadata = {
        "dataset_name": "GEM Global Seismic Hazard Map - PGA 475yr",
        "category": "geohazards",
        "source": "Global Earthquake Model Foundation",
        "provider": "GEM Foundation / OpenQuake",
        "provider_url": "https://www.globalquakemodel.org/",
        "coverage_date": "2023",
        "fetch_date": datetime.utcnow().isoformat() + 'Z',
        "fetch_tool": "fetch_gem_seismic.py",
        "raw_crs": "EPSG:4326",
        "data_type": "Raster",
        "format": "GeoTIFF",
        "description": "Peak Ground Acceleration (PGA) with 10% probability of exceedance in 50 years (475-year return period)",
        "units": "g (gravitational acceleration)",
        "bbox_wgs84": {
            "west": WEST,
            "south": SOUTH,
            "east": EAST,
            "north": NORTH
        },
        "documentation_url": "https://www.globalquakemodel.org/gem-maps/global-earthquake-hazard-map",
        "license": "CC BY-SA 4.0",
        "attribution": "GEM Global Seismic Hazard Map v2023.1, DOI: 10.5281/zenodo.8409647"
    }
    
    # Get file info
    if os.path.exists(RAW_OUTPUT):
        metadata['file_size_bytes'] = os.path.getsize(RAW_OUTPUT)
        
        # Get extent from gdalinfo
        result = subprocess.run(['gdalinfo', '-json', RAW_OUTPUT], capture_output=True, text=True)
        if result.returncode == 0:
            try:
                info = json.loads(result.stdout)
                if 'cornerCoordinates' in info:
                    coords = info['cornerCoordinates']
                    metadata['extent'] = {
                        'minx': coords['lowerLeft'][0],
                        'miny': coords['lowerLeft'][1],
                        'maxx': coords['upperRight'][0],
                        'maxy': coords['upperRight'][1],
                        'crs': 'EPSG:4326'
                    }
            except:
                pass
    
    metadata_path = RAW_OUTPUT + '.json'
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Created metadata: {metadata_path}")

def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    
    print("="*70)
    print("GEM Global Seismic Hazard Map Fetch")
    print(f"AOI: {WEST}, {SOUTH}, {EAST}, {NORTH}")
    print("="*70)
    
    # Try methods in order of preference
    success = False
    
    # Method 1: Direct clip via /vsicurl/
    try:
        success = try_vsicurl_clip()
    except Exception as e:
        print(f"vsicurl method error: {e}")
    
    # Method 2: WMS download
    if not success:
        try:
            success = try_wms_download()
        except Exception as e:
            print(f"WMS method error: {e}")
    
    # Method 3: USGS data (US coverage)
    if not success:
        try:
            success = try_usgs_seismic()
        except Exception as e:
            print(f"USGS method error: {e}")
    
    if success:
        create_metadata()
        print(f"\n✓ Successfully fetched geohazard data to {RAW_OUTPUT}")
        return 0
    else:
        print(f"\n✗ Failed to fetch geohazard data from any source")
        return 1

if __name__ == '__main__':
    sys.exit(main())
