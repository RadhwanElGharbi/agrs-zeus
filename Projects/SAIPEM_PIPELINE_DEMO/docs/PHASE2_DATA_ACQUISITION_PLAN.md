# Phase 2: Data Acquisition Plan

**Project:** SAIPEM_PIPELINE_DEMO  
**Date:** October 12, 2025  
**Status:** IN PROGRESS

---

## Current Status

### ✅ Completed
1. **Copernicus DEM GLO-30 (30m)** - `data/rasters/dem_copernicus_30m.tif`
   - Resolution: 30m
   - Format: Cloud Optimized GeoTIFF
   - CRS: EPSG:32633 (UTM 33N)

---

## Remaining Datasets

### Priority 2: Land Cover & Environment

#### ESA WorldCover (10m) - RECOMMENDED via GEE
```bash
zeus tools gee_tile_export \
  --bbox "13.454779,42.857057,13.938769,43.438886" \
  --asset "ESA/WorldCover/v200" \
  --bands "Map" \
  --scale 10 \
  --crs "EPSG:32633" \
  --output data/rasters/landcover_esa_worldcover_10m.tif
```

#### JRC Global Surface Water - Water Occurrence
```bash
zeus tools jrc_water_fetch \
  --bbox "13.454779,42.857057,13.938769,43.438886" \
  --product occurrence \
  --output data/rasters/water_occurrence_jrc.tif
```

#### JRC Flood Maps - 100-year baseline
```bash
zeus tools jrc_flood_fetch \
  --bbox "13.454779,42.857057,13.938769,43.438886" \
  --product baseline \
  --return-period 100 \
  --output data/rasters/flood_100yr_jrc.tif
```

---

### Priority 3: Infrastructure & Boundaries

#### OSM Roads
```bash
zeus tools osm_roads_fetch \
  --aoi aoi/study_area.geojson \
  --output data/vectors/osm_roads.gpkg
```

#### OSM Railways
```bash
zeus tools osm_railways_fetch \
  --aoi aoi/study_area.geojson \
  --output data/vectors/osm_railways.gpkg
```

#### OSM Waterways (Enhanced with width estimates)
```bash
zeus tools osm_waterways_fetch \
  --aoi aoi/study_area.geojson \
  --output data/vectors/osm_waterways.gpkg
```

#### OSM Buildings
```bash
zeus tools osm_buildings_fetch \
  --aoi aoi/study_area.geojson \
  --output data/vectors/osm_buildings.gpkg
```

#### OSM Power Lines
```bash
zeus tools osm_power_fetch \
  --aoi aoi/study_area.geojson \
  --output data/vectors/osm_power.gpkg
```

#### GADM Administrative Boundaries
```bash
zeus tools gadm_fetch \
  --country ITA \
  --output data/vectors/gadm_italy.gpkg
```

---

### Priority 4: Protected Areas & Constraints

#### WDPA Protected Areas
**Status:** Requires manual download OR R-based automated fetch  
**Command:**
```bash
zeus tools wdpa_fetch \
  --aoi aoi/study_area.geojson \
  --output data/vectors/wdpa_protected_areas.gpkg
```
**Note:** May require R installation and `wdpar` package

#### Natura 2000 Sites
**Status:** May require manual download  
**Command:**
```bash
zeus tools natura2000_fetch \
  --aoi aoi/study_area.geojson \
  --output data/vectors/natura2000.gpkg
```

---

### Priority 5: Hazards & Risks

#### INGV Seismic Hazard
**Status:** Requires WMS endpoint verification  
**Note:** INGV WMS endpoint may be down. Alternative: Use GEM Global Seismic Hazard or manual download from INGV

---

### Priority 6: Population

#### WorldPop Population Density
```bash
zeus tools worldpop_fetch \
  --country ITA \
  --year 2020 \
  --output data/rasters/population_worldpop.tif
```

---

## Quick Fetch Script

Create `/tmp/quick_fetch_saipem.sh`:

```bash
#!/bin/bash
PROJECT="/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO"
BBOX="13.454779,42.857057,13.938769,43.438886"
AOI="$PROJECT/aoi/study_area.geojson"
ZEUS="/opt/agrs/build/zeus"
cd "$PROJECT"

echo "=== Fetching Critical Datasets ==="

# Land Cover via GEE (much faster than direct download)
echo "1/8: ESA WorldCover..."
$ZEUS tools gee_tile_export --bbox "$BBOX" --asset "ESA/WorldCover/v200" --bands "Map" --scale 10 --crs "EPSG:32633" -o data/rasters/landcover_esa_10m.tif

# Water & Flood
echo "2/8: JRC Water Occurrence..."
$ZEUS tools jrc_water_fetch --bbox "$BBOX" --product occurrence -o data/rasters/water_occurrence.tif

echo "3/8: JRC Flood 100yr..."
$ZEUS tools jrc_flood_fetch --bbox "$BBOX" --product baseline --return-period 100 -o data/rasters/flood_100yr.tif

# OSM Infrastructure
echo "4/8: OSM Roads..."
$ZEUS tools osm_roads_fetch --aoi "$AOI" -o data/vectors/osm_roads.gpkg

echo "5/8: OSM Railways..."
$ZEUS tools osm_railways_fetch --aoi "$AOI" -o data/vectors/osm_railways.gpkg

echo "6/8: OSM Waterways..."
$ZEUS tools osm_waterways_fetch --aoi "$AOI" -o data/vectors/osm_waterways.gpkg

# Administrative Boundaries
echo "7/8: GADM Italy..."
$ZEUS tools gadm_fetch --country ITA -o data/vectors/gadm_italy.gpkg

# Population
echo "8/8: WorldPop..."
$ZEUS tools worldpop_fetch --country ITA --year 2020 -o data/rasters/population_worldpop.tif

echo "=== Critical datasets complete ==="
```

---

## Data Processing Requirements (Phase 3)

After fetching, all datasets must be:
1. **Reprojected** to EPSG:32633 (UTM 33N) if not already
2. **Clipped** to project AOI
3. **Validated** (CRS, extent, resolution, completeness)
4. **Documented** with JSON sidecars

Example processing workflow:
```bash
# Reproject and clip raster to AOI
gdalwarp -t_srs EPSG:32633 \
  -cutline aoi/study_area.geojson -crop_to_cutline \
  -co COMPRESS=LZW -co TILED=YES \
  data/raw/input.tif data/rasters/output.tif

# Reproject and clip vector to AOI
ogr2ogr -t_srs EPSG:32633 \
  -clipsrc aoi/study_area.geojson \
  data/vectors/output.gpkg \
  data/raw/input.gpkg
```

---

## Estimated Timeline

| Dataset Category | Time Estimate |
|-----------------|---------------|
| Terrain (DEM) | ✅ Complete (~2 min) |
| Land Cover (GEE) | ~3-5 minutes |
| Water & Flood | ~5-10 minutes |
| OSM Infrastructure | ~10-15 minutes (5 datasets) |
| Admin Boundaries | ~2 minutes |
| Population | ~5 minutes |
| **Total Fetch Time** | **~30-40 minutes** |
| Processing & Validation | ~20-30 minutes |
| **Total Phase 2** | **~1 hour** |

---

## Alternative: Pre-integrated Approach

For faster results, consider fetching and immediately clipping/reprojecting in one step using custom scripts that combine fetch + process operations.

---

## Notes

- **GEE exports** are significantly faster than direct tile downloads
- **OSM queries** may timeout for very large areas - consider splitting into smaller tiles if needed
- **Protected areas** (WDPA, Natura2000) may require manual intervention
- **Seismic hazard** data availability depends on INGV WMS status

---

**Last Updated:** October 12, 2025  
**Next Step:** Execute quick fetch script or manual step-by-step fetching






