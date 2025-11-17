#!/usr/bin/env python3
"""
PIRL GeoJSON Route Generation Script

Loads trained model and generates GeoJSON route from start to goal.
"""

import argparse
import sys
import json
from pathlib import Path
import numpy as np

sys.path.insert(0, '/opt/agrs/python/pirl_training')

try:
    from pirl_native_env import PIRLNativeEnvironment
    from stable_baselines3 import PPO, SAC
except ImportError as e:
    print(f"ERROR: Required packages not found: {e}")
    print("Make sure native bindings and stable-baselines3 are installed")
    sys.exit(1)


def convert_to_json_serializable(obj):
    """Convert numpy types to Python types for JSON serialization."""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, dict):
        return {k: convert_to_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_json_serializable(item) for item in obj]
    else:
        return obj


def generate_route(model_path: str, config_path: str, max_steps: int = 5000) -> dict:
    """Generate route using trained model."""
    print(f"Loading model: {model_path}")
    
    # Create environment
    print(f"Creating environment: {config_path}")
    env = PIRLNativeEnvironment(config_path)
    
    # Load model (auto-detect algorithm)
    if 'ppo' in model_path.lower():
        model = PPO.load(model_path, env=env)
        print("✅ Loaded PPO model")
    elif 'sac' in model_path.lower():
        model = SAC.load(model_path, env=env)
        print("✅ Loaded SAC model")
    else:
        # Try PPO first, then SAC
        try:
            model = PPO.load(model_path, env=env)
            print("✅ Loaded PPO model")
        except:
            model = SAC.load(model_path, env=env)
            print("✅ Loaded SAC model")
    
    # Reset environment
    print("Generating route...")
    obs, info = env.reset()
    
    route_points = []
    episode_reward = 0.0
    episode_length = 0
    
    for step in range(max_steps):
        # Predict action (deterministic)
        action, _ = model.predict(obs, deterministic=True)
        
        # Execute step
        obs, reward, terminated, truncated, info = env.step(action)
        
        episode_reward += reward
        episode_length += 1
        
        # Progress update
        if (step + 1) % 100 == 0:
            goal_dist = obs[2]  # Goal distance from state
            print(f"  Step {step + 1}/{max_steps}: distance to goal = {goal_dist:.1f}m, reward = {reward:.2f}")
        
        # Check termination
        if terminated or truncated:
            reason = info.get('termination_reason', 'Unknown')
            print(f"\n✅ Episode ended at step {step + 1}")
            print(f"   Reason: {reason}")
            break
    
    # Get route from environment
    route = env.get_route()
    
    print(f"\n📊 Route Statistics:")
    print(f"   Total steps: {episode_length}")
    print(f"   Total reward: {episode_reward:.2f}")
    print(f"   Route points: {len(route)}")
    
    if len(route) < 2:
        print("\n❌ ERROR: No valid route generated")
        return None
    
    # Create GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[float(x), float(y)] for x, y in route]
                },
                "properties": {
                    "model": str(model_path),
                    "config": str(config_path),
                    "episode_length": int(episode_length),
                    "episode_reward": float(episode_reward),
                    "num_points": len(route),
                    "algorithm": "PPO" if 'ppo' in model_path.lower() else "SAC"
                }
            }
        ]
    }
    
    # Ensure all values are JSON serializable
    geojson = convert_to_json_serializable(geojson)
    
    env.close()
    
    return geojson


def main():
    parser = argparse.ArgumentParser(description="Generate GeoJSON route from trained PIRL model")
    parser.add_argument('--model', required=True, help="Path to trained model (.zip)")
    parser.add_argument('--config', required=True, help="Path to configuration YAML")
    parser.add_argument('--output', required=True, help="Output GeoJSON file path")
    parser.add_argument('--max-steps', type=int, default=5000,
                        help="Maximum steps per episode (default: 5000)")
    
    args = parser.parse_args()
    
    # Validate inputs
    model_path = Path(args.model)
    if not model_path.exists():
        print(f"ERROR: Model not found: {model_path}")
        return 1
    
    config_path = Path(args.config)
    if not config_path.exists():
        print(f"ERROR: Config not found: {config_path}")
        return 1
    
    print("=" * 80)
    print("PIRL ROUTE GENERATION")
    print("=" * 80)
    print()
    
    # Generate route
    try:
        geojson = generate_route(str(model_path), str(config_path), args.max_steps)
        
        if geojson is None:
            print("\n❌ Failed to generate route")
            return 1
        
        # Save GeoJSON
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2)
        
        print(f"\n✅ GeoJSON saved: {output_path}")
        print()
        print("=" * 80)
        print("ROUTE GENERATION COMPLETE")
        print("=" * 80)
        
        return 0
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

