# Batch 1 Fetch Tools - Implementation Report

**Date**: October 12, 2025  
**Status**: Partially Complete (1 of 3 tools fully functional)  
**Project**: SAIPEM_PIPELINE_DEMO

---

## Summary

Implemented and tested Batch 1 (Critical Safety & Compliance) fetch tools for the SAIPEM pipeline project. One tool is fully functional, two require endpoint fixes or alternative implementations.

---

## Tools Implemented

### 1. ✅ seismic_hazard_fetch - **FULLY FUNCTIONAL**

**Purpose**: Fetch global seismic hazard data (Peak Ground Acceleration)  
**Method**: Direct download from Zenodo (GEM Global Seismic Hazard Model v2023)  
**Data Source**: GEM Foundation (Global Earthquake Model)  
**Resolution**: 3 arc-minutes (~5.5 km at equator)  
**Parameter**: PGA (Peak Ground Acceleration) for 475-year return period

**Test Results:**
- ✅ Successfully downloaded 33 MB dataset from Zenodo
- ✅ Extracted and clipped to SAIPEM AOI
- ✅ Generated valid GeoTIFF output (10×12 pixels)
- ✅ Created JSON metadata sidecar
- ✅ Output file: `/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/data/rasters/seismic_hazard_pga.tif` (1.4 KB)

**Implementation Details:**
- **Download URL**: https://zenodo.org/records/8409647/files/GEM-GSHM_PGA-475y-rock_v2023.zip
- **File Size**: 33.0 MB (compressed)
- **Processing**: Automatic unzip, clip to bbox, cleanup
- **CRS**: EPSG:4326 (WGS84)
- **NoData**: 0

**Command:**
```bash
zeus tools seismic_hazard_fetch \
  --bbox 13.454779,42.857057,13.938769,43.438886 \
  -o seismic_hazard_pga.tif \
  --overwrite
```

**SAIPEM Relevance**: ⭐⭐⭐⭐⭐ CRITICAL  
Central Italy (Apennines) is seismically active. This data is essential for pipeline seismic design requirements and risk assessment.

---

### 2. ❌ iffi_fetch - **NOT FUNCTIONAL** (WFS Endpoint Issue)

**Purpose**: Fetch ISPRA IFFI landslide inventory data  
**Method**: WFS query to ISPRA GeoServer  
**Data Source**: ISPRA (Istituto Superiore per la Protezione e la Ricerca Ambientale)  
**Database Size**: ~650,000 landslides across Italy

**Test Results:**
- ❌ WFS endpoint not responding
- Error: "WFS response is empty or invalid"
- Endpoint: https://idrogeo.isprambiente.it/geoserver/wfs
- Layer: `iffi:iffi_poligoni`

**Issues Identified:**
1. WFS service may be down or moved
2. Endpoint URL may have changed
3. Layer name may be incorrect
4. Authentication may be required

**Alternative Solutions:**
1. **Test different WFS endpoint**: Try `https://idrogeo.isprambiente.it/geoserver/ows`
2. **Use OWSLib library**: Implement Python-based WFS query with better error handling
3. **Manual download**: Provide instructions for downloading IFFI shapefile from ISPRA portal
4. **Use existing wfs_fetch tool**: Leverage the generic WFS fetch tool

**Perplexity Research**: `/opt/agrs/docs/Perplexity/Fetch_Tools/IFFI_Implementation.md`  
Contains alternative approaches and endpoints to try.

**SAIPEM Relevance**: ⭐⭐⭐⭐⭐ CRITICAL  
Landslide risk is a major concern for pipelines in mountainous Central Italy. This data is essential for route avoidance.

---

### 3. ❌ euap_fetch - **NOT FUNCTIONAL** (WFS Endpoint Issue)

**Purpose**: Fetch Italian protected areas (EUAP - Elenco Ufficiale Aree Protette)  
**Method**: WFS query to ISPRA ArcGIS Server  
**Data Source**: ISPRA (via Italian Ministry of Environment)  
**Coverage**: National parks, regional parks, nature reserves, marine protected areas

**Test Results:**
- ❌ WFS endpoint not responding
- Error: "Failed to download from WFS service"
- Endpoint: https://geoservizi.isprambiente.it/arcgis/services/areeprotette/euap_wfs/MapServer/WFSServer
- Layer: `euap_wfs:areeprotette`

**Issues Identified:**
1. ArcGIS WFS endpoint may require different request format
2. Endpoint URL may have changed
3. Layer name may be incorrect
4. May require FeatureServer instead of MapServer

**Alternative Solutions:**
1. **Try FeatureServer**: Replace `MapServer/WFSServer` with `FeatureServer`
2. **Use REST API**: ArcGIS REST endpoint for direct query
3. **Use OWSLib with ArcGIS adapter**: Better ArcGIS WFS support
4. **Manual download**: ISPRA provides downloadable shapefiles
5. **Use Natura 2000 as partial substitute**: Already have Natura 2000 data (European protected sites)

**Perplexity Research**: `/opt/agrs/docs/Perplexity/Fetch_Tools/EUAP_Implementation.md`  
Contains alternative ArcGIS REST API approaches.

**SAIPEM Relevance**: ⭐⭐⭐⭐⭐ CRITICAL  
Protected areas are hard constraints (no-go zones). Essential for regulatory compliance and permitting.

---

## Implementation Code

All three tools are implemented in `/opt/agrs/src/app/Tools.cpp`:

| Function | Line Range | Status |
|----------|------------|--------|
| `tools_seismic_hazard_fetch()` | 6734-6920 | ✅ Working |
| `tools_euap_fetch()` | 7123-7307 | ❌ Needs fix |
| `tools_iffi_fetch()` | 7308-7514 | ❌ Needs fix |

---

## Next Steps

### Immediate (Fix Batch 1)

1. **Test alternative WFS endpoints**
   ```bash
   # Test IFFI with different endpoint
   curl "https://idrogeo.isprambiente.it/geoserver/ows?service=WFS&version=2.0.0&request=GetCapabilities"
   
   # Test EUAP with REST API
   curl "https://geoservizi.isprambiente.it/arcgis/rest/services/areeprotette/euap/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson"
   ```

2. **Implement Python-based WFS fetch** (more robust error handling)

3. **Use generic wfs_fetch tool** as fallback:
   ```bash
   zeus tools wfs_fetch \
     --url "https://idrogeo.isprambiente.it/geoserver/wfs" \
     --layer "iffi:iffi_poligoni" \
     --bbox 13.454779,42.857057,13.938769,43.438886 \
     -o iffi_landslides.gpkg
   ```

### Short-term (Batch 1 Completion)

1. Fix IFFI endpoint or implement alternative
2. Fix EUAP endpoint or implement alternative
3. Re-test all three tools
4. Document working solutions

### Medium-term (Batch 2)

Proceed with Batch 2 tools (Very High Priority):
- hydrosheds_fetch
- fao_soil_fetch
- istat_boundaries_fetch
- corine_italy_fetch

---

## Files Created

### Functional
- `/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/data/rasters/seismic_hazard_pga.tif` (1.4 KB)
- `/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/data/rasters/seismic_hazard_pga.tif.json` (839 bytes)

### Documentation
- `/opt/agrs/docs/BATCH1_IMPLEMENTATION_REPORT.md` (this file)
- `/opt/agrs/docs/Perplexity/Fetch_Tools/IFFI_Implementation.md` (research guide)
- `/opt/agrs/docs/Perplexity/Fetch_Tools/EUAP_Implementation.md` (research guide)
- `/opt/agrs/docs/Perplexity/Fetch_Tools/Global_Seismic_Hazard_Implementation.md` (research guide)

---

## Success Metrics

### Overall Batch 1 Progress
- **Tools Implemented**: 3/3 (100%)
- **Tools Functional**: 1/3 (33%)
- **Critical Data Acquired**: 1/3 (33%)

### What's Working
- ✅ Seismic hazard data (most critical for Central Italy)
- ✅ Tool framework and CLI integration
- ✅ Metadata sidecar generation
- ✅ AOI clipping and COG generation

### What Needs Fixing
- ❌ IFFI WFS endpoint/layer identification
- ❌ EUAP WFS/ArcGIS endpoint configuration
- ⚠️ Need better error messages for WFS failures

---

## Recommendations

### Option A: Fix Now (Priority)
Spend 1-2 hours fixing IFFI and EUAP endpoints to complete Batch 1.

**Pros**: Complete critical safety data acquisition  
**Cons**: May take longer if endpoints are permanently changed

### Option B: Use Workarounds (Fast)
Use existing WFS fetch tool or manual download + clip workflow.

**Pros**: Get data quickly  
**Cons**: Less automated, may not be reproducible

### Option C: Defer and Continue (Pragmatic)
Move to Batch 2 tools, return to fix IFFI/EUAP later.

**Pros**: Maintain momentum, acquire other critical data  
**Cons**: Missing landslide and protected area data for now

**Recommendation**: **Option C** - Continue to Batch 2 while researching IFFI/EUAP fixes in parallel. Seismic data is the most critical and is already working.

---

## Lessons Learned

1. **WFS services are fragile** - endpoints change, services go down
2. **Direct downloads (like Zenodo) are more reliable** than WFS
3. **Always implement fallback methods** for critical data sources
4. **Test endpoints before full implementation** (should have run GetCapabilities first)
5. **Python-based WFS clients (OWSLib) may be more robust** than curl-based approaches

---

## User Action Required

**Question**: How would you like to proceed?

**Option A**: Fix IFFI and EUAP now (1-2 hours)  
**Option B**: Continue to Batch 2, fix later  
**Option C**: Provide manual guidance for IFFI/EUAP download

---

**Status**: Awaiting user direction  
**Last Updated**: October 12, 2025, 06:30 UTC







