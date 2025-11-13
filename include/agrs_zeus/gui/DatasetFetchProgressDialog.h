#ifndef AGRS_GUI_DATASET_FETCH_PROGRESS_DIALOG_H
#define AGRS_GUI_DATASET_FETCH_PROGRESS_DIALOG_H

#include <QDialog>
#include <QTableWidget>
#include <QTextEdit>
#include <QProgressBar>
#include <QPushButton>
#include <QLabel>
#include <QMap>

namespace agrs {
namespace gui {

// Forward declaration
class DatasetFetchPipeline;

/**
 * @brief Visual progress tracking dialog for dataset fetching
 * 
 * Displays real-time progress for batch dataset downloads with controls
 * for pause, resume, cancel, and retry operations.
 */
class DatasetFetchProgressDialog : public QDialog {
    Q_OBJECT
    
public:
    explicit DatasetFetchProgressDialog(DatasetFetchPipeline* pipeline, QWidget* parent = nullptr);
    ~DatasetFetchProgressDialog();
    
    /**
     * @brief Start monitoring the pipeline
     */
    void startMonitoring();
    
protected:
    void closeEvent(QCloseEvent* event) override;
    
private slots:
    void onTaskStarted(const QString& taskId, const QString& datasetName);
    void onTaskProgress(const QString& taskId, int percent, const QString& message);
    void onTaskCompleted(const QString& taskId, const QString& datasetName, 
                        const QString& outputPath, qint64 fileSizeBytes);
    void onTaskFailed(const QString& taskId, const QString& datasetName, 
                     const QString& errorMessage);
    void onAllTasksCompleted(int successCount, int failCount);
    void onPipelinePaused();
    void onPipelineResumed();
    void onPipelineCancelled();
    void onLogMessage(const QString& level, const QString& message);
    
    void onPauseClicked();
    void onResumeClicked();
    void onCancelClicked();
    void onRetryFailedClicked();
    void onExportLogClicked();
    
private:
    /**
     * @brief Update overall progress bar
     */
    void updateOverallProgress();
    
    /**
     * @brief Add task row to table
     */
    void addTaskRow(const QString& taskId, const QString& datasetName);
    
    /**
     * @brief Update task row with progress
     */
    void updateTaskRow(const QString& taskId, int progress, const QString& status, 
                      const QString& message = QString());
    
    /**
     * @brief Get row index for task
     */
    int getTaskRow(const QString& taskId) const;
    
    /**
     * @brief Format file size
     */
    QString formatFileSize(qint64 bytes) const;
    
    /**
     * @brief Append to log output
     */
    void appendLog(const QString& level, const QString& message);
    
    // UI Components
    QLabel* m_titleLabel;
    QProgressBar* m_overallProgress;
    QLabel* m_statusLabel;
    QTableWidget* m_taskTable;
    QTextEdit* m_logOutput;
    
    QPushButton* m_pauseButton;
    QPushButton* m_resumeButton;
    QPushButton* m_cancelButton;
    QPushButton* m_retryFailedButton;
    QPushButton* m_exportLogButton;
    QPushButton* m_closeButton;
    
    // Data
    DatasetFetchPipeline* m_pipeline;
    QMap<QString, int> m_taskRows;  // taskId -> row index
    int m_totalTasks;
    int m_completedTasks;
    int m_failedTasks;
    bool m_allCompleted;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_DATASET_FETCH_PROGRESS_DIALOG_H




