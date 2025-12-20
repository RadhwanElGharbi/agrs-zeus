#!/usr/bin/env python3
import json
import sys
import os

def parse_width(width_raw):
    """Parse width from tag (e.g., '25 m' -> 25.0, '10' -> 10.0)"""
    if not width_raw:
        return None
    try:
        # Handle formats like "25 m", "25m", "25"
        width_str = str(width_raw).lower().replace('m', '').replace('meters', '').strip()
        return float(width_str)
    except:
        return None

def estimate_width(waterway_type):
    """Estimate width from waterway type if not tagged"""
    estimates = {
        'stream': 2.0,   # 1-3m typical
        'ditch': 2.0,    # 1-3m typical
        'drain': 5.0,    # 3-10m typical
        'canal': 15.0,   # 10-50m typical
        'river': 25.0    # default for rivers
    }
    return estimates.get(waterway_type, 25.0)

def compute_width_class(width_m):
    """Compute width class and crossing cost category"""
    if width_m < 3:
        return 'small', 'low'
    elif width_m < 10:
        return 'medium', 'medium'
    elif width_m < 50:
        return 'large', 'high'
    else:
        return 'major', 'very_high'

def main():
    input_file = '/opt/agrs/Projects/YC-PIPELINE-DEMO/data/vectors/raw/osm_waterways_response.json'
    output_file = '/opt/agrs/Projects/YC-PIPELINE-DEMO/data/vectors/raw/osm_waterways.geojson'
    
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    features = []
    
    for element in data.get('elements', []):
        if element.get('type') != 'way':
            continue
        
        # Build geometry from nodes
        geometry = element.get('geometry', [])
        if not geometry or len(geometry) < 2:
            continue
        
        coords = [[pt['lon'], pt['lat']] for pt in geometry]
        
        tags = element.get('tags', {})
        waterway_type = tags.get('waterway', 'river')
        
        # Parse width
        width_raw = tags.get('width', '')
        width_m = parse_width(width_raw)
        
        # Estimate if not tagged
        if width_m is None:
            width_m = estimate_width(waterway_type)
        
        # Compute derived fields
        width_class, crossing_cost_cat = compute_width_class(width_m)
        
        # Build properties with all original tags plus computed fields
        properties = {
            'osm_id': element.get('id'),
            'name': tags.get('name', ''),
            'waterway': waterway_type,
            'width': width_raw,
            'width_m': round(width_m, 2),
            'width_class': width_class,
            'crossing_cost_cat': crossing_cost_cat,
            'depth': tags.get('depth', ''),
            'seasonal': tags.get('seasonal', ''),
            'intermittent': tags.get('intermittent', ''),
            'tunnel': tags.get('tunnel', ''),
            # Preserve additional tags
            'boat': tags.get('boat', ''),
            'natural': tags.get('natural', ''),
            'layer': tags.get('layer', ''),
            'bridge': tags.get('bridge', ''),
            'covered': tags.get('covered', ''),
            'destination': tags.get('destination', ''),
        }
        
        feature = {
            'type': 'Feature',
            'geometry': {
                'type': 'LineString',
                'coordinates': coords
            },
            'properties': properties
        }
        features.append(feature)
    
    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }
    
    with open(output_file, 'w') as f:
        json.dump(geojson, f)
    
    print(f'Converted {len(features)} waterway features')
    return 0 if features else 1

if __name__ == '__main__':
    sys.exit(main())
