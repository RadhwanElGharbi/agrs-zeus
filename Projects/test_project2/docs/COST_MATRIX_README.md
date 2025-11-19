# PIRL Cost Matrix Documentation

**Date:** November 5, 2025  
**Project:** test_project2  
**Status:** ✅ Complete with industry-standard costs

---

## Overview

This directory contains the comprehensive cost matrix used by the AGRS ZEUS PIRL (Pipeline Reinforcement Learning) system for optimizing pipeline routes. The cost matrix defines all construction, environmental, regulatory, and operational costs that the AI agent considers when learning optimal routing strategies.

## File

**`COST_MATRIX_COMPLETE.csv`**
- 75 cost entries across 12 categories
- All costs in USD (2025)
- Sources: Industry research, model definitions, engineering estimates

## Cost Categories

### 1. Terrain Costs (5 entries)
Per-meter costs based on slope:
- Flat (<5%): $80/m
- Rolling (5-15%): $120/m
- Hilly (15-25%): $200/m
- Mountainous (25-35%): $350/m
- Extreme (>35%): $500/m

### 2. Land Cover Costs (11 entries)
Per-meter costs based on ESA WorldCover classification:
- Grassland (LC 30): $60/m
- Bare/sparse (LC 60): $70/m
- Shrubland (LC 20): $80/m
- Cropland (LC 40): $100/m
- Tree cover (LC 10): $120/m
- Snow/ice (LC 70): $150/m
- Wetland (LC 90): $200/m
- Moss/lichen (LC 100): $250/m
- Mangroves (LC 95): $300/m
- Built-up (LC 50): $400/m
- **Permanent water (LC 80): $3,500/m** (offshore/underwater)

### 3. Infrastructure Crossing Costs (15 entries)

**Roads (by type):**
- Footway: $50,000 per crossing
- Residential: $100,000 per crossing
- Secondary: $150,000 per crossing
- Primary: $200,000 per crossing
- Trunk: $300,000 per crossing
- Motorway/highway: $500,000 per crossing

**Railways:**
- Active railway: **$1,000,000 per crossing**
- Abandoned railway: $200,000 per crossing

**Water bodies:**
- Small stream (<10m): $100,000 per crossing
- Medium river (10-50m): $300,000 per crossing
- Large river (>50m): $500,000 per crossing
- Canal/waterway: $400,000 per crossing

**Utilities:**
- Power transmission line: $150,000 per crossing
- Existing pipeline: $200,000 per crossing
- Underground utilities: $100,000 per crossing

### 4. Environmental Costs (5 entries)
Per-meter costs for sensitive areas:
- Wildlife corridor: $150/m
- Protected area (Natura 2000): $200/m
- Wetland: $300/m
- Cultural heritage site: $400/m
- Archaeological site: $500/m

### 5. Regulatory Costs (5 entries)
Project-level and per-km costs:
- Geotechnical survey: $30,000/km
- Urban construction permit: $50,000/km
- ROW acquisition (rural): $100,000/km
- Environmental impact assessment: $200,000/project
- ROW acquisition (urban): $500,000/km

### 6. Geohazard Costs (5 entries)
Per-meter mitigation costs:
- Low risk: $0/m
- Medium risk: $50/m
- Flood zone: $100/m
- High risk (active fault): $150/m
- Liquefaction zone: $200/m

### 7. Soil Costs (5 entries)
Per-meter costs based on bearing capacity:
- Good capacity (>0.7): $0/m
- Medium capacity (0.4-0.7): $30/m
- Poor capacity (<0.4): $100/m
- Rock excavation: $200/m
- Contaminated soil: $400/m

### 8. Hydraulic Costs (4 entries)
Pumping and flow management:
- Low velocity deposition prevention: $50/m
- High velocity erosion protection: $150/m
- Pressure control station: $300,000/station
- Pumping/compression station: **$1,000,000/station**

### 9. Construction Methods (5 entries)
Alternative construction techniques:
- Open trench (standard): $800/m (baseline)
- Auger boring: $1,500/m
- HDD (Horizontal Directional Drill): $2,000/m
- Direct pipe: $2,500/m
- Microtunneling: $3,000/m

### 10. Materials (5 entries)
Pipeline components and protection:
- Insulation/lagging: $60/m
- Anti-corrosion coating: $80/m
- Steel pipe (26" diameter): $500/m
- Cathodic protection: $50,000/km
- Valves and fittings: $100,000/km

### 11. Operations (4 entries - Reference Only)
Annual per-km operational costs:
- Maintenance and repairs: $3,000/km/year
- Emergency response: $2,000/km/year
- Pipeline monitoring (SCADA): $5,000/km/year
- Integrity management: $8,000/km/year

### 12. Regional Multipliers (6 entries)
Cost adjustment factors by region:
- Latin America: 0.85x
- Eastern Europe: 0.80x
- Asia-Pacific: 0.90x
- North America: 1.00x (baseline)
- Middle East: 1.10x
- Western Europe: 1.20x

---

## How Costs Are Applied

### Base Calculation
```
segment_cost = (terrain_cost + land_cover_cost) * segment_length_m
```

### Crossing Costs (Added Per Occurrence)
```
if crosses_road:
    segment_cost += road_crossing_cost[road_type]

if crosses_railway:
    segment_cost += railway_crossing_cost  # $1M!

if crosses_waterway:
    segment_cost += water_crossing_cost[waterway_size]
```

### Environmental & Regulatory (Additive)
```
if in_protected_area:
    segment_cost += protected_area_cost * segment_length_m

if high_geohazard_risk:
    segment_cost += geohazard_mitigation_cost * segment_length_m
```

### Regional Adjustment
```
total_cost = segment_cost * regional_multiplier
```

---

## Key Findings from Current Route

**Route:** 76.22 km (pruned)  
**Crossings:** 18 roads + 1 railway  

### Cost Breakdown (Corrected Values)

| Component | Cost | % of Total |
|-----------|------|------------|
| **Terrain** | $28,369,500 | 61.4% |
| **Environmental** | $13,220,000 | 28.6% |
| **Infrastructure** | $4,600,000 | 10.0% |
| Water Crossings | $30,000 | 0.1% |
| **TOTAL** | **$46,219,500** | 100% |

### Infrastructure Crossing Breakdown

| Type | Count | Cost Each | Total |
|------|-------|-----------|-------|
| Road crossings | 18 | $200,000 avg | $3,600,000 |
| Railway crossing | 1 | $1,000,000 | $1,000,000 |
| **Total** | **19** | - | **$4,600,000** |

---

## Critical Cost Corrections

### What Was Wrong (Original Model)

| Item | Old Cost | Correct Cost | Error |
|------|----------|--------------|-------|
| Major road | $25,000 | $200,000 | 8x too low |
| Railway | $50,000 | $1,000,000 | **20x too low!** |
| Minor road | $10,000 | $100,000 | 10x too low |

### Impact

**Original route cost:** $42,069,500  
**Corrected route cost:** $46,219,500  
**Underestimation:** $4,150,000 (9.9%)

**For this specific route, the error was manageable**, but in routes with more crossings (especially railways), the underestimation could be 50-100% of total cost.

---

## Usage in PIRL Training

### Reward Function

The PIRL agent receives negative rewards (penalties) based on segment costs:

```python
reward = -segment_cost / 1000.0  # Normalize to manageable scale

# Additional bonuses/penalties
if goal_reached:
    reward += 10000.0  # Large goal completion bonus

if makes_progress:
    reward += progress_distance * 10.0  # Progress reward

if violates_constraint:
    reward -= 1000.0  # Hard constraint penalty
```

### Cost-Benefit Learning

The agent learns to balance:
1. **Minimize route length** (fewer segments = lower cost)
2. **Choose favorable terrain** (flat > steep)
3. **Avoid expensive crossings** (especially railways!)
4. **Stay out of protected areas** (environmental costs)
5. **Reach the goal** (large completion bonus)

### Why Accurate Costs Matter

**With underestimated costs:**
- Agent thinks crossings are "cheap"
- Produces routes with too many crossings
- Real-world deployment is 2-10x more expensive than predicted

**With realistic costs:**
- Agent learns true cost trade-offs
- Avoids railways at almost any terrain cost
- Produces commercially viable routes
- Model predictions match reality

---

## Recommendations for Retraining

### Priority 1: Update Code Costs

**File:** `src/pirl/PIRL.cpp` (CostModel constructor)

**Current (WRONG):**
```cpp
crossing_costs_["major_road"] = 25000.0;
crossing_costs_["railway"] = 50000.0;
```

**Should be:**
```cpp
crossing_costs_["residential"] = 100000.0;
crossing_costs_["primary"] = 200000.0;
crossing_costs_["motorway"] = 500000.0;
crossing_costs_["railway"] = 1000000.0;  // 20x increase!
```

### Priority 2: Implement Road Type Detection

Currently all roads treated as "major_road". Need to:
1. Read OSM `highway` attribute from roads vector layer
2. Pass road type to `road_crossing_cost()` function
3. Return appropriate cost based on type

### Priority 3: Add Railway Crossing Check

Railway crossing cost is defined but **not used in cost calculation**!

**Add to `calculate_segment_cost()`:**
```cpp
if (to_state.railway_proximity < 0.01) {  // < 10m
    crossing_cost_val += railway_crossing_cost();  // $1M
}
```

### Priority 4: Retrain Model

After code updates:
1. Train for 1-2M timesteps
2. Expect fewer crossings (8-12 instead of 19)
3. Railway crossing should be avoided entirely
4. Route might be slightly longer but much cheaper overall

---

## Data Sources

### Industry Research
- Infrastructure crossing costs: Perplexity search, November 2025
- Based on U.S. Fish and Wildlife Service pipeline impact studies
- HDD costs from trenchless technology industry reports

### Model Definitions
- Terrain and land cover costs: AGRS ZEUS PIRL system
- Defined in `src/pirl/PIRL.cpp` (CostModel class)
- Based on industry averages and engineering experience

### Engineering Estimates
- Environmental and regulatory costs: Industry best practices
- Construction method costs: Contractor databases
- Material costs: Steel and coating supplier pricing

---

## Version History

**v1.0 (2025-11-05)**
- Initial comprehensive cost matrix
- Corrected infrastructure crossing costs to industry standards
- Added all 12 cost categories
- 75 total cost entries

---

## Contact

For questions about cost values, sources, or PIRL integration:
- Review `INFRASTRUCTURE_CROSSING_ANALYSIS.md` for detailed crossing cost research
- Review `RIVER_FOLLOWING_ANALYSIS.md` for water body cost validation
- Review `ROOT_CAUSE_ANALYSIS.md` for reward structure insights

---

**Status:** ✅ Production-Ready (with code corrections)  
**Next Step:** Update C++ cost definitions and retrain model




