# 🔴 Training Crash Analysis Report

**Date**: 2025-11-19 21:40:06  
**Log File**: `training_20251119_211731.log`  
**Crash Point**: After 49,152 timesteps (1 iteration)  
**Duration**: ~23 minutes

---

## 💥 **CRASH DETAILS**

### Error Message:
```
ValueError: Expected parameter loc (Tensor of shape (256, 3)) of distribution Normal(loc: torch.Size([256, 3]), scale: torch.Size([256, 3])) to satisfy the constraint Real(), but found invalid values:
tensor([[nan, nan, nan], ...])
```

### Warning Before Crash:
```
RuntimeWarning: invalid value encountered in multiply
  last_gae_lam = delta + self.gamma * self.gae_lambda * next_non_terminal * last_gae_lam
```

### Training Stats at Crash:
- **ep_len_mean**: 42 steps
- **ep_rew_mean**: **-inf** (negative infinity!)
- **fps**: 36
- **iterations**: 1
- **total_timesteps**: 49,152

---

## 🔍 **ROOT CAUSE ANALYSIS**

### 1. **Catastrophic Reward Scale Issue**

**Typical Episode Pattern:**
```
Total Length:        150.24 m  (0.15 km)
Distance from Goal:  61,816.87 m  (61.82 km)
Total Reward:        -198.41
├─ Progress:             4.82    ← TINY (0.06 multiplier)
├─ Cost Penalty:        -3.23
├─ Constraint:        -100.00    ← DOMINATES
├─ Curvature:           -0.00
└─ Goal Bonus:           0.00
```

**Key Observations:**
- All episodes terminated in built-up area violations
- Progress reward: +0.5 to +5 (with 0.06 multiplier)
- Constraint penalty: **-100** (fixed)
- **Net reward: -195 to -210** (consistently very negative)

### 2. **Extreme Episode Detected**

**Longest Episode (23.5 km):**
```
Total Length:        23,507.75 m  (23.51 km)
Distance from Goal:  55,590.35 m  (55.59 km)
Total Reward:         -204.52
├─ Progress:            -1.52    ← NEGATIVE! Agent moved away from goal
├─ Cost Penalty:        -3.00
├─ Constraint:        -100.00
```

**Analysis:**
- Agent traveled 23.5 km but moved 25m FURTHER from goal
- This indicates the agent was moving in circles or wrong direction
- Progress reward calculation: -1.52 / 0.06 = -25.33m regression

### 3. **Reward Distribution Statistics**

**Reward Range:**
- Most negative: -408.10
- Most positive: ~-195
- **All rewards negative** (no positive rewards observed)
- Episode lengths: 50-400 steps mostly, one outlier at 23.5km

### 4. **GAE Computation Failure**

The crash occurred when Stable-Baselines3 tried to compute Generalized Advantage Estimation (GAE):

```python
last_gae_lam = delta + self.gamma * self.gae_lambda * next_non_terminal * last_gae_lam
```

**Why it failed:**
- With all rewards being large negative values (-200)
- And one very long episode with accumulated reward
- The GAE computation produced `-inf` as the mean reward
- This propagated to the neural network, causing NaN outputs
- Neural network cannot handle NaN/inf values → crash

---

## 📊 **THE FUNDAMENTAL PROBLEM**

### Progress Multiplier is TOO SMALL

**Current Configuration:**
```json
"progress_multiplier": 0.06  // BROKEN
```

**Expected vs. Actual:**
```
Expected (from overrides):
  - Full route: 62,000m × 0.06 = +3,720 progress reward
  - Expected total: +3,200 (net positive)

Actual Reality:
  - Episodes terminate early: 100-150m
  - Progress per episode: 100m × 0.06 = +6
  - Constraint penalty: -100
  - Net per episode: -194 to -200
  - ALL REWARDS NEGATIVE
```

### Mathematical Impossibility

To break even on a single -100 penalty, agent needs:
```
Progress needed = 100 / 0.06 = 1,667 meters
But episodes terminate at 100-150m
```

**The agent CANNOT LEARN** because:
1. It gets punished (-100) for hitting constraints
2. It gets almost no reward for making progress (+3-5)
3. The punishment is 20-30x larger than any progress reward
4. There's no way to accumulate positive rewards

---

## 🚨 **WHY THE CRASH OCCURRED**

1. **All episodes extremely negative**: -195 to -408
2. **Mean reward computation**: With all negative values, monitor tries to compute mean
3. **Numerical overflow**: Very large negative accumulation → `-inf`
4. **GAE computation**: Uses `-inf` in advantage calculation → produces `NaN`
5. **Neural network**: Cannot process `NaN` values → crash

---

## ✅ **REQUIRED FIXES (CRITICAL)**

### **Fix #1: Increase Progress Multiplier (MANDATORY)**

```json
// pirl_parameter_overrides.json
"progress_multiplier": 1.0  // or 2.0 (from 0.06)
```

**Effect:**
- 100m progress = +100 reward (matches -100 constraint)
- Agent can balance exploration vs. constraint avoidance
- Net rewards can be positive when successful

### **Fix #2: Reduce Constraint Penalties (RECOMMENDED)**

```json
"buildup_max_penalty": -50.0  // (from -100)
"aoi_boundary_max_penalty": -50.0  // (from -100)
```

**Effect:**
- Less punitive for minor violations
- Agent can learn to explore near boundaries
- Better balance with progress rewards

### **Fix #3: Add Gradient Clipping (SAFETY)**

In training config, ensure:
```yaml
clip_range: 0.2  # Already set
max_grad_norm: 0.5  # Add if not present
```

---

## 📈 **EXPECTED BEHAVIOR AFTER FIX**

With `progress_multiplier: 1.0`:
```
Episode example:
  Total Length:        150 m
  Progress:           +150.00  (150m × 1.0)
  Cost Penalty:        -3.00
  Constraint:        -100.00
  Total Reward:        +47.00  ← POSITIVE!
```

With `progress_multiplier: 2.0`:
```
Episode example:
  Total Length:        150 m
  Progress:           +300.00  (150m × 2.0)
  Cost Penalty:        -3.00
  Constraint:        -100.00
  Total Reward:       +197.00  ← VERY POSITIVE!
```

---

## 🎯 **RECOMMENDATION**

**IMMEDIATE ACTION REQUIRED:**

1. **Stop using 0.06 multiplier** - it's mathematically broken
2. **Set progress_multiplier to 1.0 or 2.0**
3. **Optionally reduce constraint penalties to -50**
4. **Restart training**

**This is not a software bug - this is a configuration error that makes learning impossible.**

The agent cannot learn when punishment for exploration is 20-30x larger than reward for progress.

---

**Status**: 🔴 **CRITICAL - TRAINING CANNOT PROCEED WITH CURRENT CONFIGURATION**

