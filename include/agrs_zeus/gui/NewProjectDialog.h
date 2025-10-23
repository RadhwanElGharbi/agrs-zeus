#ifndef AGRS_GUI_NEWPROJECTDIALOG_H
#define AGRS_GUI_NEWPROJECTDIALOG_H

#include <QWizard>
#include <QWizardPage>
#include <QLineEdit>
#include <QComboBox>
#include <QDoubleSpinBox>
#include <QPushButton>
#include <QLabel>
#include <QString>

namespace agrs {
namespace gui {

class MapWidget;

/**
 * @brief Simple project data structure
 */
struct ProjectData {
    QString projectName;
    QString aoiFilePath;
    QString projectPath;
    int epsgCode;
    QString crsName;
    
    struct Endpoint {
        double lat = 0.0;
        double lon = 0.0;
    };
    Endpoint startPoint;
    Endpoint endPoint;
    
    QString pipelineType;
    QString material;
    double diameter;
    
    struct AOIMetadata {
        double areaKm2 = 0.0;
        double minX = 0.0, minY = 0.0, maxX = 0.0, maxY = 0.0;
    };
    AOIMetadata aoiMetadata;
};

/**
 * @brief Page 1: Project Info & AOI
 */
class ProjectInfoPage : public QWizardPage {
    Q_OBJECT
public:
    explicit ProjectInfoPage(MapWidget* mapWidget, QWidget* parent = nullptr);
    bool isComplete() const override;
    
private slots:
    void onBrowseAOI();
    void onBrowseProjectPath();
    void onSelectCRS();
    
private:
    MapWidget* m_mapWidget;
    QLineEdit* m_projectNameEdit;
    QLineEdit* m_aoiFileEdit;
    QLineEdit* m_projectPathEdit;
    QLabel* m_crsLabel;
    QLineEdit* m_epsgHidden;
    QLineEdit* m_crsNameHidden;
};

/**
 * @brief Page 2: Route Endpoints
 */
class RouteEndpointsPage : public QWizardPage {
    Q_OBJECT
public:
    explicit RouteEndpointsPage(MapWidget* mapWidget, QWidget* parent = nullptr);
    bool isComplete() const override;
    
private:
    MapWidget* m_mapWidget;
    QDoubleSpinBox* m_startLatSpin;
    QDoubleSpinBox* m_startLonSpin;
    QDoubleSpinBox* m_endLatSpin;
    QDoubleSpinBox* m_endLonSpin;
};

/**
 * @brief Page 3: Pipeline Specs
 */
class PipelineSpecsPage : public QWizardPage {
    Q_OBJECT
public:
    explicit PipelineSpecsPage(QWidget* parent = nullptr);
    bool isComplete() const override;
    
private:
    QComboBox* m_pipelineTypeCombo;
    QComboBox* m_materialCombo;
    QDoubleSpinBox* m_diameterSpin;
};

/**
 * @brief Simple New Project Wizard
 */
class NewProjectDialog : public QWizard {
    Q_OBJECT
public:
    explicit NewProjectDialog(MapWidget* mapWidget, QWidget* parent = nullptr);
    ProjectData getProjectData() const;
    
protected:
    void accept() override;
    
private:
    MapWidget* m_mapWidget;
    ProjectInfoPage* m_projectInfoPage;
    RouteEndpointsPage* m_routeEndpointsPage;
    PipelineSpecsPage* m_pipelineSpecsPage;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_NEWPROJECTDIALOG_H



