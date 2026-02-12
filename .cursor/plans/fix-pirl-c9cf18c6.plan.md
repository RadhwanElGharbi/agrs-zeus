---
name: Enhanced Crossing Logic Implementation
overview: ""
todos:
  - id: 214b4fe4-ca60-4372-a839-c4ea2effcc67
    content: Expand State struct from 21D to 27D by adding crossing context features (nearest_crossing_dist, width, type, before/after distances, cardinal_alignment)
    status: pending
  - id: 58a5bd19-86b9-482a-94b6-6cff0023e7e4
    content: Expand Action struct from 2D to 3D by adding crossing_decision field (0=normal, 1=cross, 2=request_contour, 3=avoid)
    status: pending
  - id: dacbf66f-526e-4f25-bee4-5eac87d23af9
    content: Modify GISDataManager to store vector datasets for attribute queries and implement get_nearest_crossing_features method
    status: pending
  - id: d8a65320-1dc7-4380-a5fe-19a57acf8cdf
    content: Implement calculate_road_width method with lane count parsing and highway type inference logic
    status: pending
  - id: 517e2a04-3756-4a90-a80d-dea755340921
    content: Implement calculate_waterway_width method with width_m field parsing and dam/weir uncrossability detection
    status: pending
  - id: 3327672b-4eac-4990-b128-b10134a5da8f
    content: Replace fixed crossing costs with dynamic calculation based on feature width and type
    status: pending
  - id: 2fda9f21-755a-4afc-ab40-6406e0a81c36
    content: Implement contouring waypoint generation and adherence bonus system in PipelineEnvironment
    status: pending
  - id: 718067d8-dbf0-4841-bd7a-db807b6405e5
    content: Update PipelineEnvironment step logic to populate crossing context in state and handle crossing decisions
    status: pending
  - id: 00efe406-ff54-49a5-95dd-7389670b1f0b
    content: Create test_crossing_logic.cpp with unit tests for width parsing, cost calculation, and feature queries
    status: pending
  - id: cb6a2ed8-cbf6-4dcf-8eaf-7daa23c17979
    content: Create test_crossing_integration.cpp with integration tests for crossing decision flow and contouring behavior
    status: pending
  - id: 20ce4d9c-3ce5-4211-a59a-6611759e01bd
    content: Update pirl_native_env.py observation_space to shape=(27,) and action_space to shape=(3,)
    status: pending
  - id: 221e504a-50ce-48c0-9709-03cab110d216
    content: Recompile C++ core, run all tests, and validate no breaking changes
    status: pending
---

# Enhanced Crossing Logic Implementation

## Current State Analysis

**Current Crossing Logic** (Basic):

- Simple distance-based detection: `if (distance < threshold) → crossing detected`
- Fixed costs per crossing type (no geometry/attribute consideration)
- No contour option: agent either crosses or avoids via penalties
- Limited feature context: only nearest distance, no width/type/geometry
- Binary decision: cross with cost or don't cross with penalty

**Files**:

- `src/pirl/PIRL.cpp`: Lines 1029-1056 (basic crossing detection and fixed costs)
- `src/pirl/PIRL_Environment.cpp`: Lines 396-424 (proximity-based penalties)
- `include/agrs_zeus/PIRL.h`: Lines 386-391 (merged geometry storage only)

## Architecture Changes

### 1. Expand State Space (21D → ~27D)

**Add to `State` struct** (`PIRL.h` lines 122-165):

```cpp
// Crossing context features (NEW)
double nearest_crossing_dist;           // Distance to nearest crossable feature (m)
double nearest_crossing_width;          // Width of nearest crossing (m)
int nearest_crossing_type;              // 0=none, 1=road, 2=waterway, 3=railway, 4=powerline
double crossing_before_dist;            // Distance to feature before nearest
double crossing_after_dist;             // Distance to feature after nearest
double crossing_cardinal_alignment;     // How perpendicular to feature (0-1, 1=orthogonal)
```

**Rationale**: Agent needs geometric context of nearby crossings to make informed decisions.

### 2. Expand Action Space (2D → 3D)

**Modify `Action` struct** (`PIRL.h` lines 167-185):

```cpp
struct Action {
    double heading_change;  // [-max_turn, +max_turn] radians
    double step_size;       // [min_step, max_step] meters
    int crossing_decision;  // NEW: 0=normal, 1=cross, 2=request_contour, 3=avoid
    
    static constexpr int dimension() { return 3; }  // Was 2
    // ... rest of methods
};
```

**Rationale**: Explicit crossing decision allows agent to signal intent, enabling hybrid approach.

### 3. Enhance GISDataManager

**Current**: Stores merged `OGRGeometryCollection` → only supports distance queries

**New**: Store both geometries AND source datasets for attribute access

**Add to `GISDataManager`** (`PIRL.h` lines 323-399):

```cpp
// NEW: Vector datasets for attribute queries
std::unique_ptr<GDALDataset> roads_dataset_;
std::unique_ptr<GDALDataset> waterways_dataset_;
std::unique_ptr<GDALDataset> railways_dataset_;
std::unique_ptr<GDALDataset> powerlines_dataset_;

// NEW: Feature query methods with attributes
struct CrossingFeature {
    OGRGeometry* geometry;
    double width_m;
    std::string feature_type;  // highway type, waterway type, etc.
    int num_lanes;             // For roads
    double distance_from_point;
    bool is_crossable;         // dams/weirs are not crossable
};

std::vector<CrossingFeature> get_nearest_crossing_features(
    double x, double y, double search_radius_m, int max_features = 3
) const;

double calculate_road_width(const CrossingFeature& feature) const;
double calculate_waterway_width(const CrossingFeature& feature) const;
```

**Implementation Location**: `src/pirl/PIRL.cpp` after line 329

### 4. Enhanced Cost Calculation

**Modify `CostModel::calculate_segment_cost`** (`PIRL.cpp` lines 930-1071):

- Replace fixed crossing costs with dynamic calculation based on width/type
- For roads: Use lane count → width → HDD cost scales with width
- For waterways: Use `width_m` field → depth estimation → HDD complexity
- For dams/weirs: Return infinite cost (uncrossable)

**Add methods to `CostModel`**:

```cpp
double calculate_road_crossing_cost(const CrossingFeature& feature) const;
double calculate_waterway_crossing_cost(const CrossingFeature& feature) const;
double calculate_railway_crossing_cost(const CrossingFeature& feature) const;
```

**Implementation**: `src/pirl/PIRL.cpp` after line 1115

### 5. Contouring Waypoint System

**Add to `PipelineEnvironment`** (`PIRL.h` lines 586-653):

```cpp
// Contour waypoint management
std::vector<std::pair<double, double>> active_contour_waypoints_;
int current_waypoint_idx_;
bool is_contouring_;

// Generate contour waypoints around a feature
void generate_contour_waypoints(const CrossingFeature& feature);

// Check if agent is following contour (reward shaping)
double calculate_contour_adherence_bonus() const;
```

**Contouring Logic** (`PIRL_Environment.cpp` after line 424):

- When `crossing_decision == 2` (request_contour):

  1. Query nearest crossable feature geometry
  2. Buffer geometry by: `feature.width_m / 2 + min_clearance + safety_margin`
  3. Extract buffer boundary as LineString
  4. Generate waypoints along boundary from current position toward goal bearing
  5. Store waypoints in `active_contour_waypoints_`

- Agent navigates freely but receives bonus reward for staying near waypoints
- Agent can abandon contour if better route found (option 3: avoid/different direction)

### 6. Road Width Parsing Logic

**Implementation** (`GISDataManager::calculate_road_width`):

```cpp
double GISDataManager::calculate_road_width(const CrossingFeature& feature) const {
    const double LANE_WIDTH_M = 3.5;
    
    // Priority 1: Parse 'lanes' field
    int num_lanes = feature.num_lanes;
    if (num_lanes > 0) {
        return num_lanes * LANE_WIDTH_M;
    }
    
    // Priority 2: Infer from 'highway' field
    std::string highway_type = feature.feature_type;
    if (highway_type == "motorway") return 4 * LANE_WIDTH_M;  // 14.0m
    if (highway_type == "path") return 2 * LANE_WIDTH_M;      // 7.0m
    if (highway_type == "primary") return 3 * LANE_WIDTH_M;   // 10.5m
    if (highway_type == "residential") return 2 * LANE_WIDTH_M; // 7.0m
    if (highway_type == "secondary") return 2 * LANE_WIDTH_M;  // 7.0m
    if (highway_type == "service") return 2 * LANE_WIDTH_M;    // 7.0m
    if (highway_type == "tertiary") return 3 * LANE_WIDTH_M;   // 10.5m
    if (highway_type == "track") return 1 * LANE_WIDTH_M;      // 3.5m
    if (highway_type == "trunk") return 2 * LANE_WIDTH_M;      // 7.0m
    if (highway_type == "unclassified") return 2 * LANE_WIDTH_M; // 7.0m
    
    // Default: assume 2 lanes
    return 2 * LANE_WIDTH_M;
}
```

### 7. Waterway Width and Crossability

**Implementation** (`GISDataManager::calculate_waterway_width`):

```cpp
double GISDataManager::calculate_waterway_width(const CrossingFeature& feature) const {
    // Check if feature is uncrossable (dam/weir)
    if (feature.feature_type == "dam" || feature.feature_type == "weir") {
        feature.is_crossable = false;
        return std::numeric_limits<double>::max();  // Infinite cost
    }
    
    // Parse 'width_m' field if available
    if (feature.width_m > 0.0) {
        return feature.width_m;
    }
    
    // Fallback: estimate from waterway type
    if (feature.feature_type == "river") return 20.0;
    if (feature.feature_type == "stream") return 5.0;
    if (feature.feature_type == "canal") return 10.0;
    
    return 10.0;  // Default moderate width
}
```

### 8. Validation Tests

**Unit Tests** (`tests/test_crossing_logic.cpp` - NEW FILE):

1. **Road Width Parsing**:

   - Test lane count parsing (1-6 lanes)
   - Test highway type inference (all 10 types)
   - Test fallback to default (2 lanes)

2. **Waterway Width Parsing**:

   - Test `width_m` field extraction
   - Test dam/weir uncrossability detection
   - Test waterway type fallback

3. **Crossing Cost Calculation**:

   - Test road crossing cost scales with width (track=3.5m vs motorway=14m)
   - Test waterway cost scales with width (stream=5m vs river=20m)
   - Test railway fixed cost (width-independent)

4. **Feature Query**:

   - Test `get_nearest_crossing_features` returns correct 3 features
   - Test features are sorted by distance
   - Test search radius filtering

**Integration Tests** (`tests/test_crossing_integration.cpp` - NEW FILE):

1. **Crossing Decision Flow**:

   - Agent detects crossing within 20m
   - State updated with crossing context (width, type, distances)
   - Agent chooses action with `crossing_decision = 1` (cross)
   - Cost calculated based on actual feature width
   - Segment cost reflects accurate crossing expense

2. **Contouring Behavior**:

   - Agent chooses `crossing_decision = 2` (contour)
   - Environment generates waypoints around feature
   - Agent receives bonus for following contour
   - Agent can abandon contour if better path found

3. **Avoid Behavior**:

   - Agent chooses `crossing_decision = 3` (avoid)
   - Agent takes alternative direction
   - No crossing cost applied
   - No contour waypoints generated

**Manual Test Scenarios** (`tests/manual/test_crossing_scenarios.sh` - NEW FILE):

- Small stream crossing (width=5m, cost ~$15k)
- Large river crossing (width=30m, cost ~$100k+)
- Road crossings: track vs motorway (cost difference ~10x)
- Railway crossing (fixed high cost ~$250k)
- Dam avoidance (infinite penalty, agent must route around)
- Contour following (visual inspection of route adherence)

## Implementation Order

1. **State space expansion** (`PIRL.h` State struct + `PIRL.cpp` to_vector/from_vector)
2. **Action space expansion** (`PIRL.h` Action struct + dimension update)
3. **GISDataManager enhancement** (store datasets, implement feature queries)
4. **Width parsing logic** (road/waterway calculation methods)
5. **Enhanced cost calculation** (dynamic crossing costs)
6. **Contouring system** (waypoint generation, adherence bonus)
7. **Environment integration** (update step logic to use new features)
8. **Unit tests** (width parsing, cost calculation, feature queries)
9. **Integration tests** (crossing decision flow, contouring behavior)
10. **Python bindings update** (`pirl_native_env.py` observation/action space)
11. **Recompile and validate** (ensure no breaking changes)
12. **Manual testing** (run scenarios, inspect GeoJSON outputs)

## Key Files to Modify

- `include/agrs_zeus/PIRL.h`: State (lines 122-165), Action (lines 167-185), GISDataManager (lines 323-399), CostModel (lines 410-443), PipelineEnvironment (lines 586-653)
- `src/pirl/PIRL.cpp`: State serialization (lines 18-76), GISDataManager implementation (lines 155-894), CostModel (lines 900-1150)
- `src/pirl/PIRL_Environment.cpp`: step logic (lines 140-227), calculate_reward (lines 349-430)
- `python/pirl_training/pirl_native_env.py`: observation_space (line 25), action_space (line 26)
- `tests/test_crossing_logic.cpp`: NEW FILE
- `tests/test_crossing_integration.cpp`: NEW FILE

## Expected Outcomes

1. Agent learns nuanced crossing decisions based on real feature geometry
2. Crossing costs accurately reflect width/type from OSM data
3. Agent can intelligently choose to cross, contour, or avoid
4. Dams/weirs are correctly identified as uncrossable
5. Contouring provides smooth routing along clearance buffers
6. All tests pass, validating logic correctness
7. GeoJSON outputs show realistic crossing behavior