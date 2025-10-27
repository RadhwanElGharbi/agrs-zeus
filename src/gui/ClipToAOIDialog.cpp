#include "agrs_zeus/gui/ClipToAOIDialog.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGroupBox>
#include <QDir>
#include <QFileInfo>
#include <QMessageBox>
#include <QProcess>
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QJsonObject>
#include <iostream>

namespace agrs {
namespace gui {

ClipToAOIDialog::ClipToAOIDialog(const QString& projectDir, const QString& aoiPath, QWidget* parent)
    : QDialog(parent)
    , m_projectDir(projectDir)
    , m_aoiPath(aoiPath)
{
    setWindowTitle(tr("Clip Layers to AOI"));
    resize(700, 600);
    
    // Load project CRS from metadata
    loadProjectCRS();
    
    setupUI();
    populateLayerLists();
}

void ClipToAOIDialog::loadProjectCRS() {
    // Default fallback
    m_projectCRS = "EPSG:4326";
    
    QString projectMetadataPath = QDir(m_projectDir).filePath("project_metadata.json");
    
    QFile metaFile(projectMetadataPath);
    if (metaFile.open(QIODevice::ReadOnly)) {
        QJsonDocument doc = QJsonDocument::fromJson(metaFile.readAll());
        metaFile.close();
        
        if (!doc.isNull() && doc.isObject()) {
            QJsonObject obj = doc.object();
            if (obj.contains("crs_epsg")) {
                QString epsg = obj["crs_epsg"].toString();
                if (!epsg.isEmpty()) {
                    m_projectCRS = epsg;
                }
            }
        }
    }
    
    std::cout << "[ClipToAOI] Project CRS: " << m_projectCRS.toStdString() << std::endl;
}

void ClipToAOIDialog::setupUI() {
    auto* mainLayout = new QVBoxLayout(this);
    
    // Info label
    auto* infoLabel = new QLabel(tr(
        "<b>Clip and Reproject Layers to Area of Interest</b><br>"
        "Select layers to clip to the AOI extent. Clipped layers will be saved with '_clipped' suffix."
    ));
    infoLabel->setWordWrap(true);
    mainLayout->addWidget(infoLabel);
    
    // Rasters group
    auto* rastersGroup = new QGroupBox(tr("Raster Layers"));
    auto* rastersLayout = new QVBoxLayout(rastersGroup);
    
    m_rasterList = new QListWidget();
    m_rasterList->setSelectionMode(QAbstractItemView::MultiSelection);
    rastersLayout->addWidget(m_rasterList);
    
    m_selectAllRastersBtn = new QPushButton(tr("Select All Rasters"));
    connect(m_selectAllRastersBtn, &QPushButton::clicked, this, &ClipToAOIDialog::onSelectAllRasters);
    rastersLayout->addWidget(m_selectAllRastersBtn);
    
    mainLayout->addWidget(rastersGroup);
    
    // Vectors group
    auto* vectorsGroup = new QGroupBox(tr("Vector Layers"));
    auto* vectorsLayout = new QVBoxLayout(vectorsGroup);
    
    m_vectorList = new QListWidget();
    m_vectorList->setSelectionMode(QAbstractItemView::MultiSelection);
    vectorsLayout->addWidget(m_vectorList);
    
    m_selectAllVectorsBtn = new QPushButton(tr("Select All Vectors"));
    connect(m_selectAllVectorsBtn, &QPushButton::clicked, this, &ClipToAOIDialog::onSelectAllVectors);
    vectorsLayout->addWidget(m_selectAllVectorsBtn);
    
    mainLayout->addWidget(vectorsGroup);
    
    // Options group
    auto* optionsGroup = new QGroupBox(tr("Options"));
    auto* optionsLayout = new QFormLayout(optionsGroup);
    
    m_reprojectCheckBox = new QCheckBox(tr("Reproject to AOI CRS"));
    m_reprojectCheckBox->setChecked(true);
    m_reprojectCheckBox->setToolTip(tr("Reproject layers to match the AOI's coordinate reference system"));
    optionsLayout->addRow(m_reprojectCheckBox);
    
    m_suffixEdit = new QLineEdit("_clipped");
    m_suffixEdit->setToolTip(tr("Suffix to add to clipped layer filenames"));
    optionsLayout->addRow(tr("Output Suffix:"), m_suffixEdit);
    
    mainLayout->addWidget(optionsGroup);
    
    // Progress bar
    m_progressBar = new QProgressBar();
    m_progressBar->setVisible(false);
    mainLayout->addWidget(m_progressBar);
    
    // Status label
    m_statusLabel = new QLabel();
    m_statusLabel->setVisible(false);
    mainLayout->addWidget(m_statusLabel);
    
    // Log output
    m_logText = new QTextEdit();
    m_logText->setReadOnly(true);
    m_logText->setMaximumHeight(150);
    m_logText->setVisible(false);
    mainLayout->addWidget(m_logText);
    
    // Buttons
    auto* buttonLayout = new QHBoxLayout();
    buttonLayout->addStretch();
    
    m_clipButton = new QPushButton(tr("Clip Selected Layers"));
    m_clipButton->setDefault(true);
    connect(m_clipButton, &QPushButton::clicked, this, &ClipToAOIDialog::onClipLayers);
    buttonLayout->addWidget(m_clipButton);
    
    m_cancelButton = new QPushButton(tr("Cancel"));
    connect(m_cancelButton, &QPushButton::clicked, this, &QDialog::reject);
    buttonLayout->addWidget(m_cancelButton);
    
    mainLayout->addLayout(buttonLayout);
}

void ClipToAOIDialog::populateLayerLists() {
    // Populate raster list
    QDir rastersDir(m_projectDir + "/data/rasters");
    if (rastersDir.exists()) {
        QStringList filters;
        filters << "*.tif" << "*.tiff" << "*.vrt" << "*.img";
        QFileInfoList rasterFiles = rastersDir.entryInfoList(filters, QDir::Files);
        
        for (const QFileInfo& fileInfo : rasterFiles) {
            // Skip already clipped files
            if (fileInfo.fileName().contains("_clipped")) {
                continue;
            }
            
            auto* item = new QListWidgetItem(fileInfo.fileName(), m_rasterList);
            item->setData(Qt::UserRole, fileInfo.absoluteFilePath());
            item->setToolTip(fileInfo.absoluteFilePath());
        }
        
        // Check subdirectories
        QFileInfoList subDirs = rastersDir.entryInfoList(QDir::Dirs | QDir::NoDotAndDotDot);
        for (const QFileInfo& dirInfo : subDirs) {
            QDir subDir(dirInfo.absoluteFilePath());
            QFileInfoList subFiles = subDir.entryInfoList(filters, QDir::Files);
            
            for (const QFileInfo& fileInfo : subFiles) {
                if (fileInfo.fileName().contains("_clipped")) {
                    continue;
                }
                
                QString displayName = dirInfo.fileName() + "/" + fileInfo.fileName();
                auto* item = new QListWidgetItem(displayName, m_rasterList);
                item->setData(Qt::UserRole, fileInfo.absoluteFilePath());
                item->setToolTip(fileInfo.absoluteFilePath());
            }
        }
    }
    
    // Populate vector list
    QDir vectorsDir(m_projectDir + "/data/vectors");
    if (vectorsDir.exists()) {
        QStringList filters;
        filters << "*.gpkg" << "*.shp" << "*.geojson" << "*.kml" << "*.kmz";
        QFileInfoList vectorFiles = vectorsDir.entryInfoList(filters, QDir::Files);
        
        for (const QFileInfo& fileInfo : vectorFiles) {
            // Skip already clipped files and JSON metadata
            if (fileInfo.fileName().contains("_clipped") || 
                (fileInfo.suffix() == "json" && !fileInfo.fileName().endsWith(".geojson"))) {
                continue;
            }
            
            auto* item = new QListWidgetItem(fileInfo.fileName(), m_vectorList);
            item->setData(Qt::UserRole, fileInfo.absoluteFilePath());
            item->setToolTip(fileInfo.absoluteFilePath());
        }
    }
}

void ClipToAOIDialog::onSelectAllRasters() {
    for (int i = 0; i < m_rasterList->count(); ++i) {
        m_rasterList->item(i)->setSelected(true);
    }
}

void ClipToAOIDialog::onSelectAllVectors() {
    for (int i = 0; i < m_vectorList->count(); ++i) {
        m_vectorList->item(i)->setSelected(true);
    }
}

void ClipToAOIDialog::onClipLayers() {
    // Validate selections
    QList<QListWidgetItem*> selectedRasters = m_rasterList->selectedItems();
    QList<QListWidgetItem*> selectedVectors = m_vectorList->selectedItems();
    
    if (selectedRasters.isEmpty() && selectedVectors.isEmpty()) {
        QMessageBox::warning(this, tr("No Layers Selected"),
            tr("Please select at least one raster or vector layer to clip."));
        return;
    }
    
    // Check if AOI exists
    if (!QFile::exists(m_aoiPath)) {
        QMessageBox::critical(this, tr("AOI Not Found"),
            tr("AOI file not found: %1").arg(m_aoiPath));
        return;
    }
    
    // Show confirmation
    int totalLayers = selectedRasters.count() + selectedVectors.count();
    QString message = tr("Clip %1 layer(s) to AOI?\n\nThis will create new files with '%2' suffix.")
        .arg(totalLayers)
        .arg(m_suffixEdit->text());
    
    auto reply = QMessageBox::question(this, tr("Confirm Clipping"), message,
        QMessageBox::Yes | QMessageBox::No);
    
    if (reply != QMessageBox::Yes) {
        return;
    }
    
    // Start clipping
    m_clipping = true;
    m_clipButton->setEnabled(false);
    m_progressBar->setVisible(true);
    m_progressBar->setMaximum(totalLayers);
    m_progressBar->setValue(0);
    m_statusLabel->setVisible(true);
    m_logText->setVisible(true);
    m_logText->clear();
    
    logMessage(tr("Starting clipping operation..."));
    logMessage(tr("AOI: %1").arg(QFileInfo(m_aoiPath).fileName()));
    logMessage(tr("Total layers to clip: %1").arg(totalLayers));
    logMessage(tr(""));
    
    int current = 0;
    int succeeded = 0;
    int failed = 0;
    
    // Process rasters
    for (QListWidgetItem* item : selectedRasters) {
        QString inputPath = item->data(Qt::UserRole).toString();
        QFileInfo inputInfo(inputPath);
        
        QString outputName = inputInfo.completeBaseName() + m_suffixEdit->text() + "." + inputInfo.suffix();
        QString outputPath = inputInfo.absolutePath() + "/" + outputName;
        
        current++;
        updateProgress(current, totalLayers, inputInfo.fileName());
        
        logMessage(tr("[%1/%2] Clipping raster: %3")
            .arg(current).arg(totalLayers).arg(inputInfo.fileName()));
        
        if (clipRasterLayer(inputPath, outputPath, m_aoiPath)) {
            logMessage(tr("  ✓ Success: %1").arg(outputName));
            succeeded++;
        } else {
            logMessage(tr("  ✗ Failed: %1").arg(inputInfo.fileName()));
            failed++;
        }
        
        QCoreApplication::processEvents();
    }
    
    // Process vectors
    for (QListWidgetItem* item : selectedVectors) {
        QString inputPath = item->data(Qt::UserRole).toString();
        QFileInfo inputInfo(inputPath);
        
        QString outputName = inputInfo.completeBaseName() + m_suffixEdit->text() + "." + inputInfo.suffix();
        QString outputPath = inputInfo.absolutePath() + "/" + outputName;
        
        current++;
        updateProgress(current, totalLayers, inputInfo.fileName());
        
        logMessage(tr("[%1/%2] Clipping vector: %3")
            .arg(current).arg(totalLayers).arg(inputInfo.fileName()));
        
        if (clipVectorLayer(inputPath, outputPath, m_aoiPath)) {
            logMessage(tr("  ✓ Success: %1").arg(outputName));
            succeeded++;
        } else {
            logMessage(tr("  ✗ Failed: %1").arg(inputInfo.fileName()));
            failed++;
        }
        
        QCoreApplication::processEvents();
    }
    
    // Show completion message
    logMessage(tr(""));
    logMessage(tr("=== Clipping Complete ==="));
    logMessage(tr("Total: %1 | Succeeded: %2 | Failed: %3")
        .arg(totalLayers).arg(succeeded).arg(failed));
    
    m_clipping = false;
    m_clipButton->setEnabled(true);
    m_statusLabel->setText(tr("Clipping complete! Close dialog to refresh layers."));
    
    QMessageBox::information(this, tr("Clipping Complete"),
        tr("Clipped %1 of %2 layers successfully.\n\nClose this dialog to see the new layers.")
        .arg(succeeded).arg(totalLayers));
}

bool ClipToAOIDialog::clipRasterLayer(const QString& inputPath, const QString& outputPath, const QString& aoiPath) {
    // Use gdalwarp to clip and optionally reproject raster
    QProcess process;
    QStringList args;
    
    // Input and output files
    args << "-of" << "GTiff";
    args << "-co" << "COMPRESS=LZW";
    args << "-co" << "TILED=YES";
    args << "-co" << "BIGTIFF=IF_SAFER";
    
    // Clip to AOI extent using cutline
    args << "-cutline" << aoiPath;
    args << "-crop_to_cutline";
    args << "-dstalpha";  // Add alpha band for transparent areas outside AOI
    
    // Reproject to project CRS if requested
    if (m_reprojectCheckBox->isChecked()) {
        args << "-t_srs" << m_projectCRS;
    }
    
    // Resampling method
    args << "-r" << "bilinear";
    
    // Input and output paths (must be last)
    args << inputPath;
    args << outputPath;
    
    logMessage(tr("  Command: gdalwarp %1").arg(args.join(" ")));
    
    process.start("gdalwarp", args);
    
    if (!process.waitForStarted()) {
        logMessage(tr("  Error: Failed to start gdalwarp"));
        return false;
    }
    
    if (!process.waitForFinished(300000)) {  // 5 minute timeout
        logMessage(tr("  Error: gdalwarp timeout"));
        process.kill();
        return false;
    }
    
    if (process.exitCode() != 0) {
        QString error = process.readAllStandardError();
        logMessage(tr("  gdalwarp stderr: %1").arg(error.simplified()));
        QString output = process.readAllStandardOutput();
        if (!output.isEmpty()) {
            logMessage(tr("  gdalwarp stdout: %1").arg(output.simplified()));
        }
        return false;
    }
    
    return QFile::exists(outputPath);
}

bool ClipToAOIDialog::clipVectorLayer(const QString& inputPath, const QString& outputPath, const QString& aoiPath) {
    // Use ogr2ogr to clip and optionally reproject vector
    QProcess process;
    QStringList args;
    
    // Output format (keep original format)
    QFileInfo inputInfo(inputPath);
    QString format = "GPKG";  // Default to GeoPackage
    QString ext = inputInfo.suffix().toLower();
    
    if (ext == "shp") {
        format = "ESRI Shapefile";
    } else if (ext == "geojson") {
        format = "GeoJSON";
    } else if (ext == "kml") {
        format = "KML";
    } else if (ext == "kmz") {
        format = "LIBKML";
    }
    
    args << "-f" << format;
    
    // Reproject to project CRS if requested
    if (m_reprojectCheckBox->isChecked()) {
        args << "-t_srs" << m_projectCRS;
    }
    
    // Clip using AOI as clipping datasource
    args << "-clipsrc" << aoiPath;
    
    // Skip failures to handle multi-layer files gracefully
    args << "-skipfailures";
    
    // Output and input paths
    args << outputPath;
    args << inputPath;
    
    // Overwrite if exists
    args << "-overwrite";
    
    logMessage(tr("  Command: ogr2ogr %1").arg(args.join(" ")));
    
    process.start("ogr2ogr", args);
    
    if (!process.waitForStarted()) {
        logMessage(tr("  Error: Failed to start ogr2ogr"));
        return false;
    }
    
    if (!process.waitForFinished(300000)) {  // 5 minute timeout
        logMessage(tr("  Error: ogr2ogr timeout"));
        process.kill();
        return false;
    }
    
    if (process.exitCode() != 0) {
        QString error = process.readAllStandardError();
        logMessage(tr("  ogr2ogr stderr: %1").arg(error.simplified()));
        QString output = process.readAllStandardOutput();
        if (!output.isEmpty()) {
            logMessage(tr("  ogr2ogr stdout: %1").arg(output.simplified()));
        }
        return false;
    }
    
    return QFile::exists(outputPath);
}

void ClipToAOIDialog::updateProgress(int current, int total, const QString& layerName) {
    m_progressBar->setValue(current);
    m_statusLabel->setText(tr("Processing: %1 (%2/%3)")
        .arg(layerName).arg(current).arg(total));
}

void ClipToAOIDialog::logMessage(const QString& message) {
    m_logText->append(message);
    std::cout << message.toStdString() << std::endl;
}

void ClipToAOIDialog::onClippingComplete(bool success) {
    m_clipping = false;
    m_clipButton->setEnabled(true);
    
    if (success) {
        m_statusLabel->setText(tr("Clipping completed successfully!"));
    } else {
        m_statusLabel->setText(tr("Clipping completed with errors."));
    }
}

ClipToAOIDialog::ClipOptions ClipToAOIDialog::getClipOptions() const {
    ClipOptions options;
    
    for (QListWidgetItem* item : m_rasterList->selectedItems()) {
        options.rasterPaths.append(item->data(Qt::UserRole).toString());
    }
    
    for (QListWidgetItem* item : m_vectorList->selectedItems()) {
        options.vectorPaths.append(item->data(Qt::UserRole).toString());
    }
    
    options.reprojectToAOI = m_reprojectCheckBox->isChecked();
    options.outputSuffix = m_suffixEdit->text();
    
    return options;
}

} // namespace gui
} // namespace agrs

