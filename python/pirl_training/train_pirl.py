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
from stable_baselines3.common.callbacks import EvalCallback, StopTrainingOnRewardThreshold
from stable_baselines3.common.vec_env import VecMonitor
from stable_baselines3.common.logger import configure

# Custom environment
from pirl_env import PIRLEnvironment, make_pirl_env

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


def create_training_env(config_path: str) -> PIRLEnvironment:
    """Create a single training environment."""
    return make_pirl_env(config_path)


def create_vec_env(config: PIRLTrainingConfig) -> VecMonitor:
    """Create vectorized training environment."""
    # For now, use the same config for all environments
    # In the future, this could support multiple project configs
    env_fns = [lambda: create_training_env(config.env_configs[0]) 
               for _ in range(config.num_envs)]
    
    vec_env = make_vec_env(
        env_fns[0],  # Use the same environment function for all
        n_envs=config.num_envs,
        vec_env_cls=None,  # Use default DummyVecEnv
        env_kwargs=None
    )
    
    # Wrap with monitor for logging
    vec_env = VecMonitor(vec_env, config.log_dir / 'vec_env_monitor')
    
    return vec_env


def create_eval_env(config: PIRLTrainingConfig) -> PIRLEnvironment:
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
    
    # Default parameters
    default_params = {
        'learning_rate': 3e-4,
        'batch_size': 256,
        'buffer_size': 100000,
        'learning_starts': 10000,
        'train_freq': 4,
        'gradient_steps': 1,
        'target_update_interval': 1,
        'gamma': 0.99,
        'tau': 0.005,
        'ent_coef': 'auto',
        'vf_coef': 0.5,
        'max_grad_norm': 0.5,
        'verbose': 1,
        'tensorboard_log': str(config.log_dir),
        'device': device
    }
    
    # Update with custom parameters
    model_params = {**default_params, **config.algorithm_params}
    
    # Create model
    if config.algorithm.upper() == 'PPO':
        model = PPO(
            policy_type,
            env,
            **model_params
        )
    else:  # SAC
        model = SAC(
            policy_type,
            env,
            **model_params
        )
    
    logger.info(f"Created {config.algorithm} model with {policy_type} on {device}")
    logger.info(f"Model parameters: {model_params}")
    return model


def train_model(config: PIRLTrainingConfig, device='auto', policy_type='MlpPolicy') -> Any:
    """Train PIRL model.
    
    Args:
        config: Training configuration
        device: Device to use ('auto', 'cpu', 'cuda')
        policy_type: Policy architecture ('MlpPolicy' or 'CnnPolicy')
    
    Returns:
        Trained model
    """
    logger.info("Starting PIRL model training...")
    
    # Create environments
    logger.info("Creating training environment...")
    train_env = create_vec_env(config)
    
    logger.info("Creating evaluation environment...")
    eval_env = create_eval_env(config)
    
    # Create model
    logger.info("Creating model...")
    model = create_model(config, train_env, device=device, policy_type=policy_type)
    
    # Set up callbacks
    callbacks = []
    
    # Evaluation callback
    eval_callback = EvalCallback(
        eval_env,
        best_model_save_path=str(config.eval_dir),
        log_path=str(config.eval_dir),
        eval_freq=config.eval_freq,
        deterministic=True,
        render=False,
        verbose=1
    )
    callbacks.append(eval_callback)
    
    # Stop training on reward threshold (optional)
    if 'reward_threshold' in config.config:
        stop_callback = StopTrainingOnRewardThreshold(
            reward_threshold=config.config['reward_threshold'],
            verbose=1
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


def evaluate_model(model_path: str, config_path: str, num_episodes: int = 10) -> Dict[str, float]:
    """Evaluate a trained model."""
    logger.info(f"Evaluating model: {model_path}")
    
    # Create evaluation environment
    env = create_training_env(config_path)
    
    # Load model
    model_class = PPO if 'ppo' in model_path.lower() else SAC
    model = model_class.load(model_path, env=env)
    
    # Run evaluation episodes
    episode_rewards = []
    episode_lengths = []
    
    for episode in range(num_episodes):
        obs, info = env.reset()
        episode_reward = 0.0
        episode_length = 0
        
        while True:
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, terminated, truncated, info = env.step(action)
            episode_reward += reward
            episode_length += 1
            
            if terminated or truncated:
                break
        
        episode_rewards.append(episode_reward)
        episode_lengths.append(episode_length)
        
        logger.info(f"Episode {episode + 1}: Reward = {episode_reward:.2f}, Length = {episode_length}")
    
    env.close()
    
    # Calculate statistics
    eval_stats = {
        'mean_reward': np.mean(episode_rewards),
        'std_reward': np.std(episode_rewards),
        'mean_length': np.mean(episode_lengths),
        'std_length': np.std(episode_lengths),
        'num_episodes': num_episodes
    }
    
    logger.info(f"Evaluation complete:")
    logger.info(f"  Mean reward: {eval_stats['mean_reward']:.2f} ± {eval_stats['std_reward']:.2f}")
    logger.info(f"  Mean length: {eval_stats['mean_length']:.1f} ± {eval_stats['std_length']:.1f}")
    
    return eval_stats


def main():
    """Main training function."""
    parser = argparse.ArgumentParser(description="Train PIRL model for pipeline routing")
    parser.add_argument("--config", required=True, help="Training configuration YAML file")
    parser.add_argument("--device", choices=['auto', 'cpu', 'cuda'], default='auto',
                        help="Device to use for training (default: auto)")
    parser.add_argument("--policy", choices=['MlpPolicy', 'CnnPolicy'], default='MlpPolicy',
                        help="Policy architecture (default: MlpPolicy)")
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
        
        eval_stats = evaluate_model(args.model_path, config.env_configs[0], args.episodes)
        
        # Save evaluation results
        eval_results_path = config.output_dir / 'evaluation_results.yaml'
        with open(eval_results_path, 'w') as f:
            yaml.dump(eval_stats, f, default_flow_style=False)
        
        logger.info(f"Evaluation results saved to: {eval_results_path}")
        
    else:
        # Train model
        logger.info(f"Device: {args.device}")
        logger.info(f"Policy: {args.policy}")
        model = train_model(config, device=args.device, policy_type=args.policy)
        
        # Quick evaluation
        logger.info("Running quick evaluation...")
        eval_stats = evaluate_model(
            str(config.model_save_path.with_suffix('.zip')),
            config.env_configs[0],
            num_episodes=5
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


