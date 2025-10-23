#ifndef AGRS_GUI_TERMINALWIDGET_H
#define AGRS_GUI_TERMINALWIDGET_H

#include <QWidget>
#include <QTextEdit>
#include <QVBoxLayout>
#include <QLabel>

namespace agrs {
namespace gui {

/**
 * @brief Read-only output terminal (like Cursor AI terminal)
 * 
 * Displays streaming output from:
 * - Cursor CLI (AI agent) operations
 * - Background command execution
 * - System processes
 * 
 * Maintains working directory context (typically /opt/agrs/Projects/<project_name>)
 * Provides audit trail of all operations
 */
class TerminalWidget : public QWidget {
    Q_OBJECT

public:
    explicit TerminalWidget(QWidget* parent = nullptr);
    ~TerminalWidget() override = default;

    // Append output to terminal (streaming support)
    void appendOutput(const QString& text);
    
    // Set the working directory context
    void setWorkingDirectory(const QString& path);
    
    // Get current working directory
    QString workingDirectory() const { return m_workingDirectory; }
    
    // Clear the terminal
    void clear();
    
    // Append with timestamp (for audit trail)
    void appendWithTimestamp(const QString& text);

private:
    QTextEdit* m_textEdit{nullptr};
    QLabel* m_contextLabel{nullptr};
    QString m_workingDirectory;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_TERMINALWIDGET_H
