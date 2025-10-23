#!/usr/bin/env python3
"""
PIRL Gymnasium Environment Wrapper

This module provides a Python Gymnasium environment that wraps the C++ PipelineEnvironment
for use with Stable-Baselines3 training algorithms.
"""

import gymnasium as gym
import numpy as np
import yaml
import subprocess
import json
import tempfile
import os
from typing import Dict, Any, Tuple, Optional
from pathlib import Path
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PIRLEnvironment(gym.Env):
    """
    Gymnasium environment wrapper for PIRL pipeline routing.
    
    This environment interfaces with the C++ PipelineEnvironment through
    the ZEUS CLI tools for training RL agents.
    """
    
    def __init__(self, config_path: str, render_mode: Optional[str] = None):
        """
        Initialize PIRL environment.
        
        Args:
            config_path: Path to project configuration YAML file
            render_mode: Rendering mode (not implemented yet)
        """
        super().__init__()
        
        self.config_path = config_path
        self.render_mode = render_mode
        
        # Load configuration
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        # Set up action and observation spaces
        # Action space: [heading_change, step_size]
        # heading_change: continuous, range [-π/4, π/4]
        # step_size: continuous, range [10, 100] meters
        self.action_space = gym.spaces.Box(
            low=np.array([-np.pi/4, 10.0], dtype=np.float32),
            high=np.array([np.pi/4, 100.0], dtype=np.float32),
            dtype=np.float32
        )
        
        # Observation space: 17-dimensional state vector (EXPANDED)
        # [x, y, goal_distance, goal_bearing, elevation, slope, aspect, curvature,
        #  no_go_zone, water_proximity, road_proximity, geohazard_risk,
        #  soil_capacity, cadastre_complex, population_density, railway_proximity, prev_heading]
        self.observation_space = gym.spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(17,),
            dtype=np.float32
        )
        
        # Episode tracking
        self.current_episode = 0
        self.max_episode_steps = self.config.get('training', {}).get('max_steps_per_episode', 5000)
        self.current_step = 0
        
        # Temporary files for communication
        self.temp_dir = Path(tempfile.mkdtemp(prefix='pirl_training_'))
        self.state_file = self.temp_dir / 'current_state.json'
        self.action_file = self.temp_dir / 'next_action.json'
        self.reward_file = self.temp_dir / 'reward_info.json'
        
        logger.info(f"PIRL Environment initialized with config: {config_path}")
        logger.info(f"Temp directory: {self.temp_dir}")
    
    def reset(self, seed: Optional[int] = None, options: Optional[Dict[str, Any]] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Reset the environment to initial state.
        
        Args:
            seed: Random seed (not used)
            options: Additional options (not used)
            
        Returns:
            Initial observation and info dict
        """
        if seed is not None:
            np.random.seed(seed)
        
        # Reset episode tracking
        self.current_step = 0
        self.current_episode += 1
        
        # Create a temporary config for this episode
        episode_config = self.temp_dir / f'episode_{self.current_episode}_config.yaml'
        with open(episode_config, 'w') as f:
            yaml.dump(self.config, f)
        
        # Call C++ environment reset through ZEUS CLI
        try:
            result = subprocess.run([
                'zeus', 'tools', 'pirl_reset_episode',
                '--config', str(episode_config),
                '--output-dir', str(self.temp_dir)
            ], capture_output=True, text=True, check=True)
            
            logger.debug(f"Reset result: {result.stdout}")
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to reset environment: {e}")
            logger.error(f"STDOUT: {e.stdout}")
            logger.error(f"STDERR: {e.stderr}")
            raise
        
        # Load initial state
        observation = self._load_state()
        
        info = {
            'episode': self.current_episode,
            'step': self.current_step,
            'config_path': str(episode_config)
        }
        
        return observation, info
    
    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict[str, Any]]:
        """
        Execute one step in the environment.
        
        Args:
            action: Action to take [heading_change, step_size]
            
        Returns:
            observation, reward, terminated, truncated, info
        """
        self.current_step += 1
        
        # Ensure action is within bounds
        action = np.clip(action, self.action_space.low, self.action_space.high)
        
        # Save action to file
        action_dict = {
            'heading_change': float(action[0]),
            'step_size': float(action[1])
        }
        
        with open(self.action_file, 'w') as f:
            json.dump(action_dict, f)
        
        # Call C++ environment step through ZEUS CLI
        try:
            result = subprocess.run([
                'zeus', 'tools', 'pirl_step',
                '--config', str(self.temp_dir / f'episode_{self.current_episode}_config.yaml'),
                '--action-file', str(self.action_file),
                '--output-dir', str(self.temp_dir)
            ], capture_output=True, text=True, check=True)
            
            logger.debug(f"Step result: {result.stdout}")
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to step environment: {e}")
            logger.error(f"STDOUT: {e.stdout}")
            logger.error(f"STDERR: {e.stderr}")
            # Return a terminal state with large negative reward
            observation = np.zeros(12, dtype=np.float32)
            return observation, -1000.0, True, True, {'error': str(e)}
        
        # Load new state and reward
        observation = self._load_state()
        reward_info = self._load_reward_info()
        
        # Check termination conditions
        terminated = reward_info.get('terminated', False)
        truncated = self.current_step >= self.max_episode_steps
        
        info = {
            'episode': self.current_episode,
            'step': self.current_step,
            'reward_info': reward_info,
            'terminated': terminated,
            'truncated': truncated
        }
        
        return observation, reward_info.get('total_reward', 0.0), terminated, truncated, info
    
    def _load_state(self) -> np.ndarray:
        """Load current state from C++ environment."""
        try:
            with open(self.state_file, 'r') as f:
                state_data = json.load(f)
            
            # Convert to numpy array in correct order (17 dimensions)
            state_vector = np.array([
                state_data.get('x', 0.0),
                state_data.get('y', 0.0),
                state_data.get('goal_distance', 0.0),
                state_data.get('goal_bearing', 0.0),
                state_data.get('elevation', 0.0),
                state_data.get('slope', 0.0),
                state_data.get('aspect', 0.0),
                state_data.get('curvature', 0.0),
                state_data.get('no_go_zone', 0.0),
                state_data.get('water_proximity', 0.0),
                state_data.get('road_proximity', 0.0),
                state_data.get('geohazard_risk', 0.0),
                state_data.get('soil_capacity', 0.5),
                state_data.get('cadastre_complex', 0.0),
                state_data.get('population_density', 0.0),
                state_data.get('railway_proximity', 1.0),
                state_data.get('prev_heading', 0.0)
            ], dtype=np.float32)
            
            return state_vector
            
        except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
            logger.error(f"Failed to load state: {e}")
            return np.zeros(17, dtype=np.float32)
    
    def _load_reward_info(self) -> Dict[str, Any]:
        """Load reward information from C++ environment."""
        try:
            with open(self.reward_file, 'r') as f:
                reward_data = json.load(f)
            return reward_data
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.error(f"Failed to load reward info: {e}")
            return {'total_reward': 0.0, 'terminated': False}
    
    def close(self):
        """Clean up temporary files."""
        import shutil
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)
            logger.info(f"Cleaned up temp directory: {self.temp_dir}")
    
    def render(self):
        """Render the environment (not implemented yet)."""
        logger.warning("Render method not implemented yet")
        pass


def make_pirl_env(config_path: str, **kwargs) -> PIRLEnvironment:
    """
    Create a PIRL environment instance.
    
    Args:
        config_path: Path to project configuration YAML
        **kwargs: Additional arguments passed to environment
        
    Returns:
        Configured PIRL environment
    """
    return PIRLEnvironment(config_path, **kwargs)


# Register environment with Gymnasium (optional)
def register_pirl_env():
    """Register PIRL environment with Gymnasium."""
    try:
        gym.register(
            id='PIRL-PipelineRouting-v0',
            entry_point='pirl_env:PIRLEnvironment',
            max_episode_steps=5000
        )
        logger.info("Registered PIRL environment with Gymnasium")
    except gym.error.Error as e:
        logger.warning(f"Failed to register environment: {e}")


if __name__ == "__main__":
    # Test the environment
    import argparse
    
    parser = argparse.ArgumentParser(description="Test PIRL Environment")
    parser.add_argument("--config", required=True, help="Path to config YAML")
    parser.add_argument("--episodes", type=int, default=1, help="Number of test episodes")
    parser.add_argument("--steps", type=int, default=10, help="Steps per episode")
    
    args = parser.parse_args()
    
    # Create environment
    env = make_pirl_env(args.config)
    
    try:
        for episode in range(args.episodes):
            obs, info = env.reset()
            print(f"Episode {episode + 1}: Initial observation shape: {obs.shape}")
            
            total_reward = 0.0
            for step in range(args.steps):
                # Random action
                action = env.action_space.sample()
                obs, reward, terminated, truncated, info = env.step(action)
                total_reward += reward
                
                print(f"  Step {step + 1}: Reward = {reward:.3f}, "
                      f"Terminated = {terminated}, Truncated = {truncated}")
                
                if terminated or truncated:
                    break
            
            print(f"Episode {episode + 1} completed. Total reward: {total_reward:.3f}")
            
    finally:
        env.close()
        print("Environment test completed.")
