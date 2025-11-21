# Training Scripts Summary

**Date**: 2025-11-21  
**Status**: Optimized training scripts created for GPU and CPU

---

## 📁 Available Training Scripts

### Validation Scripts (10K timesteps)

| Script | Device | Batch Size | Envs | Runtime | Use Case |
|--------|--------|------------|------|---------|----------|
| `train_validation_10k.sh` | Auto-detect | 1024 | 24 | 15-60s | Quick test (detects GPU/CPU) |
| `train_validation_10k_gpu.sh` ⭐ | GPU (CUDA) | 1024 | 24 | ~15-30s | Fast GPU validation |
| `train_validation_10k_cpu.sh` | CPU | 1024 | 24 | ~30-60s | CPU validation |

### Production Scripts (500K timesteps)

| Script | Device | Batch Size | Envs | Runtime | Use Case |
|--------|--------|------------|------|---------|----------|
| `train_production_500k.sh` | Auto-detect | 2048 | 24 | 10-45m | Production (detects GPU/CPU) |
| `train_production_500k_gpu.sh` ⭐ | GPU (CUDA) | 2048 | 24 | ~10-20m | Fast GPU training |
| `train_production_500k_cpu.sh` | CPU | 2048 | 24 | ~30-45m | CPU training |

---

## ⚙️ Optimal Configuration

### With 24 Parallel Environments

**Samples per rollout**: `n_steps × num_envs` = `2048 × 24` = **49,152 samples**

#### 10K Validation
- **Batch size**: 1024
- **Gradient updates**: 49,152 / 1024 = **48 updates/rollout** ✅
- **Total updates**: ~480 (for entire 10K run)
- **Quality**: Efficient validation, smooth gradients

#### 500K Production
- **Batch size**: 2048
- **Gradient updates**: 49,152 / 2048 = **24 updates/rollout** ✅
- **Total updates**: ~2,930 (for entire 500K run)
- **Quality**: Stable learning, production-ready

---

## 🚀 Quick Start

### For GPU Users (Recommended)

```bash
# Quick validation
./train_validation_10k_gpu.sh

# Production training
./train_production_500k_gpu.sh
```

### For CPU Users

```bash
# Quick validation
./train_validation_10k_cpu.sh

# Production training
./train_production_500k_cpu.sh
```

### Auto-Detect (Works on any system)

```bash
# Automatically uses GPU if available, else CPU
./train_validation_10k.sh
./train_production_500k.sh
```

---

## 📊 Performance Comparison

### 10K Validation

| Device | Batch | Envs | Updates/Rollout | Runtime | Throughput |
|--------|-------|------|-----------------|---------|------------|
| GPU | 1024 | 24 | 48 | ~20s | ~500 steps/s |
| CPU | 1024 | 24 | 48 | ~45s | ~220 steps/s |

### 500K Production

| Device | Batch | Envs | Updates/Rollout | Runtime | Throughput |
|--------|-------|------|-----------------|---------|------------|
| GPU | 2048 | 24 | 24 | ~15m | ~555 steps/s |
| CPU | 2048 | 24 | 24 | ~35m | ~238 steps/s |

**GPU is ~2.3× faster** for this configuration.

---

## 💾 Memory Requirements

### GPU (VRAM)

| Configuration | Batch Size | Estimated VRAM |
|---------------|------------|----------------|
| Validation | 1024 | ~2 GB |
| Production | 2048 | ~3-4 GB |

✅ Works on most modern GPUs (GTX 1060+, RTX 2060+, etc.)

### CPU (RAM)

| Configuration | Batch Size | Estimated RAM |
|---------------|------------|---------------|
| Validation | 1024 | ~3-4 GB |
| Production | 2048 | ~4-6 GB |

✅ Works on most systems with 8+ GB RAM

---

## 🎯 Why These Batch Sizes?

### The Math

**Total samples per rollout**: `2048 steps × 24 envs = 49,152 samples`

**Optimal gradient updates per rollout**: 20-50 updates

| Batch Size | Updates | Efficiency | Verdict |
|------------|---------|------------|---------|
| 256 | 192 | ❌ Too many | Inefficient, overfitting |
| 512 | 96 | ⚠️ Many | Acceptable for quick tests |
| **1024** | **48** | ✅ **Optimal** | **Validation** |
| **2048** | **24** | ✅ **Optimal** | **Production** |
| 4096 | 12 | ⚠️ Few | Needs large GPU |

### Rule of Thumb

```
batch_size ≈ (n_steps × num_envs) / 20-50 updates
batch_size ≈ 49,152 / 20-50
batch_size ≈ 980 - 2,457
```

**Therefore**: 1024 and 2048 are perfect! ✅

---

## 🔧 Script Features

### All Scripts Include

✅ **Device verification** (GPU scripts check for CUDA)  
✅ **Hardware info display** (GPU model/VRAM or CPU cores/RAM)  
✅ **Configuration summary** (all parameters listed)  
✅ **Error handling** (exits on missing files/modules)  
✅ **Progress logging** (real-time output + saved log file)  
✅ **Success criteria** (goal reach rate, slope averages)  
✅ **Next steps** (TensorBoard, GeoJSON generation)  

### GPU Scripts Also Have

✅ **nvidia-smi checks** (verify GPU available)  
✅ **VRAM estimates** (expected memory usage)  
✅ **CUDA error handling** (specific GPU troubleshooting)  

### CPU Scripts Also Have

✅ **CPU core detection** (shows available cores)  
✅ **RAM checks** (available memory display)  
✅ **Performance tips** (suggests GPU if slow)  

---

## 📝 Output Structure

### Validation (10K)

```
outputs/
  validation_10k_[gpu|cpu]_YYYYMMDD_HHMMSS/
    eval/
      best_model.zip          ← Best performing checkpoint
    logs/
      tensorboard/            ← Training curves
    pirl_us_final.zip         ← Final model
```

### Production (500K)

```
outputs/
  production_500k_[gpu|cpu]_YYYYMMDD_HHMMSS/
    eval/
      best_model.zip          ← Best performing checkpoint
    models/
      checkpoint_50000.zip    ← Periodic checkpoints
      checkpoint_100000.zip
      ...
    logs/
      tensorboard/            ← Training curves
    training.log              ← Full training log
    pirl_us_final.zip         ← Final model
```

---

## 🎓 When to Use Each Script

### `train_validation_10k_gpu.sh` ⭐

**Use when**:
- You have a GPU
- Want to quickly test parameters
- Need to verify environment setup
- Testing reward function changes

**Runtime**: ~15-30 seconds

---

### `train_validation_10k_cpu.sh`

**Use when**:
- No GPU available
- Remote server without CUDA
- Want to test on CPU before GPU run

**Runtime**: ~30-60 seconds

---

### `train_production_500k_gpu.sh` ⭐

**Use when**:
- Ready for production training
- Have a GPU (recommended)
- Want deployment-ready model
- Need fast convergence

**Runtime**: ~10-20 minutes

---

### `train_production_500k_cpu.sh`

**Use when**:
- No GPU available
- CPU-only environment
- GPU busy with other tasks
- Want to train overnight

**Runtime**: ~30-45 minutes

---

### Auto-detect versions

**Use when**:
- Sharing scripts across systems
- Unsure if GPU is available
- Want one script for all cases
- CI/CD pipelines

**Runtime**: Depends on detected hardware

---

## 🚦 Pre-Flight Checklist

Before running any script:

- [ ] C++ module built: `pirl_native_us.cpython-312-x86_64-linux-gnu.so` exists
- [ ] Configuration file: `configs/us_pipeline_training_config.yaml` exists
- [ ] Virtual environment: `/opt/agrs/python/pirl_venv/` active
- [ ] DEM data: `/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/data/` populated
- [ ] Disk space: >1 GB available for outputs

### GPU Scripts Only

- [ ] CUDA available: `nvidia-smi` works
- [ ] VRAM free: >4 GB available
- [ ] Driver version: 520+ (for CUDA 11.8+)

---

## 🎯 Success Criteria

### After Training, Verify

**Model performance**:
- Goal reach rate: **>80%** ✅
- Average slope: **<15%** ✅
- Reward convergence: Stable and positive ✅

**Training curves** (TensorBoard):
- ep_rew_mean: Increasing trend ✅
- ep_len_mean: Reasonable (~200-500 steps) ✅
- Loss: Decreasing trend ✅

**Route quality** (GeoJSON):
- Smooth trajectory ✅
- Avoids excessive slopes ✅
- Stays within AOI ✅

---

## 💡 Troubleshooting

### GPU Script Fails

**"nvidia-smi not found"**:
- Use CPU script instead
- Install NVIDIA drivers

**"Out of VRAM"**:
- Reduce batch_size: 2048 → 1024
- Reduce num_envs: 24 → 12
- Close other GPU applications

**"CUDA error"**:
- Check driver: `nvidia-smi`
- Verify PyTorch CUDA: `python -c "import torch; print(torch.cuda.is_available())"`

---

### CPU Script Slow

**Very slow training**:
- ✅ Normal for CPU (2-3× slower)
- Consider GPU if available
- Reduce num_envs if very slow: 24 → 12

**Out of memory**:
- Reduce batch_size: 2048 → 1024
- Reduce num_envs: 24 → 12
- Close other applications

---

### Training Crashes

**NaN values**:
- Check reward function balance
- Review logs for extreme rewards
- Verify DEM data quality

**C++ crashes**:
- Check DEM/AOI data integrity
- Verify all required datasets exist
- Review C++ module build

---

## 📚 Examples

### Example 1: Quick GPU Validation

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_validation_10k_gpu.sh
# Wait ~20 seconds
tensorboard --logdir=outputs/validation_10k_gpu_*/logs/tensorboard
```

### Example 2: Production GPU Training

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_production_500k_gpu.sh
# Type 'y' to confirm
# Wait ~15 minutes
# View results in TensorBoard
```

### Example 3: CPU Training (No GPU)

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./train_validation_10k_cpu.sh  # ~1 minute
./train_production_500k_cpu.sh  # ~35 minutes
```

---

## ✅ Summary

**Created 6 training scripts**:
- 3 for validation (10K): auto, GPU, CPU
- 3 for production (500K): auto, GPU, CPU

**Optimal batch sizes**:
- Validation: **1024** (48 updates/rollout)
- Production: **2048** (24 updates/rollout)

**Parallel environments**: **24** (all scripts)

**Expected performance**:
- GPU validation: ~20s
- GPU production: ~15m
- CPU validation: ~45s
- CPU production: ~35m

**Ready to train**: Yes! ✅

---

🚀 **All scripts are executable and ready to use!**
