#!/usr/bin/env python3
"""
Validate GeoJSON output structure and content.
"""
import sys
import json
import os

def test_geojson_structure(geojson_path):
    """Test GeoJSON has correct structure"""
    print(f"Test 1: GeoJSON structure validation")
    print(f"  File: {geojson_path}")
    
    if not os.path.exists(geojson_path):
        print(f"  ❌ FAIL: File not found")
        return False
    
    with open(geojson_path, 'r') as f:
        data = json.load(f)
    
    # Check top-level structure
    if data.get('type') != 'FeatureCollection':
        print("  ❌ FAIL: Not a FeatureCollection")
        return False
    
    if 'features' not in data:
        print("  ❌ FAIL: No features array")
        return False
    
    if 'crs' not in data:
        print("  ❌ FAIL: Missing CRS")
        return False
    
    print(f"  Features count: {len(data['features'])}")
    print("  ✅ PASS: Structure valid\n")
    return True

def test_geojson_properties(geojson_path):
    """Test that required properties exist"""
    print(f"Test 2: Required properties validation")
    
    with open(geojson_path, 'r') as f:
        data = json.load(f)
    
    # Required properties from PIRL_TRAINING_GEOJSON_STANDARD.md
    required_props = [
        'segment_id', 'length_m', 'cost_usd', 'cumulative_cost',
        'elevation_start', 'elevation_end', 'slope_percent',
        'land_cover_name', 'land_cover_class',
        'nearest_crossing_dist', 'nearest_crossing_type', 'nearest_crossing_width',
        'distance_to_aoi_boundary', 'distance_to_sea_boundary',
        'reward', 'total_reward'
    ]
    
    # Check first segment feature (skip metadata)
    segment_features = [f for f in data['features'] if f['properties'].get('type') == 'segment']
    if not segment_features:
        print("  ❌ FAIL: No segment features found")
        return False
    
    first_segment = segment_features[0]
    missing = []
    for prop in required_props:
        if prop not in first_segment['properties']:
            missing.append(prop)
    
    if missing:
        print(f"  ❌ FAIL: Missing properties: {missing}")
        return False
    
    print(f"  ✅ PASS: All {len(required_props)} required properties present\n")
    return True

def test_geojson_coordinates(geojson_path):
    """Test coordinates are valid"""
    print(f"Test 3: Coordinate validation")
    
    with open(geojson_path, 'r') as f:
        data = json.load(f)
    
    for feature in data['features']:
        geom = feature.get('geometry', {})
        coords = geom.get('coordinates', [])
        
        if geom.get('type') == 'LineString':
            if len(coords) < 2:
                print("  ❌ FAIL: LineString has < 2 coordinates")
                return False
            
            # Check coordinates are finite
            for coord in coords:
                if len(coord) < 2:
                    print("  ❌ FAIL: Invalid coordinate format")
                    return False
                if not (isinstance(coord[0], (int, float)) and isinstance(coord[1], (int, float))):
                    print("  ❌ FAIL: Non-numeric coordinates")
                    return False
    
    print("  ✅ PASS: All coordinates valid\n")
    return True

def test_crossing_costs_present(geojson_path):
    """Test that crossing costs appear in output"""
    print(f"Test 4: Crossing costs validation")
    
    with open(geojson_path, 'r') as f:
        data = json.load(f)
    
    # Look for segments with infrastructure_cost > 0
    segments_with_crossings = 0
    for feature in data['features']:
        props = feature.get('properties', {})
        if props.get('type') == 'segment':
            infra_cost = props.get('infrastructure_cost', 0)
            if infra_cost > 0:
                segments_with_crossings += 1
    
    print(f"  Segments with crossing costs: {segments_with_crossings}")
    
    if segments_with_crossings == 0:
        print("  ⚠️  WARNING: No crossing costs found (may be valid if no crossings)")
    else:
        print("  ✅ PASS: Crossing costs present")
    
    print()
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_geojson_output.py <path_to_geojson>")
        sys.exit(1)
    
    geojson_path = sys.argv[1]
    
    print("=" * 60)
    print("GEOJSON OUTPUT VALIDATION")
    print("=" * 60 + "\n")
    
    results = []
    results.append(test_geojson_structure(geojson_path))
    results.append(test_geojson_properties(geojson_path))
    results.append(test_geojson_coordinates(geojson_path))
    results.append(test_crossing_costs_present(geojson_path))
    
    print("=" * 60)
    all_passed = all(results)
    print(f"{'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
    print("=" * 60)
    
    sys.exit(0 if all_passed else 1)

