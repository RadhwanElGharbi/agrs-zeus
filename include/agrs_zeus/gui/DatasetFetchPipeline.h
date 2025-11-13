#ifndef AGRS_ZEUS_DATASET_FETCH_PIPELINE_H
#define AGRS_ZEUS_DATASET_FETCH_PIPELINE_H

#include <QObject>
#include <QString>
#include <QVector>
#include <QMap>
#include <QProcess>
#include <QMutex>
#include <memory>

namespace agrs {
namespace gui {

/**
 * @brief Task for fetching a single dataset
 */
struct FetchTask {
    QString id;                 // Unique task ID
    QString datasetName;        // Dataset name from catalog
    QString category;           // Category (dem, landcover, etc.)
    QString fetchTool;          // Tool to use (osm_railways_fetch, dem_fetch, etc.)
    QString aoiPath;            // Path to AOI file for clipping
    QString projectPath;        // Project root directory
    QString targetCRS;          // Target EPSG code (e.g., "EPSG:32633")
    QString countryCode;        // Country code (e.g., "IT")
    bool autoProcess;           // Reproject/clip after fetch
    int priority;               // Higher = fetch first (0-10)
    
    // Runtime state
    QString status;             // "pending", "running", "completed", "failed"
    int progressPercent;        // 0-100
    QString errorMessage;       // If failed
    QString outputPath;         // Path to fetched file
    
    FetchTask() : autoProcess(true), priority(5), progressPercent(0) {}
};

/**
 * @brief Orchestrates automated dataset fetching workflow
 * 
 * This class manages the complete fetch pipeline:
 * 1. Pre-fetch: Scan project directory for existing files
 * 2. Fetch: Execute appropriate ZEUS tool
 * 3. Validate: Check file integrity and coverage
 * 4. Process: Reproject to target CRS, clip to AOI
 * 5. Metadata: Generate JSON metadata files
 * 6. Organize: Move to correct directory structure
 * 
 * Supports:
 * - Parallel fetching (max 3 concurrent)
 * - Pause/Resume/Cancel
 * - Retry on failure
 * - Progress tracking
 * - Thread-safe operations
 */
class DatasetFetchPipeline : public QObject {
    Q_OBJECT
    
public:
    explicit DatasetFetchPipeline(QObject* parent = nullptr);
    ~DatasetFetchPipeline();
    
    /**
     * @brief Add a fetch task to the queue
     * @param task Task to add
     */
    void addTask(const FetchTask& task);
    
    /**
     * @brief Add multiple tasks at once
     * @param tasks Vector of tasks
     */
    void addTasks(const QVector<FetchTask>& tasks);
    
    /**
     * @brief Remove a task from the queue
     * @param taskId Task ID
     * @return true if removed
     */
    bool removeTask(const QString& taskId);
    
    /**
     * @brief Clear all tasks
     */
    void clearTasks();
    
    /**
     * @brief Start executing all queued tasks
     * 
     * Tasks are executed in priority order.
     * Up to maxConcurrent tasks run in parallel.
     */
    void start();
    
    /**
     * @brief Pause execution (can be resumed)
     */
    void pause();
    
    /**
     * @brief Resume execution
     */
    void resume();
    
    /**
     * @brief Cancel all tasks and stop execution
     */
    void cancel();
    
    /**
     * @brief Check if pipeline is running
     */
    bool isRunning() const;
    
    /**
     * @brief Check if pipeline is paused
     */
    bool isPaused() const;
    
    /**
     * @brief Get current task being executed
     */
    QVector<FetchTask> getCurrentTasks() const;
    
    /**
     * @brief Get all tasks (queued + running + completed)
     */
    QVector<FetchTask> getAllTasks() const;
    
    /**
     * @brief Get task by ID
     */
    FetchTask getTask(const QString& taskId) const;
    
    /**
     * @brief Get completion statistics
     */
    struct Stats {
        int total;
        int completed;
        int failed;
        int pending;
        int running;
    };
    Stats getStats() const;
    
    /**
     * @brief Set maximum concurrent fetches
     * @param max Maximum (1-5, default 3)
     */
    void setMaxConcurrent(int max);
    
    /**
     * @brief Set retry count for failed fetches
     * @param retries Number of retries (0-3, default 2)
     */
    void setMaxRetries(int retries);

signals:
    /**
     * @brief Emitted when a task starts
     * @param taskId Task ID
     * @param datasetName Dataset name
     */
    void taskStarted(const QString& taskId, const QString& datasetName);
    
    /**
     * @brief Emitted when task progress updates
     * @param taskId Task ID
     * @param percent Progress percentage (0-100)
     * @param message Status message
     */
    void taskProgress(const QString& taskId, int percent, const QString& message);
    
    /**
     * @brief Emitted when a task completes successfully
     * @param taskId Task ID
     * @param outputPath Path to fetched file
     */
    void taskCompleted(const QString& taskId, const QString& outputPath);
    
    /**
     * @brief Emitted when a task fails
     * @param taskId Task ID
     * @param errorMessage Error message
     */
    void taskFailed(const QString& taskId, const QString& errorMessage);
    
    /**
     * @brief Emitted when all tasks complete
     * @param successCount Number of successful tasks
     * @param failCount Number of failed tasks
     */
    void allTasksCompleted(int successCount, int failCount);
    
    /**
     * @brief Emitted when pipeline is paused
     */
    void paused();
    
    /**
     * @brief Emitted when pipeline is resumed
     */
    void resumed();
    
    /**
     * @brief Emitted when pipeline is cancelled
     */
    void cancelled();
    
    /**
     * @brief Emitted for log messages
     * @param level "INFO", "WARNING", "ERROR"
     * @param message Log message
     */
    void logMessage(const QString& level, const QString& message);

private slots:
    void onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus);
    void onProcessReadyRead();
    void onProcessErrorOccurred(QProcess::ProcessError error);

private:
    /**
     * @brief Execute the next task in queue
     */
    void executeNextTask();
    
    /**
     * @brief Execute a specific task
     * @param task Task to execute
     */
    void executeTask(FetchTask& task);
    
    /**
     * @brief Build command for a fetch task
     * @param task Fetch task
     * @return Full command string
     */
    QString buildFetchCommand(const FetchTask& task) const;
    
    /**
     * @brief Validate fetched file
     * @param filePath Path to file
     * @param task Task info
     * @return true if valid
     */
    bool validateFetch(const QString& filePath, const FetchTask& task);
    
    /**
     * @brief Process fetched dataset (reproject, clip)
     * @param rawPath Path to raw file
     * @param task Task info
     * @return Path to processed file, empty if failed
     */
    QString processDataset(const QString& rawPath, const FetchTask& task);
    
    /**
     * @brief Generate metadata JSON file
     * @param filePath Path to dataset file
     * @param task Task info
     * @param isProcessed true if processed, false if raw
     * @return true if successful
     */
    bool generateMetadata(const QString& filePath, const FetchTask& task, bool isProcessed);
    
    /**
     * @brief Parse progress from tool output
     * @param output Output line
     * @return Progress percentage, -1 if not a progress line
     */
    int parseProgress(const QString& output) const;
    
    /**
     * @brief Get output directory for a category
     * @param category Dataset category
     * @param task Task info
     * @return Directory path
     */
    QString getOutputDirectory(const QString& category, const FetchTask& task) const;
    
    /**
     * @brief Check if file already exists
     * @param task Task to check
     * @return Path to existing file, empty if not found
     */
    QString checkExisting(const FetchTask& task) const;
    
    /**
     * @brief Mark task as completed
     */
    void markCompleted(FetchTask& task, const QString& outputPath);
    
    /**
     * @brief Mark task as failed
     */
    void markFailed(FetchTask& task, const QString& errorMessage);
    
    /**
     * @brief Retry a failed task
     */
    void retryTask(const QString& taskId);

private:
    // Task management
    QVector<FetchTask> m_tasks;
    QMap<QString, std::unique_ptr<QProcess>> m_runningProcesses;
    mutable QMutex m_tasksMutex;
    
    // State
    bool m_running;
    bool m_paused;
    bool m_cancelled;
    int m_maxConcurrent;
    int m_maxRetries;
    
    // Stats
    int m_completedCount;
    int m_failedCount;
    
    // Current task tracking
    QMap<QProcess*, QString> m_processToTaskId;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_ZEUS_DATASET_FETCH_PIPELINE_H
