# Tier 1 Database Tools - Quick Start Guide

**Last Updated:** 2025-10-10  
**Target Users:** Pipeline route engineers, GIS analysts, project managers

---

## Overview

Four critical database fetch tools now available for pipeline routing projects:

1. **WDPA Protected Areas** - Global protected areas database
2. **Natura 2000** - European protected sites network
3. **OSM Waterways Enhanced** - Rivers, streams, canals with crossing cost data
4. **INGV Seismic Hazard** - Italy seismic hazard maps (WMS issue - see notes)

---

## Prerequisites

### Required Software
```bash
# Check if you have required tools
which curl unzip gdal_translate ogr2ogr python3

# If missing, install (Ubuntu/Debian):
sudo apt-get install curl unzip gdal-bin python3
```

### Optional: R for WDPA Automation
```bash
# Install R
sudo apt-get install r-base

# Install R packages
R
> install.packages(c("wdpar", "sf"))
> quit()
```

---

## Quick Usage Examples

### 1. Fetch Protected Areas (WDPA)

**For Italy:**
```bash
zeus tools wdpa_fetch --country ITA -o wdpa_italy.gpkg
```

**For specific area:**
```bash
zeus tools wdpa_fetch --bbox "12.0,41.5,14.5,43.5" -o wdpa_region.gpkg
```

**Output:**
- File: `wdpa_italy.gpkg`
- Type: Vector (Polygons)
- Attributes: NAME, IUCN_CAT, DESIG, STATUS, AREA_KM2

---

### 2. Fetch Natura 2000 Sites

**For Italy:**
```bash
zeus tools natura2000_fetch --country IT -o natura2000_italy.gpkg
```

**For SAIPEM AOI:**
```bash
zeus tools natura2000_fetch --bbox "12.0,41.5,14.5,43.5" -o natura2000_saipem.gpkg
```

**With custom AOI polygon:**
```bash
zeus tools natura2000_fetch --aoi my_study_area.geojson -o natura2000_filtered.gpkg --overwrite
```

**Output:**
- File: `natura2000_saipem.gpkg`
- Type: Vector (Polygons)
- Attributes: SITECODE, SITENAME, SITETYPE, AREA_HA, COUNTRY
- Note: Downloads ~500 MB on first run

---

### 3. Fetch Enhanced Waterways (OSM)

**By bounding box:**
```bash
zeus tools osm_waterways_fetch --bbox "12.0,41.5,14.5,43.5" -o waterways.gpkg
```

**By AOI:**
```bash
zeus tools osm_waterways_fetch --aoi pipeline_corridor.geojson -o waterways.gpkg --overwrite
```

**Output:**
- File: `waterways.gpkg`
- Type: Vector (LineStrings)
- Attributes:
  - `waterway`: river, stream, canal, drain, ditch
  - `width_m`: Width in meters (parsed or estimated)
  - `width_class`: small, medium, large, major
  - `crossing_cost_cat`: low, medium, high, very_high
  - `name`, `depth`, `seasonal`, `intermittent`, `tunnel`

**Cost Interpretation:**
- **low** = $10K-20K (open cut, stream)
- **medium** = $30K-70K (open cut, small river)
- **high** = $200K-400K (HDD, medium river)
- **very_high** = $800K-1M+ (HDD, major river)

---

### 4. Fetch Seismic Hazard (INGV)

⚠️ **Current Issue:** INGV WMS endpoint returns 404. Implementation is complete but requires service availability.

**When service is available:**
```bash
# Peak Ground Acceleration (default)
zeus tools ingv_seismic_fetch --bbox "12.0,41.5,14.5,43.5" -o seismic_pga.tif

# Spectral Acceleration at 1.0s
zeus tools ingv_seismic_fetch --bbox "12.0,41.5,14.5,43.5" --product sa1.0 -o seismic_sa1.tif

# By AOI
zeus tools ingv_seismic_fetch --aoi study_area.geojson -o seismic.tif
```

**Products:**
- `pga` - Peak Ground Acceleration (g)
- `pgv` - Peak Ground Velocity (cm/s)
- `sa0.2` - Spectral Acceleration at 0.2s (g)
- `sa1.0` - Spectral Acceleration at 1.0s (g)

**Output:**
- File: `seismic_pga.tif`
- Type: Raster (Float32)
- Format: Cloud Optimized GeoTIFF
- Values: PGA in g (gravity units)

**Workaround:** Contact INGV at esse1-gis.mi.ingv.it for current WMS endpoint.

---

## Complete SAIPEM Demo Fetch Script

```bash
#!/bin/bash
# Fetch all Tier 1 data for SAIPEM AOI

BBOX="12.0,41.5,14.5,43.5"
OUTPUT_DIR="./saipem_tier1_data"
mkdir -p $OUTPUT_DIR

echo "=== Fetching Tier 1 Databases for SAIPEM AOI ==="

# 1. Natura 2000 (works immediately)
echo "[1/3] Fetching Natura 2000..."
zeus tools natura2000_fetch --country IT --bbox "$BBOX" \
  -o "$OUTPUT_DIR/natura2000.gpkg" --overwrite

# 2. OSM Waterways (works immediately)
echo "[2/3] Fetching OSM Waterways..."
zeus tools osm_waterways_fetch --bbox "$BBOX" \
  -o "$OUTPUT_DIR/waterways_enhanced.gpkg" --overwrite

# 3. WDPA (requires R)
echo "[3/3] Fetching WDPA Protected Areas..."
if command -v Rscript &> /dev/null; then
    zeus tools wdpa_fetch --country ITA \
      -o "$OUTPUT_DIR/wdpa_italy.gpkg" --overwrite
else
    echo "R not installed. Skipping WDPA (install R + wdpar package)"
fi

# 4. INGV Seismic (currently unavailable)
# echo "[4/4] Fetching INGV Seismic..."
# zeus tools ingv_seismic_fetch --bbox "$BBOX" \
#   -o "$OUTPUT_DIR/seismic_pga.tif" --overwrite

echo "=== Fetch Complete ==="
ls -lh $OUTPUT_DIR/
```

**Save as:** `fetch_tier1_data.sh`  
**Run:** `bash fetch_tier1_data.sh`

---

## Import to ArcGIS Pro

### Vector Data (GPKG)
1. **Catalog Pane** → Right-click **Folders** → **Add Folder Connection**
2. Navigate to output directory
3. Drag `.gpkg` files to map
4. All layers will be automatically imported

### Raster Data (GeoTIFF)
1. **Catalog Pane** → Navigate to `.tif` files
2. Drag to map or right-click → **Add to Current Map**
3. Apply color ramp:
   - Seismic: Red-Yellow-Green (high to low hazard)

### Recommended Symbology

**WDPA Protected Areas:**
- Category: `IUCN_CAT`
- Colors: Red (Ia, Ib, II), Orange (III-IV), Yellow (V-VI)
- Transparency: 50%

**Natura 2000:**
- Category: `SITETYPE`
- SPA: Light blue
- SAC: Light green
- SCI: Light yellow
- Transparency: 50%

**Waterways:**
- Category: `crossing_cost_cat`
- Low: Blue
- Medium: Yellow
- High: Orange
- Very High: Red
- Line Width: Scale by `width_m`

---

## Troubleshooting

### "ERROR: R is not installed"
**Solution:** Install R and wdpar package:
```bash
sudo apt-get install r-base
R -e 'install.packages(c("wdpar", "sf"))'
```

### "Error: Output file exists"
**Solution:** Add `--overwrite` flag:
```bash
zeus tools natura2000_fetch --country IT -o output.gpkg --overwrite
```

### "Overpass API query failed"
**Cause:** Overpass API timeout or rate limit  
**Solution:** Reduce bbox size or try again in a few minutes

### "Failed to download Natura 2000 data from EEA"
**Cause:** Network issue or EEA service down  
**Solution:** Check network connection or try manual download from:
https://www.eea.europa.eu/data-and-maps/data/natura-14

### INGV WMS returns 404
**Status:** Known issue - WMS endpoint changed or unavailable  
**Solution:** Monitoring INGV status. Alternative: Use GEM global seismic data

---

## Performance Tips

### Large Area Downloads
- **Natura 2000:** Downloads full EU dataset (~500 MB) first time, subsequent runs are faster if cached
- **OSM Waterways:** Split large bboxes into tiles to avoid Overpass API timeout (>300s)
- **WDPA:** R download can take 5-10 minutes per country

### Disk Space Requirements
- **Natura 2000:** 500 MB (one-time download)
- **WDPA Italy:** 50-100 MB
- **OSM Waterways:** 5-50 MB (area-dependent)
- **INGV Seismic:** 10-30 MB per product

### Network Requirements
- **Bandwidth:** Minimum 5 Mbps for comfortable downloads
- **Timeout:** Allow up to 10 minutes for large datasets (especially WDPA)

---

## Data Quality Notes

### WDPA
- ✅ **Coverage:** Excellent (270,000+ sites globally)
- ⚠️ **Boundary Accuracy:** Varies by country (some approximate)
- ✅ **Completeness:** Very high for developed countries
- **Recommendation:** Verify boundaries with national authorities for critical projects

### Natura 2000
- ✅ **Coverage:** Complete for EU member states
- ✅ **Boundary Accuracy:** High (official EU data)
- ✅ **Completeness:** Authoritative
- **Recommendation:** Primary source for EU projects

### OSM Waterways
- ⚠️ **Coverage:** Variable (excellent in populated areas)
- ⚠️ **Width Data:** Only ~20-30% of waterways have width tags
- ✅ **Geometry:** Generally high quality
- **Enhancement:** Tool estimates width from waterway type when not tagged
- **Recommendation:** Ground-truth major river crossings

### INGV Seismic
- ✅ **Coverage:** Italy-specific, higher resolution than global datasets
- ✅ **Accuracy:** Based on extensive seismotectonic research
- ✅ **Completeness:** Full Italy coverage including islands
- ⚠️ **Availability:** WMS endpoint currently unavailable
- **Recommendation:** Primary source for Italy seismic design when available

---

## Next Steps

1. **Fetch Data:** Run quick examples above for your AOI
2. **Validate:** Import to ArcGIS Pro and visually inspect
3. **Integrate:** Use data layers in routing engine constraints
4. **Report Issues:** Document any data quality concerns

---

## Support & References

### Documentation
- Full Report: `/opt/agrs/docs/TIER1_TOOLS_IMPLEMENTATION_REPORT.md`
- Research Source: `/opt/agrs/docs/Perplexity/General/Extra DBs.txt`

### Data Providers
- **WDPA:** www.protectedplanet.net
- **Natura 2000:** www.eea.europa.eu
- **OSM:** www.openstreetmap.org
- **INGV:** esse1-gis.mi.ingv.it

### CLI Help
```bash
zeus tools wdpa_fetch --help
zeus tools natura2000_fetch --help
zeus tools osm_waterways_fetch --help
zeus tools ingv_seismic_fetch --help
```

---

**Guide Version:** 1.0  
**Last Updated:** 2025-10-10  
**Status:** ✅ Ready for production use (3/4 tools functional, 1 pending WMS fix)




