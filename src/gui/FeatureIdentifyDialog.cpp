#include "agrs_zeus/gui/FeatureIdentifyDialog.h"
#include <QHeaderView>
#include <QClipboard>
#include <QApplication>
#include <QMessageBox>
#include <QStyle>
#include <QFont>
#include <QTimer>
#include <QFileInfo>

namespace agrs {
namespace gui {

FeatureIdentifyDialog::FeatureIdentifyDialog(QWidget* parent)
    : QDialog(parent)
{
    setWindowTitle(tr("Feature Information"));
    setMinimumSize(400, 500);
    resize(450, 600);
    setupUI();
}

void FeatureIdentifyDialog::setupUI() {
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    mainLayout->setSpacing(8);
    mainLayout->setContentsMargins(10, 10, 10, 10);
    
    // ===== Header Section =====
    QWidget* headerWidget = new QWidget();
    headerWidget->setStyleSheet("QWidget { background-color: #E3F2FD; border: 1px solid #BBDEFB; border-radius: 4px; }");
    QVBoxLayout* headerLayout = new QVBoxLayout(headerWidget);
    headerLayout->setContentsMargins(10, 8, 10, 8);
    
    // Layer name
    m_layerNameLabel = new QLabel();
    QFont layerFont;
    layerFont.setPointSize(11);
    layerFont.setBold(true);
    m_layerNameLabel->setFont(layerFont);
    m_layerNameLabel->setStyleSheet("QLabel { background: transparent; border: none; color: #1565C0; }");
    headerLayout->addWidget(m_layerNameLabel);
    
    // Feature count and navigation
    QHBoxLayout* navLayout = new QHBoxLayout();
    navLayout->setSpacing(4);
    
    m_prevButton = new QPushButton();
    m_prevButton->setIcon(style()->standardIcon(QStyle::SP_ArrowLeft));
    m_prevButton->setFixedSize(24, 24);
    m_prevButton->setToolTip(tr("Previous Feature"));
    connect(m_prevButton, &QPushButton::clicked, this, &FeatureIdentifyDialog::onPrevious);
    navLayout->addWidget(m_prevButton);
    
    m_featureCountLabel = new QLabel();
    m_featureCountLabel->setStyleSheet("QLabel { background: transparent; border: none; color: #424242; }");
    navLayout->addWidget(m_featureCountLabel);
    
    m_nextButton = new QPushButton();
    m_nextButton->setIcon(style()->standardIcon(QStyle::SP_ArrowRight));
    m_nextButton->setFixedSize(24, 24);
    m_nextButton->setToolTip(tr("Next Feature"));
    connect(m_nextButton, &QPushButton::clicked, this, &FeatureIdentifyDialog::onNext);
    navLayout->addWidget(m_nextButton);
    
    navLayout->addStretch();
    headerLayout->addLayout(navLayout);
    
    mainLayout->addWidget(headerWidget);
    
    // ===== Geometry Information Section =====
    m_geometryGroup = new QGroupBox(tr("Geometry"));
    m_geometryLayout = new QVBoxLayout();
    m_geometryLayout->setSpacing(4);
    m_geometryGroup->setLayout(m_geometryLayout);
    mainLayout->addWidget(m_geometryGroup);
    
    // ===== Attributes Section =====
    m_attributesGroup = new QGroupBox(tr("Attributes"));
    QVBoxLayout* attrLayout = new QVBoxLayout();
    
    m_attributesTable = new QTableWidget();
    m_attributesTable->setColumnCount(2);
    m_attributesTable->setHorizontalHeaderLabels({tr("Field"), tr("Value")});
    m_attributesTable->horizontalHeader()->setStretchLastSection(true);
    m_attributesTable->horizontalHeader()->setSectionResizeMode(0, QHeaderView::ResizeToContents);
    m_attributesTable->verticalHeader()->setVisible(false);
    m_attributesTable->setAlternatingRowColors(true);
    m_attributesTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_attributesTable->setEditTriggers(QAbstractItemView::NoEditTriggers);
    
    attrLayout->addWidget(m_attributesTable);
    m_attributesGroup->setLayout(attrLayout);
    mainLayout->addWidget(m_attributesGroup);
    
    // ===== Action Buttons Section =====
    QHBoxLayout* actionLayout = new QHBoxLayout();
    actionLayout->setSpacing(8);
    
    m_zoomToButton = new QPushButton(tr("Zoom To"));
    m_zoomToButton->setIcon(style()->standardIcon(QStyle::SP_FileDialogContentsView));
    m_zoomToButton->setToolTip(tr("Zoom map to this feature"));
    connect(m_zoomToButton, &QPushButton::clicked, this, &FeatureIdentifyDialog::onZoomTo);
    actionLayout->addWidget(m_zoomToButton);
    
    m_flashButton = new QPushButton(tr("Flash"));
    m_flashButton->setIcon(style()->standardIcon(QStyle::SP_MessageBoxInformation));
    m_flashButton->setToolTip(tr("Briefly highlight this feature on the map"));
    connect(m_flashButton, &QPushButton::clicked, this, &FeatureIdentifyDialog::onFlash);
    actionLayout->addWidget(m_flashButton);
    
    m_copyButton = new QPushButton(tr("Copy"));
    m_copyButton->setIcon(style()->standardIcon(QStyle::SP_FileIcon));
    m_copyButton->setToolTip(tr("Copy attributes to clipboard"));
    connect(m_copyButton, &QPushButton::clicked, this, &FeatureIdentifyDialog::onCopyAttributes);
    actionLayout->addWidget(m_copyButton);
    
    actionLayout->addStretch();
    
    m_closeButton = new QPushButton(tr("Close"));
    m_closeButton->setIcon(style()->standardIcon(QStyle::SP_DialogCloseButton));
    connect(m_closeButton, &QPushButton::clicked, this, &FeatureIdentifyDialog::close);
    actionLayout->addWidget(m_closeButton);
    
    mainLayout->addLayout(actionLayout);
}

void FeatureIdentifyDialog::setFeatures(const QList<IdentifiedFeature>& features) {
    m_features = features;
    m_currentIndex = 0;
    updateDisplay();
    updateNavigationButtons();
}

IdentifiedFeature FeatureIdentifyDialog::getCurrentFeature() const {
    if (m_currentIndex >= 0 && m_currentIndex < m_features.size()) {
        return m_features[m_currentIndex];
    }
    return IdentifiedFeature();
}

void FeatureIdentifyDialog::nextFeature() {
    if (m_currentIndex < m_features.size() - 1) {
        m_currentIndex++;
        updateDisplay();
        updateNavigationButtons();
    }
}

void FeatureIdentifyDialog::previousFeature() {
    if (m_currentIndex > 0) {
        m_currentIndex--;
        updateDisplay();
        updateNavigationButtons();
    }
}

void FeatureIdentifyDialog::updateDisplay() {
    if (m_features.isEmpty()) {
        m_layerNameLabel->setText(tr("No features"));
        m_featureCountLabel->setText("");
        return;
    }
    
    const IdentifiedFeature& feature = m_features[m_currentIndex];
    
    // Update header
    m_layerNameLabel->setText(QString("🗺️ %1").arg(feature.layerName));
    
    if (m_features.size() > 1) {
        m_featureCountLabel->setText(tr("Feature %1 of %2").arg(m_currentIndex + 1).arg(m_features.size()));
    } else {
        m_featureCountLabel->setText(tr("1 feature"));
    }
    
    // Update geometry info
    populateGeometryInfo();
    
    // Update attributes
    populateAttributes();
}

void FeatureIdentifyDialog::populateGeometryInfo() {
    // Clear existing geometry info
    QLayoutItem* item;
    while ((item = m_geometryLayout->takeAt(0)) != nullptr) {
        delete item->widget();
        delete item;
    }
    
    const IdentifiedFeature& feature = m_features[m_currentIndex];
    
    // Geometry Type
    QLabel* typeLabel = new QLabel(QString("<b>Type:</b> %1").arg(feature.geometryType));
    m_geometryLayout->addWidget(typeLabel);
    
    // Add geometry-specific information
    for (auto it = feature.geometryInfo.begin(); it != feature.geometryInfo.end(); ++it) {
        QString key = it.key();
        QString value = it.value().toString();
        
        QLabel* infoLabel = new QLabel(QString("<b>%1:</b> %2").arg(key).arg(value));
        m_geometryLayout->addWidget(infoLabel);
    }
    
    m_geometryLayout->addStretch();
}

void FeatureIdentifyDialog::populateAttributes() {
    m_attributesTable->setRowCount(0);
    
    const IdentifiedFeature& feature = m_features[m_currentIndex];
    
    // Use field order if available, otherwise iterate through all attributes
    QStringList fields = feature.fieldOrder.isEmpty() 
                         ? feature.attributes.keys() 
                         : feature.fieldOrder;
    
    int row = 0;
    for (const QString& fieldName : fields) {
        if (!feature.attributes.contains(fieldName)) continue;
        
        m_attributesTable->insertRow(row);
        
        // Field name (bold)
        QTableWidgetItem* nameItem = new QTableWidgetItem(fieldName);
        QFont boldFont;
        boldFont.setBold(true);
        nameItem->setFont(boldFont);
        nameItem->setBackground(QColor("#F5F5F5"));
        m_attributesTable->setItem(row, 0, nameItem);
        
        // Field value
        QVariant valueVariant = feature.attributes[fieldName];
        QString valueStr;
        
        if (valueVariant.isNull()) {
            valueStr = tr("(null)");
        } else {
            valueStr = valueVariant.toString();
        }
        
        QTableWidgetItem* valueItem = new QTableWidgetItem(valueStr);
        m_attributesTable->setItem(row, 1, valueItem);
        
        row++;
    }
    
    m_attributesTable->resizeRowsToContents();
}

void FeatureIdentifyDialog::updateNavigationButtons() {
    bool hasPrev = m_currentIndex > 0;
    bool hasNext = m_currentIndex < m_features.size() - 1;
    
    m_prevButton->setEnabled(hasPrev);
    m_nextButton->setEnabled(hasNext);
    
    // Hide navigation if only one feature
    if (m_features.size() <= 1) {
        m_prevButton->setVisible(false);
        m_nextButton->setVisible(false);
    } else {
        m_prevButton->setVisible(true);
        m_nextButton->setVisible(true);
    }
}

void FeatureIdentifyDialog::onZoomTo() {
    IdentifiedFeature feature = getCurrentFeature();
    if (feature.fid >= 0) {
        emit zoomToFeature(feature.layerPath, feature.fid);
    }
}

void FeatureIdentifyDialog::onFlash() {
    IdentifiedFeature feature = getCurrentFeature();
    if (feature.fid >= 0) {
        emit flashFeature(feature.layerPath, feature.fid);
    }
}

void FeatureIdentifyDialog::onPrevious() {
    previousFeature();
}

void FeatureIdentifyDialog::onNext() {
    nextFeature();
}

void FeatureIdentifyDialog::onCopyAttributes() {
    IdentifiedFeature feature = getCurrentFeature();
    if (feature.attributes.isEmpty()) {
        return;
    }
    
    // Build text representation
    QString text;
    text += QString("Layer: %1\n").arg(feature.layerName);
    text += QString("FID: %1\n").arg(feature.fid);
    text += QString("Geometry: %1\n").arg(feature.geometryType);
    text += "\nAttributes:\n";
    text += QString("-").repeated(40) + "\n";
    
    QStringList fields = feature.fieldOrder.isEmpty() 
                         ? feature.attributes.keys() 
                         : feature.fieldOrder;
    
    for (const QString& fieldName : fields) {
        if (!feature.attributes.contains(fieldName)) continue;
        QString value = feature.attributes[fieldName].toString();
        text += QString("%1: %2\n").arg(fieldName).arg(value);
    }
    
    // Copy to clipboard
    QClipboard* clipboard = QApplication::clipboard();
    clipboard->setText(text);
    
    // Show confirmation
    m_copyButton->setText(tr("Copied!"));
    QTimer::singleShot(1500, this, [this]() {
        m_copyButton->setText(tr("Copy"));
    });
}

} // namespace gui
} // namespace agrs

