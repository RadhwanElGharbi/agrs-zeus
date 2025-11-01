# PIRL & Analytics Dashboard Integration Plan
## AGRS ZEUS GUI Enhancement

**Generated:** 2025-10-27  
**Purpose:** Integrate PIRL training, route visualization, and analytics into the GUI

---

## 📋 **CURRENT GUI ARCHITECTURE**

### **Main Components**

1. **MainWindow** (`src/gui/MainWindow.cpp`)
   - Central stacked widget with 2D/3D views
   - Dockable panels (Layers, Properties, Console/Terminal)
   - Menu system (File, Project, View, Tools, Help)
   - Status bar with coordinate display
   - Qt-based with GDAL integration

2. **MapWidget** (`src/gui/MapWidget.cpp`)
   - 2D web-tile map viewer (OpenStreetMap)
   - Vector overlay rendering (points, lines, polygons)
   - Raster overlay rendering
   - Interactive features (pan, zoom, click)
   - Custom styling for layers (AOI, start/end points)
   - Screen ↔ geo coordinate conversion

3. **Terrain3DWidget** (`src/gui/Terrain3DWidget.cpp`)
   - 3D OpenSceneGraph-based viewer
   - DEM visualization with textures
   - Camera controls

4. **BackendInterface** (`src/gui/BackendInterface.cpp`)
   - Bridge to CLI tools (`zeus` binary)
   - Executes backend operations asynchronously
   - Logs to console

5. **Existing Dialogs**
   - `NewProjectDialog` - Project creation wizard
   - `ProjectSetupWizard` - Guided project setup
   - `AttributeTableDialog` - View/edit vector attributes
   - `VectorStyleDialog` - Customize layer styling
   - `PerplexityChatDialog` - AI assistant chat
   - `DatasetAvailabilityDialog` - Check dataset coverage
   - `ClipToAOIDialog` - Clip datasets to AOI
   - `FeatureIdentifyDialog` - Feature info popup
   - `TerminalWidget` - Integrated terminal

---

## 🎯 **PIRL INTEGRATION OBJECTIVES**

### **Phase 1: PIRL Training Panel** (Week 1-2)

**Objective:** Add a dockable PIRL training control panel to the GUI

**Features:**
1. **Training Configuration**
   - Load project AOI automatically
   - Verify start/end points
   - Display dataset inventory
   - Configure training parameters:
     - Total timesteps (default: 500,000)
     - Parallel environments (default: 8)
     - Learning rate, batch size, gamma
     - Checkpoint frequency
   - Visual indicator of missing datasets

2. **Training Control**
   - Start/Stop/Pause training buttons
   - Progress bar with estimated time remaining
   - Real-time metrics display:
     - Current timestep
     - Episode reward (rolling average)
     - Explained variance
     - Policy/value loss
   - Console log integration (show training output)

3. **Model Management**
   - List saved models with metadata
   - Load model for inference
   - Export model to production
   - Compare model performance

**Implementation:**
- Create `PIRLTrainingPanel.h/cpp` (QDockWidget)
- Create `PIRLConfigDialog.h/cpp` for configuration
- Integrate with `BackendInterface` to run training subprocess
- Add menu items: `Tools → PIRL Training`

---

### **Phase 2: Route Visualization** (Week 2-3)

**Objective:** Visualize PIRL-generated routes on the map with detailed segment information

**Features:**
1. **Route Overlay Rendering**
   - Display route as styled line on MapWidget
   - Color-coded segments by cost/risk:
     - Green: Low cost (<$500/m)
     - Yellow: Medium cost ($500-$1000/m)
     - Orange: High cost ($1000-$2000/m)
     - Red: Very high cost (>$2000/m)
   - Adjustable line width and transparency

2. **Interactive Route Features**
   - Click segment → Show detailed info popup:
     - Segment ID, length, cost
     - Terrain: slope, elevation change
     - Crossings: water, roads, railways
     - Risk factors: geohazards, protected areas
     - Constraint compliance
   - Hover → Highlight segment with tooltip
   - Right-click → Context menu (export, compare, analyze)

3. **Route Comparison**
   - Overlay multiple routes (PIRL vs. baseline vs. manual)
   - Side-by-side comparison table:
     - Total length
     - Total cost
     - Construction time estimate
     - Risk score
     - Constraint violations
   - Visual diff highlighting

4. **3D Route Visualization**
   - Integrate route into Terrain3DWidget
   - Display as 3D line with elevation profile
   - Fly-through animation

**Implementation:**
- Extend `MapWidget::drawOverlays()` to render routes
- Create `RouteOverlay` class (similar to `VectorOverlay`)
- Add `RouteInfoDialog.h/cpp` for segment details
- Create `RouteComparisonDialog.h/cpp`
- Update `Terrain3DWidget` to render 3D routes

---

### **Phase 3: Analytics Dashboard** (Week 3-4)

**Objective:** Comprehensive analytics and reporting for route optimization

**Features:**
1. **Cost Analysis Dashboard**
   - **Cost Breakdown Pie Chart:**
     - Earthwork (excavation, grading)
     - Crossings (water, road, railway)
     - Right-of-way (land acquisition)
     - Environmental mitigation
     - Geohazard mitigation
     - Permitting
   - **Cost per Segment Bar Chart** (interactive)
   - **Cost vs. Distance Scatter Plot**
   - **Cost Savings vs. Baseline** (cumulative)

2. **Risk Analysis Dashboard**
   - **Risk Heatmap:** Display risk levels along route
   - **Constraint Compliance Table:**
     - SAIPEM criteria checklist
     - Violations/warnings highlighted
   - **Geohazard Exposure:**
     - Seismic hazard zones crossed
     - Landslide risk areas
     - Flood zones
   - **Environmental Impact:**
     - Protected areas proximity
     - Waterbody crossings
     - Habitat disturbance

3. **Performance Metrics**
   - **Route Quality Metrics:**
     - Straightness index (actual length / straight-line distance)
     - Average slope along route
     - Maximum slope
     - Elevation change (cumulative)
     - Crossing density (per km)
   - **Optimization Metrics:**
     - Total cost vs. baseline (% savings)
     - Construction time vs. baseline
     - Risk reduction vs. baseline

4. **Training Analytics**
   - **Learning Curves:**
     - Episode reward over time (Tensorboard integration)
     - Value loss / Policy loss
     - Explained variance
   - **Model Comparison Table**
   - **Hyperparameter Sensitivity Analysis**

5. **Export & Reporting**
   - Generate PDF report with all analytics
   - Export data as CSV/JSON
   - Export route as Shapefile/GeoJSON with full metadata
   - Generate executive summary

**Implementation:**
- Create `AnalyticsDashboard.h/cpp` (QDockWidget or QDialog)
- Use QtCharts for graphs (pie, bar, scatter, line)
- Integrate Tensorboard logs for training curves
- Create `ReportGenerator.h/cpp` for PDF export
- Add menu items: `Tools → Analytics Dashboard`

---

### **Phase 4: Workflow Integration** (Week 4-5)

**Objective:** Seamless end-to-end pipeline routing workflow in GUI

**Features:**
1. **Project Initialization Wizard**
   - Enhanced `ProjectSetupWizard` with PIRL support
   - Auto-detect AOI, start/end points
   - Guided dataset acquisition
   - Run Fetch Tool Analyzer
   - Configure PIRL parameters

2. **One-Click Route Generation**
   - "Generate Optimal Route" button
   - Auto-configures PIRL training
   - Shows progress in real-time
   - Displays route on map when complete
   - Opens analytics dashboard

3. **Route Refinement Tools**
   - Manual waypoint editing (drag-and-drop on map)
   - Re-run PIRL with user constraints
   - Lock segments (force route through specific areas)
   - Exclude zones (forbidden areas)

4. **Deliverable Package Export**
   - Export complete data package:
     - Route shapefile with segment metadata
     - Cost breakdown spreadsheet
     - Risk analysis report
     - Compliance checklist
     - Executive summary PDF
     - All source datasets

**Implementation:**
- Enhance `ProjectSetupWizard` with PIRL steps
- Add "Generate Route" toolbar button
- Create `RouteEditorTool.h/cpp` for manual editing
- Create `ExportWizard.h/cpp` for deliverable packaging

---

## 📐 **TECHNICAL ARCHITECTURE**

### **New Classes to Implement**

```
agrs/
├── include/agrs_zeus/gui/
│   ├── PIRLTrainingPanel.h          # Training control panel
│   ├── PIRLConfigDialog.h           # Training configuration
│   ├── RouteInfoDialog.h            # Segment detail popup
│   ├── RouteComparisonDialog.h      # Compare routes
│   ├── AnalyticsDashboard.h         # Analytics dashboard
│   ├── ReportGenerator.h            # PDF report generator
│   ├── RouteEditorTool.h            # Manual route editing
│   └── ExportWizard.h               # Export deliverable package
│
├── src/gui/
│   ├── PIRLTrainingPanel.cpp
│   ├── PIRLConfigDialog.cpp
│   ├── RouteInfoDialog.cpp
│   ├── RouteComparisonDialog.cpp
│   ├── AnalyticsDashboard.cpp
│   ├── ReportGenerator.cpp
│   ├── RouteEditorTool.cpp
│   └── ExportWizard.cpp
```

### **MapWidget Route Rendering System**

**Route Data Structure:**
```cpp
struct RouteSegment {
    int id;
    QPointF startPoint;  // Lat/Lon
    QPointF endPoint;    // Lat/Lon
    double length;       // meters
    double cost;         // $/m
    double slope;        // percent
    QString terrain;     // land cover type
    QVector<QString> constraints;  // violated constraints
    QMap<QString, double> costBreakdown;
};

struct RouteOverlay {
    QString path;             // Route file path
    bool visible;
    bool valid;
    QVector<RouteSegment> segments;
    double totalCost;
    double totalLength;
    QColor baseColor;         // Color for normal segments
    bool costColorCoded;      // Color by cost?
    int zIndex;
};
```

**Rendering in `MapWidget::drawOverlays()`:**
```cpp
void MapWidget::drawRoute(QPainter& painter, const RouteOverlay& ro) {
    for (const RouteSegment& seg : ro.segments) {
        QPoint p1 = geoToScreen(seg.startPoint.x(), seg.startPoint.y());
        QPoint p2 = geoToScreen(seg.endPoint.x(), seg.endPoint.y());
        
        // Determine color based on cost
        QColor color = ro.costColorCoded 
            ? getCostColor(seg.cost)
            : ro.baseColor;
        
        // Draw segment with varying width based on importance
        painter.setPen(QPen(color, 4, Qt::SolidLine, Qt::RoundCap));
        painter.drawLine(p1, p2);
    }
}
```

### **BackendInterface Extensions**

Add methods to run PIRL training and inference:

```cpp
class BackendInterface {
public:
    // Start PIRL training subprocess
    void startPIRLTraining(const QString& configPath);
    
    // Stop PIRL training
    void stopPIRLTraining();
    
    // Get training status
    PIRLTrainingStatus getPIRLStatus();
    
    // Run route inference with trained model
    void generateRoute(const QString& modelPath, const QString& outputPath);
    
signals:
    void pirlTrainingStarted();
    void pirlTrainingProgress(int timesteps, double reward, double variance);
    void pirlTrainingCompleted(const QString& modelPath);
    void pirlTrainingFailed(const QString& error);
    void routeGenerated(const QString& routePath);
};
```

### **Analytics Integration**

**Tensorboard Integration:**
- Embed Tensorboard web view in Qt using `QWebEngineView`
- Or parse Tensorboard event files and display with QtCharts

**QtCharts Examples:**
```cpp
// Pie chart for cost breakdown
QChartView* createCostBreakdownChart(const QMap<QString, double>& costs) {
    QPieSeries* series = new QPieSeries();
    for (auto it = costs.begin(); it != costs.end(); ++it) {
        series->append(it.key(), it.value());
    }
    
    QChart* chart = new QChart();
    chart->addSeries(series);
    chart->setTitle("Cost Breakdown");
    
    return new QChartView(chart);
}

// Line chart for training progress
QChartView* createTrainingCurve(const QVector<double>& timesteps,
                                 const QVector<double>& rewards) {
    QLineSeries* series = new QLineSeries();
    for (int i = 0; i < timesteps.size(); ++i) {
        series->append(timesteps[i], rewards[i]);
    }
    
    QChart* chart = new QChart();
    chart->addSeries(series);
    chart->setTitle("Episode Reward Over Time");
    
    return new QChartView(chart);
}
```

---

## 🚀 **IMPLEMENTATION ROADMAP**

### **Week 1: PIRL Training Panel**
- [ ] Design PIRLTrainingPanel UI (Qt Designer or code)
- [ ] Implement configuration dialog
- [ ] Add BackendInterface methods for PIRL subprocess
- [ ] Integrate training logs into console
- [ ] Test start/stop/monitor workflow

### **Week 2: Route Visualization (2D)**
- [ ] Implement RouteOverlay data structure
- [ ] Extend MapWidget to render routes
- [ ] Add cost-based color coding
- [ ] Implement RouteInfoDialog for segment details
- [ ] Add click/hover interactions

### **Week 3: Route Visualization (3D) & Comparison**
- [ ] Integrate route into Terrain3DWidget
- [ ] Implement RouteComparisonDialog
- [ ] Add route export functionality (Shapefile/GeoJSON)
- [ ] Test route loading/visualization

### **Week 4: Analytics Dashboard**
- [ ] Design dashboard layout (multiple tabs)
- [ ] Implement cost analysis charts
- [ ] Implement risk analysis visualizations
- [ ] Parse Tensorboard logs for training curves
- [ ] Test dashboard with real data

### **Week 5: Workflow Integration & Polish**
- [ ] Enhance ProjectSetupWizard with PIRL
- [ ] Add "Generate Route" one-click button
- [ ] Implement ExportWizard for deliverables
- [ ] Write user documentation
- [ ] Create demo video

---

## 📊 **MOCKUP: PIRL Training Panel**

```
┌─────────────────────────────────────────────────────────┐
│ PIRL Training Control                          [×]      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Project: test_project                                   │
│ AOI: Central Italy (62 km)                             │
│ Start: 43.388°N, 13.514°E                              │
│ End:   42.898°N, 13.878°E                              │
│                                                         │
│ ┌─── Configuration ─────────────────────────────────┐  │
│ │ Total Timesteps:     [500,000]                    │  │
│ │ Parallel Envs:       [8]                          │  │
│ │ Learning Rate:       [0.0003]                     │  │
│ │ Checkpoint Every:    [10,000] steps               │  │
│ │                                                   │  │
│ │ [Configure Advanced...] [Load Config File...]    │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌─── Status ────────────────────────────────────────┐  │
│ │ ● Training in Progress                            │  │
│ │                                                   │  │
│ │ Progress:  [████████████░░░░░░░░] 55.7%          │  │
│ │            278,528 / 500,000 timesteps            │  │
│ │                                                   │  │
│ │ Episode Reward:    -477,000  (improving ✓)       │  │
│ │ Explained Var:      0.399    (learning ✓)        │  │
│ │ Speed:             10 steps/sec                   │  │
│ │ Time Remaining:    ~6 hours                       │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ [▶ Start]  [⏸ Pause]  [⏹ Stop]  [📊 View Analytics]   │
│                                                         │
│ Models:                                                 │
│ ├─ pirl_italy_v1_final.zip        (500k steps) ✓       │
│ ├─ pirl_italy_v1_100000.zip       (100k steps)         │
│ └─ pirl_italy_v1_50000.zip        (50k steps)          │
│                                                         │
│ [Load Model]  [Generate Route]  [Export Model]         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 **MOCKUP: Analytics Dashboard**

```
┌─────────────────────────────────────────────────────────────┐
│ Analytics Dashboard - test_project Route         [×]       │
├─────────────────────────────────────────────────────────────┤
│ [Cost] [Risk] [Performance] [Training] [Export]            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  COST ANALYSIS                                              │
│  ───────────────────────────────────────────────────────   │
│                                                             │
│  Total Cost: $77.9M          Savings: $21M (21.2%)         │
│  Cost/km:    $1.15M          Baseline: $1.45M/km           │
│                                                             │
│  ┌──── Cost Breakdown ────┐  ┌─ Cost per Segment ───────┐ │
│  │                        │  │                          │ │
│  │   [PIE CHART]          │  │   [BAR CHART]            │ │
│  │   - Earthwork 35%      │  │                          │ │
│  │   - Crossings 25%      │  │   Seg1 Seg2 Seg3 ...     │ │
│  │   - ROW 20%            │  │                          │ │
│  │   - Environ 12%        │  │                          │ │
│  │   - Geohaz 8%          │  │                          │ │
│  │                        │  │                          │ │
│  └────────────────────────┘  └──────────────────────────┘ │
│                                                             │
│  ┌──── Cumulative Cost vs Distance ────────────────────┐  │
│  │                                                      │  │
│  │   [LINE CHART]                                       │  │
│  │   Red: Baseline ($98.9M)                             │  │
│  │   Green: PIRL Optimal ($77.9M)                       │  │
│  │                                                      │  │
│  │   0km ──────────────────────────────────── 68km      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [Export CSV] [Generate Report PDF] [Export Route GIS]     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 **DEPENDENCIES**

### **Qt Modules**
- `Qt6::Core` (already included)
- `Qt6::Widgets` (already included)
- `Qt6::Charts` ⚠️ **NEW** - For graphs
- `Qt6::WebEngineWidgets` (optional - for Tensorboard embed)
- `Qt6::PrintSupport` ⚠️ **NEW** - For PDF export

### **C++ Libraries**
- GDAL/OGR (already included) - For GIS operations
- OpenSceneGraph (already included) - For 3D visualization
- nlohmann/json (check if included) - For JSON parsing

### **Python Integration**
- Continue using subprocess approach for PIRL training
- Parse JSON outputs from validation scripts
- Monitor log files for real-time progress

---

## 🎨 **UI/UX DESIGN PRINCIPLES**

1. **Consistency:** Match existing ZEUS UI style (dark mode, modern Qt widgets)
2. **Responsiveness:** Use progress indicators, disable buttons during operations
3. **Feedback:** Show clear status messages, errors, and success notifications
4. **Modularity:** Dockable panels can be rearranged by user
5. **Accessibility:** Keyboard shortcuts, tooltips, clear labels
6. **Professional:** Clean layouts, proper spacing, icon usage

---

## ✅ **TESTING STRATEGY**

1. **Unit Tests:** Test individual components (route rendering, cost calculation)
2. **Integration Tests:** Test PIRL training → route generation → visualization workflow
3. **UI Tests:** Manual testing of user interactions (clicks, drags, menus)
4. **Performance Tests:** Large routes (1000+ segments), multiple route overlays
5. **Cross-platform:** Test on Linux (primary), Windows, macOS

---

## 📚 **DOCUMENTATION REQUIREMENTS**

1. **Developer Docs:** 
   - Class diagrams for new components
   - API documentation (Doxygen)
   - Build instructions with new dependencies

2. **User Docs:**
   - PIRL Training Tutorial (step-by-step)
   - Route Analysis Guide
   - Analytics Dashboard User Manual
   - Video tutorials (screen recordings)

3. **Technical Specs:**
   - Route file format specification
   - Analytics data schema
   - Export deliverable structure

---

## 🎯 **SUCCESS CRITERIA**

✅ User can start PIRL training from GUI with 1 click  
✅ Training progress is visible in real-time  
✅ Generated routes are displayed on 2D and 3D maps  
✅ User can click any route segment to see detailed cost/risk info  
✅ Analytics dashboard shows comprehensive route analysis  
✅ User can export complete deliverable package (GIS files + reports)  
✅ Entire workflow (project setup → route generation → export) takes <5 minutes of user interaction  
✅ GUI remains responsive during training (non-blocking)  

---

## 📝 **NOTES**

- **Qt Charts License:** Qt Charts is GPL/Commercial. For commercial ZEUS distribution, may need Qt Commercial license or use alternative (e.g., QCustomPlot, matplotlib integration)
- **Tensorboard Integration:** Embedding Tensorboard may be overkill; parsing event files and displaying with QtCharts is simpler
- **3D Route Rendering:** May need to extend OSG scene graph for pipeline visualization
- **Performance:** Route rendering with 1000+ segments should use caching/LOD techniques

---

**End of Integration Plan**



