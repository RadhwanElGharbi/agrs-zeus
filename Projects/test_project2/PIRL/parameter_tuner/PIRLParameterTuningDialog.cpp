#include "PIRLParameterTuningDialog.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGridLayout>
#include <QHeaderView>
#include <QMessageBox>
#include <QFileDialog>
#include <QFile>
#include <QJsonDocument>
#include <QJsonArray>
#include <QDateTime>
#include <QScrollArea>
#include <QDir>
#include <QFont>
#include <QGroupBox>

PIRLParameterTuningDialog::PIRLParameterTuningDialog(const QString& projectDir, QWidget* parent)
    : QDialog(parent),
      m_projectDir(projectDir),
      m_modified(false)
{
    setWindowTitle("PIRL Parameter Tuner - " + projectDir);
    resize(1000, 800);
    
    // Load JSON first
    loadDefaultParameters();
    
    // Setup UI (creates all spinboxes)
    setupUI();
    
    // Now load current parameters into the spinboxes
    loadCurrentParameters();
    
    // Update preview
    updateRewardPreview();
}

PIRLParameterTuningDialog::~PIRLParameterTuningDialog()
{
}

void PIRLParameterTuningDialog::setupUI()
{
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    
    // Title
    QLabel* titleLabel = new QLabel("PIRL Parameter Tuning Dialog");
    QFont titleFont = titleLabel->font();
    titleFont.setPointSize(16);
    titleFont.setBold(true);
    titleLabel->setFont(titleFont);
    titleLabel->setAlignment(Qt::AlignCenter);
    mainLayout->addWidget(titleLabel);
    
    // Project info
    QLabel* projectLabel = new QLabel("Project: " + m_projectDir);
    projectLabel->setStyleSheet("QLabel { color: #666; padding: 5px; }");
    mainLayout->addWidget(projectLabel);
    
    // Tab widget
    m_tabWidget = new QTabWidget();
    setupRewardsTab();
    setupTerrainTab();
    setupLandcoverTab();
    setupInfrastructureTab();
    setupHydraulicsTab();
    setupConstraintsTab();
    mainLayout->addWidget(m_tabWidget);
    
    // Status label
    m_statusLabel = new QLabel("Ready - Modify parameters and click Export to save changes");
    m_statusLabel->setStyleSheet("QLabel { padding: 8px; background-color: #e3f2fd; border-radius: 4px; }");
    mainLayout->addWidget(m_statusLabel);
    
    // Bottom buttons
    QHBoxLayout* buttonLayout = new QHBoxLayout();
    
    m_resetButton = new QPushButton("Reset to Defaults");
    m_resetButton->setToolTip("Reset all parameters to default values");
    connect(m_resetButton, &QPushButton::clicked, this, &PIRLParameterTuningDialog::onReset);
    buttonLayout->addWidget(m_resetButton);
    
    m_validateButton = new QPushButton("Validate Parameters");
    m_validateButton->setToolTip("Check parameter ranges and balance");
    connect(m_validateButton, &QPushButton::clicked, this, &PIRLParameterTuningDialog::onValidateAll);
    buttonLayout->addWidget(m_validateButton);
    
    buttonLayout->addStretch();
    
    m_exportButton = new QPushButton("Export to JSON");
    m_exportButton->setToolTip("Save parameters to pirl_parameter_overrides.json");
    m_exportButton->setStyleSheet("QPushButton { background-color: #4CAF50; color: white; font-weight: bold; padding: 8px 16px; }");
    connect(m_exportButton, &QPushButton::clicked, this, &PIRLParameterTuningDialog::onExport);
    buttonLayout->addWidget(m_exportButton);
    
    m_applyButton = new QPushButton("Apply");
    m_applyButton->setToolTip("Apply parameters (emits signal for integration)");
    connect(m_applyButton, &QPushButton::clicked, this, &PIRLParameterTuningDialog::onApply);
    buttonLayout->addWidget(m_applyButton);
    
    m_closeButton = new QPushButton("Close");
    connect(m_closeButton, &QPushButton::clicked, this, &QDialog::accept);
    buttonLayout->addWidget(m_closeButton);
    
    mainLayout->addLayout(buttonLayout);
}

void PIRLParameterTuningDialog::setupRewardsTab()
{
    m_rewardsTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_rewardsTab);
    
    QScrollArea* scrollArea = new QScrollArea();
    scrollArea->setWidgetResizable(true);
    QWidget* scrollWidget = new QWidget();
    QVBoxLayout* scrollLayout = new QVBoxLayout(scrollWidget);
    
    // PPO Reward Weights Group
    QGroupBox* rewardsGroup = new QGroupBox("PPO Reward Weights");
    QFormLayout* rewardsForm = new QFormLayout();
    
    m_progressRewardMultiplier = createSpinBox(0.1, 10.0, 0.1, 2.0);
    m_progressRewardMultiplier->setToolTip("Multiplier for distance progress toward goal (m). Higher = stronger goal-seeking.");
    rewardsForm->addRow("Progress Reward Multiplier:", m_progressRewardMultiplier);
    connect(m_progressRewardMultiplier, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_goalBonusValue = createSpinBox(1000.0, 50000.0, 1000.0, 10000.0);
    m_goalBonusValue->setToolTip("Large positive reward for reaching goal (within threshold)");
    rewardsForm->addRow("Goal Bonus (within 200m):", m_goalBonusValue);
    connect(m_goalBonusValue, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_explorationBonusValue = createSpinBox(10.0, 1000.0, 10.0, 100.0);
    m_explorationBonusValue->setToolTip("Reward for reaching new distance milestones (every 1km closer)");
    rewardsForm->addRow("Exploration Bonus (1km milestone):", m_explorationBonusValue);
    connect(m_explorationBonusValue, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_costNormalizationFactor = createSpinBox(1000.0, 1000000.0, 1000.0, 100000.0, " USD");
    m_costNormalizationFactor->setToolTip("Divides segment costs to normalize into reward range");
    rewardsForm->addRow("Cost Normalization Factor:", m_costNormalizationFactor);
    connect(m_costNormalizationFactor, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    rewardsGroup->setLayout(rewardsForm);
    scrollLayout->addWidget(rewardsGroup);
    
    // Constraint Penalties Group
    QGroupBox* penaltiesGroup = new QGroupBox("Constraint Penalties");
    QFormLayout* penaltiesForm = new QFormLayout();
    
    m_seaPenalty = createSpinBox(-50000.0, -1000.0, 1000.0, -10000.0);
    m_seaPenalty->setToolTip("Termination penalty for approaching sea (< 1km)");
    m_seaPenalty->setStyleSheet("QDoubleSpinBox { background-color: #ffebee; }");
    penaltiesForm->addRow("Sea Proximity (<1km) [TERMINATES]:", m_seaPenalty);
    connect(m_seaPenalty, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_builtupPenalty = createSpinBox(-50000.0, -1000.0, 1000.0, -10000.0);
    m_builtupPenalty->setToolTip("Termination penalty for built-up area violation");
    m_builtupPenalty->setStyleSheet("QDoubleSpinBox { background-color: #ffebee; }");
    penaltiesForm->addRow("Built-up Area (LC=50) [TERMINATES]:", m_builtupPenalty);
    connect(m_builtupPenalty, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_powerlinePenalty = createSpinBox(-5000.0, -100.0, 100.0, -500.0);
    m_powerlinePenalty->setToolTip("Penalty for parallel routing too close to powerlines");
    penaltiesForm->addRow("Powerline Clearance (<6m):", m_powerlinePenalty);
    connect(m_powerlinePenalty, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_railwayPenalty = createSpinBox(-5000.0, -100.0, 100.0, -500.0);
    m_railwayPenalty->setToolTip("Penalty for parallel routing too close to railways");
    penaltiesForm->addRow("Railway Clearance (<10m):", m_railwayPenalty);
    connect(m_railwayPenalty, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_curvaturePenaltyRate = createSpinBox(-100.0, -1.0, 1.0, -10.0);
    m_curvaturePenaltyRate->setToolTip("Penalty rate for excessive bending (>30 degrees)");
    penaltiesForm->addRow("Curvature Penalty Rate (>30°):", m_curvaturePenaltyRate);
    connect(m_curvaturePenaltyRate, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_outOfBoundsPenalty = createSpinBox(-1000.0, -10.0, 10.0, -50.0);
    m_outOfBoundsPenalty->setToolTip("Penalty for going outside AOI boundary");
    penaltiesForm->addRow("Out of Bounds Penalty:", m_outOfBoundsPenalty);
    connect(m_outOfBoundsPenalty, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    penaltiesGroup->setLayout(penaltiesForm);
    scrollLayout->addWidget(penaltiesGroup);
    
    // Reward Preview Group
    QGroupBox* previewGroup = new QGroupBox("Reward Balance Preview");
    QVBoxLayout* previewLayout = new QVBoxLayout();
    
    m_rewardPreviewLabel = new QTextEdit();
    m_rewardPreviewLabel->setReadOnly(true);
    m_rewardPreviewLabel->setMaximumHeight(200);
    m_rewardPreviewLabel->setStyleSheet("QTextEdit { background-color: #f5f5f5; font-family: monospace; }");
    previewLayout->addWidget(m_rewardPreviewLabel);
    
    previewGroup->setLayout(previewLayout);
    scrollLayout->addWidget(previewGroup);
    
    scrollLayout->addStretch();
    scrollArea->setWidget(scrollWidget);
    layout->addWidget(scrollArea);
    
    m_tabWidget->addTab(m_rewardsTab, "PPO Rewards");
}

void PIRLParameterTuningDialog::setupTerrainTab()
{
    m_terrainTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_terrainTab);
    
    QLabel* infoLabel = new QLabel("Configure terrain cost model parameters");
    infoLabel->setStyleSheet("QLabel { color: #666; padding: 10px; }");
    layout->addWidget(infoLabel);
    
    // Currency Selector
    QHBoxLayout* currencyLayout = new QHBoxLayout();
    QLabel* currencyLabel = new QLabel("Currency:");
    currencyLabel->setToolTip("Currency for all cost calculations");
    currencyLayout->addWidget(currencyLabel);
    
    m_currencySelector = new QComboBox();
    m_currencySelector->addItems({"USD", "EUR", "CAD", "GBP", "AUD", "JPY"});
    m_currencySelector->setToolTip("Select currency for cost calculations");
    m_currencySelector->setMinimumWidth(100);
    connect(m_currencySelector, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &PIRLParameterTuningDialog::onParameterChanged);
    currencyLayout->addWidget(m_currencySelector);
    currencyLayout->addStretch();
    layout->addLayout(currencyLayout);
    
    // Base Terrain Cost
    QHBoxLayout* baseCostLayout = new QHBoxLayout();
    QLabel* baseCostLabel = new QLabel("Base Terrain Cost:");
    baseCostLabel->setToolTip("Base cost per meter for flat terrain in ideal conditions");
    baseCostLayout->addWidget(baseCostLabel);
    
    m_baseTerrainCost = createSpinBox(50.0, 500.0, 5.0, 100.0, " /m");
    m_baseTerrainCost->setToolTip("Base construction cost - all multipliers are applied to this value");
    m_baseTerrainCost->setMinimumWidth(150);
    connect(m_baseTerrainCost, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    baseCostLayout->addWidget(m_baseTerrainCost);
    baseCostLayout->addStretch();
    layout->addLayout(baseCostLayout);
    
    // Slope Factors GroupBox
    QGroupBox* slopeGroup = new QGroupBox("Slope Cost Factors");
    QVBoxLayout* slopeLayout = new QVBoxLayout(slopeGroup);
    
    QHBoxLayout* slopeLinearLayout = new QHBoxLayout();
    slopeLinearLayout->addWidget(new QLabel("Linear Factor:"));
    m_slopeLinearFactor = createSpinBox(0.01, 0.5, 0.01, 0.05);
    m_slopeLinearFactor->setToolTip("Linear slope factor: cost_mult += linear * slope_percent");
    slopeLinearLayout->addWidget(m_slopeLinearFactor);
    connect(m_slopeLinearFactor, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    slopeLinearLayout->addStretch();
    slopeLayout->addLayout(slopeLinearLayout);
    
    QHBoxLayout* slopeQuadLayout = new QHBoxLayout();
    slopeQuadLayout->addWidget(new QLabel("Quadratic Factor:"));
    m_slopeQuadraticFactor = createSpinBox(0.001, 0.01, 0.001, 0.002);
    m_slopeQuadraticFactor->setToolTip("Quadratic slope factor: cost_mult += quadratic * slope_percent²");
    slopeQuadLayout->addWidget(m_slopeQuadraticFactor);
    connect(m_slopeQuadraticFactor, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    slopeQuadLayout->addStretch();
    slopeLayout->addLayout(slopeQuadLayout);
    
    QLabel* slopeFormulaLabel = new QLabel("Formula: cost_mult = 1.0 + (linear × slope) + (quadratic × slope²)");
    slopeFormulaLabel->setStyleSheet("QLabel { font-family: monospace; color: #444; padding: 5px; }");
    slopeLayout->addWidget(slopeFormulaLabel);
    layout->addWidget(slopeGroup);
    
    // Soil Factor GroupBox
    QGroupBox* soilGroup = new QGroupBox("Soil Bearing Capacity Multipliers");
    QVBoxLayout* soilLayout = new QVBoxLayout(soilGroup);
    
    QHBoxLayout* soilMinLayout = new QHBoxLayout();
    soilMinLayout->addWidget(new QLabel("Excellent Soil (capacity=1.0):"));
    m_soilFactorMin = createSpinBox(1.0, 3.0, 0.1, 1.0, "x");
    m_soilFactorMin->setToolTip("Multiplier for excellent soil conditions");
    soilMinLayout->addWidget(m_soilFactorMin);
    connect(m_soilFactorMin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    soilMinLayout->addStretch();
    soilLayout->addLayout(soilMinLayout);
    
    QHBoxLayout* soilMaxLayout = new QHBoxLayout();
    soilMaxLayout->addWidget(new QLabel("Poor Soil (capacity=0.0):"));
    m_soilFactorMax = createSpinBox(1.0, 5.0, 0.1, 2.0, "x");
    m_soilFactorMax->setToolTip("Multiplier for poor soil conditions");
    soilMaxLayout->addWidget(m_soilFactorMax);
    connect(m_soilFactorMax, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    soilMaxLayout->addStretch();
    soilLayout->addLayout(soilMaxLayout);
    layout->addWidget(soilGroup);
    
    // Geohazard Factor GroupBox
    QGroupBox* geohazardGroup = new QGroupBox("Geohazard Risk Multipliers");
    QVBoxLayout* geohazardLayout = new QVBoxLayout(geohazardGroup);
    
    QHBoxLayout* geoMinLayout = new QHBoxLayout();
    geoMinLayout->addWidget(new QLabel("No Risk (risk=0.0):"));
    m_geohazardFactorMin = createSpinBox(1.0, 3.0, 0.1, 1.0, "x");
    m_geohazardFactorMin->setToolTip("Multiplier for no geohazard risk");
    geoMinLayout->addWidget(m_geohazardFactorMin);
    connect(m_geohazardFactorMin, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    geoMinLayout->addStretch();
    geohazardLayout->addLayout(geoMinLayout);
    
    QHBoxLayout* geoMaxLayout = new QHBoxLayout();
    geoMaxLayout->addWidget(new QLabel("High Risk (risk=1.0):"));
    m_geohazardFactorMax = createSpinBox(1.0, 5.0, 0.1, 2.5, "x");
    m_geohazardFactorMax->setToolTip("Multiplier for high geohazard risk");
    geoMaxLayout->addWidget(m_geohazardFactorMax);
    connect(m_geohazardFactorMax, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    geoMaxLayout->addStretch();
    geohazardLayout->addLayout(geoMaxLayout);
    layout->addWidget(geohazardGroup);
    
    layout->addStretch();
    m_tabWidget->addTab(m_terrainTab, "Terrain Cost Model");
}

void PIRLParameterTuningDialog::setupLandcoverTab()
{
    m_landcoverTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_landcoverTab);
    
    QLabel* infoLabel = new QLabel("Land cover cost multipliers - ESA WorldCover classes");
    infoLabel->setStyleSheet("QLabel { color: #666; padding: 10px; }");
    layout->addWidget(infoLabel);
    
    // Base cost reference label (dynamically updated from terrain tab)
    m_landcoverBaseLabel = new QLabel("Base Reference Cost: $100/m (from Terrain tab)");
    m_landcoverBaseLabel->setStyleSheet("QLabel { font-weight: bold; padding: 8px; background-color: #e8f5e9; border-radius: 4px; }");
    layout->addWidget(m_landcoverBaseLabel);
    
    m_landcoverTable = new QTableWidget();
    m_landcoverTable->setColumnCount(5);
    m_landcoverTable->setHorizontalHeaderLabels({"Class", "Name", "Multiplier", "Actual Cost", "Notes"});
    m_landcoverTable->horizontalHeader()->setStretchLastSection(true);
    
    QList<int> classes = {10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100};
    QStringList names = {"Tree cover", "Shrubland", "Grassland", "Cropland", "Built-up", 
                         "Bare/sparse veg", "Snow/ice", "Water bodies", "Wetland", 
                         "Mangroves", "Moss/lichen"};
    QList<double> defaultMultipliers = {1.5, 1.2, 1.0, 2.0, 3.0, 1.0, 1.0, 35.0, 4.0, 3.5, 2.5};
    QStringList notes = {"Forest clearing", "Brush removal", "Baseline", "Compensation", 
                         "Heavy penalties", "Desert/rocky", "Alpine", "HDD crossing", 
                         "Marshy terrain", "Coastal wetland", "Tundra"};
    
    m_landcoverTable->setRowCount(classes.size());
    
    for (int i = 0; i < classes.size(); ++i) {
        // Class number
        QTableWidgetItem* classItem = new QTableWidgetItem(QString::number(classes[i]));
        classItem->setFlags(classItem->flags() & ~Qt::ItemIsEditable);
        classItem->setTextAlignment(Qt::AlignCenter);
        m_landcoverTable->setItem(i, 0, classItem);
        
        // Name
        QTableWidgetItem* nameItem = new QTableWidgetItem(names[i]);
        nameItem->setFlags(nameItem->flags() & ~Qt::ItemIsEditable);
        m_landcoverTable->setItem(i, 1, nameItem);
        
        // Multiplier spinbox
        QDoubleSpinBox* spinBox = createSpinBox(0.5, 50.0, 0.1, defaultMultipliers[i], "x");
        spinBox->setToolTip(QString("Cost multiplier for %1 (base * multiplier = actual)").arg(names[i]));
        m_landcoverTable->setCellWidget(i, 2, spinBox);
        m_landcoverMultipliers[classes[i]] = spinBox;
        connect(spinBox, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
                this, &PIRLParameterTuningDialog::onParameterChanged);
        
        // Actual cost (calculated, read-only)
        QTableWidgetItem* actualItem = new QTableWidgetItem();
        actualItem->setFlags(actualItem->flags() & ~Qt::ItemIsEditable);
        actualItem->setTextAlignment(Qt::AlignCenter);
        m_landcoverTable->setItem(i, 3, actualItem);
        
        // Notes
        QTableWidgetItem* notesItem = new QTableWidgetItem(notes[i]);
        notesItem->setFlags(notesItem->flags() & ~Qt::ItemIsEditable);
        m_landcoverTable->setItem(i, 4, notesItem);
    }
    
    layout->addWidget(m_landcoverTable);
    m_tabWidget->addTab(m_landcoverTab, "Land Cover Multipliers");
}

void PIRLParameterTuningDialog::setupInfrastructureTab()
{
    m_infrastructureTab = new QWidget();
    QScrollArea* scrollArea = new QScrollArea();
    scrollArea->setWidgetResizable(true);
    QWidget* scrollWidget = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(scrollWidget);
    
    QLabel* infoLabel = new QLabel("HDD Crossing Cost Components - Formula: Total = base + (width × multiplier × (drilling + installation))");
    infoLabel->setStyleSheet("QLabel { color: #666; padding: 10px; font-weight: bold; }");
    infoLabel->setWordWrap(true);
    layout->addWidget(infoLabel);
    
    // Helper lambda to create crossing cost group
    auto createCrossingGroup = [this](const QString& title, const QString& desc, CrossingCostControls& controls, 
                                       double baseDefault, double drillingDefault, double installDefault, double multDefault) {
        QGroupBox* group = new QGroupBox(title);
        QFormLayout* form = new QFormLayout();
        
        // Description
        QLabel* descLabel = new QLabel(desc);
        descLabel->setStyleSheet("QLabel { color: #777; font-size: 10px; }");
        descLabel->setWordWrap(true);
        form->addRow(descLabel);
        
        // Base cost
        controls.baseCost = createSpinBox(0.0, 50000.0, 500.0, baseDefault, " $");
        controls.baseCost->setToolTip("Fixed mobilization/setup cost");
        form->addRow("Base Cost (mobilization):", controls.baseCost);
        connect(controls.baseCost, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
                this, &PIRLParameterTuningDialog::onParameterChanged);
        
        // Drilling cost per meter
        controls.drillingCostPerM = createSpinBox(0.0, 1000.0, 10.0, drillingDefault, " $/m");
        controls.drillingCostPerM->setToolTip("Cost per meter of drilling");
        form->addRow("Drilling Cost per meter:", controls.drillingCostPerM);
        connect(controls.drillingCostPerM, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
                this, &PIRLParameterTuningDialog::onParameterChanged);
        
        // Installation cost per meter
        controls.installationCostPerM = createSpinBox(0.0, 500.0, 5.0, installDefault, " $/m");
        controls.installationCostPerM->setToolTip("Cost per meter of pipe installation");
        form->addRow("Installation Cost per meter:", controls.installationCostPerM);
        connect(controls.installationCostPerM, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
                this, &PIRLParameterTuningDialog::onParameterChanged);
        
        // Drill length multiplier
        controls.drillLengthMultiplier = createSpinBox(1.0, 3.0, 0.1, multDefault, "x");
        controls.drillLengthMultiplier->setToolTip("Drill length = width × multiplier (accounts for angle and safety)");
        form->addRow("Drill Length Multiplier:", controls.drillLengthMultiplier);
        connect(controls.drillLengthMultiplier, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
                this, &PIRLParameterTuningDialog::onParameterChanged);
        
        // Example calculation
        double exampleWidth = 10.0;
        double exampleTotal = baseDefault + (exampleWidth * multDefault * (drillingDefault + installDefault));
        QLabel* exampleLabel = new QLabel(QString("Example (10m width): $%1 + (10 × %2 × ($%3 + $%4)) = $%5")
                                          .arg(baseDefault, 0, 'f', 0)
                                          .arg(multDefault, 0, 'f', 1)
                                          .arg(drillingDefault, 0, 'f', 0)
                                          .arg(installDefault, 0, 'f', 0)
                                          .arg(exampleTotal, 0, 'f', 0));
        exampleLabel->setStyleSheet("QLabel { font-family: monospace; color: #2196F3; padding: 5px; background-color: #e3f2fd; border-radius: 3px; }");
        form->addRow(exampleLabel);
        
        group->setLayout(form);
        return group;
    };
    
    // Road Crossings
    layout->addWidget(createCrossingGroup(
        "Road Crossings (HDD)",
        "Standard HDD for road crossings. Width based on lanes (3.5m/lane) or highway type.",
        m_roadCrossingControls,
        5000.0,  // base
        150.0,   // drilling/m
        80.0,    // install/m
        1.4      // multiplier
    ));
    
    // Waterway Crossings
    layout->addWidget(createCrossingGroup(
        "Waterway Crossings (HDD)",
        "Environmental HDD for rivers/streams. Width from 'width_m' field. Dams/weirs uncrossable.",
        m_waterwayCrossingControls,
        8000.0,  // base (environmental permitting)
        200.0,   // drilling/m
        100.0,   // install/m
        1.6      // multiplier (deeper/longer)
    ));
    
    // Railway Crossings
    layout->addWidget(createCrossingGroup(
        "Railway Crossings (HDD)",
        "Heavy-duty HDD for railways. Width = gauge × 4 (e.g., 1435mm → 5.74m).",
        m_railwayCrossingControls,
        15000.0, // base (extensive permitting)
        250.0,   // drilling/m
        120.0,   // install/m
        1.8      // multiplier (safety buffers)
    ));
    
    // Powerline Crossings
    layout->addWidget(createCrossingGroup(
        "Powerline Crossings (HDD)",
        "All powerline types treated the same. HDD for safety clearance.",
        m_powerlineCrossingControls,
        10000.0, // base (coordination)
        180.0,   // drilling/m
        90.0,    // install/m
        1.5      // multiplier
    ));
    
    layout->addStretch();
    scrollArea->setWidget(scrollWidget);
    
    QVBoxLayout* tabLayout = new QVBoxLayout(m_infrastructureTab);
    tabLayout->addWidget(scrollArea);
    
    m_tabWidget->addTab(m_infrastructureTab, "Crossing Costs (HDD)");
}

void PIRLParameterTuningDialog::setupHydraulicsTab()
{
    m_hydraulicsTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_hydraulicsTab);
    
    QScrollArea* scrollArea = new QScrollArea();
    scrollArea->setWidgetResizable(true);
    QWidget* scrollWidget = new QWidget();
    QVBoxLayout* scrollLayout = new QVBoxLayout(scrollWidget);
    
    // Compressor Costs Group
    QGroupBox* compressorGroup = new QGroupBox("Compressor Station Costs");
    QFormLayout* compressorForm = new QFormLayout();
    
    m_compressorBaseCost = createSpinBox(100000.0, 5000000.0, 10000.0, 1000000.0, " USD");
    m_compressorBaseCost->setToolTip("Base installation cost for compressor station");
    compressorForm->addRow("Compressor Base Cost:", m_compressorBaseCost);
    connect(m_compressorBaseCost, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_compressorPowerCost = createSpinBox(1000.0, 20000.0, 100.0, 5000.0, " USD/kW");
    m_compressorPowerCost->setToolTip("CAPEX per kW of compressor capacity");
    compressorForm->addRow("Power Cost per kW:", m_compressorPowerCost);
    connect(m_compressorPowerCost, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    compressorGroup->setLayout(compressorForm);
    scrollLayout->addWidget(compressorGroup);
    
    // Velocity Penalties Group
    QGroupBox* velocityGroup = new QGroupBox("Velocity Penalties");
    QFormLayout* velocityForm = new QFormLayout();
    
    m_erosionVelocityThreshold = createSpinBox(10.0, 25.0, 1.0, 15.0, " m/s");
    m_erosionVelocityThreshold->setToolTip("Maximum safe velocity to avoid erosion");
    velocityForm->addRow("Erosion Velocity Threshold:", m_erosionVelocityThreshold);
    connect(m_erosionVelocityThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_erosionPenaltyRate = createSpinBox(10.0, 500.0, 10.0, 150.0, " USD/m");
    m_erosionPenaltyRate->setToolTip("Cost per meter for protective coatings if velocity exceeds threshold");
    velocityForm->addRow("Erosion Penalty Rate:", m_erosionPenaltyRate);
    connect(m_erosionPenaltyRate, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_dropoutVelocityThreshold = createSpinBox(1.0, 5.0, 0.5, 3.0, " m/s");
    m_dropoutVelocityThreshold->setToolTip("Minimum velocity to avoid liquid dropout in gas lines");
    velocityForm->addRow("Dropout Velocity Threshold:", m_dropoutVelocityThreshold);
    connect(m_dropoutVelocityThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_dropoutPenaltyRate = createSpinBox(10.0, 500.0, 10.0, 75.0, " USD/m");
    m_dropoutPenaltyRate->setToolTip("Cost per meter for enhanced drainage if velocity below threshold");
    velocityForm->addRow("Dropout Penalty Rate:", m_dropoutPenaltyRate);
    connect(m_dropoutPenaltyRate, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    velocityGroup->setLayout(velocityForm);
    scrollLayout->addWidget(velocityGroup);
    
    // Pressure Drop Penalties Group
    QGroupBox* pressureGroup = new QGroupBox("Pressure Drop Penalties");
    QFormLayout* pressureForm = new QFormLayout();
    
    m_excessivePressureDropThreshold = createSpinBox(1.0, 10.0, 0.5, 5.0, " bar");
    m_excessivePressureDropThreshold->setToolTip("Maximum acceptable pressure drop per segment");
    pressureForm->addRow("Excessive Pressure Drop Threshold:", m_excessivePressureDropThreshold);
    connect(m_excessivePressureDropThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_excessivePressureDropPenalty = createSpinBox(1000.0, 50000.0, 1000.0, 10000.0, " USD/bar");
    m_excessivePressureDropPenalty->setToolTip("Penalty per bar of excessive pressure drop (indicates inefficient routing)");
    pressureForm->addRow("Excessive Drop Penalty:", m_excessivePressureDropPenalty);
    connect(m_excessivePressureDropPenalty, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    pressureGroup->setLayout(pressureForm);
    scrollLayout->addWidget(pressureGroup);
    
    scrollLayout->addStretch();
    scrollArea->setWidget(scrollWidget);
    layout->addWidget(scrollArea);
    
    m_tabWidget->addTab(m_hydraulicsTab, "Hydraulic Costs");
}

void PIRLParameterTuningDialog::setupConstraintsTab()
{
    m_constraintsTab = new QWidget();
    QVBoxLayout* layout = new QVBoxLayout(m_constraintsTab);
    
    QScrollArea* scrollArea = new QScrollArea();
    scrollArea->setWidgetResizable(true);
    QWidget* scrollWidget = new QWidget();
    QVBoxLayout* scrollLayout = new QVBoxLayout(scrollWidget);
    
    QLabel* warningLabel = new QLabel("⚠️ These are HARD CONSTRAINTS - violating them will terminate episodes");
    warningLabel->setStyleSheet("QLabel { color: #d32f2f; font-weight: bold; padding: 10px; background-color: #ffebee; border-radius: 4px; }");
    scrollLayout->addWidget(warningLabel);
    
    // Physical Constraints Group
    QGroupBox* physicalGroup = new QGroupBox("Physical Constraints");
    QFormLayout* physicalForm = new QFormLayout();
    
    m_maxSlopePercent = createSpinBox(5.0, 30.0, 1.0, 20.0, " %");
    m_maxSlopePercent->setToolTip("Maximum allowable slope before episode termination");
    m_maxSlopePercent->setStyleSheet("QDoubleSpinBox { background-color: #ffebee; }");
    physicalForm->addRow("Max Slope [TERMINATES]:", m_maxSlopePercent);
    connect(m_maxSlopePercent, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    physicalGroup->setLayout(physicalForm);
    scrollLayout->addWidget(physicalGroup);
    
    // Hydraulic Constraints Group
    QGroupBox* hydraulicGroup = new QGroupBox("Hydraulic Constraints");
    QFormLayout* hydraulicForm = new QFormLayout();
    
    m_minDeliveryPressure = createSpinBox(30.0, 60.0, 1.0, 45.0, " bar");
    m_minDeliveryPressure->setToolTip("Minimum delivery pressure - compressor required if below this");
    hydraulicForm->addRow("Min Delivery Pressure:", m_minDeliveryPressure);
    connect(m_minDeliveryPressure, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_maxOperatingPressure = createSpinBox(60.0, 100.0, 1.0, 75.0, " bar");
    m_maxOperatingPressure->setToolTip("Maximum operating pressure for pipeline system");
    hydraulicForm->addRow("Max Operating Pressure:", m_maxOperatingPressure);
    connect(m_maxOperatingPressure, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    hydraulicGroup->setLayout(hydraulicForm);
    scrollLayout->addWidget(hydraulicGroup);
    
    // Infrastructure Clearances Group
    QGroupBox* clearanceGroup = new QGroupBox("Infrastructure Clearances");
    QFormLayout* clearanceForm = new QFormLayout();
    
    m_powerlineClearance = createSpinBox(2.0, 20.0, 1.0, 6.0, " m");
    m_powerlineClearance->setToolTip("Minimum clearance for parallel routing near powerlines");
    clearanceForm->addRow("Powerline Clearance:", m_powerlineClearance);
    connect(m_powerlineClearance, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_powerlineCrossingThreshold = createSpinBox(0.5, 5.0, 0.5, 2.0, " m");
    m_powerlineCrossingThreshold->setToolTip("Distance below which it's considered a crossing (not parallel)");
    clearanceForm->addRow("Powerline Crossing Threshold:", m_powerlineCrossingThreshold);
    connect(m_powerlineCrossingThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_railwayClearance = createSpinBox(5.0, 30.0, 1.0, 10.0, " m");
    m_railwayClearance->setToolTip("Minimum clearance for parallel routing near railways");
    clearanceForm->addRow("Railway Clearance:", m_railwayClearance);
    connect(m_railwayClearance, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_railwayCrossingThreshold = createSpinBox(1.0, 10.0, 0.5, 3.0, " m");
    m_railwayCrossingThreshold->setToolTip("Distance below which it's considered a crossing (not parallel)");
    clearanceForm->addRow("Railway Crossing Threshold:", m_railwayCrossingThreshold);
    connect(m_railwayCrossingThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    clearanceGroup->setLayout(clearanceForm);
    scrollLayout->addWidget(clearanceGroup);
    
    // Environmental Exclusions Group
    QGroupBox* environmentalGroup = new QGroupBox("Environmental Exclusions");
    QFormLayout* environmentalForm = new QFormLayout();
    
    m_seaExclusionDistance = createSpinBox(100.0, 5000.0, 100.0, 1000.0, " m");
    m_seaExclusionDistance->setToolTip("Exclusion zone around sea - offshore routing blocked");
    m_seaExclusionDistance->setStyleSheet("QDoubleSpinBox { background-color: #ffebee; }");
    environmentalForm->addRow("Sea Exclusion Distance [TERMINATES]:", m_seaExclusionDistance);
    connect(m_seaExclusionDistance, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    environmentalGroup->setLayout(environmentalForm);
    scrollLayout->addWidget(environmentalGroup);
    
    // Goal Criteria Group
    QGroupBox* goalGroup = new QGroupBox("Goal Criteria");
    QFormLayout* goalForm = new QFormLayout();
    
    m_goalDistanceThreshold = createSpinBox(50.0, 500.0, 10.0, 200.0, " m");
    m_goalDistanceThreshold->setToolTip("Distance within which episode is considered successful");
    goalForm->addRow("Goal Distance Threshold:", m_goalDistanceThreshold);
    connect(m_goalDistanceThreshold, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    m_explorationBonusMilestone = createSpinBox(100.0, 5000.0, 100.0, 1000.0, " m");
    m_explorationBonusMilestone->setToolTip("Distance milestone for exploration bonus (getting closer than ever before)");
    goalForm->addRow("Exploration Bonus Milestone:", m_explorationBonusMilestone);
    connect(m_explorationBonusMilestone, QOverload<double>::of(&QDoubleSpinBox::valueChanged), 
            this, &PIRLParameterTuningDialog::onParameterChanged);
    
    goalGroup->setLayout(goalForm);
    scrollLayout->addWidget(goalGroup);
    
    scrollLayout->addStretch();
    scrollArea->setWidget(scrollWidget);
    layout->addWidget(scrollArea);
    
    m_tabWidget->addTab(m_constraintsTab, "Constraint Thresholds");
}

QDoubleSpinBox* PIRLParameterTuningDialog::createSpinBox(double min, double max, double step, double value, const QString& suffix)
{
    QDoubleSpinBox* spinBox = new QDoubleSpinBox();
    spinBox->setMinimum(min);
    spinBox->setMaximum(max);
    spinBox->setSingleStep(step);
    spinBox->setValue(value);
    if (!suffix.isEmpty()) {
        spinBox->setSuffix(suffix);
    }
    spinBox->setMinimumWidth(150);
    return spinBox;
}

void PIRLParameterTuningDialog::loadDefaultParameters()
{
    QString defaultFile = m_projectDir + "/PIRL/parameter_tuner/pirl_parameters_default.json";
    
    QFile file(defaultFile);
    if (!file.open(QIODevice::ReadOnly)) {
        QMessageBox::warning(this, "Warning", "Could not load default parameters from: " + defaultFile);
        return;
    }
    
    QByteArray data = file.readAll();
    QJsonDocument doc = QJsonDocument::fromJson(data);
    m_defaultParams = doc.object();
}

void PIRLParameterTuningDialog::loadCurrentParameters()
{
    QString overrideFile = m_projectDir + "/PIRL/pirl_parameter_overrides.json";
    
    QFile file(overrideFile);
    if (file.open(QIODevice::ReadOnly)) {
        QByteArray data = file.readAll();
        QJsonDocument doc = QJsonDocument::fromJson(data);
        m_currentParams = doc.object();
        
        // Merge with defaults (overrides take precedence)
        QJsonObject merged = m_defaultParams;
        for (auto it = m_currentParams.begin(); it != m_currentParams.end(); ++it) {
            merged[it.key()] = it.value();
        }
        m_currentParams = merged;
    } else {
        // No overrides, use defaults
        m_currentParams = m_defaultParams;
    }
    
    // Load values into UI widgets
    if (!m_currentParams.isEmpty()) {
        // Currency
        QString currency = m_currentParams["currency"].toString("USD");
        if (m_currencySelector) {
            int index = m_currencySelector->findText(currency);
            if (index >= 0) m_currencySelector->setCurrentIndex(index);
        }
        
        // PPO Rewards
        QJsonObject rewards = m_currentParams["ppo_rewards"].toObject();
        if (m_progressRewardMultiplier) m_progressRewardMultiplier->setValue(rewards["progress_multiplier"].toDouble(0.06));
        if (m_goalBonusValue) m_goalBonusValue->setValue(rewards["goal_bonus"].toDouble(100.0));
        if (m_explorationBonusValue) m_explorationBonusValue->setValue(rewards["exploration_bonus"].toDouble(20.0));
        if (m_seaPenalty) m_seaPenalty->setValue(rewards["sea_penalty"].toDouble(-100.0));
        if (m_builtupPenalty) m_builtupPenalty->setValue(rewards["buildup_penalty"].toDouble(-100.0));
        if (m_powerlinePenalty) m_powerlinePenalty->setValue(rewards["powerline_penalty"].toDouble(-50.0));
        if (m_railwayPenalty) m_railwayPenalty->setValue(rewards["railway_penalty"].toDouble(-50.0));
        if (m_curvaturePenaltyRate) m_curvaturePenaltyRate->setValue(rewards["curvature_penalty_rate"].toDouble(-0.5));
        if (m_outOfBoundsPenalty) m_outOfBoundsPenalty->setValue(rewards["out_of_bounds_penalty"].toDouble(-50.0));
        if (m_costNormalizationFactor) m_costNormalizationFactor->setValue(rewards["cost_normalization_factor"].toDouble(10000.0));
        if (m_explorationBonusMilestone) m_explorationBonusMilestone->setValue(rewards["exploration_bonus_milestone_m"].toDouble(5000.0));
        
        // Cost Model
        QJsonObject costModel = m_currentParams["cost_model"].toObject();
        if (m_baseTerrainCost) m_baseTerrainCost->setValue(costModel["base_terrain_cost_per_m"].toDouble(100.0));
        if (m_slopeLinearFactor) m_slopeLinearFactor->setValue(costModel["slope_linear_factor"].toDouble(0.05));
        if (m_slopeQuadraticFactor) m_slopeQuadraticFactor->setValue(costModel["slope_quadratic_factor"].toDouble(0.002));
        if (m_soilFactorMin) m_soilFactorMin->setValue(costModel["soil_capacity_factor_min"].toDouble(1.0));
        if (m_soilFactorMax) m_soilFactorMax->setValue(costModel["soil_capacity_factor_max"].toDouble(2.0));
        if (m_geohazardFactorMin) m_geohazardFactorMin->setValue(costModel["geohazard_risk_factor_min"].toDouble(1.0));
        if (m_geohazardFactorMax) m_geohazardFactorMax->setValue(costModel["geohazard_risk_factor_max"].toDouble(2.5));
        
        // Landcover multipliers
        QJsonObject landcoverMult = costModel["landcover_costs"].toObject();
        for (auto it = m_landcoverMultipliers.begin(); it != m_landcoverMultipliers.end(); ++it) {
            QString key = QString::number(it.key());
            if (landcoverMult.contains(key)) {
                it.value()->setValue(landcoverMult[key].toDouble(1.0));
            }
        }
        
        // Crossing costs
        QJsonObject crossingCosts = costModel["crossing_cost_hdd"].toObject();
        
        // Road
        if (crossingCosts.contains("road")) {
            QJsonObject road = crossingCosts["road"].toObject();
            if (m_roadCrossingControls.baseCost) m_roadCrossingControls.baseCost->setValue(road["base_cost_usd"].toDouble(5000.0));
            if (m_roadCrossingControls.drillingCostPerM) m_roadCrossingControls.drillingCostPerM->setValue(road["drilling_cost_per_m"].toDouble(150.0));
            if (m_roadCrossingControls.installationCostPerM) m_roadCrossingControls.installationCostPerM->setValue(road["installation_cost_per_m"].toDouble(80.0));
            if (m_roadCrossingControls.drillLengthMultiplier) m_roadCrossingControls.drillLengthMultiplier->setValue(road["drill_length_multiplier"].toDouble(1.4));
        }
        
        // Waterway
        if (crossingCosts.contains("waterway")) {
            QJsonObject waterway = crossingCosts["waterway"].toObject();
            if (m_waterwayCrossingControls.baseCost) m_waterwayCrossingControls.baseCost->setValue(waterway["base_cost_usd"].toDouble(8000.0));
            if (m_waterwayCrossingControls.drillingCostPerM) m_waterwayCrossingControls.drillingCostPerM->setValue(waterway["drilling_cost_per_m"].toDouble(200.0));
            if (m_waterwayCrossingControls.installationCostPerM) m_waterwayCrossingControls.installationCostPerM->setValue(waterway["installation_cost_per_m"].toDouble(100.0));
            if (m_waterwayCrossingControls.drillLengthMultiplier) m_waterwayCrossingControls.drillLengthMultiplier->setValue(waterway["drill_length_multiplier"].toDouble(1.6));
        }
        
        // Railway
        if (crossingCosts.contains("railway")) {
            QJsonObject railway = crossingCosts["railway"].toObject();
            if (m_railwayCrossingControls.baseCost) m_railwayCrossingControls.baseCost->setValue(railway["base_cost_usd"].toDouble(15000.0));
            if (m_railwayCrossingControls.drillingCostPerM) m_railwayCrossingControls.drillingCostPerM->setValue(railway["drilling_cost_per_m"].toDouble(250.0));
            if (m_railwayCrossingControls.installationCostPerM) m_railwayCrossingControls.installationCostPerM->setValue(railway["installation_cost_per_m"].toDouble(120.0));
            if (m_railwayCrossingControls.drillLengthMultiplier) m_railwayCrossingControls.drillLengthMultiplier->setValue(railway["drill_length_multiplier"].toDouble(1.8));
        }
        
        // Powerline
        if (crossingCosts.contains("powerline")) {
            QJsonObject powerline = crossingCosts["powerline"].toObject();
            if (m_powerlineCrossingControls.baseCost) m_powerlineCrossingControls.baseCost->setValue(powerline["base_cost_usd"].toDouble(10000.0));
            if (m_powerlineCrossingControls.drillingCostPerM) m_powerlineCrossingControls.drillingCostPerM->setValue(powerline["drilling_cost_per_m"].toDouble(180.0));
            if (m_powerlineCrossingControls.installationCostPerM) m_powerlineCrossingControls.installationCostPerM->setValue(powerline["installation_cost_per_m"].toDouble(90.0));
            if (m_powerlineCrossingControls.drillLengthMultiplier) m_powerlineCrossingControls.drillLengthMultiplier->setValue(powerline["drill_length_multiplier"].toDouble(1.5));
        }
    }
}

void PIRLParameterTuningDialog::updateRewardPreview()
{
    // Safety check: ensure widgets exist
    if (!m_progressRewardMultiplier || !m_goalBonusValue || !m_explorationBonusValue ||
        !m_seaPenalty || !m_builtupPenalty || !m_powerlinePenalty || !m_railwayPenalty ||
        !m_outOfBoundsPenalty || !m_explorationBonusMilestone || !m_rewardPreviewLabel) {
        return; // Widgets not created yet
    }
    
    // Calculate typical 62km route rewards
    double typicalDistance = 62000.0; // 62 km in meters
    double progressReward = typicalDistance * m_progressRewardMultiplier->value();
    double goalBonus = m_goalBonusValue->value();
    int explorationCount = static_cast<int>(typicalDistance / m_explorationBonusMilestone->value());
    double totalExploration = explorationCount * m_explorationBonusValue->value();
    double totalPositive = progressReward + goalBonus + totalExploration;
    
    QString preview;
    preview += "═══════════════════════════════════════\n";
    preview += "   REWARD BALANCE PREVIEW (62km route)\n";
    preview += "═══════════════════════════════════════\n\n";
    preview += "POSITIVE REWARDS:\n";
    preview += QString("  Progress (%1m × %2):  +%3\n")
        .arg(typicalDistance, 0, 'f', 0)
        .arg(m_progressRewardMultiplier->value(), 0, 'f', 2)
        .arg(progressReward, 0, 'f', 0);
    preview += QString("  Goal Bonus:                        +%1\n")
        .arg(goalBonus, 0, 'f', 0);
    preview += QString("  Exploration (%1 × %2):      +%3\n")
        .arg(explorationCount)
        .arg(m_explorationBonusValue->value(), 0, 'f', 0)
        .arg(totalExploration, 0, 'f', 0);
    preview += QString("  ───────────────────────────────────\n");
    preview += QString("  TOTAL POSITIVE:                    +%1\n\n")
        .arg(totalPositive, 0, 'f', 0);
    
    preview += "CONSTRAINT PENALTIES (per violation):\n";
    preview += QString("  Sea proximity:                      %1 [TERMINATES]\n")
        .arg(m_seaPenalty->value(), 0, 'f', 0);
    preview += QString("  Built-up area:                      %1 [TERMINATES]\n")
        .arg(m_builtupPenalty->value(), 0, 'f', 0);
    preview += QString("  Powerline parallel:                 %1\n")
        .arg(m_powerlinePenalty->value(), 0, 'f', 0);
    preview += QString("  Railway parallel:                   %1\n")
        .arg(m_railwayPenalty->value(), 0, 'f', 0);
    preview += QString("  Out of bounds:                      %1\n\n")
        .arg(m_outOfBoundsPenalty->value(), 0, 'f', 0);
    
    // Check balance
    double singleTerminationMagnitude = std::max(std::abs(m_seaPenalty->value()), 
                                                   std::abs(m_builtupPenalty->value()));
    
    preview += "BALANCE CHECK:\n";
    if (totalPositive > singleTerminationMagnitude * 2) {
        preview += "  ✅ Goal-seeking DOMINATES constraints\n";
        preview += "     Agent strongly incentivized to reach goal\n";
    } else if (totalPositive > singleTerminationMagnitude) {
        preview += "  ✓ Goal-seeking COMPETITIVE with constraints\n";
        preview += "    Balanced risk/reward\n";
    } else {
        preview += "  ⚠️ Constraints TOO STRONG vs goal-seeking!\n";
        preview += "     Agent may be too cautious to explore\n";
    }
    
    m_rewardPreviewLabel->setText(preview);
}

void PIRLParameterTuningDialog::onParameterChanged()
{
    m_modified = true;
    m_statusLabel->setText("Parameters modified - Click Export to save changes");
    m_statusLabel->setStyleSheet("QLabel { padding: 8px; background-color: #fff9c4; border-radius: 4px; }");
    
    // Update reward preview
    updateRewardPreview();
    
    // Update landcover base reference label and actual costs
    if (m_landcoverBaseLabel && m_baseTerrainCost && m_landcoverTable) {
        double baseCost = m_baseTerrainCost->value();
        QString currency = m_currencySelector ? m_currencySelector->currentText() : "USD";
        m_landcoverBaseLabel->setText(QString("Base Reference Cost: %1 %2/m (from Terrain tab)")
                                      .arg(baseCost, 0, 'f', 0)
                                      .arg(currency));
        
        // Update actual cost column in landcover table
        for (int i = 0; i < m_landcoverTable->rowCount(); ++i) {
            int classNum = m_landcoverTable->item(i, 0)->text().toInt();
            if (m_landcoverMultipliers.contains(classNum)) {
                double multiplier = m_landcoverMultipliers[classNum]->value();
                double actualCost = baseCost * multiplier;
                m_landcoverTable->item(i, 3)->setText(QString("%1 %2/m")
                                                      .arg(actualCost, 0, 'f', 0)
                                                      .arg(currency));
            }
        }
    }
}

void PIRLParameterTuningDialog::onApply()
{
    QJsonObject params = buildParametersJSON();
    emit parametersApplied(params);
    m_statusLabel->setText("Parameters applied (signal emitted)");
    m_statusLabel->setStyleSheet("QLabel { padding: 8px; background-color: #c8e6c9; border-radius: 4px; }");
}

void PIRLParameterTuningDialog::onExport()
{
    QJsonObject params = buildParametersJSON();
    QString filePath = m_projectDir + "/PIRL/pirl_parameter_overrides.json";
    
    exportParametersToFile(filePath);
    
    m_modified = false;
    m_statusLabel->setText("✅ Parameters exported to: " + filePath);
    m_statusLabel->setStyleSheet("QLabel { padding: 8px; background-color: #c8e6c9; border-radius: 4px; }");
    
    QMessageBox::information(this, "Export Successful", 
        QString("Parameters saved to:\n%1\n\n"
                "These will be automatically loaded on the next training run.").arg(filePath));
    
    emit parametersExported(filePath);
}

void PIRLParameterTuningDialog::onReset()
{
    QMessageBox::StandardButton reply = QMessageBox::question(this, "Reset Parameters",
        "Reset all parameters to default values?",
        QMessageBox::Yes | QMessageBox::No);
    
    if (reply == QMessageBox::Yes) {
        m_currentParams = m_defaultParams;
        loadCurrentParameters();
        updateRewardPreview();
        m_statusLabel->setText("All parameters reset to defaults");
        m_statusLabel->setStyleSheet("QLabel { padding: 8px; background-color: #e3f2fd; border-radius: 4px; }");
    }
}

void PIRLParameterTuningDialog::onLoadDefaults()
{
    loadDefaultParameters();
    m_currentParams = m_defaultParams;
    loadCurrentParameters();
}

void PIRLParameterTuningDialog::onValidateAll()
{
    QStringList warnings;
    
    // Check reward balance
    double progressMult = m_progressRewardMultiplier->value();
    double goalBonus = m_goalBonusValue->value();
    double seaPenalty = std::abs(m_seaPenalty->value());
    
    if (seaPenalty > (goalBonus * 2)) {
        warnings << "⚠️ Sea penalty is more than 2× goal bonus - may be too strong";
    }
    
    if (progressMult < 0.5) {
        warnings << "⚠️ Progress multiplier very low - agent may not seek goal effectively";
    }
    
    if (progressMult > 5.0) {
        warnings << "⚠️ Progress multiplier very high - agent may ignore costs";
    }
    
    // Check hydraulic thresholds
    if (m_minDeliveryPressure->value() >= m_maxOperatingPressure->value()) {
        warnings << "❌ Min delivery pressure must be less than max operating pressure!";
    }
    
    // Check clearances
    if (m_powerlineCrossingThreshold->value() >= m_powerlineClearance->value()) {
        warnings << "❌ Powerline crossing threshold must be less than clearance!";
    }
    
    if (m_railwayCrossingThreshold->value() >= m_railwayClearance->value()) {
        warnings << "❌ Railway crossing threshold must be less than clearance!";
    }
    
    // Check velocity thresholds
    if (m_dropoutVelocityThreshold->value() >= m_erosionVelocityThreshold->value()) {
        warnings << "⚠️ Dropout threshold should be less than erosion threshold";
    }
    
    if (warnings.isEmpty()) {
        QMessageBox::information(this, "Validation", "✅ All parameters validated successfully!\n\nNo issues found.");
    } else {
        QString message = "Validation found the following issues:\n\n";
        message += warnings.join("\n");
        QMessageBox::warning(this, "Validation Warnings", message);
    }
}

QJsonObject PIRLParameterTuningDialog::buildParametersJSON() const
{
    QJsonObject root;
    root["version"] = "2.0";  // Updated version for new structure
    root["timestamp"] = QDateTime::currentDateTime().toString(Qt::ISODate);
    root["description"] = "PIRL parameter overrides - Enhanced continuous cost model";
    root["currency"] = m_currencySelector->currentText();
    
    // PPO Rewards
    QJsonObject rewards;
    rewards["progress_multiplier"] = m_progressRewardMultiplier->value();
    rewards["goal_bonus"] = m_goalBonusValue->value();
    rewards["exploration_bonus"] = m_explorationBonusValue->value();
    rewards["sea_penalty"] = m_seaPenalty->value();
    rewards["buildup_penalty"] = m_builtupPenalty->value();
    rewards["powerline_penalty"] = m_powerlinePenalty->value();
    rewards["railway_penalty"] = m_railwayPenalty->value();
    rewards["curvature_penalty_rate"] = m_curvaturePenaltyRate->value();
    rewards["out_of_bounds_penalty"] = m_outOfBoundsPenalty->value();
    rewards["cost_normalization_factor"] = m_costNormalizationFactor->value();
    rewards["exploration_bonus_milestone_m"] = m_explorationBonusMilestone->value();
    root["ppo_rewards"] = rewards;
    
    // Cost Model (NEW STRUCTURE)
    QJsonObject costModel;
    
    // Base terrain cost
    costModel["base_terrain_cost_per_m"] = m_baseTerrainCost->value();
    
    // Slope factors
    costModel["slope_linear_factor"] = m_slopeLinearFactor->value();
    costModel["slope_quadratic_factor"] = m_slopeQuadraticFactor->value();
    
    // Soil capacity factor range
    costModel["soil_capacity_factor_min"] = m_soilFactorMin->value();
    costModel["soil_capacity_factor_max"] = m_soilFactorMax->value();
    
    // Geohazard risk factor range
    costModel["geohazard_risk_factor_min"] = m_geohazardFactorMin->value();
    costModel["geohazard_risk_factor_max"] = m_geohazardFactorMax->value();
    
    // Land cover MULTIPLIERS (not absolute costs)
    QJsonObject landcoverMult;
    for (auto it = m_landcoverMultipliers.begin(); it != m_landcoverMultipliers.end(); ++it) {
        landcoverMult[QString::number(it.key())] = it.value()->value();
    }
    costModel["landcover_costs"] = landcoverMult;  // Keep same key for compatibility
    
    // Crossing Cost Components (HDD)
    QJsonObject crossingCosts;
    
    // Road
    QJsonObject road;
    road["base_cost_usd"] = m_roadCrossingControls.baseCost->value();
    road["drilling_cost_per_m"] = m_roadCrossingControls.drillingCostPerM->value();
    road["installation_cost_per_m"] = m_roadCrossingControls.installationCostPerM->value();
    road["drill_length_multiplier"] = m_roadCrossingControls.drillLengthMultiplier->value();
    crossingCosts["road"] = road;
    
    // Waterway
    QJsonObject waterway;
    waterway["base_cost_usd"] = m_waterwayCrossingControls.baseCost->value();
    waterway["drilling_cost_per_m"] = m_waterwayCrossingControls.drillingCostPerM->value();
    waterway["installation_cost_per_m"] = m_waterwayCrossingControls.installationCostPerM->value();
    waterway["drill_length_multiplier"] = m_waterwayCrossingControls.drillLengthMultiplier->value();
    crossingCosts["waterway"] = waterway;
    
    // Railway
    QJsonObject railway;
    railway["base_cost_usd"] = m_railwayCrossingControls.baseCost->value();
    railway["drilling_cost_per_m"] = m_railwayCrossingControls.drillingCostPerM->value();
    railway["installation_cost_per_m"] = m_railwayCrossingControls.installationCostPerM->value();
    railway["drill_length_multiplier"] = m_railwayCrossingControls.drillLengthMultiplier->value();
    crossingCosts["railway"] = railway;
    
    // Powerline
    QJsonObject powerline;
    powerline["base_cost_usd"] = m_powerlineCrossingControls.baseCost->value();
    powerline["drilling_cost_per_m"] = m_powerlineCrossingControls.drillingCostPerM->value();
    powerline["installation_cost_per_m"] = m_powerlineCrossingControls.installationCostPerM->value();
    powerline["drill_length_multiplier"] = m_powerlineCrossingControls.drillLengthMultiplier->value();
    crossingCosts["powerline"] = powerline;
    
    costModel["crossing_cost_hdd"] = crossingCosts;
    root["cost_model"] = costModel;
    
    // Hydraulic Costs
    QJsonObject hydraulicCosts;
    hydraulicCosts["compressor_base_cost"] = m_compressorBaseCost->value();
    hydraulicCosts["compressor_power_cost_per_kw"] = m_compressorPowerCost->value();
    hydraulicCosts["erosion_velocity_threshold_m_s"] = m_erosionVelocityThreshold->value();
    hydraulicCosts["erosion_penalty_per_m"] = m_erosionPenaltyRate->value();
    hydraulicCosts["dropout_velocity_threshold_m_s"] = m_dropoutVelocityThreshold->value();
    hydraulicCosts["dropout_penalty_per_m"] = m_dropoutPenaltyRate->value();
    hydraulicCosts["excessive_pressure_drop_threshold_bar"] = m_excessivePressureDropThreshold->value();
    hydraulicCosts["excessive_pressure_drop_per_bar"] = m_excessivePressureDropPenalty->value();
    root["hydraulic_costs"] = hydraulicCosts;
    
    // Constraint Thresholds
    QJsonObject constraints;
    constraints["max_slope_percent"] = m_maxSlopePercent->value();
    constraints["min_delivery_pressure_bar"] = m_minDeliveryPressure->value();
    constraints["max_operating_pressure_bar"] = m_maxOperatingPressure->value();
    constraints["powerline_clearance_m"] = m_powerlineClearance->value();
    constraints["powerline_crossing_threshold_m"] = m_powerlineCrossingThreshold->value();
    constraints["railway_clearance_m"] = m_railwayClearance->value();
    constraints["railway_crossing_threshold_m"] = m_railwayCrossingThreshold->value();
    constraints["sea_exclusion_distance_m"] = m_seaExclusionDistance->value();
    constraints["goal_distance_threshold_m"] = m_goalDistanceThreshold->value();
    root["constraint_thresholds"] = constraints;
    
    return root;
}

void PIRLParameterTuningDialog::exportParametersToFile(const QString& filePath)
{
    QJsonObject params = buildParametersJSON();
    QJsonDocument doc(params);
    
    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly)) {
        QMessageBox::critical(this, "Export Failed", "Could not write to file: " + filePath);
        return;
    }
    
    file.write(doc.toJson(QJsonDocument::Indented));
    file.close();
}

QJsonObject PIRLParameterTuningDialog::getModifiedParameters() const
{
    return buildParametersJSON();
}

