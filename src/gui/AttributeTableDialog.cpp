#include "agrs_zeus/gui/AttributeTableDialog.h"
#include <QHeaderView>
#include <QMessageBox>
#include <QFileDialog>
#include <QTextStream>
#include <QFile>
#include <gdal/gdal_priv.h>
#include <gdal/ogrsf_frmts.h>
#include <iostream>

namespace agrs {
namespace gui {

AttributeTableDialog::AttributeTableDialog(const QString& layerPath, const QString& layerName, QWidget* parent)
    : QDialog(parent)
    , m_layerPath(layerPath)
    , m_layerName(layerName)
{
    setWindowTitle(tr("Attribute Table - %1").arg(layerName));
    resize(900, 600);
    
    setupUI();
    loadAttributes();
}

void AttributeTableDialog::setupUI() {
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    
    // Info label
    m_infoLabel = new QLabel();
    mainLayout->addWidget(m_infoLabel);
    
    // Filter controls
    QHBoxLayout* filterLayout = new QHBoxLayout();
    filterLayout->addWidget(new QLabel(tr("Filter:")));
    
    m_filterEdit = new QLineEdit();
    m_filterEdit->setPlaceholderText(tr("Enter SQL WHERE clause (e.g., population > 1000000)"));
    filterLayout->addWidget(m_filterEdit);
    
    m_filterButton = new QPushButton(tr("Apply Filter"));
    connect(m_filterButton, &QPushButton::clicked, this, &AttributeTableDialog::applyFilter);
    filterLayout->addWidget(m_filterButton);
    
    m_clearFilterButton = new QPushButton(tr("Clear Filter"));
    connect(m_clearFilterButton, &QPushButton::clicked, this, [this]() {
        m_filterEdit->clear();
        loadAttributes();
    });
    filterLayout->addWidget(m_clearFilterButton);
    
    mainLayout->addLayout(filterLayout);
    
    // Table widget
    m_table = new QTableWidget();
    m_table->setAlternatingRowColors(true);
    m_table->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_table->setEditTriggers(QAbstractItemView::NoEditTriggers);
    m_table->horizontalHeader()->setStretchLastSection(true);
    m_table->setSortingEnabled(true);
    
    // Connect double-click signal for zoom to feature
    connect(m_table, &QTableWidget::cellDoubleClicked, this, &AttributeTableDialog::onRowDoubleClicked);
    
    mainLayout->addWidget(m_table);
    
    // Bottom buttons
    QHBoxLayout* buttonLayout = new QHBoxLayout();
    
    m_exportButton = new QPushButton(tr("Export to CSV"));
    connect(m_exportButton, &QPushButton::clicked, this, [this]() {
        QString filename = QFileDialog::getSaveFileName(this, tr("Export Attribute Table"),
            "", tr("CSV Files (*.csv)"));
        if (filename.isEmpty()) return;
        
        // Automatically append .csv extension if not present
        if (!filename.endsWith(".csv", Qt::CaseInsensitive)) {
            filename += ".csv";
        }
        
        QFile file(filename);
        if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
            QMessageBox::critical(this, tr("Export Failed"), 
                tr("Could not open file for writing: %1").arg(filename));
            return;
        }
        
        QTextStream out(&file);
        
        // Write header
        for (int col = 0; col < m_table->columnCount(); ++col) {
            out << m_table->horizontalHeaderItem(col)->text();
            if (col < m_table->columnCount() - 1) out << ",";
        }
        out << "\n";
        
        // Write data
        for (int row = 0; row < m_table->rowCount(); ++row) {
            for (int col = 0; col < m_table->columnCount(); ++col) {
                QString text = m_table->item(row, col) ? m_table->item(row, col)->text() : "";
                // Escape commas and quotes
                if (text.contains(',') || text.contains('"')) {
                    text.replace("\"", "\"\"");
                    text = "\"" + text + "\"";
                }
                out << text;
                if (col < m_table->columnCount() - 1) out << ",";
            }
            out << "\n";
        }
        
        file.close();
        QMessageBox::information(this, tr("Export Successful"), 
            tr("Attribute table exported to: %1").arg(filename));
    });
    buttonLayout->addWidget(m_exportButton);
    
    buttonLayout->addStretch();
    
    m_closeButton = new QPushButton(tr("Close"));
    connect(m_closeButton, &QPushButton::clicked, this, &QDialog::accept);
    buttonLayout->addWidget(m_closeButton);
    
    mainLayout->addLayout(buttonLayout);
}

void AttributeTableDialog::loadAttributes() {
    m_table->clear();
    m_table->setRowCount(0);
    m_table->setColumnCount(0);
    
    // Open the vector dataset
    GDALDataset* ds = (GDALDataset*)GDALOpenEx(m_layerPath.toUtf8().constData(),
        GDAL_OF_VECTOR | GDAL_OF_READONLY, nullptr, nullptr, nullptr);
    
    if (!ds) {
        QMessageBox::critical(this, tr("Error"), 
            tr("Failed to open vector layer: %1").arg(m_layerPath));
        m_infoLabel->setText(tr("Error: Could not open layer"));
        return;
    }
    
    // Get the first layer (most vector files have one layer)
    OGRLayer* layer = ds->GetLayer(0);
    if (!layer) {
        QMessageBox::critical(this, tr("Error"), 
            tr("No layers found in vector file: %1").arg(m_layerPath));
        GDALClose(ds);
        return;
    }
    
    // Apply filter if specified
    QString filterClause = m_filterEdit->text().trimmed();
    if (!filterClause.isEmpty()) {
        OGRErr err = layer->SetAttributeFilter(filterClause.toUtf8().constData());
        if (err != OGRERR_NONE) {
            QMessageBox::warning(this, tr("Filter Error"),
                tr("Invalid filter expression. Showing all features."));
            m_filterEdit->clear();
            layer->SetAttributeFilter(nullptr);
        }
    } else {
        layer->SetAttributeFilter(nullptr);
    }
    
    // Get layer definition (schema)
    OGRFeatureDefn* layerDefn = layer->GetLayerDefn();
    int fieldCount = layerDefn->GetFieldCount();
    
    // Get total feature count
    m_totalFeatures = layer->GetFeatureCount();
    
    // Set up table columns
    m_table->setColumnCount(fieldCount + 1);  // +1 for FID
    
    // Set header for FID
    m_table->setHorizontalHeaderItem(0, new QTableWidgetItem("FID"));
    
    // Set headers for fields
    for (int i = 0; i < fieldCount; ++i) {
        OGRFieldDefn* fieldDefn = layerDefn->GetFieldDefn(i);
        QString fieldName = QString::fromUtf8(fieldDefn->GetNameRef());
        m_table->setHorizontalHeaderItem(i + 1, new QTableWidgetItem(fieldName));
    }
    
    // Read features and populate table
    layer->ResetReading();
    int rowIndex = 0;
    OGRFeature* feat;
    
    while ((feat = layer->GetNextFeature()) != nullptr) {
        m_table->insertRow(rowIndex);
        
        // Add FID
        QTableWidgetItem* fidItem = new QTableWidgetItem(QString::number(feat->GetFID()));
        m_table->setItem(rowIndex, 0, fidItem);
        
        // Add field values
        for (int i = 0; i < fieldCount; ++i) {
            QString value;
            
            if (feat->IsFieldSet(i)) {
                OGRFieldDefn* fieldDefn = layerDefn->GetFieldDefn(i);
                OGRFieldType fieldType = fieldDefn->GetType();
                
                switch (fieldType) {
                    case OFTInteger:
                        value = QString::number(feat->GetFieldAsInteger(i));
                        break;
                    case OFTInteger64:
                        value = QString::number(feat->GetFieldAsInteger64(i));
                        break;
                    case OFTReal:
                        value = QString::number(feat->GetFieldAsDouble(i), 'f', 6);
                        break;
                    case OFTString:
                        value = QString::fromUtf8(feat->GetFieldAsString(i));
                        break;
                    case OFTDate:
                    case OFTTime:
                    case OFTDateTime:
                        value = QString::fromUtf8(feat->GetFieldAsString(i));
                        break;
                    default:
                        value = QString::fromUtf8(feat->GetFieldAsString(i));
                        break;
                }
            } else {
                value = "NULL";
            }
            
            QTableWidgetItem* item = new QTableWidgetItem(value);
            m_table->setItem(rowIndex, i + 1, item);
        }
        
        OGRFeature::DestroyFeature(feat);
        rowIndex++;
    }
    
    m_displayedFeatures = rowIndex;
    
    // Update info label
    if (filterClause.isEmpty()) {
        m_infoLabel->setText(tr("Total Features: %1 | Displayed: %2 | Fields: %3")
            .arg(m_totalFeatures).arg(m_displayedFeatures).arg(fieldCount));
    } else {
        m_infoLabel->setText(tr("Total Features: %1 | Filtered: %2 | Fields: %3 | Filter: %4")
            .arg(m_totalFeatures).arg(m_displayedFeatures).arg(fieldCount).arg(filterClause));
    }
    
    // Resize columns to content
    m_table->resizeColumnsToContents();
    
    GDALClose(ds);
    
    std::cout << "[AttributeTable] Loaded " << m_displayedFeatures << " features from " 
              << m_layerPath.toStdString() << std::endl;
}

void AttributeTableDialog::applyFilter() {
    loadAttributes();
}

void AttributeTableDialog::onRowDoubleClicked(int row, int column) {
    // Get the FID from the first column (FID column)
    QTableWidgetItem* fidItem = m_table->item(row, 0);
    if (!fidItem) {
        std::cout << "[AttributeTable] Double-click: No FID item at row " << row << std::endl;
        return;
    }
    
    bool ok;
    int fid = fidItem->text().toInt(&ok);
    if (!ok) {
        std::cout << "[AttributeTable] Double-click: Invalid FID: " << fidItem->text().toStdString() << std::endl;
        return;
    }
    
    std::cout << "[AttributeTable] Double-click: Zooming to FID " << fid 
              << " from layer: " << m_layerPath.toStdString() << std::endl;
    
    // Emit signal to main window to zoom to this feature
    emit zoomToFeature(m_layerPath, fid);
}

} // namespace gui
} // namespace agrs

