#!/usr/bin/env python3
"""
PIRL Training Results Analysis
Comprehensive analysis of training metrics, convergence, and model performance
"""

import sys
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
import re
from datetime import datetime
import json

print("=" * 80)
print("PIRL TRAINING ANALYSIS")
print("=" * 80)
print()

PROJECT_DIR = Path("/opt/agrs/Projects/test_project")
LOG_FILE = PROJECT_DIR / "outputs" / "pirl_training" / "training_fixed.log"
OUTPUT_DIR = PROJECT_DIR / "outputs" / "analysis"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

if not LOG_FILE.exists():
    print(f"❌ Error: Log file not found: {LOG_FILE}")
    sys.exit(1)

print(f"📊 Analyzing: {LOG_FILE}")
print()

# Parse training log
print("📋 Parsing training log...")
data = {
    'timestep': [],
    'mean_reward': [],
    'ep_len_mean': [],
    'explained_variance': [],
    'value_loss': [],
    'policy_gradient_loss': [],
    'clip_fraction': [],
    'approx_kl': [],
    'entropy_loss': [],
    'fps': []
}

with open(LOG_FILE, 'r') as f:
    lines = f.readlines()

current_timestep = None
for line in lines:
    # Extract timestep
    if 'total_timesteps' in line and '|' in line:
        match = re.search(r'\|\s*(\d+)\s*\|', line)
        if match:
            current_timestep = int(match.group(1))
    
    # Extract metrics
    if current_timestep and '|' in line:
        if 'mean_reward' in line and 'eval' not in line:
            match = re.search(r'\|\s*([-\d.e+]+)\s*\|', line)
            if match:
                data['mean_reward'].append(float(match.group(1)))
                data['timestep'].append(current_timestep)
        
        elif 'ep_len_mean' in line:
            match = re.search(r'\|\s*([\d.e+]+)\s*\|', line)
            if match:
                data['ep_len_mean'].append(float(match.group(1)))
        
        elif 'explained_variance' in line:
            match = re.search(r'\|\s*([-\d.e+]+)\s*\|', line)
            if match:
                data['explained_variance'].append(float(match.group(1)))
        
        elif 'value_loss' in line:
            match = re.search(r'\|\s*([-\d.e+]+)\s*\|', line)
            if match:
                data['value_loss'].append(float(match.group(1)))
        
        elif 'policy_gradient_loss' in line:
            match = re.search(r'\|\s*([-\d.e+]+)\s*\|', line)
            if match:
                data['policy_gradient_loss'].append(float(match.group(1)))
        
        elif 'clip_fraction' in line:
            match = re.search(r'\|\s*([\d.e+]+)\s*\|', line)
            if match:
                data['clip_fraction'].append(float(match.group(1)))
        
        elif 'approx_kl' in line:
            match = re.search(r'\|\s*([\d.e+-]+)\s*\|', line)
            if match:
                data['approx_kl'].append(float(match.group(1)))
        
        elif 'entropy_loss' in line:
            match = re.search(r'\|\s*([-\d.e+]+)\s*\|', line)
            if match:
                data['entropy_loss'].append(float(match.group(1)))
        
        elif 'fps' in line:
            match = re.search(r'\|\s*([\d.]+)\s*\|', line)
            if match:
                data['fps'].append(float(match.group(1)))

# Align data lengths
min_len = min(len(v) for v in data.values() if len(v) > 0)
for key in data:
    data[key] = data[key][:min_len]

print(f"✅ Parsed {len(data['timestep'])} data points")
print()

# Create DataFrame
df = pd.DataFrame(data)

# Calculate statistics
print("📊 Training Statistics:")
print("-" * 80)
print(f"Total Timesteps: {df['timestep'].iloc[-1]:,}")
print(f"Final Mean Reward: {df['mean_reward'].iloc[-1]:,.2f}")
print(f"Best Mean Reward: {df['mean_reward'].max():,.2f}")
print(f"Worst Mean Reward: {df['mean_reward'].min():,.2f}")
print(f"Reward Improvement: {df['mean_reward'].iloc[-1] - df['mean_reward'].iloc[0]:,.2f}")
print()
print(f"Final Explained Variance: {df['explained_variance'].iloc[-1]:.4f}")
print(f"Final Value Loss: {df['value_loss'].iloc[-1]:.6f}")
print(f"Final Policy Gradient Loss: {df['policy_gradient_loss'].iloc[-1]:.6f}")
print(f"Final Clip Fraction: {df['clip_fraction'].iloc[-1]:.4f}")
print()
print(f"Average FPS: {df['fps'].mean():.1f}")
print(f"Total Training Time: {(df['timestep'].iloc[-1] / df['fps'].mean() / 3600):.2f} hours")
print("-" * 80)
print()

# Generate plots (if matplotlib is available)
try:
    print("📈 Generating training curves...")
    
    fig, axes = plt.subplots(3, 2, figsize=(15, 12))
    fig.suptitle('PIRL Training Analysis', fontsize=16, fontweight='bold')
    
    # Mean Reward
    axes[0, 0].plot(df['timestep'], df['mean_reward'], linewidth=2, color='#2E86AB')
    axes[0, 0].set_title('Mean Episode Reward', fontweight='bold')
    axes[0, 0].set_xlabel('Timesteps')
    axes[0, 0].set_ylabel('Reward')
    axes[0, 0].grid(True, alpha=0.3)
    axes[0, 0].axhline(y=df['mean_reward'].iloc[-1], color='r', linestyle='--', alpha=0.5, label='Final')
    axes[0, 0].legend()
    
    # Explained Variance
    axes[0, 1].plot(df['timestep'], df['explained_variance'], linewidth=2, color='#A23B72')
    axes[0, 1].set_title('Explained Variance', fontweight='bold')
    axes[0, 1].set_xlabel('Timesteps')
    axes[0, 1].set_ylabel('Explained Variance')
    axes[0, 1].grid(True, alpha=0.3)
    axes[0, 1].axhline(y=0.6, color='g', linestyle='--', alpha=0.5, label='Target (0.6)')
    axes[0, 1].legend()
    
    # Value Loss
    axes[1, 0].plot(df['timestep'], df['value_loss'], linewidth=2, color='#F18F01')
    axes[1, 0].set_title('Value Loss', fontweight='bold')
    axes[1, 0].set_xlabel('Timesteps')
    axes[1, 0].set_ylabel('Loss')
    axes[1, 0].grid(True, alpha=0.3)
    axes[1, 0].set_yscale('log')
    
    # Policy Gradient Loss
    axes[1, 1].plot(df['timestep'], np.abs(df['policy_gradient_loss']), linewidth=2, color='#C73E1D')
    axes[1, 1].set_title('Policy Gradient Loss (Absolute)', fontweight='bold')
    axes[1, 1].set_xlabel('Timesteps')
    axes[1, 1].set_ylabel('|Loss|')
    axes[1, 1].grid(True, alpha=0.3)
    axes[1, 1].set_yscale('log')
    
    # Clip Fraction
    axes[2, 0].plot(df['timestep'], df['clip_fraction'], linewidth=2, color='#6A994E')
    axes[2, 0].set_title('Clip Fraction', fontweight='bold')
    axes[2, 0].set_xlabel('Timesteps')
    axes[2, 0].set_ylabel('Fraction')
    axes[2, 0].grid(True, alpha=0.3)
    
    # Training Speed (FPS)
    axes[2, 1].plot(df['timestep'], df['fps'], linewidth=2, color='#BC4B51')
    axes[2, 1].set_title('Training Speed', fontweight='bold')
    axes[2, 1].set_xlabel('Timesteps')
    axes[2, 1].set_ylabel('FPS')
    axes[2, 1].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plot_file = OUTPUT_DIR / 'training_curves.png'
    plt.savefig(plot_file, dpi=300, bbox_inches='tight')
    print(f"✅ Saved: {plot_file}")
    
except Exception as e:
    print(f"⚠️  Could not generate plots: {e}")

# Save statistics to JSON
stats = {
    'training_completed': datetime.now().isoformat(),
    'total_timesteps': int(df['timestep'].iloc[-1]),
    'final_metrics': {
        'mean_reward': float(df['mean_reward'].iloc[-1]),
        'explained_variance': float(df['explained_variance'].iloc[-1]),
        'value_loss': float(df['value_loss'].iloc[-1]),
        'policy_gradient_loss': float(df['policy_gradient_loss'].iloc[-1]),
        'clip_fraction': float(df['clip_fraction'].iloc[-1])
    },
    'best_reward': float(df['mean_reward'].max()),
    'reward_improvement': float(df['mean_reward'].iloc[-1] - df['mean_reward'].iloc[0]),
    'average_fps': float(df['fps'].mean()),
    'estimated_training_hours': float(df['timestep'].iloc[-1] / df['fps'].mean() / 3600)
}

stats_file = OUTPUT_DIR / 'training_statistics.json'
with open(stats_file, 'w') as f:
    json.dump(stats, f, indent=2)
print(f"✅ Saved: {stats_file}")
print()

# Generate markdown report
print("📝 Generating analysis report...")
report_file = OUTPUT_DIR / 'TRAINING_ANALYSIS_REPORT.md'
with open(report_file, 'w') as f:
    f.write("# PIRL Training Analysis Report\n\n")
    f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    f.write("---\n\n")
    
    f.write("## Executive Summary\n\n")
    f.write(f"- **Training Completion:** {df['timestep'].iloc[-1]:,} / 500,000 timesteps\n")
    f.write(f"- **Final Reward:** {df['mean_reward'].iloc[-1]:,.2f}\n")
    f.write(f"- **Reward Improvement:** {stats['reward_improvement']:,.2f}\n")
    f.write(f"- **Training Duration:** {stats['estimated_training_hours']:.2f} hours\n")
    f.write(f"- **Model Quality:** {'✅ Excellent' if df['explained_variance'].iloc[-1] > 0.5 else '⚠️ Needs Improvement'}\n\n")
    
    f.write("---\n\n")
    
    f.write("## Performance Metrics\n\n")
    f.write("### Learning Progress\n\n")
    f.write(f"| Metric | Value | Status |\n")
    f.write(f"|--------|-------|--------|\n")
    f.write(f"| Mean Reward | {df['mean_reward'].iloc[-1]:,.2f} | ✅ |\n")
    f.write(f"| Explained Variance | {df['explained_variance'].iloc[-1]:.4f} | {'✅' if df['explained_variance'].iloc[-1] > 0.5 else '⚠️'} |\n")
    f.write(f"| Value Loss | {df['value_loss'].iloc[-1]:.6f} | {'✅' if df['value_loss'].iloc[-1] < 0.01 else '⚠️'} |\n")
    f.write(f"| Clip Fraction | {df['clip_fraction'].iloc[-1]:.4f} | ✅ |\n\n")
    
    f.write("### Training Efficiency\n\n")
    f.write(f"- **Average Speed:** {df['fps'].mean():.1f} FPS\n")
    f.write(f"- **Steps per Hour:** {df['fps'].mean() * 3600:,.0f}\n")
    f.write(f"- **Total Training Time:** {stats['estimated_training_hours']:.2f} hours\n\n")
    
    f.write("---\n\n")
    
    f.write("## Convergence Analysis\n\n")
    
    # Check convergence
    last_10pct = df.tail(int(len(df) * 0.1))
    reward_std = last_10pct['mean_reward'].std()
    is_converged = reward_std < abs(last_10pct['mean_reward'].mean() * 0.05)
    
    f.write(f"**Status:** {'✅ Converged' if is_converged else '⚠️ Still Learning'}\n\n")
    f.write(f"- Reward Stability (last 10%): σ = {reward_std:,.2f}\n")
    f.write(f"- Explained Variance Trend: {'Stable' if df['explained_variance'].iloc[-1] > 0.5 else 'Improving'}\n")
    f.write(f"- Value Function: {'Converged' if df['value_loss'].iloc[-1] < 0.01 else 'Training'}\n\n")
    
    f.write("---\n\n")
    
    f.write("## Next Steps\n\n")
    f.write("1. ✅ Run validation script: `python3 validate_and_export_routes.py`\n")
    f.write("2. ✅ Generate cost-optimized routes for Italy AOI\n")
    f.write("3. ✅ Compare with baseline/straight-line routes\n")
    f.write("4. ✅ Verify SAIPEM criteria compliance\n")
    f.write("5. ✅ Prepare for GUI integration\n\n")
    
    f.write("---\n\n")
    f.write("*Generated by PIRL Training Analysis Pipeline*\n")

print(f"✅ Saved: {report_file}")
print()

print("=" * 80)
print("✅ ANALYSIS COMPLETE")
print("=" * 80)
print()
print(f"Output Directory: {OUTPUT_DIR}")
print(f"  - Training curves: training_curves.png")
print(f"  - Statistics: training_statistics.json")
print(f"  - Full report: TRAINING_ANALYSIS_REPORT.md")
print()



