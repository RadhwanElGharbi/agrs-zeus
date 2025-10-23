#include "agrs_zeus/gui/CRSSelectorDialog.h"
#include <QTreeWidgetItem>
#include <QHeaderView>
#include <QGroupBox>
#include <QFont>
#include <QSplitter>
#include <QIcon>

namespace agrs {
namespace gui {

CRSSelectorDialog::CRSSelectorDialog(QWidget* parent)
    : QDialog(parent)
{
    setWindowTitle(tr("Select Coordinate Reference System"));
    resize(1000, 700);
    
    populateCRSDatabase();
    setupUI();
    populateCategories();
    populateCRSList();
}

CRSSelectorDialog::~CRSSelectorDialog() = default;

void CRSSelectorDialog::setupUI() {
    auto* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(10,10,10,10);
    mainLayout->setSpacing(10);
    
    // Search bar at top
    auto* searchLayout = new QHBoxLayout();
    auto* searchLabel = new QLabel(tr("Search:"), this);
    m_searchEdit = new QLineEdit(this);
    m_searchEdit->setPlaceholderText(tr("Search by name, EPSG code, or location..."));
    m_clearSearchBtn = new QPushButton(tr("Clear"), this);
    m_clearSearchBtn->setMaximumWidth(80);
    
    searchLayout->addWidget(searchLabel);
    searchLayout->addWidget(m_searchEdit, 1);
    searchLayout->addWidget(m_clearSearchBtn);
    mainLayout->addLayout(searchLayout);
    
    // Main splitter: Categories | CRS List | Details
    m_mainSplitter = new QSplitter(Qt::Horizontal, this);
    
    // Left: Categories tree
    m_categoryTree = new QTreeWidget(this);
    m_categoryTree->setHeaderLabel(tr("Categories"));
    m_categoryTree->setMaximumWidth(250);
    m_categoryTree->setMinimumWidth(200);
    
    // Center: CRS list
    m_crsList = new QTreeWidget(this);
    m_crsList->setHeaderLabels({tr("Name"), tr("EPSG"), tr("Type")});
    m_crsList->setSelectionMode(QAbstractItemView::SingleSelection);
    m_crsList->setAlternatingRowColors(true);
    m_crsList->setSortingEnabled(true);
    m_crsList->header()->setSectionResizeMode(0, QHeaderView::Stretch);
    m_crsList->header()->setSectionResizeMode(1, QHeaderView::ResizeToContents);
    m_crsList->header()->setSectionResizeMode(2, QHeaderView::ResizeToContents);
    
    // Right: Details panel
    m_detailsPanel = new QTextEdit(this);
    m_detailsPanel->setReadOnly(true);
    m_detailsPanel->setMaximumWidth(300);
    m_detailsPanel->setMinimumWidth(250);
    
    QFont detailsFont = m_detailsPanel->font();
    detailsFont.setFamily("Monospace");
    detailsFont.setPointSize(9);
    m_detailsPanel->setFont(detailsFont);
    
    m_mainSplitter->addWidget(m_categoryTree);
    m_mainSplitter->addWidget(m_crsList);
    m_mainSplitter->addWidget(m_detailsPanel);
    m_mainSplitter->setStretchFactor(0, 1);
    m_mainSplitter->setStretchFactor(1, 3);
    m_mainSplitter->setStretchFactor(2, 1);
    
    mainLayout->addWidget(m_mainSplitter, 1);
    
    // Bottom buttons
    auto* btnLayout = new QHBoxLayout();
    m_addFavoriteBtn = new QPushButton(tr("Add to Favorites"), this);
    btnLayout->addWidget(m_addFavoriteBtn);
    btnLayout->addStretch();
    
    m_okBtn = new QPushButton(tr("OK"), this);
    m_okBtn->setDefault(true);
    m_cancelBtn = new QPushButton(tr("Cancel"), this);
    btnLayout->addWidget(m_okBtn);
    btnLayout->addWidget(m_cancelBtn);
    
    mainLayout->addLayout(btnLayout);
    
    // Connections
    connect(m_searchEdit, &QLineEdit::textChanged, this, &CRSSelectorDialog::onSearchTextChanged);
    connect(m_clearSearchBtn, &QPushButton::clicked, this, &CRSSelectorDialog::onClearSearch);
    connect(m_categoryTree, &QTreeWidget::currentItemChanged, this, &CRSSelectorDialog::onCategoryChanged);
    connect(m_crsList, &QTreeWidget::currentItemChanged, this, [this]() { onSelectionChanged(); });
    connect(m_crsList, &QTreeWidget::itemDoubleClicked, this, [this]() { accept(); });
    connect(m_addFavoriteBtn, &QPushButton::clicked, this, &CRSSelectorDialog::onAddToFavorites);
    connect(m_okBtn, &QPushButton::clicked, this, [this]() { accept(); });
    connect(m_cancelBtn, &QPushButton::clicked, this, [this]() { reject(); });
}

void CRSSelectorDialog::populateCategories() {
    m_categoryTree->clear();
    
    // All CRS
    auto* allItem = new QTreeWidgetItem(m_categoryTree);
    allItem->setText(0, tr("All"));
    allItem->setData(0, Qt::UserRole, "All");
    
    // Favorites
    auto* favItem = new QTreeWidgetItem(m_categoryTree);
    favItem->setText(0, tr("⭐ Favorites"));
    favItem->setData(0, Qt::UserRole, "Favorites");
    
    // Recent
    auto* recentItem = new QTreeWidgetItem(m_categoryTree);
    recentItem->setText(0, tr("🕒 Recently Used"));
    recentItem->setData(0, Qt::UserRole, "Recent");
    
    // Geographic CRS
    auto* geoItem = new QTreeWidgetItem(m_categoryTree);
    geoItem->setText(0, tr("Geographic (Lat/Lon)"));
    geoItem->setData(0, Qt::UserRole, "Geographic");
    
    // Projected CRS by type
    auto* projItem = new QTreeWidgetItem(m_categoryTree);
    projItem->setText(0, tr("Projected"));
    projItem->setData(0, Qt::UserRole, "Projected");
    
    // UTM Zones
    auto* utmItem = new QTreeWidgetItem(projItem);
    utmItem->setText(0, tr("UTM (Universal Transverse Mercator)"));
    utmItem->setData(0, Qt::UserRole, "UTM");
    
    auto* utmNorthItem = new QTreeWidgetItem(utmItem);
    utmNorthItem->setText(0, tr("Northern Hemisphere"));
    utmNorthItem->setData(0, Qt::UserRole, "UTM North");
    
    auto* utmSouthItem = new QTreeWidgetItem(utmItem);
    utmSouthItem->setText(0, tr("Southern Hemisphere"));
    utmSouthItem->setData(0, Qt::UserRole, "UTM South");
    
    // Web/Popular
    auto* webItem = new QTreeWidgetItem(projItem);
    webItem->setText(0, tr("Web Mapping / Popular"));
    webItem->setData(0, Qt::UserRole, "Web");
    
    // By Region
    auto* regionItem = new QTreeWidgetItem(m_categoryTree);
    regionItem->setText(0, tr("By Region"));
    regionItem->setData(0, Qt::UserRole, "Region");
    
    auto* northAmItem = new QTreeWidgetItem(regionItem);
    northAmItem->setText(0, tr("North America"));
    northAmItem->setData(0, Qt::UserRole, "North America");
    
    auto* europeItem = new QTreeWidgetItem(regionItem);
    europeItem->setText(0, tr("Europe"));
    europeItem->setData(0, Qt::UserRole, "Europe");
    
    auto* asiaItem = new QTreeWidgetItem(regionItem);
    asiaItem->setText(0, tr("Asia"));
    asiaItem->setData(0, Qt::UserRole, "Asia");
    
    auto* africaItem = new QTreeWidgetItem(regionItem);
    africaItem->setText(0, tr("Africa"));
    africaItem->setData(0, Qt::UserRole, "Africa");
    
    auto* oceaniaItem = new QTreeWidgetItem(regionItem);
    oceaniaItem->setText(0, tr("Oceania"));
    oceaniaItem->setData(0, Qt::UserRole, "Oceania");
    
    auto* southAmItem = new QTreeWidgetItem(regionItem);
    southAmItem->setText(0, tr("South America"));
    southAmItem->setData(0, Qt::UserRole, "South America");
    
    m_categoryTree->expandAll();
    m_categoryTree->setCurrentItem(allItem);
}

void CRSSelectorDialog::populateCRSDatabase() {
    // Clear existing
    m_crsDatabase.clear();
    
    // Common Geographic CRS
    m_crsDatabase.append({4326, "WGS 84", "Geographic", "Geographic", "WGS84", "degrees", "World", "World Geodetic System 1984, used by GPS"});
    m_crsDatabase.append({4269, "NAD83", "North America", "Geographic", "NAD83", "degrees", "North America", "North American Datum 1983"});
    m_crsDatabase.append({4267, "NAD27", "North America", "Geographic", "NAD27", "degrees", "North America", "North American Datum 1927"});
    m_crsDatabase.append({4258, "ETRS89", "Europe", "Geographic", "ETRS89", "degrees", "Europe", "European Terrestrial Reference System 1989"});
    m_crsDatabase.append({4230, "ED50", "Europe", "Geographic", "ED50", "degrees", "Europe", "European Datum 1950"});
    m_crsDatabase.append({4277, "OSGB 1936", "Europe", "Geographic", "OSGB36", "degrees", "UK", "Ordnance Survey Great Britain 1936"});
    m_crsDatabase.append({4283, "GDA94", "Oceania", "Geographic", "GDA94", "degrees", "Australia", "Geocentric Datum of Australia 1994"});
    m_crsDatabase.append({4284, "Pulkovo 1942", "Asia", "Geographic", "Pulkovo 1942", "degrees", "Russia", "Pulkovo 1942"});
    
    // Web Mercator
    m_crsDatabase.append({3857, "WGS 84 / Pseudo-Mercator", "Web", "Projected", "WGS84", "meters", "World", "Web Mercator (Google Maps, OpenStreetMap)"});
    m_crsDatabase.append({3395, "WGS 84 / World Mercator", "Web", "Projected", "WGS84", "meters", "World", "World Mercator projection"});
    
    // UTM Zones (Northern Hemisphere - Selected zones)
    for (int zone = 1; zone <= 60; ++zone) {
        int epsg = 32600 + zone;
        m_crsDatabase.append({
            epsg,
            QString("WGS 84 / UTM zone %1N").arg(zone),
            "UTM North",
            "Projected",
            "WGS84",
            "meters",
            QString("UTM Zone %1N").arg(zone),
            QString("Universal Transverse Mercator zone %1, Northern Hemisphere").arg(zone)
        });
    }
    
    // UTM Zones (Southern Hemisphere - Selected zones)
    for (int zone = 1; zone <= 60; ++zone) {
        int epsg = 32700 + zone;
        m_crsDatabase.append({
            epsg,
            QString("WGS 84 / UTM zone %1S").arg(zone),
            "UTM South",
            "Projected",
            "WGS84",
            "meters",
            QString("UTM Zone %1S").arg(zone),
            QString("Universal Transverse Mercator zone %1, Southern Hemisphere").arg(zone)
        });
    }
    
    // North America Projected
    m_crsDatabase.append({2163, "US National Atlas Equal Area", "North America", "Projected", "NAD83", "meters", "USA", "National Atlas of the United States"});
    m_crsDatabase.append({5070, "NAD83 / Conus Albers", "North America", "Projected", "NAD83", "meters", "USA", "NAD83 Albers Equal Area for CONUS"});
    m_crsDatabase.append({6350, "NAD83(2011) / Conus Albers", "North America", "Projected", "NAD83(2011)", "meters", "USA", "NAD83 2011 Albers Equal Area"});
    m_crsDatabase.append({3978, "NAD83 / Canada Atlas Lambert", "North America", "Projected", "NAD83", "meters", "Canada", "Statistics Canada Lambert"});
    m_crsDatabase.append({3347, "NAD83 / Statistics Canada Lambert", "North America", "Projected", "NAD83", "meters", "Canada", "Statistics Canada Lambert Conformal Conic"});
    
    // Europe Projected
    m_crsDatabase.append({3034, "ETRS89 / LCC Europe", "Europe", "Projected", "ETRS89", "meters", "Europe", "ETRS89 Lambert Conformal Conic"});
    m_crsDatabase.append({3035, "ETRS89 / LAEA Europe", "Europe", "Projected", "ETRS89", "meters", "Europe", "ETRS89 Lambert Azimuthal Equal Area"});
    m_crsDatabase.append({3857, "ETRS89 / UTM zone 32N", "Europe", "Projected", "ETRS89", "meters", "Europe Central", "ETRS89 UTM zone 32N"});
    m_crsDatabase.append({27700, "OSGB 1936 / British National Grid", "Europe", "Projected", "OSGB36", "meters", "UK", "British National Grid"});
    m_crsDatabase.append({2154, "RGF93 / Lambert-93", "Europe", "Projected", "RGF93", "meters", "France", "French Lambert 93"});
    m_crsDatabase.append({25832, "ETRS89 / UTM zone 32N", "Europe", "Projected", "ETRS89", "meters", "Europe Central", "ETRS89 UTM 32N"});
    m_crsDatabase.append({25833, "ETRS89 / UTM zone 33N", "Europe", "Projected", "ETRS89", "meters", "Europe East", "ETRS89 UTM 33N"});
    m_crsDatabase.append({3003, "Monte Mario / Italy zone 1", "Europe", "Projected", "Monte Mario", "meters", "Italy West", "Italian Grid Zone 1"});
    m_crsDatabase.append({3004, "Monte Mario / Italy zone 2", "Europe", "Projected", "Monte Mario", "meters", "Italy East", "Italian Grid Zone 2"});
    
    // Asia Projected
    m_crsDatabase.append({3857, "WGS 84 / Pseudo-Mercator", "Asia", "Projected", "WGS84", "meters", "World", "Popular visualization CRS for Asia"});
    m_crsDatabase.append({32651, "WGS 84 / UTM zone 51N", "Asia", "Projected", "WGS84", "meters", "East Asia", "Used in Japan, Korea"});
    m_crsDatabase.append({32650, "WGS 84 / UTM zone 50N", "Asia", "Projected", "WGS84", "meters", "Southeast Asia", "Used in Vietnam, Thailand"});
    m_crsDatabase.append({32648, "WGS 84 / UTM zone 48N", "Asia", "Projected", "WGS84", "meters", "South Asia", "Used in India, Pakistan"});
    m_crsDatabase.append({24378, "Kalianpur 1975 / India zone I", "Asia", "Projected", "Kalianpur 1975", "meters", "India North", "Indian Grid Zone I"});
    
    // Africa Projected
    m_crsDatabase.append({102022, "Africa Albers Equal Area Conic", "Africa", "Projected", "WGS84", "meters", "Africa", "Continental projection for Africa"});
    m_crsDatabase.append({32736, "WGS 84 / UTM zone 36S", "Africa", "Projected", "WGS84", "meters", "East Africa", "Used in Kenya, Tanzania"});
    m_crsDatabase.append({32735, "WGS 84 / UTM zone 35S", "Africa", "Projected", "WGS84", "meters", "Southern Africa", "Used in South Africa"});
    
    // Oceania Projected
    m_crsDatabase.append({3577, "GDA94 / Australian Albers", "Oceania", "Projected", "GDA94", "meters", "Australia", "Australian Albers Equal Area"});
    m_crsDatabase.append({28356, "GDA94 / MGA zone 56", "Oceania", "Projected", "GDA94", "meters", "Australia East", "Map Grid of Australia zone 56"});
    m_crsDatabase.append({2193, "NZGD2000 / New Zealand Transverse Mercator 2000", "Oceania", "Projected", "NZGD2000", "meters", "New Zealand", "NZTM2000"});
    
    // South America Projected
    m_crsDatabase.append({5641, "SIRGAS 2000 / Brazil Mercator", "South America", "Projected", "SIRGAS 2000", "meters", "Brazil", "Brazilian Mercator"});
    m_crsDatabase.append({31983, "SIRGAS 2000 / UTM zone 23S", "South America", "Projected", "SIRGAS 2000", "meters", "Brazil", "SIRGAS UTM 23S"});
    m_crsDatabase.append({32719, "WGS 84 / UTM zone 19S", "South America", "Projected", "WGS84", "meters", "South America West", "Used in Chile, Peru"});
}

void CRSSelectorDialog::populateCRSList(const QString& filter) {
    m_crsList->clear();
    
    QVector<CRSEntry*> filtered;
    
    if (m_currentCategory == "All" || m_currentCategory.isEmpty()) {
        for (auto& crs : m_crsDatabase) {
            filtered.append(&crs);
        }
    } else if (m_currentCategory == "Favorites") {
        for (int epsg : m_favoriteCRS) {
            if (auto* crs = findCRS(epsg)) {
                filtered.append(crs);
            }
        }
    } else if (m_currentCategory == "Recent") {
        for (int epsg : m_recentCRS) {
            if (auto* crs = findCRS(epsg)) {
                filtered.append(crs);
            }
        }
    } else {
        filtered = filterCRSByCategory(m_currentCategory);
    }
    
    // Apply search filter
    for (auto* crs : filtered) {
        if (!filter.isEmpty()) {
            QString searchLower = filter.toLower();
            if (!crs->name.toLower().contains(searchLower) &&
                !QString::number(crs->epsg).contains(searchLower) &&
                !crs->category.toLower().contains(searchLower) &&
                !crs->areaOfUse.toLower().contains(searchLower)) {
                continue;
            }
        }
        
        auto* item = new QTreeWidgetItem(m_crsList);
        item->setText(0, crs->name);
        item->setText(1, QString::number(crs->epsg));
        item->setText(2, crs->type);
        item->setData(0, Qt::UserRole, crs->epsg);
        
        if (crs->isFavorite) {
            item->setIcon(0, QIcon::fromTheme("star"));
        }
    }
    
    if (m_crsList->topLevelItemCount() > 0) {
        m_crsList->setCurrentItem(m_crsList->topLevelItem(0));
    }
}

void CRSSelectorDialog::onSearchTextChanged(const QString& text) {
    populateCRSList(text);
}

void CRSSelectorDialog::onClearSearch() {
    m_searchEdit->clear();
}

void CRSSelectorDialog::onCategoryChanged(QTreeWidgetItem* current, QTreeWidgetItem* previous) {
    Q_UNUSED(previous);
    if (!current) return;
    
    m_currentCategory = current->data(0, Qt::UserRole).toString();
    populateCRSList(m_searchEdit->text());
}

void CRSSelectorDialog::onSelectionChanged() {
    if (auto* item = m_crsList->currentItem()) {
        m_selectedEpsg = item->data(0, Qt::UserRole).toInt();
        if (auto* crs = findCRS(m_selectedEpsg)) {
            m_selectedName = crs->name;
            updateDetailsPanel(m_selectedEpsg);
        }
    }
}

void CRSSelectorDialog::updateDetailsPanel(int epsg) {
    auto* crs = findCRS(epsg);
    if (!crs) {
        m_detailsPanel->clear();
        return;
    }
    
    QString details = QString(
        "<h3>%1</h3>"
        "<hr>"
        "<b>EPSG Code:</b> %2<br>"
        "<b>Type:</b> %3<br>"
        "<b>Datum:</b> %4<br>"
        "<b>Units:</b> %5<br>"
        "<b>Area of Use:</b> %6<br>"
        "<hr>"
        "<p style='font-size:9pt;'>%7</p>"
    ).arg(crs->name)
     .arg(crs->epsg)
     .arg(crs->type)
     .arg(crs->datum)
     .arg(crs->units)
     .arg(crs->areaOfUse)
     .arg(crs->description);
    
    m_detailsPanel->setHtml(details);
}

void CRSSelectorDialog::onAddToFavorites() {
    if (m_selectedEpsg > 0 && !m_favoriteCRS.contains(m_selectedEpsg)) {
        m_favoriteCRS.append(m_selectedEpsg);
        if (auto* crs = findCRS(m_selectedEpsg)) {
            crs->isFavorite = true;
        }
        populateCRSList(m_searchEdit->text());
    }
}

void CRSSelectorDialog::addRecent(int epsg) {
    m_recentCRS.removeAll(epsg);
    m_recentCRS.prepend(epsg);
    if (m_recentCRS.size() > 10) {
        m_recentCRS.removeLast();
    }
}

CRSEntry* CRSSelectorDialog::findCRS(int epsg) {
    for (auto& crs : m_crsDatabase) {
        if (crs.epsg == epsg) {
            return &crs;
        }
    }
    return nullptr;
}

QVector<CRSEntry*> CRSSelectorDialog::filterCRSByCategory(const QString& category) {
    QVector<CRSEntry*> result;
    for (auto& crs : m_crsDatabase) {
        if (crs.category == category) {
            result.append(&crs);
        }
    }
    return result;
}

} // namespace gui
} // namespace agrs
