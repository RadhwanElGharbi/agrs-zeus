# Phase 3: Operations Platform Implementation

## Overview

Build real-time pipeline operations capabilities that replace AVEVA's Unified Operations Center and SCADA systems with an AI-native monitoring and predictive maintenance platform.

**AVEVA Equivalent:** Unified Operations Center, Enterprise SCADA, Pipeline Integrity Monitor
**Target:** Transform from design tool to full lifecycle platform

---

## Module 3.1: SCADA Integration Layer

### 3.1.1 Purpose
Enable real-time data ingestion from field devices without replacing existing SCADA infrastructure.

### 3.1.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SCADA Integration Layer                   │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   OPC-UA     │   Modbus     │    DNP3      │    REST/MQTT   │
│   Adapter    │   Adapter    │   Adapter    │    Adapter     │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Protocol Abstraction                      │
├─────────────────────────────────────────────────────────────┤
│                  Time-Series Database (InfluxDB)            │
├─────────────────────────────────────────────────────────────┤
│                       Data API Layer                         │
└─────────────────────────────────────────────────────────────┘
```

### 3.1.3 Implementation Steps

#### Step 1: Protocol Adapters
**Files to create:**
- `backend/scada/opcua_adapter.py`
- `backend/scada/modbus_adapter.py`
- `backend/scada/dnp3_adapter.py`
- `backend/scada/mqtt_adapter.py`

**OPC-UA Adapter:**
```python
class OPCUAAdapter:
    """
    Connect to OPC-UA servers for real-time data.

    Capabilities:
    - Browse server namespace
    - Subscribe to tags
    - Handle reconnection
    - Certificate management
    """

    async def connect(self, endpoint: str, credentials: OPCUACredentials):
        """Establish secure connection to OPC-UA server"""

    async def subscribe_tags(
        self,
        tag_list: List[str],
        callback: Callable[[str, Any, datetime], None]
    ):
        """Subscribe to tag updates with callback"""

    async def read_current(self, tags: List[str]) -> Dict[str, TagValue]:
        """Read current values of tags"""
```

**Modbus Adapter:**
```python
class ModbusAdapter:
    """
    Connect to Modbus TCP/RTU devices.

    Supports:
    - Register mapping configuration
    - Data type conversion
    - Polling interval management
    - Multiple device coordination
    """

    def configure_device(
        self,
        address: str,
        port: int,
        register_map: RegisterMap
    ):
        """Configure device connection and register mapping"""

    async def poll_device(self, device_id: str) -> Dict[str, float]:
        """Poll all configured registers from device"""
```

**Validation approach:**
- Test against simulators (Prosys OPC-UA, Modbus simulators)
- Field device testing with partner operators
- Protocol compliance verification

#### Step 2: Time-Series Data Store
**Files to create:**
- `backend/scada/timeseries_store.py`
- `backend/scada/data_compression.py`
- `backend/scada/retention_policy.py`

**Implementation:**
```python
class TimeSeriesStore:
    """
    High-performance time-series data storage.

    Uses InfluxDB for:
    - High write throughput
    - Efficient time-range queries
    - Built-in downsampling
    - Retention policies
    """

    async def write_points(self, points: List[DataPoint]):
        """Write batch of data points"""

    async def query_range(
        self,
        tag: str,
        start: datetime,
        end: datetime,
        aggregation: Optional[str] = None
    ) -> List[DataPoint]:
        """Query time range with optional aggregation"""

    async def get_latest(self, tags: List[str]) -> Dict[str, DataPoint]:
        """Get most recent value for each tag"""
```

**Data compression strategy:**
- Deadband compression (configurable threshold)
- Swinging door trending
- Automatic downsampling for historical data

#### Step 3: Alarm Management System
**Files to create:**
- `backend/scada/alarm_manager.py`
- `backend/scada/alarm_rules.py`
- `backend/scada/notification_service.py`

**Implementation:**
```python
class AlarmManager:
    """
    Centralized alarm management per ISA-18.2.

    Features:
    - Priority classification (1-4)
    - Alarm suppression/shelving
    - Alarm flood detection
    - Standing alarm tracking
    """

    def configure_alarm(
        self,
        tag: str,
        alarm_type: str,  # HI, HIHI, LO, LOLO, ROC
        setpoint: float,
        priority: int,
        deadband: float
    ):
        """Configure alarm for tag"""

    async def evaluate_alarms(self, current_values: Dict[str, float]):
        """Evaluate all alarm conditions"""

    async def acknowledge_alarm(
        self,
        alarm_id: str,
        user: str,
        comment: Optional[str] = None
    ):
        """Acknowledge active alarm"""
```

**Notification channels:**
- In-app notifications
- Email alerts
- SMS (via Twilio/AWS SNS)
- Microsoft Teams/Slack integration

#### Step 4: Data Historian API
**Files to create:**
- `backend/scada/historian_api.py`
- `backend/scada/trend_service.py`

**Implementation:**
```python
class HistorianAPI:
    """
    API for historical data access.

    Operations:
    - Time-range queries
    - Statistical aggregations
    - Data export
    - Calculated points
    """

    async def get_trend(
        self,
        tags: List[str],
        start: datetime,
        end: datetime,
        interval: str  # '1m', '5m', '1h', '1d'
    ) -> TrendData:
        """Get trend data with aggregation"""

    async def calculate_statistics(
        self,
        tag: str,
        start: datetime,
        end: datetime
    ) -> TagStatistics:
        """Calculate min, max, avg, std dev"""

    async def export_csv(
        self,
        tags: List[str],
        start: datetime,
        end: datetime
    ) -> bytes:
        """Export data to CSV"""
```

### 3.1.4 GUI Integration

**New UI Components:**

1. **Live Data Panel**
   - Real-time tag values display
   - Sparkline mini-charts
   - Status indicators (good/bad/stale)

2. **Alarm Banner**
   - Active alarm count by priority
   - Scrolling alarm list
   - Quick acknowledge button

3. **Trend Viewer**
   - Multi-tag overlay charts
   - Time range selection
   - Zoom/pan controls
   - Export to CSV

**Minimalism principles:**
- Live data as compact sidebar
- Alarms as non-intrusive banner
- Trends in modal/overlay
- No separate "SCADA mode"

---

## Module 3.2: Digital Twin

### 3.2.1 Purpose
Create a real-time synchronized model of the physical pipeline for visualization and analysis.

### 3.2.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Digital Twin Core                        │
├──────────────┬──────────────┬──────────────┬────────────────┤
│    State     │   Physics    │   Visual     │   Scenario     │
│   Manager    │   Engine     │   Renderer   │   Engine       │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Real-Time Data Feed                       │
├─────────────────────────────────────────────────────────────┤
│                    Design Model (Phase 2)                    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2.3 Implementation Steps

#### Step 1: State Synchronization
**Files to create:**
- `backend/digital_twin/state_manager.py`
- `backend/digital_twin/state_interpolation.py`

**Implementation:**
```python
class StateManager:
    """
    Maintain synchronized pipeline state.

    State variables:
    - Pressure at each node
    - Flow rate in each segment
    - Temperature profile
    - Valve positions
    - Pump/compressor status
    """

    async def update_state(self, measurements: Dict[str, float]):
        """
        Update twin state from measurements.

        Process:
        1. Validate measurements
        2. State estimation (Kalman filter)
        3. Interpolate unmeasured points
        4. Detect inconsistencies
        """

    def get_current_state(self) -> PipelineState:
        """Get current estimated state"""

    async def simulate_forward(
        self,
        duration: timedelta,
        events: List[ScheduledEvent]
    ) -> List[PipelineState]:
        """Simulate future states"""
```

#### Step 2: Physics Engine Integration
**Files to create:**
- `backend/digital_twin/physics_engine.py`
- `backend/digital_twin/realtime_hydraulics.py`

**Implementation:**
```python
class PhysicsEngine:
    """
    Real-time physics calculations for digital twin.

    Uses simplified models for speed:
    - Linearized hydraulics around operating point
    - Look-up tables for common scenarios
    - Full simulation only for what-if analysis
    """

    async def calculate_expected_state(
        self,
        boundary_conditions: Dict[str, float]
    ) -> PipelineState:
        """Calculate expected state from boundary conditions"""

    async def detect_anomalies(
        self,
        measured: Dict[str, float],
        expected: Dict[str, float]
    ) -> List[Anomaly]:
        """Detect deviations from expected behavior"""
```

#### Step 3: 3D Visualization Engine
**Files to create:**
- `frontend/src/components/DigitalTwin/TwinViewer.tsx`
- `frontend/src/components/DigitalTwin/StateRenderer.tsx`

**Visualization features:**
- Color-coded state variables (pressure heat map)
- Animated flow direction
- Alarm visualization
- Equipment status icons

**Implementation approach:**
```typescript
// React component for digital twin visualization
const TwinViewer: React.FC<TwinViewerProps> = ({ pipelineId }) => {
  const [state, setState] = useState<PipelineState | null>(null);

  useEffect(() => {
    // WebSocket connection for real-time updates
    const ws = new WebSocket(`ws://api/twin/${pipelineId}/state`);
    ws.onmessage = (event) => {
      setState(JSON.parse(event.data));
    };
    return () => ws.close();
  }, [pipelineId]);

  return (
    <Canvas>
      <PipelineModel model={designModel} />
      <StateOverlay state={state} />
      <EquipmentMarkers equipment={equipment} />
    </Canvas>
  );
};
```

#### Step 4: What-If Scenario Engine
**Files to create:**
- `backend/digital_twin/scenario_engine.py`
- `backend/digital_twin/scenario_library.py`

**Implementation:**
```python
class ScenarioEngine:
    """
    Run hypothetical scenarios on digital twin.

    Scenario types:
    - Valve closure analysis
    - Pump trip response
    - Demand change
    - Emergency shutdown
    - Pigging operations
    """

    async def run_scenario(
        self,
        scenario: Scenario,
        initial_state: PipelineState
    ) -> ScenarioResult:
        """
        Run scenario simulation.

        Returns:
        - State timeline
        - Key metrics (max pressure, min pressure, etc.)
        - Warnings/violations
        """

    def create_training_scenario(
        self,
        scenario_type: str,
        parameters: Dict[str, Any]
    ) -> Scenario:
        """Create scenario for operator training"""
```

### 3.2.4 GUI Integration

**New UI Components:**

1. **Twin Dashboard**
   - Overview map with live status
   - Key metrics widgets
   - Equipment status summary

2. **3D Twin Viewer**
   - Real-time state rendering
   - Time slider for playback
   - Scenario overlay mode

3. **Scenario Builder**
   - Event sequencer
   - Parameter adjustment
   - Results comparison

**Minimalism principles:**
- Twin view as alternate mode of existing map
- Scenario results as overlay
- Training mode as separate entry point

---

## Module 3.3: Integrity Management

### 3.3.1 Purpose
Provide AI-powered pipeline integrity monitoring and risk-based inspection scheduling.

### 3.3.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Integrity Management System                  │
├──────────────┬──────────────┬──────────────┬────────────────┤
│     ILI      │   Anomaly    │    Risk      │   Inspection   │
│   Analyzer   │   Detector   │   Assessor   │   Scheduler    │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                     ML Prediction Models                     │
├─────────────────────────────────────────────────────────────┤
│         Historical Data + Real-Time Monitoring              │
└─────────────────────────────────────────────────────────────┘
```

### 3.3.3 Implementation Steps

#### Step 1: ILI Data Integration
**Files to create:**
- `backend/integrity/ili_parser.py`
- `backend/integrity/anomaly_database.py`
- `backend/integrity/growth_model.py`

**ILI data types:**
- MFL (Magnetic Flux Leakage) for metal loss
- Caliper for geometry
- Crack detection tools
- Mapping/GPS data

**Implementation:**
```python
class ILIAnalyzer:
    """
    Analyze Inline Inspection data.

    Capabilities:
    - Parse vendor ILI reports (multiple formats)
    - Normalize anomaly data
    - Track anomaly history
    - Calculate growth rates
    """

    def import_ili_data(
        self,
        file_path: str,
        vendor: str,
        run_date: datetime
    ) -> ILIDataset:
        """Import and parse ILI data file"""

    def match_anomalies(
        self,
        current_run: ILIDataset,
        previous_runs: List[ILIDataset]
    ) -> List[MatchedAnomaly]:
        """Match anomalies across runs for growth analysis"""

    def calculate_remaining_life(
        self,
        anomaly: Anomaly,
        growth_rate: float,
        safety_factor: float = 1.5
    ) -> RemainingLifeEstimate:
        """Estimate remaining life per ASME B31G"""
```

**Validation approach:**
- Compare with vendor analysis
- Manual anomaly matching verification
- Industry benchmark comparison

#### Step 2: AI Anomaly Detection
**Files to create:**
- `backend/integrity/anomaly_detector.py`
- `backend/integrity/ml_models.py`

**Implementation:**
```python
class AnomalyDetector:
    """
    ML-based anomaly detection from operational data.

    Detection methods:
    - Statistical outlier detection
    - Pattern recognition (LSTM)
    - Physics-based residual analysis
    """

    async def train_model(
        self,
        historical_data: pd.DataFrame,
        known_anomalies: List[LabeledAnomaly]
    ):
        """Train anomaly detection model"""

    async def detect_realtime(
        self,
        current_data: Dict[str, float]
    ) -> List[DetectedAnomaly]:
        """Real-time anomaly detection"""

    async def classify_anomaly(
        self,
        anomaly: DetectedAnomaly
    ) -> AnomalyClassification:
        """Classify anomaly type and severity"""
```

**ML model types:**
- Isolation Forest for outlier detection
- LSTM for temporal patterns
- CNN for ILI signal analysis

#### Step 3: Risk Assessment Engine
**Files to create:**
- `backend/integrity/risk_model.py`
- `backend/integrity/consequence_model.py`

**Implementation:**
```python
class RiskAssessor:
    """
    Risk-based assessment per API 1160.

    Risk = Probability of Failure × Consequence of Failure

    POF factors:
    - Corrosion rate
    - Anomaly severity
    - Operating pressure ratio
    - Age

    COF factors:
    - HCA proximity
    - Product hazard
    - Population density
    - Environmental sensitivity
    """

    def assess_segment_risk(
        self,
        segment: PipelineSegment,
        anomalies: List[Anomaly]
    ) -> RiskScore:
        """Calculate risk score for segment"""

    def prioritize_repairs(
        self,
        risks: List[RiskScore]
    ) -> List[RepairPriority]:
        """Prioritize repairs by risk reduction per dollar"""
```

#### Step 4: Inspection Scheduling
**Files to create:**
- `backend/integrity/inspection_scheduler.py`
- `backend/integrity/optimization.py`

**Implementation:**
```python
class InspectionScheduler:
    """
    Optimize inspection schedule based on risk.

    Objectives:
    - Maintain acceptable risk level
    - Minimize inspection cost
    - Comply with regulatory requirements
    - Avoid operational disruptions
    """

    def generate_schedule(
        self,
        pipeline: Pipeline,
        planning_horizon: int,  # years
        budget_constraint: Optional[float] = None
    ) -> InspectionSchedule:
        """Generate optimized inspection schedule"""

    def recommend_inspection_type(
        self,
        segment: PipelineSegment,
        concerns: List[IntegrityConcern]
    ) -> List[RecommendedInspection]:
        """Recommend appropriate inspection methods"""
```

### 3.3.4 GUI Integration

**New UI Components:**

1. **Integrity Dashboard**
   - Risk heat map overlay
   - Anomaly count by type
   - Upcoming inspections

2. **ILI Viewer**
   - Anomaly visualization along route
   - Click for anomaly details
   - Growth trend charts

3. **Inspection Planner**
   - Schedule calendar view
   - Budget tracking
   - Compliance status

---

## Module 3.4: Leak Detection System

### 3.4.1 Purpose
Provide real-time leak detection that exceeds regulatory requirements and minimizes response time.

### 3.4.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Leak Detection System                      │
├──────────────┬──────────────┬──────────────┬────────────────┤
│   Volume     │  Pressure    │   Acoustic   │      AI        │
│  Balance     │   Analysis   │   Analysis   │   Classifier   │
├──────────────┴──────────────┴──────────────┴────────────────┤
│                    Real-Time Data Fusion                     │
├─────────────────────────────────────────────────────────────┤
│                   Response Automation                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.4.3 Implementation Steps

#### Step 1: Volume Balance Method
**Files to create:**
- `backend/leak_detection/volume_balance.py`
- `backend/leak_detection/inventory_tracking.py`

**Implementation:**
```python
class VolumeBalanceDetector:
    """
    Mass/volume balance leak detection (CPM-compliant).

    Method:
    - Track inlet/outlet volumes
    - Account for packing/unpacking
    - Statistical threshold analysis
    - Compensate for meter errors
    """

    async def calculate_balance(
        self,
        inlet_measurements: List[FlowMeasurement],
        outlet_measurements: List[FlowMeasurement],
        inventory_change: float
    ) -> BalanceResult:
        """Calculate volume balance"""

    async def detect_leak(
        self,
        balance: BalanceResult,
        threshold: float
    ) -> Optional[LeakAlarm]:
        """Detect leak from balance deviation"""
```

#### Step 2: Pressure/Flow Analysis
**Files to create:**
- `backend/leak_detection/pressure_analysis.py`
- `backend/leak_detection/rttm.py`  # Real-Time Transient Model

**Implementation:**
```python
class RTTMDetector:
    """
    Real-Time Transient Model leak detection.

    Uses transient hydraulic model to:
    - Calculate expected pressure profile
    - Detect deviations from model
    - Locate leak by wave timing
    """

    async def update_model(
        self,
        measurements: Dict[str, float]
    ):
        """Update model with current measurements"""

    async def detect_and_locate(
        self,
        pressure_drop: PressureEvent
    ) -> LeakLocation:
        """Detect leak and estimate location"""
```

#### Step 3: AI Leak Classifier
**Files to create:**
- `backend/leak_detection/ai_classifier.py`
- `backend/leak_detection/false_alarm_filter.py`

**Implementation:**
```python
class AILeakClassifier:
    """
    ML-based leak classification to reduce false alarms.

    Training data:
    - Historical leak events (real)
    - False alarm events (labeled)
    - Operational transients

    Output:
    - Leak probability
    - Leak type classification
    - Confidence score
    """

    async def classify_event(
        self,
        event_data: Dict[str, Any]
    ) -> LeakClassification:
        """Classify potential leak event"""

    async def filter_false_alarm(
        self,
        alarm: LeakAlarm,
        context: OperationalContext
    ) -> FilteredAlarm:
        """Apply false alarm filtering"""
```

#### Step 4: Automated Response
**Files to create:**
- `backend/leak_detection/response_automation.py`
- `backend/leak_detection/isolation_optimizer.py`

**Implementation:**
```python
class ResponseAutomation:
    """
    Automated leak response actions.

    Response levels:
    1. Alert operators
    2. Recommend isolation valves
    3. Auto-close valves (if enabled)
    4. Notify emergency responders
    """

    async def generate_response_plan(
        self,
        leak: ConfirmedLeak
    ) -> ResponsePlan:
        """Generate response plan for leak"""

    async def optimize_isolation(
        self,
        leak_location: Location,
        valve_positions: Dict[str, ValveInfo]
    ) -> IsolationPlan:
        """Optimize valve closure sequence"""
```

### 3.4.4 GUI Integration

**New UI Components:**

1. **Leak Detection Dashboard**
   - System status (armed/monitoring)
   - Current balance/deviation
   - Alarm history

2. **Leak Alert Modal**
   - Location map
   - Recommended actions
   - One-click response initiation

3. **Response Tracking**
   - Action checklist
   - Timeline of events
   - Regulatory reporting

---

## Integration Requirements

### Backend Services

```yaml
# Docker Compose services for operations platform
services:
  influxdb:
    image: influxdb:2.7
    volumes:
      - influxdb_data:/var/lib/influxdb2

  scada-gateway:
    build: ./backend/scada
    depends_on:
      - influxdb
    environment:
      - INFLUX_URL=http://influxdb:8086

  digital-twin:
    build: ./backend/digital_twin
    depends_on:
      - scada-gateway
      - redis

  leak-detection:
    build: ./backend/leak_detection
    depends_on:
      - scada-gateway
```

### API Endpoints

```
# SCADA
GET  /api/scada/tags
POST /api/scada/subscribe
GET  /api/scada/history/{tag}
GET  /api/scada/alarms

# Digital Twin
GET  /api/twin/{pipeline}/state
POST /api/twin/{pipeline}/scenario
WS   /api/twin/{pipeline}/live

# Integrity
GET  /api/integrity/{pipeline}/risk
POST /api/integrity/ili/import
GET  /api/integrity/anomalies
GET  /api/integrity/schedule

# Leak Detection
GET  /api/leak-detection/status
GET  /api/leak-detection/events
POST /api/leak-detection/response
```

---

## Phase 3 Exit Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| Data latency | SCADA to display | < 1 second |
| Leak detection | Time to alarm | < 30 seconds |
| False alarm rate | CPM compliance | < 1 per week |
| Anomaly detection | Accuracy | > 90% |
| Twin sync | State accuracy | Within 2% |
| Uptime | System availability | 99.9% |

---

*Document Version: 1.0*
*Last Updated: December 2024*
