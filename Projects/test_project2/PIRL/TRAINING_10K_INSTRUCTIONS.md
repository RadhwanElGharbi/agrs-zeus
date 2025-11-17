# PIRL 10K Validation Training - Instructions

**Date:** 2025-11-17  
**Configuration:** 10,000 timesteps, 24 parallel environments  
**Purpose:** Validate training stability and setup before full-scale production runs

---

## Prerequisites

✅ **Built-up area constraint fixed** - penalty-based learning instead of termination  
✅ **Slope penalty system active** - exponential penalties for >20% slopes  
✅ **Native bindings rebuilt** - includes all constraint fixes  
✅ **21-dimensional state space** - with hydraulic features

---

## Training Commands

### Option 1: CPU + MLP (Recommended Baseline)

**Use this for:** Standard training, guaranteed compatibility

```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_10k_cpu_mlp.sh
```

**Expected runtime:** 20-40 minutes  
**Device:** CPU only  
**Policy:** MLP (fully connected layers)

### Option 2: GPU + MLP (Fastest)

**Use this for:** Accelerated training with GPU

```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_10k_gpu_mlp.sh
```

**Expected runtime:** 5-15 minutes  
**Device:** CUDA GPU (will auto-detect)  
**Policy:** MLP (fully connected layers)

### Option 3: CPU + CNN (Experimental)

**⚠️ WARNING:** CNN policy expects image input, may fail with 21D vector state

```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_10k_cpu_cnn.sh
```

**Expected runtime:** 30-60 minutes (if it works)  
**Device:** CPU only  
**Policy:** CNN (convolutional layers)  
**Note:** You'll be prompted to confirm due to incompatibility

### Option 4: GPU + CNN (Experimental)

**⚠️ WARNING:** CNN policy expects image input, may fail with 21D vector state

```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_10k_gpu_cnn.sh
```

**Expected runtime:** 10-20 minutes (if it works)  
**Device:** CUDA GPU  
**Policy:** CNN (convolutional layers)  
**Note:** You'll be prompted to confirm due to incompatibility

---

## Monitoring Progress

### Watch Training Log

```bash
# For CPU + MLP
tail -f outputs/validation_10k/training_cpu_mlp.log

# For GPU + MLP
tail -f outputs/validation_10k/training_gpu_mlp.log
```

### TensorBoard (Real-time Visualization)

Open a separate terminal:

```bash
cd /opt/agrs/Projects/test_project2/PIRL
tensorboard --logdir=outputs/validation_10k/tensorboard --port=6006
```

Then open in browser: **http://localhost:6006**

You'll see:
- Episode reward progression
- Episode length over time
- Learning rate schedule
- Value loss
- Policy loss
- Other training metrics

---

## Post-Training Analytics

### Generate Training Report

After training completes:

```bash
cd /opt/agrs/Projects/test_project2/PIRL
python3 analyze_training_run.py outputs/validation_10k --config-name="10K Validation"
```

**Output:**
- `outputs/validation_10k/analytics_report.md` - Comprehensive markdown report
- `outputs/validation_10k/training_plots/` - Visualization plots
- `outputs/validation_10k/training_statistics.json` - Statistics in JSON

**Report includes:**
- Training duration and throughput
- Reward statistics (initial, final, improvement)
- Episode length statistics
- Training curves (reward, length, loss)

---

## Generate GeoJSON Route

### Using Best Model

The best model is automatically saved during training at:
- `models/pirl_10k_validation_best_model.zip`

Generate route:

```bash
cd /opt/agrs/Projects/test_project2/PIRL
python3 generate_route_from_model.py \
    --model models/pirl_10k_validation_best_model.zip \
    --config pirl_training_config_10k_validation.yaml \
    --output outputs/validation_10k/route_10k.geojson
```

**Output:**
- `outputs/validation_10k/route_10k.geojson`

### Using Final Model

```bash
python3 generate_route_from_model.py \
    --model models/pirl_10k_validation.zip \
    --config pirl_training_config_10k_validation.yaml \
    --output outputs/validation_10k/route_10k_final.geojson
```

### View GeoJSON

Load in QGIS or any GIS software:
1. Open QGIS
2. Layer → Add Layer → Add Vector Layer
3. Select `route_10k.geojson`
4. Load base map (OpenStreetMap) for context

---

## Expected Results

### Success Indicators

✅ **Training completes** without crashes  
✅ **Reward improves** over 10K timesteps  
✅ **No premature termination** due to slope/built-up areas  
✅ **Episodes last longer** as training progresses  
✅ **GeoJSON generated** successfully

### Performance Benchmarks

| Metric | Initial | Target | Good |
|--------|---------|--------|------|
| **Episode Reward** | ~-50000 | >-30000 | >-20000 |
| **Episode Length** | ~50-100 | >200 | >500 |
| **Slope Violations** | High | Decreasing | Low |
| **Goal Progress** | <10% | >30% | >50% |

**Note:** With only 10K timesteps, don't expect perfect performance. This is a validation run to ensure:
1. Training runs without errors
2. Agent learns (reward improves)
3. No constraint termination issues
4. Setup is correct for full training

---

## Troubleshooting

### Issue: CnnPolicy fails with shape error

**Error:** `AssertionError: Expected 2D/3D input, got 1D`

**Cause:** CNN expects image input (e.g., 84×84×3), but PIRL state is 21D vector

**Solution:** Use **MlpPolicy** instead (recommended for vector states)

```bash
# Use MLP version
./train_10k_cpu_mlp.sh  # or ./train_10k_gpu_mlp.sh
```

### Issue: CUDA out of memory

**Error:** `RuntimeError: CUDA out of memory`

**Solutions:**
1. **Reduce environments:** Edit config `num_envs: 24` → `num_envs: 12`
2. **Reduce batch size:** Edit config `batch_size: 256` → `batch_size: 128`
3. **Use CPU:** Run CPU version instead

### Issue: Early termination (built-up area)

**Error:** Episode terminates immediately with "Built-up area violation"

**Cause:** Built-up area fix not applied or native bindings not rebuilt

**Solution:**
```bash
# Verify fix is in place
cd /opt/agrs/build
make clean
make pirl_native -j$(nproc)
cp pirl_native.cpython-312-x86_64-linux-gnu.so /opt/agrs/python/pirl_training/

# Test environment
cd /opt/agrs/Projects/test_project2/PIRL
python3 test_environment_manual.py pirl_training_config_10k_validation.yaml
```

Expected: No immediate termination, penalties applied instead

### Issue: Training very slow

**Symptoms:** <100 timesteps/second on CPU

**Solutions:**
1. **Use GPU:** Run GPU version for 3-5x speedup
2. **Reduce environments:** `num_envs: 24` → `num_envs: 8`
3. **Check CPU usage:** Ensure no other heavy processes running

### Issue: No GeoJSON generated

**Error:** "No valid route generated"

**Cause:** Episode terminates before reaching goal or generating route

**Diagnosis:**
```bash
# Check model performance
python3 generate_route_from_model.py \
    --model models/pirl_10k_validation_best_model.zip \
    --config pirl_training_config_10k_validation.yaml \
    --output test.geojson \
    --max-steps 10000  # Increase max steps
```

**Solutions:**
- Increase `--max-steps` to allow longer episodes
- Check that model trained successfully (review logs)
- Verify configuration is correct (start/end points, constraints)

---

## File Locations

### Configuration
- `/opt/agrs/Projects/test_project2/PIRL/pirl_training_config_10k_validation.yaml`

### Training Scripts
- `train_10k_cpu_mlp.sh` - CPU + MLP
- `train_10k_gpu_mlp.sh` - GPU + MLP
- `train_10k_cpu_cnn.sh` - CPU + CNN (experimental)
- `train_10k_gpu_cnn.sh` - GPU + CNN (experimental)

### Output Directories
- `outputs/validation_10k/` - Training outputs
- `outputs/validation_10k/tensorboard/` - TensorBoard logs
- `outputs/validation_10k/training_plots/` - Visualization plots
- `models/` - Saved models

### Models
- `models/pirl_10k_validation_best_model.zip` - Best model (highest eval reward)
- `models/pirl_10k_validation.zip` - Final model after 10K steps

### Logs
- `outputs/validation_10k/training_cpu_mlp.log` - CPU MLP training log
- `outputs/validation_10k/training_gpu_mlp.log` - GPU MLP training log

---

## Next Steps

After successful 10K validation run:

1. ✅ **Review analytics report** - Verify training is stable
2. ✅ **Inspect GeoJSON route** - Load in QGIS, check for issues
3. ✅ **Analyze termination reasons** - Should be mostly "max steps" or "goal reached"
4. ✅ **Check slope violations** - Should decrease over training
5. 🚀 **Scale to production** - Run full 1.5M-2M timestep training

### Production Training

Once validated, scale up:

```bash
# Edit production config if needed
vim pirl_training_config_production.yaml

# Run production training (1.5M timesteps)
cd /opt/agrs/python/pirl_training
python3 train_pirl.py \
    --config /opt/agrs/Projects/test_project2/PIRL/pirl_training_config_production.yaml \
    --device cuda \
    --policy MlpPolicy \
    2>&1 | tee production_training.log
```

**Expected runtime:** 6-12 hours (GPU) or 24-48 hours (CPU)

---

## Support

If you encounter issues:
1. Check logs in `outputs/validation_10k/`
2. Review TensorBoard metrics
3. Verify native bindings are up to date
4. Run diagnostic tests (`test_environment_manual.py`)
5. Check this troubleshooting section

---

## Summary

**Quick Start (Recommended):**
```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_10k_gpu_mlp.sh  # or ./train_10k_cpu_mlp.sh if no GPU
python3 analyze_training_run.py outputs/validation_10k
python3 generate_route_from_model.py \
    --model models/pirl_10k_validation_best_model.zip \
    --config pirl_training_config_10k_validation.yaml \
    --output outputs/validation_10k/route_10k.geojson
```

**Good luck with training! 🚀**

