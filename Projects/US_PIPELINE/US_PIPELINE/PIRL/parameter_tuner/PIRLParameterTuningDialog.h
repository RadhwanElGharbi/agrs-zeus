#ifndef PIRL_PARAMETER_TUNING_DIALOG_H
#define PIRL_PARAMETER_TUNING_DIALOG_H

#include <QDialog>
#include <QTableWidget>
#include <QTabWidget>
#include <QPushButton>
#include <QDoubleSpinBox>
#include <QComboBox>
#include <QLabel>
#include <QGroupBox>
#include <QLineEdit>
#include <QString>
#include <QMap>
#include <QJsonObject>
#include <QTextEdit>

/**
 * @brief Dialog for tuning PIRL training parameters and cost matrix values
 * 
 * Allows interactive editing of:
 * - PPO reward weights (progress, goal, exploration, penalties)
 * - Cost matrix (terrain, land cover, infrastructure)
 * - Hydraulic costs (compressors, velocity penalties)
 * - Constraint penalties (termination thresholds)
 */
class PIRLParameterTuningDialog : public QDialog {
    Q_OBJECT
    
public:
    explicit PIRLParameterTuningDialog(const QString& projectDir, QWidget* parent = nullptr);
    ~PIRLParameterTuningDialog();
    
    // Get modified parameters as JSON
    QJsonObject getModifiedParameters() const;
    
    // Check if any parameters were modified
    bool hasModifications() const { return m_modified; }
    
signals:
    void parametersApplied(const QJsonObject& params);
    void parametersExported(const QString& filePath);
    
private slots:
    void onParameterChanged();
    void onApply();
    void onExport();
    void onReset();
    void onLoadDefaults();
    void onValidateAll();
    
private:
    // UI Components
    QTabWidget* m_tabWidget;
    
    // Tab 1: PPO Rewards
    QWidget* m_rewardsTab;
    QDoubleSpinBox* m_progressRewardMultiplier;
    QDoubleSpinBox* m_goalBonusValue;
    QDoubleSpinBox* m_explorationBonusValue;
    QDoubleSpinBox* m_seaPenalty;
    QDoubleSpinBox* m_builtupPenalty;
    QDoubleSpinBox* m_powerlinePenalty;
    QDoubleSpinBox* m_railwayPenalty;
    QDoubleSpinBox* m_curvaturePenaltyRate;
    QDoubleSpinBox* m_outOfBoundsPenalty;
    QDoubleSpinBox* m_costNormalizationFactor;
    QTextEdit* m_rewardPreviewLabel;
    
    // Tab 2: Cost Matrix - Terrain (ENHANCED)
    QWidget* m_terrainTab;
    QComboBox* m_currencySelector;
    QDoubleSpinBox* m_baseTerrainCost;
    QDoubleSpinBox* m_slopeLinearFactor;
    QDoubleSpinBox* m_slopeQuadraticFactor;
    QTableWidget* m_slopeRangeTable;
    QPushButton* m_addSlopeRangeBtn;
    QPushButton* m_removeSlopeRangeBtn;
    QDoubleSpinBox* m_soilFactorMin;
    QDoubleSpinBox* m_soilFactorMax;
    QDoubleSpinBox* m_geohazardFactorMin;
    QDoubleSpinBox* m_geohazardFactorMax;
    QMap<QString, QDoubleSpinBox*> m_terrainMultipliers;
    
    // Tab 3: Cost Matrix - Land Cover (ENHANCED - Now Multipliers)
    QWidget* m_landcoverTab;
    QTableWidget* m_landcoverTable;
    QLabel* m_landcoverBaseLabel; // Shows calculated base from terrain cost
    QMap<int, QDoubleSpinBox*> m_landcoverMultipliers; // ESA WorldCover class -> multiplier
    
    // Tab 4: Cost Matrix - Infrastructure (ENHANCED - Component-based)
    QWidget* m_infrastructureTab;
    
    // Crossing cost components struct
    struct CrossingCostControls {
        QDoubleSpinBox* baseCost;
        QDoubleSpinBox* drillingCostPerM;
        QDoubleSpinBox* installationCostPerM;
        QDoubleSpinBox* drillLengthMultiplier;
    };
    
    CrossingCostControls m_roadCrossingControls;
    CrossingCostControls m_waterwayCrossingControls;
    CrossingCostControls m_railwayCrossingControls;
    CrossingCostControls m_powerlineCrossingControls;
    
    // Tab 5: Hydraulic Costs
    QWidget* m_hydraulicsTab;
    QDoubleSpinBox* m_compressorBaseCost;
    QDoubleSpinBox* m_compressorPowerCost;
    QDoubleSpinBox* m_erosionVelocityThreshold;
    QDoubleSpinBox* m_erosionPenaltyRate;
    QDoubleSpinBox* m_dropoutVelocityThreshold;
    QDoubleSpinBox* m_dropoutPenaltyRate;
    QDoubleSpinBox* m_excessivePressureDropThreshold;
    QDoubleSpinBox* m_excessivePressureDropPenalty;
    
    // Tab 6: Constraint Thresholds
    QWidget* m_constraintsTab;
    QDoubleSpinBox* m_maxSlopePercent;
    QDoubleSpinBox* m_minDeliveryPressure;
    QDoubleSpinBox* m_maxOperatingPressure;
    QDoubleSpinBox* m_powerlineClearance;
    QDoubleSpinBox* m_powerlineCrossingThreshold;
    QDoubleSpinBox* m_railwayClearance;
    QDoubleSpinBox* m_railwayCrossingThreshold;
    QDoubleSpinBox* m_seaExclusionDistance;
    QDoubleSpinBox* m_goalDistanceThreshold;
    QDoubleSpinBox* m_explorationBonusMilestone;
    
    // Bottom buttons
    QPushButton* m_applyButton;
    QPushButton* m_exportButton;
    QPushButton* m_resetButton;
    QPushButton* m_validateButton;
    QPushButton* m_closeButton;
    QLabel* m_statusLabel;
    
    // Data
    QString m_projectDir;
    QJsonObject m_currentParams;
    QJsonObject m_defaultParams;
    bool m_modified;
    
    // Methods
    void setupUI();
    void setupRewardsTab();
    void setupTerrainTab();
    void setupLandcoverTab();
    void setupInfrastructureTab();
    void setupHydraulicsTab();
    void setupConstraintsTab();
    
    void loadCurrentParameters();
    void loadDefaultParameters();
    void updateRewardPreview();
    void validateParameter(const QString& name, double value);
    
    QJsonObject buildParametersJSON() const;
    void applyParametersToProject(const QJsonObject& params);
    void exportParametersToFile(const QString& filePath);
    
    // Helper to create labeled spinbox
    QDoubleSpinBox* createSpinBox(double min, double max, double step, double value, const QString& suffix = "");
};

#endif // PIRL_PARAMETER_TUNING_DIALOG_H

