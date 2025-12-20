#!/usr/bin/env python3
"""
PIRL Detailed GeoJSON Route Generation Script

Generates comprehensive GeoJSON output matching the reference structure with:
- Top-level metadata
- Full route feature
- Individual segment features with 40+ properties each
"""

import argparse
import sys
import json
from pathlib import Path
from datetime import datetime
import numpy as np
import yaml

sys.path.insert(0, '/opt/agrs/python/pirl_training')

try:
    from pirl_native_env import PIRLNativeEnvironment
    from stable_baselines3 import PPO, SAC
except ImportError as e:
    print(f"ERROR: Required packages not found: {e}")
    print("Make sure native bindings and stable-baselines3 are installed")
    sys.exit(1)


def convert_to_json_serializable(obj):
    """Convert numpy types and NaN to JSON serializable format."""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        if np.isnan(obj) or np.isinf(obj):
            return None  # or "NaN" as string
        return float(obj)
    elif isinstance(obj, dict):
        return {k: convert_to_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_json_serializable(item) for item in obj]
    else:
        return obj


def extract_state_properties(state_vector):
    """Extract properties from 21D state vector.
    
    State vector indices (from PIRL.h):
    0: elevation (normalized)
    1: slope (normalized by 45°)
    2: goal_distance (normalized by initial distance)
    3: aspect (normalized to [-1, 1])
    4: curvature (normalized by max_curvature)
    5: land_cover_class (one-hot or normalized)
    6: geohazard_risk (normalized)
    7: soil_capacity (normalized)
    8: population_density (log-normalized)
    9-13: Proximities (water, road, railway, powerline, pipeline) - log-normalized
    14-17: Hydraulics (pressure_drop, cumulative_pressure, flow_velocity, reynolds) - normalized
    18-20: Cost components or additional features
    """
    # Note: These are normalized values - denormalization would require environment config
    return {
        'elevation_normalized': float(state_vector[0]),
        'slope_normalized': float(state_vector[1]),
        'goal_distance_normalized': float(state_vector[2]),
        'aspect_normalized': float(state_vector[3]),
        'curvature_normalized': float(state_vector[4]),
        'land_cover_normalized': float(state_vector[5]),
        'geohazard_risk_normalized': float(state_vector[6]),
        'soil_capacity_normalized': float(state_vector[7]),
        'population_density_normalized': float(state_vector[8]),
        'water_proximity_normalized': float(state_vector[9]),
        'road_proximity_normalized': float(state_vector[10]),
        'railway_proximity_normalized': float(state_vector[11]),
        'powerline_proximity_normalized': float(state_vector[12]),
        'pipeline_proximity_normalized': float(state_vector[13]),
        'pressure_drop_normalized': float(state_vector[14]) if len(state_vector) > 14 else 0.0,
        'cumulative_pressure_normalized': float(state_vector[15]) if len(state_vector) > 15 else 0.0,
        'flow_velocity_normalized': float(state_vector[16]) if len(state_vector) > 16 else 0.0,
        'reynolds_number_normalized': float(state_vector[17]) if len(state_vector) > 17 else 0.0,
    }


def generate_detailed_route(model_path: str, config_path: str, max_steps: int = 5000, algorithm: str = None) -> dict:
    """Generate route with detailed per-segment information."""
    print(f"Loading model: {model_path}")
    
    # Load configuration
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # Create environment
    print(f"Creating environment: {config_path}")
    env = PIRLNativeEnvironment(config_path)
    
    # Detect EPSG code
    epsg_code = config.get('crs_epsg') or config.get('epsg_code') or config.get('project', {}).get('crs_epsg', 32633)
    
    # Load model
    detected_algorithm = None
    if algorithm:
        if algorithm.upper() == 'PPO':
            model = PPO.load(model_path, env=env)
            detected_algorithm = 'PPO'
            print("✅ Loaded PPO model (explicit)")
        else:
            model = SAC.load(model_path, env=env)
            detected_algorithm = 'SAC'
            print("✅ Loaded SAC model (explicit)")
    else:
        # Try PPO first
        try:
            model = PPO.load(model_path, env=env)
            detected_algorithm = 'PPO'
            print("✅ Loaded PPO model (auto-detected)")
        except:
            model = SAC.load(model_path, env=env)
            detected_algorithm = 'SAC'
            print("✅ Loaded SAC model (auto-detected)")
    
    # Generate route with detailed tracking
    print("Generating route with detailed segment tracking...")
    obs, info = env.reset()
    
    segments = []
    cumulative_reward = 0.0
    cumulative_distance = 0.0
    cumulative_cost = 0.0
    
    prev_coords = None
    
    for step in range(max_steps):
        # Predict action
        action, _ = model.predict(obs, deterministic=True)
        
        # Execute step
        next_obs, reward, terminated, truncated, info = env.step(action)
        
        # Get current position from environment
        route = env.get_route()
        if len(route) > step:
            current_coords = route[step + 1] if len(route) > step + 1 else route[-1]
        else:
            current_coords = route[-1] if route else None
        
        if current_coords and prev_coords:
            # Calculate segment length
            dx = current_coords[0] - prev_coords[0]
            dy = current_coords[1] - prev_coords[1]
            segment_length = np.sqrt(dx**2 + dy**2)
            
            cumulative_reward += reward
            cumulative_distance += segment_length
            
            # Extract state information (from next_obs which represents current state after step)
            state_props = extract_state_properties(next_obs)
            
            # Estimate cost (simplified - real cost would come from C++ environment)
            # In reference, cost is detailed per category
            segment_cost = segment_length * 650.0  # Base cost per meter
            cumulative_cost += segment_cost
            
            # Build segment feature
            segment = {
                'segment_id': step + 1,
                'length_m': float(segment_length),
                'cost_usd': float(segment_cost),
                'cost_per_m': 650.0,
                'cumulative_cost': float(cumulative_cost),
                'cumulative_distance_m': float(cumulative_distance),
                'step': step,
                'reward': float(reward),
                'total_reward': float(cumulative_reward),
                'coordinates_start': [float(prev_coords[0]), float(prev_coords[1])],
                'coordinates_end': [float(current_coords[0]), float(current_coords[1])],
            }
            
            # Add state properties (normalized values)
            segment.update(state_props)
            
            # Add info if available
            if info:
                for key, value in info.items():
                    if isinstance(value, (int, float, str, bool)):
                        segment[key] = convert_to_json_serializable(value)
            
            segments.append(segment)
        
        prev_coords = current_coords
        obs = next_obs
        
        # Progress update
        if (step + 1) % 100 == 0:
            print(f"  Step {step + 1}/{max_steps}: {len(segments)} segments, cumulative reward = {cumulative_reward:.2f}")
        
        # Check termination
        if terminated or truncated:
            termination_reason = info.get('termination_reason', 'Unknown')
            success = 'Goal reached' in termination_reason or 'SUCCESS' in termination_reason
            print(f"\n✅ Episode ended at step {step + 1}")
            print(f"   Reason: {termination_reason}")
            print(f"   Success: {success}")
            break
    
    # Get final route
    route = env.get_route()
    
    print(f"\n📊 Route Statistics:")
    print(f"   Total steps: {len(segments)}")
    print(f"   Total segments: {len(segments)}")
    print(f"   Total reward: {cumulative_reward:.2f}")
    print(f"   Total distance: {cumulative_distance:.1f} m")
    print(f"   Total cost: ${cumulative_cost:,.2f}")
    print(f"   Route points: {len(route)}")
    
    if len(route) < 2:
        print("\n❌ ERROR: No valid route generated")
        return None
    
    # Build GeoJSON matching reference structure
    timestamp = datetime.now().isoformat()
    
    # Top-level metadata
    metadata = {
        'model_path': str(model_path),
        'config_path': str(config_path),
        'vec_normalize_path': None,  # Not used in current implementation
        'policy_type': 'deterministic',
        'total_reward': float(cumulative_reward),
        'success': success,
        'num_segments': len(segments),
        'num_points': len(route),
        'timestamp': timestamp,
        'generated_by': 'PIRL AGRS System',
        'algorithm': detected_algorithm
    }
    
    # Build features array
    features = []
    
    # Feature 1: Full route
    full_route_feature = {
        'type': 'Feature',
        'id': 'full_route',
        'properties': {
            'feature_type': 'full_route',
            'total_segments': len(segments),
            'total_length_m': float(cumulative_distance),
            'total_cost_usd': float(cumulative_cost),
            'total_reward': float(cumulative_reward),
            'success': success,
            'model_path': str(model_path),
            'config_path': str(config_path),
            'generated_at': timestamp,
            'algorithm': detected_algorithm
        },
        'geometry': {
            'type': 'LineString',
            'coordinates': [[float(x), float(y)] for x, y in route]
        }
    }
    features.append(full_route_feature)
    
    # Features 2-N: Individual segments
    for i, seg in enumerate(segments):
        segment_feature = {
            'type': 'Feature',
            'id': f'segment_{seg["segment_id"]}',
            'properties': {k: v for k, v in seg.items() if k not in ['coordinates_start', 'coordinates_end']},
            'geometry': {
                'type': 'LineString',
                'coordinates': [
                    seg['coordinates_start'],
                    seg['coordinates_end']
                ]
            }
        }
        features.append(segment_feature)
    
    # Assemble final GeoJSON
    geojson = {
        'type': 'FeatureCollection',
        'crs': {
            'type': 'name',
            'properties': {
                'name': f'EPSG:{epsg_code}'  # Simplified format matching reference
            }
        },
        'metadata': metadata,
        'features': features
    }
    
    # Ensure all values are JSON serializable
    geojson = convert_to_json_serializable(geojson)
    
    env.close()
    
    return geojson


def main():
    parser = argparse.ArgumentParser(description="Generate detailed GeoJSON route from trained PIRL model")
    parser.add_argument('--model', required=True, help="Path to trained model (.zip)")
    parser.add_argument('--config', required=True, help="Path to configuration YAML")
    parser.add_argument('--output', required=True, help="Output GeoJSON file path")
    parser.add_argument('--max-steps', type=int, default=5000,
                        help="Maximum steps per episode (default: 5000)")
    parser.add_argument('--algorithm', choices=['PPO', 'SAC'], default=None,
                        help="Algorithm used to train the model (auto-detect if not provided)")
    
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
    print("PIRL DETAILED ROUTE GENERATION")
    print("=" * 80)
    print()
    
    # Generate route
    try:
        geojson = generate_detailed_route(str(model_path), str(config_path), args.max_steps, algorithm=args.algorithm)
        
        if geojson is None:
            print("\n❌ Failed to generate route")
            return 1
        
        # Save GeoJSON
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2, allow_nan=False)
        
        print(f"\n✅ Detailed GeoJSON saved: {output_path}")
        print(f"   Features: {len(geojson['features'])} (1 full route + {len(geojson['features'])-1} segments)")
        print(f"   Metadata: {len(geojson['metadata'])} fields")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    print("\n" + "=" * 80)
    print("DETAILED ROUTE GENERATION COMPLETE")
    print("=" * 80)
    
    return 0


if __name__ == "__main__":
    exit(main())

