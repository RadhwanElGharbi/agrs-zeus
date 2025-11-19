#!/usr/bin/env python3
import sys
sys.path.insert(0, '/opt/agrs/python/pirl_training')

from stable_baselines3 import PPO
from pirl_native_env import PIRLNativeEnvironment
import json
import numpy as np

# Convert numpy types to Python native types
def convert_numpy(obj):
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj

print("=" * 80)
print("PIRL Route Generation from Trained Model")
print("=" * 80)

# Load model
model_path = sys.argv[1] if len(sys.argv) > 1 else 'PIRL/models/pirl_native_final.zip'
print(f"\n[1/4] Loading trained model: {model_path}")
model = PPO.load(model_path)
print("✅ Model loaded successfully")

# Create environment
print("\n[2/4] Creating environment...")
env = PIRLNativeEnvironment('PIRL/pirl_training_config_production.yaml')
print(f"✅ Environment created")
print(f"    State space: {env.observation_space.shape}")
print(f"    Action space: {env.action_space.shape}")

# Generate route
print("\n[3/4] Generating route...")
obs, info = env.reset()
route_points = []
total_reward = 0.0
step = 0

print(f"    Start position: ({obs[0]:.1f}, {obs[1]:.1f})")
print(f"    Goal distance: {info.get('goal_distance', 'N/A'):.1f}m")

for step in range(5000):
    action, _states = model.predict(obs, deterministic=True)
    obs, reward, terminated, truncated, info = env.step(action)
    
    # Get position from observation and convert to Python float
    x, y = float(obs[0]), float(obs[1])
    route_points.append([x, y])
    total_reward += float(reward)
    
    if (step + 1) % 500 == 0:
        print(f"    Step {step + 1}: position=({x:.1f}, {y:.1f}), reward={reward:.2f}")
    
    if terminated or truncated:
        print(f"\n    Episode completed at step {step+1}")
        print(f"    Termination reason: {info.get('termination_reason', 'unknown')}")
        print(f"    Final position: ({x:.1f}, {y:.1f})")
        print(f"    Total reward: {total_reward:.2f}")
        break

# Export to GeoJSON
print("\n[4/4] Exporting to GeoJSON...")
model_name = model_path.split('/')[-1].replace('.zip', '')
output_path = f'PIRL/outputs/{model_name}_route.geojson'

geojson = {
    "type": "FeatureCollection",
    "crs": {
        "type": "name",
        "properties": {
            "name": "EPSG:32633"
        }
    },
    "features": [{
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": route_points
        },
        "properties": {
            "model": model_name,
            "steps": len(route_points),
            "total_reward": total_reward,
            "terminated": bool(terminated),
            "truncated": bool(truncated),
            "termination_reason": str(info.get('termination_reason', 'unknown'))
        }
    }]
}

with open(output_path, 'w') as f:
    json.dump(geojson, f, indent=2)

print(f"✅ Route exported to: {output_path}")
print(f"    Total points: {len(route_points)}")
print(f"    Total reward: {total_reward:.2f}")
print(f"    Success: {terminated and not truncated}")

print("\n" + "=" * 80)
print("Route generation complete!")
print("=" * 80)
print(f"\n📍 GeoJSON location: /opt/agrs/Projects/test_project2/{output_path}")

env.close()
