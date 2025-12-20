import requests
import json
import os
import subprocess
import re

# AOI bounds (south, west, north, east for Overpass)
bbox = "43.01558367463844,12.15523421889559,43.1321977103725,12.302134619613025"
output_dir = "/opt/agrs/Projects/ITALY-TEST/data/vectors/raw"
output_geojson = os.path.join(output_dir, "osm_power_lines_raw.geojson")
output_gpkg = os.path.join(output_dir, "osm_power_lines_raw.gpkg")

# Overpass query for power lines
overpass_query = f"""
[out:json][timeout:300];
(
  way["power"~"line|minor_line|cable"]({bbox});
);
out body geom;
"""

print("Fetching power lines from Overpass API...")
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

def parse_voltage(voltage_str):
    """Parse voltage from OSM tag and return value in volts."""
    if not voltage_str:
        return None
    try:
        # Handle 'kV' suffix
        if 'kV' in voltage_str.upper():
            val = voltage_str.upper().replace('KV', '').strip()
            return int(float(val) * 1000)
        # Handle plain numbers (assumed volts)
        val = re.sub(r'[^0-9.]', '', voltage_str.split(';')[0])  # Take first value if multiple
        if val:
            return int(float(val))
    except:
        pass
    return None

def classify_voltage(voltage_v):
    """Classify voltage and determine crossing cost."""
    if voltage_v is None:
        return None, None, None
    
    voltage_kv = voltage_v / 1000.0
    
    if voltage_v < 1000:
        voltage_class = 'low'
        crossing_cost = 'low'
    elif voltage_v < 50000:
        voltage_class = 'medium'
        crossing_cost = 'medium'
    elif voltage_v < 200000:
        voltage_class = 'high'
        crossing_cost = 'high'
    else:
        voltage_class = 'extra_high'
        crossing_cost = 'very_high'
    
    return voltage_kv, voltage_class, crossing_cost

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
    
    # Parse and compute voltage fields
    voltage_raw = tags.get('voltage', '')
    voltage_v = parse_voltage(voltage_raw)
    voltage_kv, voltage_class, crossing_cost = classify_voltage(voltage_v)
    
    # Build properties with required schema fields
    props = {
        'osm_id': element.get('id'),
        'name': tags.get('name', ''),
        'power': tags.get('power', ''),
        'voltage': voltage_raw,
        'voltage_v': voltage_v,
        'voltage_kv': voltage_kv,
        'voltage_class': voltage_class or '',
        'cables': tags.get('cables', ''),
        'operator': tags.get('operator', ''),
        'frequency': tags.get('frequency', ''),
        'ref': tags.get('ref', ''),
        'crossing_cost': crossing_cost or '',
        'location': tags.get('location', ''),
    }
    
    # Preserve all other OSM tags
    for key, value in tags.items():
        if key not in props and key not in ['name', 'power', 'voltage', 'cables', 'operator', 'frequency', 'ref', 'location']:
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

print(f"Created {len(features)} power line features")

if len(features) == 0:
    print("WARNING: No power lines found in AOI")

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
    'ogr2ogr', '-f', 'GPKG', '-nln', 'power_lines',
    '-overwrite', output_gpkg, output_geojson
], capture_output=True, text=True)

if result.returncode != 0:
    print(f"ERROR converting to GPKG: {result.stderr}")
    exit(1)

print(f"Saved GeoPackage to {output_gpkg}")

# Cleanup GeoJSON
os.remove(output_geojson)
print("Done!")
