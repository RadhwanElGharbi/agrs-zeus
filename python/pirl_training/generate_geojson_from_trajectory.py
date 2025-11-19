#!/usr/bin/env python3
"""
PIRL Route GeoJSON Generator - Using Raw Trajectory Data
Generates GeoJSON compliant with PIRL_TRAINING_GEOJSON_STANDARD.md
Uses C++ RouteTrajectory with raw values (not reconstructed from state vector)
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

def segment_to_properties(segment, segment_idx):
    """
    Convert C++ RouteSegment to GeoJSON properties.
    Uses RAW values directly from the trajectory - no reconstruction needed!
    """
    props = {
        # Identification
        "segment_id": segment_idx + 1,
        "step": int(segment.step_number) if hasattr(segment, 'step_number') else segment_idx,
        
        # Geometry
        "length_m": format_coordinate(segment.length_m),
        
        # Terrain (RAW values from DEM/terrain analysis)
        "elevation_start": format_coordinate(segment.elevation_start),
        "elevation_end": format_coordinate(segment.elevation_end),
        "slope_percent": round(float(segment.slope_percent), 2),
        "aspect": round(float(segment.aspect), 2),
        "curvature": round(float(segment.curvature), 6),
        
        # Cost breakdown (RAW USD from CostModel)
        "cost_usd": round(float(segment.total_cost), 2),
        "cost_per_m": round(float(segment.total_cost / segment.length_m if segment.length_m > 0 else 0), 2),
        "cumulative_cost": round(float(segment.cumulative_cost), 2),
        "terrain_cost": round(float(segment.terrain_cost), 2),
        "water_crossing_cost": round(float(segment.water_crossing_cost), 2),
        "infrastructure_cost": round(float(segment.infrastructure_cost), 2),
        "environmental_cost": round(float(segment.environmental_cost), 2),
        "row_cost": round(float(segment.row_cost), 2),
        "permitting_cost": round(float(segment.permitting_cost), 2),
        "hydraulic_cost": round(float(segment.hydraulic_cost), 2),
        "regulatory_cost": round(float(segment.regulatory_cost), 2),
        
        # Land cover (from GIS query)
        "land_cover_class": int(segment.land_cover_class),
        "land_cover_name": str(segment.land_cover_name) if segment.land_cover_name else LAND_COVER_NAMES.get(segment.land_cover_class, "unknown"),
        
        # Environmental (RAW values from GIS)
        "geohazard_risk": round(float(segment.geohazard_risk), 3),
        "soil_capacity": round(float(segment.soil_capacity), 2),
        "population_density": round(float(segment.population_density), 2),
        
        # Infrastructure proximity (RAW meters from GIS queries)
        "water_proximity_m": round(float(segment.water_proximity), 2),
        "road_proximity_m": round(float(segment.road_proximity), 2),
        "railway_proximity_m": round(float(segment.railway_proximity), 2),
        "powerline_proximity_m": round(float(segment.powerline_proximity), 2),
        "pipeline_proximity_m": round(float(segment.pipeline_proximity), 2),
        
        # Hydraulics (RAW values from HydraulicsCalculator)
        "pressure_drop_pa": round(float(segment.pressure_drop_pa), 2),
        "cumulative_pressure_drop_pa": round(float(segment.cumulative_pressure_drop_pa), 2),
        "flow_velocity_m_s": round(float(segment.flow_velocity_m_s), 2),
        "reynolds_number": round(float(segment.reynolds_number), 0),
        "requires_pumping_station": bool(segment.requires_pumping_station),
        
        # RL metrics (from training episode)
        "reward": round(float(segment.reward) if hasattr(segment, 'reward') else 0.0, 2),
        "total_reward": round(float(segment.total_reward) if hasattr(segment, 'total_reward') else 0.0, 2),
        
        # Crossing context (NEW - Phase 3: Enhanced Crossing Logic)
        "nearest_crossing_dist": round(float(segment.nearest_crossing_dist), 2),
        "nearest_crossing_width": round(float(segment.nearest_crossing_width), 2),
        "nearest_crossing_type": int(segment.nearest_crossing_type),
        "nearest_crossing_type_name": {0: "none", 1: "road", 2: "waterway", 3: "railway", 4: "powerline"}.get(int(segment.nearest_crossing_type), "unknown"),
        "crossing_before_dist": round(float(segment.crossing_before_dist), 2),
        "crossing_after_dist": round(float(segment.crossing_after_dist), 2),
        "crossing_cardinal_alignment": round(float(segment.crossing_cardinal_alignment), 3),
        
        # Boundary awareness (NEW - Phase 4: Continuous Cost System)
        "distance_to_aoi_boundary": round(float(segment.distance_to_aoi_boundary), 2),
        "distance_to_sea_boundary": round(float(segment.distance_to_sea_boundary), 2),
    }
    
    # Sanitize for JSON
    return sanitize_for_json(props)

def generate_geojson(model_path, config_path, output_path, algorithm="PPO", num_episodes=1):
    """
    Generate GeoJSON from trained model using raw trajectory data.
    
    Args:
        model_path: Path to trained model (.zip file)
        config_path: Path to training configuration (.yaml file)
        output_path: Path for output GeoJSON file
        algorithm: "PPO" or "SAC"
        num_episodes: Number of episodes to generate (default: 1, best episode)
    """
    logger.info(f"🚀 Starting GeoJSON generation from trajectory data")
    logger.info(f"   Model: {model_path}")
    logger.info(f"   Config: {config_path}")
    logger.info(f"   Algorithm: {algorithm}")
    
    # Extract CRS
    crs_code = extract_crs_from_config(config_path)
    logger.info(f"   CRS: {crs_code}")
    
    # Create environment
    logger.info("📦 Creating environment...")
    env = PIRLNativeEnvironment(config_path)
    
    # Load model
    logger.info(f"🔄 Loading {algorithm} model...")
    if algorithm.upper() == "PPO":
        model = PPO.load(model_path)
    elif algorithm.upper() == "SAC":
        model = SAC.load(model_path)
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")
    
    logger.info(f"✅ Model loaded successfully")
    
    # Run episode(s) and collect best trajectory
    best_trajectory = None
    best_reward = float('-inf')
    
    for episode in range(num_episodes):
        logger.info(f"\n🎮 Running episode {episode + 1}/{num_episodes}...")
        
        obs, info = env.reset()
        done = False
        truncated = False
        episode_reward = 0.0
        step_count = 0
        
        while not done and not truncated:
            action, _states = model.predict(obs, deterministic=True)
            obs, reward, done, truncated, info = env.step(action)
            episode_reward += reward
            step_count += 1
            
            if step_count % 50 == 0:
                logger.info(f"   Step {step_count}: reward={reward:.2f}, total={episode_reward:.2f}")
        
        # Get trajectory from C++ environment (RAW DATA!)
        trajectory = env.env.get_route_trajectory()
        
        logger.info(f"   Episode {episode + 1} complete:")
        logger.info(f"     Steps: {step_count}")
        logger.info(f"     Total reward: {episode_reward:.2f}")
        logger.info(f"     Success: {trajectory.success}")
        logger.info(f"     Segments: {len(trajectory.segments)}")
        logger.info(f"     Total length: {trajectory.total_length_m:.2f} m")
        logger.info(f"     Total cost: ${trajectory.total_cost:,.2f}")
        logger.info(f"     Termination: {trajectory.termination_reason}")
        
        # Keep best trajectory
        if episode_reward > best_reward:
            best_reward = episode_reward
            best_trajectory = trajectory
            logger.info(f"   ✅ New best trajectory!")
    
    if best_trajectory is None or len(best_trajectory.segments) == 0:
        logger.error("❌ No valid trajectory generated")
        return False
    
    logger.info(f"\n📊 Using best trajectory: {len(best_trajectory.segments)} segments, reward={best_reward:.2f}")
    
    # Build GeoJSON
    logger.info("🗺️  Building GeoJSON...")
    
    # Collect full route coordinates
    full_route_coords = []
    for seg in best_trajectory.segments:
        if len(full_route_coords) == 0:
            full_route_coords.append([
                format_coordinate(seg.start_x),
                format_coordinate(seg.start_y)
            ])
        full_route_coords.append([
            format_coordinate(seg.end_x),
            format_coordinate(seg.end_y)
        ])
    
    # Create features list
    features = []
    
    # Feature 1: Full route LineString
    full_route_feature = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": full_route_coords
        },
        "properties": {
            "feature_type": "full_route",
            "crs": crs_code,
            "crs_name": crs_code.split(':')[1] if ':' in crs_code else crs_code,
            "total_segments": len(best_trajectory.segments),
            "total_length_m": round(float(best_trajectory.total_length_m), 2),
            "total_cost_usd": round(float(best_trajectory.total_cost), 2),
            "success": bool(best_trajectory.success),
            "termination_reason": str(best_trajectory.termination_reason),
            "algorithm": algorithm.upper(),
            "model_path": str(model_path),
            "generated_at": datetime.now().isoformat()
        }
    }
    features.append(full_route_feature)
    
    # Features 2-N: Individual segments
    for idx, seg in enumerate(best_trajectory.segments):
        seg_coords = [
            [format_coordinate(seg.start_x), format_coordinate(seg.start_y)],
            [format_coordinate(seg.end_x), format_coordinate(seg.end_y)]
        ]
        
        seg_feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": seg_coords
            },
            "properties": segment_to_properties(seg, idx)
        }
        
        # Add CRS to each segment
        seg_feature["properties"]["crs"] = crs_code
        seg_feature["properties"]["crs_name"] = crs_code.split(':')[1] if ':' in crs_code else crs_code
        
        features.append(seg_feature)
    
    # Create top-level metadata
    metadata = {
        "project_name": "test_project2",  # TODO: Extract from config
        "algorithm": algorithm.upper(),
        "model_path": str(model_path),
        "config_path": str(config_path),
        "crs": crs_code,
        "total_segments": len(best_trajectory.segments),
        "total_length_m": round(float(best_trajectory.total_length_m), 2),
        "total_cost_usd": round(float(best_trajectory.total_cost), 2),
        "success": bool(best_trajectory.success),
        "termination_reason": str(best_trajectory.termination_reason),
        "total_reward": round(float(best_reward), 2),
        "generated_at": datetime.now().isoformat(),
        "generator_version": "2.0_trajectory_based"
    }
    
    # Assemble final GeoJSON with proper CRS for ArcGIS compatibility
    geojson = {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {
                "name": crs_code
            }
        },
        "metadata": sanitize_for_json(metadata),
        "features": features
    }
    
    # Write to file
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logger.info(f"✅ GeoJSON generated successfully!")
    logger.info(f"   Output: {output_path}")
    logger.info(f"   Features: {len(features)} (1 full route + {len(best_trajectory.segments)} segments)")
    logger.info(f"   Total length: {best_trajectory.total_length_m:.2f} m")
    logger.info(f"   Total cost: ${best_trajectory.total_cost:,.2f}")
    
    return True

def main():
    parser = argparse.ArgumentParser(description="Generate GeoJSON from PIRL model (using raw trajectory data)")
    parser.add_argument("--model", required=True, help="Path to trained model (.zip)")
    parser.add_argument("--config", required=True, help="Path to training config (.yaml)")
    parser.add_argument("--output", required=True, help="Output GeoJSON path")
    parser.add_argument("--algorithm", default="PPO", choices=["PPO", "SAC"], help="RL algorithm")
    parser.add_argument("--episodes", type=int, default=1, help="Number of episodes (uses best)")
    
    args = parser.parse_args()
    
    success = generate_geojson(
        model_path=args.model,
        config_path=args.config,
        output_path=args.output,
        algorithm=args.algorithm,
        num_episodes=args.episodes
    )
    
    return 0 if success else 1

if __name__ == "__main__":
    exit(main())

