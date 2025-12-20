#!/usr/bin/env python3
"""
Quick test to validate environment instantiation before training run.
"""

import sys
import numpy as np
from pathlib import Path

# Add AGRS python directory to path
sys.path.insert(0, '/opt/agrs/python/pirl_training')

print("=" * 80)
print("PIRL Environment Instantiation Test")
print("=" * 80)

# Test 1: Import native environment
print("\n[1/5] Testing native environment import...")
try:
    from pirl_native_env import PIRLNativeEnvironment
    print("✅ Native environment imported successfully")
except Exception as e:
    print(f"❌ Failed to import native environment: {e}")
    sys.exit(1)

# Test 2: Instantiate environment
print("\n[2/5] Testing environment instantiation...")
config_path = '/opt/agrs/Projects/test_project2/PIRL/pirl_training_config_100k.yaml'
try:
    env = PIRLNativeEnvironment(config_path)
    print(f"✅ Environment instantiated successfully")
except Exception as e:
    print(f"❌ Failed to instantiate environment: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 3: Reset environment
print("\n[3/5] Testing environment reset...")
try:
    obs, info = env.reset()
    print(f"✅ Environment reset successfully")
    print(f"   State shape: {obs.shape}")
    print(f"   Expected shape: (21,)")
    assert obs.shape == (21,), f"Unexpected state shape: {obs.shape}"
    print(f"   Goal distance: {info['goal_distance']:.1f}m")
    assert info['goal_distance'] > 50000, f"Goal unexpectedly close: {info['goal_distance']}"
    print("✅ State space validation passed")
except Exception as e:
    print(f"❌ Environment reset failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 4: Execute a step
print("\n[4/5] Testing step execution...")
try:
    # Straight ahead, 50m
    action = np.array([0.0, 50.0], dtype=np.float32)
    obs, reward, terminated, truncated, info = env.step(action)
    print(f"✅ Step executed successfully")
    print(f"   New state shape: {obs.shape}")
    print(f"   Reward: {reward:.2f}")
    print(f"   Terminated: {terminated}")
    print(f"   Truncated: {truncated}")
    assert obs.shape == (21,), f"Unexpected state shape after step: {obs.shape}"
    assert -10000 <= reward <= 10000, f"Reward {reward} outside expected range"
    assert not terminated, "Episode should not terminate on first step"
    print("✅ Step execution validation passed")
except Exception as e:
    print(f"❌ Step execution failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 5: Execute multiple steps
print("\n[5/5] Testing multiple steps...")
try:
    for i in range(5):
        action = np.array([np.random.uniform(-0.1, 0.1), 50.0], dtype=np.float32)
        obs, reward, terminated, truncated, info = env.step(action)
        if terminated or truncated:
            print(f"   Episode terminated at step {i+2}: {info.get('termination_reason', 'unknown')}")
            break
    else:
        print(f"✅ Multiple steps executed successfully (6 total steps)")
except Exception as e:
    print(f"❌ Multiple steps failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 80)
print("✅ ALL VALIDATION TESTS PASSED")
print("=" * 80)
print("\nEnvironment is ready for training!")

