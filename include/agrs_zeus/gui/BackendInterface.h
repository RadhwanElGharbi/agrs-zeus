#ifndef AGRS_GUI_BACKENDINTERFACE_H
#define AGRS_GUI_BACKENDINTERFACE_H

#include <QObject>
#include <QVariantMap>
#include <QString>
#include <QStringList>

namespace agrs {
namespace gui {

/**
 * @brief Interface for calling backend (CLI) tools from the GUI.
 *
 * This class acts as a bridge between the Qt GUI and the existing
 * C++ CLI tools, allowing asynchronous execution and progress reporting.
 */
class BackendInterface : public QObject {
    Q_OBJECT
public:
    explicit BackendInterface(QObject* parent = nullptr);
    ~BackendInterface();

    // Methods to query available tools (for dynamic UI generation)
    QStringList getToolCategories() const;
    QStringList getToolsInCategory(const QString& category) const;
    QString getToolDescription(const QString& toolName) const;

signals:
    void logMessage(const QString& message);
    void operationStarted(const QString& toolName);
    void operationCompleted(const QString& toolName, const QString& message);
    void operationFailed(const QString& toolName, const QString& error);
    void operationProgress(const QString& toolName, int progress);
    void outputGenerated(const QString& outputPath); // Signal when a tool generates an output file

public slots:
    void runTool(const QString& toolName, const QVariantMap& params);

private:
    int executeTool(const QString& toolName, const QVariantMap& params);
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_BACKENDINTERFACE_H


