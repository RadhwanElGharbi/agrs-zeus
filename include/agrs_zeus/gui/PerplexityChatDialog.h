#ifndef AGRS_GUI_PERPLEXITYCHATDIALOG_H
#define AGRS_GUI_PERPLEXITYCHATDIALOG_H

#include <QDialog>
#include <QTextEdit>
#include <QLineEdit>
#include <QPushButton>
#include <QString>

namespace agrs {
namespace gui {

class BackendInterface;

/**
 * @brief Dialog for interactive AI chat with Perplexity
 * 
 * Provides a chat interface for follow-up questions about geographic locations
 * with context-aware AI responses.
 */
class PerplexityChatDialog : public QDialog {
    Q_OBJECT

public:
    explicit PerplexityChatDialog(BackendInterface* backend,
                                 double lat,
                                 double lon,
                                 const QString& initialContent,
                                 QWidget* parent = nullptr);
    ~PerplexityChatDialog() override;

private slots:
    void onSendQuestion();
    void onFollowUpCompleted(const QString& toolName, const QString& message);
    void onFollowUpFailed(const QString& toolName, const QString& error);

private:
    void setupUI();
    void appendMessage(const QString& sender, const QString& message);
    void sendFollowUpQuery(const QString& question);
    QString buildContextualQuery(const QString& userQuestion);

    BackendInterface* m_backend;
    double m_lat;
    double m_lon;
    
    QTextEdit* m_chatDisplay;
    QTextEdit* m_conversationView;
    QLineEdit* m_questionInput;
    QPushButton* m_sendBtn;
    QPushButton* m_closeBtn;
    
    QString m_conversationHistory;
    bool m_waitingForResponse;
    QString m_pendingOutputPath;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_PERPLEXITYCHATDIALOG_H
