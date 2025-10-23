#!/usr/bin/env python3
"""
PIRL Hyperparameter Optimization

This script performs hyperparameter optimization for PIRL models using Optuna.
"""

import argparse
import yaml
import logging
from pathlib import Path
from typing import Dict, Any, Optional
import numpy as np

import optuna
from optuna.samplers import TPESampler
from optuna.pruners import MedianPruner

# RL libraries
import gymnasium as gym
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.vec_env import VecMonitor, DummyVecEnv
from stable_baselines3.common.evaluation import evaluate_policy

# Custom environment
from pirl_env import PIRLEnvironment, make_pirl_env

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PIRLHyperoptConfig:
    """Configuration class for PIRL hyperparameter optimization."""
    
    def __init__(self, config_path: str):
        """Load hyperopt configuration from YAML file."""
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        # Hyperopt parameters
        self.n_trials = self.config.get('n_trials', 50)
        self.timeout = self.config.get('timeout', None)  # seconds
        self.direction = self.config.get('direction', 'maximize')
        
        # Training parameters
        self.algorithm = self.config.get('algorithm', 'PPO')
        self.total_timesteps = self.config.get('total_timesteps', 100000)
        self.num_envs = self.config.get('num_envs', 4)
        
        # Environment config
        self.env_config = self.config.get('env_config')
        if not self.env_config:
            raise ValueError("env_config is required")
        
        # Output paths
        self.output_dir = Path(self.config.get('output_dir', './pirl_hyperopt_output'))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Hyperparameter search space
        self.hyperparams = self.config.get('hyperparams', {})
        
        logger.info(f"Hyperopt configuration loaded from: {config_path}")
        logger.info(f"Algorithm: {self.algorithm}")
        logger.info(f"Number of trials: {self.n_trials}")
        logger.info(f"Total timesteps per trial: {self.total_timesteps}")


def create_env(config_path: str) -> PIRLEnvironment:
    """Create training environment."""
    return make_pirl_env(config_path)


def create_vec_env(config_path: str, num_envs: int) -> VecMonitor:
    """Create vectorized environment."""
    env_fns = [lambda: create_env(config_path) for _ in range(num_envs)]
    
    vec_env = DummyVecEnv(env_fns)
    vec_env = VecMonitor(vec_env)
    
    return vec_env


def objective(trial: optuna.Trial, config: PIRLHyperoptConfig) -> float:
    """Objective function for hyperparameter optimization."""
    
    # Sample hyperparameters
    sampled_params = {}
    
    for param_name, param_config in config.hyperparams.items():
        param_type = param_config.get('type', 'float')
        
        if param_type == 'float':
            if 'log' in param_config and param_config['log']:
                sampled_params[param_name] = trial.suggest_float(
                    param_name,
                    param_config['low'],
                    param_config['high'],
                    log=True
                )
            else:
                sampled_params[param_name] = trial.suggest_float(
                    param_name,
                    param_config['low'],
                    param_config['high']
                )
        elif param_type == 'int':
            sampled_params[param_name] = trial.suggest_int(
                param_name,
                param_config['low'],
                param_config['high']
            )
        elif param_type == 'categorical':
            sampled_params[param_name] = trial.suggest_categorical(
                param_name,
                param_config['choices']
            )
    
    # Create environment
    vec_env = create_vec_env(config.env_config, config.num_envs)
    
    # Create model
    model_class = PPO if config.algorithm.upper() == 'PPO' else SAC
    
    # Add default parameters
    default_params = {
        'verbose': 0,  # Reduce verbosity during hyperopt
        'tensorboard_log': None,  # Disable tensorboard during hyperopt
    }
    
    model_params = {**default_params, **sampled_params}
    
    try:
        model = model_class('MlpPolicy', vec_env, **model_params)
        
        # Train model
        model.learn(total_timesteps=config.total_timesteps, progress_bar=False)
        
        # Evaluate model
        mean_reward, std_reward = evaluate_policy(
            model, 
            vec_env, 
            n_eval_episodes=5,
            deterministic=True
        )
        
        # Close environment
        vec_env.close()
        
        logger.info(f"Trial {trial.number}: Mean reward = {mean_reward:.2f} ± {std_reward:.2f}")
        
        return mean_reward
        
    except Exception as e:
        logger.error(f"Trial {trial.number} failed: {e}")
        vec_env.close()
        raise optuna.TrialPruned()


def run_hyperopt(config: PIRLHyperoptConfig) -> optuna.Study:
    """Run hyperparameter optimization."""
    logger.info("Starting PIRL hyperparameter optimization...")
    
    # Create study
    study = optuna.create_study(
        direction=config.direction,
        sampler=TPESampler(seed=42),
        pruner=MedianPruner(n_startup_trials=5, n_warmup_steps=10)
    )
    
    # Run optimization
    study.optimize(
        lambda trial: objective(trial, config),
        n_trials=config.n_trials,
        timeout=config.timeout,
        show_progress_bar=True
    )
    
    logger.info("Hyperparameter optimization completed!")
    
    # Print results
    logger.info(f"Number of finished trials: {len(study.trials)}")
    logger.info(f"Number of pruned trials: {len(study.trials) - len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE])}")
    logger.info(f"Number of complete trials: {len([t for t in study.trials if t.state == optuna.trial.TrialState.COMPLETE])}")
    
    if len(study.trials) > 0:
        trial = study.best_trial
        logger.info(f"Best trial: {trial.number}")
        logger.info(f"Best value: {trial.value}")
        logger.info("Best params:")
        for key, value in trial.params.items():
            logger.info(f"  {key}: {value}")
    
    return study


def save_results(study: optuna.Study, config: PIRLHyperoptConfig):
    """Save optimization results."""
    # Save study object
    study_path = config.output_dir / 'hyperopt_study.pkl'
    study.save(str(study_path))
    
    # Save best parameters
    if len(study.trials) > 0:
        best_params = study.best_params
        
        # Create a training config with best parameters
        best_config = {
            'algorithm': config.algorithm,
            'total_timesteps': config.total_timesteps,
            'num_envs': config.num_envs,
            'algorithm_params': best_params,
            'env_configs': [config.env_config],
            'output_dir': str(config.output_dir / 'best_model_training'),
            'model_name': 'best_hyperopt_model'
        }
        
        best_config_path = config.output_dir / 'best_hyperopt_config.yaml'
        with open(best_config_path, 'w') as f:
            yaml.dump(best_config, f, default_flow_style=False)
        
        logger.info(f"Best configuration saved to: {best_config_path}")
    
    # Save optimization history
    history = []
    for trial in study.trials:
        if trial.state == optuna.trial.TrialState.COMPLETE:
            history.append({
                'trial_number': trial.number,
                'value': trial.value,
                'params': trial.params,
                'duration': trial.duration.total_seconds() if trial.duration else None
            })
    
    history_path = config.output_dir / 'optimization_history.yaml'
    with open(history_path, 'w') as f:
        yaml.dump(history, f, default_flow_style=False)
    
    logger.info(f"Optimization history saved to: {history_path}")
    logger.info(f"Study object saved to: {study_path}")


def main():
    """Main hyperparameter optimization function."""
    parser = argparse.ArgumentParser(description="Hyperparameter optimization for PIRL")
    parser.add_argument("--config", required=True, help="Hyperopt configuration YAML file")
    parser.add_argument("--trials", type=int, help="Number of trials (overrides config)")
    parser.add_argument("--timeout", type=int, help="Timeout in seconds (overrides config)")
    
    args = parser.parse_args()
    
    # Load configuration
    config = PIRLHyperoptConfig(args.config)
    
    # Override with command line arguments
    if args.trials:
        config.n_trials = args.trials
    if args.timeout:
        config.timeout = args.timeout
    
    # Run optimization
    study = run_hyperopt(config)
    
    # Save results
    save_results(study, config)
    
    logger.info("Hyperparameter optimization completed successfully!")
    return 0


if __name__ == "__main__":
    exit(main())


