#pragma once

#include <QDialog>
#include <QTableWidget>
#include <QPushButton>
#include <QLabel>
#include <QLineEdit>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QString>

namespace agrs {
namespace gui {

class AttributeTableDialog : public QDialog {
    Q_OBJECT

public:
    explicit AttributeTableDialog(const QString& layerPath, const QString& layerName, QWidget* parent = nullptr);
    ~AttributeTableDialog() override = default;

signals:
    void zoomToFeature(const QString& layerPath, int fid);

private slots:
    void onRowDoubleClicked(int row, int column);

private:
    void loadAttributes();
    void setupUI();
    void applyFilter();
    
    QString m_layerPath;
    QString m_layerName;
    
    // UI components
    QTableWidget* m_table;
    QLabel* m_infoLabel;
    QLineEdit* m_filterEdit;
    QPushButton* m_filterButton;
    QPushButton* m_clearFilterButton;
    QPushButton* m_exportButton;
    QPushButton* m_closeButton;
    
    int m_totalFeatures{0};
    int m_displayedFeatures{0};
};

} // namespace gui
} // namespace agrs

