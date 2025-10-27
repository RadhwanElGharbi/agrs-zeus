#pragma once

#include <QDialog>
#include <QListWidget>
#include <QCheckBox>
#include <QPushButton>
#include <QLabel>
#include <QProgressBar>
#include <QTextEdit>
#include <QLineEdit>
#include <QString>
#include <QStringList>

namespace agrs {
namespace gui {

class ClipToAOIDialog : public QDialog {
    Q_OBJECT
    
public:
    explicit ClipToAOIDialog(const QString& projectDir, const QString& aoiPath, QWidget* parent = nullptr);
    ~ClipToAOIDialog() override = default;
    
    struct ClipOptions {
        QStringList rasterPaths;
        QStringList vectorPaths;
        bool reprojectToAOI;
        QString outputSuffix;
    };
    
    ClipOptions getClipOptions() const;
    
private slots:
    void onSelectAllRasters();
    void onSelectAllVectors();
    void onClipLayers();
    void updateProgress(int current, int total, const QString& layerName);
    void logMessage(const QString& message);
    void onClippingComplete(bool success);
    
private:
    void setupUI();
    void populateLayerLists();
    void executeClipping();
    void loadProjectCRS();
    bool clipRasterLayer(const QString& inputPath, const QString& outputPath, const QString& aoiPath);
    bool clipVectorLayer(const QString& inputPath, const QString& outputPath, const QString& aoiPath);
    
    QString m_projectDir;
    QString m_aoiPath;
    QString m_projectCRS;  // EPSG code from project metadata
    
    // UI components
    QListWidget* m_rasterList;
    QListWidget* m_vectorList;
    QPushButton* m_selectAllRastersBtn;
    QPushButton* m_selectAllVectorsBtn;
    QCheckBox* m_reprojectCheckBox;
    QLineEdit* m_suffixEdit;
    QPushButton* m_clipButton;
    QPushButton* m_cancelButton;
    QProgressBar* m_progressBar;
    QTextEdit* m_logText;
    QLabel* m_statusLabel;
    
    bool m_clipping{false};
};

} // namespace gui
} // namespace agrs

