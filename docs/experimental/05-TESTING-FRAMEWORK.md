# Testing & Validation Framework (Focused on FEED Deliverables)

**Status:** Active  
**Last updated:** 2026-01-02  
**Primary target:** Deliverable-grade outputs (Alignment Sheets v1)  

---

## 0) Guiding principle

For pipeline engineering, “it ran” is not success.

For deliverables (PDF drawings + registers), we need:

- deterministic outputs (or explicitly-controlled nondeterminism),
- traceability of inputs/assumptions,
- regression protection (a change should not silently alter a drawing set).

---

## 1) Current repo testing reality

GUI‑v2 backend already contains pytest-based validation scripts (primarily around dataset workflows).  
Frontend automated tests are not the current strength of the repo.

This doc defines what must be added specifically to make **alignment sheets and deliverables generation safe**.

---

## 2) Test pyramid for deliverables

1. **Unit tests** (fast, deterministic)
2. **Integration tests** (API endpoints, filesystem artifacts)
3. **Golden regression tests** (PDF + index/register outputs)
4. **Performance tests** (long routes, many crossings)

---

## 3) Unit tests (Alignment Sheets core)

### What to unit test

- **Stationing conversions**
  - meters → KP format
  - tick spacing logic
- **Sheet cutting**
  - \(L\) meters route → \(N\) sheets at sheet_length
  - boundary conditions (exact multiples, very short routes)
- **Crossing station assignment**
  - crossing point projected to route measure \(s\)
  - ordering and deduplication rules

### Determinism requirement

Unit tests must not depend on:

- network imagery,
- system time,
- file mtimes (unless explicitly mocked).

---

## 4) Integration tests (API + filesystem)

### Alignment sheets preview endpoint

Test:

- `GET /api/alignment-sheets/preview/{project}/{route}?preset=standard`

Validate:

- 200 response with required fields (length, sheet_count, scales, CRS, pipe diameter, etc.)
- If route or project missing, correct 404 behavior

### Alignment sheets generate endpoint

Test:

- `POST /api/alignment-sheets/generate` with `{ project, route, preset }`

Validate:

- 200 response
- `Content-Type: application/pdf`
- PDF bytes are non-empty

If `persist=true` is implemented (Phase 2), validate:

- outputs exist under `Projects/<project>/Deliverables/alignment_sheets/...`
- manifest/index/register files exist

---

## 5) Golden regression tests (PDF + registers)

### Why golden tests matter

Alignment sheets are “visual contracts.” A subtle change in:

- sheet cutting,
- station tick logic,
- crossing detection,
- band layout,

…can invalidate a deliverable set.

### Practical approach (stable diffs)

PDFs can be nondeterministic if they contain timestamps or object IDs. To stabilize:

- **Force a deterministic “generated_at”** via manifest injection or test-time override.
- Test PDFs by:
  - extracting text (where consistent),
  - checking page count,
  - checking presence of key labels (“SHEET 1 OF N”, route name, scales),
  - optionally rasterizing pages and doing an image diff with tolerance (later).

Golden artifacts should include:

- `sheet_index.json`
- `crossings.csv`
- sample PDF(s)

---

## 6) Performance tests

Minimum performance targets for v1:

- 50–100 km route: generation completes in minutes, not hours (assuming imagery availability)
- Crossings detection and stationing does not blow up memory

Performance tests should run with:

- imagery disabled or cached (so network variability does not dominate)

---

## 7) Release gating checklist (deliverables)

Before calling Alignment Sheets v1 “FEED-grade”:

- [ ] Unit tests cover stationing + sheet cutting
- [ ] API integration tests pass
- [ ] Golden regression suite passes on at least one reference project
- [ ] Outputs persist with a manifest capturing inputs/assumptions
- [ ] Missing datasets degrade gracefully (no hard failures)






