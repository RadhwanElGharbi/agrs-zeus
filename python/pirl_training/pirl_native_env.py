"""
Gymnasium-compatible wrapper for native C++ PIRL environment.

This module provides a Gymnasium (OpenAI Gym) interface to the C++
PipelineEnvironment, enabling direct use with Stable-Baselines3 for
both training and inference.

Key Features:
- Direct C++ integration (no subprocess overhead)
- Real GIS queries for terrain, constraints, and costs
- Full route trajectory extraction
- SAIPEM criteria compliance enforcement
"""

import gymnasium as gym
import numpy as np
from typing import Dict, Any, Tuple, Optional
import logging
from pathlib import Path

try:
    import pirl_native
except ImportError as e:
    raise ImportError(
        "Failed to import pirl_native. Make sure the C++ extension is built:\n"
        "  cd /opt/agrs/build && make pirl_native\n"
        "  cp pirl_native*.so /opt/agrs/python/pirl_training/"
    ) from e

logger = logging.getLogger(__name__)


class PIRLNativeEnvironment(gym.Env):
    """
    Gymnasium-compatible environment using native C++ PIRL implementation.
    
    This environment provides direct access to the C++ PipelineEnvironment,
    enabling the trained PPO model to interact with real GIS data for
    optimal pipeline route generation.
    """
    
    metadata = {'render_modes': ['geojson']}
    
    def __init__(self, config_path: str):
        """
        Initialize the native PIRL environment.
        
        Args:
            config_path: Path to YAML configuration file
        """
        super().__init__()
        
        self.config_path = Path(config_path)
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        
        # Load configuration
        logger.info(f"Loading configuration from: {config_path}")
        self.config = pirl_native.load_config(str(config_path))
        
        # Create native C++ environment
        logger.info("Creating native C++ environment...")
        self.env = pirl_native.PipelineEnvironment(self.config)
        logger.info("✓ Native C++ environment initialized")
        
        # Define observation and action spaces
        # State dimension: 29 features (UPDATED Phase 4: Continuous Cost System)
        #   Position & Navigation (4): x, y, goal_dist, goal_bearing
        #   Terrain (4): elevation, slope, aspect, curvature
        #   Infrastructure (3): water_prox, road_prox, railway_prox
        #   Risk Factors (3): geohazard, soil, population
        #   Constraints (2): no_go, cadastre
        #   Hydraulics (4): cumulative_pressure_drop, segments_since_pump, flow_velocity, reynolds
        #   Action History (1): prev_heading
        #   Crossing Context (6): nearest_crossing_dist, width, type, before_dist, after_dist, alignment
        #   Boundary Awareness (2): distance_to_aoi_boundary, distance_to_sea_boundary
        self.observation_space = gym.spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(29,),  # Updated from 21 to 29 (Phase 4: Continuous Cost System)
            dtype=np.float32
        )
        
        # Action dimension: 3 (heading_change, step_size, crossing_decision)
        # heading_change: [-π/4, π/4] radians → normalized to [-1, 1] for NN
        # step_size: [10, 100] meters → normalized to [-1, 1] for NN
        # crossing_decision: continuous [-1, 1] → discretized to {0,1,2,3} in C++
        self.action_space = gym.spaces.Box(
            low=np.array([-1.0, -1.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )
        
        # Episode tracking
        self.current_step = 0
        self.current_episode = 0
        
        logger.info(f"Observation space: {self.observation_space}")
        logger.info(f"Action space: {self.action_space}")
    
    def reset(self, seed: Optional[int] = None, options: Optional[Dict] = None) -> Tuple[np.ndarray, Dict]:
        """
        Reset the environment to initial state.
        
        Args:
            seed: Random seed (for compatibility, not used in C++ env)
            options: Additional reset options
            
        Returns:
            observation: Initial state as numpy array
            info: Additional information dictionary
        """
        super().reset(seed=seed)
        
        # Reset native C++ environment
        state = self.env.reset()
        
        # Convert C++ State to numpy array
        observation = np.array(state.to_vector(), dtype=np.float32)
        
        # Reset counters
        self.current_step = 0
        self.current_episode += 1
        
        info = {
            'episode': self.current_episode,
            'step': self.current_step,
            'position': (state.x, state.y),
            'goal_distance': state.goal_distance
        }
        
        logger.debug(f"Episode {self.current_episode} reset - Goal distance: {state.goal_distance:.1f}m")
        
        return observation, info
    
    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """
        Execute one step in the environment.
        
        Args:
            action: Action to take [heading_change, step_size, crossing_decision]
            
        Returns:
            observation: New state as numpy array
            reward: Reward for this step
            terminated: Whether episode ended (goal reached or constraint violated)
            truncated: Whether episode was truncated (max steps)
            info: Additional information dictionary
        """
        # Ensure action is float32 and has correct shape (3D: heading, step_size, crossing_decision)
        action = np.array(action, dtype=np.float32)
        if action.shape != (3,):
            raise ValueError(f"Action must have shape (3,), got {action.shape}")
        
        # Execute step in native C++ environment
        observation, reward, terminated, truncated, info = self.env.step(action)
        
        # observation is already a numpy array from C++
        # reward is a float
        # terminated and truncated are booleans
        # info is a dict with reward_info (C++ object) and termination_reason (string)
        
        self.current_step += 1
        
        # Convert C++ RewardInfo to plain Python dict (for pickling/deepcopy compatibility)
        reward_info = info.get('reward_info')
        if reward_info is not None:
            info['reward_info'] = {
                'total_reward': float(reward_info.total_reward),
                'progress_reward': float(reward_info.progress_reward),
                'cost_penalty': float(reward_info.cost_penalty),
                'constraint_penalty': float(reward_info.constraint_penalty),
                'curvature_penalty': float(reward_info.curvature_penalty),
                'goal_bonus': float(reward_info.goal_bonus),
                'slope_violation': bool(reward_info.slope_violation),
                'no_go_violation': bool(reward_info.no_go_violation),
                'crossing_violation': bool(reward_info.crossing_violation)
            }
        
        # Add step counter to info (use underscores to avoid conflicts with Monitor)
        info['_step'] = self.current_step
        info['_episode'] = self.current_episode
        
        # Log significant events
        if terminated or truncated:
            reward_info_dict = info.get('reward_info')
            reason = info.get('termination_reason', 'unknown')
            
            if reward_info_dict and reward_info_dict.get('goal_bonus', 0) > 0:
                logger.info(f"🎯 Goal reached! Episode {self.current_episode}, Steps: {self.current_step}")
                logger.info(f"   Total reward: {reward_info_dict['total_reward']:.2f}")
            else:
                if terminated:
                    logger.warning(f"❌ Episode terminated: {reason}")
        
        return observation, reward, terminated, truncated, info
    
    def get_route(self) -> list:
        """
        Get the current route trajectory from the C++ environment.
        
        Returns:
            List of (x, y) coordinate pairs representing the route
        """
        return self.env.get_current_route()
    
    def get_route_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the current route.
        
        Returns:
            Dictionary with route statistics (length, cost, violations, etc.)
        """
        stats = self.env.get_route_stats()
        return {
            'total_length_m': stats.total_length_m,
            'total_cost_usd': stats.total_cost_usd,
            'avg_slope': stats.avg_slope,
            'num_water_crossings': stats.num_water_crossings,
            'num_road_crossings': stats.num_road_crossings,
            'num_constraint_violations': stats.num_constraint_violations,
            'curvature_max': stats.curvature_max
        }
    
    def render(self, mode: str = 'geojson', output_path: Optional[str] = None):
        """
        Render the current route.
        
        Args:
            mode: Render mode ('geojson')
            output_path: Path to save rendered output
        """
        if mode == 'geojson':
            if output_path is None:
                output_path = f"route_episode_{self.current_episode}.geojson"
            self.env.render(output_path)
            logger.info(f"Route rendered to: {output_path}")
        else:
            raise ValueError(f"Unsupported render mode: {mode}")
    
    def close(self):
        """Clean up resources."""
        # C++ environment uses RAII, so cleanup is automatic
        pass
    
    def __repr__(self):
        return f"PIRLNativeEnvironment(config={self.config_path.name})"


def make_env(config_path: str):
    """
    Factory function to create PIRL native environment.
    
    This is useful for vectorized environments in Stable-Baselines3.
    
    Args:
        config_path: Path to YAML configuration file
        
    Returns:
        Callable that creates the environment
    """
    def _init():
        return PIRLNativeEnvironment(config_path)
    return _init


if __name__ == '__main__':
    # Quick test of the native environment
    import sys
    
    logging.basicConfig(level=logging.INFO)
    
    if len(sys.argv) < 2:
        config_path = "/opt/agrs/Projects/test_project/pirl_training_config.yaml"
        print(f"Usage: {sys.argv[0]} <config_yaml>")
        print(f"Using default: {config_path}")
    else:
        config_path = sys.argv[1]
    
    print("\n" + "="*70)
    print("TESTING NATIVE C++ PIRL ENVIRONMENT")
    print("="*70)
    
    # Create environment
    env = PIRLNativeEnvironment(config_path)
    
    # Test reset
    print("\n1. Testing reset()...")
    obs, info = env.reset()
    print(f"   Observation shape: {obs.shape}")
    print(f"   Goal distance: {info['goal_distance']:.1f}m")
    print(f"   Position: ({info['position'][0]:.1f}, {info['position'][1]:.1f})")
    
    # Test a few random steps
    print("\n2. Testing step()...")
    for i in range(5):
        action = env.action_space.sample()
        obs, reward, terminated, truncated, info = env.step(action)
        print(f"   Step {i+1}: reward={reward:.2f}, done={terminated or truncated}")
        if terminated or truncated:
            break
    
    # Test route extraction
    print("\n3. Testing route extraction...")
    route = env.get_route()
    print(f"   Route has {len(route)} points")
    
    # Test route stats
    print("\n4. Testing route statistics...")
    stats = env.get_route_stats()
    for key, value in stats.items():
        print(f"   {key}: {value}")
    
    print("\n" + "="*70)
    print("✓ All tests passed!")
    print("="*70)


