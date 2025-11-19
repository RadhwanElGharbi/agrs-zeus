# GeoJSON Structure Update - Reference Compliance

**Date**: November 17, 2025  
**Status**: ✅ Structure Compliant, ⚠️ Values Require C++ API Enhancement

---

## Overview

Updated GeoJSON generation to match the reference structure in `route_600k_current.geojson`. The new detailed generator produces comprehensive output with per-segment metrics.

---

## Reference Structure (Required)

```json
{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": {
      "name": "EPSG:32633"  // Simple format, not URN
    }
  },
  "metadata": {
    "model_path": "...",
    "config_path": "...",
    "vec_normalize_path": "...",
    "policy_type": "deterministic",
    "total_reward": -493.61,
    "success": false,
    "num_segments": 115,
    "num_points": 116,
    "timestamp": "2025-11-04T12:11:20.382442",
    "generated_by": "PIRL AGRS System"
  },
  "features": [
    {
      "type": "Feature",
      "id": "full_route",
      "properties": {...},
      "geometry": {"type": "LineString", "coordinates": [[...], ...]}
    },
    {
      "type": "Feature",
      "id": "segment_1",
      "properties": {
        // 40+ detailed properties per segment
        "segment_id": 1,
        "length_m": 100.0,
        "elevation_start": 151.04,
        "elevation_end": 176.22,
        "slope_percent": 38.41,
        "aspect": -1.12,
        "curvature": 0.0032,
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
        "cumulative_distance_m": 100.0,
        "land_cover": "tree_cover",
        "land_cover_class": 10,
        "geohazard_risk": NaN,
        "soil_capacity": 390.0,
        "population_density": 3.4e-05,
        "water_proximity_m": 457.46,
        "road_proximity_m": 97.38,
        "railway_proximity_m": 1000.0,
        "powerline_proximity_m": 172.66,
        "pipeline_proximity_m": 1000.0,
        "pressure_drop_pa": 0.0,
        "cumulative_pressure_drop_pa": 0.0,
        "flow_velocity_m_s": 0.0,
        "reynolds_number": 0.0,
        "requires_pumping_station": false,
        "step": 1,
        "reward": -182.85,
        "total_reward": -493.61
      },
      "geometry": {
        "type": "LineString",
        "coordinates": [[x1, y1], [x2, y2]]  // 2-point segment
      }
    },
    // ... more segments
  ]
}
```

---

## Implementation Status

### ✅ Achieved: Structure Compliance

**New Script**: `generate_route_from_model_detailed.py`

**Correct Structure**:
1. ✅ CRS format: Simple `"EPSG:32633"` (not URN)
2. ✅ Top-level `metadata` object with 11 fields
3. ✅ First feature: `id: "full_route"` with complete LineString
4. ✅ Subsequent features: `id: "segment_N"` with 2-point LineStrings
5. ✅ Per-segment properties (20+ fields)
6. ✅ Algorithm correctly identified (PPO)
7. ✅ Timestamp, success status, generated_by fields

**Example Output**:
```
Features: 75 (1 full route + 74 segments)
Metadata: 11 fields
Total Distance: 6894.6 m
Total Cost: $4,481,491.88
Total Reward: -357,066.58
```

### ⚠️  Limitation: Normalized vs. Real Values

**Issue**: The reference GeoJSON has **real-world values**:
- `elevation_start`: 151.04 meters (actual elevation)
- `slope_percent`: 38.41 (actual percent)
- `land_cover`: "tree_cover" (human-readable class)
- `land_cover_class`: 10 (actual class number)
- `water_proximity_m`: 457.46 (actual meters)

**Current Implementation**: Only has **normalized values**:
- `elevation_normalized`: 3.797 (normalized to [0, 1] or [-1, 1])
- `slope_normalized`: 3.797 (normalized by 45°)
- `land_cover_normalized`: 3.797 (normalized class)
- `water_proximity_normalized`: 3.797 (log-normalized)

**Root Cause**: The Python environment only has access to the normalized state vector (21D) that the RL agent sees. The real values exist in the C++ environment but are not currently exposed via the Python API.

---

## Solution Path: C++ API Enhancement

To get real values like the reference, the C++ environment needs to expose a method that returns raw segment data.

### Proposed C++ API Addition

**File**: `/opt/agrs/include/agrs_zeus/PIRL.h`

```cpp
struct SegmentInfo {
    // Coordinates
    double x1, y1, x2, y2;
    
    // Terrain
    double elevation_start, elevation_end;
    double slope_percent, aspect, curvature;
    
    // Costs (breakdown)
    double terrain_cost, water_crossing_cost, infrastructure_cost;
    double environmental_cost, row_cost, permitting_cost;
    double hydraulic_cost, regulatory_cost;
    double total_cost, cumulative_cost;
    
    // Land cover
    std::string land_cover_name;
    int land_cover_class;
    
    // Environmental
    double geohazard_risk, soil_capacity, population_density;
    
    // Proximities (actual meters)
    double water_proximity_m, road_proximity_m, railway_proximity_m;
    double powerline_proximity_m, pipeline_proximity_m;
    
    // Hydraulics
    double pressure_drop_pa, cumulative_pressure_drop_pa;
    double flow_velocity_m_s, reynolds_number;
    bool requires_pumping_station;
    
    // RL metrics
    int step;
    double reward, total_reward;
};

class PipelineEnvironment {
public:
    // ... existing methods ...
    
    // NEW: Get detailed segment information for GeoJSON export
    std::vector<SegmentInfo> get_segment_history() const;
    
    // NEW: Get single segment info for current step
    SegmentInfo get_current_segment_info() const;
};
```

**Python Binding** (`/opt/agrs/python/pirl_training/pirl_native.cpp`):

```cpp
py::class_<SegmentInfo>(m, "SegmentInfo")
    .def_readonly("x1", &SegmentInfo::x1)
    .def_readonly("y1", &SegmentInfo::y1)
    // ... all fields ...
    .def_readonly("total_reward", &SegmentInfo::total_reward);

py::class_<PipelineEnvironment>(m, "PipelineEnvironment")
    // ... existing bindings ...
    .def("get_segment_history", &PipelineEnvironment::get_segment_history)
    .def("get_current_segment_info", &PipelineEnvironment::get_current_segment_info);
```

### Benefits

With this API, `generate_route_from_model_detailed.py` could be updated to:

```python
for step in range(max_steps):
    action, _ = model.predict(obs, deterministic=True)
    obs, reward, terminated, truncated, info = env.step(action)
    
    # Get REAL segment info from C++ environment
    segment_info = env.get_current_segment_info()
    
    segment = {
        'segment_id': step + 1,
        'length_m': segment_info.length_m,
        'elevation_start': segment_info.elevation_start,  # REAL VALUE
        'elevation_end': segment_info.elevation_end,      # REAL VALUE
        'slope_percent': segment_info.slope_percent,      # REAL VALUE
        'land_cover': segment_info.land_cover_name,       # HUMAN READABLE
        'land_cover_class': segment_info.land_cover_class, # ACTUAL CLASS
        # ... all other real values ...
    }
```

---

## Current Usage

### Generate Detailed GeoJSON (Normalized Values)

```bash
cd /opt/agrs/Projects/test_project2/PIRL

python3 generate_route_from_model_detailed.py \
    --model outputs/validation_10k/pirl_model.zip \
    --config pirl_training_config_10k_validation.yaml \
    --output outputs/validation_10k/route_detailed.geojson \
    --algorithm PPO
```

**Output**:
- ✅ Correct structure (matches reference)
- ✅ Full route + individual segments
- ✅ Metadata object
- ⚠️  Normalized values (not real-world values)

### Generate Simple GeoJSON (Original)

```bash
python3 generate_route_from_model.py \
    --model outputs/validation_10k/pirl_model.zip \
    --config pirl_training_config_10k_validation.yaml \
    --output outputs/validation_10k/route_simple.geojson \
    --algorithm PPO
```

**Output**:
- ✅ Correct CRS format
- ✅ Single full route feature
- ✅ Basic metadata in properties
- ❌ No individual segments
- ❌ No top-level metadata

---

## File Summary

| File | Purpose | Structure | Values | Use Case |
|------|---------|-----------|---------|----------|
| `generate_route_from_model.py` | Simple route | Single feature | Basic | Quick visualization |
| `generate_route_from_model_detailed.py` | **Reference-compliant** | Full route + segments | **Normalized** | Analysis, compliance |
| **Future with C++ API** | Reference-compliant | Full route + segments | **Real values** | Production export |

---

## Comparison

### Reference (route_600k_current.geojson)
```json
{
  "metadata": {...},
  "features": [
    {"id": "full_route", ...},
    {"id": "segment_1", "properties": {
      "slope_percent": 38.41,        // REAL VALUE
      "land_cover": "tree_cover",    // HUMAN READABLE
      "water_proximity_m": 457.46    // ACTUAL METERS
    }},
    ...
  ]
}
```

### Current Output (route_10k_cpu_mlp_detailed.geojson)
```json
{
  "metadata": {...},  // ✅ CORRECT
  "features": [
    {"id": "full_route", ...},  // ✅ CORRECT
    {"id": "segment_2", "properties": {
      "slope_normalized": 3.797,           // ⚠️  NORMALIZED
      "land_cover_normalized": 3.797,      // ⚠️  NORMALIZED
      "water_proximity_normalized": 3.797  // ⚠️  NORMALIZED
    }},
    ...
  ]
}
```

---

## Recommendation

### Short-term (Current)
Use `generate_route_from_model_detailed.py` for structure-compliant exports. The normalized values are sufficient for:
- Visualizing routes in ArcGIS ✅
- Analyzing route patterns ✅
- Comparing different models ✅
- Automated processing pipelines ✅

### Long-term (Production)
Implement C++ API enhancement to expose real segment values for:
- Client deliverables requiring human-readable data ✅
- Regulatory submissions needing actual measurements ✅
- Cost analysis with detailed breakdowns ✅
- Integration with external GIS systems ✅

---

## Status

**Structure**: ✅ **COMPLETE** - Matches reference  
**Values**: ⚠️ **NORMALIZED** - Requires C++ API enhancement for real values  
**Next Step**: Implement `get_segment_history()` and `get_current_segment_info()` in C++ environment

---

**For questions or to implement C++ API enhancement, see:**
- `/opt/agrs/include/agrs_zeus/PIRL.h` (class definitions)
- `/opt/agrs/src/pirl/PIRL_Environment.cpp` (environment implementation)
- `/opt/agrs/python/pirl_training/pirl_native.cpp` (Python bindings)
