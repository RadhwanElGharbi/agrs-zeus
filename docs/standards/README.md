# Project Instructions

**Location:** `/opt/agrs/docs/Project Instructions/`  
**Status:** MANDATORY for all new projects  
**Last Updated:** 2025-10-17

---

## 📋 **PURPOSE**

This directory contains the **mandatory project initialization standard** for all AGRS geospatial projects, particularly oil & gas pipeline routing projects.

---

## 📄 **DOCUMENTS**

### `PROJECT_STRUCTURE_STANDARD.md`
**The authoritative guide** for project structure, workflow, and quality assurance.

**Key Requirements:**
1. **Project Structure** - Mandatory directory layout under `/opt/agrs/Projects/<PROJECT_NAME>/`
2. **AOI & CRS Definition** - Explicit coordinate system and measurement units
3. **Phase 2: Data Acquisition** - 3-step mandatory workflow:
   - **Step 1: Coverage Assessment** - Run Fetch Tool Analyzer ✨ **NEW**
   - **Step 2: Perplexity Research** - AOI intelligence gathering
   - **Step 3: Dataset Fetching** - Automated + manual data acquisition
4. **Data Management** - JSON sidecars, reprojection, validation
5. **Logging** - All operations logged for reproducibility

---

## ⚡ **CRITICAL UPDATE: Phase 2, Step 1**

**As of 2025-10-17**, all new projects must run the **Fetch Tool Analyzer** immediately after AOI acquisition:

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>

# Step 1: Assess dataset coverage
zeus tools analyze_fetch_tools --mode readiness
zeus tools analyze_fetch_tools --mode country --country <COUNTRY_CODE>
zeus tools analyze_fetch_tools --mode all --output logs/coverage_assessment.json
```

**Purpose:**
- Identify automated vs. manual data acquisition requirements
- Assess project feasibility based on available datasets
- Document data gaps early in project lifecycle
- Prioritize data acquisition efforts

**Outputs:**
- `logs/coverage_assessment.json` - Machine-readable coverage report
- Documentation in `docs/data_sources.md`
- List of manual acquisition requirements

---

## 🎯 **QUICK START**

For a new pipeline routing project:

1. **Phase 1: Initialization**
   ```bash
   mkdir -p /opt/agrs/Projects/<PROJECT_NAME>/{aoi,data/{vectors,rasters,raw},derived,outputs,logs,docs}
   # Place AOI file in aoi/ directory
   # Create project_metadata.json with CRS definition
   ```

2. **Phase 2, Step 1: Coverage Assessment** ✨ **NEW**
   ```bash
   cd /opt/agrs/Projects/<PROJECT_NAME>
   zeus tools analyze_fetch_tools --mode all --output logs/coverage_assessment.json
   # Review coverage report
   # Document gaps in docs/data_sources.md
   ```

3. **Phase 2, Step 2: Perplexity Research**
   ```bash
   # Run comprehensive AOI intelligence research
   # Document regulatory authorities, stakeholders, permitting
   # Save all research to docs/perplexity_research/
   ```

4. **Phase 2, Step 3: Dataset Fetching**
   ```bash
   # Fetch all datasets identified in coverage assessment
   zeus tools dem_fetch --aoi aoi/aoi.geojson -o data/rasters/dem.tif
   zeus tools landcover_fetch --aoi aoi/aoi.geojson -o data/rasters/landcover.tif
   # ... (continue for all categories)
   ```

5. **Phase 3+: Processing, Validation, Analysis**
   - Follow standard workflow in `PROJECT_STRUCTURE_STANDARD.md`

---

## 📊 **COMPLIANCE**

Before proceeding to analysis, verify:
- ✅ Project follows mandatory directory structure
- ✅ Coverage assessment completed and documented
- ✅ All Perplexity research completed (for O&G projects)
- ✅ All datasets fetched, reprojected, clipped
- ✅ JSON sidecars created for all datasets
- ✅ All operations logged
- ✅ Quality assurance checklist complete

---

## 🔗 **RELATED DOCUMENTATION**

- `/opt/agrs/docs/FETCH_TOOL_ANALYZER.md` - Fetch Tool Analyzer guide
- `/opt/agrs/data/docs/DATASET_INVENTORIES_COMPLETE.md` - Dataset inventory summary
- `/opt/agrs/docs/INTELLIGENT_ROUTING_TOOLS_COMPLETE.md` - Intelligent routing system

---

## 📝 **NOTES**

- These standards are **MANDATORY** - exceptions require approval
- The Fetch Tool Analyzer step (Phase 2, Step 1) was added on 2025-10-17
- All team members must be familiar with `PROJECT_STRUCTURE_STANDARD.md`
- Updates to standards are versioned and tracked in revision history

---

**Status:** ✅ ACTIVE  
**Applies To:** All AGRS geospatial projects  
**Next Review:** 2026-10-11



