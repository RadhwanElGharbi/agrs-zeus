#include "agrs_zeus/gui/DatasetCatalog.h"
#include <QFile>
#include <QTextStream>
#include <QDir>
#include <QDebug>
#include <QFileInfo>
#include <QRegularExpression>

namespace agrs {
namespace gui {

// Static constants
const QStringList DatasetCatalog::STANDARD_CATEGORIES = {
    "dem", "landcover", "hydrology", "infrastructure", "protected_areas",
    "geohazards", "administrative", "cadastre", "socioeconomic", "climate", "imagery"
};

// PIRL-required datasets by category
const QMap<QString, QStringList> DatasetCatalog::PIRL_REQUIREMENTS = {
    {"dem", {"DEM"}},  // Any DEM
    {"landcover", {"Land Cover"}},  // Any land cover
    {"geohazards", {"Geohazards"}},  // Any geohazard data
    {"socioeconomic", {"Population"}},  // Population density
    {"protected_areas", {"Protected Areas"}},  // Natura 2000, WDPA, etc.
    {"hydrology", {"Water Bodies"}},  // Rivers, lakes, streams
    {"infrastructure", {"Roads", "Railways", "Power Lines", "Pipelines"}}  // 4 infrastructure types
};

DatasetCatalog::DatasetCatalog(const QString& inventoryDir, QObject* parent)
    : QObject(parent), m_loaded(false)
{
    // Auto-load inventories if directory provided
    if (!inventoryDir.isEmpty()) {
        loadInventories(inventoryDir);
    }
}

DatasetCatalog::~DatasetCatalog()
{
}

bool DatasetCatalog::loadInventories(const QString& inventoryDir)
{
    qDebug() << "📚 Loading dataset inventories from:" << inventoryDir;
    
    QDir dir(inventoryDir);
    if (!dir.exists()) {
        qWarning() << "❌ Inventory directory does not exist:" << inventoryDir;
        return false;
    }
    
    int totalLoaded = 0;
    
    // Load each category's CSV file
    for (const QString& category : STANDARD_CATEGORIES) {
        QString fileName = category + "_datasets_inventory.csv";
        QString filePath = dir.filePath(fileName);
        
        if (!QFile::exists(filePath)) {
            qWarning() << "⚠️  Missing inventory file:" << fileName;
            continue;
        }
        
        int count = loadInventoryFile(filePath, category);
        if (count > 0) {
            totalLoaded += count;
            qDebug() << "  ✅" << category << ":" << count << "datasets";
        }
    }
    
    if (totalLoaded > 0) {
        m_loaded = true;
        qDebug() << "✅ Loaded" << totalLoaded << "datasets from" << m_datasets.size() << "categories";
        return true;
    }
    
    qWarning() << "❌ Failed to load any datasets";
    return false;
}

int DatasetCatalog::loadInventoryFile(const QString& filePath, const QString& category)
{
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        qWarning() << "Failed to open" << filePath;
        return 0;
    }
    
    QTextStream in(&file);
    QVector<CatalogDatasetInfo> datasets;
    
    // Read header
    QString header = in.readLine();
    if (header.isEmpty()) {
        qWarning() << "Empty file:" << filePath;
        return 0;
    }
    
    // Parse header to get column indices
    QStringList headerCols = header.split(',');
    QMap<QString, int> colIndex;
    for (int i = 0; i < headerCols.size(); ++i) {
        QString col = headerCols[i].trimmed().toLower();
        col.replace("_", "");
        col.replace(" ", "");
        colIndex[col] = i;
    }
    
    // Read data rows
    int lineNum = 1;
    while (!in.atEnd()) {
        QString line = in.readLine().trimmed();
        lineNum++;
        
        // Skip comments and empty lines
        if (line.isEmpty() || line.startsWith('#')) {
            continue;
        }
        
        QStringList cols = line.split(',');
        if (cols.size() < 5) {  // Minimum required columns
            continue;
        }
        
        // Parse dataset info
        CatalogDatasetInfo dataset;
        dataset.category = category;
        
        // Handle different header formats across CSV files
        if (colIndex.contains("country")) {
            dataset.country = cols[colIndex["country"]].trimmed();
        }
        if (colIndex.contains("countrycode")) {
            dataset.countryCode = cols[colIndex["countrycode"]].trimmed();
        }
        if (colIndex.contains("datasetname")) {
            dataset.datasetName = cols[colIndex["datasetname"]].trimmed();
        }
        if (colIndex.contains("provider")) {
            dataset.provider = cols[colIndex["provider"]].trimmed();
        }
        if (colIndex.contains("resolutionm") || colIndex.contains("resolution")) {
            QString resStr = cols[colIndex.contains("resolutionm") ? 
                                colIndex["resolutionm"] : colIndex["resolution"]].trimmed();
            dataset.resolutionM = resStr;
            dataset.resolutionMeters = parseResolution(resStr);
        }
        if (colIndex.contains("datatype")) {
            dataset.dataType = cols[colIndex["datatype"]].trimmed();
        }
        if (colIndex.contains("coverage")) {
            dataset.coverage = cols[colIndex["coverage"]].trimmed();
            dataset.isGlobal = dataset.coverage.contains("Global", Qt::CaseInsensitive);
        }
        if (colIndex.contains("fetchtool")) {
            dataset.fetchTool = cols[colIndex["fetchtool"]].trimmed();
            dataset.isImplemented = parseImplementationStatus(dataset.fetchTool);
        }
        if (colIndex.contains("license")) {
            dataset.license = cols[colIndex["license"]].trimmed();
        }
        if (colIndex.contains("updatefrequency")) {
            dataset.updateFrequency = cols[colIndex["updatefrequency"]].trimmed();
        }
        if (colIndex.contains("notes") && cols.size() > colIndex["notes"]) {
            dataset.notes = cols[colIndex["notes"]].trimmed();
        }
        
        // Skip if missing critical fields
        if (dataset.datasetName.isEmpty()) {
            continue;
        }
        
        datasets.append(dataset);
    }
    
    file.close();
    
    // Store in map
    if (!datasets.isEmpty()) {
        m_datasets[category] = datasets;
        
        // Create category info
        CategoryInfo catInfo;
        catInfo.name = category;
        catInfo.csvFileName = QFileInfo(filePath).fileName();
        catInfo.totalDatasets = datasets.size();
        catInfo.implementedDatasets = 0;
        
        for (const auto& ds : datasets) {
            if (ds.isImplemented) {
                catInfo.implementedDatasets++;
            }
        }
        
        // Set PIRL requirements
        if (PIRL_REQUIREMENTS.contains(category)) {
            catInfo.pirlRequired = PIRL_REQUIREMENTS[category];
        }
        
        m_categories[category] = catInfo;
    }
    
    return datasets.size();
}

bool DatasetCatalog::parseImplementationStatus(const QString& fetchTool) const
{
    if (fetchTool.isEmpty()) {
        return false;
    }
    
    QString lower = fetchTool.toLower();
    
    // Not implemented indicators
    if (lower.contains("guidance") || 
        lower.contains("future") || 
        lower.contains("not_implemented") ||
        lower.contains("manual")) {
        return false;
    }
    
    // Has a valid fetch tool
    if (lower.contains("_fetch") || lower.contains("dem_fetch") || lower.contains("osm_")) {
        return true;
    }
    
    return false;
}

int DatasetCatalog::parseResolution(const QString& resolutionStr) const
{
    if (resolutionStr.isEmpty() || 
        resolutionStr.contains("Variable", Qt::CaseInsensitive) ||
        resolutionStr.contains("Vector", Qt::CaseInsensitive)) {
        return -1;
    }
    
    // Extract numeric part
    QString numStr = resolutionStr;
    numStr.remove(QRegularExpression("[^0-9.]"));
    
    bool ok;
    int res = numStr.toInt(&ok);
    return ok ? res : -1;
}

bool DatasetCatalog::coverageMatches(const QString& coverage, const QString& countryCode) const
{
    if (coverage.contains("Global", Qt::CaseInsensitive)) {
        return true;
    }
    
    if (coverage.contains(countryCode, Qt::CaseInsensitive)) {
        return true;
    }
    
    // Check for country name
    // TODO: Add country name lookup table if needed
    
    return false;
}

QVector<CatalogDatasetInfo> DatasetCatalog::getAvailableDatasets(const QString& category) const
{
    return m_datasets.value(category, QVector<CatalogDatasetInfo>());
}

QVector<CatalogDatasetInfo> DatasetCatalog::getDatasetsForCountry(const QString& category, const QString& countryCode) const
{
    QVector<CatalogDatasetInfo> all = getAvailableDatasets(category);
    QVector<CatalogDatasetInfo> filtered;
    
    for (const auto& ds : all) {
        if (coverageMatches(ds.coverage, countryCode) || ds.countryCode == countryCode) {
            filtered.append(ds);
        }
    }
    
    return filtered;
}

QVector<CatalogDatasetInfo> DatasetCatalog::getImplementedDatasets(const QString& category) const
{
    QVector<CatalogDatasetInfo> all = getAvailableDatasets(category);
    QVector<CatalogDatasetInfo> filtered;
    
    for (const auto& ds : all) {
        if (ds.isImplemented) {
            filtered.append(ds);
        }
    }
    
    return filtered;
}

int DatasetCatalog::scoreDataset(const CatalogDatasetInfo& dataset, 
                                const QString& countryCode,
                                int preferredResolution) const
{
    int score = 0;
    
    // 1. Implementation status (40 points)
    if (dataset.isImplemented) {
        score += 40;
    }
    
    // 2. Coverage match (30 points)
    if (dataset.countryCode == countryCode) {
        score += 30;  // Exact country match
    } else if (dataset.isGlobal) {
        score += 15;  // Global coverage
    } else if (coverageMatches(dataset.coverage, countryCode)) {
        score += 20;  // Regional match
    }
    
    // 3. Resolution match (20 points)
    if (preferredResolution > 0 && dataset.resolutionMeters > 0) {
        int resDiff = abs(dataset.resolutionMeters - preferredResolution);
        if (resDiff == 0) {
            score += 20;  // Exact match
        } else if (resDiff <= 5) {
            score += 15;  // Very close
        } else if (resDiff <= 20) {
            score += 10;  // Close
        } else if (dataset.resolutionMeters < preferredResolution) {
            score += 5;  // Higher resolution is better
        }
    }
    
    // 4. Update frequency (10 points)
    if (dataset.updateFrequency.contains("Annual", Qt::CaseInsensitive) ||
        dataset.updateFrequency.contains("Continuous", Qt::CaseInsensitive)) {
        score += 10;
    } else if (dataset.updateFrequency.contains("Static", Qt::CaseInsensitive)) {
        score += 3;
    }
    
    return score;
}

CatalogDatasetInfo DatasetCatalog::selectBestDataset(const QString& category, 
                                              const QString& countryCode,
                                              int preferredResolution) const
{
    QVector<CatalogDatasetInfo> candidates = getAvailableDatasets(category);
    
    if (candidates.isEmpty()) {
        return CatalogDatasetInfo();  // Empty result
    }
    
    // Score all candidates
    int bestScore = -1;
    CatalogDatasetInfo bestDataset;
    
    for (const auto& ds : candidates) {
        int score = scoreDataset(ds, countryCode, preferredResolution);
        if (score > bestScore) {
            bestScore = score;
            bestDataset = ds;
        }
    }
    
    return bestDataset;
}

QVector<CatalogDatasetInfo> DatasetCatalog::getPIRLRequiredDatasets(const QString& countryCode) const
{
    QVector<CatalogDatasetInfo> required;
    
    // 1. DEM (highest resolution available)
    CatalogDatasetInfo dem = selectBestDataset("dem", countryCode, 30);
    if (!dem.datasetName.isEmpty()) {
        required.append(dem);
    }
    
    // 2. Land Cover (prefer 10m)
    CatalogDatasetInfo landcover = selectBestDataset("landcover", countryCode, 10);
    if (!landcover.datasetName.isEmpty()) {
        required.append(landcover);
    }
    
    // 3. Geohazards
    CatalogDatasetInfo geohazards = selectBestDataset("geohazards", countryCode, 100);
    if (!geohazards.datasetName.isEmpty()) {
        required.append(geohazards);
    }
    
    // 4. Soil (from socioeconomic or dedicated soil category)
    // TODO: Add soil category if separate
    
    // 5. Population
    CatalogDatasetInfo population = selectBestDataset("socioeconomic", countryCode, 1000);
    if (!population.datasetName.isEmpty()) {
        required.append(population);
    }
    
    // 6. Protected Areas
    CatalogDatasetInfo protected_areas = selectBestDataset("protected_areas", countryCode, -1);
    if (!protected_areas.datasetName.isEmpty()) {
        required.append(protected_areas);
    }
    
    // 7-10. Infrastructure (roads, railways, power, pipelines)
    QVector<CatalogDatasetInfo> infra = getImplementedDatasets("infrastructure");
    for (const auto& ds : infra) {
        if (ds.datasetName.contains("Road", Qt::CaseInsensitive) ||
            ds.datasetName.contains("Railway", Qt::CaseInsensitive) ||
            ds.datasetName.contains("Power", Qt::CaseInsensitive) ||
            ds.datasetName.contains("Pipeline", Qt::CaseInsensitive)) {
            
            if (coverageMatches(ds.coverage, countryCode)) {
                required.append(ds);
            }
        }
    }
    
    // 11. Water Bodies (hydrology)
    CatalogDatasetInfo water = selectBestDataset("hydrology", countryCode, -1);
    if (!water.datasetName.isEmpty()) {
        required.append(water);
    }
    
    return required;
}

QVector<CategoryInfo> DatasetCatalog::getCategories() const
{
    return m_categories.values().toVector();
}

CategoryInfo DatasetCatalog::getCategoryInfo(const QString& category) const
{
    return m_categories.value(category, CategoryInfo());
}

bool DatasetCatalog::hasCategory(const QString& category) const
{
    return m_datasets.contains(category);
}

int DatasetCatalog::getTotalDatasetCount() const
{
    int total = 0;
    for (const auto& datasets : m_datasets.values()) {
        total += datasets.size();
    }
    return total;
}

int DatasetCatalog::getImplementedDatasetCount() const
{
    int total = 0;
    for (const auto& datasets : m_datasets.values()) {
        for (const auto& ds : datasets) {
            if (ds.isImplemented) {
                total++;
            }
        }
    }
    return total;
}

QVector<CatalogDatasetInfo> DatasetCatalog::searchDatasets(const QString& searchTerm) const
{
    QVector<CatalogDatasetInfo> results;
    QString term = searchTerm.toLower();
    
    for (const auto& datasets : m_datasets.values()) {
        for (const auto& ds : datasets) {
            if (ds.datasetName.toLower().contains(term) ||
                ds.provider.toLower().contains(term) ||
                ds.notes.toLower().contains(term)) {
                results.append(ds);
            }
        }
    }
    
    return results;
}

int DatasetCatalog::getRecommendedResolution(const QString& category) const
{
    // Recommended resolutions for PIRL
    static const QMap<QString, int> recommendations = {
        {"dem", 30},              // 30m DEM (SRTM/ASTER)
        {"landcover", 10},        // 10m land cover (ESA WorldCover)
        {"hydrology", 30},        // 30m for rasters, vector for waterbodies
        {"infrastructure", -1},   // Vector data
        {"protected_areas", -1},  // Vector data
        {"geohazards", 100},      // 100m is typical
        {"socioeconomic", 1000},  // 1km for population
        {"climate", 1000},        // 1km typical
        {"administrative", -1},   // Vector data
        {"cadastre", -1},         // Vector data
        {"imagery", 10}           // 10m for Sentinel-2
    };
    
    return recommendations.value(category, 30);
}

} // namespace gui
} // namespace agrs
