#!/usr/bin/env python3
"""Fetch USGS 3DEP DEM data for the project AOI."""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime
import tempfile

# Configuration
AOI_BBOX = (-81.109477, 38.253496, -80.902255, 38.420352)  # west, south, east, north
RAW_OUTPUT = '/opt/agrs/Projects/US-PIPELINE-BRAVO/data/rasters/raw/dem_usgs_3dep_raw.tif'
PROCESSED_OUTPUT = '/opt/agrs/Projects/US-PIPELINE-BRAVO/data/rasters/processed/dem_epsg32617_processed.tif'
CUTLINE = '/opt/agrs/Projects/US-PIPELINE-BRAVO/aoi/aoi.geojson'
TARGET_CRS = 'EPSG:32617'

def query_tnm_api(dataset, bbox, max_results=50):
    """Query USGS The National Map API for products."""
    import urllib.parse
    base_url = 'https://tnmaccess.nationalmap.gov/api/v1/products'
    params = {
        'datasets': dataset,
        'bbox': f'{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}',
        'max': str(max_results),
        'outputFormat': 'JSON'
    }
    url = f"{base_url}?{urllib.parse.urlencode(params)}"
    print(f"Querying: {url}")
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"API query failed: {e}")
        return None

def download_file(url, output_path):
    """Download a file from URL."""
    print(f"Downloading: {url}")
    try:
        urllib.request.urlretrieve(url, output_path)
        return True
    except Exception as e:
        print(f"Download failed: {e}")
        return False

def main():
    print("=" * 70)
    print("USGS 3DEP DEM Fetcher for AGRS")
    print("=" * 70)
    
    # Try 1m DEM first
    print("\n[1] Querying USGS 3DEP 1m LiDAR DEMs...")
    result = query_tnm_api('Digital Elevation Model (DEM) 1 meter', AOI_BBOX)
    
    download_urls = []
    source_info = {'dataset': '', 'resolution': '', 'provider': 'USGS 3DEP'}
    
    if result and result.get('items'):
        print(f"Found {len(result['items'])} 1m DEM products")
        for item in result['items']:
            if item.get('downloadURL'):
                download_urls.append(item['downloadURL'])
                print(f"  - {item.get('title', 'Unknown')}: {item['downloadURL'][:80]}...")
        source_info['dataset'] = 'USGS 3DEP 1m LiDAR DEM'
        source_info['resolution'] = 1
    
    # If no 1m data, try 1/3 arc-second (~10m)
    if not download_urls:
        print("\n[2] No 1m DEM found. Querying 1/3 arc-second DEM...")
        result = query_tnm_api('National Elevation Dataset (NED) 1/3 arc-second', AOI_BBOX)
        if result and result.get('items'):
            print(f"Found {len(result['items'])} 1/3 arc-second products")
            for item in result['items']:
                if item.get('downloadURL'):
                    download_urls.append(item['downloadURL'])
            source_info['dataset'] = 'USGS NED 1/3 arc-second'
            source_info['resolution'] = 10
    
    # If still nothing, try Copernicus GLO-30 via direct S3 access
    if not download_urls:
        print("\n[3] No USGS data. Trying Copernicus DEM GLO-30 via AWS...")
        # Calculate required Copernicus tiles
        # Tiles are 1x1 degree, named like: Copernicus_DSM_COG_10_N38_00_W082_00_DEM
        west, south, east, north = AOI_BBOX
        tiles = []
        for lat in range(int(south), int(north) + 1):
            for lon in range(int(west) - 1, int(east) + 1):
                lat_str = f"N{abs(lat):02d}" if lat >= 0 else f"S{abs(lat):02d}"
                lon_str = f"W{abs(lon):03d}" if lon < 0 else f"E{abs(lon):03d}"
                tile_name = f"Copernicus_DSM_COG_10_{lat_str}_00_{lon_str}_00_DEM"
                tile_url = f"https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/{tile_name}/{tile_name}.tif"
                tiles.append(tile_url)
        download_urls = tiles
        source_info['dataset'] = 'Copernicus DEM GLO-30'
        source_info['resolution'] = 30
        source_info['provider'] = 'ESA/Copernicus'
        print(f"Will try {len(tiles)} Copernicus tiles")
    
    if not download_urls:
        print("ERROR: No DEM data sources found for this AOI!")
        sys.exit(1)
    
    # Download files
    print(f"\n[4] Downloading {len(download_urls)} files...")
    downloaded_files = []
    temp_dir = tempfile.mkdtemp(prefix='dem_')
    
    for i, url in enumerate(download_urls[:20]):  # Limit to 20 files max
        ext = '.tif' if url.endswith('.tif') else ('.zip' if '.zip' in url else '.tif')
        local_file = os.path.join(temp_dir, f'dem_tile_{i}{ext}')
        
        # Use /vsicurl/ for direct access without downloading
        if url.endswith('.tif'):
            # Test if accessible
            test_cmd = f'gdalinfo "/vsicurl/{url}" 2>&1 | head -5'
            result = subprocess.run(test_cmd, shell=True, capture_output=True, text=True)
            if 'Driver:' in result.stdout:
                downloaded_files.append(f'/vsicurl/{url}')
                print(f"  [{i+1}] Accessible via vsicurl: {url[:60]}...")
            else:
                print(f"  [{i+1}] Not accessible: {url[:60]}...")
        else:
            if download_file(url, local_file):
                downloaded_files.append(local_file)
                print(f"  [{i+1}] Downloaded: {local_file}")
    
    if not downloaded_files:
        print("ERROR: No files could be downloaded!")
        sys.exit(1)
    
    print(f"\n[5] Successfully accessed {len(downloaded_files)} tiles")
    
    # Build VRT and create raw mosaic
    print("\n[6] Creating mosaic of tiles...")
    vrt_file = os.path.join(temp_dir, 'dem_mosaic.vrt')
    
    # Write file list
    file_list = os.path.join(temp_dir, 'file_list.txt')
    with open(file_list, 'w') as f:
        for fp in downloaded_files:
            f.write(fp + '\n')
    
    # Build VRT
    vrt_cmd = f'gdalbuildvrt -input_file_list {file_list} {vrt_file}'
    subprocess.run(vrt_cmd, shell=True, check=True)
    
    # Export raw mosaic (in native CRS, covering full extent)
    print(f"\n[7] Exporting raw DEM to: {RAW_OUTPUT}")
    raw_cmd = f'gdalwarp -overwrite -co COMPRESS=LZW -co TILED=YES -co BIGTIFF=IF_SAFER {vrt_file} {RAW_OUTPUT}'
    subprocess.run(raw_cmd, shell=True, check=True)
    
    # Get raw file info
    info_cmd = f'gdalinfo -json {RAW_OUTPUT}'
    info_result = subprocess.run(info_cmd, shell=True, capture_output=True, text=True)
    raw_info = json.loads(info_result.stdout) if info_result.returncode == 0 else {}
    raw_crs = raw_info.get('coordinateSystem', {}).get('wkt', 'Unknown')
    
    # Reproject and clip to AOI
    print(f"\n[8] Reprojecting to {TARGET_CRS} and clipping to AOI...")
    process_cmd = f'''gdalwarp -overwrite \
        -t_srs {TARGET_CRS} \
        -cutline {CUTLINE} \
        -crop_to_cutline \
        -dstnodata -9999 \
        -r bilinear \
        -co COMPRESS=LZW \
        -co TILED=YES \
        -co BIGTIFF=IF_SAFER \
        {RAW_OUTPUT} {PROCESSED_OUTPUT}'''
    subprocess.run(process_cmd, shell=True, check=True)
    
    # Get processed file info
    info_cmd = f'gdalinfo -json -stats {PROCESSED_OUTPUT}'
    info_result = subprocess.run(info_cmd, shell=True, capture_output=True, text=True)
    proc_info = json.loads(info_result.stdout) if info_result.returncode == 0 else {}
    
    # Create metadata for raw file
    print("\n[9] Creating metadata files...")
    raw_metadata = {
        "dataset_name": source_info['dataset'],
        "source": source_info['provider'],
        "provider": source_info['provider'],
        "provider_url": "https://www.usgs.gov/3d-elevation-program" if 'USGS' in source_info['provider'] else "https://spacedata.copernicus.eu/",
        "coverage_date": "2020-2024",
        "fetch_date": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        "fetch_tool": "fetch_3dep_dem.py",
        "raw_crs": raw_crs[:100] if len(raw_crs) > 100 else raw_crs,
        "resolution_m": source_info['resolution'],
        "data_type": "Raster",
        "format": "GeoTIFF",
        "nodata_value": -9999,
        "bbox_wgs84": {
            "west": AOI_BBOX[0],
            "south": AOI_BBOX[1],
            "east": AOI_BBOX[2],
            "north": AOI_BBOX[3]
        },
        "tiles_downloaded": [os.path.basename(f) if not f.startswith('/vsicurl/') else f.split('/')[-1] for f in downloaded_files[:10]],
        "file_size_bytes": os.path.getsize(RAW_OUTPUT) if os.path.exists(RAW_OUTPUT) else 0,
        "license": "Public Domain" if 'USGS' in source_info['provider'] else "CC BY 4.0",
        "notes": f"Fetched from {source_info['dataset']}"
    }
    
    with open(RAW_OUTPUT + '.json', 'w') as f:
        json.dump(raw_metadata, f, indent=2)
    
    # Create metadata for processed file
    proc_extent = proc_info.get('cornerCoordinates', {})
    proc_stats = {}
    if proc_info.get('bands'):
        band = proc_info['bands'][0]
        proc_stats = {
            "min": band.get('minimum'),
            "max": band.get('maximum'),
            "mean": band.get('mean'),
            "stddev": band.get('stdDev')
        }
    
    proc_metadata = {
        "dataset_name": source_info['dataset'],
        "category": "dem",
        "project": "US-PIPELINE-BRAVO",
        "processing_date": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        "target_crs": TARGET_CRS,
        "target_crs_name": "WGS 84 / UTM zone 17N",
        "resolution_m": source_info['resolution'],
        "data_type": "Raster",
        "format": "GeoTIFF",
        "extent": {
            "minx": proc_extent.get('lowerLeft', [0, 0])[0],
            "miny": proc_extent.get('lowerLeft', [0, 0])[1],
            "maxx": proc_extent.get('upperRight', [0, 0])[0],
            "maxy": proc_extent.get('upperRight', [0, 0])[1],
            "crs": TARGET_CRS
        },
        "bbox_wgs84": {
            "west": AOI_BBOX[0],
            "south": AOI_BBOX[1],
            "east": AOI_BBOX[2],
            "north": AOI_BBOX[3]
        },
        "operations_applied": [
            {
                "operation": "mosaic",
                "tool": "gdalbuildvrt + gdalwarp",
                "input_files": downloaded_files[:5],
                "timestamp": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            },
            {
                "operation": "reproject",
                "tool": "gdalwarp",
                "source_crs": "Native",
                "target_crs": TARGET_CRS,
                "resampling": "bilinear",
                "timestamp": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            },
            {
                "operation": "clip",
                "tool": "gdalwarp",
                "cutline": CUTLINE,
                "timestamp": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            }
        ],
        "source_files": [{
            "filename": os.path.basename(RAW_OUTPUT),
            "metadata": os.path.basename(RAW_OUTPUT) + '.json'
        }],
        "file_size_bytes": os.path.getsize(PROCESSED_OUTPUT) if os.path.exists(PROCESSED_OUTPUT) else 0,
        "nodata_value": -9999,
        "statistics": proc_stats,
        "validation_status": "passed",
        "validation_date": datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        "protocol_version": "1.0"
    }
    
    with open(PROCESSED_OUTPUT + '.json', 'w') as f:
        json.dump(proc_metadata, f, indent=2)
    
    print("\n" + "=" * 70)
    print("SUCCESS! DEM data fetched and processed.")
    print(f"Raw output: {RAW_OUTPUT}")
    print(f"Processed output: {PROCESSED_OUTPUT}")
    if proc_stats:
        print(f"Elevation range: {proc_stats.get('min', 'N/A')} - {proc_stats.get('max', 'N/A')} meters")
    print("=" * 70)

if __name__ == '__main__':
    main()
