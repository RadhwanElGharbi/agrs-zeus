#include "agrs_zeus/gui/BackendInterface.h"
#include "agrs_zeus/Tools.h"
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
            "pirl_training",
            "pirl_deploy"
        };
    } else if (category == "Project Utilities") {
        return QStringList{
            "analyze_fetch_tools",
            "perplexity_search"
        };
    }
    return QStringList();
}

QString BackendInterface::getToolDescription(const QString& toolName) const {
    if (toolName == "dem_fetch") {
        return "Fetch DEM data for specified area";
    } else if (toolName == "raster_calc") {
        return "Perform raster calculations";
    } else if (toolName == "vector_buffer") {
        return "Create buffer zones around vector features";
    } else if (toolName == "pirl_create_config") {
        return "Create PIRL training configuration";
    } else if (toolName == "analyze_fetch_tools") {
        return "Analyze dataset fetch tool availability";
    } else if (toolName == "perplexity_search") {
        return "AI-powered geographic intelligence search";
    }
    return "Tool description not available";
}

void BackendInterface::runTool(const QString& toolName, const QVariantMap& params) {
    emit operationStarted(toolName);
    
    QtConcurrent::run([this, toolName, params]() {
        int result = executeTool(toolName, params);
        
        if (result == 0) {
            emit operationCompleted(toolName, "Tool completed successfully");
            // Attempt to find output path and emit outputGenerated
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
    try {
        if (toolName == "dem_fetch") {
            return tools_dem_fetch(
                params.value("bbox").toString().toStdString(),
                params.value("aoi").toString().toStdString(),
                params.value("output").toString().toStdString(),
                params.value("resolution", "30m").toString().toStdString(),
                params.value("overwrite", false).toBool()
            );
        } else if (toolName == "terrain_slope") {
            return tools_terrain_slope(
                params.value("input").toString().toStdString(),
                params.value("output").toString().toStdString(),
                params.value("overwrite", false).toBool()
            );
        } else if (toolName == "raster_calc") {
            return tools_raster_calc(
                params.value("expression").toString().toStdString(),
                params.value("output").toString().toStdString(),
                params.value("overwrite", false).toBool()
            );
        } else if (toolName == "vector_buffer") {
            return tools_vector_buffer(
                params.value("input").toString().toStdString(),
                params.value("output").toString().toStdString(),
                params.value("distance").toDouble(),
                params.value("overwrite", false).toBool()
            );
        } else if (toolName == "pirl_create_config") {
            return tools_pirl_create_config(
                params.value("project_name").toString().toStdString(),
                params.value("start_lat").toDouble(),
                params.value("start_lon").toDouble(),
                params.value("end_lat").toDouble(),
                params.value("end_lon").toDouble(),
                params.value("output").toString().toStdString()
            );
        } else if (toolName == "analyze_fetch_tools") {
            return tools_analyze_fetch_tools(
                params.value("mode", "all").toString().toStdString(),
                params.value("country", "").toString().toStdString(),
                params.value("output", "").toString().toStdString(),
                params.value("verbose", false).toBool()
            );
        } else if (toolName == "perplexity_search") {
            return tools_perplexity_search(
                params.value("query").toString().toStdString(),
                params.value("location", "").toString().toStdString(),
                params.value("bbox", "").toString().toStdString(),
                params.value("place", "").toString().toStdString(),
                params.value("topic", "").toString().toStdString(),
                params.value("dataset_research", "").toString().toStdString(),
                params.value("model", "large").toString().toStdString(),
                params.value("max_tokens", 4000).toInt(),
                params.value("temperature", 0.2).toDouble(),
                params.value("recency", "month").toString().toStdString(),
                params.value("format", "markdown").toString().toStdString(),
                params.value("output").toString().toStdString(),
                params.value("no_citations", false).toBool()
            );
        } else {
            std::cout << "[BackendInterface] Unknown tool: " << toolName.toStdString() << std::endl;
            return -1;
        }
    } catch (const std::exception& e) {
        std::cout << "[BackendInterface] Exception in " << toolName.toStdString() << ": " << e.what() << std::endl;
        return -1;
    }
}

} // namespace gui
} // namespace agrs


