# Final Pipeline Route Comparison Report

## Executive Summary

**The A* Optimized Route is $6.85M cheaper than the existing SNAM pipeline (9.6% savings).**

After correcting the endpoint mismatch discovered during analysis, the A* algorithm successfully generated a route that beats the existing pipeline on total cost.

| Route | Length | Total Cost | Cost/km | vs Existing |
|-------|--------|------------|---------|-------------|
| **A* Optimized** | 31.93 km | **$64.64M** | $2.02M | **-$6.85M (-9.6%)** |
| Dijkstra Shortest | 29.78 km | $69.26M | $2.33M | -$2.23M (-3.1%) |
| Existing SNAM | 35.19 km | $71.49M | $2.03M | BASELINE |

---

## Key Discovery: Endpoint Mismatch

The original A* routes were generating paths to a destination **35 km beyond** the actual pipeline endpoint, resulting in routes 2x longer than necessary.

### Original (Incorrect) Endpoints:
- Start: (379647.98, 4805029.95)
- End: (408344.71, 4750423.54) ← **Wrong!**
- Resulting route: ~65-82 km

### Corrected Endpoints (Matching Existing Pipeline Part 0):
- Start: (379620.98, 4805075.91)
- End: (397199.24, 4782587.63)
- Resulting route: ~30-32 km

---

## Detailed Cost Breakdown

### 1. Existing SNAM Pipeline (35.19 km)

| Cost Category | Cost | % of Total |
|---------------|------|------------|
| Base Construction | $28.16M | 39.4% |
| Trenching by Terrain | $13.10M | 18.3% |
| Landcover | $7.14M | 10.0% |
| Infrastructure Crossings | $11.18M | 15.6% |
| **Subtotal** | **$59.57M** | 83.3% |
| Regional Multiplier (1.2x) | $11.91M | 16.7% |
| **TOTAL** | **$71.49M** | 100% |

**Terrain Distribution:**
- Soft soil: 16.73 km (47.6%)
- Medium soil: 9.58 km (27.2%)
- Hard soil: 4.53 km (12.9%)
- Rock mixed: 3.43 km (9.7%)
- Hard rock: 0.93 km (2.6%)

**Crossings:**
- Roads: 71
- Railways: 1
- Waterways: 22
- Powerlines: 6

### 2. A* Optimized Route (31.93 km) ← **WINNER**

| Cost Category | Cost | % of Total | vs Existing |
|---------------|------|------------|-------------|
| Base Construction | $25.54M | 39.5% | -$2.61M |
| Trenching by Terrain | $11.88M | 18.4% | -$1.22M |
| Landcover | $6.87M | 10.6% | -$0.27M |
| Infrastructure Crossings | $9.57M | 14.8% | -$1.61M |
| **Subtotal** | **$53.86M** | 83.3% | -$5.71M |
| Regional Multiplier (1.2x) | $10.77M | 16.7% | -$1.14M |
| **TOTAL** | **$64.64M** | 100% | **-$6.85M** |

**Why A* Wins:**
1. **Shorter by 3.26 km** (-9.3%) → saves $2.61M in base construction
2. **Less hard rock** (0.14 km vs 0.93 km) → saves $1.2M in trenching
3. **Fewer crossings** (24 fewer road crossings, 7 fewer waterway) → saves $1.6M
4. **Better cost per km** ($2.02M vs $2.03M) despite more built-up traversal

**Terrain Distribution:**
- Soft soil: 13.16 km (41.2%)
- Medium soil: 9.05 km (28.3%)
- Hard soil: 5.97 km (18.7%)
- Rock mixed: 3.61 km (11.3%)
- Hard rock: 0.14 km (0.4%) ← **85% reduction!**

**Crossings:**
- Roads: 47 (−24)
- Railways: 1 (same)
- Waterways: 15 (−7)
- Powerlines: 5 (−1)

### 3. Dijkstra Shortest Path (29.78 km)

| Cost Category | Cost | % of Total | vs Existing |
|---------------|------|------------|-------------|
| Base Construction | $23.82M | 34.4% | -$4.34M |
| Trenching by Terrain | $15.29M | 22.1% | +$2.19M |
| Landcover | $7.13M | 10.3% | -$0.01M |
| Infrastructure Crossings | $11.48M | 16.6% | +$0.30M |
| **Subtotal** | **$57.71M** | 83.3% | -$1.86M |
| Regional Multiplier (1.2x) | $11.54M | 16.7% | -$0.37M |
| **TOTAL** | **$69.26M** | 100% | **-$2.23M** |

**Why Dijkstra Doesn't Win:**
- Shortest route, but goes through difficult terrain
- 2.05 km of hard rock (vs 0.14 km for A*)
- 7.24 km of rock mixed (vs 3.61 km for A*)
- Higher per-km cost ($2.33M vs $2.02M)
- More road crossings (81 vs 47)

---

## Algorithm Comparison

| Metric | A* Optimized | Dijkstra | Existing |
|--------|--------------|----------|----------|
| **Objective** | Minimize cost | Minimize distance | Unknown |
| **Length** | 31.93 km | 29.78 km | 35.19 km |
| **Total Cost** | $64.64M | $69.26M | $71.49M |
| **Cost/km** | $2.02M | $2.33M | $2.03M |
| **Hard Rock** | 0.14 km | 2.05 km | 0.93 km |
| **Crossings** | 68 | 103 | 100 |

### Key Insight

**A* finds the sweet spot between length and terrain difficulty.**

Dijkstra takes the shortest path regardless of terrain, resulting in:
- More hard rock trenching ($1,500/m vs $200/m for soft soil)
- More road crossings in direct path
- Higher per-km cost despite shorter length

A* intelligently routes around difficult terrain, trading ~2 km extra length for:
- 85% reduction in hard rock
- 34% fewer road crossings
- 32% fewer waterway crossings

---

## Conclusions

### 1. A* Outperforms Existing Pipeline
The A* algorithm successfully found a route that is:
- **$6.85M cheaper** (9.6% savings)
- **3.26 km shorter** (9.3% reduction)
- **Fewer crossings** (68 vs 100)
- **Better terrain** (almost no hard rock)

### 2. Cost Optimization > Shortest Path
Dijkstra's shortest path is not the cheapest path. Cost-aware routing (A*) provides:
- $4.62M savings over Dijkstra
- Better terrain selection
- Fewer infrastructure crossings

### 3. Endpoint Accuracy is Critical
The original analysis used incorrect endpoints, causing routes to be 2x longer than necessary. Always verify start/end points against actual infrastructure.

---

## Technical Notes

- **Coordinate System**: EPSG:32633 (UTM Zone 33N)
- **Cost Model**: Detailed cost matrix with terrain, landcover, and crossing costs
- **Regional Multiplier**: 1.2x (Italy/Western Europe)
- **Analysis Date**: December 2025

### Files Generated
- A* Route: `/opt/agrs/agentic_framework/data/routes/test_project2_astar_saipem_correct_endpoints.geojson`
- Dijkstra Route: `/opt/agrs/agentic_framework/data/routes/test_project2_dijkstra_shortest.geojson`
- Existing Pipeline: `/opt/agrs/Projects/test_project2/data/vectors/pipelines.gpkg` (Part 0)
