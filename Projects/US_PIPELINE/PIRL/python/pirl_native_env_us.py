"""
Gymnasium-compatible wrapper for US_PIPELINE native C++ PIRL environment.

Simplified 7D state space focusing on slope optimization.
"""

import gymnasium as gym
import numpy as np
from typing import Dict, Any, Tuple, Optional
import logging
from pathlib import Path
import yaml

try:
    import pirl_native_us
except ImportError as e:
    raise ImportError(
        "Failed to import pirl_native_us. Make sure the C++ extension is built:\n"
        "  cd /opt/agrs/Projects/US_PIPELINE/PIRL/build && make\n"
        "  cp pirl_native_us*.so /opt/agrs/Projects/US_PIPELINE/PIRL/python/"
    ) from e

logger = logging.getLogger(__name__)


class PIRLNativeEnvironmentUS(gym.Env):
    """
    Gymnasium-compatible environment for US_PIPELINE PIRL (Simplified 7D).
    
    State Space (7D):
        - x, y: Position
        - goal_distance, goal_bearing: Navigation
        - slope: Terrain (PRIMARY OPTIMIZATION)
        - distance_to_boundary: Constraints
        - prev_heading: Action history
    
    Action Space (2D):
        - heading_change: [-π/4, π/4] radians
        - step_size: [40, 300] meters
    """
    
    metadata = {'render_modes': ['geojson']}
    
    def __init__(self, config_path: str, env_id: int = 0):
        """
        Initialize the US_PIPELINE PIRL environment.

        Args:
            config_path: Path to YAML configuration file
            env_id: Environment ID for multi-env training (default: 0)
        """
        super().__init__()

        self.env_id = env_id
        self.config_path = Path(config_path)
        if not self.config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        
        # Load configuration from YAML
        logger.info(f"[Env {self.env_id}] Loading configuration from: {config_path}")
        with open(config_path, 'r') as f:
            yaml_config = yaml.safe_load(f)
        
        # Create C++ Config object
        self.config = pirl_native_us.Config()
        self.config.project_dir = yaml_config['project_dir']
        self.config.epsg_code = yaml_config['epsg_code']
        
        # Start and end points
        start_pt = pirl_native_us.Point()
        start_pt.x = yaml_config['start_point']['x']
        start_pt.y = yaml_config['start_point']['y']
        self.config.start_point = start_pt
        
        end_pt = pirl_native_us.Point()
        end_pt.x = yaml_config['end_point']['x']
        end_pt.y = yaml_config['end_point']['y']
        self.config.end_point = end_pt
        
        # Constraints
        if 'constraints' in yaml_config:
            constraints = yaml_config['constraints']
            self.config.max_slope_percent = constraints.get('max_slope_percent', 50.0)
            self.config.max_steps_per_episode = constraints.get('max_steps_per_episode', 5000)
            self.config.step_size_min_m = constraints.get('step_size_min_m', 40.0)
            self.config.step_size_max_m = constraints.get('step_size_max_m', 300.0)
        
        # Create native C++ environment
        logger.info(f"[Env {self.env_id}] Creating native C++ environment...")
        self.env = pirl_native_us.PipelineEnvironment(self.config)
        logger.info(f"[Env {self.env_id}] ✓ Native C++ environment initialized")
        
        # Define observation and action spaces
        # State dimension: 7 features (SIMPLIFIED)
        #   Position & Navigation (4): x, y, goal_dist, goal_bearing
        #   Terrain (1): slope (PRIMARY OPTIMIZATION)
        #   Constraints (1): distance_to_boundary
        #   Action History (1): prev_heading
        self.observation_space = gym.spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(7,),  # Simplified from 29D
            dtype=np.float32
        )
        
        # Action dimension: 2 (heading_change, step_size)
        # heading_change: [-π/4, π/4] radians → normalized to [-1, 1] for NN
        # step_size: [40, 300] meters → normalized to [-1, 1] for NN
        self.action_space = gym.spaces.Box(
            low=np.array([-1.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )
        
        # Episode tracking
        self.current_step = 0
        self.current_episode = 0
        
        logger.info(f"[Env {self.env_id}] Observation space: {self.observation_space}")
        logger.info(f"[Env {self.env_id}] Action space: {self.action_space}")
    
    def reset(self, seed: Optional[int] = None, options: Optional[Dict] = None) -> Tuple[np.ndarray, Dict]:
        """
        Reset the environment to initial state.
        
        Args:
            seed: Random seed (for compatibility, not used in C++ env)
            options: Additional reset options
            
        Returns:
            observation: Initial state as numpy array (7D)
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
            'goal_distance': state.goal_distance,
            'slope': state.slope
        }
        
        logger.debug(f"[Env {self.env_id}] Episode {self.current_episode} reset - Goal distance: {state.goal_distance:.1f}m, Slope: {state.slope:.1f}%")
        
        return observation, info
    
    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """
        Execute one step in the environment.
        
        Args:
            action: Action to take [heading_change, step_size] (2D)
            
        Returns:
            observation: New state as numpy array (7D)
            reward: Reward for this step
            terminated: Whether episode ended (goal reached or constraint violated)
            truncated: Whether episode was truncated (max steps)
            info: Additional information dictionary
        """
        # Ensure action is float32 and has correct shape (2D: heading, step_size)
        action = np.array(action, dtype=np.float32)
        if action.shape != (2,):
            raise ValueError(f"Action must have shape (2,), got {action.shape}")
        
        # Execute step in native C++ environment
        observation, reward, terminated, truncated, info = self.env.step(action)
        
        self.current_step += 1
        
        # Convert C++ RewardInfo to plain Python dict (for pickling/deepcopy compatibility)
        reward_info = info.get('reward_info')
        if reward_info is not None:
            info['reward_info'] = {
                'total_reward': float(reward_info.total_reward),
                'progress_reward': float(reward_info.progress_reward),
                'slope_violation': float(reward_info.slope_violation),  # Slope-specific (renamed from cost_penalty)
                'constraint_penalty': float(reward_info.constraint_penalty),
                'curvature_penalty': float(reward_info.curvature_penalty),
                'goal_bonus': float(reward_info.goal_bonus)
            }
        
        # Add step counter to info (use underscores to avoid conflicts with Monitor)
        info['_step'] = self.current_step
        info['_episode'] = self.current_episode
        
        # Log significant events with detailed reward breakdown
        if terminated or truncated:
            reward_info_dict = info.get('reward_info')
            reason = info.get('termination_reason', 'unknown')
            
            # Get total distance traveled from trajectory
            try:
                trajectory = self.env.get_route_trajectory()
                total_length_m = float(trajectory.total_length_m)
                info['total_length_m'] = total_length_m
            except:
                total_length_m = 0.0
                info['total_length_m'] = 0.0
            
            # Get distance from goal (from observation - index 2 is goal_distance, normalized by /100000.0)
            try:
                distance_from_goal = float(observation[2]) * 100000.0 if len(observation) > 2 else 0.0
                info['distance_from_goal'] = distance_from_goal
            except:
                distance_from_goal = 0.0
                info['distance_from_goal'] = 0.0
            
            # Check if episode succeeded (reached goal)
            is_success = reason.startswith('SUCCESS')
            
            if is_success:
                logger.info(f"✅ SUCCESS: Goal reached! [Env {self.env_id} | Episode {self.current_episode}] Steps: {self.current_step}")
            else:
                # Failure - already logged by C++ with emoji prefix
                pass  # C++ logs already show: 🚫/⛰️/⏱️ FAILURE: ...
            
            # Show detailed metrics and reward breakdown for all terminations
            if reward_info_dict:
                logger.info(f"📊 EPISODE METRICS: [Env {self.env_id} | Episode {self.current_episode}]")
                logger.info(f"   Total Length:        {total_length_m:>8.2f} m  ({total_length_m/1000.0:.2f} km)")
                logger.info(f"   Distance from Goal:  {distance_from_goal:>8.2f} m  ({distance_from_goal/1000.0:.2f} km)")
                logger.info(f"   Total Reward:        {reward_info_dict['total_reward']:>8.2f}")
                logger.info(f"   ├─ Progress:         {reward_info_dict['progress_reward']:>8.2f}")
                logger.info(f"   ├─ Slope Reward:     {reward_info_dict['slope_violation']:>8.2f}")  # Slope-specific
                logger.info(f"   ├─ Boundary:         {reward_info_dict['constraint_penalty']:>8.2f}")
                logger.info(f"   ├─ Curvature:        {reward_info_dict['curvature_penalty']:>8.2f}")
                logger.info(f"   └─ Goal Bonus:       {reward_info_dict['goal_bonus']:>8.2f}")
        
        return observation, reward, terminated, truncated, info
    
    def get_route(self) -> list:
        """
        Get the current route trajectory from the C++ environment.
        
        Returns:
            List of (x, y) coordinate pairs representing the route
        """
        return self.env.get_current_route()
    
    def get_route_trajectory(self) -> Any:
        """
        Get detailed route trajectory with segment information.
        
        Returns:
            RouteTrajectory object with segments and metadata
        """
        return self.env.get_route_trajectory()
    
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
        return f"PIRLNativeEnvironmentUS(config={self.config_path.name}, env_id={self.env_id})"


def make_env(config_path: str, env_id: int = 0):
    """
    Factory function to create US_PIPELINE PIRL native environment.

    This is useful for vectorized environments in Stable-Baselines3.

    Args:
        config_path: Path to YAML configuration file
        env_id: Environment ID for multi-env training

    Returns:
        Callable that creates the environment
    """
    def _init():
        return PIRLNativeEnvironmentUS(config_path, env_id=env_id)
    return _init

