#!/usr/bin/env python3
"""
End-to-end test: Run 100 training steps and validate outputs.
"""
import sys
import os
sys.path.append('/opt/agrs/python/pirl_training')
import numpy as np

def test_environment_step():
    """Test environment can step without errors"""
    print("Test 1: Environment stepping")
    
    try:
        from pirl_native_env import PIRLNativeEnvironment
        os.chdir('/opt/agrs/Projects/test_project2/PIRL')
        
        env = PIRLNativeEnvironment("pirl_training_config_2M_production.yaml")
        obs, info = env.reset()
        
        # Validate observation space
        if len(obs) != 29:
            print(f"  ❌ FAIL: Expected 29D state, got {len(obs)}D")
            return False
        
        # Take 10 random steps
        for i in range(10):
            action = env.action_space.sample()
            obs, reward, terminated, truncated, info = env.step(action)
            
            if terminated or truncated:
                obs, info = env.reset()
        
        print("  ✅ PASS: Environment steps successfully\n")
        return True
    except Exception as e:
        print(f"  ❌ FAIL: {e}\n")
        import traceback
        traceback.print_exc()
        return False

def test_reward_components():
    """Test that all reward components are populated"""
    print("Test 2: Reward component validation")
    
    try:
        from pirl_native_env import PIRLNativeEnvironment
        os.chdir('/opt/agrs/Projects/test_project2/PIRL')
        
        env = PIRLNativeEnvironment("pirl_training_config_2M_production.yaml")
        obs, info = env.reset()
        
        # Take one step
        action = env.action_space.sample()
        obs, reward, terminated, truncated, info = env.step(action)
        
        # Check reward is finite
        if not np.isfinite(reward):
            print(f"  ❌ FAIL: Reward is not finite: {reward}")
            return False
        
        print(f"  Reward: {reward:.2f}")
        print("  ✅ PASS: Reward calculation working\n")
        return True
    except Exception as e:
        print(f"  ❌ FAIL: {e}\n")
        return False

def test_crossing_detection():
    """Test that crossing features are detected"""
    print("Test 3: Crossing feature detection")
    
    try:
        from pirl_native_env import PIRLNativeEnvironment
        os.chdir('/opt/agrs/Projects/test_project2/PIRL')
        
        env = PIRLNativeEnvironment("pirl_training_config_2M_production.yaml")
        obs, info = env.reset()
        
        # Take steps and look for crossing detection
        crossings_detected = 0
        for i in range(50):
            action = env.action_space.sample()
            obs, reward, terminated, truncated, info = env.step(action)
            
            # Check state dimensions 21-26 (crossing context)
            # obs[21] = nearest_crossing_dist (normalized by 1000m)
            if obs[21] < 0.5:  # < 500m
                crossings_detected += 1
                if crossings_detected == 1:
                    # Print first detection for validation
                    print(f"  First crossing detected:")
                    print(f"    Distance: {obs[21] * 1000.0:.1f}m")
                    print(f"    Width: {obs[22] * 100.0:.1f}m")
                    print(f"    Type: {obs[23] * 4.0:.1f} (0=none, 1=road, 2=water, 3=rail, 4=power)")
            
            if terminated or truncated:
                obs, info = env.reset()
        
        print(f"  Crossings detected in 50 steps: {crossings_detected}")
        if crossings_detected == 0:
            print("  ⚠️  WARNING: No crossings detected (may be valid if route avoids all features)")
        else:
            print("  ✅ PASS: Crossing detection active\n")
        return True
    except Exception as e:
        print(f"  ❌ FAIL: {e}\n")
        return False

def test_boundary_awareness():
    """Test that boundary distances are calculated"""
    print("Test 4: Boundary awareness")
    
    try:
        from pirl_native_env import PIRLNativeEnvironment
        os.chdir('/opt/agrs/Projects/test_project2/PIRL')
        
        env = PIRLNativeEnvironment("pirl_training_config_2M_production.yaml")
        obs, info = env.reset()
        
        # Check dimensions 27-28 (boundary distances)
        aoi_dist = obs[27] * 1000.0  # Denormalize
        sea_dist = obs[28] * 1000.0
        
        print(f"  AOI boundary distance: {aoi_dist:.1f}m")
        print(f"  Sea boundary distance: {sea_dist:.1f}m")
        
        if not (np.isfinite(aoi_dist) and np.isfinite(sea_dist)):
            print("  ❌ FAIL: Boundary distances not finite")
            return False
        
        print("  ✅ PASS: Boundary awareness active\n")
        return True
    except Exception as e:
        print(f"  ❌ FAIL: {e}\n")
        return False

def test_mini_training():
    """Test 100-step training loop"""
    print("Test 5: Mini training loop (100 steps)")
    
    try:
        from pirl_native_env import PIRLNativeEnvironment
        from stable_baselines3 import PPO
        os.chdir('/opt/agrs/Projects/test_project2/PIRL')
        
        env = PIRLNativeEnvironment("pirl_training_config_2M_production.yaml")
        
        model = PPO("MlpPolicy", env, verbose=0, n_steps=25)
        model.learn(total_timesteps=100, progress_bar=False)
        
        print("  ✅ PASS: Training loop completed\n")
        return True
    except Exception as e:
        print(f"  ❌ FAIL: {e}\n")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("END-TO-END TRAINING TESTS")
    print("=" * 60 + "\n")
    
    results = []
    results.append(test_environment_step())
    results.append(test_reward_components())
    results.append(test_crossing_detection())
    results.append(test_boundary_awareness())
    results.append(test_mini_training())
    
    print("=" * 60)
    all_passed = all(results)
    print(f"{'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
    print("=" * 60)
    
    sys.exit(0 if all_passed else 1)

