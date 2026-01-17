# UI/UX Integration Guidelines (GUI‑v2, Deliverables-Focused)

**Status:** Active  
**Last updated:** 2026-01-02  
**Goal:** Add FEED/pre‑construction deliverables (alignment sheets + registers) into GUI‑v2 without breaking existing workflows.

---

## 0) Current GUI‑v2 navigation reality (must be respected)

GUI‑v2 is not currently organized as “Phase Hub → tools grid”. It is:

- A persistent **Sidebar** + **Header**
- A main content area that switches between:
  - **Map View** (default)
  - **Project Management** (resources/suppliers view)
  - **Digital Twin**
- Key workflows are implemented as **dialogs** opened from the sidebar:
  - Project profile
  - Dataset coverage/fetch
  - PIRL AI dialog

This architecture is already working and must not be destabilized for the deliverables rollout.

---

## 1) Principles for adding deliverables

### 1.1 Keep the user in map context

Alignment sheets are derived from a route. Routes live in map context.

Therefore:

- Entry point should be route-centric (context menu / route manager)
- Deliverables should not force a full navigation overhaul

### 1.2 Progressive disclosure

Default UI should show:

- “Generate alignment sheets” + a short preview (sheet count, scales)

Advanced options should be tucked away:

- template selection
- page size
- stationing format
- included bands/layers

### 1.3 Backward compatibility

The existing UI already supports alignment sheets preview + PDF download. Maintain this flow and add improvements incrementally:

- add “persist to project deliverables” behind the scenes
- add a deliverables browser/viewer later

---

## 2) Recommended UI entry points (do not break anything)

### 2.1 Route context menu (preferred)

Keep the existing “Alignment Sheets” action under route context menu (PIRL route manager).

Additive improvements:

- show template selector (optional)
- add “Open in viewer” after generation

### 2.2 PIRL AI dialog (secondary)

If the PIRL AI dialog is used as the “route operations console”, it can also host:

- alignment sheets generation for a selected output route

Do not duplicate complex configuration across both entry points; share the same component.

---

## 3) Recommended UI components for deliverables

### 3.1 `DeliverablesDialog` (future but safe)

A single dialog that:

- lists persisted outputs in `Projects/<project>/Deliverables/`
- filters by route and deliverable type
- provides view/download actions

This can be added without changing existing navigation.

### 3.2 `PDFViewerDialog` (optional)

If we want in-app preview:

- Use a modal dialog that embeds a PDF renderer (or native `<embed>`/`iframe` first)
- Keep “Download PDF” as a button to preserve current behavior

---

## 4) State management and data access (do not fight existing patterns)

### Use existing project state

GUI‑v2 already has a project context that provides:

- `currentProject`
- datasets + metadata
- refresh hooks
- dataset job status patterns

Deliverables UI should follow the same pattern:

- load deliverables list when dialog opens
- refresh project data after deliverable generation if needed

### Avoid a navigation rewrite

Do not implement a new global “phase hub” store as part of alignment sheets delivery.
That’s a separate refactor and is not required to close the FEED deliverables gap.

---

## 5) UX requirements for alignment sheets v1

- **Preview-first**: show expected sheet count and key settings before generating
- **Clear error messages**: missing DEM / missing route / imagery failure must be explicit
- **Backgroundability**: generation can take time; allow “run in background” pattern similar to dataset jobs (optional)
- **Auditability**: when persisted outputs exist, show “Generated on …” and “Inputs …” from manifest






