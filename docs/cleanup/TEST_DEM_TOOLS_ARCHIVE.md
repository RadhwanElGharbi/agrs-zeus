# TEST_DEM_TOOLS Archive Note

- Location: 
- Size: 667M
- Files: 57 (GeoTIFFs: 17)
- Purpose: Lake Como AOI TINITALY DEM fetch, mosaic/clip, and DEM tools validation.
- AOI: 9.35–9.45°E, 45.80–45.90°N (Lake Como, Italian Alps)

## Contents
- : Downloaded TINITALY tiles (, , , )
- : VRT mosaic of 4 tiles
- , : Clipped DEMs
- DEM outputs: , , , 
- Reports: , , 

## Reproducibility
1) Fetch and clip DEM directly using the validated tool/method:

667M	TEST_DEM_TOOLS
667M	TEST_DEM_TOOLS
3.2G	docs/DEMO-SAIPEM
40K	validation_test_1_desert
52K	validation_test_2_manhattan
1.2M	validation_test_3_agriculture
664K	validation_test_4_amazon
52K	validation_test_central_park
11M	test_outputs
Deleting TEST_DEM_TOOLS...
✅ TEST_DEM_TOOLS deleted

Deleting docs/DEMO-SAIPEM...
✅ docs/DEMO-SAIPEM deleted

Deleting legacy validation outputs...
✅ Legacy validation outputs deleted
/opt/agrs
=========================================
AGRS Cleanup Script
=========================================

1. Deleting TEST_DEM_TOOLS (667MB)...
   ⚠️  Already deleted

2. Deleting docs/DEMO-SAIPEM (3.2GB)...
   ⚠️  Already deleted

3. Deleting legacy validation outputs...

4. Deleting redundant root-level markdown files...
   ✅ Deleted CLEANUP_COMPLETE.md
   ✅ Deleted CLEANUP_EXECUTION_SUMMARY.md
   ✅ Deleted CLEANUP_RECOMMENDATIONS.md
   ✅ Deleted COMPREHENSIVE_VALIDATION_REPORT.md
   ✅ Deleted COPERNICUS_DEM_GLO10_SETUP_GUIDE.md
   ✅ Deleted ESA_WORLDCOVER_VALIDATION_REPORT.md
   ✅ Deleted FETCH_TOOLS_COMPLETE.md
   ✅ Deleted FETCH_TOOLS_COMPLETE_SUMMARY.md
   ✅ Deleted FETCH_TOOLS_FINAL_COMPLETE.md
   ✅ Deleted FETCH_TOOLS_FINAL_STATUS.md
   ✅ Deleted FETCH_TOOLS_IMPLEMENTATION_STATUS.md
   ✅ Deleted GOOGLE_DYNAMICWORLD_10BAND_SUMMARY.md
   ✅ Deleted GOOGLE_EARTH_ENGINE_SETUP.md
   ✅ Deleted ITALY_ADDITIONAL_FETCH_TOOLS_ANALYSIS.md
   ✅ Deleted ITALY_FETCH_TOOLS_IMPLEMENTATION_COMPLETE.md
   ✅ Deleted ITALY_PRIORITY1_EXECUTIVE_SUMMARY.md
   ✅ Deleted ITALY_PRIORITY1_TOOLS_FINAL_REPORT.md
   ✅ Deleted ITALY_PRIORITY1_TOOLS_HONEST_ASSESSMENT.md
   ✅ Deleted KSA_FETCH_TOOLS_ANALYSIS.md
   ✅ Deleted LANDCOVER_TOOLS_SUMMARY.md
   ✅ Deleted OSM_WATERWAYS_IMPLEMENTATION_REPORT.md
   ✅ Deleted PHASE1_COMPLETE_VALIDATION_REPORT.md
   ✅ Deleted PHASE1_FETCH_TOOLS_COMPLETE.md
   ✅ Deleted PHASE1_REAL_DATA_IMPLEMENTATION_GUIDE.md
   ✅ Deleted PHASE1_REAL_DATA_STATUS.md
   ✅ Deleted REMAINING_TOOLS_NOTE.md
   ✅ Deleted SAIPEM_DATA_PACKAGE_GUIDE.md
   ✅ Deleted SAIPEM_DATA_PACKAGE_READY.md
   ✅ Deleted SAUDI_ARABIA_DATASET_RESEARCH_COMPLETE.md
   ✅ Deleted SCIGRID_GAS_PIPELINES_IMPLEMENTATION_REPORT.md
   ✅ Deleted TIER1_IMPLEMENTATION_SUMMARY.md
   ✅ Deleted TOOL_IMPLEMENTATION_LOG.md
   ✅ Deleted VALIDATION_RESULTS_CENTRAL_PARK.md
   ✅ Deleted VERIFICATION_REPORT.md
   ✅ Deleted COMPREHENSIVE_DATASET_INVENTORY.md

=========================================
Cleanup Summary
=========================================
20K	docs/cleanup
   Archive docs created

Space recovered: ~4 GB
✅ Cleanup complete
[2025-10-15 01:31:14.244] [info] [agrs-zeus] AGRS ZEUS starting (v0.1.0)
[2025-10-15 01:31:14.246] [info] [agrs-zeus] Logs at: 

Fetching TINITALY 10m DEM...
Source: INGV TINITALY 1.1 Digital Elevation Model
Resolution: 10 meters
Method: Direct tile calculation (validated 2025-10-14)
BBox: 9.35,45.80,9.45,45.90 (EPSG:4326)
Calculating required TINITALY tiles...
UTM 32N extent: E=527199-534907m, N=5071886-5083035m
Required tiles: 1 (w50550_s10)
[1/1] Downloading w50550_s10...
  ✓ Downloaded and extracted (1 tiles ready)

✓ Successfully downloaded 1 tiles
Building mosaic...
0...10...20...30...40...50...60...70...80...90...100 - done.
Clipping to AOI and converting to COG...

✓ TINITALY DEM saved: lake_como_dem.tif
  Metadata: lake_como_dem.tif.json
tools tinitaly_fetch OK: lake_como_dem.tif

2) Run DEM tools:
[2025-10-15 01:32:35.308] [info] [agrs-zeus] AGRS ZEUS starting (v0.1.0)
[2025-10-15 01:32:35.309] [info] [agrs-zeus] Logs at: 
0...10...20...30...40...50...60...70...80...90...100 - done.
Calculating slope from DEM...
Input: lake_como_dem.tif
Output: lake_como_slope.tif
Format: Percentage
Algorithm: Horn

Running GDAL command...

✅ Slope calculation complete!
Output: lake_como_slope.tif
Metadata: lake_como_slope.tif.json
[2025-10-15 01:32:35.983] [info] [agrs-zeus] AGRS ZEUS starting (v0.1.0)
[2025-10-15 01:32:35.983] [info] [agrs-zeus] Logs at: 
0...10...20...30...40...50...60...70...80...90...100 - done.
Calculating aspect from DEM...
Input: lake_como_dem.tif
Output: lake_como_aspect.tif
Zero for flat: Yes

Running GDAL command...

✅ Aspect calculation complete!
Output: lake_como_aspect.tif
Metadata: lake_como_aspect.tif.json
[2025-10-15 01:32:37.476] [info] [agrs-zeus] AGRS ZEUS starting (v0.1.0)
[2025-10-15 01:32:37.476] [info] [agrs-zeus] Logs at: 
Calculating terrain curvature from DEM...
Input: lake_como_dem.tif
Output: lake_como_curvature_profile.tif
Type: profile

Calculating curvature using Python/NumPy...

✅ Curvature calculation complete!
Output: lake_como_curvature_profile.tif
Metadata: lake_como_curvature_profile.tif.json
[2025-10-15 01:32:48.667] [info] [agrs-zeus] AGRS ZEUS starting (v0.1.0)
[2025-10-15 01:32:48.667] [info] [agrs-zeus] Logs at: 
Input file size is 1111, 1111
0...10...20...30...40...50...60...70...80...90...100 - done.
Applying threshold to raster...
Input: lake_como_slope.tif
Output: lake_como_steep_areas.tif
Threshold: 30
Above value: 1
Below value: 0
Inverted: No

Running gdal_calc.py...
Converting to COG...

✅ Threshold application complete!
Output: lake_como_steep_areas.tif
Metadata: lake_como_steep_areas.tif.json

## Notes
- This directory was used for iterative validation and is no longer needed since the method is standardized.
- All key outputs have JSON sidecars with parameters and timestamps.
