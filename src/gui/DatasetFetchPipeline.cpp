#include "agrs_zeus/gui/DatasetFetchPipeline.h"
#include <QDir>
#include <QFileInfo>
#include <QDebug>
#include <QThread>
#include <QMutexLocker>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QDateTime>
#include <gdal_priv.h>
#include <ogrsf_frmts.h>
#include <ogr_api.h>
#include <ogr_feature.h>
#include <ogr_geometry.h>

namespace agrs {
namespace gui {

DatasetFetchPipeline::DatasetFetchPipeline(QObject* parent)
    : QObject(parent)
    , m_running(false)
    , m_paused(false)
    , m_cancelled(false)
    , m_maxConcurrent(3)
    , m_maxRetries(2)
    , m_completedCount(0)
    , m_failedCount(0)
{
    // Initialize GDAL
    GDALAllRegister();
}

DatasetFetchPipeline::~DatasetFetchPipeline()
{
    cancel();
}

void DatasetFetchPipeline::addTask(const FetchTask& task)
{
    QMutexLocker locker(&m_tasksMutex);
    
    // Assign unique ID if not set
    FetchTask newTask = task;
    if (newTask.id.isEmpty()) {
        newTask.id = QString("task_%1_%2").arg(task.category).arg(QDateTime::currentMSecsSinceEpoch());
    }
    
    newTask.status = "pending";
    newTask.progressPercent = 0;
    
    m_tasks.append(newTask);
    
    emit logMessage("INFO", QString("Added task: %1 (%2)").arg(newTask.datasetName).arg(newTask.category));
}

void DatasetFetchPipeline::addTasks(const QVector<FetchTask>& tasks)
{
    for (const auto& task : tasks) {
        addTask(task);
    }
}

bool DatasetFetchPipeline::removeTask(const QString& taskId)
{
    QMutexLocker locker(&m_tasksMutex);
    
    for (int i = 0; i < m_tasks.size(); ++i) {
        if (m_tasks[i].id == taskId) {
            if (m_tasks[i].status == "running") {
                emit logMessage("WARNING", "Cannot remove running task: " + taskId);
                return false;
            }
            m_tasks.removeAt(i);
            return true;
        }
    }
    
    return false;
}

void DatasetFetchPipeline::clearTasks()
{
    QMutexLocker locker(&m_tasksMutex);
    
    // Only clear non-running tasks
    QVector<FetchTask> kept;
    for (const auto& task : m_tasks) {
        if (task.status == "running") {
            kept.append(task);
        }
    }
    
    m_tasks = kept;
    emit logMessage("INFO", "Cleared all pending tasks");
}

void DatasetFetchPipeline::start()
{
    if (m_running) {
        emit logMessage("WARNING", "Pipeline already running");
        return;
    }
    
    m_running = true;
    m_cancelled = false;
    m_paused = false;
    m_completedCount = 0;
    m_failedCount = 0;
    
    emit logMessage("INFO", QString("Starting pipeline with %1 tasks").arg(m_tasks.size()));
    
    // Sort by priority (highest first)
    std::sort(m_tasks.begin(), m_tasks.end(), [](const FetchTask& a, const FetchTask& b) {
        return a.priority > b.priority;
    });
    
    // Start executing tasks
    executeNextTask();
}

void DatasetFetchPipeline::pause()
{
    if (!m_running || m_paused) {
        return;
    }
    
    m_paused = true;
    emit paused();
    emit logMessage("INFO", "Pipeline paused");
}

void DatasetFetchPipeline::resume()
{
    if (!m_paused) {
        return;
    }
    
    m_paused = false;
    emit resumed();
    emit logMessage("INFO", "Pipeline resumed");
    
    // Continue execution
    executeNextTask();
}

void DatasetFetchPipeline::cancel()
{
    if (!m_running) {
        return;
    }
    
    m_cancelled = true;
    m_running = false;
    
    // Kill and delete all running processes
    for (auto it = m_runningProcesses.begin(); it != m_runningProcesses.end(); ++it) {
        QProcess* proc = it.value();
        if (proc) {
            if (proc->state() != QProcess::NotRunning) {
                proc->kill();
                proc->waitForFinished(1000);
            }
            delete proc;
        }
    }
    
    m_runningProcesses.clear();
    m_processToTaskId.clear();
    
    emit cancelled();
    emit logMessage("INFO", "Pipeline cancelled");
}

bool DatasetFetchPipeline::isRunning() const
{
    return m_running;
}

bool DatasetFetchPipeline::isPaused() const
{
    return m_paused;
}

QVector<FetchTask> DatasetFetchPipeline::getCurrentTasks() const
{
    QMutexLocker locker(&m_tasksMutex);
    
    QVector<FetchTask> current;
    for (const auto& task : m_tasks) {
        if (task.status == "running") {
            current.append(task);
        }
    }
    
    return current;
}

QVector<FetchTask> DatasetFetchPipeline::getAllTasks() const
{
    QMutexLocker locker(&m_tasksMutex);
    return m_tasks;
}

FetchTask DatasetFetchPipeline::getTask(const QString& taskId) const
{
    QMutexLocker locker(&m_tasksMutex);
    
    for (const auto& task : m_tasks) {
        if (task.id == taskId) {
            return task;
        }
    }
    
    return FetchTask();
}

DatasetFetchPipeline::Stats DatasetFetchPipeline::getStats() const
{
    QMutexLocker locker(&m_tasksMutex);
    
    Stats stats;
    stats.total = m_tasks.size();
    stats.completed = 0;
    stats.failed = 0;
    stats.pending = 0;
    stats.running = 0;
    
    for (const auto& task : m_tasks) {
        if (task.status == "completed") {
            stats.completed++;
        } else if (task.status == "failed") {
            stats.failed++;
        } else if (task.status == "running") {
            stats.running++;
        } else {
            stats.pending++;
        }
    }
    
    return stats;
}

void DatasetFetchPipeline::setMaxConcurrent(int max)
{
    m_maxConcurrent = std::clamp(max, 1, 5);
}

void DatasetFetchPipeline::setMaxRetries(int retries)
{
    m_maxRetries = std::clamp(retries, 0, 3);
}

void DatasetFetchPipeline::executeNextTask()
{
    if (m_cancelled || m_paused) {
        return;
    }
    
    QMutexLocker locker(&m_tasksMutex);
    
    // Check if we've reached max concurrent
    int runningCount = 0;
    for (const auto& task : m_tasks) {
        if (task.status == "running") {
            runningCount++;
        }
    }
    
    if (runningCount >= m_maxConcurrent) {
        return;  // Wait for a slot to open
    }
    
    // Find next pending task
    for (int i = 0; i < m_tasks.size(); ++i) {
        if (m_tasks[i].status == "pending") {
            // Check if dataset already exists
            QString existingPath = checkExisting(m_tasks[i]);
            if (!existingPath.isEmpty()) {
                emit logMessage("INFO", QString("Dataset already exists: %1").arg(m_tasks[i].datasetName));
                markCompleted(m_tasks[i], existingPath);
                
                // Try to start another task
                locker.unlock();
                executeNextTask();
                return;
            }
            
            // Execute this task
            m_tasks[i].status = "running";
            FetchTask taskCopy = m_tasks[i];
            
            locker.unlock();
            executeTask(taskCopy);
            return;
        }
    }
    
    // No more pending tasks - check if all done
    bool allDone = true;
    for (const auto& task : m_tasks) {
        if (task.status == "pending" || task.status == "running") {
            allDone = false;
            break;
        }
    }
    
    if (allDone && m_running) {
        m_running = false;
        
        Stats stats = getStats();
        emit allTasksCompleted(stats.completed, stats.failed);
        emit logMessage("INFO", QString("Pipeline completed: %1 succeeded, %2 failed")
                       .arg(stats.completed).arg(stats.failed));
    }
}

void DatasetFetchPipeline::executeTask(FetchTask& task)
{
    emit taskStarted(task.id, task.datasetName);
    emit logMessage("INFO", QString("Starting fetch: %1").arg(task.datasetName));
    
    // Build command
    QString command = buildFetchCommand(task);
    if (command.isEmpty()) {
        markFailed(task, "Unknown fetch tool: " + task.fetchTool);
        executeNextTask();
        return;
    }
    
    // Create process
    QProcess* process = new QProcess(this);
    
    // Connect signals
    connect(process, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this, &DatasetFetchPipeline::onProcessFinished);
    connect(process, &QProcess::readyReadStandardOutput,
            this, &DatasetFetchPipeline::onProcessReadyRead);
    connect(process, &QProcess::errorOccurred,
            this, &DatasetFetchPipeline::onProcessErrorOccurred);
    
    // Track process
    m_processToTaskId[process] = task.id;
    
    // Start process
    emit taskProgress(task.id, 10, "Initializing fetch...");
    
    QStringList args = command.split(' ', Qt::SkipEmptyParts);
    QString program = args.takeFirst();
    
    process->start(program, args);
    
    if (!process->waitForStarted(5000)) {
        markFailed(task, "Failed to start process: " + command);
        m_processToTaskId.remove(process);
        process->deleteLater();
        executeNextTask();
        return;
    }
    
    // Store process (ownership now held by map)
    m_runningProcesses[task.id] = process;
}

QString DatasetFetchPipeline::buildFetchCommand(const FetchTask& task) const
{
    // Map fetch tool names to ZEUS CLI commands
    static const QMap<QString, QString> toolMap = {
        {"dem_fetch", "zeus dem-fetch"},
        {"dem_fetch (srtm)", "zeus dem-fetch --source srtm"},
        {"osm_railways_fetch", "zeus infrastructure-fetch --type railways"},
        {"osm_roads_fetch", "zeus infrastructure-fetch --type roads"},
        {"osm_power_fetch", "zeus infrastructure-fetch --type powerlines"},
        {"osm_power_lines_fetch", "zeus infrastructure-fetch --type powerlines"},
        {"osm_pipelines_fetch", "zeus infrastructure-fetch --type pipelines"},
        {"esa_worldcover_fetch", "zeus landcover-fetch --source esa_worldcover"},
        {"hydro_rivers_fetch", "zeus hydrology-fetch --type rivers"},
        {"hydro_waterbodies_fetch", "zeus hydrology-fetch --type waterbodies"},
        {"wdpa_fetch", "zeus protected-areas-fetch --source wdpa"},
        {"ghsl_population_fetch", "zeus population-fetch --source ghsl"}
    };
    
    QString baseCmd = toolMap.value(task.fetchTool.toLower(), "");
    if (baseCmd.isEmpty()) {
        return "";
    }
    
    // Add common arguments
    QString cmd = baseCmd;
    cmd += QString(" --aoi %1").arg(task.aoiPath);
    cmd += QString(" --output-dir %1").arg(task.projectPath);
    
    if (!task.targetCRS.isEmpty()) {
        cmd += QString(" --target-crs %1").arg(task.targetCRS);
    }
    
    if (task.autoProcess) {
        cmd += " --auto-process";
    }
    
    return cmd;
}

void DatasetFetchPipeline::onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus)
{
    QProcess* process = qobject_cast<QProcess*>(sender());
    if (!process) {
        return;
    }
    
    QString taskId = m_processToTaskId.value(process, "");
    if (taskId.isEmpty()) {
        return;
    }
    
    QMutexLocker locker(&m_tasksMutex);
    
    // Find task
    FetchTask* task = nullptr;
    for (int i = 0; i < m_tasks.size(); ++i) {
        if (m_tasks[i].id == taskId) {
            task = &m_tasks[i];
            break;
        }
    }
    
    if (!task) {
        return;
    }
    
    // Check result
    if (exitCode == 0 && exitStatus == QProcess::NormalExit) {
        // Success - validate output
        QString outputPath = getOutputDirectory(task->category, *task);
        
        locker.unlock();
        
        if (validateFetch(outputPath, *task)) {
            // Process if requested
            QString finalPath = outputPath;
            if (task->autoProcess) {
                emit taskProgress(task->id, 80, "Processing dataset...");
                finalPath = processDataset(outputPath, *task);
            }
            
            if (!finalPath.isEmpty()) {
                // Generate metadata
                emit taskProgress(task->id, 95, "Generating metadata...");
                generateMetadata(finalPath, *task, task->autoProcess);
                
                markCompleted(*task, finalPath);
            } else {
                markFailed(*task, "Processing failed");
            }
        } else {
            markFailed(*task, "Validation failed");
        }
    } else {
        // Failure
        QString error = QString::fromUtf8(process->readAllStandardError());
        markFailed(*task, error.isEmpty() ? "Process failed" : error);
    }
    
    // Cleanup
    m_runningProcesses.remove(taskId);
    m_processToTaskId.remove(process);
    process->deleteLater();  // Delete process safely
    
    // Start next task
    QMetaObject::invokeMethod(this, "executeNextTask", Qt::QueuedConnection);
}

void DatasetFetchPipeline::onProcessReadyRead()
{
    QProcess* process = qobject_cast<QProcess*>(sender());
    if (!process) {
        return;
    }
    
    QString taskId = m_processToTaskId.value(process, "");
    if (taskId.isEmpty()) {
        return;
    }
    
    // Read output and parse progress
    QString output = QString::fromUtf8(process->readAllStandardOutput());
    QStringList lines = output.split('\n', Qt::SkipEmptyParts);
    
    for (const QString& line : lines) {
        emit logMessage("INFO", QString("[%1] %2").arg(taskId).arg(line));
        
        // Parse progress
        int progress = parseProgress(line);
        if (progress >= 0) {
            emit taskProgress(taskId, progress, line);
        }
    }
}

void DatasetFetchPipeline::onProcessErrorOccurred(QProcess::ProcessError error)
{
    QProcess* process = qobject_cast<QProcess*>(sender());
    if (!process) {
        return;
    }
    
    QString taskId = m_processToTaskId.value(process, "");
    if (taskId.isEmpty()) {
        return;
    }
    
    QString errorMsg;
    switch (error) {
        case QProcess::FailedToStart:
            errorMsg = "Process failed to start";
            break;
        case QProcess::Crashed:
            errorMsg = "Process crashed";
            break;
        case QProcess::Timedout:
            errorMsg = "Process timed out";
            break;
        default:
            errorMsg = "Process error occurred";
            break;
    }
    
    emit logMessage("ERROR", QString("[%1] %2").arg(taskId).arg(errorMsg));
}

int DatasetFetchPipeline::parseProgress(const QString& output) const
{
    // Look for progress indicators in output
    // Examples: "Progress: 45%", "Downloaded 50/100", "[====>    ] 60%"
    
    static QRegularExpression percentRegex("(\\d+)%");
    QRegularExpressionMatch match = percentRegex.match(output);
    
    if (match.hasMatch()) {
        return match.captured(1).toInt();
    }
    
    return -1;  // No progress found
}

bool DatasetFetchPipeline::validateFetch(const QString& filePath, const FetchTask& task)
{
    emit taskProgress(task.id, 70, "Validating fetched data...");
    
    QFileInfo fileInfo(filePath);
    if (!fileInfo.exists()) {
        emit logMessage("ERROR", "Output file not found: " + filePath);
        return false;
    }
    
    // Check if GDAL can open it
    GDALDataset* ds = static_cast<GDALDataset*>(
        GDALOpenEx(filePath.toUtf8().constData(), GDAL_OF_READONLY, nullptr, nullptr, nullptr));
    
    if (!ds) {
        emit logMessage("ERROR", "GDAL cannot open file: " + filePath);
        return false;
    }
    
    // Basic validation
    bool valid = true;
    
    // Check if it has data
    if (ds->GetRasterCount() == 0 && ds->GetLayerCount() == 0) {
        emit logMessage("ERROR", "File contains no data");
        valid = false;
    }
    
    // TODO: Check coverage overlap with AOI
    
    GDALClose(ds);
    
    return valid;
}

QString DatasetFetchPipeline::processDataset(const QString& rawPath, const FetchTask& task)
{
    emit logMessage("INFO", QString("Processing: %1").arg(rawPath));
    
    // Determine output path
    QFileInfo rawInfo(rawPath);
    QString processedDir = QDir(task.projectPath).filePath("data/processed");
    QDir().mkpath(processedDir);
    
    QString baseName = rawInfo.completeBaseName();
    QString ext = rawInfo.suffix();
    
    // Extract EPSG code from targetCRS (e.g., "EPSG:32633" -> "32633")
    QString epsgCode = task.targetCRS;
    epsgCode.remove("EPSG:", Qt::CaseInsensitive);
    
    QString processedPath = QDir(processedDir).filePath(
        QString("%1_epsg%2_processed.%3").arg(baseName).arg(epsgCode).arg(ext));
    
    // Build gdalwarp command for reprojection and clipping
    QString cmd = QString("gdalwarp -t_srs %1 -cutline %2 -crop_to_cutline -of GTiff %3 %4")
        .arg(task.targetCRS)
        .arg(task.aoiPath)
        .arg(rawPath)
        .arg(processedPath);
    
    emit taskProgress(task.id, 85, "Reprojecting and clipping...");
    
    int result = system(cmd.toUtf8().constData());
    
    if (result == 0 && QFile::exists(processedPath)) {
        emit logMessage("INFO", QString("Processed dataset saved: %1").arg(processedPath));
        return processedPath;
    }
    
    emit logMessage("ERROR", "Processing failed");
    return "";
}

bool DatasetFetchPipeline::generateMetadata(const QString& filePath, const FetchTask& task, bool isProcessed)
{
    emit logMessage("INFO", QString("Generating metadata for: %1").arg(filePath));
    
    QJsonObject metadata;
    metadata["dataset_name"] = task.datasetName;
    metadata["category"] = task.category;
    metadata["fetch_tool"] = task.fetchTool;
    metadata["fetch_date"] = QDateTime::currentDateTime().toString(Qt::ISODate);
    metadata["is_processed"] = isProcessed;
    metadata["target_crs"] = task.targetCRS;
    metadata["source_file"] = filePath;
    
    // Add GDAL metadata
    GDALDataset* ds = static_cast<GDALDataset*>(
        GDALOpenEx(filePath.toUtf8().constData(), GDAL_OF_READONLY, nullptr, nullptr, nullptr));
    
    if (ds) {
        // Get CRS
        const char* projWKT = ds->GetProjectionRef();
        if (projWKT && strlen(projWKT) > 0) {
            metadata["crs_wkt"] = QString::fromUtf8(projWKT);
        }
        
        // Get extent
        double geoTransform[6];
        if (ds->GetGeoTransform(geoTransform) == CE_None) {
            int xSize = ds->GetRasterXSize();
            int ySize = ds->GetRasterYSize();
            
            QJsonArray extent;
            extent.append(geoTransform[0]);  // minX
            extent.append(geoTransform[3] + ySize * geoTransform[5]);  // minY
            extent.append(geoTransform[0] + xSize * geoTransform[1]);  // maxX
            extent.append(geoTransform[3]);  // maxY
            
            metadata["extent"] = extent;
        }
        
        // Raster-specific
        if (ds->GetRasterCount() > 0) {
            metadata["raster_count"] = ds->GetRasterCount();
            metadata["width"] = ds->GetRasterXSize();
            metadata["height"] = ds->GetRasterYSize();
            
            GDALRasterBand* band = ds->GetRasterBand(1);
            if (band) {
                int hasNoData;
                double noDataValue = band->GetNoDataValue(&hasNoData);
                if (hasNoData) {
                    metadata["nodata_value"] = noDataValue;
                }
            }
        }
        
        // Vector-specific
        if (ds->GetLayerCount() > 0) {
            metadata["layer_count"] = ds->GetLayerCount();
            
            OGRLayer* layer = ds->GetLayer(0);
            if (layer) {
                metadata["feature_count"] = static_cast<int>(layer->GetFeatureCount());
                
                OGRFeatureDefn* defn = layer->GetLayerDefn();
                if (defn) {
                    metadata["geometry_type"] = QString::fromUtf8(
                        OGRGeometryTypeToName(defn->GetGeomType()));
                }
            }
        }
        
        GDALClose(ds);
    }
    
    // Write JSON file
    QString jsonPath = filePath + ".json";
    QFile jsonFile(jsonPath);
    
    if (jsonFile.open(QIODevice::WriteOnly)) {
        QJsonDocument doc(metadata);
        jsonFile.write(doc.toJson(QJsonDocument::Indented));
        jsonFile.close();
        
        emit logMessage("INFO", QString("Metadata saved: %1").arg(jsonPath));
        return true;
    }
    
    emit logMessage("ERROR", "Failed to write metadata file");
    return false;
}

QString DatasetFetchPipeline::getOutputDirectory(const QString& category, const FetchTask& task) const
{
    QString baseDir = QDir(task.projectPath).filePath("data");
    
    // Determine subdirectory based on category
    QString subdir;
    if (category == "dem" || category == "landcover" || category == "imagery") {
        subdir = "rasters";
    } else {
        subdir = "vectors";
    }
    
    return QDir(baseDir).filePath(subdir);
}

QString DatasetFetchPipeline::checkExisting(const FetchTask& task) const
{
    QString outputDir = getOutputDirectory(task.category, task);
    
    if (!QDir(outputDir).exists()) {
        return "";
    }
    
    // Check for processed files first
    QString epsgCode = task.targetCRS;
    epsgCode.remove("EPSG:", Qt::CaseInsensitive);
    
    QStringList patterns = {
        QString("*%1*epsg%2*processed*").arg(task.category).arg(epsgCode),
        QString("*%1*").arg(task.datasetName.toLower().replace(" ", "_"))
    };
    
    QDir dir(outputDir);
    for (const QString& pattern : patterns) {
        QStringList files = dir.entryList(QStringList() << pattern, QDir::Files);
        if (!files.isEmpty()) {
            return dir.filePath(files.first());
        }
    }
    
    return "";
}

void DatasetFetchPipeline::markCompleted(FetchTask& task, const QString& outputPath)
{
    QMutexLocker locker(&m_tasksMutex);
    
    task.status = "completed";
    task.progressPercent = 100;
    task.outputPath = outputPath;
    
    m_completedCount++;
    
    locker.unlock();
    
    emit taskCompleted(task.id, outputPath);
    emit taskProgress(task.id, 100, "Completed");
    emit logMessage("INFO", QString("✅ Completed: %1").arg(task.datasetName));
}

void DatasetFetchPipeline::markFailed(FetchTask& task, const QString& errorMessage)
{
    QMutexLocker locker(&m_tasksMutex);
    
    task.status = "failed";
    task.errorMessage = errorMessage;
    
    m_failedCount++;
    
    locker.unlock();
    
    emit taskFailed(task.id, errorMessage);
    emit logMessage("ERROR", QString("❌ Failed: %1 - %2").arg(task.datasetName).arg(errorMessage));
}

void DatasetFetchPipeline::retryTask(const QString& taskId)
{
    QMutexLocker locker(&m_tasksMutex);
    
    for (int i = 0; i < m_tasks.size(); ++i) {
        if (m_tasks[i].id == taskId && m_tasks[i].status == "failed") {
            m_tasks[i].status = "pending";
            m_tasks[i].progressPercent = 0;
            m_tasks[i].errorMessage.clear();
            
            emit logMessage("INFO", QString("Retrying task: %1").arg(m_tasks[i].datasetName));
            
            locker.unlock();
            executeNextTask();
            return;
        }
    }
}

} // namespace gui
} // namespace agrs
