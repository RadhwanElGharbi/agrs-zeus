# Phase 2: EPC Detailed Design Implementation

## Overview

Build comprehensive 3D pipeline design capabilities that replace AVEVA E3D for pipeline-specific work, with AI-assisted automation that reduces engineering effort.

**AVEVA Equivalent:** E3D Design, PDMS, Isogen
**Target:** Generate construction-ready deliverables from optimized routes

---

## Module 2.1: 3D Pipeline Modeling

### 2.1.1 Purpose
Transform 2D route centerlines into full 3D pipeline models with terrain-conforming geometry.

### 2.1.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    3D Modeling Engine                        │
├──────────────┬──────────────┬──────────────┬────────────────┤
│  Centerline  │  Component   │   Terrain    │    Bend        │
│   Extruder   │   Placer     │  Conformer   │   Calculator   │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                 Geometry Kernel (OpenCASCADE)                │
├─────────────────────────────────────────────────────────────┤
│              Route Data + DEM + Specifications               │
└─────────────────────────────────────────────────────────────┘
```

### 2.1.3 Implementation Steps

#### Step 1: Geometry Kernel Integration
**Files to create:**
- `backend/design3d/geometry_engine.py`
- `backend/design3d/opencascade_wrapper.py`

**Technology choice:** OpenCASCADE (open-source BREP kernel)

**Capabilities:**
```python
class GeometryEngine:
    """
    Core geometry operations using OpenCASCADE.

    Operations:
    - Pipe sweep along curve
    - Boolean operations (cut, join)
    - Filleting (bends)
    - Export to STEP, IGES, IFC
    """

    def create_pipe(
        self,
        centerline: List[Point3D],
        outer_diameter: float,
        wall_thickness: float
    ) -> PipeGeometry:
        """Create pipe solid from centerline"""

    def create_bend(
        self,
        angle: float,
        radius: float,
        diameter: float
    ) -> BendGeometry:
        """Create elbow/bend geometry"""

    def export_step(self, assembly: Assembly) -> bytes:
        """Export to STEP format for CAD interchange"""
```

**Validation approach:**
- Import exported geometry into AutoCAD/SolidWorks
- Verify dimensions and tolerances
- Check watertightness of solids

#### Step 2: Terrain-Conforming Pipe Routing
**Files to create:**
- `backend/design3d/terrain_conformer.py`
- `backend/design3d/vertical_profile.py`
- `backend/design3d/cover_calculator.py`

**Implementation:**
```python
class TerrainConformer:
    """
    Generate vertical profile that conforms to terrain while
    meeting cover requirements.

    Constraints:
    - Minimum cover depth
    - Maximum grade angle
    - Bend limits (spacing, angle)
    - Crossing clearances
    """

    def generate_profile(
        self,
        centerline_2d: List[Point2D],
        dem: DigitalElevationModel,
        spec: PipeSpec
    ) -> VerticalProfile:
        """
        AI-optimized vertical profile generation.

        Algorithm:
        1. Sample terrain at intervals
        2. Apply minimum cover offset
        3. Smooth profile to minimize bends
        4. Insert vertical curves at grade changes
        5. Verify code compliance
        """

    def calculate_earthwork(
        self,
        profile: VerticalProfile,
        dem: DigitalElevationModel
    ) -> EarthworkQuantities:
        """Calculate cut/fill volumes"""
```

**Validation approach:**
- Cross-section visualization at stations
- Comparison with surveyed profiles
- Cover depth verification sampling

#### Step 3: Component Placement Engine
**Files to create:**
- `backend/design3d/component_library.py`
- `backend/design3d/component_placer.py`
- `backend/design3d/valve_spacing.py`

**Component types:**
- Line pipe (by spec, length)
- Elbows (prefab angles, field bends)
- Tees, wyes, laterals
- Reducers, expanders
- Valves (block, check, control)
- Flanges, connections
- Pig launchers/receivers
- Meters, instrumentation

**Implementation:**
```python
class ComponentPlacer:
    """
    Intelligent component placement along pipeline.

    Rules-based + AI-assisted placement for:
    - Valve locations (code-required + operational)
    - Pig facilities
    - Meter stations
    - Tie-in locations
    """

    def place_valves(
        self,
        route: Route3D,
        class_locations: List[ClassSegment],
        hca_segments: List[HCASegment]
    ) -> List[ValvePlacement]:
        """
        Place valves per code requirements:
        - 49 CFR 195.260 (liquid)
        - 49 CFR 192.179 (gas)

        Plus operational valves:
        - Road crossings
        - River crossings
        - Section isolation
        """

    def place_pig_facilities(
        self,
        route: Route3D,
        operational_requirements: PiggingSpec
    ) -> List[PigFacility]:
        """Launcher/receiver placement"""
```

**Validation approach:**
- Code compliance checker (valve spacing)
- Constructability review
- Operations team input

#### Step 4: AI-Assisted Design Automation
**Files to create:**
- `backend/design3d/ai_assistant.py`
- `backend/design3d/design_optimization.py`

**AI capabilities:**
```python
class DesignAIAssistant:
    """
    AI-powered design automation.

    Capabilities:
    - Optimal bend selection (prefab vs field)
    - Joint location optimization
    - Material grade optimization
    - Constructability scoring
    """

    def optimize_bend_selection(
        self,
        angle_changes: List[AngleChange],
        available_prefab_angles: List[float]
    ) -> List[BendSolution]:
        """
        Minimize:
        - Number of field bends
        - Material waste
        - Construction time

        Subject to:
        - Minimum tangent lengths
        - Bend radius limits
        """

    def suggest_improvements(
        self,
        design: PipelineDesign
    ) -> List[DesignSuggestion]:
        """AI-generated design improvement suggestions"""
```

### 2.1.4 GUI Integration

**New UI Components:**

1. **3D Viewer Panel**
   - WebGL-based 3D rendering (Three.js)
   - Orbit/pan/zoom controls
   - Component selection
   - Section cut planes

2. **Profile View**
   - Interactive vertical profile editor
   - Terrain overlay
   - Cover depth visualization
   - Grade angle indicators

3. **Component Editor**
   - Drag-drop component placement
   - Property editor sidebar
   - Validation status indicators

**Minimalism principles:**
- 2D remains default view
- 3D viewer as slide-out panel
- Simple toggle for component visibility
- No CAD-like complexity

---

## Module 2.2: Engineering Deliverables

### 2.2.1 Purpose
Automate generation of engineering drawings and documents that traditionally require CAD technicians.

### 2.2.2 Implementation Steps

#### Step 1: P&ID Generation
**Files to create:**
- `backend/deliverables/pid_generator.py`
- `backend/deliverables/symbol_library.py`

**P&ID elements:**
- Process equipment symbols
- Piping connections
- Instrumentation
- Control valves
- Safety systems

**Implementation:**
```python
class PIDGenerator:
    """
    Generate P&ID diagrams from pipeline model.

    Output:
    - SVG for web viewing
    - DXF/DWG for CAD import
    - PDF for documentation
    """

    def generate_pid(
        self,
        pipeline: PipelineModel,
        station: Optional[str] = None
    ) -> PIDDrawing:
        """
        Generate P&ID for:
        - Full pipeline schematic
        - Specific station detail
        - Typical sections
        """

    def export_formats(self, pid: PIDDrawing) -> Dict[str, bytes]:
        """Export to multiple formats"""
```

**Validation approach:**
- Compare against manually created P&IDs
- Symbol library review by engineers
- Industry standard compliance (ISA)

#### Step 2: Isometric Drawing Generation
**Files to create:**
- `backend/deliverables/isometric_generator.py`
- `backend/deliverables/pcf_exporter.py`

**Implementation:**
```python
class IsometricGenerator:
    """
    Generate fabrication isometrics from 3D model.

    Output similar to Isogen:
    - North-arrow orientation
    - Dimension callouts
    - BOM integration
    - Weld symbols
    """

    def generate_iso(
        self,
        pipe_segment: PipeSegment
    ) -> IsometricDrawing:
        """
        Generate ISO drawing with:
        - Orthographic pipe representation
        - Flow direction arrows
        - Component tags
        - Dimension chains
        - BOM reference numbers
        """

    def export_pcf(self, segment: PipeSegment) -> str:
        """Export to Piping Component File format"""
```

**Validation approach:**
- Comparison with Isogen output
- Fabricator review
- Dimension accuracy verification

#### Step 3: Alignment Sheet Generation
**Files to create:**
- `backend/deliverables/alignment_generator.py`
- `backend/deliverables/sheet_layout.py`

**Alignment sheet contents:**
- Plan view with stationing
- Profile view
- Typical sections
- ROW boundaries
- Feature crossing details

**Implementation:**
```python
class AlignmentSheetGenerator:
    """
    Generate construction alignment sheets.

    Sheet format:
    - Plan at top (1:2500 typical)
    - Profile at bottom
    - Key map inset
    - Crossing details
    - Legend
    """

    def generate_sheets(
        self,
        route: Route3D,
        sheet_length: float = 1000  # meters per sheet
    ) -> List[AlignmentSheet]:
        """Generate alignment sheet set"""

    def export_pdf(self, sheets: List[AlignmentSheet]) -> bytes:
        """Export sheet set to PDF"""
```

#### Step 4: Bill of Materials Extraction
**Files to create:**
- `backend/deliverables/bom_extractor.py`
- `backend/deliverables/material_codes.py`

**Implementation:**
```python
class BOMExtractor:
    """
    Extract bill of materials from design model.

    BOM structure:
    - Line items with quantities
    - Material codes (ASTM, API)
    - Manufacturer part numbers
    - Unit weights
    - Aggregated totals
    """

    def extract_bom(
        self,
        design: PipelineDesign
    ) -> BillOfMaterials:
        """Extract complete BOM"""

    def export_excel(self, bom: BillOfMaterials) -> bytes:
        """Export to Excel with formatting"""

    def link_to_vendors(
        self,
        bom: BillOfMaterials,
        vendor_catalog: VendorDatabase
    ) -> BOMWithPricing:
        """Add vendor pricing to BOM items"""
```

### 2.2.3 GUI Integration

**New UI Components:**

1. **Deliverables Panel**
   - Checklist of available outputs
   - Generate/regenerate buttons
   - Preview thumbnails
   - Download links

2. **Drawing Viewer**
   - In-browser PDF/SVG viewing
   - Zoom/pan controls
   - Print function
   - Markup capability (future)

**Minimalism principles:**
- One-click generation
- Preview before download
- Batch export option
- No manual drawing editing

---

## Module 2.3: Design Validation

### 2.3.1 Purpose
Automate design checks that ensure constructability and code compliance.

### 2.3.2 Implementation Steps

#### Step 1: Clash Detection
**Files to create:**
- `backend/validation/clash_detection.py`
- `backend/validation/clearance_rules.py`

**Clash types:**
- Hard clashes (geometry intersection)
- Soft clashes (clearance violations)
- Workflow clashes (construction sequence)

**Implementation:**
```python
class ClashDetector:
    """
    Detect geometric and clearance clashes.

    Checks:
    - Pipe-to-pipe interference
    - Pipe-to-structure interference
    - Minimum clearance to utilities
    - Access clearances for maintenance
    """

    def detect_clashes(
        self,
        design: PipelineDesign,
        external_models: Optional[List[ExternalGeometry]] = None
    ) -> List[Clash]:
        """
        Returns clash report with:
        - Clash type
        - Location (station, coordinates)
        - Severity (hard/soft)
        - Suggested resolution
        """
```

#### Step 2: Stress Analysis Integration
**Files to create:**
- `backend/validation/stress_analysis.py`
- `backend/validation/caesar_interface.py`

**Analysis types:**
- Sustained load analysis
- Expansion analysis
- Occasional loads
- Fatigue assessment

**Implementation:**
```python
class StressAnalyzer:
    """
    Pipeline stress analysis per ASME B31.4/B31.8.

    Level 1: Quick screening
    - Allowable span calculations
    - Expansion loop sizing
    - Anchor load estimation

    Level 2: Detailed analysis
    - Export to CAESAR II/AutoPIPE
    - Import results
    - Integrate with design
    """

    def quick_screen(
        self,
        design: PipelineDesign,
        operating_conditions: OperatingConditions
    ) -> StressScreenResult:
        """Quick pass/fail screening"""

    def export_caesar(self, design: PipelineDesign) -> CaesarFile:
        """Export neutral file for CAESAR II"""
```

#### Step 3: Code Compliance Checking
**Files to create:**
- `backend/validation/code_checker.py`
- `backend/validation/code_rules.py`

**Codes to implement:**
- ASME B31.4 (Liquid)
- ASME B31.8 (Gas)
- 49 CFR 192 (Gas regulations)
- 49 CFR 195 (Liquid regulations)
- API 1104 (Welding)

**Implementation:**
```python
class CodeChecker:
    """
    Verify design against applicable codes.

    Check categories:
    - Wall thickness adequacy
    - Pressure ratings
    - Temperature limits
    - Material compatibility
    - Valve requirements
    - Testing requirements
    """

    def check_design(
        self,
        design: PipelineDesign,
        applicable_codes: List[str]
    ) -> CodeComplianceReport:
        """
        Returns:
        - Pass/fail by code section
        - Specific violations
        - Required modifications
        """
```

### 2.3.3 GUI Integration

**New UI Components:**

1. **Validation Dashboard**
   - Overall status (pass/fail/warnings)
   - Category breakdown
   - Issue list with filtering

2. **Clash Viewer**
   - 3D visualization of clashes
   - Navigate between issues
   - Status tracking

**Minimalism principles:**
- Run validation with single button
- Issues highlighted in design view
- No separate validation mode

---

## Module 2.4: Procurement Support

### 2.4.1 Purpose
Bridge design to procurement with automated material ordering support.

### 2.4.2 Implementation Steps

#### Step 1: Vendor Database
**Files to create:**
- `backend/procurement/vendor_database.py`
- `backend/procurement/product_catalog.py`

**Implementation:**
```python
class VendorDatabase:
    """
    Maintain database of approved vendors and products.

    Data:
    - Vendor profiles
    - Product catalogs
    - Lead times
    - Pricing (updated periodically)
    - Quality ratings
    """

    def find_vendors(
        self,
        material_spec: MaterialSpec
    ) -> List[VendorOption]:
        """Find vendors for material specification"""

    def get_lead_time(
        self,
        vendor: str,
        product: str,
        quantity: float
    ) -> int:
        """Estimate delivery lead time"""
```

#### Step 2: RFQ Package Generation
**Files to create:**
- `backend/procurement/rfq_generator.py`
- `backend/procurement/bid_tabulation.py`

**Implementation:**
```python
class RFQGenerator:
    """
    Generate Request for Quote packages.

    Package contents:
    - Material list with specifications
    - Delivery schedule requirements
    - Quality requirements
    - Terms and conditions template
    """

    def generate_rfq(
        self,
        bom: BillOfMaterials,
        project_info: ProjectInfo
    ) -> RFQPackage:
        """Generate complete RFQ package"""

    def tabulate_bids(
        self,
        rfq: RFQPackage,
        responses: List[BidResponse]
    ) -> BidTabulation:
        """Compare vendor responses"""
```

#### Step 3: Delivery Schedule Optimization
**Files to create:**
- `backend/procurement/schedule_optimizer.py`

**Implementation:**
```python
class DeliveryScheduler:
    """
    Optimize material delivery to match construction schedule.

    Objectives:
    - Minimize storage requirements
    - Avoid construction delays
    - Batch orders for better pricing
    """

    def optimize_deliveries(
        self,
        bom: BillOfMaterials,
        construction_schedule: Schedule,
        vendor_lead_times: Dict[str, int]
    ) -> DeliveryPlan:
        """Generate optimized delivery schedule"""
```

### 2.4.3 GUI Integration

**New UI Components:**

1. **Procurement Dashboard**
   - BOM status (quoted/ordered/delivered)
   - Critical path items highlighted
   - Cost tracking

2. **Vendor Selection**
   - Side-by-side comparison
   - Lead time visualization
   - One-click RFQ generation

---

## Integration Requirements

### Backend API Endpoints

```
POST /api/projects/{id}/design/generate-3d
POST /api/projects/{id}/design/place-components
POST /api/projects/{id}/deliverables/generate
POST /api/projects/{id}/validation/run
POST /api/projects/{id}/procurement/rfq

GET /api/projects/{id}/design/model
GET /api/projects/{id}/deliverables/{type}
GET /api/projects/{id}/validation/report
GET /api/projects/{id}/bom
```

### Database Schema Extensions

```sql
-- Design model storage
CREATE TABLE design_models (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    version INT,
    created_at TIMESTAMP,
    geometry_data BYTEA,  -- Compressed geometry
    component_data JSONB
);

-- Deliverables tracking
CREATE TABLE deliverables (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    deliverable_type VARCHAR(50),
    generated_at TIMESTAMP,
    file_path VARCHAR(255),
    status VARCHAR(20)
);

-- Validation results
CREATE TABLE validation_results (
    id UUID PRIMARY KEY,
    design_id UUID REFERENCES design_models(id),
    validated_at TIMESTAMP,
    overall_status VARCHAR(20),
    issues JSONB
);
```

---

## Deliverables Checklist

### Module 2.1: 3D Modeling
- [ ] Geometry kernel integration
- [ ] Terrain conformer
- [ ] Component placer
- [ ] AI design assistant
- [ ] 3D viewer
- [ ] Test suite
- [ ] Documentation

### Module 2.2: Deliverables
- [ ] P&ID generator
- [ ] Isometric generator
- [ ] Alignment sheets
- [ ] BOM extractor
- [ ] Deliverables panel
- [ ] Test suite
- [ ] Documentation

### Module 2.3: Validation
- [ ] Clash detection
- [ ] Stress analysis integration
- [ ] Code checker
- [ ] Validation dashboard
- [ ] Test suite
- [ ] Documentation

### Module 2.4: Procurement
- [ ] Vendor database
- [ ] RFQ generator
- [ ] Delivery scheduler
- [ ] Procurement dashboard
- [ ] Test suite
- [ ] Documentation

---

## Phase 2 Exit Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| 3D accuracy | Dimension verification | < 1mm error |
| ISO quality | Fabricator review | Acceptable |
| Clash detection | Test model | 100% found |
| Code coverage | Unit + integration | > 80% |
| Export formats | CAD import test | STEP, IFC pass |
| Performance | 100km pipeline | < 5 min generation |

---

*Document Version: 1.0*
*Last Updated: December 2024*
