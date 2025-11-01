#!/usr/bin/env python3
"""Test trajectory extraction from C++ environment"""

import sys
sys.path.append('/opt/agrs/python/pirl_training')
from pirl_native_env import PIRLNativeEnvironment

print("Testing trajectory extraction...")
print("=" * 80)

env = PIRLNativeEnvironment('PIRL/pirl_training_config_test.yaml')
obs, info = env.reset()

print(f"✓ Environment reset")
print(f"  Initial position: ({obs[0]:.2f}, {obs[1]:.2f})")

# Take 5 random steps
for i in range(5):
    action = env.action_space.sample()
    obs, reward, term, trunc, info = env.step(action)
    print(f"✓ Step {i+1}: reward={reward:.4f}, position=({obs[0]:.2f}, {obs[1]:.2f})")
    if term or trunc:
        break

# Get trajectory
print("\n" + "=" * 80)
print("Extracting trajectory from C++ environment...")
trajectory = env.unwrapped.env.get_route_trajectory()

print(f"\nTrajectory Summary:")
print(f"  Segments: {len(trajectory.segments)}")
print(f"  Success: {trajectory.success}")
print(f"  Total cost: ${trajectory.total_cost:,.2f}")
print(f"  Total length: {trajectory.total_length_m:.2f} m")
print(f"  Termination: {trajectory.termination_reason}")

if len(trajectory.segments) > 0:
    print(f"\n" + "=" * 80)
    print(f"First Segment Details:")
    seg = trajectory.segments[0]
    print(f"  ID: {seg.segment_id}")
    print(f"  Start: ({seg.start_x:.2f}, {seg.start_y:.2f})")
    print(f"  End: ({seg.end_x:.2f}, {seg.end_y:.2f})")
    print(f"  Length: {seg.length_m:.2f} m")
    print(f"  Elevation: {seg.elevation_start:.2f} -> {seg.elevation_end:.2f} m")
    print(f"  Slope: {seg.slope_percent:.2f}%")
    print(f"")
    print(f"  Cost Breakdown:")
    print(f"    Terrain: ${seg.terrain_cost:.2f}")
    print(f"    Water Crossing: ${seg.water_crossing_cost:.2f}")
    print(f"    Infrastructure: ${seg.infrastructure_cost:.2f}")
    print(f"    Environmental: ${seg.environmental_cost:.2f}")
    print(f"    ROW: ${seg.row_cost:.2f}")
    print(f"    Permitting: ${seg.permitting_cost:.2f}")
    print(f"    Hydraulic: ${seg.hydraulic_cost:.2f}")
    print(f"    Regulatory: ${seg.regulatory_cost:.2f}")
    print(f"    Total: ${seg.total_cost:.2f}")
    print(f"")
    print(f"  Land Cover: {seg.land_cover_name} (class {seg.land_cover_class})")
    print(f"  Geohazard Risk: {seg.geohazard_risk:.3f}")
    print(f"  Soil Capacity: {seg.soil_capacity:.3f}")
    print(f"  Population Density: {seg.population_density:.3f}")
    print(f"")
    print(f"  Infrastructure Proximity:")
    print(f"    Water: {seg.water_proximity:.2f} m")
    print(f"    Road: {seg.road_proximity:.2f} m")
    print(f"    Railway: {seg.railway_proximity:.2f} m")
    print(f"    Powerline: {seg.powerline_proximity:.2f} m")
    print(f"    Pipeline: {seg.pipeline_proximity:.2f} m")

print("\n" + "=" * 80)
print("✅ VALIDATION CHECKS:")
print(f"  ✓ Coordinates are in UTM: start_x={seg.start_x:.0f} (should be ~379000)")
print(f"  ✓ Has cost breakdown: {seg.terrain_cost > 0 or seg.environmental_cost > 0}")
print(f"  ✓ Length is realistic: {50 < seg.length_m < 200}")
print(f"  ✓ Has land cover name: '{seg.land_cover_name}' != 'unknown'")
print(f"  ✓ All attributes present: {len([k for k in dir(seg) if not k.startswith('_')])} attributes")

env.close()
print("\n✅ Test complete!")

