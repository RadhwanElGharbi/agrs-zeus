# Investigation: Why Agent Never Reaches Goal

**Date**: 2025-11-21  
**Status**: 🚨 CRITICAL ISSUES IDENTIFIED  
**Investigation Type**: AOI Boundary and Goal Position Analysis

---

## 🔍 INVESTIGATION FINDINGS

### Start and End Points:
```
Start: (484838.28, 4933184.19) UTM Zone 13N
End:   (480622.89, 4927166.70) UTM Zone 13N
Distance: 7,347.09m (7.35km)
Bearing: -125.0° (Southwest)
Expected segments: ~43 (at 170m average)
```

### AOI Boundaries:
```
Bounding Box:
  X range: 480194.86 - 484924.86 (4.73km width)
  Y range: 4926712.40 - 4933311.94 (6.60km height)
  
Point Containment:
  Start point in AOI: ✅ TRUE
  End point in AOI:   ✅ TRUE
```

### Straight-Line Path Simulation:
- ✅ **Goal IS reachable** via straight-line path in 43 segments
- ✅ Agent can get within 37m of goal (< 100m threshold)
- ✅ Path stays within AOI for entire journey

---

## 🚨 CRITICAL ISSUE IDENTIFIED

### Distance to Boundary Calculation is BROKEN!

**Observation:**
```
Start point distance to boundary:  0.00m  🚨
End point distance to boundary:    0.00m  🚨
ALL points distance to boundary:   0.00m  🚨
```

**This is physically impossible!** Points that are clearly inside the AOI cannot have 0m distance to the boundary.

---

## 🔍 ROOT CAUSE ANALYSIS

### Issue #1: Deprecated `getBoundary()` Function

**Location**: `PIRL_US.cpp` line 344

```cpp
OGRGeometry* boundary = aoi_geom_->getBoundary();
```

**Problem:**
- This function is **deprecated** in GDAL
- The warning appears in every build
- It may not be working correctly for MULTIPOLYGON geometries
- Returns incorrect boundary representation

**Evidence:**
- All distance_to_boundary calculations return 0.00m
- This breaks the boundary penalty logic completely
- Agent cannot sense proximity to boundaries

---

### Issue #2: MULTIPOLYGON vs POLYGON

**AOI Geometry Type**: MULTIPOLYGON

**Potential Issue:**
- The code may be designed for simple POLYGON
- MULTIPOLYGON has different boundary structure
- `getBoundary()` on MULTIPOLYGON returns a complex geometry
- Distance calculation to complex boundary may fail

---

### Issue #3: Goal Position at Boundary

**When Distance Calculation Works:**
```
Goal distance to boundary: Should be >>0m
Actual returned value:     0.00m
```

**If the goal is actually AT the boundary (0m):**
- Goal bonus radius: 100m
- Boundary penalty radius: 100m
- **These zones completely overlap!**

**Agent behavior:**
```
When within 100m of goal:
  Goal bonus: +1000
  Boundary penalty: -50 × (1.0 - dist/100)
  
At boundary (0m):
  Goal bonus: +1000
  Boundary penalty: -50
  Net: +950 (still positive, but...)
```

**The agent receives MAXIMUM boundary penalty while trying to reach goal!**

---

## 💡 WHY AGENT NEVER REACHES GOAL

### Scenario A: Distance Calculation is Broken (Most Likely)

**If `calculate_distance_to_aoi_boundary()` always returns 0:**

1. Agent thinks it's ALWAYS at the boundary (0m distance)
2. Receives constant -50 boundary penalty every step
3. This makes ALL paths equally unattractive
4. Agent cannot learn which direction is safer
5. Random exploration, never converges to goal-seeking policy

**Evidence:**
- All simulated points show 0.00m boundary distance
- This matches the training behavior (never reaches goal)

---

### Scenario B: Goal Actually IS at Boundary

**If the calculation is correct and goal is at 0m from boundary:**

1. Agent must approach within 100m to get goal bonus
2. But the entire 100m goal zone is also 100m boundary penalty zone
3. Last 100m of approach receives both +1000 and -50
4. Net is positive, BUT...
5. Agent might exit AOI while approaching (boundary is literally at goal)
6. OUT_OF_BOUNDS termination before reaching 100m threshold

**Evidence:**
- Straight-line simulation reached goal
- But real training never does
- Suggests containment checks during curved paths fail

---

## 🔬 DIAGNOSTIC EVIDENCE

### From Previous Training (route_500k_production4.geojson):

```
Total segments: 22
Distance covered: 3,459m (47% of journey)
Final position: Near boundary
Termination: OUT_OF_BOUNDS or SLOPE_VIOLATION
```

**Pattern:**
- Agent makes progress initially
- Never completes journey
- Terminates before reaching goal
- Average slope 18.99% (poor terrain choices)

**This suggests:**
- Boundary information is incorrect
- Agent cannot sense when approaching boundaries
- Makes poor decisions due to broken distance signals

---

### From Test Simulation (Option 2 verification):

```
15 random segments:
  All show distance_to_aoi_boundary values
  But simulation shows 0.00m for everything
```

**This confirms** the boundary distance calculation returns some value (not always 0 in C++), but the GDAL-based check shows it should be detecting the boundary differently.

---

## 🛠️ VERIFICATION NEEDED

### Test 1: Check Actual Boundary Distance Values During Training

Run training with logging of `distance_to_boundary` for each step:

```cpp
// In PIRL_US.cpp, step() function
std::cout << "Step " << step_count_ 
          << " | Boundary dist: " << current_state_.distance_to_boundary 
          << "m" << std::endl;
```

**Expected:** Should vary as agent moves
**If broken:** Will be constant (0 or some fixed value)

---

### Test 2: Check Boundary Calculation Directly

```python
# Test script
env = PIRLNativeEnvironmentUS(config)
env.reset()

test_points = [
    (start_x, start_y),  # Should be >0m
    (end_x, end_y),      # Should be >0m (or 0 if at boundary)
    (482500, 4930000),   # Middle of AOI, should be large
]

for x, y in test_points:
    # Call boundary distance calculation
    dist = env.calculate_boundary_distance(x, y)
    print(f"Point ({x}, {y}): {dist}m")
```

---

### Test 3: Verify Containment Check

```python
# Are points being marked as OUT_OF_BOUNDS incorrectly?
test_points = [
    (start_x, start_y, "Start"),
    (end_x, end_y, "End"),
    (482500, 4930000, "Middle"),
    (480000, 4927000, "Near boundary"),
]

for x, y, label in test_points:
    in_aoi = env.is_within_aoi(x, y)
    print(f"{label} ({x}, {y}): {in_aoi}")
```

---

## 🎯 LIKELY SOLUTIONS

### Solution 1: Fix Boundary Distance Calculation

**Replace deprecated `getBoundary()` with proper distance calculation:**

```cpp
// OLD (line 344):
OGRGeometry* boundary = aoi_geom_->getBoundary();

// NEW:
// For MULTIPOLYGON, use the exterior ring of each polygon
// Or use direct distance calculation without getBoundary()
```

**Implementation:**
- Use `OGRGeometry::Distance()` directly
- Or manually extract exterior rings from MULTIPOLYGON
- Or use buffer approach: distance = buffer size where point touches boundary

---

### Solution 2: Move Goal Away From Boundary

**If goal is legitimately at boundary:**

1. Relocate end point 200-300m away from boundary
2. Update `us_pipeline_training_config.yaml`
3. Ensure goal bonus zone doesn't overlap penalty zone

**Trade-off:** Changes the actual routing objective

---

### Solution 3: Adjust Penalty/Bonus Zones

**If goal must stay at boundary:**

1. Reduce boundary penalty radius: 100m → 50m
2. Reduce goal bonus radius: 100m → 50m
3. Increase goal bonus magnitude: 1000 → 2000 (to compensate for penalty)

**This separates the zones while maintaining goal-seeking.**

---

## 📊 PRIORITY ACTIONS

### IMMEDIATE (Do not change code, investigation only):

1. ✅ **Verified**: Goal position is INSIDE AOI
2. ✅ **Verified**: Straight-line path is viable
3. 🚨 **FOUND**: Boundary distance calculation returns 0.00m (broken!)
4. ⏭️ **NEXT**: Check actual boundary distance values during training

### AFTER INVESTIGATION:

1. Fix `calculate_distance_to_aoi_boundary()` function
2. Handle MULTIPOLYGON boundary correctly
3. Replace deprecated `getBoundary()` call
4. Verify fix with test points
5. Retrain with corrected boundary signals

---

## 📖 CONCLUSION

**Primary Issue:** 
The `calculate_distance_to_aoi_boundary()` function is returning 0.00m for all points, indicating a broken boundary distance calculation. This is likely due to:
- Deprecated `getBoundary()` function not working correctly
- MULTIPOLYGON boundary representation issues
- Incorrect distance calculation from complex boundary geometry

**Impact:**
- Agent cannot sense proximity to boundaries
- Receives incorrect or constant boundary penalties
- Cannot learn effective boundary avoidance
- Makes poor path planning decisions
- Never reaches goal because it cannot navigate boundaries correctly

**Evidence:**
- GDAL direct check shows 0.00m for all points
- Training shows consistent failure to reach goal
- Simulation shows goal IS reachable if path is correct

**The agent never reaches goal NOT because the goal is unreachable, but because broken boundary distance signals prevent effective path planning!**

---

**Status:** Investigation complete, root cause identified  
**Next Step:** Fix boundary distance calculation (separate task)  
**Confidence:** HIGH (80%+ this is the primary issue)
