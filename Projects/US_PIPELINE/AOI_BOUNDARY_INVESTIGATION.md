# AOI Boundary Investigation Report

**Date**: 2025-11-21  
**Training Run**: `production_500k_cpu_20251121_152041`  
**GeoJSON**: `route_500k_production6.geojson`  
**Status**: 🔍 Investigation Complete

---

## 🎯 EXECUTIVE SUMMARY

**Finding**: The agent **DOES exit the AOI boundary** at segment 119, terminating 36.02m outside the boundary and 1,338m short of the goal.

**Root Cause**: The straight line from start to goal is entirely within the AOI (minimum clearance 86m), BUT the agent's accumulated heading changes cause the path to drift and cross the boundary.

**Impact**: The agent learned to go straight (109.7% linearity) but accumulated small heading deviations of **23.34°** that pushed it outside the boundary.

---

## 📊 GDAL INVESTIGATION RESULTS

### 1. Start and End Points

**Start Point**: `(484838.28, 4933184.19)` UTM 13N
- ✅ **Within AOI**: YES
- Distance to boundary: **119.99m**

**End Point (Goal)**: `(480622.89, 4927166.70)` UTM 13N
- ✅ **Within AOI**: YES
- Distance to boundary: **426.69m**

**Straight Line Path**:
- Length: **7,347.09m**
- Bearing: **-144.99°** (SW)
- ✅ **Entirely within AOI**: YES
- Minimum clearance: **86.31m** (at start point)

---

### 2. Agent's Actual Path

**Total Segments**: 119  
**Total Length**: 6,695.87m (91.1% of journey)  
**Linearity**: 109.7% (nearly straight, but slightly shorter)

**Termination Point** (Segment 119): `(480164.01, 4928423.42)`
- ❌ **Within AOI**: NO
- Distance outside boundary: **36.02m**
- Distance to goal: **1,337.88m** (18.2% of journey remaining)

**Agent's Bearing at Termination**: **-121.65°**  
**Straight-line Bearing**: **-144.99°**  
**Bearing Deviation**: **23.34°** ⚠️

---

### 3. Boundary Proximity Analysis

**Segments within 200m of boundary**:

| Segment | Coordinates (X, Y)          | Distance to Boundary | Status       |
|---------|-----------------------------|----------------------|--------------|
| 1       | (484804.49, 4933137.38)     | 119.99m              | ✅ INSIDE    |
| 2       | (484776.61, 4933099.43)     | 147.78m              | ✅ INSIDE    |
| 3       | (484747.93, 4933060.98)     | 176.37m              | ✅ INSIDE    |
| ...     | ...                         | ...                  | ...          |
| 115     | (480356.67, 4928547.57)     | 156.26m              | ✅ INSIDE    |
| 116     | (480309.07, 4928515.56)     | 108.76m              | ✅ INSIDE    |
| 117     | (480261.12, 4928484.19)     | 60.90m               | ✅ INSIDE    |
| 118     | (480212.78, 4928453.48)     | **12.65m**           | ✅ INSIDE    |
| **119** | **(480164.01, 4928423.42)** | **36.02m**           | **❌ OUTSIDE** |

**Critical Zone**: Segments 116-119 (last ~230m)
- Agent approaches boundary rapidly
- Segment 118 is only **12.65m** from boundary
- Segment 119 **crosses** boundary by 36.02m → **OUT_OF_BOUNDS termination**

---

## 🔬 ROOT CAUSE ANALYSIS

### Why Does the Agent Exit the Boundary?

1. **The Straight Line Is Safe**
   - ✅ Perfect straight line from start to goal stays **86.31m** inside AOI
   - ✅ Both endpoints are well inside the boundary

2. **But the Agent's Path Isn't Perfectly Straight**
   - The agent's path is **109.7% linear** (nearly straight, but slightly curved)
   - Agent makes small heading changes throughout the journey
   - Accumulated heading deviation: **23.34°** from straight line

3. **Narrow Corridor Near the End**
   - The AOI boundary is closest to the path at the **start** (86.31m clearance)
   - But the agent's accumulated deviation causes drift
   - By segment 118, clearance is only **12.65m**
   - Segment 119 overshoots by **36.02m**

---

## 🎯 WHY THE AGENT CAN'T REACH THE GOAL

### The Problem:

**The agent learned to go nearly straight (109.7% linearity) but accumulated small heading errors (23.34° total deviation) that pushed it 36m outside the boundary before reaching the goal.**

### Mathematical Breakdown:

```
Straight-line path:
  Bearing: -144.99°
  Length: 7,347m
  Clearance: 86m minimum
  Status: ✅ Entirely within AOI

Agent's actual path:
  Bearing at termination: -121.65°
  Length: 6,696m (91% complete)
  Deviation: 23.34° from straight line
  Status: ❌ Exits AOI at segment 119
```

**Why 23.34° deviation matters:**
- Over 6,696m, a 23.34° bearing change translates to significant lateral drift
- Drift = 6696 × sin(23.34°) ≈ **2,650m lateral displacement**
- This is enough to exit the AOI, which has only 86m clearance on the straight path

---

## 📈 COMPARISON: GEOJSON vs GDAL

| Segment | GeoJSON distance_to_boundary | GDAL Distance | Difference | Status      |
|---------|------------------------------|---------------|------------|-------------|
| 110     | 388.41m                      | 388.42m       | -0.01m     | ✅ Match    |
| 111     | 342.66m                      | 342.66m       | 0.00m      | ✅ Match    |
| 112     | 296.61m                      | 296.60m       | +0.01m     | ✅ Match    |
| 113     | 250.18m                      | 250.18m       | 0.00m      | ✅ Match    |
| 114     | 203.41m                      | 203.42m       | -0.01m     | ✅ Match    |
| 115     | 156.26m                      | 156.26m       | 0.00m      | ✅ Match    |
| 116     | 108.76m                      | 108.76m       | 0.00m      | ✅ Match    |
| 117     | 60.90m                       | 60.90m        | 0.00m      | ✅ Match    |
| 118     | 12.66m                       | 12.65m        | +0.01m     | ✅ Match    |
| **119** | **0.00m**                    | **36.02m**    | **-36.02m**| **❌ BUG** |

**Segment 119 discrepancy:**
- GeoJSON reports: `0.00m` (incorrect)
- GDAL calculates: `36.02m` **OUTSIDE** boundary
- **This confirms the agent DID exit the AOI**

---

## 🎯 CONCLUSIONS

### 1. Configuration Status: ✅ CORRECT

- ✅ Start point is within AOI (119.99m clearance)
- ✅ End point is within AOI (426.69m clearance)
- ✅ Straight line path is entirely within AOI (86.31m minimum clearance)

**No configuration errors**. Both points are correctly placed inside the AOI.

---

### 2. Agent Behavior: ⚠️ NEEDS IMPROVEMENT

- ✅ Agent learned to prefer straight paths (109.7% linearity)
- ✅ Agent learned to prefer low slopes (62.6% of segments <10%)
- ❌ **Agent accumulated 23.34° heading deviation** from optimal straight line
- ❌ **Agent failed to maintain boundary awareness** in narrow corridor

**The agent's reward function prioritizes progress and slope, but doesn't sufficiently penalize boundary proximity or heading deviations from the optimal path.**

---

### 3. Reward Function Issue: 🔴 CRITICAL

**Current reward structure:**
```
Progress reward: +50 per segment (fixed)
Slope reward: +100 max (0% slope) to -1000 (50% slope)
Boundary penalty: -50 max (within 100m)
Curvature penalty: -0.1 per radian
```

**Problem:**
- **Boundary penalty is too weak**: -50 max vs +50 progress = net zero at boundary
- **No "stay on straight line" reward**: Agent doesn't know straight line is optimal
- **Curvature penalty is too small**: -0.1 is negligible compared to other rewards

**Result:**
- Agent takes small turns throughout the journey (+50 progress - 0.1 curvature ≈ +49.9)
- These turns accumulate to 23.34° total deviation
- By the time agent is close to boundary (segment 118: 12.65m), it's too late
- Next segment overshoots by 36.02m → OUT_OF_BOUNDS

---

### 4. Why Agent Doesn't Detour: 🎯 INSIGHT

**The agent goes nearly straight because:**
1. ✅ It learned that progress reward (+50/segment) is maximized with fewer segments
2. ✅ It learned that many low-slope segments beat few high-slope segments

**But it exits the boundary because:**
1. ❌ It doesn't know the **EXACT** straight line is optimal (no guidance)
2. ❌ Small heading changes give **almost the same reward** as perfect straight line
3. ❌ Boundary penalty (-50) is **too weak** compared to progress (+50)

**The agent needs:**
1. **Stronger boundary penalty** that ramps up exponentially as it approaches the boundary
2. **Alignment reward** that rewards heading toward the goal (not just distance reduction)
3. **Increased curvature penalty** to discourage unnecessary turns

---

## 📋 RECOMMENDATIONS

### Immediate Actions:

1. **Increase Boundary Penalty Gradient**
   - Current: -50 max at 0-100m
   - Proposed: Exponential scaling
     - 100m: -50
     - 50m: -200
     - 25m: -800
     - 10m: -5000 (severe)

2. **Add Alignment Reward**
   - Reward agent for maintaining heading toward goal
   - Small bonus (+5-10) when heading_change brings agent closer to optimal bearing

3. **Increase Curvature Penalty**
   - Current: -0.1 per radian
   - Proposed: -10 per radian (100× increase)
   - This makes unnecessary turns costly

4. **Add "Corridor Constraint"**
   - If agent is within 50m of boundary, apply strong penalty for any heading change away from goal

---

### Long-term Actions:

1. **Curriculum Learning**
   - Phase 1: Train with wide AOI (no boundary pressure)
   - Phase 2: Gradually tighten AOI to actual boundaries
   - This teaches optimal straight path before adding boundary constraint

2. **Guided Exploration**
   - Initialize policy with bias toward straight-line bearing
   - Add "straight-line bonus" for first 100K timesteps
   - Gradually reduce as agent learns

3. **AOI Buffer Zone**
   - Consider expanding AOI by 50-100m if operationally acceptable
   - This gives agent more margin for error

---

## 📊 APPENDIX: AOI Geometry Details

**File**: `US_PIPELINE/aoi/aoi.gpkg`  
**Type**: POLYGON (not MULTIPOLYGON)  
**CRS**: WGS 84 / UTM Zone 13N (EPSG:32613)  
**Area**: 31.04 km²

**Extent (Bounding Box)**:
- X: (480194.86, 484924.86)
- Y: (4926712.37, 4933311.94)

**Status**: ✅ Geometry is valid and correctly loaded by PIRL_US.cpp

---

**Last Updated**: 2025-11-21  
**Investigation By**: GDAL Python + ogrinfo analysis  
**Status**: ✅ Complete - Root cause identified
