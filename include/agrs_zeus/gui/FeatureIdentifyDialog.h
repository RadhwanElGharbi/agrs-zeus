#pragma once

#include <QDialog>
#include <QLabel>
#include <QTableWidget>
#include <QPushButton>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QScrollArea>
#include <QString>
#include <QStringList>
#include <QVariantMap>

namespace agrs {
namespace gui {

/**
 * @brief Structure to hold identified feature information
 */
struct IdentifiedFeature {
    QString layerName;
    QString layerPath;
    int fid{-1};
    QString geometryType;
    QVariantMap geometryInfo;   // e.g., area, length, coordinates
    QVariantMap attributes;      // Field name -> value
    QStringList fieldOrder;      // Maintain field order
    
    IdentifiedFeature() = default;
};

/**
 * @brief Dialog for displaying feature information when clicking on map
 * 
 * Similar to ArcGIS Pro's Explore tool popup, displays:
 * - Layer name and feature count
 * - Geometry information (type, area/length, coordinates)
 * - All attribute fields and values
 * - Action buttons (Zoom To, Flash, Close)
 */
class FeatureIdentifyDialog : public QDialog {
    Q_OBJECT

public:
    explicit FeatureIdentifyDialog(QWidget* parent = nullptr);
    ~FeatureIdentifyDialog() override = default;

    /**
     * @brief Set the features to display
     * @param features List of identified features
     */
    void setFeatures(const QList<IdentifiedFeature>& features);
    
    /**
     * @brief Get the currently displayed feature
     */
    IdentifiedFeature getCurrentFeature() const;
    
    /**
     * @brief Navigate to next feature (if multiple)
     */
    void nextFeature();
    
    /**
     * @brief Navigate to previous feature (if multiple)
     */
    void previousFeature();

signals:
    /**
     * @brief Emitted when user clicks "Zoom To" button
     * @param layerPath Path to the layer
     * @param fid Feature ID to zoom to
     */
    void zoomToFeature(const QString& layerPath, int fid);
    
    /**
     * @brief Emitted when user clicks "Flash" button
     * @param layerPath Path to the layer
     * @param fid Feature ID to flash
     */
    void flashFeature(const QString& layerPath, int fid);

private slots:
    void onZoomTo();
    void onFlash();
    void onPrevious();
    void onNext();
    void onCopyAttributes();

private:
    void setupUI();
    void updateDisplay();
    void populateGeometryInfo();
    void populateAttributes();
    void updateNavigationButtons();
    
    QList<IdentifiedFeature> m_features;
    int m_currentIndex{0};
    
    // UI components - Header
    QLabel* m_layerNameLabel;
    QLabel* m_featureCountLabel;
    QPushButton* m_prevButton;
    QPushButton* m_nextButton;
    
    // UI components - Geometry Info
    QGroupBox* m_geometryGroup;
    QVBoxLayout* m_geometryLayout;
    
    // UI components - Attributes
    QGroupBox* m_attributesGroup;
    QTableWidget* m_attributesTable;
    
    // UI components - Actions
    QPushButton* m_zoomToButton;
    QPushButton* m_flashButton;
    QPushButton* m_copyButton;
    QPushButton* m_closeButton;
};

} // namespace gui
} // namespace agrs

