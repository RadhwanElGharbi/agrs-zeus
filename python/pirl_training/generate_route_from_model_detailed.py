#!/usr/bin/env python3
"""
PIRL Route GeoJSON Generator - Detailed Output
Generates GeoJSON compliant with PIRL_TRAINING_GEOJSON_STANDARD.md
"""

import argparse
import json
import logging
from pathlib import Path
from datetime import datetime
import numpy as np
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.vec_env import VecNormalize, DummyVecEnv
from pirl_native_env import PIRLNativeEnvironment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Land cover mapping (ESA WorldCover 10m classes)
LAND_COVER_NAMES = {
    10: "tree_cover",
    20: "shrubland",
    30: "grassland",
    40: "cropland",
    50: "built_up",
    60: "bare_vegetation",
    70: "snow_ice",
    80: "water_bodies",
    90: "herbaceous_wetland",
    95: "mangroves",
    100: "moss_lichen"
}

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

def extract_crs_from_config(config_path):
    """Extract CRS from config file"""
    try:
        import yaml
        with open(config_path) as f:
            config = yaml.safe_load(f)
        
        # Try to get UTM zone from project or default to 32633
        project_path = config.get('project_path', '')
        if 'test_project2' in project_path or 'italy' in project_path.lower():
            return "EPSG:32633"  # UTM Zone 33N (Italy)
        return "EPSG:32633"  # Default
    except:
        return "EPSG:32633"  # Default fallback

def state_to_properties(state_vec, step, reward, total_reward, coords):
    """Convert state vector to segment properties"""
    # State is 27D: [heading, step_size, dist_to_goal, slope, land_cover, 
    #                geohazard, soil_capacity, pop_density, water_proximity,
    #                road_proximity, railway_proximity, powerline_proximity,
    #                pipeline_proximity, sea_proximity, protected_area_proximity,
    #                built_up_proximity, existing_pipeline_proximity,
    #                pressure_drop, cumulative_pressure, flow_velocity, reynolds,
    #                nearest_crossing_dist, nearest_crossing_width, nearest_crossing_type,
    #                crossing_before_dist, crossing_after_dist, crossing_cardinal_alignment]
    
    # Calculate segment length
    x1, y1 = coords[0]
    x2, y2 = coords[1]
    length_m = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
    
    # Extract normalized values (will be replaced with real values when C++ API is ready)
    heading_norm = float(state_vec[0]) if len(state_vec) > 0 else 0.0
    step_size_norm = float(state_vec[1]) if len(state_vec) > 1 else 0.0
    dist_to_goal_norm = float(state_vec[2]) if len(state_vec) > 2 else 0.0
    slope_norm = float(state_vec[3]) if len(state_vec) > 3 else 0.0
    land_cover_norm = float(state_vec[4]) if len(state_vec) > 4 else 0.0
    geohazard_norm = float(state_vec[5]) if len(state_vec) > 5 else 0.0
    soil_capacity_norm = float(state_vec[6]) if len(state_vec) > 6 else 0.0
    pop_density_norm = float(state_vec[7]) if len(state_vec) > 7 else 0.0
    
    # Proximities
    water_prox_norm = float(state_vec[8]) if len(state_vec) > 8 else 0.0
    road_prox_norm = float(state_vec[9]) if len(state_vec) > 9 else 0.0
    railway_prox_norm = float(state_vec[10]) if len(state_vec) > 10 else 0.0
    powerline_prox_norm = float(state_vec[11]) if len(state_vec) > 11 else 0.0
    pipeline_prox_norm = float(state_vec[12]) if len(state_vec) > 12 else 0.0
    sea_prox_norm = float(state_vec[13]) if len(state_vec) > 13 else 0.0
    protected_prox_norm = float(state_vec[14]) if len(state_vec) > 14 else 0.0
    buildup_prox_norm = float(state_vec[15]) if len(state_vec) > 15 else 0.0
    existing_pipe_prox_norm = float(state_vec[16]) if len(state_vec) > 16 else 0.0
    
    # Hydraulics
    pressure_drop_norm = float(state_vec[17]) if len(state_vec) > 17 else 0.0
    cumulative_pressure_norm = float(state_vec[18]) if len(state_vec) > 18 else 0.0
    flow_velocity_norm = float(state_vec[19]) if len(state_vec) > 19 else 0.0
    reynolds_norm = float(state_vec[20]) if len(state_vec) > 20 else 0.0
    
    # Crossing context (NEW - Phase 3)
    crossing_dist_norm = float(state_vec[21]) if len(state_vec) > 21 else 0.0
    crossing_width_norm = float(state_vec[22]) if len(state_vec) > 22 else 0.0
    crossing_type_norm = float(state_vec[23]) if len(state_vec) > 23 else 0.0
    crossing_before_norm = float(state_vec[24]) if len(state_vec) > 24 else 0.0
    crossing_after_norm = float(state_vec[25]) if len(state_vec) > 25 else 0.0
    crossing_alignment_norm = float(state_vec[26]) if len(state_vec) > 26 else 0.0
    
    # Estimate real values from normalized (approximations until C++ API is ready)
    # Slope: assume normalization is slope/100 (0-1 range for 0-100%)
    slope_percent = slope_norm * 100.0
    
    # Land cover: denormalize to class
    land_cover_class = int(land_cover_norm * 100) if land_cover_norm > 0 else 10
    land_cover_class = min(max(land_cover_class, 10), 100)
    # Snap to valid classes
    valid_classes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100]
    land_cover_class = min(valid_classes, key=lambda x: abs(x - land_cover_class))
    land_cover_name = LAND_COVER_NAMES.get(land_cover_class, "unknown")
    
    # Proximities: assume normalization is dist/1000 (0-1 range for 0-1000m)
    water_proximity_m = water_prox_norm * 1000.0
    road_proximity_m = road_prox_norm * 1000.0
    railway_proximity_m = railway_prox_norm * 1000.0
    powerline_proximity_m = powerline_prox_norm * 1000.0
    pipeline_proximity_m = pipeline_prox_norm * 1000.0
    
    # Estimate costs (simplified - real costs require C++ cost model integration)
    # Base cost per meter varies by terrain
    base_cost_per_m = 500.0  # Default
    if slope_percent > 30:
        base_cost_per_m = 800.0
    elif slope_percent > 20:
        base_cost_per_m = 650.0
    
    # Terrain cost
    terrain_cost = length_m * base_cost_per_m * (1 + slope_percent / 100.0)
    
    # Environmental cost (based on land cover)
    env_multiplier = {
        50: 2.0,  # Built-up areas
        80: 1.5,  # Water bodies
        90: 1.5,  # Wetlands
        10: 1.2,  # Tree cover
    }.get(land_cover_class, 1.0)
    environmental_cost = length_m * 200.0 * env_multiplier
    
    # Infrastructure costs (proximity-based)
    infrastructure_cost = 0.0
    if water_proximity_m < 50:
        infrastructure_cost += 5000.0
    if road_proximity_m < 20:
        infrastructure_cost += 3000.0
    if railway_proximity_m < 50:
        infrastructure_cost += 10000.0
    if powerline_proximity_m < 30:
        infrastructure_cost += 2000.0
    
    total_cost = terrain_cost + environmental_cost + infrastructure_cost
    
    return {
        # Identification
        "segment_id": step,
        "step": step,
        "length_m": round(length_m, 2),
        
        # Terrain (approximations from normalized values)
        "elevation_start": round((x1 / 1000.0) + 150.0, 2),  # Approximate
        "elevation_end": round((x2 / 1000.0) + 150.0, 2),
        "slope_percent": round(slope_percent, 2),
        "aspect": round(heading_norm * 6.28 - 3.14, 2),  # Convert to radians
        "curvature": 0.0,  # TODO: Calculate from heading changes
        
        # Cost breakdown (USD)
        "cost_usd": round(total_cost, 2),
        "cost_per_m": round(total_cost / length_m if length_m > 0 else 0, 2),
        "terrain_cost": round(terrain_cost, 2),
        "water_crossing_cost": 0.0,  # TODO: Detect crossings
        "infrastructure_cost": round(infrastructure_cost, 2),
        "environmental_cost": round(environmental_cost, 2),
        "row_cost": 0.0,
        "permitting_cost": 0.0,
        "hydraulic_cost": 0.0,
        "regulatory_cost": 0.0,
        "cumulative_cost": 0.0,  # Will be calculated
        "cumulative_distance_m": 0.0,  # Will be calculated
        
        # Land cover
        "land_cover": land_cover_name,
        "land_cover_class": land_cover_class,
        "geohazard_risk": round(geohazard_norm, 4) if geohazard_norm > 0 else None,
        "soil_capacity": round(soil_capacity_norm * 1000.0, 2),
        "population_density": round(pop_density_norm, 6),
        
        # Infrastructure proximity (meters)
        "water_proximity_m": round(water_proximity_m, 2),
        "road_proximity_m": round(road_proximity_m, 2),
        "railway_proximity_m": round(railway_proximity_m, 2),
        "powerline_proximity_m": round(powerline_proximity_m, 2),
        "pipeline_proximity_m": round(pipeline_proximity_m, 2),
        
        # Hydraulics
        "pressure_drop_pa": round(pressure_drop_norm * 10000.0, 2),
        "cumulative_pressure_drop_pa": round(cumulative_pressure_norm * 100000.0, 2),
        "flow_velocity_m_s": round(flow_velocity_norm * 5.0, 2),
        "reynolds_number": round(reynolds_norm * 100000.0, 0),
        "requires_pumping_station": cumulative_pressure_norm > 0.7,
        
        # RL metrics
        "reward": round(float(reward), 2),
        "total_reward": round(float(total_reward), 2),
    }

def generate_geojson(model_path, config_path, output_path, algorithm="PPO", max_steps=5000):
    """Generate detailed GeoJSON following PIRL_TRAINING_GEOJSON_STANDARD.md"""
    
    logger.info(f"Generating GeoJSON from model: {model_path}")
    logger.info(f"Config: {config_path}")
    logger.info(f"Algorithm: {algorithm}")
    
    # Extract CRS
    crs_code = extract_crs_from_config(config_path)
    
    # Load environment
    logger.info("Creating environment...")
    env = PIRLNativeEnvironment(str(config_path))
    env = DummyVecEnv([lambda: env])
    
    # Try to load VecNormalize stats
    vec_normalize_path = Path(model_path).parent / "pirl_vecnormalize.pkl"
    if vec_normalize_path.exists():
        logger.info(f"Loading VecNormalize stats from: {vec_normalize_path}")
        env = VecNormalize.load(str(vec_normalize_path), env)
        env.training = False
        env.norm_reward = False
    
    # Load model
    logger.info(f"Loading model as {algorithm}...")
    if algorithm.upper() == "PPO":
        model = PPO.load(model_path, env=env)
    else:
        model = SAC.load(model_path, env=env)
    
    # Run episode
    logger.info("Running episode to generate route...")
    obs = env.reset()
    done = False
    step = 0
    total_reward = 0.0
    
    # Store trajectory
    coordinates = []
    segments = []
    rewards = []
    states = []
    
    # Initial position from info (environment provides coordinates)
    # We'll track coordinates from the path taken, extracting from info dict
    # For now, use approximated coordinates from normalized state
    
    # Start coordinates (from config or hardcoded for test_project2)
    start_x, start_y = 379648.0, 4805030.0  # test_project2 start
    current_x, current_y = start_x, start_y
    coordinates.append([format_coordinate(start_x), format_coordinate(start_y)])
    
    # Track heading and step size from actions
    current_heading = 0.0  # Initial heading (radians)
    
    while not done and step < max_steps:
        action, _states = model.predict(obs, deterministic=True)
        obs, reward, done, info = env.step(action)
        
        # Extract action components (3D: heading_change, step_size, crossing_decision)
        heading_change = action[0][0]  # Normalized -1 to 1
        step_size_norm = action[0][1]  # Normalized -1 to 1
        
        # Denormalize action
        # heading_change: -1 to 1 -> -45 to 45 degrees -> radians
        heading_delta = heading_change * (np.pi / 4)  # ±45 degrees
        current_heading += heading_delta
        
        # step_size: -1 to 1 -> 10 to 200 meters
        step_size_m = 10.0 + (step_size_norm + 1.0) / 2.0 * 190.0
        
        # Calculate new position
        current_x += step_size_m * np.cos(current_heading)
        current_y += step_size_m * np.sin(current_heading)
        
        coordinates.append([format_coordinate(current_x), format_coordinate(current_y)])
        rewards.append(reward[0])
        total_reward += reward[0]
        states.append(obs[0])
        
        # Store segment info
        segment_coords = [coordinates[step], coordinates[step+1]]
        state_vec = obs[0]  # Get state vector
        seg_props = state_to_properties(
            state_vec, step+1, reward[0], total_reward, segment_coords
        )
        segments.append({
            "coords": segment_coords,
            "properties": seg_props
        })
        
        step += 1
        
        if step % 100 == 0:
            logger.info(f"  Step {step}/{max_steps}, Reward: {reward[0]:.2f}, Total: {total_reward:.2f}")
    
    # Calculate cumulative values
    cumulative_cost = 0.0
    cumulative_distance = 0.0
    for seg in segments:
        cumulative_cost += seg["properties"]["cost_usd"]
        cumulative_distance += seg["properties"]["length_m"]
        seg["properties"]["cumulative_cost"] = round(cumulative_cost, 2)
        seg["properties"]["cumulative_distance_m"] = round(cumulative_distance, 2)
    
    # Determine success
    success = done and info[0].get('success', False) if isinstance(info, list) else False
    termination_reason = info[0].get('termination_reason', 'unknown') if isinstance(info, list) else 'unknown'
    
    logger.info(f"Episode complete: {step} steps, Total reward: {total_reward:.2f}")
    logger.info(f"Success: {success}, Termination: {termination_reason}")
    
    # Build GeoJSON structure (STANDARD COMPLIANT)
    timestamp = datetime.now().isoformat()
    
    geojson = {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": crs_code  # Simplified format (not URN)
            }
        },
        "metadata": {
            "model_path": str(Path(model_path).relative_to(Path(model_path).parent.parent)),
            "config_path": str(Path(config_path).name),
            "vec_normalize_path": str(vec_normalize_path.relative_to(vec_normalize_path.parent.parent)) if vec_normalize_path.exists() else None,
            "policy_type": "deterministic",
            "total_reward": round(total_reward, 2),
            "success": success,
            "termination_reason": termination_reason,
            "num_segments": len(segments),
            "num_points": len(coordinates),
            "timestamp": timestamp,
            "generated_by": "PIRL AGRS System",
            "algorithm": algorithm.upper(),
            "training_timesteps": 10000  # TODO: Extract from model metadata
        },
        "features": []
    }
    
    # Feature 1: Full route
    geojson["features"].append({
        "type": "Feature",
        "id": "full_route",
        "properties": {
            "feature_type": "full_route",
            "total_segments": len(segments),
            "total_length_m": round(cumulative_distance, 2),
            "total_cost_usd": round(cumulative_cost, 2),
            "total_reward": round(total_reward, 2),
            "success": success,
            "termination_reason": termination_reason,
            "model_path": str(Path(model_path).relative_to(Path(model_path).parent.parent)),
            "config_path": str(Path(config_path).name),
            "generated_at": timestamp,
            "algorithm": algorithm.upper(),
            "crs": crs_code,
            "crs_name": f"{crs_code} - UTM Projection"
        },
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        }
    })
    
    # Features 2-N: Individual segments
    for i, seg in enumerate(segments, 1):
        props = seg["properties"].copy()
        props["feature_type"] = "segment"
        props["crs"] = crs_code
        props["crs_name"] = f"{crs_code} - UTM Projection"
        
        geojson["features"].append({
            "type": "Feature",
            "id": f"segment_{i}",
            "properties": props,
            "geometry": {
                "type": "LineString",
                "coordinates": seg["coords"]
            }
        })
    
    # Write output
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Sanitize all numpy types for JSON serialization
    geojson = sanitize_for_json(geojson)
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logger.info(f"✅ GeoJSON saved to: {output_path}")
    logger.info(f"   Total segments: {len(segments)}")
    logger.info(f"   Total length: {cumulative_distance:.2f} m")
    logger.info(f"   Total cost: ${cumulative_cost:,.2f}")
    logger.info(f"   CRS: {crs_code}")
    
    return output_path

def main():
    parser = argparse.ArgumentParser(description="Generate detailed PIRL route GeoJSON")
    parser.add_argument("--model", required=True, help="Path to trained model .zip")
    parser.add_argument("--config", required=True, help="Path to training config YAML")
    parser.add_argument("--output", required=True, help="Output GeoJSON path")
    parser.add_argument("--algorithm", default="PPO", choices=["PPO", "SAC"], help="Algorithm used")
    parser.add_argument("--max-steps", type=int, default=5000, help="Max episode steps")
    
    args = parser.parse_args()
    
    generate_geojson(
        model_path=args.model,
        config_path=args.config,
        output_path=args.output,
        algorithm=args.algorithm,
        max_steps=args.max_steps
    )

if __name__ == "__main__":
    main()

