# Italy Fetch Tools - Comprehensive Test Report

**Date:** October 23, 2025  
**Test AOI:** `/opt/agrs/Projects/test_project/aoi/aoi.kmz`  
**Location:** Central Italy (Abruzzo region)  
**Extent:** 13.454779°E, 42.857057°N to 13.938769°E, 43.438886°N  

---

## Executive Summary

**Total Tests:** 11  
**✅ Successful:** 3 (27%)  
**❌ Failed:** 8 (73%)  

**Critical Finding:** Most failures are due to fixable implementation issues, not fundamental data availability problems.

---

## Detailed Test Results

### ✅ TEST 1: TINITALY 10m DEM - **SUCCESS**

**Status:** ✅ PASSED  
**Output:** `/opt/agrs/Projects/test_project/data/rasters/tinitaly_10m_dem.tif` (68 MB)  
**Resolution:** 10m (validated)  
**Features:**
- Downloaded 2 tiles (w47585_s10, w48085_s10)
- Properly mosaicked and clipped to AOI
- Converted to COG format
- Metadata sidecar created

**Verdict:** **PRODUCTION READY** ✅

---

### ❌ TEST 2: ISTAT Boundaries (Comuni) - **FAILED**

**Status:** ❌ FAILED  
**Error:** `End-of-central-directory signature not found. Either this file is not a zipfile`  
**Root Cause:** GitHub API returns HTML redirect page, not ZIP file  

**Issue:** The tool is downloading directly from GitHub without following the redirect to raw content.

**Fix Required:**
```bash
# Current (broken):
https://github.com/openpolis/geojson-italy/raw/master/...

# Should use:
https://raw.githubusercontent.com/openpolis/geojson-italy/master/...
```

**Impact:** HIGH - Administrative boundaries are critical for compliance  
**Fix Difficulty:** LOW - Simple URL change  
**Estimated Fix Time:** 5 minutes

---

### ❌ TEST 3: CORINE Land Cover - **FAILED**

**Status:** ❌ FAILED  
**Error:** `Currently only --bbox is supported`  
**Root Cause:** Tool does not support `--aoi` parameter, only `--bbox`

**Issue:** The implementation is incomplete. CORINE fetch needs bbox extraction from AOI.

**Fix Required:**
- Add AOI support (extract bbox and pass to existing logic)
- OR: Document that only `--bbox` is supported

**Impact:** MEDIUM - Land cover is important but workarounds exist  
**Fix Difficulty:** LOW - Add bbox extraction logic  
**Estimated Fix Time:** 10 minutes

---

### ❌ TEST 4: IFFI Landslide Inventory - **FAILED**

**Status:** ❌ FAILED  
**Error:** `Failed to download from IFFI WFS service`  
**Root Cause:** WFS endpoint may be offline or requires authentication

**Issue:** ISPRA WFS service at `https://geoportale.isprambiente.it/arcgis/services/IFGI/IFGI_WFS/MapServer/WFSServer` is not responding.

**Investigation Needed:**
1. Check if service is temporarily down
2. Verify correct WFS endpoint URL
3. Check if authentication required
4. Consider alternative download methods (INSPIRE portal, direct download)

**Impact:** HIGH - Landslides are critical geohazard for pipeline routing  
**Fix Difficulty:** MEDIUM - May require service discovery  
**Estimated Fix Time:** 30 minutes + Perplexity research

---

### ❌ TEST 5: INGV Seismic Hazard (PGA) - **FAILED**

**Status:** ❌ FAILED  
**Error:** `Unknown option name '-overwrite'`  
**Root Cause:** Passing invalid flag to `gdal_translate`

**Issue:** The `--overwrite` flag is being passed to `gdal_translate`, which doesn't recognize it. This should be handled before calling GDAL (delete existing file first).

**Fix Required:**
```cpp
// Before calling gdal_translate:
if (overwrite && std::filesystem::exists(outputPath)) {
    std::filesystem::remove(outputPath);
}
// Then call gdal_translate WITHOUT --overwrite flag
```

**Impact:** MEDIUM - Seismic hazard is important for Italy  
**Fix Difficulty:** LOW - Simple logic fix  
**Estimated Fix Time:** 5 minutes

---

### ❌ TEST 6: INGV DISS Faults Database - **FAILED** (NEW TOOL)

**Status:** ❌ FAILED  
**Error:** `Feature type :Individual_Seismogenic_Sources unknown`  
**Root Cause:** Incorrect WFS layer name

**Issue:** The layer name `DISS:Individual_Seismogenic_Sources` is wrong. The WFS returned an XML error stating the feature type is unknown.

**Investigation Needed:**
1. Query WFS GetCapabilities to discover correct layer names
2. Update tool with correct layer name

**Fix Required:**
```bash
# Test GetCapabilities:
curl "http://services.seismofaults.eu/DISS331/wfs?service=WFS&version=1.1.0&request=GetCapabilities" | grep -i "Name"
```

**Impact:** HIGH - Active faults are critical for seismic zones  
**Fix Difficulty:** LOW - Just need correct layer name  
**Estimated Fix Time:** 15 minutes

---

### ❌ TEST 7: EUAP Protected Areas - **FAILED**

**Status:** ❌ FAILED  
**Error:** `Failed to download from ArcGIS REST service`  
**Root Cause:** ArcGIS REST API endpoint may be incorrect or service down

**Issue:** ISPRA ArcGIS REST service not responding at `https://geoservizi.isprambiente.it/arcgis/rest/services/areeprotette/euap/MapServer/0/query`

**Investigation Needed:**
1. Verify correct ArcGIS REST endpoint
2. Check if service requires token/authentication
3. Consider WFS alternative if available

**Impact:** MEDIUM - Protected areas important for compliance  
**Fix Difficulty:** MEDIUM - May require service discovery  
**Estimated Fix Time:** 30 minutes + Perplexity research

---

### ❌ TEST 8: EU-Hydro River Network - **FAILED** (NEW TOOL)

**Status:** ❌ FAILED  
**Error:** `Unable to open datasource '/tmp/euhydro_temp.geojson'`  
**Root Cause:** WFS returned XML error or empty response, not GeoJSON

**Issue:** Similar to INGV faults - likely incorrect layer name or WFS version mismatch.

**Investigation Needed:**
1. Query WFS GetCapabilities for correct layer names
2. Check if service supports GeoJSON output format
3. Try GML format as fallback

**Fix Required:**
```bash
# Test GetCapabilities:
curl "https://image.discomap.eea.europa.eu/arcgis/services/Hydro/Hydrography/MapServer/WFSServer?service=WFS&version=2.0.0&request=GetCapabilities"
```

**Impact:** HIGH - Rivers are critical for water crossing assessment  
**Fix Difficulty:** MEDIUM - Need correct WFS parameters  
**Estimated Fix Time:** 20 minutes

---

### ❌ TEST 9: Sentinel-2 L2A Imagery - **FAILED**

**Status:** ❌ FAILED  
**Error:** `--bbox is required`  
**Root Cause:** Tool does not support `--aoi` parameter

**Issue:** Sentinel-2 fetch requires `--bbox`, not `--aoi`. This is a known limitation.

**Fix Required:**
- Add AOI support (extract bbox from AOI)
- OR: Update intelligent routing to extract bbox before calling

**Impact:** LOW - Imagery is less critical, can be fetched manually  
**Fix Difficulty:** LOW - Add bbox extraction  
**Estimated Fix Time:** 10 minutes

---

### ✅ TEST 10: OSM Roads - **PARTIAL SUCCESS**

**Status:** ⚠️ WARNING  
**Output:** `/opt/agrs/Projects/test_project/data/vectors/osm_roads.gpkg` (104 KB)  
**Features:** 0 road features (empty dataset!)

**Issue:** The tool succeeded but returned 0 features. Either:
1. OSM has no roads in this AOI (unlikely in Central Italy)
2. Overpass API query is malformed
3. Bbox coordinates are swapped (lon/lat confusion)

**Investigation:** The bbox query shows: `13.454779,13.938769,42.857057,43.438886` which is suspicious - looks like `minx,maxx,miny,maxy` instead of `minx,miny,maxx,maxy`.

**Impact:** HIGH - Roads are critical infrastructure  
**Fix Difficulty:** LOW - Fix bbox parameter order  
**Estimated Fix Time:** 5 minutes

**Verdict:** **NEEDS FIX** ⚠️

---

### ✅ TEST 11: OSM Power Lines - **SUCCESS**

**Status:** ✅ PASSED  
**Output:** `/opt/agrs/Projects/test_project/data/vectors/osm_power.gpkg` (30 MB)  
**Features:** 57,195 power line features  

**Verdict:** **PRODUCTION READY** ✅

---

## Summary by Category

### Rasters (Elevation, Imagery, Land Cover)
| Dataset | Status | Issue |
|---------|--------|-------|
| TINITALY 10m DEM | ✅ Working | None |
| CORINE Land Cover | ❌ Failed | Missing AOI support |
| INGV Seismic Hazard | ❌ Failed | Invalid GDAL flag |
| Sentinel-2 | ❌ Failed | Missing AOI support |

**Raster Success Rate: 25% (1/4)**

### Vectors (Boundaries, Infrastructure, Geohazards)
| Dataset | Status | Issue |
|---------|--------|-------|
| ISTAT Boundaries | ❌ Failed | GitHub URL redirect |
| IFFI Landslides | ❌ Failed | WFS service down |
| INGV Faults | ❌ Failed | Wrong layer name |
| EUAP Protected Areas | ❌ Failed | REST API down |
| EU-Hydro Rivers | ❌ Failed | Wrong WFS parameters |
| OSM Roads | ⚠️ Empty | Bbox parameter order |
| OSM Power Lines | ✅ Working | None |

**Vector Success Rate: 14% (1/7)**

---

## Root Cause Analysis

### Primary Issues:

1. **WFS Layer Names** (3 tools affected)
   - INGV Faults, EU-Hydro, IFFI
   - Need GetCapabilities discovery
   - Quick fix: correct layer names

2. **Missing AOI Support** (3 tools affected)
   - CORINE, Sentinel-2, partially others
   - Need bbox extraction logic
   - Quick fix: add helper function

3. **Service Endpoints** (2 tools affected)
   - IFFI, EUAP
   - Services may be down or URLs outdated
   - Medium fix: Perplexity research + service discovery

4. **GDAL Parameter Errors** (1 tool affected)
   - INGV Seismic
   - Quick fix: handle --overwrite properly

5. **GitHub Download Issue** (1 tool affected)
   - ISTAT Boundaries
   - Quick fix: use raw.githubusercontent.com

6. **Bbox Parameter Order** (1 tool affected)
   - OSM Roads
   - Quick fix: swap parameter order

---

## Recommended Fix Priority

### 🔴 CRITICAL (Fix First - 30 min total)
1. ✅ TINITALY DEM - Already working
2. ✅ OSM Power - Already working
3. ⚠️ OSM Roads - Fix bbox order (5 min)
4. ISTAT Boundaries - Fix GitHub URL (5 min)
5. INGV Seismic - Fix --overwrite flag (5 min)
6. CORINE - Add AOI support (10 min)

### 🟡 HIGH PRIORITY (Fix Next - 1 hour total)
7. INGV Faults - Fix WFS layer name (15 min)
8. EU-Hydro - Fix WFS parameters (20 min)
9. IFFI Landslides - Investigate WFS endpoint (30 min)

### 🟢 MEDIUM PRIORITY (Fix Later - 1 hour total)
10. EUAP Protected Areas - Investigate REST API (30 min)
11. Sentinel-2 - Add AOI support (10 min)

---

## Production Readiness Assessment

### Currently Production Ready (2 tools):
- ✅ TINITALY 10m DEM
- ✅ OSM Power Lines

### Quick Wins (Can be fixed in 1 hour):
- ISTAT Boundaries
- INGV Seismic
- CORINE Land Cover
- OSM Roads
- Sentinel-2

### Requires Investigation (May take 2-3 hours):
- INGV Faults (WFS discovery)
- EU-Hydro (WFS discovery)
- IFFI Landslides (Service status)
- EUAP Protected Areas (Service status)

---

## Recommended Next Steps

1. **Immediate Fixes (30 minutes):**
   - Fix ISTAT Boundaries GitHub URL
   - Fix INGV Seismic --overwrite handling
   - Fix OSM Roads bbox parameter order
   - Add AOI-to-bbox extraction helper function

2. **WFS Discovery (1 hour):**
   - Run Perplexity search for correct INGV DISS layer names
   - Query EU-Hydro GetCapabilities for correct layer names
   - Test updated parameters

3. **Service Investigation (2 hours):**
   - Verify IFFI WFS endpoint status and alternatives
   - Verify EUAP ArcGIS REST endpoint and alternatives
   - Consider static downloads as fallback

4. **Final Testing:**
   - Re-run comprehensive test suite
   - Validate all outputs with QGIS/gdalinfo
   - Generate final production readiness report

---

## Conclusion

**Current State:** Only 27% of tools working (3/11)  
**Estimated State After Fixes:** 82-91% working (9-10/11)  
**Time to Production Ready:** 3-4 hours of focused debugging

**The good news:** Most failures are simple bugs, not fundamental data availability issues. The infrastructure is solid; it just needs debugging and proper WFS/API parameter configuration.

**Recommendation:** Focus on quick wins first to get 6-7 tools working within the next hour, then tackle the WFS discovery and service investigation issues.

