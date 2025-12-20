#!/usr/bin/env python3
"""
PIRL Diagnostic: Random Walk Test
Tests environment with random policy biased toward goal.
Verifies agent can complete episodes without premature termination.
"""

import sys
sys.path.insert(0, '/opt/agrs/python/pirl_training')

import numpy as np
from pirl_native_env import PIRLNativeEnvironment
import json

def main():
    print("=" * 80)
    print("PIRL DIAGNOSTIC: RANDOM WALK TEST")
    print("=" * 80)
    
    config_path = sys.argv[1] if len(sys.argv) > 1 else 'pirl_training_config_production.yaml'
    max_steps = int(sys.argv[2]) if len(sys.argv) > 2 else 5000
    
    print(f"\nConfiguration: {config_path}")
    print(f"Max steps: {max_steps}")
    
    # Create environment
    print("\nInitializing environment...")
    try:
        env = PIRLNativeEnvironment(config_path)
        print("✅ Environment created")
    except Exception as e:
        print(f"❌ Failed: {e}")
        return 1
    
    # Reset
    obs, info = env.reset()
    print(f"✅ Environment reset")
    print(f"   Goal distance: {info.get('goal_distance', 'N/A'):.1f} m")
    
    # Statistics tracking
    total_reward = 0.0
    slope_violations = 0
    slope_penalties = []
    distances = []
    terminated_early = False
    termination_reason = ""
    
    print("\n" + "=" * 80)
    print("EXECUTING RANDOM WALK POLICY")
    print("=" * 80)
    print("\nPolicy: Random actions with 70% bias toward goal")
    
    for step in range(max_steps):
        # Random policy with goal bias
        goal_bearing = obs[3]  # Goal bearing from state
        
        if np.random.random() < 0.7:
            # 70% of time: move toward goal with small perturbation
            heading_change = np.random.normal(0, 0.1)  # Small random noise
        else:
            # 30% of time: explore randomly
            heading_change = np.random.uniform(-np.pi/4, np.pi/4)
        
        step_size = np.random.uniform(30.0, 70.0)  # Vary step size
        
        action = np.array([heading_change, step_size], dtype=np.float32)
        
        # Execute
        obs, reward, terminated, truncated, info = env.step(action)
        
        total_reward += reward
        
        # Track slope
        slope = obs[5]
        if slope > 20.0:
            slope_violations += 1
            # Estimate penalty (approximation based on exponential formula)
            excess = slope - 20.0
            penalty_est = -100.0 * (1.4 ** excess)
            slope_penalties.append(min(penalty_est, -50000.0))
        
        distances.append(obs[2])  # Goal distance
        
        # Progress updates
        if (step + 1) % 500 == 0:
            print(f"Step {step + 1}/{max_steps}: distance={obs[2]:.1f}m, slope={slope:.1f}%, reward={reward:.1f}")
        
        if terminated or truncated:
            terminated_early = True
            termination_reason = info.get('termination_reason', 'Unknown')
            print(f"\n⚠️  Episode terminated at step {step + 1}")
            print(f"   Reason: {termination_reason}")
            break
    
    # Results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    
    final_distance = distances[-1] if distances else 0
    initial_distance = distances[0] if distances else 0
    progress = initial_distance - final_distance
    
    print(f"\nEpisode Statistics:")
    print(f"  Steps completed: {len(distances)}/{max_steps}")
    print(f"  Total reward: {total_reward:.2f}")
    print(f"  Initial distance: {initial_distance:.1f} m")
    print(f"  Final distance: {final_distance:.1f} m")
    print(f"  Progress: {progress:.1f} m ({progress/initial_distance*100:.1f}%)")
    
    print(f"\nSlope Violations (>20%):")
    print(f"  Count: {slope_violations}/{len(distances)}")
    print(f"  Percentage: {slope_violations/len(distances)*100:.1f}%")
    
    if slope_penalties:
        print(f"  Total penalty: {sum(slope_penalties):.1f}")
        print(f"  Mean penalty: {np.mean(slope_penalties):.1f}")
        print(f"  Max penalty: {min(slope_penalties):.1f}")
    
    print(f"\nTermination Status:")
    if terminated_early:
        print(f"  ❌ Terminated early at step {len(distances)}")
        print(f"  Reason: {termination_reason}")
        success = False
    else:
        print(f"  ✅ Completed full episode ({max_steps} steps)")
        success = True
    
    # Goal reached check
    if final_distance < 200:
        print(f"\n✅ GOAL REACHED! (within 200m)")
        success = True
    elif progress > initial_distance * 0.8:
        print(f"\n✅ SIGNIFICANT PROGRESS (>80%)")
    elif progress > 0:
        print(f"\n⚠️  Some progress made ({progress/initial_distance*100:.1f}%)")
    else:
        print(f"\n❌ No progress toward goal")
    
    # Save results
    results = {
        'steps_completed': len(distances),
        'max_steps': max_steps,
        'total_reward': float(total_reward),
        'initial_distance': float(initial_distance),
        'final_distance': float(final_distance),
        'progress_meters': float(progress),
        'progress_percent': float(progress/initial_distance*100) if initial_distance > 0 else 0,
        'slope_violations': int(slope_violations),
        'slope_violation_rate': float(slope_violations/len(distances)) if distances else 0,
        'terminated_early': bool(terminated_early),
        'termination_reason': str(termination_reason),
        'goal_reached': bool(final_distance < 200),
        'success': bool(success)
    }
    
    with open('test_random_walk_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n✅ Saved results: test_random_walk_results.json")
    
    # Verdict
    print("\n" + "=" * 80)
    print("VERDICT")
    print("=" * 80)
    
    if success and not terminated_early:
        print("✅ PASS: Random policy completes episode without premature termination")
        print("   Environment is stable for training")
        return 0
    elif success and terminated_early:
        print("⚠️  MARGINAL: Goal reached but with early termination")
        print("   Review termination logic")
        return 0
    else:
        print("❌ FAIL: Unable to complete episode or reach goal")
        print("   Environment needs adjustment before training")
        return 1
    
    env.close()

if __name__ == "__main__":
    sys.exit(main())

