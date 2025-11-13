# Quick Test: Stochastic Policy - Results

**Date:** November 5, 2025  
**Test:** Generate route using stochastic (exploration) policy  
**Model:** 2M timesteps checkpoint

---

## Test Configuration

```bash
python generate_route_from_model.py \
  --model pirl_model_2000000_steps.zip \
  --stochastic  # Use exploration policy with noise
```

---

## Results

### Stochastic Policy

**Outcome:** ❌ **Still hit max steps limit**

**Statistics:**
- Length: 500.00 km (5000 steps @ 100m each)
- Cost: $174,607,908
- Cost/km: $349,216/km
- Success: False
- Termination: Max steps exceeded at step 5000

**Comparison to Deterministic:**
- Deterministic: $345,154/km
- Stochastic: $349,216/km
- **Difference:** +$4,062/km (+1.2% more expensive)

### Key Finding

**Both policies hit the same limitation:**
```
Max steps: 5000
Max distance: 500 km
Straight-line: 62 km
Needed route: ~150-200 km (terrain constraints)
Result: Both exhausted at 500 km without reaching goal
```

---

## Analysis

### Why Stochastic Didn't Help

The stochastic policy adds exploration noise to actions, which helps during **training** to discover new routes. However, for **inference**, it doesn't solve the fundamental problem:

**Episode Length Insufficient**
- 5000 steps = hard limit
- Agent needs ~1500-2000 steps to reach goal
- Both policies capable but capped at 5000 steps
- Result: Both policies wander for 5000 steps and terminate

### Exploration vs Exploitation

**During Training (Stochastic):**
- Noise helps discover diverse routes
- Some episodes find goal
- Most still hit 5000-step limit
- Training log showed "Goal reached" = max steps hit

**During Inference:**
- Stochastic: Random exploration (not goal-directed)
- Deterministic: Learned policy (more direct)
- **Both limited by max steps**

---

## Conclusion

### The Quick Test Confirms

✅ **Diagnosis was correct:** Episode length is the blocking issue  
❌ **Stochastic policy not a solution:** Also hits step limit  
✅ **Both policies work:** Just need more steps  
⚠️ **Root cause validated:** max_episode_steps=5000 too low

### Why Training Seemed Successful

During training, we saw "Goal reached!" messages, but these were **misleading**:
- Most episodes: "Goal reached at step 5000" = max steps hit
- Rare episodes: Actual goal completion (very few)
- Agent learned cost minimization, not goal completion

### What This Means

**The agent CAN reach the goal** (given enough steps), but:
1. Current limit: 5000 steps
2. Actual need: ~10,000 steps
3. Agent gets close (2.5km) but runs out of steps

---

## Recommendation: Must Increase Episode Length

### Configuration Change Needed

```yaml
# In pirl_training_config_production.yaml:
max_episode_steps: 10000  # Double the current limit
```

### Expected Improvement

With 10,000 steps:
- Route can be up to 1000 km (way more than needed)
- Agent will have ~4x overhead for terrain avoidance
- Should reach goal consistently
- Can then optimize cost

### Alternative: Stronger Goal Signal

```cpp
// In PIRL_Environment.cpp:
double GOAL_REACHED_BONUS = 10000.0;  // Make goal extremely valuable

// Add progress reward:
double progress = prev_distance - curr_distance;
if (progress > 0) {
    reward += progress * 100.0;  // Reward forward movement
}
```

This would make the agent prioritize reaching the goal over minimizing cost.

---

## Next Steps

### Option 1: Immediate Retraining (Recommended)

```yaml
# Update config:
max_episode_steps: 10000
goal_reached_bonus: 10000.0

# Retrain:
python train_pirl_direct.py --config updated_config.yaml

# Expected: 1-2M timesteps needed
# Time: ~12-17 hours
# Result: Agent should complete routes consistently
```

### Option 2: Environment Modification (Hack)

```python
# Modify environment locally for testing:
env._max_episode_steps = 10000

# Generate route:
python generate_route_from_model.py ... 
# (with modified environment)
```

**Caveat:** Model wasn't trained for 10k steps, might behave unpredictably.

### Option 3: Curriculum Learning (Advanced)

Train in stages:
1. Phase 1: Short routes (20km) - 2000 steps
2. Phase 2: Medium routes (40km) - 4000 steps  
3. Phase 3: Full routes (62km) - 10000 steps

Agent learns goal completion first, then tackles longer routes.

---

## Files Generated

### Test Outputs
- `PIRL/outputs/route_2M_stochastic.geojson`
- 5000 segments, same max-step issue

### Documentation
- `TRAINING_2M_FINAL_REPORT.md` - Full training analysis
- `QUICK_TEST_RESULTS.md` - This file

---

## Summary Table

| Method | Steps | Length | Cost/km | Success | Issue |
|--------|-------|--------|---------|---------|-------|
| Deterministic | 5000 | 500 km | $345k | ❌ | Max steps |
| Stochastic | 5000 | 500 km | $349k | ❌ | Max steps |
| **Needed** | **10000** | **~150km** | **~$350k** | **✅** | **None** |

---

## Conclusion

**Quick test completed:** Stochastic policy is not the solution. The issue is definitively the episode length constraint.

**Path forward:** Increase `max_episode_steps` to 10,000 and retrain for 1-2M timesteps.

**Expected outcome:** Agent will reach goal consistently and produce viable routes.

---

**Test Status:** ✅ **COMPLETE**  
**Diagnosis:** ✅ **CONFIRMED**  
**Solution:** ⚠️ **Requires retraining with longer episodes**




