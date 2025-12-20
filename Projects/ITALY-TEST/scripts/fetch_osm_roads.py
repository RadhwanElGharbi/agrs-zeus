import requests
import json
import os
import subprocess
from datetime import datetime

# AOI bounds (south, west, north, east for Overpass)
bbox = "43.01558367463844,12.15523421889559,43.1321977103725,12.302134619613025"
output_dir = "/opt/agrs/Projects/ITALY-TEST/data/vectors/raw"
output_geojson = os.path.join(output_dir, "osm_roads_raw.geojson")
output_gpkg = os.path.join(output_dir, "osm_roads_raw.gpkg")

# Overpass query for roads
overpass_query = f"""
[out:json][timeout:300];
(
  way["highway"~"motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|service|track|living_street|pedestrian"]({bbox});
);
out body geom;
"""

print("Fetching roads from Overpass API...")
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
        'highway': tags.get('highway', ''),
        'ref': tags.get('ref', ''),
        'surface': tags.get('surface', ''),
        'lanes': tags.get('lanes', ''),
        'maxspeed': tags.get('maxspeed', ''),
        'oneway': tags.get('oneway', ''),
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

print(f"Created {len(features)} road features")

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
    'ogr2ogr', '-f', 'GPKG', '-nln', 'roads',
    '-overwrite', output_gpkg, output_geojson
], capture_output=True, text=True)

if result.returncode != 0:
    print(f"ERROR converting to GPKG: {result.stderr}")
    exit(1)

print(f"Saved GeoPackage to {output_gpkg}")

# Cleanup GeoJSON
os.remove(output_geojson)
print("Done!")
