#include "agrs_zeus/gui/MainWindow.h"
#include "agrs_zeus/gui/MapWidget.h"
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
    m_consoleText->setPlainText(tr("AGRS ZEUS Console\n"));
    m_consoleDock->setWidget(m_consoleText);
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
    
    m_currentProject = dir;
    m_consoleText->append(tr("[Open Project] %1").arg(dir));
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

} // namespace gui
} // namespace agrs


