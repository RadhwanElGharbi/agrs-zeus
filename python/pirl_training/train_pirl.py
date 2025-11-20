#!/usr/bin/env python3
"""
PIRL Training Script

This script trains PIRL (Physics-Informed Reinforcement Learning) models
for pipeline routing using Stable-Baselines3 algorithms.
"""

import argparse
import yaml
import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional
import numpy as np

# RL libraries
import gymnasium as gym
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import EvalCallback, StopTrainingOnRewardThreshold, BaseCallback
from stable_baselines3.common.vec_env import VecMonitor, SubprocVecEnv, DummyVecEnv, VecNormalize
from stable_baselines3.common.logger import configure

# Custom environment
from pirl_native_env import PIRLNativeEnvironment, make_env as make_pirl_env

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PIRLTrainingConfig:
    """Configuration class for PIRL training."""

    def __init__(self, config_path: str):
        """Load training configuration from YAML file."""
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)

        # Training parameters
        self.algorithm = self.config.get('algorithm', 'PPO')
        self.total_timesteps = self.config.get('total_timesteps', 1000000)
        self.num_envs = self.config.get('num_envs', 8)
        self.eval_freq = self.config.get('eval_freq', 10000)
        self.save_freq = self.config.get('save_freq', 50000)

        # Algorithm-specific parameters
        self.algorithm_params = self.config.get('algorithm_params', {})

        # Environment parameters
        self.env_configs = self.config.get('env_configs', [])

        # Output paths
        self.output_dir = Path(self.config.get('output_dir', './pirl_training_output'))
        self.model_save_path = self.output_dir / self.config.get('model_name', 'pirl_model')
        self.log_dir = self.output_dir / 'logs'
        self.eval_dir = self.output_dir / 'eval'

        # Create output directories
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.eval_dir.mkdir(parents=True, exist_ok=True)

        logger.info(f"Training configuration loaded from: {config_path}")
        logger.info(f"Algorithm: {self.algorithm}")
        logger.info(f"Total timesteps: {self.total_timesteps}")
        logger.info(f"Number of environments: {self.num_envs}")


def create_training_env(config_path: str, env_id: int = 0) -> PIRLNativeEnvironment:
    """Create a single training environment."""
    return PIRLNativeEnvironment(config_path, env_id=env_id)


def create_vec_env(config: PIRLTrainingConfig, use_subproc: bool = False) -> VecMonitor:
    """Create vectorized training environment.

    Args:
        config: Training configuration
        use_subproc: Use SubprocVecEnv for parallel execution (default: False - uses DummyVecEnv)

    Returns:
        Vectorized and monitored environment
    """
    # Create environment functions (one per environment)
    # Important: Use a factory function to avoid lambda closure issues
    def make_env_fn(config_path, env_id):
        def _init():
            return create_training_env(config_path, env_id=env_id)
        return _init

    env_fns = [make_env_fn(config.env_configs[0], i) for i in range(config.num_envs)]

    # Choose vectorization strategy
    if use_subproc and config.num_envs > 1:
        logger.info(f"Using SubprocVecEnv for parallel execution ({config.num_envs} processes)")
        vec_env = SubprocVecEnv(env_fns, start_method='spawn')  # 'spawn' is safer for C++ bindings
    else:
        logger.info(f"Using DummyVecEnv for serial execution")
        vec_env = DummyVecEnv(env_fns)

    # Wrap with monitor for logging
    vec_env = VecMonitor(vec_env, str(config.log_dir / 'vec_env_monitor'))
    # Re-enable VecNormalize with conservative settings for stability
    # Depth check allows long episodes with large cumulative rewards -> need normalization
    logger.info("Wrapping with VecNormalize (conservative clipping for stability)")
    vec_env = VecNormalize(
        vec_env,
        norm_obs=False,        # Don't normalize observations (already scaled in C++)
        norm_reward=True,      # Normalize rewards (needed for long episodes)
        clip_reward=3.0,       # Conservative clipping (was 10.0, now 5.0)
        gamma=0.99,            # Discount factor
        epsilon=1e-8,          # Numerical stability
        training=True,         # Enable training mode
        norm_obs_keys=None     # Don't normalize observation dict keys
    )

    return vec_env


def create_eval_env(config: PIRLTrainingConfig) -> PIRLNativeEnvironment:
    """Create evaluation environment."""
    # Use first config for evaluation (could be extended for multiple eval configs)
    eval_config = config.env_configs[0] if config.env_configs else None
    if not eval_config:
        raise ValueError("No evaluation environment config provided")

    return create_training_env(eval_config)


def create_model(config: PIRLTrainingConfig, env, device='auto', policy_type='MlpPolicy') -> Any:
    """Create RL model with device and policy selection.

    Args:
        config: Training configuration
        env: Vectorized environment
        device: Device to use ('auto', 'cpu', 'cuda')
        policy_type: Policy architecture ('MlpPolicy' or 'CnnPolicy')

    Returns:
        Trained model instance
    """
    import torch

    # Device selection
    if device == 'auto':
        device = 'cuda' if torch.cuda.is_available() else 'cpu'

    logger.info(f"Using device: {device}")
    logger.info(f"Using policy: {policy_type}")

    if device == 'cuda' and torch.cuda.is_available():
        logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"CUDA version: {torch.version.cuda}")

    model_class = PPO if config.algorithm.upper() == 'PPO' else SAC

    # Common parameters
    common_params = {
        'learning_rate': 3e-4,
        'gamma': 0.99,
        'verbose': 1,
        'tensorboard_log': str(config.log_dir),
        'device': device
    }

    # PPO-specific parameters
    ppo_params = {
        'n_steps': 2048,
        'batch_size': 256,
        'n_epochs': 10,
        'gae_lambda': 0.95,
        'clip_range': 0.2,
        'ent_coef': 0.01,
        'vf_coef': 0.5,
        'max_grad_norm': 0.5
    }

    # SAC-specific parameters
    sac_params = {
        'buffer_size': 100000,
        'learning_starts': 10000,
        'batch_size': 256,
        'tau': 0.005,
        'train_freq': 4,
        'gradient_steps': 1,
        'target_update_interval': 1,
        'ent_coef': 'auto'
    }

    # Create model
    if config.algorithm.upper() == 'PPO':
        model_params = {**common_params, **ppo_params, **config.algorithm_params}
        model = PPO(
            policy_type,
            env,
            **model_params
        )
    else:  # SAC
        model_params = {**common_params, **sac_params, **config.algorithm_params}
        model = SAC(
            policy_type,
            env,
            **model_params
        )

    logger.info(f"Created {config.algorithm} model with {policy_type} on {device}")
    logger.info(f"Model parameters: {model_params}")
    return model




class ProgressCallback(BaseCallback):
    """
    Custom callback to display training progress.

    Shows:
    - Episode count
    - Timestep progress
    - Episodes per second
    - Estimated time remaining
    """

    def __init__(self, total_timesteps: int, verbose: int = 0):
        super().__init__(verbose)
        self.total_timesteps = total_timesteps
        self.start_time = None
        self.episode_count = 0
        self.last_log_time = None
        self.last_log_episodes = 0
        self.last_timesteps = 0

    def _on_training_start(self) -> None:
        import time
        self.start_time = time.time()
        self.last_log_time = self.start_time
        logger.info("="*70)
        logger.info(f"Training Progress Monitor Started")
        logger.info(f"Total timesteps target: {self.total_timesteps:,}")
        logger.info("="*70)

    def _on_rollout_end(self) -> None:
        import time
        # Update episode count from info buffer
        if hasattr(self.training_env, 'buf_infos'):
            # Count episodes that finished in this rollout
            for info in self.training_env.buf_infos:
                if 'episode' in info:
                    self.episode_count += 1

        # Log progress every rollout
        current_time = time.time()
        elapsed = current_time - self.start_time
        timesteps = self.num_timesteps
        progress_pct = (timesteps / self.total_timesteps) * 100

        # Calculate episodes per second
        episodes_since_log = self.episode_count - self.last_log_episodes
        time_since_log = current_time - self.last_log_time
        eps_per_sec = episodes_since_log / time_since_log if time_since_log > 0 else 0

        # Estimate time remaining using RECENT speed (more accurate than global average)
        # Use last rollout speed if we have enough data, otherwise use global average
        if timesteps > 0:
            if hasattr(self, 'last_timesteps') and self.last_timesteps > 0:
                # Calculate speed from last rollout (more accurate)
                recent_steps = timesteps - self.last_timesteps
                recent_time = current_time - self.last_log_time
                if recent_time > 0 and recent_steps > 0:
                    steps_per_sec = recent_steps / recent_time
                else:
                    steps_per_sec = timesteps / elapsed  # Fallback to average
            else:
                steps_per_sec = timesteps / elapsed  # First rollout, use average

            remaining_steps = self.total_timesteps - timesteps
            if steps_per_sec > 0:
                eta_seconds = remaining_steps / steps_per_sec
                eta_minutes = eta_seconds / 60
            else:
                eta_minutes = 0

            # Store for next iteration
            self.last_timesteps = timesteps
        else:
            eta_minutes = 0
            steps_per_sec = 0

        logger.info("="*70)
        rollout_num = timesteps // 2048
        logger.info(f"📊 PROGRESS: {progress_pct:.1f}% ({timesteps:,}/{self.total_timesteps:,} steps) [Rollout {rollout_num}]")
        logger.info(f"📈 Episodes: {self.episode_count:,} ({eps_per_sec:.1f} eps/sec)")
        logger.info(f"⚡ Speed: {steps_per_sec:.1f} steps/sec")
        logger.info(f"⏱️  Elapsed: {elapsed/60:.1f}m | ETA: {eta_minutes:.1f}m")
        logger.info("="*70)

        self.last_log_time = current_time
        self.last_log_episodes = self.episode_count

    def _on_step(self) -> bool:
        return True


def train_model(config: PIRLTrainingConfig, device='auto', policy_type='MlpPolicy', use_subproc=False) -> Any:
    """Train PIRL model.

    Args:
        config: Training configuration
        device: Device to use ('auto', 'cpu', 'cuda')
        policy_type: Policy architecture ('MlpPolicy' or 'CnnPolicy')
        use_subproc: Use SubprocVecEnv for parallel execution (default: False - uses DummyVecEnv)

    Returns:
        Trained model
    """
    logger.info("Starting PIRL model training...")

    # Create environments
    logger.info("Creating training environment...")
    train_env = create_vec_env(config, use_subproc=use_subproc)

    logger.info("Creating evaluation environment...")
    eval_env = create_eval_env(config)

    # Create model
    logger.info("Creating model...")
    model = create_model(config, train_env, device=device, policy_type=policy_type)

    # Set up callbacks
    callbacks = []

    # Progress callback - shows training progress
    progress_callback = ProgressCallback(
        total_timesteps=config.total_timesteps,
        verbose=1,
       # warn=False  # Disable normalization sync warning (eval env not VecNormalized)
    )
    callbacks.append(progress_callback)

    # DISABLED:     # Evaluation callback
    # DISABLED:     eval_callback = EvalCallback(
    # DISABLED:         eval_env,
    # DISABLED:         best_model_save_path=str(config.eval_dir),
    # DISABLED:         log_path=str(config.eval_dir),
    # DISABLED:         eval_freq=config.eval_freq,
    # DISABLED:         deterministic=True,
    # DISABLED:         render=False,
    # DISABLED:         verbose=1,
    # DISABLED:         warn=False  # Disable normalization sync warning (eval env not VecNormalized)
    # DISABLED:     )
    # DISABLED:     callbacks.append(eval_callback)

    # Stop training on reward threshold (optional)
    if 'reward_threshold' in config.config:
        stop_callback = StopTrainingOnRewardThreshold(
            reward_threshold=config.config['reward_threshold'],
            verbose=1,
        warn=False  # Disable normalization sync warning (eval env not VecNormalized)
        )
        callbacks.append(stop_callback)

    # Train the model
    logger.info(f"Training for {config.total_timesteps} timesteps...")
    model.learn(
        total_timesteps=config.total_timesteps,
        callback=callbacks,
        progress_bar=True
    )

    # Save final model
    final_model_path = config.model_save_path.with_suffix('.zip')
    model.save(str(final_model_path))
    logger.info(f"Final model saved to: {final_model_path}")

    # Close environments
    train_env.close()
    eval_env.close()

    return model


def evaluate_model(model_path: str, config_path: str, num_episodes: int = 10, algorithm: str = None) -> Dict[str, float]:
    """Evaluate a trained model."""
    logger.info(f"Evaluating model: {model_path}")

    # Create evaluation environment
    env = create_training_env(config_path)

    # Load model - use provided algorithm or try to detect from filename
    if algorithm:
        model_class = PPO if algorithm.upper() == 'PPO' else SAC
    else:
        model_class = PPO if 'ppo' in model_path.lower() else SAC

    logger.info(f"Loading model as {model_class.__name__}")
    model = model_class.load(model_path, env=env)

    # Run evaluation episodes
    episode_rewards = []
    episode_lengths = []
    episode_distances = []
    episode_progresses = []
    episode_successes = []
    termination_reasons = []

    for episode in range(num_episodes):
        obs, info = env.reset()
        initial_distance = info.get('goal_distance', 0.0)
        episode_reward = 0.0
        episode_length = 0
        final_info = None

        while True:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            episode_reward += reward
            episode_length += 1
            final_info = info

            if terminated or truncated:
                break

        # Extract final distance and progress metrics
        final_distance = final_info.get('distance_from_goal', initial_distance)
        total_length = final_info.get('total_length_m', 0.0)
        termination_reason = final_info.get('termination_reason', 'unknown')
        is_success = termination_reason.startswith('SUCCESS')

        progress_made = initial_distance - final_distance
        progress_pct = (progress_made / initial_distance * 100) if initial_distance > 0 else 0.0

        episode_rewards.append(episode_reward)
        episode_lengths.append(episode_length)
        episode_distances.append(final_distance)
        episode_progresses.append(progress_made)
        episode_successes.append(is_success)
        termination_reasons.append(termination_reason)

        logger.info(f"Episode {episode + 1}: Reward = {episode_reward:.2f}, Length = {episode_length}")

    env.close()

    # Calculate statistics
    num_successes = sum(episode_successes)
    success_rate = (num_successes / num_episodes * 100) if num_episodes > 0 else 0.0
    best_episode_idx = np.argmin(episode_distances)  # Episode closest to goal

    eval_stats = {
        'mean_reward': np.mean(episode_rewards),
        'std_reward': np.std(episode_rewards),
        'mean_length': np.mean(episode_lengths),
        'std_length': np.std(episode_lengths),
        'num_episodes': num_episodes,
        'num_successes': num_successes,
        'success_rate_pct': success_rate,
        'mean_final_distance_m': np.mean(episode_distances),
        'best_final_distance_m': episode_distances[best_episode_idx],
        'mean_progress_m': np.mean(episode_progresses),
        'best_progress_m': episode_progresses[best_episode_idx],
        'best_progress_pct': (episode_progresses[best_episode_idx] / 61967.1 * 100)  # Hardcoded initial distance
    }

    logger.info(f"Evaluation complete:")
    logger.info(f"  Mean reward: {eval_stats['mean_reward']:.2f} ± {eval_stats['std_reward']:.2f}")
    logger.info(f"  Mean length: {eval_stats['mean_length']:.1f} ± {eval_stats['std_length']:.1f}")
    logger.info(f"")
    logger.info(f"📊 GOAL PROGRESS SUMMARY:")
    logger.info(f"  ✅ Successes: {num_successes}/{num_episodes} ({success_rate:.1f}%)")
    logger.info(f"  🎯 Best episode got to: {eval_stats['best_final_distance_m']/1000:.2f} km from goal")
    logger.info(f"  📏 Best progress: {eval_stats['best_progress_m']/1000:.2f} km ({eval_stats['best_progress_pct']:.1f}% of journey)")
    logger.info(f"  📊 Mean progress: {eval_stats['mean_progress_m']/1000:.2f} km")
    logger.info(f"")

    return eval_stats


def main():
    """Main training function."""
    parser = argparse.ArgumentParser(description="Train PIRL model for pipeline routing")
    parser.add_argument("--config", required=True, help="Training configuration YAML file")
    parser.add_argument("--device", choices=['auto', 'cpu', 'cuda'], default='auto',
                        help="Device to use for training (default: auto)")
    parser.add_argument("--policy", choices=['MlpPolicy', 'CnnPolicy'], default='MlpPolicy',
                        help="Policy architecture (default: MlpPolicy)")
    parser.add_argument("--parallel", action="store_true", default=False,
                        help="Use SubprocVecEnv for parallel environments")
    parser.add_argument("--no-parallel", dest='parallel', action="store_false",
                        help="Use DummyVecEnv (serial execution, default)")
    parser.add_argument("--eval-only", action="store_true", help="Only evaluate existing model")
    parser.add_argument("--model-path", help="Path to model for evaluation")
    parser.add_argument("--episodes", type=int, default=10, help="Number of evaluation episodes")

    args = parser.parse_args()

    # Load configuration
    config = PIRLTrainingConfig(args.config)

    if args.eval_only:
        if not args.model_path:
            logger.error("Model path required for evaluation")
            return 1

        eval_stats = evaluate_model(args.model_path, config.env_configs[0], args.episodes, algorithm=config.algorithm)

        # Save evaluation results
        eval_results_path = config.output_dir / 'evaluation_results.yaml'
        with open(eval_results_path, 'w') as f:
            yaml.dump(eval_stats, f, default_flow_style=False)

        logger.info(f"Evaluation results saved to: {eval_results_path}")

    else:
        # Train model
        logger.info(f"Device: {args.device}")
        logger.info(f"Policy: {args.policy}")
        logger.info(f"Parallel execution: {args.parallel}")
        model = train_model(config, device=args.device, policy_type=args.policy, use_subproc=args.parallel)

        # Quick evaluation
        logger.info("Running quick evaluation...")
        eval_stats = evaluate_model(
            str(config.model_save_path.with_suffix('.zip')),
            config.env_configs[0],
            num_episodes=5,
            algorithm=config.algorithm
        )

        # Save training summary
        training_summary = {
            'algorithm': config.algorithm,
            'total_timesteps': config.total_timesteps,
            'num_envs': config.num_envs,
            'final_evaluation': eval_stats,
            'model_path': str(config.model_save_path.with_suffix('.zip'))
        }

        summary_path = config.output_dir / 'training_summary.yaml'
        with open(summary_path, 'w') as f:
            yaml.dump(training_summary, f, default_flow_style=False)

        logger.info(f"Training summary saved to: {summary_path}")

    logger.info("PIRL training/evaluation completed successfully!")
    return 0


if __name__ == "__main__":
    exit(main())


