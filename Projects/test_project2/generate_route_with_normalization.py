#!/usr/bin/env python3
import sys
sys.path.insert(0, '/opt/agrs/python/pirl_training')

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, VecNormalize
from pirl_native_env import PIRLNativeEnvironment
import json
import numpy as np

print("=" * 80)
print("PIRL Route Generation with VecNormalize")
print("=" * 80)

# Parse arguments
model_path = sys.argv[1] if len(sys.argv) > 1 else 'PIRL/models/pirl_native_final.zip'
vecnorm_path = model_path.replace('.zip', '_vecnormalize.pkl')

print(f"\n[1/5] Loading trained model: {model_path}")
model = PPO.load(model_path)
print("✅ Model loaded successfully")

# Create environment
print("\n[2/5] Creating environment...")
def make_env():
    return PIRLNativeEnvironment('PIRL/pirl_training_config_production.yaml')

env = DummyVecEnv([make_env])

# Load VecNormalize statistics if available
print(f"\n[3/5] Loading VecNormalize statistics: {vecnorm_path}")
try:
    env = VecNormalize.load(vecnorm_path, env)
    env.training = False  # Disable training mode for inference
    env.norm_reward = False  # Don't normalize rewards during inference
    print("✅ VecNormalize loaded successfully")
except FileNotFoundError:
    print("⚠️  VecNormalize file not found, proceeding without normalization")
except Exception as e:
    print(f"⚠️  Could not load VecNormalize: {e}")

print(f"    State space: {env.observation_space.shape}")
print(f"    Action space: {env.action_space.shape}")

# Generate route
print("\n[4/5] Generating route...")
obs = env.reset()
route_points = []
total_reward = 0.0
step = 0

# Get initial info
try:
    initial_info = env.env_method('get_info')[0]
    print(f"    Start position: {initial_info.get('position', 'N/A')}")
    print(f"    Goal distance: {initial_info.get('goal_distance', 'N/A'):.1f}m")
except:
    print("    Starting generation...")

for step in range(5000):
    action, _states = model.predict(obs, deterministic=True)
    obs, reward, done, info = env.step(action)
    
    # Extract position from environment
    try:
        env_info = env.env_method('get_info')[0]
        x, y = env_info.get('position', (0, 0))
        route_points.append([float(x), float(y)])
    except:
        # Fallback to obs if get_info not available
        x, y = float(obs[0][0]), float(obs[0][1])
        route_points.append([x, y])
    
    total_reward += float(reward[0])
    
    if (step + 1) % 500 == 0:
        print(f"    Step {step + 1}: position=({x:.1f}, {y:.1f}), reward={reward[0]:.2f}")
    
    if done[0]:
        print(f"\n    Episode completed at step {step+1}")
        try:
            final_info = env.env_method('get_info')[0]
            print(f"    Termination reason: {final_info.get('termination_reason', 'unknown')}")
            print(f"    Final position: ({x:.1f}, {y:.1f})")
        except:
            pass
        print(f"    Total reward: {total_reward:.2f}")
        break

# Export to GeoJSON
print("\n[5/5] Exporting to GeoJSON...")
model_name = model_path.split('/')[-1].replace('.zip', '')
output_path = f'PIRL/outputs/{model_name}_route_normalized.geojson'

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
            "with_vecnormalize": True
        }
    }]
}

with open(output_path, 'w') as f:
    json.dump(geojson, f, indent=2)

print(f"✅ Route exported to: {output_path}")
print(f"    Total points: {len(route_points)}")
print(f"    Total reward: {total_reward:.2f}")

print("\n" + "=" * 80)
print("Route generation complete!")
print("=" * 80)
print(f"\n📍 GeoJSON location: /opt/agrs/Projects/test_project2/{output_path}")

env.close()
