#ifndef AGRS_GUI_PROJECTSETUPWIZARD_H
#define AGRS_GUI_PROJECTSETUPWIZARD_H

#include <QWizard>
#include <QWizardPage>
#include <QLineEdit>
#include <QPushButton>
#include <QLabel>
#include <QComboBox>
#include <QDoubleSpinBox>
#include <QCheckBox>
#include <QProgressBar>
#include <QFileInfo>
#include <QTimer>
#include <QTextEdit>
#include <QVBoxLayout>
#include <QVector>

namespace agrs { namespace gui {

class MapWidget;

struct ProjectSetupData {
    QString projectName;
    QString aoiPath;
    QString projectPath;
    int epsgCode{4326};
    QString crsName{"WGS 84"};
    double startLat{0.0}, startLon{0.0};
    double endLat{0.0}, endLon{0.0};
    QString startKmzPath;
    QString endKmzPath;
    // Pipeline specifications
    QString pipeType;
    QString material;
    double mopBar{0.0};
    double dpBar{0.0};
    double diameterMm{0.0};
    double thicknessMm{0.0};
    double coverDepthM{0.0};
    QVector<double> hotBendAngles;
    double hddMaxCurvatureDeg{0.0};
    double powerlinesMinDistMm{0.0};
    double powerpolesMinDistMm{0.0};
    double houseMinDistMm{0.0};
    QString rowFilePath; // optional
    // Additional files with context
    QStringList additionalFiles;
    QStringList additionalFileContexts;
};

// Page 1: Info + AOI + CRS
class SetupInfoPage : public QWizardPage {
    Q_OBJECT
public:
    explicit SetupInfoPage(MapWidget* map, QWidget* parent = nullptr);
    bool isComplete() const override;
private slots:
    void onBrowseAOI();
    void onBrowseProjectPath();
    void onSelectCRS();
    void onProjectNameEdited(const QString&);
private:
    MapWidget* m_map;
    QLineEdit* m_projectName;
    QLabel* m_projectNameFormatted;
    QLineEdit* m_aoiPath;
    QLabel* m_statusLabel;
    QProgressBar* m_progress;
    QLineEdit* m_projectPath;
    QLabel* m_crsLabel;
    QPushButton* m_selectCRSBtn;
    QLabel* m_crsRecommendation;
    QTimer* m_bgTimer; // simulates background AOI preload + availability check
    QPushButton* m_useRecommendedBtn{nullptr};
    QLineEdit* m_epsgHidden{nullptr};
    QLineEdit* m_crsNameHidden{nullptr};
};

// Page 2: Endpoints
class SetupEndpointsPage : public QWizardPage {
    Q_OBJECT
public:
    explicit SetupEndpointsPage(QWidget* parent = nullptr);
    bool isComplete() const override;
private slots:
    void onBrowseStartKmz();
    void onBrowseEndKmz();
    void onStartKmzChanged(const QString& path);
    void onEndKmzChanged(const QString& path);
private:
    void parseKmzCoordinates(const QString& path, double& lat, double& lon);
    
    QDoubleSpinBox* m_startLat;
    QDoubleSpinBox* m_startLon;
    QDoubleSpinBox* m_endLat;
    QDoubleSpinBox* m_endLon;
    QLineEdit* m_startKmz;
    QLineEdit* m_endKmz;
};

// Page 3: Pipeline specs (full with units)
class SetupSpecsPage : public QWizardPage {
    Q_OBJECT
public:
    explicit SetupSpecsPage(QWidget* parent = nullptr);
    bool isComplete() const override;
    
    // Public accessors for wizard data collection
    QDoubleSpinBox* m_mop;
    QComboBox* m_mopUnit;
    QDoubleSpinBox* m_dp;
    QComboBox* m_dpUnit;
    QDoubleSpinBox* m_diameter;
    QComboBox* m_diameterUnit;
    QDoubleSpinBox* m_thickness;
    QComboBox* m_thicknessUnit;
    QDoubleSpinBox* m_coverDepth;
    QComboBox* m_coverDepthUnit;
    QVector<QDoubleSpinBox*> m_hotBendAngleSpins;
    QDoubleSpinBox* m_hddMaxCurvature;
    QDoubleSpinBox* m_powerlinesMinDist;
    QComboBox* m_powerlinesMinDistUnit;
    QDoubleSpinBox* m_powerpolesMinDist;
    QComboBox* m_powerpolesMinDistUnit;
    QDoubleSpinBox* m_houseMinDist;
    QComboBox* m_houseMinDistUnit;
    QLineEdit* m_rowFile;
    
private slots:
    void onAddHotBendAngle();
    void onRemoveHotBendAngle();
    void onBrowseRowFile();
private:
    QComboBox* m_type;
    QComboBox* m_material;
    
    QVBoxLayout* m_hotBendAnglesLayout;
    QPushButton* m_addAngleBtn;
};

// Page 4: Additional Files (Optional)
class AdditionalFilesPage : public QWizardPage {
    Q_OBJECT
public:
    explicit AdditionalFilesPage(QWidget* parent = nullptr);
    bool isComplete() const override;
    
    // Public accessors for wizard data collection
    QVector<QLineEdit*> m_filePathEdits;
    QVector<QLineEdit*> m_fileContextEdits;
    
private slots:
    void onAddFile();
    void onRemoveFile();
    void onBrowseFile(int index);
private:
    QVBoxLayout* m_filesLayout;
    QPushButton* m_addFileBtn;
};

// Page 5: Confirmation + AI Summary
class SetupConfirmPage : public QWizardPage {
    Q_OBJECT
public:
    explicit SetupConfirmPage(QWidget* parent = nullptr);
    void initializePage() override;
    bool validatePage() override;
    QString getConfirmationText() const;
private slots:
    void onGenerateAISummary();
    void onAISummaryComplete(const QString& summary);
    void onAISummaryFailed(const QString& error);
private:
    void runAISummaryInBackground();
    void saveConfirmationReport(const QString& projectPath);
    
    QTextEdit* m_text{nullptr};
    QPushButton* m_generate{nullptr};
    QLabel* m_status{nullptr};
};

class ProjectSetupWizard : public QWizard {
    Q_OBJECT
public:
    explicit ProjectSetupWizard(MapWidget* map, QWidget* parent = nullptr);
    ProjectSetupData data() const;
};

}} // namespace agrs::gui

#endif // AGRS_GUI_PROJECTSETUPWIZARD_H
