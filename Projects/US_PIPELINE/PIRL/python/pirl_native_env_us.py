"""
Gymnasium-compatible wrapper for US_PIPELINE native C++ PIRL environment.

Simplified 7D state space focusing on slope optimization.
Supports quiet mode for reduced logging during training.
"""

import gymnasium as gym
import numpy as np
from typing import Dict, Any, Tuple, Optional, List
import logging
from pathlib import Path
import yaml
import time

try:
    import pirl_native_us
except ImportError as e:
    raise ImportError(
        "Failed to import pirl_native_us. Make sure the C++ extension is built:\n"
        "  cd /opt/agrs/Projects/US_PIPELINE/PIRL/build && make\n"
        "  cp pirl_native_us*.so /opt/agrs/Projects/US_PIPELINE/PIRL/python/"
    ) from e

logger = logging.getLogger(__name__)


class EpisodeStatsTracker:
    """Track episode statistics for batched logging in quiet mode."""

    def __init__(self, batch_size: int = 50):
        self.batch_size = batch_size
        self.batch_rewards: List[float] = []
        self.batch_lengths: List[int] = []
        self.batch_progress: List[float] = []  # Progress toward goal (%)
        self.batch_successes: int = 0
        self.total_episodes: int = 0
        self.last_log_time: float = time.time()

    def record_episode(self, reward: float, length: int, progress_pct: float,
                       is_success: bool, distance_from_goal: float) -> Optional[str]:
        """
        Record episode stats and return summary if batch complete.

        Returns:
            Summary string if batch complete, None otherwise
        """
        self.batch_rewards.append(reward)
        self.batch_lengths.append(length)
        self.batch_progress.append(progress_pct)
        self.total_episodes += 1

        if is_success:
            self.batch_successes += 1

        # Check if batch is complete
        if len(self.batch_rewards) >= self.batch_size:
            return self._generate_summary()

        return None

    def _generate_summary(self) -> str:
        """Generate batch summary and reset counters."""
        if not self.batch_rewards:
            return ""

        avg_reward = np.mean(self.batch_rewards)
        avg_length = np.mean(self.batch_lengths)
        avg_progress = np.mean(self.batch_progress)
        success_rate = (self.batch_successes / len(self.batch_rewards)) * 100

        summary = (
            f"📊 Episodes {self.total_episodes - len(self.batch_rewards) + 1}-{self.total_episodes}: "
            f"Avg Reward: {avg_reward:.1f} | "
            f"Avg Steps: {avg_length:.0f} | "
            f"Progress: {avg_progress:.1f}% | "
            f"Success: {success_rate:.0f}%"
        )

        # Reset batch counters
        self.batch_rewards.clear()
        self.batch_lengths.clear()
        self.batch_progress.clear()
        self.batch_successes = 0
        self.last_log_time = time.time()

        return summary

    def get_final_summary(self) -> Optional[str]:
        """Get summary of remaining episodes in partial batch."""
        if self.batch_rewards:
            return self._generate_summary()
        return None


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

    # Class-level quiet mode configuration
    _quiet_mode: bool = False
    _stats_tracker: Optional[EpisodeStatsTracker] = None

    @classmethod
    def set_quiet_mode(cls, quiet: bool = False, batch_size: int = 50):
        """
        Configure quiet mode for all environments.

        Args:
            quiet: Enable quiet mode (batched logging)
            batch_size: Number of episodes per batch summary
        """
        cls._quiet_mode = quiet
        if quiet:
            cls._stats_tracker = EpisodeStatsTracker(batch_size=batch_size)
        else:
            cls._stats_tracker = None

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
        if not self._quiet_mode:
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

        # Store initial goal distance for progress calculation
        self._initial_goal_distance = np.sqrt(
            (end_pt.x - start_pt.x)**2 + (end_pt.y - start_pt.y)**2
        )

        # Constraints
        if 'constraints' in yaml_config:
            constraints = yaml_config['constraints']
            self.config.max_slope_percent = constraints.get('max_slope_percent', 50.0)
            self.config.max_steps_per_episode = constraints.get('max_steps_per_episode', 5000)
            self.config.step_size_min_m = constraints.get('step_size_min_m', 40.0)
            self.config.step_size_max_m = constraints.get('step_size_max_m', 300.0)

        # Create native C++ environment
        if not self._quiet_mode:
            logger.info(f"[Env {self.env_id}] Creating native C++ environment...")
        self.env = pirl_native_us.PipelineEnvironment(self.config)
        if not self._quiet_mode:
            logger.info(f"[Env {self.env_id}] ✓ Native C++ environment initialized")

        # Define observation and action spaces
        self.observation_space = gym.spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(7,),
            dtype=np.float32
        )

        self.action_space = gym.spaces.Box(
            low=np.array([-1.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0], dtype=np.float32),
            dtype=np.float32
        )

        # Episode tracking
        self.current_step = 0
        self.current_episode = 0

        if not self._quiet_mode:
            logger.info(f"[Env {self.env_id}] Observation space: {self.observation_space}")
            logger.info(f"[Env {self.env_id}] Action space: {self.action_space}")

    def reset(self, seed: Optional[int] = None, options: Optional[Dict] = None) -> Tuple[np.ndarray, Dict]:
        """Reset the environment to initial state."""
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

        if not self._quiet_mode:
            logger.debug(f"[Env {self.env_id}] Episode {self.current_episode} reset - "
                        f"Goal distance: {state.goal_distance:.1f}m, Slope: {state.slope:.1f}%")

        return observation, info

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, Dict]:
        """Execute one step in the environment."""
        # Ensure action is float32 and has correct shape
        action = np.array(action, dtype=np.float32)
        if action.shape != (2,):
            raise ValueError(f"Action must have shape (2,), got {action.shape}")

        # Execute step in native C++ environment
        observation, reward, terminated, truncated, info = self.env.step(action)

        self.current_step += 1

        # Convert C++ RewardInfo to plain Python dict
        reward_info = info.get('reward_info')
        if reward_info is not None:
            info['reward_info'] = {
                'total_reward': float(reward_info.total_reward),
                'progress_reward': float(reward_info.progress_reward),
                'slope_violation': float(reward_info.slope_violation),
                'constraint_penalty': float(reward_info.constraint_penalty),
                'curvature_penalty': float(reward_info.curvature_penalty),
                'goal_bonus': float(reward_info.goal_bonus)
            }

        info['_step'] = self.current_step
        info['_episode'] = self.current_episode

        # Handle episode termination
        if terminated or truncated:
            reward_info_dict = info.get('reward_info')
            reason = info.get('termination_reason', 'unknown')

            # Get total distance traveled
            try:
                trajectory = self.env.get_route_trajectory()
                total_length_m = float(trajectory.total_length_m)
                info['total_length_m'] = total_length_m
            except:
                total_length_m = 0.0
                info['total_length_m'] = 0.0

            # Get distance from goal
            try:
                distance_from_goal = float(observation[2]) * 100000.0 if len(observation) > 2 else 0.0
                info['distance_from_goal'] = distance_from_goal
            except:
                distance_from_goal = 0.0
                info['distance_from_goal'] = 0.0

            # Calculate progress percentage
            progress_pct = ((self._initial_goal_distance - distance_from_goal) /
                          self._initial_goal_distance * 100) if self._initial_goal_distance > 0 else 0.0
            progress_pct = max(0.0, min(100.0, progress_pct))

            is_success = reason.startswith('SUCCESS')

            # Quiet mode: batch episode summaries
            if self._quiet_mode and self._stats_tracker is not None:
                total_reward = reward_info_dict['total_reward'] if reward_info_dict else reward
                summary = self._stats_tracker.record_episode(
                    reward=total_reward,
                    length=self.current_step,
                    progress_pct=progress_pct,
                    is_success=is_success,
                    distance_from_goal=distance_from_goal
                )
                if summary:
                    logger.info(summary)

            else:
                # Normal mode: detailed logging
                if is_success:
                    logger.info(f"✅ SUCCESS: Goal reached! [Env {self.env_id} | Episode {self.current_episode}] "
                              f"Steps: {self.current_step}")

                # Show detailed metrics
                if reward_info_dict:
                    logger.info(f"📊 EPISODE METRICS: [Env {self.env_id} | Episode {self.current_episode}]")
                    logger.info(f"   Total Length:        {total_length_m:>8.2f} m  ({total_length_m/1000.0:.2f} km)")
                    logger.info(f"   Distance from Goal:  {distance_from_goal:>8.2f} m  ({distance_from_goal/1000.0:.2f} km)")
                    logger.info(f"   Total Reward:        {reward_info_dict['total_reward']:>8.2f}")
                    logger.info(f"   ├─ Progress:         {reward_info_dict['progress_reward']:>8.2f}")
                    logger.info(f"   ├─ Slope Reward:     {reward_info_dict['slope_violation']:>8.2f}")
                    logger.info(f"   ├─ Boundary:         {reward_info_dict['constraint_penalty']:>8.2f}")
                    logger.info(f"   ├─ Curvature:        {reward_info_dict['curvature_penalty']:>8.2f}")
                    logger.info(f"   └─ Goal Bonus:       {reward_info_dict['goal_bonus']:>8.2f}")

        return observation, reward, terminated, truncated, info

    def get_route(self) -> list:
        """Get the current route trajectory."""
        return self.env.get_current_route()

    def get_route_trajectory(self) -> Any:
        """Get detailed route trajectory with segment information."""
        return self.env.get_route_trajectory()

    def render(self, mode: str = 'geojson', output_path: Optional[str] = None):
        """Render the current route."""
        if mode == 'geojson':
            if output_path is None:
                output_path = f"route_episode_{self.current_episode}.geojson"
            self.env.render(output_path)
            if not self._quiet_mode:
                logger.info(f"Route rendered to: {output_path}")
        else:
            raise ValueError(f"Unsupported render mode: {mode}")

    def close(self):
        """Clean up resources."""
        # Print final batch summary if in quiet mode
        if self._quiet_mode and self._stats_tracker is not None:
            final_summary = self._stats_tracker.get_final_summary()
            if final_summary:
                logger.info(final_summary)

    def __repr__(self):
        return f"PIRLNativeEnvironmentUS(config={self.config_path.name}, env_id={self.env_id})"


def make_env(config_path: str, env_id: int = 0):
    """
    Factory function to create US_PIPELINE PIRL native environment.

    Args:
        config_path: Path to YAML configuration file
        env_id: Environment ID for multi-env training

    Returns:
        Callable that creates the environment
    """
    def _init():
        return PIRLNativeEnvironmentUS(config_path, env_id=env_id)
    return _init
