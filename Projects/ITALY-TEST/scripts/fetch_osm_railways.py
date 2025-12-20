import requests
import json
import os
import subprocess

# AOI bounds (south, west, north, east for Overpass)
bbox = "43.01558367463844,12.15523421889559,43.1321977103725,12.302134619613025"
output_dir = "/opt/agrs/Projects/ITALY-TEST/data/vectors/raw"
output_geojson = os.path.join(output_dir, "osm_railways_raw.geojson")
output_gpkg = os.path.join(output_dir, "osm_railways_raw.gpkg")

# Overpass query for railways
overpass_query = f"""
[out:json][timeout:300];
(
  way["railway"~"rail|subway|tram|light_rail|narrow_gauge|preserved|miniature|monorail|funicular"]({bbox});
);
out body geom;
"""

print("Fetching railways from Overpass API...")
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

# Convert to GeoJSON
features = []
for element in data.get('elements', []):
    if element.get('type') != 'way':
        continue
    
    # Extract geometry from 'geometry' array
    geom = element.get('geometry', [])
    if not geom or len(geom) < 2:
        continue
    
    coords = [[pt['lon'], pt['lat']] for pt in geom]
    tags = element.get('tags', {})
    
    # Build properties with required schema fields
    props = {
        'osm_id': element.get('id'),
        'name': tags.get('name', ''),
        'railway': tags.get('railway', ''),
        'operator': tags.get('operator', ''),
        'gauge': tags.get('gauge', ''),
        'electrified': tags.get('electrified', ''),
        'usage': tags.get('usage', ''),
        'service': tags.get('service', ''),
    }
    
    # Preserve all other OSM tags
    for key, value in tags.items():
        if key not in props:
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

print(f"Created {len(features)} railway features")

if len(features) == 0:
    print("WARNING: No railways found in AOI - this may be a rural area without rail infrastructure")
    # Create empty GeoPackage with correct schema
    empty_geojson = {
        'type': 'FeatureCollection',
        'features': []
    }
    with open(output_geojson, 'w') as f:
        json.dump(empty_geojson, f)
else:
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
    'ogr2ogr', '-f', 'GPKG', '-nln', 'railways',
    '-overwrite', output_gpkg, output_geojson
], capture_output=True, text=True)

if result.returncode != 0:
    print(f"ERROR converting to GPKG: {result.stderr}")
    exit(1)

print(f"Saved GeoPackage to {output_gpkg}")

# Cleanup GeoJSON
os.remove(output_geojson)
print("Done!")
