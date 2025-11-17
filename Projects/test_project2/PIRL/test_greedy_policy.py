#!/usr/bin/env python3
"""
PIRL Diagnostic: Greedy Policy Test
Tests environment with simple greedy goal-directed policy.
Provides baseline performance for RL training.
"""

import sys
sys.path.insert(0, '/opt/agrs/python/pirl_training')

import numpy as np
from pirl_native_env import PIRLNativeEnvironment
import json

def greedy_policy(obs, env, look_ahead_angles=5):
    """
    Greedy policy: pick action that moves closest to goal while avoiding high slopes.
    
    Args:
        obs: Current observation (state vector)
        env: Environment instance
        look_ahead_angles: Number of heading options to evaluate
    
    Returns:
        action: [heading_change, step_size]
    """
    goal_bearing = obs[3]
    current_heading = obs[20]  # prev_heading
    
    # Generate candidate heading changes
    candidates = np.linspace(-np.pi/6, np.pi/6, look_ahead_angles)  # ±30° range
    
    best_heading = 0.0
    best_score = -1e9
    
    for heading_change in candidates:
        # Simple heuristic score:
        # - Prefer heading toward goal
        # - Penalize sharp turns
        
        new_heading = current_heading + heading_change
        bearing_error = abs(new_heading - goal_bearing)
        if bearing_error > np.pi:
            bearing_error = 2*np.pi - bearing_error
        
        # Score: negative bearing error, penalty for turning
        score = -bearing_error - 0.5 * abs(heading_change)
        
        if score > best_score:
            best_score = score
            best_heading = heading_change
    
    # Use moderate step size
    step_size = 50.0
    
    return np.array([best_heading, step_size], dtype=np.float32)

def main():
    print("=" * 80)
    print("PIRL DIAGNOSTIC: GREEDY POLICY TEST")
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
    
    # Statistics
    total_reward = 0.0
    slope_violations = 0
    distances = []
    slopes = []
    rewards = []
    terminated_early = False
    termination_reason = ""
    
    print("\n" + "=" * 80)
    print("EXECUTING GREEDY POLICY")
    print("=" * 80)
    print("\nPolicy: Always move toward goal, prefer low slopes")
    
    for step in range(max_steps):
        # Greedy action
        action = greedy_policy(obs, env)
        
        # Execute
        obs, reward, terminated, truncated, info = env.step(action)
        
        total_reward += reward
        rewards.append(reward)
        
        # Track
        slope = obs[5]
        slopes.append(slope)
        if slope > 20.0:
            slope_violations += 1
        
        distances.append(obs[2])
        
        # Progress
        if (step + 1) % 200 == 0:
            print(f"Step {step + 1}/{max_steps}: distance={obs[2]:.1f}m, slope={slope:.1f}%, reward={reward:.1f}")
        
        if terminated or truncated:
            terminated_early = True
            termination_reason = info.get('termination_reason', 'Unknown')
            print(f"\n⚠️  Episode terminated at step {step + 1}")
            print(f"   Reason: {termination_reason}")
            break
        
        # Early success check
        if obs[2] < 200:  # Within 200m of goal
            print(f"\n🎯 GOAL REACHED at step {step + 1}!")
            break
    
    # Results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    
    final_distance = distances[-1] if distances else 0
    initial_distance = distances[0] if distances else 0
    progress = initial_distance - final_distance
    
    print(f"\nEpisode Statistics:")
    print(f"  Steps: {len(distances)}/{max_steps}")
    print(f"  Total reward: {total_reward:.2f}")
    print(f"  Mean reward per step: {np.mean(rewards):.2f}")
    print(f"  Initial distance: {initial_distance:.1f} m")
    print(f"  Final distance: {final_distance:.1f} m")
    print(f"  Progress: {progress:.1f} m ({progress/initial_distance*100:.1f}%)")
    print(f"  Efficiency: {progress/len(distances):.2f} m/step")
    
    print(f"\nSlope Statistics:")
    print(f"  Mean: {np.mean(slopes):.2f}%")
    print(f"  Max: {np.max(slopes):.2f}%")
    print(f"  Violations (>20%): {slope_violations}/{len(distances)} ({slope_violations/len(distances)*100:.1f}%)")
    
    # Success criteria
    goal_reached = final_distance < 200
    reasonable_steps = len(distances) < 2000
    positive_progress = progress > initial_distance * 0.5
    
    success = goal_reached or (reasonable_steps and positive_progress)
    
    print(f"\nSuccess Criteria:")
    print(f"  ✅ Goal reached (<200m): {goal_reached}")
    print(f"  {'✅' if reasonable_steps else '❌'} Reasonable steps (<2000): {reasonable_steps} ({len(distances)} steps)")
    print(f"  {'✅' if positive_progress else '❌'} Positive progress (>50%): {positive_progress}")
    
    if terminated_early and 'slope' not in termination_reason.lower():
        print(f"  ⚠️  Non-slope termination: {termination_reason}")
    
    # Save results
    results = {
        'steps': len(distances),
        'max_steps': max_steps,
        'total_reward': float(total_reward),
        'mean_reward': float(np.mean(rewards)),
        'initial_distance': float(initial_distance),
        'final_distance': float(final_distance),
        'progress_meters': float(progress),
        'progress_percent': float(progress/initial_distance*100) if initial_distance > 0 else 0,
        'efficiency_m_per_step': float(progress/len(distances)) if distances else 0,
        'slope_violations': int(slope_violations),
        'slope_violation_rate': float(slope_violations/len(distances)) if distances else 0,
        'mean_slope': float(np.mean(slopes)),
        'max_slope': float(np.max(slopes)),
        'goal_reached': bool(goal_reached),
        'reasonable_steps': bool(reasonable_steps),
        'positive_progress': bool(positive_progress),
        'success': bool(success),
        'terminated_early': bool(terminated_early),
        'termination_reason': str(termination_reason)
    }
    
    with open('test_greedy_policy_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n✅ Saved results: test_greedy_policy_results.json")
    
    # Verdict
    print("\n" + "=" * 80)
    print("VERDICT")
    print("=" * 80)
    
    if goal_reached:
        print(f"✅ EXCELLENT: Greedy policy reached goal in {len(distances)} steps")
        print("   RL training should achieve similar or better performance")
        return 0
    elif success:
        print(f"✅ GOOD: Greedy policy made {progress/initial_distance*100:.1f}% progress")
        print("   Environment is suitable for RL training")
        return 0
    elif terminated_early:
        print(f"❌ FAIL: Early termination prevented goal")
        print(f"   Reason: {termination_reason}")
        print("   Fix termination logic before training")
        return 1
    else:
        print(f"❌ FAIL: Greedy policy could not reach goal")
        print("   Environment may be too constrained")
        return 1
    
    env.close()

if __name__ == "__main__":
    sys.exit(main())

