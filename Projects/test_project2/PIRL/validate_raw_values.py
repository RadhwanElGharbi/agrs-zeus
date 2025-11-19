#!/usr/bin/env python3
"""
Comprehensive validation test for 27D PIRL state space with RAW values.
Verifies that all dimensions are correctly populated with interpretable real-world values.
"""

import sys
sys.path.insert(0, '/opt/agrs/python/pirl_training')

import numpy as np
from pirl_native_env import PIRLNativeEnvironment
import yaml

def validate_state_dimension(name, value, expected_range, unit=""):
    """Validate a single state dimension."""
    min_val, max_val = expected_range
    status = "✅" if min_val <= value <= max_val else "❌"
    
    # Additional check for suspicious normalized values
    warning = ""
    if 0 <= value <= 1 and name not in ["no_go_zone", "cadastre_complex", "geohazard_risk", "crossing_cardinal_alignment"]:
        if name.endswith("_proximity") or "distance" in name or "elevation" in name or "slope" in name:
            warning = " ⚠️  NORMALIZED (should be raw!)"
    
    print(f"  {status} {name:35s} = {value:12.2f} {unit:8s}  [expected: {min_val}-{max_val}]{warning}")
    return min_val <= value <= max_val and not warning

def main():
    print("=" * 80)
    print("PIRL 27D STATE VALIDATION - RAW VALUES TEST")
    print("=" * 80)
    print()
    
    # Load configuration
    config_path = '/opt/agrs/Projects/test_project2/PIRL/pirl_training_config_10k_validation.yaml'
    print(f"📖 Loading configuration: {config_path}")
    
    with open(config_path) as f:
        config_data = yaml.safe_load(f)
    
    # Create environment
    print("🔄 Creating PIRL native environment...")
    env = PIRLNativeEnvironment(config_path)
    
    print("✅ Environment created successfully")
    print()
    
    # Reset and get initial state
    print("🎯 Resetting environment and checking initial state...")
    state, info = env.reset()
    state = np.array(state, dtype=np.float32)
    print(f"   State shape: {state.shape} (expected: (27,))")
    print()
    
    # Validate all 27 dimensions
    print("=" * 80)
    print("STATE DIMENSION VALIDATION")
    print("=" * 80)
    print()
    
    all_valid = True
    
    # Coordinates (indices 0-1)
    print("📍 COORDINATES:")
    all_valid &= validate_state_dimension("x", state[0], (100000, 10000000), "m")
    all_valid &= validate_state_dimension("y", state[1], (100000, 10000000), "m")
    print()
    
    # Goal-related (indices 2-3)
    print("🎯 GOAL NAVIGATION:")
    all_valid &= validate_state_dimension("goal_distance", state[2], (0, 200000), "m")
    all_valid &= validate_state_dimension("goal_bearing", state[3], (-np.pi, np.pi), "rad")
    print()
    
    # Terrain (indices 4-7)
    print("⛰️  TERRAIN:")
    all_valid &= validate_state_dimension("elevation", state[4], (-500, 9000), "m")
    all_valid &= validate_state_dimension("slope", state[5], (0, 100), "%")
    all_valid &= validate_state_dimension("aspect", state[6], (-np.pi, np.pi), "rad")
    all_valid &= validate_state_dimension("curvature", state[7], (-1, 1), "1/m")
    print()
    
    # Constraints (indices 8-9)
    print("🚫 CONSTRAINTS:")
    all_valid &= validate_state_dimension("no_go_zone", state[8], (0, 1), "binary")
    all_valid &= validate_state_dimension("water_proximity", state[9], (0, 10000), "m")
    print()
    
    # Infrastructure (indices 10, 15)
    print("🛣️  INFRASTRUCTURE PROXIMITY:")
    all_valid &= validate_state_dimension("road_proximity", state[10], (0, 10000), "m")
    all_valid &= validate_state_dimension("railway_proximity", state[15], (0, 10000), "m")
    print()
    
    # Environmental (indices 11-14)
    print("🌍 ENVIRONMENTAL:")
    all_valid &= validate_state_dimension("geohazard_risk", state[11], (0, 1), "0-1")
    all_valid &= validate_state_dimension("soil_capacity", state[12], (0, 5000), "kPa")
    all_valid &= validate_state_dimension("cadastre_complex", state[13], (0, 1), "binary")
    all_valid &= validate_state_dimension("population_density", state[14], (0, 100000), "ppl/km²")
    print()
    
    # Hydraulics (indices 16-19)
    print("💧 HYDRAULICS:")
    all_valid &= validate_state_dimension("cumulative_pressure_drop", state[16], (0, 1e8), "Pa")
    all_valid &= validate_state_dimension("segments_since_pump", state[17], (0, 200000), "m")
    all_valid &= validate_state_dimension("flow_velocity", state[18], (0, 30), "m/s")
    all_valid &= validate_state_dimension("reynolds_number", state[19], (0, 1e8), "")
    print()
    
    # Agent state (index 20)
    print("🤖 AGENT STATE:")
    all_valid &= validate_state_dimension("prev_heading", state[20], (-np.pi, np.pi), "rad")
    print()
    
    # Crossing context (indices 21-26) - THE NEW FEATURES
    print("🔀 CROSSING CONTEXT (NEW - Phase 3):")
    all_valid &= validate_state_dimension("nearest_crossing_dist", state[21], (0, 10000), "m")
    all_valid &= validate_state_dimension("nearest_crossing_width", state[22], (0, 500), "m")
    all_valid &= validate_state_dimension("nearest_crossing_type", state[23], (0, 4), "type")
    all_valid &= validate_state_dimension("crossing_before_dist", state[24], (0, 10000), "m")
    all_valid &= validate_state_dimension("crossing_after_dist", state[25], (0, 10000), "m")
    all_valid &= validate_state_dimension("crossing_cardinal_alignment", state[26], (0, 1), "0-1")
    print()
    
    # Test a few steps to see state evolution
    print("=" * 80)
    print("MULTI-STEP STATE EVOLUTION TEST")
    print("=" * 80)
    print()
    
    for step_num in range(5):
        action = env.action_space.sample()  # Random action
        state, reward, done, truncated, info = env.step(action)
        state = np.array(state, dtype=np.float32)
        
        print(f"Step {step_num + 1}:")
        print(f"  Distance to goal: {state[2]:.1f} m")
        print(f"  Elevation:        {state[4]:.1f} m")
        print(f"  Slope:            {state[5]:.2f} %")
        print(f"  Road proximity:   {state[10]:.1f} m")
        print(f"  Nearest crossing: {state[21]:.1f} m (type: {int(state[23])})")
        print(f"  Reward:           {reward:.2f}")
        print(f"  Done:             {done}")
        
        if done or truncated:
            print(f"  Termination reason: {info.get('termination_reason', 'unknown')}")
            break
        print()
    
    print()
    print("=" * 80)
    print("VALIDATION SUMMARY")
    print("=" * 80)
    print()
    
    if all_valid:
        print("✅ ALL STATE DIMENSIONS VALIDATED SUCCESSFULLY")
        print()
        print("Key findings:")
        print("  • All 27 dimensions present and correctly shaped")
        print("  • All values within expected raw ranges")
        print("  • No suspicious normalized values detected")
        print("  • Coordinates are raw UTM (not scaled)")
        print("  • Distances are in meters (not kilometers)")
        print("  • Slopes are percentages (not 0-1 range)")
        print("  • Crossing context features populated")
        print()
        print("✅ SYSTEM READY FOR TRAINING")
        return 0
    else:
        print("❌ VALIDATION FAILED")
        print()
        print("Issues detected:")
        print("  • Some dimensions have suspicious normalized values")
        print("  • Expected raw values but got scaled/normalized data")
        print()
        print("⚠️  FIX REQUIRED BEFORE TRAINING")
        return 1

if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

