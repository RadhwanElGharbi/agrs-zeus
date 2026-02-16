# US_PIPELINE PIRL Testing Environment

## Overview

This directory contains an **isolated, simplified PIRL testing environment** specifically designed for the US_PIPELINE project in Wyoming. This is a testing branch that operates independently from the main AGRS ZEUS PIRL codebase, allowing for robust validation and model improvement before merging changes back to main.

## Purpose

The US_PIPELINE PIRL environment serves as a controlled testing ground for:

1. **Simplified State Space**: Reduced from 29 dimensions to 7 dimensions, focusing exclusively on slope optimization
2. **Parameter Tuning**: Isolated environment for testing reward functions and training parameters
3. **Model Validation**: Verify agent behavior and learning before production deployment
4. **Algorithm Testing**: Test different RL approaches without affecting main codebase

## Isolation Strategy

This environment is **completely isolated** from the main PIRL implementation:

- **Separate C++ Code**: `/opt/agrs/Projects/US_PIPELINE/PIRL/include/` and `src/`
- **Separate Python Bindings**: Custom `pirl_native_us` module
- **Separate Build System**: Standalone `CMakeLists.txt`
- **Separate Models**: Training outputs in `/opt/agrs/Projects/US_PIPELINE/PIRL/models/`

Changes made here **DO NOT** affect the main codebase until explicitly merged.

## Key Simplifications

### State Space: 7 Dimensions (down from 29)
1. `x` - Current X coordinate (normalized)
2. `y` - Current Y coordinate (normalized)
3. `goal_distance` - Distance to goal (normalized)
4. `goal_bearing` - Direction to goal (radians)
5. `slope` - Terrain slope at current position (%)
6. `distance_to_boundary` - Distance to AOI boundary (m)
7. `prev_heading` - Previous heading direction (radians)

### Action Space: 2 Dimensions (down from 3)
1. `heading_change` - Direction change in radians (±45°)
2. `step_size` - Movement distance in meters (40-300m)

**Removed**: crossing_decision (no infrastructure crossing logic)

### Optimization Focus: Slope Only

The agent learns to:
- Prefer gentler slopes (0% = best)
- Avoid excessive slopes (>20% = penalties)
- Terminate on extreme slopes (>50%)
- Balance slope optimization with progress toward goal

## Directory Structure

```
/opt/agrs/Projects/US_PIPELINE/PIRL/
├── include/
│   └── PIRL_US.h          # Simplified PIRL header (7D state)
├── src/
│   └── PIRL_US.cpp        # Simplified PIRL implementation
├── python/
│   ├── pirl_native_bindings_us.cpp  # pybind11 bindings
│   ├── pirl_native_env_us.py        # Gymnasium environment
│   ├── train_pirl_us.py             # Training script
│   └── generate_geojson_us.py       # Route export
├── configs/
│   └── us_pipeline_training_config.yaml  # Training configuration
├── models/              # Saved model checkpoints
├── outputs/             # Generated routes and GeoJSON
├── logs/                # Training logs and TensorBoard
├── CMakeLists.txt       # Standalone build system
└── README.md            # Usage instructions
```

## Quick Start

### 1. Build the C++ Module

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
mkdir -p build && cd build
cmake ..
make -j$(nproc)
```

This generates `pirl_native_us.so` for Python integration.

### 2. Run Validation Test

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
python python/test_environment_us.py
```

This verifies:
- 7D state space is correctly implemented
- 40-300m step size range works
- Slope calculations match DEM
- Termination conditions trigger properly

### 3. Train Initial Model (10K timesteps)

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_validation_10k.sh
```

Expected runtime: ~5-10 minutes on CPU, ~2 minutes on GPU

### 4. Monitor Training

```bash
tensorboard --logdir=/opt/agrs/Projects/US_PIPELINE/PIRL/logs
```

Open browser to `http://localhost:6006`

## Training Progression

1. **Validation (10K timesteps)**: Verify environment works, agent shows basic learning
2. **Short Test (100K timesteps)**: Validate reward function, check convergence trends
3. **Production (1M+ timesteps)**: Full training for deployment-ready model

## Success Criteria

Before merging to main, the model must achieve:

- ✅ Goal reach rate > 80% on evaluation episodes
- ✅ Average route slope < 15%
- ✅ No out-of-bounds violations in trained model
- ✅ Boundary awareness functional (stays >100m from edge)
- ✅ Efficient routing (tortuosity < 1.3)

## Documentation

- **[PIRL_SIMPLIFIED_SPECIFICATION.md](PIRL_SIMPLIFIED_SPECIFICATION.md)**: Detailed technical specification
- **[GETTING_STARTED.md](GETTING_STARTED.md)**: Step-by-step guide for new users
- **[REWARD_FUNCTION_DESIGN.md](REWARD_FUNCTION_DESIGN.md)**: Slope reward function rationale
- **[VALIDATION_CHECKLIST.md](VALIDATION_CHECKLIST.md)**: Pre-merge validation steps
- **[MERGING_TO_MAIN.md](MERGING_TO_MAIN.md)**: Process for promoting validated changes

## Merge Strategy

Once validation is complete:

1. Document learned parameters and insights
2. Create detailed comparison report (US_PIPELINE vs main)
3. Selectively integrate successful components into main PIRL
4. Update main PIRL documentation with findings
5. Archive US_PIPELINE branch for reference

**Changes flow ONE WAY**: US_PIPELINE → main (never main → US_PIPELINE)

## Contact

For questions or issues specific to US_PIPELINE PIRL:
- See project documentation in `/opt/agrs/docs/Project Instructions/US_PIPELINE/`
- Review main PIRL documentation in `/opt/agrs/docs/Project Instructions/`

---

**Last Updated**: 2025-11-21
**Status**: In Development



