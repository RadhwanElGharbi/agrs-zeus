#include "agrs_zeus/gui/DatasetAvailabilityDialog.h"
#include "agrs_zeus/gui/MapWidget.h"
#include "agrs_zeus/gui/CursorInterface.h"
#include "agrs_zeus/gui/TerminalWidget.h"
#include "agrs_zeus/Tools.h"
#include <QtConcurrent>
#include <QRegularExpression>
#include <QDateTime>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <iostream>
#include <QElapsedTimer>
#include <QPointer>
#include <QDialogButtonBox>

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFile>
#include <QDir>
#include <QHeaderView>
#include <QMessageBox>
#include <QSplitter>
#include <QGroupBox>
#include <QTextStream>
#include <QMetaObject>
#include <QtConcurrent>
#include <QFont>
#include <gdal_priv.h>
#include <ogrsf_frmts.h>

namespace agrs { namespace gui {

DatasetAvailabilityDialog::DatasetAvailabilityDialog(MapWidget* map,
                                                     const QString& aoiPath,
                                                     const QString& projectPath,
                                                     QWidget* parent,
                                                     TerminalWidget* terminalWidget)
    : QDialog(parent), m_map(map), m_aoiPath(aoiPath), m_projectPath(projectPath), m_terminalWidget(terminalWidget)
{
    setWindowTitle(tr("Dataset Availability Analysis"));
    resize(1200, 700);
    
    // Initialize Cursor CLI interface
    m_cursor = new CursorInterface(this);

    auto* mainLayout = new QVBoxLayout(this);
    
    // Splitter for table and analysis text
    auto* splitter = new QSplitter(Qt::Vertical, this);
    
    // Top section: Dataset table
    auto* tableGroup = new QGroupBox(tr("Available Datasets for AOI"), this);
    auto* tableLayout = new QVBoxLayout(tableGroup);
    
    m_table = new QTableWidget(0, 9, this);
    m_table->setHorizontalHeaderLabels({
        tr("Select"), tr("Category"), tr("Dataset"), tr("Provider"), 
        tr("Resolution"), tr("Coverage"), tr("Fetch Tool"),
        tr("Implemented"), tr("Available")
    });
    m_table->horizontalHeader()->setSectionResizeMode(QHeaderView::Interactive);
    m_table->horizontalHeader()->setStretchLastSection(false);
    m_table->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_table->setAlternatingRowColors(true);
    m_table->setSortingEnabled(true);
    
    tableLayout->addWidget(m_table);
    splitter->addWidget(tableGroup);
    
    // Bottom section: AI Analysis
    auto* analysisGroup = new QGroupBox(tr("AI Analysis Report"), this);
    auto* analysisLayout = new QVBoxLayout(analysisGroup);
    
    m_analysisText = new QTextEdit(this);
    m_analysisText->setReadOnly(true);
    m_analysisText->setMaximumHeight(200);
    analysisLayout->addWidget(m_analysisText);
    
    splitter->addWidget(analysisGroup);
    splitter->setStretchFactor(0, 3);
    splitter->setStretchFactor(1, 1);
    
    mainLayout->addWidget(splitter);
    
    // Status and buttons
    auto* bottomLayout = new QHBoxLayout();
    
    m_statusLabel = new QLabel(tr("Click 'Analyze' to start..."), this);
    bottomLayout->addWidget(m_statusLabel);
    
    m_progressBar = new QProgressBar(this);
    m_progressBar->setMaximumWidth(200);
    m_progressBar->setVisible(false);
    bottomLayout->addWidget(m_progressBar);
    
    bottomLayout->addStretch();
    
    auto* autoBtn = new QPushButton(tr("🤖 Auto (Recommended)"), this);
    autoBtn->setToolTip(tr("AI selects the best datasets for each category (highest resolution, most recent, implemented)"));
    autoBtn->setStyleSheet("QPushButton { background-color: #2a7ab0; color: white; font-weight: bold; padding: 8px; }");
    connect(autoBtn, &QPushButton::clicked, this, &DatasetAvailabilityDialog::onAutoRecommend);
    bottomLayout->addWidget(autoBtn);
    
    auto* showAllBtn = new QPushButton(tr("Show All Datasets"), this);
    showAllBtn->setToolTip(tr("View all datasets including those not covering this AOI"));
    connect(showAllBtn, &QPushButton::clicked, this, &DatasetAvailabilityDialog::onShowAllDatasets);
    bottomLayout->addWidget(showAllBtn);
    
    m_fetchBtn = new QPushButton(tr("Fetch & Load Selected"), this);
    m_fetchBtn->setEnabled(false);
    m_fetchBtn->setStyleSheet("QPushButton:enabled { background-color: #2a9d2a; color: white; font-weight: bold; padding: 8px; }");
    connect(m_fetchBtn, &QPushButton::clicked, this, &DatasetAvailabilityDialog::onFetchSelected);
    bottomLayout->addWidget(m_fetchBtn);
    
    auto* closeBtn = new QPushButton(tr("Close"), this);
    connect(closeBtn, &QPushButton::clicked, this, &QDialog::accept);
    bottomLayout->addWidget(closeBtn);
    
    mainLayout->addLayout(bottomLayout);
    
    // Initialize Cursor interface
    m_cursor = new CursorInterface(this);
}

void DatasetAvailabilityDialog::analyzeAndDisplay() {
    m_statusLabel->setText(tr("Analyzing AOI..."));
    m_progressBar->setVisible(true);
    m_progressBar->setRange(0, 0); // Indeterminate
    
    // Run analysis in background
    runAnalysisInBackground();
}

void DatasetAvailabilityDialog::runAnalysisInBackground() {
    QtConcurrent::run([this]() {
        // Step 1: Load all dataset inventories from CSV files
        QMetaObject::invokeMethod(this, [this]() {
            m_statusLabel->setText(tr("Loading dataset inventories..."));
        }, Qt::QueuedConnection);
        
        loadDatasetInventories();
        
        // Step 2: Calculate AOI centroid using GDAL
        QMetaObject::invokeMethod(this, [this]() {
            m_statusLabel->setText(tr("Calculating AOI centroid..."));
        }, Qt::QueuedConnection);
        
        QString aoiAnalysis;
        QString country;
        double centerLat = 0.0, centerLon = 0.0;
        
        // Use GDAL to get centroid
        GDALAllRegister();
        GDALDataset* ds = (GDALDataset*)GDALOpenEx(m_aoiPath.toUtf8().constData(),
                                                     GDAL_OF_VECTOR, nullptr, nullptr, nullptr);
        if (ds) {
            OGRLayer* layer = ds->GetLayer(0);
            if (layer) {
                OGREnvelope extent;
                if (layer->GetExtent(&extent) == OGRERR_NONE) {
                    centerLon = (extent.MinX + extent.MaxX) / 2.0;
                    centerLat = (extent.MinY + extent.MaxY) / 2.0;
                    
                    aoiAnalysis = QString("AOI Analysis\n\n")
                        + QString("Extent (WGS84): [%1, %2] to [%3, %4]\n")
                            .arg(extent.MinX, 0, 'f', 6)
                            .arg(extent.MinY, 0, 'f', 6)
                            .arg(extent.MaxX, 0, 'f', 6)
                            .arg(extent.MaxY, 0, 'f', 6)
                        + QString("Centroid: %1°N, %2°E\n\n")
                            .arg(centerLat, 0, 'f', 6)
                            .arg(centerLon, 0, 'f', 6);
                    
                    qDebug() << "[DatasetAvailability] AOI centroid:" << centerLat << "," << centerLon;
                }
            }
            GDALClose(ds);
        }
        
        // Step 3: Determine country from centroid coordinates using simple lookup
        QMetaObject::invokeMethod(this, [this]() {
            m_statusLabel->setText(tr("Determining location from centroid..."));
        }, Qt::QueuedConnection);
        
        // Simple country determination based on lat/lon ranges
        // This is a simplified approach - for production, use a proper geocoding service
        if (centerLat >= 35.0 && centerLat <= 47.0 && centerLon >= 6.0 && centerLon <= 19.0) {
            country = "Italy";
        } else if (centerLat >= 42.0 && centerLat <= 51.0 && centerLon >= -5.0 && centerLon <= 10.0) {
            country = "France";
        } else if (centerLat >= 47.0 && centerLat <= 55.0 && centerLon >= 5.0 && centerLon <= 15.0) {
            country = "Germany";
        } else if (centerLat >= 36.0 && centerLat <= 43.8 && centerLon >= -9.5 && centerLon <= 3.5) {
            country = "Spain";
        } else if (centerLat >= 49.0 && centerLat <= 61.0 && centerLon >= -8.0 && centerLon <= 2.0) {
            country = "United Kingdom";
        } else if (centerLat >= 24.0 && centerLat <= 49.5 && centerLon >= -125.0 && centerLon <= -66.0) {
            country = "United States";
        } else if (centerLat >= 42.0 && centerLat <= 70.0 && centerLon >= -141.0 && centerLon <= -52.0) {
            country = "Canada";
        } else if (centerLat >= 16.0 && centerLat <= 33.0 && centerLon >= 34.0 && centerLon <= 56.0) {
            country = "Saudi Arabia";
        } else if (centerLat >= 22.0 && centerLat <= 26.5 && centerLon >= 51.0 && centerLon <= 56.5) {
            country = "United Arab Emirates";
        } else if (centerLat >= -44.0 && centerLat <= -10.0 && centerLon >= 113.0 && centerLon <= 154.0) {
            country = "Australia";
        } else if (centerLat >= 18.0 && centerLat <= 54.0 && centerLon >= 73.0 && centerLon <= 135.0) {
            country = "China";
        } else if (centerLat >= 8.0 && centerLat <= 37.0 && centerLon >= 68.0 && centerLon <= 97.0) {
            country = "India";
        } else {
            // If no specific country match, leave empty to show all global datasets
            country = "";
            qDebug() << "[DatasetAvailability] Centroid" << centerLat << "," << centerLon << "- no specific country match";
        }
        
        if (!country.isEmpty()) {
            aoiAnalysis += QString("Detected Location: %1\n").arg(country);
            aoiAnalysis += QString("Showing datasets available for: Global + %1\n").arg(country);
            qDebug() << "[DatasetAvailability] Detected country from centroid:" << country;
        } else {
            aoiAnalysis += QString("Location: Unable to determine specific country\n");
            aoiAnalysis += QString("Showing: All global datasets\n");
        }
        
        // Step 4: Filter datasets based on AOI location
        QMetaObject::invokeMethod(this, [this]() {
            m_statusLabel->setText(tr("Matching datasets to AOI coverage..."));
        }, Qt::QueuedConnection);
        
        QVector<DatasetInfo> matchedDatasets;
        QMap<QString, CategoryInfo> categoryStats;
        
        qDebug() << "[DatasetAvailability] Filtering" << m_allDatasets.size() << "datasets for country:" << country;
        
        for (DatasetInfo& dataset : m_allDatasets) {
            // Determine if dataset is available for this AOI
            bool available = false;
            
            // Always include Global datasets
            if (dataset.coverage.contains("Global", Qt::CaseInsensitive)) {
                available = true;
            }
            // If we detected a country, match it against the Coverage field in CSV
            else if (!country.isEmpty()) {
                // Direct country name match in coverage
                if (dataset.coverage.contains(country, Qt::CaseInsensitive)) {
                    available = true;
                }
            }
            
            dataset.isAvailableForAOI = available;
            
            // Update category statistics
            if (!categoryStats.contains(dataset.category)) {
                CategoryInfo catInfo;
                catInfo.name = dataset.category;
                categoryStats[dataset.category] = catInfo;
            }
            
            categoryStats[dataset.category].totalDatasets++;
            if (dataset.isImplemented) {
                categoryStats[dataset.category].implementedDatasets++;
            }
            if (available) {
                categoryStats[dataset.category].availableDatasets++;
                if (dataset.isImplemented) {
                    categoryStats[dataset.category].hasImplementedForAOI = true;
                }
            }
            
            // Only show available datasets
            if (available) {
                matchedDatasets.append(dataset);
            }
        }
        
        m_categories = categoryStats;
        
        qDebug() << "[DatasetAvailability] Matched" << matchedDatasets.size() << "datasets out of" << m_allDatasets.size();
        qDebug() << "[DatasetAvailability] Categories with data:";
        for (auto it = categoryStats.constBegin(); it != categoryStats.constEnd(); ++it) {
            qDebug() << "  -" << it.key() << ":" << it.value().availableDatasets << "available," 
                     << it.value().implementedDatasets << "implemented";
        }
        
        // Step 5: Update UI on main thread
        QMetaObject::invokeMethod(this, [this, matchedDatasets, aoiAnalysis]() {
            populateTable(matchedDatasets, m_categories);
            m_analysisText->setText(aoiAnalysis);
            m_progressBar->setVisible(false);
            m_fetchBtn->setEnabled(true);
            
            int totalAvailable = matchedDatasets.size();
            int implemented = 0;
            for (const auto& ds : matchedDatasets) {
                if (ds.isImplemented) implemented++;
            }
            
            m_statusLabel->setText(tr("Analysis complete: %1 datasets available (%2 with fetch tools)")
                .arg(totalAvailable).arg(implemented));
        }, Qt::QueuedConnection);
    });
}

void DatasetAvailabilityDialog::loadDatasetInventories() {
    m_allDatasets.clear();
    
    QStringList csvFiles = {
        "/opt/agrs/data/imagery_datasets_inventory.csv",
        "/opt/agrs/data/dem_datasets_inventory.csv",
        "/opt/agrs/data/landcover_datasets_inventory.csv",
        "/opt/agrs/data/hydrology_datasets_inventory.csv",
        "/opt/agrs/data/infrastructure_datasets_inventory.csv",
        "/opt/agrs/data/protected_areas_datasets_inventory.csv",
        "/opt/agrs/data/geohazards_datasets_inventory.csv",
        "/opt/agrs/data/administrative_datasets_inventory.csv",
        "/opt/agrs/data/cadastre_datasets_inventory.csv",
        "/opt/agrs/data/socioeconomic_datasets_inventory.csv",
        "/opt/agrs/data/climate_datasets_inventory.csv"
    };
    
    QMap<QString, QString> fileToCategory = {
        {"imagery_datasets_inventory.csv", "Imagery"},
        {"dem_datasets_inventory.csv", "DEM"},
        {"landcover_datasets_inventory.csv", "Land Cover"},
        {"hydrology_datasets_inventory.csv", "Hydrology"},
        {"infrastructure_datasets_inventory.csv", "Infrastructure"},
        {"protected_areas_datasets_inventory.csv", "Protected Areas"},
        {"geohazards_datasets_inventory.csv", "Geohazards"},
        {"administrative_datasets_inventory.csv", "Administrative"},
        {"cadastre_datasets_inventory.csv", "Cadastre"},
        {"socioeconomic_datasets_inventory.csv", "Socioeconomic"},
        {"climate_datasets_inventory.csv", "Climate"}
    };
    
    for (const QString& csvPath : csvFiles) {
        QFile file(csvPath);
        if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) continue;
        
        QTextStream in(&file);
        QString header = in.readLine(); // Skip header
        
        QString category = fileToCategory.value(QFileInfo(csvPath).fileName(), "Unknown");
        
        while (!in.atEnd()) {
            QString line = in.readLine();
            QStringList fields = line.split(',');
            
            if (fields.size() < 8) continue;
            
            DatasetInfo info;
            info.category = category;
            // Fields: Country,Country_Code,Dataset_Name,Provider,Resolution_m,Data_Type,Coverage,Fetch_Tool,License,Update_Frequency,Notes
            info.datasetName = fields[2].trimmed();
            info.provider = fields[3].trimmed();
            info.resolution = fields[4].trimmed();
            info.dataType = fields[5].trimmed();
            info.coverage = fields[6].trimmed();
            info.fetchTool = fields[7].trimmed();
            info.license = (fields.size() > 8) ? fields[8].trimmed() : "";
            info.notes = (fields.size() > 10) ? fields[10].trimmed() : "";
            
            // Check if fetch tool is implemented (no "(guidance)" suffix and not empty)
            info.isImplemented = !info.fetchTool.isEmpty() && 
                                !info.fetchTool.contains("(guidance)", Qt::CaseInsensitive) &&
                                !info.fetchTool.contains("guidance", Qt::CaseInsensitive) &&
                                !info.fetchTool.contains("not_implemented", Qt::CaseInsensitive) &&
                                !info.fetchTool.contains("future", Qt::CaseInsensitive);
            
            // Debug logging for sentinel2
            if (info.fetchTool.contains("sentinel2", Qt::CaseInsensitive)) {
                qDebug() << "[CSV Parse]" << info.datasetName << "- Tool:" << info.fetchTool << "- Implemented:" << info.isImplemented;
            }
            
            m_allDatasets.append(info);
        }
        
        file.close();
    }
}

void DatasetAvailabilityDialog::populateTable(const QVector<DatasetInfo>& datasets, 
                                              const QMap<QString, CategoryInfo>& categories) {
    m_table->clearContents();
    m_table->setRowCount(datasets.size());
    m_table->setSortingEnabled(false);
    
    for (int i = 0; i < datasets.size(); ++i) {
        const DatasetInfo& ds = datasets[i];
        
        // Highlight entire row in light green if dataset is implemented
        QColor rowBgColor = ds.isImplemented ? QColor(200, 255, 200, 80) : Qt::transparent;
        
        // Checkbox for selection (only for implemented datasets)
        auto* checkItem = new QTableWidgetItem();
        checkItem->setBackground(QBrush(rowBgColor));
        if (ds.isImplemented) {
            checkItem->setFlags(checkItem->flags() | Qt::ItemIsUserCheckable);
            checkItem->setCheckState(Qt::Unchecked);
        } else {
            checkItem->setFlags(checkItem->flags() & ~Qt::ItemIsUserCheckable);
            checkItem->setText("—");
            checkItem->setForeground(QBrush(QColor(150, 150, 150)));
        }
        m_table->setItem(i, 0, checkItem);
        
        // Category
        auto* catItem = new QTableWidgetItem(ds.category);
        catItem->setBackground(QBrush(rowBgColor));
        
        // Highlight category in red if it has NO implemented fetch tools for AOI
        if (categories.contains(ds.category) && !categories[ds.category].hasImplementedForAOI) {
            catItem->setForeground(QBrush(QColor(200, 0, 0)));
            catItem->setFont(QFont(catItem->font().family(), catItem->font().pointSize(), QFont::Bold));
        }
        
        m_table->setItem(i, 1, catItem);
        
        // Dataset Name
        auto* nameItem = new QTableWidgetItem(ds.datasetName);
        nameItem->setBackground(QBrush(rowBgColor));
        if (ds.isImplemented) {
            nameItem->setFont(QFont(nameItem->font().family(), nameItem->font().pointSize(), QFont::Bold));
        }
        m_table->setItem(i, 2, nameItem);
        
        // Provider
        auto* provItem = new QTableWidgetItem(ds.provider);
        provItem->setBackground(QBrush(rowBgColor));
        m_table->setItem(i, 3, provItem);
        
        // Resolution
        auto* resItem = new QTableWidgetItem(ds.resolution);
        resItem->setBackground(QBrush(rowBgColor));
        m_table->setItem(i, 4, resItem);
        
        // Coverage
        auto* covItem = new QTableWidgetItem(ds.coverage);
        covItem->setBackground(QBrush(rowBgColor));
        m_table->setItem(i, 5, covItem);
        
        // Fetch Tool
        auto* toolItem = new QTableWidgetItem(ds.fetchTool);
        toolItem->setBackground(QBrush(rowBgColor));
        if (!ds.isImplemented) {
            toolItem->setForeground(QBrush(QColor(150, 150, 150)));
        }
        m_table->setItem(i, 6, toolItem);
        
        // Implemented
        auto* implItem = new QTableWidgetItem(ds.isImplemented ? "✓ Yes" : "✗ No");
        implItem->setTextAlignment(Qt::AlignCenter);
        implItem->setBackground(QBrush(rowBgColor));
        if (ds.isImplemented) {
            implItem->setForeground(QBrush(QColor(0, 150, 0)));
            implItem->setFont(QFont(implItem->font().family(), implItem->font().pointSize(), QFont::Bold));
        } else {
            implItem->setForeground(QBrush(QColor(200, 0, 0)));
        }
        m_table->setItem(i, 7, implItem);
        
        // Available for AOI
        auto* availItem = new QTableWidgetItem(ds.isAvailableForAOI ? "✓ Yes" : "✗ No");
        availItem->setTextAlignment(Qt::AlignCenter);
        availItem->setBackground(QBrush(rowBgColor));
        if (ds.isAvailableForAOI) {
            availItem->setForeground(QBrush(QColor(0, 150, 0)));
        } else {
            availItem->setForeground(QBrush(QColor(200, 0, 0)));
        }
        m_table->setItem(i, 8, availItem);
    }
    
    m_table->setSortingEnabled(true);
    m_table->sortByColumn(0, Qt::AscendingOrder);
    m_table->resizeColumnsToContents();
}

QString DatasetAvailabilityDialog::computeBBoxWGS84() const {
    GDALAllRegister();
    GDALDataset* ds = (GDALDataset*)GDALOpenEx(m_aoiPath.toUtf8().constData(),
                                                 GDAL_OF_VECTOR, nullptr, nullptr, nullptr);
    if (!ds) return "-180,-85,180,85";
    
    OGRLayer* layer = ds->GetLayer(0);
    if (!layer) {
        GDALClose(ds);
        return "-180,-85,180,85";
    }
    
    OGREnvelope extent;
    if (layer->GetExtent(&extent) != OGRERR_NONE) {
        GDALClose(ds);
        return "-180,-85,180,85";
    }
    
    GDALClose(ds);
    
    return QString("%1,%2,%3,%4")
        .arg(extent.MinX, 0, 'f', 6)
        .arg(extent.MinY, 0, 'f', 6)
        .arg(extent.MaxX, 0, 'f', 6)
        .arg(extent.MaxY, 0, 'f', 6);
}

void DatasetAvailabilityDialog::onAutoRecommend() {
    m_statusLabel->setText(tr("AI is analyzing datasets and AOI..."));
    m_progressBar->setVisible(true);
    m_progressBar->setRange(0, 0);
    
    // Run in background thread to prevent freezing
    QtConcurrent::run([this]() {
        qDebug() << "[AutoRecommend] Starting comprehensive analysis and fetch workflow...";
        qDebug() << "[AutoRecommend] AOI Path:" << m_aoiPath;
        qDebug() << "[AutoRecommend] Project Path:" << m_projectPath;
        
        // Read project metadata to get CRS
        QString projectMetadataPath = QDir(m_projectPath).filePath("project_metadata.json");
        QString projectCRS = "EPSG:4326"; // Default fallback
        
        QFile metaFile(projectMetadataPath);
        if (metaFile.open(QIODevice::ReadOnly)) {
            QJsonDocument doc = QJsonDocument::fromJson(metaFile.readAll());
            metaFile.close();
            if (!doc.isNull() && doc.isObject()) {
                QJsonObject obj = doc.object();
                if (obj.contains("crs") && obj["crs"].isObject()) {
                    QString epsg = obj["crs"].toObject()["epsg"].toString();
                    if (!epsg.isEmpty()) {
                        projectCRS = epsg;
                    }
                }
            }
        }
        
        qDebug() << "[AutoRecommend] Project CRS:" << projectCRS;
        
        // Get list of all files that Cursor CLI should analyze
        QDir dataDir("/opt/agrs/data");
        QStringList csvFiles = dataDir.entryList(QStringList() << "*.csv", QDir::Files);
        
        qDebug() << "[AutoRecommend] Found" << csvFiles.size() << "CSV files in /opt/agrs/data";
        
        QStringList filesToAttach;
        
        // CRITICAL: Attach AOI file first
        filesToAttach.append(m_aoiPath);
        
        // Attach Tools.cpp so AI knows what fetch tools are available
        QString toolsCpp = "/opt/agrs/src/app/Tools.cpp";
        if (QFile::exists(toolsCpp)) {
            filesToAttach.append(toolsCpp);
        }
        
        // Add all CSV files (dataset inventory)
        for (const QString& csvFile : csvFiles) {
            filesToAttach.append(dataDir.filePath(csvFile));
        }
        
        // Add key documentation files for context
        QDir docsDir("/opt/agrs/docs");
        QStringList docFiles;
        docFiles << "Project Instructions" << "dataset_routing.hpp";
        for (const QString& docFile : docFiles) {
            QString fullPath = docsDir.filePath(docFile);
            if (QFile::exists(fullPath)) {
                filesToAttach.append(fullPath);
            }
        }
        
        qDebug() << "[AutoRecommend] Attaching" << filesToAttach.size() << "files for Cursor CLI analysis";
        
        QMetaObject::invokeMethod(this, [this]() {
            m_statusLabel->setText(tr("Step 1/5: Analyzing AOI and selecting datasets..."));
            m_progressBar->setRange(0, 5);
            m_progressBar->setValue(1);
            m_progressBar->setVisible(true);
            if (m_analysisText) {
                m_analysisText->append("╔════════════════════════════════════════════════════════════════╗");
                m_analysisText->append("║          AUTO-FETCH: INTELLIGENT DATASET ACQUISITION           ║");
                m_analysisText->append("╚════════════════════════════════════════════════════════════════╝\n");
                m_analysisText->append("[Step 1/5] Analyzing AOI and selecting optimal datasets...");
            }
            if (m_terminalWidget) {
                m_terminalWidget->appendOutput("\n╔════════════════════════════════════════════════════════════════╗");
                m_terminalWidget->appendOutput("║          AUTO-FETCH: INTELLIGENT DATASET ACQUISITION           ║");
                m_terminalWidget->appendOutput("╚════════════════════════════════════════════════════════════════╝");
                m_terminalWidget->appendWithTimestamp("Starting Auto-Fetch workflow...");
                m_terminalWidget->appendOutput("[Step 1/5] Analyzing AOI and selecting optimal datasets...\n");
            }
        }, Qt::QueuedConnection);
        
        // Ensure output directories exist
        QDir().mkpath(m_projectPath + "/data/rasters");
        QDir().mkpath(m_projectPath + "/data/vectors");

        // Build comprehensive Cursor CLI prompt for auto-fetch
        QString prompt = QString(
            "You are an AI assistant with FULL READ ACCESS to /opt/agrs and its tools.\n\n"
            
            "**RESTRICTIONS:**\n"
            "- You have READ-ONLY access to /opt/agrs (tools, data CSVs, docs)\n"
            "- You can ONLY modify files within: %2\n"
            "- You MUST NOT change anything else in /opt/agrs\n\n"
            
            "**PROJECT CONTEXT:**\n"
            "- AOI File: %1\n"
            "- Project Directory (WRITE ACCESS): %2\n"
            "- Project CRS: %3\n"
            "- Available Tools: /opt/agrs/src/app/Tools.cpp\n"
            "- Dataset Inventory: /opt/agrs/data/*.csv\n"
            "- Documentation: /opt/agrs/docs/\n\n"
            
            "**YOUR AUTOMATED WORKFLOW:**\n"
            "Execute these steps IN ORDER:\n\n"
            
            "STEP 0: Analyze Available Tools\n"
            "- Review /opt/agrs/src/app/Tools.cpp to identify all fetch tools\n"
            "- Review /opt/agrs/data/*.csv to understand dataset coverage\n"
            "- You MUST use the implemented fetch tools from Tools.cpp\n\n"
            
            "STEP 1: Navigate to Project Directory\n"
            "- cd %2\n\n"
            
            "STEP 2: Analyze AOI Extent\n"
            "- Use GDAL or /opt/agrs/build/zeus tools to extract AOI bounding box\n"
            "- Determine geographic extent (minx, miny, maxx, maxy in WGS84)\n\n"
            
            "STEP 3: Intelligent Dataset Selection & Fetching\n"
            "- For EACH dataset category (DEM, Imagery, Hydrology, Land Cover, etc.):\n"
            "  * Select the BEST dataset based on:\n"
            "    - Highest resolution available\n"
            "    - Most recent/up-to-date\n"
            "    - Has implemented fetch tool in Tools.cpp\n"
            "    - Covers the AOI extent\n"
            "  * Execute the fetch tool command\n\n"
            
            "STEP 4: Clip, Mosaic, Reproject\n"
            "- Clip all fetched datasets to AOI extent\n"
            "- Mosaic if multiple tiles were fetched\n"
            "- Reproject to project CRS: %3\n"
            "- Use gdalwarp for rasters, ogr2ogr for vectors\n\n"
            
            "STEP 5: Save to Project Directory\n"
            "- Save rasters to: %2/data/rasters/\n"
            "- Save vectors to: %2/data/vectors/\n"
            "- **CRITICAL**: Use descriptive filenames that include:\n"
            "  * Source (e.g., srtm, sentinel2, esa_worldcover, osm)\n"
            "  * Date/Year of coverage (e.g., 2024, 2021)\n"
            "  * Resolution (e.g., 30m, 10m, 1m)\n"
            "  Example: dem_srtm_30m_2024.tif, landcover_esa_worldcover_10m_2021.tif\n"
            "           rivers_osm_2024.gpkg, roads_osm_1m_2024.gpkg\n\n"
            
            "STEP 6 & 7: Layer Integration (Automatic)\n"
            "- The GUI will auto-detect new files in data/rasters/ and data/vectors/\n"
            "- Files will be automatically added as layers and displayed on the map viewer\n\n"
            
            "**EXECUTION PLAN:**\n"
            "You will generate executable commands that implement ALL 7 steps:\n\n"
            
            "Commands should:\n"
            "1. Use /opt/agrs/build/zeus tools commands\n"
            "2. Extract AOI bounding box using gdalinfo or ogrinfo\n"
            "3. For each dataset category (DEM, Imagery, Hydrology, Land Cover, Infrastructure):\n"
            "   - Select BEST dataset (highest res, most recent, covers AOI, has fetch tool)\n"
            "   - Fetch using appropriate zeus tools command\n"
            "   - Include --bbox, --aoi, --to-crs, -o flags\n"
            "   - Add gdalwarp/ogr2ogr for clipping and reprojection if needed\n"
            "4. Save outputs to %2/data/rasters/ or %2/data/vectors/\n"
            "5. Use descriptive output filenames\n\n"
            
            "IMPORTANT:\n"
            "- Steps 6 & 7 (add layers to GUI, display on map) happen AUTOMATICALLY\n"
            "- The GUI watches the data folders and auto-loads new files\n"
            "- You only need to fetch and save the datasets correctly\n\n"
            
            "**TOOLS YOU CAN USE (from /opt/agrs/src/app/Tools.cpp):**\n"
            "- Use ONLY existing CLI tools registered under 'zeus tools ...' such as:\n"
            "  dem_fetch, sentinel2_fetch, copernicus_fetch, esa_worldcover_fetch,\n"
            "  osm_waterways_fetch, osm_roads_fetch, osm_power_fetch, osm_railways_fetch,\n"
            "  global_surface_water_fetch, soilgrids_fetch, worldpop_fetch, wdpa_fetch,\n"
            "  natura2000_fetch, gadm_fetch, hydrosheds_fetch, tinitaly_fetch, iffifetch, euap_fetch, ingv_seismic_fetch\n\n"
            
            "**OUTPUT FORMAT (STRICT):**\n"
            "Provide ONLY:\n"
            "COMMANDS:\n"
            "zeus tools <subcommand> --flags ...\n"
            "(one command per line, NO code fences, NO markdown)\n\n"
            
            "Example:\n"
            "COMMANDS:\n"
            "zeus tools sentinel2_fetch --bbox <minx,miny,maxx,maxy> --datetime 2024-01-01/2025-12-31 --cloud 30 -o %2/data/rasters\n"
            "zeus tools dem_fetch --bbox <minx,miny,maxx,maxy> --aoi %1 --res 30m --provider auto --to-crs %3 -o %2/data/rasters/dem_30m.tif --overwrite\n\n"
            
            "**CRITICAL REQUIREMENTS:**\n"
            "- Provide ONLY the COMMANDS: section with actual executable commands\n"
            "- Use EXACT tool names from Tools.cpp\n"
            "- Include full file paths\n"
            "- Ensure commands are in correct order (fetch → clip → reproject → mosaic)\n"
            "- Save rasters to %2/data/rasters/ and vectors to %2/data/vectors/\n"
            "- Use project CRS %3 for all reprojections\n"
            "- Create comprehensive coverage (DEM, Imagery, Hydrology, Land Cover, etc.)\n"
        ).arg(m_aoiPath).arg(m_projectPath).arg(projectCRS);
        
        // Preflight availability
        bool cursorOk = CursorInterface::isCursorAgentAvailable() && CursorInterface::isCursorAgentAuthenticated();
        QString cursorOutput;
        if (cursorOk) {
            qDebug() << "[AutoRecommend] Calling Cursor CLI for automated fetch workflow...";
            qDebug() << "[AutoRecommend] Attaching" << filesToAttach.size() << "files";

            // Update progress
            int numFiles = filesToAttach.size();
            QMetaObject::invokeMethod(this, [this, numFiles]() {
                m_statusLabel->setText(tr("Step 2/5: Cursor CLI analyzing project context..."));
                m_progressBar->setValue(2);
                if (m_analysisText) {
                    m_analysisText->append("[Step 2/5] Invoking Cursor CLI for intelligent analysis...");
                    m_analysisText->append(QString("           Attaching %1 files for context").arg(numFiles));
                }
                if (m_terminalWidget) {
                    m_terminalWidget->appendOutput("\n[Step 2/5] Invoking Cursor CLI (AI Agent)...");
                    m_terminalWidget->appendWithTimestamp(QString("Attaching %1 context files").arg(numFiles));
                }
            }, Qt::QueuedConnection);

            // Use CursorInterface for proper file attachment and streaming
            qDebug() << "[AutoRecommend] Executing Cursor CLI with" << filesToAttach.size() << "attached files";
            
            // Log start to terminal
            QMetaObject::invokeMethod(this, [this, filesToAttach]() {
                if (m_terminalWidget) {
                    m_terminalWidget->appendOutput("Cursor CLI command:");
                    m_terminalWidget->appendOutput("  cursor-agent --print --output-format text --model sonnet-4.5 \\");
                    m_terminalWidget->appendOutput("    \"<prompt>\" \\");
                    for (int i = 0; i < filesToAttach.size() && i < 5; ++i) {
                        m_terminalWidget->appendOutput(QString("    @%1 \\").arg(filesToAttach[i]));
                    }
                    if (filesToAttach.size() > 5) {
                        m_terminalWidget->appendOutput(QString("    ... and %1 more files").arg(filesToAttach.size() - 5));
                    }
                    m_terminalWidget->appendOutput("\nExecuting... (this may take up to 15 minutes)\n");
                }
            }, Qt::QueuedConnection);
            
            // Execute using CursorInterface with 15-minute timeout
            cursorOutput = m_cursor->executeWithFiles(prompt, filesToAttach, CursorInterface::Model::Sonnet45, 900000);
            
            // Stream output to terminal as it comes in
            if (!cursorOutput.isEmpty()) {
                QMetaObject::invokeMethod(this, [this, cursorOutput]() {
                    if (m_terminalWidget) {
                        m_terminalWidget->appendOutput("\n═══════ Cursor CLI Response ═══════");
                        m_terminalWidget->appendOutput(cursorOutput);
                        m_terminalWidget->appendOutput("═══════════════════════════════════\n");
                    }
                }, Qt::QueuedConnection);
            }
        } else {
            qWarning() << "[AutoRecommend] Cursor Agent unavailable or not authenticated. Using local fallback plan.";
            QMetaObject::invokeMethod(this, [this]() {
                if (m_analysisText) m_analysisText->append("⚠ Cursor unavailable/auth. Using local fallback plan.\n");
            }, Qt::QueuedConnection);
        }
        
        if (cursorOk && cursorOutput.isEmpty()) {
            qWarning() << "[AutoRecommend] Cursor CLI returned empty response or timed out";
            qWarning() << "[AutoRecommend] Error:" << m_cursor->lastError();
            QMetaObject::invokeMethod(this, [this]() {
                if (m_analysisText) m_analysisText->append("⚠ Cursor timed out. Falling back to local plan.\n");
            }, Qt::QueuedConnection);
            // Continue to fallback plan below
        }
        
        qDebug() << "[AutoRecommend] Cursor CLI response length:" << cursorOutput.length();
        qDebug() << "[AutoRecommend] Full response:\n" << cursorOutput;
        
        QMetaObject::invokeMethod(this, [this]() {
            m_statusLabel->setText(tr("Step 3/5: Parsing AI-generated fetch commands..."));
            m_progressBar->setValue(3);
            if (m_analysisText) {
                m_analysisText->append("\n[Step 3/5] Parsing commands from AI response...");
            }
            if (m_terminalWidget) {
                m_terminalWidget->appendOutput("\n[Step 3/5] Parsing AI-generated commands...");
            }
        }, Qt::QueuedConnection);
        
        // Parse COMMANDS section
        QStringList commands;
        bool inCommandsSection = false;
        
        QStringList lines = cursorOutput.split('\n');
        for (const QString& line : lines) {
            QString trimmed = line.trimmed();
            
            if (trimmed == "COMMANDS:" || trimmed.startsWith("COMMANDS:")) {
                inCommandsSection = true;
                qDebug() << "[AutoRecommend] Found COMMANDS: section";
                continue;
            }
            
            if (inCommandsSection && !trimmed.isEmpty() && !trimmed.startsWith("Example")) {
                if (trimmed.startsWith("```")) continue; // skip code fences
                if (trimmed.startsWith("SELECTED:")) continue;
                commands.append(trimmed);
                qDebug() << "[AutoRecommend] Command (raw):" << trimmed;
            }
        }
        
        // Normalize commands: enforce absolute zeus path, ensure bbox/aoi/output flags
        QString bbox = computeBBoxWGS84();
        QString zeusPath = "/opt/agrs/build/zeus";
        QStringList rasterCmds = {"sentinel2_fetch","copernicus_fetch","google_dynamicworld_fetch","global_surface_water_fetch","worldclim_fetch","modis_fetch","soilgrids_fetch","era5_fetch","corine_fetch"};
        QStringList vectorCmds = {"osm_waterways_fetch","osm_roads_fetch","osm_power_fetch","osm_railways_fetch","wdpa_fetch","natura2000_fetch","gadm_fetch","euap_fetch","iffi_fetch","tinitaly_fetch","ingv_seismic_fetch","istat_boundaries_fetch"};

        auto looksLikeZeus = [&](const QString& c){ return c.trimmed().startsWith("zeus ") || c.trimmed().startsWith(zeusPath + " "); };
        auto startsWithKnown = [&](const QString& c){
            for (const auto& k : rasterCmds) if (c.trimmed().startsWith(k)) return true;
            for (const auto& k : vectorCmds) if (c.trimmed().startsWith(k)) return true;
            if (c.trimmed().startsWith("dem_fetch")) return true;
            return false;
        };

        QString timestamp = QDateTime::currentDateTimeUtc().toString("yyyyMMdd_HHmmss");
        QStringList normalized;
        for (QString c : commands) {
            QString line = c.trimmed();
            if (line.isEmpty()) continue;
            if (line.startsWith("- ")) line = line.mid(2).trimmed();
            line.replace(QRegularExpression("^zeus\\b"), zeusPath);
            if (!looksLikeZeus(line)) {
                if (startsWithKnown(line)) {
                    line = zeusPath + " tools " + line;
                } else if (line.startsWith("tools ")) {
                    line = zeusPath + " " + line; // already includes 'tools'
                } else if (line.startsWith("/opt/agrs/build/zeus tools ")) {
                    // ok
                } else {
                    // Unknown line, skip
                    qWarning() << "[AutoRecommend] Skipping unrecognized command line:" << line;
                    continue;
                }
            }
            // DO NOT auto-add --aoi or --bbox - Cursor CLI already knows which tools need them
            // Trust the AI's command generation
            
            // Only ensure output argument if missing
            if (!line.contains(" -o ") && !line.contains(" --output ")) {
                // Decide extension by command
                bool isRaster = false; bool isVector = false;
                for (const auto& k : rasterCmds) if (line.contains(k)) { isRaster = true; break; }
                for (const auto& k : vectorCmds) if (line.contains(k)) { isVector = true; break; }
                QString outPath;
                if (line.contains("dem_fetch")) { isRaster = true; }
                if (isRaster) {
                    outPath = m_projectPath + "/data/rasters/auto_" + timestamp + ".tif";
                } else {
                    outPath = m_projectPath + "/data/vectors/auto_" + timestamp + ".gpkg";
                }
                line += " -o \"" + outPath + "\"";
            }
            // Overwrite to ensure idempotency
            if (!line.contains(" --overwrite")) line += " --overwrite";
            normalized.append(line);
            qDebug() << "[AutoRecommend] Command (normalized):" << line;
        }

        // If AI did not yield usable commands, build a local fallback plan
        if (normalized.isEmpty()) {
            qWarning() << "[AutoRecommend] No usable commands from AI. Building local fallback plan.";
            QString dtFrom = QDate::currentDate().addMonths(-12).toString("yyyy-MM-01");
            QString dtTo = QDate::currentDate().toString("yyyy-MM-dd");
            QString dateRange = dtFrom + "/" + dtTo;

            // DEM (30m auto)
            normalized.append(QString("%1 tools dem_fetch --bbox \"%2\" --aoi \"%3\" --res 30m --provider auto --to-crs %4 -o \"%5\" --overwrite")
                              .arg(zeusPath)
                              .arg(bbox)
                              .arg(m_aoiPath)
                              .arg(projectCRS)
                              .arg(m_projectPath + "/data/rasters/dem_30m.tif"));

            // Sentinel-2 imagery (bands dir)
            normalized.append(QString("%1 tools sentinel2_fetch --bbox \"%2\" --datetime %3 --cloud 30 -o \"%4\" --overwrite")
                              .arg(zeusPath)
                              .arg(bbox)
                              .arg(dateRange)
                              .arg(m_projectPath + "/data/rasters/sentinel2"));

            // Sentinel-2 mosaic + clip + reproject (to final in project CRS)
            normalized.append(QString("%1 tools mosaic %2/*.tif %3 --cutline %4 --crs %5 --cog --overwrite")
                              .arg(zeusPath)
                              .arg(m_projectPath + "/data/rasters/sentinel2")
                              .arg(m_projectPath + "/data/rasters/sentinel2_final.tif")
                              .arg(m_aoiPath)
                              .arg(projectCRS));

            // ESA WorldCover (2021)
            normalized.append(QString("%1 tools esa_worldcover_fetch --bbox \"%2\" --aoi \"%3\" -o \"%4\" --year 2021 --overwrite")
                              .arg(zeusPath)
                              .arg(bbox)
                              .arg(m_aoiPath)
                              .arg(m_projectPath + "/data/rasters/worldcover_2021.tif"));

            // Reproject/clip WorldCover to project CRS
            normalized.append(QString("gdalwarp -t_srs %1 -cutline %2 -crop_to_cutline -r nearest -of COG -co COMPRESS=DEFLATE -overwrite %3 %4")
                              .arg(projectCRS)
                              .arg(m_aoiPath)
                              .arg(m_projectPath + "/data/rasters/worldcover_2021.tif")
                              .arg(m_projectPath + "/data/rasters/worldcover_final.tif"));

            // OSM Waterways
            normalized.append(QString("%1 tools osm_waterways_fetch --bbox \"%2\" --aoi \"%3\" -o \"%4\" --overwrite")
                              .arg(zeusPath)
                              .arg(bbox)
                              .arg(m_aoiPath)
                              .arg(m_projectPath + "/data/vectors/osm_waterways.gpkg"));

            // Reproject/clip OSM Waterways to project CRS
            normalized.append(QString("ogr2ogr -t_srs %1 -clipsrc %2 -f GPKG -overwrite %3 %4")
                              .arg(projectCRS)
                              .arg(m_aoiPath)
                              .arg(m_projectPath + "/data/vectors/osm_waterways_final.gpkg")
                              .arg(m_projectPath + "/data/vectors/osm_waterways.gpkg"));
        }

        qDebug() << "[AutoRecommend] Parsed" << normalized.size() << "commands to execute";
        QStringList commandsToRun = normalized;

        // Show plan in UI console
        QMetaObject::invokeMethod(this, [this, commandsToRun]() {
            m_statusLabel->setText(tr("Step 4/5: Executing %1 fetch commands...").arg(commandsToRun.size()));
            m_progressBar->setValue(4);
            m_progressBar->setRange(0, commandsToRun.size() + 5);  // +5 for initial steps
            if (m_analysisText) {
                m_analysisText->append("\n╔════════════════════════════════════════════════════════════════╗");
                m_analysisText->append(QString("║  EXECUTION PLAN: %1 COMMANDS                              ║").arg(commandsToRun.size(), 2));
                m_analysisText->append("╚════════════════════════════════════════════════════════════════╝");
                for (int i = 0; i < commandsToRun.size(); ++i) {
                    m_analysisText->append(QString("[%1/%2] %3").arg(i+1).arg(commandsToRun.size()).arg(commandsToRun[i]));
                }
                m_analysisText->append("\n[Step 4/5] STARTING EXECUTION...\n");
            }
            if (m_terminalWidget) {
                m_terminalWidget->appendOutput("\n╔════════════════════════════════════════════════════════════════╗");
                m_terminalWidget->appendOutput(QString("║  EXECUTING %1 FETCH COMMANDS                               ║").arg(commandsToRun.size(), 2));
                m_terminalWidget->appendOutput("╚════════════════════════════════════════════════════════════════╝");
                m_terminalWidget->appendWithTimestamp(QString("Starting execution of %1 commands...").arg(commandsToRun.size()));
            }
        }, Qt::QueuedConnection);
        
        if (commands.isEmpty()) {
            qWarning() << "[AutoRecommend] No commands parsed from response";
            QMetaObject::invokeMethod(this, [this, cursorOutput]() {
                m_progressBar->setVisible(false);
                m_statusLabel->setText(tr("Command parsing failed"));
                QMessageBox::warning(this, tr("Parsing Failed"),
                    tr("Could not parse fetch commands from AI response.\n\n"
                       "Response preview:\n%1").arg(cursorOutput.left(500)));
            }, Qt::QueuedConnection);
            return;
        }
        
        // Execute commands sequentially
        int successCount = 0;
        int failCount = 0;
        QStringList executionLog;
        
        for (int i = 0; i < commandsToRun.size(); ++i) {
            QString cmd = commandsToRun[i];
            
            QMetaObject::invokeMethod(this, [this, i, commandsToRun, cmd]() {
                m_statusLabel->setText(tr("Executing command %1/%2...").arg(i+1).arg(commandsToRun.size()));
                m_progressBar->setValue(4 + i);  // +4 for initial steps
                if (m_analysisText) {
                    m_analysisText->append(QString("\n╔══════════════════════════════════════════════════════════════╗"));
                    m_analysisText->append(QString("║  COMMAND %1/%2                                                ║").arg(i+1, 2).arg(commandsToRun.size(), 2));
                    m_analysisText->append(QString("╚══════════════════════════════════════════════════════════════╝"));
                    m_analysisText->append(QString("▶ %1").arg(cmd));
                }
                if (m_terminalWidget) {
                    m_terminalWidget->appendOutput(QString("\n════════════════════════════════════════════════════════════════"));
                    m_terminalWidget->appendWithTimestamp(QString("Command %1/%2").arg(i+1).arg(commandsToRun.size()));
                    m_terminalWidget->appendOutput(QString("▶ %1").arg(cmd));
                }
            }, Qt::QueuedConnection);
            
            qDebug() << "[AutoRecommend] Executing command" << (i+1) << "of" << commandsToRun.size() << ":" << cmd;
            std::cout << "[AutoFetch] (" << (i+1) << "/" << commandsToRun.size() << ") "
                      << cmd.toStdString() << std::endl;
            
            // Execute command using system shell
            QProcess proc;
            proc.setWorkingDirectory(m_projectPath);
            proc.start("/bin/bash", QStringList() << "-c" << QString("%1").arg(cmd));

            // Stream stdout/stderr while running
            if (!proc.waitForStarted(10000)) {
                failCount++;
                executionLog.append(QString("✗ %1 (failed to start)").arg(cmd));
                qWarning() << "[AutoRecommend] Command failed to start:" << cmd;
                QMetaObject::invokeMethod(this, [this, cmd]() {
                    if (m_analysisText) m_analysisText->append("[stderr] Failed to start: " + cmd);
                }, Qt::QueuedConnection);
                continue;
            }

            int waitedMs = 0;
            const int perCmdTimeoutMs = 300000; // 5 min
            while (proc.state() != QProcess::NotRunning) {
                proc.waitForReadyRead(250);
                QByteArray outChunk = proc.readAllStandardOutput();
                QByteArray errChunk = proc.readAllStandardError();
                if (!outChunk.isEmpty()) {
                    QString text = QString::fromUtf8(outChunk);
                    std::cout << text.toStdString();
                    std::cout.flush();
                    QMetaObject::invokeMethod(this, [this, text]() {
                        if (m_analysisText) m_analysisText->append(text.trimmed());
                    }, Qt::QueuedConnection);
                }
                if (!errChunk.isEmpty()) {
                    QString text = QString::fromUtf8(errChunk);
                    std::cerr << text.toStdString();
                    std::cerr.flush();
                    QMetaObject::invokeMethod(this, [this, text]() {
                        if (m_analysisText) m_analysisText->append("[stderr] " + text.trimmed());
                    }, Qt::QueuedConnection);
                }
                waitedMs += 250;
                if (waitedMs >= perCmdTimeoutMs) {
                    proc.kill();
                    break;
                }
            }

            // Drain any remaining output
            QString output = QString::fromUtf8(proc.readAllStandardOutput());
            QString error = QString::fromUtf8(proc.readAllStandardError());
            if (!output.isEmpty()) {
                std::cout << output.toStdString();
                std::cout.flush();
                QMetaObject::invokeMethod(this, [this, output]() {
                    if (m_analysisText) m_analysisText->append(output.trimmed());
                }, Qt::QueuedConnection);
            }
            if (!error.isEmpty()) {
                std::cerr << error.toStdString();
                std::cerr.flush();
                QMetaObject::invokeMethod(this, [this, error]() {
                    if (m_analysisText) m_analysisText->append("[stderr] " + error.trimmed());
                }, Qt::QueuedConnection);
            }

            int exitCode = proc.exitCode();
            
            if (exitCode == 0) {
                successCount++;
                executionLog.append(QString("✓ %1").arg(cmd));
                qDebug() << "[AutoRecommend] Command succeeded:" << cmd;
                std::cout << "[AutoFetch] ✓ Success: " << cmd.toStdString() << std::endl;
                QMetaObject::invokeMethod(this, [this]() {
                    if (m_analysisText) {
                        m_analysisText->append("✓ SUCCESS - Dataset fetched and processed\n");
                    }
                    if (m_terminalWidget) {
                        m_terminalWidget->appendOutput("✓ SUCCESS - Dataset saved to project directory\n");
                    }
                }, Qt::QueuedConnection);
            } else {
                failCount++;
                executionLog.append(QString("✗ %1 (exit %2)").arg(cmd).arg(exitCode));
                qWarning() << "[AutoRecommend] Command failed:" << cmd;
                qWarning() << "[AutoRecommend] Error:" << error;
                std::cerr << "[AutoFetch] ✗ Failed (exit " << exitCode << "): " << cmd.toStdString() << std::endl;
                QMetaObject::invokeMethod(this, [this, exitCode, error]() {
                    if (m_analysisText) {
                        m_analysisText->append(QString("✗ FAILED (exit code %1)\n").arg(exitCode));
                        if (!error.isEmpty()) m_analysisText->append(QString("   Error: %1\n").arg(error.left(200)));
                    }
                    if (m_terminalWidget) {
                        m_terminalWidget->appendOutput(QString("✗ FAILED (exit code %1)").arg(exitCode));
                        if (!error.isEmpty()) m_terminalWidget->appendOutput(QString("   Error: %1\n").arg(error.left(200)));
                    }
                }, Qt::QueuedConnection);
            }
        }
        
        qDebug() << "[AutoRecommend] Execution complete:" << successCount << "succeeded," << failCount << "failed";
        
        // Final UI update
        QMetaObject::invokeMethod(this, [this, successCount, failCount, executionLog]() {
            m_statusLabel->setText(tr("Step 5/5: Auto-Fetch Complete!"));
            m_progressBar->setValue(m_progressBar->maximum());
            
            if (m_analysisText) {
                m_analysisText->append("\n╔════════════════════════════════════════════════════════════════╗");
                m_analysisText->append("║                    EXECUTION COMPLETE                          ║");
                m_analysisText->append("╚════════════════════════════════════════════════════════════════╝");
                m_analysisText->append(QString("✓ Successfully processed: %1 datasets").arg(successCount));
                m_analysisText->append(QString("✗ Failed: %1 datasets").arg(failCount));
            }
            if (m_terminalWidget) {
                m_terminalWidget->appendOutput("\n╔════════════════════════════════════════════════════════════════╗");
                m_terminalWidget->appendOutput("║              AUTO-FETCH WORKFLOW COMPLETE                      ║");
                m_terminalWidget->appendOutput("╚════════════════════════════════════════════════════════════════╝");
                m_terminalWidget->appendWithTimestamp(QString("Completed: %1 success, %2 failed").arg(successCount).arg(failCount));
            }
            
            m_progressBar->setVisible(false);
            
            if (successCount > 0) {
                m_statusLabel->setText(tr("✓ Auto-fetch complete: %1 datasets loaded").arg(successCount));
                
                QString msg = tr("Automated dataset fetching complete!\n\n"
                                "Successfully processed: %1 datasets\n"
                                "Failed: %2\n\n"
                                "Execution log:\n%3\n\n"
                                "All datasets have been:\n"
                                "• Downloaded\n"
                                "• Clipped to AOI\n"
                                "• Reprojected to project CRS\n"
                                "• Saved to project folders\n"
                                "• Loaded onto the map\n\n"
                                "The dialog will now close.")
                    .arg(successCount).arg(failCount).arg(executionLog.join("\n"));
                
                QMessageBox::information(this, tr("Auto-Fetch Complete"), msg);
                
                // Close the dialog
                accept();
            } else {
                m_statusLabel->setText(tr("✗ Auto-fetch failed"));
                QMessageBox::critical(this, tr("Auto-Fetch Failed"),
                    tr("All dataset fetch commands failed.\n\n"
                       "Execution log:\n%1\n\n"
                       "Please check the logs and try manual selection.")
                    .arg(executionLog.join("\n")));
            }
        }, Qt::QueuedConnection);
    });
}

void DatasetAvailabilityDialog::onFetchSelected() {
    // Collect selected datasets
    QVector<DatasetInfo> selectedDatasets;
    
    for (int i = 0; i < m_table->rowCount(); ++i) {
        auto* checkItem = m_table->item(i, 0);
        if (checkItem && checkItem->checkState() == Qt::Checked) {
            DatasetInfo info;
            info.category = m_table->item(i, 1)->text();
            info.datasetName = m_table->item(i, 2)->text();
            info.provider = m_table->item(i, 3)->text();
            info.resolution = m_table->item(i, 4)->text();
            info.fetchTool = m_table->item(i, 6)->text();
            selectedDatasets.append(info);
        }
    }
    
    if (selectedDatasets.isEmpty()) {
        QMessageBox::warning(this, tr("No Selection"),
            tr("Please select at least one dataset to fetch."));
        return;
    }
    
    // Confirm with user
    QString msg = tr("You have selected %1 datasets to fetch and load:\n\n").arg(selectedDatasets.size());
    for (const DatasetInfo& ds : selectedDatasets) {
        msg += QString("• %1 - %2\n").arg(ds.category).arg(ds.datasetName);
    }
    msg += tr("\nThis will:\n");
    msg += tr("1. Download the datasets\n");
    msg += tr("2. Clip to AOI extent\n");
    msg += tr("3. Reproject to project CRS\n");
    msg += tr("4. Mosaic if needed\n");
    msg += tr("5. Load onto the map\n\n");
    msg += tr("Proceed?");
    
    auto reply = QMessageBox::question(this, tr("Confirm Fetch"), msg,
                                      QMessageBox::Yes | QMessageBox::No);
    
    if (reply == QMessageBox::Yes) {
        // Launch background fetch workflow
        m_statusLabel->setText(tr("Fetching %1 datasets...").arg(selectedDatasets.size()));
        m_progressBar->setVisible(true);
        m_progressBar->setRange(0, selectedDatasets.size());
        m_progressBar->setValue(0);
        
        if (m_analysisText) {
            m_analysisText->append("\n╔════════════════════════════════════════════════════════════════╗");
            m_analysisText->append("║          MANUAL FETCH: SELECTED DATASETS                       ║");
            m_analysisText->append("╚════════════════════════════════════════════════════════════════╝\n");
            m_analysisText->append(QString("Fetching %1 selected datasets...\n").arg(selectedDatasets.size()));
        }
        if (m_terminalWidget) {
            m_terminalWidget->appendOutput("\n╔════════════════════════════════════════════════════════════════╗");
            m_terminalWidget->appendOutput("║          MANUAL FETCH: SELECTED DATASETS                       ║");
            m_terminalWidget->appendOutput("╚════════════════════════════════════════════════════════════════╝");
            m_terminalWidget->appendWithTimestamp(QString("Starting fetch of %1 datasets...").arg(selectedDatasets.size()));
        }
        
        // Run fetch in background thread
        QtConcurrent::run([this, selectedDatasets]() {
            int successCount = 0;
            int failCount = 0;
            QString bbox = computeBBoxWGS84();
            QString zeusPath = "/opt/agrs/build/zeus";
            
            // Read project CRS
            QString projectCRS = "EPSG:4326";  // default
            QFile projMeta(m_projectPath + "/project_metadata.json");
            if (projMeta.open(QIODevice::ReadOnly)) {
                QJsonDocument doc = QJsonDocument::fromJson(projMeta.readAll());
                if (doc.isObject()) {
                    QString epsg = doc.object()["crs_epsg"].toString();
                    if (!epsg.isEmpty()) projectCRS = epsg;
                }
            }
            
            for (int i = 0; i < selectedDatasets.size(); ++i) {
                const DatasetInfo& ds = selectedDatasets[i];
                
                // Update progress
                QMetaObject::invokeMethod(this, [this, i, selectedDatasets, ds]() {
                    m_statusLabel->setText(tr("Fetching %1/%2: %3...").arg(i+1).arg(selectedDatasets.size()).arg(ds.datasetName));
                    m_progressBar->setValue(i);
                    if (m_analysisText) {
                        m_analysisText->append(QString("\n[%1/%2] %3 - %4").arg(i+1).arg(selectedDatasets.size()).arg(ds.category).arg(ds.datasetName));
                    }
                    if (m_terminalWidget) {
                        m_terminalWidget->appendOutput(QString("\n[%1/%2] Fetching: %3").arg(i+1).arg(selectedDatasets.size()).arg(ds.datasetName));
                    }
                }, Qt::QueuedConnection);
                
                // Construct fetch command based on dataset
                QString cmd;
                QString outputPath;
                
                // Determine if raster or vector
                bool isRaster = (ds.dataType.contains("raster", Qt::CaseInsensitive) || 
                                ds.category.contains("Elevation", Qt::CaseInsensitive) ||
                                ds.category.contains("Imagery", Qt::CaseInsensitive) ||
                                ds.category.contains("Land Cover", Qt::CaseInsensitive) ||
                                ds.category.contains("Soil", Qt::CaseInsensitive));
                
                QString outputDir = isRaster ? m_projectPath + "/data/rasters" : m_projectPath + "/data/vectors";
                QString outputExt = isRaster ? ".tif" : ".gpkg";
                QString outputFilename = ds.datasetName.toLower().replace(" ", "_").replace("/", "_") + outputExt;
                outputPath = outputDir + "/" + outputFilename;
                
                // Build command from fetch tool name
                QString fetchTool = ds.fetchTool;
                if (!fetchTool.isEmpty() && ds.isImplemented) {
                    cmd = QString("%1 tools %2 --bbox \"%3\" --aoi \"%4\" -o \"%5\" --overwrite")
                        .arg(zeusPath).arg(fetchTool).arg(bbox).arg(m_aoiPath).arg(outputPath);
                    
                    // Log the command being executed
                    QMetaObject::invokeMethod(this, [this, cmd]() {
                        if (m_analysisText) m_analysisText->append(QString("  Command: %1").arg(cmd));
                        if (m_terminalWidget) m_terminalWidget->appendOutput(QString("  $ %1").arg(cmd));
                    }, Qt::QueuedConnection);
                } else {
                    QMetaObject::invokeMethod(this, [this, fetchTool, ds]() {
                        if (m_analysisText) {
                            m_analysisText->append(QString("  ⊘ SKIPPED - No implemented fetch tool (tool: '%1', implemented: %2)")
                                .arg(fetchTool).arg(ds.isImplemented ? "yes" : "no"));
                        }
                        if (m_terminalWidget) {
                            m_terminalWidget->appendOutput(QString("  ⊘ SKIPPED - No fetch tool available (tool: '%1', implemented: %2)")
                                .arg(fetchTool).arg(ds.isImplemented ? "yes" : "no"));
                        }
                    }, Qt::QueuedConnection);
                    failCount++;
                    continue;
                }
                
                // Execute command
                QProcess proc;
                proc.setProcessChannelMode(QProcess::MergedChannels); // Merge stdout and stderr
                proc.setWorkingDirectory(m_projectPath);
                proc.start("/bin/bash", QStringList() << "-c" << cmd);
                
                if (!proc.waitForStarted(10000)) {
                    failCount++;
                    QString errorMsg = proc.errorString();
                    QMetaObject::invokeMethod(this, [this, errorMsg]() {
                        if (m_analysisText) m_analysisText->append(QString("  ✗ FAILED - Could not start: %1").arg(errorMsg));
                        if (m_terminalWidget) m_terminalWidget->appendOutput(QString("  ✗ FAILED - Process failed to start: %1").arg(errorMsg));
                    }, Qt::QueuedConnection);
                    continue;
                }
                
                // Wait with timeout (5 minutes per dataset), with live output streaming
                QElapsedTimer cmdTimer;
                cmdTimer.start();
                const qint64 cmdTimeout = 300000; // 5 minutes
                
                while (proc.state() != QProcess::NotRunning) {
                    proc.waitForReadyRead(500);
                    QByteArray output = proc.readAll();
                    if (!output.isEmpty()) {
                        QString text = QString::fromUtf8(output);
                        QMetaObject::invokeMethod(this, [this, text]() {
                            if (m_analysisText) m_analysisText->append(text.trimmed());
                            if (m_terminalWidget) m_terminalWidget->appendOutput(text.trimmed());
                        }, Qt::QueuedConnection);
                        std::cout << text.toStdString() << std::flush;
                    }
                    if (cmdTimer.elapsed() > cmdTimeout) {
                        proc.kill();
                        break;
                    }
                }
                
                // Read any remaining output
                QByteArray remaining = proc.readAll();
                if (!remaining.isEmpty()) {
                    QString text = QString::fromUtf8(remaining);
                    QMetaObject::invokeMethod(this, [this, text]() {
                        if (m_analysisText) m_analysisText->append(text.trimmed());
                        if (m_terminalWidget) m_terminalWidget->appendOutput(text.trimmed());
                    }, Qt::QueuedConnection);
                    std::cout << text.toStdString() << std::flush;
                }
                
                if (cmdTimer.elapsed() > cmdTimeout) {
                    failCount++;
                    QMetaObject::invokeMethod(this, [this]() {
                        if (m_analysisText) m_analysisText->append("  ✗ FAILED - Timeout (5 min)");
                        if (m_terminalWidget) m_terminalWidget->appendOutput("  ✗ FAILED - Command timed out");
                    }, Qt::QueuedConnection);
                    continue;
                }
                
                if (proc.exitCode() == 0) {
                    successCount++;
                    QMetaObject::invokeMethod(this, [this, outputPath]() {
                        if (m_analysisText) m_analysisText->append(QString("  ✓ SUCCESS - Saved to: %1").arg(outputPath));
                        if (m_terminalWidget) m_terminalWidget->appendOutput("  ✓ SUCCESS - Dataset fetched and processed");
                    }, Qt::QueuedConnection);
                } else {
                    failCount++;
                    int exitCode = proc.exitCode();
                    QMetaObject::invokeMethod(this, [this, exitCode]() {
                        if (m_analysisText) m_analysisText->append(QString("  ✗ FAILED - Exit code: %1").arg(exitCode));
                        if (m_terminalWidget) m_terminalWidget->appendOutput(QString("  ✗ FAILED - Command failed with exit code %1").arg(exitCode));
                    }, Qt::QueuedConnection);
                }
            }
            
            // Final summary
            QMetaObject::invokeMethod(this, [this, successCount, failCount, selectedDatasets]() {
                m_progressBar->setValue(selectedDatasets.size());
                m_statusLabel->setText(tr("Fetch complete: %1 success, %2 failed").arg(successCount).arg(failCount));
                
                if (m_analysisText) {
                    m_analysisText->append("\n╔════════════════════════════════════════════════════════════════╗");
                    m_analysisText->append("║                    FETCH COMPLETE                              ║");
                    m_analysisText->append("╚════════════════════════════════════════════════════════════════╝");
                    m_analysisText->append(QString("✓ Success: %1 datasets").arg(successCount));
                    m_analysisText->append(QString("✗ Failed: %1 datasets\n").arg(failCount));
                }
                if (m_terminalWidget) {
                    m_terminalWidget->appendOutput("\n╔════════════════════════════════════════════════════════════════╗");
                    m_terminalWidget->appendOutput("║              MANUAL FETCH COMPLETE                             ║");
                    m_terminalWidget->appendOutput("╚════════════════════════════════════════════════════════════════╝");
                    m_terminalWidget->appendWithTimestamp(QString("Completed: %1 success, %2 failed").arg(successCount).arg(failCount));
                }
                
                QMessageBox::information(this, tr("Fetch Complete"),
                    tr("Dataset fetching complete!\n\n"
                       "Successfully fetched: %1\n"
                       "Failed: %2\n\n"
                       "All datasets have been saved to the project directory.\n"
                       "The GUI will auto-load them onto the map viewer.").arg(successCount).arg(failCount));
                
                m_progressBar->setVisible(false);
                
                if (successCount > 0) {
                    accept();  // Close dialog
                }
            }, Qt::QueuedConnection);
        });
    }
}

void DatasetAvailabilityDialog::onShowAllDatasets() {
    // Create a new dialog to show all datasets
    QDialog* allDatasetsDialog = new QDialog(this);
    allDatasetsDialog->setWindowTitle(tr("All Datasets (Including Non-Relevant)"));
    allDatasetsDialog->resize(1200, 700);
    
    auto* layout = new QVBoxLayout(allDatasetsDialog);
    
    // Info label
    auto* infoLabel = new QLabel(
        tr("Showing ALL datasets from inventory, including those not covering the AOI.\n"
           "Green rows = Implemented fetch tools available"),
        allDatasetsDialog);
    infoLabel->setStyleSheet("color: #aaa; padding: 10px; background-color: #2a2a2a;");
    layout->addWidget(infoLabel);
    
    // Create table with same structure
    QTableWidget* allTable = new QTableWidget(0, 8, allDatasetsDialog);
    allTable->setHorizontalHeaderLabels({
        tr("Category"), tr("Dataset"), tr("Provider"), 
        tr("Resolution"), tr("Coverage"), tr("Fetch Tool"),
        tr("Implemented"), tr("Available")
    });
    allTable->horizontalHeader()->setSectionResizeMode(QHeaderView::Interactive);
    allTable->horizontalHeader()->setStretchLastSection(false);
    allTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    allTable->setAlternatingRowColors(true);
    allTable->setSortingEnabled(false);
    
    // Populate with ALL datasets
    allTable->setRowCount(m_allDatasets.size());
    
    for (int i = 0; i < m_allDatasets.size(); ++i) {
        const DatasetInfo& ds = m_allDatasets[i];
        
        // Highlight entire row in light green if dataset is implemented
        QColor rowBgColor = ds.isImplemented ? QColor(200, 255, 200, 80) : Qt::transparent;
        
        // Category
        auto* catItem = new QTableWidgetItem(ds.category);
        catItem->setBackground(QBrush(rowBgColor));
        allTable->setItem(i, 0, catItem);
        
        // Dataset Name
        auto* nameItem = new QTableWidgetItem(ds.datasetName);
        nameItem->setBackground(QBrush(rowBgColor));
        if (ds.isImplemented) {
            nameItem->setFont(QFont(nameItem->font().family(), nameItem->font().pointSize(), QFont::Bold));
        }
        allTable->setItem(i, 1, nameItem);
        
        // Provider
        auto* provItem = new QTableWidgetItem(ds.provider);
        provItem->setBackground(QBrush(rowBgColor));
        allTable->setItem(i, 2, provItem);
        
        // Resolution
        auto* resItem = new QTableWidgetItem(ds.resolution);
        resItem->setBackground(QBrush(rowBgColor));
        allTable->setItem(i, 3, resItem);
        
        // Coverage
        auto* covItem = new QTableWidgetItem(ds.coverage);
        covItem->setBackground(QBrush(rowBgColor));
        allTable->setItem(i, 4, covItem);
        
        // Fetch Tool
        auto* toolItem = new QTableWidgetItem(ds.fetchTool);
        toolItem->setBackground(QBrush(rowBgColor));
        if (!ds.isImplemented) {
            toolItem->setForeground(QBrush(QColor(150, 150, 150)));
        }
        allTable->setItem(i, 5, toolItem);
        
        // Implemented
        auto* implItem = new QTableWidgetItem(ds.isImplemented ? "✓ Yes" : "✗ No");
        implItem->setTextAlignment(Qt::AlignCenter);
        implItem->setBackground(QBrush(rowBgColor));
        if (ds.isImplemented) {
            implItem->setForeground(QBrush(QColor(0, 150, 0)));
            implItem->setFont(QFont(implItem->font().family(), implItem->font().pointSize(), QFont::Bold));
        } else {
            implItem->setForeground(QBrush(QColor(200, 0, 0)));
        }
        allTable->setItem(i, 6, implItem);
        
        // Available for AOI
        auto* availItem = new QTableWidgetItem(ds.isAvailableForAOI ? "✓ Yes" : "✗ No");
        availItem->setTextAlignment(Qt::AlignCenter);
        availItem->setBackground(QBrush(rowBgColor));
        if (ds.isAvailableForAOI) {
            availItem->setForeground(QBrush(QColor(0, 150, 0)));
        } else {
            availItem->setForeground(QBrush(QColor(200, 0, 0)));
        }
        allTable->setItem(i, 7, availItem);
    }
    
    allTable->setSortingEnabled(true);
    allTable->sortByColumn(0, Qt::AscendingOrder);
    allTable->resizeColumnsToContents();
    
    layout->addWidget(allTable);
    
    // Close button
    auto* closeBtn = new QPushButton(tr("Close"), allDatasetsDialog);
    connect(closeBtn, &QPushButton::clicked, allDatasetsDialog, &QDialog::accept);
    layout->addWidget(closeBtn);
    
    allDatasetsDialog->exec();
    allDatasetsDialog->deleteLater();
}

void DatasetAvailabilityDialog::onAnalysisComplete() {
    // Slot for future use
}

void DatasetAvailabilityDialog::onAnalysisFailed() {
    m_progressBar->setVisible(false);
    m_statusLabel->setText(tr("Analysis failed. Please check the AOI file."));
    QMessageBox::critical(this, tr("Analysis Error"),
        tr("Failed to analyze AOI. Please ensure the file is valid."));
}

}} // namespace agrs::gui
