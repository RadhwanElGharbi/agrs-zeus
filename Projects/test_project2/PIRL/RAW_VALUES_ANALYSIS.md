# Raw Values Analysis & Solution

## Problem Statement
GeoJSON outputs were showing normalized/approximated values (slope=379%, distances=3796m) instead of real-world measurements from the actual routing simulation.

## Root Cause Analysis

### Architecture Discovery
The PIRL system has a 3-layer data flow:

```
1. State Struct (C++)          → Stores RAW values (x=379648m, y=4805030m, slope=24.1%)
2. State::to_vector() (C++)    → Outputs NN-friendly scaled values (x=3.8, y=48.05, slope=0.24)
3. VecNormalize (Python/SB3)   → Further normalizes for training stability
```

### The Mistake
I attempted to make `to_vector()` output raw values (x=379648 instead of x=3.8), which:
- ❌ Breaks neural network training (values too large, causes instability)
- ❌ Causes memory corruption (all state values become 3.796839)
- ❌ Misunderstands the design: `to_vector()` is for **NN input**, not for **data export**

### The Correct Solution
**DO NOT** change `to_vector()`. Instead, fix the GeoJSON generator to:
1. ✅ Read from `trajectory_` (C++ vector of `RouteSegment` structs)
2. ✅ Use raw values directly: `segment.elevation_start`, `segment.slope`, `segment.cost_usd`
3. ✅ Expose `get_trajectory()` in Python bindings if needed

## What `to_vector()` SHOULD Output (for NN)

```cpp
// Scaled for neural network consumption (prevents NaN, improves convergence)
return {
    safe_float(x / 100000.0, 0.0, 10.0),           // 379648 → 3.8 (manageable range)
    safe_float(y / 100000.0, 0.0, 100.0),          // 4805030 → 48.05
    safe_float(goal_distance / 100000.0, 0.0, 10.0), // 61967 → 0.62
    safe_float(slope / 100.0, 0.0, 1.0),           // 24.1% → 0.241
    safe_float(water_proximity, 0.0, 1.0),         // Already normalized
    ...
};
```

**Why?**
- Large coordinates (379648) cause NN instability
- Division by 100km scales to ~0-10 range
- VecNormalize further standardizes (mean=0, std=1)

## What GeoJSON Generator SHOULD Use

```python
# From trajectory_ (raw RouteSegment data)
segment_props = {
    "elevation_start": segment.elevation_start,  # 161.7m (real DEM value)
    "slope_percent": segment.slope,              # 24.1% (real terrain slope)
    "cost_usd": segment.cost,                    # $15,420 (real cost calculation)
    "water_proximity_m": segment.water_proximity, # 457.4m (real GIS distance)
    ...
}
```

**NOT this:**
```python
# From state.to_vector() (NN-scaled values)
segment_props = {
    "elevation_start": state_vec[4] * 1000,  # 0.1617 * 1000 = 161.7 ❌ WRONG APPROACH
    "slope_percent": state_vec[5] * 100,     # 0.241 * 100 = 24.1 ❌ FRAGILE
}
```

## Current Status

### What Works
- ✅ C++ `State` struct stores RAW values correctly
- ✅ C++ `trajectory_` stores RAW `RouteSegment` data correctly
- ✅ GIS queries return real distances, elevations, slopes
- ✅ Cost calculations use real USD amounts
- ✅ 27D state space with crossing features implemented

### What's Broken
- ❌ `generate_route_from_model_detailed.py` reads from state vector instead of trajectory
- ❌ GeoJSON shows approximated values (slope=379%) not real values (slope=24.1%)
- ❌ Missing crossing context fields in GeoJSON output (6 new dimensions not exported)

## Action Plan

### 1. Revert `PIRL.cpp` Changes
Keep `to_vector()` outputting NN-scaled values as originally designed.

### 2. Expose Trajectory in Python
Add to `pirl_native_bindings.cpp`:
```cpp
.def("get_trajectory", &PipelineEnvironment::get_trajectory)
.def("get_latest_segment", [](PipelineEnvironment& env) {
    auto traj = env.get_trajectory();
    if (traj.empty()) throw std::runtime_error("No trajectory data");
    return traj.back();
})
```

### 3. Fix GeoJSON Generator
Modify `generate_route_from_model_detailed.py` to:
```python
# Get trajectory from C++ (raw RouteSegment data)
trajectory = env.env.get_trajectory()

for i, segment in enumerate(trajectory):
    seg_props = {
        "segment_id": i + 1,
        "elevation_start": segment.elevation_start,  # RAW meters
        "slope_percent": segment.slope,              # RAW percent
        "cost_usd": segment.cost,                    # RAW USD
        "water_proximity_m": segment.water_proximity, # RAW meters
        # ... all other real values
    }
```

### 4. Add Missing Crossing Fields
Extract from State struct (not state vector):
```python
# Access raw State object, not to_vector() output
crossing_data = {
    "nearest_crossing_dist": current_state.nearest_crossing_dist,  # RAW meters
    "nearest_crossing_width": current_state.nearest_crossing_width,
    "nearest_crossing_type": current_state.nearest_crossing_type,
    # ... etc
}
```

## Validation Checklist

After implementing fixes:
- [ ] GeoJSON coordinates in decimal (not scientific) notation
- [ ] Slope values 0-50% (not 379%)
- [ ] Distances in real meters (not 3796m everywhere)
- [ ] Costs in real USD (not approximated)
- [ ] All 6 crossing context fields present
- [ ] Training still works (NN gets scaled values)
- [ ] VecNormalize stats saved/loaded correctly

## Key Insight

**The state vector (`to_vector()`) is NOT the source of truth for data export.  
The trajectory (`std::vector<RouteSegment>`) is the source of truth.**

- State vector = **NN input** (scaled for training)
- Trajectory = **Data export** (raw for analysis)

Mixing these two is what caused all the issues.

## Next Steps

1. User approval of this analysis
2. Revert PIRL.cpp to original to_vector()
3. Expose trajectory in Python bindings
4. Rewrite GeoJSON generator to use trajectory
5. Run 10k validation test
6. Verify GeoJSON quality

---

**STATUS**: Waiting for approval to proceed with implementation.

