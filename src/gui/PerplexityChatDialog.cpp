#include "agrs_zeus/gui/PerplexityChatDialog.h"
#include "agrs_zeus/gui/BackendInterface.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QFile>
#include <QDir>
#include <QTextStream>
#include <QScrollBar>
#include <QDateTime>
#include <iostream>

namespace agrs {
namespace gui {

PerplexityChatDialog::PerplexityChatDialog(BackendInterface* backend,
                                           double lat,
                                           double lon,
                                           const QString& initialContent,
                                           QWidget* parent)
    : QDialog(parent)
    , m_backend(backend)
    , m_lat(lat)
    , m_lon(lon)
    , m_waitingForResponse(false)
{
    setWindowTitle(tr("AI Geographic Intelligence - %1°N, %2°E").arg(lat, 0, 'f', 4).arg(lon, 0, 'f', 4));
    resize(800, 600);
    
    setupUI();
    
    // Display initial content
    appendMessage("AI", initialContent);
    
    // Store initial content as conversation history
    m_conversationHistory = QString("Initial Query: Geographic information for coordinates %1°N, %2°E\n\n")
                               .arg(lat, 0, 'f', 6).arg(lon, 0, 'f', 6);
    m_conversationHistory += "AI Response:\n" + initialContent + "\n\n";
    
    // Connect backend signals for follow-up queries (use Qt::UniqueConnection to avoid duplicates)
    connect(m_backend, &BackendInterface::operationCompleted,
            this, &PerplexityChatDialog::onFollowUpCompleted,
            Qt::UniqueConnection);
    connect(m_backend, &BackendInterface::operationFailed,
            this, &PerplexityChatDialog::onFollowUpFailed,
            Qt::UniqueConnection);
}

PerplexityChatDialog::~PerplexityChatDialog() {
    // Disconnect signals to avoid dangling connections
    disconnect(m_backend, &BackendInterface::operationCompleted,
               this, &PerplexityChatDialog::onFollowUpCompleted);
    disconnect(m_backend, &BackendInterface::operationFailed,
               this, &PerplexityChatDialog::onFollowUpFailed);
}

void PerplexityChatDialog::setupUI() {
    auto* mainLayout = new QVBoxLayout(this);
    
    // Location info label
    auto* locationLabel = new QLabel(
        tr("Location: %1°N, %2°E | Ask follow-up questions about this area")
            .arg(m_lat, 0, 'f', 4).arg(m_lon, 0, 'f', 4),
        this
    );
    locationLabel->setStyleSheet("QLabel { font-weight: bold; padding: 5px; background-color: #e0e0e0; }");
    mainLayout->addWidget(locationLabel);
    
    // Conversation view (scrollable, read-only)
    m_conversationView = new QTextEdit(this);
    m_conversationView->setReadOnly(true);
    m_conversationView->setStyleSheet("QTextEdit { background-color: #f5f5f5; }");
    mainLayout->addWidget(m_conversationView);
    
    // Question input area
    auto* inputLayout = new QHBoxLayout();
    
    auto* promptLabel = new QLabel(tr("Ask a follow-up question:"), this);
    inputLayout->addWidget(promptLabel);
    
    m_questionInput = new QLineEdit(this);
    m_questionInput->setPlaceholderText(tr("e.g., What is the population density? Are there any protected areas nearby?"));
    connect(m_questionInput, &QLineEdit::returnPressed, this, &PerplexityChatDialog::onSendQuestion);
    inputLayout->addWidget(m_questionInput, 1);
    
    m_sendBtn = new QPushButton(tr("Send"), this);
    connect(m_sendBtn, &QPushButton::clicked, this, &PerplexityChatDialog::onSendQuestion);
    inputLayout->addWidget(m_sendBtn);
    
    mainLayout->addLayout(inputLayout);
    
    // Close button
    auto* buttonLayout = new QHBoxLayout();
    buttonLayout->addStretch();
    
    m_closeBtn = new QPushButton(tr("Close"), this);
    m_closeBtn->setDefault(false);
    m_closeBtn->setAutoDefault(false);
    connect(m_closeBtn, &QPushButton::clicked, this, &QDialog::accept);
    buttonLayout->addWidget(m_closeBtn);
    
    mainLayout->addLayout(buttonLayout);
}

void PerplexityChatDialog::appendMessage(const QString& role, const QString& content) {
    QString timestamp = QDateTime::currentDateTime().toString("hh:mm:ss");
    
    QString html;
    if (role == "User") {
        html = QString("<div style='margin: 10px 0; padding: 10px; background-color: #d1e7ff; border-left: 3px solid #0066cc;'>"
                      "<b style='color: #0066cc;'>You</b> <span style='color: #666; font-size: 10px;'>%1</span><br>"
                      "<span style='color: #333;'>%2</span>"
                      "</div>")
                  .arg(timestamp)
                  .arg(content.toHtmlEscaped());
    } else if (role == "AI") {
        // Convert markdown to HTML for better rendering
        QString htmlContent = content;
        htmlContent.replace("\n# ", "\n<h2>").replace("\n", "<br>");
        htmlContent.replace("**", "<b>").replace("**", "</b>");
        
        html = QString("<div style='margin: 10px 0; padding: 10px; background-color: #e8f5e9; border-left: 3px solid #4caf50;'>"
                      "<b style='color: #4caf50;'>AI Assistant</b> <span style='color: #666; font-size: 10px;'>%1</span><br>"
                      "<span style='color: #333;'>%2</span>"
                      "</div>")
                  .arg(timestamp)
                  .arg(htmlContent);
    } else {
        html = QString("<div style='margin: 10px 0; padding: 10px; background-color: #fff3e0; border-left: 3px solid #ff9800;'>"
                      "<b style='color: #ff9800;'>System</b> <span style='color: #666; font-size: 10px;'>%1</span><br>"
                      "<span style='color: #333;'>%2</span>"
                      "</div>")
                  .arg(timestamp)
                  .arg(content.toHtmlEscaped());
    }
    
    m_conversationView->append(html);
    
    // Auto-scroll to bottom
    QScrollBar* scrollBar = m_conversationView->verticalScrollBar();
    scrollBar->setValue(scrollBar->maximum());
}

QString PerplexityChatDialog::buildContextualQuery(const QString& userQuestion) {
    // Build a contextual query that includes location and previous conversation
    QString contextualQuery = QString(
        "This is a follow-up question about the location at coordinates %1°N, %2°E. "
        "Previous context:\n%3\n\n"
        "User's follow-up question: %4"
    ).arg(m_lat, 0, 'f', 6)
     .arg(m_lon, 0, 'f', 6)
     .arg(m_conversationHistory.left(1500))  // Limit context to avoid token overflow
     .arg(userQuestion);
    
    return contextualQuery;
}

void PerplexityChatDialog::onSendQuestion() {
    QString question = m_questionInput->text().trimmed();
    if (question.isEmpty() || m_waitingForResponse) {
        return;
    }
    
    std::cout << "[PerplexityChat] User asked: " << question.toStdString() << "\n";
    
    // Display user's question
    appendMessage("User", question);
    
    // Add to conversation history
    m_conversationHistory += QString("User Question: %1\n\n").arg(question);
    
    // Disable input while waiting
    m_waitingForResponse = true;
    m_questionInput->setEnabled(false);
    m_sendBtn->setEnabled(false);
    m_questionInput->clear();
    
    // Show "Thinking..." message
    appendMessage("System", "AI is processing your question...");
    
    // Build contextual query
    QString contextualQuery = buildContextualQuery(question);
    std::cout << "[PerplexityChat] Contextual query length: " << contextualQuery.length() << " chars\n";
    
    // Prepare parameters for Perplexity search
    QVariantMap params;
    params["query"] = contextualQuery;
    params["location"] = QString::asprintf("%.6f,%.6f", m_lat, m_lon);
    params["format"] = QString("markdown");
    params["max_tokens"] = 2000;
    params["temperature"] = 0.2;
    params["model"] = QString("claude-4.5-sonnet");  // Always use Claude 4.5 Sonnet
    params["recency"] = QString("month");
    params["citations"] = true;  // Always include sources
    
    // Generate unique output path
    QString timestamp = QString::number(QDateTime::currentSecsSinceEpoch());
    m_pendingOutputPath = QDir::temp().filePath(
        QString("perplexity_followup_%1_%2.md").arg(m_lat, 0, 'f', 6).arg(timestamp)
    );
    params["output"] = m_pendingOutputPath;
    
    // Execute search
    std::cout << "[PerplexityChat] Sending follow-up query, output: " << m_pendingOutputPath.toStdString() << "\n";
    m_backend->runTool("perplexity_search", params);
}

void PerplexityChatDialog::onFollowUpCompleted(const QString& toolName, const QString& result) {
    std::cout << "[PerplexityChat] Received completion signal: tool=" << toolName.toStdString() 
              << ", pending=" << m_pendingOutputPath.toStdString() 
              << ", waiting=" << m_waitingForResponse << "\n";
    
    // Only process if this is our request
    if (toolName != "perplexity_search") {
        return;  // Not a perplexity search
    }
    
    if (m_pendingOutputPath.isEmpty()) {
        std::cout << "[PerplexityChat] Ignoring - no pending path\n";
        return;  // Not our request (might be MainWindow's initial request)
    }
    
    if (!m_waitingForResponse) {
        std::cout << "[PerplexityChat] Ignoring - not waiting\n";
        return;  // We're not waiting for a response
    }
    
    // Read the response
    QString content;
    QFile f(m_pendingOutputPath);
    if (f.open(QIODevice::ReadOnly | QIODevice::Text)) {
        content = QString::fromUtf8(f.readAll());
        f.close();
        // Clean up temp file
        f.remove();
    } else {
        content = tr("Failed to load AI response.");
    }
    
    // Display AI response
    appendMessage("AI", content);
    
    // Add to conversation history
    m_conversationHistory += QString("AI Response:\n%1\n\n").arg(content);
    
    // Re-enable input
    m_waitingForResponse = false;
    m_questionInput->setEnabled(true);
    m_sendBtn->setEnabled(true);
    m_questionInput->setFocus();
    
    // Clear pending path
    m_pendingOutputPath.clear();
}

void PerplexityChatDialog::onFollowUpFailed(const QString& toolName, const QString& error) {
    // Only process if this is our request
    if (toolName != "perplexity_search") {
        return;  // Not a perplexity search
    }
    
    if (m_pendingOutputPath.isEmpty()) {
        return;  // Not our request
    }
    
    if (!m_waitingForResponse) {
        return;  // We're not waiting for a response
    }
    
    // Display error
    appendMessage("System", tr("Error: %1").arg(error));
    
    // Re-enable input
    m_waitingForResponse = false;
    m_questionInput->setEnabled(true);
    m_sendBtn->setEnabled(true);
    m_questionInput->setFocus();
    
    // Clear pending path
    m_pendingOutputPath.clear();
}

} // namespace gui
} // namespace agrs

