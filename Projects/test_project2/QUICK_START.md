# PIRL Test Run - Quick Start

## Execute Test Run (Single Command)

```bash
cd /opt/agrs/Projects/test_project2
./run_test_training.sh
```

**Duration:** 5-15 minutes  
**Output:** Trained model + detailed route GeoJSON

---

## What You Get

✅ **Trained Model** → `PIRL/models/best_model/best_model.zip`  
✅ **Detailed Route** → `PIRL/outputs/test_route_detailed.geojson`  
✅ **Training Logs** → `PIRL/outputs/test_run.log`  
✅ **TensorBoard Data** → `PIRL/outputs/pirl_training_test/tensorboard/`  
✅ **Validation Report** → `PIRL/TEST_RUN_VALIDATION_REPORT.md`

---

## View Results

### TensorBoard (Real-time monitoring)
```bash
tensorboard --logdir PIRL/outputs/pirl_training_test/tensorboard
# Open: http://localhost:6006
```

### Route in QGIS
1. Open QGIS
2. Add Vector Layer
3. Select `PIRL/outputs/test_route_detailed.geojson`
4. View segment properties (cost, terrain, etc.)

### Python Analysis
```python
import geopandas as gpd
route = gpd.read_file('PIRL/outputs/test_route_detailed.geojson')
print(f"Total segments: {len(route)}")
print(f"Total cost: ${route['cost_usd'].sum():,.2f}")
print(f"Total length: {route['length_m'].sum():.2f} m")
```

---

## If Successful: Run Full Training

```bash
python3 ../test_project/train_pirl_direct.py \
  --config PIRL/pirl_training_config.yaml
```

**Duration:** 2-6 hours (500k timesteps)

---

## Files Created

| File | Purpose |
|------|---------|
| `pirl_training_config_test.yaml` | Test configuration (10k timesteps) |
| `generate_route_from_model.py` | Route generation script |
| `run_test_training.sh` | Automated test execution |
| `TEST_RUN_INSTRUCTIONS.md` | Detailed instructions |
| `IMPLEMENTATION_SUMMARY.md` | Technical documentation |
| `ANALYTICS_VALIDATION.md` | Analytics systems overview |

---

## Need Help?

- **Instructions:** `TEST_RUN_INSTRUCTIONS.md`
- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`
- **Analytics Info:** `ANALYTICS_VALIDATION.md`
- **Validation Report:** `VALIDATION_REPORT.txt`

---

**Status:** ✅ Ready for execution  
**Last Updated:** October 30, 2025
