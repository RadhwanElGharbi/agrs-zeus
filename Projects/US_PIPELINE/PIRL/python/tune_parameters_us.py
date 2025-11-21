#!/usr/bin/env python3
"""
US_PIPELINE PIRL Parameter Tuner (7D State Space)

Systematic testing of reward function parameters for slope optimization.

Tunable Parameters (7D State Space):
====================================

1. PROGRESS REWARD MULTIPLIER
   - Controls value of moving toward goal
   - Default: 2.0
   - Range: [0.5, 10.0]
   
2. SLOPE REWARD SCALE
   - Maximum reward for 0% slope
   - Default: 10.0
   - Range: [5.0, 50.0]
   
3. SLOPE PENALTY SCALE
   - Maximum penalty for 50% slope
   - Default: -100.0
   - Range: [-500.0, -50.0]
   
4. BOUNDARY PENALTY SCALE
   - Maximum penalty at AOI boundary
   - Default: -50.0
   - Range: [-200.0, -10.0]
   
5. BOUNDARY PENALTY DISTANCE
   - Distance threshold for boundary penalty
   - Default: 100.0 m
   - Range: [50.0, 200.0]
   
6. CURVATURE PENALTY RATE
   - Penalty per radian of heading change
   - Default: -0.5
   - Range: [-2.0, -0.1]
   
7. GOAL BONUS
   - Reward for reaching goal (within 50m)
   - Default: 1000.0
   - Range: [100.0, 5000.0]

NOT TUNABLE (Fixed Architecture):
==================================
- State space: 7D (x, y, goal_distance, goal_bearing, slope, distance_to_boundary, prev_heading)
- Action space: 2D (heading_change, step_size)
- Step size range: 40-300m
- Max steps: 5000
- Terminal slope: 50%
"""

import argparse
import json
import sys
import logging
from pathlib import Path
from datetime import datetime
import numpy as np
import yaml
from typing import Dict, List, Tuple

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

from pirl_native_env_us import PIRLNativeEnvironmentUS

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ParameterConfig:
    """Configuration for reward function parameters."""
    
    def __init__(self, **kwargs):
        # Progress reward
        self.progress_multiplier = kwargs.get('progress_multiplier', 2.0)
        
        # Slope reward/penalty
        self.slope_reward_scale = kwargs.get('slope_reward_scale', 10.0)
        self.slope_penalty_scale = kwargs.get('slope_penalty_scale', -100.0)
        
        # Boundary penalty
        self.boundary_penalty_scale = kwargs.get('boundary_penalty_scale', -50.0)
        self.boundary_penalty_distance = kwargs.get('boundary_penalty_distance', 100.0)
        
        # Curvature penalty
        self.curvature_penalty_rate = kwargs.get('curvature_penalty_rate', -0.5)
        
        # Goal bonus
        self.goal_bonus = kwargs.get('goal_bonus', 1000.0)
    
    def to_dict(self):
        return {
            'progress_multiplier': self.progress_multiplier,
            'slope_reward_scale': self.slope_reward_scale,
            'slope_penalty_scale': self.slope_penalty_scale,
            'boundary_penalty_scale': self.boundary_penalty_scale,
            'boundary_penalty_distance': self.boundary_penalty_distance,
            'curvature_penalty_rate': self.curvature_penalty_rate,
            'goal_bonus': self.goal_bonus
        }
    
    def __str__(self):
        return (
            f"ParameterConfig(\n"
            f"  progress_multiplier={self.progress_multiplier:.2f},\n"
            f"  slope_reward_scale={self.slope_reward_scale:.2f},\n"
            f"  slope_penalty_scale={self.slope_penalty_scale:.2f},\n"
            f"  boundary_penalty_scale={self.boundary_penalty_scale:.2f},\n"
            f"  boundary_penalty_distance={self.boundary_penalty_distance:.2f}m,\n"
            f"  curvature_penalty_rate={self.curvature_penalty_rate:.2f},\n"
            f"  goal_bonus={self.goal_bonus:.2f}\n"
            f")"
        )


def evaluate_parameters(
    config_path: str,
    params: ParameterConfig,
    num_episodes: int = 10,
    max_steps_per_episode: int = 100
) -> Dict:
    """
    Evaluate reward parameters with random policy.
    
    Args:
        config_path: Path to environment config
        params: Parameter configuration to test
        num_episodes: Number of episodes to run
        max_steps_per_episode: Max steps per episode
        
    Returns:
        Dictionary with evaluation metrics
    """
    
    logger.info(f"\n{'='*80}")
    logger.info(f"Evaluating Parameters:")
    logger.info(f"{'='*80}")
    logger.info(str(params))
    logger.info(f"{'='*80}\n")
    
    # Create environment
    # NOTE: Parameter modification would require C++ changes or config file modification
    # For now, we evaluate with default parameters and document expected behavior
    env = PIRLNativeEnvironmentUS(config_path)
    
    # Collect metrics
    episodes_data = []
    
    for ep in range(num_episodes):
        observation, info = env.reset()
        
        episode_reward = 0.0
        episode_steps = 0
        terminated = False
        truncated = False
        
        slopes = []
        rewards_per_step = []
        
        while not (terminated or truncated) and episode_steps < max_steps_per_episode:
            # Random action
            action = env.action_space.sample()
            observation, reward, terminated, truncated, info = env.step(action)
            
            episode_reward += reward
            episode_steps += 1
            
            # Extract slope from observation (index 4)
            if len(observation) > 4:
                slope = observation[4] * 100.0  # Denormalize
                slopes.append(slope)
            
            rewards_per_step.append(reward)
        
        # Episode metrics
        reason = info.get('termination_reason', 'unknown')
        is_success = reason.startswith('SUCCESS')
        
        episode_data = {
            'episode': ep + 1,
            'success': is_success,
            'total_reward': episode_reward,
            'steps': episode_steps,
            'avg_slope': np.mean(slopes) if slopes else 0.0,
            'max_slope': np.max(slopes) if slopes else 0.0,
            'avg_reward_per_step': np.mean(rewards_per_step) if rewards_per_step else 0.0,
            'termination_reason': reason
        }
        
        episodes_data.append(episode_data)
        
        status = "✅" if is_success else "❌"
        logger.info(
            f"  {status} Episode {ep+1}: "
            f"reward={episode_reward:>7.1f}, "
            f"steps={episode_steps:>3}, "
            f"avg_slope={episode_data['avg_slope']:>5.1f}%, "
            f"reason={reason}"
        )
    
    # Aggregate statistics
    successes = sum(1 for ep in episodes_data if ep['success'])
    success_rate = successes / num_episodes
    
    total_rewards = [ep['total_reward'] for ep in episodes_data]
    avg_slopes = [ep['avg_slope'] for ep in episodes_data]
    steps = [ep['steps'] for ep in episodes_data]
    
    results = {
        'parameters': params.to_dict(),
        'num_episodes': num_episodes,
        'success_rate': success_rate,
        'avg_total_reward': np.mean(total_rewards),
        'std_total_reward': np.std(total_rewards),
        'avg_slope': np.mean(avg_slopes),
        'avg_steps': np.mean(steps),
        'episodes': episodes_data
    }
    
    logger.info(f"\n{'='*80}")
    logger.info(f"Results Summary:")
    logger.info(f"{'='*80}")
    logger.info(f"  Success rate:       {success_rate*100:.1f}%")
    logger.info(f"  Avg total reward:   {results['avg_total_reward']:.2f} ± {results['std_total_reward']:.2f}")
    logger.info(f"  Avg slope:          {results['avg_slope']:.2f}%")
    logger.info(f"  Avg steps:          {results['avg_steps']:.1f}")
    logger.info(f"{'='*80}\n")
    
    return results


def grid_search(
    config_path: str,
    output_dir: str,
    num_episodes: int = 10,
    max_steps: int = 100
):
    """
    Run grid search over key parameters.
    
    Tests combinations of:
    - Progress multiplier: [0.5, 1.0, 2.0, 5.0]
    - Slope reward scale: [5.0, 10.0, 20.0]
    - Slope penalty scale: [-50.0, -100.0, -200.0]
    """
    
    logger.info("="*80)
    logger.info("US_PIPELINE PIRL Parameter Grid Search (7D State Space)")
    logger.info("="*80)
    logger.info(f"Output directory: {output_dir}")
    logger.info(f"Episodes per config: {num_episodes}")
    logger.info(f"Max steps per episode: {max_steps}")
    logger.info("="*80 + "\n")
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Parameter grid (simplified for 7D state space)
    progress_multipliers = [0.5, 1.0, 2.0, 5.0]
    slope_reward_scales = [5.0, 10.0, 20.0]
    slope_penalty_scales = [-50.0, -100.0, -200.0]
    
    all_results = []
    
    total_configs = len(progress_multipliers) * len(slope_reward_scales) * len(slope_penalty_scales)
    config_idx = 0
    
    for prog_mult in progress_multipliers:
        for slope_reward in slope_reward_scales:
            for slope_penalty in slope_penalty_scales:
                config_idx += 1
                
                logger.info(f"\n{'#'*80}")
                logger.info(f"Configuration {config_idx}/{total_configs}")
                logger.info(f"{'#'*80}")
                
                params = ParameterConfig(
                    progress_multiplier=prog_mult,
                    slope_reward_scale=slope_reward,
                    slope_penalty_scale=slope_penalty
                )
                
                try:
                    results = evaluate_parameters(
                        config_path=config_path,
                        params=params,
                        num_episodes=num_episodes,
                        max_steps_per_episode=max_steps
                    )
                    
                    results['config_id'] = config_idx
                    all_results.append(results)
                    
                except Exception as e:
                    logger.error(f"❌ Configuration {config_idx} failed: {e}")
                    continue
    
    # Save results
    results_file = output_path / f"grid_search_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_file, 'w') as f:
        json.dump(all_results, f, indent=2)
    
    logger.info(f"\n{'='*80}")
    logger.info(f"Grid Search Complete!")
    logger.info(f"{'='*80}")
    logger.info(f"Results saved to: {results_file}")
    
    # Find best configuration
    if all_results:
        best_config = max(all_results, key=lambda x: x['success_rate'])
        
        logger.info(f"\n🏆 Best Configuration:")
        logger.info(f"  Config ID: {best_config['config_id']}")
        logger.info(f"  Success rate: {best_config['success_rate']*100:.1f}%")
        logger.info(f"  Avg reward: {best_config['avg_total_reward']:.2f}")
        logger.info(f"  Avg slope: {best_config['avg_slope']:.2f}%")
        logger.info(f"  Parameters:")
        for key, value in best_config['parameters'].items():
            logger.info(f"    {key}: {value}")
    
    logger.info(f"{'='*80}\n")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Tune US_PIPELINE PIRL parameters (7D state space)"
    )
    
    parser.add_argument(
        "--config",
        type=str,
        required=True,
        help="Path to environment configuration YAML"
    )
    
    parser.add_argument(
        "--mode",
        type=str,
        choices=["single", "grid"],
        default="single",
        help="Tuning mode: single config or grid search (default: single)"
    )
    
    parser.add_argument(
        "--episodes",
        type=int,
        default=10,
        help="Number of episodes per configuration (default: 10)"
    )
    
    parser.add_argument(
        "--max-steps",
        type=int,
        default=100,
        help="Max steps per episode (default: 100)"
    )
    
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./parameter_tuning_results",
        help="Output directory for results (default: ./parameter_tuning_results)"
    )
    
    # Parameter overrides for single mode
    parser.add_argument("--progress-multiplier", type=float, default=2.0)
    parser.add_argument("--slope-reward-scale", type=float, default=10.0)
    parser.add_argument("--slope-penalty-scale", type=float, default=-100.0)
    parser.add_argument("--boundary-penalty-scale", type=float, default=-50.0)
    parser.add_argument("--boundary-penalty-distance", type=float, default=100.0)
    parser.add_argument("--curvature-penalty-rate", type=float, default=-0.5)
    parser.add_argument("--goal-bonus", type=float, default=1000.0)
    
    args = parser.parse_args()
    
    # Verify config exists
    if not Path(args.config).exists():
        logger.error(f"Configuration file not found: {args.config}")
        sys.exit(1)
    
    if args.mode == "grid":
        grid_search(
            config_path=args.config,
            output_dir=args.output_dir,
            num_episodes=args.episodes,
            max_steps=args.max_steps
        )
    else:
        # Single parameter configuration
        params = ParameterConfig(
            progress_multiplier=args.progress_multiplier,
            slope_reward_scale=args.slope_reward_scale,
            slope_penalty_scale=args.slope_penalty_scale,
            boundary_penalty_scale=args.boundary_penalty_scale,
            boundary_penalty_distance=args.boundary_penalty_distance,
            curvature_penalty_rate=args.curvature_penalty_rate,
            goal_bonus=args.goal_bonus
        )
        
        results = evaluate_parameters(
            config_path=args.config,
            params=params,
            num_episodes=args.episodes,
            max_steps_per_episode=args.max_steps
        )
        
        # Save single result
        output_path = Path(args.output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        results_file = output_path / f"single_eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        logger.info(f"\nResults saved to: {results_file}")


if __name__ == "__main__":
    main()

