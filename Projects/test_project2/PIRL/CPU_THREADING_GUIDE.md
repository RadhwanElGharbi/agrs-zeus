# CPU Multi-Threading Guide for PIRL Training

**Date**: November 17, 2025  
**Purpose**: Configure CPU threading for optimal PIRL training performance

---

## Quick Reference

### Default (Recommended)
```bash
./train_600k_cpu_mlp.sh
```
Uses 75% of CPU cores automatically.

### Maximum Performance
Edit `train_600k_cpu_mlp.sh`, uncomment Option 1:
```bash
export OMP_NUM_THREADS=$NUM_CORES
export MKL_NUM_THREADS=$NUM_CORES
export OPENBLAS_NUM_THREADS=$NUM_CORES
```

### Manual Control
Edit `train_600k_cpu_mlp.sh`, uncomment Option 3 and set:
```bash
export OMP_NUM_THREADS=16    # Set your desired thread count
export MKL_NUM_THREADS=16
export OPENBLAS_NUM_THREADS=16
```

---

## Understanding CPU Threading

### Two Levels of Parallelization

PIRL training uses **two types** of parallelization:

1. **Environment Parallelization** (Outer Loop)
   - Controlled by: `num_envs: 24` in YAML config
   - Runs 24 independent pipeline environments simultaneously
   - Each environment simulates a separate routing episode
   - Python-level multiprocessing

2. **Numerical Library Threading** (Inner Loop)
   - Controlled by: `OMP_NUM_THREADS`, `MKL_NUM_THREADS`, etc.
   - PyTorch/NumPy operations use multiple threads per computation
   - Matrix operations, neural network forward/backward passes
   - C/C++ level threading

**Total CPU usage**: `num_envs × threads_per_env ≈ 24 × N threads`

---

## Environment Variables Explained

### Primary Threading Controls

#### `OMP_NUM_THREADS`
**Purpose**: Controls OpenMP threading (used by NumPy, SciPy)
```bash
export OMP_NUM_THREADS=16
```
- **Recommendation**: 75% of CPU cores
- **Max**: Total CPU cores
- **Min**: 4 (for reasonable performance)

#### `MKL_NUM_THREADS`
**Purpose**: Controls Intel Math Kernel Library threading (PyTorch on Intel CPUs)
```bash
export MKL_NUM_THREADS=16
```
- Should match `OMP_NUM_THREADS`
- Critical for PyTorch CPU performance

#### `OPENBLAS_NUM_THREADS`
**Purpose**: Controls OpenBLAS threading (alternative to MKL)
```bash
export OPENBLAS_NUM_THREADS=16
```
- Used if PyTorch compiled with OpenBLAS instead of MKL
- Should match `OMP_NUM_THREADS`

#### `NUMEXPR_NUM_THREADS`
**Purpose**: Controls NumExpr threading (NumPy operations)
```bash
export NUMEXPR_NUM_THREADS=16
```
- Used by some NumPy operations
- Should match `OMP_NUM_THREADS`

### Advanced Threading Controls

#### `OMP_PROC_BIND`
**Purpose**: Thread binding strategy
```bash
export OMP_PROC_BIND=true
```
- `true`: Bind threads to CPU cores (recommended for consistency)
- `false`: Allow thread migration (may reduce performance)

#### `OMP_PLACES`
**Purpose**: Thread placement
```bash
export OMP_PLACES=cores
```
- `cores`: One thread per physical core
- `threads`: One thread per logical core (hyperthreading)

#### `KMP_BLOCKTIME`
**Purpose**: Thread idle time before sleeping
```bash
export KMP_BLOCKTIME=0
```
- `0`: Threads yield immediately when idle (saves power)
- Higher values: Threads spin-wait (lower latency, higher power)

#### `KMP_AFFINITY`
**Purpose**: Thread-to-core affinity (Intel CPUs)
```bash
export KMP_AFFINITY=granularity=fine,compact,1,0
```
- `granularity=fine`: Fine-grained thread control
- `compact`: Pack threads close together (better cache usage)
- Alternative: `scatter` (spread threads across cores)

---

## Configuration Strategies

### Strategy 1: Maximum Performance (All Cores)

**When to use**: Dedicated training machine, no other workloads

```bash
# Edit train_600k_cpu_mlp.sh, uncomment:
export OMP_NUM_THREADS=$NUM_CORES
export MKL_NUM_THREADS=$NUM_CORES
export OPENBLAS_NUM_THREADS=$NUM_CORES
```

**Pros**:
- Maximum computational throughput
- Fastest training time

**Cons**:
- System may become unresponsive
- High CPU temperature
- Interferes with other processes

**Example**: 32-core machine → 32 threads × 24 envs = 768 total threads

---

### Strategy 2: Balanced (75% of Cores) **[RECOMMENDED]**

**When to use**: General purpose, some other workloads running

```bash
# Default in train_600k_cpu_mlp.sh:
NUM_THREADS=$((NUM_CORES * 3 / 4))
export OMP_NUM_THREADS=$NUM_THREADS
export MKL_NUM_THREADS=$NUM_THREADS
export OPENBLAS_NUM_THREADS=$NUM_THREADS
```

**Pros**:
- Good performance (95% of maximum)
- System remains responsive
- Leaves cores for OS/other processes

**Cons**:
- Slightly slower than maximum

**Example**: 32-core machine → 24 threads × 24 envs = 576 total threads

---

### Strategy 3: Conservative (50% of Cores)

**When to use**: Shared machine, many other workloads

```bash
# Edit train_600k_cpu_mlp.sh:
export OMP_NUM_THREADS=$((NUM_CORES / 2))
export MKL_NUM_THREADS=$((NUM_CORES / 2))
export OPENBLAS_NUM_THREADS=$((NUM_CORES / 2))
```

**Pros**:
- Minimal system impact
- Good for background training

**Cons**:
- 40-60% slower than maximum

**Example**: 32-core machine → 16 threads × 24 envs = 384 total threads

---

### Strategy 4: Manual Fixed Count

**When to use**: Fine-tuned control, specific hardware optimization

```bash
# Edit train_600k_cpu_mlp.sh:
export OMP_NUM_THREADS=16
export MKL_NUM_THREADS=16
export OPENBLAS_NUM_THREADS=16
```

**When to choose specific counts**:
- **4 threads**: Low-end systems, minimal resource use
- **8 threads**: Good balance for 12-16 core systems
- **16 threads**: Standard for 24-32 core systems
- **32 threads**: High-end workstations
- **64+ threads**: Server-class systems

---

## Monitoring and Tuning

### Check Current Configuration

Before training starts:
```bash
echo "OMP_NUM_THREADS: $OMP_NUM_THREADS"
echo "MKL_NUM_THREADS: $MKL_NUM_THREADS"
echo "Total cores: $(nproc)"
```

### Monitor CPU Usage During Training

```bash
# Watch CPU usage
htop

# Or more detailed:
top -H -p $(pgrep -f train_pirl.py)
```

**What to look for**:
- CPU usage should be 70-95% (if configured correctly)
- All cores active (not just one)
- No core stuck at 100% (indicates bottleneck)

### Performance Benchmarking

Test different configurations:

```bash
# Test 1: 75% cores (default)
time ./train_600k_cpu_mlp.sh

# Test 2: Edit to 100% cores
# (modify script, uncomment Option 1)
time ./train_600k_cpu_mlp.sh

# Test 3: Edit to 50% cores
# (modify script to NUM_CORES / 2)
time ./train_600k_cpu_mlp.sh
```

Compare training speed (timesteps/second) in logs.

---

## Common Issues and Solutions

### Issue 1: Only One Core Active

**Symptom**: `top` shows only 1 core at 100%, others idle

**Cause**: Threading variables not set

**Solution**:
```bash
# Verify environment variables before running:
env | grep -E "(OMP|MKL|OPENBLAS)_NUM_THREADS"

# If empty, manually export:
export OMP_NUM_THREADS=16
export MKL_NUM_THREADS=16
./train_600k_cpu_mlp.sh
```

---

### Issue 2: All Cores at 100% but Slow

**Symptom**: All cores active but training slower than expected

**Cause**: Thread oversubscription

**Solution**: Reduce thread count
```bash
# If you have 32 cores and set 32 threads with 24 envs:
# 32 × 24 = 768 threads (too many!)

# Reduce to 4-8 threads per environment:
export OMP_NUM_THREADS=8
export MKL_NUM_THREADS=8
```

**Optimal formula**: `threads = NUM_CORES / num_envs`
- 32 cores, 24 envs → 32/24 ≈ 1-2 threads per env
- OR keep envs lower: 8 envs, 4 threads each = 32 threads total

---

### Issue 3: System Becomes Unresponsive

**Symptom**: Training runs but system is sluggish/frozen

**Cause**: Too many threads, all cores saturated

**Solution**: Reduce to 50-75% of cores
```bash
export OMP_NUM_THREADS=$((NUM_CORES / 2))
```

---

### Issue 4: "OpenMP: Too Many Threads" Warning

**Symptom**: Warning message about thread count

**Cause**: Requesting more threads than cores

**Solution**: Cap at actual core count
```bash
NUM_CORES=$(nproc)
export OMP_NUM_THREADS=$NUM_CORES  # Don't exceed this
```

---

## Performance Expectations

### Speedup by Configuration

Based on 32-core system:

| Configuration | Threads | Expected Speedup | Training Time (600K) |
|---------------|---------|------------------|----------------------|
| Single-threaded | 1 | 1x baseline | ~48 hours |
| 25% cores (8) | 8 | 6-7x | ~7-8 hours |
| 50% cores (16) | 16 | 10-12x | ~4-5 hours |
| 75% cores (24) | 24 | 14-16x | ~3-3.5 hours |
| 100% cores (32) | 32 | 16-18x | ~2.5-3 hours |

**Note**: Speedup is not linear due to:
- Thread overhead
- Memory bandwidth limits
- Cache contention
- Amdahl's law

---

## Hyperthreading Considerations

### What is Hyperthreading?

Intel CPUs often have 2 logical threads per physical core:
- Physical cores: 16
- Logical cores (with HT): 32

### Should You Use All Logical Cores?

**Short answer**: Usually yes, but limited benefit

**Performance**:
- Physical cores: 100% performance
- +Hyperthreading: ~120-140% performance (not 200%)

**Recommendation**:
```bash
# Use physical core count (more predictable)
NUM_PHYSICAL_CORES=$(lscpu | grep "Core(s) per socket" | awk '{print $4}')
export OMP_NUM_THREADS=$NUM_PHYSICAL_CORES

# Or use all logical cores (slightly faster, more variable)
export OMP_NUM_THREADS=$(nproc)
```

---

## Hardware-Specific Recommendations

### AMD Ryzen (e.g., 5950X, 7950X)

```bash
export OMP_NUM_THREADS=$NUM_CORES
export MKL_NUM_THREADS=$NUM_CORES
export OMP_PROC_BIND=true
export OMP_PLACES=cores
```
- AMD CPUs scale well with high thread counts
- Use all cores for maximum performance

### Intel Xeon (Server)

```bash
export OMP_NUM_THREADS=$NUM_CORES
export MKL_NUM_THREADS=$NUM_CORES
export KMP_AFFINITY=granularity=fine,compact,1,0
```
- MKL highly optimized for Intel
- Use `KMP_AFFINITY` for best performance

### Intel Core (Desktop/Laptop)

```bash
export OMP_NUM_THREADS=$((NUM_CORES * 3 / 4))
export MKL_NUM_THREADS=$((NUM_CORES * 3 / 4))
```
- Leave some cores free for responsiveness
- 75% is good balance

---

## Summary

### Quick Setup (Copy-Paste)

**For maximum performance** (dedicated machine):
```bash
cd /opt/agrs/Projects/test_project2/PIRL
nano train_600k_cpu_mlp.sh
# Uncomment Option 1 (use all cores)
./train_600k_cpu_mlp.sh
```

**For balanced performance** (default, recommended):
```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_600k_cpu_mlp.sh  # Already configured for 75% cores
```

**For background training** (shared system):
```bash
cd /opt/agrs/Projects/test_project2/PIRL
nano train_600k_cpu_mlp.sh
# Change to NUM_CORES / 2
./train_600k_cpu_mlp.sh
```

---

## Related Documentation

- **Training Standard**: `/opt/agrs/docs/Project Instructions/PIRL_TRAINING_GEOJSON_STANDARD.md`
- **10K vs 600K Comparison**: `/opt/agrs/Projects/test_project2/PIRL/TRAINING_COMPARISON_10K_vs_600K.md`
- **GPU Training**: `/opt/agrs/Projects/test_project2/PIRL/train_600k_gpu_mlp.sh`

---

**TL;DR**: The default script uses 75% of your CPU cores. To use all cores, edit the script and uncomment Option 1. To use fewer cores, uncomment Option 3 and set your desired number.

