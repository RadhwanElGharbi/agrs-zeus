#!/usr/bin/env python3
"""
Generate Cost-Optimal Route from Trained PIRL Model

This script loads a trained PIRL model and generates a detailed route
with segment-level cost information exported to GeoJSON format.
"""

import sys
import os
import json
import argparse
import numpy as np
import yaml
from pathlib import Path
from datetime import datetime
import logging

# Add pirl_training to path
sys.path.insert(0, '/opt/agrs/python/pirl_training')

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv
import pickle

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import native environment
try:
    from pirl_native_env import PIRLNativeEnvironment
    NATIVE_AVAILABLE = True
except ImportError:
    logger.warning("pirl_native not available, using fallback")
    from pirl_env import PIRLEnvironment
    NATIVE_AVAILABLE = False


def load_model_and_stats(model_path, vec_normalize_path):
    """Load trained model and normalization statistics."""
    logger.info(f"Loading trained model from: {model_path}")
    model = PPO.load(str(model_path))
    logger.info("✅ Model loaded successfully")
    
    vec_normalize_stats = None
    if vec_normalize_path and Path(vec_normalize_path).exists():
        logger.info(f"Loading VecNormalize stats from: {vec_normalize_path}")
        with open(vec_normalize_path, 'rb') as f:
            vec_normalize_stats = pickle.load(f)
        logger.info("✅ Normalization stats loaded")
    else:
        logger.warning("⚠️  No VecNormalize stats found - using raw observations")
    
    return model, vec_normalize_stats


def normalize_observation(obs, vec_normalize_stats):
    """Normalize observation using VecNormalize statistics."""
    if vec_normalize_stats is None:
        return obs
    
    # Apply same normalization as during training
    obs_mean = vec_normalize_stats.obs_rms.mean
    obs_var = vec_normalize_stats.obs_rms.var
    obs_normalized = (obs - obs_mean) / np.sqrt(obs_var + 1e-8)
    obs_normalized = np.clip(obs_normalized, -10.0, 10.0)
    
    return obs_normalized


def generate_route(model, config_path, vec_normalize_stats, deterministic=True):
    """
    Generate route using trained model.
    
    Returns:
        route_points: List of [x, y] coordinates
        segment_info: List of dictionaries with segment-level data
        total_reward: Cumulative reward
        success: Whether goal was reached
    """
    logger.info("=" * 80)
    logger.info("GENERATING ROUTE WITH TRAINED MODEL")
    logger.info("=" * 80)
    
    # Load configuration
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    start_x = config['start_x']
    start_y = config['start_y']
    end_x = config['end_x']
    end_y = config['end_y']
    epsg_code = config.get('epsg_code', 32633)
    
    logger.info(f"📍 Start: ({start_x:.2f}, {start_y:.2f})")
    logger.info(f"🎯 End: ({end_x:.2f}, {end_y:.2f})")
    
    # Calculate straight-line distance
    straight_dist = np.sqrt((end_x - start_x)**2 + (end_y - start_y)**2)
    logger.info(f"📏 Straight-line distance: {straight_dist:.2f} m")
    logger.info("")
    
    # Create environment
    if NATIVE_AVAILABLE:
        logger.info("Using PIRLNativeEnvironment (C++ backend)")
        env = PIRLNativeEnvironment(config_path)
    else:
        logger.info("Using PIRLEnvironment (Python backend)")
        env = PIRLEnvironment(config_path)
    
    # Reset environment
    obs, info = env.reset()
    
    route_points = [[start_x, start_y]]
    segment_info = []
    total_reward = 0.0
    step = 0
    max_steps = config.get('max_steps_per_episode', 5000)
    
    logger.info(f"🚀 Running {'deterministic' if deterministic else 'stochastic'} inference...")
    logger.info(f"   Max steps: {max_steps}")
    logger.info("")
    
    cumulative_cost = 0.0
    cumulative_distance = 0.0
    
    while step < max_steps:
        # Normalize observation if stats available
        obs_normalized = normalize_observation(obs, vec_normalize_stats)
        
        # Get action from model
        action, _states = model.predict(obs_normalized, deterministic=deterministic)
        
        # Execute action
        obs, reward, terminated, truncated, info = env.step(action)
        
        total_reward += reward
        step += 1
        
        # Check termination
        if terminated or truncated:
            termination_reason = info.get('termination_reason', 'unknown')
            if terminated and 'goal' in termination_reason.lower():
                logger.info(f"🎯 Goal reached! Steps: {step}")
                success = True
            else:
                logger.warning(f"❌ Episode terminated: {termination_reason} at step {step}")
                success = False
            break
    else:
        logger.warning(f"⏱️  Max steps reached ({max_steps})")
        success = False
    
    # After episode completes, get full trajectory from C++ environment
    logger.info("Extracting detailed trajectory from environment...")
    trajectory = env.unwrapped.env.get_route_trajectory()
    
    # Extract route points from trajectory (actual UTM coordinates)
    route_points = []
    route_points.append([start_x, start_y])  # Start point
    for segment in trajectory.segments:
        route_points.append([segment.end_x, segment.end_y])
    
    # Convert segments to Python dicts
    segment_info = []
    for segment in trajectory.segments:
        segment_data = {
            "segment_id": segment.segment_id,
            "length_m": segment.length_m,
            
            # Geometry
            "elevation_start": segment.elevation_start,
            "elevation_end": segment.elevation_end,
            "slope_percent": segment.slope_percent,
            "aspect": segment.aspect,
            "curvature": segment.curvature,
            
            # Cost breakdown
            "cost_usd": segment.total_cost,
            "cost_per_m": segment.total_cost / segment.length_m if segment.length_m > 0 else 0.0,
            "terrain_cost": segment.terrain_cost,
            "water_crossing_cost": segment.water_crossing_cost,
            "infrastructure_cost": segment.infrastructure_cost,
            "environmental_cost": segment.environmental_cost,
            "row_cost": segment.row_cost,
            "permitting_cost": segment.permitting_cost,
            "hydraulic_cost": segment.hydraulic_cost,
            "regulatory_cost": segment.regulatory_cost,
            
            # Cumulative
            "cumulative_cost": segment.cumulative_cost,
            "cumulative_distance_m": segment.cumulative_distance_m,
            
            # Land cover
            "land_cover": segment.land_cover_name,
            "land_cover_class": segment.land_cover_class,
            
            # Environment
            "geohazard_risk": segment.geohazard_risk,
            "soil_capacity": segment.soil_capacity,
            "population_density": segment.population_density,
            
            # Infrastructure proximity
            "water_proximity_m": segment.water_proximity,
            "road_proximity_m": segment.road_proximity,
            "railway_proximity_m": segment.railway_proximity,
            "powerline_proximity_m": segment.powerline_proximity,
            "pipeline_proximity_m": segment.pipeline_proximity,
            
            # Hydraulics
            "pressure_drop_pa": segment.pressure_drop_pa,
            "cumulative_pressure_drop_pa": segment.cumulative_pressure_drop_pa,
            "flow_velocity_m_s": segment.flow_velocity_m_s,
            "reynolds_number": segment.reynolds_number,
            "requires_pumping_station": segment.requires_pumping_station,
            
            # RL metadata
            "step": segment.step_number,
            "reward": segment.reward,
            "total_reward": segment.total_reward
        }
        segment_info.append(segment_data)
    
    # Update metrics from trajectory
    cumulative_cost = trajectory.total_cost
    cumulative_distance = trajectory.total_length_m
    success = trajectory.success
    
    logger.info("")
    logger.info(f"📊 Route Statistics:")
    logger.info(f"   Total segments: {len(segment_info)}")
    logger.info(f"   Total length: {cumulative_distance:.2f} m ({cumulative_distance/1000:.2f} km)")
    logger.info(f"   Total cost: ${cumulative_cost:,.2f} USD")
    logger.info(f"   Cost per km: ${(cumulative_cost / (cumulative_distance/1000)):,.2f} USD/km" if cumulative_distance > 0 else "   Cost per km: N/A")
    logger.info(f"   Total reward: {total_reward:.2f}")
    logger.info(f"   Success: {success}")
    logger.info("")
    
    env.close()
    
    return route_points, segment_info, total_reward, success, epsg_code


def export_detailed_geojson(route_points, segment_info, output_path, epsg_code, metadata):
    """Export route with detailed segment information to GeoJSON."""
    logger.info("Exporting detailed GeoJSON...")
    
    features = []
    
    # Create a feature for each segment
    for i, seg_info in enumerate(segment_info):
        if i + 1 < len(route_points):
            feature = {
                "type": "Feature",
                "id": f"segment_{seg_info['segment_id']}",
                "properties": seg_info,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        route_points[i],
                        route_points[i + 1]
                    ]
                }
            }
            features.append(feature)
    
    # Create full route feature
    full_route_feature = {
        "type": "Feature",
        "id": "full_route",
        "properties": {
            "feature_type": "full_route",
            "total_segments": len(segment_info),
            "total_length_m": segment_info[-1]['cumulative_distance_m'] if segment_info else 0.0,
            "total_cost_usd": segment_info[-1]['cumulative_cost'] if segment_info else 0.0,
            "total_reward": metadata.get('total_reward', 0.0),
            "success": metadata.get('success', False),
            "model_path": metadata.get('model_path', ''),
            "config_path": metadata.get('config_path', ''),
            "generated_at": metadata.get('timestamp', '')
        },
        "geometry": {
            "type": "LineString",
            "coordinates": route_points
        }
    }
    
    # Create GeoJSON FeatureCollection
    geojson = {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": f"EPSG:{epsg_code}"
            }
        },
        "metadata": metadata,
        "features": [full_route_feature] + features
    }
    
    # Save to file
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logger.info(f"✅ Detailed GeoJSON exported to: {output_path}")
    logger.info(f"   Total features: {len(features) + 1} (1 full route + {len(features)} segments)")


def main():
    parser = argparse.ArgumentParser(description='Generate route from trained PIRL model')
    parser.add_argument('--model', type=str, required=True,
                        help='Path to trained model (.zip file)')
    parser.add_argument('--config', type=str, required=True,
                        help='Path to project configuration YAML')
    parser.add_argument('--vec-normalize', type=str, default=None,
                        help='Path to VecNormalize stats (.pkl file)')
    parser.add_argument('--output', type=str, default=None,
                        help='Output GeoJSON path')
    parser.add_argument('--deterministic', action='store_true', default=True,
                        help='Use deterministic policy (default: True)')
    parser.add_argument('--stochastic', action='store_true',
                        help='Use stochastic policy')
    
    args = parser.parse_args()
    
    # Determine output path
    if args.output is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = f"pirl_route_detailed_{timestamp}.geojson"
    else:
        output_path = args.output
    
    # Auto-detect VecNormalize path if not provided
    if args.vec_normalize is None:
        model_dir = Path(args.model).parent
        vec_normalize_candidates = list(model_dir.glob('*vecnormalize*.pkl'))
        if vec_normalize_candidates:
            args.vec_normalize = str(vec_normalize_candidates[0])
            logger.info(f"Auto-detected VecNormalize stats: {args.vec_normalize}")
    
    deterministic = args.deterministic and not args.stochastic
    
    logger.info("=" * 80)
    logger.info("PIRL ROUTE GENERATION FROM TRAINED MODEL")
    logger.info("=" * 80)
    logger.info(f"Model: {args.model}")
    logger.info(f"Config: {args.config}")
    logger.info(f"VecNormalize: {args.vec_normalize if args.vec_normalize else 'None'}")
    logger.info(f"Output: {output_path}")
    logger.info(f"Policy: {'Deterministic' if deterministic else 'Stochastic'}")
    logger.info("")
    
    try:
        # Load model
        model, vec_normalize_stats = load_model_and_stats(args.model, args.vec_normalize)
        
        # Generate route
        route_points, segment_info, total_reward, success, epsg_code = generate_route(
            model, args.config, vec_normalize_stats, deterministic=deterministic
        )
        
        # Prepare metadata
        metadata = {
            "model_path": str(args.model),
            "config_path": str(args.config),
            "vec_normalize_path": str(args.vec_normalize) if args.vec_normalize else None,
            "policy_type": "deterministic" if deterministic else "stochastic",
            "total_reward": float(total_reward),
            "success": bool(success),
            "num_segments": len(segment_info),
            "num_points": len(route_points),
            "timestamp": datetime.now().isoformat(),
            "generated_by": "PIRL AGRS System"
        }
        
        # Export to GeoJSON
        export_detailed_geojson(route_points, segment_info, output_path, epsg_code, metadata)
        
        logger.info("")
        logger.info("=" * 80)
        logger.info("✅ ROUTE GENERATION COMPLETE")
        logger.info("=" * 80)
        logger.info(f"Output file: {output_path}")
        logger.info("")
        
    except Exception as e:
        logger.error("")
        logger.error("=" * 80)
        logger.error("❌ ROUTE GENERATION FAILED")
        logger.error("=" * 80)
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

