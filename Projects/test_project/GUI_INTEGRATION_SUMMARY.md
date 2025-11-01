# GUI Integration Planning Summary
## PIRL & Analytics Dashboard Integration Roadmap

**Date:** 2025-10-27  
**Status:** ✅ Milestone Committed & Pushed to GitHub  
**Commit:** `c0d5c574` - "Milestone: PIRL Training System Complete + GUI Integration Plan"

---

## 🎉 **MILESTONE ACHIEVED**

Successfully committed and pushed to GitHub repository: `https://github.com/RadhwanElGharbi/agrs-zeus.git`

---

## 📊 **CURRENT GUI STATE ANALYZED**

### **Existing GUI Architecture (Qt6-based)**

**Main Window Structure:**
- **Central Widget:** Stacked 2D/3D views
  - `MapWidget`: 2D web-tile map (OpenStreetMap) with vector/raster overlays
  - `Terrain3DWidget`: 3D OpenSceneGraph terrain viewer
- **Dockable Panels:**
  - Layers panel (tree view with checkboxes)
  - Properties panel (read-only text)
  - Output panel (console + terminal tabs)
- **Status Bar:** Coordinates display + status messages

**Key Capabilities:**
1. ✅ 2D/3D view toggling
2. ✅ Vector layer rendering (points, lines, polygons with custom styling)
3. ✅ Raster overlay rendering
4. ✅ Interactive map (pan, zoom, click for feature info)
5. ✅ Integrated terminal widget
6. ✅ Project management (new, open, save)
7. ✅ Dataset clipping tools
8. ✅ Perplexity AI chat integration
9. ✅ Attribute table viewer
10. ✅ Backend interface for CLI tool execution

**Technology Stack:**
- **Framework:** Qt6 (Widgets)
- **GIS:** GDAL/OGR for data processing
- **3D:** OpenSceneGraph
- **Networking:** QNetworkAccessManager for web tiles
- **Build:** CMake

---

## 🎯 **INTEGRATION PLAN: 5-WEEK ROADMAP**

### **Phase 1: PIRL Training Panel (Week 1-2)**

**New Components:**
- `PIRLTrainingPanel.h/cpp` (QDockWidget)
- `PIRLConfigDialog.h/cpp` (QDialog)

**Features:**
1. **Training Configuration Interface**
   - Load project AOI automatically from active project
   - Display start/end points with coordinate validation
   - Show dataset inventory with visual completeness indicator
   - Parameter controls: timesteps, environments, learning rate, etc.
   - Advanced settings dialog

2. **Training Control & Monitoring**
   - Start/Stop/Pause buttons
   - Real-time progress bar with ETA
   - Live metrics display:
     - Current timestep / total
     - Episode reward (rolling average with sparkline)
     - Explained variance (learning indicator)
     - Policy/Value loss
     - Training speed (steps/sec)
   - Console log integration (auto-scroll)

3. **Model Management**
   - List saved models with metadata (timesteps, date, size)
   - Load model for inference
   - Compare models side-by-side
   - Export trained model

**Implementation Details:**
- Use `BackendInterface::executeAsync()` to run training subprocess
- Parse stdout for progress updates (regex or JSON)
- Update GUI every 1-2 seconds via QTimer
- Training runs in background, GUI remains responsive

**Location in MainWindow:**
- Add as right-side dock panel (next to Properties)
- Menu: `Tools → PIRL Training Control`
- Keyboard shortcut: `Ctrl+Shift+P`

---

### **Phase 2: Route Visualization (Week 2-3)**

**New Components:**
- `RouteOverlay` struct in `MapWidget`
- `RouteInfoDialog.h/cpp` (popup for segment details)
- `RouteComparisonDialog.h/cpp` (compare multiple routes)

**Features:**

**2D Route Rendering (MapWidget):**
1. **Color-Coded Route Display**
   - Cost-based coloring:
     - Green: Low cost (<$500/m)
     - Yellow: Medium ($500-$1000/m)
     - Orange: High ($1000-$2000/m)
     - Red: Very high (>$2000/m)
   - Alternative: Risk-based coloring
   - Toggle between display modes

2. **Interactive Segments**
   - Click segment → Show `RouteInfoDialog` with:
     - Segment ID, length, GPS coordinates
     - Cost breakdown (terrain, crossings, risk)
     - Terrain details (slope, elevation, land cover)
     - Constraint compliance status
   - Hover → Tooltip with summary
   - Right-click → Context menu (export, analyze, compare)

3. **Route Layer Management**
   - Add to layers panel as "Routes" category
   - Support multiple routes simultaneously (baseline, PIRL, manual)
   - Layer opacity control
   - Show/hide individual routes
   - Z-order control

**3D Route Rendering (Terrain3DWidget):**
- Render route as 3D line following terrain elevation
- Extrude line above terrain for visibility (adjustable height)
- Color code same as 2D
- Camera fly-through animation

**Data Structure:**
```cpp
struct RouteSegment {
    int id;
    QPointF startLatLon, endLatLon;
    double length_m;
    double cost_per_m;
    double cost_total;
    double slope_percent;
    double elevation_change_m;
    QString landcover_type;
    int num_crossings;  // water, road, railway
    QVector<QString> constraint_violations;
    QMap<QString, double> cost_breakdown;
};

struct RouteOverlay {
    QString name;
    QString filepath;
    QVector<RouteSegment> segments;
    double total_length, total_cost;
    bool visible;
    int display_mode;  // 0=cost, 1=risk, 2=slope
    int zIndex;
};
```

**File Format:**
- GeoJSON with detailed metadata per segment
- Shapefile with attribute table
- Load via `Tools → Load Route` or auto-detect in project folder

---

### **Phase 3: Analytics Dashboard (Week 3-4)**

**New Components:**
- `AnalyticsDashboard.h/cpp` (QDialog or QDockWidget)
- `ReportGenerator.h/cpp` (PDF export)

**Required Qt Module:**
- `Qt6::Charts` for graphs ⚠️ May require commercial license for commercial use

**Dashboard Layout (Tabbed):**

**Tab 1: Cost Analysis**
1. **Summary Cards (top row)**
   - Total Cost: $77.9M (with vs. baseline comparison)
   - Cost per km: $1.15M
   - Savings: $21M (21.2%)
   - ROI indicator

2. **Cost Breakdown Pie Chart**
   - Interactive segments (click to drill down)
   - Categories: Earthwork, Crossings, ROW, Environmental, Geohazard, Permitting

3. **Cost per Segment Bar Chart**
   - X-axis: Segment ID
   - Y-axis: Cost ($)
   - Click bar → Zoom to segment on map

4. **Cumulative Cost vs. Distance Line Chart**
   - Compare baseline vs. PIRL route
   - Shows where savings accumulate

**Tab 2: Risk Analysis**
1. **Risk Heatmap** (custom widget or integrate QImage)
   - Overlay risk zones on route
   - Color intensity = risk level

2. **Constraint Compliance Table**
   - 12 SAIPEM criteria with checkboxes
   - Red/Yellow/Green status indicators
   - Click row → Show map location

3. **Geohazard Exposure Summary**
   - Seismic hazard zones: Length exposed, max PGA
   - Landslide risk areas: Length, severity
   - Flood zones: Crossings, depth

4. **Environmental Impact Assessment**
   - Protected areas proximity: Distance to nearest
   - Waterbody crossings: Count, total length
   - Habitat disturbance score

**Tab 3: Performance Metrics**
1. **Route Quality Indicators**
   - Straightness index: 1.05 (actual/straight-line)
   - Average slope: 8.2%
   - Max slope: 18.5%
   - Elevation change: +850m / -920m
   - Crossing density: 1.2 per km

2. **Optimization Metrics vs. Baseline**
   - Cost savings: 21.2%
   - Time savings: 15% (construction)
   - Risk reduction: 35%

**Tab 4: Training Curves** (Tensorboard Integration)
- Parse Tensorboard event files
- Plot with QtCharts:
  - Episode reward over time
  - Value/Policy loss
  - Explained variance
  - Learning rate schedule

**Tab 5: Export**
- **Generate PDF Report:** Executive summary with all charts
- **Export Data:** CSV/JSON for further analysis
- **Export Route:** Shapefile/GeoJSON with metadata
- **Export Package:** Complete deliverable (routes + reports + datasets)

**Implementation:**
```cpp
// Example: Create pie chart
QChartView* AnalyticsDashboard::createCostPieChart() {
    QPieSeries* series = new QPieSeries();
    series->append("Earthwork", 35);
    series->append("Crossings", 25);
    series->append("ROW", 20);
    series->append("Environmental", 12);
    series->append("Geohazard", 8);
    
    for (QPieSlice* slice : series->slices()) {
        slice->setLabelVisible(true);
        slice->setLabel(QString("%1: %2%").arg(slice->label()).arg(slice->percentage() * 100, 0, 'f', 1));
    }
    
    QChart* chart = new QChart();
    chart->addSeries(series);
    chart->setTitle("Cost Breakdown");
    chart->legend()->setAlignment(Qt::AlignBottom);
    
    QChartView* chartView = new QChartView(chart);
    chartView->setRenderHint(QPainter::Antialiasing);
    return chartView;
}
```

---

### **Phase 4: Workflow Integration (Week 4-5)**

**1. Enhanced Project Setup Wizard**
- Add "PIRL Pipeline Routing" project type
- Guided steps:
  1. Define AOI (draw or import)
  2. Set start/end points (click on map)
  3. Select project CRS
  4. Run Fetch Tool Analyzer (auto-detect available datasets)
  5. Fetch missing datasets
  6. Configure PIRL parameters
  7. Launch training

**2. One-Click Route Generation**
- New toolbar button: "Generate Optimal Route" 🚀
- Action:
  1. Validate project setup (AOI, points, datasets)
  2. Open PIRL config dialog (pre-filled)
  3. Start training with one click
  4. Show progress in training panel
  5. Auto-load route when complete
  6. Open analytics dashboard

**3. Route Editing Tools**
- Manual waypoint insertion (Ctrl+Click on map)
- Drag waypoints to adjust route
- Lock segments (force route through area)
- Exclude zones (forbidden areas → red overlay)
- Re-run PIRL with user constraints

**4. Deliverable Package Export Wizard**
- Checklist dialog:
  - ✅ Route Shapefile with metadata
  - ✅ Cost breakdown spreadsheet
  - ✅ Risk analysis report PDF
  - ✅ Compliance checklist
  - ✅ Executive summary PDF
  - ✅ Source datasets (optional)
- Creates ZIP archive with standard naming
- Auto-generates README.txt

---

## 🛠️ **TECHNICAL IMPLEMENTATION NOTES**

### **BackendInterface Extensions**

Add methods to manage PIRL subprocess:

```cpp
// In include/agrs_zeus/gui/BackendInterface.h
class BackendInterface : public QObject {
    Q_OBJECT
public:
    // Existing methods...
    
    // PIRL training control
    void startPIRLTraining(const QString& configPath);
    void stopPIRLTraining();
    PIRLStatus getPIRLStatus();
    
    // Route generation
    void generateRoute(const QString& modelPath, const QString& outputPath);
    
signals:
    void pirlTrainingStarted();
    void pirlProgressUpdate(int timesteps, double reward, double variance);
    void pirlTrainingCompleted(const QString& modelPath);
    void pirlTrainingFailed(const QString& error);
    void routeGenerated(const QString& routePath);
    
private:
    QProcess* m_pirlProcess{nullptr};
    QTimer* m_pirlMonitor{nullptr};
    QString m_pirlLogFile;
};
```

### **MapWidget Route Rendering**

Extend `MapWidget::drawOverlays()`:

```cpp
void MapWidget::drawRoute(QPainter& painter, const RouteOverlay& route) {
    if (!route.visible) return;
    
    for (const RouteSegment& seg : route.segments) {
        QPoint p1 = geoToScreen(seg.startLatLon.x(), seg.startLatLon.y());
        QPoint p2 = geoToScreen(seg.endLatLon.x(), seg.endLatLon.y());
        
        // Color by cost/risk
        QColor color = getSegmentColor(seg, route.display_mode);
        
        // Draw with outline for visibility
        painter.setPen(QPen(Qt::white, 6, Qt::SolidLine, Qt::RoundCap));
        painter.drawLine(p1, p2);
        painter.setPen(QPen(color, 4, Qt::SolidLine, Qt::RoundCap));
        painter.drawLine(p1, p2);
    }
}

QColor MapWidget::getSegmentColor(const RouteSegment& seg, int mode) {
    if (mode == 0) {  // Cost-based
        if (seg.cost_per_m < 500) return QColor(0, 200, 0);     // Green
        if (seg.cost_per_m < 1000) return QColor(255, 200, 0);  // Yellow
        if (seg.cost_per_m < 2000) return QColor(255, 100, 0);  // Orange
        return QColor(255, 0, 0);                                 // Red
    }
    // Add risk-based, slope-based modes...
}
```

### **Tensorboard Event Parsing**

Use TensorFlow's event file format or parse manually:

```cpp
#include <QFile>
#include <QDataStream>

QVector<TrainingMetric> parseTensorboardEvents(const QString& eventFile) {
    QVector<TrainingMetric> metrics;
    QFile file(eventFile);
    if (!file.open(QIODevice::ReadOnly)) return metrics;
    
    // Parse TFRecord format (protobuf)
    // Extract: wall_time, step, tag, simple_value
    // ... implementation ...
    
    return metrics;
}
```

---

## 📦 **DEPENDENCIES TO ADD**

### **CMakeLists.txt Updates**

```cmake
# Add Qt Charts module
find_package(Qt6 REQUIRED COMPONENTS Core Widgets Charts PrintSupport)

# Link to targets
target_link_libraries(zeus_gui
    PRIVATE
    Qt6::Core
    Qt6::Widgets
    Qt6::Charts      # NEW
    Qt6::PrintSupport # NEW (for PDF export)
    # ... existing libs ...
)
```

### **Optional: QPdfWriter for Reports**

Qt's built-in PDF generator (QPdfWriter) is sufficient for basic reports. For advanced layouts, consider:
- **Poppler-Qt6:** PDF rendering
- **Qt HTML/CSS → PDF:** Use QTextDocument + QPrinter

---

## 🎨 **UI/UX MOCKUPS**

### **PIRL Training Panel (Docked Right)**

```
┌─────────────────────────────────────┐
│ PIRL Training              [−] [×] │
├─────────────────────────────────────┤
│ Project: test_project               │
│ AOI: Central Italy (62 km)          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│ ✓ Start: 43.388°N, 13.514°E        │
│ ✓ End:   42.898°N, 13.878°E        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│ Configuration                       │
│ Timesteps: [500,000]                │
│ Envs:      [8]                      │
│ LR:        [0.0003]                 │
│                                     │
│ [Configure...] [Load Config...]    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│ Status: ● Training (55% done)       │
│ [████████████░░░░░░░░] 278k/500k   │
│                                     │
│ Reward:    -477,000 (improving ↗)  │
│ Variance:   0.399 (learning ✓)     │
│ Speed:     10 steps/sec             │
│ ETA:       ~6 hours                 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│ [⏸ Pause] [⏹ Stop] [📊 Analytics] │
│                                     │
│ Models:                             │
│ ├─ pirl_v1_final.zip  (500k) ✓     │
│ ├─ pirl_v1_300k.zip   (300k)       │
│ └─ pirl_v1_100k.zip   (100k)       │
│                                     │
│ [Load] [Generate Route] [Export]   │
└─────────────────────────────────────┘
```

### **Analytics Dashboard (Dialog)**

```
┌──────────────────────────────────────────────────────────────┐
│ Analytics Dashboard - test_project Route          [_] [□] [×]│
├──────────────────────────────────────────────────────────────┤
│ [Cost] [Risk] [Performance] [Training] [Export]              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  COST ANALYSIS                                               │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
│  │ Total  │ │Cost/km │ │Savings │ │  ROI   │              │
│  │$77.9M  │ │$1.15M  │ │  21%   │ │ 4.2x   │              │
│  └────────┘ └────────┘ └────────┘ └────────┘              │
│                                                              │
│  ┌─── Cost Breakdown ───┐  ┌─ Cost per Segment ─────────┐  │
│  │                      │  │                            │  │
│  │   [PIE CHART]        │  │   [BAR CHART]              │  │
│  │                      │  │   ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮         │  │
│  │   Earthwork   35%    │  │   1  5  10 15 20 ...       │  │
│  │   Crossings   25%    │  │   Segment ID →             │  │
│  │   ROW         20%    │  │                            │  │
│  │   Environ     12%    │  │   [Zoom to Segment]        │  │
│  │   Geohazard    8%    │  │                            │  │
│  └──────────────────────┘  └────────────────────────────┘  │
│                                                              │
│  ┌──── Cumulative Cost vs Distance ────────────────────┐    │
│  │                                                      │    │
│  │   [LINE CHART]                                       │    │
│  │   ─── Baseline ($98.9M)                              │    │
│  │   ─── PIRL ($77.9M)                                  │    │
│  │                                                      │    │
│  │   0km ────────────────────────────────────── 68km    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  [Export CSV] [PDF Report] [Compare Routes]                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## ✅ **SUCCESS CRITERIA**

When implementation is complete, the following must be true:

1. ✅ User can start PIRL training from GUI with 1 click
2. ✅ Training progress is visible in real-time (no CLI required)
3. ✅ Routes display on 2D and 3D maps with proper styling
4. ✅ Clicking any route segment shows detailed cost/risk info
5. ✅ Analytics dashboard provides comprehensive route analysis
6. ✅ User can export complete deliverable package (GIS + reports)
7. ✅ Entire workflow (project setup → training → export) takes <5 min user interaction
8. ✅ GUI remains responsive during long-running operations
9. ✅ All charts are interactive (zoom, pan, click for details)
10. ✅ Generated reports are professional-quality and print-ready

---

## 📅 **ESTIMATED TIMELINE**

- **Week 1-2:** PIRL Training Panel + Backend Integration
- **Week 2-3:** Route Visualization (2D + 3D)
- **Week 3-4:** Analytics Dashboard Implementation
- **Week 4-5:** Workflow Integration + Polish
- **Week 5:** Testing, Documentation, Demo Video

**Total:** ~5 weeks (1 developer, full-time)

---

## 🚀 **NEXT IMMEDIATE STEPS**

1. **Verify training is still running:**
   ```bash
   cd /opt/agrs/Projects/test_project
   ./monitor_training.sh
   ```

2. **When training completes (~6 hours remaining):**
   ```bash
   # Validate generated route
   python3 validate_and_export_routes.py --model models/pirl_italy_v1_final.zip
   ```

3. **Begin Phase 1 Implementation:**
   - Create `include/agrs_zeus/gui/PIRLTrainingPanel.h`
   - Create `src/gui/PIRLTrainingPanel.cpp`
   - Add to `MainWindow` as dockable panel
   - Implement basic layout (no backend yet)

4. **Test GUI builds:**
   ```bash
   cd /opt/agrs
   cmake --build build --target zeus_gui
   ./build/zeus_gui
   ```

---

## 📚 **RESOURCES**

- **Qt6 Documentation:** https://doc.qt.io/qt-6/
- **Qt Charts Examples:** https://doc.qt.io/qt-6/qtcharts-examples.html
- **GDAL C++ API:** https://gdal.org/api/
- **OpenSceneGraph:** http://www.openscenegraph.org/
- **Project Docs:** `/opt/agrs/docs/GUI_PIRL_INTEGRATION_PLAN.md`

---

**End of Summary**



