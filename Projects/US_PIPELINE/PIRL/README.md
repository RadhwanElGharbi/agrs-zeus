# US_PIPELINE PIRL - Simplified Slope Optimization

## Quick Start

### 1. Build the C++ Module

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
mkdir -p build && cd build
cmake ..
make -j$(nproc)
```

This will generate `pirl_native_us.so` in the `python/` directory.

### 2. Verify Installation

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python
python3 -c "import pirl_native_us; print('✓ Module imported successfully')"
```

### 3. Run Test Environment

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
python3 python/test_environment_us.py
```

### 4. (Optional) Tune Parameters

**Graphical Interface** ⭐ **RECOMMENDED**
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./pirl_parameter_tuner_us
```

**Features**:
- 4 tabs: Reward Function, Constraints, **Hyperparameters**, Testing
- Edit 23 parameters with visual controls
- Live reward formula preview
- Built-in testing and grid search
- One-click apply and export

**Command-Line Alternative** (for scripting):
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python
./tune_parameters_us.py \
    --config ../configs/us_pipeline_training_config.yaml \
    --mode grid \
    --episodes 10
```

### 5. Start Training

**Quick validation (10K timesteps)**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_validation_10k.sh
```

**Production run (500K timesteps)**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_production_500k.sh
```

## Directory Structure

```
/opt/agrs/Projects/US_PIPELINE/PIRL/
├── include/
│   └── PIRL_US.h               # Simplified 7D state space header
├── src/
│   └── PIRL_US.cpp             # Core C++ implementation
├── python/
│   ├── pirl_native_bindings_us.cpp  # pybind11 bindings
│   ├── pirl_native_env_us.py   # Gymnasium environment
│   ├── pirl_native_us.so       # Compiled Python module (after build)
│   ├── train_pirl_us.py        # Training script
│   ├── test_environment_us.py  # Environment validation
│   └── generate_geojson_us.py  # Route export
├── configs/
│   └── us_pipeline_training_config.yaml  # Training configuration
├── models/              # Saved model checkpoints
├── outputs/             # Generated routes and GeoJSON
├── logs/                # Training logs and TensorBoard
├── build/               # CMake build directory
├── CMakeLists.txt       # Build configuration
└── README.md            # This file
```

## Configuration

Edit `configs/us_pipeline_training_config.yaml` to adjust:

- Start/end points
- Training parameters (timesteps, learning rate, etc.)
- Constraint thresholds
- Step size range (40-300m)

## State Space (7D)

1. `x` - X coordinate (normalized)
2. `y` - Y coordinate (normalized)
3. `goal_distance` - Distance to goal (normalized)
4. `goal_bearing` - Direction to goal (radians)
5. `slope` - Terrain slope (%) **[PRIMARY OPTIMIZATION]**
6. `distance_to_boundary` - Distance to AOI edge (m)
7. `prev_heading` - Previous heading (radians)

## Action Space (2D)

1. `heading_change` - Direction change (±45°)
2. `step_size` - Movement distance (40-300m)

## Reward Function

**Components:**
- Progress reward: +2 per meter toward goal
- Slope reward: 0% = +10, 20% = 0, 50% = -100
- Boundary penalty: Linearly increasing within 100m of edge
- Curvature penalty: Small penalty for turns
- Goal bonus: +1000 when within 50m of goal

**Philosophy:** Encourage gentle slopes without forcing them.

## Training Progression

| Stage | Timesteps | Purpose | Expected Time (GPU) |
|-------|-----------|---------|-------------------|
| Validation | 10,000 | Verify setup | ~2 min |
| Short Test | 100,000 | Check convergence | ~15 min |
| Production | 1,000,000 | Full training | ~2-3 hours |

## Success Criteria

- ✅ Goal reach rate > 80%
- ✅ Average route slope < 15%
- ✅ No out-of-bounds violations
- ✅ Boundary awareness functional

## Monitoring Training

```bash
# Terminal 1: Start training
./train_validation_10k.sh

# Terminal 2: Monitor with TensorBoard
tensorboard --logdir=logs
# Open http://localhost:6006
```

## Troubleshooting

**Module import fails:**
```bash
cd build && make clean && make -j$(nproc)
```

**GDAL errors:**
- Verify DEM exists: `/opt/agrs/Projects/US_PIPELINE/data/rasters/dem.tif`
- Check AOI exists: `/opt/agrs/Projects/US_PIPELINE/aoi/aoi.kmz`

**Training crashes:**
- Reduce `num_parallel_envs` to 1
- Check logs in `logs/` directory
- Verify DEM resolution is adequate (10m recommended)

## Documentation

See `/opt/agrs/docs/Project Instructions/US_PIPELINE/` for:
- Full specification
- Reward function design rationale
- Validation checklist
- Merge strategy to main

## Notes

- This is an **isolated testing environment**
- Changes here do NOT affect main PIRL codebase
- Successfully validated features will be merged to main
- State space intentionally simplified to 7D for focused testing

