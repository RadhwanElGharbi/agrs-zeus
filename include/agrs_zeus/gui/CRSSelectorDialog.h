#ifndef AGRS_GUI_CRSSELECTORDIALOG_H
#define AGRS_GUI_CRSSELECTORDIALOG_H

#include <QDialog>
#include <QLineEdit>
#include <QTreeWidget>
#include <QTextEdit>
#include <QPushButton>
#include <QSplitter>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QMap>
#include <QVector>

namespace agrs {
namespace gui {

struct CRSEntry {
    int epsg;
    QString name;
    QString category;
    QString type;  // "Geographic" or "Projected"
    QString datum;
    QString units;
    QString areaOfUse;
    QString description;
    bool isFavorite{false};
};

/**
 * @brief Comprehensive CRS selector dialog similar to ArcGIS Pro
 * 
 * Features:
 * - Hierarchical categories (Geographic, Projected, by region)
 * - Extensive EPSG database
 * - Search functionality
 * - Favorites system
 * - Details panel with CRS information
 * - Recently used CRS tracking
 */
class CRSSelectorDialog : public QDialog {
    Q_OBJECT
public:
    explicit CRSSelectorDialog(QWidget* parent = nullptr);
    ~CRSSelectorDialog() override;

    int selectedEpsg() const { return m_selectedEpsg; }
    QString selectedName() const { return m_selectedName; }

private slots:
    void onSearchTextChanged(const QString& text);
    void onSelectionChanged();
    void onCategoryChanged(QTreeWidgetItem* current, QTreeWidgetItem* previous);
    void onAddToFavorites();
    void onClearSearch();

private:
    void setupUI();
    void populateCategories();
    void populateCRSDatabase();
    void populateCRSList(const QString& filter = QString());
    void updateDetailsPanel(int epsg);
    void addRecent(int epsg);
    
    CRSEntry* findCRS(int epsg);
    QVector<CRSEntry*> filterCRSByCategory(const QString& category);

    // UI Components
    QTreeWidget* m_categoryTree{nullptr};
    QTreeWidget* m_crsList{nullptr};
    QTextEdit* m_detailsPanel{nullptr};
    QLineEdit* m_searchEdit{nullptr};
    QPushButton* m_clearSearchBtn{nullptr};
    QPushButton* m_addFavoriteBtn{nullptr};
    QPushButton* m_okBtn{nullptr};
    QPushButton* m_cancelBtn{nullptr};
    QSplitter* m_mainSplitter{nullptr};
    QSplitter* m_rightSplitter{nullptr};

    // Data
    QVector<CRSEntry> m_crsDatabase;
    QVector<int> m_recentCRS;
    QVector<int> m_favoriteCRS;
    
    int m_selectedEpsg{4326};
    QString m_selectedName{"WGS 84"};
    QString m_currentCategory;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_GUI_CRSSELECTORDIALOG_H
