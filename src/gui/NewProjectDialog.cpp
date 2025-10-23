#include "agrs_zeus/gui/NewProjectDialog.h"
#include "agrs_zeus/gui/MapWidget.h"
#include "agrs_zeus/gui/CRSSelectorDialog.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGroupBox>
#include <QFileDialog>
#include <QMessageBox>
#include <QRegularExpression>
#include <QFileInfo>

namespace agrs {
namespace gui {

// ============================================================================
// PROJECT INFO PAGE
// ============================================================================

ProjectInfoPage::ProjectInfoPage(MapWidget* mapWidget, QWidget* parent)
    : QWizardPage(parent)
    , m_mapWidget(mapWidget)
{
    setTitle("Project Information");
    setSubTitle("Enter basic project information and select the Area of Interest (AOI)");
    
    auto* layout = new QVBoxLayout(this);
    
    // Project Information Group
    auto* projectGroup = new QGroupBox("Project Information", this);
    auto* projectLayout = new QFormLayout();
    projectLayout->setRowWrapPolicy(QFormLayout::DontWrapRows);
    projectLayout->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    projectLayout->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    projectLayout->setHorizontalSpacing(12);
    projectLayout->setVerticalSpacing(10);
    
    m_projectNameEdit = new QLineEdit(this);
    m_projectNameEdit->setPlaceholderText("Enter project name (e.g., SAIPEM_Pipeline_Demo)");
    registerField("projectName*", m_projectNameEdit);
    
    projectLayout->addRow("Project Name*:", m_projectNameEdit);
    projectGroup->setLayout(projectLayout);
    layout->addWidget(projectGroup);
    
    // AOI Group
    auto* aoiGroup = new QGroupBox("Area of Interest (AOI)", this);
    auto* aoiLayout = new QFormLayout();
    aoiLayout->setRowWrapPolicy(QFormLayout::DontWrapRows);
    aoiLayout->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    aoiLayout->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    aoiLayout->setHorizontalSpacing(12);
    aoiLayout->setVerticalSpacing(10);
    
    m_aoiFileEdit = new QLineEdit(this);
    m_aoiFileEdit->setPlaceholderText("Select KMZ, GeoJSON, SHP, or GPKG file...");
    m_aoiFileEdit->setReadOnly(true);
    registerField("aoiFilePath*", m_aoiFileEdit);
    
    auto* aoiBrowseBtn = new QPushButton("Browse...", this);
    connect(aoiBrowseBtn, &QPushButton::clicked, this, &ProjectInfoPage::onBrowseAOI);
    
    auto* aoiRow = new QWidget(this);
    auto* aoiRowLayout = new QHBoxLayout(aoiRow);
    aoiRowLayout->setContentsMargins(0,0,0,0);
    aoiRowLayout->setSpacing(8);
    aoiRowLayout->addWidget(m_aoiFileEdit, 1);
    aoiRowLayout->addWidget(aoiBrowseBtn, 0);
    
    aoiLayout->addRow("AOI File*:", aoiRow);
    aoiGroup->setLayout(aoiLayout);
    layout->addWidget(aoiGroup);
    
    // Project Location Group
    auto* locationGroup = new QGroupBox("Project Location", this);
    auto* locationLayout = new QFormLayout();
    locationLayout->setRowWrapPolicy(QFormLayout::DontWrapRows);
    locationLayout->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    locationLayout->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    locationLayout->setHorizontalSpacing(12);
    locationLayout->setVerticalSpacing(10);
    
    m_projectPathEdit = new QLineEdit("/opt/agrs/Projects", this);
    registerField("projectPath*", m_projectPathEdit);
    
    auto* pathBrowseBtn = new QPushButton("Browse...", this);
    connect(pathBrowseBtn, &QPushButton::clicked, this, &ProjectInfoPage::onBrowseProjectPath);
    
    auto* pathRow = new QWidget(this);
    auto* pathRowLayout = new QHBoxLayout(pathRow);
    pathRowLayout->setContentsMargins(0,0,0,0);
    pathRowLayout->setSpacing(8);
    pathRowLayout->addWidget(m_projectPathEdit, 1);
    pathRowLayout->addWidget(pathBrowseBtn, 0);
    
    locationLayout->addRow("Project Path*:", pathRow);
    
    // CRS Selection
    m_crsLabel = new QLabel("(none)", this);
    m_crsLabel->setFrameStyle(QFrame::Panel | QFrame::Sunken);
    m_crsLabel->setMinimumWidth(200);
    
    auto* crsSelectBtn = new QPushButton("Select CRS...", this);
    connect(crsSelectBtn, &QPushButton::clicked, this, &ProjectInfoPage::onSelectCRS);
    
    auto* crsRow = new QWidget(this);
    auto* crsRowLayout = new QHBoxLayout(crsRow);
    crsRowLayout->setContentsMargins(0,0,0,0);
    crsRowLayout->setSpacing(8);
    crsRowLayout->addWidget(m_crsLabel, 1);
    crsRowLayout->addWidget(crsSelectBtn, 0);
    
    locationLayout->addRow("CRS*:", crsRow);
    
    // Hidden fields for wizard field system
    m_epsgHidden = new QLineEdit(this);
    m_epsgHidden->setVisible(false);
    registerField("epsgCode", m_epsgHidden);
    
    m_crsNameHidden = new QLineEdit(this);
    m_crsNameHidden->setVisible(false);
    registerField("crsName", m_crsNameHidden);
    
    locationGroup->setLayout(locationLayout);
    layout->addWidget(locationGroup);
    
    layout->addStretch();
}

bool ProjectInfoPage::isComplete() const {
    return !m_projectNameEdit->text().trimmed().isEmpty() &&
           !m_aoiFileEdit->text().isEmpty() &&
           !m_projectPathEdit->text().isEmpty() &&
           !m_epsgHidden->text().isEmpty();
}

void ProjectInfoPage::onBrowseAOI() {
    QString fileName = QFileDialog::getOpenFileName(
        this,
        "Select AOI File",
        QString(),
        "Geospatial Files (*.kmz *.kml *.geojson *.shp *.gpkg);;All Files (*)"
    );
    
    if (!fileName.isEmpty()) {
        m_aoiFileEdit->setText(fileName);
        emit completeChanged();
    }
}

void ProjectInfoPage::onBrowseProjectPath() {
    QString dir = QFileDialog::getExistingDirectory(
        this,
        "Select Project Directory",
        m_projectPathEdit->text()
    );
    
    if (!dir.isEmpty()) {
        m_projectPathEdit->setText(dir);
    }
}

void ProjectInfoPage::onSelectCRS() {
    CRSSelectorDialog dlg(this);
    if (dlg.exec() == QDialog::Accepted) {
        int epsg = dlg.selectedEpsg();
        QString name = dlg.selectedName();
        m_crsLabel->setText(QString("%1 (EPSG:%2)").arg(name).arg(epsg));
        m_epsgHidden->setText(QString::number(epsg));
        m_crsNameHidden->setText(name);
        emit completeChanged();
    }
}

// ============================================================================
// ROUTE ENDPOINTS PAGE
// ============================================================================

RouteEndpointsPage::RouteEndpointsPage(MapWidget* mapWidget, QWidget* parent)
    : QWizardPage(parent)
    , m_mapWidget(mapWidget)
{
    setTitle("Pipeline Route Endpoints");
    setSubTitle("Define the start and end points of the pipeline route");
    
    auto* layout = new QVBoxLayout(this);
    
    // Start Point Group
    auto* startGroup = new QGroupBox("Start Point", this);
    auto* startLayout = new QFormLayout();
    startLayout->setRowWrapPolicy(QFormLayout::DontWrapRows);
    startLayout->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    startLayout->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    startLayout->setHorizontalSpacing(12);
    startLayout->setVerticalSpacing(10);
    
    m_startLatSpin = new QDoubleSpinBox(this);
    m_startLatSpin->setRange(-90.0, 90.0);
    m_startLatSpin->setDecimals(6);
    m_startLatSpin->setSuffix(" °");
    m_startLatSpin->setValue(0.0);
    registerField("startLat", m_startLatSpin);
    
    m_startLonSpin = new QDoubleSpinBox(this);
    m_startLonSpin->setRange(-180.0, 180.0);
    m_startLonSpin->setDecimals(6);
    m_startLonSpin->setSuffix(" °");
    m_startLonSpin->setValue(0.0);
    registerField("startLon", m_startLonSpin);
    
    startLayout->addRow("Latitude*:", m_startLatSpin);
    startLayout->addRow("Longitude*:", m_startLonSpin);
    startGroup->setLayout(startLayout);
    layout->addWidget(startGroup);
    
    // End Point Group
    auto* endGroup = new QGroupBox("End Point", this);
    auto* endLayout = new QFormLayout();
    endLayout->setRowWrapPolicy(QFormLayout::DontWrapRows);
    endLayout->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    endLayout->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    endLayout->setHorizontalSpacing(12);
    endLayout->setVerticalSpacing(10);
    
    m_endLatSpin = new QDoubleSpinBox(this);
    m_endLatSpin->setRange(-90.0, 90.0);
    m_endLatSpin->setDecimals(6);
    m_endLatSpin->setSuffix(" °");
    m_endLatSpin->setValue(0.0);
    registerField("endLat", m_endLatSpin);
    
    m_endLonSpin = new QDoubleSpinBox(this);
    m_endLonSpin->setRange(-180.0, 180.0);
    m_endLonSpin->setDecimals(6);
    m_endLonSpin->setSuffix(" °");
    m_endLonSpin->setValue(0.0);
    registerField("endLon", m_endLonSpin);
    
    endLayout->addRow("Latitude*:", m_endLatSpin);
    endLayout->addRow("Longitude*:", m_endLonSpin);
    endGroup->setLayout(endLayout);
    layout->addWidget(endGroup);
    
    layout->addStretch();
}

bool RouteEndpointsPage::isComplete() const {
    return (m_startLatSpin->value() != 0.0 || m_startLonSpin->value() != 0.0) &&
           (m_endLatSpin->value() != 0.0 || m_endLonSpin->value() != 0.0);
}

// ============================================================================
// PIPELINE SPECS PAGE
// ============================================================================

PipelineSpecsPage::PipelineSpecsPage(QWidget* parent)
    : QWizardPage(parent)
{
    setTitle("Pipeline Specifications");
    setSubTitle("Enter basic pipeline specifications");
    
    auto* layout = new QVBoxLayout(this);
    
    auto* specsGroup = new QGroupBox("Pipeline Specifications", this);
    auto* specsLayout = new QFormLayout();
    specsLayout->setRowWrapPolicy(QFormLayout::DontWrapRows);
    specsLayout->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    specsLayout->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    specsLayout->setHorizontalSpacing(12);
    specsLayout->setVerticalSpacing(10);
    
    m_pipelineTypeCombo = new QComboBox(this);
    m_pipelineTypeCombo->addItems({"Gas", "Oil", "Water", "Condensate", "Mixed", "Other"});
    registerField("pipelineType", m_pipelineTypeCombo, "currentText");
    
    m_materialCombo = new QComboBox(this);
    m_materialCombo->addItems({"Carbon Steel", "Stainless Steel", "HDPE", "PVC", "Fiberglass", "Other"});
    registerField("material", m_materialCombo, "currentText");
    
    m_diameterSpin = new QDoubleSpinBox(this);
    m_diameterSpin->setRange(0.0, 10000.0);
    m_diameterSpin->setDecimals(2);
    m_diameterSpin->setSuffix(" mm");
    m_diameterSpin->setValue(500.0);
    registerField("diameter", m_diameterSpin);
    
    specsLayout->addRow("Type*:", m_pipelineTypeCombo);
    specsLayout->addRow("Material*:", m_materialCombo);
    specsLayout->addRow("Diameter*:", m_diameterSpin);
    
    specsGroup->setLayout(specsLayout);
    layout->addWidget(specsGroup);
    
    layout->addStretch();
}

bool PipelineSpecsPage::isComplete() const {
    return m_diameterSpin->value() > 0.0;
}

// ============================================================================
// MAIN WIZARD DIALOG
// ============================================================================

NewProjectDialog::NewProjectDialog(MapWidget* mapWidget, QWidget* parent)
    : QWizard(parent)
    , m_mapWidget(mapWidget)
{
    setWindowTitle("New Pipeline Routing Project");
    setWizardStyle(QWizard::ModernStyle);
    setOption(QWizard::HaveHelpButton, false);
    setMinimumSize(700, 500);
    
    m_projectInfoPage = new ProjectInfoPage(mapWidget, this);
    m_routeEndpointsPage = new RouteEndpointsPage(mapWidget, this);
    m_pipelineSpecsPage = new PipelineSpecsPage(this);
    
    addPage(m_projectInfoPage);
    addPage(m_routeEndpointsPage);
    addPage(m_pipelineSpecsPage);
}

ProjectData NewProjectDialog::getProjectData() const {
    ProjectData data;
    
    data.projectName = field("projectName").toString();
    data.aoiFilePath = field("aoiFilePath").toString();
    data.projectPath = field("projectPath").toString();
    data.epsgCode = field("epsgCode").toInt();
    data.crsName = field("crsName").toString();
    
    data.startPoint.lat = field("startLat").toDouble();
    data.startPoint.lon = field("startLon").toDouble();
    data.endPoint.lat = field("endLat").toDouble();
    data.endPoint.lon = field("endLon").toDouble();
    
    data.pipelineType = field("pipelineType").toString();
    data.material = field("material").toString();
    data.diameter = field("diameter").toDouble();
    
    return data;
}

void NewProjectDialog::accept() {
    QWizard::accept();
}

} // namespace gui
} // namespace agrs



