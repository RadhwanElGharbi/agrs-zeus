# SAIPEM Cost Optimization Strategy

**Project:** SAIPEM Pipeline Routing Demonstration  
**Date:** October 15, 2025  
**Objective:** Save customer money by finding the most cost-efficient route  
**Target:** ±10% cost accuracy

---

## SAIPEM's Routing Criteria (From AI_Routing_Criteria.xlsx)

### **Pipeline Specifications**
- **Type:** Natural gas pipeline
- **Material:** Carbon steel
- **MOP:** 70 bar
- **DP:** 75 bar
- **Diameter:** 26" (660mm)
- **Thickness:** 11.1 mm
- **Depth of Cover:** 1.5 m
- **Cold Bending Max Radius:** See curve a 40DN (a freddo).pdf
- **Available Hot Bends:** 15°, 30°, 45°, 60°, 90°
- **HDD Max Bending:** 12°

### **Clearance Requirements**
- **Overhead High Voltage Powerlines:** 6 m minimum
- **Powerline Poles:** 6 m minimum
- **Houses:** 13.5 m minimum
- **Existing Pipelines:** 0.5 m minimum

### **12 Routing Criteria (Priority Order)**

| Priority | Criteria | Cost Impact | Implementation Strategy |
|----------|----------|-------------|------------------------|
| **1** | **Minimize number of crossings** | **VERY HIGH** | Count water bodies, roads, railways, utilities - each crossing = major cost |
| **2** | **Minimize steep slope areas (max 20%)** | **VERY HIGH** | Avoid slopes >20% - exponential excavation cost increase |
| **3** | **Minimize protected areas crossings** | **VERY HIGH** | Avoid WDPA, Natura2000 - often impossible or extremely expensive |
| **4** | **Minimize high risk geohazard areas** | **HIGH** | Avoid seismic zones, landslide areas - engineering requirements increase cost |
| **5** | **Prefer orthogonal crossing angles** | **MEDIUM** | 90° crossings minimize crossing length and cost |
| **6** | **Prefer parallelism with existing pipelines** | **MEDIUM** | Shared ROW reduces land acquisition and permitting costs |
| **7** | **Locate 0.5m minimum from existing pipelines** | **LOW** | Safety requirement - must enforce as hard constraint |
| **8** | **Avoid side slope routes** | **MEDIUM** | Side slopes require specialized construction techniques |
| **9** | **Prefer areas with existing ROW access** | **MEDIUM** | Reduces construction mobilization and access costs |
| **10** | **Thrust boring for asphalt roads** | **MEDIUM** | Specific crossing method requirement |
| **11** | **Open cut for non-asphalt roads** | **LOW** | Cheapest crossing method where applicable |
| **12** | **Railways must be trenchless** | **HIGH** | HDD required - expensive but mandatory |

---

## Cost Optimization Model Design

### **Phase 1: Cost Surface Generation**

Each constraint layer gets converted to a **cost multiplier** (1.0 = baseline, higher = more expensive):

#### **1. Terrain Cost Surface**
```
Formula: cost = base_cost × terrain_multiplier

Terrain Multipliers:
- Slope 0-5%:     1.0  (flat, baseline cost)
- Slope 5-10%:    1.3  (rolling terrain, minor equipment adjustment)
- Slope 10-15%:   1.8  (steep, specialized equipment needed)
- Slope 15-20%:   2.5  (very steep, significant cost increase)
- Slope >20%:     10.0 (AVOID - extremely expensive or impossible)

Side Slope Penalty: ×1.5 (requires specialized techniques)
```

#### **2. Crossing Cost Surface**
```
Cost per crossing (26" pipeline):

Water Bodies:
- Stream (<10m width):     $50,000  (HDD or open-cut)
- River (10-50m width):    $200,000 (HDD required)
- River (>50m width):      $500,000+ (major HDD operation)

Infrastructure:
- Dirt road (open-cut):    $10,000
- Asphalt road (thrust):   $75,000
- Highway (HDD):           $150,000
- Railway (HDD mandatory): $200,000

Utilities:
- Existing pipeline:       $50,000 (coordination, protection)
- Powerline (overhead):    $25,000 (clearance verification)

Implementation:
- Generate Euclidean distance rasters from each feature type
- Apply cost at crossing points (where route intersects feature)
- Crossing angle optimization: cost × (1 / sin(angle)) - rewards 90° crossings
```

#### **3. Protected Areas Cost Surface**
```
Protected Area Multipliers:
- WDPA Category Ia/Ib (Strict Nature Reserve):  100.0 (effectively prohibited)
- WDPA Category II (National Park):             50.0  (extremely difficult/expensive)
- WDPA Category III-VI:                         10.0  (significant permitting burden)
- Natura 2000 Sites:                            15.0  (EU regulatory complexity)
- Buffer zones (1km around protected):          2.0   (increased scrutiny)

Implementation:
- Rasterize protected area polygons
- Apply multipliers to cost surface
- Consider seasonal restrictions (add time cost)
```

#### **4. Geohazard Cost Surface**
```
Geohazard Multipliers:
- High seismic risk zones:    3.0  (enhanced engineering requirements)
- Landslide susceptibility:   5.0  (stabilization measures required)
- Flood zones (100-year):     2.0  (drainage and protection)
- Karst/subsidence areas:     4.0  (foundation requirements)

Implementation:
- Acquire seismic hazard maps (INGV for Italy)
- Landslide inventory and susceptibility maps
- Flood zone data
- Combine into composite geohazard cost surface
```

#### **5. Land Cover / ROW Cost Surface**
```
Land Cover Multipliers:
- Agricultural (open field):   1.0  (baseline, easiest construction)
- Grassland/pasture:           1.1  (minimal clearing)
- Shrubland:                   1.3  (moderate clearing)
- Forest (deciduous):          2.0  (clearing costs, environmental impact)
- Forest (coniferous):         2.5  (higher clearing costs)
- Urban/developed:             10.0 (AVOID - extremely expensive ROW)
- Wetlands:                    8.0  (mitigation costs $20K-100K per acre)

Existing ROW Bonus:
- Parallel to existing pipeline: ×0.7 (30% cost reduction for shared ROW)
- Near existing roads:           ×0.85 (15% cost reduction for access)

Implementation:
- Use ESA WorldCover or Google Dynamic World
- Rasterize existing pipeline corridors
- Apply multipliers and bonuses
```

#### **6. Composite Cost Surface**
```
Final Cost = Base_Cost × Terrain_Mult × LandCover_Mult × Geohazard_Mult × Protected_Mult
           + Sum(Crossing_Costs)

Where:
- Base_Cost = $150 per linear meter (26" pipeline, flat terrain baseline)
- Multipliers applied cumulatively
- Crossing costs added discretely at intersection points
```

---

### **Phase 2: Constraint Masks (No-Go Zones)**

Some areas are **absolute constraints** (infinite cost):

```
Hard Constraints (Boolean Masks):
1. Slope >20%:                    PROHIBITED (SAIPEM Criteria 2)
2. Distance to houses <13.5m:     PROHIBITED (safety requirement)
3. Distance to powerlines <6m:    PROHIBITED (safety requirement)
4. Distance to pipelines <0.5m:   PROHIBITED (SAIPEM Criteria 7)
5. WDPA Category Ia/Ib:           PROHIBITED (legal restriction)
6. Urban areas (high density):    PROHIBITED (impractical)

Implementation:
- Generate boolean masks for each constraint
- Combine with OR operation: any TRUE = prohibited
- Apply as infinite cost in routing algorithm
```

---

### **Phase 3: Weighted Least-Cost Path Algorithm**

#### **Algorithm: A* with Custom Cost Function**

```
Pseudocode:

1. Load composite cost surface (raster)
2. Load constraint mask (raster)
3. Set start point (from START_POINT.kmz)
4. Set end point (from END_POINT.kmz)

5. Initialize:
   - Open set = {start}
   - Closed set = {}
   - g_score[start] = 0  (cost from start)
   - f_score[start] = heuristic(start, end)  (estimated total cost)

6. While open set not empty:
   a. Current = node in open set with lowest f_score
   
   b. If current == end:
      - Reconstruct path
      - Calculate total cost
      - Return route
   
   c. Remove current from open set, add to closed set
   
   d. For each neighbor of current:
      - If in closed set: skip
      - If in constraint mask: skip (infinite cost)
      
      - Calculate tentative_g_score:
        = g_score[current] + edge_cost(current, neighbor)
      
      - edge_cost = distance × cost_surface[neighbor]
                  + crossing_cost (if crossing detected)
      
      - If tentative_g_score < g_score[neighbor]:
        - Update g_score[neighbor]
        - Update f_score[neighbor] = g_score + heuristic(neighbor, end)
        - Add neighbor to open set

7. If open set empty and end not reached:
   - No feasible route exists
   - Relax constraints or report failure

Heuristic Function:
- Euclidean distance × minimum cost multiplier (1.0)
- Admissible heuristic ensures optimal solution
```

#### **Crossing Detection and Cost**

```
At each step, check if route crosses a feature:

1. Get current cell and neighbor cell coordinates
2. Create line segment between them
3. For each feature layer (roads, railways, rivers, pipelines):
   a. Check if line segment intersects feature
   b. If yes:
      - Identify feature type and width
      - Calculate crossing cost based on type
      - Determine crossing angle
      - Apply angle penalty if not orthogonal
      - Add to edge_cost

4. Cache crossing locations for reporting
```

#### **Multi-Corridor Generation**

```
Generate 3-5 distinct alternatives by varying constraint weights:

Alternative 1 (Minimum Cost):
- Terrain weight: 1.0
- Crossing weight: 1.0
- Protected weight: 1.0
- Geohazard weight: 1.0
- Result: Absolute cheapest route

Alternative 2 (Environmental Priority):
- Terrain weight: 1.0
- Crossing weight: 1.0
- Protected weight: 0.3  (strongly prefer avoiding)
- Geohazard weight: 1.0
- Result: Environmentally safer route (may be longer/more expensive)

Alternative 3 (Safety Priority):
- Terrain weight: 1.0
- Crossing weight: 1.0
- Protected weight: 1.0
- Geohazard weight: 0.5  (strongly prefer avoiding)
- Result: Geotechnically safer route

Alternative 4 (Balanced):
- Terrain weight: 0.8
- Crossing weight: 0.9
- Protected weight: 0.7
- Geohazard weight: 0.8
- Result: Balanced trade-offs

Alternative 5 (Minimum Crossings):
- Terrain weight: 1.0
- Crossing weight: 0.3  (heavily penalize crossings)
- Protected weight: 1.0
- Geohazard weight: 1.0
- Result: Fewest crossings (SAIPEM Criteria 1 priority)

Each alternative explores different trade-off space
```

---

### **Phase 4: Cost Estimation and Reporting**

#### **Route Cost Breakdown**

For each generated route, calculate:

```
1. Base Construction Cost:
   - Length × base_cost_per_meter
   - Example: 50 km × $150/m = $7,500,000

2. Terrain Adjustment:
   - Sum(segment_length × terrain_multiplier)
   - Example: 30km flat (×1.0) + 15km rolling (×1.3) + 5km steep (×1.8)
   - Adjustment: +$2,250,000

3. Crossing Costs:
   - Sum of all identified crossings
   - Example: 5 rivers ($200K each) + 20 roads ($75K each) + 2 railways ($200K each)
   - Crossing total: $2,900,000

4. Environmental Mitigation:
   - Protected area crossings × mitigation cost
   - Wetland crossings × restoration cost
   - Example: 2 Natura2000 sites ($500K each) + 5 wetland acres ($50K each)
   - Mitigation total: $1,250,000

5. Geohazard Engineering:
   - High-risk segments × enhanced engineering cost
   - Example: 8km seismic zone × $50K/km
   - Geohazard total: $400,000

6. Right-of-Way Acquisition:
   - Estimate based on land cover types
   - Example: 40km agricultural ($10K/km) + 10km forest ($30K/km)
   - ROW total: $700,000

TOTAL ESTIMATED COST: $15,000,000

Accuracy: ±10% ($13.5M - $16.5M)
```

#### **Comparison Report**

```
Route Comparison Table:

| Metric                  | Alt 1 (Min Cost) | Alt 2 (Env) | Alt 3 (Safety) | Alt 4 (Balanced) | Alt 5 (Min Cross) |
|-------------------------|------------------|-------------|----------------|------------------|-------------------|
| Length (km)             | 48.2             | 52.7        | 51.3           | 49.8             | 46.5              |
| Total Cost ($M)         | 14.2             | 16.8        | 15.9           | 15.1             | 15.5              |
| Cost per km ($K)        | 295              | 319         | 310            | 303              | 333               |
| River crossings         | 7                | 5           | 6              | 6                | 3                 |
| Road crossings          | 23               | 19          | 21             | 20               | 12                |
| Railway crossings       | 2                | 2           | 2              | 2                | 1                 |
| Protected area (km)     | 8.5              | 2.1         | 6.3            | 4.2              | 7.8               |
| Slope >15% (km)         | 3.2              | 4.1         | 1.8            | 2.5              | 2.9               |
| Geohazard zones (km)    | 6.7              | 5.9         | 2.3            | 4.1              | 5.5               |
| Permitting complexity   | Medium           | Low         | Medium         | Low-Med          | Medium            |
| Construction risk       | Medium-High      | Medium      | Low            | Low-Med          | Medium            |

RECOMMENDATION: Alternative 4 (Balanced)
- 6.3% more expensive than cheapest route
- 60% less protected area crossing
- 50% fewer geohazard zones
- Lower permitting risk
- Better long-term operational safety

SAVINGS vs. TRADITIONAL ROUTE: 12-18% (estimated)
```

---

## Implementation Roadmap

### **Step 1: Complete Phase 3B Tools** ✅ IN PROGRESS
- [x] `raster_calc` - COMPLETE
- [ ] `raster_reclassify` - Needed for cost surface generation
- [ ] `raster_boolean` - Needed for constraint masks
- [ ] `vector_to_raster` - Needed for infrastructure cost layers
- [ ] `raster_proximity` - Needed for distance-based costs

### **Step 2: Generate SAIPEM Constraint Layers**
- [ ] Slope analysis (already have DEM)
- [ ] Protected areas (WDPA + Natura2000)
- [ ] Geohazard maps (seismic, landslide, flood)
- [ ] Infrastructure layers (roads, railways, pipelines, powerlines)
- [ ] Land cover (ESA WorldCover)
- [ ] Water bodies (Global Surface Water)

### **Step 3: Build Cost Surfaces**
- [ ] Terrain cost raster
- [ ] Land cover cost raster
- [ ] Protected area cost raster
- [ ] Geohazard cost raster
- [ ] Composite cost surface

### **Step 4: Generate Constraint Masks**
- [ ] Slope >20% mask
- [ ] Safety clearance masks (houses, powerlines, pipelines)
- [ ] Absolute prohibited areas
- [ ] Composite constraint mask

### **Step 5: Implement Routing Algorithm**
- [ ] A* pathfinding with custom cost function
- [ ] Crossing detection and costing
- [ ] Multi-corridor generation
- [ ] Route optimization

### **Step 6: Cost Estimation Engine**
- [ ] Segment-by-segment cost calculation
- [ ] Crossing cost aggregation
- [ ] Total route cost estimation
- [ ] Comparison reporting

### **Step 7: Validation**
- [ ] Generate 5 route alternatives for SAIPEM AOI
- [ ] Calculate costs for each
- [ ] Compare against traditional straight-line approach
- [ ] Quantify savings
- [ ] Prepare demo deliverables

---

## Success Criteria

✅ **Generate 3-5 distinct route alternatives**  
✅ **Cost estimates within ±10% accuracy**  
✅ **Demonstrate 10%+ savings vs. traditional approach**  
✅ **All 12 SAIPEM criteria addressed**  
✅ **Professional deliverables ready for client demo**  

---

## Key Insight

**SAIPEM's criteria are PERFECT for cost optimization:**

1. **Criteria 1 (minimize crossings)** = Direct cost reduction
2. **Criteria 2 (avoid steep slopes)** = Excavation cost reduction
3. **Criteria 3 (avoid protected areas)** = Permitting cost/time reduction
4. **Criteria 4 (avoid geohazards)** = Engineering cost reduction
5. **Criteria 6 (parallel existing pipelines)** = ROW cost reduction

**By optimizing for these 5 criteria alone, we can easily achieve 10-15% cost savings.**

The remaining criteria (5, 7-12) are either safety requirements (hard constraints) or tactical optimizations that further reduce costs.

---

**Next Action:** Complete Phase 3B tools, then immediately begin generating SAIPEM constraint layers and cost surfaces.

**Timeline:** No estimates. Work until complete.

**Motto:** "Save the customer as much money as possible by giving them the most cost-efficient routes possible."



