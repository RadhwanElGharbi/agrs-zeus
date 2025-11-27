# US_PIPELINE PIRL Training Guide

## Quick Start - 500K Training Run

### Prerequisites Checklist

✅ **Environment Built**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/build
ls pirl_native_us*.so
# Should see: pirl_native_us.cpython-312-x86_64-linux-gnu.so
```

✅ **Module Imports**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python
/opt/agrs/python/pirl_venv/bin/python3 -c "import pirl_native_us; print('✓ Ready')"
```

✅ **Environment Tests Pass**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./python/test_environment_us.py
# Should see: ALL TESTS PASSED ✅
```

---

## Training Options

### Option 1: Quick Validation (10K timesteps)

**Purpose**: Verify everything works before committing to long run

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_validation_10k.sh
```

**Runtime**: ~2-5 minutes (CPU), ~1-2 minutes (GPU)

**Expected Output**:
- Model saved to `outputs/validation_10k_*/eval/best_model.zip`
- TensorBoard logs in `outputs/validation_10k_*/logs/tensorboard`

---

### Option 2: Production Training (500K timesteps) ⭐

**Purpose**: Full training for deployment-ready model

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_production_500k.sh
```

**Runtime**:
- **CPU (4 cores)**: ~2-3 hours
- **GPU (CUDA)**: ~30-45 minutes

**Expected Output**:
- Best model: `outputs/production_500k_*/eval/best_model.zip`
- Final model: `outputs/production_500k_*/pirl_us_final.zip`
- Checkpoints: `outputs/production_500k_*/models/pirl_us_checkpoint_*.zip`
- Training log: `outputs/production_500k_*/training.log`

**Success Criteria**:
- ✅ Goal reach rate > 80%
- ✅ Average route slope < 15%
- ✅ Stable reward curve (no NaN/Inf)

---

### Option 3: Manual Training

For custom configurations:

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python

/opt/agrs/python/pirl_venv/bin/python3 train_pirl_us.py \
    --config ../configs/us_pipeline_training_config.yaml \
    --timesteps 500000 \
    --num-envs 1 \
    --batch-size 256 \
    --n-steps 2048 \
    --learning-rate 0.0003 \
    --output-dir ../outputs/custom_run \
    --eval-freq 10000 \
    --save-freq 50000 \
    --device auto
```

---

## Monitoring Training

### Real-Time Monitoring

**Terminal 1** - Training:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_production_500k.sh
```

**Terminal 2** - TensorBoard:
```bash
# Replace TIMESTAMP with your training run
tensorboard --logdir=/opt/agrs/Projects/US_PIPELINE/PIRL/outputs/production_500k_TIMESTAMP/logs/tensorboard

# Open browser to: http://localhost:6006
```

### Key Metrics to Watch

1. **`rollout/ep_rew_mean`**: Average episode reward
   - Should increase over time
   - Target: > 0 (positive total rewards)

2. **`rollout/ep_len_mean`**: Average episode length
   - Should decrease as agent learns efficient routes
   - Target: < 50 steps for 7km route

3. **`train/learning_rate`**: Learning rate (should be constant at 0.0003)

4. **`train/loss`**: Policy loss (should decrease and stabilize)

5. **`eval/mean_reward`**: Evaluation performance
   - Most important metric
   - Should show upward trend

---

## Parameter Tuning

### Test Single Configuration

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python

./tune_parameters_us.py \
    --config ../configs/us_pipeline_training_config.yaml \
    --mode single \
    --episodes 20 \
    --max-steps 100 \
    --progress-multiplier 2.0 \
    --slope-reward-scale 10.0 \
    --slope-penalty-scale -100.0
```

### Run Grid Search

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python

./tune_parameters_us.py \
    --config ../configs/us_pipeline_training_config.yaml \
    --mode grid \
    --episodes 10 \
    --max-steps 100 \
    --output-dir ../outputs/grid_search
```

**Grid Search Tests**:
- Progress multipliers: [0.5, 1.0, 2.0, 5.0]
- Slope reward scales: [5.0, 10.0, 20.0]
- Slope penalty scales: [-50.0, -100.0, -200.0]
- **Total configs**: 36

**Results**: Saved to `outputs/grid_search/grid_search_results_*.json`

---

## Generating Routes

After training, generate GeoJSON for ArcGIS:

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/python

./generate_geojson_us.py \
    --model ../outputs/production_500k_*/eval/best_model.zip \
    --config ../configs/us_pipeline_training_config.yaml \
    --output ../outputs/route_500k_production.geojson \
    --episodes 1
```

**Output Properties** (Simplified for 7D State Space):

```json
{
  "segment_id": 1,
  "step": 1,
  "length_m": 250.50,
  "cumulative_distance_m": 250.50,
  "elevation_start_m": 1234.56,
  "elevation_end_m": 1235.78,
  "slope_percent": 0.49,
  "reward": 492.34,
  "total_reward_cumulative": 492.34,
  "distance_to_aoi_boundary_m": 1500.00
}
```

**Import to ArcGIS**:
1. Open ArcGIS Pro
2. Add Data → GeoJSON
3. Select `route_500k_production.geojson`
4. CRS: EPSG:32613 (UTM Zone 13N)

---

## Troubleshooting

### Issue: Training crashes with NaN values

**Symptoms**:
```
ValueError: Expected parameter loc ... to satisfy the constraint Real(), but found invalid values: tensor([[nan, nan, nan], ...])
```

**Solutions**:
1. **Check reward balance**: Run parameter tuner to verify rewards are in reasonable range
2. **Reduce learning rate**: Use `--learning-rate 0.0001` instead of 0.0003
3. **Increase batch size**: Use `--batch-size 512` for more stable gradients
4. **Check DEM data**: Verify no NaN/Inf values in elevation data

### Issue: Agent immediately exits boundaries

**Symptoms**: Every episode terminates with `OUT_OF_BOUNDS` in 1-2 steps

**Solutions**:
1. **Normal for untrained agent**: Random actions with 300m max step size can exit small AOIs
2. **Verify AOI loaded**: Check environment creation logs show "✅ AOI boundary loaded"
3. **Adjust boundary penalty**: Increase boundary penalty scale in parameter tuner

### Issue: Out of memory (OOM)

**Symptoms**: `RuntimeError: CUDA out of memory`

**Solutions**:
1. **Reduce batch size**: `--batch-size 128` or `--batch-size 64`
2. **Reduce n_steps**: `--n-steps 1024` instead of 2048
3. **Use CPU**: `--device cpu`

### Issue: Very slow training on CPU

**Solutions**:
1. **Reduce timesteps**: Start with 100K for testing
2. **Use GPU if available**: Install PyTorch with CUDA support
3. **Reduce environments**: Already at 1 (can't reduce further)

### Issue: "Module not found: pirl_native_us"

**Solution**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/build
make clean
make -j$(nproc)
# Verify .so file created in python/ directory
ls ../python/pirl_native_us*.so
```

---

## Advanced Configuration

### Modify Training Parameters

Edit `configs/us_pipeline_training_config.yaml`:

```yaml
# Increase exploration
training:
  ent_coef: 0.02  # Default: 0.01 (higher = more exploration)

# Adjust step size range
constraints:
  step_size_min_m: 50.0   # Default: 40.0
  step_size_max_m: 250.0  # Default: 300.0

# Increase max episode length
constraints:
  max_steps_per_episode: 7500  # Default: 5000
```

### Multi-Environment Training

⚠️ **Warning**: C++ environments may not be thread-safe. Start with 1 environment.

To test with multiple environments:

```bash
./train_pirl_us.py \
    --config configs/us_pipeline_training_config.yaml \
    --timesteps 500000 \
    --num-envs 4 \  # Try with 4 parallel environments
    --output-dir outputs/multi_env_test
```

---

## Expected Performance Benchmarks

### Random Policy (Untrained)

- Success rate: < 5%
- Average reward: -500 to 0
- Average slope: 15-25%
- Episode length: 5-20 steps (often terminates quickly)

### After 100K Timesteps

- Success rate: 20-40%
- Average reward: 500-2000
- Average slope: 10-18%
- Episode length: 30-80 steps

### After 500K Timesteps (Target)

- Success rate: > 80%
- Average reward: > 3000
- Average slope: < 15%
- Episode length: 25-50 steps
- Consistent convergence

---

## File Structure Reference

```
/opt/agrs/Projects/US_PIPELINE/PIRL/
├── configs/
│   └── us_pipeline_training_config.yaml  # Main config
├── python/
│   ├── pirl_native_us.*.so               # Compiled module
│   ├── pirl_native_env_us.py             # Gymnasium env
│   ├── train_pirl_us.py                  # Training script
│   ├── generate_geojson_us.py            # Route export
│   ├── tune_parameters_us.py             # Parameter tuning
│   └── test_environment_us.py            # Environment tests
├── outputs/
│   ├── validation_10k_*/                 # 10K validation runs
│   ├── production_500k_*/                # 500K production runs
│   │   ├── eval/best_model.zip           # Best model
│   │   ├── pirl_us_final.zip             # Final model
│   │   ├── models/pirl_us_checkpoint_*.zip  # Checkpoints
│   │   ├── logs/tensorboard/             # TensorBoard logs
│   │   └── training.log                  # Full training log
│   └── route_*.geojson                   # Generated routes
├── train_validation_10k.sh               # Quick validation
└── train_production_500k.sh              # Production training
```

---

## State Space Reference (7D)

```python
[0] x                    # X coordinate (normalized)
[1] y                    # Y coordinate (normalized)
[2] goal_distance        # Distance to goal (normalized)
[3] goal_bearing         # Direction to goal (radians)
[4] slope                # Terrain slope 0-100% (PRIMARY OPTIMIZATION)
[5] distance_to_boundary # Distance to AOI edge (meters)
[6] prev_heading         # Previous heading (radians)
```

## Action Space Reference (2D)

```python
[0] heading_change  # Direction change ±45° (scaled from [-1, 1])
[1] step_size       # Movement distance 40-300m (scaled from [-1, 1])
```

## Reward Function Summary

```
Total Reward = Progress + Slope + Boundary + Curvature + Goal

Progress:  +2.0 * meters_toward_goal
Slope:     0-20% → +10 to 0 (linear)
           20-50% → 0 to -100 (quadratic penalty)
           >50% → -500 (terminal)
Boundary:  -50 * (1 - dist/100) if dist < 100m
Curvature: -0.5 * |heading_change_radians|
Goal:      +1000 if within 50m
```

---

## Ready to Start?

1. **Verify prerequisites**: `./python/test_environment_us.py`
2. **Run validation**: `./train_validation_10k.sh`
3. **Start production run**: `./train_production_500k.sh`
4. **Monitor progress**: `tensorboard --logdir=outputs/production_500k_*/logs/tensorboard`
5. **Generate route**: `./python/generate_geojson_us.py --model ... --config ... --output ...`

🚀 **Good luck with your training!**



