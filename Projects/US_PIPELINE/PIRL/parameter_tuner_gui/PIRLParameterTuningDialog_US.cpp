#include "PIRLParameterTuningDialog_US.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGridLayout>
#include <QMessageBox>
#include <QFileDialog>
#include <QJsonDocument>
#include <QJsonArray>
#include <QFile>
#include <QProcess>
#include <QDir>
#include <QTextStream>
#include <QDebug>

PIRLParameterTuningDialogUS::PIRLParameterTuningDialogUS(const QString& projectDir, QWidget* parent)
    : QDialog(parent), m_projectDir(projectDir), m_modified(false)
{
    setWindowTitle("US_PIPELINE PIRL Parameter Tuner (7D State Space)");
    setMinimumSize(800, 600);
    
    setupUI();
    loadDefaultParameters();
    loadCurrentParameters();
    updateRewardPreview();
}

PIRLParameterTuningDialogUS::~PIRLParameterTuningDialogUS() = default;

void PIRLParameterTuningDialogUS::setupUI() {
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    
    // Title label
    QLabel* titleLabel = new QLabel("Simplified Parameter Tuning - Slope Optimization Only");
    titleLabel->setStyleSheet("font-size: 14pt; font-weight: bold; color: #2c3e50;");
    mainLayout->addWidget(titleLabel);
    
    // Tab widget
    m_tabWidget = new QTabWidget();
    mainLayout->addWidget(m_tabWidget);
    
    setupRewardsTab();
    setupConstraintsTab();
    setupHyperparametersTab();
    setupTestingTab();
    
    // Status label
    m_statusLabel = new QLabel("Ready");
    m_statusLabel->setStyleSheet("color: green; font-weight: bold;");
    mainLayout->addWidget(m_statusLabel);
    
    // Bottom buttons
    QHBoxLayout* buttonLayout = new QHBoxLayout();
    
    m_applyButton = new QPushButton("Apply");
    m_applyButton->setStyleSheet("background-color: #2ecc71; color: white; font-weight: bold; padding: 8px;");
    connect(m_applyButton, &QPushButton::clicked, this, &PIRLParameterTuningDialogUS::onApply);
    
    m_exportButton = new QPushButton("Export JSON");
    m_exportButton->setStyleSheet("background-color: #3498db; color: white; padding: 8px;");
    connect(m_exportButton, &QPushButton::clicked, this, &PIRLParameterTuningDialogUS::onExport);
    
    m_resetButton = new QPushButton("Reset to Defaults");
    m_resetButton->setStyleSheet("background-color: #e74c3c; color: white; padding: 8px;");
    connect(m_resetButton, &QPushButton::clicked, this, &PIRLParameterTuningDialogUS::onReset);
    
    m_closeButton = new QPushButton("Close");
    connect(m_closeButton, &QPushButton::clicked, this, &QDialog::accept);
    
    buttonLayout->addWidget(m_applyButton);
    buttonLayout->addWidget(m_exportButton);
    buttonLayout->addWidget(m_resetButton);
    buttonLayout->addStretch();
    buttonLayout->addWidget(m_closeButton);
    
    mainLayout->addLayout(buttonLayout);
}

void PIRLParameterTuningDialogUS::setupRewardsTab() {
    m_rewardsTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_rewardsTab);
    
    // Info label
    QLabel* infoLabel = new QLabel(
        "<b>Reward Function Parameters (7D State Space)</b><br>"
        "These parameters control the agent's learning behavior for slope optimization."
    );
    infoLabel->setWordWrap(true);
    infoLabel->setStyleSheet("background-color: #ecf0f1; padding: 10px; border-radius: 5px;");
    layout->addWidget(infoLabel);
    
    // Form layout for parameters
    QFormLayout* formLayout = new QFormLayout();
    
    // Progress Multiplier
    m_progressMultiplier = createDoubleSpinBox(0.1, 20.0, 0.1, 2.0);
    formLayout->addRow("Progress Multiplier:", m_progressMultiplier);
    QLabel* progLabel = new QLabel("Reward per meter toward goal (higher = more direct routing)");
    progLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", progLabel);
    
    // Slope Reward Scale
    m_slopeRewardScale = createDoubleSpinBox(1.0, 100.0, 1.0, 10.0);
    formLayout->addRow("Slope Reward Scale:", m_slopeRewardScale);
    QLabel* slopeRewardLabel = new QLabel("Max reward for 0% slope (linear 0-20%)");
    slopeRewardLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", slopeRewardLabel);
    
    // Slope Penalty Scale
    m_slopePenaltyScale = createDoubleSpinBox(-1000.0, -10.0, 10.0, -100.0);
    formLayout->addRow("Slope Penalty Scale:", m_slopePenaltyScale);
    QLabel* slopePenaltyLabel = new QLabel("Max penalty for 50% slope (quadratic 20-50%)");
    slopePenaltyLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", slopePenaltyLabel);
    
    // Boundary Penalty Scale
    m_boundaryPenaltyScale = createDoubleSpinBox(-500.0, -5.0, 5.0, -50.0);
    formLayout->addRow("Boundary Penalty Scale:", m_boundaryPenaltyScale);
    QLabel* boundaryLabel = new QLabel("Max penalty at AOI boundary");
    boundaryLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", boundaryLabel);
    
    // Boundary Penalty Distance
    m_boundaryPenaltyDistance = createDoubleSpinBox(10.0, 500.0, 10.0, 100.0, " m");
    formLayout->addRow("Boundary Distance:", m_boundaryPenaltyDistance);
    QLabel* boundaryDistLabel = new QLabel("Distance threshold for boundary penalty");
    boundaryDistLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", boundaryDistLabel);
    
    // Curvature Penalty Rate
    m_curvaturePenaltyRate = createDoubleSpinBox(-10.0, -0.05, 0.05, -0.5);
    formLayout->addRow("Curvature Penalty Rate:", m_curvaturePenaltyRate);
    QLabel* curvatureLabel = new QLabel("Penalty per radian of heading change");
    curvatureLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", curvatureLabel);
    
    // Goal Bonus
    m_goalBonus = createDoubleSpinBox(50.0, 10000.0, 50.0, 1000.0);
    formLayout->addRow("Goal Bonus:", m_goalBonus);
    QLabel* goalLabel = new QLabel("Reward for reaching goal (within 50m)");
    goalLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", goalLabel);
    
    layout->addLayout(formLayout);
    
    // Reward preview
    QLabel* previewLabel = new QLabel("<b>Reward Function Preview:</b>");
    layout->addWidget(previewLabel);
    
    m_rewardPreviewLabel = new QTextEdit();
    m_rewardPreviewLabel->setReadOnly(true);
    m_rewardPreviewLabel->setMaximumHeight(150);
    m_rewardPreviewLabel->setStyleSheet("background-color: #f8f9fa; font-family: monospace;");
    layout->addWidget(m_rewardPreviewLabel);
    
    layout->addStretch();
    
    // Connect signals
    connect(m_progressMultiplier, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_slopeRewardScale, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_slopePenaltyScale, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_boundaryPenaltyScale, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_boundaryPenaltyDistance, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_curvaturePenaltyRate, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_goalBonus, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    
    m_tabWidget->addTab(m_rewardsTab, "Reward Function");
}

void PIRLParameterTuningDialogUS::setupConstraintsTab() {
    m_constraintsTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_constraintsTab);
    
    // Info label
    QLabel* infoLabel = new QLabel(
        "<b>Physical and Operational Constraints</b><br>"
        "These parameters define hard limits and operational boundaries."
    );
    infoLabel->setWordWrap(true);
    infoLabel->setStyleSheet("background-color: #ecf0f1; padding: 10px; border-radius: 5px;");
    layout->addWidget(infoLabel);
    
    // Form layout
    QFormLayout* formLayout = new QFormLayout();
    
    // Max Slope Percent
    m_maxSlopePercent = createDoubleSpinBox(10.0, 100.0, 1.0, 50.0, "%");
    formLayout->addRow("Max Slope (Terminal):", m_maxSlopePercent);
    QLabel* maxSlopeLabel = new QLabel("Episode terminates if slope exceeds this value");
    maxSlopeLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", maxSlopeLabel);
    
    // Slope Neutral Threshold
    m_slopeNeutralThreshold = createDoubleSpinBox(5.0, 50.0, 1.0, 20.0, "%");
    formLayout->addRow("Slope Neutral Threshold:", m_slopeNeutralThreshold);
    QLabel* neutralLabel = new QLabel("Slope with 0 reward (linear below, quadratic penalty above)");
    neutralLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", neutralLabel);
    
    // Max Steps Per Episode
    m_maxStepsPerEpisode = createSpinBox(100, 10000, 5000);
    formLayout->addRow("Max Steps Per Episode:", m_maxStepsPerEpisode);
    QLabel* maxStepsLabel = new QLabel("Safety limit for episode length");
    maxStepsLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", maxStepsLabel);
    
    // Step Size Range
    m_stepSizeMin = createDoubleSpinBox(10.0, 100.0, 5.0, 40.0, " m");
    formLayout->addRow("Min Step Size:", m_stepSizeMin);
    
    m_stepSizeMax = createDoubleSpinBox(100.0, 500.0, 10.0, 300.0, " m");
    formLayout->addRow("Max Step Size:", m_stepSizeMax);
    QLabel* stepSizeLabel = new QLabel("Movement distance range (optimized for 10m DEM resolution)");
    stepSizeLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", stepSizeLabel);
    
    // Goal Distance Threshold
    m_goalDistanceThreshold = createDoubleSpinBox(10.0, 200.0, 10.0, 50.0, " m");
    formLayout->addRow("Goal Distance Threshold:", m_goalDistanceThreshold);
    QLabel* goalThresholdLabel = new QLabel("Distance for goal bonus and success");
    goalThresholdLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", goalThresholdLabel);
    
    layout->addLayout(formLayout);
    layout->addStretch();
    
    // Connect signals
    connect(m_maxSlopePercent, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_slopeNeutralThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_maxStepsPerEpisode, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_stepSizeMin, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_stepSizeMax, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_goalDistanceThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    
    m_tabWidget->addTab(m_constraintsTab, "Constraints");
}

void PIRLParameterTuningDialogUS::setupHyperparametersTab() {
    m_hyperparametersTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_hyperparametersTab);
    
    // Info label
    QLabel* infoLabel = new QLabel(
        "<b>Training Hyperparameters (PPO Algorithm)</b><br>"
        "These parameters control the neural network training process."
    );
    infoLabel->setWordWrap(true);
    infoLabel->setStyleSheet("background-color: #ecf0f1; padding: 10px; border-radius: 5px;");
    layout->addWidget(infoLabel);
    
    // Form layout
    QFormLayout* formLayout = new QFormLayout();
    
    // Learning Rate
    m_learningRate = createDoubleSpinBox(0.00001, 0.01, 0.00001, 0.0003);
    m_learningRate->setDecimals(5);
    formLayout->addRow("Learning Rate:", m_learningRate);
    QLabel* lrLabel = new QLabel("Adam optimizer learning rate (lower = more stable, slower learning)");
    lrLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", lrLabel);
    
    // Batch Size
    m_batchSize = createSpinBox(32, 2048, 256);
    formLayout->addRow("Batch Size:", m_batchSize);
    QLabel* batchLabel = new QLabel("Number of samples per gradient update (higher = more stable)");
    batchLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", batchLabel);
    
    // N Steps
    m_nSteps = createSpinBox(128, 8192, 2048);
    formLayout->addRow("Steps per Update:", m_nSteps);
    QLabel* nStepsLabel = new QLabel("Rollout steps before policy update");
    nStepsLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", nStepsLabel);
    
    // N Epochs
    m_nEpochs = createSpinBox(1, 50, 10);
    formLayout->addRow("Epochs per Update:", m_nEpochs);
    QLabel* nEpochsLabel = new QLabel("Number of passes over rollout buffer");
    nEpochsLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", nEpochsLabel);
    
    // Gamma
    m_gamma = createDoubleSpinBox(0.9, 0.999, 0.001, 0.99);
    m_gamma->setDecimals(3);
    formLayout->addRow("Gamma (Discount Factor):", m_gamma);
    QLabel* gammaLabel = new QLabel("Future reward discount (higher = more far-sighted)");
    gammaLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", gammaLabel);
    
    // GAE Lambda
    m_gaeLambda = createDoubleSpinBox(0.8, 0.99, 0.01, 0.95);
    m_gaeLambda->setDecimals(2);
    formLayout->addRow("GAE Lambda:", m_gaeLambda);
    QLabel* gaeLabel = new QLabel("Generalized Advantage Estimation smoothing factor");
    gaeLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", gaeLabel);
    
    // Clip Range
    m_clipRange = createDoubleSpinBox(0.05, 0.5, 0.05, 0.2);
    m_clipRange->setDecimals(2);
    formLayout->addRow("Clip Range:", m_clipRange);
    QLabel* clipLabel = new QLabel("PPO clipping parameter (prevents large policy updates)");
    clipLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", clipLabel);
    
    // Entropy Coefficient
    m_entCoef = createDoubleSpinBox(0.0, 0.1, 0.001, 0.01);
    m_entCoef->setDecimals(3);
    formLayout->addRow("Entropy Coefficient:", m_entCoef);
    QLabel* entLabel = new QLabel("Exploration bonus (higher = more exploration)");
    entLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", entLabel);
    
    // Value Function Coefficient
    m_vfCoef = createDoubleSpinBox(0.1, 2.0, 0.1, 0.5);
    m_vfCoef->setDecimals(1);
    formLayout->addRow("Value Function Coef:", m_vfCoef);
    QLabel* vfLabel = new QLabel("Weight of value function loss in total loss");
    vfLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", vfLabel);
    
    // Max Gradient Norm
    m_maxGradNorm = createDoubleSpinBox(0.1, 10.0, 0.1, 0.5);
    m_maxGradNorm->setDecimals(1);
    formLayout->addRow("Max Gradient Norm:", m_maxGradNorm);
    QLabel* gradLabel = new QLabel("Gradient clipping threshold (prevents exploding gradients)");
    gradLabel->setStyleSheet("color: gray; font-size: 9pt; margin-left: 20px;");
    formLayout->addRow("", gradLabel);
    
    layout->addLayout(formLayout);
    layout->addStretch();
    
    // Connect signals
    connect(m_learningRate, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_batchSize, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_nSteps, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_nEpochs, QOverload<int>::of(&QSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_gamma, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_gaeLambda, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_clipRange, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_entCoef, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_vfCoef, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    connect(m_maxGradNorm, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &PIRLParameterTuningDialogUS::onParameterChanged);
    
    m_tabWidget->addTab(m_hyperparametersTab, "Hyperparameters");
}

void PIRLParameterTuningDialogUS::setupTestingTab() {
    m_testingTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_testingTab);
    
    // Info label
    QLabel* infoLabel = new QLabel(
        "<b>Parameter Testing</b><br>"
        "Test your parameters before committing to full training."
    );
    infoLabel->setWordWrap(true);
    infoLabel->setStyleSheet("background-color: #ecf0f1; padding: 10px; border-radius: 5px;");
    layout->addWidget(infoLabel);
    
    // Test configuration
    QGroupBox* testConfigBox = new QGroupBox("Test Configuration");
    QFormLayout* formLayout = new QFormLayout();
    
    m_numEpisodes = createSpinBox(1, 100, 20);
    formLayout->addRow("Number of Episodes:", m_numEpisodes);
    
    m_maxStepsTest = createSpinBox(10, 500, 100);
    formLayout->addRow("Max Steps Per Episode:", m_maxStepsTest);
    
    testConfigBox->setLayout(formLayout);
    layout->addWidget(testConfigBox);
    
    // Test buttons
    QHBoxLayout* buttonLayout = new QHBoxLayout();
    
    m_runTestButton = new QPushButton("Run Single Test");
    m_runTestButton->setStyleSheet("background-color: #3498db; color: white; padding: 10px; font-weight: bold;");
    connect(m_runTestButton, &QPushButton::clicked, this, &PIRLParameterTuningDialogUS::onRunTest);
    
    m_runGridSearchButton = new QPushButton("Run Grid Search (36 configs)");
    m_runGridSearchButton->setStyleSheet("background-color: #9b59b6; color: white; padding: 10px; font-weight: bold;");
    connect(m_runGridSearchButton, &QPushButton::clicked, this, &PIRLParameterTuningDialogUS::onRunGridSearch);
    
    buttonLayout->addWidget(m_runTestButton);
    buttonLayout->addWidget(m_runGridSearchButton);
    layout->addLayout(buttonLayout);
    
    // Results display
    QLabel* resultsLabel = new QLabel("<b>Test Results:</b>");
    layout->addWidget(resultsLabel);
    
    m_testResults = new QTextEdit();
    m_testResults->setReadOnly(true);
    m_testResults->setStyleSheet("background-color: #2c3e50; color: #ecf0f1; font-family: monospace;");
    m_testResults->setText("No tests run yet. Click 'Run Single Test' to evaluate parameters.");
    layout->addWidget(m_testResults);
    
    m_tabWidget->addTab(m_testingTab, "Testing");
}

QDoubleSpinBox* PIRLParameterTuningDialogUS::createDoubleSpinBox(double min, double max, double step, double value, const QString& suffix) {
    QDoubleSpinBox* spinBox = new QDoubleSpinBox();
    spinBox->setRange(min, max);
    spinBox->setSingleStep(step);
    spinBox->setValue(value);
    if (!suffix.isEmpty()) {
        spinBox->setSuffix(suffix);
    }
    spinBox->setMinimumWidth(150);
    return spinBox;
}

QSpinBox* PIRLParameterTuningDialogUS::createSpinBox(int min, int max, int value) {
    QSpinBox* spinBox = new QSpinBox();
    spinBox->setRange(min, max);
    spinBox->setValue(value);
    spinBox->setMinimumWidth(150);
    return spinBox;
}

void PIRLParameterTuningDialogUS::onParameterChanged() {
    m_modified = true;
    m_statusLabel->setText("Modified (not saved)");
    m_statusLabel->setStyleSheet("color: orange; font-weight: bold;");
    updateRewardPreview();
}

void PIRLParameterTuningDialogUS::updateRewardPreview() {
    QString preview;
    preview += "Reward Function = Progress + Slope + Boundary + Curvature + Goal\n\n";
    
    preview += QString("Progress:  %1 * meters_toward_goal\n").arg(m_progressMultiplier->value(), 0, 'f', 2);
    
    preview += "\nSlope:\n";
    preview += QString("  0-20%%:   +%1 to 0 (linear)\n").arg(m_slopeRewardScale->value(), 0, 'f', 1);
    preview += QString("  20-50%%:  0 to %1 (quadratic penalty)\n").arg(m_slopePenaltyScale->value(), 0, 'f', 1);
    preview += "  >50%:    -500 (terminal)\n";
    
    preview += QString("\nBoundary: %1 if within %2m\n")
        .arg(m_boundaryPenaltyScale->value(), 0, 'f', 1)
        .arg(m_boundaryPenaltyDistance->value(), 0, 'f', 0);
    
    preview += QString("\nCurvature: %1 * |heading_change|\n").arg(m_curvaturePenaltyRate->value(), 0, 'f', 2);
    
    preview += QString("\nGoal: +%1 if within 50m\n").arg(m_goalBonus->value(), 0, 'f', 0);
    
    m_rewardPreviewLabel->setText(preview);
}

void PIRLParameterTuningDialogUS::onApply() {
    QJsonObject params = buildParametersJSON();
    applyParametersToProject(params);
    
    m_modified = false;
    m_statusLabel->setText("Applied successfully!");
    m_statusLabel->setStyleSheet("color: green; font-weight: bold;");
    
    emit parametersApplied(params);
}

void PIRLParameterTuningDialogUS::onExport() {
    QString fileName = QFileDialog::getSaveFileName(
        this,
        "Export Parameters",
        m_projectDir + "/PIRL/pirl_parameters_custom.json",
        "JSON Files (*.json)"
    );
    
    if (fileName.isEmpty()) return;
    
    QJsonObject params = buildParametersJSON();
    exportParametersToFile(fileName);
    
    m_statusLabel->setText("Exported to: " + fileName);
    m_statusLabel->setStyleSheet("color: blue; font-weight: bold;");
    
    emit parametersExported(fileName);
}

void PIRLParameterTuningDialogUS::onReset() {
    int ret = QMessageBox::question(
        this,
        "Reset Parameters",
        "Reset all parameters to default values?",
        QMessageBox::Yes | QMessageBox::No
    );
    
    if (ret == QMessageBox::Yes) {
        loadDefaultParameters();
        updateRewardPreview();
        m_modified = false;
        m_statusLabel->setText("Reset to defaults");
        m_statusLabel->setStyleSheet("color: green; font-weight: bold;");
    }
}

void PIRLParameterTuningDialogUS::onLoadDefaults() {
    loadDefaultParameters();
}

void PIRLParameterTuningDialogUS::onRunTest() {
    m_testResults->clear();
    m_testResults->append("Running parameter test...\n");
    
    int numEpisodes = m_numEpisodes->value();
    int maxSteps = m_maxStepsTest->value();
    
    runParameterTest(numEpisodes, maxSteps);
}

void PIRLParameterTuningDialogUS::onRunGridSearch() {
    int ret = QMessageBox::question(
        this,
        "Grid Search",
        "This will test 36 parameter configurations.\nThis may take 10-15 minutes. Continue?",
        QMessageBox::Yes | QMessageBox::No
    );
    
    if (ret == QMessageBox::Yes) {
        m_testResults->clear();
        m_testResults->append("Running grid search (36 configurations)...\n");
        runGridSearch(10);
    }
}

void PIRLParameterTuningDialogUS::runParameterTest(int numEpisodes, int maxSteps) {
    // Save current parameters
    QJsonObject params = buildParametersJSON();
    QString tempFile = m_projectDir + "/PIRL/temp_params.json";
    exportParametersToFile(tempFile);
    
    // Run Python tuner script
    QProcess process;
    process.setWorkingDirectory(m_projectDir + "/PIRL/python");
    
    QStringList args;
    args << m_projectDir + "/PIRL/python/tune_parameters_us.py";
    args << "--config" << m_projectDir + "/PIRL/configs/us_pipeline_training_config.yaml";
    args << "--mode" << "single";
    args << "--episodes" << QString::number(numEpisodes);
    args << "--max-steps" << QString::number(maxSteps);
    args << "--progress-multiplier" << QString::number(m_progressMultiplier->value());
    args << "--slope-reward-scale" << QString::number(m_slopeRewardScale->value());
    args << "--slope-penalty-scale" << QString::number(m_slopePenaltyScale->value());
    
    process.start("/opt/agrs/python/pirl_venv/bin/python3", args);
    
    if (!process.waitForFinished(300000)) {  // 5 minute timeout
        m_testResults->append("\n❌ Test timed out or failed to complete\n");
        return;
    }
    
    QString output = process.readAllStandardOutput();
    QString error = process.readAllStandardError();
    
    m_testResults->append(output);
    if (!error.isEmpty()) {
        m_testResults->append("\nErrors:\n" + error);
    }
}

void PIRLParameterTuningDialogUS::runGridSearch(int numEpisodes) {
    QProcess process;
    process.setWorkingDirectory(m_projectDir + "/PIRL/python");
    
    QStringList args;
    args << m_projectDir + "/PIRL/python/tune_parameters_us.py";
    args << "--config" << m_projectDir + "/PIRL/configs/us_pipeline_training_config.yaml";
    args << "--mode" << "grid";
    args << "--episodes" << QString::number(numEpisodes);
    args << "--output-dir" << m_projectDir + "/PIRL/outputs/grid_search";
    
    process.start("/opt/agrs/python/pirl_venv/bin/python3", args);
    
    if (!process.waitForFinished(900000)) {  // 15 minute timeout
        m_testResults->append("\n❌ Grid search timed out or failed to complete\n");
        return;
    }
    
    QString output = process.readAllStandardOutput();
    QString error = process.readAllStandardError();
    
    m_testResults->append(output);
    if (!error.isEmpty()) {
        m_testResults->append("\nErrors:\n" + error);
    }
}

void PIRLParameterTuningDialogUS::loadDefaultParameters() {
    // Reward parameters
    m_progressMultiplier->setValue(2.0);
    m_slopeRewardScale->setValue(10.0);
    m_slopePenaltyScale->setValue(-100.0);
    m_boundaryPenaltyScale->setValue(-50.0);
    m_boundaryPenaltyDistance->setValue(100.0);
    m_curvaturePenaltyRate->setValue(-0.5);
    m_goalBonus->setValue(1000.0);
    
    // Constraints
    m_maxSlopePercent->setValue(50.0);
    m_slopeNeutralThreshold->setValue(20.0);
    m_maxStepsPerEpisode->setValue(5000);
    m_stepSizeMin->setValue(40.0);
    m_stepSizeMax->setValue(300.0);
    m_goalDistanceThreshold->setValue(50.0);
    
    // Hyperparameters (PPO defaults)
    m_learningRate->setValue(0.0003);
    m_batchSize->setValue(256);
    m_nSteps->setValue(2048);
    m_nEpochs->setValue(10);
    m_gamma->setValue(0.99);
    m_gaeLambda->setValue(0.95);
    m_clipRange->setValue(0.2);
    m_entCoef->setValue(0.01);
    m_vfCoef->setValue(0.5);
    m_maxGradNorm->setValue(0.5);
}

void PIRLParameterTuningDialogUS::loadCurrentParameters() {
    // Try to load from project file
    QString paramFile = m_projectDir + "/PIRL/pirl_parameters_simplified_7d.json";
    QFile file(paramFile);
    
    if (file.open(QIODevice::ReadOnly)) {
        QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
        m_currentParams = doc.object();
        
        // Load PPO rewards
        QJsonObject rewards = m_currentParams["ppo_rewards"].toObject();
        m_progressMultiplier->setValue(rewards["progress_multiplier"].toDouble(2.0));
        m_slopeRewardScale->setValue(rewards["slope_reward_scale"].toDouble(10.0));
        m_slopePenaltyScale->setValue(rewards["slope_penalty_scale"].toDouble(-100.0));
        m_boundaryPenaltyScale->setValue(rewards["boundary_penalty_scale"].toDouble(-50.0));
        m_boundaryPenaltyDistance->setValue(rewards["boundary_penalty_distance"].toDouble(100.0));
        m_curvaturePenaltyRate->setValue(rewards["curvature_penalty_rate"].toDouble(-0.5));
        m_goalBonus->setValue(rewards["goal_bonus"].toDouble(1000.0));
        
        // Load constraints
        QJsonObject constraints = m_currentParams["constraints"].toObject();
        m_maxSlopePercent->setValue(constraints["max_slope_percent"].toDouble(50.0));
        m_slopeNeutralThreshold->setValue(constraints["slope_neutral_threshold_percent"].toDouble(20.0));
        m_maxStepsPerEpisode->setValue(constraints["max_steps_per_episode"].toInt(5000));
        m_stepSizeMin->setValue(constraints["step_size_min_m"].toDouble(40.0));
        m_stepSizeMax->setValue(constraints["step_size_max_m"].toDouble(300.0));
        m_goalDistanceThreshold->setValue(constraints["goal_distance_threshold_m"].toDouble(50.0));
        
        // Load hyperparameters
        QJsonObject hyperparams = m_currentParams["hyperparameters"].toObject();
        m_learningRate->setValue(hyperparams["learning_rate"].toDouble(0.0003));
        m_batchSize->setValue(hyperparams["batch_size"].toInt(256));
        m_nSteps->setValue(hyperparams["n_steps"].toInt(2048));
        m_nEpochs->setValue(hyperparams["n_epochs"].toInt(10));
        m_gamma->setValue(hyperparams["gamma"].toDouble(0.99));
        m_gaeLambda->setValue(hyperparams["gae_lambda"].toDouble(0.95));
        m_clipRange->setValue(hyperparams["clip_range"].toDouble(0.2));
        m_entCoef->setValue(hyperparams["ent_coef"].toDouble(0.01));
        m_vfCoef->setValue(hyperparams["vf_coef"].toDouble(0.5));
        m_maxGradNorm->setValue(hyperparams["max_grad_norm"].toDouble(0.5));
    }
}

QJsonObject PIRLParameterTuningDialogUS::buildParametersJSON() const {
    QJsonObject params;
    params["version"] = "2.0";
    params["state_space_dim"] = 7;
    params["action_space_dim"] = 2;
    
    // PPO rewards
    QJsonObject rewards;
    rewards["progress_multiplier"] = m_progressMultiplier->value();
    rewards["slope_reward_scale"] = m_slopeRewardScale->value();
    rewards["slope_penalty_scale"] = m_slopePenaltyScale->value();
    rewards["boundary_penalty_scale"] = m_boundaryPenaltyScale->value();
    rewards["boundary_penalty_distance"] = m_boundaryPenaltyDistance->value();
    rewards["curvature_penalty_rate"] = m_curvaturePenaltyRate->value();
    rewards["goal_bonus"] = m_goalBonus->value();
    params["ppo_rewards"] = rewards;
    
    // Constraints
    QJsonObject constraints;
    constraints["max_slope_percent"] = m_maxSlopePercent->value();
    constraints["slope_neutral_threshold_percent"] = m_slopeNeutralThreshold->value();
    constraints["max_steps_per_episode"] = m_maxStepsPerEpisode->value();
    constraints["step_size_min_m"] = m_stepSizeMin->value();
    constraints["step_size_max_m"] = m_stepSizeMax->value();
    constraints["goal_distance_threshold_m"] = m_goalDistanceThreshold->value();
    params["constraints"] = constraints;
    
    // Hyperparameters (PPO training)
    QJsonObject hyperparams;
    hyperparams["learning_rate"] = m_learningRate->value();
    hyperparams["batch_size"] = m_batchSize->value();
    hyperparams["n_steps"] = m_nSteps->value();
    hyperparams["n_epochs"] = m_nEpochs->value();
    hyperparams["gamma"] = m_gamma->value();
    hyperparams["gae_lambda"] = m_gaeLambda->value();
    hyperparams["clip_range"] = m_clipRange->value();
    hyperparams["ent_coef"] = m_entCoef->value();
    hyperparams["vf_coef"] = m_vfCoef->value();
    hyperparams["max_grad_norm"] = m_maxGradNorm->value();
    params["hyperparameters"] = hyperparams;
    
    return params;
}

void PIRLParameterTuningDialogUS::applyParametersToProject(const QJsonObject& params) {
    // Save to JSON file
    QString paramFile = m_projectDir + "/PIRL/pirl_parameters_simplified_7d.json";
    exportParametersToFile(paramFile);
    
    // Update YAML config file to match
    updateYAMLConfig(params);
}

void PIRLParameterTuningDialogUS::exportParametersToFile(const QString& filePath) {
    QJsonObject params = buildParametersJSON();
    
    QFile file(filePath);
    if (file.open(QIODevice::WriteOnly)) {
        QJsonDocument doc(params);
        file.write(doc.toJson(QJsonDocument::Indented));
        file.close();
    }
}

void PIRLParameterTuningDialogUS::updateYAMLConfig(const QJsonObject& params) {
    QString yamlPath = m_projectDir + "/PIRL/configs/us_pipeline_training_config.yaml";
    QFile yamlFile(yamlPath);
    
    if (!yamlFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        qWarning() << "Failed to open YAML config:" << yamlPath;
        return;
    }
    
    // Read current YAML content
    QStringList lines;
    QTextStream in(&yamlFile);
    while (!in.atEnd()) {
        lines << in.readLine();
    }
    yamlFile.close();
    
    // Extract parameters from JSON
    QJsonObject constraints = params["constraints"].toObject();
    QJsonObject hyperparams = params["hyperparameters"].toObject();
    
    // Update constraint lines in YAML
    for (int i = 0; i < lines.size(); ++i) {
        QString& line = lines[i];
        
        // Constraints section
        if (line.contains("max_slope_percent:")) {
            line = QString("  max_slope_percent: %1   # Terminal slope limit")
                   .arg(constraints["max_slope_percent"].toDouble());
        }
        else if (line.contains("max_steps_per_episode:")) {
            line = QString("  max_steps_per_episode: %1  # Episode step limit")
                   .arg(constraints["max_steps_per_episode"].toInt());
        }
        else if (line.contains("step_size_min_m:")) {
            line = QString("  step_size_min_m: %1    # Minimum step size")
                   .arg(constraints["step_size_min_m"].toDouble());
        }
        else if (line.contains("step_size_max_m:")) {
            line = QString("  step_size_max_m: %1   # Maximum step size")
                   .arg(constraints["step_size_max_m"].toDouble());
        }
        else if (line.contains("goal_distance_threshold_m:")) {
            line = QString("  goal_distance_threshold_m: %1  # Goal reach threshold")
                   .arg(constraints["goal_distance_threshold_m"].toDouble());
        }
        
        // Hyperparameters section
        else if (line.contains("learning_rate:") && line.contains("#")) {
            line = QString("  learning_rate: %1 # Adam optimizer learning rate")
                   .arg(hyperparams["learning_rate"].toDouble(), 0, 'f', 5);
        }
        else if (line.contains("batch_size:") && line.contains("#")) {
            line = QString("  batch_size: %1       # Number of samples per gradient update")
                   .arg(hyperparams["batch_size"].toInt());
        }
        else if (line.contains("n_steps:") && !line.contains("max_steps")) {
            line = QString("  n_steps: %1         # Rollout steps before policy update")
                   .arg(hyperparams["n_steps"].toInt());
        }
        else if (line.contains("n_epochs:")) {
            line = QString("  n_epochs: %1          # Number of passes over rollout buffer")
                   .arg(hyperparams["n_epochs"].toInt());
        }
        else if (line.contains("gamma:") && !line.contains("gae")) {
            line = QString("  gamma: %1           # Discount factor for future rewards")
                   .arg(hyperparams["gamma"].toDouble(), 0, 'f', 2);
        }
        else if (line.contains("gae_lambda:")) {
            line = QString("  gae_lambda: %1      # Generalized Advantage Estimation smoothing")
                   .arg(hyperparams["gae_lambda"].toDouble(), 0, 'f', 2);
        }
        else if (line.contains("clip_range:")) {
            line = QString("  clip_range: %1        # PPO clipping parameter")
                   .arg(hyperparams["clip_range"].toDouble(), 0, 'f', 2);
        }
        else if (line.contains("ent_coef:")) {
            line = QString("  ent_coef: %1        # Entropy coefficient for exploration")
                   .arg(hyperparams["ent_coef"].toDouble(), 0, 'f', 3);
        }
        else if (line.contains("vf_coef:")) {
            line = QString("  vf_coef: %1          # Value function loss coefficient")
                   .arg(hyperparams["vf_coef"].toDouble(), 0, 'f', 1);
        }
        else if (line.contains("max_grad_norm:")) {
            line = QString("  max_grad_norm: %1    # Gradient clipping threshold")
                   .arg(hyperparams["max_grad_norm"].toDouble(), 0, 'f', 1);
        }
    }
    
    // Write updated YAML
    if (!yamlFile.open(QIODevice::WriteOnly | QIODevice::Text)) {
        qWarning() << "Failed to write YAML config:" << yamlPath;
        return;
    }
    
    QTextStream out(&yamlFile);
    for (const QString& line : lines) {
        out << line << "\n";
    }
    yamlFile.close();
    
    qDebug() << "✓ Updated YAML config:" << yamlPath;
}

void PIRLParameterTuningDialogUS::validateParameter(const QString& name, double value) {
    // Add validation logic if needed
}

QJsonObject PIRLParameterTuningDialogUS::getModifiedParameters() const {
    return buildParametersJSON();
}

