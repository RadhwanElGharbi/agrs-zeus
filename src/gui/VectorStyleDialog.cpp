#include "agrs_zeus/gui/VectorStyleDialog.h"
#include <QFormLayout>
#include <QDialogButtonBox>
#include <QFileDialog>
#include <QCheckBox>
#include <QSlider>
#include <QMessageBox>
#include <QJsonObject>
#include <QJsonArray>
#include <QPainterPath>
#include <cmath>

namespace agrs {
namespace gui {

// VectorStyle serialization
QJsonObject VectorStyle::toJson() const {
    QJsonObject obj;
    obj["color"] = color.name();
    obj["width"] = width;
    obj["lineStyle"] = static_cast<int>(lineStyle);
    obj["pointSymbol"] = static_cast<int>(pointSymbol);
    obj["pointSize"] = pointSize;
    obj["customIconPath"] = customIconPath;
    obj["fillEnabled"] = fillEnabled;
    obj["fillColor"] = fillColor.name();
    obj["fillPattern"] = static_cast<int>(fillPattern);
    obj["fillOpacity"] = fillOpacity;
    obj["outlineEnabled"] = outlineEnabled;
    obj["outlineColor"] = outlineColor.name();
    obj["outlineWidth"] = outlineWidth;
    obj["outlineStyle"] = static_cast<int>(outlineStyle);
    return obj;
}

VectorStyle VectorStyle::fromJson(const QJsonObject& json) {
    VectorStyle style;
    style.color = QColor(json["color"].toString());
    style.width = json["width"].toInt(2);
    style.lineStyle = static_cast<Qt::PenStyle>(json["lineStyle"].toInt(Qt::SolidLine));
    style.pointSymbol = static_cast<PointSymbol>(json["pointSymbol"].toInt(0));
    style.pointSize = json["pointSize"].toInt(8);
    style.customIconPath = json["customIconPath"].toString();
    style.fillEnabled = json["fillEnabled"].toBool(false);
    style.fillColor = QColor(json["fillColor"].toString());
    style.fillPattern = static_cast<Qt::BrushStyle>(json["fillPattern"].toInt(Qt::SolidPattern));
    style.fillOpacity = json["fillOpacity"].toInt(128);
    style.outlineEnabled = json["outlineEnabled"].toBool(true);
    style.outlineColor = QColor(json["outlineColor"].toString());
    style.outlineWidth = json["outlineWidth"].toInt(1);
    style.outlineStyle = static_cast<Qt::PenStyle>(json["outlineStyle"].toInt(Qt::SolidLine));
    return style;
}

void VectorStyle::applyToPen(QPen& pen) const {
    pen.setColor(color);
    pen.setWidth(width);
    pen.setStyle(lineStyle);
    pen.setCapStyle(capStyle);
    pen.setJoinStyle(joinStyle);
    
    if (lineStyle == Qt::CustomDashLine && !customDashPattern.isEmpty()) {
        pen.setDashPattern(customDashPattern);
    }
}

void VectorStyle::applyToBrush(QBrush& brush) const {
    if (fillEnabled) {
        QColor fc = fillColor;
        fc.setAlpha(fillOpacity);
        brush.setColor(fc);
        brush.setStyle(fillPattern);
    } else {
        brush.setStyle(Qt::NoBrush);
    }
}

// VectorStyleDialog implementation
VectorStyleDialog::VectorStyleDialog(const QString& layerName, 
                                     const QString& geometryType,
                                     const VectorStyle& currentStyle,
                                     QWidget* parent)
    : QDialog(parent)
    , m_layerName(layerName)
    , m_geometryType(geometryType)
    , m_style(currentStyle)
{
    setWindowTitle(tr("Customize Style - %1").arg(m_layerName));
    setMinimumSize(600, 500);
    setupUI();
    updatePreview();
}

void VectorStyleDialog::setupUI() {
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    
    // Geometry type label
    QLabel* typeLabel = new QLabel(tr("<b>Geometry Type:</b> %1").arg(m_geometryType));
    mainLayout->addWidget(typeLabel);
    
    // Determine which controls to show based on geometry type
    if (m_geometryType.contains("Point", Qt::CaseInsensitive)) {
        setupPointControls(mainLayout);
    } else if (m_geometryType.contains("Line", Qt::CaseInsensitive)) {
        setupLineControls(mainLayout);
    } else if (m_geometryType.contains("Polygon", Qt::CaseInsensitive)) {
        setupPolygonControls(mainLayout);
    } else {
        // Unknown type, show all controls
        setupCommonControls(mainLayout);
    }
    
    // Preview
    setupPreview(mainLayout);
    
    // Buttons
    QDialogButtonBox* buttonBox = new QDialogButtonBox(
        QDialogButtonBox::Ok | QDialogButtonBox::Cancel | QDialogButtonBox::Apply);
    connect(buttonBox, &QDialogButtonBox::accepted, this, &QDialog::accept);
    connect(buttonBox, &QDialogButtonBox::rejected, this, &QDialog::reject);
    connect(buttonBox->button(QDialogButtonBox::Apply), &QPushButton::clicked,
            this, &VectorStyleDialog::updatePreview);
    
    mainLayout->addWidget(buttonBox);
}

void VectorStyleDialog::setupCommonControls(QVBoxLayout* layout) {
    QGroupBox* group = new QGroupBox(tr("Common Properties"));
    QFormLayout* form = new QFormLayout();
    
    // Color
    m_colorButton = new QPushButton();
    m_colorButton->setFixedSize(100, 30);
    m_colorButton->setStyleSheet(QString("background-color: %1").arg(m_style.color.name()));
    connect(m_colorButton, &QPushButton::clicked, this, &VectorStyleDialog::onColorChanged);
    form->addRow(tr("Color:"), m_colorButton);
    
    // Width
    m_widthSpinBox = new QSpinBox();
    m_widthSpinBox->setRange(1, 20);
    m_widthSpinBox->setValue(m_style.width);
    connect(m_widthSpinBox, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &VectorStyleDialog::onWidthChanged);
    form->addRow(tr("Width:"), m_widthSpinBox);
    
    group->setLayout(form);
    layout->addWidget(group);
}

void VectorStyleDialog::setupLineControls(QVBoxLayout* layout) {
    // Common controls first
    setupCommonControls(layout);
    
    QGroupBox* group = new QGroupBox(tr("Line Properties"));
    QFormLayout* form = new QFormLayout();
    
    // Line style
    m_lineStyleCombo = new QComboBox();
    m_lineStyleCombo->addItem(tr("Solid Line"), static_cast<int>(Qt::SolidLine));
    m_lineStyleCombo->addItem(tr("Dash Line"), static_cast<int>(Qt::DashLine));
    m_lineStyleCombo->addItem(tr("Dot Line"), static_cast<int>(Qt::DotLine));
    m_lineStyleCombo->addItem(tr("Dash Dot Line"), static_cast<int>(Qt::DashDotLine));
    m_lineStyleCombo->addItem(tr("Dash Dot Dot Line"), static_cast<int>(Qt::DashDotDotLine));
    
    // Set current index
    int currentIndex = m_lineStyleCombo->findData(static_cast<int>(m_style.lineStyle));
    if (currentIndex >= 0) m_lineStyleCombo->setCurrentIndex(currentIndex);
    
    connect(m_lineStyleCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &VectorStyleDialog::onLineStyleChanged);
    form->addRow(tr("Line Style:"), m_lineStyleCombo);
    
    group->setLayout(form);
    layout->addWidget(group);
}

void VectorStyleDialog::setupPointControls(QVBoxLayout* layout) {
    // Common color control
    setupCommonControls(layout);
    
    QGroupBox* group = new QGroupBox(tr("Point Symbol"));
    QVBoxLayout* vbox = new QVBoxLayout();
    
    // Symbol type combo
    QHBoxLayout* symbolLayout = new QHBoxLayout();
    symbolLayout->addWidget(new QLabel(tr("Symbol:")));
    m_pointSymbolCombo = new QComboBox();
    m_pointSymbolCombo->addItem(tr("Circle"), static_cast<int>(VectorStyle::PointSymbol::Circle));
    m_pointSymbolCombo->addItem(tr("Square"), static_cast<int>(VectorStyle::PointSymbol::Square));
    m_pointSymbolCombo->addItem(tr("Triangle"), static_cast<int>(VectorStyle::PointSymbol::Triangle));
    m_pointSymbolCombo->addItem(tr("Diamond"), static_cast<int>(VectorStyle::PointSymbol::Diamond));
    m_pointSymbolCombo->addItem(tr("Cross (+)"), static_cast<int>(VectorStyle::PointSymbol::Cross));
    m_pointSymbolCombo->addItem(tr("X"), static_cast<int>(VectorStyle::PointSymbol::X));
    m_pointSymbolCombo->addItem(tr("Star"), static_cast<int>(VectorStyle::PointSymbol::Star));
    m_pointSymbolCombo->addItem(tr("Pentagon"), static_cast<int>(VectorStyle::PointSymbol::Pentagon));
    m_pointSymbolCombo->addItem(tr("Hexagon"), static_cast<int>(VectorStyle::PointSymbol::Hexagon));
    m_pointSymbolCombo->addItem(tr("Custom Icon (PNG)"), static_cast<int>(VectorStyle::PointSymbol::CustomIcon));
    
    int currentIndex = m_pointSymbolCombo->findData(static_cast<int>(m_style.pointSymbol));
    if (currentIndex >= 0) m_pointSymbolCombo->setCurrentIndex(currentIndex);
    
    connect(m_pointSymbolCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &VectorStyleDialog::onPointSymbolChanged);
    symbolLayout->addWidget(m_pointSymbolCombo);
    vbox->addLayout(symbolLayout);
    
    // Point size
    QHBoxLayout* sizeLayout = new QHBoxLayout();
    sizeLayout->addWidget(new QLabel(tr("Size:")));
    m_pointSizeSpinBox = new QSpinBox();
    m_pointSizeSpinBox->setRange(4, 64);
    m_pointSizeSpinBox->setValue(m_style.pointSize);
    connect(m_pointSizeSpinBox, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &VectorStyleDialog::onPointSizeChanged);
    sizeLayout->addWidget(m_pointSizeSpinBox);
    sizeLayout->addStretch();
    vbox->addLayout(sizeLayout);
    
    // Custom icon
    QHBoxLayout* iconLayout = new QHBoxLayout();
    m_customIconButton = new QPushButton(tr("Select Custom Icon..."));
    connect(m_customIconButton, &QPushButton::clicked, this, &VectorStyleDialog::onSelectCustomIcon);
    iconLayout->addWidget(m_customIconButton);
    
    m_customIconLabel = new QLabel();
    if (!m_style.customIconPath.isEmpty()) {
        m_customIconLabel->setText(QFileInfo(m_style.customIconPath).fileName());
    }
    iconLayout->addWidget(m_customIconLabel);
    iconLayout->addStretch();
    vbox->addLayout(iconLayout);
    
    group->setLayout(vbox);
    layout->addWidget(group);
}

void VectorStyleDialog::setupPolygonControls(QVBoxLayout* layout) {
    // Fill properties
    QGroupBox* fillGroup = new QGroupBox(tr("Fill Properties"));
    QFormLayout* fillForm = new QFormLayout();
    
    // Fill enabled
    m_fillEnabledCheckBox = new QCheckBox(tr("Enable Fill"));
    m_fillEnabledCheckBox->setChecked(m_style.fillEnabled);
    connect(m_fillEnabledCheckBox, &QCheckBox::stateChanged,
            this, &VectorStyleDialog::onFillEnabledChanged);
    fillForm->addRow(m_fillEnabledCheckBox);
    
    // Fill color
    m_fillColorButton = new QPushButton();
    m_fillColorButton->setFixedSize(100, 30);
    m_fillColorButton->setStyleSheet(QString("background-color: %1").arg(m_style.fillColor.name()));
    m_fillColorButton->setEnabled(m_style.fillEnabled);
    connect(m_fillColorButton, &QPushButton::clicked, this, &VectorStyleDialog::onFillColorChanged);
    fillForm->addRow(tr("Fill Color:"), m_fillColorButton);
    
    // Fill pattern
    m_fillPatternCombo = new QComboBox();
    m_fillPatternCombo->addItem(tr("Solid"), static_cast<int>(Qt::SolidPattern));
    m_fillPatternCombo->addItem(tr("Dense 1 (94%)"), static_cast<int>(Qt::Dense1Pattern));
    m_fillPatternCombo->addItem(tr("Dense 2 (88%)"), static_cast<int>(Qt::Dense2Pattern));
    m_fillPatternCombo->addItem(tr("Dense 3 (63%)"), static_cast<int>(Qt::Dense3Pattern));
    m_fillPatternCombo->addItem(tr("Dense 4 (50%)"), static_cast<int>(Qt::Dense4Pattern));
    m_fillPatternCombo->addItem(tr("Dense 5 (37%)"), static_cast<int>(Qt::Dense5Pattern));
    m_fillPatternCombo->addItem(tr("Dense 6 (12%)"), static_cast<int>(Qt::Dense6Pattern));
    m_fillPatternCombo->addItem(tr("Dense 7 (6%)"), static_cast<int>(Qt::Dense7Pattern));
    m_fillPatternCombo->addItem(tr("Horizontal Lines"), static_cast<int>(Qt::HorPattern));
    m_fillPatternCombo->addItem(tr("Vertical Lines"), static_cast<int>(Qt::VerPattern));
    m_fillPatternCombo->addItem(tr("Cross Pattern"), static_cast<int>(Qt::CrossPattern));
    m_fillPatternCombo->addItem(tr("Diagonal (\\)"), static_cast<int>(Qt::BDiagPattern));
    m_fillPatternCombo->addItem(tr("Diagonal (/)"), static_cast<int>(Qt::FDiagPattern));
    m_fillPatternCombo->addItem(tr("Diagonal Cross"), static_cast<int>(Qt::DiagCrossPattern));
    
    int currentIndex = m_fillPatternCombo->findData(static_cast<int>(m_style.fillPattern));
    if (currentIndex >= 0) m_fillPatternCombo->setCurrentIndex(currentIndex);
    m_fillPatternCombo->setEnabled(m_style.fillEnabled);
    
    connect(m_fillPatternCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &VectorStyleDialog::onFillPatternChanged);
    fillForm->addRow(tr("Fill Pattern:"), m_fillPatternCombo);
    
    // Fill opacity
    QHBoxLayout* opacityLayout = new QHBoxLayout();
    m_fillOpacitySlider = new QSlider(Qt::Horizontal);
    m_fillOpacitySlider->setRange(0, 255);
    m_fillOpacitySlider->setValue(m_style.fillOpacity);
    m_fillOpacitySlider->setEnabled(m_style.fillEnabled);
    connect(m_fillOpacitySlider, &QSlider::valueChanged,
            this, &VectorStyleDialog::onFillOpacityChanged);
    
    m_fillOpacityLabel = new QLabel(QString::number(m_style.fillOpacity * 100 / 255) + "%");
    opacityLayout->addWidget(m_fillOpacitySlider);
    opacityLayout->addWidget(m_fillOpacityLabel);
    fillForm->addRow(tr("Opacity:"), opacityLayout);
    
    fillGroup->setLayout(fillForm);
    layout->addWidget(fillGroup);
    
    // Outline properties
    QGroupBox* outlineGroup = new QGroupBox(tr("Outline Properties"));
    QFormLayout* outlineForm = new QFormLayout();
    
    // Outline enabled
    m_outlineEnabledCheckBox = new QCheckBox(tr("Enable Outline"));
    m_outlineEnabledCheckBox->setChecked(m_style.outlineEnabled);
    connect(m_outlineEnabledCheckBox, &QCheckBox::stateChanged,
            this, &VectorStyleDialog::onOutlineEnabledChanged);
    outlineForm->addRow(m_outlineEnabledCheckBox);
    
    // Outline color
    m_outlineColorButton = new QPushButton();
    m_outlineColorButton->setFixedSize(100, 30);
    m_outlineColorButton->setStyleSheet(QString("background-color: %1").arg(m_style.outlineColor.name()));
    m_outlineColorButton->setEnabled(m_style.outlineEnabled);
    connect(m_outlineColorButton, &QPushButton::clicked, this, &VectorStyleDialog::onOutlineColorChanged);
    outlineForm->addRow(tr("Outline Color:"), m_outlineColorButton);
    
    // Outline width
    m_outlineWidthSpinBox = new QSpinBox();
    m_outlineWidthSpinBox->setRange(1, 20);
    m_outlineWidthSpinBox->setValue(m_style.outlineWidth);
    m_outlineWidthSpinBox->setEnabled(m_style.outlineEnabled);
    connect(m_outlineWidthSpinBox, QOverload<int>::of(&QSpinBox::valueChanged),
            [this](int value) { m_style.outlineWidth = value; updatePreview(); });
    outlineForm->addRow(tr("Outline Width:"), m_outlineWidthSpinBox);
    
    // Outline style
    m_outlineStyleCombo = new QComboBox();
    m_outlineStyleCombo->addItem(tr("Solid"), static_cast<int>(Qt::SolidLine));
    m_outlineStyleCombo->addItem(tr("Dash"), static_cast<int>(Qt::DashLine));
    m_outlineStyleCombo->addItem(tr("Dot"), static_cast<int>(Qt::DotLine));
    m_outlineStyleCombo->addItem(tr("Dash Dot"), static_cast<int>(Qt::DashDotLine));
    m_outlineStyleCombo->addItem(tr("Dash Dot Dot"), static_cast<int>(Qt::DashDotDotLine));
    
    currentIndex = m_outlineStyleCombo->findData(static_cast<int>(m_style.outlineStyle));
    if (currentIndex >= 0) m_outlineStyleCombo->setCurrentIndex(currentIndex);
    m_outlineStyleCombo->setEnabled(m_style.outlineEnabled);
    
    connect(m_outlineStyleCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            [this](int index) { 
                m_style.outlineStyle = static_cast<Qt::PenStyle>(m_outlineStyleCombo->itemData(index).toInt());
                updatePreview();
            });
    outlineForm->addRow(tr("Outline Style:"), m_outlineStyleCombo);
    
    outlineGroup->setLayout(outlineForm);
    layout->addWidget(outlineGroup);
}

void VectorStyleDialog::setupPreview(QVBoxLayout* layout) {
    QGroupBox* previewGroup = new QGroupBox(tr("Preview"));
    QVBoxLayout* previewLayout = new QVBoxLayout();
    
    m_previewLabel = new QLabel();
    m_previewLabel->setMinimumSize(300, 150);
    m_previewLabel->setAlignment(Qt::AlignCenter);
    m_previewLabel->setStyleSheet("QLabel { background-color: white; border: 1px solid #ccc; }");
    
    previewLayout->addWidget(m_previewLabel);
    previewGroup->setLayout(previewLayout);
    layout->addWidget(previewGroup);
}

QPixmap VectorStyleDialog::createPreviewPixmap(int width, int height) {
    QPixmap pixmap(width, height);
    pixmap.fill(Qt::white);
    
    QPainter painter(&pixmap);
    painter.setRenderHint(QPainter::Antialiasing);
    
    QRect rect = pixmap.rect().adjusted(20, 20, -20, -20);
    
    if (m_geometryType.contains("Point", Qt::CaseInsensitive)) {
        drawPointPreview(painter, rect);
    } else if (m_geometryType.contains("Line", Qt::CaseInsensitive)) {
        drawLinePreview(painter, rect);
    } else if (m_geometryType.contains("Polygon", Qt::CaseInsensitive)) {
        drawPolygonPreview(painter, rect);
    }
    
    return pixmap;
}

void VectorStyleDialog::drawPointPreview(QPainter& painter, const QRect& rect) {
    QPoint center = rect.center();
    int size = m_style.pointSize;
    
    painter.setPen(QPen(m_style.color, 2));
    painter.setBrush(QBrush(m_style.color));
    
    switch (m_style.pointSymbol) {
        case VectorStyle::PointSymbol::Circle:
            painter.drawEllipse(center, size, size);
            break;
            
        case VectorStyle::PointSymbol::Square:
            painter.drawRect(center.x() - size, center.y() - size, size * 2, size * 2);
            break;
            
        case VectorStyle::PointSymbol::Triangle: {
            QPolygon triangle;
            triangle << QPoint(center.x(), center.y() - size)
                    << QPoint(center.x() - size, center.y() + size)
                    << QPoint(center.x() + size, center.y() + size);
            painter.drawPolygon(triangle);
            break;
        }
            
        case VectorStyle::PointSymbol::Diamond: {
            QPolygon diamond;
            diamond << QPoint(center.x(), center.y() - size)
                   << QPoint(center.x() + size, center.y())
                   << QPoint(center.x(), center.y() + size)
                   << QPoint(center.x() - size, center.y());
            painter.drawPolygon(diamond);
            break;
        }
            
        case VectorStyle::PointSymbol::Cross:
            painter.drawLine(center.x(), center.y() - size, center.x(), center.y() + size);
            painter.drawLine(center.x() - size, center.y(), center.x() + size, center.y());
            break;
            
        case VectorStyle::PointSymbol::X: {
            int offset = size * 0.707;  // sqrt(2)/2
            painter.drawLine(center.x() - offset, center.y() - offset, center.x() + offset, center.y() + offset);
            painter.drawLine(center.x() - offset, center.y() + offset, center.x() + offset, center.y() - offset);
            break;
        }
            
        case VectorStyle::PointSymbol::Star: {
            QPainterPath star;
            double angle = -M_PI / 2;  // Start at top
            double angleStep = 2 * M_PI / 5;
            
            for (int i = 0; i < 5; ++i) {
                double x = center.x() + size * std::cos(angle);
                double y = center.y() + size * std::sin(angle);
                if (i == 0) star.moveTo(x, y);
                else star.lineTo(x, y);
                
                angle += angleStep * 2;  // Skip every other point for star
                if (angle > 2 * M_PI) angle -= 2 * M_PI;
            }
            star.closeSubpath();
            painter.drawPath(star);
            break;
        }
            
        case VectorStyle::PointSymbol::Pentagon: {
            QPolygon pentagon;
            double angle = -M_PI / 2;
            double angleStep = 2 * M_PI / 5;
            for (int i = 0; i < 5; ++i) {
                pentagon << QPoint(center.x() + size * std::cos(angle),
                                  center.y() + size * std::sin(angle));
                angle += angleStep;
            }
            painter.drawPolygon(pentagon);
            break;
        }
            
        case VectorStyle::PointSymbol::Hexagon: {
            QPolygon hexagon;
            double angle = 0;
            double angleStep = M_PI / 3;
            for (int i = 0; i < 6; ++i) {
                hexagon << QPoint(center.x() + size * std::cos(angle),
                                 center.y() + size * std::sin(angle));
                angle += angleStep;
            }
            painter.drawPolygon(hexagon);
            break;
        }
            
        case VectorStyle::PointSymbol::CustomIcon:
            if (!m_style.customIconPath.isEmpty() && QFile::exists(m_style.customIconPath)) {
                QPixmap icon(m_style.customIconPath);
                QPixmap scaled = icon.scaled(size * 2, size * 2, Qt::KeepAspectRatio, Qt::SmoothTransformation);
                painter.drawPixmap(center.x() - scaled.width() / 2,
                                  center.y() - scaled.height() / 2,
                                  scaled);
            } else {
                painter.drawText(rect, Qt::AlignCenter, tr("(No icon selected)"));
            }
            break;
    }
}

void VectorStyleDialog::drawLinePreview(QPainter& painter, const QRect& rect) {
    QPen pen;
    pen.setColor(m_style.color);
    pen.setWidth(m_style.width);
    pen.setStyle(m_style.lineStyle);
    pen.setCapStyle(Qt::RoundCap);
    pen.setJoinStyle(Qt::RoundJoin);
    
    painter.setPen(pen);
    painter.setBrush(Qt::NoBrush);
    
    // Draw a wavy line
    QPainterPath path;
    path.moveTo(rect.left(), rect.center().y());
    
    int segments = 3;
    qreal segmentWidth = rect.width() / (segments * 2.0);
    qreal amplitude = rect.height() / 4.0;
    
    for (int i = 0; i < segments; ++i) {
        qreal x1 = rect.left() + (i * 2 + 1) * segmentWidth;
        qreal y1 = rect.center().y() - amplitude;
        qreal x2 = rect.left() + (i * 2 + 2) * segmentWidth;
        qreal y2 = rect.center().y() + amplitude;
        
        path.quadTo(x1, y1, x1 + segmentWidth / 2, rect.center().y());
        path.quadTo(x2, y2, x2 + segmentWidth / 2, rect.center().y());
    }
    
    painter.drawPath(path);
}

void VectorStyleDialog::drawPolygonPreview(QPainter& painter, const QRect& rect) {
    // Draw a polygon (pentagon)
    QPolygon polygon;
    QPoint center = rect.center();
    int radius = std::min(rect.width(), rect.height()) / 3;
    
    double angle = -M_PI / 2;
    double angleStep = 2 * M_PI / 5;
    for (int i = 0; i < 5; ++i) {
        polygon << QPoint(center.x() + radius * std::cos(angle),
                         center.y() + radius * std::sin(angle));
        angle += angleStep;
    }
    
    // Apply fill
    QBrush brush;
    m_style.applyToBrush(brush);
    painter.setBrush(brush);
    
    // Apply outline
    if (m_style.outlineEnabled) {
        QPen pen(m_style.outlineColor, m_style.outlineWidth);
        pen.setStyle(m_style.outlineStyle);
        painter.setPen(pen);
    } else {
        painter.setPen(Qt::NoPen);
    }
    
    painter.drawPolygon(polygon);
}

void VectorStyleDialog::updatePreview() {
    QPixmap preview = createPreviewPixmap(300, 150);
    m_previewLabel->setPixmap(preview);
}

// Slot implementations
void VectorStyleDialog::onColorChanged() {
    QColor color = QColorDialog::getColor(m_style.color, this, tr("Select Color"));
    if (color.isValid()) {
        m_style.color = color;
        m_colorButton->setStyleSheet(QString("background-color: %1").arg(color.name()));
        updatePreview();
    }
}

void VectorStyleDialog::onFillColorChanged() {
    QColor color = QColorDialog::getColor(m_style.fillColor, this, tr("Select Fill Color"));
    if (color.isValid()) {
        m_style.fillColor = color;
        m_fillColorButton->setStyleSheet(QString("background-color: %1").arg(color.name()));
        updatePreview();
    }
}

void VectorStyleDialog::onOutlineColorChanged() {
    QColor color = QColorDialog::getColor(m_style.outlineColor, this, tr("Select Outline Color"));
    if (color.isValid()) {
        m_style.outlineColor = color;
        m_outlineColorButton->setStyleSheet(QString("background-color: %1").arg(color.name()));
        updatePreview();
    }
}

void VectorStyleDialog::onLineStyleChanged(int index) {
    m_style.lineStyle = static_cast<Qt::PenStyle>(m_lineStyleCombo->itemData(index).toInt());
    updatePreview();
}

void VectorStyleDialog::onPointSymbolChanged(int index) {
    m_style.pointSymbol = static_cast<VectorStyle::PointSymbol>(m_pointSymbolCombo->itemData(index).toInt());
    updatePreview();
}

void VectorStyleDialog::onFillPatternChanged(int index) {
    m_style.fillPattern = static_cast<Qt::BrushStyle>(m_fillPatternCombo->itemData(index).toInt());
    updatePreview();
}

void VectorStyleDialog::onWidthChanged(int value) {
    m_style.width = value;
    updatePreview();
}

void VectorStyleDialog::onPointSizeChanged(int value) {
    m_style.pointSize = value;
    updatePreview();
}

void VectorStyleDialog::onFillOpacityChanged(int value) {
    m_style.fillOpacity = value;
    m_fillOpacityLabel->setText(QString::number(value * 100 / 255) + "%");
    updatePreview();
}

void VectorStyleDialog::onFillEnabledChanged(int state) {
    m_style.fillEnabled = (state == Qt::Checked);
    if (m_fillColorButton) m_fillColorButton->setEnabled(m_style.fillEnabled);
    if (m_fillPatternCombo) m_fillPatternCombo->setEnabled(m_style.fillEnabled);
    if (m_fillOpacitySlider) m_fillOpacitySlider->setEnabled(m_style.fillEnabled);
    updatePreview();
}

void VectorStyleDialog::onOutlineEnabledChanged(int state) {
    m_style.outlineEnabled = (state == Qt::Checked);
    if (m_outlineColorButton) m_outlineColorButton->setEnabled(m_style.outlineEnabled);
    if (m_outlineWidthSpinBox) m_outlineWidthSpinBox->setEnabled(m_style.outlineEnabled);
    if (m_outlineStyleCombo) m_outlineStyleCombo->setEnabled(m_style.outlineEnabled);
    updatePreview();
}

void VectorStyleDialog::onSelectCustomIcon() {
    QString iconPath = QFileDialog::getOpenFileName(this,
        tr("Select Custom Icon"),
        "",
        tr("Image Files (*.png *.jpg *.jpeg *.bmp *.svg)"));
    
    if (!iconPath.isEmpty()) {
        m_style.customIconPath = iconPath;
        m_customIconLabel->setText(QFileInfo(iconPath).fileName());
        updatePreview();
    }
}

} // namespace gui
} // namespace agrs

