# Pressure Design (Engineer-Driven) — Methods, Assumptions, and Outputs

This document describes the **physics-based** pressure design calculations exposed in the ZEUS engineering suite. The UI is **not standards-driven**; engineers directly control factors, margins, and assumptions. Standards may be used for *guidance only* (ranges, warnings, references).

## Scope (Phase 1)

- Gas transmission pressure design (deterministic, steady formulas)
- Two workflows:
  - **Thickness from Pressure**: compute required nominal wall thickness
  - **Pressure from Thickness**: compute max allowable pressure for a given wall thickness
- Two calculation methods:
  - **Thin-wall hoop stress (Barlow-style)**
  - **Thick-wall hoop stress (Lamé, advanced)**

## Inputs (Conceptual)

### Geometry

- Outside diameter \(D_o\)
- Wall thickness \(t\) (only for “Pressure from Thickness”)

### Loading

- Design pressure \(P\) (only for “Thickness from Pressure”)

### Strength basis (engineer-selected)

- **Direct allowable hoop stress** \(S_{allow}\), or
- **SMYS with factors**:
  \[
  S_{allow} = SMYS \cdot F \cdot E \cdot T
  \]
  where:
  - \(F\) = design factor (engineer-controlled)
  - \(E\) = joint factor (engineer-controlled)
  - \(T\) = temperature derating factor (engineer-controlled)

### Allowances and margins

- Surge margin fraction \(m_{surge}\): increases effective design pressure
  \[
  P_{eff} = P \cdot (1 + m_{surge})
  \]
- Safety margin fraction \(m_{safety}\): increases net thickness requirement (or reduces reported max pressure)
- Corrosion allowance \(CA\)
- Additional thickness \(t_{add}\) (user-defined extra)
- Mill tolerance fraction \(m_{mill}\) (under-tolerance; e.g., 0.125 for 12.5%)

All inputs accept common engineer units (bar/MPa/psi, mm/in/m). The compute engine normalizes internally to SI.

## Methods

### 1) Thin-wall hoop stress (Barlow-style)

Relationship:
\[
\sigma_h = \frac{P \cdot D}{2t}
\]

#### Thickness from pressure
\[
t_{net} = \frac{P_{eff} \cdot D_o}{2 S_{allow}}
\]

Then:
- Apply safety margin:
  \[
  t_{net} \leftarrow t_{net} \cdot (1 + m_{safety})
  \]
- Add allowances:
  \[
  t_{gross} = t_{net} + CA + t_{add}
  \]
- Adjust for mill under-tolerance:
  \[
  t_{nom} = \frac{t_{gross}}{1 - m_{mill}}
  \]

#### Pressure from thickness
- Compute net available thickness after tolerance and allowances:
  \[
  t_{avail} = t_{nom}(1-m_{mill}) - CA - t_{add}
  \]
- Compute raw allowable pressure:
  \[
  P_{raw} = \frac{2 S_{allow} t_{avail}}{D_o}
  \]
- Reduce reported pressure for surge/safety margins:
  \[
  P_{allow} = \frac{P_{raw}}{(1+m_{surge})(1+m_{safety})}
  \]

### 2) Thick-wall hoop stress (Lamé, advanced)

For a cylinder with outer radius \(r_o\) and inner radius \(r_i\), the hoop stress at the inner wall for internal pressure \(P\) is:
\[
\sigma_\theta(r_i) = P \cdot \frac{r_o^2 + r_i^2}{r_o^2 - r_i^2}
\]

#### Thickness from pressure (solving for \(r_i\))
Assuming \(\sigma_\theta(r_i)=S_{allow}\), the solver uses:
\[
r_i = r_o \sqrt{\frac{S_{allow}-P_{eff}}{S_{allow}+P_{eff}}}
\qquad
t_{net} = r_o - r_i
\]

This requires:
- \(S_{allow} > P_{eff}\) (same units) so the square root is valid.

#### Pressure from thickness (inverting)
Given \(r_i = r_o - t_{avail}\):
\[
P_{raw} = S_{allow}\cdot \frac{r_o^2 - r_i^2}{r_o^2 + r_i^2}
\]
Then margins are applied the same as in thin-wall.

## Validity / warnings

The engine emits warnings (not hard failures) for suspicious inputs, e.g.:
- Very large margin fractions
- Very large mill tolerance
- Thin-wall method used with large \(t/D\) ratio

For thin-wall, the engine reports \(t/D\) as a diagnostic. If \(t/D\) is high, thick-wall may be more appropriate.

## Output contract (what you should expect in JSON)

Each computation returns:
- **Key outputs** (SI plus convenience units)
- **Warnings**: list of human-readable strings
- **Intermediates**: a list of `{ key, value, unit, note }` so engineers can audit the math step-by-step

## Implementation references

- C++ core: `include/agrs_zeus/PressureDesign.h`, `src/engineering/PressureDesign.cpp`
- pybind module: `python/engineering/zeus_engineering_bindings.cpp`
- Backend API: `gui-v2/backend/api/engineering/pressure_design.py`
- Frontend panel: `gui-v2/frontend/src/components/Pirl/PressureDesignSection.tsx`















