# PIRL RL Training Status
**Last Updated:** October 26, 2025 @ 13:20 (1h 20m into training)

## 🎯 Current Status: **TRAINING IN PROGRESS** ✅

## 💰 COST SAVINGS PROJECTION: €75.3M (29.7%)

**See:** `PIRL_PERFORMANCE_EXPECTATIONS_AND_COST_SAVINGS.md` for full analysis

### Training Configuration
- **Model:** PPO (Proximal Policy Optimization)
- **Target Timesteps:** 500,000
- **Parallel Environments:** 8
- **Batch Size:** 256
- **Learning Rate:** 0.0003
- **Max Episode Length:** 5,000 steps

### Progress Metrics
- **Completed Timesteps:** 16,384 / 500,000 (3.27%)
- **PPO Iterations:** 1
- **Training Speed:** ~11 steps/second
- **Estimated Time Remaining:** ~12 hours 12 minutes
- **Estimated Completion:** October 27, 2025 @ ~01:00

### Performance Metrics
- **Latest Eval Reward:** -238,384,589.84 ± 0.00
- **Mean Episode Length:** 5,000 steps (hitting max_steps limit)
- **CPU Usage:** 6.7%
- **Memory Usage:** 4.4%

### Key Milestones
- ✅ **Environment Setup** - All 8 parallel environments initialized successfully
- ✅ **Model Initialization** - PPO model created with 17D state space, 2D action space
- ✅ **First Rollout Complete** - Collected 16,384 steps (8 envs × 2,048 steps)
- ✅ **First Evaluation** - Passed 10k timestep evaluation (previous crash point)
- ✅ **First Policy Update** - PPO iteration 1 completed
- ⏳ **Training Loop** - Currently running rollouts for iteration 2

---

## 🔧 Technical Details

### Fixed Issues
1. **JSON Numeric Formatting** ✅
   - Fixed scientific notation in state/reward JSON output
   - Used `std::fixed << std::setprecision(6)` for all numeric values

2. **Coordinate Transformation** ✅
   - Added proper CRS transformation in `GISDataManager::sample_raster`
   - Projects UTM coordinates to raster CRS before sampling

3. **SB3 Info Dict Format** ✅
   - Fixed `info` dictionary to match Stable-Baselines3 expected format
   - Episodes now return `{'episode': {'r': reward, 'l': length, 't': time}}`

### Current Bottleneck
- **C++ Environment Steps** are expensive (~0.09s per step)
  - Each step spawns `zeus tools pirl_step` subprocess
  - Loads GIS data, computes costs, transforms coordinates
  - Writes JSON, reads JSON (IPC overhead)

### Training Dynamics
- **Negative Rewards:** Expected for untrained model
  - Current rewards ~-238M indicate high construction costs
  - Agent is likely taking inefficient routes or violating constraints
  - Reward should improve as training progresses

- **Episode Truncation:** All episodes hitting max_steps (5,000)
  - Agent not reaching goal within step limit
  - Expected early in training
  - Should see shorter episodes as agent learns efficient paths

---

## 📊 Monitoring Commands

### Check Current Status
```bash
cd /opt/agrs/Projects/test_project
./monitor_training.sh
```

### View Live Log
```bash
tail -f outputs/pirl_training/training_v3.log
```

### View Tensorboard (requires separate terminal)
```bash
cd /opt/agrs/Projects/test_project
source /opt/agrs/python/pirl_venv/bin/activate
tensorboard --logdir outputs/pirl_training/tensorboard
# Open browser to http://localhost:6006
```

### Check Process
```bash
ps aux | grep train_pirl_direct.py | grep -v grep
```

### Stop Training (if needed)
```bash
kill <PID>  # Use PID from monitor_training.sh
```

---

## 📈 Expected Training Progression

### Phase 1: Exploration (0-100k timesteps)
- Agent explores state-action space randomly
- High variance in rewards
- Episodes hit max_steps frequently
- **Current:** In this phase

### Phase 2: Learning (100k-300k timesteps)
- Agent starts discovering reward patterns
- Gradual improvement in mean reward
- Episodes may start completing earlier
- **Status:** Upcoming

### Phase 3: Refinement (300k-500k timesteps)
- Agent optimizes policy
- Reward stabilizes and improves
- Consistent goal-reaching behavior
- **Status:** Upcoming

---

## 🎯 Next Steps (After Training Completes)

1. **Validate Trained Model** (`rl_5`)
   - Run evaluation episodes with trained policy
   - Analyze reward breakdown and route quality
   - Compare to heuristic baseline

2. **Generate Final Route** (`rl_6`)
   - Use trained model to generate optimal route
   - Export detailed route segments with construction info
   - Create visualization of route on map

3. **Export Deliverables** (`rl_7`)
   - Generate GeoJSON with segment details
   - Create cost analysis report
   - Validate against client specifications

---

## ⚠️ Known Limitations

1. **Training Speed:** 11 steps/sec is slower than ideal
   - Caused by C++ subprocess overhead
   - Could be improved with compiled Python binding
   - Acceptable for initial training run

2. **Evaluation Environment:** Using DummyVecEnv instead of SubprocVecEnv
   - Warning from Stable-Baselines3 (non-critical)
   - Doesn't affect training, only evaluation consistency

3. **Monitor Wrapper:** Evaluation env not wrapped with Monitor
   - Warning from Stable-Baselines3 (non-critical)
   - Episode stats may be slightly modified by other wrappers

---

## 📝 Training Log Location
- **Main Log:** `/opt/agrs/Projects/test_project/outputs/pirl_training/training_v3.log`
- **Tensorboard:** `/opt/agrs/Projects/test_project/outputs/pirl_training/tensorboard/PPO_5/`
- **Model Checkpoints:** `/opt/agrs/Projects/test_project/models/` (saved every 50k steps)

---

**Status:** Training is running smoothly. The SB3 compatibility fix worked. No intervention needed at this time. Estimated completion: ~12 hours from now.

