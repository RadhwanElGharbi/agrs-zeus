#ifndef AGRS_GUI_MAINWINDOW_H
#define AGRS_GUI_MAINWINDOW_H

#include <QMainWindow>
#include <QDockWidget>
#include <QTreeWidget>
#include <QTextEdit>
#include <QToolBar>
#include <QMenuBar>
#include <QStatusBar>
#include <QLabel>
#include <QActionGroup>
#include <QTreeView>
#include <QFileSystemModel>
#include <QTabWidget>
#include "agrs_zeus/gui/ProjectSetupWizard.h"
#include "agrs_zeus/gui/TerminalWidget.h"

class QStackedWidget;

namespace agrs {
namespace gui {

class MapWidget;
class Terrain3DWidget;
class BackendInterface;

/**
 * @brief Main window for AGRS ZEUS GUI application
 * 
 * Provides professional GIS interface with:
 * - 3D viewer (center)
 * - Dockable panels (layers, properties, console)
 * - Contextual toolbars
 * - Project management
 */
class MainWindow : public QMainWindow {
    Q_OBJECT
    
public:
    explicit MainWindow(QWidget* parent = nullptr);
    ~MainWindow() override;
    
private slots:
    // File menu
    void onNewProject();
    void onOpenProject();
    void onSaveProject();
    void onSaveProjectAs();
    void onExit();
    
    // Project menu
    void onProjectSettings();
    void onDataAvailability();
    void onClipToAOI();
    void onNewFolder();
    void onTunePIRL();
    
    // All geospatial operations handled by Cursor CLI
    
    // View menu
    void onResetView();
    void onToggle2D3D();
    
    // Help menu
    void onAbout();
    
    // Map viewer signals
    void onCoordinatesChanged(double lat, double lon);
    void onFeatureClicked(double lat, double lon);
    void onMoreInfoRequested(double lat, double lon);
    
    // Layer tree context menu
    void onLayerTreeContextMenu(const QPoint& pos);
    void onOpenAttributeTable(const QString& layerPath, const QString& layerName);
    void onCustomizeStyle(const QString& layerPath, const QString& layerName);
    void onZoomToFeature(const QString& layerPath, int fid);
    void onFlashFeature(const QString& layerPath, int fid);
    
private:
    void createActions();
    void createMenus();
    void createToolbars();
    void createDockWidgets();
    void createStatusBar();
    void setupConnections();
    bool copyDirectoryRecursively(const QString& srcPath, const QString& dstPath);
    QString findAOIFileInProject(const QString& projectDir) const;
    void loadProjectLayers(const QString& projectDir);
    void load3DTerrain(const QString& projectDir);
    
    // Central widget - stacked 2D/3D views
    QStackedWidget* m_viewStack;
    MapWidget* m_mapWidget;
    Terrain3DWidget* m_terrain3DWidget;
    bool m_is3DMode{false};
    
    // Dockable panels
    QDockWidget* m_layersDock;
    QTreeWidget* m_layersTree;
    
    QDockWidget* m_propertiesDock;
    QTextEdit* m_propertiesText;
    
    QDockWidget* m_consoleDock;
    QTabWidget* m_consoleTabWidget;
    QTextEdit* m_consoleText;
    TerminalWidget* m_terminalWidget;
    // Catalog pane
    QDockWidget* m_catalogDock;
    QTreeView* m_catalogTree;
    QFileSystemModel* m_catalogModel;
    
    // Toolbars
    QToolBar* m_fileToolbar;
    QToolBar* m_dataToolbar;
    QToolBar* m_viewToolbar;
    QToolBar* m_pirlToolbar;
    QAction* m_tuneAction;
    
    // Status bar
    QLabel* m_coordsLabel;
    QLabel* m_statusLabel;
    
    // Backend integration
    BackendInterface* m_backend;
    
    // Current project
    QString m_currentProject;
    
    // Pending Perplexity output path and coordinates
    QString m_pendingPerplexityPath;
    double m_pendingPerplexityLat{0.0};
    double m_pendingPerplexityLon{0.0};
    
    // Pending dataset availability check
    QString m_pendingDatasetCheckProject;

public:
    // Public accessor for Terminal output
    TerminalWidget* terminalWidget() const { return m_terminalWidget; }
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_MAINWINDOW_H










