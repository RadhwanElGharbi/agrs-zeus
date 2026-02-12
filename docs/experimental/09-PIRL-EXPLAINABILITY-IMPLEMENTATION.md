# Routing Explainability (GUI‑v2): Current Implementation + Next Steps

**Version:** 3.0  
**Last updated:** 2026-01-02  
**Status:** Partially implemented (agentic explainability is live; crossing-method A* is future)  

---

## 0) Why explainability matters

For EPCs/operators, route selection must be defensible:

- “Why did you choose this corridor?”
- “Where are the critical crossings and what drove the choice?”
- “What constraints were violated or traded off?”

Explainability also reduces rework during FEED because it makes assumptions visible early.

---

## 1) What is implemented today (GUI‑v2)

### 1.1 Agentic explainability service integration (optional)

GUI‑v2 backend includes a proxy router to an external “agentic framework” service:

- The agentic service is expected to run separately (default `http://localhost:8001`)
- The GUI‑v2 backend proxies calls under `/api/agentic/*`

Implemented proxy endpoints include:

- `GET /api/agentic/health`
- `GET /api/agentic/routes?project=<project>`
- `GET /api/agentic/routes/{route_id}`
- `GET /api/agentic/routes/{route_id}/segments?...`
- `GET /api/agentic/routes/{route_id}/segments/geometry?project=...`
- `POST /api/agentic/explain` (segment explanation)

### 1.2 Frontend explainability UX (map-centric)

GUI‑v2 Map View includes:

- selection of routes/segments
- calls into agentic explain endpoints
- explanation/decision panels

Important: explainability is **optional**. If agentic is down, planning workflows still work.

---

## 2) What is not implemented yet (and why)

### 2.1 Crossing method optimization inside routing (C++/A* future)

There is no integrated “crossing method selection during pathfinding” in the current GUI‑v2 stack.

If/when added, it lives in the routing engine layer (likely C++ core), not purely in the GUI.

This is valuable, but it is not the first blocker for FEED deliverables. For gap closure:

- alignment sheets v1 can still be generated with a deterministic crossings register
- crossing method can remain “unknown / suggested” until engineering rules are available

---

## 3) Explainability artifacts (file structure)

Today we already support:

- `PIRL/outputs/<route>.metadata.json` (when produced by upstream tooling)

Proposed additive artifact (future):

- `PIRL/outputs/<route>.decisions.json`

This file would contain a standardized audit trail for:

- segment scoring drivers
- key constraints
- crossing decisions (if/when available)

---

## 4) Integration with deliverables (alignment sheets)

Alignment sheets should link to explainability artifacts:

- crossing IDs in the drawing should map to crossing register rows
- if `<route>.decisions.json` exists, the crossing table can include:
  - “recommended method”
  - “rationale reference”

Rule: deliverables must still generate without explainability artifacts.

---

## 5) Next steps (after deliverables v1)

1. Standardize decision schema for `*.decisions.json`
2. Add a backend endpoint to serve decision logs:
   - `GET /api/projects/{project}/routes/{route}/decisions`
3. Add a “Why this route?” export:
   - a short summary PDF/markdown for client-facing justification



















