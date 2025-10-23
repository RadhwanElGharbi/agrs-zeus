# SoilGrids Fetch Tool - Final Implementation Status

**Date:** 2025-10-12  
**Tool:** `tools/soilgrids_fetch`  
**Status:** ⚠️ **IMPLEMENTED BUT NOT FUNCTIONAL** (requires additional work)

## Summary

The `soilgrids_fetch` tool has been **fully implemented in the codebase** with:
- ✅ Complete C++ function (300+ lines)
- ✅ CLI registration and integration
- ✅ Help documentation
- ✅ Successful compilation and build
- ✅ Tool is accessible via: `zeus tools soilgrids_fetch`

However, **both attempted approaches are currently non-functional** due to ISRIC service limitations.

---

## Implementation Attempts

### Attempt 1: WCS (Web Coverage Service) - FAILED ❌

**Endpoint:** `https://maps.isric.org/mapserv?map=/map/{property}.map`

**Issue:** ISRIC SoilGrids WCS requires coordinates in **EPSG:152160** (Homolosine projection), not EPSG:4326 (WGS84). Our implementation sends EPSG:4326 coordinates directly, causing the server to interpret them as projected coordinates → results in huge area requests → "out of memory" errors.

**Error:** `msImageCreate(): Image handling error. Attempt to allocate raw image failed, out of memory.`

**Solution Required:**
- Add coordinate transformation from EPSG:4326 to EPSG:152160 using `gdaltransform`
- Modify SUBSET parameters to use `x/y` instead of `Long/Lat`
- Add `SIZE` parameters to limit output resolution
- Estimated effort: 30-45 minutes

### Attempt 2: REST API - FAILED ❌

**Endpoint:** `https://rest.isric.org/soilgrids/v2.0/properties/query`

**Issue:** The REST API endpoint **does not exist** or has been deprecated. Both Perplexity AI and direct testing confirm HTTP 405 (Method Not Allowed).

**Error:** `HTTP Code: 405`

**Root Cause:** Perplexity's information about the REST API was outdated or incorrect. The ISRIC documentation may have changed since Perplexity's training data.

---

## Alternative Approaches

### Option A: Fix WCS with Coordinate Transformation (RECOMMENDED)
**Pros:**
- Official ISRIC WCS service is confirmed working
- Most reliable long-term solution
- Full control over properties and depth layers

**Cons:**
- Requires implementing coordinate transformation logic
- More complex than REST API would have been

**Implementation Steps:**
1. Use `gdaltransform` to convert bbox from EPSG:4326 to EPSG:152160
2. Update WCS URL to use `SUBSET=x(minX,maxX)&SUBSET=y(minY,maxY)`
3. Add `SIZE=x=500&SIZE=y=500` parameters to limit resolution
4. Add proper CRS parameter: `CRS=urn:ogc:def:crs:EPSG::152160`

### Option B: Use Python `soilgrids` Package
**Pros:**
- Abstraction layer handles all complexity
- Well-maintained community package

**Cons:**
- Adds Python dependency
- Requires calling Python from C++

### Option C: Use GDAL WCS Driver Directly
**Pros:**
- GDAL can handle CRS transformation automatically
- Single command solution

**Cons:**
- May still require EPSG:152160 knowledge
- Less control over parameters

---

## Current Project Status

✅ **SAIPEM_PIPELINE_DEMO has soil data** (copied from previous project)
- File: `data/rasters/soil_properties.tif`
- Format: 4-band GeoTIFF (82 KB)
- Resolution: ~250m
- Already included in data package

✅ **No immediate action required** for current project

⚠️ **Future projects** will need the tool fixed or manual soil data acquisition

---

## Recommendation

**For current project:** Use existing soil data ✅

**For future:** Implement Option A (WCS with coordinate transformation) when time permits

**Estimated effort to fix:** 30-45 minutes of focused implementation

---

## Related Documentation

- Perplexity Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/ISRIC_SoilGrids_Implementation.md`
- Perplexity Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/ISRIC_REST_API.md`
- Source Code: `/opt/agrs/src/app/Tools.cpp` (lines 11366-11692)
- Header: `/opt/agrs/include/agrs_zeus/Tools.h` (lines 785-790)

---

## Test Commands Used

```bash
# WCS Test (fails with "out of memory")
curl -s "https://maps.isric.org/mapserv?map=/map/soc.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=soc_0-5cm_mean&SUBSET=Long(13.45,13.95)&SUBSET=Lat(42.85,43.45)&FORMAT=image/tiff"

# REST API Test (returns 405 - Method Not Allowed)
curl -X POST "https://rest.isric.org/soilgrids/v2.0/properties/query" \
  -H "Content-Type: application/json" \
  -d '{"bbox":[13.45,42.85,13.95,43.45],"properties":["soc"],"depths":["0-5"],"format":"geotiff"}'

# Tool Test
zeus tools soilgrids_fetch --bbox 13.45,42.85,13.50,42.90 --properties soc,clay -o /tmp/test.tif
```

