# Fetch Tools Implementation Roadmap

**Date**: October 12, 2025  
**Status**: Research Complete, Ready for Implementation  
**Purpose**: Guide for implementing 12 missing fetch tools

---

## ✅ Research Complete

All implementation guides have been generated using Perplexity AI research:

### High Priority Tools (Global Coverage)

1. **WorldClim** (`worldclim_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/WorldClim_Implementation.md`
   - Complexity: ⭐ Easy (direct download)
   - Est. Time: 30-45 minutes

2. **MODIS** (`modis_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/MODIS_Implementation.md`
   - Complexity: ⭐⭐ Medium (GEE-based, similar to existing tools)
   - Est. Time: 1 hour

3. **HydroSHEDS** (`hydrosheds_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/HydroSHEDS_Implementation.md`
   - Complexity: ⭐⭐ Medium (tile-based download)
   - Est. Time: 1-1.5 hours

4. **ERA5** (`era5_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/ERA5_Implementation.md`
   - Complexity: ⭐⭐⭐ Complex (CDS API setup, NetCDF handling)
   - Est. Time: 2 hours

5. **FAO Soil** (`fao_soil_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/FAO_Soil_Implementation.md`
   - Complexity: ⭐⭐ Medium
   - Est. Time: 1 hour

6. **Global Seismic Hazard** (`seismic_hazard_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/Global_Seismic_Hazard_Implementation.md`
   - Complexity: ⭐⭐ Medium
   - Est. Time: 1 hour

### Italy-Specific Tools

7. **EUAP** (`euap_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/EUAP_Implementation.md`
   - Complexity: ⭐⭐ Medium
   - Est. Time: 45 minutes

8. **IFFI** (`iffi_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/IFFI_Implementation.md`
   - Complexity: ⭐⭐ Medium
   - Est. Time: 45 minutes

9. **Italian Soil** (`italian_soil_fetch`)
   - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/Italian_Soil_Implementation.md`
   - Complexity: ⭐⭐ Medium (Zenodo API)
   - Est. Time: 1 hour

10. **ISTAT Boundaries** (`istat_boundaries_fetch`)
    - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/ISTAT_Boundaries_Implementation.md`
    - Complexity: ⭐ Easy
    - Est. Time: 30 minutes

11. **CORINE Italy** (`corine_italy_fetch`)
    - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/CORINE_Italy_Implementation.md`
    - Complexity: ⭐⭐ Medium
    - Est. Time: 1 hour

12. **Copernicus EEA-10** (`copernicus_eea10_fetch`)
    - Research: `/opt/agrs/docs/Perplexity/Fetch_Tools/Copernicus_EEA10_Implementation.md`
    - Complexity: ⭐⭐⭐ Medium-Complex (OAuth2, similar to existing Copernicus tool)
    - Est. Time: 1.5 hours

---

## Implementation Strategy

### Phase 1: Quick Wins (2-3 hours)
Implement the easiest tools first to build momentum:
1. WorldClim (30 min)
2. ISTAT Boundaries (30 min)
3. EUAP (45 min)
4. IFFI (45 min)

**Outcome**: 4 new tools, covering climate and Italian datasets

### Phase 2: Medium Complexity (4-5 hours)
Implement medium-difficulty tools:
5. MODIS (1 hour) - leverage existing GEE infrastructure
6. HydroSHEDS (1 hour)
7. FAO Soil (1 hour)
8. Global Seismic Hazard (1 hour)
9. Italian Soil (1 hour)
10. CORINE Italy (1 hour)

**Outcome**: 6 more tools, covering hydrology, soil, seismic, and land cover

### Phase 3: Complex Tools (3-4 hours)
Implement the most complex tools:
11. ERA5 (2 hours) - requires CDS API setup
12. Copernicus EEA-10 (1.5 hours) - requires OAuth2

**Outcome**: Final 2 tools, completing the suite

### Total Estimated Time: 9-12 hours

---

## Implementation Template

Each tool implementation should follow this pattern:

```cpp
// In Tools.cpp

int tools_TOOLNAME_fetch(
    const std::string& bbox_or_country,
    const std::string& output,
    // ... additional parameters
    bool overwrite
) {
    // 1. Validate inputs
    if (fs::exists(output) && !overwrite) {
        std::cerr << "Error: Output exists. Use --overwrite" << std::endl;
        return 1;
    }
    
    // 2. Setup Python environment
    std::string pythonBin = "/usr/bin/python3";
    std::string venvDir = "/tmp/TOOLNAME_venv";
    
    // Create venv if needed
    // Install dependencies
    
    // 3. Embedded Python script
    std::string script = R"SCRIPT(
import sys
# ... implementation based on Perplexity research
)SCRIPT";
    
    // 4. Execute Python script
    std::string cmd = pythonBin + " -c \"" + script + "\" ...";
    int rc = std::system(cmd.c_str());
    
    // 5. Generate JSON metadata
    // ...
    
    return rc;
}
```

---

## Next Steps

1. ✅ **Research Complete** - All implementation guides generated
2. ⏳ **Choose Priority** - Start with Phase 1 (quick wins) or user-specified priority
3. ⏳ **Implement Tools** - Follow research guides and template
4. ⏳ **Test & Validate** - Ensure each tool works globally/regionally
5. ⏳ **Document** - Update inventory with validation status

---

## Success Criteria

For each tool to be marked as complete:
- ✅ Code implemented in Tools.cpp
- ✅ Registered in CLI
- ✅ Tested on sample AOI
- ✅ Generates valid output
- ✅ Creates JSON metadata sidecar
- ✅ Handles errors gracefully
- ✅ Documented in inventory

---

**Ready to proceed**: All research complete, implementation can begin immediately.

**Recommendation**: Start with **WorldClim** (easiest, 30 minutes) to validate the workflow.

