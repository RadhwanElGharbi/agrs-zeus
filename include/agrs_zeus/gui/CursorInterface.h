#ifndef AGRS_GUI_CURSORINTERFACE_H
#define AGRS_GUI_CURSORINTERFACE_H

#include <QObject>
#include <QString>
#include <QProcess>
#include <QVariantMap>
#include <functional>

namespace agrs {
namespace gui {

/**
 * @brief Interface for Cursor AI Agent integration
 * 
 * Provides a bridge between AGRS ZEUS and Cursor Agent CLI for
 * AI-powered file analysis, code generation, and intelligent assistance.
 */
class CursorInterface : public QObject {
    Q_OBJECT

public:
    enum class Model {
        Auto,
        Sonnet45,          // Claude Sonnet 4.5 (default)
        Sonnet45Thinking,  // Claude Sonnet 4.5 with thinking
        GPT5,              // GPT-5
        GPT5Codex,         // GPT-5 Codex
        Opus41,            // Opus 4.1
        Grok,              // Grok
        Cheetah            // Fast model
    };

    enum class OutputFormat {
        Text,
        JSON,
        StreamJSON
    };

    explicit CursorInterface(QObject* parent = nullptr);
    ~CursorInterface();

    // Check if cursor-agent is available
    static bool isCursorAgentAvailable();
    static bool isCursorAgentAuthenticated();
    
    // Execute a prompt (blocking)
    QString executePrompt(const QString& prompt, 
                         Model model = Model::Sonnet45,
                         int timeoutMs = 60000);
    
    // Execute with file context
    QString executeWithFiles(const QString& prompt,
                            const QStringList& filePaths,
                            Model model = Model::Sonnet45,
                            int timeoutMs = 60000);
    
    // Analyze geospatial file
    QString analyzeGeospatialFile(const QString& filePath,
                                 const QString& specificQuestions = "");
    
    // Execute asynchronously
    void executePromptAsync(const QString& prompt,
                           Model model = Model::Sonnet45,
                           std::function<void(const QString&)> callback = nullptr);
    
    // Configuration
    void setTimeout(int ms) { m_timeoutMs = ms; }
    void setDefaultModel(Model model) { m_defaultModel = model; }
    void setForceMode(bool force) { m_forceMode = force; }
    
    // Error handling
    QString lastError() const { return m_lastError; }
    int lastExitCode() const { return m_lastExitCode; }

signals:
    void responseReady(const QString& response);
    void errorOccurred(const QString& error);

private:
    QString modelToString(Model model) const;
    QString formatToString(OutputFormat format) const;
    bool setupEnvironment(QProcess* process);
    
    int m_timeoutMs{60000};
    Model m_defaultModel{Model::Sonnet45};
    bool m_forceMode{true};
    QString m_lastError;
    int m_lastExitCode{0};
};

}} // namespace agrs::gui

#endif // AGRS_GUI_CURSORINTERFACE_H



