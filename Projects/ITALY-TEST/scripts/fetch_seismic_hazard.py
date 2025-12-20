import urllib.request
import json
import os
import subprocess

# AOI bounds
bbox = [12.10, 42.97, 12.35, 43.18]  # west, south, east, north
output_dir = "/opt/agrs/Projects/ITALY-TEST/data/rasters/raw"
output_file = os.path.join(output_dir, "geohazards_gem_seismic_raw.tif")

# Try multiple sources
sources = [
    # USGS Global Seismic Hazard (lower resolution but reliable)
    {
        "name": "USGS_GSHAP",
        "url": "/vsicurl/https://earthquake.usgs.gov/static/lfs/data/shakemap/gshap/World.tif",
        "type": "vsicurl"
    },
    # Try NASA SEDAC
    {
        "name": "SEDAC_EQ", 
        "url": "/vsicurl/https://sedac.ciesin.columbia.edu/downloads/data/ndh/ndh-earthquake-frequency-distribution/earthquake-frequency-distribution-1973-2020.tif",
        "type": "vsicurl"
    }
]

for src in sources:
    print(f"Trying {src['name']}...")
    try:
        cmd = f'gdalinfo "{src["url"]}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0 and "Size is" in result.stdout:
            print(f"  Source accessible! Extracting AOI...")
            extract_cmd = f'gdal_translate -of GTiff -co COMPRESS=LZW -projwin {bbox[0]} {bbox[3]} {bbox[2]} {bbox[1]} "{src["url"]}" "{output_file}"'
            result2 = subprocess.run(extract_cmd, shell=True, capture_output=True, text=True)
            if result2.returncode == 0 and os.path.exists(output_file) and os.path.getsize(output_file) > 500:
                print(f"  SUCCESS: Downloaded from {src['name']}")
                break
            else:
                print(f"  Extract failed: {result2.stderr}")
        else:
            print(f"  Not accessible: {result.stderr[:200]}")
    except Exception as e:
        print(f"  Error: {e}")
else:
    print("All sources failed")
