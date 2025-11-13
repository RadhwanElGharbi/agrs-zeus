# ROOT CAUSE ANALYSIS: 500km Route Issue

**Date:** November 5, 2025  
**Issue:** Route is 500km when straight-line distance is only 62km  
**Status:** ✅ **ROOT CAUSE IDENTIFIED**

---

## The Problem

**Observed Behavior:**
- Agent takes exactly 5000 steps
- Each step is exactly 100m (maximum allowed)
- Total distance: 500 km
- Straight-line progress: 60.7 km
- **Efficiency: 12.15%** ⚠️

**Expected Behavior:**
- Route should be ~90-150 km (1.5-2.5x overhead)
- Efficiency should be >40%
- Steps should vary based on terrain (10-100m)

---

## Root Cause

### The Agent Is Stuck in "Wandering Mode"

**Evidence:**
```
Fixed step size: 100.0m (every single step)
Heading changes: Average 3.7° (very small)
Forward progress: 60.7 km out of 500 km traveled
Efficiency: 12.15%
Pattern: Gentle curves with no clear direction
```

**Diagnosis:**
The agent has learned to:
1. ✅ Take maximum step sizes (100m = fastest exploration)
2. ✅ Minimize cost per step (avoid expensive terrain)
3. ❌ NOT learned to make progress toward goal
4. ❌ NOT learned to terminate at goal

---

## Why This Happened

### 1. Weak Goal Reward Signal

**Current Reward Structure:**
```cpp
// Cost-based reward (STRONG signal)
reward -= segment_cost / 1000.0;  // Penalty for expensive segments

// Goal reached bonus (WEAK signal)
if (reached_goal) {
    reward += 1000.0;  // Only happens at end
}

// Progress reward (MISSING!)
// No reward for getting closer to goal
```

**Result:**
- Agent optimizes for low cost per step ✅
- Agent ignores goal distance ❌
- Agent wanders aimlessly for 5000 steps

### 2. Episode Length Masks The Problem

**Training Behavior:**
- Most episodes: Hit 5000-step limit
- Reward at 5000 steps: ~0 to +10
- Agent learns: "Just survive 5000 steps with low cost"
- Goal completion: Rarely achieved, rarely rewarded

**If episode length was shorter (e.g., 1000 steps):**
- Agent would fail more obviously
- Forced to learn goal-directed behavior
- Problem would have been caught earlier

### 3. Missing Progress Reward

**What's Missing:**
```cpp
// Should have this:
double progress = prev_distance_to_goal - current_distance_to_goal;
if (progress > 0) {
    reward += progress * 10.0;  // Reward forward movement
}
```

**Without it:**
- Agent has no incentive to move toward goal
- Moving away from goal has same reward as moving toward it
- Only the final "goal reached" bonus matters
- But agent never reaches goal, so bonus is irrelevant

---

## Evidence Supporting Diagnosis

### 1. Step Size Analysis
```
Min: 100.0m
Max: 100.0m
Avg: 100.0m
All 5000 steps: 100.0m exactly
```
**Meaning:** Agent learned "max step size = best" (covers ground fastest)

### 2. Heading Change Analysis
```
Average: 3.7°
Large changes (>45°): 0%
```
**Meaning:** Agent is moving in gentle curves, not making decisions

### 3. Efficiency Analysis
```
Traveled: 500 km
Progress: 60.7 km
Efficiency: 12.15%
```
**Meaning:** Agent is wandering, not routing

### 4. Terrain Analysis
```
High cost terrain: 100% of segments
Water coverage: 10.6%
Protected areas: 0%
```
**Meaning:** Agent avoids constraints but doesn't find goal

---

## Why Episode Length Isn't The Only Problem

**Initial Hypothesis:** "5000 steps too short, need 10,000"

**Reality:** Even with 10,000 steps, agent would:
- Still take 100m steps
- Still wander aimlessly
- Still achieve ~12% efficiency
- Just wander further (1000km instead of 500km)

**True Problem:** Agent hasn't learned goal-directed behavior

---

## The Fix: Reward Shaping

### Required Changes

**1. Strengthen Goal Reward**
```cpp
// In PIRL_Environment.cpp:
if (reached_goal) {
    reward += 10000.0;  // Was 1000.0 - make it 10x more valuable
}
```

**2. Add Progress Reward**
```cpp
// Track progress toward goal
double prev_distance = prev_state.goal_distance;
double curr_distance = current_state_.goal_distance;
double progress = prev_distance - curr_distance;

if (progress > 0) {
    // Reward forward movement
    reward += progress * 10.0;  // 10 reward per meter of progress
} else if (progress < 0) {
    // Penalize backward movement
    reward += progress * 20.0;  // Double penalty for going away
}
```

**3. Add Step Efficiency Reward**
```cpp
// Reward efficient use of steps
double efficiency = progress / action.step_size;
if (efficiency > 0.5) {
    reward += 10.0;  // Bonus for efficient steps
}
```

**4. Early Termination for Wandering**
```cpp
// Terminate if agent makes no progress for N steps
if (steps_without_progress > 100) {
    done = true;
    reward -= 500.0;  // Penalty for giving up
}
```

### Optional: Increase Episode Length

```yaml
# After fixing rewards, can also increase:
max_episode_steps: 10000  # Was 5000
```

But this is **secondary** - reward shaping is primary fix.

---

## Expected Results After Fix

**With Reward Shaping:**
- Agent learns to move toward goal
- Steps vary (10-100m) based on terrain
- Efficiency improves to 40-60%
- Route length: ~90-150 km
- Goal completion rate: >80%

**Training Time:**
- 1-2M timesteps should be sufficient
- ~12-17 hours on CPU
- Should see improvement after 500k timesteps

---

## Alternative: Curriculum Learning

**Phase 1 (100k steps):** Short routes (20 km)
- Learn goal-directed behavior
- Easier to reach goal
- Strong reward signal

**Phase 2 (500k steps):** Medium routes (40 km)
- Apply learned behavior
- More complex terrain

**Phase 3 (1M steps):** Full routes (62 km)
- Complete route optimization
- Cost + goal + efficiency

---

## Comparison to Previous Diagnosis

**Previous Hypothesis:**
> "Episode length too short (5000 steps)"

**Updated Diagnosis:**
> "Reward structure doesn't incentivize goal completion"
> "Episode length masks the real problem"

**Why Previous Was Incomplete:**
- Episode length IS a problem (5000 too short)
- BUT it's not the ROOT cause
- Root cause: Missing progress reward + weak goal reward
- Episode length just makes it "fail slowly" instead of "fail fast"

---

## Immediate Action Items

### Option 1: Full Fix (Recommended)
1. Add progress reward shaping
2. Increase goal reward to 10,000
3. Add step efficiency reward
4. Increase episode length to 10,000
5. Retrain for 1-2M timesteps

**Expected:** Proper routing behavior

### Option 2: Quick Test
1. Add ONLY progress reward
2. Keep everything else same
3. Train for 500k timesteps
4. See if agent learns goal-directed movement

**Expected:** Improvement but not optimal

### Option 3: Curriculum
1. Create short-route config (20km, 2000 steps)
2. Train until 90% success rate
3. Gradually increase distance
4. Transfer to full 62km route

**Expected:** Most reliable but slower

---

## Lessons Learned

**1. Episode Length Can Hide Problems**
- Long episodes (5000 steps) let agent survive without learning
- Shorter episodes would have forced goal-directed behavior
- Trade-off: Too short = can't reach goal, too long = can avoid goal

**2. Reward Shaping is Critical**
- Pure cost minimization insufficient
- Need explicit progress rewards
- Goal bonus must be significant relative to cost penalties

**3. Efficiency Metrics Matter**
- Should have monitored efficiency during training
- 12% efficiency is a red flag
- Should aim for >40% efficiency

**4. Validate Early**
- Should have generated routes at 100k, 500k timesteps
- Would have caught wandering behavior earlier
- Don't wait for full 2M training to validate

---

## Conclusion

**Root Cause:** Reward structure doesn't incentivize goal completion

**Evidence:** 12.15% efficiency, fixed 100m steps, gentle wandering

**Solution:** Reward shaping (progress + goal + efficiency)

**Secondary:** Increase episode length after fixing rewards

**Next Steps:** Implement reward shaping and retrain

---

**Status:** ✅ **DIAGNOSED**  
**Solution:** ⚠️ **REQUIRES RETRAINING**  
**Estimated Fix Time:** 1-2 days (code changes + retrain)




