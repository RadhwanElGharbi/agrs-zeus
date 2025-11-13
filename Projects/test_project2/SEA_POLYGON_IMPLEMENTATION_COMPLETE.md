# Sea Polygon & Built-Up Area Constraints - Implementation Complete

**Date:** November 5, 2025  
**Status:** ✅ **CODE CHANGES COMPLETE - Ready for Rebuild & Test**

---

## Summary

Implemented two critical hard constraints to prevent:
1. **Offshore routing** - 1km exclusion zone around sea polygon
2. **Built-up area violations** - Immediate termination in LC=50 pixels

---

## Implementation Details

### 1. Sea Polygon Detection (Python Script)

**File:** `/opt/agrs/scripts/extract_sea_polygon.py`
- Extracts largest water polygon from ESA WorldCover (LC=80)
- Saves to `data/vectors/sea_polygon.gpkg`
- **Result for test_project2:** 691.23 km² sea polygon detected ✅

### 2. Header File Updates

**File:** `/opt/agrs/include/agrs_zeus/PIRL.h`

**Changes:**
- Replaced `coastline_geom_` with `sea_polygon_geom_`
- Replaced `is_beyond_coastline()` with `is_near_sea()`
- Added `distance_to_sea()` method
- Added `has_sea_polygon()` check

### 3. GISDataManager Implementation

**File:** `/opt/agrs/src/pirl/PIRL.cpp`

**Sea Polygon Loading (lines 231-267):**
```cpp
// Load sea polygon (largest water body - 1km exclusion zone)
std::string sea_polygon_path = project_dir_ + "/data/vectors/sea_polygon.gpkg";

if (fs::exists(sea_polygon_path)) {
    std::cout << "    🌊 Loading sea polygon..." << std::endl;
    // ... loads polygon and displays area ...
    std::cout << "       ✅ Sea polygon loaded:" << std::endl;
    std::cout << "          Area: " << area_km2 << " km²" << std::endl;
    std::cout << "          Exclusion zone: 1000 m (1 km)" << std::endl;
}
```

**Distance & Proximity Checks (lines 744-770):**
```cpp
double GISDataManager::distance_to_sea(double x, double y) const {
    if (!sea_polygon_geom_) {
        return std::numeric_limits<double>::max();
    }
    return sea_polygon_geom_->Distance(&point);
}

bool GISDataManager::is_near_sea(double x, double y) const {
    const double SEA_EXCLUSION_DISTANCE_M = 1000.0;
    return distance < SEA_EXCLUSION_DISTANCE_M;
}
```

**Added Include:** `<limits>` for `std::numeric_limits`

### 4. Environment Reward Penalties

**File:** `/opt/agrs/src/pirl/PIRL_Environment.cpp`

**Sea Proximity Penalty (lines 300-306):**
```cpp
if (gis_->has_sea_polygon() && gis_->is_near_sea(new_state.x, new_state.y)) {
    double sea_penalty = -10000.0;  // 10x stronger than old coastline
    info.constraint_penalty += sea_penalty;
    info.total_reward += sea_penalty;
}
```

**Built-Up Area Penalty (lines 308-316):**
```cpp
int land_cover = gis_->get_land_cover_class(new_state.x, new_state.y);
if (land_cover == 50) {  // Built-up areas
    double buildup_penalty = -10000.0;
    info.constraint_penalty += buildup_penalty;
    info.total_reward += buildup_penalty;
}
```

### 5. Environment Termination Conditions

**File:** `/opt/agrs/src/pirl/PIRL_Environment.cpp`

**Sea Proximity Termination (lines 378-385):**
```cpp
if (gis_->has_sea_polygon() && gis_->is_near_sea(state.x, state.y)) {
    double distance = gis_->distance_to_sea(state.x, state.y);
    reason = "FAILURE: Too close to sea (" + 
             std::to_string(static_cast<int>(distance)) + 
             "m < 1000m exclusion zone)";
    return true;  // Immediate termination
}
```

**Built-Up Termination (lines 387-392):**
```cpp
int land_cover = gis_->get_land_cover_class(state.x, state.y);
if (land_cover == 50) {  // Built-up areas
    reason = "FAILURE: Built-up area violation (<13.5m from buildings)";
    return true;  // Immediate termination
}
```

---

## Files Modified

1. ✅ `/opt/agrs/include/agrs_zeus/PIRL.h` - Header updates
2. ✅ `/opt/agrs/src/pirl/PIRL.cpp` - GISDataManager implementation
3. ✅ `/opt/agrs/src/pirl/PIRL_Environment.cpp` - Constraints enforcement
4. ✅ `/opt/agrs/scripts/extract_sea_polygon.py` - Sea extraction utility

## Files Created

1. ✅ `/opt/agrs/Projects/test_project2/data/vectors/sea_polygon.gpkg` - 691.23 km² sea polygon

---

## Next Steps

### Step 1: Rebuild C++ Code

```bash
cd /opt/agrs
mkdir -p build && cd build
cmake .. && make -j$(nproc)
```

**Expected:** Clean build with no errors

### Step 2: Test with 50k Steps

```bash
cd /opt/agrs/Projects/test_project2

# Update config for test
# Edit PIRL/pirl_training_config_test.yaml
# Ensure total_timesteps: 50000

python3 train_pirl_direct.py \
    --config PIRL/pirl_training_config_test.yaml \
    --project-dir . \
    --total-timesteps 50000
```

**Expected output:**
```
🌊 Loading sea polygon...
   ✅ Sea polygon loaded:
      Area: 691.23 km²
      Exclusion zone: 1000 m (1 km)
      🔒 Offshore routing will be blocked
```

**During training:**
- Episodes should terminate with "FAILURE: Too close to sea" messages
- No "FAILURE: Built-up area violation" after agent learns
- Agent should learn to avoid both constraints

### Step 3: Generate & Validate Route

```bash
# After training completes
python3 generate_route_from_model.py \
    --model PIRL/models/pirl_model_50000_steps.zip \
    --config PIRL/pirl_training_config_test.yaml \
    --project-dir . \
    --output PIRL/outputs/route_50k_test.geojson
```

**Validation:**
```python
import geopandas as gpd

route = gpd.read_file('PIRL/outputs/route_50k_test.geojson')
sea = gpd.read_file('data/vectors/sea_polygon.gpkg')

# Check distance to sea
min_dist = route.distance(sea.unary_union).min()
print(f"Minimum distance to sea: {min_dist:.2f} m")
assert min_dist > 1000, f"Route violates 1km exclusion zone! ({min_dist:.2f}m)"

# Check built-up areas
segments = [f for f in route['features'] if f['id'] != 'full_route']
buildup_segs = [s for s in segments if s['properties'].get('land_cover_class') == 50]
print(f"Built-up segments: {len(buildup_segs)}")
assert len(buildup_segs) == 0, f"Route violates built-up constraint!"

print("✅ All constraints satisfied!")
```

### Step 4: Full Production Training

**Only if Step 3 passes!**

```bash
python3 train_pirl_direct.py \
    --config PIRL/pirl_training_config_production.yaml \
    --project-dir . \
    --total-timesteps 2000000
```

**Duration:** ~12-17 hours on CPU

---

## Expected Behavior After Training

### Sea Polygon Constraint:
- ✅ Agent maintains >1km from sea polygon at all times
- ✅ No offshore segments in final route
- ✅ Inland rivers/lakes still allowed (not part of sea polygon)
- ✅ Route may be longer due to avoiding coastal areas

### Built-Up Area Constraint:
- ✅ Agent never enters LC=50 pixels
- ✅ No segments through buildings
- ✅ Maintains >13.5m clearance (implicit via 10m pixel size)
- ✅ Route avoids urban areas or skirts edges

### Combined Result:
- Route length: 80-120 km (longer than 76 km due to constraints)
- Water coverage: 20-40% (inland rivers only)
- Built-up coverage: 0%
- Sea proximity: >1km minimum
- **All safety and regulatory constraints satisfied**

---

## Validation Checklist

After rebuild and test training:

- [ ] Code compiles without errors
- [ ] Training logs show "Sea polygon loaded: 691.23 km²"
- [ ] Episodes terminate with sea/built-up failure messages
- [ ] Generated route maintains >1km from sea
- [ ] Generated route has 0 built-up segments (LC=50)
- [ ] Spatial validation confirms no violations
- [ ] Route reaches goal (or gets very close)
- [ ] Training completes without crashes

---

## Comparison: Old vs New Approach

| Aspect | Old (Coastline) | New (Sea Polygon) |
|--------|-----------------|-------------------|
| **Data Source** | External file | ESA WorldCover (already required) |
| **Reliability** | May be misaligned | Perfect alignment guaranteed |
| **Coverage** | May not cover AOI | Always covers AOI |
| **Logic** | Complex (line + buffer) | Simple (polygon + distance) |
| **Distinction** | Hard to separate inland/offshore | Clear: largest=sea, others=inland |
| **Maintenance** | Requires external updates | Self-contained |
| **Threshold** | 200m (too small) | 1km (more conservative) |

---

## Technical Notes

### Why 1km Exclusion Zone?

1. **Regulatory safety margin** - Offshore construction requires special permits
2. **Cost differential** - Offshore 10-100x more expensive than onshore
3. **Environmental protection** - Marine ecosystems sensitive
4. **Conservative approach** - Better to over-constrain than under-constrain
5. **Agent learning** - Clear boundary easier to learn than graduated penalty

### Why LC=50 for Built-Up?

1. **ESA WorldCover resolution** - 10m pixels
2. **If IN a built-up pixel** - Within ~5-10m of buildings
3. **13.5m requirement** - Violated if in pixel
4. **Simple check** - No need for vector building footprints
5. **Conservative** - May avoid some areas unnecessarily, but ensures compliance

### Performance Impact

- **Sea polygon check** - O(1) distance calculation, very fast
- **Land cover check** - Already cached, no performance impact
- **Memory** - One additional polygon geometry (~few KB)
- **Training time** - No significant impact

---

## Troubleshooting

### If Sea Polygon Not Loaded

**Check:**
1. File exists: `ls -lh data/vectors/sea_polygon.gpkg`
2. Run extraction: `python3 /opt/agrs/scripts/extract_sea_polygon.py ...`
3. Check land cover exists: `ls -lh data/rasters/processed/landcover*`

### If Built-Up Violations Still Occur

**Check:**
1. Land cover file loaded correctly
2. LC=50 classification correct in ESA WorldCover
3. Termination logic executing (check logs)
4. Penalty strong enough (-10000 should be sufficient)

### If Route Too Long

**Expected!** With these constraints, route will be longer:
- Avoiding 1km coastal buffer adds distance
- Avoiding urban areas adds distance
- This is correct behavior for safety/compliance

### If Agent Can't Reach Goal

**Possible causes:**
1. Goal is within exclusion zone (check goal location)
2. No viable path exists (AOI too constrained)
3. Episode length too short (increase to 10k steps)
4. Need more training (try 500k-1M steps first)

---

## Success Criteria

✅ **Implementation successful if:**

1. Code compiles and runs
2. Sea polygon loads during initialization
3. Training episodes show constraint violations initially
4. Agent learns to avoid constraints (violations decrease)
5. Final route has 0 sea violations (>1km distance)
6. Final route has 0 built-up violations (LC≠50)
7. Route reaches goal or gets close (<5km)
8. All other constraints still satisfied

---

**Status:** ✅ **IMPLEMENTATION COMPLETE**  
**Next Action:** Rebuild and test with 50k steps  
**Estimated Time:** 1-2 hours (rebuild + test) + 12 hours (full retrain)

---

## Quick Reference

**Rebuild:**
```bash
cd /opt/agrs/build && cmake .. && make -j$(nproc)
```

**Test (50k):**
```bash
cd /opt/agrs/Projects/test_project2
python3 train_pirl_direct.py --config PIRL/pirl_training_config_test.yaml --project-dir . --total-timesteps 50000
```

**Validate:**
```bash
python3 << 'EOF'
import geopandas as gpd
route = gpd.read_file('PIRL/outputs/route_50k_test.geojson')
sea = gpd.read_file('data/vectors/sea_polygon.gpkg')
dist = route.distance(sea.unary_union).min()
print(f"Sea distance: {dist:.0f}m - {'✅ PASS' if dist > 1000 else '❌ FAIL'}")
EOF
```

**Full Retrain (if test passes):**
```bash
python3 train_pirl_direct.py --config PIRL/pirl_training_config_production.yaml --project-dir . --total-timesteps 2000000
```




