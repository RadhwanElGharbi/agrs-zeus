#include "agrs_zeus/gui/CursorInterface.h"
#include <QProcessEnvironment>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QDebug>
#include <iostream>

namespace agrs {
namespace gui {

CursorInterface::CursorInterface(QObject* parent)
    : QObject(parent)
{
}

CursorInterface::~CursorInterface() {
}

bool CursorInterface::isCursorAgentAvailable() {
    // First, check if cursor-agent exists in ~/.local/bin
    QString cursorAgentPath = QDir::homePath() + "/.local/bin/cursor-agent";
    QFileInfo cursorAgentFile(cursorAgentPath);
    
    if (!cursorAgentFile.exists()) {
        qWarning() << "[CursorInterface] cursor-agent not found at:" << cursorAgentPath;
        return false;
    }
    
    if (!cursorAgentFile.isExecutable()) {
        qWarning() << "[CursorInterface] cursor-agent is not executable:" << cursorAgentPath;
        return false;
    }
    
    qDebug() << "[CursorInterface] Found cursor-agent at:" << cursorAgentPath;
    
    // Now test if it actually runs
    QProcess checkProc;
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    
    // Ensure ~/.local/bin is in PATH
    QString localBin = QDir::homePath() + "/.local/bin";
    QString currentPath = env.value("PATH");
    if (!currentPath.contains(localBin)) {
        env.insert("PATH", localBin + ":" + currentPath);
    }
    
    checkProc.setProcessEnvironment(env);
    checkProc.start(cursorAgentPath, QStringList() << "--version");
    
    if (!checkProc.waitForStarted(5000)) {
        qWarning() << "[CursorInterface] Failed to start cursor-agent";
        return false;
    }
    
    if (!checkProc.waitForFinished(10000)) {
        qWarning() << "[CursorInterface] cursor-agent --version timed out";
        checkProc.kill();
        return false;
    }
    
    int exitCode = checkProc.exitCode();
    QString output = QString::fromUtf8(checkProc.readAllStandardOutput());
    QString errorOutput = QString::fromUtf8(checkProc.readAllStandardError());
    
    qDebug() << "[CursorInterface] cursor-agent --version exit code:" << exitCode;
    qDebug() << "[CursorInterface] cursor-agent version output:" << output.trimmed();
    
    if (exitCode != 0) {
        qWarning() << "[CursorInterface] cursor-agent --version failed with error:" << errorOutput;
    }
    
    return exitCode == 0;
}

bool CursorInterface::isCursorAgentAuthenticated() {
    QString cursorAgentPath = QDir::homePath() + "/.local/bin/cursor-agent";
    
    QProcess statusProc;
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    
    QString localBin = QDir::homePath() + "/.local/bin";
    QString currentPath = env.value("PATH");
    if (!currentPath.contains(localBin)) {
        env.insert("PATH", localBin + ":" + currentPath);
    }
    
    statusProc.setProcessEnvironment(env);
    statusProc.start(cursorAgentPath, QStringList() << "status");
    
    if (!statusProc.waitForStarted(5000)) {
        qWarning() << "[CursorInterface] Failed to start cursor-agent status check";
        return false;
    }
    
    if (!statusProc.waitForFinished(10000)) {
        qWarning() << "[CursorInterface] cursor-agent status check timed out";
        statusProc.kill();
        return false;
    }
    
    QString output = QString::fromUtf8(statusProc.readAllStandardOutput());
    QString errorOutput = QString::fromUtf8(statusProc.readAllStandardError());
    
    qDebug() << "[CursorInterface] cursor-agent status output:" << output.trimmed();
    
    bool isAuthenticated = !output.contains("Not logged in", Qt::CaseInsensitive) &&
                          !output.contains("not authenticated", Qt::CaseInsensitive);
    
    if (isAuthenticated) {
        qDebug() << "[CursorInterface] cursor-agent is authenticated";
    } else {
        qWarning() << "[CursorInterface] cursor-agent is not authenticated";
        if (!errorOutput.isEmpty()) {
            qWarning() << "[CursorInterface] Error output:" << errorOutput;
        }
    }
    
    return isAuthenticated;
}

QString CursorInterface::executePrompt(const QString& prompt, Model model, int timeoutMs) {
    if (!isCursorAgentAvailable()) {
        m_lastError = "Cursor Agent is not installed or not in PATH";
        m_lastExitCode = -1;
        std::cerr << "[CursorInterface] " << m_lastError.toStdString() << std::endl;
        return QString();
    }
    
    if (!isCursorAgentAuthenticated()) {
        m_lastError = "Cursor Agent is not authenticated. Please run: cursor-agent login";
        m_lastExitCode = -1;
        std::cerr << "[CursorInterface] " << m_lastError.toStdString() << std::endl;
        return QString();
    }
    
    QProcess process;
    if (!setupEnvironment(&process)) {
        m_lastError = "Failed to setup environment for cursor-agent";
        m_lastExitCode = -1;
        return QString();
    }
    
    QStringList args;
    args << "--print";  // Non-interactive mode
    args << "--output-format" << "text";
    args << "--model" << modelToString(model);
    
    if (m_forceMode) {
        args << "--force";  // Allow file operations
    }
    
    args << prompt;
    
    QString cursorAgentPath = QDir::homePath() + "/.local/bin/cursor-agent";
    std::cout << "[CursorInterface] Executing: " << cursorAgentPath.toStdString() << " " << args.join(" ").toStdString() << std::endl;
    
    process.start(cursorAgentPath, args);
    
    if (!process.waitForStarted(5000)) {
        m_lastError = "Failed to start cursor-agent process";
        m_lastExitCode = -1;
        std::cerr << "[CursorInterface] " << m_lastError.toStdString() << std::endl;
        return QString();
    }
    
    if (!process.waitForFinished(timeoutMs)) {
        m_lastError = "cursor-agent timed out after " + QString::number(timeoutMs) + "ms";
        m_lastExitCode = -1;
        process.kill();
        std::cerr << "[CursorInterface] " << m_lastError.toStdString() << std::endl;
        return QString();
    }
    
    m_lastExitCode = process.exitCode();
    
    if (m_lastExitCode != 0) {
        m_lastError = QString::fromUtf8(process.readAllStandardError());
        std::cerr << "[CursorInterface] Error (exit " << m_lastExitCode << "): " 
                  << m_lastError.toStdString() << std::endl;
        return QString();
    }
    
    QString response = QString::fromUtf8(process.readAllStandardOutput());
    std::cout << "[CursorInterface] Response received (" << response.length() << " chars)" << std::endl;
    
    return response.trimmed();
}

QString CursorInterface::executeWithFiles(const QString& prompt,
                                         const QStringList& filePaths,
                                         Model model,
                                         int timeoutMs) {
    // Build prompt with file references using @ notation
    QString fullPrompt = prompt + "\n\n";
    
    for (const QString& filePath : filePaths) {
        QFileInfo info(filePath);
        if (info.exists()) {
            fullPrompt += QString("@%1\n").arg(filePath);
        } else {
            std::cerr << "[CursorInterface] Warning: File not found: " 
                      << filePath.toStdString() << std::endl;
        }
    }
    
    return executePrompt(fullPrompt, model, timeoutMs);
}

QString CursorInterface::analyzeGeospatialFile(const QString& filePath,
                                              const QString& specificQuestions) {
    if (!QFile::exists(filePath)) {
        m_lastError = "File does not exist: " + filePath;
        return QString();
    }
    
    QString prompt = QString(
        "Analyze this geospatial file:\n"
        "@%1\n\n"
        "Provide:\n"
        "1. File type and format\n"
        "2. Geographic location (coordinates, region, country)\n"
        "3. Spatial extent (bounding box, area)\n"
        "4. Coordinate Reference System (CRS/EPSG)\n"
        "5. Key features or attributes\n"
        "6. Terrain characteristics (if applicable)\n"
    ).arg(filePath);
    
    if (!specificQuestions.isEmpty()) {
        prompt += "\nAdditional questions:\n" + specificQuestions + "\n";
    }
    
    return executePrompt(prompt, Model::Sonnet45, 90000);  // 90s timeout for file analysis
}

void CursorInterface::executePromptAsync(const QString& prompt,
                                        Model model,
                                        std::function<void(const QString&)> callback) {
    // Run in a separate thread or use QFuture
    // For now, simple implementation using QProcess signals
    QProcess* process = new QProcess(this);
    
    if (!setupEnvironment(process)) {
        if (callback) {
            callback(QString());
        }
        process->deleteLater();
        return;
    }
    
    QStringList args;
    args << "--print" << "--output-format" << "text";
    args << "--model" << modelToString(model);
    if (m_forceMode) args << "--force";
    args << prompt;
    
    QString cursorAgentPath = QDir::homePath() + "/.local/bin/cursor-agent";
    
    connect(process, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished),
            this, [this, process, callback](int exitCode, QProcess::ExitStatus status) {
        QString response;
        if (exitCode == 0 && status == QProcess::NormalExit) {
            response = QString::fromUtf8(process->readAllStandardOutput()).trimmed();
            emit responseReady(response);
        } else {
            QString error = QString::fromUtf8(process->readAllStandardError());
            emit errorOccurred(error);
        }
        
        if (callback) {
            callback(response);
        }
        
        process->deleteLater();
    });
    
    process->start(cursorAgentPath, args);
}

QString CursorInterface::modelToString(Model model) const {
    switch (model) {
        case Model::Auto: return "auto";
        case Model::Sonnet45: return "sonnet-4.5";
        case Model::Sonnet45Thinking: return "sonnet-4.5-thinking";
        case Model::GPT5: return "gpt-5";
        case Model::GPT5Codex: return "gpt-5-codex";
        case Model::Opus41: return "opus-4.1";
        case Model::Grok: return "grok";
        case Model::Cheetah: return "cheetah";
        default: return "sonnet-4.5";
    }
}

QString CursorInterface::formatToString(OutputFormat format) const {
    switch (format) {
        case OutputFormat::Text: return "text";
        case OutputFormat::JSON: return "json";
        case OutputFormat::StreamJSON: return "stream-json";
        default: return "text";
    }
}

bool CursorInterface::setupEnvironment(QProcess* process) {
    if (!process) return false;
    
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    
    // Add ~/.local/bin to PATH
    QString currentPath = env.value("PATH");
    QString localBin = QDir::homePath() + "/.local/bin";
    
    if (!currentPath.contains(localBin)) {
        env.insert("PATH", localBin + ":" + currentPath);
    }
    
    process->setProcessEnvironment(env);
    return true;
}

}} // namespace agrs::gui



