#!/usr/bin/env python3
"""
PIRL Training Analytics Script

Analyzes TensorBoard logs and generates comprehensive training report.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Any
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
from datetime import datetime

try:
    from tensorboard.backend.event_processing import event_accumulator
except ImportError:
    print("ERROR: tensorboard package required")
    print("Install: pip install tensorboard")
    sys.exit(1)


def parse_tensorboard_logs(log_dir: Path) -> Dict[str, Any]:
    """Parse TensorBoard event files."""
    print(f"Parsing TensorBoard logs from: {log_dir}")
    
    ea = event_accumulator.EventAccumulator(str(log_dir))
    ea.Reload()
    
    data = {}
    
    # Get available tags
    tags = ea.Tags()
    print(f"Available scalar tags: {len(tags.get('scalars', []))}")
    
    # Extract scalars
    for tag in tags.get('scalars', []):
        events = ea.Scalars(tag)
        data[tag] = {
            'steps': [e.step for e in events],
            'values': [e.value for e in events],
            'wall_time': [e.wall_time for e in events]
        }
    
    return data


def calculate_statistics(data: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate training statistics."""
    stats = {}
    
    # Episode reward statistics
    if 'rollout/ep_rew_mean' in data:
        rewards = np.array(data['rollout/ep_rew_mean']['values'])
        stats['reward'] = {
            'initial': float(rewards[0]) if len(rewards) > 0 else 0,
            'final': float(rewards[-1]) if len(rewards) > 0 else 0,
            'max': float(np.max(rewards)) if len(rewards) > 0 else 0,
            'min': float(np.min(rewards)) if len(rewards) > 0 else 0,
            'mean': float(np.mean(rewards)) if len(rewards) > 0 else 0,
            'std': float(np.std(rewards)) if len(rewards) > 0 else 0,
            'improvement': float(rewards[-1] - rewards[0]) if len(rewards) > 0 else 0
        }
    
    # Episode length statistics
    if 'rollout/ep_len_mean' in data:
        lengths = np.array(data['rollout/ep_len_mean']['values'])
        stats['episode_length'] = {
            'initial': float(lengths[0]) if len(lengths) > 0 else 0,
            'final': float(lengths[-1]) if len(lengths) > 0 else 0,
            'mean': float(np.mean(lengths)) if len(lengths) > 0 else 0,
            'max': float(np.max(lengths)) if len(lengths) > 0 else 0
        }
    
    # Training duration
    if 'time/total_timesteps' in data:
        timesteps = data['time/total_timesteps']['steps']
        wall_times = data['time/total_timesteps']['wall_time']
        if len(wall_times) > 1:
            duration_seconds = wall_times[-1] - wall_times[0]
            stats['training_duration'] = {
                'seconds': float(duration_seconds),
                'minutes': float(duration_seconds / 60),
                'hours': float(duration_seconds / 3600),
                'total_timesteps': int(timesteps[-1]) if len(timesteps) > 0 else 0
            }
    
    return stats


def generate_plots(data: Dict[str, Any], output_dir: Path):
    """Generate training visualization plots."""
    print("Generating plots...")
    plots_dir = output_dir / 'training_plots'
    plots_dir.mkdir(exist_ok=True, parents=True)
    
    # Plot 1: Episode Reward
    if 'rollout/ep_rew_mean' in data:
        plt.figure(figsize=(12, 6))
        steps = data['rollout/ep_rew_mean']['steps']
        values = data['rollout/ep_rew_mean']['values']
        plt.plot(steps, values, linewidth=2, label='Mean Episode Reward')
        plt.xlabel('Timesteps')
        plt.ylabel('Reward')
        plt.title('Training Progress: Episode Reward')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.savefig(plots_dir / 'episode_reward.png', dpi=150, bbox_inches='tight')
        plt.close()
        print(f"  ✅ Saved: episode_reward.png")
    
    # Plot 2: Episode Length
    if 'rollout/ep_len_mean' in data:
        plt.figure(figsize=(12, 6))
        steps = data['rollout/ep_len_mean']['steps']
        values = data['rollout/ep_len_mean']['values']
        plt.plot(steps, values, linewidth=2, color='orange', label='Mean Episode Length')
        plt.xlabel('Timesteps')
        plt.ylabel('Steps')
        plt.title('Training Progress: Episode Length')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.savefig(plots_dir / 'episode_length.png', dpi=150, bbox_inches='tight')
        plt.close()
        print(f"  ✅ Saved: episode_length.png")
    
    # Plot 3: Learning Rate
    if 'train/learning_rate' in data:
        plt.figure(figsize=(12, 6))
        steps = data['train/learning_rate']['steps']
        values = data['train/learning_rate']['values']
        plt.plot(steps, values, linewidth=2, color='green', label='Learning Rate')
        plt.xlabel('Timesteps')
        plt.ylabel('Learning Rate')
        plt.title('Training: Learning Rate Schedule')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.savefig(plots_dir / 'learning_rate.png', dpi=150, bbox_inches='tight')
        plt.close()
        print(f"  ✅ Saved: learning_rate.png")
    
    # Plot 4: Value Loss
    if 'train/value_loss' in data:
        plt.figure(figsize=(12, 6))
        steps = data['train/value_loss']['steps']
        values = data['train/value_loss']['values']
        plt.plot(steps, values, linewidth=2, color='red', label='Value Loss')
        plt.xlabel('Timesteps')
        plt.ylabel('Loss')
        plt.title('Training: Value Loss')
        plt.legend()
        plt.grid(True, alpha=0.3)
        plt.savefig(plots_dir / 'value_loss.png', dpi=150, bbox_inches='tight')
        plt.close()
        print(f"  ✅ Saved: value_loss.png")
    
    # Plot 5: Multi-metric dashboard
    fig, axs = plt.subplots(2, 2, figsize=(16, 12))
    
    if 'rollout/ep_rew_mean' in data:
        axs[0, 0].plot(data['rollout/ep_rew_mean']['steps'],
                       data['rollout/ep_rew_mean']['values'],
                       linewidth=2)
        axs[0, 0].set_title('Episode Reward')
        axs[0, 0].set_xlabel('Timesteps')
        axs[0, 0].set_ylabel('Reward')
        axs[0, 0].grid(True, alpha=0.3)
    
    if 'rollout/ep_len_mean' in data:
        axs[0, 1].plot(data['rollout/ep_len_mean']['steps'],
                       data['rollout/ep_len_mean']['values'],
                       linewidth=2, color='orange')
        axs[0, 1].set_title('Episode Length')
        axs[0, 1].set_xlabel('Timesteps')
        axs[0, 1].set_ylabel('Steps')
        axs[0, 1].grid(True, alpha=0.3)
    
    if 'train/value_loss' in data:
        axs[1, 0].plot(data['train/value_loss']['steps'],
                       data['train/value_loss']['values'],
                       linewidth=2, color='red')
        axs[1, 0].set_title('Value Loss')
        axs[1, 0].set_xlabel('Timesteps')
        axs[1, 0].set_ylabel('Loss')
        axs[1, 0].grid(True, alpha=0.3)
    
    if 'train/policy_loss' in data:
        axs[1, 1].plot(data['train/policy_loss']['steps'],
                       data['train/policy_loss']['values'],
                       linewidth=2, color='purple')
        axs[1, 1].set_title('Policy Loss')
        axs[1, 1].set_xlabel('Timesteps')
        axs[1, 1].set_ylabel('Loss')
        axs[1, 1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(plots_dir / 'dashboard.png', dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  ✅ Saved: dashboard.png")


def generate_report(stats: Dict[str, Any], output_dir: Path, config_name: str):
    """Generate markdown training report."""
    print("Generating report...")
    
    report = []
    report.append(f"# PIRL Training Analytics Report")
    report.append(f"")
    report.append(f"**Configuration:** {config_name}")
    report.append(f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append(f"")
    report.append(f"---")
    report.append(f"")
    
    # Training Duration
    if 'training_duration' in stats:
        dur = stats['training_duration']
        report.append(f"## Training Duration")
        report.append(f"")
        report.append(f"- **Total timesteps:** {dur['total_timesteps']:,}")
        report.append(f"- **Duration:** {dur['hours']:.2f} hours ({dur['minutes']:.1f} minutes)")
        report.append(f"- **Throughput:** {dur['total_timesteps'] / dur['seconds']:.1f} steps/second")
        report.append(f"")
    
    # Reward Statistics
    if 'reward' in stats:
        rew = stats['reward']
        report.append(f"## Reward Statistics")
        report.append(f"")
        report.append(f"- **Initial:** {rew['initial']:.2f}")
        report.append(f"- **Final:** {rew['final']:.2f}")
        report.append(f"- **Improvement:** {rew['improvement']:.2f} ({rew['improvement']/abs(rew['initial'])*100:.1f}%)")
        report.append(f"- **Mean:** {rew['mean']:.2f} ± {rew['std']:.2f}")
        report.append(f"- **Max:** {rew['max']:.2f}")
        report.append(f"- **Min:** {rew['min']:.2f}")
        report.append(f"")
    
    # Episode Length Statistics
    if 'episode_length' in stats:
        ep_len = stats['episode_length']
        report.append(f"## Episode Length Statistics")
        report.append(f"")
        report.append(f"- **Initial:** {ep_len['initial']:.1f} steps")
        report.append(f"- **Final:** {ep_len['final']:.1f} steps")
        report.append(f"- **Mean:** {ep_len['mean']:.1f} steps")
        report.append(f"- **Max:** {ep_len['max']:.1f} steps")
        report.append(f"")
    
    # Visualizations
    report.append(f"## Visualizations")
    report.append(f"")
    report.append(f"Training plots are available in: `training_plots/`")
    report.append(f"")
    report.append(f"- `episode_reward.png` - Reward progression over time")
    report.append(f"- `episode_length.png` - Episode length progression")
    report.append(f"- `learning_rate.png` - Learning rate schedule")
    report.append(f"- `value_loss.png` - Value function loss")
    report.append(f"- `dashboard.png` - Multi-metric overview")
    report.append(f"")
    
    # Save report
    report_path = output_dir / 'analytics_report.md'
    with open(report_path, 'w') as f:
        f.write('\n'.join(report))
    
    print(f"✅ Report saved: {report_path}")


def main():
    parser = argparse.ArgumentParser(description="Analyze PIRL training run")
    parser.add_argument('output_dir', type=str, help="Training output directory")
    parser.add_argument('--config-name', type=str, default='Unknown',
                        help="Configuration name for report")
    
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    tensorboard_dir = output_dir / 'tensorboard'
    
    if not tensorboard_dir.exists():
        print(f"ERROR: TensorBoard directory not found: {tensorboard_dir}")
        return 1
    
    print("=" * 80)
    print("PIRL TRAINING ANALYTICS")
    print("=" * 80)
    print()
    
    # Parse logs
    data = parse_tensorboard_logs(tensorboard_dir)
    
    # Calculate statistics
    stats = calculate_statistics(data)
    
    # Save statistics JSON
    stats_path = output_dir / 'training_statistics.json'
    with open(stats_path, 'w') as f:
        json.dump(stats, f, indent=2)
    print(f"✅ Statistics saved: {stats_path}")
    
    # Generate plots
    generate_plots(data, output_dir)
    
    # Generate report
    generate_report(stats, output_dir, args.config_name)
    
    print()
    print("=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)
    print(f"Report: {output_dir}/analytics_report.md")
    print(f"Plots: {output_dir}/training_plots/")
    print(f"Stats: {output_dir}/training_statistics.json")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

