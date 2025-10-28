#!/usr/bin/env python3
"""
Direct PIRL Training Script for test_project

This script trains a PPO model directly on the Italy test project using
the C++ PIRL environment through the ZEUS CLI interface.
"""

import os
import sys
import yaml
import gymnasium as gym
import numpy as np
from pathlib import Path
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv, VecNormalize
from stable_baselines3.common.callbacks import EvalCallback, CheckpointCallback
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.logger import configure
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add PIRL training directory to path
sys.path.append('/opt/agrs/python/pirl_training')
from pirl_env import PIRLEnvironment
from validate_training_data import validate as validate_training_data

def main():
    """Main training function."""
    
    # Configuration
    config_path = "/opt/agrs/Projects/test_project/pirl_training_config.yaml"
    
    logger.info("=" * 80)
    logger.info("PIRL REINFORCEMENT LEARNING TRAINING")
    logger.info("=" * 80)
    logger.info(f"Configuration: {config_path}")
    
    # Load configuration
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # Extract training parameters
    total_timesteps = config.get('total_timesteps', 500000)
    num_envs = config.get('num_envs', 8)
    eval_freq = config.get('eval_freq', 10000)
    save_freq = config.get('save_freq', 50000)
    learning_rate = config.get('learning_rate', 0.0003)
    batch_size = config.get('batch_size', 256)
    n_steps = config.get('n_steps', 2048)
    gamma = config.get('gamma', 0.99)
    gae_lambda = config.get('gae_lambda', 0.95)
    clip_range = config.get('clip_range', 0.2)
    ent_coef = config.get('ent_coef', 0.01)
    vf_coef = config.get('vf_coef', 0.5)
    max_grad_norm = config.get('max_grad_norm', 0.5)
    
    # Paths
    output_dir = Path(config.get('output_dir', './outputs/pirl_training'))
    tensorboard_log = Path(config.get('tensorboard_log', output_dir / 'tensorboard'))
    model_save_path = Path(config.get('model_save_path', './models/pirl_italy_v1'))
    
    # Create directories
    output_dir.mkdir(parents=True, exist_ok=True)
    tensorboard_log.mkdir(parents=True, exist_ok=True)
    model_save_path.parent.mkdir(parents=True, exist_ok=True)
    
    logger.info("")
    logger.info("Training Configuration:")
    logger.info(f"  Total timesteps: {total_timesteps}")
    logger.info(f"  Parallel environments: {num_envs}")
    logger.info(f"  Learning rate: {learning_rate}")
    logger.info(f"  Batch size: {batch_size}")
    logger.info(f"  Rollout steps: {n_steps}")
    logger.info(f"  Gamma: {gamma}")
    logger.info(f"  Output directory: {output_dir}")
    logger.info(f"  Model save path: {model_save_path}")
    logger.info("")
    
    # Pre-training data validation (fail-fast)
    logger.info("Running pre-training data validation...")
    report = validate_training_data(config_path)
    validation_dir = Path(config.get('output_dir', './outputs/pirl_training'))
    validation_dir.mkdir(parents=True, exist_ok=True)
    with open(validation_dir / 'data_validation_report.json', 'w') as vf:
        import json
        json.dump(report, vf, indent=2)
    if report.get('status') != 'ok':
        logger.error("Pre-training validation failed. See data_validation_report.json.")
        sys.exit(1)
    logger.info("✅ Data validation passed.")

    # Create environment
    logger.info("Creating PIRL environment...")
    
    def make_env():
        """Create a single PIRL environment wrapped with Monitor."""
        def _init():
            env = PIRLEnvironment(config_path)
            # Wrap with Monitor for episode statistics
            env = Monitor(env)
            return env
        return _init
    
    # Create vectorized environment
    if num_envs == 1:
        env = DummyVecEnv([make_env()])
    else:
        # Use subprocess for parallel training
        env = SubprocVecEnv([make_env() for _ in range(num_envs)])
    
    # Wrap with VecNormalize for observation and reward normalization
    env = VecNormalize(
        env,
        norm_obs=True,  # Normalize observations
        norm_reward=True,  # Normalize rewards
        clip_obs=10.0,  # Clip normalized observations
        clip_reward=10.0,  # Clip normalized rewards
        gamma=gamma,  # Discount factor for reward normalization
    )
    
    logger.info(f"✅ Created {num_envs} parallel environments with normalization")
    logger.info("")
    
    # Create PPO model
    logger.info("Initializing PPO model...")
    model = PPO(
        "MlpPolicy",
        env,
        learning_rate=learning_rate,
        n_steps=n_steps,
        batch_size=batch_size,
        gamma=gamma,
        gae_lambda=gae_lambda,
        clip_range=clip_range,
        ent_coef=ent_coef,
        vf_coef=vf_coef,
        max_grad_norm=max_grad_norm,
        verbose=1,
        tensorboard_log=str(tensorboard_log),
        device='cpu'  # Use CPU for compatibility
    )
    
    logger.info("✅ PPO model initialized")
    logger.info("")
    
    # Set up callbacks
    checkpoint_callback = CheckpointCallback(
        save_freq=save_freq // num_envs,  # Adjust for parallel envs
        save_path=str(model_save_path.parent / 'checkpoints'),
        name_prefix='pirl_model',
        save_replay_buffer=False,
        save_vecnormalize=False
    )
    
    # Evaluation callback
    eval_env = DummyVecEnv([make_env()])
    # Wrap eval env with same normalization (but don't update stats)
    eval_env = VecNormalize(eval_env, training=False, norm_obs=True, norm_reward=False)
    
    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=str(model_save_path.parent / 'best_model'),
        log_path=str(output_dir / 'eval_logs'),
        eval_freq=eval_freq // num_envs,
        n_eval_episodes=5,
        deterministic=True,
        render=False
    )
    
    logger.info("=" * 80)
    logger.info("STARTING TRAINING")
    logger.info("=" * 80)
    logger.info(f"This will train for {total_timesteps} timesteps")
    logger.info(f"Estimated time: 2-6 hours (depending on CPU)")
    logger.info("")
    logger.info("Monitor training progress:")
    logger.info(f"  Tensorboard: tensorboard --logdir {tensorboard_log}")
    logger.info("=" * 80)
    logger.info("")
    
    try:
        # Train the model
        model.learn(
            total_timesteps=total_timesteps,
            callback=[checkpoint_callback, eval_callback],
            progress_bar=True
        )
        
        logger.info("")
        logger.info("=" * 80)
        logger.info("TRAINING COMPLETE")
        logger.info("=" * 80)
        
        # Save final model
        final_model_path = str(model_save_path) + "_final.zip"
        model.save(final_model_path)
        logger.info(f"✅ Final model saved to: {final_model_path}")
        
        # Save VecNormalize statistics
        vec_normalize_path = str(model_save_path) + "_vecnormalize.pkl"
        env.save(vec_normalize_path)
        logger.info(f"✅ VecNormalize stats saved to: {vec_normalize_path}")
        
        # Close environments
        env.close()
        eval_env.close()
        
        logger.info("")
        logger.info("Next steps:")
        logger.info("  1. Test the model: zeus tools pirl_generate_route --config pirl_training_config.yaml --model <model_path>")
        logger.info("  2. Generate route: python generate_route_with_model.py")
        logger.info("")
        logger.info("✅ Training session completed successfully!")
        
    except KeyboardInterrupt:
        logger.warning("")
        logger.warning("Training interrupted by user")
        logger.warning("Saving current model...")
        interrupted_model_path = str(model_save_path) + "_interrupted.zip"
        model.save(interrupted_model_path)
        logger.info(f"Model saved to: {interrupted_model_path}")
        env.close()
        eval_env.close()
        sys.exit(1)
    
    except Exception as e:
        logger.error("")
        logger.error("=" * 80)
        logger.error("TRAINING FAILED")
        logger.error("=" * 80)
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
        env.close()
        eval_env.close()
        sys.exit(1)

if __name__ == "__main__":
    main()

