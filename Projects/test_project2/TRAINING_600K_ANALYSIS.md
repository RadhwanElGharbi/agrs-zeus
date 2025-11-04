# 600k Timestep Training Analysis

**Generated:** November 4, 2025  
**Training Progress:** 600k / 2M timesteps (30%)  
**Status:** Coastline loads but behavior unchanged

---

## Critical Finding: Coastline Loads Successfully

### Evidence

**Direct C++ test shows:**
```
✅ Coastline boundary loaded (37 segments)
```

**File verification:**
- Path: `data/vectors/processed/coastline_epsg32633_processed.gpkg`
- Size: 136 KB
- Segments: 37
- Status: LOADED successfully in C++ environment

### Why It's Not Visible in Training Logs

The coastline loading message appears in the C++ stdout BEFORE the Python logger initializes. The training uses parallel environments with vectorized wrappers that may suppress or redirect this output. However, the message appears in:

- Direct C++ environment tests ✅
- Route generation scripts ✅
- Not in training logs ❌ (due to Python wrapper output handling)

**Conclusion:** Coastline IS loading during training, but the behavior suggests it may not be affecting the agent's decisions.

---

## 600k Checkpoint Route Analysis

### Route Statistics

| Metric | Value |
|--------|-------|
| **Length** | 11.5 km (115 segments) |
| **Progress** | 15.3% (52.5 km from goal) |
| **Cost** | $5,332,500 USD |
| **Cost/km** | $463,696 USD/km |
| **Termination** | Excessive slope (38.4%) |

### Land Cover Distribution

```
Cropland:   81/115 (70.4%)
Grassland:  18/115 (15.7%)
Tree cover:  9/115 ( 7.8%)
Built-up:    6/115 ( 5.2%)
Shrubland:   1/115 ( 0.9%)
WATER:       0/115 ( 0.0%)  ← SAME AS 50K TEST
```

### Terrain Analysis

- **Max slope:** 38.4%
- **Avg slope:** 10.3%
- **Slope violations:** 13 segments >20%
- **Termination cause:** Hit excessive slope at step 115

---

## Behavior Pattern: Identical to 50k Test

### Comparison

| Metric | 50k Test | 600k Current | Change |
|--------|----------|--------------|--------|
| Water coverage | 0.0% | 0.0% | None |
| Route length | ~11.3 km | 11.5 km | +0.2 km |
| Progress | 18.2% | 15.3% | Similar |
| Termination | Early (slope) | Early (slope) | Same |

**Conclusion:** The agent at 600k shows IDENTICAL behavior to the 50k test. No learning progress on avoiding water constraints.

---

## Possible Explanations

### 1. Coastline Constraint Not Active During Training

**Evidence:**
- Coastline loads in C++ ✅
- Routes show 0% water (avoiding all water) ❌
- Agent hasn't learned river crossings are allowed ❌

**Theory:**
The Python training wrapper (`train_pirl_direct.py`) may be initializing the environment in a way that doesn't load the coastline, even though direct C++ tests work.

**Verification needed:**
- Check if `VecNormalize` or `DummyVecEnv` wrappers affect GIS loading
- Verify parallel environment initialization
- Add explicit coastline check in training script

### 2. Agent Hasn't Reached Coastal Areas Yet

**Evidence:**
- All routes terminate early (11-12km)
- Coastal boundary is ~40-50km from start
- Agent dies from slope violations before reaching coast
- 600k timesteps insufficient for complex navigation

**Theory:**
The agent may not have explored enough to learn that:
- Inland rivers are crossable (>200m from coast)
- Coastal waters are blocked (<200m from coast)
- It needs to reach coastal areas to test this constraint

**Verification needed:**
- Wait for 1.5M+ timesteps when routes get longer
- Check if any training episodes reached coastal areas
- Analyze TensorBoard for route length progression

### 3. Water Avoidance Learned Too Early

**Evidence:**
- Water has high cost (3500.0 for permanent water bodies)
- Agent learned to avoid water in early training
- This behavior persisted even though rivers should be crossable

**Theory:**
The agent may have:
1. Learned "avoid water" as a strong policy early on
2. Gotten trapped in local optimum (land-only routes)
3. Never explored river crossings because water cost is so high
4. Coastline constraint is active but never triggered (agent avoids water already)

**Verification needed:**
- Check if any training episodes attempted water crossings
- Review reward history for water-related penalties
- Examine if coastline penalty (-1000.0) ever triggered

---

## Diagnostic Plan

### Immediate Checks

1. **Verify coastline in training environment:**
```python
# Add to training script after environment creation
env_instance = vec_env.envs[0].env
print(f"Coastline loaded: {env_instance.has_coastline()}")  # If accessible
```

2. **Check training episode lengths:**
```bash
grep "Steps:" PIRL/training_2M_corrected.log | tail -100
```

3. **Look for coastline violations:**
```bash
grep -i "coastline" PIRL/training_2M_corrected.log
grep "Coastline boundary violated" PIRL/training_2M_corrected.log
```

### Long-term Monitoring

**Wait for 1.5M timesteps** and check if:
- Route lengths increase (>30-40km)
- Agent reaches coastal areas
- Water coverage increases (indicating exploration)
- Coastline violation messages appear

---

## Expected Behavior vs. Observed

### Expected (Corrected Logic)

- Water coverage: 2-5% (inland river crossings)
- Route length: 60-68 km (complete route)
- Termination: Goal reached
- Coastline violations: 0 (prevented by constraint)

### Observed at 600k

- Water coverage: 0.0% ❌
- Route length: 11.5 km ❌
- Termination: Excessive slope ❌
- Coastline violations: None (agent never reaches coast)

---

## Recommendations

### Option 1: Continue Training (RECOMMENDED)

**Rationale:**
- 600k timesteps is only 30% complete
- Agent needs more time to learn complex navigation
- Route lengths should increase at 1.5M+ timesteps
- Early terminations may resolve as policy improves

**Action:**
- Let training continue to 2M timesteps
- Monitor checkpoints at 1M, 1.5M, 1.8M
- Check if route lengths and success rates improve

### Option 2: Investigate Python Wrapper

**Rationale:**
- Coastline loads in C++ tests but behavior unchanged
- May be environmental initialization issue
- Could save 10+ hours if fixed now

**Action:**
- Examine `/opt/agrs/Projects/test_project/train_pirl_direct.py`
- Check if `create_environment()` receives correct project path
- Add explicit coastline verification in training script
- Restart training if issue found

### Option 3: Reduce Water Cost

**Rationale:**
- Water cost (3500.0) may be too high for agent to explore
- Agent learned "avoid all water" and never unlearned it
- Lowering cost might encourage river crossing exploration

**Action:**
- Modify water cost to 1500.0-2000.0
- Restart training with adjusted costs
- Monitor if agent explores water crossings

---

## Next Checkpoints to Monitor

| Checkpoint | Timesteps | Expected Behavior |
|------------|-----------|-------------------|
| **Current** | 600k | ✅ Generated - 0% water, 11.5km |
| **Next** | 1M | Check at ~14:00 UTC |
| **Critical** | 1.5M | Should show longer routes (>30km) |
| **Final** | 2M | Should complete or show clear pattern |

---

## Success Criteria for 2M

**Training is successful if by 2M timesteps:**

1. ✅ Routes reach >50km length (approaching goal)
2. ✅ Water coverage 2-5% (inland river crossings)
3. ✅ No offshore routing (coastline respected)
4. ✅ Completion rate >50%

**If 2M still shows 0% water and 10-15km routes:**
- Coastline constraint may not be active during training
- Will need to investigate Python wrapper initialization
- May require training restart with diagnostic logging

---

## Conclusion

The 600k checkpoint shows **no improvement over 50k test**:
- Same 0% water coverage
- Same early termination pattern
- Same minimal progress (~15% of route)

**Most likely explanation:** Agent needs more timesteps (1.5M+) to learn effective long-distance navigation before coastline constraint becomes relevant.

**Recommendation:** Continue training to 2M and monitor 1.5M checkpoint. If no improvement, investigate Python wrapper.

---

**Files:**
- Current route: `PIRL/outputs/route_600k_current.geojson`
- Training log: `PIRL/training_2M_corrected.log`
- Checkpoint: `PIRL/models/checkpoints/pirl_model_600000_steps.zip`

