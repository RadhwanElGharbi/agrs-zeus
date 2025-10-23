#include "agrs_zeus/gui/MainWindow.h"
#include "agrs_zeus/gui/MapWidget.h"
#include "agrs_zeus/gui/BackendInterface.h"
#include "agrs_zeus/gui/DatasetAvailabilityDialog.h"
#include "agrs_zeus/Tools.h"

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
#include <QInputDialog>

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
    // Prefer a compact, modern UI feel
    setUnifiedTitleAndToolBarOnMac(true);
    resize(1600, 1000);
    
    // Create central map widget
    m_osgWidget = new MapWidget(this);
    setCentralWidget(m_osgWidget);
    
    // Create backend interface
    m_backend = new BackendInterface(this);
    
    // Setup UI
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
    
    // Help menu
    QMenu* helpMenu = menuBar()->addMenu(tr("&Help"));
    helpMenu->addAction(tr("&About AGRS ZEUS..."), this, &MainWindow::onAbout);
}

void MainWindow::createToolbars() {
    // File toolbar - simplified to only essential operations
    m_fileToolbar = addToolBar(tr("File"));
    m_fileToolbar->setObjectName("FileToolbar");
    m_fileToolbar->setIconSize(QSize(18, 18));
    m_fileToolbar->addAction(tr("New"), this, &MainWindow::onNewProject);
    m_fileToolbar->addAction(tr("Open"), this, &MainWindow::onOpenProject);
    m_fileToolbar->addAction(tr("Save"), this, &MainWindow::onSaveProject);
    
    // Data toolbar - dataset availability at any time
    m_dataToolbar = addToolBar(tr("Data"));
    m_dataToolbar->setObjectName("DataToolbar");
    m_dataToolbar->setIconSize(QSize(18, 18));
    m_dataToolbar->addAction(tr("Data"), this, &MainWindow::onDataAvailability);
}

void MainWindow::createDockWidgets() {
    // Layers panel
    m_layersDock = new QDockWidget(tr("Layers"), this);
    m_layersDock->setObjectName("LayersDock");
    m_layersDock->setFeatures(QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetClosable);
    m_layersTree = new QTreeWidget();
    m_layersTree->setHeaderLabel(tr("Dataset Layers"));
    m_layersDock->setWidget(m_layersTree);
    addDockWidget(Qt::LeftDockWidgetArea, m_layersDock);
    
    // Properties panel
    m_propertiesDock = new QDockWidget(tr("Properties"), this);
    m_propertiesDock->setObjectName("PropertiesDock");
    m_propertiesDock->setFeatures(QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetClosable);
    m_propertiesText = new QTextEdit();
    m_propertiesText->setReadOnly(true);
    m_propertiesText->setPlainText(tr("No layer selected."));
    m_propertiesDock->setWidget(m_propertiesText);
    addDockWidget(Qt::RightDockWidgetArea, m_propertiesDock);
    
    // Console/Terminal panel with tabs
    m_consoleDock = new QDockWidget(tr("Output"), this);
    m_consoleDock->setObjectName("ConsoleDock");
    m_consoleDock->setFeatures(QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetClosable);
    
    m_consoleTabWidget = new QTabWidget();
    
    m_consoleText = new QTextEdit();
    m_consoleText->setReadOnly(true);
    m_consoleText->setPlainText(tr("AGRS ZEUS Console\n"));
    
    m_terminalWidget = new TerminalWidget();
    
    m_consoleTabWidget->addTab(m_consoleText, tr("Console"));
    m_consoleTabWidget->addTab(m_terminalWidget, tr("Terminal"));
    
    m_consoleDock->setWidget(m_consoleTabWidget);
    addDockWidget(Qt::BottomDockWidgetArea, m_consoleDock);
}

void MainWindow::createStatusBar() {
    m_coordsLabel = new QLabel(tr("Coordinates: --"));
    m_statusLabel = new QLabel(tr("Ready"));
    
    statusBar()->addWidget(m_coordsLabel);
    statusBar()->addPermanentWidget(m_statusLabel);
}

void MainWindow::setupConnections() {
    // Map widget signals
    MapWidget* mapWidget = qobject_cast<MapWidget*>(m_osgWidget);
    if (mapWidget) {
        connect(mapWidget, &MapWidget::coordinatesChanged,
                this, &MainWindow::onCoordinatesChanged);
    }
    
    // Backend signals
    connect(m_backend, &BackendInterface::logMessage,
            this, [this](const QString& message) {
              m_consoleText->append(message);
          });
     
     // Layers tree checkbox changes
     connect(m_layersTree, &QTreeWidget::itemChanged,
             this, [this](QTreeWidgetItem* item, int column) {
                 if (column != 0) return;
                 
                 QString layerPath = item->data(0, Qt::UserRole).toString();
                 Qt::CheckState state = item->checkState(0);
                 bool visible = (state == Qt::Checked);
                 
                 MapWidget* mapWidget = qobject_cast<MapWidget*>(m_osgWidget);
                 if (!mapWidget) return;
                 
                 // Handle basemap layer
                 if (layerPath == "__BASEMAP__") {
                     mapWidget->setBasemapVisible(visible);
                     m_consoleText->append(tr("[Layers] Basemap %1").arg(visible ? "visible" : "hidden"));
                     return;
                 }
                 
                 // Handle folder items (propagate to children)
                 if (item->childCount() > 0) {
                     for (int i = 0; i < item->childCount(); ++i) {
                         QTreeWidgetItem* child = item->child(i);
                         child->setCheckState(0, state);
                     }
                     return;
                 }
                 
                 // Handle individual layer visibility
                 if (!layerPath.isEmpty() && layerPath != "__BASEMAP__") {
                     mapWidget->setLayerVisible(layerPath, visible);
                     m_consoleText->append(tr("[Layers] %1: %2")
                         .arg(item->text(0))
                         .arg(visible ? "visible" : "hidden"));
                 }
             });
}

// Slot implementations
void MainWindow::onNewProject() {
    MapWidget* mapWidget = qobject_cast<MapWidget*>(m_osgWidget);
    ProjectSetupWizard dialog(mapWidget, this);
    
    if (dialog.exec() == QDialog::Accepted) {
        ProjectSetupData proj = dialog.data();
        
        // Create project directory
        QString fullPath = QDir(proj.projectPath).filePath(proj.projectName);
        QDir projectDir(fullPath);
        
        if (!projectDir.exists()) {
            if (!projectDir.mkpath(".")) {
                QMessageBox::critical(this, tr("Error"),
                    tr("Failed to create project directory: %1").arg(fullPath));
                return;
            }
        }
        
        m_currentProject = fullPath;
        setWindowTitle(tr("AGRS ZEUS - %1").arg(proj.projectName));
        
        // Create project directory structure
        QDir(fullPath + "/aoi").mkpath(".");
        QDir(fullPath + "/data/vectors").mkpath(".");
        QDir(fullPath + "/data/rasters").mkpath(".");
        QDir(fullPath + "/logs").mkpath(".");
        QDir(fullPath + "/docs").mkpath(".");
        QDir(fullPath + "/inputs").mkpath(".");
        
        // 1. Copy AOI file to aoi/ folder
        QString aoiSrc = proj.aoiPath;
        QFileInfo aoiInfo(aoiSrc);
        QString aoiDest = fullPath + "/aoi/aoi." + aoiInfo.suffix();
        if (!aoiInfo.suffix().isEmpty() && QFile::exists(aoiSrc)) {
            QFile::remove(aoiDest);
            if (QFile::copy(aoiSrc, aoiDest)) {
                m_consoleText->append(tr("[Project] Copied AOI: %1 -> %2").arg(aoiInfo.fileName()).arg(aoiDest));
            }
        }
        
        // 2. Copy start point KMZ to aoi/ folder (if provided)
        QString startKmzDest;
        if (!proj.startKmzPath.isEmpty() && QFile::exists(proj.startKmzPath)) {
            QFileInfo startInfo(proj.startKmzPath);
            startKmzDest = fullPath + "/aoi/start_point." + startInfo.suffix();
            QFile::remove(startKmzDest);
            if (QFile::copy(proj.startKmzPath, startKmzDest)) {
                m_consoleText->append(tr("[Project] Copied Start Point: %1").arg(startKmzDest));
            }
        }
        
        // 3. Copy end point KMZ to aoi/ folder (if provided)
        QString endKmzDest;
        if (!proj.endKmzPath.isEmpty() && QFile::exists(proj.endKmzPath)) {
            QFileInfo endInfo(proj.endKmzPath);
            endKmzDest = fullPath + "/aoi/end_point." + endInfo.suffix();
            QFile::remove(endKmzDest);
            if (QFile::copy(proj.endKmzPath, endKmzDest)) {
                m_consoleText->append(tr("[Project] Copied End Point: %1").arg(endKmzDest));
            }
        }
        
        // 4. Copy ROW file to inputs/ folder (if provided)
        QString rowFileDest;
        if (!proj.rowFilePath.isEmpty() && QFile::exists(proj.rowFilePath)) {
            QFileInfo rowInfo(proj.rowFilePath);
            rowFileDest = fullPath + "/inputs/ROW." + rowInfo.suffix();
            QFile::remove(rowFileDest);
            if (QFile::copy(proj.rowFilePath, rowFileDest)) {
                m_consoleText->append(tr("[Project] Copied ROW file: %1").arg(rowFileDest));
            }
        }
        
        // 5. Copy additional files to inputs/ folder
        for (int i = 0; i < proj.additionalFiles.size(); ++i) {
            QString srcFile = proj.additionalFiles[i];
            if (QFile::exists(srcFile)) {
                QFileInfo fileInfo(srcFile);
                QString destFile = fullPath + "/inputs/" + fileInfo.fileName();
                QFile::remove(destFile);
                if (QFile::copy(srcFile, destFile)) {
                    QString context = (i < proj.additionalFileContexts.size()) 
                        ? proj.additionalFileContexts[i] : QString();
                    m_consoleText->append(tr("[Project] Copied: %1%2")
                        .arg(fileInfo.fileName())
                        .arg(context.isEmpty() ? "" : " (" + context + ")"));
                }
            }
        }
        
        // 6. Create project_aoi.json in aoi/ folder
        QJsonObject aoiMeta;
        aoiMeta["aoi_file"] = aoiDest;
        aoiMeta["crs_epsg"] = proj.epsgCode;
        aoiMeta["crs_name"] = proj.crsName;
        
        QJsonObject startPoint;
        startPoint["latitude"] = proj.startLat;
        startPoint["longitude"] = proj.startLon;
        if (!startKmzDest.isEmpty()) {
            startPoint["kmz_file"] = startKmzDest;
        }
        aoiMeta["start_point"] = startPoint;
        
        QJsonObject endPoint;
        endPoint["latitude"] = proj.endLat;
        endPoint["longitude"] = proj.endLon;
        if (!endKmzDest.isEmpty()) {
            endPoint["kmz_file"] = endKmzDest;
        }
        aoiMeta["end_point"] = endPoint;
        
        QFile aoiJson(fullPath + "/aoi/project_aoi.json");
        if (aoiJson.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
            aoiJson.write(QJsonDocument(aoiMeta).toJson(QJsonDocument::Indented));
            aoiJson.close();
            m_consoleText->append(tr("[Project] Created: aoi/project_aoi.json"));
        }
        
        // 7. Create pipeline_specs.json in project root
        QJsonObject pipelineSpecs;
        pipelineSpecs["pipeline_type"] = proj.pipeType;
        pipelineSpecs["material"] = proj.material;
        pipelineSpecs["diameter_mm"] = proj.diameterMm;
        pipelineSpecs["thickness_mm"] = proj.thicknessMm;
        pipelineSpecs["mop_bar"] = proj.mopBar;
        pipelineSpecs["dp_bar"] = proj.dpBar;
        pipelineSpecs["depth_of_cover_m"] = proj.coverDepthM;
        
        // Add hot bend angles
        QJsonArray hotBendAngles;
        for (double angle : proj.hotBendAngles) {
            hotBendAngles.append(angle);
        }
        pipelineSpecs["hot_bend_angles_deg"] = hotBendAngles;
        
        // Add other specs
        pipelineSpecs["hdd_max_curvature_deg"] = proj.hddMaxCurvatureDeg;
        pipelineSpecs["powerlines_min_distance_mm"] = proj.powerlinesMinDistMm;
        pipelineSpecs["poles_min_distance_mm"] = proj.powerpolesMinDistMm;
        pipelineSpecs["house_min_distance_mm"] = proj.houseMinDistMm;
        
        if (!rowFileDest.isEmpty()) {
            pipelineSpecs["row_file"] = rowFileDest;
        } else {
            pipelineSpecs["row_file"] = QJsonValue::Null;
        }
        
        QFile specsJson(fullPath + "/pipeline_specs.json");
        if (specsJson.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
            specsJson.write(QJsonDocument(pipelineSpecs).toJson(QJsonDocument::Indented));
            specsJson.close();
            m_consoleText->append(tr("[Project] Created: pipeline_specs.json"));
        }
        
        // 8. Create project_metadata.json (general project info)
        QJsonObject projectMeta;
        projectMeta["project_name"] = proj.projectName;
        projectMeta["date_created"] = QDateTime::currentDateTimeUtc().toString(Qt::ISODate);
        projectMeta["crs_epsg"] = proj.epsgCode;
        projectMeta["crs_name"] = proj.crsName;
        
        QFile pm(fullPath + "/project_metadata.json");
        if (pm.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
            pm.write(QJsonDocument(projectMeta).toJson(QJsonDocument::Indented));
            pm.close();
            m_consoleText->append(tr("[Project] Created: project_metadata.json"));
        }
        
        m_consoleText->append(tr("[Project] Created: %1").arg(fullPath));
        
        // Set terminal working directory to project path
        m_terminalWidget->setWorkingDirectory(fullPath);
        
        // After creation, run intelligent dataset availability analysis
        DatasetAvailabilityDialog avail(qobject_cast<MapWidget*>(m_osgWidget), aoiDest, fullPath, this, m_terminalWidget);
        avail.analyzeAndDisplay();
        avail.exec();
        
        // Auto-load all layers from data directories after dataset dialog closes
        loadProjectLayers(fullPath);
    }
}

void MainWindow::onOpenProject() {
    QString dir = QFileDialog::getExistingDirectory(
        this, tr("Open Project Directory"), "/opt/agrs/Projects");
    if (dir.isEmpty()) return;
    
    m_currentProject = dir;
    m_consoleText->append(tr("[Open Project] %1").arg(dir));
    
    // Set terminal working directory to project path
    m_terminalWidget->setWorkingDirectory(dir);
    
    // Use the directory name as the project name in the title
    QString projectName = QFileInfo(dir).fileName();
    if (projectName.isEmpty()) projectName = dir;
    setWindowTitle(tr("AGRS ZEUS - %1").arg(projectName));
    
    // Auto-load all layers from data directories
    loadProjectLayers(dir);
}

void MainWindow::onSaveProject() {
    if (m_currentProject.isEmpty()) {
        QMessageBox::warning(this, tr("No Project"), tr("No project is currently open."));
        return;
    }
    
    m_consoleText->append(tr("[Project] Saved: %1").arg(m_currentProject));
    statusBar()->showMessage(tr("Project saved"), 2000);
}

void MainWindow::onSaveProjectAs() {
    QString dir = QFileDialog::getExistingDirectory(
        this, tr("Save Project As"), "/opt/agrs/Projects");
    if (dir.isEmpty()) return;
    
    m_currentProject = dir;
    m_consoleText->append(tr("[Save Project As] %1").arg(dir));
}

void MainWindow::onExit() {
    close();
}

void MainWindow::onProjectSettings() {
    QMessageBox::information(this, tr("Project Settings"),
                            tr("Project settings dialog (TODO)"));
}

QString MainWindow::findAOIFileInProject(const QString& projectDir) const {
    // Prefer aoi/aoi.* if present
    QDir aoiDir(projectDir + "/aoi");
    if (aoiDir.exists()) {
        QStringList candidates = aoiDir.entryList(QStringList() << "aoi.*" << "*.kmz" << "*.kml" << "*.geojson" << "*.gpkg" << "*.shp", QDir::Files);
        if (!candidates.isEmpty()) return aoiDir.filePath(candidates.first());
    }
    // Fallback: first vector-like file under aoi/
    QStringList anyVec = aoiDir.entryList(QStringList() << "*.kmz" << "*.kml" << "*.geojson" << "*.gpkg" << "*.shp", QDir::Files);
    if (!anyVec.isEmpty()) return aoiDir.filePath(anyVec.first());
    return QString();
}

void MainWindow::onDataAvailability() {
    if (m_currentProject.isEmpty()) {
        QMessageBox::warning(this, tr("No Project"), tr("Open or create a project first."));
        return;
    }
    QString aoiPath = findAOIFileInProject(m_currentProject);
    if (aoiPath.isEmpty()) {
        QMessageBox::warning(this, tr("Missing AOI"), tr("No AOI file found under %1/aoi").arg(m_currentProject));
        return;
    }
    DatasetAvailabilityDialog dlg(qobject_cast<MapWidget*>(m_osgWidget), aoiPath, m_currentProject, this, m_terminalWidget);
    dlg.analyzeAndDisplay();
    dlg.exec();
}

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
        tr("AGRS ZEUS - Pipeline Routing & Geospatial Analysis\n\n"
           "Artemis Global Research Solutions Inc.\n"
           "Version 0.1.0\n\n"
           "All geospatial operations are handled by Cursor CLI."));
}

void MainWindow::onCoordinatesChanged(double lat, double lon) {
    m_coordsLabel->setText(tr("Coordinates: %1°N, %2°E").arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6));
}

void MainWindow::loadProjectLayers(const QString& projectDir) {
    m_consoleText->append(tr("[Layers] Scanning project data directories..."));
    
    // Clear existing layers
    m_layersTree->clear();
    
    // Get map widget for layer loading
    MapWidget* mapWidget = qobject_cast<MapWidget*>(m_osgWidget);
    if (mapWidget) {
        mapWidget->clearOverlays();
    }
    
    // Add basemap layer (always first)
    QTreeWidgetItem* basemapItem = new QTreeWidgetItem(m_layersTree);
    basemapItem->setText(0, "Basemap (ESRI World Imagery)");
    basemapItem->setIcon(0, style()->standardIcon(QStyle::SP_DesktopIcon));
    basemapItem->setCheckState(0, Qt::Checked);
    basemapItem->setData(0, Qt::UserRole, "__BASEMAP__");
    basemapItem->setToolTip(0, "Background tile layer from ESRI World Imagery");
    
    QDir dataDir(projectDir + "/data");
    if (!dataDir.exists()) {
        m_consoleText->append(tr("[Layers] No data directory found in project"));
        return;
    }
    
    int rasterCount = 0;
    int vectorCount = 0;
    
    // Create top-level items for rasters and vectors
    QTreeWidgetItem* rastersRoot = new QTreeWidgetItem(m_layersTree);
    rastersRoot->setText(0, "Rasters");
    rastersRoot->setIcon(0, style()->standardIcon(QStyle::SP_DirIcon));
    rastersRoot->setCheckState(0, Qt::Checked);
    
    QTreeWidgetItem* vectorsRoot = new QTreeWidgetItem(m_layersTree);
    vectorsRoot->setText(0, "Vectors");
    vectorsRoot->setIcon(0, style()->standardIcon(QStyle::SP_DirIcon));
    vectorsRoot->setCheckState(0, Qt::Checked);
    
    // Scan rasters directory
    QDir rastersDir(projectDir + "/data/rasters");
    if (rastersDir.exists()) {
        QStringList rasterFilters;
        rasterFilters << "*.tif" << "*.tiff" << "*.vrt" << "*.img" << "*.grd";
        QFileInfoList rasterFiles = rastersDir.entryInfoList(rasterFilters, QDir::Files);
        
        for (const QFileInfo& fileInfo : rasterFiles) {
            QTreeWidgetItem* item = new QTreeWidgetItem(rastersRoot);
            item->setText(0, fileInfo.fileName());
            item->setIcon(0, style()->standardIcon(QStyle::SP_FileIcon));
            item->setCheckState(0, Qt::Checked);
            item->setData(0, Qt::UserRole, fileInfo.absoluteFilePath());
            item->setToolTip(0, fileInfo.absoluteFilePath());
            rasterCount++;
            
            // Load raster into map widget
            if (mapWidget) {
                if (mapWidget->addRasterLayer(fileInfo.absoluteFilePath())) {
                    m_consoleText->append(tr("[Layers] Loaded raster: %1").arg(fileInfo.fileName()));
                } else {
                    m_consoleText->append(tr("[Layers] Failed to load raster: %1").arg(fileInfo.fileName()));
                }
            }
        }
        
        // Check for subdirectories (e.g., sentinel2/)
        QFileInfoList subDirs = rastersDir.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot);
        for (const QFileInfo& dirInfo : subDirs) {
            QDir subDir(dirInfo.absoluteFilePath());
            QFileInfoList subFiles = subDir.entryInfoList(rasterFilters, QDir::Files);
            
            if (!subFiles.isEmpty()) {
                QTreeWidgetItem* subItem = new QTreeWidgetItem(rastersRoot);
                subItem->setText(0, dirInfo.fileName());
                subItem->setIcon(0, style()->standardIcon(QStyle::SP_DirIcon));
                subItem->setCheckState(0, Qt::Checked);
                
                for (const QFileInfo& fileInfo : subFiles) {
                    QTreeWidgetItem* item = new QTreeWidgetItem(subItem);
                    item->setText(0, fileInfo.fileName());
                    item->setIcon(0, style()->standardIcon(QStyle::SP_FileIcon));
                    item->setCheckState(0, Qt::Checked);
                    item->setData(0, Qt::UserRole, fileInfo.absoluteFilePath());
                    item->setToolTip(0, fileInfo.absoluteFilePath());
                    rasterCount++;
                    
                    // Load raster into map widget
                    if (mapWidget) {
                        if (mapWidget->addRasterLayer(fileInfo.absoluteFilePath())) {
                            m_consoleText->append(tr("[Layers] Loaded raster: %1/%2").arg(dirInfo.fileName()).arg(fileInfo.fileName()));
                        } else {
                            m_consoleText->append(tr("[Layers] Failed to load raster: %1/%2").arg(dirInfo.fileName()).arg(fileInfo.fileName()));
                        }
                    }
                }
            }
        }
    }
    
    // Scan vectors directory
    QDir vectorsDir(projectDir + "/data/vectors");
    if (vectorsDir.exists()) {
        QStringList vectorFilters;
        vectorFilters << "*.gpkg" << "*.shp" << "*.geojson" << "*.kml" << "*.kmz" << "*.gml";
        QFileInfoList vectorFiles = vectorsDir.entryInfoList(vectorFilters, QDir::Files);
        
        for (const QFileInfo& fileInfo : vectorFiles) {
            // Skip JSON metadata files
            if (fileInfo.suffix() == "json" && !fileInfo.fileName().endsWith(".geojson")) {
                continue;
            }
            
            QTreeWidgetItem* item = new QTreeWidgetItem(vectorsRoot);
            item->setText(0, fileInfo.fileName());
            item->setIcon(0, style()->standardIcon(QStyle::SP_FileIcon));
            item->setCheckState(0, Qt::Checked);
            item->setData(0, Qt::UserRole, fileInfo.absoluteFilePath());
            item->setToolTip(0, fileInfo.absoluteFilePath());
            vectorCount++;
            
            // Load vector into map widget
            if (mapWidget) {
                if (mapWidget->addVectorLayer(fileInfo.absoluteFilePath())) {
                    m_consoleText->append(tr("[Layers] Loaded vector: %1").arg(fileInfo.fileName()));
                } else {
                    m_consoleText->append(tr("[Layers] Failed to load vector: %1").arg(fileInfo.fileName()));
                }
            }
        }
    }
    
    // Expand root items
    rastersRoot->setExpanded(true);
    vectorsRoot->setExpanded(true);
    
    // Update console
    m_consoleText->append(tr("[Layers] Loaded %1 raster(s) and %2 vector(s)").arg(rasterCount).arg(vectorCount));
    
    if (rasterCount + vectorCount == 0) {
        m_consoleText->append(tr("[Layers] No geospatial data files found in project"));
    }
}

} // namespace gui
} // namespace agrs





