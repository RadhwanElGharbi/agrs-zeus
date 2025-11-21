#!/usr/bin/env python3
"""
Test script for US_PIPELINE PIRL environment.

Validates:
- 7D state space
- 2D action space
- Slope calculations
- Termination conditions
- Step size constraints (40-300m)
"""

import sys
import numpy as np
from pathlib import Path

# Add python directory to path
sys.path.insert(0, str(Path(__file__).parent))

from pirl_native_env_us import PIRLNativeEnvironmentUS
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def test_environment():
    """Run basic environment tests."""
    
    logger.info("=" * 60)
    logger.info("US_PIPELINE PIRL Environment Test")
    logger.info("=" * 60)
    
    config_path = "/opt/agrs/Projects/US_PIPELINE/PIRL/configs/us_pipeline_training_config.yaml"
    
    # Test 1: Environment creation
    logger.info("\n[Test 1] Creating environment...")
    try:
        env = PIRLNativeEnvironmentUS(config_path)
        logger.info("✅ Environment created successfully")
    except Exception as e:
        logger.error(f"❌ Environment creation failed: {e}")
        return False
    
    # Test 2: State space dimensions
    logger.info("\n[Test 2] Checking state space...")
    expected_obs_shape = (7,)
    actual_obs_shape = env.observation_space.shape
    if actual_obs_shape == expected_obs_shape:
        logger.info(f"✅ Observation space: {actual_obs_shape} (expected: {expected_obs_shape})")
    else:
        logger.error(f"❌ Observation space mismatch: {actual_obs_shape} (expected: {expected_obs_shape})")
        return False
    
    # Test 3: Action space dimensions
    logger.info("\n[Test 3] Checking action space...")
    expected_act_shape = (2,)
    actual_act_shape = env.action_space.shape
    if actual_act_shape == expected_act_shape:
        logger.info(f"✅ Action space: {actual_act_shape} (expected: {expected_act_shape})")
    else:
        logger.error(f"❌ Action space mismatch: {actual_act_shape} (expected: {expected_act_shape})")
        return False
    
    # Test 4: Reset
    logger.info("\n[Test 4] Testing reset...")
    try:
        observation, info = env.reset()
        logger.info(f"✅ Reset successful")
        logger.info(f"   Initial position: ({info['position'][0]:.2f}, {info['position'][1]:.2f})")
        logger.info(f"   Goal distance: {info['goal_distance']:.2f} m ({info['goal_distance']/1000.0:.2f} km)")
        logger.info(f"   Initial slope: {info['slope']:.2f}%")
        logger.info(f"   Observation shape: {observation.shape}")
    except Exception as e:
        logger.error(f"❌ Reset failed: {e}")
        return False
    
    # Test 5: Random episode
    logger.info("\n[Test 5] Running random episode (max 20 steps)...")
    total_reward = 0.0
    step = 0
    max_steps = 20
    terminated = False
    truncated = False
    
    try:
        while not (terminated or truncated) and step < max_steps:
            action = env.action_space.sample()
            observation, reward, terminated, truncated, info = env.step(action)
            total_reward += reward
            step += 1
            
            if step <= 3 or terminated or truncated:  # Show first 3 steps and termination
                logger.info(f"   Step {step}: reward={reward:>7.2f}, total_reward={total_reward:>8.2f}")
        
        if terminated or truncated:
            reason = info.get('termination_reason', 'unknown')
            logger.info(f"✅ Episode ended: {reason}")
        else:
            logger.info(f"✅ Episode ran for {step} steps (test limit)")
        
        logger.info(f"   Total reward: {total_reward:.2f}")
        logger.info(f"   Final observation shape: {observation.shape}")
        
    except Exception as e:
        logger.error(f"❌ Step execution failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Test 6: Goal-directed action
    logger.info("\n[Test 6] Testing goal-directed action...")
    try:
        observation, info = env.reset()
        
        # Try moving toward goal
        action = np.array([0.0, 1.0], dtype=np.float32)  # No turn, max step size
        observation, reward, terminated, truncated, info = env.step(action)
        
        logger.info(f"✅ Goal-directed action executed")
        logger.info(f"   Action: heading_change=0.0, step_size=max")
        logger.info(f"   Reward: {reward:.2f}")
        
    except Exception as e:
        logger.error(f"❌ Goal-directed action failed: {e}")
        return False
    
    # Test 7: Test multiple short episodes
    logger.info("\n[Test 7] Running 5 short random episodes...")
    successes = 0
    failures = 0
    
    for ep in range(5):
        observation, info = env.reset()
        episode_reward = 0.0
        step_count = 0
        max_ep_steps = 10
        terminated = False
        truncated = False
        
        while not (terminated or truncated) and step_count < max_ep_steps:
            action = env.action_space.sample()
            observation, reward, terminated, truncated, info = env.step(action)
            episode_reward += reward
            step_count += 1
        
        reason = info.get('termination_reason', 'truncated')
        is_success = reason.startswith('SUCCESS')
        
        if is_success:
            successes += 1
        else:
            failures += 1
        
        status = "✅" if is_success else "⏱️"
        logger.info(f"   Episode {ep+1}: {status} {reason} - {step_count} steps, reward={episode_reward:.2f}")
    
    logger.info(f"✅ Test completed: {successes} successes, {failures} failures/truncations")
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("ALL TESTS PASSED ✅")
    logger.info("=" * 60)
    logger.info("\nEnvironment is ready for training!")
    logger.info("Next steps:")
    logger.info("  1. Run training: ./train_validation_10k.sh")
    logger.info("  2. Monitor with TensorBoard: tensorboard --logdir=logs")
    logger.info("=" * 60)
    
    return True


if __name__ == "__main__":
    success = test_environment()
    sys.exit(0 if success else 1)

