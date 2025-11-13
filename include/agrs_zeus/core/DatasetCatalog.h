#ifndef AGRS_CORE_DATASET_CATALOG_H
#define AGRS_CORE_DATASET_CATALOG_H

#include <QString>
#include <QVector>
#include <QMap>
#include <QObject>

namespace agrs {
namespace core {

/**
 * @brief Dataset catalog system for managing 801 dataset entries across 11 categories
 * 
 * Loads and parses CSV inventory files to provide intelligent dataset selection
 * for automated fetching workflows.
 */
class DatasetCatalog : public QObject {
    Q_OBJECT
    
public:
    /**
     * @brief Dataset entry from inventory CSV
     */
    struct DatasetEntry {
        QString country;           // Full country name or GLOBAL
        QString countryCode;       // ISO 3166-1 alpha-2 (US, IT, SA) or GL
        QString datasetName;       // Full official dataset name
        QString provider;          // Data provider/agency
        QString resolutionM;       // Spatial resolution (meters) or "Vector"
        QString dataType;          // "Raster", "Vector", or "Both"
        QString coverage;          // Geographic coverage scope
        QString fetchTool;         // ZEUS tool name (e.g., "esa_worldcover_fetch")
        QString license;           // Data license type
        QString updateFrequency;   // How often updated
        QString notes;             // Additional information
        QString category;          // Dataset category (DEM, Land Cover, etc.)
        bool isImplemented;        // Whether fetch tool is implemented
        
        // Computed fields
        double resolutionNumeric;  // Parsed resolution as double (0 for vectors)
        int priority;              // Selection priority (0-100, higher is better)
    };
    
    /**
     * @brief Selection criteria for auto-select
     */
    struct SelectionCriteria {
        bool preferHighResolution;   // Prefer higher resolution datasets
        bool preferRecent;           // Prefer recently updated datasets
        bool requireImplemented;     // Only select implemented fetch tools
        bool preferGlobal;           // Prefer global over regional datasets
        QString preferredProvider;   // Prefer specific provider (empty = any)
        
        SelectionCriteria()
            : preferHighResolution(true)
            , preferRecent(true)
            , requireImplemented(true)
            , preferGlobal(false)
            , preferredProvider("")
        {}
    };
    
    explicit DatasetCatalog(QObject* parent = nullptr);
    ~DatasetCatalog();
    
    /**
     * @brief Load all inventory CSV files from directory
     * @param inventoryDir Directory containing CSV files (default: /opt/agrs/data)
     * @return true if successful
     */
    bool loadInventories(const QString& inventoryDir = "/opt/agrs/data");
    
    /**
     * @brief Get available datasets for a country and category
     * @param countryCode ISO country code (e.g., "IT", "SA") or "GL" for global
     * @param category Dataset category (e.g., "DEM", "Land Cover")
     * @return Vector of matching dataset entries
     */
    QVector<DatasetEntry> getAvailableDatasets(const QString& countryCode, 
                                                const QString& category) const;
    
    /**
     * @brief Get all implemented datasets for a category
     * @param category Dataset category
     * @return Vector of datasets with implemented fetch tools
     */
    QVector<DatasetEntry> getImplementedDatasets(const QString& category) const;
    
    /**
     * @brief Auto-select best dataset based on criteria
     * @param category Dataset category
     * @param countryCode Target country code
     * @param criteria Selection criteria
     * @return Best matching dataset entry (invalid if none found)
     */
    DatasetEntry selectBestDataset(const QString& category,
                                    const QString& countryCode,
                                    const SelectionCriteria& criteria = SelectionCriteria()) const;
    
    /**
     * @brief Get all available categories
     * @return List of category names
     */
    QStringList getCategories() const;
    
    /**
     * @brief Get all datasets for a category (any country)
     * @param category Dataset category
     * @return All matching entries
     */
    QVector<DatasetEntry> getDatasetsByCategory(const QString& category) const;
    
    /**
     * @brief Check if catalog is loaded
     */
    bool isLoaded() const { return m_loaded; }
    
    /**
     * @brief Get total number of entries loaded
     */
    int getTotalEntries() const { return m_totalEntries; }
    
    /**
     * @brief Get PIRL required datasets for a country
     * @param countryCode Target country code
     * @return Map of category -> best dataset for PIRL
     */
    QMap<QString, DatasetEntry> getPIRLRequiredDatasets(const QString& countryCode) const;
    
signals:
    void loadingProgress(const QString& category, int current, int total);
    void loadingComplete(int totalEntries);
    void loadingFailed(const QString& error);
    
private:
    /**
     * @brief Load single CSV inventory file
     */
    bool loadInventoryFile(const QString& filePath, const QString& category);
    
    /**
     * @brief Parse CSV line into DatasetEntry
     */
    DatasetEntry parseEntry(const QString& line, const QString& category) const;
    
    /**
     * @brief Calculate priority score for dataset
     */
    int calculatePriority(const DatasetEntry& entry, 
                         const SelectionCriteria& criteria) const;
    
    /**
     * @brief Parse resolution string to numeric value
     */
    double parseResolution(const QString& resolutionStr) const;
    
    /**
     * @brief Check if fetch tool is implemented
     */
    bool isToolImplemented(const QString& fetchTool) const;
    
    // Data storage
    QMap<QString, QVector<DatasetEntry>> m_datasetsByCategory;  // category -> entries
    QMap<QString, QVector<DatasetEntry>> m_datasetsByCountry;   // countryCode -> entries
    bool m_loaded;
    int m_totalEntries;
    
    // Category to CSV filename mapping
    static const QMap<QString, QString> s_categoryFiles;
    
    // PIRL required categories
    static const QStringList s_pirlRequiredCategories;
};

} // namespace core
} // namespace agrs

#endif // AGRS_CORE_DATASET_CATALOG_H




