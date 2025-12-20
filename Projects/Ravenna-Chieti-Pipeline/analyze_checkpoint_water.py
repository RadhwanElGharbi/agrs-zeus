#!/usr/bin/env python3
import json
import sys

geojson_path = sys.argv[1]

with open(geojson_path) as f:
    route = json.load(f)

segments = [f for f in route['features'] if f['id'] != 'full_route']
main_route = [f for f in route['features'] if f['id'] == 'full_route'][0]

# Count water segments
water_count = sum(1 for s in segments if s['properties']['land_cover'] == 'water_bodies')
water_pct = (water_count / len(segments) * 100) if segments else 0

print(f"{len(segments)} segs, {main_route['properties']['total_length_m']/1000:.1f}km, {water_pct:.1f}% water")
