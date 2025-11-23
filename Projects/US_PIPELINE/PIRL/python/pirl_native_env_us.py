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
    _routes_tracker: Optional["TopRoutesTracker"] = None
    _closest_tracker: Optional["ClosestRoutesTracker"] = None

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

    @classmethod
    def enable_route_saving(cls, output_dir: str, max_routes: int = 10):
        """Enable saving top N successful routes by reward."""
        cls._routes_tracker = TopRoutesTracker(output_dir, max_routes)
        logger.info(f"Route saving enabled: top {max_routes} to {output_dir}/top_routes/")

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

            # Save successful routes if tracking enabled
            # Track successful routes by reward
            if is_success and self._routes_tracker is not None:
                total_reward = reward_info_dict['total_reward'] if reward_info_dict else reward
                self._routes_tracker.maybe_save_route(total_reward, self.current_episode, self)
            
            # Track closest routes (even failures) by distance to goal
            if self._closest_tracker is not None:
                self._closest_tracker.maybe_save_route(distance_from_goal, self.current_episode, self)

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
                if False and summary:  # Disabled batch summaries
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

    def render(self, mode: str = 'geojson', output_path: Optional[str] = None, reward: float = 0.0):
        """Render the current route as ArcGIS-compliant GeoJSON."""
        if mode == 'geojson':
            if output_path is None:
                output_path = f"route_episode_{self.current_episode}.geojson"
            
            import json
            from datetime import datetime
            
            # Get full trajectory with segment data
            trajectory = self.env.get_route_trajectory()
            
            if not trajectory.segments or len(trajectory.segments) < 1:
                logger.warning(f"Cannot render: no segments in trajectory")
                return
            
            # Helper functions
            def fmt(coord):
                return float(round(float(coord), 2))
            
            def sanitize(obj):
                import numpy as np
                if isinstance(obj, (np.floating, np.float32, np.float64)):
                    return float(obj)
                elif isinstance(obj, (np.integer, np.int32, np.int64)):
                    return int(obj)
                elif isinstance(obj, np.ndarray):
                    return obj.tolist()
                elif isinstance(obj, dict):
                    return {k: sanitize(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [sanitize(item) for item in obj]
                return obj
            
            # Build segment features
            features = []
            slopes = []
            
            for idx, seg in enumerate(trajectory.segments):
                slopes.append(float(seg.max_slope_percent))
                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [fmt(seg.start_x), fmt(seg.start_y)],
                            [fmt(seg.end_x), fmt(seg.end_y)]
                        ]
                    },
                    "properties": {
                        "segment_id": idx + 1,
                        "length_m": fmt(seg.length_m),
                        "cumulative_distance_m": fmt(seg.cumulative_distance_m),
                        "elevation_start_m": fmt(seg.elevation_start),
                        "elevation_end_m": fmt(seg.elevation_end),
                        "max_slope_percent": round(float(seg.max_slope_percent), 2),
                        "reward": round(float(seg.reward) if hasattr(seg, 'reward') else 0.0, 2),
                        "distance_to_aoi_boundary_m": round(float(seg.distance_to_aoi_boundary), 2),
                    }
                }
                features.append(feature)
            
            # Full route as MultiLineString
            full_route_coords = [
                [[fmt(seg.start_x), fmt(seg.start_y)], [fmt(seg.end_x), fmt(seg.end_y)]]
                for seg in trajectory.segments
            ]
            
            avg_slope = sum(slopes) / len(slopes) if slopes else 0.0
            max_slope = max(slopes) if slopes else 0.0
            
            # Calculate efficiency metrics
            if trajectory.segments:
                start_seg = trajectory.segments[0]
                end_seg = trajectory.segments[-1]
                straight_line_m = ((end_seg.end_x - start_seg.start_x)**2 + 
                                   (end_seg.end_y - start_seg.start_y)**2)**0.5
                length_efficiency = straight_line_m / trajectory.total_length_m if trajectory.total_length_m > 0 else 0
            else:
                straight_line_m = 0
                length_efficiency = 0
            
            # A* baseline comparison (baseline: 8370.7m, 3.87% avg slope, 14.92% max slope)
            ASTAR_LENGTH = 8370.7
            ASTAR_AVG_SLOPE = 3.87
            ASTAR_MAX_SLOPE = 14.92
            
            vs_astar_length = (ASTAR_LENGTH - trajectory.total_length_m) / ASTAR_LENGTH * 100 if trajectory.total_length_m > 0 else 0
            vs_astar_slope = (ASTAR_AVG_SLOPE - avg_slope) / ASTAR_AVG_SLOPE * 100 if avg_slope > 0 else 0
            
            full_route_feature = {
                "type": "Feature",
                "geometry": {
                    "type": "MultiLineString",
                    "coordinates": full_route_coords
                },
                "properties": {
                    "type": "full_route",
                    "episode": self.current_episode,
                    "total_reward": round(float(reward), 2),
                    "total_length_m": fmt(trajectory.total_length_m),
                    "total_segments": len(trajectory.segments),
                    "success": trajectory.success,
                    "average_slope_percent": round(avg_slope, 2),
                    "max_slope_percent": round(max_slope, 2),
                    "straight_line_m": round(straight_line_m, 2),
                    "length_efficiency": round(length_efficiency * 100, 2),
                    "vs_astar_length_pct": round(vs_astar_length, 2),
                    "vs_astar_slope_pct": round(vs_astar_slope, 2),
                    "generation_timestamp": datetime.now().isoformat()
                }
            }
            features.insert(0, full_route_feature)
            
            # Get CRS from config
            epsg_code = getattr(self.config, 'epsg_code', 32613)
            crs = f"EPSG:{epsg_code}"
            
            geojson = {
                "type": "FeatureCollection",
                "crs": {
                    "type": "name",
                    "properties": {"name": crs}
                },
                "metadata": {
                    "title": "US_PIPELINE PIRL Route",
                    "episode": self.current_episode,
                    "total_reward": round(float(reward), 2),
                    "total_length_m": fmt(trajectory.total_length_m),
                    "total_segments": len(trajectory.segments),
                    "average_slope_percent": round(avg_slope, 2),
                    "max_slope_percent": round(max_slope, 2),
                    "straight_line_m": round(straight_line_m, 2),
                    "length_efficiency_pct": round(length_efficiency * 100, 2),
                    "vs_astar_length_pct": round(vs_astar_length, 2),
                    "vs_astar_slope_pct": round(vs_astar_slope, 2),
                    "crs": crs
                },
                "features": features
            }
            
            geojson = sanitize(geojson)
            
            with open(output_path, 'w') as f:
                json.dump(geojson, f, indent=2)
            
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


def make_env(config_path: str, env_id: int = 0, quiet: bool = False):
    """
    Factory function to create US_PIPELINE PIRL native environment.

    Args:
        config_path: Path to YAML configuration file
        env_id: Environment ID for multi-env training
        quiet: Enable quiet mode (reduced logging)

    Returns:
        Callable that creates the environment
    """
    def _init():
        # Set quiet mode before creating env (works in subprocesses)
        PIRLNativeEnvironmentUS.set_quiet_mode(quiet)
        return PIRLNativeEnvironmentUS(config_path, env_id=env_id)
    return _init


class TopRoutesTracker:
    """Track and save top N successful routes by reward."""
    
    def __init__(self, output_dir: str, max_routes: int = 10):
        self.output_dir = Path(output_dir) / "top_routes"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.max_routes = max_routes
        self.top_routes: List[Tuple[float, int, str]] = []  # (reward, episode, filepath)
    
    def maybe_save_route(self, reward: float, episode: int, env) -> bool:
        """
        Check if route qualifies for top N and save if so.
        Returns True if saved.
        """
        # Check if this route qualifies
        if len(self.top_routes) >= self.max_routes:
            min_reward = min(r[0] for r in self.top_routes)
            if reward <= min_reward:
                return False
        
        # Save the route
        filepath = self.output_dir / f"route_ep{episode}_reward{reward:.0f}.geojson"
        try:
            env.render(mode="geojson", output_path=str(filepath), reward=reward)
        except Exception as e:
            logger.warning(f"Failed to save route: {e}"); import traceback; traceback.print_exc()
            return False
        
        # Add to tracking list
        self.top_routes.append((reward, episode, str(filepath)))
        
        # If over limit, remove worst and delete its file
        if len(self.top_routes) > self.max_routes:
            self.top_routes.sort(key=lambda x: x[0], reverse=True)
            worst = self.top_routes.pop()
            try:
                Path(worst[2]).unlink()
            except:
                pass
        
        logger.info(f"🏆 Saved top route: ep{episode} reward={reward:.1f} ({len(self.top_routes)}/{self.max_routes})")
        return True


class ClosestRoutesTracker:
    """Track and save top N routes by closest distance to goal (even if failed)."""
    
    def __init__(self, output_dir: str, max_routes: int = 3):
        self.output_dir = Path(output_dir) / "closest_routes"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.max_routes = max_routes
        self.closest_routes: List[Tuple[float, int, str]] = []  # (distance, episode, filepath)
    
    def maybe_save_route(self, distance_to_goal: float, episode: int, env) -> bool:
        """
        Check if route is among closest to goal and save if so.
        Returns True if saved.
        """
        # Check if this route qualifies (lower distance = better)
        if len(self.closest_routes) >= self.max_routes:
            max_dist = max(r[0] for r in self.closest_routes)
            if distance_to_goal >= max_dist:
                return False
        
        # Save the route
        filepath = self.output_dir / f"closest_ep{episode}_dist{distance_to_goal:.0f}m.geojson"
        try:
            env.render(mode="geojson", output_path=str(filepath), reward=0)
        except Exception as e:
            logger.warning(f"Failed to save closest route: {e}")
            return False
        
        # Add to tracking list
        self.closest_routes.append((distance_to_goal, episode, str(filepath)))
        
        # If over limit, remove worst (furthest) and delete its file
        if len(self.closest_routes) > self.max_routes:
            self.closest_routes.sort(key=lambda x: x[0])  # Sort by distance ascending
            worst = self.closest_routes.pop()
            try:
                Path(worst[2]).unlink()
            except:
                pass
        
        logger.info(f"📍 Saved closest route: ep{episode} dist={distance_to_goal:.0f}m ({len(self.closest_routes)}/{self.max_routes})")
        return True
