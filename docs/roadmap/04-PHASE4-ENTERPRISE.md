# Phase 4 (Enterprise): Deferred Roadmap (Aligned to Current GUI‑v2)

**Status:** Deferred (explicitly out of scope for FEED/pre‑construction gap closure)  
**Last updated:** 2026-01-02  

---

## 0) Why this is deferred

Enterprise concerns (multi-tenant RBAC, collaboration, ERP/DMS connectors) are valuable, but they do not close the immediate engineering gap:

- **deliverable-grade FEED outputs**, especially alignment sheets.

Also, the current product model is filesystem‑based projects, which is a feature: it simplifies deployment and keeps workflows transparent.

---

## 1) Current state (what exists today)

GUI‑v2 has:

- basic demo authentication (sufficient for demos, not for enterprise)
- filesystem-backed project discovery and metadata
- analytics logging (non-enterprise-grade)

---

## 2) What becomes “enterprise-ready” later (high level)

When Phase 4 is activated, define it as:

- **Identity + access**: real RBAC, audit trails, secure credential handling
- **Collaboration**: review workflows, comments/markup, change tracking
- **Integration**: export to document management, publish to GIS, procurement integration

---

## 3) Compatibility rules (future execution)

When implementing enterprise features:

1. Preserve the on-disk project format as a supported “single-user / offline” mode.
2. Add enterprise storage backends **as an option**, not a requirement.
3. Never remove local project support; instead provide sync/replication layers.



















