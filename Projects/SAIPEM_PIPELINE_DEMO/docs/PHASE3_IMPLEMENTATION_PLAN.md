# Phase 3: Implementation Plan & Analysis

**Project**: SAIPEM_PIPELINE_DEMO  
**Phase**: 3 - Constraint Layer Development  
**Date**: October 12, 2025  
**Status**: Planning Complete, Ready for Implementation

---

## Executive Summary

Based on comprehensive Perplexity AI research and analysis of project requirements, Phase 3 will develop a 4-tier constraint classification system to transform raw geospatial data into actionable routing constraints. This plan provides specific thresholds, processing steps, and technical parameters ready for direct implementation.

---

## Perplexity AI Guidance Analysis

### ✅ Strengths of Perplexity Response
1. **Highly Detailed & Practical**: Specific numeric thresholds, buffer distances, and cost weights
2. **Industry-Aligned**: References ISO 13623:2019, Italian Building Code NTC 2018, Eurocode 8
3. **Regulatory Compliant**: Covers EU VIA, Natura 2000, MIBACT archaeological requirements
4. **Technically Sound**: Appropriate GDAL tools, processing workflow, validation steps
5. **Comprehensive Coverage**: Addressed all 10 questions with actionable guidance

### ⚠️ Areas Requiring Adaptation
1. **Archaeological Sites**: We don't have this dataset (would need manual research or MIBACT data)
2. **Landslide Data**: Confirmed we'll use slope analysis as proxy (already planned)
3. **Cost Weighting**: Suggests iterative tuning with stakeholders (we'll use baseline values)
4. **UTM Zone Selection**: Need to determine if EPSG:32632 or 32633 based on AOI longitude

### 💡 Key Insights from Perplexity
1. **4-Tier System is Standard**: No-Go/High-Cost/Moderate-Cost/Preferred is industry practice
2. **Horn's Algorithm for Slope**: Correct choice for 10m DEM (we already have this tool)
3. **Weighted Overlay is Primary Method**: Straightforward and GDAL-compatible
4. **Separate Technical & Environmental Surfaces**: Can be combined later with stakeholder weights
5. **ISO 13623:2019 is Key Standard**: Pipeline transportation systems reference

---

## Phase 3 Detailed Implementation Plan

### Step 1: Preprocessing & Standardization (1-2 hours)

#### 1.1 Determine Target CRS
```
AOI Center Longitude: ~13.7°E
→ Use EPSG:32633 (UTM Zone 33N)
→ Rationale: 13.7°E falls in UTM Zone 33N (12°E - 18°E)
```

#### 1.2 Reproject All Datasets
- **Input CRS**: EPSG:4326 (all current data)
- **Target CRS**: EPSG:32633 (UTM Zone 33N)
- **Target Resolution**: 10m (consistent with DEM and WorldCover)
- **Resampling Method**: 
  - Rasters: Bilinear for continuous (DEM), Nearest Neighbor for categorical (land cover)
  - Vectors: Direct reprojection

**Datasets to Reproject**:
1. ✅ TINITALY DEM 10m → dem_utm33n.tif
2. ✅ ESA WorldCover 10m → landcover_utm33n.tif
3. ✅ JRC Surface Water → water_utm33n.tif
4. ✅ WRI Flood Hazard → flood_utm33n.tif
5. ✅ Seismic Hazard PGA → seismic_utm33n.tif
6. ✅ WorldPop Density → population_utm33n.tif
7. ✅ Natura 2000 Sites → natura2000_utm33n.gpkg
8. ✅ GADM Boundaries → boundaries_utm33n.gpkg
9. ✅ OSM Roads → roads_utm33n.gpkg
10. ✅ OSM Railways → railways_utm33n.gpkg
11. ✅ OSM Waterways → waterways_utm33n.gpkg
12. ✅ SciGRID Pipelines → pipelines_utm33n.gpkg

**Tool**: `gdalwarp` for rasters, `ogr2ogr` for vectors

---

### Step 2: Terrain Analysis (1 hour)

#### 2.1 Slope Calculation
```bash
gdaldem slope dem_utm33n.tif slope_degrees.tif -compute_edges -of COG
```
- **Algorithm**: Horn's (default in gdaldem)
- **Output**: Slope in degrees (0-90°)
- **Resolution**: 10m

#### 2.2 Slope Classification
Using Perplexity thresholds:
```
No-Go: > 35°
High-Cost: 20-35°
Moderate-Cost: 10-20°
Preferred: < 10°
```

**Implementation**:
```bash
gdal_calc.py -A slope_degrees.tif --outfile=slope_constraint.tif \
  --calc="9999*(A>35) + 10*(logical_and(A>=20,A<=35)) + 3*(logical_and(A>=10,A<20)) + 1*(A<10)" \
  --NoDataValue=0 --type=Float32 --co COMPRESS=LZW --co BIGTIFF=YES
```

Where:
- 9999 = No-Go (essentially infinite cost)
- 10 = High-Cost
- 3 = Moderate-Cost
- 1 = Preferred

#### 2.3 Aspect (Optional Enhancement)
```bash
gdaldem aspect dem_utm33n.tif aspect.tif -compute_edges -of COG
```
- Can be used to identify north-facing slopes (more erosion prone in Italy)
- Defer to Phase 4 if time-constrained

#### 2.4 Curvature (Optional Enhancement)
- Use our existing `raster_curvature` tool
- Identify convex (unstable) vs concave (water accumulation) slopes
- Defer to Phase 4 if time-constrained

---

### Step 3: Seismic Constraint (30 minutes)

#### 3.1 Classify PGA Values
Using Perplexity thresholds:
```
No-Go: PGA > 0.4g
High-Cost: 0.25g - 0.4g
Moderate-Cost: 0.1g - 0.25g
Preferred: < 0.1g
```

**Implementation**:
```bash
gdal_calc.py -A seismic_utm33n.tif --outfile=seismic_constraint.tif \
  --calc="9999*(A>0.4) + 10*(logical_and(A>=0.25,A<=0.4)) + 3*(logical_and(A>=0.1,A<0.25)) + 1*(A<0.1)" \
  --NoDataValue=0 --type=Float32 --co COMPRESS=LZW
```

**Note**: Check actual PGA value range in our data first to confirm units

---

### Step 4: Land Cover Constraint (30 minutes)

#### 4.1 ESA WorldCover Classification
ESA WorldCover classes to constraint mapping:

| ESA Class | Class Name | Constraint | Cost |
|-----------|------------|------------|------|
| 10 | Tree cover | High-Cost | 10 |
| 20 | Shrubland | Moderate-Cost | 3 |
| 30 | Grassland | Moderate-Cost | 3 |
| 40 | Cropland | Moderate-Cost | 3 |
| 50 | Built-up | No-Go | 9999 |
| 60 | Bare/sparse vegetation | Preferred | 1 |
| 70 | Snow and ice | No-Go | 9999 |
| 80 | Permanent water bodies | No-Go | 9999 |
| 90 | Herbaceous wetland | High-Cost | 10 |
| 95 | Mangroves | High-Cost | 10 |
| 100 | Moss and lichen | Moderate-Cost | 3 |

**Implementation**:
```bash
gdal_calc.py -A landcover_utm33n.tif --outfile=landcover_constraint.tif \
  --calc="9999*logical_or(logical_or(A==50,A==70),A==80) + 10*logical_or(logical_or(A==10,A==90),A==95) + 3*logical_or(logical_or(logical_or(A==20,A==30),A==40),A==100) + 1*(A==60)" \
  --NoDataValue=0 --type=Float32 --co COMPRESS=LZW
```

---

### Step 5: Water Body Buffers (45 minutes)

#### 5.1 JRC Water Occurrence Processing
- **Threshold**: Water occurrence > 50% = permanent water
- **Buffer**: 50m from permanent water bodies

**Implementation**:
```bash
# 1. Threshold water occurrence
gdal_calc.py -A water_utm33n.tif --outfile=water_permanent.tif \
  --calc="1*(A>50)" --NoDataValue=0 --type=Byte

# 2. Vectorize water bodies
gdal_polygonize.py water_permanent.tif -f GPKG water_bodies.gpkg

# 3. Create 50m buffer
ogr2ogr -f GPKG water_buffers.gpkg water_bodies.gpkg -dialect sqlite \
  -sql "SELECT ST_Buffer(geometry, 50) as geometry FROM water_bodies"

# 4. Rasterize buffer as High-Cost zone
gdal_rasterize -burn 10 -tr 10 10 -a_nodata 0 -ot Float32 -of COG \
  -te <extent> water_buffers.gpkg water_buffer_constraint.tif
```

#### 5.2 OSM Waterways Buffer
- **Buffer**: 30m from rivers/streams
- **Process**: Similar to above using `waterways_utm33n.gpkg`

---

### Step 6: Protected Area Buffers (45 minutes)

#### 6.1 Natura 2000 Core + Buffer
- **Core Zone**: Absolute No-Go (9999)
- **Buffer Zone**: 200m High-Cost (10)

**Implementation**:
```bash
# 1. Core zone (No-Go)
gdal_rasterize -burn 9999 -tr 10 10 -a_nodata 0 -ot Float32 -of COG \
  -te <extent> natura2000_utm33n.gpkg natura2000_core.tif

# 2. Create 200m buffer
ogr2ogr -f GPKG natura2000_buffer.gpkg natura2000_utm33n.gpkg -dialect sqlite \
  -sql "SELECT ST_Buffer(geometry, 200) as geometry FROM natura2000"

# 3. Rasterize buffer
gdal_rasterize -burn 10 -tr 10 10 -a_nodata 0 -ot Float32 -of COG \
  -te <extent> natura2000_buffer.gpkg natura2000_buffer.tif

# 4. Combine (core overrides buffer)
gdal_calc.py -A natura2000_core.tif -B natura2000_buffer.tif \
  --outfile=natura2000_constraint.tif \
  --calc="numpy.maximum(A, B)" --NoDataValue=0 --type=Float32 --co COMPRESS=LZW
```

---

### Step 7: Infrastructure Buffers (45 minutes)

#### 7.1 Existing Pipelines
- **Buffer**: 30m avoidance zone (High-Cost)
- **Rationale**: Minimize crossing conflicts

#### 7.2 Roads
- **Buffer**: 10m buffer
- **Type**: Moderate-Cost (road crossings require permits but are manageable)

#### 7.3 Railways
- **Buffer**: 30m buffer  
- **Type**: High-Cost (railway crossings very expensive and complex)

**Process**: Similar vector buffer + rasterize workflow for each

---

### Step 8: Population/Urban Buffers (45 minutes)

#### 8.1 Urban Areas from Land Cover
- Already captured in ESA WorldCover (class 50 = Built-up = No-Go)

#### 8.2 Population Density Constraint
Using WorldPop data:
```
High Density (>500 people/km²): High-Cost (10)
Medium Density (100-500): Moderate-Cost (3)
Low Density (<100): Preferred (1)
```

**Implementation**:
```bash
gdal_calc.py -A population_utm33n.tif --outfile=population_constraint.tif \
  --calc="10*(A>500) + 3*logical_and(A>=100,A<=500) + 1*(A<100)" \
  --NoDataValue=0 --type=Float32 --co COMPRESS=LZW
```

---

### Step 9: Flood Hazard Constraint (30 minutes)

#### 9.1 Classify Flood Depth
Using WRI Aqueduct 100-year flood hazard:
```
High Flood Risk (>1m depth): High-Cost (10)
Moderate Flood Risk (0.5-1m): Moderate-Cost (3)
Low/No Risk (<0.5m): Preferred (1)
```

**Implementation**:
```bash
gdal_calc.py -A flood_utm33n.tif --outfile=flood_constraint.tif \
  --calc="10*(A>100) + 3*logical_and(A>=50,A<=100) + 1*(A<50)" \
  --NoDataValue=0 --type=Float32 --co COMPRESS=LZW
```

Note: Check units in flood data (cm or m)

---

### Step 10: Composite Cost Surface (1-2 hours)

#### 10.1 Weighted Overlay Strategy

**Technical Constraints** (Engineering Feasibility):
- Slope: 40% weight
- Seismic: 20% weight
- Infrastructure crossings: 20% weight
- Flood hazard: 20% weight

**Environmental Constraints** (Environmental/Regulatory):
- Land cover: 30% weight
- Protected areas: 40% weight
- Water buffers: 15% weight
- Population: 15% weight

#### 10.2 Implementation Approach

**Option A: Single Composite Surface** (Recommended for initial routing)
```bash
gdal_calc.py \
  -A slope_constraint.tif \
  -B seismic_constraint.tif \
  -C landcover_constraint.tif \
  -D natura2000_constraint.tif \
  -E water_buffer_constraint.tif \
  -F population_constraint.tif \
  -G flood_constraint.tif \
  -H infrastructure_constraint.tif \
  --outfile=cost_surface_composite.tif \
  --calc="numpy.maximum.reduce([A, B, C, D, E, F, G, H])" \
  --NoDataValue=0 --type=Float32 --co COMPRESS=LZW --co BIGTIFF=YES
```

**Rationale**: Use `maximum` to ensure No-Go zones (9999) always override, and highest constraint in any category dominates.

**Option B: Separate Technical & Environmental Surfaces** (For sensitivity analysis)
```bash
# Technical surface
gdal_calc.py -A slope_constraint.tif -B seismic_constraint.tif \
  -C infrastructure_constraint.tif -D flood_constraint.tif \
  --outfile=cost_surface_technical.tif \
  --calc="0.4*A + 0.2*B + 0.2*C + 0.2*D" --NoDataValue=0 --type=Float32

# Environmental surface
gdal_calc.py -A landcover_constraint.tif -B natura2000_constraint.tif \
  -C water_buffer_constraint.tif -D population_constraint.tif \
  --outfile=cost_surface_environmental.tif \
  --calc="0.3*A + 0.4*B + 0.15*C + 0.15*D" --NoDataValue=0 --type=Float32

# Combined (equal weight to technical & environmental)
gdal_calc.py -A cost_surface_technical.tif -B cost_surface_environmental.tif \
  --outfile=cost_surface_combined.tif \
  --calc="0.5*A + 0.5*B" --NoDataValue=0 --type=Float32
```

#### 10.3 No-Go Zone Master Layer
Create a binary No-Go mask:
```bash
gdal_calc.py \
  -A slope_constraint.tif \
  -B seismic_constraint.tif \
  -C landcover_constraint.tif \
  -D natura2000_constraint.tif \
  --outfile=nogo_zones.tif \
  --calc="1*logical_or(logical_or(A==9999,B==9999),logical_or(C==9999,D==9999))" \
  --NoDataValue=0 --type=Byte
```

---

### Step 11: Validation (1-2 hours)

#### 11.1 Visual Validation
1. Load all constraint layers in QGIS
2. Overlay on original datasets (DEM, land cover, Natura 2000)
3. Check alignment and classification accuracy
4. Verify buffer distances are correct

#### 11.2 Statistical Validation
```bash
# Check value distributions
gdalinfo -stats slope_constraint.tif
gdalinfo -stats cost_surface_composite.tif

# Verify No-Go coverage
gdal_calc.py -A nogo_zones.tif --calc="sum(A)" --stats
```

#### 11.3 Test Routing Corridor
- Manually identify known feasible corridor
- Check that cost surface allows routing through it
- Verify No-Go zones block inappropriate areas

---

## Phase 3 Deliverables

### Primary Outputs
1. **cost_surface_composite.tif** - Master cost surface for routing
2. **nogo_zones.tif** - Binary mask of absolute exclusions
3. **Individual constraint rasters** (slope, seismic, land cover, etc.)
4. **Buffer vector layers** (GeoPackage)

### Documentation
1. **Processing log** with all commands and parameters
2. **Constraint classification table** (thresholds and weights)
3. **Validation report** with statistics and visual checks
4. **Metadata JSON** for each output raster

### Metadata Template
```json
{
  "dataset": "cost_surface_composite",
  "description": "Composite routing cost surface",
  "crs": "EPSG:32633",
  "resolution": "10m",
  "extent": [minX, minY, maxX, maxY],
  "unit": "dimensionless cost",
  "value_range": [1, 9999],
  "cost_categories": {
    "1": "Preferred",
    "3": "Moderate-Cost",
    "10": "High-Cost",
    "9999": "No-Go"
  },
  "weights": {
    "slope": 0.4,
    "seismic": 0.2,
    "landcover": 0.3,
    "natura2000": 0.4,
    "...": "..."
  },
  "source_datasets": [...],
  "processing_date": "2025-10-12",
  "tool": "gdal_calc.py",
  "version": "1.0"
}
```

---

## Missing Data Handling

### Archaeological Sites
**Status**: Not available  
**Impact**: Medium  
**Mitigation**: 
- Use urban/built-up areas as proxy (already No-Go)
- Flag areas within 1km of known historical centers (manual research)
- Add note in documentation that archaeological clearance required before construction

### Detailed Landslide Inventory (IFFI)
**Status**: Not available  
**Impact**: Low (slope proxy adequate)  
**Mitigation**:
- Slopes >35° already classified as No-Go
- Convex slopes (from curvature) can be flagged as higher risk
- Note in documentation that site-specific geotechnical survey required

---

## Implementation Timeline

| Step | Task | Duration | Tools |
|------|------|----------|-------|
| 1 | Preprocessing & Reprojection | 1-2h | gdalwarp, ogr2ogr |
| 2 | Terrain Analysis | 1h | gdaldem, gdal_calc.py |
| 3 | Seismic Constraint | 0.5h | gdal_calc.py |
| 4 | Land Cover Constraint | 0.5h | gdal_calc.py |
| 5 | Water Buffers | 0.75h | ogr2ogr, gdal_rasterize |
| 6 | Protected Area Buffers | 0.75h | ogr2ogr, gdal_rasterize |
| 7 | Infrastructure Buffers | 0.75h | ogr2ogr, gdal_rasterize |
| 8 | Population Constraint | 0.5h | gdal_calc.py |
| 9 | Flood Constraint | 0.5h | gdal_calc.py |
| 10 | Composite Cost Surface | 1-2h | gdal_calc.py |
| 11 | Validation & Documentation | 1-2h | QGIS, gdalinfo |

**Total Estimated Time**: 8-12 hours

---

## Recommended Approach

### My Recommendations

Based on Perplexity guidance and project constraints, I recommend:

1. **Start with Option A (Single Composite Surface)** 
   - Simpler to implement and validate
   - Sufficient for initial routing analysis
   - Can always create separate surfaces later if needed

2. **Use Maximum Cost Function**
   - Ensures No-Go zones always dominate
   - Simpler than weighted overlay for first iteration
   - More conservative approach (better for regulatory compliance)

3. **Defer Optional Enhancements to Phase 4**
   - Aspect analysis
   - Curvature analysis
   - Archaeological site research
   - These can refine the model but aren't critical for initial routing

4. **Focus on Validation**
   - Spend adequate time on visual and statistical validation
   - Critical to ensure routing algorithm receives correct inputs
   - Mistakes here compound in later phases

5. **Document Everything**
   - Every threshold, weight, and assumption
   - All processing commands
   - Validation results
   - Essential for stakeholder review and regulatory submission

### Implementation Strategy

**Phase 3A: Core Constraints (6-8 hours)**
- Steps 1-10: All primary constraint development and integration
- Deliverable: Functional cost surface ready for routing

**Phase 3B: Validation & Refinement (2-4 hours)**
- Step 11: Comprehensive validation
- Iterate on weights/thresholds if issues found
- Deliverable: Validated, documented cost surface

---

## Success Criteria

Phase 3 is complete when:

✅ All datasets reprojected to UTM Zone 33N at 10m resolution  
✅ Individual constraint rasters created for all 9 constraint types  
✅ Composite cost surface generated  
✅ No-Go zone mask validated  
✅ Visual validation confirms accurate classification  
✅ Statistical validation shows reasonable value distributions  
✅ All outputs have metadata JSON sidecars  
✅ Processing workflow documented  
✅ Constraint classification table documented  

---

**Status**: Planning Complete  
**Ready to Proceed**: ✅ YES  
**Next Action**: Begin Step 1 (Preprocessing & Reprojection)


