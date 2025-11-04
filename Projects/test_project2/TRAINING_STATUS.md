# PIRL 2M Production Training - STARTED

**Start Time:** November 3, 2025 - 04:20 UTC  
**Status:** ✅ RUNNING  
**PID:** 1103722

---

## Training Configuration

- **Total timesteps:** 2,000,000
- **Parallel environments:** 8
- **Config:** `PIRL/pirl_training_config_production.yaml`
- **Coastline constraint:** ✅ ACTIVE (37 segments loaded)
- **Device:** CPU (line 159 - can be changed to 'auto' or 'cuda' for GPU)

---

## Expected Results

**Current Model (without coastline):**
- Water coverage: 58.6% (offshore through Adriatic Sea)
- Route length: 71km

**Expected After This Training:**
- Water coverage: **<5%** (only river crossings)
- Route length: 62-68km (staying inland)
- Behavior: Avoids offshore, crosses rivers when necessary

---

## Monitoring Commands

### Real-time log:
```bash
tail -f /opt/agrs/Projects/test_project2/PIRL/training_2M_coastline.log
```

### Check progress:
```bash
grep -E "Goal reached|timesteps" /opt/agrs/Projects/test_project2/PIRL/training_2M_coastline.log | tail -20
```

### TensorBoard:
```bash
tensorboard --logdir /opt/agrs/Projects/test_project2/PIRL/outputs/production_2M/tensorboard
```

### Training status:
```bash
ps aux | grep train_pirl_direct | grep -v grep
```

---

## Estimated Timeline

**CPU Training (Current):**
- Estimated duration: 13-16 hours
- Expected completion: ~November 3, 2025 - 18:00-20:00 UTC
- Checkpoints saved every 50,000 timesteps

**Progress Milestones:**
- 500k timesteps: ~3-4 hours (25% complete)
- 1M timesteps: ~6-8 hours (50% complete)
- 1.5M timesteps: ~9-12 hours (75% complete)
- 2M timesteps: ~13-16 hours (100% complete)

---

## Output Locations

**Model checkpoints:**
```
PIRL/models/checkpoints/
├── pirl_model_50000_steps.zip
├── pirl_model_100000_steps.zip
├── pirl_model_150000_steps.zip
...
└── pirl_model_2000000_steps.zip
```

**Best model:**
```
PIRL/models/best_model/best_model.zip
```

**Normalization stats:**
```
PIRL/models/pirl_italy_production_2M_vecnormalize.pkl
```

**Training logs:**
```
PIRL/training_2M_coastline.log
```

**TensorBoard logs:**
```
PIRL/outputs/production_2M/tensorboard/
```

---

## Post-Training Steps

Once training completes:

1. **Generate route:**
```bash
cd /opt/agrs/Projects/test_project2
python generate_route_from_model.py \
  --model PIRL/models/best_model/best_model.zip \
  --config PIRL/pirl_training_config_production.yaml \
  --vec-normalize PIRL/models/pirl_italy_production_2M_vecnormalize.pkl \
  --output PIRL/outputs/route_2M_coastline.geojson \
  --deterministic
```

2. **Validate route:**
```bash
python validate_production_route.py PIRL/outputs/route_2M_coastline.geojson
```

3. **Check water coverage:**
```python
import json
with open('PIRL/outputs/route_2M_coastline.geojson') as f:
    route = json.load(f)
segments = [f for f in route['features'] if f['id'] != 'full_route']
water = [s for s in segments if s['properties']['land_cover'] == 'water_bodies']
print(f"Water: {len(water)}/{len(segments)} = {len(water)/len(segments)*100:.1f}%")
# Expected: <5% (vs 58.6% before)
```

---

## Coastline Constraint Status

✅ **VERIFIED ACTIVE**

Direct environment test shows:
```
✅ Coastline boundary loaded (37 segments)
```

The coastline constraint is:
- Detecting offshore positions (water + >200m from coastline)
- Applying -1000.0 reward penalty
- Terminating episodes after 3 consecutive offshore steps
- Forcing agent to stay inland

---

## Training Process Details

**Each environment is:**
1. Loading all GIS data (DEM, land cover, vectors)
2. Loading coastline boundary (37 segments)
3. Running episodes with coastline constraint active
4. Penalizing offshore routing attempts
5. Learning to stay on land

**PPO Algorithm:**
- Learning rate: 0.0003
- Batch size: 256
- N-steps: 2048
- Clip range: 0.2
- Entropy coefficient: 0.01

---

## Troubleshooting

**If training stops unexpectedly:**
```bash
# Check if still running
ps aux | grep train_pirl_direct

# Check last errors
tail -100 /opt/agrs/Projects/test_project2/PIRL/training_2M_coastline.log

# Restart from checkpoint if needed
# (checkpoints saved every 50k steps)
```

**If out of memory:**
```bash
# Check memory usage
free -h

# Reduce parallel envs in config if needed
# Change num_envs from 8 to 4
```

---

## Success Criteria

1. ✅ Training started successfully
2. ⏳ Runs for full 2M timesteps
3. ⏳ Goal reached rate increases over time
4. ⏳ Generates valid route to goal
5. ⏳ Water coverage <5% (vs 58.6% before)
6. ⏳ Route stays inland (no offshore segments)

---

**Status:** Training in progress...  
**Next check:** Monitor log in 1-2 hours for progress update
