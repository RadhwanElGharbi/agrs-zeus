# Reward Function Update - Terrain Optimization Focus

**Date**: 2025-11-21  
**Status**: ✅ Implemented and Compiled  
**File**: `/opt/agrs/Projects/US_PIPELINE/PIRL/src/PIRL_US.cpp`

## Problem Identified

The 500K production training resulted in a **97% efficiency straight-line route** with virtually no terrain optimization (0.17° average heading change). Analysis revealed the reward function was heavily imbalanced:

- **Progress reward**: ~340 per 170m step
- **Slope rewards**: +10 maximum (for 0% slope)
- **Slope penalties**: -100 maximum (for 50% slope)

**Result**: Agent learned that going straight is always optimal, regardless of terrain.

---

## Solution: Reward Function Rebalancing

### 1. Progress Reward (REDUCED by 75%)

**OLD**: `progress * 2.0` → ~340 per 170m step  
**NEW**: `progress * 0.5` → ~85 per 170m step

**Effect**: Makes terrain quality competitive with distance optimization.

---

### 2. Slope Rewards/Penalties (HEAVILY FAVOR LOW SLOPES)

#### Reward Structure:

| Slope Range | Reward | Description |
|-------------|--------|-------------|
| **0-5%** | **+50** | Excellent terrain - HIGHLY DESIRABLE |
| **5-10%** | **+30 to +50** | Very good terrain - strong preference |
| **10-15%** | **+10 to +30** | Good terrain - moderate preference |
| **15-20%** | **0 to +10** | Acceptable terrain - small reward |
| **20-25%** | **0 to -50** | Marginal terrain - light penalty |
| **25-30%** | **-50 to -150** | Bad terrain - moderate penalty |
| **30-35%** | **-150 to -300** | Very bad terrain - heavy penalty |
| **35-40%** | **-300 to -500** | Extreme terrain - severe penalty |
| **40-50%** | **-500 to -1000** | Near-terminal - catastrophic penalty |
| **>50%** | **Terminal** | Episode ends |

#### OLD vs NEW Comparison:

- **3% slope** (excellent):
  - OLD: +8.5 reward
  - NEW: **+50 reward** (6× increase!)
  
- **15% slope** (acceptable):
  - OLD: +2.5 reward
  - NEW: **+10 reward** (4× increase)
  
- **25% slope** (bad):
  - OLD: -25 penalty
  - NEW: **-50 penalty** (2× increase)
  
- **40% slope** (extreme):
  - OLD: -100 penalty
  - NEW: **-500 penalty** (5× increase!)

---

### 3. Curvature Penalty (REDUCED by 80%)

**OLD**: `-0.5 * |heading_change|` → -0.26 for 30° turn  
**NEW**: `-0.1 * |heading_change|` → -0.05 for 30° turn

**Effect**: Allows more path exploration and terrain-seeking behavior.

---

## Expected Training Results

### Behavioral Changes:

1. **Active slope minimization**: Agent will seek out 0-10% slope corridors
2. **Route curvature**: Paths will curve around steep terrain
3. **Detour optimization**: Agent will take longer routes for better terrain
4. **Path efficiency**: 85-95% (vs. previous 97%)
5. **Average slopes**: Expected 3-6% (vs. previous 6-10%)

### Reward Balance Example:

**Scenario: 25% steep terrain ahead**

**Option A: Go straight through 25% slope (170m)**
- Progress: +85
- Slope: -50
- **Total: +35**

**Option B: Detour 50m for 5% slope (200m total)**
- Progress: +75
- Slope: +50
- Curvature: -0.05
- **Total: +125** ← **Better choice!**

**Result**: Agent learns that finding good terrain is worth the detour.

---

## Training Recommendations

### Next Steps:

1. **Run new 500K training** with rebalanced rewards
2. **Monitor behavior**:
   - Check if routes show curvature (heading changes >5°)
   - Verify path efficiency drops to 85-95%
   - Confirm average slopes decrease
   
3. **Expected GeoJSON characteristics**:
   - Average slope: 3-6% (improved from 6-10%)
   - Path efficiency: 85-92% (vs. 97% before)
   - Variable segment lengths
   - More natural routing patterns

### Training Commands:

```bash
# GPU (faster - recommended)
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_production_500k_gpu.sh

# CPU (slower but works)
./train_production_500k_cpu.sh
```

### What to Look For:

✅ **Success indicators**:
- Routes curve around steep areas
- Lower average slopes
- Variable step sizes (not all 170m)
- Path efficiency 85-95%

❌ **Problem indicators**:
- Still going straight (97%+ efficiency)
- No terrain avoidance
- Uniform segment lengths

---

## Technical Details

### Code Location:
- File: `/opt/agrs/Projects/US_PIPELINE/PIRL/src/PIRL_US.cpp`
- Function: `PipelineEnvironment::calculate_reward()` (lines 474-531)

### Compilation:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/build
make -j$(nproc)
```

### Testing:
The new reward function has been compiled and is ready for training. Previous 500K models will need to be retrained with the new reward structure.

---

## Summary

The reward function has been rebalanced to **heavily favor low slopes** over raw distance optimization:

- Progress reward: **75% reduction**
- Low-slope rewards: **4-6× increase**
- High-slope penalties: **2-5× increase**
- Curvature penalty: **80% reduction**

This should result in routes that actively seek gentler terrain and avoid steep slopes, even if it means taking longer paths.
