#ifndef PIRL_PARAMETER_TUNING_DIALOG_US_H
#define PIRL_PARAMETER_TUNING_DIALOG_US_H

#include <QDialog>
#include <QTabWidget>
#include <QPushButton>
#include <QDoubleSpinBox>
#include <QSpinBox>
#include <QLabel>
#include <QGroupBox>
#include <QString>
#include <QJsonObject>
#include <QTextEdit>

/**
 * @brief Simplified Dialog for tuning PIRL parameters (7D State Space)
 * 
 * US_PIPELINE version - focuses on slope optimization only
 * 
 * Parameters included:
 * - Progress reward
 * - Slope reward/penalty (0-20%, 20-50%, >50%)
 * - Boundary penalty
 * - Curvature penalty
 * - Goal bonus
 * - Constraints (max slope, step size range, max steps)
 */
class PIRLParameterTuningDialogUS : public QDialog {
    Q_OBJECT
    
public:
    explicit PIRLParameterTuningDialogUS(const QString& projectDir, QWidget* parent = nullptr);
    ~PIRLParameterTuningDialogUS();
    
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
    void onRunTest();
    void onRunGridSearch();
    
private:
    // UI Components
    QTabWidget* m_tabWidget;
    
    // Tab 1: Reward Function
    QWidget* m_rewardsTab;
    QDoubleSpinBox* m_progressMultiplier;
    QDoubleSpinBox* m_slopeRewardScale;
    QDoubleSpinBox* m_slopePenaltyScale;
    QDoubleSpinBox* m_boundaryPenaltyScale;
    QDoubleSpinBox* m_boundaryPenaltyDistance;
    QDoubleSpinBox* m_curvaturePenaltyRate;
    QDoubleSpinBox* m_goalBonus;
    QTextEdit* m_rewardPreviewLabel;
    
    // Tab 2: Constraints
    QWidget* m_constraintsTab;
    QDoubleSpinBox* m_maxSlopePercent;
    QDoubleSpinBox* m_slopeNeutralThreshold;
    QSpinBox* m_maxStepsPerEpisode;
    QDoubleSpinBox* m_stepSizeMin;
    QDoubleSpinBox* m_stepSizeMax;
    QDoubleSpinBox* m_goalDistanceThreshold;
    
    // Tab 3: Hyperparameters
    QWidget* m_hyperparametersTab;
    QDoubleSpinBox* m_learningRate;
    QSpinBox* m_batchSize;
    QSpinBox* m_nSteps;
    QSpinBox* m_nEpochs;
    QDoubleSpinBox* m_gamma;
    QDoubleSpinBox* m_gaeLambda;
    QDoubleSpinBox* m_clipRange;
    QDoubleSpinBox* m_entCoef;
    QDoubleSpinBox* m_vfCoef;
    QDoubleSpinBox* m_maxGradNorm;
    
    // Tab 4: Testing
    QWidget* m_testingTab;
    QSpinBox* m_numEpisodes;
    QSpinBox* m_maxStepsTest;
    QTextEdit* m_testResults;
    QPushButton* m_runTestButton;
    QPushButton* m_runGridSearchButton;
    
    // Bottom buttons
    QPushButton* m_applyButton;
    QPushButton* m_exportButton;
    QPushButton* m_resetButton;
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
    void setupConstraintsTab();
    void setupHyperparametersTab();
    void setupTestingTab();
    
    void loadCurrentParameters();
    void loadDefaultParameters();
    void updateRewardPreview();
    void validateParameter(const QString& name, double value);
    
    QJsonObject buildParametersJSON() const;
    void applyParametersToProject(const QJsonObject& params);
    void exportParametersToFile(const QString& filePath);
    void updateYAMLConfig(const QJsonObject& params);
    
    void runParameterTest(int numEpisodes, int maxSteps);
    void runGridSearch(int numEpisodes);
    
    // Helper to create labeled spinbox
    QDoubleSpinBox* createDoubleSpinBox(double min, double max, double step, double value, const QString& suffix = "");
    QSpinBox* createSpinBox(int min, int max, int value);
};

#endif // PIRL_PARAMETER_TUNING_DIALOG_US_H

