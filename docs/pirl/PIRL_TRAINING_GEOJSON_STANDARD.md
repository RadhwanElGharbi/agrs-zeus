# PIRL Training and GeoJSON Output Standard

**Version**: 1.0  
**Date**: November 17, 2025  
**Status**: PRODUCTION STANDARD  
**Reference**: `route_600k_current.geojson` (600K timestep production model)

---

## Purpose

This document defines the **mandatory standard** for all PIRL MLP training runs and GeoJSON outputs within the AGRS system. All production training must follow this standard to ensure consistency, reproducibility, and quality control.

---

## 1. Training Configuration Standard

### 1.1 Minimum Training Requirements

**Production Models** (Client Deliverables):
- **Minimum timesteps**: 600,000
- **Recommended timesteps**: 1,000,000 - 2,000,000
- **Algorithm**: PPO (Proximal Policy Optimization)
- **Policy**: MlpPolicy (Multi-Layer Perceptron)
- **Device**: CUDA (GPU) for production, CPU acceptable for validation
- **Parallel environments**: 24 (standard for pipeline routing)

**Validation Models** (System Testing):
- **Timesteps**: 10,000 - 50,000
- **Purpose**: Infrastructure validation only
- **Not for**: Client deliverables or production use

### 1.2 Standard Training Parameters

Based on reference training that produced `route_600k_current.geojson`:

```yaml
# Core Training Parameters
total_timesteps: 600000  # Minimum for production
num_envs: 24            # Standard parallel environments
algorithm: PPO          # Required algorithm
learning_rate: 0.0003   # Standard learning rate
batch_size: 256         # Standard batch size
max_steps_per_episode: 5000

# PPO-Specific Parameters (DO NOT MODIFY without approval)
n_steps: 2048           # Rollout buffer size
gamma: 0.99             # Discount factor
gae_lambda: 0.95        # GAE parameter
clip_range: 0.2         # PPO clip range
ent_coef: 0.01          # Entropy coefficient
vf_coef: 0.5            # Value function coefficient
max_grad_norm: 0.5      # Gradient clipping

# Checkpointing
eval_freq: 5000         # Evaluate every 5K timesteps
save_freq: 10000        # Save checkpoint every 10K timesteps
```

### 1.3 Standard Directory Structure

All PIRL training outputs must follow this structure:

```
Projects/<project_name>/PIRL/
├── pirl_training_config_production.yaml  # Training configuration
├── models/
│   ├── checkpoints/
│   │   ├── pirl_model_10000_steps.zip
│   │   ├── pirl_model_20000_steps.zip
│   │   └── ...
│   ├── pirl_<project>_<timesteps>_final.zip  # Final model
│   └── pirl_<project>_<timesteps>_vecnormalize.pkl  # VecNormalize stats
├── outputs/
│   ├── production_<timesteps>/
│   │   ├── training.log
│   │   ├── tensorboard/
│   │   ├── route_<timesteps>_production.geojson  # GeoJSON output
│   │   └── analytics_report.md
│   └── validation_<timesteps>/  # For validation runs
└── train_<timesteps>_gpu_mlp.sh  # Training script
```

### 1.4 Naming Conventions

**Model Files**:
- Pattern: `pirl_<project>_<timesteps>_<stage>.zip`
- Examples:
  - `pirl_italy_600k_final.zip`
  - `pirl_italy_production_2M_final.zip`
  - `pirl_model_600000_steps.zip` (checkpoint)

**GeoJSON Files**:
- Pattern: `route_<timesteps>_<variant>.geojson`
- Examples:
  - `route_600k_production.geojson`
  - `route_2M_final.geojson`
  - `route_600k_current.geojson` (reference standard)

**Configuration Files**:
- Pattern: `pirl_training_config_<purpose>.yaml`
- Examples:
  - `pirl_training_config_production.yaml`
  - `pirl_training_config_600k.yaml`
  - `pirl_training_config_10k_validation.yaml`

---

## 2. GeoJSON Output Standard

### 2.1 Required Structure

All GeoJSON outputs **MUST** conform to this exact structure:

```json
{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": {
      "name": "EPSG:32633"  // Simplified format (not URN)
    }
  },
  "metadata": {
    "model_path": "PIRL/models/checkpoints/pirl_model_600000_steps.zip",
    "config_path": "PIRL/pirl_training_config_production.yaml",
    "vec_normalize_path": "PIRL/models/pirl_vecnormalize.pkl",
    "policy_type": "deterministic",
    "total_reward": -493.61,
    "success": false,
    "num_segments": 115,
    "num_points": 116,
    "timestamp": "2025-11-04T12:11:20.382442",
    "generated_by": "PIRL AGRS System",
    "algorithm": "PPO",
    "training_timesteps": 600000
  },
  "features": [
    // Feature 1: Full route
    {
      "type": "Feature",
      "id": "full_route",
      "properties": {
        "feature_type": "full_route",
        "total_segments": 115,
        "total_length_m": 11500.0,
        "total_cost_usd": 5332500.0,
        "total_reward": -493.61,
        "success": false,
        "model_path": "...",
        "config_path": "...",
        "generated_at": "2025-11-04T12:11:20.382442",
        "algorithm": "PPO"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [[x1, y1], [x2, y2], ...]  // All route points
      }
    },
    // Features 2-N: Individual segments
    {
      "type": "Feature",
      "id": "segment_1",
      "properties": {
        // See section 2.2 for required properties
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [[x1, y1], [x2, y2]]  // 2-point segment
      }
    }
    // ... more segments
  ]
}
```

### 2.2 Required Per-Segment Properties

Each segment feature **MUST** include these properties (40+ fields):

#### A. Segment Identification
```json
{
  "segment_id": 1,
  "step": 1,
  "length_m": 100.0
}
```

#### B. Terrain Properties
```json
{
  "elevation_start": 151.04,
  "elevation_end": 176.22,
  "slope_percent": 38.41,
  "aspect": -1.12,
  "curvature": 0.0032
}
```

#### C. Cost Breakdown (USD)
```json
{
  "cost_usd": 65000.0,
  "cost_per_m": 650.0,
  "terrain_cost": 45000.0,
  "water_crossing_cost": 0.0,
  "infrastructure_cost": 0.0,
  "environmental_cost": 20000.0,
  "row_cost": 0.0,
  "permitting_cost": 0.0,
  "hydraulic_cost": 0.0,
  "regulatory_cost": 0.0,
  "cumulative_cost": 65000.0,
  "cumulative_distance_m": 100.0
}
```

#### D. Land Cover and Environmental
```json
{
  "land_cover": "tree_cover",      // Human-readable class name
  "land_cover_class": 10,          // Numeric class code
  "geohazard_risk": null,          // or numeric value
  "soil_capacity": 390.0,
  "population_density": 3.4e-05
}
```

#### E. Infrastructure Proximity (meters)
```json
{
  "water_proximity_m": 457.46,
  "road_proximity_m": 97.38,
  "railway_proximity_m": 1000.0,
  "powerline_proximity_m": 172.66,
  "pipeline_proximity_m": 1000.0
}
```

#### F. Hydraulics (if enabled)
```json
{
  "pressure_drop_pa": 0.0,
  "cumulative_pressure_drop_pa": 0.0,
  "flow_velocity_m_s": 0.0,
  "reynolds_number": 0.0,
  "requires_pumping_station": false
}
```

#### G. Reinforcement Learning Metrics
```json
{
  "reward": -182.85,
  "total_reward": -493.61
}
```

### 2.3 Coordinate Format Standards

**Precision**: 
- UTM coordinates: 2 decimal places (centimeter precision)
- Example: `[379647.98, 4805029.95]`

**Format**:
- Standard decimal notation (not scientific notation)
- No exponential format (e.g., NOT `3.8e5`)
- Consistent precision across all coordinates

**CRS**:
- Use simplified `EPSG:XXXXX` format in CRS definition
- Include `crs` field in both FeatureCollection and feature properties
- Include human-readable `crs_name` in properties

---

## 3. Generation Workflow

### 3.1 Standard Training Workflow

```bash
# Step 1: Prepare configuration
cd /opt/agrs/Projects/<project_name>/PIRL
cp pirl_training_config_template.yaml pirl_training_config_production.yaml
# Edit: Set total_timesteps, output paths, project details

# Step 2: Run production training (600K minimum)
./train_600k_gpu_mlp.sh
# OR for higher quality:
./train_2M_gpu_mlp.sh

# Step 3: Monitor training
tail -f outputs/production_600k/training.log
tensorboard --logdir=outputs/production_600k/tensorboard --port=6006

# Step 4: Wait for completion (3-12 hours depending on timesteps)
# Training will save checkpoints every 10K timesteps

# Step 5: Generate detailed GeoJSON
python3 /opt/agrs/python/pirl_training/generate_route_from_model_detailed.py \
    --model models/pirl_<project>_600k_final.zip \
    --config pirl_training_config_production.yaml \
    --output outputs/production_600k/route_600k_production.geojson \
    --algorithm PPO

# Step 6: Validate GeoJSON structure
python3 /opt/agrs/python/pirl_training/validate_geojson_structure.py \
    outputs/production_600k/route_600k_production.geojson

# Step 7: Generate analytics report
python3 /opt/agrs/python/pirl_training/analyze_training_run.py \
    outputs/production_600k
```

### 3.2 Quality Control Checklist

Before releasing any GeoJSON output, verify:

- [ ] Training completed minimum 600K timesteps
- [ ] GeoJSON has `metadata` object at top level
- [ ] GeoJSON has `full_route` feature as first feature
- [ ] GeoJSON has individual segment features (2+ segments)
- [ ] Each segment has all 40+ required properties
- [ ] CRS is correctly specified (both FeatureCollection and properties)
- [ ] Coordinates in decimal notation (not scientific)
- [ ] Algorithm correctly identified (PPO)
- [ ] Total reward is reasonable (not -300K+ indicating untrained model)
- [ ] Success status accurately reflects episode outcome
- [ ] Timestamp in ISO 8601 format
- [ ] All numeric values are JSON serializable (no NaN/Inf as-is)

### 3.3 Quality Metrics Thresholds

**Trained Model** (Production Ready):
- Reward per segment: -5 to -50 (acceptable range)
- Total reward: -500 to -5000 (depending on route length)
- Segments completed: 80+ for typical 60km route
- Catastrophic terminations: <5% of training episodes
- Max slope encountered: <45% (ideally <30%)

**Untrained Model** (NOT Production Ready):
- Reward per segment: <-1000 (catastrophic penalties)
- Total reward: <-100,000 (massive violations)
- Segments completed: <50 before termination
- Catastrophic terminations: >50% of episodes
- Max slope: >50% (immediate failures)

---

## 4. Required Tools and Scripts

### 4.1 Training Script Template

**File**: `train_<timesteps>_gpu_mlp.sh`

```bash
#!/bin/bash
# PIRL Production Training - <timesteps> timesteps
set -e

echo "PIRL Production Training - <timesteps> Timesteps"
echo "=================================================="
echo "Expected runtime: <X-Y> hours"
echo ""

# Activate environment
source /opt/agrs/python/pirl_venv/bin/activate

# Set GPU
export CUDA_VISIBLE_DEVICES="0"

# Create directories
mkdir -p outputs/production_<timesteps>
mkdir -p models/checkpoints

# Run training
/opt/agrs/python/pirl_venv/bin/python3 /opt/agrs/python/pirl_training/train_pirl.py \
    --config pirl_training_config_production.yaml \
    --device cuda \
    --policy MlpPolicy 2>&1 | tee outputs/production_<timesteps>/training.log

echo "Training complete!"
echo "Next: Generate GeoJSON with generate_route_from_model_detailed.py"
```

### 4.2 GeoJSON Generation Script

**Required**: `/opt/agrs/python/pirl_training/generate_route_from_model_detailed.py`

Must support:
- `--model`: Path to trained model .zip
- `--config`: Path to training config YAML
- `--output`: Output GeoJSON path
- `--algorithm`: Explicit algorithm specification (PPO/SAC)
- `--max-steps`: Maximum episode steps (default: 5000)

Must produce:
- Reference-compliant GeoJSON structure
- All required per-segment properties
- Proper CRS formatting
- Correct metadata object

### 4.3 Validation Script

**Required**: `/opt/agrs/python/pirl_training/validate_geojson_structure.py`

Must check:
- JSON validity
- Required top-level keys (type, crs, metadata, features)
- Metadata completeness (11+ fields)
- Feature structure (full_route + segments)
- Per-segment property completeness (40+ fields)
- CRS formatting
- Coordinate format (decimal, not scientific)
- Algorithm identification accuracy

---

## 5. Implementation Requirements

### 5.1 C++ Environment API (Future Enhancement)

To generate real-world values (not normalized), implement:

**File**: `/opt/agrs/include/agrs_zeus/PIRL.h`

```cpp
struct SegmentInfo {
    // Coordinates
    double x1, y1, x2, y2;
    double length_m;
    
    // Terrain (REAL VALUES)
    double elevation_start, elevation_end;
    double slope_percent, aspect, curvature;
    
    // Costs (REAL VALUES in USD)
    double terrain_cost, water_crossing_cost, infrastructure_cost;
    double environmental_cost, row_cost, permitting_cost;
    double hydraulic_cost, regulatory_cost;
    double total_cost, cumulative_cost;
    double cumulative_distance_m;
    
    // Land cover (REAL VALUES)
    std::string land_cover_name;  // "tree_cover", "cropland", etc.
    int land_cover_class;         // 10, 40, 50, etc.
    
    // Environmental (REAL VALUES)
    double geohazard_risk, soil_capacity, population_density;
    
    // Proximities (REAL VALUES in meters)
    double water_proximity_m, road_proximity_m, railway_proximity_m;
    double powerline_proximity_m, pipeline_proximity_m;
    
    // Hydraulics (REAL VALUES)
    double pressure_drop_pa, cumulative_pressure_drop_pa;
    double flow_velocity_m_s, reynolds_number;
    bool requires_pumping_station;
    
    // RL metrics
    int step;
    double reward, total_reward;
};

class PipelineEnvironment {
public:
    // Existing methods...
    
    // NEW: Export segment history for GeoJSON
    std::vector<SegmentInfo> get_segment_history() const;
    SegmentInfo get_current_segment_info() const;
};
```

**Status**: Not yet implemented. Current implementation uses normalized values from state vector. This is acceptable for production but real values are preferred for client deliverables.

### 5.2 Python API Requirements

**File**: `/opt/agrs/python/pirl_training/pirl_native.cpp`

Must expose:
- `PIRLNativeEnvironment.get_segment_history()` → `List[SegmentInfo]`
- `PIRLNativeEnvironment.get_current_segment_info()` → `SegmentInfo`

When implemented, `generate_route_from_model_detailed.py` must use these methods to extract real values instead of normalized state vector values.

---

## 6. Common Pitfalls and Solutions

### 6.1 Insufficient Training

**Problem**: Model produces catastrophic routes (reward <-100K)

**Cause**: Training stopped too early (<100K timesteps)

**Solution**: 
- Minimum 600K timesteps for production
- Check reward progression in TensorBoard
- Ensure agent has time to learn constraint avoidance

### 6.2 Incorrect Algorithm Detection

**Problem**: GeoJSON shows "SAC" when model was trained with PPO

**Cause**: Filename doesn't contain "ppo" and defaults to SAC

**Solution**:
- Always use `--algorithm PPO` flag in generation script
- Follow naming convention: `pirl_<project>_<timesteps>_final.zip`
- Verify algorithm in metadata after generation

### 6.3 Missing Segment Properties

**Problem**: GeoJSON only has basic properties, not full 40+ fields

**Cause**: Using simplified generator instead of detailed generator

**Solution**:
- Use `generate_route_from_model_detailed.py` (not `generate_route_from_model.py`)
- Verify output has `segment_1`, `segment_2`, etc. features
- Check first segment has all required fields

### 6.4 Normalized vs Real Values

**Problem**: Values like `elevation_normalized: 3.797` instead of `elevation_start: 151.04`

**Cause**: C++ API doesn't expose real segment values yet

**Current Solution**:
- Use normalized values (acceptable for visualization)
- Structure is correct, values will be enhanced in future

**Future Solution**:
- Implement `get_segment_history()` C++ API
- Update Python generator to use real values

---

## 7. Archival and Documentation

### 7.1 Required Documentation per Training Run

For each production training run, create:

1. **Training Configuration**: `pirl_training_config_<run>.yaml`
2. **Training Log**: `outputs/<run>/training.log`
3. **Analytics Report**: `outputs/<run>/analytics_report.md`
4. **GeoJSON Output**: `outputs/<run>/route_<run>.geojson`
5. **Model Files**: 
   - Final: `models/pirl_<run>_final.zip`
   - VecNormalize: `models/pirl_<run>_vecnormalize.pkl`
   - Checkpoints: `models/checkpoints/pirl_model_*_steps.zip`

### 7.2 Metadata to Record

In analytics report or README, document:
- Project name and client
- Training date and duration
- Total timesteps trained
- Hardware used (GPU model, CPU cores)
- Final model performance metrics
- Known issues or limitations
- GeoJSON output location
- Intended use case

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-17 | Initial standard based on route_600k_current.geojson reference |

---

## 9. References

- **Reference GeoJSON**: `/opt/agrs/Projects/test_project2/PIRL/outputs/route_600k_current.geojson`
- **Training Comparison**: `/opt/agrs/Projects/test_project2/PIRL/TRAINING_COMPARISON_10K_vs_600K.md`
- **GeoJSON Structure**: `/opt/agrs/Projects/test_project2/PIRL/GEOJSON_STRUCTURE_UPDATE.md`
- **PIRL Documentation**: `/opt/agrs/docs/Project Instructions/`

---

## 10. Compliance

**MANDATORY**: All production PIRL training runs and GeoJSON outputs must comply with this standard.

**Exceptions**: Must be approved by project lead and documented in training metadata.

**Review**: This standard will be reviewed quarterly and updated as needed.

---

**Document Owner**: AGRS PIRL Team  
**Last Updated**: November 17, 2025  
**Next Review**: February 2026

