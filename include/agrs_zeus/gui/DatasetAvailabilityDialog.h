#ifndef AGRS_GUI_DATASETAVAILABILITYDIALOG_H
#define AGRS_GUI_DATASETAVAILABILITYDIALOG_H

#include <QDialog>
#include <QTableWidget>
#include <QPushButton>
#include <QLabel>
#include <QProgressBar>
#include <QTextEdit>
#include <QVector>
#include <QMap>

namespace agrs { namespace gui {

class MapWidget;
class CursorInterface;
class TerminalWidget;

struct DatasetInfo {
    QString category;
    QString datasetName;
    QString provider;
    QString resolution;
    QString dataType;
    QString coverage;
    QString fetchTool;
    QString license;
    bool isImplemented{false};
    bool isAvailableForAOI{false};
    QString notes;
};

struct CategoryInfo {
    QString name;
    int totalDatasets{0};
    int implementedDatasets{0};
    int availableDatasets{0};
    bool hasImplementedForAOI{false};
};

class DatasetAvailabilityDialog : public QDialog {
    Q_OBJECT
public:
    explicit DatasetAvailabilityDialog(MapWidget* map,
                                       const QString& aoiPath,
                                       const QString& projectPath,
                                       QWidget* parent = nullptr,
                                       TerminalWidget* terminalWidget = nullptr);
    
    void analyzeAndDisplay();

private slots:
    void onAutoRecommend();
    void onFetchSelected();
    void onShowAllDatasets();
    void onAnalysisComplete();
    void onAnalysisFailed();

private:
    void runAnalysisInBackground();
    void loadDatasetInventories();
    void populateTable(const QVector<DatasetInfo>& datasets, const QMap<QString, CategoryInfo>& categories);
    QString computeBBoxWGS84() const;
    
    MapWidget* m_map{nullptr};
    QString m_aoiPath;
    QString m_projectPath;
    
    QTableWidget* m_table{nullptr};
    QPushButton* m_fetchBtn{nullptr};
    QLabel* m_statusLabel{nullptr};
    QProgressBar* m_progressBar{nullptr};
    QTextEdit* m_analysisText{nullptr};
    
    QVector<DatasetInfo> m_allDatasets;
    QMap<QString, CategoryInfo> m_categories;
    
    CursorInterface* m_cursor{nullptr};
    TerminalWidget* m_terminalWidget{nullptr};
};

}} // namespace agrs::gui

#endif // AGRS_GUI_DATASETAVAILABILITYDIALOG_H




