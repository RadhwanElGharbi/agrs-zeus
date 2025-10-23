#include "agrs_zeus/gui/TerminalWidget.h"
#include <QScrollBar>
#include <QTextCursor>
#include <QDateTime>
#include <QFont>

namespace agrs {
namespace gui {

TerminalWidget::TerminalWidget(QWidget* parent)
    : QWidget(parent)
    , m_workingDirectory("/opt/agrs")
{
    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);
    
    // Context label showing working directory
    m_contextLabel = new QLabel(this);
    m_contextLabel->setStyleSheet(
        "QLabel {"
        "  background-color: #2d2d2d;"
        "  color: #9cdcfe;"
        "  font-family: 'Ubuntu Mono', 'Courier New', 'Consolas', monospace;"
        "  font-size: 9pt;"
        "  padding: 4px 8px;"
        "  border-bottom: 1px solid #404040;"
        "}"
    );
    m_contextLabel->setText(QString("Working Directory: %1").arg(m_workingDirectory));
    layout->addWidget(m_contextLabel);
    
    // Terminal output area (read-only)
    m_textEdit = new QTextEdit(this);
    m_textEdit->setReadOnly(true);
    m_textEdit->setAcceptRichText(false);
    m_textEdit->setStyleSheet(
        "QTextEdit {"
        "  background-color: #1e1e1e;"
        "  color: #d4d4d4;"
        "  font-family: 'Ubuntu Mono', 'Courier New', 'Consolas', monospace;"
        "  font-size: 10pt;"
        "  border: none;"
        "  padding: 8px;"
        "  selection-background-color: #264f78;"
        "}"
    );
    
    // Line wrapping for long output
    m_textEdit->setLineWrapMode(QTextEdit::WidgetWidth);
    m_textEdit->setWordWrapMode(QTextOption::WrapAtWordBoundaryOrAnywhere);
    
    layout->addWidget(m_textEdit);
    
    // Initial welcome message
    m_textEdit->setPlainText(
        "╔════════════════════════════════════════════════════════════════╗\n"
        "║                    AGRS ZEUS Terminal                          ║\n"
        "║              Read-Only Output Terminal (v1.0)                  ║\n"
        "╚════════════════════════════════════════════════════════════════╝\n\n"
        "This terminal displays streaming output from:\n"
        "  • Cursor CLI (AI Agent) operations\n"
        "  • Background command execution\n"
        "  • Geospatial data processing\n"
        "  • System processes\n\n"
        "Working Directory: /opt/agrs\n"
        "Ready for operations.\n\n"
    );
}

void TerminalWidget::appendOutput(const QString& text) {
    QTextCursor cursor = m_textEdit->textCursor();
    cursor.movePosition(QTextCursor::End);
    cursor.insertText(text);
    if (!text.endsWith('\n')) {
        cursor.insertText("\n");
    }
    m_textEdit->setTextCursor(cursor);
    m_textEdit->ensureCursorVisible();
}

void TerminalWidget::appendWithTimestamp(const QString& text) {
    QString timestamp = QDateTime::currentDateTime().toString("[HH:mm:ss] ");
    appendOutput(timestamp + text);
}

void TerminalWidget::setWorkingDirectory(const QString& path) {
    m_workingDirectory = path;
    m_contextLabel->setText(QString("Working Directory: %1").arg(path));
    
    // Log the directory change
    appendOutput(QString("\n═══════════════════════════════════════════════════════════════"));
    appendWithTimestamp(QString("Working directory changed to: %1").arg(path));
    appendOutput(QString("═══════════════════════════════════════════════════════════════\n"));
}

void TerminalWidget::clear() {
    m_textEdit->clear();
    m_textEdit->setPlainText(
        QString("╔════════════════════════════════════════════════════════════════╗\n"
                "║                    AGRS ZEUS Terminal                          ║\n"
                "╚════════════════════════════════════════════════════════════════╝\n\n"
                "Working Directory: %1\n\n").arg(m_workingDirectory)
    );
}

} // namespace gui
} // namespace agrs
