#!/usr/bin/env python3
"""
Generate GeoJSON from successful episodes using stochastic actions
Tries multiple episodes to find one that reaches the goal
"""

import argparse
import json
import logging
from pathlib import Path
from datetime import datetime
import numpy as np
from stable_baselines3 import PPO
from pirl_native_env import PIRLNativeEnvironment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def generate_best_success(model_path, config_path, output_path, max_episodes=50):
    """Run episodes with stochastic actions to find successful routes"""
    
    logger.info(f"🚀 Searching for successful routes (max {max_episodes} attempts)")
    logger.info(f"   Model: {model_path}")
    logger.info(f"   Config: {config_path}")
    
    # Create environment
    env = PIRLNativeEnvironment(config_path)
    
    # Load model
    model = PPO.load(model_path)
    
    successful_episodes = []
    
    for episode in range(max_episodes):
        obs, info = env.reset()
        done = False
        truncated = False
        episode_reward = 0.0
        step_count = 0
        
        # Use stochastic actions (deterministic=False) to get variation
        while not done and not truncated and step_count < 5000:
            action, _states = model.predict(obs, deterministic=False)  # STOCHASTIC!
            obs, reward, done, truncated, info = env.step(action)
            episode_reward += reward
            step_count += 1
        
        # Get trajectory
        trajectory = env.env.get_route_trajectory()
        
        # Check if successful
        if trajectory.success or trajectory.termination_reason.startswith("SUCCESS"):
            logger.info(f"✅ Episode {episode+1}: SUCCESS! Reward={episode_reward:.2f}, Steps={step_count}, Length={trajectory.total_length_m:.0f}m")
            successful_episodes.append({
                'episode': episode + 1,
                'reward': episode_reward,
                'steps': step_count,
                'length': trajectory.total_length_m,
                'cost': trajectory.total_cost,
                'trajectory': trajectory
            })
        else:
            if episode % 10 == 0:
                logger.info(f"Episode {episode+1}: Failed ({trajectory.termination_reason[:50]}), Reward={episode_reward:.2f}")
    
    if not successful_episodes:
        logger.error("❌ No successful episodes found!")
        return False
    
    # Get best successful episode (highest reward)
    best = max(successful_episodes, key=lambda x: x['reward'])
    logger.info(f"\n🏆 Best successful episode:")
    logger.info(f"   Episode: {best['episode']}")
    logger.info(f"   Reward: {best['reward']:.2f}")
    logger.info(f"   Steps: {best['steps']}")
    logger.info(f"   Length: {best['length']:.2f} m")
    logger.info(f"   Cost: ${best['cost']:,.2f}")
    
    # Generate GeoJSON from best trajectory
    trajectory = best['trajectory']
    
    # Build GeoJSON (simplified version)
    from generate_geojson_from_trajectory import segment_to_properties, format_coordinate, sanitize_for_json
    
    full_route_coords = []
    for seg in trajectory.segments:
        if len(full_route_coords) == 0:
            full_route_coords.append([format_coordinate(seg.start_x), format_coordinate(seg.start_y)])
        full_route_coords.append([format_coordinate(seg.end_x), format_coordinate(seg.end_y)])
    
    features = []
    
    # Full route feature
    features.append({
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": full_route_coords},
        "properties": {
            "feature_type": "full_route",
            "crs": "EPSG:32633",
            "crs_name": "32633",
            "total_segments": len(trajectory.segments),
            "total_length_m": round(float(trajectory.total_length_m), 2),
            "total_cost_usd": round(float(trajectory.total_cost), 2),
            "success": True,
            "termination_reason": str(trajectory.termination_reason),
            "algorithm": "PPO",
            "model_path": str(model_path),
            "generated_at": datetime.now().isoformat(),
            "episode_reward": round(float(best['reward']), 2)
        }
    })
    
    # Individual segments
    for idx, seg in enumerate(trajectory.segments):
        seg_coords = [
            [format_coordinate(seg.start_x), format_coordinate(seg.start_y)],
            [format_coordinate(seg.end_x), format_coordinate(seg.end_y)]
        ]
        
        seg_feature = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": seg_coords},
            "properties": segment_to_properties(seg, idx)
        }
        seg_feature["properties"]["crs"] = "EPSG:32633"
        seg_feature["properties"]["crs_name"] = "32633"
        features.append(seg_feature)
    
    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "EPSG:32633"}},
        "metadata": {
            "project_name": "test_project2",
            "algorithm": "PPO",
            "model_path": str(model_path),
            "config_path": str(config_path),
            "crs": "EPSG:32633",
            "total_segments": len(trajectory.segments),
            "total_length_m": round(float(trajectory.total_length_m), 2),
            "total_cost_usd": round(float(trajectory.total_cost), 2),
            "success": True,
            "termination_reason": str(trajectory.termination_reason),
            "total_reward": round(float(best['reward']), 2),
            "generated_at": datetime.now().isoformat(),
            "generator_version": "2.0_stochastic_success",
            "attempts": len(successful_episodes)
        },
        "features": features
    }
    
    # Write to file
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logger.info(f"\n✅ GeoJSON saved: {output_path}")
    logger.info(f"   Found {len(successful_episodes)} successful routes out of {max_episodes} attempts")
    
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-episodes", type=int, default=50)
    
    args = parser.parse_args()
    
    generate_best_success(args.model, args.config, args.output, args.max_episodes)

