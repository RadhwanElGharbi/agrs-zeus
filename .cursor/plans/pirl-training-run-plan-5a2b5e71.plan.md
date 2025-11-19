<!-- 5a2b5e71-ff7d-4546-9bc5-70554ea7fdb1 060fc43c-7681-4e61-920e-c69b356c362b -->
# PIRL Training Run Plan for test_project2

## Project Overview

**Project:** test_project2 (Central Italy, ~75km pipeline)

**Client:** SAIPEM

**CRS:** EPSG:32633 (UTM Zone 33N)

**Start:** 379647.98, 4805029.95 (UTM)

**End:** 408381.01, 4750126.95 (UTM)

**Model Status:** Trained (2M timesteps completed)

---

## I. PPO Environment Architecture

### A. State Space (21 dimensions)

The agent observes a 21-dimensional state vector at each step:

**Navigation Features (4):**

- `x, y`: Current UTM coordinates (absolute position)
- `goal_distance`: Euclidean distance to end point (meters)
- `goal_bearing`: Angle to goal (radians, -π to π)

**Terrain Features (4):**

- `elevation`: Height above sea level (meters, from DEM)
- `slope`: Terrain slope (percent, 0-100%)
- `aspect`: Slope direction (radians, 0-2π)
- `curvature`: Terrain curvature (rad/m, indicates convex/concave)

**Infrastructure Proximity (3):**

- `water_proximity`: Distance to nearest water body (normalized 0-1, <1km = near)
- `road_proximity`: Distance to nearest road (normalized 0-1)
- `railway_proximity`: Distance to nearest railway (normalized 0-1)

**Risk Factors (3):**

- `geohazard_risk`: Landslide/seismic risk (0-1, from GEM data)
- `soil_capacity`: Bearing capacity (0-1, foundation suitability)
- `population_density`: People/km² (0-1, <10 = rural, >1000 = dense)

**Constraint Indicators (2):**

- `no_go_zone`: Binary flag for protected areas (0 or 1)
- `cadastre_complex`: Complex land ownership flag (0 or 1)

**Hydraulics State (4) - NEW Phase 2:**

- `cumulative_pressure_drop_pa`: Total pressure loss from start (Pascals)
- `segments_since_pump`: Distance since last compressor (meters)
- `flow_velocity_m_s`: Current gas velocity (m/s)
- `reynolds_number`: Flow regime indicator (dimensionless)

**Action History (1):**

- `prev_heading`: Previous movement direction (radians, for continuity)

### B. Action Space (2 dimensions - Continuous)

**Action Vector:** `[heading_change, step_size]`

1. **Heading Change** (degrees of freedom in direction):

                                                - Range: [-π/4, π/4] radians (-45° to +45°)
                                                - Constrained by physics to prevent sharp turns
                                                - Maps to bend types:
                                                                                - `|angle| ≤ 5°` → **Field bend** (cold bend, free, unlimited)
                                                                                - `5° < |angle| ≤ 90°` → **Hot bend** (fabricated, limited to 50 total)
                                                                                - Hot bends must match available angles: [15°, 30°, 45°, 60°, 90°]
                                                - Minimum bend radius: 1.981m (3D formula: 3×diameter)

2. **Step Size** (degrees of freedom in distance):

                                                - Range: [10, 100] meters
                                                - Dynamic adjustment based on:
                                                                                - Distance to goal (smaller steps when near)
                                                                                - Terrain slope (reduced on steep terrain)
                                                                                - Constraint proximity (careful near obstacles)

### C. Degrees of Freedom in Movement

**1. Field Bends (Cold Bends):**

- Angular deflection ≤ 5° per segment
- No fabrication cost, applied during installation
- Unlimited count allowed
- Minimum radius: **40DN = 40 × 0.6604m = 26.416m** (cold bending limit for 26" pipe)

**2. Hot Bends (Fabricated Bends):**

- Discrete angles: **15°, 30°, 45°, 60°, 90°** (SAIPEM standard from AI_Routing_Criteria.xlsx)
- Manufactured via induction heating
- Limited to 50 total per route
- Minimum radius: 1.981m (3D = 3 × 0.6604m diameter)
- Cost: ~$5,000-15,000 per bend depending on angle

**3. HDD (Horizontal Directional Drilling):**

- For infrastructure/water crossings
- Minimum bend radius: 792.48m (1200D formula)
- Enables trenchless subsurface installation
- Required for:
                                - Railway crossings (mandatory per Criteria 12)
                                - Major power line crossings
                                - Large river crossings
- High cost: $150k-500k per crossing

**4. Orthogonal Crossings:**

- Preferred crossing angle: 90° (SAIPEM requirement)
- Minimum acceptable: 45° (from `min_crossing_angle_deg: 75°` in config)
- Penalty applied for non-orthogonal crossings
- Reduces ROW width and permitting complexity

---

## II. Pipeline Specifications & Hard Constraints

### A. Physical Properties

```json
{
  "diameter_mm": 660.4,
  "wall_thickness_mm": 11.1,
  "material": "Carbon Steel",
  "type": "Gas",
  "mop_bar": 70.0,
  "dp_bar": 75.0,
  "depth_of_cover_m": 1.5
}
```

### B. Clearance Requirements (Hard Constraints)

- **Houses:** 15.0m minimum (13.5m from AI_Routing_Criteria.xlsx)
- **Power lines:** 10.0m minimum (6m clearance for parallel routing)
- **Poles:** 5.0m minimum
- **Existing pipelines:** 5.0m minimum
- **Built-up areas (LC=50):** IMMEDIATE TERMINATION (<13.5m violation)
- **Sea polygon:** 1000m exclusion zone (IMMEDIATE TERMINATION)

### C. Slope Constraint

- **Maximum:** 20% (SAIPEM requirement, stricter than industry 30%)
- **Physics reason:** Prevents excessive axial stress and installation difficulty
- **Violation:** Episode terminates immediately
- **Cost impact:** 1.8-3.0× multiplier for slopes 10-20%

### D. Hydraulics Configuration

```python
{
  "enable_hydraulics": True,
  "enable_compressor_placement": True,
  "initial_pressure_bar": 70.0,      # Starting pressure
  "min_delivery_pressure_bar": 45.0,  # Minimum acceptable
  "max_operating_pressure_bar": 75.0,
  "volumetric_flow_rate_m3_s": 1.0,
  "operating_temperature_k": 288.15,  # 15°C
  "gas_molecular_weight_kg_kmol": 16.8,  # Natural gas
  "gas_specific_gravity": 0.58,
  "pipe_roughness_mm": 0.045,  # New steel
  "diameter_internal_m": 0.6382  # OD - 2×thickness
}
```

**Darcy-Weisbach Pressure Drop:**

- Formula: `ΔP = f × (L/D) × (ρv²/2)`
- Friction factor `f` calculated via Colebrook-White equation
- Reynolds number: `Re = ρvD/μ`
- Compressor placement when `P_exit < P_min + 5bar` (safety margin)

---

## III. Reward Structure & Cost Model

### A. Reward Components

**Total Reward Formula:**

```
R_total = R_progress + R_cost + R_constraint + R_curvature + R_goal + R_exploration - 0.1
```

**1. Progress Reward:**

- `R_progress = (d_prev - d_new) × 2.0`
- Multiplier 2.0 ensures goal-seeking behavior (configurable)
- Example: 50m progress = +100 reward

**2. Cost Penalty:**

- `R_cost = -segment_cost / 100000.0`
- Normalization factor prevents reward explosion
- Typical segment: $10k-50k → -0.1 to -0.5 reward

**3. Constraint Penalties:**

- Out of bounds: -50 per step
- Sea proximity (<1km): -10,000 (IMMEDIATE TERMINATION)
- Built-up area (LC=50): -10,000 (IMMEDIATE TERMINATION)
- Power line clearance violation: -500
- Railway clearance violation: -500
- Slope >20%: `-(slope - 20)² × 10` (quadratic penalty)
- No-go zone: -1,000 (IMMEDIATE TERMINATION)

**4. Curvature Penalty:**

- Applied when `|heading_change| > 30°`
- `R_curvature = heading_change × -10.0`
- Encourages smooth routing

**5. Goal Bonus:**

- `R_goal = +10,000` when within 50m of goal
- Ensures strong incentive to complete route

**6. Exploration Bonus:**

- `+100` every 1000m milestone closer to goal
- Prevents local minima, encourages progress

**7. Step Penalty:**

- Fixed `-0.1` per step
- Encourages shorter routes

### B. Cost Matrix (USD per meter)

**Terrain Costs (Land Cover Classes):**

```python
{
  10: 150,   # Tree cover
  20: 120,   # Shrubland
  30: 100,   # Grassland
  40: 200,   # Cropland
  50: 80,    # Built-up (but triggers termination)
  60: 100,   # Bare/sparse
  70: 100,   # Snow/ice
  80: 3500,  # Water bodies (realistic offshore cost)
  90: 400,   # Wetland
  95: 350,   # Mangroves
  100: 250   # Moss/lichen
}
```

**Slope Multipliers:**

- Flat (0-5%): 1.0×
- Rolling (5-10%): 1.3×
- Hilly (10-15%): 1.8×
- Mountainous (15-20%): 3.0×
- Steep (>20%): 5.0× (but terminates)

**Infrastructure Crossing Costs:**

- Minor road: $25,000
- Major road: $50,000
- Railway (HDD required): $250,000
- Power line (HDD required): $150,000
- Small river (open-cut): $80,000
- Large river (HDD): $500,000

**Hydraulic Costs:**

- Compressor station: $1,000,000 base + $5,000/kW power
- Erosion penalty (v > 15 m/s): $150/m
- Dropout penalty (v < 3 m/s): $75/m
- Excessive pressure drop (>5 bar): $10,000/bar

---

## IV. Agent Workflow - Segment-by-Segment Iteration

### A. Episode Initialization (`reset()`)

```python
1. Load project configuration (YAML)
2. Initialize GIS data manager (load all rasters/vectors)
3. Set starting position: (379647.98, 4805029.95)
4. Set goal position: (408381.01, 4750126.95)
5. Calculate initial state:
   - goal_distance = 75,000m
   - goal_bearing = atan2(dy, dx)
   - Query terrain/constraints at start
6. Initialize hydraulics:
   - current_pressure_pa = 70 bar × 100,000 = 7,000,000 Pa
   - total_pressure_drop = 0
   - distance_since_pump = 0
7. Clear route trajectory
8. Reset episode counters (step_count = 0, out_of_bounds_steps = 0)
```

### B. Step Iteration (`step(action)`)

**For each timestep (up to 5,000 steps per episode):**

```python
1. RECEIVE ACTION from PPO policy:
   - action = [heading_change, step_size]
   - Example: [-0.1 rad, 50.0 m] = -5.7° left, 50m forward

2. APPLY PHYSICS CONSTRAINTS:
   - Clamp heading_change to [-π/4, π/4]
   - Clamp step_size to [10, 100]
   - Check bend radius feasibility
   - Classify bend type (field vs hot)

3. CALCULATE NEW POSITION:
   - new_heading = prev_heading + heading_change
   - new_x = current_x + step_size × cos(new_heading)
   - new_y = current_y + step_size × sin(new_heading)

4. QUERY GIS DATA at new position:
   - Elevation (DEM raster)
   - Slope (derived from DEM or precomputed)
   - Land cover (ESA WorldCover raster)
   - Water proximity (distance to water_bodies.gpkg)
   - Road proximity (distance to roads.gpkg)
   - Railway proximity (distance to railways.gpkg)
   - Protected areas (contains check on protected_areas.gpkg)
   - Geohazard risk (geohazards.tif)
   - Soil capacity (soil.tif)
   - Population density (population.tif)

5. CHECK HARD CONSTRAINTS:
   a. Out of bounds: !is_within_aoi(x, y)
      - Allow 3 consecutive steps out
      - Terminate if exceeds limit
   b. Sea proximity: distance_to_sea < 1000m
      - IMMEDIATE TERMINATION
   c. Built-up area: land_cover == 50
      - IMMEDIATE TERMINATION (<13.5m from buildings)
   d. Slope: slope > 20%
      - IMMEDIATE TERMINATION
   e. Protected area: is_no_go_zone == True
      - IMMEDIATE TERMINATION

6. CALCULATE SEGMENT HYDRAULICS (if enabled):
   - Segment length: sqrt((dx)² + (dy)²)
   - Elevation change: elevation_end - elevation_start
   - Calculate pressure drop (Darcy-Weisbach):
     * Friction factor f (Colebrook-White)
     * Velocity v = Q / (π × (D/2)²)
     * Reynolds Re = ρvD/μ
     * ΔP = f × (L/D) × (ρv²/2)
   - Update current_pressure: P_exit = P_entry - ΔP
   - Check if compressor needed:
     * If P_exit < P_min + 5bar:
       - Place compressor station
       - Reset pressure to P_initial

7. CALCULATE COST BREAKDOWN:
   - terrain_cost = landcover_cost × terrain_multiplier × length
   - crossing_cost = detect_crossings(water, road, railway)
   - environmental_cost = protected_area_buffer × length
   - hydraulic_cost = compressor_cost + erosion_penalties
   - row_cost = land_acquisition × length
   - permitting_cost = complexity_factor × length
   - total_cost = Σ all costs

8. CALCULATE REWARD (detailed in Section III):
   - Progress: distance improvement
   - Cost penalty: -total_cost / 100000
   - Constraint penalties: violations
   - Curvature penalty: excessive bending
   - Goal bonus: if within 50m
   - Exploration bonus: milestone reached
   - Step penalty: -0.1

9. UPDATE STATE for next iteration:
   - Update position (x, y)
   - Update goal_distance, goal_bearing
   - Update terrain features
   - Update infrastructure proximity
   - Update hydraulics state
   - Update prev_heading

10. RECORD SEGMENT in trajectory:
    - Store geometry, costs, hydraulics
    - Cumulative totals
    - Land cover classification
    - Bend characteristics

11. CHECK TERMINATION:
    - Success: goal_distance < 50m
    - Failure: constraint violation
    - Failure: max_steps exceeded (5000)
    - Return: (new_state, reward, terminated, truncated, info)
```

### C. Event Types During Iteration

**1. Obstacle Encountered:**

The agent decides between three strategies:

**a) Crossing (Trenchless):**

- **When:** Infrastructure (railways, power lines, large rivers)
- **How:** 
                                - Transition to HDD mode
                                - Calculate HDD bend radius: 792.48m (1200D)
                                - Plan entry/exit pits
                                - Apply HDD cost: $150k-500k
                                - Enforce minimum depth: 3-5m below obstacle
- **Termination Risk:** None (allowed with proper cost)

**b) Contouring (Parallel Routing):**

- **When:** Water bodies, terrain features, moderate obstacles
- **How:**
                                - Route parallel at safe distance
                                - Apply clearance buffer (50m for water, 100m for protected)
                                - Penalty if too close to infrastructure (no crossing)
- **Termination Risk:** Low, unless violates clearance

**c) Avoiding (Detour):**

- **When:** Protected areas, built-up zones, sea proximity
- **How:**
                                - Increase heading_change to steer away
                                - Accept longer route to avoid constraint
                                - No crossing option available
- **Termination Risk:** High if cannot avoid (e.g., sea, built-up)

**2. Compressor Station Placement:**

**Trigger Condition:**

```python
if P_exit < (P_min + 5.0):  # 5 bar safety margin
    place_compressor_station()
```

**Placement Logic:**

- Calculate power required: `P_kw = (Q × ΔP) / η`
- Cost: $1,000,000 + $5,000/kW
- Reset pressure to initial: 70 bar
- Record location in route trajectory
- Typical spacing: 80-150 km (for this 75km route, likely 0-1 stations)

**Physics:**

- Compressor efficiency: η ≈ 0.75-0.85
- Compression ratio: r = P_out / P_in
- Adiabatic work: `W = (γ/(γ-1)) × R × T × (r^((γ-1)/γ) - 1)`
- γ = 1.3 for natural gas

---

## V. Validation Tests - Pre-Run Checklist

### A. Data Validation

**1. CRS Consistency Check:**

```python
# Run: python3 /opt/agrs/python/pirl_training/validate_training_data.py \
#        /opt/agrs/Projects/test_project2/PIRL/pirl_training_config.yaml

Expected outputs:
✅ DEM: EPSG:32633
✅ Landcover: EPSG:32633
✅ Geohazards: EPSG:32633
✅ Soil: EPSG:32633
✅ Population: EPSG:32633
✅ All vectors: EPSG:32633
```

**2. Raster Value Range Checks:**

```python
DEM: Valid if -100m < elevation < 3000m
Slope: Valid if 0% ≤ slope ≤ 100%  (CRITICAL: Must be percent, not degrees)
Landcover: Valid if classes in {10,20,30,40,50,60,70,80,90,95,100}
Geohazards: Valid if 0 ≤ risk ≤ 100 (normalized to 0-1)
Soil: Valid if 0 ≤ capacity ≤ 100 (normalized to 0-1)
Population: Valid if 0 ≤ density ≤ 10000 (normalized to 0-1)
```

**3. Vector Layer Completeness:**

```bash
Required layers:
✅ aoi.gpkg (1 polygon)
✅ water_bodies.gpkg (>0 features)
✅ roads.gpkg (>0 features)
✅ railways.gpkg (>0 features)
✅ protected_areas.gpkg (can be empty)
✅ power_lines.gpkg (>0 features)
✅ pipelines.gpkg (can be empty)
✅ sea_polygon.gpkg (extracted from largest water body)
```

**4. NoData Handling:**

```python
# Ensure no NoData within AOI bounds
for raster in [dem, landcover, geohazards, soil, population]:
    nodata_count = count_nodata_in_aoi(raster)
    assert nodata_count < 0.01 * total_pixels, f"{raster} has >1% NoData"
```

### B. Configuration Validation

**1. Pipeline Specs Consistency:**

```python
# Check: /opt/agrs/Projects/test_project2/pipeline_specs.json
assert diameter_mm == 660.4
assert thickness_mm == 11.1
assert mop_bar == 70.0
assert dp_bar == 75.0
assert hydraulics.enable_hydraulics == True
assert hot_bend_angles_deg == [15.0, 30.0, 45.0, 60.0, 90.0]
assert field_bend_max_angle_deg == 5.0
assert max_slope_percent == 20.0
```

**2. Training Config Validation:**

```yaml
# Check: /opt/agrs/Projects/test_project2/PIRL/pirl_training_config.yaml
assert epsg_code == 32633
assert start_x == 379647.98 and start_y == 4805029.95
assert end_x == 408381.01 and end_y == 4750126.95
assert total_timesteps >= 500000  (for production run)
assert num_envs >= 8
assert max_steps_per_episode == 5000
assert learning_rate == 0.0003
assert algorithm == "PPO"
```

**3. Parameter Overrides Validation:**

```json
# Check: /opt/agrs/Projects/test_project2/PIRL/pirl_parameters_default.json
Verify:
- progress_multiplier == 2.0
- goal_bonus == 10000.0
- sea_penalty == -10000.0
- buildup_penalty == -10000.0
- cost_normalization_factor == 100000.0
- sea_exclusion_distance_m == 1000.0
- powerline_clearance_m == 6.0
- railway_clearance_m == 10.0
```

### C. Environment Instantiation Tests

**1. Single Environment Test:**

```python
from pirl_native_env import PIRLNativeEnvironment

env = PIRLNativeEnvironment('/opt/agrs/Projects/test_project2/PIRL/pirl_training_config.yaml')
obs, info = env.reset()

assert obs.shape == (21,), f"Expected 21-dim state, got {obs.shape}"
assert info['goal_distance'] > 70000, "Goal should be ~75km away"
```

**2. Step Execution Test:**

```python
action = np.array([0.0, 50.0], dtype=np.float32)  # Straight ahead, 50m
obs, reward, terminated, truncated, info = env.step(action)

assert obs.shape == (21,)
assert -1000 <= reward <= 1000, f"Reward {reward} outside expected range"
assert not terminated, "Should not terminate on first step"
```

**3. GIS Query Test:**

```python
# Query at start position
x, y = 379647.98, 4805029.95
elevation = env.env.gis.get_elevation(x, y)
slope = env.env.gis.get_slope(x, y)
landcover = env.env.gis.get_land_cover_class(x, y)

assert elevation is not None, "DEM query failed"
assert 0 <= slope <= 100, f"Slope {slope}% out of range"
assert landcover in [10,20,30,40,50,60,70,80,90,95,100], f"Invalid LC {landcover}"
```

**4. Hydraulics Calculation Test (if enabled):**

```python
if env.env.hydraulics:
    segment_hyd = env.env.hydraulics.calculate_segment(
        entry_pressure_bar=70.0,
        segment_length_m=100.0,
        elevation_change_m=5.0
    )
    
    assert segment_hyd.pressure_drop_bar > 0, "Pressure should drop"
    assert segment_hyd.exit_pressure_bar < 70.0, "Exit pressure should be lower"
    assert segment_hyd.flow_velocity_m_s > 0, "Velocity should be positive"
    assert segment_hyd.reynolds_number > 0, "Reynolds should be positive"
```

### D. Training Loop Validation

**1. Vectorized Environment Test:**

```python
from stable_baselines3.common.vec_env import DummyVecEnv

vec_env = DummyVecEnv([make_env() for _ in range(8)])
obs = vec_env.reset()

assert obs.shape == (8, 21), f"Expected (8,21), got {obs.shape}"
```

**2. Model Initialization Test:**

```python
from stable_baselines3 import PPO

model = PPO("MlpPolicy", vec_env, learning_rate=0.0003, verbose=1)
assert model.policy is not None
assert model.learning_rate == 0.0003
```

**3. Short Training Test (10k timesteps):**

```bash
cd /opt/agrs/Projects/test_project2
python3 ../test_project/train_pirl_direct.py \
  --config PIRL/pirl_training_config_test.yaml

# Expected duration: 5-10 minutes
# Check for errors in logs
# Verify model checkpoint created
```

### E. Post-Training Validation

**1. Model Loading Test:**

```python
from stable_baselines3 import PPO

model = PPO.load('/opt/agrs/Projects/test_project2/PIRL/models/pirl_italy_production_2M_final.zip')
assert model is not None
```

**2. Route Generation Test:**

```python
# Generate route using trained model
obs, info = env.reset()
route_points = []

for step in range(5000):
    action, _states = model.predict(obs, deterministic=True)
    obs, reward, terminated, truncated, info = env.step(action)
    route_points.append((obs[0], obs[1]))
    
    if terminated or truncated:
        break

assert len(route_points) > 0, "Route should have segments"
```

**3. Route Trajectory Export:**

```python
trajectory = env.env.get_route_trajectory()

assert trajectory.success, "Route should reach goal"
assert len(trajectory.segments) > 0
assert trajectory.total_length_m > 70000, "Route should be ~75km"
assert trajectory.total_cost > 0, "Route should have cost"
```

**4. Constraint Compliance Check:**

```python
for seg in trajectory.segments:
    # Slope constraint
    assert seg.slope_percent <= 20.0, f"Segment {seg.segment_id} violates slope"
    
    # Clearance constraints
    if seg.powerline_proximity < 6.0 and seg.powerline_proximity > 2.0:
        # Too close for parallel but not crossing
        warnings.append(f"Segment {seg.segment_id} violates power clearance")
    
    # Land cover constraint
    assert seg.land_cover_class != 50, f"Segment {seg.segment_id} in built-up area"
```

---

## VI. Physics Details - Hydraulics Calculations

### A. Darcy-Weisbach Equation

**Pressure Drop Formula:**

```
ΔP = f × (L/D) × (ρv²/2) + ρgΔh
```

Where:

- `f`: Darcy friction factor (from Colebrook-White)
- `L`: Segment length (m)
- `D`: Internal diameter (0.6382 m)
- `ρ`: Gas density (kg/m³, from ideal gas law)
- `v`: Flow velocity (m/s)
- `Δh`: Elevation change (m)
- `g`: Gravity (9.81 m/s²)

### B. Friction Factor Calculation (Colebrook-White)

**Implicit equation:**

```
1/√f = -2 × log₁₀((ε/D)/3.7 + 2.51/(Re×√f))
```

Where:

- `ε`: Absolute roughness (0.045 mm for new steel)
- `Re`: Reynolds number
- Solved iteratively or via approximation (Swamee-Jain)

### C. Reynolds Number

**Formula:**

```
Re = (ρ × v × D) / μ
```

Where:

- `ρ`: Gas density (kg/m³)
- `v`: Velocity (m/s)
- `D`: Internal diameter (m)
- `μ`: Dynamic viscosity (Pa·s)

**Flow Regimes:**

- `Re < 2300`: Laminar (unlikely for gas pipelines)
- `2300 < Re < 4000`: Transition
- `Re > 4000`: Turbulent (typical for gas transmission)

### D. Gas Velocity

**Calculation:**

```
v = Q / A = Q / (π × (D/2)²)
```

For test_project2:

- `Q = 1.0 m³/s`
- `D = 0.6382 m`
- `A = 0.3197 m²`
- `v = 3.13 m/s`

**Velocity Constraints:**

- Minimum: 3 m/s (prevent liquid dropout)
- Maximum: 15 m/s (prevent erosion)
- Violations trigger cost penalties

### E. Compressor Power

**Adiabatic Compression Work:**

```
W = (γ/(γ-1)) × (m_dot × R × T_in) × ((P_out/P_in)^((γ-1)/γ) - 1) / η
```

Where:

- `γ = 1.3`: Heat capacity ratio for natural gas
- `m_dot`: Mass flow rate (kg/s)
- `R`: Specific gas constant (J/kg·K)
- `T_in`: Inlet temperature (K)
- `η = 0.80`: Compressor efficiency
- `P_out/P_in`: Compression ratio

**Cost Calculation:**

```
CAPEX = $1,000,000 + $5,000/kW × P_kw
OPEX_annual = CAPEX × 0.03 + P_kw × 8760 hr × $0.05/kWh
```

---

## VII. Execution Plan

### Phase 1: Pre-Run Validation (15 minutes)

1. **Data validation:**
   ```bash
   cd /opt/agrs/Projects/test_project2
   python3 /opt/agrs/python/pirl_training/validate_training_data.py \
     PIRL/pirl_training_config.yaml > PIRL/data_validation.log
   ```

2. **Configuration check:**
   ```bash
   cat PIRL/pirl_training_config.yaml
   cat pipeline_specs.json
   cat PIRL/pirl_parameters_default.json
   ```

3. **Environment test:**
   ```bash
   cd /opt/agrs && python3 -c "
   from python.pirl_training.pirl_native_env import PIRLNativeEnvironment
   env = PIRLNativeEnvironment('/opt/agrs/Projects/test_project2/PIRL/pirl_training_config.yaml')
   obs, info = env.reset()
   print(f'✓ Environment initialized: state shape = {obs.shape}')
   print(f'✓ Goal distance: {info[\"goal_distance\"]:.1f}m')
   "
   ```


### Phase 2: Test Run (10k timesteps, ~10 minutes)

```bash
cd /opt/agrs/Projects/test_project2
python3 ../test_project/train_pirl_direct.py \
  --config PIRL/pirl_training_config_test.yaml \
  2>&1 | tee PIRL/test_run.log
```

**Monitor:**

- Episode lengths (should be 100-1000 steps initially)
- Reward trends (should increase over time)
- Success rate (goal reached)
- Tensorboard: `tensorboard --logdir PIRL/outputs/pirl_training_test/tensorboard`

### Phase 3: Production Run (500k-2M timesteps, 2-8 hours)

```bash
cd /opt/agrs/Projects/test_project2
source /opt/agrs/python/pirl_venv/bin/activate

python3 ../test_project/train_pirl_direct.py \
  --config PIRL/pirl_training_config.yaml \
  2>&1 | tee PIRL/training_production.log
```

**Checkpoints:** Saved every 100k timesteps

**Evaluation:** Every 10k timesteps

**Expected outcomes:**

- 500k: Basic goal-reaching capability
- 1M: Improved route quality, cost optimization
- 2M: Refined constraint handling, near-optimal routing

### Phase 4: Post-Run Validation (10 minutes)

1. **Route generation:**
   ```bash
   python3 generate_route_from_model.py
   ```

2. **Trajectory analysis:**
   ```bash
   python3 test_trajectory.py > PIRL/trajectory_analysis.log
   ```

3. **Constraint validation:**
   ```bash
   python3 validate_production_route.py > PIRL/constraint_check.log
   ```

4. **Export results:**

                                                - GeoJSON: `PIRL/outputs/final_route_detailed.geojson`
                                                - Statistics: `PIRL/outputs/route_statistics.json`
                                                - Validation: `PIRL/VALIDATION_REPORT.txt`

---

## VIII. Expected Results & Success Criteria

### A. Training Metrics

**Episode Length:**

- Initial: 200-500 steps (random exploration)
- Mid-training (500k): 800-1500 steps (goal-directed)
- Final (2M): 1000-2000 steps (optimized route)

**Episode Reward:**

- Initial: -5000 to -1000 (many violations)
- Mid-training: -500 to +2000 (feasible routes)
- Final: +5000 to +15000 (goal reached with bonuses)

**Success Rate (goal reached):**

- Initial: 0-10%
- Mid-training: 40-60%
- Final: 80-95%

### B. Route Quality Metrics

**Distance:**

- Straight-line: ~75 km
- Expected route: 80-95 km (detours for constraints)
- Directness ratio: >0.80

**Cost:**

- Budget estimate: $15-30M for 75km pipeline
- Cost per km: $200k-400k
- Breakdown:
                                - Terrain: 20-30%
                                - Crossings: 15-25%
                                - ROW: 10-15%
                                - Hydraulics: 5-15%
                                - Environmental: 10-20%

**Constraints:**

- Slope violations: 0
- Built-up violations: 0
- Sea proximity violations: 0
- Power/railway clearance: <5 warnings (crossings acceptable)

**Hydraulics (if enabled):**

- Compressor stations: 0-1 (route is only 75km)
- Pressure at delivery: >45 bar
- Velocity: 3-15 m/s throughout

---

## IX. Troubleshooting & Common Issues

### Issue 1: Episode terminates immediately

**Causes:**

- Start/end point in no-go zone
- Start/end point on steep slope
- Start/end point too close to sea

**Fix:**

- Validate start/end coordinates
- Check AOI includes both points
- Adjust coordinates if needed

### Issue 2: Agent avoids goal

**Causes:**

- Reward imbalance (cost penalties too high)
- Obstacles blocking direct path
- Progress multiplier too low

**Fix:**

- Increase `progress_multiplier` (currently 2.0)
- Increase `goal_bonus` (currently 10000)
- Check path feasibility manually

### Issue 3: Constraint violations

**Causes:**

- Missing vector layers (power_lines, railways)
- Incorrect penalty values
- State normalization issues

**Fix:**

- Verify all vector layers loaded
- Check `pirl_parameters_default.json`
- Validate state vector ranges

### Issue 4: Training instability

**Causes:**

- Learning rate too high
- Reward scale too large
- VecNormalize not applied

**Fix:**

- Reduce learning_rate to 0.0001
- Adjust `cost_normalization_factor`
- Ensure VecNormalize wrapper active

---

**END OF PLAN**

**Status:** Ready for execution with trained model available

**Last Updated:** November 11, 2025

### To-dos

- [ ] Run data validation script to verify CRS consistency, value ranges, and layer completeness for all rasters and vectors
- [ ] Test single environment instantiation, state space dimensions, GIS queries, and hydraulics calculations
- [ ] Verify pipeline_specs.json, pirl_training_config.yaml, and pirl_parameters_default.json are consistent and correct
- [ ] Execute 10k timestep test run to verify training loop, model checkpointing, and basic functionality
- [ ] Run post-training validation: route generation, trajectory analysis, constraint compliance checks, and export results