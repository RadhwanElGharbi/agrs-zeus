#!/usr/bin/env python3
"""
US_PIPELINE PIRL Training Script (Simplified 7D State Space)

Trains RL agent for slope-optimized pipeline routing using Stable-Baselines3 PPO.
"""

import argparse
import yaml
import os
import sys
import logging
from pathlib import Path
from datetime import datetime
import numpy as np

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# RL libraries
import gymnasium as gym
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import (
    EvalCallback, CheckpointCallback, CallbackList, BaseCallback
)
from stable_baselines3.common.vec_env import DummyVecEnv, VecMonitor
from stable_baselines3.common.logger import configure

# Custom environment
from pirl_native_env_us import PIRLNativeEnvironmentUS, make_env

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ProgressCallback(BaseCallback):
    """
    Custom callback for reporting training progress.
    """
    def __init__(self, check_freq: int = 1000, verbose: int = 1):
        super().__init__(verbose)
        self.check_freq = check_freq
        self.start_time = None
    
    def _on_training_start(self):
        self.start_time = datetime.now()
        logger.info("=" * 80)
        logger.info("🚀 Training started!")
        logger.info("=" * 80)
    
    def _on_step(self) -> bool:
        if self.n_calls % self.check_freq == 0:
            elapsed = datetime.now() - self.start_time
            timesteps = self.num_timesteps
            steps_per_sec = timesteps / elapsed.total_seconds() if elapsed.total_seconds() > 0 else 0
            
            logger.info(f"📊 Progress: {timesteps:,} timesteps | "
                       f"{elapsed.total_seconds()/60:.1f} min elapsed | "
                       f"{steps_per_sec:.1f} steps/sec")
        return True


def create_vec_env(config_path: str, num_envs: int = 1, log_dir: str = None):
    """
    Create vectorized environment for training.
    
    Args:
        config_path: Path to configuration YAML
        num_envs: Number of parallel environments
        log_dir: Directory for environment logs
        
    Returns:
        VecMonitor-wrapped vectorized environment
    """
    logger.info(f"Creating {num_envs} parallel environment(s)...")
    
    # Create environment factories
    env_fns = [make_env(config_path, env_id=i) for i in range(num_envs)]
    
    # Use DummyVecEnv (sequential execution, safer for C++ environments)
    vec_env = DummyVecEnv(env_fns)
    
    # Wrap with VecMonitor for episode statistics
    vec_env = VecMonitor(vec_env, filename=log_dir)
    
    logger.info(f"✅ Created {num_envs} environment(s)")
    logger.info(f"   Observation space: {vec_env.observation_space}")
    logger.info(f"   Action space: {vec_env.action_space}")
    
    return vec_env


def train_model(
    config_path: str,
    total_timesteps: int = 100000,
    num_envs: int = 1,
    learning_rate: float = 3e-4,
    batch_size: int = 256,
    n_steps: int = 2048,
    output_dir: str = "./output",
    eval_freq: int = 10000,
    save_freq: int = 50000,
    device: str = "auto"
):
    """
    Train PIRL model using PPO algorithm.
    
    Args:
        config_path: Path to environment configuration YAML
        total_timesteps: Total training timesteps
        num_envs: Number of parallel environments
        learning_rate: PPO learning rate
        batch_size: Batch size for updates
        n_steps: Steps per environment before update
        output_dir: Directory for outputs
        eval_freq: Evaluation frequency (timesteps)
        save_freq: Checkpoint save frequency (timesteps)
        device: Torch device ("auto", "cpu", "cuda")
    """
    
    # Create output directories
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    log_dir = output_path / "logs"
    log_dir.mkdir(exist_ok=True)
    
    eval_dir = output_path / "eval"
    eval_dir.mkdir(exist_ok=True)
    
    models_dir = output_path / "models"
    models_dir.mkdir(exist_ok=True)
    
    # Print training configuration
    logger.info("=" * 80)
    logger.info("US_PIPELINE PIRL Training Configuration")
    logger.info("=" * 80)
    logger.info(f"Config file:       {config_path}")
    logger.info(f"Total timesteps:   {total_timesteps:,}")
    logger.info(f"Parallel envs:     {num_envs}")
    logger.info(f"Learning rate:     {learning_rate}")
    logger.info(f"Batch size:        {batch_size}")
    logger.info(f"Steps per update:  {n_steps}")
    logger.info(f"Device:            {device}")
    logger.info(f"Output directory:  {output_dir}")
    logger.info(f"Eval frequency:    {eval_freq:,} timesteps")
    logger.info(f"Save frequency:    {save_freq:,} timesteps")
    logger.info("=" * 80)
    
    # Create training environment
    logger.info("\n🔧 Setting up training environment...")
    train_env = create_vec_env(
        config_path=config_path,
        num_envs=num_envs,
        log_dir=str(log_dir / "train")
    )
    
    # Create evaluation environment (single env)
    logger.info("\n🔧 Setting up evaluation environment...")
    eval_env = create_vec_env(
        config_path=config_path,
        num_envs=1,
        log_dir=str(log_dir / "eval")
    )
    
    # Create PPO model
    logger.info("\n🧠 Creating PPO model...")
    model = PPO(
        "MlpPolicy",
        train_env,
        learning_rate=learning_rate,
        n_steps=n_steps,
        batch_size=batch_size,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,
        vf_coef=0.5,
        max_grad_norm=0.5,
        verbose=1,
        device=device,
        tensorboard_log=str(log_dir / "tensorboard")
    )
    
    logger.info(f"✅ Model created with policy: MlpPolicy")
    logger.info(f"   Policy network architecture: Auto (MLP)")
    logger.info(f"   Device: {model.device}")
    
    # Configure logger
    model_logger = configure(str(log_dir / "training"), ["stdout", "csv", "tensorboard"])
    model.set_logger(model_logger)
    
    # Create callbacks
    callbacks = []
    
    # 1. Evaluation callback
    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=str(eval_dir),
        log_path=str(eval_dir),
        eval_freq=max(eval_freq // num_envs, 1),  # Adjust for number of envs
        n_eval_episodes=5,
        deterministic=True,
        render=False,
        verbose=1
    )
    callbacks.append(eval_callback)
    
    # 2. Checkpoint callback
    checkpoint_callback = CheckpointCallback(
        save_freq=max(save_freq // num_envs, 1),  # Adjust for number of envs
        save_path=str(models_dir),
        name_prefix="pirl_us_checkpoint",
        verbose=1
    )
    callbacks.append(checkpoint_callback)
    
    # 3. Progress callback
    progress_callback = ProgressCallback(check_freq=1000, verbose=1)
    callbacks.append(progress_callback)
    
    callback_list = CallbackList(callbacks)
    
    # Start training
    logger.info("\n" + "=" * 80)
    logger.info("🚀 STARTING TRAINING")
    logger.info("=" * 80)
    logger.info(f"Target: {total_timesteps:,} timesteps")
    logger.info(f"Monitor training: tensorboard --logdir={log_dir / 'tensorboard'}")
    logger.info("=" * 80 + "\n")
    
    try:
        model.learn(
            total_timesteps=total_timesteps,
            callback=callback_list,
            log_interval=10,
            progress_bar=True
        )
        
        logger.info("\n" + "=" * 80)
        logger.info("✅ TRAINING COMPLETE!")
        logger.info("=" * 80)
        
        # Save final model
        final_model_path = output_path / "pirl_us_final.zip"
        model.save(str(final_model_path))
        logger.info(f"📦 Final model saved: {final_model_path}")
        logger.info(f"📦 Best model saved: {eval_dir / 'best_model.zip'}")
        logger.info(f"📊 Logs saved: {log_dir}")
        logger.info(f"📊 TensorBoard: tensorboard --logdir={log_dir / 'tensorboard'}")
        logger.info("=" * 80)
        
        return model
        
    except KeyboardInterrupt:
        logger.warning("\n⚠️  Training interrupted by user!")
        logger.info("Saving interrupted model...")
        interrupted_path = output_path / "pirl_us_interrupted.zip"
        model.save(str(interrupted_path))
        logger.info(f"📦 Interrupted model saved: {interrupted_path}")
        raise
    
    except Exception as e:
        logger.error(f"\n❌ Training failed with error: {e}")
        raise
    
    finally:
        # Cleanup
        train_env.close()
        eval_env.close()


def main():
    """Main training entry point."""
    parser = argparse.ArgumentParser(
        description="Train US_PIPELINE PIRL model (7D state space, slope optimization)"
    )
    
    parser.add_argument(
        "--config",
        type=str,
        required=True,
        help="Path to training configuration YAML"
    )
    
    parser.add_argument(
        "--timesteps",
        type=int,
        default=100000,
        help="Total training timesteps (default: 100000)"
    )
    
    parser.add_argument(
        "--num-envs",
        type=int,
        default=1,
        help="Number of parallel environments (default: 1)"
    )
    
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=3e-4,
        help="Learning rate (default: 3e-4)"
    )
    
    parser.add_argument(
        "--batch-size",
        type=int,
        default=256,
        help="Batch size (default: 256)"
    )
    
    parser.add_argument(
        "--n-steps",
        type=int,
        default=2048,
        help="Steps per environment before update (default: 2048)"
    )
    
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./output",
        help="Output directory (default: ./output)"
    )
    
    parser.add_argument(
        "--eval-freq",
        type=int,
        default=10000,
        help="Evaluation frequency in timesteps (default: 10000)"
    )
    
    parser.add_argument(
        "--save-freq",
        type=int,
        default=50000,
        help="Model checkpoint frequency in timesteps (default: 50000)"
    )
    
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cpu", "cuda"],
        help="Training device (default: auto)"
    )
    
    args = parser.parse_args()
    
    # Verify config exists
    if not Path(args.config).exists():
        logger.error(f"Configuration file not found: {args.config}")
        sys.exit(1)
    
    # Train model
    train_model(
        config_path=args.config,
        total_timesteps=args.timesteps,
        num_envs=args.num_envs,
        learning_rate=args.learning_rate,
        batch_size=args.batch_size,
        n_steps=args.n_steps,
        output_dir=args.output_dir,
        eval_freq=args.eval_freq,
        save_freq=args.save_freq,
        device=args.device
    )


if __name__ == "__main__":
    main()

