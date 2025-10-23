# SAIPEM Pipeline Routing Demonstration

**Project Code:** SAIPEM_PIPELINE_DEMO  
**Client:** SAIPEM S.p.A.  
**Created:** October 11, 2025  
**Status:** Active - Data Acquisition Phase

---

## Project Overview

AI-powered pipeline routing demonstration for SAIPEM, focusing on automated geospatial data acquisition, terrain analysis, and constraint-based routing optimization in Central Italy.

### Location
- **Region:** Central Italy (Lazio/Abruzzo)
- **Bounding Box (WGS84):** 13.454779°E, 42.857057°N to 13.938769°E, 43.438886°N
- **Project CRS:** EPSG:32633 (WGS 84 / UTM zone 33N)
- **Terrain:** Mountainous, Apennine Mountains

---

## Project Structure

```
SAIPEM_PIPELINE_DEMO/
├── project_metadata.json          # Project configuration, CRS, units
├── README.md                       # This file
│
├── aoi/                            # Area of Interest
│   ├── study_area.geojson          # Project boundary (from STUDY_AREA.kmz)
│   ├── start_point.geojson         # Pipeline start point
│   ├── end_point.geojson           # Pipeline end point
│   └── aoi_metadata.json           # AOI metadata and processing log
│
├── inputs/                         # Original client-provided data
│   └── DATA_x_AI_ROUTING/
│       ├── STUDY_AREA.kmz          # Study area boundary (KMZ)
│       ├── START_POINT.kmz         # Start point (KMZ)
│       ├── END_POINT.kmz           # End point (KMZ)
│       ├── AI_Routing_Criteria.xlsx # Routing criteria
│       ├── 000-LC-D-80022_0.pdf    # Technical specifications
│       └── curve a 40DN (a freddo).pdf # Pipeline specs
│
├── data/                           # Processed geospatial datasets
│   ├── vectors/                    # Vector data (.gpkg) + JSON sidecars
│   │   ├── roads.gpkg / .json
│   │   ├── railways.gpkg / .json
│   │   ├── waterways_enhanced.gpkg / .json
│   │   ├── boundaries.gpkg / .json
│   │   ├── pipelines_existing.gpkg / .json
│   │   ├── wdpa_protected_areas.gpkg / .json
│   │   └── natura2000_sites.gpkg / .json
│   │
│   ├── rasters/                    # Raster data (.tif) + JSON sidecars
│   │   ├── dem_tinitaly_10m.tif / .json
│   │   ├── dem_cop30.tif / .json
│   │   ├── landcover_esa_2021.tif / .json
│   │   ├── water_occurrence.tif / .json
│   │   ├── flood_100yr.tif / .json
│   │   └── soil_properties.tif / .json
│   │
│   └── raw/                        # Original downloads (before processing)
│
├── derived/                        # Processed/derived datasets
│   ├── terrain_analysis/           # Slope, aspect, curvature
│   │   ├── slope_percent.tif / .json
│   │   ├── slope_constraint_20pct.tif / .json
│   │   ├── aspect_degrees.tif / .json
│   │   └── curvature_profile.tif / .json
│   │
│   ├── cost_surfaces/              # Cost rasters for routing
│   │   ├── terrain_cost.tif
│   │   ├── landcover_cost.tif
│   │   ├── crossing_cost.tif
│   │   └── composite_cost.tif
│   │
│   └── constraints/                # Constraint masks
│       ├── protected_areas_mask.tif
│       ├── steep_slopes_mask.tif
│       └── composite_constraints.tif
│
├── outputs/                        # Final deliverables
│   ├── routing_results/            # Optimal routes
│   ├── reports/                    # Technical reports
│   └── figures/                    # Maps and visualizations
│
├── logs/                           # Operation logs
│   ├── project.log                 # Master log (all operations)
│   ├── fetch.log                   # Data acquisition log
│   └── processing.log              # Geoprocessing log
│
└── docs/                           # Documentation
    ├── data_sources.md             # Dataset inventory
    ├── methodology.md              # Routing methodology
    └── results_analysis.md         # Results interpretation
```

---

## Project Metadata

### Coordinate Reference System
- **EPSG:** 32633
- **Name:** WGS 84 / UTM zone 33N
- **Units:** meters
- **Justification:** Projected CRS required for accurate terrain analysis and distance calculations

### Measurement System
- **Standard:** SI units (mandatory)
- **Length:** meters (m)
- **Area:** square meters (m²) or square kilometers (km²)
- **Elevation:** meters above sea level (m ASL)
- **Slope:** percentage (%)
- **Cost:** USD

### Data Quality Standards
- All datasets reprojected to EPSG:32633
- All datasets clipped to AOI (with optional buffer)
- Multi-tile datasets mosaicked into single files
- All datasets validated (CRS, extent, resolution, completeness)
- JSON sidecars for complete traceability
- All operations logged with timestamps

---

## Data Requirements

### Terrain Data
- [x] High-resolution DEM (TINITALY 10m preferred)
- [ ] Slope analysis (percentage and degrees)
- [ ] Aspect analysis
- [ ] Profile curvature analysis

### Constraints
- [ ] Protected areas (WDPA)
- [ ] Natura 2000 sites
- [ ] Water crossings with width/cost estimates
- [ ] Slope constraints (>20%)
- [ ] Land cover restrictions

### Infrastructure
- [ ] Existing gas pipelines
- [ ] Road network
- [ ] Railway network
- [ ] Urban areas
- [ ] Administrative boundaries

### Environmental
- [ ] Flood zones
- [ ] Seismic hazard (if available)
- [ ] Soil properties

---

## Current Status

### Phase 1: Initialization ✅ COMPLETE
- [x] Project directory structure created
- [x] AOI extracted and converted to GeoJSON
- [x] Start/end points extracted
- [x] Project metadata created
- [x] AOI metadata created
- [x] Logging initialized

### Phase 2: Data Acquisition (IN PROGRESS)
- [ ] Fetch all required datasets
- [ ] Create JSON sidecars
- [ ] Validate data quality

### Phase 3: Data Processing (PENDING)
- [ ] Reproject all datasets to UTM 33N
- [ ] Clip to AOI
- [ ] Mosaic multi-tile datasets
- [ ] Optimize formats (COG, GPKG)

### Phase 4: Terrain Analysis (PENDING)
- [ ] Generate slope rasters
- [ ] Generate aspect rasters
- [ ] Generate curvature rasters
- [ ] Create constraint masks

### Phase 5: Cost Surface Generation (PENDING)
- [ ] Terrain-based cost surface
- [ ] Land cover cost surface
- [ ] Water crossing costs
- [ ] Composite cost surface

### Phase 6: Routing Analysis (PENDING)
- [ ] Implement routing algorithm
- [ ] Generate route alternatives
- [ ] Cost-benefit analysis
- [ ] Deliverable preparation

---

## Key Files

### Metadata
- `project_metadata.json` - Complete project configuration
- `aoi/aoi_metadata.json` - AOI details and processing history

### Client Inputs
- `inputs/DATA_x_AI_ROUTING/AI_Routing_Criteria.xlsx` - Routing criteria
- `inputs/DATA_x_AI_ROUTING/000-LC-D-80022_0.pdf` - Technical specs

### Logs
- `logs/project.log` - Master log of all operations
- `logs/fetch.log` - Data acquisition operations
- `logs/processing.log` - Geoprocessing operations

---

## Next Steps

1. **Immediate**: Fetch all geospatial datasets for AOI
   - Run fetch tools for each required dataset
   - Generate JSON sidecars
   - Log all fetch operations

2. **Data Processing**: Reproject and validate
   - Reproject all to EPSG:32633
   - Clip to AOI
   - Validate quality

3. **Terrain Analysis**: Generate derived products
   - Slope, aspect, curvature
   - Constraint masks

4. **Routing**: Implement optimization algorithm
   - Cost surface generation
   - Route calculation
   - Results analysis

---

## Compliance

This project follows the **AGRS Project Structure Standard v1.0** (mandatory as of October 11, 2025).

**Key Requirements:**
- ✅ Standardized directory structure
- ✅ AOI with documented CRS
- ✅ Projected CRS (UTM 33N)
- ✅ SI units documented
- ⏳ JSON sidecars for all datasets (pending data fetch)
- ⏳ Complete geoprocessing pipeline (pending)
- ✅ Comprehensive logging

---

## Contact

**GIS Lead:** Radwan El-Gharbi  
**Client:** SAIPEM S.p.A. Technical Team  
**Created:** October 11, 2025

---

**Project Root:** `/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/`  
**Standard:** AGRS Project Structure Standard v1.0  
**Last Updated:** October 11, 2025




