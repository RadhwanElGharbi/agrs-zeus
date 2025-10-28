# Test Project 2 - Dataset Summary

**Date:** 2025-10-28  
**CRS:** EPSG:32633 (WGS 84 / UTM Zone 33N)  
**AOI:** Central Italy (Abruzzo region)  
**Status:** ✅ Ready for PIRL Training

---

## Processed Datasets

### Rasters

| Dataset | Resolution | Format | CRS | NoData | File |
|---------|-----------|--------|-----|--------|------|
| DEM (TINITALY) | 10m | GeoTIFF | EPSG:32633 | -9999 | `dem_epsg32633_processed.tif` |
| Land Cover (ESA WorldCover) | 10m | GeoTIFF | EPSG:32633 | 0 | `landcover_epsg32633_processed.tif` |
| Population (WorldPop 2020) | 100m | GeoTIFF | EPSG:32633 | -99999 | `population_epsg32633_processed.tif` |
| Geohazards (GEM Seismic PGA) | 1000m | GeoTIFF | EPSG:32633 | 0 | `geohazards_epsg32633_processed.tif` |
| Soil (Constant) | 10m | GeoTIFF | EPSG:32633 | 0 | `soil_epsg32633_processed.tif` |

### Vectors

| Dataset | Features | Format | CRS | File |
|---------|----------|--------|-----|------|
| OSM Roads | 46,363 | GeoPackage | EPSG:32633 | `osm_roads_epsg32633_processed.gpkg` |
| OSM Railways | 443 | GeoPackage | EPSG:32633 | `osm_railways_epsg32633_processed.gpkg` |
| OSM Waterways | 1,099 | GeoPackage | EPSG:32633 | `osm_waterways_epsg32633_processed.gpkg` |
| OSM Power Lines | - | GeoPackage | EPSG:32633 | `osm_power_lines_epsg32633_processed.gpkg` |
| GADM Admin Boundaries (L2) | - | GeoPackage | EPSG:32633 | `admin_boundaries_epsg32633_processed.gpkg` |
| INGV Faults | - | GeoPackage | EPSG:32633 | `faults_epsg32633_processed.gpkg` |

---

## Symlinks for PIRL

PIRL-expected filenames are symlinked to processed datasets:

```
data/rasters/dem.tif → dem_epsg32633_processed.tif
data/rasters/landcover.tif → landcover_epsg32633_processed.tif
data/rasters/population.tif → population_epsg32633_processed.tif
data/rasters/geohazards.tif → geohazards_epsg32633_processed.tif
data/rasters/soil.tif → soil_epsg32633_processed.tif
data/vectors/roads.gpkg → osm_roads_epsg32633_processed.gpkg
data/vectors/railways.gpkg → osm_railways_epsg32633_processed.gpkg
data/vectors/waterways.gpkg → osm_waterways_epsg32633_processed.gpkg
data/vectors/power_lines.gpkg → osm_power_lines_epsg32633_processed.gpkg
```

---

## Validation Results

✅ **All critical datasets validated successfully**

- DEM: 10m resolution, EPSG:32633, elevation range 0.001–1101.06m
- Land Cover: 10m resolution, ESA WorldCover classes 10–90
- Population: 100m resolution, 0–207.76 persons/pixel
- Geohazards: 1000m resolution, PGA values 0.15–0.22g
- Soil: Constant value (placeholder for training)
- All vectors: Reprojected to EPSG:32633 with spatial indexes

⚠️ **Warnings:**
- Protected areas layer missing (optional)
- Slope will be derived from DEM on-the-fly (preferred method)

---

## Raw Data Preservation

All raw datasets are preserved with original CRS and extent:

```
data/rasters/*_raw.tif (with metadata JSONs)
data/vectors/*_raw.gpkg (with metadata JSONs)
```

---

## Processing Operations Applied

1. **Reprojection:** All datasets reprojected from native CRS to EPSG:32633
2. **Resampling:** 
   - DEM: bilinear
   - Land Cover: nearest neighbor (categorical)
   - Population: average (density preservation)
   - Geohazards: bilinear
3. **Compression:** DEFLATE compression applied to all rasters
4. **Tiling:** Tiled GeoTIFFs for efficient access
5. **Spatial Indexing:** All vectors have spatial indexes

---

## Next Steps

1. ✅ Datasets ready for PIRL training
2. Run: `cd PIRL && python3 /opt/agrs/python/pirl_training/train_pirl_direct.py pirl_training_config.yaml`
3. Monitor training progress in TensorBoard
4. Generate optimized route using trained model

---

**Generated:** 2025-10-28T05:45:00Z  
**Validation Report:** `PIRL/validation_report.json`
