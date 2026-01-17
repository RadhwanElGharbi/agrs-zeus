# Phase 3 (Operations): Deferred Roadmap (Aligned to Current GUI‑v2)

**Status:** Deferred (do not execute until FEED deliverables are production-ready)  
**Last updated:** 2026-01-02  

---

## 0) Why this is deferred

Operations features (SCADA, integrity, leak detection) are a different product class than FEED/pre‑construction deliverables.

Until we can produce **deliverable‑grade drawing/register outputs** (alignment sheets, crossing registers, etc.), adding operations scope risks:

- diluting engineering value,
- increasing integration complexity,
- creating UX fragmentation.

---

## 1) What exists today (GUI‑v2)

### Digital Twin Viewer (UE5 Pixel Streaming)

GUI‑v2 includes a Digital Twin view that can connect to an external UE5 Pixel Streaming server.

Important constraints:

- It is **not** a full operational digital twin (no live process data integration).
- It is an integration shell that can receive “project context” and display a streamed scene.

---

## 2) What “Operations” would mean in ZEUS (future)

When Phase 3 is activated, it should be defined as:

- **Monitoring**: ingest telemetry, visualize state, alarms
- **Integrity**: manage ILI/anomaly data and risk scoring
- **Leak detection**: CPM workflows with event triage and response tracking

---

## 3) Compatibility rules (future execution)

If/when Phase 3 is built, it must:

1. Reuse the existing project model and deliverables manifests where applicable.
2. Avoid breaking the existing planning/design UX.
3. Keep UE5 Pixel Streaming optional (feature flag / dependency injection).
4. Introduce operations data stores/services in a modular way (do not force DB adoption for planning/design).






