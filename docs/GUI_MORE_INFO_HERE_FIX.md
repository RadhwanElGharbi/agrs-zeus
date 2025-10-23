# GUI "More Info Here" Context Menu Fix

**Date:** October 20, 2025  
**Status:** ✅ FIXED

## Problem

Right-clicking on the map and selecting "More Info Here" returned an error and didn't execute the Perplexity AI search.

## Root Cause

The `perplexity_search` tool handler was missing from `BackendInterface::executeTool()`. When the GUI tried to call `m_backend->runTool("perplexity_search", params)`, it fell through to the "Unknown tool" case and returned an error.

## Fix Applied

Added the complete `perplexity_search` handler to `/opt/agrs/src/gui/BackendInterface.cpp`:

```cpp
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
```

## How It Works

### User Workflow

1. **Right-click** anywhere on the map
2. **Select** "More Info Here" from the context menu
3. **Wait** for Perplexity AI to search (status bar shows "AI Search: Getting info...")
4. **View Results** in a popup dialog with formatted markdown

### Technical Flow

1. **MapWidget::contextMenuEvent()** captures right-click position
2. Converts screen coordinates to lat/lon using `screenToGeo()`
3. Emits `moreInfoRequested(lat, lon)` signal
4. **MainWindow** lambda handler receives the signal:
   - Builds query: "Provide geographic context and notable features at these coordinates..."
   - Sets location parameter: `"lat,lon"`
   - Creates temporary output file: `/tmp/perplexity_here_LAT_LON.md`
   - Calls `m_backend->runTool("perplexity_search", params)`
5. **BackendInterface::executeTool()** dispatches to `tools_perplexity_search()`
6. Tool executes Perplexity API call asynchronously
7. **MainWindow::onOperationCompleted()** receives completion signal
8. Reads output file and displays in `QDialog` with `QTextEdit`

### Query Template

The query is dynamically constructed with the exact coordinates embedded:

```
"Provide detailed geographic context and information for the location at coordinates {LAT}°N, {LON}°E. 
Include: (1) Country, region, and nearest city; (2) Terrain type and elevation; 
(3) Land use and vegetation; (4) Notable nearby features and landmarks; 
(5) Infrastructure and accessibility; (6) Any significant geographic or cultural information."
```

This ensures Perplexity AI knows the exact location to search for, providing accurate and relevant results.

### Parameters Sent

| Parameter | Value | Description |
|-----------|-------|-------------|
| `query` | "Provide detailed geographic context... at coordinates LAT°N, LON°E" | Full query with embedded coordinates |
| `location` | `"lat,lon"` | Coordinates (also passed separately) |
| `format` | `"markdown"` | Output format |
| `max_tokens` | `2000` | Response length (increased for detail) |
| `model` | `"large"` | Perplexity AI model |
| `temperature` | `0.2` | Low for factual responses |
| `recency` | `"month"` | Search recent information |
| `citations` | `true` | Include source citations (default) |
| `output` | Temp file path | Where to save results |

## Testing

### Manual Test Steps

1. Launch GUI:
   ```bash
   cd /opt/agrs/build && ./zeus_gui
   ```

2. Open SAIPEM project (or any project)

3. Right-click on the map somewhere in Italy

4. Select "More Info Here"

5. Verify:
   - ✅ Console shows: `[AI Search] Requesting info for: LAT, LON`
   - ✅ Status bar shows: "AI Search: Getting info..."
   - ✅ After ~5-10 seconds, a dialog pops up with results
   - ✅ Results include location name, terrain, features
   - ✅ Results are formatted in markdown

### Expected Output Example

For coordinates in Central Italy (43.15°N, 13.70°E):

```markdown
# Geographic Context for 43.150000, 13.700000

**Location:** Marche Region, Central Italy

**Country:** Italy

**Terrain Type:** Hilly to mountainous terrain with elevations ranging from 
200m to 1000m above sea level. The area is characterized by the Apennine 
mountain foothills.

**Land Use:** 
- Mixed agricultural and forested areas
- Small villages and rural settlements
- Olive groves and vineyards typical of the region

**Notable Features:**
- Frasassi Caves (Grotte di Frasassi) approximately 15km to the northwest
- Esino River valley running through the area
- Apennine National Park boundaries nearby
- Historic medieval towns scattered throughout

**Nearby Cities:**
- Fabriano (12 km northwest)
- Ancona (45 km east, regional capital on the Adriatic coast)

**Infrastructure:**
- SS76 highway connecting the region to Ancona
- Regional railway line
- Rural road network

**Climate:** Mediterranean with continental influences due to elevation, 
characterized by warm summers and cool winters.

---
*Sources: OpenStreetMap, Italian Geographic Survey, Regional Tourism Board*
```

## Error Handling

If the search fails, the user will see:
- Console message: `[BackendInterface] Tool execution error: ...`
- Status bar: "Operation failed"
- No popup dialog (graceful degradation)

Common failure reasons:
- Missing Perplexity API credentials (`.perplexity_credentials`)
- Network connectivity issues
- API rate limiting
- Invalid coordinates (outside valid range)

## Configuration

Perplexity API credentials should be in `/opt/agrs/.perplexity_credentials`:

```
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxx
```

## Future Enhancements

1. **Customizable Queries:** Allow users to specify what information they want
2. **Cache Results:** Store recent searches to avoid redundant API calls
3. **Copy to Clipboard:** Add button to copy results
4. **Save to Project:** Option to save searches to project documentation
5. **Visual Indicators:** Show search area circle on map
6. **Batch Searches:** Right-click multiple locations to compare

---

**Status:** ✅ Fully functional. The "More Info Here" context menu now properly executes Perplexity AI searches and displays geographic intelligence for any map location.









