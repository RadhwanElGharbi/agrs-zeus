# PIRL Fix Plan - Proper GIS-Integrated Routing

## Problem Diagnosed

**Root Cause:** The current "heuristic" routing (`call_python_inference`) doesn't actually explore alternative paths or use GIS data for routing decisions. It simply:
1. Points toward the goal
2. Takes a step in that direction
3. Repeats

This creates a nearly straight-line route that ignores terrain, costs, and obstacles.

## What Needs To Happen

### 1. Implement Proper A* Pathfinding

The heuristic router needs to:
- **Evaluate multiple candidate next steps** (e.g., 8 directions: N, NE, E, SE, S, SW, W, NW)
- **Calculate real cost for each option** using:
  - Terrain difficulty (slope, elevation change)
  - Land cover type
  - Proximity to crossings (roads, waterways, railways)
  - Soil conditions
  - Protected areas
- **Choose the lowest-cost next step** (not just the one pointing at the goal)
- **Maintain a frontier of explored vs unexplored nodes**

### 2. Integrate Cost Model Into Route Generation

Currently, the cost model exists but isn't being called during route generation. It needs to:
- Calculate segment cost DURING routing (not after)
- Use terrain multipliers (flat, rolling, hilly, mountainous)
- Add crossing penalties
- Consider construction method based on terrain

### 3. Export Real Segment Data

The current post-processing script generates fake data. Instead:
- Export the actual route points with real terrain data
- Calculate costs for each segment based on what the algorithm saw
- Include real elevation, slope, land cover data
- Detect actual crossings by intersecting with vector layers

## Implementation Options

### Option A: Full A* in C++ (RECOMMENDED)

**Time:** 4-6 hours
**Complexity:** High
**Quality:** Best

Implement proper A* algorithm with:
- Priority queue for frontier nodes
- Cost evaluation at each step
- Path reconstruction
- Real GIS data integration

**Pros:**
- Produces truly optimized routes
- Uses all GIS datasets properly
- Industry-standard algorithm
- Demonstrable cost savings

**Cons:**
- Requires significant C++ work
- Need to recompile and test
- More complex debugging

### Option B: Grid-Based Dijkstra (MEDIUM)

**Time:** 2-3 hours
**Complexity:** Medium
**Quality:** Good

Create a cost grid from GIS data, then run Dijkstra:
- Rasterize costs to grid
- Run Dijkstra's algorithm
- Convert back to waypoints

**Pros:**
- Simpler than full A*
- Still uses all GIS data
- Proven algorithm

**Cons:**
- Resolution limited by grid size
- Memory intensive for large areas
- Less flexible than A*

### Option C: Greedy Best-First with Lookahead (QUICK)

**Time:** 1-2 hours
**Complexity:** Low
**Quality:** Acceptable

Enhance current heuristic with:
- Evaluate 8 directions at each step
- Calculate cost for each
- Choose lowest cost that progresses toward goal
- No backtracking

**Pros:**
- Quick to implement
- Uses GIS data
- Better than current straight-line

**Cons:**
- Can get stuck in local minima
- Not globally optimal
- Less impressive for demo

## Recommended Approach

Given the time constraints and need for a working demo:

### Phase 1: Quick Fix (Option C) - 2 hours
1. Modify `call_python_inference` to evaluate multiple directions
2. Use `CostModel` to calculate real costs
3. Choose best direction at each step
4. This will produce a reasonable route NOW

### Phase 2: Proper A* (Option A) - Future
1. Implement full A* for production use
2. Add proper frontier management
3. Support multiple alternative corridors
4. This becomes the "production" version

## Immediate Action Items

1. **Fix the heuristic (2 hours):**
   - Add directional evaluation (8 directions)
   - Integrate cost model
   - Choose lowest-cost next step

2. **Fix post-processing (1 hour):**
   - Read actual route points
   - Sample GIS data at each point
   - Calculate real segment costs
   - Detect real crossings

3. **Validate (1 hour):**
   - Run on test project
   - Verify route considers terrain
   - Check cost calculations
   - Import to ArcGIS and inspect

**Total Time: 4 hours for working, validated system**

## Success Criteria

After fix, the route should:
✅ Consider terrain (avoid steep slopes when possible)
✅ Use cost model (choose lower-cost paths)
✅ Have varying segment attributes (not all identical)
✅ Show real elevation/slope data
✅ Detect actual crossings if any exist
✅ Demonstrate cost-aware routing decisions

## Files To Modify

1. `/opt/agrs/src/pirl/PIRL_Environment.cpp`
   - Modify `call_python_inference()` to evaluate multiple directions
   - Integrate cost calculations

2. `/opt/agrs/Projects/test_project/process_route_detailed.py`
   - Fix to use REAL sampled data
   - Actually read DEM/slope/landcover at each point
   - Calculate costs based on real terrain

3. Recompile and test

---

**Decision Required:** 
Do you want:
- A) Quick fix now (2-4 hours, Option C)
- B) Proper A* implementation (4-6 hours, Option A)
- C) Both (quick fix now, proper A* later)

I recommend **C**: Implement Option C now for immediate results, then schedule proper A* for production use.

