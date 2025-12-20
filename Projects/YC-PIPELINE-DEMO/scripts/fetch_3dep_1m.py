import json
import subprocess
import os
import sys
from datetime import datetime

# Configuration
RAW_DIR = '/opt/agrs/Projects/YC-PIPELINE-DEMO/data/rasters/raw'
TNM_JSON = os.path.join(RAW_DIR, 'tnm_query_1m.json')
TILES_DIR = os.path.join(RAW_DIR, '3dep_1m_tiles')

# Create tiles directory
os.makedirs(TILES_DIR, exist_ok=True)

# Load TNM query response
with open(TNM_JSON, 'r') as f:
    data = json.load(f)

items = data.get('items', [])
print(f"Found {len(items)} DEM products from TNM API")

if len(items) == 0:
    print("WARNING: No 1m DEM products found for this area!")
    print("Will try 10m DEM as fallback...")
    sys.exit(1)

# Download each tile
downloaded_files = []
for i, item in enumerate(items):
    title = item.get('title', f'tile_{i}')
    download_url = item.get('downloadURL')
    source_id = item.get('sourceId', f'unknown_{i}')
    
    if not download_url:
        print(f"  Skipping {title}: No download URL")
        continue
    
    # Create safe filename from source ID
    safe_name = source_id.replace('/', '_').replace(' ', '_')
    ext = '.tif' if download_url.endswith('.tif') else os.path.splitext(download_url)[1]
    if not ext:
        ext = '.tif'
    output_file = os.path.join(TILES_DIR, f"{safe_name}{ext}")
    
    print(f"\nDownloading ({i+1}/{len(items)}): {title}")
    print(f"  URL: {download_url}")
    print(f"  Output: {output_file}")
    
    # Download with curl (handles redirects and large files)
    cmd = [
        'curl', '-sSfL',
        '--connect-timeout', '60',
        '--max-time', '900',
        '-o', output_file,
        download_url
    ]
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        if os.path.exists(output_file) and os.path.getsize(output_file) > 1000:
            downloaded_files.append(output_file)
            print(f"  SUCCESS: {os.path.getsize(output_file) / 1024 / 1024:.1f} MB")
        else:
            print(f"  FAILED: File too small or missing")
    except subprocess.CalledProcessError as e:
        print(f"  FAILED: {e.stderr}")
        # Try alternate URL if available
        if 'urls' in item and 'TIFF' in item['urls']:
            alt_url = item['urls']['TIFF']
            print(f"  Trying alternate URL: {alt_url}")
            cmd[-1] = alt_url
            try:
                result = subprocess.run(cmd, check=True, capture_output=True, text=True)
                if os.path.exists(output_file) and os.path.getsize(output_file) > 1000:
                    downloaded_files.append(output_file)
                    print(f"  SUCCESS (alt): {os.path.getsize(output_file) / 1024 / 1024:.1f} MB")
            except:
                pass

print(f"\n{'='*60}")
print(f"Downloaded {len(downloaded_files)} of {len(items)} tiles")

# Write file list for mosaicking
if downloaded_files:
    file_list_path = os.path.join(RAW_DIR, '3dep_1m_files.txt')
    with open(file_list_path, 'w') as f:
        for fp in downloaded_files:
            f.write(fp + '\n')
    print(f"File list written to: {file_list_path}")
    sys.exit(0)
else:
    print("ERROR: No tiles were downloaded successfully")
    sys.exit(1)
