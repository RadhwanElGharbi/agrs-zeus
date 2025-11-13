#include "agrs_zeus/gui/MainWindow.h"
#include "agrs_zeus/gui/MapWidget.h"
#include "agrs_zeus/gui/Terrain3DWidget.h"
#include "agrs_zeus/gui/BackendInterface.h"
#include "agrs_zeus/gui/DatasetAvailabilityDialog.h"
#include "agrs_zeus/gui/ClipToAOIDialog.h"
#include "agrs_zeus/gui/AttributeTableDialog.h"
#include "agrs_zeus/gui/VectorStyleDialog.h"
#include "agrs_zeus/gui/FeatureIdentifyDialog.h"
#include "agrs_zeus/gui/PerplexityChatDialog.h"
#include "agrs_zeus/Tools.h"

#include <QMenuBar>
#include <QMenu>
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
#include <QRandomGenerator>
#include <QSettings>
#include <QApplication>
#include <QDir>
#include <QFileSystemModel>
#include <QtConcurrent>
#include <QDialogButtonBox>
#include <QInputDialog>
#include <QStackedWidget>
#include <QVBoxLayout>
#include <QLineEdit>
#include <QRegularExpression>
#include <QProcess>
#include <QThread>
#include <gdal/gdal_priv.h>
#include <gdal/ogrsf_frmts.h>
#include <algorithm>

namespace agrs {
namespace gui {

MainWindow::MainWindow(QWidget* parent)
    : QMainWindow(parent)
    , m_viewStack(nullptr)
    , m_mapWidget(nullptr)
    , m_terrain3DWidget(nullptr)
    , m_layersDock(nullptr)
    , m_propertiesDock(nullptr)
    , m_consoleDock(nullptr)
    , m_backend(nullptr)
{
    setWindowTitle("AGRS ZEUS - Pipeline Routing & Geospatial Analysis");
    // Prefer a compact, modern UI feel
    setUnifiedTitleAndToolBarOnMac(true);
    resize(1600, 1000);
    
    // Create stacked widget for 2D/3D views
    m_viewStack = new QStackedWidget(this);
    
    // Create 2D map widget
    m_mapWidget = new MapWidget(this);
    m_viewStack->addWidget(m_mapWidget);
    
    // Connect feature click signal (coordinatesChanged is connected in setupConnections())
    connect(m_mapWidget, &MapWidget::featureClicked, this, &MainWindow::onFeatureClicked);
    
    // Create 3D terrain widget
    m_terrain3DWidget = new Terrain3DWidget(this);
    m_viewStack->addWidget(m_terrain3DWidget);
    
    // Start in 2D mode
    m_viewStack->setCurrentWidget(m_mapWidget);
    
    setCentralWidget(m_viewStack);
    
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
    
    // All geospatial operations will be handled by AI through intelligent project analysis
    
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
    m_dataToolbar->addAction(tr("Clip Layer to AOI"), this, &MainWindow::onClipToAOI);
    
    // View toolbar - 2D/3D toggle
    m_viewToolbar = addToolBar(tr("View"));
    m_viewToolbar->setObjectName("ViewToolbar");
    m_viewToolbar->setIconSize(QSize(18, 18));
    QAction* toggle3D = m_viewToolbar->addAction(tr("2D/3D"), this, &MainWindow::onToggle2D3D);
    toggle3D->setToolTip(tr("Toggle between 2D map and 3D terrain views"));
    
    // PIRL toolbar - parameter tuning
    m_pirlToolbar = addToolBar(tr("PIRL"));
    m_pirlToolbar->setObjectName("PIRLToolbar");
    m_pirlToolbar->setIconSize(QSize(18, 18));
    m_tuneAction = m_pirlToolbar->addAction(tr("🎛️ Tune"), this, &MainWindow::onTunePIRL);
    m_tuneAction->setToolTip(tr("Open PIRL Parameter Tuner"));
    m_tuneAction->setEnabled(false); // Disabled until project is loaded
}

void MainWindow::createDockWidgets() {
    // Layers panel with toolbar
    m_layersDock = new QDockWidget(tr("Layers"), this);
    m_layersDock->setObjectName("LayersDock");
    m_layersDock->setFeatures(QDockWidget::DockWidgetMovable | QDockWidget::DockWidgetClosable);
    
    // Create container widget for layers panel
    QWidget* layersContainer = new QWidget();
    QVBoxLayout* layersLayout = new QVBoxLayout(layersContainer);
    layersLayout->setContentsMargins(0, 0, 0, 0);
    layersLayout->setSpacing(0);
    
    // Add toolbar with "New Folder" button
    QToolBar* layersToolbar = new QToolBar();
    layersToolbar->setIconSize(QSize(16, 16));
    layersToolbar->setToolButtonStyle(Qt::ToolButtonIconOnly);
    
    QAction* newFolderAction = layersToolbar->addAction(style()->standardIcon(QStyle::SP_FileDialogNewFolder), tr("New Folder"));
    newFolderAction->setToolTip(tr("Create a new folder in project data directory"));
    connect(newFolderAction, &QAction::triggered, this, &MainWindow::onNewFolder);
    
    layersLayout->addWidget(layersToolbar);
    
    // Add tree widget
    m_layersTree = new QTreeWidget();
    m_layersTree->setHeaderLabel(tr("Dataset Layers"));
    m_layersTree->setContextMenuPolicy(Qt::CustomContextMenu);
    connect(m_layersTree, &QTreeWidget::customContextMenuRequested, 
            this, &MainWindow::onLayerTreeContextMenu);
    layersLayout->addWidget(m_layersTree);
    
    m_layersDock->setWidget(layersContainer);
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
    if (m_mapWidget) {
        connect(m_mapWidget, &MapWidget::coordinatesChanged,
                this, &MainWindow::onCoordinatesChanged);
        connect(m_mapWidget, &MapWidget::moreInfoRequested,
                this, &MainWindow::onMoreInfoRequested);
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
                 
                 if (!m_mapWidget) return;
                 
                 // Handle basemap layer
                 if (layerPath == "__BASEMAP__") {
                     m_mapWidget->setBasemapVisible(visible);
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
                     m_mapWidget->setLayerVisible(layerPath, visible);
                     m_consoleText->append(tr("[Layers] %1: %2")
                         .arg(item->text(0))
                         .arg(visible ? "visible" : "hidden"));
                 }
             });
}

// Slot implementations
void MainWindow::onNewProject() {
    ProjectSetupWizard dialog(m_mapWidget, this);
    
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
        
        // ====================================================================
        // AUTOMATIC PIRL ENVIRONMENT SETUP
        // ====================================================================
        m_consoleText->append(tr("[PIRL] Setting up PIRL environment..."));
        
        // 1. Create PIRL directory structure
        QDir pirlDir(fullPath + "/PIRL");
        pirlDir.mkpath("outputs");
        pirlDir.mkpath("models/best_model");
        pirlDir.mkpath("models/checkpoints");
        pirlDir.mkpath("logs");
        pirlDir.mkpath("parameter_tuner");
        m_consoleText->append(tr("[PIRL] Created directory structure"));
        
        // 2. Generate pirl_training_config.yaml from template
        QString templatePath = "/opt/agrs/templates/pirl_training_config_template.yaml";
        QString configPath = fullPath + "/PIRL/pirl_training_config.yaml";
        
        QFile templateFile(templatePath);
        if (templateFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
            QString configContent = QString::fromUtf8(templateFile.readAll());
            templateFile.close();
            
            // Replace placeholders with actual project data
            configContent.replace("<PROJECT_NAME>", proj.projectName);
            configContent.replace("<PROJECT_CODE>", proj.projectName.toUpper() + "_V1");
            configContent.replace("<CLIENT_NAME>", "CLIENT_TBD"); // User can edit later
            configContent.replace("<EPSG_CODE>", QString::number(proj.epsgCode));
            configContent.replace("<PROJECT_PATH>", fullPath);
            configContent.replace("<PROJECT_NAME_LOWER>", proj.projectName.toLower().replace(" ", "_"));
            configContent.replace("<COUNTRY_CODE>", "XXX"); // User must specify
            configContent.replace("<REGION_NAME>", "REGION_TBD"); // User must specify
            
            // Convert lat/lon to UTM (using pyproj via QProcess - simplified approach)
            // For now, use placeholders that user must replace with UTM coordinates
            configContent.replace("<START_X>", QString::number(proj.startLon, 'f', 2) + " # TODO: Convert to UTM");
            configContent.replace("<START_Y>", QString::number(proj.startLat, 'f', 2) + " # TODO: Convert to UTM");
            configContent.replace("<END_X>", QString::number(proj.endLon, 'f', 2) + " # TODO: Convert to UTM");
            configContent.replace("<END_Y>", QString::number(proj.endLat, 'f', 2) + " # TODO: Convert to UTM");
            
            // AOI bounds - extract from AOI file or use placeholders
            configContent.replace("<AOI_MIN_X>", "0.0 # TODO: Extract from AOI");
            configContent.replace("<AOI_MIN_Y>", "0.0 # TODO: Extract from AOI");
            configContent.replace("<AOI_MAX_X>", "0.0 # TODO: Extract from AOI");
            configContent.replace("<AOI_MAX_Y>", "0.0 # TODO: Extract from AOI");
            
            QFile configFile(configPath);
            if (configFile.open(QIODevice::WriteOnly | QIODevice::Text)) {
                configFile.write(configContent.toUtf8());
                configFile.close();
                m_consoleText->append(tr("[PIRL] Created: pirl_training_config.yaml"));
                m_consoleText->append(tr("[PIRL] NOTE: Review config file and replace TODO items"));
            }
        } else {
            m_consoleText->append(tr("[PIRL] WARNING: Template not found, skipping config generation"));
        }
        
        // 3. Enhance pipeline_specs.json with hydraulics section
        QString pipelineSpecsPath = fullPath + "/pipeline_specs.json";
        QFile pipelineSpecsFile(pipelineSpecsPath);
        if (pipelineSpecsFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
            QJsonDocument pipelineDoc = QJsonDocument::fromJson(pipelineSpecsFile.readAll());
            pipelineSpecsFile.close();
            
            if (!pipelineDoc.isNull()) {
                QJsonObject pipelineObj = pipelineDoc.object();
                
                // Add hydraulics section
                QJsonObject hydraulics;
                hydraulics["enable_hydraulics"] = true;
                hydraulics["enable_compressor_placement"] = true;
                hydraulics["initial_pressure_bar"] = 70.0;
                hydraulics["min_delivery_pressure_bar"] = 45.0;
                hydraulics["max_operating_pressure_bar"] = 75.0;
                hydraulics["volumetric_flow_rate_m3_s"] = 1.0;
                hydraulics["operating_temperature_k"] = 288.15;
                hydraulics["gas_molecular_weight_kg_kmol"] = 16.8;
                hydraulics["gas_specific_gravity"] = 0.58;
                hydraulics["pipe_roughness_mm"] = 0.045;
                hydraulics["compressor_capex_per_kw_usd"] = 5000.0;
                hydraulics["compressor_opex_fraction"] = 0.03;
                hydraulics["energy_cost_usd_per_kwh"] = 0.05;
                
                pipelineObj["hydraulics"] = hydraulics;
                
                // Save enhanced pipeline_specs.json
                QFile enhancedFile(pipelineSpecsPath);
                if (enhancedFile.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
                    enhancedFile.write(QJsonDocument(pipelineObj).toJson(QJsonDocument::Indented));
                    enhancedFile.close();
                    m_consoleText->append(tr("[PIRL] Enhanced pipeline_specs.json with hydraulics"));
                }
            }
        }
        
        // 4. Copy parameter tuner template
        QString paramTunerSource = "/opt/agrs/Projects/test_project2/PIRL/parameter_tuner";
        QString paramTunerDest = fullPath + "/PIRL/parameter_tuner";
        
        // Copy parameter tuner files using system command
        QProcess::execute("cp", QStringList() << "-r" << paramTunerSource + "/main.cpp" << paramTunerDest);
        QProcess::execute("cp", QStringList() << "-r" << paramTunerSource + "/PIRLParameterTuningDialog.h" << paramTunerDest);
        QProcess::execute("cp", QStringList() << "-r" << paramTunerSource + "/PIRLParameterTuningDialog.cpp" << paramTunerDest);
        QProcess::execute("cp", QStringList() << "-r" << paramTunerSource + "/CMakeLists.txt" << paramTunerDest);
        QProcess::execute("cp", QStringList() << "-r" << paramTunerSource + "/pirl_parameters_default.json" << paramTunerDest);
        QProcess::execute("cp", QStringList() << "-r" << paramTunerSource + "/README.md" << paramTunerDest);
        
        // Copy pirl_parameters_default.json to PIRL root
        QProcess::execute("cp", QStringList() << paramTunerSource + "/pirl_parameters_default.json" << fullPath + "/PIRL/");
        
        // Update CMakeLists.txt with project name
        QString cmakeListsPath = fullPath + "/PIRL/parameter_tuner/CMakeLists.txt";
        QFile cmakeFile(cmakeListsPath);
        if (cmakeFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
            QString cmakeContent = QString::fromUtf8(cmakeFile.readAll());
            cmakeFile.close();
            
            cmakeContent.replace("test_project2", proj.projectName);
            
            QFile updatedCmake(cmakeListsPath);
            if (updatedCmake.open(QIODevice::WriteOnly | QIODevice::Truncate | QIODevice::Text)) {
                updatedCmake.write(cmakeContent.toUtf8());
                updatedCmake.close();
                m_consoleText->append(tr("[PIRL] Copied parameter tuner template"));
            }
        }
        
        // 5. Automatically add to CMakeLists.txt and build parameter tuner
        m_consoleText->append(tr("[PIRL] ===================================================="));
        m_consoleText->append(tr("[PIRL] PIRL environment setup complete!"));
        m_consoleText->append(tr("[PIRL] ===================================================="));
        
        // Add to main CMakeLists.txt
        QString mainCMakePath = "/opt/agrs/CMakeLists.txt";
        QString cmakeEntry = QString("\n# PIRL Parameter Tuner for %1\nadd_subdirectory(Projects/%1/PIRL/parameter_tuner)\n").arg(proj.projectName);
        
        QFile mainCMake(mainCMakePath);
        if (mainCMake.open(QIODevice::ReadOnly | QIODevice::Text)) {
            QString cmakeContent = QString::fromUtf8(mainCMake.readAll());
            mainCMake.close();
            
            // Check if entry already exists
            if (!cmakeContent.contains(QString("Projects/%1/PIRL/parameter_tuner").arg(proj.projectName))) {
                // Append to end of file
                QFile appendCMake(mainCMakePath);
                if (appendCMake.open(QIODevice::Append | QIODevice::Text)) {
                    appendCMake.write(cmakeEntry.toUtf8());
                    appendCMake.close();
                    m_consoleText->append(tr("[PIRL] Added parameter tuner to CMakeLists.txt"));
                } else {
                    m_consoleText->append(tr("[PIRL] WARNING: Could not modify CMakeLists.txt"));
                }
            } else {
                m_consoleText->append(tr("[PIRL] Parameter tuner already in CMakeLists.txt"));
            }
        }
        
        // Build parameter tuner automatically
        m_consoleText->append(tr("[PIRL] Building parameter tuner (this may take 2-5 minutes)..."));
        m_consoleText->append(tr("[PIRL] Please wait while cmake and make run..."));
        
        // Run cmake first
        QProcess cmakeProcess;
        cmakeProcess.setWorkingDirectory("/opt/agrs/build");
        cmakeProcess.start("cmake", QStringList() << ".." << "-DCMAKE_BUILD_TYPE=Release");
        
        if (cmakeProcess.waitForStarted()) {
            if (cmakeProcess.waitForFinished(60000)) { // 60 second timeout for cmake
                if (cmakeProcess.exitCode() == 0) {
                    m_consoleText->append(tr("[PIRL] CMake completed successfully"));
                    
                    // Now run make with project-specific target name
                    QString targetName = QString("pirl_parameter_tuner_%1").arg(proj.projectName);
                    QProcess makeProcess;
                    makeProcess.setWorkingDirectory("/opt/agrs/build");
                    makeProcess.start("make", QStringList() << targetName << QString("-j%1").arg(QThread::idealThreadCount()));
                    
                    if (makeProcess.waitForStarted()) {
                        if (makeProcess.waitForFinished(300000)) { // 5 minute timeout for make
                            if (makeProcess.exitCode() == 0) {
                                m_consoleText->append(tr("[PIRL] ✓ Parameter tuner built successfully!"));
                                m_consoleText->append(tr("[PIRL] Executable: %1/PIRL/pirl_parameter_tuner").arg(fullPath));
                            } else {
                                m_consoleText->append(tr("[PIRL] ✗ Build failed (exit code: %1)").arg(makeProcess.exitCode()));
                                m_consoleText->append(tr("[PIRL] You can build manually: cd /opt/agrs/build && make pirl_parameter_tuner"));
                                QString makeError = QString::fromUtf8(makeProcess.readAllStandardError());
                                if (!makeError.isEmpty()) {
                                    m_consoleText->append(tr("[PIRL] Error: %1").arg(makeError.left(200)));
                                }
                            }
                        } else {
                            m_consoleText->append(tr("[PIRL] ⏱ Build timeout - continuing in background"));
                            m_consoleText->append(tr("[PIRL] Check build status: cd /opt/agrs/build && make pirl_parameter_tuner"));
                        }
                    } else {
                        m_consoleText->append(tr("[PIRL] ✗ Failed to start make process"));
                    }
                } else {
                    m_consoleText->append(tr("[PIRL] ✗ CMake failed (exit code: %1)").arg(cmakeProcess.exitCode()));
                    QString cmakeError = QString::fromUtf8(cmakeProcess.readAllStandardError());
                    if (!cmakeError.isEmpty()) {
                        m_consoleText->append(tr("[PIRL] Error: %1").arg(cmakeError.left(200)));
                    }
                }
            } else {
                m_consoleText->append(tr("[PIRL] ⏱ CMake timeout"));
            }
        } else {
            m_consoleText->append(tr("[PIRL] ✗ Failed to start cmake process"));
        }
        
        m_consoleText->append(tr("[PIRL] ===================================================="));
        m_consoleText->append(tr("[PIRL] Review and edit: PIRL/pirl_training_config.yaml"));
        m_consoleText->append(tr("[PIRL] Launch parameter tuner: Click 'Tune' button or cd PIRL && ./pirl_parameter_tuner"));
        m_consoleText->append(tr("[PIRL] Documentation: /opt/agrs/docs/Project Instructions/"));
        m_consoleText->append(tr("[PIRL] ===================================================="));
        
        // Enable PIRL Tune button
        if (m_tuneAction) {
            m_tuneAction->setEnabled(true);
        }
        
        // Set terminal working directory to project path
        m_terminalWidget->setWorkingDirectory(fullPath);
        
        // After creation, run intelligent dataset availability analysis
        DatasetAvailabilityDialog avail(m_mapWidget, aoiDest, fullPath, this, m_terminalWidget);
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
    
    // Check if PIRL parameter tuner exists and enable Tune button
    QString tunerPath = dir + "/PIRL/pirl_parameter_tuner";
    if (QFile::exists(tunerPath) && m_tuneAction) {
        m_tuneAction->setEnabled(true);
    }
    
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
    DatasetAvailabilityDialog dlg(m_mapWidget, aoiPath, m_currentProject, this, m_terminalWidget);
    dlg.analyzeAndDisplay();
    dlg.exec();
}

void MainWindow::onClipToAOI() {
    if (m_currentProject.isEmpty()) {
        QMessageBox::warning(this, tr("No Project"), tr("Open or create a project first."));
        return;
    }
    
    QString aoiPath = findAOIFileInProject(m_currentProject);
    if (aoiPath.isEmpty()) {
        QMessageBox::warning(this, tr("Missing AOI"), 
            tr("No AOI file found in %1/aoi/\n\n"
               "Please ensure your project has an AOI file before clipping layers.")
            .arg(m_currentProject));
        return;
    }
    
    m_consoleText->append(tr("[Clip] Opening Clip to AOI dialog..."));
    
    ClipToAOIDialog dlg(m_currentProject, aoiPath, this);
    if (dlg.exec() == QDialog::Accepted) {
        // Reload project layers to show newly clipped layers
        m_consoleText->append(tr("[Clip] Reloading project layers..."));
        loadProjectLayers(m_currentProject);
        m_consoleText->append(tr("[Clip] Clipped layers have been added to the project."));
    }
}

void MainWindow::onNewFolder() {
    if (m_currentProject.isEmpty()) {
        QMessageBox::warning(this, tr("No Project"), 
            tr("Please open or create a project first."));
        return;
    }
    
    // Prompt user for folder name
    bool ok;
    QString folderName = QInputDialog::getText(this, tr("Create New Folder"),
        tr("Enter folder name:"), QLineEdit::Normal,
        tr("new_folder"), &ok);
    
    if (!ok || folderName.isEmpty()) {
        return;  // User cancelled or entered empty name
    }
    
    // Validate folder name (remove invalid characters)
    folderName = folderName.trimmed();
    folderName.replace(QRegularExpression("[<>:\"/\\\\|?*]"), "_");
    
    if (folderName.isEmpty()) {
        QMessageBox::warning(this, tr("Invalid Name"),
            tr("Folder name cannot be empty or contain only special characters."));
        return;
    }
    
    // Ask user where to create the folder (under rasters or vectors)
    QStringList options;
    options << "data/rasters" << "data/vectors" << "data";
    
    QString location = QInputDialog::getItem(this, tr("Select Location"),
        tr("Create folder under:"), options, 0, false, &ok);
    
    if (!ok) {
        return;  // User cancelled
    }
    
    // Create the full path
    QString fullPath = m_currentProject + "/" + location + "/" + folderName;
    
    QDir dir;
    if (dir.exists(fullPath)) {
        QMessageBox::warning(this, tr("Folder Exists"),
            tr("A folder with this name already exists:\n%1").arg(fullPath));
        return;
    }
    
    if (dir.mkpath(fullPath)) {
        m_consoleText->append(tr("[Folder] Created: %1/%2").arg(location).arg(folderName));
        QMessageBox::information(this, tr("Folder Created"),
            tr("Successfully created folder:\n%1/%2").arg(location).arg(folderName));
        
        // Reload layers to show new folder
        loadProjectLayers(m_currentProject);
    } else {
        m_consoleText->append(tr("[Folder] Failed to create: %1/%2").arg(location).arg(folderName));
        QMessageBox::critical(this, tr("Error"),
            tr("Failed to create folder:\n%1/%2").arg(location).arg(folderName));
    }
}

void MainWindow::onResetView() {
    if (m_mapWidget) {
        m_mapWidget->setCenter(40.7128, -74.0060);  // New York
        m_mapWidget->setZoom(3);
        m_consoleText->append(tr("[View] Map reset to default view."));
    }
}

void MainWindow::onToggle2D3D() {
    m_is3DMode = !m_is3DMode;
    
    if (m_is3DMode) {
        // Switch to 3D view
        m_viewStack->setCurrentWidget(m_terrain3DWidget);
        m_statusLabel->setText(tr("Mode: 3D Terrain"));
        m_consoleText->append(tr("[View] Switched to 3D terrain view"));
        
        // Load DEM if project is open
        if (!m_currentProject.isEmpty()) {
            load3DTerrain(m_currentProject);
        }
    } else {
        // Switch to 2D view
        m_viewStack->setCurrentWidget(m_mapWidget);
        m_statusLabel->setText(tr("Mode: 2D Map"));
        m_consoleText->append(tr("[View] Switched to 2D map view"));
    }
}

void MainWindow::onAbout() {
    QMessageBox::about(this, tr("About AGRS ZEUS"),
        tr("AGRS ZEUS - Pipeline Routing & Geospatial Analysis\n\n"
           "Artemis Global Research Solutions Inc.\n"
           "Version 0.1.0\n\n"
           "All geospatial operations are handled by AI."));
}

void MainWindow::onTunePIRL() {
    if (m_currentProject.isEmpty()) {
        QMessageBox::warning(this, tr("No Project"), 
            tr("Please open or create a project first."));
        return;
    }
    
    QString tunerPath = m_currentProject + "/PIRL/pirl_parameter_tuner";
    
    // Check if parameter tuner exists
    if (!QFile::exists(tunerPath)) {
        QMessageBox::critical(this, tr("Parameter Tuner Not Found"),
            tr("The PIRL parameter tuner executable was not found at:\n%1\n\n"
               "Please ensure the PIRL environment is set up correctly.").arg(tunerPath));
        return;
    }
    
    // Launch parameter tuner in project PIRL directory
    m_consoleText->append(tr("[PIRL] Launching parameter tuner..."));
    
    QProcess* tunerProcess = new QProcess(this);
    tunerProcess->setWorkingDirectory(m_currentProject + "/PIRL");
    tunerProcess->setProgram(tunerPath);
    
    // Connect signals for process feedback
    connect(tunerProcess, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            [this, tunerProcess](int exitCode, QProcess::ExitStatus exitStatus) {
        if (exitStatus == QProcess::NormalExit) {
            if (exitCode == 0) {
                m_consoleText->append(tr("[PIRL] Parameter tuner closed"));
            } else {
                m_consoleText->append(tr("[PIRL] Parameter tuner exited with code: %1").arg(exitCode));
            }
        } else {
            m_consoleText->append(tr("[PIRL] Parameter tuner crashed"));
        }
        tunerProcess->deleteLater();
    });
    
    connect(tunerProcess, &QProcess::errorOccurred, 
            [this, tunerProcess](QProcess::ProcessError error) {
        QString errorMsg;
        switch (error) {
            case QProcess::FailedToStart:
                errorMsg = tr("Failed to start parameter tuner. Check file permissions.");
                break;
            case QProcess::Crashed:
                errorMsg = tr("Parameter tuner crashed unexpectedly.");
                break;
            default:
                errorMsg = tr("Parameter tuner error: %1").arg(static_cast<int>(error));
                break;
        }
        m_consoleText->append(tr("[PIRL] Error: %1").arg(errorMsg));
        QMessageBox::critical(this, tr("Error"), errorMsg);
        tunerProcess->deleteLater();
    });
    
    // Start the parameter tuner
    tunerProcess->start();
    
    if (!tunerProcess->waitForStarted(3000)) {
        m_consoleText->append(tr("[PIRL] Failed to start parameter tuner"));
        QMessageBox::critical(this, tr("Error"), 
            tr("Failed to start the parameter tuner.\n\nMake sure it's executable:\nchmod +x %1").arg(tunerPath));
        tunerProcess->deleteLater();
    } else {
        m_consoleText->append(tr("[PIRL] Parameter tuner is running"));
    }
}

void MainWindow::onCoordinatesChanged(double lat, double lon) {
    m_coordsLabel->setText(tr("Coordinates: %1°N, %2°E").arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6));
}

void MainWindow::loadProjectLayers(const QString& projectDir) {
    m_consoleText->append(tr("[Layers] Scanning project data directories..."));
    
    // Clear existing layers
    m_layersTree->clear();
    
    // Clear overlays from map widget
    if (m_mapWidget) {
        m_mapWidget->clearOverlays();
    }
    
    // Add AOI layer (Area of Interest - red outline)
    QString aoiPath = findAOIFileInProject(projectDir);
    if (!aoiPath.isEmpty() && QFile::exists(aoiPath)) {
        QTreeWidgetItem* aoiItem = new QTreeWidgetItem(m_layersTree);
        QFileInfo aoiInfo(aoiPath);
        aoiItem->setText(0, "AOI (Area of Interest)");
        aoiItem->setIcon(0, style()->standardIcon(QStyle::SP_DialogYesButton));
        aoiItem->setCheckState(0, Qt::Checked);
        aoiItem->setData(0, Qt::UserRole, aoiPath);
        aoiItem->setToolTip(0, aoiInfo.absoluteFilePath());
        
        // Load AOI into map widget with special styling
        if (m_mapWidget) {
            if (m_mapWidget->addAOILayer(aoiPath)) {
                m_consoleText->append(tr("[Layers] Loaded AOI: %1").arg(aoiInfo.fileName()));
            } else {
                m_consoleText->append(tr("[Layers] Failed to load AOI: %1").arg(aoiInfo.fileName()));
            }
        }
    }
    
    // Load start and end point markers from project_aoi.json
    QString aoiMetaPath = projectDir + "/aoi/project_aoi.json";
    if (QFile::exists(aoiMetaPath)) {
        QFile metaFile(aoiMetaPath);
        if (metaFile.open(QIODevice::ReadOnly)) {
            QJsonDocument doc = QJsonDocument::fromJson(metaFile.readAll());
            metaFile.close();
            
            if (!doc.isNull() && doc.isObject()) {
                QJsonObject obj = doc.object();
                
                // Load start point
                if (obj.contains("start_point") && obj["start_point"].isObject()) {
                    QJsonObject startPt = obj["start_point"].toObject();
                    double startLat = startPt["latitude"].toDouble();
                    double startLon = startPt["longitude"].toDouble();
                    
                    if (startLat != 0.0 || startLon != 0.0) {  // Valid coordinates
                        QTreeWidgetItem* startItem = new QTreeWidgetItem(m_layersTree);
                        startItem->setText(0, QString("Start Point (%1°, %2°)")
                            .arg(startLat, 0, 'f', 4).arg(startLon, 0, 'f', 4));
                        startItem->setIcon(0, style()->standardIcon(QStyle::SP_DialogApplyButton));
                        startItem->setCheckState(0, Qt::Checked);
                        startItem->setData(0, Qt::UserRole, "__START_POINT__");
                        startItem->setToolTip(0, tr("Start Point: %1°N, %2°E")
                            .arg(startLat, 0, 'f', 6).arg(startLon, 0, 'f', 6));
                        
                        if (m_mapWidget) {
                            if (m_mapWidget->addStartPointMarker("__START_POINT__", startLat, startLon)) {
                                m_consoleText->append(tr("[Layers] Loaded Start Point: %1°, %2°")
                                    .arg(startLat, 0, 'f', 4).arg(startLon, 0, 'f', 4));
                            }
                        }
                    }
                }
                
                // Load end point
                if (obj.contains("end_point") && obj["end_point"].isObject()) {
                    QJsonObject endPt = obj["end_point"].toObject();
                    double endLat = endPt["latitude"].toDouble();
                    double endLon = endPt["longitude"].toDouble();
                    
                    if (endLat != 0.0 || endLon != 0.0) {  // Valid coordinates
                        QTreeWidgetItem* endItem = new QTreeWidgetItem(m_layersTree);
                        endItem->setText(0, QString("End Point (%1°, %2°)")
                            .arg(endLat, 0, 'f', 4).arg(endLon, 0, 'f', 4));
                        endItem->setIcon(0, style()->standardIcon(QStyle::SP_DialogCancelButton));
                        endItem->setCheckState(0, Qt::Checked);
                        endItem->setData(0, Qt::UserRole, "__END_POINT__");
                        endItem->setToolTip(0, tr("End Point: %1°N, %2°E")
                            .arg(endLat, 0, 'f', 6).arg(endLon, 0, 'f', 6));
                        
                        if (m_mapWidget) {
                            if (m_mapWidget->addEndPointMarker("__END_POINT__", endLat, endLon)) {
                                m_consoleText->append(tr("[Layers] Loaded End Point: %1°, %2°")
                                    .arg(endLat, 0, 'f', 4).arg(endLon, 0, 'f', 4));
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Add basemap layer (always after AOI)
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
            if (m_mapWidget) {
                if (m_mapWidget->addRasterLayer(fileInfo.absoluteFilePath())) {
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
                    if (m_mapWidget) {
                        if (m_mapWidget->addRasterLayer(fileInfo.absoluteFilePath())) {
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
            if (m_mapWidget) {
                if (m_mapWidget->addVectorLayer(fileInfo.absoluteFilePath())) {
                    m_consoleText->append(tr("[Layers] Loaded vector: %1").arg(fileInfo.fileName()));
                    
                    // Try to load style from JSON sidecar
                    QString jsonPath = fileInfo.absoluteFilePath() + ".json";
                    QFile jsonFile(jsonPath);
                    if (jsonFile.exists() && jsonFile.open(QIODevice::ReadOnly)) {
                        QJsonDocument doc = QJsonDocument::fromJson(jsonFile.readAll());
                        jsonFile.close();
                        
                        if (!doc.isNull() && doc.isObject()) {
                            QJsonObject metadata = doc.object();
                            if (metadata.contains("style") && metadata["style"].isObject()) {
                                VectorStyle style = VectorStyle::fromJson(metadata["style"].toObject());
                                m_mapWidget->setLayerStyle(fileInfo.absoluteFilePath(), style);
                                m_consoleText->append(tr("[Style] Loaded custom style for: %1").arg(fileInfo.fileName()));
                            }
                        }
                    }
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

void MainWindow::load3DTerrain(const QString& projectDir) {
    if (!m_terrain3DWidget) return;
    
    m_consoleText->append(tr("[3D] Loading terrain from project DEM..."));
    
    // Look for DEM files in rasters directory
    QDir rastersDir(projectDir + "/data/rasters");
    if (!rastersDir.exists()) {
        m_consoleText->append(tr("[3D] No rasters directory found"));
        return;
    }
    
    // Search for DEM files (common DEM naming patterns)
    QStringList demFilters;
    demFilters << "*dem*.tif" << "*dem*.tiff" << "*elevation*.tif" << "*dtm*.tif" << "*dsm*.tif" << "*tinitaly*.tif";
    QFileInfoList demFiles = rastersDir.entryInfoList(demFilters, QDir::Files);
    
    if (demFiles.isEmpty()) {
        m_consoleText->append(tr("[3D] No DEM files found. Looking in subdirectories..."));
        
        // Check subdirectories
        QFileInfoList subDirs = rastersDir.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot);
        for (const QFileInfo& dirInfo : subDirs) {
            QDir subDir(dirInfo.absoluteFilePath());
            QFileInfoList subDemFiles = subDir.entryInfoList(demFilters, QDir::Files);
            if (!subDemFiles.isEmpty()) {
                demFiles = subDemFiles;
                break;
            }
        }
    }
    
    if (demFiles.isEmpty()) {
        m_consoleText->append(tr("[3D] No DEM files found in project. 3D view will be empty."));
        return;
    }
    
    // Load the first DEM found
    QString demPath = demFiles.first().absoluteFilePath();
    m_consoleText->append(tr("[3D] Loading DEM: %1").arg(demFiles.first().fileName()));
    
    if (m_terrain3DWidget->loadDEM(demPath)) {
        m_consoleText->append(tr("[3D] Terrain loaded successfully"));
        
        // Load basemap texture by default
        m_terrain3DWidget->loadBasemapTexture("");
        m_consoleText->append(tr("[3D] Basemap texture loaded"));
        
        // Try to load imagery/raster textures from project
        QStringList imageryFilters;
        imageryFilters << "*.tif" << "*.tiff" << "*.jpg" << "*.jpeg" << "*.png";
        QFileInfoList imageryFiles = rastersDir.entryInfoList(imageryFilters, QDir::Files);
        
        // Load first non-DEM imagery file as texture
        for (const QFileInfo& imgFile : imageryFiles) {
            QString imgPath = imgFile.absoluteFilePath();
            // Skip if it's the DEM we already loaded
            if (imgPath != demPath && !imgFile.fileName().contains("dem", Qt::CaseInsensitive) &&
                !imgFile.fileName().contains("elevation", Qt::CaseInsensitive)) {
                m_consoleText->append(tr("[3D] Loading imagery texture: %1").arg(imgFile.fileName()));
                if (m_terrain3DWidget->loadImageryTexture(imgPath)) {
                    m_consoleText->append(tr("[3D] Imagery texture loaded successfully"));
                    break; // Only load one imagery for now
                }
            }
        }
    } else {
        m_consoleText->append(tr("[3D] Failed to load terrain"));
    }
}

void MainWindow::onLayerTreeContextMenu(const QPoint& pos) {
    // Get the item at the clicked position
    QTreeWidgetItem* item = m_layersTree->itemAt(pos);
    if (!item) {
        return;  // No item at this position
    }
    
    // Get the layer path from the item's user data
    QString layerPath = item->data(0, Qt::UserRole).toString();
    
    // Skip if this is a special layer (basemap, AOI, start/end points, or folder)
    if (layerPath.isEmpty() || 
        layerPath == "__BASEMAP__" || 
        layerPath == "__START_POINT__" || 
        layerPath == "__END_POINT__" ||
        !QFile::exists(layerPath)) {
        return;
    }
    
    // Check if this is a vector file
    QStringList vectorExtensions;
    vectorExtensions << "gpkg" << "shp" << "geojson" << "kml" << "kmz" << "gml";
    
    QFileInfo fileInfo(layerPath);
    QString ext = fileInfo.suffix().toLower();
    
    if (!vectorExtensions.contains(ext)) {
        return;  // Not a vector file
    }
    
    // Create context menu
    QMenu contextMenu(this);
    
    QAction* openAttrTableAction = contextMenu.addAction(
        style()->standardIcon(QStyle::SP_FileDialogDetailedView),
        tr("Open Attribute Table"));
    
    QAction* customizeStyleAction = contextMenu.addAction(
        style()->standardIcon(QStyle::SP_DialogResetButton),
        tr("Customize Style"));
    
    // Execute context menu at the global position
    QAction* selectedAction = contextMenu.exec(m_layersTree->mapToGlobal(pos));
    
    if (selectedAction == openAttrTableAction) {
        QString layerName = item->text(0);
        onOpenAttributeTable(layerPath, layerName);
    } else if (selectedAction == customizeStyleAction) {
        QString layerName = item->text(0);
        onCustomizeStyle(layerPath, layerName);
    }
}

void MainWindow::onOpenAttributeTable(const QString& layerPath, const QString& layerName) {
    m_consoleText->append(tr("[Attributes] Opening attribute table for: %1").arg(layerName));
    
    // Create and show the attribute table dialog
    AttributeTableDialog* dialog = new AttributeTableDialog(layerPath, layerName, this);
    dialog->setAttribute(Qt::WA_DeleteOnClose);  // Auto-delete when closed
    
    // Connect zoom to feature signal
    connect(dialog, &AttributeTableDialog::zoomToFeature, this, &MainWindow::onZoomToFeature);
    
    dialog->show();  // Use show() instead of exec() to make it non-modal
    
    m_consoleText->append(tr("[Attributes] Attribute table opened for: %1").arg(layerName));
}

void MainWindow::onZoomToFeature(const QString& layerPath, int fid) {
    m_consoleText->append(tr("[Zoom] Zooming to feature FID %1 in layer: %2").arg(fid).arg(QFileInfo(layerPath).fileName()));
    
    // Open the vector dataset
    GDALDataset* ds = (GDALDataset*)GDALOpenEx(layerPath.toUtf8().constData(),
        GDAL_OF_VECTOR | GDAL_OF_READONLY, nullptr, nullptr, nullptr);
    
    if (!ds) {
        m_consoleText->append(tr("[Zoom] Error: Failed to open layer"));
        return;
    }
    
    // Get the first layer
    OGRLayer* layer = ds->GetLayer(0);
    if (!layer) {
        m_consoleText->append(tr("[Zoom] Error: No layers found"));
        GDALClose(ds);
        return;
    }
    
    // Get the feature by FID
    OGRFeature* feat = layer->GetFeature(fid);
    if (!feat) {
        m_consoleText->append(tr("[Zoom] Error: Feature FID %1 not found").arg(fid));
        GDALClose(ds);
        return;
    }
    
    // Get the geometry
    OGRGeometry* geom = feat->GetGeometryRef();
    if (!geom) {
        m_consoleText->append(tr("[Zoom] Error: Feature has no geometry"));
        OGRFeature::DestroyFeature(feat);
        GDALClose(ds);
        return;
    }
    
    // Get the envelope (bounding box) of the geometry
    OGREnvelope envelope;
    geom->getEnvelope(&envelope);
    
    // Transform to WGS84 if needed
    OGRSpatialReference* sourceSRS = layer->GetSpatialRef();
    if (sourceSRS) {
        OGRSpatialReference wgs84;
        wgs84.SetWellKnownGeogCS("WGS84");
        wgs84.SetAxisMappingStrategy(OAMS_TRADITIONAL_GIS_ORDER);
        
        if (!sourceSRS->IsSame(&wgs84)) {
            OGRCoordinateTransformation* coordTrans = OGRCreateCoordinateTransformation(sourceSRS, &wgs84);
            if (coordTrans) {
                // Transform the envelope corners
                double minX = envelope.MinX, minY = envelope.MinY;
                double maxX = envelope.MaxX, maxY = envelope.MaxY;
                
                if (coordTrans->Transform(1, &minX, &minY) && 
                    coordTrans->Transform(1, &maxX, &maxY)) {
                    envelope.MinX = minX;
                    envelope.MinY = minY;
                    envelope.MaxX = maxX;
                    envelope.MaxY = maxY;
                }
                
                OCTDestroyCoordinateTransformation(coordTrans);
            }
        }
    }
    
    // Calculate center and zoom level
    double centerLat = (envelope.MinY + envelope.MaxY) / 2.0;
    double centerLon = (envelope.MinX + envelope.MaxX) / 2.0;
    
    // Calculate appropriate zoom level based on extent
    double latExtent = envelope.MaxY - envelope.MinY;
    double lonExtent = envelope.MaxX - envelope.MinX;
    double maxExtent = std::max(latExtent, lonExtent);
    
    // Determine zoom level (simplified calculation)
    // Zoom levels: smaller extent = higher zoom
    int zoomLevel = 15; // Default for small features
    if (maxExtent > 10.0) {
        zoomLevel = 4;  // Continental scale
    } else if (maxExtent > 1.0) {
        zoomLevel = 8;  // Regional scale
    } else if (maxExtent > 0.1) {
        zoomLevel = 11; // City scale
    } else if (maxExtent > 0.01) {
        zoomLevel = 13; // Neighborhood scale
    } else if (maxExtent > 0.001) {
        zoomLevel = 15; // Street scale
    } else {
        zoomLevel = 17; // Building scale
    }
    
    // Apply zoom to map widget (only in 2D mode)
    if (m_mapWidget && !m_is3DMode) {
        m_mapWidget->setCenter(centerLat, centerLon);
        m_mapWidget->setZoom(zoomLevel);
        
        // Highlight the feature in cyan
        m_mapWidget->highlightFeature(layerPath, fid);
        
        m_consoleText->append(tr("[Zoom] Zoomed to feature at (%.6f, %.6f), zoom level %3")
            .arg(centerLat).arg(centerLon).arg(zoomLevel));
    } else if (m_is3DMode) {
        m_consoleText->append(tr("[Zoom] Note: Zoom to feature only works in 2D mode. Switch to 2D view first."));
    }
    
    // Clean up
    OGRFeature::DestroyFeature(feat);
    GDALClose(ds);
}

void MainWindow::onCustomizeStyle(const QString& layerPath, const QString& layerName) {
    m_consoleText->append(tr("[Style] Opening style customization for: %1").arg(layerName));
    
    // Determine geometry type
    QString geometryType = "Unknown";
    GDALDataset* ds = (GDALDataset*)GDALOpenEx(layerPath.toUtf8().constData(),
        GDAL_OF_VECTOR | GDAL_OF_READONLY, nullptr, nullptr, nullptr);
    
    if (ds) {
        OGRLayer* layer = ds->GetLayer(0);
        if (layer) {
            OGRFeatureDefn* layerDefn = layer->GetLayerDefn();
            OGRwkbGeometryType geomType = layerDefn->GetGeomType();
            OGRwkbGeometryType flatType = wkbFlatten(geomType);
            
            switch (flatType) {
                case wkbPoint:
                case wkbMultiPoint:
                    geometryType = "Point";
                    break;
                case wkbLineString:
                case wkbMultiLineString:
                    geometryType = "LineString";
                    break;
                case wkbPolygon:
                case wkbMultiPolygon:
                    geometryType = "Polygon";
                    break;
                default:
                    geometryType = "Mixed";
                    break;
            }
        }
        GDALClose(ds);
    }
    
    // Get current style or create default
    VectorStyle currentStyle;
    if (m_mapWidget && m_mapWidget->hasCustomStyle(layerPath)) {
        currentStyle = m_mapWidget->getLayerStyle(layerPath);
    }
    
    // Open style dialog
    VectorStyleDialog* dialog = new VectorStyleDialog(layerName, geometryType, currentStyle, this);
    
    if (dialog->exec() == QDialog::Accepted) {
        VectorStyle newStyle = dialog->getStyle();
        
        // Apply style to map widget
        if (m_mapWidget) {
            m_mapWidget->setLayerStyle(layerPath, newStyle);
        }
        
        // Save style to vector's JSON sidecar
        QString jsonPath = layerPath + ".json";
        QFile jsonFile(jsonPath);
        
        QJsonObject metadata;
        
        // Load existing metadata if file exists
        if (jsonFile.exists() && jsonFile.open(QIODevice::ReadOnly)) {
            QJsonDocument doc = QJsonDocument::fromJson(jsonFile.readAll());
            if (!doc.isNull() && doc.isObject()) {
                metadata = doc.object();
            }
            jsonFile.close();
        }
        
        // Add/update style section
        metadata["style"] = newStyle.toJson();
        
        // Write back to file
        if (jsonFile.open(QIODevice::WriteOnly)) {
            QJsonDocument doc(metadata);
            jsonFile.write(doc.toJson(QJsonDocument::Indented));
            jsonFile.close();
            m_consoleText->append(tr("[Style] Style saved to: %1").arg(QFileInfo(jsonPath).fileName()));
        } else {
            m_consoleText->append(tr("[Style] Warning: Could not save style to JSON sidecar"));
        }
        
        m_consoleText->append(tr("[Style] Custom style applied to: %1").arg(layerName));
    } else {
        m_consoleText->append(tr("[Style] Style customization cancelled for: %1").arg(layerName));
    }
    
    delete dialog;
}

void MainWindow::onFeatureClicked(double lat, double lon) {
    std::cout << "[MainWindow] Feature clicked at: " << lat << ", " << lon << "\n";
    
    if (!m_mapWidget) return;
    
    // Query vector features at clicked point
    QVector<MapWidget::VectorFeature> vectorFeatures = m_mapWidget->queryVectorsAtPoint(lat, lon, 10.0);
    
    if (vectorFeatures.isEmpty()) {
        std::cout << "[MainWindow] No features found at click location\n";
        return;
    }
    
    // Convert MapWidget::VectorFeature to IdentifiedFeature for dialog
    QList<IdentifiedFeature> identifiedFeatures;
    
    for (const auto& vf : vectorFeatures) {
        IdentifiedFeature feature;
        feature.layerName = vf.layerName;
        feature.layerPath = vf.filePath;
        feature.fid = vf.featureId;
        feature.geometryType = vf.geometryType;
        
        // Add basic geometry info
        feature.geometryInfo["CRS"] = vf.crs;
        
        // Convert attributes to QVariantMap
        for (auto it = vf.attributes.begin(); it != vf.attributes.end(); ++it) {
            feature.attributes[it.key()] = QVariant(it.value());
        }
        
        // Maintain field order (FID first, then alphabetical)
        feature.fieldOrder.append("FID");
        feature.attributes["FID"] = QString::number(vf.featureId);
        
        QStringList fieldNames = vf.attributes.keys();
        fieldNames.sort();
        for (const QString& fieldName : fieldNames) {
            feature.fieldOrder.append(fieldName);
        }
        
        // Add geometry-specific calculations
        // TODO: Calculate area/length/coordinates using GDAL
        
        identifiedFeatures.append(feature);
    }
    
    // Create and show feature identify dialog
    FeatureIdentifyDialog* dialog = new FeatureIdentifyDialog(this);
    dialog->setFeatures(identifiedFeatures);
    
    // Connect dialog signals
    connect(dialog, &FeatureIdentifyDialog::zoomToFeature, this, &MainWindow::onZoomToFeature);
    connect(dialog, &FeatureIdentifyDialog::flashFeature, this, &MainWindow::onFlashFeature);
    
    dialog->show();
    
    m_consoleText->append(tr("[Info] Identified %1 feature(s) at clicked location").arg(identifiedFeatures.size()));
}

void MainWindow::onFlashFeature(const QString& layerPath, int fid) {
    std::cout << "[MainWindow] Flashing feature: " << layerPath.toStdString() << " FID=" << fid << "\n";
    
    if (!m_mapWidget) return;
    
    // Highlight the feature briefly
    m_mapWidget->highlightFeature(layerPath, fid);
    
    // Clear highlight after 2 seconds
    QTimer::singleShot(2000, this, [this]() {
        if (m_mapWidget) {
            m_mapWidget->clearHighlight();
        }
    });
    
    m_consoleText->append(tr("[Map] Flashing feature (FID: %1)").arg(fid));
}

void MainWindow::onMoreInfoRequested(double lat, double lon) {
    std::cout << "[MainWindow] More Info requested for: " << lat << ", " << lon << "\n";
    m_consoleText->append(tr("[AI] Researching location: %1°N, %2°E...").arg(lat, 0, 'f', 4).arg(lon, 0, 'f', 4));
    
    // Create a temporary output file for the Perplexity search result
    QString tempOutputPath = QDir::temp().filePath(QString("perplexity_search_%1_%2.md")
                                                       .arg(QDateTime::currentMSecsSinceEpoch())
                                                       .arg(QRandomGenerator::global()->bounded(10000)));
    
    // Construct query for geographic intelligence about this location
    QString query = QString("Provide detailed geographic intelligence about the location at coordinates %1°N, %2°E. "
                           "Include information about: "
                           "1) What is this place (city, region, landmark)? "
                           "2) Notable geographic features, terrain, or topography "
                           "3) Climate and environmental characteristics "
                           "4) Economic activities and land use in this area "
                           "5) Any significant infrastructure, resources, or points of interest "
                           "6) Demographic and cultural context if applicable. "
                           "Be specific and factual.")
                       .arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6);
    
    // Build parameters for perplexity_search tool
    QVariantMap params;
    params["query"] = query;
    params["location"] = QString("%1,%2").arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6);
    params["model"] = "sonar-reasoning";  // Use the most advanced Perplexity model
    params["max_tokens"] = 4000;
    params["temperature"] = 0.2;
    params["recency"] = "month";
    params["format"] = "markdown";
    params["output"] = tempOutputPath;
    params["no_citations"] = false;
    
    // Connect to operationCompleted signal to handle the result
    connect(m_backend, &BackendInterface::operationCompleted, this,
            [this, lat, lon, tempOutputPath](const QString& toolName, const QString& message) {
        if (toolName == "perplexity_search") {
            // Read the output file
            QFile resultFile(tempOutputPath);
            QString content;
            if (resultFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
                QTextStream in(&resultFile);
                content = in.readAll();
                resultFile.close();
            } else {
                content = "Error: Could not read Perplexity search results.";
            }
            
            // Create and show the chat dialog with initial content
            PerplexityChatDialog* chatDialog = new PerplexityChatDialog(
                m_backend, lat, lon, content, this
            );
            chatDialog->setAttribute(Qt::WA_DeleteOnClose);
            chatDialog->show();
            
            m_consoleText->append(tr("[AI] Research complete. Chat dialog opened."));
            
            // Clean up temp file
            QFile::remove(tempOutputPath);
            
            // Disconnect this specific lambda
            disconnect(m_backend, &BackendInterface::operationCompleted, this, nullptr);
        }
    }, Qt::UniqueConnection);
    
    // Connect to operationFailed signal
    connect(m_backend, &BackendInterface::operationFailed, this,
            [this, tempOutputPath](const QString& toolName, const QString& error) {
        if (toolName == "perplexity_search") {
            QMessageBox::warning(this, tr("AI Research Failed"),
                               tr("Failed to fetch AI research:\n%1").arg(error));
            m_consoleText->append(tr("[AI] Research failed: %1").arg(error));
            
            // Clean up temp file
            QFile::remove(tempOutputPath);
            
            // Disconnect this specific lambda
            disconnect(m_backend, &BackendInterface::operationFailed, this, nullptr);
        }
    }, Qt::UniqueConnection);
    
    // Run the Perplexity search in background
    m_backend->runTool("perplexity_search", params);
}

} // namespace gui
} // namespace agrs





