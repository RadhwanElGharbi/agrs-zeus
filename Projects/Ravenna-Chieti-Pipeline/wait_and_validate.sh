#!/bin/bash

echo "=================================================================================================="
echo "WAITING FOR 50K TRAINING TO COMPLETE"
echo "=================================================================================================="
echo ""
echo "Training started: $(date)"
echo "Expected duration: 20-25 minutes"
echo ""

# Wait for training to complete (check every minute)
while true; do
    if ps aux | grep -q "[t]rain_pirl_direct.py.*test.yaml"; then
        # Check progress
        timesteps=$(grep "total_timesteps" /opt/agrs/Projects/test_project2/PIRL/training_50k_fixed_logic.log 2>/dev/null | tail -1 | awk '{print $3}')
        if [ -n "$timesteps" ]; then
            pct=$(echo "scale=1; $timesteps / 50000 * 100" | bc 2>/dev/null)
            echo "[$(date +%H:%M:%S)] Training progress: $timesteps / 50000 timesteps ($pct%)"
        else
            echo "[$(date +%H:%M:%S)] Training in progress..."
        fi
        sleep 60
    else
        echo ""
        echo "✅ Training completed: $(date)"
        echo ""
        break
    fi
done

# Generate route from final model
echo "=================================================================================================="
echo "GENERATING ROUTE FROM 50K MODEL"
echo "=================================================================================================="
echo ""

cd /opt/agrs/Projects/test_project2
source /opt/agrs/python/pirl_venv/bin/activate

python generate_route_from_model.py \
  --model PIRL/models/best_model/best_model.zip \
  --config PIRL/pirl_training_config_test.yaml \
  --vec-normalize PIRL/models/pirl_italy_v2_test_vecnormalize.pkl \
  --output PIRL/outputs/route_50k_fixed.geojson \
  --deterministic

echo ""
echo "=================================================================================================="
echo "ANALYZING ROUTE"
echo "=================================================================================================="
echo ""

python3 << 'PYEOF'
import json
import math

with open('PIRL/outputs/route_50k_fixed.geojson') as f:
    route = json.load(f)

segments = [f for f in route['features'] if f['id'] != 'full_route']
full_route = [f for f in route['features'] if f['id'] == 'full_route'][0]

print("="*80)
print("ROUTE VALIDATION - 50K WITH CORRECTED COASTLINE LOGIC")
print("="*80)
print()

# Basic stats
total_length_m = full_route['properties']['total_length_m']
num_segments = len(segments)

print(f"Route Overview:")
print(f"  Length: {total_length_m/1000:.2f} km ({num_segments} segments)")
print(f"  Avg segment: {total_length_m/num_segments:.1f} m")
print()

# Land cover
land_cover_counts = {}
for seg in segments:
    lc = seg['properties']['land_cover']
    land_cover_counts[lc] = land_cover_counts.get(lc, 0) + 1

print(f"Land Cover Distribution:")
for lc, count in sorted(land_cover_counts.items(), key=lambda x: -x[1]):
    pct = count/len(segments)*100
    print(f"  {lc}: {count}/{len(segments)} ({pct:.1f}%)")
print()

# Water analysis
water_segments = [s for s in segments if s['properties']['land_cover'] == 'water_bodies']
water_length = sum(s['properties']['length_m'] for s in water_segments)
water_pct = water_length / total_length_m * 100 if total_length_m > 0 else 0

print(f"Water Coverage:")
print(f"  Segments: {len(water_segments)}/{len(segments)} ({len(water_segments)/len(segments)*100:.1f}%)")
print(f"  Length: {water_length/1000:.2f} km ({water_pct:.1f}% of route)")
print()

# Goal distance
final_coords = segments[-1]['geometry']['coordinates'][1]
goal_x, goal_y = 408381, 4750127
dist_to_goal = math.sqrt((goal_x - final_coords[0])**2 + (goal_y - final_coords[1])**2)

print(f"Goal Achievement:")
print(f"  Distance to goal: {dist_to_goal/1000:.2f} km")
if dist_to_goal < 100:
    print(f"  Status: ✅ GOAL REACHED")
else:
    print(f"  Status: ⚠️  Incomplete ({dist_to_goal/1000:.1f} km remaining)")
print()

print("="*80)
print("VALIDATION SUMMARY")
print("="*80)
print()

if water_pct > 0 and water_pct < 10:
    print("✅ EXPECTED: Water coverage >0% and <10% (inland rivers allowed)")
elif water_pct == 0:
    print("⚠️  UNEXPECTED: 0% water (rivers should be allowed now)")
elif water_pct > 50:
    print("❌ FAILURE: High water coverage (coastal waters not blocked?)")
else:
    print(f"✓ Water coverage: {water_pct:.1f}%")

if dist_to_goal < 100:
    print("✅ GOAL REACHED: Route complete")
else:
    print(f"⚠️  INCOMPLETE: {dist_to_goal/1000:.1f} km from goal")

print()
print("Full analysis saved to: route_50k_fixed.geojson")
print("="*80)

PYEOF

echo ""
echo "Validation complete!"
