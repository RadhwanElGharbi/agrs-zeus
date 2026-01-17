# ZEUS GUI‑v2 Experimental Roadmap (2026) — Closing FEED & Pre‑Construction Gaps

**Status:** Active (this folder is a living design/spec set)  
**Last updated:** 2026-01-02  
**Audience:** Pipeline engineers, product, and implementation engineers  
**Scope:** Onshore pipeline engineering from **pre‑feasibility → FEED → pre‑construction** (deliverables-focused)  

---

## Why this folder exists

`/opt/agrs/docs/experimental` is where we keep *forward-looking* plans **that are still required to be compatible with the current product**.

- These docs must stay aligned with **what is actually implemented** in GUI‑v2.
- They are allowed to be ambitious, but must include **integration constraints** so work can be executed incrementally without breaking existing flows.

---

## Current product reality (GUI‑v2 snapshot)

### Architecture

- **Frontend**: Electron + Next.js (React) in `gui-v2/frontend/`
- **Backend**: FastAPI in `gui-v2/backend/`
- **Data model**: Filesystem‑based projects under `/opt/agrs/Projects/<PROJECT>/` (no DB required for core workflows)

### Implemented “Phase 1” capabilities (already working)

1. **Project creation + AOI** (upload/draw, start/end, CRS recommendation)
2. **Dataset readiness + automated fetch jobs** (with background progress + SSE/polling)
3. **Map viewer** with raster tiles, vectors, DEM terrain, styling, attribute tables
4. **Routing outputs consumption**
   - PIRL routes + sidecar metadata (cost breakdown, constraint compliance, crossings)
   - Route comparison + route profile (DEM/landcover)
   - Earthworks (cut/fill + mass haul)
5. **Alignment sheets API exists** and is wired in the UI (currently “v0”, not FEED/IFC‑grade)
6. **Optional explainability** via agentic service proxy + map panels
7. **Digital Twin viewer (UE5 Pixel Streaming)** is present (ops-oriented, external dependency)

### Immediate gap (what blocks end‑to‑end)

For FEED/pre‑construction we need **deliverable‑grade outputs** (drawings + registers + quantities), and a coherent “deliverables pipeline” that:

- Uses the current project structure and APIs
- Produces deterministic, reviewable artifacts
- Is template‑driven (client/company formats)
- Degrades gracefully when some datasets are missing

The first hard gap to close: **Alignment Sheets Generator (FEED / pre‑construction)**.

---

## Definition of “complete enough” by stage (deliverables)

### Pre‑feasibility (screening)

Minimum acceptable ZEUS outputs:

- Route alternatives with comparison (length, crossings, cost basis)
- Terrain + landcover profile
- Earthworks screening (order-of-magnitude cut/fill)
- Crossing register (counts + basic classification)

### FEED (engineering definition)

Minimum acceptable ZEUS outputs:

- **Alignment sheets (plan/profile)** with stationing and match lines
- Crossing register with attributes + stationing (roads/rails/water/power/pipelines)
- Earthworks report suitable for estimate refinement (assumptions explicit)
- Traceable parameters (pipeline specs, ROW width, cover, constraints)

### Pre‑construction (IFC / construction package inputs)

Minimum acceptable ZEUS outputs (first tranche):

- Issued drawing set (alignment sheets with revisions and title block control)
- Construction “route book” (KM/KP tables, key crossings, access notes placeholders)
- Export packages (PDF + structured JSON/CSV registers)

> NOTE: Full IFC typically also requires class location, valve spacing design, detailed crossing design packages, and full MTO/BOM. Those are planned but not required for “gap closure v1”.

---

## Roadmap (gap closure first, without breaking current UX)

### Milestone A — Alignment Sheets v1 (FEED-grade)

Deliver:

- A template‑driven alignment sheet generator that outputs:
  - **Plan + profile sheets** with stationing, match lines, scale bars, north arrow, title block, revision block
  - Crossing register (embedded + export)
  - Sheet index (export)
- Persist outputs into project deliverables folder (not only “download blob”)
- UI entry points remain **compatible with current**:
  - Keep the existing “Alignment Sheets” actions in PIRL tooling
  - Add (optional) deliverables viewer without removing current download flow

See: `02-PHASE2-EPC-DESIGN.md` (re-scoped to FEED deliverables).

### Milestone B — Deliverables pipeline foundation

Deliver:

- A standardized deliverables storage layout under project root:
  - `Deliverables/alignment_sheets/<route>/<preset-or-template>/...`
  - `Deliverables/manifest.json` (what was generated, by whom, when, input hashes)
- Backward-compatible API extensions (do not break current endpoints):
  - Keep `/api/alignment-sheets/*` working
  - Add optional parameters and/or new endpoints under `/api/projects/{project}/deliverables/*`

### Milestone C — FEED add-ons (post alignment sheets)

Deliver:

- Crossing register export CSV/GeoPackage (with attributes and recommended method placeholders)
- Earthworks summary export (assumptions explicit, parameters saved)
- Route book v1 (PDF + CSV) for review/field planning

---

## Compatibility rules (non-negotiable)

1. **Do not break existing GUI‑v2 routes or dialogs.**
2. **Do not rename or relocate existing project folders** used by current backend discovery.
3. **Additive APIs only** (new endpoints or optional params; no breaking changes).
4. **Graceful degradation** if a layer is missing:
   - Sheets must still generate, with explicit “DATA NOT AVAILABLE” placeholders.
5. **Determinism for deliverables**:
   - Generation inputs and versions must be recorded; PDFs should be reproducible.

---

## Where to start reading

- `01-PHASE1-PLANNING-TOOL.md` — current planning capabilities + remaining gaps
- `02-PHASE2-EPC-DESIGN.md` — FEED/pre‑construction deliverables plan (**alignment sheets spec**)
- `05-TESTING-FRAMEWORK.md` — deliverables QA/testing requirements (PDF + metadata)
- `06-UI-INTEGRATION.md` — how to integrate deliverables in current GUI‑v2 without breaking UX
- `09-PIRL-EXPLAINABILITY-IMPLEMENTATION.md` — explainability status vs. plan (kept compatible with agentic proxy)






