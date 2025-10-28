#include "agrs_zeus/gui/ProjectSetupWizard.h"
#include "agrs_zeus/gui/MapWidget.h"
#include "agrs_zeus/gui/CRSSelectorDialog.h"
#include "agrs_zeus/gui/CursorInterface.h"
#include "agrs_zeus/Tools.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGroupBox>
#include <QFileDialog>
#include <QRegularExpression>
#include <QLabel>
#include <QPushButton>
#include <QScrollArea>
#include <QFrame>
#include <QProcess>
#include <QDir>
#include <QApplication>
#include <QtConcurrent>
#include <QMetaObject>
#include <QTextStream>
#include <QDateTime>
#include <QDebug>
#include <gdal_priv.h>
#include <ogrsf_frmts.h>
#include <ogr_spatialref.h>

namespace agrs { namespace gui {

// -------------------- SetupInfoPage --------------------
SetupInfoPage::SetupInfoPage(MapWidget* map, QWidget* parent)
    : QWizardPage(parent), m_map(map)
{
    setTitle(tr("Project Information"));
    setSubTitle(tr("Enter project info, AOI, and CRS"));

    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(16,16,16,16);
    layout->setSpacing(12);
    layout->setContentsMargins(16,16,16,16);
    layout->setSpacing(12);
    layout->setContentsMargins(16,16,16,16);
    layout->setSpacing(12);
    layout->setContentsMargins(16,16,16,16);
    layout->setSpacing(12);

    // Project info
    auto* infoGroup = new QGroupBox(tr("Project Information"), this);
    auto* infoForm = new QFormLayout();
    infoForm->setRowWrapPolicy(QFormLayout::DontWrapRows);
    infoForm->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    infoForm->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    infoForm->setHorizontalSpacing(12);
    infoForm->setVerticalSpacing(8);

    m_projectName = new QLineEdit(this);
    m_projectName->setPlaceholderText(tr("Enter project name"));
    registerField("projectName*", m_projectName);
    connect(m_projectName, &QLineEdit::textChanged, this, &SetupInfoPage::onProjectNameEdited);

    m_projectNameFormatted = new QLabel(tr("Formatted As: " ));

    infoForm->addRow(tr("Project Name*:"), m_projectName);
    infoForm->addRow("", m_projectNameFormatted);
    infoGroup->setLayout(infoForm);
    layout->addWidget(infoGroup);

    // AOI
    auto* aoiGroup = new QGroupBox(tr("Area of Interest (AOI)"), this);
    auto* aoiForm = new QFormLayout();
    aoiForm->setRowWrapPolicy(QFormLayout::DontWrapRows);
    aoiForm->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    aoiForm->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    aoiForm->setHorizontalSpacing(12);
    aoiForm->setVerticalSpacing(8);

    auto* aoiRow = new QWidget(this);
    auto* aoiRowLayout = new QHBoxLayout(aoiRow);
    aoiRowLayout->setContentsMargins(0,0,0,0);

    m_aoiPath = new QLineEdit(this);
    m_aoiPath->setReadOnly(true);
    registerField("aoiPath*", m_aoiPath);
    auto* aoiBrowse = new QPushButton(tr("Browse..."), this);
    connect(aoiBrowse, &QPushButton::clicked, this, &SetupInfoPage::onBrowseAOI);

    aoiRowLayout->addWidget(m_aoiPath, 1);
    aoiRowLayout->addWidget(aoiBrowse);

    m_statusLabel = new QLabel(tr("Status: No AOI selected"), this);
    m_progress = new QProgressBar(this);
    m_progress->setRange(0,0);
    m_progress->setVisible(false);

    aoiForm->addRow(tr("AOI File*:"), aoiRow);
    aoiForm->addRow(tr("Status:"), m_statusLabel);
    aoiForm->addRow(tr("Progress:"), m_progress);
    aoiGroup->setLayout(aoiForm);
    layout->addWidget(aoiGroup);

    // Location / CRS
    auto* locGroup = new QGroupBox(tr("Project Location"), this);
    auto* locForm = new QFormLayout();
    locForm->setRowWrapPolicy(QFormLayout::DontWrapRows);
    locForm->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    locForm->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    locForm->setHorizontalSpacing(12);
    locForm->setVerticalSpacing(8);

    auto* pathRow = new QWidget(this);
    auto* pathLayout = new QHBoxLayout(pathRow);
    pathLayout->setContentsMargins(0,0,0,0);
    m_projectPath = new QLineEdit("/opt/agrs/Projects", this);
    registerField("projectPath*", m_projectPath);
    auto* pathBrowse = new QPushButton(tr("Browse..."), this);
    connect(pathBrowse, &QPushButton::clicked, this, &SetupInfoPage::onBrowseProjectPath);
    pathLayout->addWidget(m_projectPath, 1);
    pathLayout->addWidget(pathBrowse);
    locForm->addRow(tr("Project Path*:"), pathRow);

    auto* crsRow = new QWidget(this);
    auto* crsLayout = new QHBoxLayout(crsRow);
    crsLayout->setContentsMargins(0,0,0,0);
    m_crsLabel = new QLabel(tr("(none)"), this);
    m_selectCRSBtn = new QPushButton(tr("Select CRS..."), this);
    connect(m_selectCRSBtn, &QPushButton::clicked, this, &SetupInfoPage::onSelectCRS);
    crsLayout->addWidget(m_crsLabel, 1);
    crsLayout->addWidget(m_selectCRSBtn);
    locForm->addRow(tr("CRS*:"), crsRow);
    // hidden fields to store selected CRS
    m_epsgHidden = new QLineEdit(this); m_epsgHidden->setVisible(false); m_epsgHidden->setObjectName("epsgHidden"); registerField("epsgCode", m_epsgHidden);
    m_crsNameHidden = new QLineEdit(this); m_crsNameHidden->setVisible(false); m_crsNameHidden->setObjectName("crsNameHidden"); registerField("crsName", m_crsNameHidden);

    m_crsRecommendation = new QLabel("", this);
    locForm->addRow("", m_crsRecommendation);
    // Button to accept recommended CRS once available
    auto* recRow = new QWidget(this);
    auto* recLayout = new QHBoxLayout(recRow);
    recLayout->setContentsMargins(0,0,0,0);
    m_useRecommendedBtn = new QPushButton(tr("Use Recommended"), this);
    m_useRecommendedBtn->setEnabled(false);
    // Connection will be (re)bound after AOI analysis to use computed EPSG/name
    recLayout->addStretch();
    recLayout->addWidget(m_useRecommendedBtn);
    locForm->addRow("", recRow);

    locGroup->setLayout(locForm);
    layout->addWidget(locGroup);

    layout->addStretch();

    // Background AOI preload + availability analysis using GDAL (primary) and Cursor CLI (fallback)
    m_bgTimer = new QTimer(this);
    m_bgTimer->setSingleShot(true);
    connect(m_bgTimer, &QTimer::timeout, this, [this]() {
        if (m_aoiPath->text().isEmpty()) return;
        
        m_statusLabel->setText(tr("Analyzing AOI with GDAL..."));
        QApplication::processEvents();
        
        // Primary method: GDAL-based analysis (fast and reliable)
        GDALAllRegister();
        std::string path = m_aoiPath->text().toStdString();
        GDALDataset* ds = (GDALDataset*)GDALOpenEx(path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr);
        
        double minLon = 180.0, minLat = 90.0, maxLon = -180.0, maxLat = -90.0;
        bool gdalSuccess = false;
        
        if (ds) {
            OGRSpatialReference wgs84;
            wgs84.SetWellKnownGeogCS("WGS84");
            wgs84.SetAxisMappingStrategy(OAMS_TRADITIONAL_GIS_ORDER); // Force lon, lat order
            
            for (int i = 0; i < ds->GetLayerCount(); ++i) {
                OGRLayer* layer = ds->GetLayer(i);
                if (!layer) continue;
                
                OGREnvelope env;
                if (layer->GetExtent(&env, true) != OGRERR_NONE) continue;
                
                // GetExtent() ALWAYS returns (minLon, minLat, maxLon, maxLat) in geographic coordinates
                // regardless of axis mapping - the envelope is in traditional GIS order
                OGRSpatialReference* src = layer->GetSpatialRef();
                OGRCoordinateTransformation* tr = nullptr;
                if (src && !src->IsSame(&wgs84)) {
                    // Clone and force traditional GIS order (lon, lat)
                    OGRSpatialReference srcClone(*src);
                    srcClone.SetAxisMappingStrategy(OAMS_TRADITIONAL_GIS_ORDER);
                    tr = OGRCreateCoordinateTransformation(&srcClone, &wgs84);
                }
                
                // Envelope corners in (lon, lat) format
                double lons[4] = {env.MinX, env.MaxX, env.MinX, env.MaxX};
                double lats[4] = {env.MinY, env.MinY, env.MaxY, env.MaxY};
                
                for (int k = 0; k < 4; ++k) {
                    double lon = lons[k], lat = lats[k];
                    if (tr) tr->Transform(1, &lon, &lat);
                    minLon = std::min(minLon, lon);
                    maxLon = std::max(maxLon, lon);
                    minLat = std::min(minLat, lat);
                    maxLat = std::max(maxLat, lat);
                }
                
                if (tr) OCTDestroyCoordinateTransformation(tr);
                gdalSuccess = true;
            }
            GDALClose(ds);
        }
        
        if (!gdalSuccess) {
            // Fallback to AI if GDAL fails
            m_statusLabel->setText(tr("⚠ GDAL failed, trying AI..."));
            QApplication::processEvents();
            
            CursorInterface cursor;
            
            if (!CursorInterface::isCursorAgentAvailable() || !CursorInterface::isCursorAgentAuthenticated()) {
                m_statusLabel->setText(tr("✗ Both GDAL and AI failed to analyze AOI"));
                m_progress->setVisible(false);
                return;
            }
            
            QString prompt = QString(
                "Analyze this geospatial file and extract ONLY the centroid coordinates:\n"
                "@%1\n\n"
                "Response format (one line only):\n"
                "CENTROID: <latitude>, <longitude>\n\n"
                "Example: CENTROID: 43.14, 13.70\n\n"
                "Provide ONLY the centroid line, no other text."
            ).arg(m_aoiPath->text());
            
            QString response = cursor.executePrompt(prompt, CursorInterface::Model::Sonnet45, 30000);
            
            if (response.isEmpty()) {
                m_statusLabel->setText(tr("✗ AI analysis failed"));
                m_progress->setVisible(false);
                return;
            }
            
            // Parse centroid from AI response
            QRegularExpression centroidRegex(R"(CENTROID:\s*([-+]?\d+\.?\d*)\s*,\s*([-+]?\d+\.?\d*))");
            QRegularExpressionMatch match = centroidRegex.match(response);
            
            if (!match.hasMatch()) {
                m_statusLabel->setText(tr("✗ Could not parse coordinates from AI"));
                m_progress->setVisible(false);
                return;
            }
            
            double cenLat = match.captured(1).toDouble();
            double cenLon = match.captured(2).toDouble();
            
            // Calculate recommended UTM zone
            int zone = static_cast<int>(std::floor((cenLon + 180.0) / 6.0)) + 1;
            bool north = cenLat >= 0.0;
            int epsg = (north ? 32600 : 32700) + zone;
            QString name = QString("WGS 84 / UTM zone %1%2").arg(zone).arg(north ? "N" : "S");
            
            m_crsRecommendation->setText(tr("Recommended: %1 (EPSG:%2)").arg(name).arg(epsg));
            m_statusLabel->setText(tr("✓ AOI analyzed (AI) - Centroid: %.4f°N, %.4f°E").arg(cenLat).arg(cenLon));
            m_progress->setVisible(false);
            m_useRecommendedBtn->setEnabled(true);
            
            // Bind button to apply recommendation
            m_useRecommendedBtn->disconnect();
            connect(m_useRecommendedBtn, &QPushButton::clicked, this, [this, epsg, name]() {
                m_crsLabel->setText(QString("%1 (EPSG:%2)").arg(name).arg(epsg));
                if (m_epsgHidden) m_epsgHidden->setText(QString::number(epsg));
                if (m_crsNameHidden) m_crsNameHidden->setText(name);
                emit completeChanged();
            });
            return;
        }
        
        // GDAL succeeded - compute centroid and recommend UTM
        double cenLon = (minLon + maxLon) / 2.0;
        double cenLat = (minLat + maxLat) / 2.0;
        
        // Calculate recommended UTM zone
        int zone = static_cast<int>(std::floor((cenLon + 180.0) / 6.0)) + 1;
        bool north = cenLat >= 0.0;
        int epsg = (north ? 32600 : 32700) + zone;
        QString name = QString("WGS 84 / UTM zone %1%2").arg(zone).arg(north ? "N" : "S");
        
        m_crsRecommendation->setText(tr("Recommended: %1 (EPSG:%2)").arg(name).arg(epsg));
        m_statusLabel->setText(tr("✓ AOI analyzed (GDAL) - Centroid: %.4f°N, %.4f°E").arg(cenLat).arg(cenLon));
        m_progress->setVisible(false);
        m_useRecommendedBtn->setEnabled(true);
        
        // Bind button to apply recommendation
        m_useRecommendedBtn->disconnect();
        connect(m_useRecommendedBtn, &QPushButton::clicked, this, [this, epsg, name]() {
            m_crsLabel->setText(QString("%1 (EPSG:%2)").arg(name).arg(epsg));
            if (m_epsgHidden) m_epsgHidden->setText(QString::number(epsg));
            if (m_crsNameHidden) m_crsNameHidden->setText(name);
            emit completeChanged();
        });
    });
}

bool SetupInfoPage::isComplete() const {
    return !m_projectName->text().trimmed().isEmpty() &&
           !m_aoiPath->text().isEmpty() &&
           !m_projectPath->text().isEmpty() &&
           (m_crsLabel->text() != "(none)");
}

void SetupInfoPage::onProjectNameEdited(const QString& text) {
    QString formatted = text;
    // Replace spaces with underscore, and disallow special chars except _ and -
    formatted.replace(" ", "_");
    static QRegularExpression re("[^A-Za-z0-9_-]");
    formatted.replace(re, "");
    m_projectNameFormatted->setText(tr("Formatted As: %1").arg(formatted));
    if (formatted != text) {
        // Update field silently to enforce policy
        int cursor = m_projectName->cursorPosition();
        m_projectName->setText(formatted);
        m_projectName->setCursorPosition(std::min(cursor, static_cast<int>(formatted.length())));
    }
    emit completeChanged();
}

void SetupInfoPage::onBrowseAOI() {
    QString file = QFileDialog::getOpenFileName(this, tr("Select AOI File"), {},
        tr("Geospatial (*.kmz *.kml *.geojson *.gpkg *.shp);;All Files (*)"));
    if (file.isEmpty()) return;
    m_aoiPath->setText(file);
    m_statusLabel->setText(tr("Loading AOI and checking datasets..."));
    m_progress->setVisible(true);
    m_bgTimer->start(1200); // simulate async preload + availability check
    emit completeChanged();
}

void SetupInfoPage::onBrowseProjectPath() {
    QString dir = QFileDialog::getExistingDirectory(this, tr("Select Project Directory"), m_projectPath->text());
    if (!dir.isEmpty()) m_projectPath->setText(dir);
}

void SetupInfoPage::onSelectCRS() {
    CRSSelectorDialog dlg(this);
    if (dlg.exec() == QDialog::Accepted) {
        m_crsLabel->setText(QString("%1 (EPSG:%2)").arg(dlg.selectedName()).arg(dlg.selectedEpsg()));
        // Update hidden fields directly
        if (m_epsgHidden) {
            m_epsgHidden->setText(QString::number(dlg.selectedEpsg()));
        }
        if (m_crsNameHidden) {
            m_crsNameHidden->setText(dlg.selectedName());
        }
        emit completeChanged();
    }
}

// -------------------- SetupEndpointsPage --------------------
SetupEndpointsPage::SetupEndpointsPage(QWidget* parent)
    : QWizardPage(parent)
{
    setTitle(tr("Pipeline Route Endpoints"));
    setSubTitle(tr("Enter start and end points (or KMZ files)"));

    auto* layout = new QVBoxLayout(this);

    auto* startGroup = new QGroupBox(tr("Start Point"), this);
    auto* startForm = new QFormLayout();
    startForm->setRowWrapPolicy(QFormLayout::DontWrapRows);
    startForm->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    startForm->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    startForm->setHorizontalSpacing(12);
    startForm->setVerticalSpacing(8);
    m_startLat = new QDoubleSpinBox(this); m_startLat->setRange(-90,90); m_startLat->setDecimals(6); m_startLat->setSuffix(" °");
    m_startLon = new QDoubleSpinBox(this); m_startLon->setRange(-180,180); m_startLon->setDecimals(6); m_startLon->setSuffix(" °");
    auto* startKmzRow = new QWidget(this); auto* sk = new QHBoxLayout(startKmzRow); sk->setContentsMargins(0,0,0,0); sk->setSpacing(8);
    m_startKmz = new QLineEdit(this); m_startKmz->setPlaceholderText(tr("Optional KMZ for start point"));
    auto* browseStart = new QPushButton(tr("Browse..."), this); connect(browseStart, &QPushButton::clicked, this, &SetupEndpointsPage::onBrowseStartKmz);
    sk->addWidget(m_startKmz,1); sk->addWidget(browseStart);
    startForm->addRow(tr("Latitude*:"), m_startLat);
    startForm->addRow(tr("Longitude*:"), m_startLon);
    startForm->addRow(tr("Start KMZ:"), startKmzRow);
    startGroup->setLayout(startForm);

    auto* endGroup = new QGroupBox(tr("End Point"), this);
    auto* endForm = new QFormLayout();
    endForm->setRowWrapPolicy(QFormLayout::DontWrapRows);
    endForm->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    endForm->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    endForm->setHorizontalSpacing(12);
    endForm->setVerticalSpacing(8);
    m_endLat = new QDoubleSpinBox(this); m_endLat->setRange(-90,90); m_endLat->setDecimals(6); m_endLat->setSuffix(" °");
    m_endLon = new QDoubleSpinBox(this); m_endLon->setRange(-180,180); m_endLon->setDecimals(6); m_endLon->setSuffix(" °");
    auto* endKmzRow = new QWidget(this); auto* ek = new QHBoxLayout(endKmzRow); ek->setContentsMargins(0,0,0,0); ek->setSpacing(8);
    m_endKmz = new QLineEdit(this); m_endKmz->setPlaceholderText(tr("Optional KMZ for end point"));
    auto* browseEnd = new QPushButton(tr("Browse..."), this); connect(browseEnd, &QPushButton::clicked, this, &SetupEndpointsPage::onBrowseEndKmz);
    ek->addWidget(m_endKmz,1); ek->addWidget(browseEnd);
    endForm->addRow(tr("Latitude*:"), m_endLat);
    endForm->addRow(tr("Longitude*:"), m_endLon);
    endForm->addRow(tr("End KMZ:"), endKmzRow);
    endGroup->setLayout(endForm);

    layout->addWidget(startGroup);
    layout->addWidget(endGroup);
    layout->addStretch();

    registerField("startLat", m_startLat, "value", SIGNAL(valueChanged(double)));
    registerField("startLon", m_startLon, "value", SIGNAL(valueChanged(double)));
    registerField("endLat", m_endLat, "value", SIGNAL(valueChanged(double)));
    registerField("endLon", m_endLon, "value", SIGNAL(valueChanged(double)));
    registerField("startKmzPath", m_startKmz);
    registerField("endKmzPath", m_endKmz);
    
    // Connect all inputs to completeChanged so wizard updates Next button
    connect(m_startLat, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &SetupEndpointsPage::completeChanged);
    connect(m_startLon, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &SetupEndpointsPage::completeChanged);
    connect(m_endLat, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &SetupEndpointsPage::completeChanged);
    connect(m_endLon, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &SetupEndpointsPage::completeChanged);
    connect(m_startKmz, &QLineEdit::textChanged, this, &SetupEndpointsPage::completeChanged);
    connect(m_endKmz, &QLineEdit::textChanged, this, &SetupEndpointsPage::completeChanged);
}

bool SetupEndpointsPage::isComplete() const {
    const bool startOk = (m_startLat->value()!=0.0 || m_startLon->value()!=0.0) || !m_startKmz->text().isEmpty();
    const bool endOk = (m_endLat->value()!=0.0 || m_endLon->value()!=0.0) || !m_endKmz->text().isEmpty();
    return startOk && endOk;
}

void SetupEndpointsPage::onBrowseStartKmz() {
    QString f = QFileDialog::getOpenFileName(this, tr("Select Start KMZ/KML"), {}, tr("KMZ/KML (*.kmz *.kml)"));
    if (!f.isEmpty()) {
        m_startKmz->setText(f);
        onStartKmzChanged(f);
    }
}

void SetupEndpointsPage::onBrowseEndKmz() {
    QString f = QFileDialog::getOpenFileName(this, tr("Select End KMZ/KML"), {}, tr("KMZ/KML (*.kmz *.kml)"));
    if (!f.isEmpty()) {
        m_endKmz->setText(f);
        onEndKmzChanged(f);
    }
}

void SetupEndpointsPage::onStartKmzChanged(const QString& path) {
    if (path.isEmpty()) return;
    double lat = 0.0, lon = 0.0;
    parseKmzCoordinates(path, lat, lon);
    if (lat != 0.0 || lon != 0.0) {
        m_startLat->setValue(lat);
        m_startLon->setValue(lon);
    }
}

void SetupEndpointsPage::onEndKmzChanged(const QString& path) {
    if (path.isEmpty()) return;
    double lat = 0.0, lon = 0.0;
    parseKmzCoordinates(path, lat, lon);
    if (lat != 0.0 || lon != 0.0) {
        m_endLat->setValue(lat);
        m_endLon->setValue(lon);
    }
}

void SetupEndpointsPage::parseKmzCoordinates(const QString& path, double& lat, double& lon) {
    // Use GDAL/OGR to read KMZ/KML and extract first point
    GDALAllRegister();
    GDALDataset* ds = (GDALDataset*)GDALOpenEx(path.toStdString().c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr);
    if (!ds) return;
    
    OGRLayer* layer = ds->GetLayer(0);
    if (!layer) {
        GDALClose(ds);
        return;
    }
    
    OGRFeature* feat = layer->GetNextFeature();
    if (feat) {
        OGRGeometry* geom = feat->GetGeometryRef();
        if (geom) {
            OGRPoint* point = nullptr;
            if (wkbFlatten(geom->getGeometryType()) == wkbPoint) {
                point = geom->toPoint();
            } else if (wkbFlatten(geom->getGeometryType()) == wkbLineString) {
                OGRLineString* line = geom->toLineString();
                if (line->getNumPoints() > 0) {
                    point = new OGRPoint();
                    line->getPoint(0, point);
                }
            } else if (wkbFlatten(geom->getGeometryType()) == wkbPolygon) {
                OGRPolygon* poly = geom->toPolygon();
                OGRPoint centroid;
                if (poly->Centroid(&centroid) == OGRERR_NONE) {
                    point = &centroid;
                }
            }
            
            if (point) {
                lon = point->getX();
                lat = point->getY();
                if (point != geom && wkbFlatten(geom->getGeometryType()) == wkbLineString) {
                    delete point;
                }
            }
        }
        OGRFeature::DestroyFeature(feat);
    }
    GDALClose(ds);
}

// -------------------- SetupSpecsPage --------------------
SetupSpecsPage::SetupSpecsPage(QWidget* parent)
    : QWizardPage(parent)
{
    setTitle(tr("Pipeline Specifications"));
    setSubTitle(tr("Enter required specifications with units"));

    auto* scroll = new QScrollArea(this);
    scroll->setWidgetResizable(true);
    scroll->setFrameShape(QFrame::NoFrame);
    
    auto* content = new QWidget();
    auto* layout = new QVBoxLayout(content);
    layout->setContentsMargins(16,16,16,16);
    layout->setSpacing(12);
    
    auto* form = new QFormLayout();
    form->setRowWrapPolicy(QFormLayout::DontWrapRows);
    form->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    form->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    form->setHorizontalSpacing(12);
    form->setVerticalSpacing(8);

    // Basic specs
    m_type = new QComboBox(this); m_type->addItems({"Gas","Oil","Water","Other"});
    m_material = new QComboBox(this); m_material->addItems({"Carbon Steel","Stainless Steel","HDPE","Other"});
    form->addRow(tr("Type*:"), m_type);
    form->addRow(tr("Material*:"), m_material);

    // MOP with units
    auto* mopRow = new QWidget(this);
    auto* mopLayout = new QHBoxLayout(mopRow);
    mopLayout->setContentsMargins(0,0,0,0);
    mopLayout->setSpacing(8);
    m_mop = new QDoubleSpinBox(this); m_mop->setRange(0, 10000); m_mop->setDecimals(2);
    m_mopUnit = new QComboBox(this); m_mopUnit->addItems({"bar", "psi", "MPa", "kPa"});
    m_mopUnit->setCurrentText("bar");
    m_mopUnit->setMinimumWidth(80);
    mopLayout->addWidget(m_mop, 1);
    mopLayout->addWidget(m_mopUnit);
    form->addRow(tr("MOP*:"), mopRow);

    // DP with units
    auto* dpRow = new QWidget(this);
    auto* dpLayout = new QHBoxLayout(dpRow);
    dpLayout->setContentsMargins(0,0,0,0);
    dpLayout->setSpacing(8);
    m_dp = new QDoubleSpinBox(this); m_dp->setRange(0, 10000); m_dp->setDecimals(2);
    m_dpUnit = new QComboBox(this); m_dpUnit->addItems({"bar", "psi", "MPa", "kPa"});
    m_dpUnit->setCurrentText("bar");
    m_dpUnit->setMinimumWidth(80);
    dpLayout->addWidget(m_dp, 1);
    dpLayout->addWidget(m_dpUnit);
    form->addRow(tr("DP*:"), dpRow);

    // Diameter with units
    auto* diamRow = new QWidget(this);
    auto* diamLayout = new QHBoxLayout(diamRow);
    diamLayout->setContentsMargins(0,0,0,0);
    diamLayout->setSpacing(8);
    m_diameter = new QDoubleSpinBox(this); m_diameter->setRange(0, 10000); m_diameter->setDecimals(1);
    m_diameterUnit = new QComboBox(this); m_diameterUnit->addItems({"mm", "in", "cm", "m"});
    m_diameterUnit->setCurrentText("mm");
    m_diameterUnit->setMinimumWidth(80);
    diamLayout->addWidget(m_diameter, 1);
    diamLayout->addWidget(m_diameterUnit);
    form->addRow(tr("Diameter*:"), diamRow);

    // Thickness with units
    auto* thickRow = new QWidget(this);
    auto* thickLayout = new QHBoxLayout(thickRow);
    thickLayout->setContentsMargins(0,0,0,0);
    thickLayout->setSpacing(8);
    m_thickness = new QDoubleSpinBox(this); m_thickness->setRange(0, 1000); m_thickness->setDecimals(1);
    m_thicknessUnit = new QComboBox(this); m_thicknessUnit->addItems({"mm", "in", "cm"});
    m_thicknessUnit->setCurrentText("mm");
    m_thicknessUnit->setMinimumWidth(80);
    thickLayout->addWidget(m_thickness, 1);
    thickLayout->addWidget(m_thicknessUnit);
    form->addRow(tr("Thickness*:"), thickRow);

    // Depth of cover with units
    auto* coverRow = new QWidget(this);
    auto* coverLayout = new QHBoxLayout(coverRow);
    coverLayout->setContentsMargins(0,0,0,0);
    coverLayout->setSpacing(8);
    m_coverDepth = new QDoubleSpinBox(this); m_coverDepth->setRange(0, 50); m_coverDepth->setDecimals(2);
    m_coverDepthUnit = new QComboBox(this); m_coverDepthUnit->addItems({"m", "ft", "cm"});
    m_coverDepthUnit->setCurrentText("m");
    m_coverDepthUnit->setMinimumWidth(80);
    coverLayout->addWidget(m_coverDepth, 1);
    coverLayout->addWidget(m_coverDepthUnit);
    form->addRow(tr("Depth of Cover*:"), coverRow);

    layout->addLayout(form);

    // Hot bend angles section
    auto* hotBendGroup = new QGroupBox(tr("Hot Bend Angles (degrees)"), this);
    m_hotBendAnglesLayout = new QVBoxLayout();
    m_hotBendAnglesLayout->setSpacing(4);
    m_addAngleBtn = new QPushButton(tr("+ Add Angle"), this);
    connect(m_addAngleBtn, &QPushButton::clicked, this, &SetupSpecsPage::onAddHotBendAngle);
    m_hotBendAnglesLayout->addWidget(m_addAngleBtn);
    hotBendGroup->setLayout(m_hotBendAnglesLayout);
    layout->addWidget(hotBendGroup);
    
    // Add first angle field by default
    onAddHotBendAngle();

    // Additional specs
    auto* advForm = new QFormLayout();
    advForm->setRowWrapPolicy(QFormLayout::DontWrapRows);
    advForm->setFieldGrowthPolicy(QFormLayout::ExpandingFieldsGrow);
    advForm->setLabelAlignment(Qt::AlignRight | Qt::AlignVCenter);
    advForm->setHorizontalSpacing(12);
    advForm->setVerticalSpacing(8);

    m_hddMaxCurvature = new QDoubleSpinBox(this); 
    m_hddMaxCurvature->setRange(0, 180); 
    m_hddMaxCurvature->setDecimals(2); 
    m_hddMaxCurvature->setSuffix(" °");
    advForm->addRow(tr("HDD Max Curvature:"), m_hddMaxCurvature);

    // Powerlines min distance with units
    auto* plRow = new QWidget(this);
    auto* plLayout = new QHBoxLayout(plRow);
    plLayout->setContentsMargins(0,0,0,0);
    plLayout->setSpacing(8);
    m_powerlinesMinDist = new QDoubleSpinBox(this); m_powerlinesMinDist->setRange(0, 100000); m_powerlinesMinDist->setDecimals(1);
    m_powerlinesMinDistUnit = new QComboBox(this); m_powerlinesMinDistUnit->addItems({"mm", "m", "ft"});
    m_powerlinesMinDistUnit->setCurrentText("mm");
    m_powerlinesMinDistUnit->setMinimumWidth(80);
    plLayout->addWidget(m_powerlinesMinDist, 1);
    plLayout->addWidget(m_powerlinesMinDistUnit);
    advForm->addRow(tr("Powerlines Min Dist:"), plRow);

    // Powerline poles min distance with units
    auto* ppRow = new QWidget(this);
    auto* ppLayout = new QHBoxLayout(ppRow);
    ppLayout->setContentsMargins(0,0,0,0);
    ppLayout->setSpacing(8);
    m_powerpolesMinDist = new QDoubleSpinBox(this); m_powerpolesMinDist->setRange(0, 100000); m_powerpolesMinDist->setDecimals(1);
    m_powerpolesMinDistUnit = new QComboBox(this); m_powerpolesMinDistUnit->addItems({"mm", "m", "ft"});
    m_powerpolesMinDistUnit->setCurrentText("mm");
    m_powerpolesMinDistUnit->setMinimumWidth(80);
    ppLayout->addWidget(m_powerpolesMinDist, 1);
    ppLayout->addWidget(m_powerpolesMinDistUnit);
    advForm->addRow(tr("Poles Min Dist:"), ppRow);

    // House min distance with units
    auto* houseRow = new QWidget(this);
    auto* houseLayout = new QHBoxLayout(houseRow);
    houseLayout->setContentsMargins(0,0,0,0);
    houseLayout->setSpacing(8);
    m_houseMinDist = new QDoubleSpinBox(this); m_houseMinDist->setRange(0, 100000); m_houseMinDist->setDecimals(1);
    m_houseMinDistUnit = new QComboBox(this); m_houseMinDistUnit->addItems({"mm", "m", "ft"});
    m_houseMinDistUnit->setCurrentText("mm");
    m_houseMinDistUnit->setMinimumWidth(80);
    houseLayout->addWidget(m_houseMinDist, 1);
    houseLayout->addWidget(m_houseMinDistUnit);
    advForm->addRow(tr("House Min Dist:"), houseRow);

    // ROW file
    auto* rowRow = new QWidget(this);
    auto* rowLayout = new QHBoxLayout(rowRow);
    rowLayout->setContentsMargins(0,0,0,0);
    rowLayout->setSpacing(8);
    m_rowFile = new QLineEdit(this);
    auto* browseRowBtn = new QPushButton(tr("Browse..."), this);
    connect(browseRowBtn, &QPushButton::clicked, this, &SetupSpecsPage::onBrowseRowFile);
    rowLayout->addWidget(m_rowFile, 1);
    rowLayout->addWidget(browseRowBtn);
    advForm->addRow(tr("ROW File (optional):"), rowRow);

    layout->addLayout(advForm);
    layout->addStretch();
    
    scroll->setWidget(content);
    
    auto* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(0,0,0,0);
    mainLayout->addWidget(scroll);

    // Register fields
    registerField("pipelineType", m_type, "currentText");
    registerField("material", m_material, "currentText");
    registerField("mop", m_mop, "value", SIGNAL(valueChanged(double)));
    registerField("dp", m_dp, "value", SIGNAL(valueChanged(double)));
    registerField("diameter", m_diameter, "value", SIGNAL(valueChanged(double)));
    registerField("thickness", m_thickness, "value", SIGNAL(valueChanged(double)));
    registerField("coverDepth", m_coverDepth, "value", SIGNAL(valueChanged(double)));
    
    // Connect to completeChanged
    connect(m_diameter, QOverload<double>::of(&QDoubleSpinBox::valueChanged), this, &SetupSpecsPage::completeChanged);
}

void SetupSpecsPage::onAddHotBendAngle() {
    auto* angleRow = new QWidget(this);
    auto* angleLayout = new QHBoxLayout(angleRow);
    angleLayout->setContentsMargins(0,0,0,0);
    angleLayout->setSpacing(8);
    
    auto* angleSpin = new QDoubleSpinBox(this);
    angleSpin->setRange(0, 180);
    angleSpin->setDecimals(2);
    angleSpin->setSuffix(" °");
    angleSpin->setMinimumWidth(120);
    
    auto* removeBtn = new QPushButton(tr("Remove"), this);
    removeBtn->setMaximumWidth(80);
    connect(removeBtn, &QPushButton::clicked, this, [this, angleRow, angleSpin]() {
        m_hotBendAngleSpins.removeAll(angleSpin);
        angleRow->deleteLater();
    });
    
    angleLayout->addWidget(new QLabel(tr("Angle %1:").arg(m_hotBendAngleSpins.size() + 1), this));
    angleLayout->addWidget(angleSpin, 1);
    angleLayout->addWidget(removeBtn);
    
    m_hotBendAngleSpins.append(angleSpin);
    
    // Insert before the Add button
    int insertPos = m_hotBendAnglesLayout->count() - 1;
    m_hotBendAnglesLayout->insertWidget(insertPos, angleRow);
}

void SetupSpecsPage::onRemoveHotBendAngle() {
    // Handled inline in onAddHotBendAngle's lambda
}

void SetupSpecsPage::onBrowseRowFile() {
    QString f = QFileDialog::getOpenFileName(this, tr("Select ROW Dimensions File"), {}, tr("All Files (*)"));
    if (!f.isEmpty()) m_rowFile->setText(f);
}

bool SetupSpecsPage::isComplete() const {
    return m_diameter->value() > 0.0;
}

// -------------------- ProjectSetupWizard --------------------
ProjectSetupWizard::ProjectSetupWizard(MapWidget* map, QWidget* parent)
    : QWizard(parent)
{
    setWindowTitle(tr("New Pipeline Routing Project"));
    setWizardStyle(QWizard::ModernStyle);
    setMinimumSize(760, 560);

    addPage(new SetupInfoPage(map, this));
    addPage(new SetupEndpointsPage(this));
    addPage(new SetupSpecsPage(this));
    addPage(new AdditionalFilesPage(this));
    addPage(new SetupConfirmPage(this));
}

ProjectSetupData ProjectSetupWizard::data() const {
    ProjectSetupData d;
    d.projectName = field("projectName").toString();
    d.aoiPath = field("aoiPath").toString();
    d.projectPath = field("projectPath").toString();
    d.epsgCode = field("epsgCode").toInt();
    d.crsName = field("crsName").toString();
    
    d.startLat = field("startLat").toDouble();
    d.startLon = field("startLon").toDouble();
    d.endLat = field("endLat").toDouble();
    d.endLon = field("endLon").toDouble();
    d.startKmzPath = field("startKmzPath").toString();
    d.endKmzPath = field("endKmzPath").toString();
    
    d.pipeType = field("pipelineType").toString();
    d.material = field("material").toString();
    
    // Collect pipeline specs from SetupSpecsPage with proper unit conversion
    auto* specsPage = qobject_cast<SetupSpecsPage*>(page(2)); // Page 2 is Pipeline Specs
    if (specsPage) {
        // MOP (convert to bar)
        double mopVal = specsPage->m_mop->value();
        QString mopUnit = specsPage->m_mopUnit->currentText();
        if (mopUnit == "psi") {
            mopVal *= 0.0689476; // psi to bar
        } else if (mopUnit == "kPa") {
            mopVal *= 0.01; // kPa to bar
        } else if (mopUnit == "MPa") {
            mopVal *= 10.0; // MPa to bar
        }
        d.mopBar = mopVal;
        
        // DP (convert to bar)
        double dpVal = specsPage->m_dp->value();
        QString dpUnit = specsPage->m_dpUnit->currentText();
        if (dpUnit == "psi") {
            dpVal *= 0.0689476; // psi to bar
        } else if (dpUnit == "kPa") {
            dpVal *= 0.01; // kPa to bar
        } else if (dpUnit == "MPa") {
            dpVal *= 10.0; // MPa to bar
        }
        d.dpBar = dpVal;
        
        // Diameter (convert to mm)
        double diamVal = specsPage->m_diameter->value();
        QString diamUnit = specsPage->m_diameterUnit->currentText();
        if (diamUnit == "in") {
            diamVal *= 25.4; // inches to mm
        } else if (diamUnit == "cm") {
            diamVal *= 10.0; // cm to mm
        } else if (diamUnit == "m") {
            diamVal *= 1000.0; // m to mm
        }
        d.diameterMm = diamVal;
        
        // Thickness (convert to mm)
        double thickVal = specsPage->m_thickness->value();
        QString thickUnit = specsPage->m_thicknessUnit->currentText();
        if (thickUnit == "in") {
            thickVal *= 25.4; // inches to mm
        } else if (thickUnit == "cm") {
            thickVal *= 10.0; // cm to mm
        }
        d.thicknessMm = thickVal;
        
        // Depth of Cover (convert to m)
        double coverVal = specsPage->m_coverDepth->value();
        QString coverUnit = specsPage->m_coverDepthUnit->currentText();
        if (coverUnit == "ft") {
            coverVal *= 0.3048; // feet to m
        } else if (coverUnit == "cm") {
            coverVal *= 0.01; // cm to m
        }
        d.coverDepthM = coverVal;
        // Hot bend angles
        for (auto* spin : specsPage->m_hotBendAngleSpins) {
            d.hotBendAngles.append(spin->value());
        }
        
        // HDD max curvature
        if (specsPage->m_hddMaxCurvature) {
            d.hddMaxCurvatureDeg = specsPage->m_hddMaxCurvature->value();
        }
        
        // Powerlines minimum distance (convert to mm based on unit)
        if (specsPage->m_powerlinesMinDist && specsPage->m_powerlinesMinDistUnit) {
            double val = specsPage->m_powerlinesMinDist->value();
            QString unit = specsPage->m_powerlinesMinDistUnit->currentText();
            if (unit == "m") val *= 1000.0;
            else if (unit == "ft") val *= 304.8;
            d.powerlinesMinDistMm = val;
        }
        
        // Powerline poles minimum distance (convert to mm)
        if (specsPage->m_powerpolesMinDist && specsPage->m_powerpolesMinDistUnit) {
            double val = specsPage->m_powerpolesMinDist->value();
            QString unit = specsPage->m_powerpolesMinDistUnit->currentText();
            if (unit == "m") val *= 1000.0;
            else if (unit == "ft") val *= 304.8;
            d.powerpolesMinDistMm = val;
        }
        
        // House minimum distance (convert to mm)
        if (specsPage->m_houseMinDist && specsPage->m_houseMinDistUnit) {
            double val = specsPage->m_houseMinDist->value();
            QString unit = specsPage->m_houseMinDistUnit->currentText();
            if (unit == "m") val *= 1000.0;
            else if (unit == "ft") val *= 304.8;
            d.houseMinDistMm = val;
        }
        
        // ROW file
        if (specsPage->m_rowFile) {
            d.rowFilePath = specsPage->m_rowFile->text();
        }
    }
    
    // Collect additional files from AdditionalFilesPage
    auto* filesPage = qobject_cast<AdditionalFilesPage*>(page(3)); // Page 3 is Additional Files
    if (filesPage) {
        for (int i = 0; i < filesPage->m_filePathEdits.size(); ++i) {
            QString filePath = filesPage->m_filePathEdits[i]->text();
            if (!filePath.isEmpty()) {
                d.additionalFiles.append(filePath);
                QString context = (i < filesPage->m_fileContextEdits.size()) 
                    ? filesPage->m_fileContextEdits[i]->text() 
                    : QString();
                d.additionalFileContexts.append(context);
            }
        }
    }
    
    return d;
}

// -------------------- AdditionalFilesPage --------------------
AdditionalFilesPage::AdditionalFilesPage(QWidget* parent)
    : QWizardPage(parent)
{
    setTitle(tr("Additional Files (Optional)"));
    setSubTitle(tr("Upload any additional project files, constraints, or documentation"));

    auto* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(16,16,16,16);
    mainLayout->setSpacing(12);

    // Info label
    auto* infoLabel = new QLabel(
        tr("You can upload additional files such as:\n"
           "• Custom constraint layers (rasters/vectors)\n"
           "• Environmental reports or surveys\n"
           "• Regulatory documentation\n"
           "• Land ownership records\n"
           "• Previous project data\n"
           "• Any other relevant files"),
        this
    );
    infoLabel->setWordWrap(true);
    infoLabel->setStyleSheet("QLabel { background-color: #2a2a2a; color: white; padding: 10px; border: 1px solid #555; }");
    mainLayout->addWidget(infoLabel);

    // Scrollable area for file entries
    auto* scrollArea = new QScrollArea(this);
    scrollArea->setWidgetResizable(true);
    scrollArea->setFrameShape(QFrame::NoFrame);
    
    auto* scrollContent = new QWidget();
    m_filesLayout = new QVBoxLayout(scrollContent);
    m_filesLayout->setSpacing(8);
    
    // Add button at the top
    m_addFileBtn = new QPushButton(tr("+ Add File"), this);
    m_addFileBtn->setMaximumWidth(150);
    connect(m_addFileBtn, &QPushButton::clicked, this, &AdditionalFilesPage::onAddFile);
    m_filesLayout->addWidget(m_addFileBtn);
    
    m_filesLayout->addStretch();
    scrollArea->setWidget(scrollContent);
    mainLayout->addWidget(scrollArea);

    // Note about optional
    auto* noteLabel = new QLabel(tr("Note: All files are optional. You can skip this page and add files later."), this);
    noteLabel->setStyleSheet("QLabel { font-style: italic; color: #aaa; padding: 8px; }");
    mainLayout->addWidget(noteLabel);
}

bool AdditionalFilesPage::isComplete() const {
    // Always complete since files are optional
    return true;
}

void AdditionalFilesPage::onAddFile() {
    // Create a new file entry container
    auto* fileContainer = new QWidget(this);
    auto* containerLayout = new QVBoxLayout(fileContainer);
    containerLayout->setContentsMargins(8, 8, 8, 8);
    containerLayout->setSpacing(6);
    
    // First row: File path and browse button
    auto* fileRow = new QWidget(this);
    auto* fileLayout = new QHBoxLayout(fileRow);
    fileLayout->setContentsMargins(0,0,0,0);
    fileLayout->setSpacing(8);
    
    // File path input
    auto* pathEdit = new QLineEdit(this);
    pathEdit->setPlaceholderText(tr("Click Browse to select a file..."));
    pathEdit->setReadOnly(true);
    pathEdit->setStyleSheet("QLineEdit { background-color: #2a2a2a; color: white; border: 1px solid #555; padding: 6px; }");
    
    // Browse button
    auto* browseBtn = new QPushButton(tr("Browse..."), this);
    browseBtn->setMaximumWidth(100);
    
    // Store index for browse callback
    int currentIndex = m_filePathEdits.size();
    connect(browseBtn, &QPushButton::clicked, this, [this, currentIndex]() {
        onBrowseFile(currentIndex);
    });
    
    // Remove button
    auto* removeBtn = new QPushButton(tr("Remove"), this);
    removeBtn->setMaximumWidth(80);
    connect(removeBtn, &QPushButton::clicked, this, [this, fileContainer, pathEdit]() {
        // Find and remove corresponding context edit
        int idx = m_filePathEdits.indexOf(pathEdit);
        if (idx >= 0 && idx < m_fileContextEdits.size()) {
            m_filePathEdits.removeAt(idx);
            m_fileContextEdits.removeAt(idx);
        }
        fileContainer->deleteLater();
    });
    
    fileLayout->addWidget(new QLabel(tr("File:"), this));
    fileLayout->addWidget(pathEdit, 1);
    fileLayout->addWidget(browseBtn);
    fileLayout->addWidget(removeBtn);
    
    containerLayout->addWidget(fileRow);
    
    // Second row: Context/description
    auto* contextRow = new QWidget(this);
    auto* contextLayout = new QHBoxLayout(contextRow);
    contextLayout->setContentsMargins(0,0,0,0);
    contextLayout->setSpacing(8);
    
    auto* contextEdit = new QLineEdit(this);
    contextEdit->setPlaceholderText(tr("Optional: Add context or description for this file..."));
    contextEdit->setStyleSheet("QLineEdit { background-color: #2a2a2a; color: white; border: 1px solid #555; padding: 6px; }");
    
    contextLayout->addWidget(new QLabel(tr("Context:"), this));
    contextLayout->addWidget(contextEdit, 1);
    
    containerLayout->addWidget(contextRow);
    
    // Add separator line
    auto* separator = new QFrame(this);
    separator->setFrameShape(QFrame::HLine);
    separator->setFrameShadow(QFrame::Sunken);
    separator->setStyleSheet("QFrame { color: #555; }");
    containerLayout->addWidget(separator);
    
    // Store references
    m_filePathEdits.append(pathEdit);
    m_fileContextEdits.append(contextEdit);
    
    // Insert before the stretch
    int insertPos = m_filesLayout->count() - 1;
    m_filesLayout->insertWidget(insertPos, fileContainer);
}

void AdditionalFilesPage::onRemoveFile() {
    // Handled inline in onAddFile's lambda
}

void AdditionalFilesPage::onBrowseFile(int index) {
    if (index < 0 || index >= m_filePathEdits.size()) return;
    
    QString filter = tr("All Files (*);;Rasters (*.tif *.tiff *.img);;Vectors (*.shp *.geojson *.gpkg *.kml *.kmz);;Documents (*.pdf *.docx *.doc);;Spreadsheets (*.xlsx *.csv)");
    QString filePath = QFileDialog::getOpenFileName(this, tr("Select Additional File"), QString(), filter);
    
    if (!filePath.isEmpty()) {
        m_filePathEdits[index]->setText(filePath);
    }
}

// -------------------- SetupConfirmPage --------------------
SetupConfirmPage::SetupConfirmPage(QWidget* parent)
    : QWizardPage(parent)
{
    setTitle(tr("Confirm Project Setup"));
    setSubTitle(tr("Review details and generate AI summary"));
    
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(16,16,16,16);
    layout->setSpacing(12);
    
    m_text = new QTextEdit(this); 
    m_text->setReadOnly(true);
    
    m_generate = new QPushButton(tr("Generate AI Summary"), this);
    m_status = new QLabel("", this);
    
    layout->addWidget(m_text);
    layout->addWidget(m_generate);
    layout->addWidget(m_status);
    
    connect(m_generate, &QPushButton::clicked, this, &SetupConfirmPage::onGenerateAISummary);
}

void SetupConfirmPage::initializePage() {
    QString summary;
    summary += tr("=== PROJECT SETUP REVIEW ===\n\n");
    summary += tr("Project Name: %1\n").arg(field("projectName").toString());
    summary += tr("AOI: %1\n").arg(field("aoiPath").toString());
    summary += tr("Project Path: %1\n").arg(field("projectPath").toString());
    summary += tr("CRS: %1 (EPSG:%2)\n\n").arg(field("crsName").toString()).arg(field("epsgCode").toInt());
    
    summary += tr("=== ROUTE ENDPOINTS ===\n");
    summary += tr("Start: (%1, %2)\n").arg(field("startLat").toDouble()).arg(field("startLon").toDouble());
    summary += tr("End:   (%1, %2)\n\n").arg(field("endLat").toDouble()).arg(field("endLon").toDouble());
    
    summary += tr("=== PIPELINE SPECIFICATIONS ===\n");
    summary += tr("Type: %1\n").arg(field("pipelineType").toString());
    summary += tr("Material: %1\n").arg(field("material").toString());
    
    // Show values with their selected units
    auto* specsPage = qobject_cast<SetupSpecsPage*>(wizard()->page(2));
    if (specsPage) {
        summary += tr("MOP: %1 %2\n")
            .arg(specsPage->m_mop->value())
            .arg(specsPage->m_mopUnit->currentText());
        summary += tr("DP: %1 %2\n")
            .arg(specsPage->m_dp->value())
            .arg(specsPage->m_dpUnit->currentText());
        summary += tr("Diameter: %1 %2\n")
            .arg(specsPage->m_diameter->value())
            .arg(specsPage->m_diameterUnit->currentText());
        summary += tr("Thickness: %1 %2\n")
            .arg(specsPage->m_thickness->value())
            .arg(specsPage->m_thicknessUnit->currentText());
        summary += tr("Depth of Cover: %1 %2\n\n")
            .arg(specsPage->m_coverDepth->value())
            .arg(specsPage->m_coverDepthUnit->currentText());
    }
    
    summary += tr("Click 'Generate AI Summary' to get geographical and project-specific insights.\n");
    m_text->setPlainText(summary);
}

void SetupConfirmPage::onGenerateAISummary() {
    m_status->setText(tr("Starting AI analysis in background..."));
    m_generate->setEnabled(false);
    
    // Run in background thread to avoid freezing GUI
    QtConcurrent::run([this]() {
        runAISummaryInBackground();
    });
}

void SetupConfirmPage::runAISummaryInBackground() {
    // This runs in a background thread - use QMetaObject::invokeMethod for GUI updates
    
    // Step 1: Check AI Agent availability
    if (!CursorInterface::isCursorAgentAvailable()) {
        QMetaObject::invokeMethod(this, [this]() {
            m_status->setText(tr("⚠ AI Agent not available. Please check installation."));
            m_generate->setEnabled(true);
        }, Qt::QueuedConnection);
        return;
    }
    
    if (!CursorInterface::isCursorAgentAuthenticated()) {
        QMetaObject::invokeMethod(this, [this]() {
            m_status->setText(tr("⚠ AI Agent not authenticated. Please configure credentials."));
            m_generate->setEnabled(true);
        }, Qt::QueuedConnection);
        return;
    }
    
    QMetaObject::invokeMethod(this, [this]() {
        m_status->setText(tr("Analyzing project inputs with AI..."));
    }, Qt::QueuedConnection);
    
    // Step 2: Use Cursor Agent to analyze AOI and KMZ files
    CursorInterface cursor;
    
    QString aoiPath = field("aoiPath").toString();
    QString startKmzPath = field("startKmzPath").toString();
    QString endKmzPath = field("endKmzPath").toString();
    
    // Build list of files to analyze
    QStringList filesToAnalyze;
    if (!aoiPath.isEmpty() && QFile::exists(aoiPath)) {
        filesToAnalyze << aoiPath;
    }
    if (!startKmzPath.isEmpty() && QFile::exists(startKmzPath)) {
        filesToAnalyze << startKmzPath;
    }
    if (!endKmzPath.isEmpty() && QFile::exists(endKmzPath)) {
        filesToAnalyze << endKmzPath;
    }
    
    // Add additional files from AdditionalFilesPage
    auto* wiz = qobject_cast<ProjectSetupWizard*>(wizard());
    if (wiz) {
        auto* filesPage = qobject_cast<AdditionalFilesPage*>(wiz->page(3));
        if (filesPage) {
            for (int i = 0; i < filesPage->m_filePathEdits.size(); ++i) {
                QString filePath = filesPage->m_filePathEdits[i]->text();
                if (!filePath.isEmpty() && QFile::exists(filePath)) {
                    filesToAnalyze << filePath;
                }
            }
        }
    }
    
    if (filesToAnalyze.isEmpty()) {
        QMetaObject::invokeMethod(this, [this]() {
            m_status->setText(tr("⚠ No valid files to analyze. Please check file paths."));
            m_generate->setEnabled(true);
        }, Qt::QueuedConnection);
        return;
    }
    
    QString cursorPrompt = QString(
        "You are analyzing geospatial files for a pipeline routing project. "
        "You have access to the AGRS ZEUS toolkit with comprehensive geospatial analysis capabilities.\n\n"
        "**Available Tools (invoke via shell):**\n"
        "- AGRS ZEUS Tools: `zeus tools <command>` or `/opt/agrs/build/zeus tools <command>`\n"
        "  Examples:\n"
        "  • `zeus tools raster_query <raster> <lon> <lat>` - Query raster values\n"
        "  • `zeus tools vector_query <vector> <lon> <lat> <radius>` - Query vector features\n"
        "  • `zeus tools gpkg_translate <input> <output>` - Convert formats\n"
        "- GDAL/OGR utilities: `ogrinfo`, `gdalinfo`, `ogr2ogr`, `gdalwarp`, etc.\n"
        "- Standard shell tools: `bc`, `awk`, `jq` for calculations\n\n"
        "**Files to Analyze:**\n"
        "- AOI file: %4\n"
        "%1"
        "%2"
        "%3"
        "\n**Your Task:**\n"
        "Analyze the geospatial files using available tools. You can:\n"
        "1. Use `ogrinfo -al -so` to inspect vector files (KMZ, GeoJSON, Shapefile)\n"
        "2. Use `gdalinfo` for raster files\n"
        "3. Calculate areas, distances, and extract coordinate information\n"
        "4. Identify geographic location, terrain, and features\n\n"
        "**Provide:**\n"
        "1. Geographic location (country, region, cities nearby, centroid coordinates)\n"
        "2. Terrain characteristics and elevation (if raster data available)\n"
        "3. AOI area in square kilometers\n"
        "4. Distance between start and end points in kilometers\n"
        "5. Climate zone and environmental context\n"
        "6. Notable features: water bodies, infrastructure, land use\n"
        "7. CRS/projection details\n"
        "8. Summary of additional files (if any)\n\n"
        "Format your response with clear sections and show key commands used for transparency."
    ).arg(startKmzPath.isEmpty() ? "" : QString("- Start point: %1\n").arg(startKmzPath))
     .arg(endKmzPath.isEmpty() ? "" : QString("- End point: %1\n").arg(endKmzPath))
     .arg(filesToAnalyze.size() > 3 ? QString("- %1 additional project files\n").arg(filesToAnalyze.size() - 3) : "")
     .arg(aoiPath);
    
    QString cursorOutput = cursor.executeWithFiles(cursorPrompt, filesToAnalyze, 
                                                   CursorInterface::Model::Sonnet45, 
                                                   90000);  // 90s timeout for multiple files
    
    if (cursorOutput.isEmpty()) {
        QString errorMsg = cursor.lastError();
        if (errorMsg.isEmpty()) {
            errorMsg = "Unknown error - no output received";
        }
        cursorOutput = "AI analysis could not be completed.\nError: " + errorMsg + 
                      "\n\nProceeding with available coordinate data.";
        QMetaObject::invokeMethod(this, [this]() {
            m_status->setText(tr("⚠ AI analysis incomplete - proceeding..."));
        }, Qt::QueuedConnection);
    }
    
    QMetaObject::invokeMethod(this, [this]() {
        m_status->setText(tr("Generating comprehensive AI summary..."));
    }, Qt::QueuedConnection);
    
    // Collect additional file contexts
    QString additionalFilesInfo;
    auto* wiz2 = qobject_cast<ProjectSetupWizard*>(wizard());
    if (wiz2) {
        auto* filesPage2 = qobject_cast<AdditionalFilesPage*>(wiz2->page(3));
        if (filesPage2 && !filesPage2->m_filePathEdits.isEmpty()) {
            additionalFilesInfo = "**Additional Project Files:**\n";
            for (int i = 0; i < filesPage2->m_filePathEdits.size(); ++i) {
                QString filePath = filesPage2->m_filePathEdits[i]->text();
                if (!filePath.isEmpty()) {
                    QFileInfo fi(filePath);
                    QString context = (i < filesPage2->m_fileContextEdits.size()) 
                        ? filesPage2->m_fileContextEdits[i]->text() 
                        : QString();
                    additionalFilesInfo += QString("- %1").arg(fi.fileName());
                    if (!context.isEmpty()) {
                        additionalFilesInfo += QString(": %1").arg(context);
                    }
                    additionalFilesInfo += "\n";
                }
            }
            additionalFilesInfo += "\n";
        }
    }
    
    // Step 2: Build stakeholder-focused Perplexity prompt with properly formatted coordinates
    QString perplexityPrompt = QString(
        "You are providing a project scoping intelligence report for oil & gas pipeline project stakeholders "
        "(executives, project managers, engineers, environmental teams, legal teams).\n\n"
        "**Project Context:**\n"
        "- Project: %1\n"
        "- Pipeline: %2, %3, %4 mm diameter, MOP %5 bar\n"
        "- Route Endpoints:\n"
        "  • Start Point: Latitude %6°, Longitude %7°\n"
        "  • End Point: Latitude %8°, Longitude %9°\n"
        "%10"
        "**Geographic Analysis (from Cursor CLI analysis of AOI and project files):**\n%11\n\n"
        "**Your Task:**\n"
        "Provide critical stakeholder intelligence for this specific location. Focus on information stakeholders NEED "
        "but may NOT already know. DO NOT provide basic engineering guidance they already understand.\n\n"
        "**Required Sections:**\n\n"
        "1. **REGULATORY AUTHORITIES & PERMITTING**\n"
        "   - Specific regulatory bodies with jurisdiction (national, regional, local)\n"
        "   - Required permits and authorizations (environmental, construction, operational)\n"
        "   - Permitting timeline and process complexity\n"
        "   - Key compliance documentation required\n"
        "   - Recent regulatory changes or reform initiatives\n\n"
        "2. **GEOHAZARDS & ENVIRONMENTAL CONSTRAINTS**\n"
        "   - Seismic zones and earthquake risk (with specific hazard levels)\n"
        "   - Landslide-prone areas (identify specific locations/zones if known)\n"
        "   - Flood zones and hydrological risks\n"
        "   - Protected areas (national parks, Natura 2000 sites, UNESCO heritage)\n"
        "   - Archaeological/cultural heritage constraints\n"
        "   - Recommended authoritative geospatial datasets for route planning\n\n"
        "3. **LAND OWNERSHIP & RIGHTS-OF-WAY**\n"
        "   - Land ownership patterns (public, private, fragmented)\n"
        "   - Expropriation procedures and legal framework\n"
        "   - Easement and servitude negotiation considerations\n"
        "   - Timeline and cost implications\n\n"
        "4. **COMMUNITY & STAKEHOLDER ENGAGEMENT**\n"
        "   - Mandatory consultation requirements\n"
        "   - Indigenous or tribal considerations (if applicable)\n"
        "   - Historical precedents of local opposition to similar projects\n"
        "   - Social license considerations\n\n"
        "5. **STRATEGIC RISKS & OPPORTUNITIES**\n"
        "   - Political and regulatory uncertainties\n"
        "   - Energy market dynamics affecting project viability\n"
        "   - Cross-border coordination needs (if applicable)\n"
        "   - Potential project accelerators or incentives\n\n"
        "**Format:**\n"
        "- Use clear section headers\n"
        "- Cite all sources with [reference numbers]\n"
        "- Be specific to the geographic location\n"
        "- Focus on actionable intelligence for decision-makers\n"
        "- Include links to regulatory portals or key agencies where possible\n\n"
        "Provide information that will help stakeholders make informed decisions about project feasibility, "
        "timeline, budget, and risk mitigation strategies."
    );
    
    // Get converted values from wizard data
    ProjectSetupWizard* wizPtr = qobject_cast<ProjectSetupWizard*>(wizard());
    ProjectSetupData wizData = wizPtr ? wizPtr->data() : ProjectSetupData();
    
    perplexityPrompt = perplexityPrompt
        .arg(field("projectName").toString())           // %1 - Project name
        .arg(field("pipelineType").toString())          // %2 - Pipeline type
        .arg(field("material").toString())              // %3 - Material
        .arg(wizData.diameterMm, 0, 'f', 1)            // %4 - Diameter (converted to mm)
        .arg(wizData.mopBar, 0, 'f', 1)                // %5 - MOP (converted to bar)
        .arg(field("startLat").toDouble(), 0, 'f', 6)   // %6 - Start latitude (6 decimal places)
        .arg(field("startLon").toDouble(), 0, 'f', 6)   // %7 - Start longitude (6 decimal places)
        .arg(field("endLat").toDouble(), 0, 'f', 6)     // %8 - End latitude (6 decimal places)
        .arg(field("endLon").toDouble(), 0, 'f', 6)     // %9 - End longitude (6 decimal places)
        .arg(additionalFilesInfo)                       // %10 - Additional files info
        .arg(cursorOutput);                             // %11 - Cursor CLI geographic analysis
    
    // Step 3: Call Perplexity search
    using namespace agrs::tools;
    QString aiSummaryPath = QDir::temp().filePath("project_ai_summary.md");
    
    int rc = tools_perplexity_search(
        perplexityPrompt.toStdString(),
        "", "", "", "", "",
        "sonar-reasoning", // Perplexity's most advanced model (powered by Claude 4.5 Sonnet)
        4000,  // Max tokens for comprehensive response
        0.2,   // Temperature
        "month",
        "markdown",
        aiSummaryPath.toStdString(),
        true  // Append sources
    );
    
    // Update GUI from background thread using QMetaObject::invokeMethod
    if (rc == 0) {
        QFile f(aiSummaryPath);
        QString summary;
        if (f.open(QIODevice::ReadOnly)) {
            summary = QString::fromUtf8(f.readAll());
            f.close();
        }
        
        QMetaObject::invokeMethod(this, [this, summary]() {
            m_text->append("\n\n=== AI-GENERATED PROJECT SCOPE SUMMARY ===\n\n");
            m_text->append(summary);
            m_status->setText(tr("✓ AI summary generated successfully with sources."));
            m_generate->setEnabled(true);
        }, Qt::QueuedConnection);
    } else {
        QMetaObject::invokeMethod(this, [this]() {
            m_status->setText(tr("✗ AI summary generation failed. Check API credentials."));
            m_generate->setEnabled(true);
        }, Qt::QueuedConnection);
    }
}

void SetupConfirmPage::onAISummaryComplete(const QString& summary) {
    m_text->append("\n\n=== AI-GENERATED PROJECT SCOPE SUMMARY ===\n\n");
    m_text->append(summary);
    m_status->setText(tr("✓ AI summary generated successfully with sources."));
    m_generate->setEnabled(true);
}

void SetupConfirmPage::onAISummaryFailed(const QString& error) {
    m_status->setText(tr("✗ AI summary generation failed: %1").arg(error));
    m_generate->setEnabled(true);
}

QString SetupConfirmPage::getConfirmationText() const {
    return m_text->toPlainText();
}

bool SetupConfirmPage::validatePage() {
    // Save confirmation report to project docs folder before proceeding
    ProjectSetupWizard* wiz = qobject_cast<ProjectSetupWizard*>(wizard());
    if (wiz) {
        ProjectSetupData data = wiz->data();
        QString projectPath = QDir(data.projectPath).filePath(data.projectName);
        saveConfirmationReport(projectPath);
    }
    return true;
}

void SetupConfirmPage::saveConfirmationReport(const QString& projectPath) {
    QString docsPath = projectPath + "/docs";
    QDir().mkpath(docsPath);
    
    QString reportPath = docsPath + "/project_confirmation_report.md";
    QFile reportFile(reportPath);
    
    if (reportFile.open(QIODevice::WriteOnly | QIODevice::Text | QIODevice::Truncate)) {
        QTextStream out(&reportFile);
        
        // Write header with metadata
        out << "# Project Confirmation Report\n\n";
        out << "**Generated:** " << QDateTime::currentDateTimeUtc().toString(Qt::ISODate) << "\n";
        out << "**Report Type:** Project Setup Validation & AI Analysis\n\n";
        out << "---\n\n";
        
        // Write the confirmation page content
        QString content = getConfirmationText();
        
        // Convert plain text sections to proper markdown formatting
        QStringList lines = content.split('\n');
        for (const QString& line : lines) {
            if (line.startsWith("===") && line.endsWith("===")) {
                // Section headers
                QString header = line.mid(4, line.length() - 8).trimmed();
                out << "## " << header << "\n";
            } else if (line.trimmed().isEmpty()) {
                out << "\n";
            } else {
                out << line << "\n";
            }
        }
        
        out << "\n---\n\n";
        out << "*This report was automatically generated during project setup and contains user input validation "
            << "along with AI-generated geographical and regulatory analysis.*\n";
        
        reportFile.close();
        
        qDebug() << "[ProjectSetup] Confirmation report saved to:" << reportPath;
    } else {
        qWarning() << "[ProjectSetup] Failed to save confirmation report to:" << reportPath;
    }
}

}} // namespace agrs::gui
