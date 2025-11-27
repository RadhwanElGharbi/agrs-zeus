import requests
import json
import os
import subprocess
import sys

# AOI parameters
west = -105.2502869671583
south = 44.49238310951499
east = -105.18861512059449
north = 44.55405501865524
bbox = f"{west},{south},{east},{north}"

raw_output = "/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/data/rasters/raw/dem_3dep_1m_raw.tif"
raw_output_30m = "/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/data/rasters/raw/dem_copernicus_30m_raw.tif"
raw_output_final = "/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/data/rasters/raw/dem_global_30m_raw.tif"

print(f"[INFO] Attempting to fetch USGS 3DEP 1m LiDAR DEM for bbox: {bbox}")

# Step 1: Try TNM API for 3DEP 1m
tnm_url = f"https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox={bbox}&max=50"

try:
    resp = requests.get(tnm_url, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    items = data.get('items', [])
    print(f"[INFO] TNM API returned {len(items)} products")
    
    if items:
        # Download all tiles and mosaic
        downloaded = []
        for i, item in enumerate(items):
            url = item.get('downloadURL')
            title = item.get('title', f'tile_{i}')
            if url and url.endswith('.tif'):
                # Direct GeoTIFF
                local_file = f"/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/data/rasters/raw/dem_3dep_tile_{i}.tif"
                print(f"[INFO] Downloading: {title}")
                print(f"[INFO] URL: {url}")
                result = subprocess.run(['curl', '-L', '-o', local_file, '-f', '--connect-timeout', '30', '--max-time', '300', url], capture_output=True)
                if result.returncode == 0 and os.path.exists(local_file) and os.path.getsize(local_file) > 1000:
                    # Verify it's a valid GeoTIFF
                    check = subprocess.run(['gdalinfo', local_file], capture_output=True)
                    if check.returncode == 0:
                        downloaded.append(local_file)
                        print(f"[INFO] Successfully downloaded tile {i+1}")
                    else:
                        os.remove(local_file)
                        print(f"[WARNING] Invalid GeoTIFF, skipping tile {i+1}")
        
        if downloaded:
            print(f"[INFO] Downloaded {len(downloaded)} valid tiles, creating mosaic...")
            # Create VRT mosaic
            vrt_file = "/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/data/rasters/raw/dem_3dep_mosaic.vrt"
            cmd = ['gdalbuildvrt', vrt_file] + downloaded
            subprocess.run(cmd, check=True)
            
            # Convert VRT to GeoTIFF
            subprocess.run(['gdal_translate', '-co', 'COMPRESS=LZW', vrt_file, raw_output], check=True)
            
            if os.path.exists(raw_output) and os.path.getsize(raw_output) > 1000:
                print(f"[SUCCESS] 3DEP 1m DEM saved to: {raw_output}")
                # Create symlink to expected filename
                if os.path.exists(raw_output_final):
                    os.remove(raw_output_final)
                os.symlink(raw_output, raw_output_final)
                print(f"[SUCCESS] Linked to: {raw_output_final}")
                sys.exit(0)
            else:
                print("[WARNING] Failed to create valid mosaic")
except Exception as e:
    print(f"[WARNING] TNM API approach failed: {e}")

print("[INFO] Falling back to Copernicus DEM 30m...")

# Step 2: Try Copernicus DEM 30m via STAC
try:
    stac_url = "https://earth-search.aws.element84.com/v1/search"
    stac_payload = {
        "collections": ["cop-dem-glo-30"],
        "bbox": [west, south, east, north],
        "limit": 10
    }
    resp = requests.post(stac_url, json=stac_payload, timeout=60)
    resp.raise_for_status()
    stac_data = resp.json()
    features = stac_data.get('features', [])
    print(f"[INFO] STAC returned {len(features)} Copernicus DEM tiles")
    
    if features:
        # Get the first tile's URL
        for feature in features:
            assets = feature.get('assets', {})
            data_asset = assets.get('data', {})
            url = data_asset.get('href')
            if url:
                print(f"[INFO] Downloading Copernicus DEM from: {url}")
                # Use GDAL with /vsicurl/ to directly access and crop
                cmd = [
                    'gdalwarp',
                    '-te', str(west), str(south), str(east), str(north),
                    '-co', 'COMPRESS=LZW',
                    f'/vsicurl/{url}',
                    raw_output_30m
                ]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode == 0 and os.path.exists(raw_output_30m) and os.path.getsize(raw_output_30m) > 1000:
                    print(f"[SUCCESS] Copernicus DEM 30m saved to: {raw_output_30m}")
                    # Copy to expected filename
                    if os.path.exists(raw_output_final):
                        os.remove(raw_output_final)
                    subprocess.run(['cp', raw_output_30m, raw_output_final], check=True)
                    print(f"[SUCCESS] Copied to: {raw_output_final}")
                    sys.exit(0)
                else:
                    print(f"[WARNING] gdalwarp failed: {result.stderr}")
except Exception as e:
    print(f"[WARNING] STAC approach failed: {e}")

# Step 3: Direct S3 access to Copernicus DEM
print("[INFO] Trying direct Copernicus DEM S3 access...")
try:
    # Calculate tile name: N44_W106 (tiles are 1x1 degree)
    lat_tile = 44  # floor of latitude
    lon_tile = -106  # floor of longitude (westernmost)
    
    tile_name = f"Copernicus_DSM_COG_10_N{lat_tile:02d}_00_W{abs(lon_tile):03d}_00_DEM"
    s3_url = f"https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/{tile_name}/{tile_name}.tif"
    
    print(f"[INFO] Trying Copernicus tile: {tile_name}")
    print(f"[INFO] URL: {s3_url}")
    
    cmd = [
        'gdalwarp',
        '-te', str(west), str(south), str(east), str(north),
        '-co', 'COMPRESS=LZW',
        f'/vsicurl/{s3_url}',
        raw_output_final
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0 and os.path.exists(raw_output_final) and os.path.getsize(raw_output_final) > 1000:
        print(f"[SUCCESS] Copernicus DEM 30m saved to: {raw_output_final}")
        sys.exit(0)
    else:
        print(f"[WARNING] Direct S3 access failed: {result.stderr}")
except Exception as e:
    print(f"[WARNING] Direct S3 approach failed: {e}")

print("[ERROR] All DEM fetch methods failed")
sys.exit(1)
