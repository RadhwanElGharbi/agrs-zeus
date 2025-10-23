#include "agrs_zeus/gui/BackendInterface.h"
#include "agrs_zeus/Tools.h"  // Backend tools
#include <QThread>
#include <QtConcurrent>
#include <QFileInfo>
#include <iostream>

namespace agrs {
namespace gui {

// Import tools namespace for convenience
using namespace agrs::tools;

BackendInterface::BackendInterface(QObject* parent)
    : QObject(parent)
{
}

BackendInterface::~BackendInterface() {
}

QStringList BackendInterface::getToolCategories() const {
    return QStringList{
        "DEM Fetch & Analysis",
        "Dataset Routing",
        "Raster Analysis",
        "Vector Operations",
        "PIRL Training",
        "Project Utilities"
    };
}

QStringList BackendInterface::getToolsInCategory(const QString& category) const {
    if (category == "DEM Fetch & Analysis") {
        return QStringList{
            "dem_fetch",
            "dem_slope",
            "dem_aspect",
            "dem_hillshade"
        };
    } else if (category == "Raster Analysis") {
        return QStringList{
            "raster_calc",
            "raster_reclassify",
            "raster_threshold"
        };
    } else if (category == "Vector Operations") {
        return QStringList{
            "vector_buffer",
            "vector_intersection"
        };
    } else if (category == "PIRL Training") {
        return QStringList{
            "pirl_create_config",
            "pirl_reset_episode",
            "pirl_step"
        };
    }
    
    return QStringList();
}

QString BackendInterface::getToolDescription(const QString& toolName) const {
    // Placeholder descriptions
    if (toolName == "dem_fetch") {
        return "Fetch Digital Elevation Model data for an area of interest";
    } else if (toolName == "dem_slope") {
        return "Calculate slope from DEM in degrees or percent";
    } else if (toolName == "raster_calc") {
        return "Perform raster algebra calculations";
    } else if (toolName == "pirl_create_config") {
        return "Create PIRL project configuration file";
    }
    
    return "Tool description not available";
}

void BackendInterface::runDEMFetch(const QVariantMap& params) {
    emit operationStarted("dem_fetch");
    
    // Run in background thread
    QtConcurrent::run([this, params]() {
        // TODO: Call actual Tools.cpp function
        // For now, simulate
        QThread::sleep(2);
        
        emit operationCompleted("dem_fetch", "DEM fetched successfully");
        emit outputGenerated("/path/to/output/dem.tif");
    });
}

void BackendInterface::runRasterSlope(const QString& input, const QString& output) {
    emit operationStarted("raster_slope");
    
    QtConcurrent::run([this, input, output]() {
        // TODO: Call actual tools_raster_slope function
        QThread::sleep(1);
        
        emit operationCompleted("raster_slope", "Slope calculated successfully");
        emit outputGenerated(output);
    });
}

void BackendInterface::runTool(const QString& toolName, const QVariantMap& params) {
    emit operationStarted(toolName);
    
    QtConcurrent::run([this, toolName, params]() {
        int result = executeTool(toolName, params);
        
        if (result == 0) {
            emit operationCompleted(toolName, "Tool completed successfully");
            // Try to emit outputGenerated so MainWindow can auto-load outputs
            if (params.contains("output")) {
                emit outputGenerated(params.value("output").toString());
            } else if (params.contains("output_path")) {
                emit outputGenerated(params.value("output_path").toString());
            }
        } else {
            emit operationFailed(toolName, QString("Tool failed with code %1").arg(result));
        }
    });
}

int BackendInterface::executeTool(const QString& toolName, const QVariantMap& params) {
    std::cout << "[BackendInterface] Executing tool: " << toolName.toStdString() << "\n";
    
    try {
        // DEM Fetch
        if (toolName == "dem_fetch") {
            std::string bbox = params.value("bbox").toString().toStdString();
            std::string aoi = params.value("aoi").toString().toStdString();
            std::string output = params.value("output").toString().toStdString();
            std::string resolution = params.value("resolution", "30m").toString().toStdString();
            
            return tools_dem_fetch(bbox, aoi, resolution, "auto", "", "", output, false, false);
        }
        
        // Terrain Slope
        else if (toolName == "terrain_slope") {
            std::string input = params.value("input").toString().toStdString();
            std::string output = params.value("output").toString().toStdString();
            QString units = params.value("units", "degrees").toString().toLower();
            bool asPercent = (units == "percent");
            
            return tools_terrain_slope(input, output, asPercent, true, "ZevenbergenThorne", false);
        }
        
        // Raster Calculator
        else if (toolName == "raster_calc") {
            std::string input1 = params.value("input1").toString().toStdString();
            std::string input2 = params.value("input2").toString().toStdString();
            std::string expression = params.value("expression").toString().toStdString();
            std::string output = params.value("output").toString().toStdString();
            
            // Build inputs vector
            std::vector<std::string> inputs;
            inputs.push_back(input1);
            if (!input2.empty()) {
                inputs.push_back(input2);
            }
            
            return tools_raster_calc(inputs, expression, output, "", false);
        }
        
        // Vector Buffer
        else if (toolName == "vector_buffer") {
            std::string input = params.value("input").toString().toStdString();
            double distance = params.value("distance").toDouble();
            std::string output = params.value("output").toString().toStdString();
            
            return tools_vector_buffer(input, output, distance, 16, "ROUND", false, false);
        }
        
        // PIRL Create Config
        else if (toolName == "pirl_create_config") {
            std::string projectName = params.value("project_name").toString().toStdString();
            std::string output = params.value("output").toString().toStdString();
            // Note: The CLI version accepts coordinates via interactive prompts
            // For GUI, we would need to modify the config file after creation
            // For now, just create basic config
            return tools_pirl_create_config(projectName, output, false);
        }
        
        // Perplexity Search
        else if (toolName == "perplexity_search") {
            std::string query = params.value("query").toString().toStdString();
            std::string location = params.value("location").toString().toStdString();
            std::string output = params.value("output").toString().toStdString();
            
            // Default values for other parameters
            std::string bbox = params.value("bbox").toString().toStdString();
            std::string place = params.value("place").toString().toStdString();
            std::string topic = params.value("topic").toString().toStdString();
            std::string datasetResearch = params.value("dataset_research").toString().toStdString();
            std::string model = params.value("model", "large").toString().toStdString();
            int maxTokens = params.value("max_tokens", 4000).toInt();
            double temperature = params.value("temperature", 0.2).toDouble();
            std::string recency = params.value("recency", "month").toString().toStdString();
            std::string format = params.value("format", "markdown").toString().toStdString();
            bool citations = params.value("citations", true).toBool();

            return tools_perplexity_search(query, location, bbox, place, topic, datasetResearch,
                                           model, maxTokens, temperature, recency, format, output, citations);
        }
        
        // Analyze Fetch Tools
        else if (toolName == "analyze_fetch_tools") {
            std::string mode = params.value("mode").toString().toStdString();
            std::string country = params.value("country").toString().toStdString();
            std::string outputJson = params.value("output").toString().toStdString();
            bool verbose = params.value("verbose", true).toBool();
            return tools_analyze_fetch_tools(mode, country, outputJson, verbose);
        }
        
        // Unknown tool
        else {
            std::cerr << "[BackendInterface] Unknown tool: " << toolName.toStdString() << "\n";
            return -1;
        }
        
    } catch (const std::exception& e) {
        std::cerr << "[BackendInterface] Tool execution error: " << e.what() << "\n";
        return -1;
    }
}

} // namespace gui
} // namespace agrs





