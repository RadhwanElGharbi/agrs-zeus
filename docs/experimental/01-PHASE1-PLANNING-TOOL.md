# Phase 1: Complete Planning Tool Implementation

## Overview

Transform the existing ZEUS route optimization capability into a comprehensive pipeline planning platform that matches and exceeds AVEVA's planning capabilities.

**Current State:** PIRL-based route optimization with basic visualization
**Target State:** Full feasibility study platform with hydraulics, cost, and compliance

---

## Module 1.1: Hydraulic Modeling Engine

### 1.1.1 Purpose
Replace dependency on third-party tools (PIPEPHASE, Synergi, etc.) with native hydraulic simulation that integrates directly with route optimization.

### 1.1.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Hydraulic Engine Core                     │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Steady-State │  Transient   │   Thermal    │  Multi-Phase   │
│    Solver    │   Solver     │   Model      │    Model       │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Fluid Property Database                   │
├─────────────────────────────────────────────────────────────┤
│                Pipeline Network Topology                     │
└─────────────────────────────────────────────────────────────┘
```

### 1.1.3 Implementation Steps

#### Step 1: Fluid Property Engine
**Files to create:**
- `backend/hydraulics/fluid_properties.py`
- `backend/hydraulics/equations_of_state.py`

**Implementation details:**
```python
# Fluid property calculations
class FluidProperties:
    """
    Calculate fluid properties for:
    - Crude oil (API gravity based)
    - Natural gas (Z-factor correlation)
    - Refined products (ASTM tables)
    - Water (steam tables)
    """

    def density(self, T, P) -> float:
        """Calculate density at T, P conditions"""

    def viscosity(self, T, P) -> float:
        """Calculate dynamic viscosity"""

    def compressibility(self, T, P) -> float:
        """Calculate isothermal compressibility"""

    def vapor_pressure(self, T) -> float:
        """Calculate vapor pressure (cavitation check)"""
```

**Validation approach:**
- Compare against NIST database for standard fluids
- Validate against published API correlations
- Cross-check with PIPEPHASE outputs for known cases

#### Step 2: Steady-State Flow Solver
**Files to create:**
- `backend/hydraulics/steady_state.py`
- `backend/hydraulics/friction_models.py`
- `backend/hydraulics/elevation_handling.py`

**Key equations to implement:**
1. Darcy-Weisbach: `ΔP = f * (L/D) * (ρv²/2)`
2. Colebrook-White (implicit): `1/√f = -2log₁₀(ε/3.7D + 2.51/Re√f)`
3. Hazen-Williams (water): `Q = 0.285 * C * D^2.63 * S^0.54`
4. Panhandle equations (gas): A and B variants
5. AGA fully turbulent (gas)

**Implementation details:**
```python
class SteadyStateSolver:
    """
    Solve steady-state hydraulic network.

    Input:
        - Network topology (nodes, pipes)
        - Boundary conditions (pressures, flows)
        - Fluid properties
        - Pipe properties (diameter, roughness)
        - Elevation profile

    Output:
        - Pressure at each node
        - Flow rate in each pipe
        - Velocity profile
        - Head loss breakdown
    """

    def solve(self, network: PipeNetwork) -> SteadyStateResult:
        """Newton-Raphson iterative solver"""

    def check_constraints(self, result) -> List[Violation]:
        """
        Check:
        - Minimum pressure (vapor pressure margin)
        - Maximum velocity (erosion limits)
        - Maximum pressure (MAOP)
        """
```

**Validation approach:**
- Unit tests against analytical solutions (single pipe)
- Integration tests against published benchmark problems
- Cross-validation with existing PIPEPHASE models
- Field data comparison if available

#### Step 3: Transient Analysis (Surge/Waterhammer)
**Files to create:**
- `backend/hydraulics/transient.py`
- `backend/hydraulics/moc_solver.py` (Method of Characteristics)

**Key capabilities:**
1. Valve closure transients
2. Pump trip/start transients
3. Wave propagation modeling
4. Surge tank sizing assistance

**Implementation approach:**
```python
class TransientSolver:
    """
    Method of Characteristics (MOC) solver for
    transient hydraulic analysis.

    Physical phenomena modeled:
    - Pressure wave propagation
    - Pipe wall expansion/contraction
    - Valve dynamics
    - Pump characteristics
    """

    def run_simulation(
        self,
        network: PipeNetwork,
        initial_state: SteadyStateResult,
        events: List[TransientEvent],  # Valve closures, pump trips
        duration: float,
        dt: float
    ) -> TransientResult:
        """Run MOC simulation"""

    def size_surge_relief(self, result: TransientResult) -> SurgeReliefSpec:
        """Recommend surge relief valve sizing"""
```

**Validation approach:**
- Analytical solutions for simple cases
- Comparison with AFT Impulse benchmarks
- Code-to-code comparison with Synergi Pipeline Simulator

#### Step 4: Pump/Compressor Station Optimization
**Files to create:**
- `backend/hydraulics/pump_curves.py`
- `backend/hydraulics/compressor_models.py`
- `backend/hydraulics/station_optimizer.py`

**Capabilities:**
1. Pump curve interpolation
2. Compressor polytropic efficiency
3. Station spacing optimization
4. Energy cost minimization
5. Pump sequencing optimization

**Implementation details:**
```python
class StationOptimizer:
    """
    Optimize pump/compressor station placement and operation.

    Objectives (configurable weights):
    - Minimize number of stations
    - Minimize total power consumption
    - Minimize lifecycle cost
    - Maximize operational flexibility

    Constraints:
    - Pressure limits (min inlet, max discharge)
    - Temperature limits
    - Available power supply locations
    - Land acquisition feasibility
    """

    def optimize_placement(
        self,
        route: RouteResult,
        flow_requirements: FlowSpec,
        power_availability: List[PowerNode]
    ) -> StationPlan:
        """AI-assisted station placement optimization"""
```

**Validation approach:**
- Test against known optimal configurations
- Sensitivity analysis on key parameters
- Expert review of recommendations

### 1.1.4 GUI Integration

**New UI Components:**

1. **Hydraulic Setup Panel** (in Project sidebar)
   - Fluid selection (crude/gas/water/product)
   - Operating conditions (T, P, flow rate)
   - Product properties (API gravity, specific gravity)

2. **Results Visualization**
   - Pressure/head profile along route (line chart)
   - Velocity heatmap overlay on map
   - Station markers with operating points

3. **Transient Animation**
   - Time-slider for playback
   - Pressure wave visualization
   - Peak pressure highlighting

**Minimalism principles:**
- Hydraulic results appear as overlay toggle (like existing layers)
- Default view shows pass/fail status only
- Detailed results available on expand
- No separate hydraulics "mode" - integrated into route view

### 1.1.5 Testing Strategy

| Test Type | Coverage | Acceptance Criteria |
|-----------|----------|---------------------|
| Unit tests | All equations | Exact match to analytical |
| Integration | Solver convergence | < 100 iterations, < 0.1% residual |
| Regression | Known benchmarks | Within 2% of reference |
| Performance | Large networks | < 5s for 500-node network |
| Field validation | Real data | Within 5% of measured |

---

## Module 1.2: Cost Estimation Module

### 1.2.1 Purpose
Provide AI-driven construction cost estimates that replace manual spreadsheet calculations and outperform database lookups.

### 1.2.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Cost Estimation Engine                     │
├─────────────┬─────────────┬─────────────┬───────────────────┤
│  Material   │   Labor     │  Equipment  │   Indirect        │
│   Costs     │   Costs     │   Costs     │   Costs           │
├─────────────┴─────────────┴─────────────┴───────────────────┤
│                AI Cost Prediction Model                      │
├─────────────────────────────────────────────────────────────┤
│           Historical Cost Database + Indices                 │
└─────────────────────────────────────────────────────────────┘
```

### 1.2.3 Implementation Steps

#### Step 1: Material Takeoff Engine
**Files to create:**
- `backend/cost/material_takeoff.py`
- `backend/cost/pipe_specs.py`
- `backend/cost/fitting_rules.py`

**Capabilities:**
```python
class MaterialTakeoff:
    """
    Generate bill of materials from route and specifications.

    Outputs:
    - Line pipe quantities (by grade, diameter, wall thickness)
    - Fitting counts (bends, tees, reducers)
    - Valve requirements
    - Coating requirements
    - Cathodic protection materials
    """

    def calculate_pipe_joints(self, route: Route, spec: PipeSpec) -> PipeQuantity:
        """
        Calculate pipe lengths accounting for:
        - Standard joint lengths (40ft, 60ft, 80ft)
        - Waste factor
        - Bending allowances
        - Terrain adjustments
        """

    def calculate_fittings(self, route: Route, spec: PipeSpec) -> FittingList:
        """
        Determine fittings based on:
        - Horizontal direction changes
        - Vertical profile changes
        - Road/river crossings
        - Tie-in points
        """
```

**Validation approach:**
- Compare against actual project BOMs
- Cross-check with engineering rules of thumb
- Expert review of fitting rules

#### Step 2: Labor Cost Model
**Files to create:**
- `backend/cost/labor_rates.py`
- `backend/cost/productivity_model.py`
- `backend/cost/terrain_factors.py`

**Key factors modeled:**
1. Base labor rates by region/country
2. Productivity factors by terrain type
3. Weather/season adjustments
4. Union vs. non-union considerations
5. Specialty work (crossings, tie-ins)

**Implementation:**
```python
class LaborCostModel:
    """
    Calculate labor costs based on work breakdown.

    Work categories:
    - Clearing and grading
    - Trenching (by soil type)
    - Pipe stringing
    - Welding (by joint type)
    - Coating/inspection
    - Backfill and restoration
    - HDD/boring (special crossings)
    """

    def estimate_labor(
        self,
        route: Route,
        region: str,
        terrain_profile: TerrainAnalysis
    ) -> LaborEstimate:
        """
        Returns labor costs broken down by:
        - Work category
        - Crew type
        - Duration estimate
        """
```

**Validation approach:**
- Benchmark against industry databases (IHS, RSMeans)
- Historical project comparison
- Regional contractor input

#### Step 3: Equipment Cost Model
**Files to create:**
- `backend/cost/equipment_rates.py`
- `backend/cost/spread_configuration.py`

**Equipment categories:**
- Mainline spread equipment
- Tie-in equipment
- HDD rigs
- Boring machines
- Hydrostatic test equipment

**Implementation:**
```python
class EquipmentCostModel:
    """
    Calculate equipment costs based on:
    - Spread configuration (standard, double-joint, etc.)
    - Pipe diameter
    - Terrain requirements
    - Special crossings
    """

    def configure_spread(self, spec: PipeSpec, terrain: str) -> SpreadConfig:
        """Recommend spread configuration"""

    def estimate_equipment(
        self,
        route: Route,
        spread: SpreadConfig
    ) -> EquipmentEstimate:
        """Calculate equipment costs and durations"""
```

#### Step 4: AI Cost Prediction Integration
**Files to create:**
- `backend/cost/ai_model.py`
- `backend/cost/cost_features.py`
- `backend/cost/uncertainty_quantification.py`

**AI model approach:**
```python
class AICostPredictor:
    """
    Machine learning model for cost prediction refinement.

    Features:
    - Route characteristics (length, terrain mix, crossings)
    - Historical cost data
    - Market indices (steel, labor, fuel)
    - Regional factors

    Output:
    - Point estimate
    - Confidence interval
    - Key risk factors
    """

    def predict(self, features: CostFeatures) -> CostPrediction:
        """Generate AI-refined cost estimate"""

    def explain_variance(self, prediction: CostPrediction) -> List[CostDriver]:
        """Explain what's driving costs vs. baseline"""
```

**Training data requirements:**
- Minimum 50 historical projects for initial model
- Continuous learning from completed projects
- External market data feeds

#### Step 5: Cost Database and Indices
**Files to create:**
- `backend/cost/database.py`
- `backend/cost/market_indices.py`

**Data sources to integrate:**
- Steel price indices (Platts, AMM)
- Labor indices (BLS, regional)
- Equipment rental rates
- Historical project costs

### 1.2.4 GUI Integration

**New UI Components:**

1. **Cost Summary Card**
   - Total CAPEX with confidence range
   - Breakdown pie chart (material/labor/equipment/indirect)
   - Per-mile/km cost metric

2. **Cost Detail Panel**
   - Expandable breakdown by category
   - Line-item detail on click
   - Export to Excel capability

3. **Cost Comparison View**
   - Side-by-side route cost comparison
   - Sensitivity tornado chart
   - What-if parameter adjustment

**Minimalism principles:**
- Single cost number displayed by default
- Details available on expansion
- Charts only shown when comparing alternatives
- No separate "cost estimation mode"

### 1.2.5 Testing Strategy

| Test Type | Coverage | Acceptance Criteria |
|-----------|----------|---------------------|
| Unit tests | Calculation formulas | Exact match to manual |
| Integration | Full route estimate | Complete without error |
| Accuracy | Historical comparison | Within 15% of actuals |
| Performance | Large projects | < 10s for 500mi route |
| Edge cases | Extreme terrains | Reasonable bounds |

---

## Module 1.3: Regulatory Compliance Engine

### 1.3.1 Purpose
Automate regulatory compliance checking that currently requires manual review by subject matter experts.

### 1.3.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Compliance Engine Core                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│     HCA      │    Setback   │    Permit    │   Environmental│
│   Analysis   │    Rules     │    Tracker   │   Screening    │
├──────────────┴──────────────┴──────────────┴────────────────┤
│              Regulatory Rules Database                       │
├─────────────────────────────────────────────────────────────┤
│         Spatial Data Integration (GIS Layers)               │
└─────────────────────────────────────────────────────────────┘
```

### 1.3.3 Implementation Steps

#### Step 1: HCA Analysis Engine
**Files to create:**
- `backend/compliance/hca_analysis.py`
- `backend/compliance/hca_rules.py`
- `backend/compliance/population_density.py`

**HCA categories (per 49 CFR 195.450):**
1. High population areas (Class 3, 4)
2. Commercially navigable waterways
3. Drinking water sources
4. Ecological/environmental sensitive areas

**Implementation:**
```python
class HCAAnalyzer:
    """
    Identify High Consequence Areas along route.

    Data sources:
    - Census block data (population)
    - USGS waterways database
    - EPA drinking water sources
    - USFWS critical habitat
    """

    def identify_hcas(self, route: Route) -> List[HCASegment]:
        """
        Returns list of HCA segments with:
        - Start/end stations
        - HCA type
        - Buffer distance applied
        - Mitigation requirements
        """

    def calculate_buffer(self, pipe_spec: PipeSpec, hca_type: str) -> float:
        """Determine required buffer distance"""
```

**Validation approach:**
- Compare against manual HCA assessments
- Third-party consultant review
- PHMSA guidance document cross-reference

#### Step 2: Setback and Class Location Rules
**Files to create:**
- `backend/compliance/class_location.py`
- `backend/compliance/setback_rules.py`

**Rules to implement:**
1. DOT class location determination (1-4)
2. MAOP derating requirements
3. Valve spacing requirements
4. Marker requirements
5. State-specific setbacks

**Implementation:**
```python
class ClassLocationAnalyzer:
    """
    Determine pipeline class locations per DOT 192/195.

    For gas pipelines (49 CFR 192):
    - Class 1: <10 buildings in 220-yard sliding mile
    - Class 2: 11-45 buildings
    - Class 3: 46+ buildings
    - Class 4: Multi-story buildings
    """

    def analyze_class_locations(self, route: Route) -> List[ClassSegment]:
        """Classify each segment"""

    def determine_design_requirements(
        self,
        segments: List[ClassSegment],
        pipe_spec: PipeSpec
    ) -> DesignRequirements:
        """Wall thickness, valve spacing, testing requirements"""
```

#### Step 3: Environmental Screening
**Files to create:**
- `backend/compliance/environmental.py`
- `backend/compliance/species_database.py`
- `backend/compliance/wetlands.py`

**Environmental factors:**
1. Wetland impacts (USACE jurisdiction)
2. Threatened/endangered species habitat
3. Cultural resources (SHPO consultation)
4. Air quality (permit requirements)
5. Noise receptors

**Implementation:**
```python
class EnvironmentalScreener:
    """
    Preliminary environmental impact screening.

    NOT a replacement for full NEPA analysis, but:
    - Identifies red flags early
    - Estimates permitting timeline
    - Highlights mitigation needs
    """

    def screen_route(self, route: Route) -> EnvironmentalReport:
        """
        Returns:
        - Wetland acres impacted
        - Species of concern
        - Cultural resource probability
        - Estimated permit timeline
        - Recommended studies
        """
```

#### Step 4: Permit Requirement Tracker
**Files to create:**
- `backend/compliance/permit_database.py`
- `backend/compliance/permit_tracker.py`

**Permit categories:**
- Federal (FERC, USACE, BLM, etc.)
- State (utility commission, environmental agency)
- Local (county, municipality)
- Crossing-specific (railroad, highway)

**Implementation:**
```python
class PermitTracker:
    """
    Identify and track required permits.

    For each permit:
    - Triggering factor
    - Responsible agency
    - Typical timeline
    - Required documents
    - Fee estimate
    """

    def identify_permits(
        self,
        route: Route,
        project_type: str
    ) -> List[PermitRequirement]:
        """Identify all required permits"""

    def estimate_timeline(
        self,
        permits: List[PermitRequirement]
    ) -> PermitSchedule:
        """Critical path analysis of permit timing"""
```

### 1.3.4 GUI Integration

**New UI Components:**

1. **Compliance Status Badge**
   - Green/yellow/red indicator on route card
   - Quick summary of issues found
   - Click for details

2. **HCA Overlay**
   - Toggle layer showing HCA segments
   - Color-coded by HCA type
   - Buffer visualization

3. **Compliance Report View**
   - Checklist format
   - Issue severity ranking
   - Mitigation suggestions
   - Export to PDF

**Minimalism principles:**
- Status indicator always visible
- Details on demand
- No separate compliance "mode"
- Integrated into route comparison

### 1.3.5 Testing Strategy

| Test Type | Coverage | Acceptance Criteria |
|-----------|----------|---------------------|
| Unit tests | Individual rules | Match regulation text |
| Integration | Full route analysis | All rules evaluated |
| Accuracy | Known HCA routes | Match expert assessment |
| Edge cases | Boundary conditions | Correct classification |
| Regulatory | PHMSA audit simulation | Pass all checks |

---

## Module 1.4: Enhanced Route Analysis

### 1.4.1 Purpose
Extend current route optimization with comprehensive comparison and risk analysis tools.

### 1.4.2 Implementation Steps

#### Step 1: Multi-Route Comparison Matrix
**Files to create:**
- `backend/analysis/route_comparison.py`
- `frontend/src/components/Project/RouteComparison.tsx`

**Comparison metrics:**
- Total length
- Construction cost estimate
- ROW acquisition difficulty score
- Environmental impact score
- Schedule risk score
- Hydraulic efficiency
- Maintenance accessibility

**Implementation:**
```python
class RouteComparator:
    """
    Generate comprehensive route comparison matrix.
    """

    def compare_routes(
        self,
        routes: List[Route]
    ) -> ComparisonMatrix:
        """
        Returns matrix with:
        - Raw values for each metric
        - Normalized scores (0-100)
        - Weighted composite score
        - Winner by category
        """

    def sensitivity_analysis(
        self,
        routes: List[Route],
        weight_variations: Dict[str, List[float]]
    ) -> SensitivityResult:
        """Test how winner changes with different weights"""
```

#### Step 2: Stakeholder Impact Assessment
**Files to create:**
- `backend/analysis/stakeholder.py`
- `backend/analysis/landowner_analysis.py`

**Stakeholder categories:**
- Private landowners (number, parcel sizes)
- Public agencies (crossings, adjacency)
- Native American tribes (consultation needs)
- Municipalities (populated area impacts)
- Commercial/industrial (business impacts)

#### Step 3: Schedule Risk Modeling
**Files to create:**
- `backend/analysis/schedule_risk.py`
- `backend/analysis/monte_carlo.py`

**Risk factors:**
- Permit timing uncertainty
- Weather windows
- Resource availability
- ROW acquisition delays
- Construction productivity variance

**Implementation:**
```python
class ScheduleRiskModel:
    """
    Monte Carlo simulation for schedule risk.
    """

    def simulate_schedule(
        self,
        route: Route,
        base_schedule: Schedule,
        iterations: int = 10000
    ) -> ScheduleDistribution:
        """
        Returns:
        - P10, P50, P90 completion dates
        - Critical path risk factors
        - Recommended schedule contingency
        """
```

### 1.4.3 GUI Integration

**New UI Components:**

1. **Route Comparison Table**
   - Side-by-side metrics
   - Highlighting of best/worst
   - Sortable columns

2. **Decision Matrix View**
   - Radar chart comparison
   - Weight adjustment sliders
   - "Winner" recommendation

3. **Schedule Gantt Chart**
   - Expandable task detail
   - Risk overlay (P10-P90 bars)
   - Critical path highlighting

---

## Integration Requirements

### Backend API Endpoints

```
POST /api/projects/{id}/hydraulics/run
POST /api/projects/{id}/cost/estimate
POST /api/projects/{id}/compliance/analyze
POST /api/projects/{id}/routes/compare

GET /api/projects/{id}/hydraulics/results
GET /api/projects/{id}/cost/breakdown
GET /api/projects/{id}/compliance/report
GET /api/projects/{id}/routes/comparison
```

### Frontend State Management

New Zustand stores:
- `hydraulicsStore` - Hydraulic results and settings
- `costStore` - Cost estimates and breakdown
- `complianceStore` - Compliance status and issues
- `comparisonStore` - Route comparison state

### Database Schema Extensions

```sql
-- Hydraulic results
CREATE TABLE hydraulic_results (
    id UUID PRIMARY KEY,
    route_id UUID REFERENCES routes(id),
    created_at TIMESTAMP,
    result_type VARCHAR(50),  -- 'steady_state', 'transient'
    result_data JSONB
);

-- Cost estimates
CREATE TABLE cost_estimates (
    id UUID PRIMARY KEY,
    route_id UUID REFERENCES routes(id),
    created_at TIMESTAMP,
    total_cost DECIMAL,
    confidence_low DECIMAL,
    confidence_high DECIMAL,
    breakdown JSONB
);

-- Compliance results
CREATE TABLE compliance_results (
    id UUID PRIMARY KEY,
    route_id UUID REFERENCES routes(id),
    created_at TIMESTAMP,
    overall_status VARCHAR(20),
    hca_segments JSONB,
    issues JSONB
);
```

---

## Deliverables Checklist

### Module 1.1: Hydraulics
- [ ] Fluid property engine
- [ ] Steady-state solver
- [ ] Transient solver
- [ ] Station optimizer
- [ ] GUI integration
- [ ] Test suite
- [ ] Documentation

### Module 1.2: Cost Estimation
- [ ] Material takeoff
- [ ] Labor cost model
- [ ] Equipment cost model
- [ ] AI predictor
- [ ] Cost database
- [ ] GUI integration
- [ ] Test suite
- [ ] Documentation

### Module 1.3: Compliance
- [ ] HCA analyzer
- [ ] Class location engine
- [ ] Environmental screener
- [ ] Permit tracker
- [ ] GUI integration
- [ ] Test suite
- [ ] Documentation

### Module 1.4: Route Analysis
- [ ] Comparison matrix
- [ ] Stakeholder assessment
- [ ] Schedule risk model
- [ ] GUI integration
- [ ] Test suite
- [ ] Documentation

---

## Phase 1 Exit Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| Hydraulic accuracy | Benchmark comparison | Within 2% |
| Cost accuracy | Historical validation | Within 15% |
| Compliance coverage | PHMSA rules | 100% mapped |
| HCA accuracy | Expert review | 95% agreement |
| Performance | 100mi route analysis | < 2 minutes |
| Test coverage | Unit + integration | > 80% |
| Documentation | User guide | Complete |

---

*Document Version: 1.0*
*Last Updated: December 2024*
