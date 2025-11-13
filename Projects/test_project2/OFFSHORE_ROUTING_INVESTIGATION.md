# Offshore Routing Investigation & Fix

**Date:** November 5, 2025  
**Issue:** User reports route goes offshore in ArcGIS visualization  
**Priority:** 🚨 CRITICAL

---

## Summary of Findings

### Timeline
- **Nov 1:** Coastline data created
- **Nov 5:** 2M timestep training completed
- **Result:** Coastline SHOULD have been active during training

### Current Status
- Coastline file exists: `data/vectors/processed/coastline_epsg32633_processed.gpkg`
- Coastline covers project area: ✅ (extent matches route)
- Coastline code implemented: ✅ (in PIRL.cpp)
- Route has 80% water coverage (529/661 segments)

### Key Question
**Is this actually offshore routing, or inland river following?**

---

## Analysis: Offshore vs Inland Water

### Scenario 1: Route IS Following Inland Rivers (Good)

**Evidence:**
- 80% water coverage could be 52km of river valley following
- We confirmed earlier that rivers have 0% slope = optimal terrain
- Coastline constraint IS implemented and should prevent offshore

**What user sees in ArcGIS:**
- If basemap doesn't match data projection, route appears offshore
- If coastline layer not loaded, can't tell if water is sea or river

### Scenario 2: Route IS Going Offshore (Bad)

**Evidence:**
- User explicitly states "routed through the sea"
- Coastline constraint may not be working despite implementation

**Possible causes:**
1. Coastline file path wrong during training
2. Coastline geometry loading failed silently
3. Penalty too weak relative to other costs
4. Coordinate system mismatch

---

## Immediate Actions Required

### Action 1: Verify Training Logs

Check if coastline was actually loaded during training:

```bash
grep -i "coastline" Projects/test_project2/PIRL/outputs/training_log_2M.txt
```

**Expected:**
```
✅ Coastline boundary loaded (37 segments)
```

**If NOT found:**
- Coastline was NOT loaded during training
- Agent was never constrained
- **Must retrain with coastline active**

### Action 2: Overlay in ArcGIS

**User must do:**
1. Load route: `route_2M_final_PRUNED_CORRECTED_COSTS.geojson`
2. Load coastline: `data/vectors/processed/coastline_epsg32633_processed.gpkg`
3. Load basemap: OpenStreetMap or satellite imagery
4. Verify CRS match: All layers should be EPSG:32633

**Check:**
- Is route crossing coastline polyline? → **OFFSHORE (bad)**
- Is route following rivers inland? → **INLAND WATER (good)**

### Action 3: Spatial Query

Run spatial query to determine if route crosses coastline:

```python
import geopandas as gpd

# Load route and coastline
route = gpd.read_file('PIRL/outputs/route_2M_final_PRUNED.geojson')
coastline = gpd.read_file('data/vectors/processed/coastline_epsg32633_processed.gpkg')

# Check for intersections
crossings = route.overlay(coastline, how='intersection')

if len(crossings) > 0:
    print(f"⚠️  ROUTE CROSSES COASTLINE at {len(crossings)} locations!")
    print(crossings[['geometry']])
else:
    print(f"✅ Route does NOT cross coastline")

# Check distance to coastline
route['dist_to_coast'] = route.geometry.distance(coastline.unary_union)
offshore_segments = route[route['dist_to_coast'] < 10]

print(f"\nSegments within 10m of coastline: {len(offshore_segments)}")
```

---

## Fix Implementation

### If Coastline NOT Loaded During Training

**Root Cause:** File path wrong or loading failed

**Fix:**
1. Add detailed logging to `PIRL.cpp`:
   ```cpp
   std::cout << "🌊 Attempting to load coastline..." << std::endl;
   std::cout << "   Checking: " << coastline_path << std::endl;
   std::cout << "   Exists: " << (fs::exists(coastline_path) ? "YES" : "NO") << std::endl;
   ```

2. Verify file during initialization:
   ```cpp
   if (fs::exists(coastline_path)) {
       std::cout << "✅ Coastline file found, loading..." << std::endl;
       // ... loading code ...
   } else {
       std::cout << "❌ Coastline file NOT FOUND at: " << coastline_path << std::endl;
       std::cout << "   Offshore routing will NOT be constrained!" << std::endl;
   }
   ```

3. **Retrain model** with verified coastline loading

### If Coastline Loaded But Agent Ignores It

**Root Cause:** Penalty too weak

**Current penalties:**
- Coastline violation: -1000.0 reward
- Immediate termination: Yes

**Problem:** -1000 penalty might be overcome by:
- Goal progress bonus: +10.0 per meter
- Terrain cost savings: Offshore flat vs inland hills

**Fix: Increase penalty:**

```cpp
// In PIRL_Environment.cpp calculate_reward()
if (gis_->has_coastline() && gis_->is_beyond_coastline(new_state.x, new_state.y)) {
    double offshore_penalty = -10000.0;  // Was -1000, now 10x stronger
    info.constraint_penalty += offshore_penalty;
    info.total_reward += offshore_penalty;
}
```

---

## Building Clearance Implementation

**SEPARATE ISSUE:** Built-up area violations (7.3% of route)

### Quick Implementation

**File:** `src/pirl/PIRL.cpp`

```cpp
// In calculate_segment_cost()
int land_cover = to_state.land_cover_class;

// Built-up area constraint (houses minimum distance 13.5m)
if (land_cover == 50) {  // Built-up areas
    // This is a HARD NO-GO - should not be in built-up land cover at all
    // Built-up LC=50 from ESA WorldCover has 10m resolution
    // If we're IN a built-up pixel, we're < 5m from buildings
    crossing_cost_val += 10000000.0;  // 10 MILLION penalty - essentially forbidden
}
```

**File:** `src/pirl/PIRL_Environment.cpp`

```cpp
// In check_termination()
// Built-up area violation - IMMEDIATE TERMINATION
int land_cover = gis_->get_land_cover_class(state.x, state.y);
if (land_cover == 50) {  // Built-up areas
    reason = "FAILURE: Built-up area violation (< 13.5m from buildings)";
    return true;
}
```

**Rationale:**
- ESA WorldCover LC=50 (built-up) has 10m resolution
- If a point is IN a built-up pixel, it's within ~5-10m of buildings
- This violates the 13.5m clearance requirement
- Solution: Make LC=50 a hard constraint (immediate termination)

---

## Complete Fix Plan

### Step 1: Diagnostic Run

```bash
cd /opt/agrs/Projects/test_project2

# Check if coastline loaded during training
grep "coastline" PIRL/logs/*.log

# Run spatial analysis
python3 << 'EOF'
import geopandas as gpd

route = gpd.read_file('PIRL/outputs/route_2M_final_PRUNED.geojson')
coastline = gpd.read_file('data/vectors/processed/coastline_epsg32633_processed.gpkg')

crossings = route.overlay(coastline, how='intersection')
print(f"Coastline crossings: {len(crossings)}")

if len(crossings) > 0:
    print("❌ ROUTE CROSSES COASTLINE - RETRAIN REQUIRED")
else:
    print("✅ Route does not cross coastline")
    print("   80% water is likely inland rivers (correct behavior)")
EOF
```

### Step 2: Implement Fixes

**A. Strengthen Coastline Constraint:**
1. Increase penalty: -1000 → -10000
2. Add verbose logging
3. Verify file loading at startup

**B. Add Built-Up Hard Constraint:**
1. Make LC=50 immediate termination
2. Add massive cost penalty (10M)
3. Prevents any routing through buildings

**C. Update Code:**
```bash
# Edit files
vim /opt/agrs/src/pirl/PIRL.cpp
vim /opt/agrs/src/pirl/PIRL_Environment.cpp

# Rebuild
cd /opt/agrs
mkdir -p build && cd build
cmake .. && make -j$(nproc)
```

### Step 3: Test Run (50k steps)

```bash
cd /opt/agrs/Projects/test_project2
python3 train_pirl_direct.py \
    --config PIRL/pirl_training_config_test.yaml \
    --project-dir . \
    --total-timesteps 50000
```

**Validation:**
- Check training logs for coastline loading
- Generate route
- Verify 0 coastline crossings
- Verify 0 built-up segments

### Step 4: Full Retrain (2M steps)

Only if test passes:
```bash
python3 train_pirl_direct.py \
    --config PIRL/pirl_training_config_production.yaml \
    --project-dir . \
    --total-timesteps 2000000
```

---

## Expected Behavior After Fix

### Coastline Constraint:
- ✅ Agent avoids going offshore entirely
- ✅ Coastline treated as hard boundary
- ✅ Inland rivers/lakes still allowed (< 200m from coast = blocked only if water LC)
- ✅ Route may be longer due to staying inland

### Built-Up Constraint:
- ✅ Agent never enters LC=50 pixels
- ✅ Maintains >13.5m from buildings
- ✅ Route avoids urban areas or skirts edges
- ✅ May route through rural/agricultural areas

### Combined Result:
- Route length: 80-120 km (vs current 76 km)
- Water coverage: 20-40% (rivers only, no offshore)
- Built-up coverage: 0% (hard constraint)
- All constraints satisfied

---

## Validation Checklist

After fixes and retraining:

- [ ] Training logs show "Coastline boundary loaded"
- [ ] No "offshore" or "coastline violation" in training logs
- [ ] Generated route has 0 coastline crossings (spatial query)
- [ ] Generated route has 0 built-up segments (LC=50)
- [ ] Route visualizes correctly in ArcGIS (inland only)
- [ ] Route reaches goal consistently
- [ ] Route length reasonable (<150 km)

---

## Files to Modify

1. **`src/pirl/PIRL.cpp`**
   - Add coastline loading logging
   - Add built-up cost penalty (10M)

2. **`src/pirl/PIRL_Environment.cpp`**
   - Increase coastline penalty (-10000)
   - Add built-up termination (LC=50)

3. **`Projects/test_project2/PIRL/pirl_training_config_test.yaml`**
   - Keep at 50k steps for testing

4. **`Projects/test_project2/PIRL/pirl_training_config_production.yaml`**
   - Keep at 2M steps for production

---

## Next Steps

**USER ACTION REQUIRED:**
1. Open ArcGIS
2. Load route + coastline + basemap
3. Visual inspection: Is route actually offshore or following inland rivers?
4. Report findings

**THEN:**
- If offshore: Implement fixes above and retrain
- If inland rivers: Just fix built-up constraint and retrain

---

**Status:** 🔍 **INVESTIGATION IN PROGRESS**  
**Estimated Fix Time:** 4-6 hours (if retrain needed)  
**Risk:** **HIGH** (regulatory/legal compliance)




