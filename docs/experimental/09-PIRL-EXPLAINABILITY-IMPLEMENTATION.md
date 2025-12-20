# Route Optimization & Explainability Implementation Plan

**Version:** 2.0
**Date:** 2025-12-16
**Status:** Proposed
**Priority:** High (Client Requirement - SAIPEM)

---

## Executive Summary

SAIPEM has indicated a critical requirement: when their clients ask why the software chose specific routing decisions, they need direct, defensible answers. This document outlines the implementation plan for:

1. **Enhanced A\* algorithm** that makes crossing method decisions in real-time during pathfinding
2. **Comprehensive decision logging** that captures segment-by-segment rationale
3. **Global route optimization** that considers coupled route geometry and crossing method costs

---

## Business Requirement

### Client Need (SAIPEM)
> "We need to know the decisions made by the software for choosing different routing options for the entire route so that when our clients ask us the reasons, we have direct answers we are able to refer to."

### Deliverable
Upon route generation, every segment's decision-making process shall be logged in a standardized JSON file that provides:
- Engineering rationale
- Hydraulics considerations
- Environmental factors
- Regulatory compliance
- Geohazard assessment
- Geological analysis
- Hydrological factors
- Constructability analysis
- Risk assessment
- Cost optimization reasoning
- **Crossing method selection with full justification**

---

## Current State Analysis

### What Exists (A\* Implementation)
```
Current A* Route Generation:
├── Finds lowest-cost path through terrain
├── Applies FIXED crossing costs per infrastructure type
│   ├── Railway: €1,200,000 (fixed)
│   ├── Road: €60,000 (fixed)
│   ├── Waterway: €80,000 (fixed)
│   └── Powerline: €150,000 (fixed)
├── Records aggregate crossing counts
└── Outputs route geometry + basic segment properties
```

### What's Missing
- **Real-time crossing method decisions** (HDD vs open cut vs auger bore vs microtunnel)
- **Variable crossing costs** based on local conditions (soil, width, water table)
- **Decision rationale** for why specific methods were selected
- **Global optimization** considering coupled geometry/method costs
- **Alternatives evaluated** and reasons for rejection

---

## The Coupling Problem

### Why Two-Phase Approaches Fail

A naive approach would be:
1. Phase 1: A\* finds route using estimated crossing costs
2. Phase 2: Post-processing assigns optimal crossing method at each crossing

**This is suboptimal because route geometry and crossing method selection are coupled decisions.**

#### Example Scenario
```
Route A: Crosses 80m wide river
├── Phase 1 A* estimates: €500K (using average crossing cost)
├── A* picks Route A (appears cheaper)
├── Phase 2 discovers: bedrock geology → HDD impossible
├── Must use microtunnel → €3M actual cost
└── RESULT: €3M (suboptimal - stuck with bad route)

Route B: Goes 4km around the river
├── Terrain cost: €800K
├── No major crossings
└── RESULT: €800K (optimal choice - but A* never saw it)
```

**The fundamental issue:** The optimal route depends on what crossing methods are available and their true costs at specific locations. By fixing the route first, you lose the ability to make globally optimal decisions.

---

## Proposed Solution: Enhanced A\* with Real-Time Crossing Decisions

### Core Concept

Modify A\* to evaluate crossing method options **during pathfinding**, not after. At each potential crossing point, the algorithm:

1. Detects infrastructure intersection
2. Queries local conditions (soil type, crossing width, water table, regulations)
3. Evaluates all feasible crossing methods
4. Computes true cost for each method
5. Selects optimal method and uses that cost for pathfinding
6. Logs the decision with full rationale

### Algorithm Enhancement

```
Current A* Edge Cost:
  cost(A→B) = terrain_cost + FIXED_crossing_cost

Enhanced A* Edge Cost:
  cost(A→B) = terrain_cost + MIN(feasible_crossing_methods)

  where feasible_crossing_methods = {
    method for method in [HDD, open_cut, auger_bore, microtunnel]
    if is_feasible(method, local_conditions)
  }
```

### Why This Works

- **Global optimization:** A\* sees the TRUE cost of each path including optimal crossing method
- **Coupled decisions:** Route geometry emerges from considering crossing costs together
- **Pruning:** Infeasible methods eliminated immediately (can't open-cut a 100m river)
- **Manageable complexity:** Branching only at actual crossing points, not every cell

### Computational Complexity

The state space expansion is manageable:
- Branching occurs only at ~75 crossing points, not 36,000+ cells
- Many crossings have only 1-2 feasible methods (regulatory constraints)
- Infeasible methods pruned immediately (e.g., open-cut on active railway)
- Effective branching factor << 4 at most crossings

---

## Implementation Architecture

### Phase 1: Crossing Detection & Condition Queries (3 weeks)

**Objective:** Enhance A\* to detect crossings and query local conditions in real-time.

**Tasks:**
1. Integrate crossing detection into edge evaluation
2. Build condition query system for each crossing point:
   - Soil type from SoilGrids
   - Crossing width from OSM/infrastructure data
   - Water table depth from hydrogeological data
   - Rock depth from geological surveys
3. Cache queries for performance (crossings are re-evaluated multiple times in A\*)

**Data Queries per Crossing:**
```cpp
struct CrossingConditions {
    CrossingType type;           // railway, road, waterway, powerline
    float width_m;               // crossing width
    SoilType soil;               // clay, sand, rock, mixed
    float water_table_m;         // depth to groundwater
    float rock_depth_m;          // depth to bedrock
    RegulatoryConstraints regs;  // RFI/ANAS/Terna requirements
    bool active_infrastructure;  // in-service or abandoned
};

CrossingConditions queryCrossingConditions(Point location, CrossingType type);
```

**Deliverable:** A\* with crossing-aware edge evaluation

---

### Phase 2: Crossing Method Feasibility Engine (3 weeks)

**Objective:** Implement feasibility rules for each crossing method.

**Feasibility Decision Tree:**
```
HDD (Horizontal Directional Drilling):
├── Feasible if:
│   ├── Soil is drillable (not solid rock)
│   ├── Water table manageable (< 20m or with dewatering)
│   ├── Crossing width < 2000m
│   └── Entry/exit workspace available
├── Required if:
│   ├── Active railway (RFI mandate)
│   ├── Motorway crossing
│   └── Major waterway (environmental)
└── Cost factors: width, soil, depth, regulatory premium

Open Cut:
├── Feasible if:
│   ├── Not prohibited by regulations
│   ├── Traffic disruption acceptable (roads)
│   └── Environmental impact acceptable
├── Prohibited if:
│   ├── Active mainline railway
│   ├── Major river (environmental)
│   └── High-voltage transmission line
└── Cost factors: width, traffic management, restoration

Auger Bore:
├── Feasible if:
│   ├── Crossing width < 100m
│   ├── Soil is stable (not saturated sand)
│   ├── No settlement-sensitive structures
│   └── Straight alignment possible
├── Preferred for:
│   ├── Secondary roads
│   ├── Railway sidings
│   └── Stable soil conditions
└── Cost factors: width, soil, pipe diameter

Microtunneling:
├── Feasible if:
│   ├── Any soil condition (most versatile)
│   ├── Crossing width > 50m (cost-effective threshold)
│   └── Launch/reception shaft space available
├── Preferred for:
│   ├── Rock conditions where HDD fails
│   ├── Urban areas with settlement concerns
│   └── Very long crossings (> 500m)
└── Cost factors: width, geology, shaft construction
```

**Method Selector Implementation:**
```cpp
struct MethodEvaluation {
    CrossingMethod method;
    bool feasible;
    float cost_eur;
    std::string feasibility_reason;
    std::vector<std::string> cost_factors;
};

std::vector<MethodEvaluation> evaluateCrossingMethods(
    CrossingConditions conditions,
    PipelineSpecs pipe_specs
);

CrossingDecision selectOptimalMethod(
    std::vector<MethodEvaluation> evaluations
);
```

**Deliverable:** Method feasibility engine with cost calculation

---

### Phase 3: Enhanced A\* Integration (4 weeks)

**Objective:** Integrate crossing method selection into A\* pathfinding.

**Modified A\* Edge Cost Function:**
```cpp
float computeEdgeCost(
    const GridCell& from,
    const GridCell& to,
    DecisionLogger& logger
) {
    float terrain_cost = computeTerrainCost(from, to);
    float crossing_cost = 0.0f;

    // Check for infrastructure crossings on this edge
    auto crossings = detectCrossings(from, to);

    for (const auto& crossing : crossings) {
        // Query local conditions
        auto conditions = queryCrossingConditions(
            crossing.location,
            crossing.type
        );

        // Evaluate all crossing methods
        auto evaluations = evaluateCrossingMethods(
            conditions,
            pipeline_specs_
        );

        // Select optimal feasible method
        auto decision = selectOptimalMethod(evaluations);

        // Add to edge cost
        crossing_cost += decision.cost_eur;

        // Log the decision for explainability
        logger.logCrossingDecision(
            crossing,
            conditions,
            evaluations,
            decision
        );
    }

    return terrain_cost + crossing_cost;
}
```

**Deliverable:** Globally optimal routes with real-time crossing decisions

---

### Phase 4: Decision Logging & Rationale Capture (3 weeks)

**Objective:** Comprehensive logging of all decisions during route generation.

**Decision Log Schema:**
```json
{
  "schema_version": "2.0",
  "route_id": "Ravenna-Chieti-Pipeline_optimized",
  "optimization_method": "A* with real-time crossing optimization",

  "crossing_decisions": [
    {
      "crossing_id": "CX-045",
      "location_km": 17.234,
      "infrastructure_type": "railway",
      "infrastructure_name": "RFI Bologna-Ancona Line",

      "conditions_queried": {
        "crossing_width_m": 45.0,
        "soil_type": "clay_loam",
        "water_table_m": 8.5,
        "rock_depth_m": 35.0,
        "regulatory_authority": "RFI",
        "active_infrastructure": true
      },

      "methods_evaluated": [
        {
          "method": "open_cut",
          "feasible": false,
          "reason": "RFI prohibits open-cut on active mainline railways",
          "cost_eur": null
        },
        {
          "method": "auger_bore",
          "feasible": true,
          "cost_eur": 850000,
          "concerns": ["Settlement risk in clay soil", "Tight clearance"]
        },
        {
          "method": "HDD",
          "feasible": true,
          "cost_eur": 1200000,
          "advantages": ["RFI preferred", "No settlement risk", "Proven in clay"]
        },
        {
          "method": "microtunnel",
          "feasible": true,
          "cost_eur": 2100000,
          "concerns": ["75% cost premium", "Over-engineered for 45m crossing"]
        }
      ],

      "selected_method": "HDD",
      "selection_rationale": "HDD selected as lowest-cost feasible method meeting RFI requirements. Auger bore rejected due to settlement risk in clay-dominant soils. Open-cut prohibited by regulation. Microtunnel cost-prohibitive for crossing length.",

      "engineering_parameters": {
        "depth_m": 12.0,
        "entry_angle_deg": 12.0,
        "exit_angle_deg": 10.0,
        "minimum_cover_m": 8.0,
        "actual_cover_m": 12.0
      }
    }
  ],

  "route_alternatives_rejected": [
    {
      "alternative_id": "ALT-017",
      "description": "Northern bypass avoiding railway crossing entirely",
      "additional_length_km": 2.3,
      "terrain_cost_eur": 1840000,
      "crossing_savings_eur": 1200000,
      "net_impact_eur": 640000,
      "rejection_reason": "Net cost increase of €640K - railway HDD is more economical than bypass"
    }
  ]
}
```

**Deliverable:** Full decision audit trail for every crossing

---

### Phase 5: Domain-Specific Analyzers (4 weeks)

**Objective:** Add specialized analysis modules for comprehensive reasoning.

**Modules:**

| Module | Responsibility |
|--------|---------------|
| `EngineeringAnalyzer` | Slope, curvature, bend radius compliance |
| `HydraulicsAnalyzer` | Pressure drop, velocity, compressor needs |
| `EnvironmentalAnalyzer` | Land cover impact, protected areas, water bodies |
| `RegulatoryAnalyzer` | Setbacks, permits, standards compliance |
| `GeohazardAnalyzer` | Seismic, landslide, liquefaction risk |
| `GeologicalAnalyzer` | Soil type, rock depth, groundwater |
| `HydrologicalAnalyzer` | Drainage, flood zones, stream crossings |
| `ConstructabilityAnalyzer` | Access, working space, seasonal constraints |
| `RiskAnalyzer` | Probability/impact assessment, contingencies |
| `CostAnalyzer` | Breakdown, alternatives, optimization |

**Deliverable:** Comprehensive multi-domain decision reasoning

---

### Phase 6: Integration & API (2 weeks)

**Objective:** Expose decision logs through GUI and API.

**Tasks:**
1. Add decision log generation to route export
2. Create API endpoint: `GET /api/projects/{project}/routes/{route}/decisions`
3. Build GUI component to display segment decisions
4. Add "Why this route?" summary view
5. Enable segment-click to view detailed reasoning
6. Add crossing method visualization on map

**Deliverable:** Full integration with GUI and API

---

## Decision Log File Structure

```
{project}/PIRL/outputs/
├── {route_name}.geojson              # Route geometry
├── {route_name}.metadata.json        # Route statistics
└── {route_name}.decisions.json       # Decision log (NEW)
```

---

## Client-Facing Summary Report

For SAIPEM's client communications:

```markdown
# Route Decision Summary
## Ravenna-Chieti Pipeline - Optimized Route

### Route Overview
- **Length:** 36.43 km
- **Total Cost:** €58.2M
- **Compliance Status:** 100% Compliant
- **Optimization Method:** A* with real-time crossing optimization

### Infrastructure Crossings (75 total)

| Type | Count | Method Breakdown | Total Cost |
|------|-------|------------------|------------|
| Railway | 1 | HDD (1) | €1,200,000 |
| Road | 54 | Open cut (48), HDD (6) | €2,880,000 |
| Waterway | 15 | HDD (8), Open cut (7) | €960,000 |
| Powerline | 5 | Open cut (5) | €250,000 |

### Key Crossing Decisions

#### Railway Crossing at km 17.4 (RFI Bologna-Ancona)
**Selected Method:** HDD at 12m depth
**Alternatives Evaluated:**
- Open cut: ❌ Prohibited by RFI for active mainlines
- Auger bore: ⚠️ Feasible but settlement risk in clay soil
- HDD: ✅ Selected - RFI preferred, proven methodology
- Microtunnel: ❌ Cost-prohibitive (+75% vs HDD)

**Rationale:** HDD selected per RFI crossing permit requirements and geotechnical suitability.

#### Fiume Reno Crossing at km 24.8
**Selected Method:** HDD at 18m depth
**Alternatives Evaluated:**
- Open cut: ❌ Environmental prohibition (major waterway)
- Auger bore: ❌ Not feasible for 85m crossing width
- HDD: ✅ Selected - standard method for river crossings
- Microtunnel: ⚠️ Feasible but +60% cost

**Rationale:** HDD is standard practice for major river crossings with environmental sensitivity.

### Route Geometry Decisions

#### Natura 2000 Avoidance (km 12.4)
**Decision:** Route diverted 1.2km east
**Reason:** Avoid intersection with IT5310020 protected area
**Cost Impact:** +€450,000
**Benefit:** Eliminates EIA complications and 12-18 month permit risk

### Compliance Certification
All segments verified compliant with:
- SAIPEM engineering criteria (20% max slope, 13.5m house setback)
- Italian NTC 2018 seismic standards
- EN 1594 gas pipeline requirements
- ASME B31.8 design code
- RFI/ANAS/Terna crossing requirements
```

---

## Success Criteria

1. **Global Optimality:** Routes consider true crossing costs, not fixed estimates
2. **Completeness:** Every crossing has documented method selection rationale
3. **Traceability:** Each decision links to specific conditions and thresholds
4. **Defensibility:** Reasoning withstands technical and regulatory review
5. **Accessibility:** Non-technical stakeholders can understand key decisions
6. **Auditability:** Full decision chain reproducible from logs

---

## Resource Estimate

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Crossing Detection & Queries | 3 weeks | 120 hours |
| Phase 2: Method Feasibility Engine | 3 weeks | 120 hours |
| Phase 3: Enhanced A\* Integration | 4 weeks | 160 hours |
| Phase 4: Decision Logging | 3 weeks | 120 hours |
| Phase 5: Domain Analyzers | 4 weeks | 160 hours |
| Phase 6: Integration & API | 2 weeks | 80 hours |
| **Total** | **19 weeks** | **760 hours** |

---

## Future Exploration: PIRL/CNN Approach

As a potential future enhancement, the PIRL (Physics-Informed Reinforcement Learning) approach could be explored for crossing method selection:

**Potential Advantages:**
- Neural network learns complex patterns implicitly
- Could discover non-obvious optimization strategies
- Handles high-dimensional decision spaces efficiently

**Current Limitations:**
- Requires significant training data
- "Black box" nature conflicts with explainability requirement
- Decision rationale harder to extract and articulate

**Recommendation:** Proceed with enhanced A\* approach for immediate SAIPEM requirements. Evaluate PIRL for crossing decisions as a research initiative once A\* implementation is validated.

---

## Dependencies

- A\* routing engine C++ codebase
- Cost matrix calibration data
- Geospatial data sources (SoilGrids, hydrogeology layers)
- Regulatory constraint database (RFI, ANAS, Terna requirements)
- Infrastructure crossing standards documentation

---

## References

- `/opt/agrs/docs/PIPELINE_CONSTRUCTION_COST_MATRIX.md`
- `/opt/agrs/docs/REGULATORY_DOCUMENTATION_STANDARD.md`
- `/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md`
- SAIPEM SEEVE methodology documentation
- RFI crossing permit requirements (Autorizzazione Attraversamento)
- ANAS road crossing standards
- EN 1594:2013 Gas supply systems

---

**Document Location:** `/opt/agrs/docs/experimental/09-PIRL-EXPLAINABILITY-IMPLEMENTATION.md`
**Author:** AGRS Development Team
**Review Required:** Engineering Lead, SAIPEM Technical Contact
