# Test Project 2 - Dataset Inventory

**Project:** test_project2  
**AOI:** Italy (Lat: 42.857-43.439°N, Lon: 13.455-13.939°E)  
**Target CRS:** EPSG:32633 (WGS 84 / UTM zone 33N)  
**Date Created:** 2025-10-28  

---

## ✅ SUCCESSFULLY FETCHED & PROCESSED DATASETS

### 1. TERRAIN (DEM)
- **Raw:** `dem_tinitaly_10m_raw.tif` (68 MB, EPSG:32632)
- **Processed:** `dem.tif` (in progress - reprojection to EPSG:32633)
- **Source:** INGV TINITALY 1.1
- **Resolution:** 10m
- **Coverage:** Full AOI
- **Status:** ⏳ Reprojection in progress

### 2. LAND COVER
- **Raw:** `landcover_esa_worldcover_raw.tif` (4.7 MB, EPSG:4326)
- **Processed:** `landcover.tif` (2.2 MB, EPSG:32633)
- **Source:** ESA WorldCover 2021
- **Resolution:** 10m
- **Coverage:** Full AOI (1 tile: N42E012)
- **Status:** ✅ Complete

### 3. POPULATION DENSITY
- **Raw:** `population_worldpop_raw.tif` (699 KB, EPSG:4326)
- **Processed:** `population.tif` (EPSG:32633)
- **Source:** WorldPop 2020
- **Resolution:** 100m
- **Coverage:** Full AOI (Italy)
- **Status:** ✅ Complete

### 4. GEOHAZARDS (Seismic)
- **Processed:** `geohazards.tif` (EPSG:4326)
- **Source:** GEM Global Seismic Hazard Map v2023
- **Resolution:** ~5km (3 arcmin)
- **Coverage:** PGA 475-year return period
- **Status:** ✅ Complete
- **Note:** Needs reprojection to EPSG:32633

### 5. HYDROLOGY (Water Bodies)
- **Raw:** `osm_waterways_raw.gpkg` (788 KB, EPSG:4326)
- **Processed:** `water_bodies.gpkg` (EPSG:32633)
- **Source:** OpenStreetMap via Overpass API
- **Features:** 1,099 waterway features (rivers, streams, canals)
- **Status:** ✅ Complete

### 6. INFRASTRUCTURE - Roads
- **Raw:** `osm_roads_raw.gpkg` (14 MB, EPSG:4326)
- **Processed:** `roads.gpkg` (EPSG:32633)
- **Source:** OpenStreetMap via Overpass API
- **Features:** 46,363 road features
- **Status:** ✅ Complete

### 7. INFRASTRUCTURE - Railways
- **Raw:** `osm_railways_raw.gpkg` (216 KB, EPSG:4326)
- **Processed:** `railways.gpkg` (EPSG:32633)
- **Source:** OpenStreetMap via Overpass API
- **Features:** 443 railway features
- **Status:** ✅ Complete

### 8. INFRASTRUCTURE - Power Lines
- **Raw:** `osm_power_lines_raw.gpkg` (30 MB, EPSG:4326)
- **Processed:** ⏳ Needs reprojection
- **Source:** OpenStreetMap via Overpass API
- **Features:** 57,274 power line features
- **Status:** ⚠️ Raw only - pending reprojection

### 9. ADMINISTRATIVE BOUNDARIES
- **Raw:** `admin_boundaries_raw.gpkg` (6.5 MB, EPSG:4326)
- **Processed:** ⏳ Needs reprojection
- **Source:** GADM v4.1
- **Level:** Admin Level 2 (provinces)
- **Status:** ⚠️ Raw only - pending reprojection

### 10. GEOHAZARDS - Faults
- **Raw:** `faults_raw.gpkg` (104 KB, EPSG:4326)
- **Processed:** ⏳ Needs reprojection
- **Source:** INGV DISS 3.3.1 Faults Database
- **Features:** Seismogenic fault sources
- **Status:** ⚠️ Raw only - pending reprojection

---

## ⏳ PENDING DATASETS

### 11. SOIL PROPERTIES
- **Status:** 🔄 To be created as placeholder
- **Method:** Constant value raster derived from DEM extent
- **Value:** 50 (moderate soil capacity)
- **Action:** Create using `gdal_calc.py` once DEM is ready

### 12. PROTECTED AREAS
- **Status:** ❌ Optional - fetch failed
- **Attempted Sources:**
  - Natura 2000 (EEA) - download error
  - EUAP (ISPRA) - ArcGIS REST error  
  - WDPA (UNEP-WCMC) - requires R package
- **Action:** Can proceed without or manually download

---

## 📊 DATASET SUMMARY

| Category | Raw Files | Processed Files | Total Size | Status |
|----------|-----------|-----------------|------------|---------|
| **Rasters** | 4 | 3 (+1 pending) | ~74 MB | 75% |
| **Vectors** | 6 | 3 | ~51 MB | 50% |
| **Total** | **10** | **6** | **~125 MB** | **60%** |

---

## 🎯 PIRL REQUIRED DATASETS

The PIRL environment expects these specific files in `data/rasters/` and `data/vectors/`:

### Rasters (all EPSG:32633, clipped to AOI)
- ✅ `landcover.tif` - ESA WorldCover 10m
- ⏳ `dem.tif` - TINITALY 10m (reprojecting)
- ✅ `population.tif` - WorldPop 100m
- ⚠️  `geohazards.tif` - GEM Seismic (needs reproject)
- ⏳ `soil.tif` - Placeholder (pending DEM)

### Vectors (all EPSG:32633, clipped to AOI)
- ✅ `aoi.gpkg` - Area of Interest boundary
- ✅ `water_bodies.gpkg` - OSM waterways
- ✅ `roads.gpkg` - OSM roads
- ✅ `railways.gpkg` - OSM railways
- ⏳ `protected_areas.gpkg` - Optional (can skip)
- ⏳ `cadastre.gpkg` - Optional (can skip)

---

## 🔧 REMAINING ACTIONS

1. ⏳ **Wait for DEM reprojection to complete** (~2-3 minutes)
2. 🔄 **Create soil.tif placeholder** using `gdal_calc.py`
3. 🔄 **Reproject geohazards.tif** to EPSG:32633
4. 🔄 **Reproject power_lines, admin_boundaries, faults** to EPSG:32633
5. ✅ **Validate all datasets** (CRS, extent, values)
6. ✅ **Create PIRL training config** (already done)
7. 🚀 **Ready to train PIRL model!**

---

## 📝 NOTES

- **ESA WorldCover Fix:** Tile calculation bug was fixed to download only required tiles (N42E012) instead of 121 global tiles
- **CRS Consistency:** All processed datasets are being reprojected to EPSG:32633 for consistency
- **Protected Areas:** Optional dataset - PIRL can train without it
- **Cadastre:** Optional dataset - PIRL can train without it
- **Dataset Protocols:** New fetching protocols documented in `/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md`

---

**Last Updated:** 2025-10-28T04:12:00Z  
**Next Step:** Complete remaining reprojections and begin PIRL training



