# No Placeholder Data Policy

**Version:** 1.0  
**Date:** 2025-10-28  
**Status:** MANDATORY  
**Enforcement:** ZERO TOLERANCE  

---

## 🚫 ABSOLUTE PROHIBITION OF PLACEHOLDER DATA

### Policy Statement

**ALL datasets used in AGRS ZEUS PIRL training and route generation MUST be real, authoritative source data. The creation or use of placeholder, synthetic, or "fake" datasets is ABSOLUTELY FORBIDDEN under any circumstances.**

### Rationale

1. **Scientific Integrity:** Placeholder data corrupts the training process and produces models that do not reflect real-world conditions
2. **Engineering Liability:** Routes generated with placeholder data are NOT suitable for engineering use and could lead to catastrophic failures
3. **Client Trust:** Presenting routes based on fake data violates professional ethics and destroys client confidence
4. **Legal Exposure:** Misrepresenting data sources exposes the company to legal liability
5. **Model Validity:** Machine learning models trained on synthetic data do not generalize to real-world scenarios

### What Constitutes Prohibited Placeholder Data

❌ **FORBIDDEN:**
- Constant-value rasters (e.g., all pixels = 50)
- Randomly generated synthetic data
- Data copied/duplicated from other datasets
- Artificially created datasets to "pass validation"
- Mock data, test data, or sample data used in production
- Extrapolated or interpolated data beyond source resolution
- Data created by tools other than authoritative fetch tools

### Acceptable Data Sources

✅ **ALLOWED:**
- Direct downloads from authoritative providers (USGS, ESA, ISRIC, OSM, etc.)
- Data fetched via official APIs (WCS, WMS, REST)
- Licensed commercial datasets (when appropriately acquired)
- National government datasets from official portals
- Academic datasets from peer-reviewed sources
- Data with proper provenance and metadata

---

## 📋 MANDATORY REQUIREMENTS FOR ALL DATASETS

### 1. Source Authentication

Every dataset MUST have:
- **Provider name:** Official organization providing the data
- **Provider URL:** Link to authoritative source
- **Fetch tool:** Name of AGRS ZEUS tool used to acquire data
- **Fetch date:** Timestamp of data acquisition
- **License:** Data usage license/terms

### 2. Data Validation

Every dataset MUST:
- Have real, variable values (not constant across extent)
- Match documented characteristics of the source dataset
- Include proper NoData value encoding
- Have accompanying metadata JSON file
- Pass validation checks for physical reasonableness

### 3. Traceability

Every dataset MUST maintain:
- Raw original file in `data/rasters/raw/` or `data/vectors/raw/`
- Processing history in metadata
- Source attribution in all derived products
- Audit trail from source to processed output

---

## 🔍 DETECTION AND ENFORCEMENT

### Validation Checks

The validation system checks for:
1. **Constant values:** Rasters with zero standard deviation flagged as suspicious
2. **Metadata verification:** Presence of source URL and provider information
3. **Value range checks:** Data values must be within expected ranges for data type
4. **Temporal consistency:** Fetch dates must be reasonable
5. **File authenticity:** Raw files must exist and match processed derivatives

### Automatic Rejection

Training will automatically FAIL if:
- Any critical dataset has constant values (σ = 0)
- Any dataset lacks proper metadata JSON
- Any dataset missing source attribution
- Any dataset created by non-fetch tools
- Any dataset marked as "placeholder" or "synthetic" in metadata

### Manual Review Required

If validation detects:
- Unusual value distributions
- Missing or incomplete metadata
- Suspicious provider URLs
- Temporal inconsistencies

→ **STOP TRAINING** and conduct manual audit before proceeding

---

## 📊 EXAMPLE: CORRECT vs. INCORRECT

### ❌ INCORRECT (Placeholder Soil Data)

```bash
# Creating fake soil raster with constant value
gdal_translate -b 1 -scale 0 255 50 50 dem.tif soil.tif
```

**Problems:**
- All pixels have value 50 (no variation)
- Not from authoritative source
- No real soil property information
- Corrupts model training

**Metadata would show:**
```json
{
  "name": "soil_placeholder",
  "source": "Generated",
  "fetch_tool": "gdal_translate",
  "validation_status": "REJECTED - PLACEHOLDER DATA"
}
```

### ✅ CORRECT (Real SoilGrids Data)

```bash
# Fetching real data from ISRIC SoilGrids
zeus tools soilgrids_fetch \
  --bbox 13.45,42.85,13.94,43.44 \
  --properties clay,sand,soc,bdod \
  -o data/rasters/raw/soil_soilgrids_250m_raw.tif
  
# Processing
gdalwarp -t_srs EPSG:32633 \
  data/rasters/raw/soil_soilgrids_250m_raw.tif \
  data/rasters/processed/soil_epsg32633_processed.tif
```

**Correct attributes:**
- Real soil properties from ISRIC SoilGrids v2.0
- Variable values reflecting actual conditions
- Proper provenance and metadata
- Suitable for model training

**Metadata shows:**
```json
{
  "name": "soil_soilgrids_250m",
  "source": "ISRIC SoilGrids v2.0 250m",
  "provider": "ISRIC - World Soil Information",
  "url": "https://soilgrids.org/",
  "fetch_tool": "soilgrids_fetch",
  "bands": [
    {"name": "clay", "units": "g/kg"},
    {"name": "sand", "units": "g/kg"},
    {"name": "soc", "units": "g/kg"},
    {"name": "bdod", "units": "kg/dm³"}
  ],
  "validation_status": "passed"
}
```

**Statistics confirm real data:**
```
Band 1 (clay):  Min=0,   Max=471,  Mean=256, StdDev=174
Band 2 (sand):  Min=0,   Max=299,  Mean=116, StdDev=81
Band 3 (soc):   Min=0,   Max=860,  Mean=320, StdDev=219
Band 4 (bdod):  Min=0,   Max=140,  Mean=87,  StdDev=59
```

---

## 🚨 CONSEQUENCES OF VIOLATION

### For Development

- Training process will FAIL validation
- Models will be flagged as INVALID
- Route outputs will be marked UNRELIABLE
- All affected work must be redone

### For Production

- Routes generated with placeholder data are **NOT APPROVED** for client delivery
- Documentation must explicitly state if any data is missing or of lower quality
- Client must be informed of data limitations BEFORE route presentation
- Engineering sign-off CANNOT be granted for routes with placeholder data

### For Project Approval

A project CANNOT proceed to training unless:
- ✅ All 13 critical datasets are present
- ✅ All datasets pass validation
- ✅ All datasets have real, authoritative source data
- ✅ Zero placeholder or synthetic datasets detected

---

## 📚 DATASET ACQUISITION GUIDE

### If Real Data is Unavailable

**Option 1: Use Alternative Source**
- Try different provider for same data type
- Example: If SoilGrids fails, try FAO soil maps

**Option 2: Use Lower Resolution**
- Real 1km data is better than fake 100m data
- Document resolution limitation in metadata

**Option 3: Use Regional Substitute**
- National dataset may be better than global
- Ensure coverage of AOI

**Option 4: Mark as Missing**
- Create metadata file stating dataset is unavailable
- Document impact on model accuracy
- Implement fallback behavior in code
- **DO NOT** create fake data to fill the gap

### Recommended Data Sources

**Elevation (DEM):**
- Copernicus DEM 30m (global, free)
- SRTM 30m (global, free)
- TINITALY 10m (Italy, free)
- ALOS World 3D 30m (global, free)

**Soil Properties:**
- ISRIC SoilGrids v2.0 250m (global, free) ✓ IMPLEMENTED
- FAO Harmonized World Soil Database (global, free)
- National soil surveys (variable resolution)

**Land Cover:**
- ESA WorldCover 10m (global, free)
- USGS NLCD 30m (USA, free)
- Corine Land Cover (Europe, free)

**Population:**
- WorldPop 100m (global, free)
- GHS-POP (global, various resolutions)

**Geohazards:**
- GEM Global Seismic Hazard Map (global, coarse)
- INGV seismic maps (Italy, higher resolution)
- National geological survey hazard maps

**Infrastructure:**
- OpenStreetMap (global, variable quality)
- National infrastructure databases
- Utility company datasets (when available)

---

## ✅ COMPLIANCE CHECKLIST

Before starting training, verify:

- [ ] All critical datasets (13) are present
- [ ] All datasets have non-zero standard deviation
- [ ] All datasets have proper source attribution
- [ ] All datasets fetched via official tools
- [ ] All raw files exist in `raw/` directories
- [ ] All metadata JSONs are complete
- [ ] Validation script returns "status": "ok"
- [ ] No datasets flagged as "placeholder" or "synthetic"
- [ ] Manual review conducted if any warnings
- [ ] Engineering sign-off obtained

---

## 📞 REPORTING VIOLATIONS

If you discover placeholder data in production:

1. **Immediately flag** the affected project
2. **Halt training** or route generation
3. **Document** the violation
4. **Replace** with real data
5. **Re-validate** the complete dataset
6. **Re-train** the model (if applicable)
7. **Update** all affected documentation

---

## 🔄 REVISION HISTORY

| Version | Date       | Changes                                  |
|---------|------------|------------------------------------------|
| 1.0     | 2025-10-28 | Initial policy created                   |
|         |            | Placeholder data absolutely prohibited   |
|         |            | Real SoilGrids data implemented          |

---

**REMEMBER: Real data is the foundation of reliable AI. No shortcuts, no compromises.**


