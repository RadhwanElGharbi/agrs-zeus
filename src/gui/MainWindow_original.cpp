#include "agrs_zeus/gui/MainWindow.h"
#include "agrs_zeus/gui/MapWidget.h"  // Map viewer with tile support
#include "agrs_zeus/gui/BackendInterface.h"

#include <QMenuBar>
#include <QToolBar>
#include <QStatusBar>
#include <QDockWidget>
#include <QTreeWidget>
#include <QTextEdit>
#include <QLabel>
#include <QMessageBox>
#include <QFileDialog>
#include <QTimer>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDateTime>
#include <QSettings>
#include <QApplication>
#include <QDir>
#include <QFileSystemModel>
#include <QtConcurrent>
#include <QDialogButtonBox>
#include "agrs_zeus/Tools.h"

namespace agrs {
namespace gui {

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , m_osgWidget(nullptr)
    , m_layersDock(nullptr)
    , m_propertiesDock(nullptr)
    , m_consoleDock(nullptr)
    , m_backend(nullptr)
{
    setWindowTitle("AGRS ZEUS - Pipeline Routing & Geospatial Analysis");
    resize(1600, 1000);
    
    // Create central map widget
    m_osgWidget = new MapWidget(this);
    setCentralWidget(m_osgWidget);
    
    // Create backend interface
    m_backend = new BackendInterface(this);
    
    // Setup UI (order matters - docks must exist before menus reference them)
    createDockWidgets();
    createMenus();
    createToolbars();
    createStatusBar();
    setupConnections();
    
    // Load settings
    QSettings settings("AGRS", "ZEUS");
    restoreGeometry(settings.value("geometry").toByteArray());
    restoreState(settings.value("windowState").toByteArray());
}

MainWindow::~MainWindow() {
    // Save settings
    QSettings settings("AGRS", "ZEUS");
    settings.setValue("geometry", saveGeometry());
    settings.setValue("windowState", saveState());
}

void MainWindow::createMenus() {
    // File menu
    QMenu* fileMenu = menuBar()->addMenu(tr("&File"));
    fileMenu->addAction(tr("&New Project..."), this, &MainWindow::onNewProject, QKeySequence::New);
    fileMenu->addAction(tr("&Open Project..."), this, &MainWindow::onOpenProject, QKeySequence::Open);
    fileMenu->addAction(tr("&Save Project"), this, &MainWindow::onSaveProject, QKeySequence::Save);
    fileMenu->addAction(tr("Save Project &As..."), this, &MainWindow::onSaveProjectAs, QKeySequence::SaveAs);
    fileMenu->addSeparator();
    fileMenu->addAction(tr("E&xit"), this, &MainWindow::onExit, QKeySequence::Quit);
    
    // Project menu
    QMenu* projectMenu = menuBar()->addMenu(tr("&Project"));
    projectMenu->addAction(tr("Project &Settings..."), this, &MainWindow::onProjectSettings);
    
    // All geospatial operations will be handled by Cursor CLI through intelligent project analysis
    
    // View menu
    QMenu* viewMenu = menuBar()->addMenu(tr("&View"));
    viewMenu->addAction(tr("&Reset Camera"), this, &MainWindow::onResetView, QKeySequence(tr("Ctrl+R")));
    // Basemap submenu
    QMenu* basemapMenu = viewMenu->addMenu(tr("Basemap"));
    QAction* osmAction = basemapMenu->addAction(tr("OpenStreetMap"));
    QAction* esriAction = basemapMenu->addAction(tr("Esri World Imagery"));
    osmAction->setCheckable(true);
    esriAction->setCheckable(true);
    osmAction->setChecked(true);
    QActionGroup* basemapGroup = new QActionGroup(this);
    basemapGroup->addAction(osmAction);
    basemapGroup->addAction(esriAction);
    basemapGroup->setExclusive(true);
    connect(osmAction, &QAction::triggered, [this]() {
        MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
        if (map) map->setBasemap(MapWidget::BasemapType::OpenStreetMap);
    });
    connect(esriAction, &QAction::triggered, [this]() {
        MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
        if (map) map->setBasemap(MapWidget::BasemapType::EsriWorldImagery);
    });
    viewMenu->addSeparator();
    viewMenu->addAction(m_layersDock->toggleViewAction());
    viewMenu->addAction(m_propertiesDock->toggleViewAction());
    viewMenu->addAction(m_consoleDock->toggleViewAction());
    if (m_catalogDock) viewMenu->addAction(m_catalogDock->toggleViewAction());
    
    // Help menu
    QMenu* helpMenu = menuBar()->addMenu(tr("&Help"));
    helpMenu->addAction(tr("&About AGRS ZEUS..."), this, &MainWindow::onAbout);
}

void MainWindow::createToolbars() {
    // File toolbar - simplified to only essential operations
    m_fileToolbar = addToolBar(tr("File"));
    m_fileToolbar->setObjectName("FileToolbar");
    m_fileToolbar->addAction(tr("New"), this, &MainWindow::onNewProject);
    m_fileToolbar->addAction(tr("Open"), this, &MainWindow::onOpenProject);
    m_fileToolbar->addAction(tr("Save"), this, &MainWindow::onSaveProject);
    
    // All other operations will be handled by Cursor CLI through intelligent project analysis
}

void MainWindow::createDockWidgets() {
    // Layers panel
    m_layersDock = new QDockWidget(tr("Layers"), this);
    m_layersDock->setObjectName("LayersDock");
    m_layersTree = new QTreeWidget();
    m_layersTree->setHeaderLabel(tr("Dataset Layers"));
    
    // Enable drag-and-drop for layer reordering (ArcGIS-style)
    m_layersTree->setDragDropMode(QAbstractItemView::InternalMove);
    m_layersTree->setDragEnabled(true);
    m_layersTree->setAcceptDrops(true);
    m_layersTree->setDropIndicatorShown(true);
    m_layersTree->setDefaultDropAction(Qt::MoveAction);
    
    m_layersDock->setWidget(m_layersTree);
    addDockWidget(Qt::LeftDockWidgetArea, m_layersDock);
    
    // Properties panel
    m_propertiesDock = new QDockWidget(tr("Properties"), this);
    m_propertiesDock->setObjectName("PropertiesDock");
    m_propertiesText = new QTextEdit();
    m_propertiesText->setReadOnly(true);
    m_propertiesText->setPlainText(tr("No layer selected."));
    m_propertiesDock->setWidget(m_propertiesText);
    addDockWidget(Qt::RightDockWidgetArea, m_propertiesDock);
    
    // Console panel
    m_consoleDock = new QDockWidget(tr("Console"), this);
    m_consoleDock->setObjectName("ConsoleDock");
    m_consoleText = new QTextEdit();
    m_consoleText->setReadOnly(true);
    m_consoleText->append(tr("[AGRS ZEUS] Application started."));
    m_consoleText->append(tr("[AGRS ZEUS] Ready for operations."));
    m_consoleDock->setWidget(m_consoleText);
    addDockWidget(Qt::BottomDockWidgetArea, m_consoleDock);

    // Catalog panel
    m_catalogDock = new QDockWidget(tr("Catalog"), this);
    m_catalogDock->setObjectName("CatalogDock");
    m_catalogTree = new QTreeView(this);
    m_catalogModel = new QFileSystemModel(this);
    m_catalogModel->setReadOnly(true);
    m_catalogTree->setModel(m_catalogModel);
    m_catalogDock->setWidget(m_catalogTree);
    addDockWidget(Qt::LeftDockWidgetArea, m_catalogDock);
}

void MainWindow::createStatusBar() {
    // Coordinates label
    m_coordsLabel = new QLabel(tr("Lat: --  Lon: --  Elev: -- m"));
    m_coordsLabel->setMinimumWidth(350);
    m_coordsLabel->setFrameStyle(QFrame::Panel | QFrame::Sunken);
    statusBar()->addPermanentWidget(m_coordsLabel);
    
    // CRS label
    QLabel* crsLabel = new QLabel(tr("CRS: WGS84 (EPSG:4326)"));
    crsLabel->setMinimumWidth(180);
    crsLabel->setFrameStyle(QFrame::Panel | QFrame::Sunken);
    statusBar()->addPermanentWidget(crsLabel);
    
    // Zoom label  
    QLabel* zoomLabel = new QLabel(tr("Zoom: 3"));
    zoomLabel->setObjectName("zoomLabel");
    zoomLabel->setMinimumWidth(80);
    zoomLabel->setFrameStyle(QFrame::Panel | QFrame::Sunken);
    statusBar()->addPermanentWidget(zoomLabel);
    
    // Status message
    m_statusLabel = new QLabel(tr("Ready"));
    statusBar()->addWidget(m_statusLabel);
}

void MainWindow::setupConnections() {
    // Map viewer signals
    MapWidget* mapWidget = qobject_cast<MapWidget*>(m_osgWidget);
    if (mapWidget) {
        connect(mapWidget, &MapWidget::coordinatesChanged,
                this, &MainWindow::onCoordinatesChanged);

        // Right-click "More Info Here" integration using Perplexity
        connect(mapWidget, &MapWidget::moreInfoRequested,
                [this](double lat, double lon) {
                    m_consoleText->append(tr("[AI Search] Requesting info for: %1, %2")
                                         .arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6));
                    statusBar()->showMessage(tr("AI Search: Getting info..."), 0);
                    
                    QVariantMap params;
                    // Include coordinates directly in the query
                    params["query"] = QString("Provide detailed geographic context and information for the location at coordinates %1°N, %2°E. "
                                            "Include: (1) Country, region, and nearest city; (2) Terrain type and elevation; "
                                            "(3) Land use and vegetation; (4) Notable nearby features and landmarks; "
                                            "(5) Infrastructure and accessibility; (6) Any significant geographic or cultural information.")
                                        .arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6);
                    params["location"] = QString::asprintf("%.6f,%.6f", lat, lon);
                    params["format"] = QString("markdown");
                    params["max_tokens"] = 2000;
                    params["temperature"] = 0.2;
                    params["model"] = QString("claude-4.5-sonnet");  // Always use Claude 4.5 Sonnet
                    params["recency"] = QString("month");
                    params["citations"] = true;  // Always include sources
                    QString outPath = QDir::temp().filePath(QString("perplexity_here_%1_%2.md")
                                            .arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6));
                    params["output"] = outPath;
                    
                    // Store output path and coordinates for later retrieval
                    m_pendingPerplexityPath = outPath;
                    m_pendingPerplexityLat = lat;
                    m_pendingPerplexityLon = lon;

                    m_backend->runTool("perplexity_search", params);
                });
        
        connect(mapWidget, &MapWidget::zoomChanged,
                [this](int zoom) {
                    QLabel* zoomLabel = statusBar()->findChild<QLabel*>("zoomLabel");
                    if (zoomLabel) {
                        zoomLabel->setText(tr("Zoom: %1").arg(zoom));
                    }
                    m_consoleText->append(tr("[Map] Zoom level: %1").arg(zoom));
                });
        
        connect(mapWidget, &MapWidget::mapMoved,
                [this]() {
                    MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
                    if (map) {
                        m_consoleText->append(tr("[Map] Center: %1, %2")
                            .arg(map->centerLat(), 0, 'f', 4)
                            .arg(map->centerLon(), 0, 'f', 4));
                    }
                });
    }
    
    // Layer tree signals
    connect(m_layersTree, &QTreeWidget::itemChanged,
            this, &MainWindow::onLayerVisibilityChanged);
    connect(m_layersTree->model(), &QAbstractItemModel::rowsMoved,
            this, &MainWindow::onLayerOrderChanged);
    
    // Feature inspection signal
    if (mapWidget) {
        connect(mapWidget, &MapWidget::featureIdentifyRequested,
                [this](double lat, double lon) {
                    MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
                    if (!map) return;
                    
                    m_consoleText->append(tr("[Identify] Querying features at: %1, %2")
                                        .arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6));
                    
                    // Sample rasters and query vectors
                    auto rasters = map->sampleRastersAtPoint(lat, lon);
                    auto vectors = map->queryVectorsAtPoint(lat, lon);
                    
                    m_consoleText->append(tr("[Identify] Found %1 rasters, %2 vectors")
                                        .arg(rasters.size()).arg(vectors.size()));
                    
                    // Feature inspection will be handled by Cursor CLI
                    m_consoleText->append(tr("[Feature Inspection] Coordinates: %1°N, %2°E").arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6));
                });
    }
    
    // Backend signals
    connect(m_backend, &BackendInterface::logMessage,
            [this](const QString& msg) {
                m_consoleText->append(msg);
            });
    
    connect(m_backend, &BackendInterface::operationStarted,
            [this](const QString& toolName) {
                m_statusLabel->setText(tr("Running: %1...").arg(toolName));
                m_consoleText->append(tr("[%1] Started.").arg(toolName));
            });

    // Auto-load newly generated outputs into layers pane and map
    connect(m_backend, &BackendInterface::outputGenerated,
            [this](const QString& outputPath) {
                if (outputPath.isEmpty()) return;
                m_consoleText->append(tr("[Output] Generated: %1").arg(outputPath));
                if (!m_currentProject.isEmpty()) {
                    populateLayersFromProject(m_currentProject);
                }
            });
    
    connect(m_backend, &BackendInterface::operationCompleted,
            [this](const QString& toolName, const QString& result) {
                m_statusLabel->setText(tr("Ready"));
                m_consoleText->append(tr("[%1] Completed: %2").arg(toolName, result));
                
                // Handle Perplexity search completion (initial search only, not follow-ups)
                if (toolName == "perplexity_search" && !m_pendingPerplexityPath.isEmpty() 
                    && m_pendingPerplexityLat != 0.0 && m_pendingPerplexityLon != 0.0) {
                    
                    m_consoleText->append(tr("[AI] Initial search completed, opening chat dialog"));
                    
                    QString content;
                    QFile f(m_pendingPerplexityPath);
                    if (f.open(QIODevice::ReadOnly | QIODevice::Text)) {
                        content = QString::fromUtf8(f.readAll());
                        f.close();
                    } else {
                        content = tr("Failed to load AI search results.");
                    }
                    
                    // Clear MainWindow's pending state BEFORE creating dialog
                    // This prevents MainWindow from interfering with dialog's follow-up queries
                    QString savedPath = m_pendingPerplexityPath;
                    double savedLat = m_pendingPerplexityLat;
                    double savedLon = m_pendingPerplexityLon;
                    
                    m_pendingPerplexityPath.clear();
                    m_pendingPerplexityLat = 0.0;
                    m_pendingPerplexityLon = 0.0;
                    
                    // Perplexity chat will be handled by Cursor CLI
                    m_consoleText->append(tr("[AI Chat] Coordinates: %1°N, %2°E").arg(savedLat, 0, 'f', 6).arg(savedLon, 0, 'f', 6));
                    
                    m_consoleText->append(tr("[AI] Chat dialog closed"));
                }
                
                // Handle dataset availability analysis completion
                if (toolName == "analyze_fetch_tools" && !m_pendingDatasetCheckProject.isEmpty()) {
                    m_consoleText->append(tr("[Dataset Availability] Analysis complete, showing results"));
                    
                    // Read the JSON output
                    QString outputJson = QDir::temp().filePath("dataset_availability.json");
                    QFile jsonFile(outputJson);
                    if (jsonFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
                        QJsonDocument jd = QJsonDocument::fromJson(jsonFile.readAll());
                        jsonFile.close();
                        
                        // Dataset availability will be handled by Cursor CLI
                        m_consoleText->append(tr("[Dataset Availability] Analysis completed - results saved to %1").arg(outputJson));
                        
                        // Cursor CLI will handle dataset fetching automatically
                        m_consoleText->append(tr("[Cursor CLI] Will automatically fetch available datasets"));
                            
                            if (!selectedDatasets.isEmpty()) {
                                m_consoleText->append(tr("[Dataset Fetch] Starting fetch for %1 datasets").arg(selectedDatasets.size()));
                                
                                QStringList datasetNames;
                                for (const auto& ds : selectedDatasets) {
                                    datasetNames.append(QString("%1: %2").arg(ds.category, ds.name));
                                    m_consoleText->append(tr("  - %1: %2").arg(ds.category, ds.name));
                                }
                                
                                // Build bbox and aoi
                                QString aoiMetaPath = m_pendingDatasetCheckProject + "/aoi/aoi_metadata.json";
                                QFile mf2(aoiMetaPath);
                                double minx=0, miny=0, maxx=0, maxy=0;
                                QString aoiPath;
                                if (mf2.open(QIODevice::ReadOnly | QIODevice::Text)) {
                                    QJsonDocument jd2 = QJsonDocument::fromJson(mf2.readAll());
                                    mf2.close();
                                    QJsonObject obj2 = jd2.object();
                                    QJsonObject b2 = obj2.value("bounds_wgs84").toObject();
                                    if (!b2.isEmpty()) {
                                        minx = b2.value("minx").toDouble();
                                        miny = b2.value("miny").toDouble();
                                        maxx = b2.value("maxx").toDouble();
                                        maxy = b2.value("maxy").toDouble();
                                    }
                                    QJsonObject aoiObj = obj2.value("aoi").toObject();
                                    if (aoiObj.contains("file")) {
                                        aoiPath = m_pendingDatasetCheckProject + "/" + aoiObj.value("file").toString();
                                    }
                                }
                                QString bboxStr = QString::asprintf("%.8f,%.8f,%.8f,%.8f", minx, miny, maxx, maxy);

                                auto sanitize = [](QString s) {
                                    s = s.toLower();
                                    s.replace(" ", "_");
                                    s.replace("/", "_");
                                    s.replace("(", "");
                                    s.replace(")", "");
                                    s.replace(",", "_");
                                    return s;
                                };

                                auto categoryToTool = [](const QString& cat) -> QString {
                                    if (cat == "DEM") return "dem_fetch";
                                    if (cat == "Land Cover") return "landcover_fetch";
                                    if (cat == "Hydrology") return "hydrology_fetch";
                                    if (cat == "Infrastructure") return "infrastructure_fetch";
                                    if (cat == "Protected Areas") return "protected_areas_fetch";
                                    if (cat == "Geohazards") return "geohazards_fetch";
                                    if (cat == "Administrative") return "administrative_fetch";
                                    if (cat == "Cadastre") return "cadastre_fetch";
                                    if (cat == "Socioeconomic") return "socioeconomic_fetch";
                                    if (cat == "Climate") return "climate_fetch";
                                    if (cat == "Imagery") return "imagery_fetch";
                                    return QString();
                                };

                                auto isRasterCategory = [](const QString& cat) -> bool {
                                    return (cat == "DEM" || cat == "Land Cover" || cat == "Geohazards" ||
                                            cat == "Socioeconomic" || cat == "Climate" || cat == "Imagery");
                                };

                                // Invoke fetch tools per selection
                                for (const auto& ds : selectedDatasets) {
                                    QString toolName = categoryToTool(ds.category);
                                    if (toolName.isEmpty()) continue;

                                    QVariantMap p;
                                    if (!bboxStr.isEmpty()) p["bbox"] = bboxStr;
                                    if (!aoiPath.isEmpty()) p["aoi"] = aoiPath;

                                    // Choose output path
                                    QString base = sanitize(ds.name);
                                    QString outDir = m_pendingDatasetCheckProject + (isRasterCategory(ds.category) ? "/data/rasters" : "/data/vectors");
                                    QDir(outDir).mkpath(".");
                                    QString ext = isRasterCategory(ds.category) ? ".tif" : ".gpkg";
                                    QString outPath = outDir + "/" + base + ext;
                                    p["output"] = outPath;

                                    // Category-specific parameters
                                    if (toolName == "dem_fetch") {
                                        p["resolution"] = QString("30m");
                                    } else if (toolName == "climate_fetch") {
                                        p["variable"] = QString("tavg");
                                    } else if (toolName == "imagery_fetch") {
                                        p["date"] = QDate::currentDate().toString(Qt::ISODate);
                                    } else if (toolName == "administrative_fetch") {
                                        // administrative_fetch expects country & level
                                        double cLat = (miny + maxy) / 2.0;
                                        double cLon = (minx + maxx) / 2.0;
                                        QString cc = (cLon > 6 && cLon < 19 && cLat > 36 && cLat < 47.5) ? "IT" : "GLOBAL";
                                        p.remove("bbox");
                                        p.remove("aoi");
                                        p["country"] = cc;
                                        p["level"] = 0;
                                    }

                                    m_consoleText->append(tr("[Dataset Fetch] %1 → %2").arg(toolName, outPath));
                                    m_backend->runTool(toolName, p);
                                }
                            }
                        }
                    } else {
                        m_consoleText->append(tr("[Dataset Availability] Failed to read analysis results"));
                    }
                    
                    m_pendingDatasetCheckProject.clear();
                }
            });
    
    connect(m_backend, &BackendInterface::operationFailed,
            [this](const QString& toolName, const QString& error) {
                m_statusLabel->setText(tr("Error"));
                m_consoleText->append(tr("[%1] ERROR: %2").arg(toolName, error));
            });
}

// Slot implementations
void MainWindow::onNewProject() {
    // New project creation will be handled by Cursor CLI
    m_consoleText->append(tr("[New Project] Cursor CLI will handle project creation"));
}

void MainWindow::onOpenProject() {
    QString dir = QFileDialog::getExistingDirectory(
        this, tr("Open Project Directory"), "/opt/agrs/Projects");
    if (dir.isEmpty()) return;
    loadProject(dir);
}

void MainWindow::loadProject(const QString& projectPath) {
    m_currentProject = projectPath;
    m_consoleText->append(tr("[Project] Opened: %1").arg(projectPath));
    statusBar()->showMessage(tr("Project opened: %1").arg(projectPath), 3000);
    setupCatalogPane(projectPath);
    populateLayersFromProject(projectPath);
    centerMapOnAOI(projectPath);
    
    // Automatically check dataset availability for this AOI
    QTimer::singleShot(500, this, [this, projectPath]() {
        checkDatasetAvailabilityForProject(projectPath);
    });
}

void MainWindow::checkDatasetAvailabilityForProject(const QString& projectPath) {
    m_consoleText->append(tr("[Dataset Availability] Analyzing AOI..."));
    
    // Read AOI metadata to get country
    QString aoiMetaPath = projectPath + "/aoi/aoi_metadata.json";
    QFile mf(aoiMetaPath);
    if (!mf.open(QIODevice::ReadOnly | QIODevice::Text)) {
        m_consoleText->append(tr("[Dataset Availability] Could not read AOI metadata"));
        return;
    }
    
    QJsonDocument jd = QJsonDocument::fromJson(mf.readAll());
    mf.close();
    QJsonObject obj = jd.object();
    QJsonObject boundsWGS84 = obj.value("bounds_wgs84").toObject();
    
    if (boundsWGS84.isEmpty()) {
        m_consoleText->append(tr("[Dataset Availability] No WGS84 bounds in AOI metadata"));
        return;
    }
    
    // Get center coordinates to determine country
    double minLat = boundsWGS84.value("miny").toDouble();
    double maxLat = boundsWGS84.value("maxy").toDouble();
    double minLon = boundsWGS84.value("minx").toDouble();
    double maxLon = boundsWGS84.value("maxx").toDouble();
    double centerLat = (minLat + maxLat) / 2.0;
    double centerLon = (minLon + maxLon) / 2.0;
    
    // Run analyze_fetch_tools asynchronously
    QString outputJson = QDir::temp().filePath("dataset_availability.json");
    
    QVariantMap params;
    params["mode"] = QString("coordinates");
    params["lat"] = centerLat;
    params["lon"] = centerLon;
    params["output"] = outputJson;
    params["verbose"] = true;
    
    // Store project path for when analysis completes
    m_pendingDatasetCheckProject = projectPath;
    
    m_consoleText->append(tr("[Dataset Availability] Running analysis for coordinates: %1°N, %2°E")
                          .arg(centerLat, 0, 'f', 4).arg(centerLon, 0, 'f', 4));
    
    m_backend->runTool("analyze_fetch_tools", params);
}

void MainWindow::setupCatalogPane(const QString& projectPath) {
    if (!m_catalogModel || !m_catalogTree) return;
    m_catalogModel->setRootPath(projectPath);
    m_catalogTree->setRootIndex(m_catalogModel->index(projectPath));
}

void MainWindow::populateLayersFromProject(const QString& projectPath) {
    if (!m_layersTree) return;
    m_layersTree->clear();
    
    MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
    if (!map) return;
    
    // Clear existing overlays
    map->clearOverlays();
    
    // Unified layer stack: no categories, all layers together
    
    // Load and render vectors (add to unified list)
    QDir vdir(projectPath + "/data/vectors");
    for (const QFileInfo& fi : vdir.entryInfoList(QStringList() << "*.gpkg" << "*.geojson" << "*.shp", QDir::Files)) {
        QTreeWidgetItem* item = new QTreeWidgetItem(m_layersTree, QStringList() << fi.fileName());
        item->setCheckState(0, Qt::Checked); // Add checkbox, default checked (visible)
        item->setData(0, Qt::UserRole, fi.absoluteFilePath()); // Store full path
        QString fullPath = fi.absoluteFilePath();
        if (map->addVectorLayer(fullPath)) {
            m_consoleText->append(tr("[Layers] Loaded vector: %1").arg(fi.fileName()));
        } else {
            m_consoleText->append(tr("[Layers] Failed to load vector: %1").arg(fi.fileName()));
        }
    }
    
    // Load and render rasters (add to unified list)
    QDir rdir(projectPath + "/data/rasters");
    for (const QFileInfo& fi : rdir.entryInfoList(QStringList() << "*.tif" << "*.tiff", QDir::Files)) {
        QTreeWidgetItem* item = new QTreeWidgetItem(m_layersTree, QStringList() << fi.fileName());
        item->setCheckState(0, Qt::Checked); // Add checkbox, default checked (visible)
        item->setData(0, Qt::UserRole, fi.absoluteFilePath()); // Store full path
        QString fullPath = fi.absoluteFilePath();
        if (map->addRasterLayer(fullPath)) {
            m_consoleText->append(tr("[Layers] Loaded raster: %1").arg(fi.fileName()));
        } else {
            m_consoleText->append(tr("[Layers] Failed to load raster: %1").arg(fi.fileName()));
        }
    }
    
    m_layersTree->expandAll();

    // Initialize unified rendering order based on current tree order (top to bottom → bottom to top draw)
    QStringList orderedPaths;
    for (int i = m_layersTree->topLevelItemCount() - 1; i >= 0; --i) {
        QTreeWidgetItem* item = m_layersTree->topLevelItem(i);
        QString path = item->data(0, Qt::UserRole).toString();
        if (!path.isEmpty()) orderedPaths.append(path);
    }
    map->setLayerOrder(orderedPaths);
}

void MainWindow::centerMapOnAOI(const QString& projectPath) {
    QFile mf(projectPath + "/aoi/aoi_metadata.json");
    if (!mf.open(QIODevice::ReadOnly | QIODevice::Text)) return;
    QJsonDocument jd = QJsonDocument::fromJson(mf.readAll());
    mf.close();
    QJsonObject o = jd.object();
    
    // Try bounds_wgs84 first (preferred), fallback to bounds
    QJsonObject bounds = o.value("bounds_wgs84").toObject();
    if (bounds.isEmpty()) {
        bounds = o.value("bounds").toObject();
    }
    if (bounds.isEmpty()) return;
    
    double minx = bounds.value("minx").toDouble();
    double miny = bounds.value("miny").toDouble();
    double maxx = bounds.value("maxx").toDouble();
    double maxy = bounds.value("maxy").toDouble();
    
    MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
    if (!map) return;
    
    double centerLat = (miny + maxy) / 2.0;
    double centerLon = (minx + maxx) / 2.0;
    
    // Calculate appropriate zoom level based on extent
    double latRange = maxy - miny;
    double lonRange = maxx - minx;
    double maxRange = std::max(latRange, lonRange);
    
    // Rough zoom calculation (adjust as needed)
    double zoom = 10.0;
    if (maxRange > 5.0) zoom = 7.0;
    else if (maxRange > 2.0) zoom = 8.5;
    else if (maxRange > 1.0) zoom = 9.5;
    else if (maxRange > 0.5) zoom = 10.5;
    else if (maxRange > 0.2) zoom = 11.5;
    else zoom = 12.5;
    
    m_consoleText->append(tr("[Map] Centered on AOI: lat=%1, lon=%2, zoom=%3")
                          .arg(centerLat, 0, 'f', 4)
                          .arg(centerLon, 0, 'f', 4)
                          .arg(zoom, 0, 'f', 1));
    
    map->setCenter(centerLat, centerLon);
    map->setZoom(zoom);
}

void MainWindow::onSaveProject() {
    if (m_currentProject.isEmpty()) {
        QMessageBox::information(this, tr("Save Project"),
                                tr("No project is currently open."));
        return;
    }
    
    m_consoleText->append(tr("[Project] Saved: %1").arg(m_currentProject));
    statusBar()->showMessage(tr("Project saved"), 2000);
}

void MainWindow::onSaveProjectAs() {
    if (m_currentProject.isEmpty()) {
        QMessageBox::information(this, tr("Save Project As"), tr("No project is currently open."));
        return;
    }
    QString dstDir = QFileDialog::getExistingDirectory(this, tr("Select Destination Directory"), "/opt/agrs/Projects");
    if (dstDir.isEmpty()) return;
    QString dstPath = QDir(dstDir).filePath(QFileInfo(m_currentProject).fileName());
    if (QDir(dstPath).exists()) {
        if (QMessageBox::question(this, tr("Overwrite"), tr("Destination exists. Overwrite?")) != QMessageBox::Yes) return;
    }
    if (!copyDirectoryRecursively(m_currentProject, dstPath)) {
        QMessageBox::critical(this, tr("Save Project As"), tr("Failed to save project to destination."));
        return;
    }
    m_consoleText->append(tr("[Project] Saved As: %1").arg(dstPath));
    statusBar()->showMessage(tr("Project saved as"), 2000);
}

void MainWindow::onExit() {
    close();
}

bool MainWindow::copyDirectoryRecursively(const QString& srcPath, const QString& dstPath) {
    QDir srcDir(srcPath);
    if (!srcDir.exists()) return false;
    QDir dstDir;
    if (!dstDir.mkpath(dstPath)) return false;
    for (const QFileInfo& fi : srcDir.entryInfoList(QDir::NoDotAndDotDot | QDir::AllEntries)) {
        QString src = fi.absoluteFilePath();
        QString dst = dstPath + "/" + fi.fileName();
        if (fi.isDir()) {
            if (!copyDirectoryRecursively(src, dst)) return false;
        } else {
            QFile::remove(dst);
            if (!QFile::copy(src, dst)) return false;
        }
    }
    return true;
}

void MainWindow::closeEvent(QCloseEvent* event) {
    QMessageBox::StandardButton btn = QMessageBox::question(
        this,
        tr("Exit AGRS ZEUS"),
        tr("Do you want to save the current project before exiting?"),
        QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel,
        QMessageBox::Save
    );
    if (btn == QMessageBox::Save) {
        onSaveProject();
        event->accept();
    } else if (btn == QMessageBox::Discard) {
        event->accept();
    } else if (btn == QMessageBox::Cancel) {
        event->ignore();
    }
}

void MainWindow::onProjectSettings() {
    QMessageBox::information(this, tr("Project Settings"),
                            tr("Project settings dialog (TODO)"));
}

// All geospatial operations are now handled by Cursor CLI through intelligent project analysis

void MainWindow::onResetView() {
    MapWidget* mapWidget = qobject_cast<MapWidget*>(m_osgWidget);
    if (mapWidget) {
        mapWidget->setCenter(40.7128, -74.0060);  // New York
        mapWidget->setZoom(3);
        m_consoleText->append(tr("[View] Map reset to default view."));
    }
}

void MainWindow::onAbout() {
    QMessageBox::about(this, tr("About AGRS ZEUS"),
        tr("<h2>AGRS ZEUS v0.1.0</h2>"
           "<p>Pipeline Routing & Geospatial Analysis System</p>"
           "<p><b>Artemis Global Research Solutions Inc.</b></p>"
           "<p>AI-powered pipeline routing with physics-informed reinforcement learning.</p>"
           "<p>© 2025 AGRS. All rights reserved.</p>"));
}

void MainWindow::onCoordinatesChanged(double lat, double lon) {
    // TODO: Query elevation from DEM when available
    double elev = 0.0;  // Placeholder
    
    m_coordsLabel->setText(
        tr("Lat: %1°  Lon: %2°  Elev: %3 m")
        .arg(lat, 0, 'f', 6)
        .arg(lon, 0, 'f', 6)
        .arg(elev, 0, 'f', 1));
}

void MainWindow::onLayerVisibilityChanged(QTreeWidgetItem* item, int column) {
    Q_UNUSED(column);
    if (!item) return;
    
    MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
    if (!map) return;
    
    QString layerPath = item->data(0, Qt::UserRole).toString();
    if (layerPath.isEmpty()) return;
    
    bool visible = (item->checkState(0) == Qt::Checked);
    map->setLayerVisible(layerPath, visible);
    
    m_consoleText->append(tr("[Layers] %1: %2")
        .arg(item->text(0))
        .arg(visible ? tr("visible") : tr("hidden")));
}

void MainWindow::onLayerOrderChanged() {
    MapWidget* map = qobject_cast<MapWidget*>(m_osgWidget);
    if (!map) return;
    // Unified tree: collect bottom-to-top for draw order (first drawn first)
    QStringList orderedPaths;
    for (int i = m_layersTree->topLevelItemCount() - 1; i >= 0; --i) {
        QTreeWidgetItem* item = m_layersTree->topLevelItem(i);
        QString path = item->data(0, Qt::UserRole).toString();
        if (!path.isEmpty()) orderedPaths.append(path);
    }

    map->setLayerOrder(orderedPaths);
    m_consoleText->append(tr("[Layers] Layer order updated"));
}

} // namespace gui
} // namespace agrs






