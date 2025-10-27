#pragma once

#include <QDialog>
#include <QComboBox>
#include <QPushButton>
#include <QColorDialog>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QLabel>
#include <QGroupBox>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGridLayout>
#include <QListWidget>
#include <QPen>
#include <QBrush>
#include <QColor>
#include <QPainter>
#include <QPixmap>
#include <QCheckBox>
#include <QSlider>
#include <QJsonObject>

namespace agrs {
namespace gui {

/**
 * @brief Style configuration for vector layers
 */
struct VectorStyle {
    // Common properties
    QColor color{Qt::blue};
    int width{2};
    
    // Line properties
    Qt::PenStyle lineStyle{Qt::SolidLine};
    QVector<qreal> customDashPattern;
    Qt::PenCapStyle capStyle{Qt::RoundCap};
    Qt::PenJoinStyle joinStyle{Qt::RoundJoin};
    
    // Point properties
    enum class PointSymbol {
        Circle,
        Square,
        Triangle,
        Diamond,
        Cross,
        X,
        Star,
        Pentagon,
        Hexagon,
        CustomIcon
    };
    PointSymbol pointSymbol{PointSymbol::Circle};
    int pointSize{8};
    QString customIconPath;  // For custom PNG icons
    
    // Polygon properties
    bool fillEnabled{false};
    QColor fillColor{Qt::lightGray};
    Qt::BrushStyle fillPattern{Qt::SolidPattern};
    int fillOpacity{128};  // 0-255
    
    // Outline properties
    bool outlineEnabled{true};
    QColor outlineColor{Qt::black};
    int outlineWidth{1};
    Qt::PenStyle outlineStyle{Qt::SolidLine};
    
    // Serialize/deserialize for saving
    QJsonObject toJson() const;
    static VectorStyle fromJson(const QJsonObject& json);
    
    // Apply style to QPainter
    void applyToPen(QPen& pen) const;
    void applyToBrush(QBrush& brush) const;
};

/**
 * @brief Dialog for customizing vector layer styles
 */
class VectorStyleDialog : public QDialog {
    Q_OBJECT
    
public:
    explicit VectorStyleDialog(const QString& layerName, 
                              const QString& geometryType,
                              const VectorStyle& currentStyle,
                              QWidget* parent = nullptr);
    
    VectorStyle getStyle() const { return m_style; }
    
private slots:
    void onColorChanged();
    void onFillColorChanged();
    void onOutlineColorChanged();
    void onLineStyleChanged(int index);
    void onPointSymbolChanged(int index);
    void onFillPatternChanged(int index);
    void onWidthChanged(int value);
    void onPointSizeChanged(int value);
    void onFillOpacityChanged(int value);
    void onFillEnabledChanged(int state);
    void onOutlineEnabledChanged(int state);
    void onSelectCustomIcon();
    void updatePreview();
    
private:
    void setupUI();
    void setupCommonControls(QVBoxLayout* layout);
    void setupLineControls(QVBoxLayout* layout);
    void setupPointControls(QVBoxLayout* layout);
    void setupPolygonControls(QVBoxLayout* layout);
    void setupPreview(QVBoxLayout* layout);
    
    QPixmap createPreviewPixmap(int width, int height);
    void drawPointPreview(QPainter& painter, const QRect& rect);
    void drawLinePreview(QPainter& painter, const QRect& rect);
    void drawPolygonPreview(QPainter& painter, const QRect& rect);
    
    QString m_layerName;
    QString m_geometryType;  // "Point", "LineString", "Polygon"
    VectorStyle m_style;
    
    // Common controls
    QPushButton* m_colorButton;
    QSpinBox* m_widthSpinBox;
    
    // Line controls
    QComboBox* m_lineStyleCombo;
    
    // Point controls
    QComboBox* m_pointSymbolCombo;
    QListWidget* m_symbolLibrary;
    QSpinBox* m_pointSizeSpinBox;
    QPushButton* m_customIconButton;
    QLabel* m_customIconLabel;
    
    // Polygon controls
    QCheckBox* m_fillEnabledCheckBox;
    QPushButton* m_fillColorButton;
    QComboBox* m_fillPatternCombo;
    QSlider* m_fillOpacitySlider;
    QLabel* m_fillOpacityLabel;
    
    QCheckBox* m_outlineEnabledCheckBox;
    QPushButton* m_outlineColorButton;
    QSpinBox* m_outlineWidthSpinBox;
    QComboBox* m_outlineStyleCombo;
    
    // Preview
    QLabel* m_previewLabel;
    
    // Buttons
    QPushButton* m_okButton;
    QPushButton* m_cancelButton;
    QPushButton* m_applyButton;
};

} // namespace gui
} // namespace agrs

