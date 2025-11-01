#!/usr/bin/env python3
"""
Generate optimal pipeline route using trained PIRL model with native C++ environment.

This script uses the trained PPO model to generate a cost-optimal pipeline route
that respects all SAIPEM criteria. It leverages the native C++ environment for
real GIS queries, ensuring the model receives accurate terrain and constraint data.

The generated route is exported to GeoJSON with detailed segment information.
"""

import sys
import json
import logging
from pathlib import Path
from datetime import datetime
import numpy as np

# Add PIRL training directory to path
sys.path.insert(0, '/opt/agrs/python/pirl_training')

from stable_baselines3 import PPO
from pirl_native_env import PIRLNativeEnvironment
import geojson
from geojson import Feature, FeatureCollection, LineString, Point as GeoPoint

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def calculate_distance(p1, p2):
    """Calculate Euclidean distance between two points."""
    return np.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)


def export_route_geojson(route_coords, route_stats, config, output_path):
    """
    Export route to GeoJSON with detailed segment information.
    
    Args:
        route_coords: List of (x, y) coordinate pairs
        route_stats: Dictionary of route statistics
        config: Project configuration
        output_path: Output file path
    """
    if len(route_coords) < 2:
        logger.error("Route has fewer than 2 points, cannot create GeoJSON")
        return
    
    # Create features
    features = []
    
    # 1. Full route as LineString
    route_line = LineString(route_coords)
    route_properties = {
        'type': 'pipeline_route',
        'project': config.project_name,
        'client': config.client_name,
        'generated': datetime.now().isoformat(),
        'model': 'PIRL_PPO_trained',
        'crs': f'EPSG:{config.epsg_code}',
        **route_stats
    }
    features.append(Feature(geometry=route_line, properties=route_properties))
    
    # 2. Start point
    start_props = {
        'type': 'start_point',
        'label': 'Pipeline Start',
        'coordinates': f"{config.start_point.x:.6f}, {config.start_point.y:.6f}"
    }
    features.append(Feature(geometry=GeoPoint(route_coords[0]), properties=start_props))
    
    # 3. End point
    end_props = {
        'type': 'end_point',
        'label': 'Pipeline End',
        'coordinates': f"{config.end_point.x:.6f}, {config.end_point.y:.6f}"
    }
    features.append(Feature(geometry=GeoPoint(route_coords[-1]), properties=end_props))
    
    # 4. Individual segments with detailed info
    for i in range(len(route_coords) - 1):
        p1 = route_coords[i]
        p2 = route_coords[i + 1]
        
        segment_line = LineString([p1, p2])
        segment_length = calculate_distance(p1, p2)
        
        segment_props = {
            'type': 'pipeline_segment',
            'segment_id': i + 1,
            'length_m': round(segment_length, 2),
            'start_coord': f"({p1[0]:.2f}, {p1[1]:.2f})",
            'end_coord': f"({p2[0]:.2f}, {p2[1]:.2f})"
        }
        
        features.append(Feature(geometry=segment_line, properties=segment_props))
    
    # Create FeatureCollection
    feature_collection = FeatureCollection(features)
    
    # Write to file
    with open(output_path, 'w') as f:
        geojson.dump(feature_collection, f, indent=2)
    
    logger.info(f"✅ Route exported to: {output_path}")
    logger.info(f"   Total features: {len(features)}")
    logger.info(f"   Route segments: {len(route_coords) - 1}")


def generate_optimal_route(model_path: str, config_path: str, output_dir: str, 
                          max_steps: int = 5000, deterministic: bool = True):
    """
    Generate optimal pipeline route using trained model.
    
    Args:
        model_path: Path to trained PPO model (.zip)
        config_path: Path to project configuration YAML
        output_dir: Directory to save output files
        max_steps: Maximum number of steps to attempt
        deterministic: Use deterministic policy (recommended for inference)
    
    Returns:
        Dictionary with route coordinates, statistics, and metadata
    """
    logger.info("")
    logger.info("="*80)
    logger.info("PIRL ROUTE GENERATION - TRAINED MODEL + NATIVE C++ ENVIRONMENT")
    logger.info("="*80)
    logger.info("")
    
    # Validate inputs
    model_path = Path(model_path)
    config_path = Path(config_path)
    output_dir = Path(output_dir)
    
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Load trained model
    logger.info(f"📦 Loading trained PPO model from: {model_path}")
    model = PPO.load(str(model_path))
    logger.info("✅ Model loaded successfully")
    
    # 2. Create native C++ environment
    logger.info(f"🗺️  Creating native C++ environment from: {config_path}")
    env = PIRLNativeEnvironment(str(config_path))
    logger.info("✅ Environment created successfully")
    
    # 3. Reset environment
    logger.info("")
    logger.info("🔄 Resetting environment to initial state...")
    obs, info = env.reset()
    initial_distance = info['goal_distance']
    logger.info(f"   Start position: ({info['position'][0]:.1f}, {info['position'][1]:.1f})")
    logger.info(f"   Initial distance to goal: {initial_distance:.1f}m")
    
    # 4. Generate route using trained model
    logger.info("")
    logger.info(f"🚀 Generating route (max {max_steps} steps, deterministic={deterministic})...")
    
    step = 0
    total_reward = 0.0
    done = False
    
    while not done and step < max_steps:
        # Get action from trained model
        action, _states = model.predict(obs, deterministic=deterministic)
        
        # Execute action in native C++ environment
        obs, reward, terminated, truncated, info = env.step(action)
        
        total_reward += reward
        done = terminated or truncated
        step += 1
        
        # Log progress every 100 steps
        if step % 100 == 0:
            current_reward_info = info.get('reward_info')
            logger.info(f"   Step {step:4d}: reward={reward:10.2f}, total={total_reward:12.2f}")
        
        if done:
            reason = info.get('termination_reason', 'max_steps')
            logger.info(f"   Episode terminated at step {step}: {reason}")
            break
    
    # 5. Extract route from C++ environment
    logger.info("")
    logger.info("📍 Extracting route trajectory from C++ environment...")
    route_coords = env.get_route()
    logger.info(f"   Route has {len(route_coords)} waypoints")
    
    if len(route_coords) < 2:
        logger.error("❌ Route generation failed - insufficient points")
        return None
    
    # 6. Get route statistics
    logger.info("")
    logger.info("📊 Calculating route statistics...")
    route_stats = env.get_route_stats()
    
    logger.info(f"   Total length: {route_stats['total_length_m']:.2f} m ({route_stats['total_length_m']/1000:.2f} km)")
    logger.info(f"   Total cost: ${route_stats['total_cost_usd']:,.2f}")
    logger.info(f"   Average slope: {route_stats['avg_slope']:.2f}%")
    logger.info(f"   Water crossings: {route_stats['num_water_crossings']}")
    logger.info(f"   Road crossings: {route_stats['num_road_crossings']}")
    logger.info(f"   Constraint violations: {route_stats['num_constraint_violations']}")
    logger.info(f"   Max curvature: {route_stats['curvature_max']:.4f} rad/m")
    
    # Calculate progress
    final_distance = calculate_distance(route_coords[-1], 
                                       (env.config.end_point.x, env.config.end_point.y))
    progress_pct = (1.0 - final_distance / initial_distance) * 100
    logger.info(f"   Progress to goal: {progress_pct:.1f}%")
    logger.info(f"   Final distance to goal: {final_distance:.1f}m")
    
    # 7. Export to GeoJSON
    logger.info("")
    logger.info("💾 Exporting route to GeoJSON...")
    output_path = output_dir / f"route_trained_model_{datetime.now().strftime('%Y%m%d_%H%M%S')}.geojson"
    
    export_route_geojson(route_coords, route_stats, env.config, output_path)
    
    # 8. Save metadata
    metadata = {
        'model_path': str(model_path),
        'config_path': str(config_path),
        'generated': datetime.now().isoformat(),
        'steps': step,
        'total_reward': total_reward,
        'route_length_m': route_stats['total_length_m'],
        'route_cost_usd': route_stats['total_cost_usd'],
        'progress_pct': progress_pct,
        'final_distance_m': final_distance,
        'num_waypoints': len(route_coords),
        'deterministic': deterministic,
        'saipem_compliant': route_stats['num_constraint_violations'] == 0,
        'route_stats': route_stats
    }
    
    metadata_path = output_dir / f"route_metadata_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    logger.info(f"✅ Metadata saved to: {metadata_path}")
    
    # 9. Summary
    logger.info("")
    logger.info("="*80)
    logger.info("✅ ROUTE GENERATION COMPLETE")
    logger.info("="*80)
    logger.info("")
    logger.info(f"📄 GeoJSON: {output_path}")
    logger.info(f"📄 Metadata: {metadata_path}")
    logger.info("")
    
    if route_stats['num_constraint_violations'] == 0:
        logger.info("✅ Route is SAIPEM-compliant (no constraint violations)")
    else:
        logger.warning(f"⚠️  Route has {route_stats['num_constraint_violations']} constraint violations")
    
    logger.info("")
    logger.info(f"📏 Route Length: {route_stats['total_length_m']/1000:.2f} km")
    logger.info(f"💰 Estimated Cost: ${route_stats['total_cost_usd']:,.2f}")
    logger.info(f"📈 Progress: {progress_pct:.1f}% to goal")
    logger.info("")
    logger.info("="*80)
    
    return metadata


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Generate optimal pipeline route using trained PIRL model'
    )
    parser.add_argument(
        '--model',
        default='models/pirl_italy_v1_final.zip',
        help='Path to trained model (.zip)'
    )
    parser.add_argument(
        '--config',
        default='pirl_training_config.yaml',
        help='Path to project configuration (YAML)'
    )
    parser.add_argument(
        '--output-dir',
        default='outputs/routes',
        help='Output directory for generated routes'
    )
    parser.add_argument(
        '--max-steps',
        type=int,
        default=5000,
        help='Maximum number of steps'
    )
    parser.add_argument(
        '--stochastic',
        action='store_true',
        help='Use stochastic policy instead of deterministic'
    )
    
    args = parser.parse_args()
    
    try:
        result = generate_optimal_route(
            model_path=args.model,
            config_path=args.config,
            output_dir=args.output_dir,
            max_steps=args.max_steps,
            deterministic=not args.stochastic
        )
        
        if result:
            sys.exit(0)
        else:
            logger.error("Route generation failed")
            sys.exit(1)
            
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        sys.exit(1)



