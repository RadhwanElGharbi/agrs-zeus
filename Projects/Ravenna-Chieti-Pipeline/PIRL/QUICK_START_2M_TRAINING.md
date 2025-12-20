# 🚀 Quick Start: 2M Production Training

## ✅ PRE-FLIGHT CHECKLIST

- ✅ C++ module compiled with latest fixes
- ✅ 29D observation space + 3D action space
- ✅ 75m safety zone active
- ✅ Reward breakdown logging enabled
- ✅ Automatic GeoJSON generation configured
- ✅ ArcGIS compatibility verified

**Status**: 🟢 READY TO LAUNCH

---

## 🎯 START TRAINING

### Option 1: GPU (Recommended if available)
```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_2M_production_gpu.sh
```
- **Runtime**: 30-45 minutes
- **FPS**: 60-150 steps/second
- **Output**: `outputs/production_2M_gpu/`

### Option 2: CPU
```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_2M_production_cpu.sh
```
- **Runtime**: 3-4 hours
- **FPS**: 12-15 steps/second
- **Output**: `outputs/production_2M_cpu/`

---

## 📊 WHAT YOU'LL SEE

### 1. During Training
```
Time/fps: 135.2
rollout/ep_len_mean: 245.3
rollout/ep_rew_mean: -125.45
```

### 2. At Episode Termination
```
✅ SUCCESS: Goal reached! Episode 42, Steps: 1247
📊 REWARD BREAKDOWN:
   Total Reward:          +125.45
   ├─ Progress:           +180.20
   ├─ Cost Penalty:        -35.80
   ├─ Constraint:          -15.20
   ├─ Curvature:            -3.75
   └─ Goal Bonus:         +100.00
```

### 3. After Training Completes
```
✅ Training complete!
Model saved to: outputs/production_2M_gpu/eval/best_model.zip

🗺️  Generating GeoJSON for ArcGIS analysis...
✅ GeoJSON generated successfully!
   📍 Output: outputs/production_2M_gpu/route_2M_production_gpu.geojson
   🗺️  Ready for ArcGIS import
   📊 CRS: EPSG:32633 (UTM Zone 33N)
```

---

## 🗺️ ARCGIS IMPORT

1. **Open ArcGIS Pro**
2. **Add Data** → Browse to:
   - `outputs/production_2M_gpu/route_2M_production_gpu.geojson` (GPU)
   - `outputs/production_2M_cpu/route_2M_production_cpu.geojson` (CPU)
3. **CRS auto-detected**: EPSG:32633 (UTM Zone 33N - Italy)
4. **Analyze** attribute table (43+ properties per segment)

### Key Properties to Analyze:
- `segment_id`, `length_m`, `cost_usd`
- `elevation_start/end`, `slope_percent`
- `land_cover_name`, `land_cover_class`
- `nearest_crossing_type`, `nearest_crossing_dist`, `nearest_crossing_width`
- `reward`, `total_reward`
- `terrain_cost`, `infrastructure_cost`

---

## 📈 REWARD COMPONENTS EXPLAINED

| Component | Meaning | Typical Range |
|-----------|---------|---------------|
| **Progress** | Moving toward goal | +10 to +200 |
| **Cost Penalty** | Terrain + crossing costs | -10 to -100 |
| **Constraint** | Boundary/built-up proximity | -0 to -500 |
| **Curvature** | Excessive bending | -0 to -10 |
| **Goal Bonus** | Reaching goal | +100 (success only) |

**Total Reward Interpretation**:
- **Positive (+50 to +150)**: Good route, likely goal reached
- **Near Zero (-50 to +50)**: Acceptable route with tradeoffs
- **Negative (-100 to -300)**: Constraint violations or poor optimization

---

## 🔧 TROUBLESHOOTING

### Training seems stuck at low FPS
- Check CPU/GPU utilization
- Verify GIS data loaded correctly
- Ensure no other heavy processes running

### All episodes failing early
- Check start point isn't in violation zone
- 75m safety zone should allow exploration
- Review constraint parameters in config

### GeoJSON not generated
- Check if best_model.zip exists
- Manually run generation command (see script output)
- Verify environment has sufficient memory

---

## 📁 OUTPUT FILES

```
outputs/production_2M_*/
├── eval/
│   ├── best_model.zip          # Best performing model
│   └── evaluations.npz         # Evaluation metrics
├── models/
│   ├── pirl_2M_050000.zip      # Checkpoint at 50K
│   ├── pirl_2M_100000.zip      # Checkpoint at 100K
│   └── ...
├── training_*.log              # Full training log
└── route_2M_production_*.geojson  # ArcGIS-ready route
```

---

## 🎯 NEXT STEPS AFTER TRAINING

1. **Review training logs** for convergence
2. **Import GeoJSON to ArcGIS** for visual analysis
3. **Analyze reward trends** (success rate improving?)
4. **Compare with baseline** (Dijkstra, manual routing)
5. **If unsatisfactory**: Adjust parameters, retrain

---

**Generated**: 2025-11-20  
**System**: AGRS ZEUS v1.0.0  
**Ready**: ✅ Execute when ready
