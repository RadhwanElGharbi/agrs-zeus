# AI Strategy (Realistic, Deliverables-Safe)

**Status:** Active  
**Last updated:** 2026-01-02  
**Goal:** Use AI where it adds value *without reducing auditability*, especially for FEED deliverables.

---

## 0) Principle: AI may suggest, but engineering deliverables must be traceable

For FEED/pre‑construction, AI must not turn drawings into “black box outputs”.

Rules:

- AI can propose **options** (labels, classifications, suggested methods).
- The deliverables generator must remain deterministic and must record:
  - what the AI suggested,
  - what was accepted/overridden,
  - the inputs used.

---

## 1) What AI is already doing in the product

### 1.1 PIRL route generation (core differentiator)

- Routes are generated as outputs consumed by GUI‑v2.
- Metadata sidecars (when present) already include cost breakdowns and constraint compliance summaries.

### 1.2 Explainability (optional)

- An external “agentic” service can explain segments and provide rationale panels in the map UI.
- This is additive and should remain optional.

### 1.3 Supplier research (optional, credential-dependent)

- Supplier discovery uses AI-powered research and produces structured supplier profiles for a project.

---

## 2) Where AI helps most for FEED/pre‑construction (near-term)

### 2.1 Alignment sheets annotations (assistive)

AI can help with:

- cleaning/standardizing crossing names (OSM attributes can be messy)
- classifying road types into drawing symbology categories
- drafting notes blocks from detected constraints (“wetland proximity”, “rail crossing”)

But:

- the drawing must still render even when AI is off
- AI output must be stored as structured sidecar content (not baked only into PDF)

### 2.2 Crossing method suggestion (assistive, not authoritative)

AI can suggest a likely method (“HDD likely required”) based on:

- crossing type + width class
- landcover/terrain
- project constraints in pipeline specs

But:

- it must be labeled as a suggestion
- it must not be treated as a computed engineering decision unless a deterministic rules engine validates it

---

## 3) Where AI is NOT the right first move (for gap closure)

For closing the immediate FEED deliverables gap, AI is not a substitute for:

- correct stationing and sheet cutting
- deterministic crossing detection and stationing
- title block + revision control
- manifest and reproducibility guarantees

These are foundational and must be implemented deterministically first.

---

## 4) Implementation posture (safe rollout)

1. Build deterministic deliverables pipeline (Alignment Sheets v1).
2. Add AI-assisted annotations behind a feature flag.
3. Record AI suggestions in the deliverables manifest and exports.



















