# 3D Viewer Implementation Plan for AGRS ZEUS

**Date:** 2025-10-23  
**Research:** Based on Perplexity AI analysis  
**Decision:** osgEarth + Qt6 integration  
**Status:** 🚧 In Progress

---

## 📋 Executive Summary

Based on comprehensive Perplexity research, **osgEarth** has been selected as the 3D GIS framework for AGRS ZEUS. It provides:
- ✅ GIS-specific 3D capabilities (terrain, imagery, vectors)
- ✅ LGPL licensing (compatible with commercial use)
- ✅ Qt6 integration via QOpenGLWidget
- ✅ GDAL integration (already in use)
- ✅ High performance with LOD and tiling
- ✅ Active open-source community

**Alternative considered:** ArcGIS Maps SDK for Qt (enterprise-grade but proprietary/costly)

---

## 🎯 Implementation Goals

### Phase 1: Basic 3D Viewer (Current)
- [x] Research 3D frameworks via Perplexity
- [ ] Install and configure osgEarth
- [ ] Create OSGEarthWidget for Qt6
- [ ] Integrate into MainWindow (tab or split view)
- [ ] Load DEM and display terrain
- [ ] Basic camera controls (orbit, pan, zoom)

### Phase 2: Layer Integration
- [ ] Sync layers between 2D and 3D viewers
- [ ] Render rasters as terrain textures
- [ ] Render vectors as 3D features
- [ ] Layer visibility synchronization
- [ ] Coordinate system handling (native → WGS84)

### Phase 3: Advanced Features
- [ ] Vertical exaggeration control
- [ ] 3D measurements and annotations
- [ ] Flight path animation
- [ ] Sunlight/shadow simulation
- [ ] Clipping planes for cross-sections

---

## 🏗️ Architecture Design

### Current 2D Architecture
```
MainWindow
└── QTabWidget (Console)
    ├── QTextEdit (Console)
    └── TerminalWidget (Terminal)
└── MapWidget (2D viewer)
    ├── Tile basemap (ESRI World Imagery)
    ├── Raster overlays (via GDAL)
    └── Vector overlays (via OGR)
```

### Proposed 3D Integration
```
MainWindow
├── QSplitter (Horizontal)
│   ├── MapWidget (2D viewer - LEFT)
│   └── OSGEarthWidget (3D viewer - RIGHT)
└── Unified Layers Panel
    ├── Controls both 2D and 3D
    └── Checkbox toggles affect both viewers
```

**Rationale:** Side-by-side view allows users to compare 2D/3D perspectives simultaneously, essential for pipeline routing analysis.

---

## 🔧 Technical Implementation

### 1. Dependencies

**Required:**
- OpenSceneGraph 3.6+ (already partially available)
- osgEarth 3.x
- Qt6 OpenGL (already in use)
- GDAL 3.x (already in use)

**CMakeLists.txt Changes:**
```cmake
# Find osgEarth
find_package(osgEarth REQUIRED)

# Add to target_link_libraries
target_link_libraries(zeus_gui
    ...
    ${OSGEARTH_LIBRARIES}
    ${OPENSCENEGRAPH_LIBRARIES}
)
```

### 2. OSGEarthWidget Class

**File:** `include/agrs_zeus/gui/OSGEarthWidget.h`

```cpp
#ifndef AGRS_GUI_OSGEARTHWIDGET_H
#define AGRS_GUI_OSGEARTHWIDGET_H

#include <QOpenGLWidget>
#include <osgViewer/Viewer>
#include <osgEarth/MapNode>
#include <osgEarth/ElevationLayer>
#include <osgEarth/ImageLayer>

namespace agrs {
namespace gui {

class OSGEarthWidget : public QOpenGLWidget {
    Q_OBJECT
    
public:
    explicit OSGEarthWidget(QWidget* parent = nullptr);
    ~OSGEarthWidget() override;
    
    // Layer management
    bool addElevationLayer(const QString& demPath);
    bool addImageryLayer(const QString& imagePath);
    bool addVectorLayer(const QString& vectorPath);
    void clearLayers();
    
    // Layer visibility
    void setLayerVisible(const QString& layerPath, bool visible);
    
    // Camera control
    void setCenterAndRange(double lat, double lon, double range);
    void setVerticalExaggeration(double factor);
    
signals:
    void cameraChanged(double lat, double lon, double altitude);
    
protected:
    void initializeGL() override;
    void resizeGL(int w, int h) override;
    void paintGL() override;
    
    void mousePressEvent(QMouseEvent* event) override;
    void mouseMoveEvent(QMouseEvent* event) override;
    void wheelEvent(QWheelEvent* event) override;
    
private:
    osgViewer::Viewer* m_viewer{nullptr};
    osg::ref_ptr<osgEarth::MapNode> m_mapNode;
    osg::ref_ptr<osgEarth::Map> m_map;
    
    QPoint m_lastMousePos;
    bool m_rotating{false};
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_OSGEARTHWIDGET_H
```

**File:** `src/gui/OSGEarthWidget.cpp`

```cpp
#include "agrs_zeus/gui/OSGEarthWidget.h"
#include <osgEarth/EarthManipulator>
#include <osgEarth/GDALElevationLayer>
#include <osgEarth/GDALImageLayer>
#include <osgEarth/OGRFeatureSource>
#include <osgGA/TrackballManipulator>

namespace agrs {
namespace gui {

OSGEarthWidget::OSGEarthWidget(QWidget* parent)
    : QOpenGLWidget(parent)
{
    // Qt OpenGL settings
    QSurfaceFormat format;
    format.setDepthBufferSize(24);
    format.setStencilBufferSize(8);
    format.setVersion(3, 3);
    format.setProfile(QSurfaceFormat::CoreProfile);
    setFormat(format);
    
    setFocusPolicy(Qt::StrongFocus);
    setMouseTracking(true);
}

OSGEarthWidget::~OSGEarthWidget() {
    if (m_viewer) {
        delete m_viewer;
    }
}

void OSGEarthWidget::initializeGL() {
    // Initialize osgEarth map
    m_map = new osgEarth::Map();
    
    // Add base elevation layer (can be replaced with project DEM)
    osgEarth::GDALElevationLayer* elevLayer = new osgEarth::GDALElevationLayer();
    elevLayer->setURL("world.tif"); // Default world DEM
    m_map->addLayer(elevLayer);
    
    // Create map node
    m_mapNode = new osgEarth::MapNode(m_map);
    
    // Initialize OSG viewer
    m_viewer = new osgViewer::Viewer();
    m_viewer->setSceneData(m_mapNode);
    
    // Set up Earth manipulator for proper geospatial navigation
    osgEarth::EarthManipulator* manip = new osgEarth::EarthManipulator();
    m_viewer->setCameraManipulator(manip);
    
    // Configure graphics context
    m_viewer->setThreadingModel(osgViewer::ViewerBase::SingleThreaded);
    m_viewer->realize();
}

void OSGEarthWidget::resizeGL(int w, int h) {
    if (m_viewer) {
        m_viewer->getCamera()->setViewport(0, 0, w, h);
        m_viewer->getCamera()->setProjectionMatrixAsPerspective(
            30.0, // FOV
            static_cast<double>(w) / static_cast<double>(h), // aspect
            1.0, // near
            10000.0 // far
        );
    }
}

void OSGEarthWidget::paintGL() {
    if (m_viewer) {
        m_viewer->frame();
    }
}

bool OSGEarthWidget::addElevationLayer(const QString& demPath) {
    if (!m_map) return false;
    
    osgEarth::GDALElevationLayer* layer = new osgEarth::GDALElevationLayer();
    layer->setURL(demPath.toStdString());
    layer->setName(demPath.toStdString());
    m_map->addLayer(layer);
    
    update();
    return true;
}

bool OSGEarthWidget::addImageryLayer(const QString& imagePath) {
    if (!m_map) return false;
    
    osgEarth::GDALImageLayer* layer = new osgEarth::GDALImageLayer();
    layer->setURL(imagePath.toStdString());
    layer->setName(imagePath.toStdString());
    m_map->addLayer(layer);
    
    update();
    return true;
}

bool OSGEarthWidget::addVectorLayer(const QString& vectorPath) {
    if (!m_map) return false;
    
    // Vector rendering via OGR feature source
    osgEarth::OGRFeatureSource* source = new osgEarth::OGRFeatureSource();
    source->setURL(vectorPath.toStdString());
    
    // TODO: Create feature layer and add to map
    // This requires more complex styling setup
    
    update();
    return true;
}

void OSGEarthWidget::clearLayers() {
    if (m_map) {
        m_map->removeAllLayers();
    }
    update();
}

void OSGEarthWidget::setLayerVisible(const QString& layerPath, bool visible) {
    if (!m_map) return;
    
    osgEarth::Layer* layer = m_map->getLayerByName(layerPath.toStdString());
    if (layer) {
        layer->setVisible(visible);
        update();
    }
}

void OSGEarthWidget::setCenterAndRange(double lat, double lon, double range) {
    if (!m_viewer) return;
    
    osgEarth::EarthManipulator* manip = 
        dynamic_cast<osgEarth::EarthManipulator*>(m_viewer->getCameraManipulator());
    if (manip) {
        osgEarth::Viewpoint vp;
        vp.focalPoint()->set(
            osgEarth::SpatialReference::get("wgs84"),
            lon, lat, 0.0, // lon, lat, alt
            osgEarth::ALTMODE_ABSOLUTE
        );
        vp.range() = range;
        manip->setViewpoint(vp);
    }
    update();
}

void OSGEarthWidget::setVerticalExaggeration(double factor) {
    if (m_mapNode) {
        m_mapNode->getTerrainEngine()->setVerticalScale(factor);
        update();
    }
}

void OSGEarthWidget::mousePressEvent(QMouseEvent* event) {
    m_lastMousePos = event->pos();
    if (event->button() == Qt::LeftButton) {
        m_rotating = true;
    }
}

void OSGEarthWidget::mouseMoveEvent(QMouseEvent* event) {
    // OSG manipulator handles this automatically
    update();
}

void OSGEarthWidget::wheelEvent(QWheelEvent* event) {
    // OSG manipulator handles zoom
    update();
}

} // namespace gui
} // namespace agrs
```

### 3. MainWindow Integration

**Modify:** `src/gui/MainWindow.cpp`

Add to constructor:
```cpp
// Create 3D viewer
m_osgEarthWidget = new OSGEarthWidget(this);

// Create splitter for 2D/3D views
QSplitter* viewSplitter = new QSplitter(Qt::Horizontal, this);
viewSplitter->addWidget(m_osgWidget);        // 2D MapWidget
viewSplitter->addWidget(m_osgEarthWidget);   // 3D OSGEarthWidget
viewSplitter->setStretchFactor(0, 1);
viewSplitter->setStretchFactor(1, 1);

setCentralWidget(viewSplitter);
```

### 4. Layer Synchronization

**Modify:** `loadProjectLayers()` to load into both viewers:

```cpp
void MainWindow::loadProjectLayers(const QString& projectDir) {
    // ... existing code ...
    
    // Load rasters into both 2D and 3D
    if (mapWidget && mapWidget->addRasterLayer(fileInfo.absoluteFilePath())) {
        m_consoleText->append(tr("[2D] Loaded raster: %1").arg(fileInfo.fileName()));
    }
    if (m_osgEarthWidget && m_osgEarthWidget->addImageryLayer(fileInfo.absoluteFilePath())) {
        m_consoleText->append(tr("[3D] Loaded raster: %1").arg(fileInfo.fileName()));
    }
    
    // Check if it's a DEM for elevation
    if (fileInfo.fileName().contains("dem", Qt::CaseInsensitive)) {
        if (m_osgEarthWidget->addElevationLayer(fileInfo.absoluteFilePath())) {
            m_consoleText->append(tr("[3D] Loaded DEM: %1").arg(fileInfo.fileName()));
        }
    }
}
```

---

## 📦 Installation Instructions

### Ubuntu/Debian
```bash
# Install OpenSceneGraph
sudo apt-get install libopenscenegraph-dev

# Build osgEarth from source (version 3.x)
git clone https://github.com/gwaldron/osgearth.git
cd osgearth
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
sudo make install
```

### CMake Configuration
```cmake
# Add to CMakeLists.txt
find_package(OpenSceneGraph REQUIRED COMPONENTS 
    osg osgViewer osgGA osgDB osgUtil osgText)
find_package(osgEarth REQUIRED)

target_link_libraries(zeus_gui
    ${OPENSCENEGRAPH_LIBRARIES}
    ${OSGEARTH_LIBRARIES}
)
```

---

## 🧪 Testing Plan

### Phase 1 Tests
1. **Widget Creation:** Verify OSGEarthWidget displays a blank 3D scene
2. **DEM Loading:** Load TINITALY 10m DEM, verify terrain rendering
3. **Camera Controls:** Test orbit, pan, zoom with mouse
4. **Performance:** Measure FPS with large DEM loaded

### Phase 2 Tests
1. **Layer Sync:** Toggle layer in 2D, verify 3D updates
2. **Raster Overlay:** Load Sentinel-2 imagery, verify texture on terrain
3. **Vector Rendering:** Load OSM roads, verify 3D line rendering
4. **Multi-layer:** Load 10+ layers, verify no crashes

### Phase 3 Tests
1. **Vertical Exaggeration:** Set 2x, 5x, 10x, verify terrain height
2. **Flight Animation:** Animate camera along pipeline route
3. **Cross-section:** Enable clipping plane, verify terrain cut
4. **Performance:** Benchmark with full test_project dataset

---

## 📊 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **FPS** | 60+ | With single DEM + imagery |
| **Load Time** | <5s | For typical project (10 layers) |
| **Memory** | <2GB | With all test_project layers |
| **Responsiveness** | <16ms | Per frame for smooth interaction |

---

## 🚧 Known Limitations & Future Work

### Current Limitations
- No vector styling yet (all vectors rendered with default symbology)
- No 3D buildings or infrastructure models
- Limited annotation tools
- No stereo/VR support

### Future Enhancements
- **PIRL Integration:** Visualize reinforcement learning agent exploring 3D terrain
- **Pipeline Visualization:** 3D pipeline with diameter, depth, material
- **Cost Surface Overlay:** Semi-transparent cost raster on terrain
- **Flight Recorder:** Record/replay camera paths
- **Profile Charts:** Interactive elevation/cost profiles
- **Geologic Layers:** Subsurface stratigraphy visualization

---

## 📚 References

- **Research Reports:**
  - `/opt/agrs/docs/Perplexity/GUI/3D_VIEWER_FRAMEWORKS_QT6.md`
  - `/opt/agrs/docs/Perplexity/GUI/3D_VIEWER_INTEGRATION_GUIDE.md`
  - `/opt/agrs/docs/Perplexity/GUI/3D_VIEWER_PERFORMANCE.md`

- **Documentation:**
  - [osgEarth Documentation](http://docs.osgearth.org/)
  - [OpenSceneGraph Quick Start](http://www.openscenegraph.org/index.php/documentation/quick-start-guide)
  - [Qt OpenGL Integration](https://doc.qt.io/qt-6/qopenglwidget.html)

---

## ✅ Implementation Checklist

### Phase 1: Basic 3D Viewer
- [x] Research completed (Perplexity)
- [ ] Install osgEarth dependencies
- [ ] Create OSGEarthWidget class
- [ ] Add to CMakeLists.txt
- [ ] Integrate into MainWindow
- [ ] Test basic rendering
- [ ] Implement camera controls
- [ ] Load first DEM

### Phase 2: Layer Integration
- [ ] Sync layer loading 2D↔3D
- [ ] Implement raster texturing
- [ ] Implement vector rendering
- [ ] Sync layer visibility
- [ ] Test with test_project data

### Phase 3: Polish & Optimize
- [ ] Add vertical exaggeration UI
- [ ] Implement LOD strategies
- [ ] Optimize GPU memory
- [ ] Add 3D-specific tools
- [ ] Performance profiling
- [ ] Documentation

---

**Next Step:** Install osgEarth and begin OSGEarthWidget implementation

**Status:** 🟡 Awaiting user confirmation to proceed with installation

