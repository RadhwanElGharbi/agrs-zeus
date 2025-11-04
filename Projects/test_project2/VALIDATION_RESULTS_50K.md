# 50K Training Validation Results - Corrected Coastline Logic

**Date:** November 3, 2025  
**Training:** 50k timesteps with corrected coastline logic  
**Status:** ⚠️ UNEXPECTED RESULTS

---

## Training Summary

**Configuration:**
- Timesteps: 50,000
- Parallel envs: 4
- Coastline logic: FIXED (blocks <200m, allows >200m)
- Training duration: Completed at 14:17 (afternoon)
- Build: Fresh compilation with corrected code

---

## Route Analysis

### Overview
- **Length:** 11.30 km (113 segments)
- **Goal distance:** 62 km
- **Progress:** 18% (52.2 km remaining)
- **Termination:** Excessive slope at segment 113

### Land Cover Distribution
| Type | Segments | Percentage |
|------|----------|------------|
| Cropland | 87/113 | 77.0% |
| Grassland | 14/113 | 12.4% |
| Tree cover | 6/113 | 5.3% |
| Built-up | 4/113 | 3.5% |
| **Water** | **0/113** | **0.0%** ⚠️ |

### Water Coverage
- **Segments:** 0/113 (0.0%)
- **Length:** 0.00 km
- **Status:** ⚠️ UNEXPECTED - Rivers should be crossable now

---

## Issues Identified

### Issue 1: Coastline Not Visible in Training Logs ⚠️

**Evidence:**
- No "Coastline boundary loaded" message in training logs
- No "No coastline" message either
- Direct C++ test shows: "✅ Coastline boundary loaded (37 segments)"

**Likely Cause:**
- Coastline loads BEFORE "Loading vector constraints..." message
- Python logger not capturing early C++ stdout
- Coastline IS loading (confirmed in direct test), just not visible in logs

**Impact:**
- Uncertain if coastline constraint is actually active during training
- Cannot verify from logs alone

### Issue 2: 0% Water Coverage (Same as Wrong Logic) ❌

**Expected with corrected logic:** 2-5% water (inland rivers)  
**Actual:** 0% water (no rivers crossed)

**Possible Explanations:**

**A) Coastline not actually loading in training:**
- Python training wrapper might not pass correct project directory
- File path resolution issue in parallel environments
- Coastline loads in test but not in actual training

**B) Agent learning too conservatively:**
- 50k timesteps insufficient to learn river crossing
- Agent finds "avoid all water" policy works well enough
- Needs more training to differentiate coast vs rivers

**C) Terrain blocking without river option:**
- Agent hits steep terrain before needing rivers
- Terminates early (11.3km) before reaching river crossings
- Route incomplete, so water stats meaningless

### Issue 3: Incomplete Route (18% Progress) ❌

**Expected:** Complete 62km route  
**Actual:** 11.3km then terminated (excessive slope 30.7%)

**This suggests:**
- Agent trapped between terrain and constraints
- 50k timesteps insufficient for complex navigation
- Similar behavior to 1.3M training with wrong logic

---

## Diagnostic Test Needed

To determine if coastline is ACTUALLY loading during training:

### Test 1: Check for Coastline Terminations

```bash
grep -i "coastline\|boundary violated" PIRL/training_50k_fixed_logic.log
```

**Result:** No matches

**Interpretation:**
- Either coastline not loading OR
- Agent never got close enough to coastline to violate it OR
- Termination messages not being logged

### Test 2: Direct Environment Test (Already Done)

**Result:** ✅ "Coastline boundary loaded (37 segments)"

**Interpretation:**
- Coastline CAN load from C++
- File path and logic are correct
- Issue must be in training environment initialization

---

## Hypothesis: Python Wrapper Issue

The training uses `PIRLNativeEnvironment` wrapper which might not be passing the correct project directory to C++, causing coastline path resolution to fail.

### Evidence:
1. Direct `create_environment('config.yaml')` loads coastline ✅
2. Training via Python wrapper shows no coastline messages ❌
3. Same file, same config, different initialization path

### Solution:
Check `/opt/agrs/python/pirl_training/pirl_native_env.py` to ensure project directory is correctly passed to C++.

---

## Comparison: All Three Runs

| Run | Water Coverage | Route Length | Completion | Coastline Status |
|-----|---------------|--------------|------------|------------------|
| **2M (no coastline)** | 58.6% | 71 km | 100% | N/A |
| **1.3M (wrong logic)** | 0.0% | 8.1 km | 13% | Wrong (blocked rivers) |
| **50k (fixed logic)** | 0.0% | 11.3 km | 18% | Unknown (not visible) |

**Pattern:** Both "corrected" runs show 0% water and early termination, suggesting the fundamental issue is not the logic direction, but whether coastline loads at all.

---

## Next Steps

### Option A: Verify Coastline Loading in Training

1. Add explicit logging to confirm coastline loads
2. Check if `has_coastline()` returns true during training
3. Verify Python wrapper passes correct paths

### Option B: Run Longer Training

- 50k might be too short to learn complex navigation
- Try 200k or 500k timesteps
- See if water coverage changes over time

### Option C: Test Without Coastline File

- Temporarily rename coastline file
- Train again
- Compare results - should be identical if coastline not loading

### Option D: Manual Route Test

Generate multiple routes from 50k model to see if ANY cross water:
- Try different random seeds
- Run stochastic (non-deterministic) inference
- Check if agent CAN cross rivers or always avoids

---

## Recommendations

**Immediate:**
1. ✅ Verify coastline loading mechanism in Python wrapper
2. ⏳ Add explicit has_coastline() check in training logs
3. ⏳ Test with longer training (200k-500k timesteps)

**If coastline confirmed not loading:**
- Fix Python wrapper to pass correct project directory
- Rebuild and retrain
- Expect 2-5% water coverage

**If coastline confirmed loading but agent still avoids water:**
- This could be correct behavior at 50k (early training)
- Agent may learn to cross rivers later (200k+)
- Or terrain is legitimately forcing early termination

---

## Bottom Line

**Status:** INCONCLUSIVE ⚠️

The corrected coastline logic may be working, but:
1. Cannot confirm coastline loads during training
2. 0% water coverage unexpected (should allow rivers)
3. Early termination (18%) prevents meaningful analysis
4. 50k timesteps likely insufficient for complex learning

**Recommended Action:**
Verify coastline loading in training wrapper, then run 200k+ timestep validation test.

---

**Files:**
- Training log: `PIRL/training_50k_fixed_logic.log`
- Route GeoJSON: `PIRL/outputs/route_50k_fixed.geojson`
- Validation output: `validation_output.log`

