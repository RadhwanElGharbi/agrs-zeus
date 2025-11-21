#!/usr/bin/env python3
"""
US_PIPELINE PIRL Route GeoJSON Generator (Simplified)

Generates ArcGIS-compatible GeoJSON from trained models.
Simplified properties for 7D state space (slope optimization only).
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from datetime import datetime
import numpy as np
from stable_baselines3 import PPO

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from pirl_native_env_us import PIRLNativeEnvironmentUS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def format_coordinate(coord):
    """Format coordinate to 2 decimal places (centimeter precision)"""
    return float(round(float(coord), 2))


def sanitize_for_json(obj):
    """Convert numpy types to native Python types for JSON serialization"""
    if isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.integer, np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(item) for item in obj]
    else:
        return obj


def segment_to_properties(segment, segment_idx):
    """
    Convert simplified RouteSegment to GeoJSON properties.
    
    US_PIPELINE PIRL - 7D State Space (Slope Optimization Only)
    ============================================================
    
    INCLUDED Properties (from C++ RouteSegment):
    - Identification: segment_id, step_number
    - Geometry: length_m, cumulative_distance_m
    - Terrain: elevation_start/end, max_slope_percent (PRIMARY OPTIMIZATION)
    - RL Metrics: reward, total_reward (per segment)
    - Constraints: distance_to_aoi_boundary
    
    EXCLUDED Properties (not in simplified state space):
    - Infrastructure: roads, railways, waterways, powerlines, pipelines
    - Land cover: ESA WorldCover classes
    - Hydraulics: pressure drop, flow velocity, Reynolds number
    - Environmental: geohazard risk, soil capacity, population density
    - Crossing context: crossing detection and alignment
    - Cost breakdown: terrain, water, infrastructure, permitting costs
    - Advanced terrain: aspect, curvature
    """
    props = {
        # === IDENTIFICATION ===
        "segment_id": segment_idx + 1,
        "step": int(segment.step_number) if hasattr(segment, 'step_number') else segment_idx,
        
        # === GEOMETRY (2 properties) ===
        "length_m": format_coordinate(segment.length_m),
        "cumulative_distance_m": format_coordinate(segment.cumulative_distance_m),
        
        # === TERRAIN - PRIMARY OPTIMIZATION (3 properties) ===
        "elevation_start_m": format_coordinate(segment.elevation_start),
        "elevation_end_m": format_coordinate(segment.elevation_end),
        "max_slope_percent": round(float(segment.max_slope_percent), 2),
        
        # === RL METRICS (2 properties) ===
        "reward": round(float(segment.reward) if hasattr(segment, 'reward') else 0.0, 2),
        "total_reward_cumulative": round(float(segment.total_reward) if hasattr(segment, 'total_reward') else 0.0, 2),
        
        # === CONSTRAINTS (1 property) ===
        "distance_to_aoi_boundary_m": round(float(segment.distance_to_aoi_boundary), 2),
    }
    
    # Sanitize for JSON
    return sanitize_for_json(props)


def generate_geojson(model_path, config_path, output_path, num_episodes=1):
    """
    Generate GeoJSON from trained US_PIPELINE PIRL model.
    
    Args:
        model_path: Path to trained model (.zip)
        config_path: Path to environment config (YAML)
        output_path: Output path for GeoJSON
        num_episodes: Number of episodes to generate (default: 1)
    """
    
    logger.info("=" * 80)
    logger.info("US_PIPELINE PIRL GeoJSON Generator")
    logger.info("=" * 80)
    logger.info(f"Model:        {model_path}")
    logger.info(f"Config:       {config_path}")
    logger.info(f"Output:       {output_path}")
    logger.info(f"Episodes:     {num_episodes}")
    logger.info("=" * 80)
    
    # Load model
    logger.info("\n📦 Loading model...")
    try:
        model = PPO.load(model_path)
        logger.info("✅ Model loaded successfully")
    except Exception as e:
        logger.error(f"❌ Failed to load model: {e}")
        raise
    
    # Create environment
    logger.info("\n🔧 Creating environment...")
    try:
        env = PIRLNativeEnvironmentUS(config_path)
        logger.info("✅ Environment created successfully")
    except Exception as e:
        logger.error(f"❌ Failed to create environment: {e}")
        raise
    
    # Extract CRS from config
    import yaml
    with open(config_path) as f:
        config = yaml.safe_load(f)
    epsg_code = config.get('epsg_code', 32613)
    crs = f"EPSG:{epsg_code}"
    
    logger.info(f"\n🗺️  CRS: {crs}")
    
    # Generate routes
    all_routes = []
    
    for episode in range(num_episodes):
        logger.info(f"\n{'='*80}")
        logger.info(f"Episode {episode + 1}/{num_episodes}")
        logger.info(f"{'='*80}")
        
        # Reset environment
        observation, info = env.reset()
        done = False
        step = 0
        
        # Run episode
        while not done:
            action, _states = model.predict(observation, deterministic=True)
            observation, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated
            step += 1
            
            if step % 10 == 0:
                logger.info(f"  Step {step}: reward={reward:.2f}")
        
        # Get trajectory
        trajectory = env.get_route_trajectory()
        
        logger.info(f"\n📊 Episode {episode + 1} Summary:")
        logger.info(f"  Success:      {trajectory.success}")
        logger.info(f"  Total length: {trajectory.total_length_m:.2f} m ({trajectory.total_length_m/1000.0:.2f} km)")
        logger.info(f"  Segments:     {len(trajectory.segments)}")
        logger.info(f"  Termination:  {trajectory.termination_reason}")
        
        if not trajectory.segments:
            logger.warning(f"⚠️  Episode {episode + 1} has no segments, skipping")
            continue
        
        # Calculate statistics
        slopes = [seg.max_slope_percent for seg in trajectory.segments]
        avg_slope = np.mean(slopes)
        max_slope = np.max(slopes)
        
        logger.info(f"  Avg slope:    {avg_slope:.2f}%")
        logger.info(f"  Max slope:    {max_slope:.2f}%")
        
        all_routes.append({
            'trajectory': trajectory,
            'episode': episode + 1,
            'success': trajectory.success,
            'avg_slope': avg_slope,
            'max_slope': max_slope
        })
    
    if not all_routes:
        logger.error("❌ No valid routes generated!")
        return
    
    # Use best route (lowest average slope)
    best_route = min(all_routes, key=lambda x: x['avg_slope'])
    trajectory = best_route['trajectory']
    
    logger.info(f"\n🏆 Best route: Episode {best_route['episode']}")
    logger.info(f"  Average slope: {best_route['avg_slope']:.2f}%")
    logger.info(f"  Max slope:     {best_route['max_slope']:.2f}%")
    
    # Build GeoJSON
    logger.info("\n🗺️  Building GeoJSON...")
    
    features = []
    
    # Add individual segments
    for idx, segment in enumerate(trajectory.segments):
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [format_coordinate(segment.start_x), format_coordinate(segment.start_y)],
                    [format_coordinate(segment.end_x), format_coordinate(segment.end_y)]
                ]
            },
            "properties": segment_to_properties(segment, idx)
        }
        features.append(feature)
    
    # Create full route feature (MultiLineString)
    full_route_coords = []
    for segment in trajectory.segments:
        full_route_coords.append([
            [format_coordinate(segment.start_x), format_coordinate(segment.start_y)],
            [format_coordinate(segment.end_x), format_coordinate(segment.end_y)]
        ])
    
    full_route_feature = {
        "type": "Feature",
        "geometry": {
            "type": "MultiLineString",
            "coordinates": full_route_coords
        },
        "properties": {
            "type": "full_route",
            "total_length_m": format_coordinate(trajectory.total_length_m),
            "total_segments": len(trajectory.segments),
            "success": trajectory.success,
            "average_slope_percent": round(best_route['avg_slope'], 2),
            "max_slope_percent": round(best_route['max_slope'], 2),
            "generation_timestamp": datetime.now().isoformat(),
            "model_path": str(model_path),
            "crs": crs
        }
    }
    
    # Insert full route as first feature
    features.insert(0, full_route_feature)
    
    # Create GeoJSON structure
    geojson = {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": crs
            }
        },
        "metadata": {
            "title": "US_PIPELINE PIRL Route (7D Slope Optimization)",
            "description": "Reinforcement learning generated pipeline route optimized for terrain slope",
            "model_type": "PPO",
            "state_space_dim": 7,
            "action_space_dim": 2,
            "optimization_focus": "slope_minimization",
            "generation_date": datetime.now().isoformat(),
            "total_length_m": format_coordinate(trajectory.total_length_m),
            "total_segments": len(trajectory.segments),
            "average_slope_percent": round(best_route['avg_slope'], 2),
            "max_slope_percent": round(best_route['max_slope'], 2),
            "crs": crs
        },
        "features": features
    }
    
    # Sanitize entire structure
    geojson = sanitize_for_json(geojson)
    
    # Write to file
    logger.info(f"\n💾 Writing GeoJSON to: {output_path}")
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logger.info("✅ GeoJSON generated successfully!")
    logger.info(f"\n📊 Final Statistics:")
    logger.info(f"  Total features:   {len(features)}")
    logger.info(f"  Route length:     {trajectory.total_length_m:.2f} m ({trajectory.total_length_m/1000.0:.2f} km)")
    logger.info(f"  Average slope:    {best_route['avg_slope']:.2f}%")
    logger.info(f"  Max slope:        {best_route['max_slope']:.2f}%")
    logger.info(f"  CRS:              {crs}")
    logger.info(f"\n🗺️  Ready for ArcGIS import!")
    logger.info("=" * 80)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate GeoJSON from US_PIPELINE PIRL model"
    )
    
    parser.add_argument(
        "--model",
        type=str,
        required=True,
        help="Path to trained model (.zip)"
    )
    
    parser.add_argument(
        "--config",
        type=str,
        required=True,
        help="Path to environment config (YAML)"
    )
    
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Output path for GeoJSON"
    )
    
    parser.add_argument(
        "--episodes",
        type=int,
        default=1,
        help="Number of episodes to generate (default: 1)"
    )
    
    args = parser.parse_args()
    
    # Verify inputs exist
    if not Path(args.model).exists():
        logger.error(f"Model file not found: {args.model}")
        sys.exit(1)
    
    if not Path(args.config).exists():
        logger.error(f"Config file not found: {args.config}")
        sys.exit(1)
    
    # Create output directory if needed
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    
    # Generate GeoJSON
    try:
        generate_geojson(
            model_path=args.model,
            config_path=args.config,
            output_path=args.output,
            num_episodes=args.episodes
        )
    except Exception as e:
        logger.error(f"❌ Failed to generate GeoJSON: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

