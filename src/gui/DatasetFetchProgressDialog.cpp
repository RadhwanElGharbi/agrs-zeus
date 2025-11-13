#include "agrs_zeus/gui/DatasetFetchProgressDialog.h"
#include "agrs_zeus/gui/DatasetFetchPipeline.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QHeaderView>
#include <QDateTime>
#include <QFile>
#include <QFileDialog>
#include <QMessageBox>
#include <QTextStream>
#include <QCloseEvent>
#include <QSplitter>
#include <QGroupBox>
#include <QScrollBar>

namespace agrs {
namespace gui {

DatasetFetchProgressDialog::DatasetFetchProgressDialog(DatasetFetchPipeline* pipeline, QWidget* parent)
    : QDialog(parent)
    , m_pipeline(pipeline)
    , m_totalTasks(0)
    , m_completedTasks(0)
    , m_failedTasks(0)
    , m_allCompleted(false)
{
    setWindowTitle(tr("Dataset Fetch Progress"));
    setModal(false);
    resize(900, 600);
    
    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    
    // Title and overall progress
    m_titleLabel = new QLabel(tr("<h2>Fetching Datasets</h2>"), this);
    mainLayout->addWidget(m_titleLabel);
    
    m_overallProgress = new QProgressBar(this);
    m_overallProgress->setRange(0, 100);
    m_overallProgress->setValue(0);
    m_overallProgress->setTextVisible(true);
    m_overallProgress->setFormat(tr("Overall Progress: %p% (%v/%m tasks)"));
    mainLayout->addWidget(m_overallProgress);
    
    m_statusLabel = new QLabel(tr("Initializing..."), this);
    mainLayout->addWidget(m_statusLabel);
    
    // Splitter for table and log
    QSplitter* splitter = new QSplitter(Qt::Vertical, this);
    
    // Task table
    QGroupBox* tableGroup = new QGroupBox(tr("Dataset Tasks"), this);
    QVBoxLayout* tableLayout = new QVBoxLayout(tableGroup);
    
    m_taskTable = new QTableWidget(0, 5, this);
    m_taskTable->setHorizontalHeaderLabels({
        tr("Dataset"), tr("Status"), tr("Progress"), tr("Size"), tr("Message")
    });
    m_taskTable->horizontalHeader()->setStretchLastSection(true);
    m_taskTable->horizontalHeader()->setSectionResizeMode(0, QHeaderView::ResizeToContents);
    m_taskTable->horizontalHeader()->setSectionResizeMode(1, QHeaderView::ResizeToContents);
    m_taskTable->horizontalHeader()->setSectionResizeMode(2, QHeaderView::Fixed);
    m_taskTable->horizontalHeader()->resizeSection(2, 120);
    m_taskTable->horizontalHeader()->setSectionResizeMode(3, QHeaderView::ResizeToContents);
    m_taskTable->setSelectionBehavior(QAbstractItemView::SelectRows);
    m_taskTable->setAlternatingRowColors(true);
    m_taskTable->setEditTriggers(QAbstractItemView::NoEditTriggers);
    
    tableLayout->addWidget(m_taskTable);
    splitter->addWidget(tableGroup);
    
    // Log output
    QGroupBox* logGroup = new QGroupBox(tr("Log Output"), this);
    QVBoxLayout* logLayout = new QVBoxLayout(logGroup);
    
    m_logOutput = new QTextEdit(this);
    m_logOutput->setReadOnly(true);
    m_logOutput->setMaximumHeight(150);
    m_logOutput->setFont(QFont("Monospace", 9));
    logLayout->addWidget(m_logOutput);
    
    splitter->addWidget(logGroup);
    splitter->setStretchFactor(0, 3);
    splitter->setStretchFactor(1, 1);
    
    mainLayout->addWidget(splitter);
    
    // Control buttons
    QHBoxLayout* buttonLayout = new QHBoxLayout();
    
    m_pauseButton = new QPushButton(tr("⏸ Pause"), this);
    m_pauseButton->setToolTip(tr("Pause fetching (completes current tasks)"));
    connect(m_pauseButton, &QPushButton::clicked, this, &DatasetFetchProgressDialog::onPauseClicked);
    buttonLayout->addWidget(m_pauseButton);
    
    m_resumeButton = new QPushButton(tr("▶ Resume"), this);
    m_resumeButton->setToolTip(tr("Resume fetching"));
    m_resumeButton->setEnabled(false);
    connect(m_resumeButton, &QPushButton::clicked, this, &DatasetFetchProgressDialog::onResumeClicked);
    buttonLayout->addWidget(m_resumeButton);
    
    m_cancelButton = new QPushButton(tr("✖ Cancel All"), this);
    m_cancelButton->setToolTip(tr("Cancel all remaining tasks"));
    m_cancelButton->setStyleSheet("QPushButton { background-color: #d9534f; color: white; }");
    connect(m_cancelButton, &QPushButton::clicked, this, &DatasetFetchProgressDialog::onCancelClicked);
    buttonLayout->addWidget(m_cancelButton);
    
    buttonLayout->addStretch();
    
    m_retryFailedButton = new QPushButton(tr("🔄 Retry Failed"), this);
    m_retryFailedButton->setToolTip(tr("Retry all failed tasks"));
    m_retryFailedButton->setEnabled(false);
    connect(m_retryFailedButton, &QPushButton::clicked, this, &DatasetFetchProgressDialog::onRetryFailedClicked);
    buttonLayout->addWidget(m_retryFailedButton);
    
    m_exportLogButton = new QPushButton(tr("💾 Export Log"), this);
    m_exportLogButton->setToolTip(tr("Save log to file"));
    connect(m_exportLogButton, &QPushButton::clicked, this, &DatasetFetchProgressDialog::onExportLogClicked);
    buttonLayout->addWidget(m_exportLogButton);
    
    m_closeButton = new QPushButton(tr("Close"), this);
    m_closeButton->setEnabled(false);
    connect(m_closeButton, &QPushButton::clicked, this, &QDialog::accept);
    buttonLayout->addWidget(m_closeButton);
    
    mainLayout->addLayout(buttonLayout);
    
    // Connect pipeline signals
    if (m_pipeline) {
        connect(m_pipeline, &DatasetFetchPipeline::taskStarted, 
                this, &DatasetFetchProgressDialog::onTaskStarted);
        connect(m_pipeline, &DatasetFetchPipeline::taskProgress, 
                this, &DatasetFetchProgressDialog::onTaskProgress);
        connect(m_pipeline, &DatasetFetchPipeline::taskCompleted, 
                this, &DatasetFetchProgressDialog::onTaskCompleted);
        connect(m_pipeline, &DatasetFetchPipeline::taskFailed, 
                this, &DatasetFetchProgressDialog::onTaskFailed);
        connect(m_pipeline, &DatasetFetchPipeline::allTasksCompleted, 
                this, &DatasetFetchProgressDialog::onAllTasksCompleted);
        connect(m_pipeline, &DatasetFetchPipeline::pipelinePaused, 
                this, &DatasetFetchProgressDialog::onPipelinePaused);
        connect(m_pipeline, &DatasetFetchPipeline::pipelineResumed, 
                this, &DatasetFetchProgressDialog::onPipelineResumed);
        connect(m_pipeline, &DatasetFetchPipeline::pipelineCancelled, 
                this, &DatasetFetchProgressDialog::onPipelineCancelled);
        connect(m_pipeline, &DatasetFetchPipeline::logMessage, 
                this, &DatasetFetchProgressDialog::onLogMessage);
    }
}

DatasetFetchProgressDialog::~DatasetFetchProgressDialog()
{
}

void DatasetFetchProgressDialog::startMonitoring()
{
    if (!m_pipeline) {
        return;
    }
    
    // Get all tasks and populate table
    QVector<DatasetFetchPipeline::FetchTask> tasks = m_pipeline->getAllTasks();
    m_totalTasks = tasks.size();
    
    for (const auto& task : tasks) {
        addTaskRow(task.id, task.datasetName);
    }
    
    m_overallProgress->setMaximum(m_totalTasks);
    m_overallProgress->setValue(0);
    m_statusLabel->setText(tr("Ready to fetch %1 datasets").arg(m_totalTasks));
    
    appendLog("INFO", QString("Initialized with %1 tasks").arg(m_totalTasks));
}

void DatasetFetchProgressDialog::onTaskStarted(const QString& taskId, const QString& datasetName)
{
    appendLog("INFO", QString("Started: %1").arg(datasetName));
    updateTaskRow(taskId, 0, "Running", "Initializing...");
}

void DatasetFetchProgressDialog::onTaskProgress(const QString& taskId, int percent, const QString& message)
{
    updateTaskRow(taskId, percent, "Running", message);
    updateOverallProgress();
}

void DatasetFetchProgressDialog::onTaskCompleted(const QString& taskId, const QString& datasetName, 
                                                 const QString& outputPath, qint64 fileSizeBytes)
{
    m_completedTasks++;
    QString sizeStr = formatFileSize(fileSizeBytes);
    updateTaskRow(taskId, 100, "✓ Complete", sizeStr);
    updateOverallProgress();
    
    appendLog("SUCCESS", QString("Completed: %1 (%2)").arg(datasetName).arg(sizeStr));
    
    m_statusLabel->setText(tr("Completed: %1/%2 | Failed: %3")
                          .arg(m_completedTasks).arg(m_totalTasks).arg(m_failedTasks));
}

void DatasetFetchProgressDialog::onTaskFailed(const QString& taskId, const QString& datasetName, 
                                              const QString& errorMessage)
{
    m_failedTasks++;
    updateTaskRow(taskId, 0, "✖ Failed", errorMessage);
    updateOverallProgress();
    
    appendLog("ERROR", QString("Failed: %1 - %2").arg(datasetName).arg(errorMessage));
    
    m_statusLabel->setText(tr("Completed: %1/%2 | Failed: %3")
                          .arg(m_completedTasks).arg(m_totalTasks).arg(m_failedTasks));
    
    m_retryFailedButton->setEnabled(true);
}

void DatasetFetchProgressDialog::onAllTasksCompleted(int successCount, int failCount)
{
    m_allCompleted = true;
    
    m_overallProgress->setValue(m_totalTasks);
    
    QString message;
    if (failCount == 0) {
        message = tr("✓ All tasks completed successfully! (%1/%1)").arg(successCount);
        m_statusLabel->setStyleSheet("QLabel { color: green; font-weight: bold; }");
    } else {
        message = tr("⚠ Completed with errors: %1 succeeded, %2 failed").arg(successCount).arg(failCount);
        m_statusLabel->setStyleSheet("QLabel { color: orange; font-weight: bold; }");
    }
    
    m_statusLabel->setText(message);
    appendLog("INFO", message);
    
    // Update button states
    m_pauseButton->setEnabled(false);
    m_resumeButton->setEnabled(false);
    m_cancelButton->setEnabled(false);
    m_closeButton->setEnabled(true);
    
    if (failCount > 0) {
        m_retryFailedButton->setEnabled(true);
    }
    
    // Show completion message
    QMessageBox::information(this, tr("Fetch Complete"), message);
}

void DatasetFetchProgressDialog::onPipelinePaused()
{
    m_statusLabel->setText(tr("⏸ Paused - %1/%2 completed").arg(m_completedTasks).arg(m_totalTasks));
    m_pauseButton->setEnabled(false);
    m_resumeButton->setEnabled(true);
    appendLog("INFO", "Pipeline paused");
}

void DatasetFetchProgressDialog::onPipelineResumed()
{
    m_statusLabel->setText(tr("▶ Resumed - %1/%2 completed").arg(m_completedTasks).arg(m_totalTasks));
    m_pauseButton->setEnabled(true);
    m_resumeButton->setEnabled(false);
    appendLog("INFO", "Pipeline resumed");
}

void DatasetFetchProgressDialog::onPipelineCancelled()
{
    m_statusLabel->setText(tr("✖ Cancelled - %1/%2 completed").arg(m_completedTasks).arg(m_totalTasks));
    m_statusLabel->setStyleSheet("QLabel { color: red; font-weight: bold; }");
    
    m_pauseButton->setEnabled(false);
    m_resumeButton->setEnabled(false);
    m_cancelButton->setEnabled(false);
    m_closeButton->setEnabled(true);
    
    appendLog("WARNING", "Pipeline cancelled by user");
}

void DatasetFetchProgressDialog::onLogMessage(const QString& level, const QString& message)
{
    appendLog(level, message);
}

void DatasetFetchProgressDialog::onPauseClicked()
{
    if (m_pipeline) {
        m_pipeline->pause();
    }
}

void DatasetFetchProgressDialog::onResumeClicked()
{
    if (m_pipeline) {
        m_pipeline->resume();
    }
}

void DatasetFetchProgressDialog::onCancelClicked()
{
    QMessageBox::StandardButton reply = QMessageBox::question(
        this, 
        tr("Cancel Fetch"),
        tr("Are you sure you want to cancel all remaining tasks?\n\nCurrently running tasks will be terminated."),
        QMessageBox::Yes | QMessageBox::No,
        QMessageBox::No
    );
    
    if (reply == QMessageBox::Yes && m_pipeline) {
        m_pipeline->cancel();
    }
}

void DatasetFetchProgressDialog::onRetryFailedClicked()
{
    if (!m_pipeline) {
        return;
    }
    
    // Get all tasks and retry failed ones
    QVector<DatasetFetchPipeline::FetchTask> tasks = m_pipeline->getAllTasks();
    int retryCount = 0;
    
    for (const auto& task : tasks) {
        if (task.status == DatasetFetchPipeline::TaskStatus::Failed) {
            m_pipeline->retryTask(task.id);
            retryCount++;
        }
    }
    
    if (retryCount > 0) {
        appendLog("INFO", QString("Retrying %1 failed tasks").arg(retryCount));
        m_retryFailedButton->setEnabled(false);
    } else {
        QMessageBox::information(this, tr("No Failed Tasks"), tr("There are no failed tasks to retry."));
    }
}

void DatasetFetchProgressDialog::onExportLogClicked()
{
    QString defaultPath = QDir::homePath() + "/dataset_fetch_log_" + 
                         QDateTime::currentDateTime().toString("yyyyMMdd_HHmmss") + ".txt";
    
    QString filePath = QFileDialog::getSaveFileName(
        this,
        tr("Export Log"),
        defaultPath,
        tr("Text Files (*.txt);;All Files (*)")
    );
    
    if (filePath.isEmpty()) {
        return;
    }
    
    QFile file(filePath);
    if (!file.open(QIODevice::WriteOnly | QIODevice::Text)) {
        QMessageBox::warning(this, tr("Export Failed"), 
                           tr("Could not write to file: %1").arg(filePath));
        return;
    }
    
    QTextStream out(&file);
    out << m_logOutput->toPlainText();
    file.close();
    
    QMessageBox::information(this, tr("Log Exported"), 
                           tr("Log saved to:\n%1").arg(filePath));
}

void DatasetFetchProgressDialog::updateOverallProgress()
{
    if (m_totalTasks == 0) {
        return;
    }
    
    // Calculate weighted progress based on individual task progress
    int totalProgress = 0;
    QVector<DatasetFetchPipeline::FetchTask> tasks = m_pipeline->getAllTasks();
    
    for (const auto& task : tasks) {
        totalProgress += task.progress;
    }
    
    int overallPercent = totalProgress / m_totalTasks;
    m_overallProgress->setValue(overallPercent * m_totalTasks / 100);
}

void DatasetFetchProgressDialog::addTaskRow(const QString& taskId, const QString& datasetName)
{
    int row = m_taskTable->rowCount();
    m_taskTable->insertRow(row);
    
    m_taskTable->setItem(row, 0, new QTableWidgetItem(datasetName));
    m_taskTable->setItem(row, 1, new QTableWidgetItem("Queued"));
    
    QProgressBar* progressBar = new QProgressBar();
    progressBar->setRange(0, 100);
    progressBar->setValue(0);
    progressBar->setTextVisible(true);
    m_taskTable->setCellWidget(row, 2, progressBar);
    
    m_taskTable->setItem(row, 3, new QTableWidgetItem("-"));
    m_taskTable->setItem(row, 4, new QTableWidgetItem("Waiting..."));
    
    m_taskRows[taskId] = row;
}

void DatasetFetchProgressDialog::updateTaskRow(const QString& taskId, int progress, 
                                               const QString& status, const QString& message)
{
    int row = getTaskRow(taskId);
    if (row == -1) {
        return;
    }
    
    // Update status
    QTableWidgetItem* statusItem = m_taskTable->item(row, 1);
    if (statusItem) {
        statusItem->setText(status);
        
        // Color code status
        if (status.contains("Complete")) {
            statusItem->setBackground(QBrush(QColor(200, 255, 200)));
        } else if (status.contains("Failed")) {
            statusItem->setBackground(QBrush(QColor(255, 200, 200)));
        } else if (status.contains("Running")) {
            statusItem->setBackground(QBrush(QColor(200, 220, 255)));
        }
    }
    
    // Update progress bar
    QProgressBar* progressBar = qobject_cast<QProgressBar*>(m_taskTable->cellWidget(row, 2));
    if (progressBar) {
        progressBar->setValue(progress);
    }
    
    // Update message
    if (!message.isEmpty()) {
        QTableWidgetItem* messageItem = m_taskTable->item(row, 4);
        if (messageItem) {
            messageItem->setText(message);
        }
        
        // Update size column if message looks like a file size
        if (message.contains("MB") || message.contains("KB") || message.contains("GB")) {
            QTableWidgetItem* sizeItem = m_taskTable->item(row, 3);
            if (sizeItem) {
                sizeItem->setText(message);
            }
        }
    }
}

int DatasetFetchProgressDialog::getTaskRow(const QString& taskId) const
{
    if (m_taskRows.contains(taskId)) {
        return m_taskRows[taskId];
    }
    return -1;
}

QString DatasetFetchProgressDialog::formatFileSize(qint64 bytes) const
{
    if (bytes == 0) {
        return "-";
    }
    
    const double KB = 1024.0;
    const double MB = KB * 1024.0;
    const double GB = MB * 1024.0;
    
    if (bytes >= GB) {
        return QString::number(bytes / GB, 'f', 2) + " GB";
    } else if (bytes >= MB) {
        return QString::number(bytes / MB, 'f', 2) + " MB";
    } else if (bytes >= KB) {
        return QString::number(bytes / KB, 'f', 1) + " KB";
    } else {
        return QString::number(bytes) + " B";
    }
}

void DatasetFetchProgressDialog::appendLog(const QString& level, const QString& message)
{
    QString timestamp = QDateTime::currentDateTime().toString("[HH:mm:ss]");
    QString coloredLevel = level;
    
    // Color code by level
    QString color;
    if (level == "ERROR") {
        color = "red";
    } else if (level == "WARNING") {
        color = "orange";
    } else if (level == "SUCCESS") {
        color = "green";
    } else {
        color = "black";
    }
    
    QString html = QString("<span style='color: gray;'>%1</span> "
                          "<span style='color: %2; font-weight: bold;'>[%3]</span> "
                          "<span>%4</span>")
                          .arg(timestamp).arg(color).arg(level).arg(message);
    
    m_logOutput->append(html);
    
    // Auto-scroll to bottom
    m_logOutput->verticalScrollBar()->setValue(m_logOutput->verticalScrollBar()->maximum());
}

void DatasetFetchProgressDialog::closeEvent(QCloseEvent* event)
{
    if (m_pipeline && m_pipeline->isRunning() && !m_allCompleted) {
        QMessageBox::StandardButton reply = QMessageBox::question(
            this,
            tr("Close Progress Dialog"),
            tr("Fetching is still in progress. Close this window?\n\n"
               "Fetching will continue in the background."),
            QMessageBox::Yes | QMessageBox::No,
            QMessageBox::No
        );
        
        if (reply == QMessageBox::No) {
            event->ignore();
            return;
        }
    }
    
    event->accept();
}

} // namespace gui
} // namespace agrs

