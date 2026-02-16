# PIRL Simplified Specification for US_PIPELINE

## Document Information

**Version**: 1.0  
**Date**: 2025-11-21  
**Status**: Development  
**Purpose**: Technical specification for simplified PIRL testing environment

---

## State Space Design

### 7-Dimensional State Vector

The simplified state space focuses exclusively on slope optimization with minimal auxiliary information:

| Index | Feature | Range | Normalization | Purpose |
|-------|---------|-------|---------------|---------|
| 0 | `x` | 480k-485k | ÷100000 → 0-10 | Position tracking |
| 1 | `y` | 4.9M-4.9M | ÷100000 → 0-100 | Position tracking |
| 2 | `goal_distance` | 0-100km | ÷100000 → 0-1 | Progress tracking |
| 3 | `goal_bearing` | -π to π | Direct → -3.15-3.15 | Direction guidance |
| 4 | `slope` | 0-100% | ÷100 → 0-1 | **Primary optimization factor** |
| 5 | `distance_to_boundary` | 0-10km | ÷1000 → 0-10 | Constraint awareness |
| 6 | `prev_heading` | -π to π | Direct → -3.15-3.15 | Action continuity |

### Removed Features (from 29D → 7D)

**Terrain Features (removed 3)**:
- elevation, aspect, curvature

**Infrastructure (removed 3)**:
- water_proximity, road_proximity, railway_proximity

**Risk Factors (removed 4)**:
- geohazard_risk, soil_capacity, cadastre_complex, population_density

**Constraints (removed 1)**:
- no_go_zone

**Hydraulics (removed 4)**:
- cumulative_pressure_drop, segments_since_pump, flow_velocity, reynolds_number

**Crossing Context (removed 6)**:
- All crossing-related state features

**Land Cover (removed 1)**:
- Implicit in terrain cost calculations

---

## Action Space Design

### 2-Dimensional Continuous Action Vector

| Index | Action | Input Range | Scaled Range | Purpose |
|-------|--------|-------------|--------------|---------|
| 0 | `heading_change` | [-1, 1] | [-π/4, π/4] rad | Direction control (±45°) |
| 1 | `step_size` | [-1, 1] | [40, 300] meters | Distance control |

### Scaling Functions

**Heading Change**:
```cpp
heading_change = action[0] * (M_PI / 4.0);  // [-1,1] → [-π/4, π/4]
```

**Step Size**:
```cpp
step_size = (action[1] + 1.0) * 130.0 + 40.0;  // [-1,1] → [40,300]
```

### Step Size Rationale

- **Minimum 40m**: Ensures meaningful progress on 10m DEM resolution
- **Maximum 300m**: Balances exploration speed with terrain detail
- **Range 7.5:1**: Allows dynamic adaptation to terrain complexity

---

## Reward Function Specification

### Components

1. **Progress Reward** (Primary Driver)
2. **Slope Reward/Penalty** (Primary Optimization)
3. **Boundary Penalty** (Constraint Enforcement)
4. **Curvature Penalty** (Smoothness Encouragement)
5. **Goal Bonus** (Terminal Reward)

### Detailed Formulas

#### 1. Progress Reward

```cpp
double progress = prev_state.goal_distance - new_state.goal_distance;
info.progress_reward = progress * 2.0;  // Multiplier: 2.0
```

**Characteristics**:
- Linear scaling with distance toward goal
- Dominates reward signal for direct routing
- Multiplier of 2.0 balances against slope penalties

**Example Values**:
- 100m progress → +200 reward
- 50m progress → +100 reward
- -20m (away from goal) → -40 penalty

#### 2. Slope Reward/Penalty (CORE OPTIMIZATION)

Three-zone piecewise function:

**Zone 1: Gentle Slopes (0-20%)**
```cpp
if (slope <= 20.0) {
    slope_reward = 10.0 * (1.0 - slope / 20.0);
}
```
- 0% slope → +10.0 reward (best case)
- 10% slope → +5.0 reward
- 20% slope → 0.0 reward (neutral)

**Zone 2: Moderate Slopes (20-50%)**
```cpp
else if (slope <= 50.0) {
    double excess = slope - 20.0;
    slope_reward = -100.0 * std::pow(excess / 30.0, 2);
}
```
- 25% slope → -2.8 penalty
- 30% slope → -11.1 penalty
- 40% slope → -44.4 penalty
- 50% slope → -100.0 penalty

**Zone 3: Extreme Slopes (>50%)**
```cpp
else {
    slope_reward = -500.0;  // Terminal penalty
}
```
- Triggers immediate termination
- Large penalty but not overwhelming if route was mostly good

**Design Rationale**:
- Encourages gentle slopes without forcing them
- Exponential growth prevents "penalty gaming"
- Terminal penalty at 50% but sized appropriately to total episode reward

#### 3. Boundary Penalty

```cpp
if (boundary_dist < 100.0 && boundary_dist < goal_distance) {
    double boundary_penalty = -50.0 * (1.0 - boundary_dist / 100.0);
    info.constraint_penalty = boundary_penalty;
}
```

**Activation**: Only when boundary is closer than goal (prevents penalizing valid end approaches)

**Scale**:
- 100m from boundary → 0 penalty
- 50m from boundary → -25 penalty
- 10m from boundary → -45 penalty
- 0m from boundary → -50 penalty

#### 4. Curvature Penalty

```cpp
double curvature_penalty = -0.5 * std::abs(action.heading_change);
```

**Purpose**: Encourage straighter routes, discourage excessive meandering

**Scale**:
- 0° change → 0 penalty
- 10° change (0.175 rad) → -0.09 penalty
- 45° change (0.785 rad) → -0.39 penalty

**Note**: Small enough to not dominate other factors

#### 5. Goal Bonus

```cpp
if (goal_distance < 50.0) {
    info.goal_bonus = 1000.0;
}
```

**Trigger**: Within 50m of goal  
**Value**: +1000 reward (large terminal bonus)

### Total Reward Example

**Scenario**: 100m step, 15% slope, 500m from boundary, 5° heading change, 1000m from goal

```
Progress:    100m × 2.0 = +200.0
Slope:       15% → +2.5 (Zone 1)
Boundary:    >100m → 0.0
Curvature:   5° → -0.04
Goal:        >50m → 0.0
-----------------------------------
Total:       +202.46
```

---

## Termination Conditions

### 1. Out of Bounds
```cpp
if (!gis_->is_within_aoi(state.x, state.y)) {
    reason = "OUT_OF_BOUNDS";
    return true;
}
```
**Trigger**: Agent exits AOI polygon  
**Penalty**: Implicit (episode ends with current cumulative reward)

### 2. Slope Violation (50%)
```cpp
if (state.slope > 50.0) {
    reason = "SLOPE_VIOLATION_50%";
    return true;
}
```
**Trigger**: Current position has slope > 50%  
**Penalty**: -500 from reward function

### 3. Goal Reached
```cpp
if (state.goal_distance < 50.0) {
    reason = "SUCCESS_GOAL_REACHED";
    return true;
}
```
**Trigger**: Within 50m of goal  
**Reward**: +1000 goal bonus

### 4. Max Steps
```cpp
if (step_count_ >= 5000) {
    reason = "MAX_STEPS_5000";
    return true;
}
```
**Trigger**: 5000 steps taken (safety limit)  
**Penalty**: None (agent should learn to reach goal faster)

---

## GIS Data Requirements

### Required Datasets

1. **DEM (Digital Elevation Model)** - REQUIRED
   - Resolution: 10m (USGS 3DEP)
   - Format: GeoTIFF
   - Path: `/opt/agrs/Projects/US_PIPELINE/data/rasters/dem.tif`
   - CRS: EPSG:32613 (WGS 84 / UTM Zone 13N)

2. **AOI Boundary** - REQUIRED
   - Format: KMZ or GeoPackage
   - Path: `/opt/agrs/Projects/US_PIPELINE/aoi/aoi.kmz`
   - CRS: EPSG:32613

### Optional Datasets (Not Used)

All other datasets (land cover, roads, railways, etc.) are **not loaded** in the simplified environment.

---

## Training Configuration

### Default Parameters

```yaml
constraints:
  max_slope_percent: 50.0      # Terminal threshold
  max_steps_per_episode: 5000  # Safety limit
  step_size_min_m: 40.0        # Minimum step
  step_size_max_m: 300.0       # Maximum step

training:
  algorithm: PPO
  policy: MlpPolicy
  learning_rate: 0.0003
  batch_size: 256
  num_parallel_envs: 1         # Start with 1 for debugging
```

### Recommended Training Progression

| Stage | Timesteps | Purpose | Expected Runtime (GPU) |
|-------|-----------|---------|----------------------|
| Validation | 10,000 | Verify environment works | ~2 minutes |
| Short Test | 100,000 | Check reward convergence | ~15 minutes |
| Production | 1,000,000 | Full training | ~2-3 hours |

---

## Performance Expectations

### Training Metrics

**Episode Length**:
- Random policy: 500-2000 steps
- Trained policy: 50-150 steps (direct routing)

**Success Rate**:
- Initial: < 10%
- 100K timesteps: 40-60%
- 1M timesteps: > 80%

**Average Route Slope**:
- Random policy: 15-20%
- Trained policy: < 12%

### Computational Requirements

**CPU Training**:
- Cores: 4+ recommended
- RAM: 8GB minimum
- Speed: ~500 steps/second

**GPU Training** (NVIDIA):
- VRAM: 2GB minimum
- Speed: ~2000 steps/second
- Recommended for >100K timesteps

---

## Validation Checklist

Before merging to main:

- [ ] Agent consistently reaches goal (>80% success rate)
- [ ] Average route slope < 15%
- [ ] No out-of-bounds violations in evaluation
- [ ] Boundary awareness functional
- [ ] Reward components balanced (no single component dominates)
- [ ] Training converges within 1M timesteps
- [ ] Generated routes are plausible for pipeline construction

---

## Known Limitations

1. **No Infrastructure Awareness**: Agent doesn't avoid/cross roads, railways
2. **No Land Cover Costs**: All terrain types treated equally except slope
3. **No Hydraulic Constraints**: Pressure drop, flow velocity not considered
4. **Simplified Physics**: Only basic bend radius constraints applied
5. **Single Objective**: Slope only (no multi-objective optimization)

These limitations are **intentional** for focused testing. Full feature set available in main PIRL implementation.

---

## References

- Main PIRL Implementation: `/opt/agrs/src/pirl/PIRL.cpp`
- Full State Space (29D): `/opt/agrs/include/agrs_zeus/PIRL.h`
- Dataset Fetching Protocols: `/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md`

---

**Document Owner**: AGRS Development Team  
**Review Cycle**: After each major training milestone



