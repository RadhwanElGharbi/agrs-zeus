#!/usr/bin/env python3
"""
PIRL Model Deployment Script

This script deploys trained PIRL models for production use.
"""

import argparse
import yaml
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
import numpy as np
import json

# RL libraries
import gymnasium as gym
from stable_baselines3 import PPO, SAC

# Custom environment
from pirl_env import PIRLEnvironment, make_pirl_env

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class PIRLDeployment:
    """Class for deploying trained PIRL models."""
    
    def __init__(self, model_path: str, config_path: str):
        """Initialize deployment with trained model and config."""
        self.model_path = Path(model_path)
        self.config_path = config_path
        
        if not self.model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")
        
        # Load model
        self.model = self._load_model()
        
        # Create environment
        self.env = make_pirl_env(config_path)
        
        logger.info(f"Deployment initialized with model: {model_path}")
        logger.info(f"Environment config: {config_path}")
    
    def _load_model(self):
        """Load trained model."""
        # Determine algorithm from model path or file content
        if 'ppo' in str(self.model_path).lower():
            model_class = PPO
        elif 'sac' in str(self.model_path).lower():
            model_class = SAC
        else:
            # Try to load and determine from model metadata
            try:
                # Try PPO first
                model = PPO.load(str(self.model_path))
                logger.info("Loaded PPO model")
                return model
            except:
                try:
                    # Try SAC
                    model = SAC.load(str(self.model_path))
                    logger.info("Loaded SAC model")
                    return model
                except Exception as e:
                    raise ValueError(f"Could not load model: {e}")
        
        return model_class.load(str(self.model_path))
    
    def generate_route(self, deterministic: bool = True, max_steps: int = 5000) -> Dict[str, Any]:
        """Generate a single route using the trained model."""
        obs, info = self.env.reset()
        
        route_points = []
        rewards = []
        actions = []
        
        step_count = 0
        total_reward = 0.0
        
        while step_count < max_steps:
            # Get action from model
            action, _ = self.model.predict(obs, deterministic=deterministic)
            
            # Execute action
            obs, reward, terminated, truncated, info = self.env.step(action)
            
            # Record data
            route_points.append([info['reward_info']['x'], info['reward_info']['y']])
            rewards.append(reward)
            actions.append(action.tolist())
            total_reward += reward
            
            step_count += 1
            
            if terminated or truncated:
                break
        
        route_info = {
            'route_points': route_points,
            'total_reward': total_reward,
            'total_steps': step_count,
            'terminated': terminated,
            'truncated': truncated,
            'final_distance_to_goal': info.get('goal_distance', 0.0),
            'actions': actions,
            'rewards': rewards
        }
        
        logger.info(f"Route generated: {step_count} steps, reward: {total_reward:.2f}")
        
        return route_info
    
    def generate_multiple_routes(self, num_routes: int = 5, deterministic: bool = True) -> List[Dict[str, Any]]:
        """Generate multiple routes for comparison."""
        routes = []
        
        for i in range(num_routes):
            logger.info(f"Generating route {i + 1}/{num_routes}")
            route = self.generate_route(deterministic=deterministic)
            route['route_id'] = i + 1
            routes.append(route)
        
        return routes
    
    def evaluate_performance(self, num_episodes: int = 10, deterministic: bool = True) -> Dict[str, float]:
        """Evaluate model performance over multiple episodes."""
        episode_rewards = []
        episode_lengths = []
        success_rate = 0.0
        
        for episode in range(num_episodes):
            route = self.generate_route(deterministic=deterministic)
            
            episode_rewards.append(route['total_reward'])
            episode_lengths.append(route['total_steps'])
            
            if route['terminated'] and not route['truncated']:
                success_rate += 1.0
        
        success_rate /= num_episodes
        
        performance_stats = {
            'mean_reward': np.mean(episode_rewards),
            'std_reward': np.std(episode_rewards),
            'mean_length': np.mean(episode_lengths),
            'std_length': np.std(episode_lengths),
            'success_rate': success_rate,
            'num_episodes': num_episodes
        }
        
        logger.info(f"Performance evaluation completed:")
        logger.info(f"  Mean reward: {performance_stats['mean_reward']:.2f} ± {performance_stats['std_reward']:.2f}")
        logger.info(f"  Mean length: {performance_stats['mean_length']:.1f} ± {performance_stats['std_length']:.1f}")
        logger.info(f"  Success rate: {performance_stats['success_rate']:.2%}")
        
        return performance_stats
    
    def export_route_to_geojson(self, route_info: Dict[str, Any], output_path: str):
        """Export route to GeoJSON format."""
        route_points = route_info['route_points']
        
        # Create GeoJSON structure
        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "route_id": route_info.get('route_id', 1),
                        "total_reward": route_info['total_reward'],
                        "total_steps": route_info['total_steps'],
                        "terminated": route_info['terminated'],
                        "truncated": route_info['truncated'],
                        "final_distance_to_goal": route_info.get('final_distance_to_goal', 0.0)
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": route_points
                    }
                }
            ]
        }
        
        # Save to file
        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2)
        
        logger.info(f"Route exported to GeoJSON: {output_path}")
    
    def export_routes_to_geojson(self, routes: List[Dict[str, Any]], output_path: str):
        """Export multiple routes to GeoJSON format."""
        features = []
        
        for route in routes:
            feature = {
                "type": "Feature",
                "properties": {
                    "route_id": route.get('route_id', 1),
                    "total_reward": route['total_reward'],
                    "total_steps": route['total_steps'],
                    "terminated": route['terminated'],
                    "truncated": route['truncated'],
                    "final_distance_to_goal": route.get('final_distance_to_goal', 0.0)
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": route['route_points']
                }
            }
            features.append(feature)
        
        geojson = {
            "type": "FeatureCollection",
            "features": features
        }
        
        # Save to file
        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2)
        
        logger.info(f"Multiple routes exported to GeoJSON: {output_path}")
    
    def close(self):
        """Clean up resources."""
        self.env.close()


def main():
    """Main deployment function."""
    parser = argparse.ArgumentParser(description="Deploy trained PIRL model")
    parser.add_argument("--model", required=True, help="Path to trained model file")
    parser.add_argument("--config", required=True, help="Path to project configuration")
    parser.add_argument("--output-dir", default="./pirl_deployment_output", help="Output directory")
    parser.add_argument("--num-routes", type=int, default=5, help="Number of routes to generate")
    parser.add_argument("--eval-episodes", type=int, default=10, help="Number of evaluation episodes")
    parser.add_argument("--deterministic", action="store_true", default=True, help="Use deterministic policy")
    parser.add_argument("--stochastic", action="store_true", help="Use stochastic policy (overrides deterministic)")
    
    args = parser.parse_args()
    
    # Create output directory
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine policy type
    deterministic = args.deterministic and not args.stochastic
    
    try:
        # Initialize deployment
        deployment = PIRLDeployment(args.model, args.config)
        
        # Generate routes
        logger.info(f"Generating {args.num_routes} routes...")
        routes = deployment.generate_multiple_routes(
            num_routes=args.num_routes,
            deterministic=deterministic
        )
        
        # Evaluate performance
        logger.info(f"Evaluating performance over {args.eval_episodes} episodes...")
        performance = deployment.evaluate_performance(
            num_episodes=args.eval_episodes,
            deterministic=deterministic
        )
        
        # Export routes
        routes_geojson_path = output_dir / 'pirl_routes.geojson'
        deployment.export_routes_to_geojson(routes, str(routes_geojson_path))
        
        # Export performance statistics
        performance_path = output_dir / 'performance_stats.yaml'
        with open(performance_path, 'w') as f:
            yaml.dump(performance, f, default_flow_style=False)
        
        # Export route details
        routes_details_path = output_dir / 'routes_details.json'
        with open(routes_details_path, 'w') as f:
            json.dump(routes, f, indent=2)
        
        # Create summary report
        summary = {
            'model_path': str(args.model),
            'config_path': str(args.config),
            'policy_type': 'deterministic' if deterministic else 'stochastic',
            'num_routes_generated': args.num_routes,
            'evaluation_episodes': args.eval_episodes,
            'performance_stats': performance,
            'output_files': {
                'routes_geojson': str(routes_geojson_path),
                'performance_stats': str(performance_path),
                'routes_details': str(routes_details_path)
            }
        }
        
        summary_path = output_dir / 'deployment_summary.yaml'
        with open(summary_path, 'w') as f:
            yaml.dump(summary, f, default_flow_style=False)
        
        logger.info(f"Deployment completed successfully!")
        logger.info(f"Results saved to: {output_dir}")
        logger.info(f"Summary: {summary_path}")
        
    except Exception as e:
        logger.error(f"Deployment failed: {e}")
        return 1
    
    finally:
        if 'deployment' in locals():
            deployment.close()
    
    return 0


if __name__ == "__main__":
    exit(main())


