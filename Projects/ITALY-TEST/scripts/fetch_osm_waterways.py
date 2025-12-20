import requests
import json
import os
import subprocess
import re

# AOI bounds (south, west, north, east for Overpass)
bbox = "43.01558367463844,12.15523421889559,43.1321977103725,12.302134619613025"
output_dir = "/opt/agrs/Projects/ITALY-TEST/data/vectors/raw"
output_geojson = os.path.join(output_dir, "osm_waterways_raw.geojson")
output_gpkg = os.path.join(output_dir, "osm_waterways_raw.gpkg")

# Overpass query for waterways
overpass_query = f"""
[out:json][timeout:300];
(
  way["waterway"~"river|stream|canal|drain|ditch"]({bbox});
);
out body geom;
"""

print("Fetching waterways from Overpass API...")
response = requests.post(
    "https://overpass-api.de/api/interpreter",
    data=overpass_query,
    timeout=300
)

if response.status_code != 200:
    print(f"ERROR: Overpass API returned status {response.status_code}")
    exit(1)

data = response.json()
print(f"Received {len(data.get('elements', []))} elements from Overpass")

def parse_width(width_str):
    """Parse width from OSM tag and return value in meters."""
    if not width_str:
        return None
    try:
        # Handle various formats: "25 m", "25m", "25"
        val = re.sub(r'[^0-9.]', '', width_str.split()[0])
        if val:
            return float(val)
    except:
        pass
    return None

def estimate_width(waterway_type):
    """Estimate width from waterway type if not tagged."""
    estimates = {
        'stream': 2.0,    # 1-3m typical
        'ditch': 2.0,     # 1-3m typical
        'drain': 5.0,     # 3-10m typical
        'canal': 15.0,    # 10-50m typical
        'river': 25.0,    # default for rivers
    }
    return estimates.get(waterway_type, 10.0)

def classify_width(width_m):
    """Classify width and determine crossing cost."""
    if width_m is None:
        return None, None
    
    if width_m < 3:
        width_class = 'small'
        crossing_cost_cat = 'low'       # $10K-20K open cut
    elif width_m < 10:
        width_class = 'medium'
        crossing_cost_cat = 'medium'    # $30K-70K open cut
    elif width_m < 50:
        width_class = 'large'
        crossing_cost_cat = 'high'      # $200K-400K HDD
    else:
        width_class = 'major'
        crossing_cost_cat = 'very_high' # $800K+ HDD
    
    return width_class, crossing_cost_cat

# Convert to GeoJSON
features = []
for element in data.get('elements', []):
    if element.get('type') != 'way':
        continue
    
    geom = element.get('geometry', [])
    if not geom or len(geom) < 2:
        continue
    
    coords = [[pt['lon'], pt['lat']] for pt in geom]
    tags = element.get('tags', {})
    
    waterway_type = tags.get('waterway', '')
    
    # Parse and compute width fields
    width_raw = tags.get('width', '')
    width_m = parse_width(width_raw)
    
    # Estimate width if not tagged
    if width_m is None:
        width_m = estimate_width(waterway_type)
    
    width_class, crossing_cost_cat = classify_width(width_m)
    
    # Build properties with required schema fields
    props = {
        'osm_id': element.get('id'),
        'name': tags.get('name', ''),
        'waterway': waterway_type,
        'width': width_raw,
        'width_m': width_m,
        'width_class': width_class or '',
        'crossing_cost_cat': crossing_cost_cat or '',
        'depth': tags.get('depth', ''),
        'seasonal': tags.get('seasonal', ''),
        'intermittent': tags.get('intermittent', ''),
        'tunnel': tags.get('tunnel', ''),
    }
    
    # Preserve all other OSM tags
    for key, value in tags.items():
        if key not in props and key not in ['name', 'waterway', 'width', 'depth', 'seasonal', 'intermittent', 'tunnel']:
            props[f'osm_{key}'] = value
    
    feature = {
        'type': 'Feature',
        'geometry': {
            'type': 'LineString',
            'coordinates': coords
        },
        'properties': props
    }
    features.append(feature)

print(f"Created {len(features)} waterway features")

if len(features) == 0:
    print("WARNING: No waterways found in AOI")

# Write GeoJSON
geojson = {
    'type': 'FeatureCollection',
    'features': features
}
with open(output_geojson, 'w') as f:
    json.dump(geojson, f)

print(f"Saved GeoJSON to {output_geojson}")

# Convert to GeoPackage
result = subprocess.run([
    'ogr2ogr', '-f', 'GPKG', '-nln', 'waterways',
    '-overwrite', output_gpkg, output_geojson
], capture_output=True, text=True)

if result.returncode != 0:
    print(f"ERROR converting to GPKG: {result.stderr}")
    exit(1)

print(f"Saved GeoPackage to {output_gpkg}")

# Cleanup GeoJSON
os.remove(output_geojson)
print("Done!")
