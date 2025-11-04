# 2M Production Training - Status Update

**Start Time:** November 4, 2025 - 06:57 UTC  
**Status:** RUNNING  
**PID:** 1470619  
**Configuration:** Corrected coastline logic

---

## Training Configuration

- **Total timesteps:** 2,000,000
- **Parallel environments:** 8
- **Config file:** `PIRL/pirl_training_config_production.yaml`
- **Expected duration:** 13-16 hours
- **Log file:** `PIRL/training_2M_corrected.log`

---

## Coastline Constraint Status

### ISSUE IDENTIFIED: Coastline Not Loading During Training

**Evidence:**
- No "Coastline boundary loaded" message in training logs
- `grep -i coastline` returns no results in log file
- Coastline loads successfully in direct C++ environment tests
- Coastline file exists and is valid (136KB, 37 segments)

**Likely Cause:**
- Coastline loading happens BEFORE "Loading vector constraints..." section
- Python training wrapper may not capture early C++ stdout
- Coastline prints to stdout, but Python logger starts after that point

**Impact:**
- UNCERTAIN if coastline constraint is actually active during training
- Cannot verify from logs alone
- May explain 0% water coverage in previous 50k test

**Verification Needed:**
After training completes, check if route shows:
- 2-5% water coverage (rivers allowed) - coastline working correctly
- 0% water coverage (no rivers) - coastline NOT loading
- >50% water coverage (offshore) - coastline definitely not loading

---

## Corrected Coastline Logic

**Code Changes Made (Compiled in current build):**

### 1. Detection Logic (PIRL.cpp line 744-779)
```cpp
bool GISDataManager::is_beyond_coastline(double x, double y) const {
    // Hard boundary: ANY crossing of coastline itself (<10m)
    if (min_distance < COASTLINE_CROSSING_THRESHOLD) {
        return true;  // Immediate termination
    }
    
    // Coastal water buffer (<200m from coast, IF water)
    if (land_cover == 80) {  // Water
        return (min_distance < OFFSHORE_BUFFER);  // Blocks <200m, allows >200m
    }
    
    return false;  // Land positions always allowed
}
```

**Logic:**
- Position <10m from coastline polyline → BLOCKED (hard boundary)
- Water <200m from coast → BLOCKED (coastal waters)
- Water >200m from coast → ALLOWED (inland rivers)
- Land any distance → ALLOWED

### 2. Termination Logic (PIRL_Environment.cpp line 370-376)
```cpp
// Immediate termination (no recovery window)
if (gis_->has_coastline() && gis_->is_beyond_coastline(state.x, state.y)) {
    reason = "FAILURE: Coastline boundary violated";
    return true;
}
```

---

## Training Progress

**Monitor Commands:**

```bash
# Real-time log
tail -f /opt/agrs/Projects/test_project2/PIRL/training_2M_corrected.log

# Current timesteps
grep "total_timesteps" PIRL/training_2M_corrected.log | tail -1

# Verify running
ps aux | grep train_pirl_direct | grep -v grep

# TensorBoard
tensorboard --logdir PIRL/outputs/production_2M/tensorboard
```

**Expected Milestones:**
- 500k timesteps: ~3-4 hours (25% complete)
- 1M timesteps: ~7-8 hours (50% complete)
- 1.5M timesteps: ~10-12 hours (75% complete)
- 2M timesteps: ~13-16 hours (100% complete)

---

## Post-Training Validation Plan

### 1. Generate Route

```bash
cd /opt/agrs/Projects/test_project2
python generate_route_from_model.py \
  --model PIRL/models/best_model/best_model.zip \
  --config PIRL/pirl_training_config_production.yaml \
  --vec-normalize PIRL/models/pirl_italy_production_2M_vecnormalize.pkl \
  --output PIRL/outputs/route_2M_corrected.geojson \
  --deterministic
```

### 2. Analyze Water Coverage

```python
import json
with open('PIRL/outputs/route_2M_corrected.geojson') as f:
    route = json.load(f)

segments = [f for f in route['features'] if f['id'] != 'full_route']
water_segments = [s for s in segments if s['properties']['land_cover'] == 'water_bodies']
water_pct = len(water_segments) / len(segments) * 100

print(f"Water coverage: {water_pct:.1f}%")

# Expected outcomes:
# - 2-5%: Coastline working correctly (allows inland rivers)
# - 0%: Coastline not loading (blocks all water)
# - >50%: Coastline not loading (allows offshore routing)
```

### 3. Validation Script

```bash
python validate_production_route.py PIRL/outputs/route_2M_corrected.geojson
```

---

## Success Criteria

**If coastline IS working:**
- Water coverage: 2-5% (inland river crossings)
- Route completion: 100% (reaches goal)
- Route length: 62-68 km
- No coastal water segments (<200m from coastline)

**If coastline NOT working:**
- Water coverage: 0% (like 50k test) OR >50% (like old 2M)
- May show incomplete routes or offshore routing
- Will require investigation and possible retraining

---

## Contingency Plan

**If coastline not loading:**

1. **Investigate Python wrapper**
   - Check `/opt/agrs/python/pirl_training/pirl_native_env.py`
   - Verify project directory path passed to C++
   - Add explicit logging for has_coastline() check

2. **Add diagnostics to training script**
   - Print environment initialization details
   - Check if coastline_geom_ is nullptr
   - Log coastline path resolution

3. **Possible solutions:**
   - Modify Python wrapper to ensure correct paths
   - Add coastline loading to Python environment wrapper
   - Rebuild with debug logging enabled

---

## Current Status Summary

**Training:** RUNNING successfully (started 06:57 UTC)  
**Coastline:** NOT VISIBLE in logs (uncertain if active)  
**Next check:** Wait for completion and analyze final route  
**Estimated completion:** ~November 4, 2025 - 20:00-23:00 UTC

**Action:** Let training complete, then validate if coastline constraint actually worked by analyzing water coverage in final route.

---

**Log file:** `/opt/agrs/Projects/test_project2/PIRL/training_2M_corrected.log`  
**TensorBoard:** `tensorboard --logdir PIRL/outputs/production_2M/tensorboard`  
**PID:** 1470619
