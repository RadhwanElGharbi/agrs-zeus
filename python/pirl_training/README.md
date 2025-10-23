# PIRL Python Training System

This directory contains the Python training infrastructure for PIRL (Physics-Informed Reinforcement Learning) pipeline routing models.

## Overview

The PIRL training system provides a complete workflow for training, optimizing, and deploying reinforcement learning models for pipeline route optimization. It integrates with the C++ PIRL core through a Python-Gymnasium interface.

## Directory Structure

```
python/pirl_training/
├── README.md                          # This file
├── requirements.txt                   # Python dependencies
├── pirl_env.py                       # Gymnasium environment wrapper
├── train_pirl.py                     # Main training script
├── hyperopt_pirl.py                  # Hyperparameter optimization
├── deploy_pirl.py                    # Model deployment script
├── training_config_template.yaml     # Training configuration template
├── hyperopt_config_template.yaml     # Hyperparameter optimization template
└── examples/                         # Example configurations and scripts
    ├── saipem_training_config.yaml
    ├── saipem_hyperopt_config.yaml
    └── quick_start.sh
```

## Installation

1. **Install Python dependencies:**
   ```bash
   cd /opt/agrs/python/pirl_training
   pip install -r requirements.txt
   ```

2. **Ensure ZEUS CLI is available:**
   ```bash
   # Make sure zeus command is in PATH
   which zeus
   ```

## Quick Start

### 1. Create Project Configuration

First, create a PIRL project configuration:

```bash
zeus tools pirl_create_config --project "MyPipelineProject" --output my_project_config.yaml
```

Edit the generated configuration file with your project details:
- Set start and end coordinates
- Configure cost weights and constraints
- Specify data paths

### 2. Train a Model

Create a training configuration:

```bash
cp training_config_template.yaml my_training_config.yaml
```

Edit `my_training_config.yaml` to point to your project configuration:

```yaml
env_configs:
  - "/path/to/my_project_config.yaml"
```

Start training:

```bash
python train_pirl.py --config my_training_config.yaml
```

### 3. Deploy Trained Model

```bash
python deploy_pirl.py --model ./pirl_training_output/best_model.zip --config my_project_config.yaml
```

## Detailed Usage

### Training Script (`train_pirl.py`)

The main training script supports various algorithms and configurations:

```bash
# Basic training
python train_pirl.py --config training_config.yaml

# Evaluation only
python train_pirl.py --config training_config.yaml --eval-only --model-path best_model.zip --episodes 20
```

**Key features:**
- Supports PPO and SAC algorithms
- Vectorized environments for parallel training
- TensorBoard logging
- Automatic model evaluation
- Callback system for monitoring

### Hyperparameter Optimization (`hyperopt_pirl.py`)

Optimize hyperparameters using Optuna:

```bash
# Create hyperopt config
cp hyperopt_config_template.yaml my_hyperopt_config.yaml

# Run optimization
python hyperopt_pirl.py --config my_hyperopt_config.yaml --trials 100
```

**Key features:**
- Bayesian optimization with TPE sampler
- Pruning of unpromising trials
- Automatic best parameter export
- Progress tracking and visualization

### Model Deployment (`deploy_pirl.py`)

Deploy trained models for production use:

```bash
python deploy_pirl.py \
    --model trained_model.zip \
    --config project_config.yaml \
    --num-routes 10 \
    --eval-episodes 20 \
    --output-dir ./deployment_results
```

**Outputs:**
- GeoJSON route files
- Performance statistics
- Route comparison data
- Deployment summary

## Configuration Files

### Training Configuration

The training configuration (`training_config_template.yaml`) controls:

- **Algorithm selection:** PPO or SAC
- **Training parameters:** timesteps, learning rate, batch size
- **Environment setup:** project configurations, parallel environments
- **Output settings:** model save path, logging directory
- **Monitoring:** evaluation frequency, callbacks

### Hyperparameter Optimization Configuration

The hyperopt configuration (`hyperopt_config_template.yaml`) defines:

- **Search space:** parameter ranges and types
- **Optimization settings:** number of trials, timeout
- **Trial parameters:** training timesteps per trial
- **Output configuration:** results directory

## Environment Interface

The `PIRLEnvironment` class provides a Gymnasium-compatible interface to the C++ PIRL core:

### State Space (12 dimensions)
- `x, y`: Current position
- `goal_distance, goal_bearing`: Navigation info
- `elevation, slope, aspect, curvature`: Terrain features
- `no_go_zone, water_proximity, road_proximity`: Constraints
- `prev_heading`: Movement continuity

### Action Space (2 dimensions)
- `heading_change`: [-π/4, π/4] radians
- `step_size`: [10, 100] meters

### Reward Function
- **Progress reward:** Distance to goal improvement
- **Cost penalty:** Construction cost of route segment
- **Constraint violations:** Physics and environmental penalties
- **Goal bonus:** Large reward for reaching destination

## Training Workflow

1. **Environment Setup**
   - Load project configuration
   - Initialize C++ PipelineEnvironment
   - Create Python-Gymnasium wrapper

2. **Model Training**
   - Create vectorized environments
   - Initialize RL algorithm (PPO/SAC)
   - Train with callbacks and monitoring

3. **Evaluation**
   - Test on held-out scenarios
   - Generate performance metrics
   - Export results

4. **Deployment**
   - Load trained model
   - Generate production routes
   - Export in standard formats

## Monitoring and Logging

### TensorBoard
```bash
tensorboard --logdir ./pirl_training_output/logs
```

### Optuna Dashboard (for hyperparameter optimization)
```bash
optuna-dashboard sqlite:///hyperopt.db
```

## Advanced Features

### Curriculum Learning
Configure progressive difficulty training:

```yaml
curriculum:
  enabled: true
  stages:
    - name: "easy_terrain"
      difficulty: 0.3
      timesteps: 200000
    - name: "medium_terrain"
      difficulty: 0.6
      timesteps: 400000
```

### Multi-Project Training
Train on multiple project configurations:

```yaml
env_configs:
  - "/path/to/project1_config.yaml"
  - "/path/to/project2_config.yaml"
  - "/path/to/project3_config.yaml"
```

### Custom Callbacks
Extend training with custom callbacks:

```python
from stable_baselines3.common.callbacks import BaseCallback

class CustomCallback(BaseCallback):
    def __init__(self):
        super().__init__()
    
    def _on_step(self) -> bool:
        # Custom logic here
        return True
```

## Troubleshooting

### Common Issues

1. **Environment Creation Fails**
   - Check that project configuration file exists
   - Verify ZEUS CLI is in PATH
   - Ensure all required data files are present

2. **Training is Slow**
   - Increase `num_envs` for parallel training
   - Reduce `total_timesteps` for faster iteration
   - Use GPU acceleration if available

3. **Poor Performance**
   - Try hyperparameter optimization
   - Increase training timesteps
   - Check reward function design
   - Verify environment dynamics

4. **Memory Issues**
   - Reduce `num_envs`
   - Decrease `batch_size`
   - Use gradient accumulation

### Debug Mode

Enable debug logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Performance Tips

1. **Use vectorized environments** for parallel training
2. **Start with PPO** for stability, then try SAC for efficiency
3. **Monitor training curves** with TensorBoard
4. **Use hyperparameter optimization** for best results
5. **Validate on multiple scenarios** before deployment

## Integration with ZEUS

The Python training system integrates seamlessly with the ZEUS C++ core:

- **Data Loading:** Uses existing ZEUS data fetching tools
- **Environment:** C++ PipelineEnvironment handles GIS operations
- **Constraints:** Physics-informed constraints from C++ core
- **Cost Model:** Real construction cost calculations

## Next Steps

1. **Experiment with algorithms:** Try different RL algorithms
2. **Optimize hyperparameters:** Use automated optimization
3. **Scale training:** Use distributed training for large models
4. **Deploy models:** Integrate trained models into production
5. **Continuous learning:** Implement online learning capabilities

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review configuration templates
3. Examine example configurations
4. Consult the main ZEUS documentation


