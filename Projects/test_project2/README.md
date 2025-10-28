# Test Project 2 - PIRL Training Ready

**Project Code:** TP2_ITALY_V1  
**Client:** SAIPEM  
**Created:** 2025-10-28  
**Status:** Datasets fetched, awaiting final processing

---

## 📍 PROJECT OVERVIEW

**Area of Interest:** Central Italy  
- **Start Point:** 43.388493°N, 13.514053°E (UTM: 379647.98, 4805029.95)
- **End Point:** 42.898254°N, 13.877811°E (UTM: 408381.01, 4750126.95)
- **Distance:** ~75 km
- **Target CRS:** EPSG:32633 (WGS 84 / UTM zone 33N)

---

## ✅ COMPLETED DATASETS

### Rasters (EPSG:32633)
1. ✅ **Land Cover** - ESA WorldCover 10m (2.2 MB)
2. ✅ **Population** - WorldPop 100m (processed)
3. ✅ **Geohazards** - GEM Seismic Hazard (fetched, needs reproject)
4. ⏳ **DEM** - TINITALY 10m (reprojecting from EPSG:32632)

### Vectors (EPSG:32633)
1. ✅ **AOI Boundary** - Project area polygon
2. ✅ **Water Bodies** - OSM waterways (1,099 features)
3. ✅ **Roads** - OSM roads (46,363 features)
4. ✅ **Railways** - OSM railways (443 features)
5. ✅ **Power Lines** - OSM power (57,274 features) - raw only
6. ✅ **Admin Boundaries** - GADM Level 2 - raw only
7. ✅ **Faults** - INGV DISS database - raw only

---

## ⏳ PENDING TASKS

1. **DEM Reprojection** - Currently processing (52+ minutes elapsed)
   - Source: EPSG:32632 (UTM 32N)
   - Target: EPSG:32633 (UTM 33N)
   - Size: 68 MB → expecting ~50 MB compressed
   
2. **Soil Placeholder** - Will be created from DEM extent
   - Constant value: 50 (moderate capacity)
   - Method: `gdal_calc.py`

3. **Final Reprojections**
   - Geohazards: EPSG:4326 → EPSG:32633
   - Power lines: EPSG:4326 → EPSG:32633  
   - Admin boundaries: EPSG:4326 → EPSG:32633
   - Faults: EPSG:4326 → EPSG:32633

4. **Dataset Validation**
   - CRS verification
   - Extent verification
   - Value range checks
   - NoData handling

5. **PIRL Setup**
   - Create symlinks for expected filenames
   - Validate training config
   - Run data validator
   - Begin training

---

## 📊 DATASET COMPLETENESS

| Required for PIRL | Status | Notes |
|-------------------|--------|-------|
| DEM | ⏳ Processing | TINITALY 10m |
| Land Cover | ✅ Ready | ESA WorldCover 10m |
| Geohazards | ⚠️ Needs reproject | GEM Seismic |
| Soil | ⏳ Pending DEM | Placeholder |
| Population | ✅ Ready | WorldPop 100m |
| Water Bodies | ✅ Ready | OSM waterways |
| Roads | ✅ Ready | OSM roads |
| Railways | ✅ Ready | OSM railways |
| Protected Areas | ⚠️ Optional | Can skip |
| Cadastre | ⚠️ Optional | Can skip |

**Overall:** 60% Complete (6/10 core datasets ready)

---

## 🎯 NEXT ACTIONS

Once DEM reprojection completes:

```bash
# 1. Create soil placeholder
cd /opt/agrs && gdal_calc.py -A /opt/agrs/Projects/test_project2/data/rasters/dem.tif \
  --outfile=/opt/agrs/Projects/test_project2/data/rasters/soil.tif \
  --calc="50" --NoDataValue=0 --co COMPRESS=LZW

# 2. Reproject geohazards
gdalwarp -t_srs EPSG:32633 -r average -co COMPRESS=LZW \
  data/rasters/geohazards.tif data/rasters/geohazards_32633.tif && \
  mv data/rasters/geohazards_32633.tif data/rasters/geohazards.tif

# 3. Validate all datasets
python3 /opt/agrs/python/pirl_training/validate_training_data.py \
  /opt/agrs/Projects/test_project2/PIRL/pirl_training_config.yaml

# 4. Begin PIRL training
cd /opt/agrs/Projects/test_project2/PIRL && \
  source /opt/agrs/python/pirl_venv/bin/activate && \
  python3 /opt/agrs/Projects/test_project/train_pirl_direct.py
```

---

## 📁 DIRECTORY STRUCTURE

```
/opt/agrs/Projects/test_project2/
├── aoi/
│   ├── aoi.kmz
│   ├── start_point.kmz
│   ├── end_point.kmz
│   └── project_aoi.json
├── data/
│   ├── rasters/
│   │   ├── *_raw.tif (original fetched data)
│   │   ├── dem.tif (⏳ processing)
│   │   ├── landcover.tif (✅ ready)
│   │   ├── population.tif (✅ ready)
│   │   ├── geohazards.tif (⚠️ needs reproject)
│   │   └── soil.tif (⏳ pending)
│   └── vectors/
│       ├── *_raw.gpkg (original fetched data)
│       ├── aoi.gpkg (✅ ready)
│       ├── water_bodies.gpkg (✅ ready)
│       ├── roads.gpkg (✅ ready)
│       └── railways.gpkg (✅ ready)
├── PIRL/
│   ├── pirl_training_config.yaml (✅ configured)
│   ├── models/ (for trained models)
│   ├── outputs/ (for training logs)
│   └── logs/
├── project_metadata.json
├── DATASET_INVENTORY.md
└── README.md (this file)
```

---

## 🐛 KNOWN ISSUES

1. **DEM Reprojection Time** - Taking longer than expected (52+ minutes)
   - Large file size (68 MB)
   - High resolution (10m)
   - Bilinear resampling
   - **Action:** Let it complete, monitor with `ps aux | grep gdalwarp`

2. **Protected Areas** - Failed to fetch
   - Natura 2000: Download error
   - EUAP: ArcGIS REST error
   - WDPA: Missing R package dependency
   - **Impact:** Optional dataset, PIRL can train without it

3. **ESA WorldCover Bug (FIXED)**  
   - Was downloading 121 global tiles instead of 1-2 for AOI
   - **Fix Applied:** Corrected tile calculation in `src/app/Tools.cpp`
   - Now correctly downloads only N42E012 tile

---

## 📚 DOCUMENTATION

- **Fetching Protocols:** `/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md`
- **PIRL Plan:** `/opt/agrs/docs/PIRL/PIRL_IMPLEMENTATION_PLAN.md`
- **Dataset Categories:** `/opt/agrs/data/docs/DATASET_CATEGORIES_SUMMARY.md`
- **Project Standards:** `/opt/agrs/docs/Project Instructions/PROJECT_STRUCTURE_STANDARD.md`

---

## ⚡ TRAINING CONFIGURATION

**Model:** PPO (Proximal Policy Optimization)  
**Total Timesteps:** 500,000  
**Parallel Environments:** 8  
**Max Episode Steps:** 5,000  
**Learning Rate:** 0.0003  
**Batch Size:** 256  

**SAIPEM Constraints:**
- Max Slope: 20%
- Min Crossing Angle: 75°
- Hot Bend Angles: [15°, 30°, 45°, 60°, 90°]

**Expected Training Time:** 2-6 hours (CPU)

---

**Status:** Ready for final processing and training once DEM completes  
**Last Updated:** 2025-10-28T04:15:00Z


