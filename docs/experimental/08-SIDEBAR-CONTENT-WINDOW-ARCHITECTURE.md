# GUI‑v2 Navigation & “Content Window” Architecture (Current + Safe Evolution)

**Status:** Active  
**Last updated:** 2026-01-02  
**Purpose:** Document the real GUI‑v2 navigation model and define an incremental evolution path that won’t break existing workflows.

---

## 0) Current state (what is implemented)

GUI‑v2 currently uses:

- A persistent sidebar navigation with high-value workflow entry points.
- A main content area that switches between three views:
  - **Map View** (default)
  - **Project Management** (resources/suppliers)
  - **Digital Twin**
- Complex workflows are opened as dialogs rather than changing the main content view.

This model is stable and already supports:

- datasets workflow,
- routing workflow,
- digital twin viewer,
- project profile.

---

## 1) Current sidebar items (as of today)

These are the meaningful “phases” we already expose:

- Project Profile (metadata + CRS + regulatory docs viewer)
- Map View
- Project Management (resources/suppliers visualization)
- Digital Twin (UE5 Pixel Streaming viewer)
- Datasets (coverage + readiness + fetch jobs)
- PIRL AI (routing status + outputs tooling)
- Settings

---

## 2) The “Phase Hub” concept (historical proposal)

Earlier versions of this experimental folder proposed a “Phase Hub” where clicking a sidebar item replaces the map with a grid of tool buttons.

That concept is **not implemented** in GUI‑v2 today.

Important: adopting it now would be a risky navigation refactor that could break:

- existing modal workflows,
- map-centric interaction patterns,
- onboarding flows.

Therefore: **do not require Phase Hub for FEED gap closure**.

---

## 3) Safe evolution path (recommended)

### 3.1 Keep the current navigation, add deliverables as additive tools

To close FEED/pre‑construction gaps:

- Add a **Deliverables** dialog (optional) accessible from:
  - route context menu
  - PIRL tooling
- Keep map view intact and keep existing buttons stable.

### 3.2 If Phase Hub is ever revived, treat it as a separate project

Phase Hub can be revisited later as a pure UI refactor, after:

- alignment sheets v1 is stable,
- deliverables pipeline is persisted and auditable,
- we have time to run UX regression testing.

---

## 4) Compatibility rules for navigation changes (non-negotiable)

1. No breaking changes to existing sidebar items or routes.
2. New features should be introduced via dialogs/panels first.
3. Any future “Phase Hub” must be feature-flagged and rolled out gradually.






