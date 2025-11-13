#ifndef AGRS_ZEUS_DATASET_CATALOG_H
#define AGRS_ZEUS_DATASET_CATALOG_H

#include <QString>
#include <QVector>
#include <QMap>
#include <QStringList>
#include <QObject>

namespace agrs {
namespace gui {

/**
 * @brief Information about a single dataset from inventory CSV files
 * (Named CatalogDatasetInfo to avoid conflict with DatasetAvailabilityDialog::DatasetInfo)
 */
struct CatalogDatasetInfo {
    QString country;
    QString countryCode;
    QString datasetName;
    QString provider;
    QString resolutionM;        // Can be "Variable", "10", "30", etc.
    QString dataType;           // "Raster", "Vector", "Vector (point)", etc.
    QString coverage;           // "Global", "USA", "Europe", etc.
    QString fetchTool;          // "osm_railways_fetch", "dem_fetch", etc.
    QString license;
    QString updateFrequency;
    QString notes;
    QString category;           // Derived from source file (dem, landcover, etc.)
    
    // Parsed fields
    bool isImplemented;         // true if fetch_tool doesn't contain "guidance", "future", "not_implemented"
    bool isGlobal;              // true if coverage contains "Global"
    int  resolutionMeters;      // Parsed from resolutionM, -1 if "Variable"
};

/**
 * @brief Category-level information
 */
struct CategoryInfo {
    QString name;               // "DEM", "Land Cover", etc.
    QString csvFileName;        // "dem_datasets_inventory.csv"
    int totalDatasets;
    int implementedDatasets;
    int availableDatasets{0};   // Datasets available for current AOI
    bool hasImplementedForAOI{false};  // At least one implemented dataset covers AOI
    QStringList pirlRequired;   // PIRL-required dataset names for this category
};

/**
 * @brief Represents a selected dataset for fetching
 */
struct DatasetEntry {
    CatalogDatasetInfo info;
    QString aoiPath;            // Path to AOI file for clipping
    QString projectPath;        // Project root directory
    QString targetCRS;          // Target EPSG code (e.g., "EPSG:32633")
    bool autoProcess;           // Reproject/clip after fetch
    int priority;               // Higher = fetch first
};

/**
 * @brief Dataset catalog system - loads and manages dataset inventories
 * 
 * Loads all 11 CSV inventory files from data/ directory and provides
 * intelligent dataset selection based on:
 * - Project location (country/region)
 * - Resolution requirements
 * - Implementation status
 * - PIRL requirements
 * - Coverage overlap with AOI
 */
class DatasetCatalog : public QObject {
    Q_OBJECT
public:
    explicit DatasetCatalog(const QString& inventoryDir = QString(), QObject* parent = nullptr);
    ~DatasetCatalog();
    
    /**
     * @brief Load all inventory CSV files from the data directory
     * @param inventoryDir Path to directory containing CSV files (e.g., "/opt/agrs/data")
     * @return true if successful
     */
    bool loadInventories(const QString& inventoryDir);
    
    /**
     * @brief Check if inventories have been loaded
     * @return true if inventories are loaded
     */
    bool isLoaded() const { return m_loaded; }
    
    /**
     * @brief Get all available datasets for a specific category
     * @param category Category name ("dem", "landcover", "infrastructure", etc.)
     * @return Vector of datasets in that category
     */
    QVector<CatalogDatasetInfo> getAvailableDatasets(const QString& category) const;
    
    /**
     * @brief Get datasets filtered by country
     * @param category Category name
     * @param countryCode ISO 2-letter country code or "GLOBAL"
     * @return Filtered datasets
     */
    QVector<CatalogDatasetInfo> getDatasetsForCountry(const QString& category, const QString& countryCode) const;
    
    /**
     * @brief Get only implemented datasets (fetch_tool available)
     * @param category Category name
     * @return Datasets with working fetch tools
     */
    QVector<CatalogDatasetInfo> getImplementedDatasets(const QString& category) const;
    
    /**
     * @brief Intelligently select best dataset for a category
     * 
     * Selection criteria (in order):
     * 1. Implemented fetch tool
     * 2. Country-specific over global
     * 3. Highest resolution
     * 4. Most recent update frequency
     * 
     * @param category Category name
     * @param countryCode Project country code
     * @param preferredResolution Preferred resolution in meters (-1 for any)
     * @return Best matching dataset, or empty CatalogDatasetInfo if none found
     */
    CatalogDatasetInfo selectBestDataset(const QString& category, 
                                  const QString& countryCode,
                                  int preferredResolution = -1) const;
    
    /**
     * @brief Get PIRL-required datasets for a project
     * 
     * Returns the 12 required datasets:
     * - DEM (elevation)
     * - Land cover
     * - Geohazards
     * - Soil
     * - Population
     * - AOI boundary (special - not from catalog)
     * - Protected areas
     * - Water bodies (hydrology)
     * - Roads (infrastructure)
     * - Railways (infrastructure)
     * - Power lines (infrastructure)
     * - Existing pipelines (infrastructure)
     * 
     * @param countryCode Project country
     * @return Vector of recommended datasets
     */
    QVector<CatalogDatasetInfo> getPIRLRequiredDatasets(const QString& countryCode) const;
    
    /**
     * @brief Get all available categories
     * @return List of category info
     */
    QVector<CategoryInfo> getCategories() const;
    
    /**
     * @brief Get category information
     * @param category Category name
     * @return Category info or empty if not found
     */
    CategoryInfo getCategoryInfo(const QString& category) const;
    
    /**
     * @brief Check if a category is loaded
     * @param category Category name
     * @return true if datasets exist for this category
     */
    bool hasCategory(const QString& category) const;
    
    /**
     * @brief Get total number of datasets across all categories
     */
    int getTotalDatasetCount() const;
    
    /**
     * @brief Get number of implemented datasets
     */
    int getImplementedDatasetCount() const;
    
    /**
     * @brief Search datasets by name/provider
     * @param searchTerm Search string
     * @return Matching datasets from all categories
     */
    QVector<CatalogDatasetInfo> searchDatasets(const QString& searchTerm) const;
    
    /**
     * @brief Get recommended resolution for a category
     * @param category Category name
     * @return Recommended resolution in meters
     */
    int getRecommendedResolution(const QString& category) const;

private:
    /**
     * @brief Parse a single CSV inventory file
     * @param filePath Path to CSV file
     * @param category Category name (e.g., "dem")
     * @return Number of datasets loaded
     */
    int loadInventoryFile(const QString& filePath, const QString& category);
    
    /**
     * @brief Parse implementation status from fetch_tool field
     * @param fetchTool Fetch tool string
     * @return true if implemented
     */
    bool parseImplementationStatus(const QString& fetchTool) const;
    
    /**
     * @brief Parse resolution to integer
     * @param resolutionStr Resolution string (e.g., "10", "Variable")
     * @return Resolution in meters, -1 if variable/unknown
     */
    int parseResolution(const QString& resolutionStr) const;
    
    /**
     * @brief Check if coverage includes country
     * @param coverage Coverage string
     * @param countryCode Country code to check
     * @return true if coverage matches
     */
    bool coverageMatches(const QString& coverage, const QString& countryCode) const;
    
    /**
     * @brief Score a dataset for selection (higher = better)
     * @param dataset Dataset to score
     * @param countryCode Target country
     * @param preferredResolution Preferred resolution
     * @return Score (0-100)
     */
    int scoreDataset(const CatalogDatasetInfo& dataset, 
                    const QString& countryCode,
                    int preferredResolution) const;

private:
    // Category name -> List of datasets
    QMap<QString, QVector<CatalogDatasetInfo>> m_datasets;
    
    // Category name -> Category info
    QMap<QString, CategoryInfo> m_categories;
    
    // Loaded flag
    bool m_loaded;
    
    // Standard category names
    static const QStringList STANDARD_CATEGORIES;
    
    // PIRL required dataset names by category
    static const QMap<QString, QStringList> PIRL_REQUIREMENTS;
};

} // namespace gui
} // namespace agrs

#endif // AGRS_ZEUS_DATASET_CATALOG_H
