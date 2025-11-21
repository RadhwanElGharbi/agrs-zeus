# PIRL Training and GeoJSON Output Standard - US_PIPELINE

**Version**: 1.0  
**Date**: November 21, 2025  
**Status**: PRODUCTION STANDARD FOR US_PIPELINE PROJECT  
**Environment**: 7D State Space, Slope-Optimized  
**Based On**: AGRS PIRL_TRAINING_GEOJSON_STANDARD.md v1.0

---

## Purpose

This document defines the **mandatory standard** for PIRL training runs and GeoJSON outputs for the **US_PIPELINE project**. This is a **simplified 7-dimensional state space** environment focused on **slope optimization** for pipeline routing.

**Key Differences from Full PIRL**:
- **State Space**: 7D (position, goal_distance, goal_bearing, slope, distance_to_aoi_boundary)
- **Action Space**: 2D (heading_change, step_size)
- **Focus**: Slope-optimized routing (no complex cost models)
- **Segment Properties**: Simplified to match 7D state (not 40+ fields)

---

## 1. Training Configuration Standard

### 1.1 Minimum Training Requirements

**Production Models** (Deployment Ready):
- **Minimum timesteps**: 500,000
- **Recommended timesteps**: 500,000 - 1,000,000
- **Algorithm**: PPO (Proximal Policy Optimization)
- **Policy**: MlpPolicy (Multi-Layer Perceptron)
- **Device**: CUDA (GPU) recommended, CPU acceptable
- **Parallel environments**: 24 (optimized for this configuration)

**Validation Models** (System Testing):
- **Timesteps**: 10,000
- **Purpose**: Infrastructure validation and parameter tuning
- **Not for**: Production deployment or client deliverables

### 1.2 Standard Training Parameters

Optimized for 24 parallel environments and 7D state space:

```yaml
# Core Training Parameters
total_timesteps: 500000  # Minimum for production
num_envs: 24            # Parallel environments
algorithm: PPO          # Required algorithm
policy: MlpPolicy       # Multi-layer perceptron

# Hyperparameters (optimized for 24 envs)
learning_rate: 0.0003
batch_size: 2048        # Optimized for 24 envs (49K samples/rollout)
n_steps: 2048          # Rollout buffer size

# PPO-Specific Parameters
gamma: 0.99            # Discount factor
gae_lambda: 0.95       # GAE parameter
clip_range: 0.2        # PPO clip range
ent_coef: 0.01         # Entropy coefficient
vf_coef: 0.5           # Value function coefficient
max_grad_norm: 0.5     # Gradient clipping

# Episode Constraints
max_steps_per_episode: 5000
step_size_min_m: 40.0
step_size_max_m: 300.0

# Checkpointing
eval_freq: 10000       # Evaluate every 10K timesteps
save_freq: 50000       # Save checkpoint every 50K timesteps
```

### 1.3 Standard Directory Structure

All US_PIPELINE PIRL training outputs follow this structure:

```
/opt/agrs/Projects/US_PIPELINE/PIRL/
├── configs/
│   └── us_pipeline_training_config.yaml  # Training configuration
├── models/
│   └── (generated during training)
├── outputs/
│   ├── production_500k_gpu_YYYYMMDD_HHMMSS/
│   │   ├── training.log
│   │   ├── logs/tensorboard/
│   │   ├── eval/
│   │   │   └── best_model.zip
│   │   ├── pirl_us_final.zip
│   │   └── route_500k_production.geojson  # ⭐ GeoJSON output
│   └── validation_10k_gpu_YYYYMMDD_HHMMSS/
│       └── ...
├── python/
│   ├── train_pirl_us.py
│   └── generate_geojson_us.py  # GeoJSON generator
├── train_validation_10k_gpu.sh
├── train_validation_10k_cpu.sh
├── train_production_500k_gpu.sh  # ⭐ Auto-generates GeoJSON
└── train_production_500k_cpu.sh  # ⭐ Auto-generates GeoJSON
```

### 1.4 Naming Conventions

**Model Files**:
- Pattern: `pirl_us_<timesteps>_<stage>.zip`
- Examples:
  - `pirl_us_500k_final.zip`
  - `pirl_us_1M_final.zip`
  - `best_model.zip` (best checkpoint from eval)

**GeoJSON Files**:
- Pattern: `route_<timesteps>_<variant>.geojson`
- Examples:
  - `route_500k_production.geojson`
  - `route_1M_final.geojson`
  - `route_10k_validation.geojson`

**Configuration Files**:
- `us_pipeline_training_config.yaml` (main configuration)
- `pirl_parameters_simplified_7d.json` (reward/constraint parameters)

---

## 2. GeoJSON Output Standard

### 2.1 Required Structure (Simplified for 7D)

All GeoJSON outputs **MUST** conform to this structure:

```json
{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": {
      "name": "EPSG:32613"  // US_PIPELINE project CRS (UTM Zone 13N)
    }
  },
  "metadata": {
    "project": "US_PIPELINE",
    "model_path": "eval/best_model.zip",
    "config_path": "configs/us_pipeline_training_config.yaml",
    "state_space_dim": 7,
    "action_space_dim": 2,
    "environment_type": "slope_optimized",
    "policy_type": "deterministic",
    "total_reward": -245.80,
    "success": true,
    "num_segments": 89,
    "num_points": 90,
    "timestamp": "2025-11-21T01:00:00.000000",
    "generated_by": "PIRL US_PIPELINE System",
    "algorithm": "PPO",
    "training_timesteps": 500000
  },
  "features": [
    // Feature 1: Full route (REQUIRED)
    {
      "type": "Feature",
      "id": "full_route",
      "properties": {
        "feature_type": "full_route",
        "total_segments": 89,
        "total_length_m": 8900.0,
        "total_reward": -245.80,
        "success": true,
        "algorithm": "PPO",
        "training_timesteps": 500000,
        "state_space": "7D_slope_optimized"
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [[x1, y1], [x2, y2], ...]
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
        "coordinates": [[x1, y1], [x2, y2]]
      }
    }
  ]
}
```

### 2.2 Required Per-Segment Properties (7D State Space)

Each segment feature includes these properties (simplified for 7D environment):

#### A. Segment Identification
```json
{
  "segment_id": 1,
  "step": 1,
  "length_m": 100.0,
  "cumulative_distance_m": 100.0
}
```

#### B. Terrain Properties (Core 7D State)
```json
{
  "elevation_start_m": 1387.50,
  "elevation_end_m": 1389.75,
  "slope_percent": 2.25
}
```

#### C. Navigation Metrics (7D State)
```json
{
  "distance_to_goal_m": 8900.0,
  "distance_to_aoi_boundary_m": 250.0
}
```

#### D. Reinforcement Learning Metrics
```json
{
  "reward": -2.85,
  "total_reward_cumulative": -2.85
}
```

**Total Properties**: 10 core properties (vs 40+ in full PIRL)

**Excluded** (not in 7D state space):
- ❌ Cost breakdown (terrain, water crossing, environmental, etc.)
- ❌ Land cover classes
- ❌ Infrastructure proximity (roads, railways, powerlines)
- ❌ Hydraulics (pressure, flow, Reynolds number)
- ❌ Geohazards, soil capacity, population density
- ❌ Aspect, curvature (terrain derivatives not in 7D state)

### 2.3 Coordinate Format Standards

**Precision**: 
- UTM coordinates: 2 decimal places (centimeter precision)
- Example: `[484838.28, 4933184.19]`

**Format**:
- Standard decimal notation (not scientific notation)
- No exponential format (e.g., NOT `4.8e5`)
- Consistent precision across all coordinates

**CRS**:
- **US_PIPELINE**: EPSG:32613 (WGS 84 / UTM Zone 13N)
- Use simplified `EPSG:XXXXX` format
- Include `crs` field in FeatureCollection

---

## 3. Generation Workflow

### 3.1 Standard Training Workflow

```bash
# Step 1: Verify environment is built
cd /opt/agrs/Projects/US_PIPELINE/PIRL
ls python/pirl_native_us.cpython-312-x86_64-linux-gnu.so

# Step 2: (Optional) Tune parameters
./pirl_parameter_tuner_us  # Qt6 GUI

# Step 3: Run validation (10K timesteps, ~20 seconds)
./train_validation_10k_gpu.sh

# Step 4: Check validation results
tensorboard --logdir=outputs/validation_10k_gpu_*/logs/tensorboard

# Step 5: Run production training (500K timesteps, ~15 minutes GPU)
./train_production_500k_gpu.sh
# Type 'y' to confirm

# Step 6: Monitor training (in another terminal)
tail -f outputs/production_500k_gpu_*/training.log

# Step 7: Wait for completion
# GPU: ~10-20 minutes
# CPU: ~30-45 minutes

# Step 8: GeoJSON is automatically generated at end of training!
# Location: outputs/production_500k_gpu_*/route_500k_production.geojson

# Step 9: View in ArcGIS or QGIS
# File is ready for direct import
```

### 3.2 Automatic GeoJSON Generation

**NEW**: All production training scripts automatically generate GeoJSON at the end!

The training scripts now include:

```bash
# Automatic GeoJSON generation after training
if [ $EXIT_CODE -eq 0 ]; then
    echo "Generating ArcGIS-ready GeoJSON..."
    cd "${SCRIPT_DIR}/python"
    $PYTHON_BIN generate_geojson_us.py \
        --model "$OUTPUT_DIR/eval/best_model.zip" \
        --config "$CONFIG_FILE" \
        --output "$OUTPUT_DIR/route_500k_production.geojson"
fi
```

**Manual Generation** (if needed):

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python

python generate_geojson_us.py \
    --model ../outputs/production_500k_gpu_*/eval/best_model.zip \
    --config ../configs/us_pipeline_training_config.yaml \
    --output ../outputs/production_500k_gpu_*/route_500k_production.geojson
```

### 3.3 Quality Control Checklist (US_PIPELINE)

Before using any GeoJSON output, verify:

- [ ] Training completed minimum 500K timesteps
- [ ] GeoJSON has `metadata` object at top level
- [ ] Metadata includes `state_space_dim: 7` and `action_space_dim: 2`
- [ ] GeoJSON has `full_route` feature as first feature
- [ ] GeoJSON has individual segment features (50+ segments for typical route)
- [ ] Each segment has all 10 required properties
- [ ] CRS is EPSG:32613 (UTM Zone 13N for US_PIPELINE)
- [ ] Coordinates in decimal notation (not scientific)
- [ ] Algorithm is "PPO"
- [ ] Reward per segment is reasonable (-5 to -100, not -10000)
- [ ] Success status reflects episode outcome
- [ ] Timestamp in ISO 8601 format

### 3.4 Quality Metrics Thresholds (7D Environment)

**Trained Model** (Production Ready):
- Reward per segment: -5 to -100 (acceptable range)
- Total reward: -500 to -10,000 (depending on route length)
- Segments completed: 50+ for typical 5-7km route
- Goal reach rate: >80%
- Average slope: <15%
- Max slope encountered: <40% (50% is terminal)

**Untrained Model** (NOT Production Ready):
- Reward per segment: <-1000 (catastrophic penalties)
- Total reward: <-50,000 (massive violations)
- Segments completed: <20 before termination
- Goal reach rate: <20%
- Average slope: >25%
- Frequent 50% slope terminations

---

## 4. Required Tools and Scripts

### 4.1 Training Scripts

**Validation** (10K timesteps):
- `train_validation_10k_gpu.sh` - GPU validation (~20s)
- `train_validation_10k_cpu.sh` - CPU validation (~45s)
- `train_validation_10k.sh` - Auto-detect

**Production** (500K timesteps):
- `train_production_500k_gpu.sh` ⭐ - GPU production (~15m) + GeoJSON
- `train_production_500k_cpu.sh` ⭐ - CPU production (~35m) + GeoJSON
- `train_production_500k.sh` - Auto-detect + GeoJSON

All production scripts automatically generate GeoJSON at completion.

### 4.2 GeoJSON Generation Script

**File**: `/opt/agrs/Projects/US_PIPELINE/PIRL/python/generate_geojson_us.py`

**Features**:
- Reads trained PPO model
- Runs single deterministic episode
- Extracts 7D state information per segment
- Outputs ArcGIS-compatible GeoJSON
- Includes proper CRS (EPSG:32613)
- Simplified segment properties (10 fields, not 40+)

**Usage**:
```bash
python generate_geojson_us.py \
    --model <path_to_model.zip> \
    --config <path_to_config.yaml> \
    --output <output_path.geojson>
```

**Output Format**:
- FeatureCollection with metadata
- Full route LineString (first feature)
- Individual segments (2-point LineStrings)
- 10 properties per segment (7D state-aligned)

### 4.3 Parameter Tuner

**File**: `/opt/agrs/Projects/US_PIPELINE/PIRL/pirl_parameter_tuner_us`

**GUI Tool** (Qt6):
- Tab 1: Reward Function (7 parameters)
- Tab 2: Constraints (6 parameters)
- Tab 3: Hyperparameters (10 parameters)
- Tab 4: Testing (built-in validation)

**Launch**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./pirl_parameter_tuner_us
```

---

## 5. Implementation Details

### 5.1 7D State Space Definition

The US_PIPELINE environment uses a **7-dimensional observation space**:

| Dimension | Name | Description | Range |
|-----------|------|-------------|-------|
| 1 | `x` | UTM Easting | [478000, 490000] |
| 2 | `y` | UTM Northing | [4925000, 4935000] |
| 3 | `goal_distance` | Distance to goal (m) | [0, 10000] |
| 4 | `goal_bearing` | Bearing to goal (radians) | [-π, π] |
| 5 | `slope` | Current slope (%) | [-50, 50] |
| 6 | `distance_to_aoi_boundary` | Distance to AOI edge (m) | [0, 5000] |
| 7 | (reserved) | Future expansion | - |

**Key Constraint**: Slope is the primary optimization target.

### 5.2 2D Action Space Definition

The agent outputs a **2-dimensional action**:

| Dimension | Name | Description | Range |
|-----------|------|-------------|-------|
| 1 | `heading_change` | Change in heading (radians) | [-π/4, π/4] |
| 2 | `step_size` | Step distance (m) | [40, 300] |

**No complex decisions**: No water crossing, no infrastructure avoidance, etc.

### 5.3 Reward Function (Slope-Optimized)

**Progress Reward**:
```python
progress_reward = progress_multiplier * distance_closer_to_goal
```

**Slope Reward/Penalty**:
```python
if abs(slope) <= 20%:
    slope_reward = slope_reward_scale * (1 - abs(slope) / 20)
else:
    slope_penalty = slope_penalty_scale * exp((abs(slope) - 20) / 10)
```

**Boundary Penalty**:
```python
if distance_to_boundary < 100m:
    boundary_penalty = boundary_penalty_scale * (1 - distance / 100)
```

**Terminal Conditions**:
- Slope ≥ 50%: Episode terminates with penalty
- Out of bounds: Episode terminates
- Goal reached (<50m): Episode terminates with bonus

### 5.4 GeoJSON Property Mapping

| GeoJSON Property | Source | Notes |
|------------------|--------|-------|
| `segment_id` | Segment index | 1-based |
| `step` | Step number | From episode |
| `length_m` | Euclidean distance | Calculated |
| `cumulative_distance_m` | Running total | Sum of segments |
| `elevation_start_m` | DEM lookup | Start point |
| `elevation_end_m` | DEM lookup | End point |
| `slope_percent` | Calculated | (Δz / length) × 100 |
| `distance_to_goal_m` | From 7D state | Direct |
| `distance_to_aoi_boundary_m` | From 7D state | Direct |
| `reward` | From step | Per-segment reward |
| `total_reward_cumulative` | Running sum | Cumulative reward |

---

## 6. Common Pitfalls and Solutions

### 6.1 Insufficient Training

**Problem**: Model produces poor routes (reward <-50,000)

**Cause**: Training stopped too early (<100K timesteps)

**Solution**: 
- Minimum 500K timesteps for production
- Check reward curve in TensorBoard
- Validation (10K) is NOT for production

### 6.2 Incorrect Batch Size

**Problem**: Training is very slow or gradients are noisy

**Cause**: Batch size not optimized for 24 environments

**Solution**:
- Use batch_size = 2048 for 500K production
- Use batch_size = 1024 for 10K validation
- With 24 envs: 49,152 samples/rollout
- 2048 batch = 24 gradient updates (optimal)

### 6.3 Missing GeoJSON Output

**Problem**: GeoJSON not generated after training

**Cause**: Using old training script or generation failed

**Solution**:
- Use updated scripts (train_production_500k_gpu.sh)
- Check for errors at end of training.log
- Manually run generate_geojson_us.py if needed

### 6.4 Slope Optimization Not Working

**Problem**: Routes take excessive slopes (>30% average)

**Cause**: Reward function imbalance

**Solution**:
- Use parameter tuner GUI
- Increase slope_penalty_scale
- Ensure slope_reward_scale is positive
- Check that 20% is neutral threshold

### 6.5 Agent Goes Out of Bounds

**Problem**: Episode terminates early due to boundary

**Cause**: Boundary penalty too weak

**Solution**:
- Increase boundary_penalty_scale in GUI
- Ensure boundary_penalty_distance = 100m
- Check AOI polygon is correct

---

## 7. Archival and Documentation

### 7.1 Required Documentation per Training Run

For each production training run, retain:

1. **Training Configuration**: `configs/us_pipeline_training_config.yaml`
2. **Training Log**: `outputs/production_500k_*/training.log`
3. **TensorBoard Logs**: `outputs/production_500k_*/logs/tensorboard/`
4. **GeoJSON Output**: `outputs/production_500k_*/route_500k_production.geojson` ⭐
5. **Model Files**: 
   - Best: `outputs/production_500k_*/eval/best_model.zip`
   - Final: `outputs/production_500k_*/pirl_us_final.zip`
   - Checkpoints: `outputs/production_500k_*/models/`

### 7.2 Metadata to Record

In training log or notes, document:
- Training date and duration (logged automatically)
- Total timesteps trained (500K/1M)
- Hardware used (GPU model shown in script output)
- Final performance metrics (logged automatically)
- Goal reach rate (from eval/)
- Average slope (from GeoJSON analysis)
- Known issues or special conditions
- Intended use case

---

## 8. ArcGIS Import Instructions

### 8.1 Direct Import to ArcGIS Pro

```
1. Open ArcGIS Pro
2. Add Data → Add Data from Path
3. Navigate to: /opt/agrs/Projects/US_PIPELINE/PIRL/outputs/production_500k_*/
4. Select: route_500k_production.geojson
5. Click "Add"
```

**Result**: 
- Full route appears as single LineString
- Individual segments appear as separate features
- All 10 properties visible in attribute table

### 8.2 Symbology Recommendations

**Color by Slope**:
- 0-5%: Green (easy construction)
- 5-15%: Yellow (moderate)
- 15-25%: Orange (challenging)
- 25-40%: Red (difficult)
- 40-50%: Dark red (critical)

**Line Thickness by Reward**:
- Thicker = better reward (less penalty)
- Thinner = worse reward (more penalty)

### 8.3 Analysis Examples

**Slope Analysis**:
```sql
SELECT AVG(slope_percent) AS avg_slope,
       MAX(slope_percent) AS max_slope,
       COUNT(*) AS total_segments
FROM route_segments
```

**Reward Analysis**:
```sql
SELECT segment_id, slope_percent, reward
FROM route_segments
WHERE reward < -50
ORDER BY reward ASC
```

**Distance Analysis**:
```sql
SELECT SUM(length_m) AS total_length_m,
       MAX(cumulative_distance_m) AS final_distance
FROM route_segments
```

---

## 9. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-21 | Initial US_PIPELINE standard (7D state space, slope-optimized) |

---

## 10. References

- **Base Standard**: `/opt/agrs/docs/Project Instructions/PIRL_TRAINING_GEOJSON_STANDARD.md`
- **Project README**: `/opt/agrs/Projects/US_PIPELINE/PIRL/README.md`
- **Training Guide**: `/opt/agrs/Projects/US_PIPELINE/PIRL/TRAINING_GUIDE.md`
- **Implementation Spec**: `/opt/agrs/docs/Project Instructions/US_PIPELINE/PIRL_SIMPLIFIED_SPECIFICATION.md`

---

## 11. Compliance

**MANDATORY**: All US_PIPELINE PIRL training runs and GeoJSON outputs must comply with this standard.

**Key Requirements**:
- ✅ Minimum 500K timesteps for production
- ✅ 24 parallel environments
- ✅ Batch size 2048 for production
- ✅ Automatic GeoJSON generation
- ✅ 10 properties per segment (7D state-aligned)
- ✅ EPSG:32613 CRS
- ✅ ArcGIS-compatible format

**Exceptions**: Must be documented in training metadata.

**Review**: This standard will be reviewed with the main PIRL standard.

---

**Document Owner**: AGRS PIRL Team - US_PIPELINE Project  
**Last Updated**: November 21, 2025  
**Next Review**: February 2026

---

✅ **US_PIPELINE 7D Environment - Simplified Standard** ✅

