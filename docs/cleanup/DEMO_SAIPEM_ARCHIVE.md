# docs/DEMO-SAIPEM Archive Note

**Deleted:** 2025-10-15  
**Location:** `/opt/agrs/docs/DEMO-SAIPEM`  
**Estimated Size:** ~3.2 GB  
**Purpose:** SAIPEM pipeline demo artifacts, validation outputs, and bundled third-party datasets used during Phase 1/2 development and demos.

---

## Contents Summary

### Output Directory (`Output/`)
- `SAIPEM_ALL.gpkg` (~177 MB) - Consolidated GeoPackage with all project layers
- Validation JSON sidecars for all fetched datasets
- Shell scripts for data packaging and validation
- Terrain analysis outputs (slope, aspect, curvature from TINITALY and Copernicus DEMs)
- Data source inventory and integration documentation

### Databases Directory (`DBs/`)
- **Natura 2000 Dataset** (~2.38 GB total):
  - `Geo package/Natura2000_end2023.gpkg` (~1.33 GB)
  - `SHP files/Natura2000_end2023_epsg3035.shp` (~1.05 GB)
  - Downloaded from EEA (European Environment Agency)
  - Used for protected areas constraint layer

### Documentation
- `DATA_READINESS_ANALYSIS.md` - Phase 2 data readiness assessment
- `SAIPEM_GAP_ANALYSIS.md` - Gap analysis for missing datasets
- Integration and validation reports

---

## Reproducibility

### Canonical Data Location
All SAIPEM project datasets are maintained in:
```
/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/data/
├── rasters/          # All raster datasets with JSON sidecars
├── vectors/          # All vector datasets with JSON sidecars
└── SAIPEM_AOI_Complete_Data_Package/  # Packaged for ArcGIS validation
```

### Fetch Tools
All datasets can be regenerated using implemented fetch tools:

```bash
# DEM
zeus tools tinitaly_fetch --aoi AOI.geojson -o tinitaly_10m.tif
zeus tools copernicus_dem_fetch --aoi AOI.geojson -o dem_30m.tif --product cop30

# Land Cover
zeus tools esa_worldcover_fetch --aoi AOI.geojson -o landcover.tif --year 2021

# Population
zeus tools worldpop_fetch --aoi AOI.geojson -o population.tif --year 2020

# Water
zeus tools gsw_fetch --aoi AOI.geojson -o water.tif --product occurrence

# Protected Areas
zeus tools wdpa_fetch --aoi AOI.geojson -o protected_areas.gpkg

# Administrative Boundaries
zeus tools gadm_fetch --aoi AOI.geojson -o boundaries.gpkg

# Infrastructure
zeus tools osm_fetch --aoi AOI.geojson -o roads.gpkg --feature roads
zeus tools osm_fetch --aoi AOI.geojson -o railways.gpkg --feature railways
zeus tools osm_fetch --aoi AOI.geojson -o waterways.gpkg --feature waterways
zeus tools osm_power_fetch --aoi AOI.geojson -o power_lines.gpkg
zeus tools scigrid_gas_fetch --aoi AOI.geojson -o pipelines.gpkg

# Hazards
zeus tools gem_seismic_fetch --aoi AOI.geojson -o seismic.tif
zeus tools jrc_flood_fetch --aoi AOI.geojson -o flood.tif --return-period 100

# Soil
zeus tools soilgrids_fetch --aoi AOI.geojson -o soil.tif \
  --properties bdod,cec,cfvo,clay --depth 0-5cm
```

### DEM Analysis
```bash
# Terrain analysis validated on SAIPEM data
zeus tools raster_slope tinitaly_10m.tif slope.tif --percent
zeus tools raster_aspect tinitaly_10m.tif aspect.tif --zero-for-flat
zeus tools raster_curvature tinitaly_10m.tif curvature.tif --type profile
zeus tools raster_threshold slope.tif constraint.tif --threshold 20 --above 1 --below 0
```

### Data Package Creation
To recreate the complete data package:
```bash
cd /opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/data
zip -r SAIPEM_AOI_Complete_Data_Package.zip \
  SAIPEM_AOI_Complete_Data_Package/ \
  -i "*.tif" "*.gpkg" "*.json" "*.md"
```

---

## Key Datasets Archived

| Dataset | Type | Source | Fetch Tool | Size (approx) |
|---------|------|--------|------------|---------------|
| TINITALY 10m DEM | Raster | INGV | `tinitaly_fetch` | ~100 MB |
| Copernicus 30m DEM | Raster | ESA | `copernicus_dem_fetch` | ~50 MB |
| ESA WorldCover 10m | Raster | ESA | `esa_worldcover_fetch` | ~200 MB |
| WorldPop 2020 | Raster | WorldPop | `worldpop_fetch` | ~10 MB |
| JRC Water Occurrence | Raster | JRC | `gsw_fetch` | ~20 MB |
| JRC Flood 100yr | Raster | JRC | `jrc_flood_fetch` | ~15 MB |
| GEM Seismic PGA | Raster | GEM | `gem_seismic_fetch` | ~10 MB |
| SoilGrids 4-band | Raster | ISRIC | `soilgrids_fetch` | ~50 MB |
| Natura 2000 | Vector | EEA | Manual download | ~2.4 GB |
| WDPA Protected Areas | Vector | UNEP-WCMC | `wdpa_fetch` | ~50 MB |
| GADM Boundaries | Vector | GADM | `gadm_fetch` | ~5 MB |
| OSM Roads | Vector | OSM | `osm_fetch` | ~30 MB |
| OSM Railways | Vector | OSM | `osm_fetch` | ~10 MB |
| OSM Waterways | Vector | OSM | `osm_fetch` | ~5 MB |
| OSM Power Lines | Vector | OSM | `osm_power_fetch` | ~20 MB |
| SciGRID Gas Pipelines | Vector | SciGRID | `scigrid_gas_fetch` | ~5 MB |

---

## References

### Project Documentation
- `Projects/SAIPEM_PIPELINE_DEMO/docs/PHASE2_COMPLETION_SUMMARY.md`
- `Projects/SAIPEM_PIPELINE_DEMO/docs/DATA_ACQUISITION_COMPREHENSIVE_REPORT.md`
- `Projects/SAIPEM_PIPELINE_DEMO/docs/PHASE3_TOOL_IMPLEMENTATION_PLAN.md`

### Tool Documentation
- `docs/TOOLS_DOCUMENTATION_COMPLETE.md` - All fetch tools documented
- `docs/DEM_ANALYSIS_TOOLS.md` - DEM tool usage and validation
- `docs/DATASETS.md` - Dataset catalog

### Implementation
- `src/app/Tools.cpp` - All fetch tools implemented
- `include/agrs_zeus/Tools.h` - Tool declarations

---

## Rationale for Deletion

1. **Misplaced Location:** Large binary datasets (3.2 GB) should not live under `docs/`
2. **Data Redundancy:** All datasets duplicated in `Projects/SAIPEM_PIPELINE_DEMO/data/`
3. **Reproducibility:** All fetch tools implemented and documented
4. **Space Recovery:** Reclaim 3.2 GB from docs directory
5. **Best Practices:** Separation of documentation and data
6. **Third-Party Data:** Natura 2000 can be re-downloaded from EEA if needed

### Natura 2000 Re-download
If needed, download from:
- Source: https://www.eea.europa.eu/en/datahub/datahubitem-view/3f62d4c6-c3e5-4c46-9b7b-894e4f4e6474
- Dataset: `Natura 2000 - Spatial data (end 2023)`
- Format: GeoPackage or Shapefile (EPSG:3035)
- Process: Clip to Italy/AOI using `ogr2ogr`

---

## Validation Summary

**Phase 1 Completion:** 2025-10-12  
**Phase 2 Completion:** 2025-10-13  
**Total Datasets:** 17 (7 rasters, 8 vectors, AOI, metadata)  
**Data Package:** Created and validated in ArcGIS  
**Tools Status:** All fetch tools production-ready

**Approved for deletion:** 2025-10-15  
**No data loss:** All content reproducible via documented tools and canonical project location





