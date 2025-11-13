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
#include "agrs_zeus/gui/DatasetCatalog.h"

namespace agrs { namespace gui {

class MapWidget;
class CursorInterface;
class TerminalWidget;
class DatasetFetchPipeline;
class DatasetFetchProgressDialog;

// Use the DatasetInfo from DatasetCatalog (compatible with existing code)
// Keep local definition for backward compatibility
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
    
    DatasetInfo() = default;
};

// Use CategoryInfo from DatasetCatalog (defined there)

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
    void onAutoSelectPIRL();
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
    
    // New integrated components
    DatasetCatalog* m_catalog{nullptr};
    DatasetFetchPipeline* m_pipeline{nullptr};
    DatasetFetchProgressDialog* m_progressDialog{nullptr};
};

}} // namespace agrs::gui

#endif // AGRS_GUI_DATASETAVAILABILITYDIALOG_H




