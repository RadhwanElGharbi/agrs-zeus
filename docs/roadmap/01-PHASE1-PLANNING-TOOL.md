# Phase 1 (Planning): Current Capability Baseline + Remaining Gaps (GUI‑v2)

**Status:** Active  
**Last updated:** 2026-01-02  
**Goal:** Document what GUI‑v2 already delivers for planning, and what must still be added before FEED deliverables can be trusted.

---

## 1) What “Planning” means for ZEUS (onshore pipelines)

Planning = turning a project AOI + start/end + datasets into:

- A short list of candidate corridors/routes
- A defendable comparison across cost/constraints/crossings/constructability proxies
- A selected preferred route with documented assumptions

In ZEUS, planning outputs are primarily **GIS-derived** (terrain, landcover, crossings) plus **PIRL route alternatives** and derived analytics.

---

## 2) What is already implemented in GUI‑v2 (today)

### 2.1 Project setup + geometry

- Create projects with AOI upload/draw + start/end points.
- CRS recommendation and CRS update.

### 2.2 Dataset readiness + acquisition (core strength)

- Dataset readiness is standardized and visible in the GUI.
- Dataset fetch pipeline runs as background jobs with progress streaming.
- The pipeline is designed to populate `data/rasters/processed` and `data/vectors/processed` under each project.

### 2.3 Route ingestion + route analytics (practical)

GUI‑v2 already supports:

- Loading PIRL route outputs from `Projects/<project>/PIRL/outputs/*.geojson`
- Route metadata sidecars when present (`*.metadata.json`), including:
  - Cost breakdown (base/terrain/landcover/crossings)
  - Constraint compliance flags (slope, built-up, water)
  - Crossing counts by type

### 2.4 Comparison + profiling

- Route comparison dialog (cost/crossings/constraint compliance if metadata exists).
- Route profile extraction from raster sampling:
  - Elevation profile
  - Landcover profile

### 2.5 Earthworks screening (strong early constructability proxy)

- Earthworks endpoint computes cut/fill and mass-haul style balance using DEM sampling.
- Parameters are adjustable in UI (ROW width, grading slope).

### 2.6 Explainability (optional, already integrated)

- Backend includes an **agentic proxy** (FastAPI routes) to a separate explainability service.
- Frontend can request segment explanations and show rationale panels when the agentic service is running.

---

## 3) What is NOT yet “planning complete” (known gaps)

These gaps don’t block route screening, but they do block *FEED defensibility* if left unaddressed.

### 3.1 Hydraulics and station planning are not integrated end‑to‑end

Current state:

- Pipeline specs can store hydraulics-related fields.
- There is no validated hydraulics solver workflow integrated into the planning UI/API.

Impact:

- Route selection may ignore pressure drop / compression needs / delivery constraints.

### 3.2 Regulatory/compliance is not a first-class computed output

Current state:

- Regulatory docs can be viewed, but there is no rule engine producing a compliance register per route.

Impact:

- We cannot produce a route book or FEED package that claims compliance beyond what is encoded in PIRL metadata.

### 3.3 Cost estimates depend on metadata sidecars (not deterministic from datasets)

Current state:

- Some routes have detailed `*.metadata.json` computed elsewhere.
- The GUI can display these values; it does not (yet) recompute them deterministically from current datasets + parameters.

Impact:

- Comparisons can be inconsistent across projects/routes if sidecar generation differs.

### 3.4 Route authoring/editing is minimal

Current state:

- GUI‑v2 is excellent at *consuming* routes (PIRL outputs), but not yet an alignment authoring tool.

Impact:

- For FEED/pre‑construction, engineering needs controlled edits (station equations, bend controls, tie-in points, etc.).

---

## 4) Planning → FEED “entry criteria” (what must be true before we generate deliverables)

Before generating FEED/pre‑construction deliverables (alignment sheets, crossing registers), ZEUS must enforce:

- **Dataset minimums**:
  - DEM present for profile/earthworks
  - Basemap imagery available (online or cached)
  - Roads/railways/waterways/powerlines layers present (or explicit gaps)
- **Route geometry sanity**:
  - Single continuous centerline (or explicitly segmented with stationing rules)
  - CRS known and consistent with datasets
- **Pipeline specs sanity**:
  - Diameter, cover, product type present (even if defaults)

These criteria are validated/consumed by the deliverables pipeline in Phase 2.

---

## 5) Deliverables coming out of Phase 1 (today vs. next)

### Today

- Route selection support (comparison + profile + earthworks)
- Downloadable alignment sheets **(v0)** exists but is not FEED/IFC grade

### Next (Phase 1.5 — small but high leverage)

- Standardized “route screening report” JSON/CSV export (per route)
- Deterministic regeneration of cost/crossings from current datasets (no sidecar dependency)

---

## 6) Integration constraints (do not break current functionality)

- Keep the current PIRL route discovery (`PIRL/outputs/*.geojson`) and metadata sidecars.
- Treat new computed outputs as **additive sidecars**, e.g.:
  - `route_x.feasibility.json`
  - `route_x.crossings.csv`
  - `route_x.earthworks.json`
- Never require the agentic explainability service for core UX (optional enhancement only).



















