#!/usr/bin/env python3
"""
PIRL Diagnostic: Manual Environment Test
Tests environment by manually executing straight-line policy toward goal.
Identifies exactly where and why termination occurs.
"""

import sys
sys.path.insert(0, '/opt/agrs/python/pirl_training')

import numpy as np
from pirl_native_env import PIRLNativeEnvironment
import json

def main():
    print("=" * 80)
    print("PIRL DIAGNOSTIC: MANUAL ENVIRONMENT TEST")
    print("=" * 80)
    
    config_path = sys.argv[1] if len(sys.argv) > 1 else 'pirl_training_config_production.yaml'
    print(f"\nInitializing environment: {config_path}")
    
    try:
        env = PIRLNativeEnvironment(config_path)
        print("✅ Environment created successfully")
    except Exception as e:
        print(f"❌ Failed to create environment: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Reset environment
    print("\nResetting environment...")
    obs, info = env.reset()
    print(f"✅ Environment reset")
    print(f"   State shape: {obs.shape}")
    print(f"   Goal distance: {info.get('goal_distance', 'N/A'):.1f} m")
    
    # Extract initial state
    start_x, start_y = obs[0], obs[1]
    goal_distance = obs[2]
    goal_bearing = obs[3]
    
    print(f"   Start position: ({start_x:.2f}, {start_y:.2f})")
    print(f"   Goal bearing: {goal_bearing:.2f} rad ({np.degrees(goal_bearing):.1f}°)")
    
    # Manual policy: head toward goal with small perturbations
    print("\n" + "=" * 80)
    print("EXECUTING MANUAL POLICY")
    print("=" * 80)
    print("\nStrategy: Head toward goal in straight line")
    print("Action: heading_change=0.0, step_size=50.0")
    
    log_data = []
    max_steps = 100  # Test first 100 steps
    
    for step in range(max_steps):
        # Simple policy: head toward goal
        heading_change = 0.0  # No heading change, maintain direction
        step_size = 50.0  # Mid-range step
        
        action = np.array([heading_change, step_size], dtype=np.float32)
        
        # Execute step
        obs, reward, terminated, truncated, info = env.step(action)
        
        # Extract state
        x, y = obs[0], obs[1]
        goal_dist = obs[2]
        slope = obs[5]  # Slope is index 5 in state vector
        
        # Log
        log_entry = {
            'step': step + 1,
            'x': float(x),
            'y': float(y),
            'goal_distance': float(goal_dist),
            'slope': float(slope),
            'reward': float(reward),
            'terminated': bool(terminated),
            'truncated': bool(truncated),
            'termination_reason': info.get('termination_reason', '')
        }
        log_data.append(log_entry)
        
        # Print every 10 steps or on termination
        if (step + 1) % 10 == 0 or terminated or truncated:
            print(f"\nStep {step + 1}:")
            print(f"  Position: ({x:.2f}, {y:.2f})")
            print(f"  Goal distance: {goal_dist:.1f} m")
            print(f"  Slope: {slope:.2f}%")
            print(f"  Reward: {reward:.2f}")
            
            if terminated or truncated:
                print(f"\n{'='*80}")
                print(f"EPISODE TERMINATED AT STEP {step + 1}")
                print(f"{'='*80}")
                print(f"Reason: {info.get('termination_reason', 'Unknown')}")
                print(f"Final slope: {slope:.2f}%")
                print(f"Distance from goal: {goal_dist:.1f} m")
                break
    else:
        print(f"\n{'='*80}")
        print(f"COMPLETED {max_steps} STEPS WITHOUT TERMINATION")
        print(f"{'='*80}")
        print(f"Final distance to goal: {goal_dist:.1f} m")
        print(f"Final slope: {slope:.2f}%")
    
    # Save log
    log_path = 'test_environment_manual_log.json'
    with open(log_path, 'w') as f:
        json.dump(log_data, f, indent=2)
    print(f"\n✅ Saved log: {log_path}")
    
    # Analysis
    print("\n" + "=" * 80)
    print("ANALYSIS")
    print("=" * 80)
    
    slopes = [entry['slope'] for entry in log_data]
    max_slope = max(slopes)
    avg_slope = np.mean(slopes)
    
    print(f"\nSlope Statistics (first {len(log_data)} steps):")
    print(f"  Min:  {min(slopes):.2f}%")
    print(f"  Mean: {avg_slope:.2f}%")
    print(f"  Max:  {max_slope:.2f}%")
    
    slope_violations = sum(1 for s in slopes if s > 20.0)
    print(f"\nSlope Violations (>20%):")
    print(f"  Count: {slope_violations}/{len(slopes)}")
    print(f"  Percentage: {(slope_violations/len(slopes)*100):.1f}%")
    
    if log_data[-1]['terminated']:
        print("\n⚠️  ISSUE CONFIRMED: Environment terminates early")
        print(f"   Termination reason: {log_data[-1]['termination_reason']}")
        print(f"   Slope at termination: {log_data[-1]['slope']:.2f}%")
        
        if 'slope' in log_data[-1]['termination_reason'].lower():
            print("\n   ROOT CAUSE: Slope constraint causing immediate termination")
            print("   SOLUTION: Replace immediate termination with penalty-based learning")
    else:
        print("\n✅ GOOD: No early termination in first 100 steps")
        print("   Environment allows continued learning")
    
    env.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())

