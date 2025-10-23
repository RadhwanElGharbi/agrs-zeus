# Cursor AI Agent Integration - AGRS ZEUS

## Overview

AGRS ZEUS integrates **Cursor AI Agent** (version `2025.10.20-f1b214f`) for intelligent geospatial file analysis, project scope generation, and AI-powered assistance throughout the pipeline routing workflow.

---

## System Requirements

### ✅ Completed Setup

1. **Cursor Agent Installed**
   - Location: `~/.local/bin/cursor-agent`
   - Version: `2025.10.20-f1b214f`
   - Added to PATH in `~/.bashrc`

2. **Authentication Configured**
   - User: `rmelghar@uwaterloo.ca`
   - Status: ✅ Logged in
   - Tokens stored securely

3. **Available Models**
   - `sonnet-4.5` ✅ (Primary, Claude Sonnet 4.5)
   - `sonnet-4.5-thinking` (Claude with extended reasoning)
   - `gpt-5` (Fallback)
   - `gpt-5-codex` (Code-specialized)
   - `opus-4.1`
   - `grok`
   - `cheetah` (Fast model)

---

## Implementation Architecture

### CursorInterface Class

**Location:** `include/agrs_zeus/gui/CursorInterface.h` + `src/gui/CursorInterface.cpp`

**Purpose:** Centralized interface for all Cursor Agent operations

#### Key Features

1. **Availability Checks**
   ```cpp
   static bool isCursorAgentAvailable();
   static bool isCursorAgentAuthenticated();
   ```

2. **Synchronous Execution**
   ```cpp
   QString executePrompt(const QString& prompt, 
                        Model model = Model::Sonnet45,
                        int timeoutMs = 60000);
   ```

3. **File Context Analysis**
   ```cpp
   QString executeWithFiles(const QString& prompt,
                           const QStringList& filePaths,
                           Model model = Model::Sonnet45,
                           int timeoutMs = 60000);
   ```

4. **Geospatial-Specific Analysis**
   ```cpp
   QString analyzeGeospatialFile(const QString& filePath,
                                const QString& specificQuestions = "");
   ```

5. **Asynchronous Execution**
   ```cpp
   void executePromptAsync(const QString& prompt,
                          Model model = Model::Sonnet45,
                          std::function<void(const QString&)> callback);
   ```

---

## Integration Points

### 1. Project Setup Wizard (Active)

**File:** `src/gui/ProjectSetupWizard.cpp`

**Function:** `SetupConfirmPage::onGenerateAISummary()`

**Workflow:**
1. User uploads AOI, start/end KMZ files
2. Clicks "Generate AI Summary"
3. Cursor Agent analyzes all files:
   - Geographic location (country, region, cities)
   - Terrain characteristics and elevation
   - AOI area in km²
   - Distance between endpoints
   - Climate and environmental factors
   - Land use, infrastructure
4. Analysis sent to Perplexity AI for comprehensive project scope
5. Final summary displayed with sources

**Example Output:**
```
The analysis is complete! The KML file defines a study area of approximately 
2,185 km² in central Italy along the Adriatic coast, spanning roughly 37 km 
east-west and 65 km north-south, centered around coordinates 43.14°N, 13.70°E.
```

### 2. Dataset Analysis (Future)

**Planned Integration:**
- Analyze fetched rasters/vectors for quality
- Detect data gaps or inconsistencies
- Suggest preprocessing workflows
- Validate coverage completeness

### 3. PIRL Training Enhancement (Future)

**Planned Integration:**
- Analyze constraint layers before training
- Suggest hyperparameter adjustments
- Interpret training metrics
- Generate training reports

### 4. Code Generation (Future)

**Planned Integration:**
- Generate custom geoprocessing tools
- Create batch processing scripts
- Automate repetitive workflows
- Generate tool documentation

---

## Usage Examples

### Basic Prompt Execution

```cpp
#include "agrs_zeus/gui/CursorInterface.h"

CursorInterface cursor;

// Check availability
if (!CursorInterface::isCursorAgentAvailable()) {
    std::cerr << "Cursor Agent not installed!" << std::endl;
    return;
}

// Execute simple prompt
QString response = cursor.executePrompt(
    "What are the top 3 geospatial considerations for pipeline routing in Italy?",
    CursorInterface::Model::Sonnet45
);

std::cout << response.toStdString() << std::endl;
```

### File Analysis

```cpp
CursorInterface cursor;

QString analysis = cursor.analyzeGeospatialFile(
    "/opt/agrs/Projects/SAIPEM/inputs/AOI.kml",
    "Is this area prone to seismic activity? Are there protected natural areas?"
);

// Analysis includes:
// - File format details
// - Geographic bounds
// - CRS information
// - Terrain summary
// - Answers to specific questions
```

### Multiple File Analysis

```cpp
CursorInterface cursor;

QStringList files;
files << "/path/to/aoi.kml"
      << "/path/to/start_point.kmz"
      << "/path/to/end_point.kmz";

QString prompt = "Compare these three files and calculate the optimal pipeline length.";

QString analysis = cursor.executeWithFiles(prompt, files);
```

### Async Execution with Callback

```cpp
CursorInterface cursor;

cursor.executePromptAsync(
    "Analyze terrain ruggedness for this AOI: @/path/to/dem.tif",
    CursorInterface::Model::Sonnet45,
    [](const QString& response) {
        qDebug() << "Analysis complete:" << response;
        // Update UI or trigger next step
    }
);
```

---

## Configuration

### Default Settings

```cpp
// In CursorInterface constructor
m_timeoutMs = 60000;              // 60 seconds
m_defaultModel = Model::Sonnet45; // Claude Sonnet 4.5
m_forceMode = true;                // Allow file operations
```

### Model Selection Strategy

1. **Primary:** `sonnet-4.5` (Claude Sonnet 4.5)
   - Best for complex geospatial analysis
   - Context-aware reasoning
   - High accuracy

2. **Fallback:** `gpt-5`
   - If Sonnet unavailable
   - Alternative high-quality model

3. **Fast:** `cheetah`
   - Quick responses
   - Less detailed analysis
   - Use for simple queries

---

## Error Handling

### Check Before Use

```cpp
if (!CursorInterface::isCursorAgentAvailable()) {
    QMessageBox::warning(this, "Cursor Agent Unavailable",
        "Install Cursor Agent:\ncurl https://cursor.com/install | bash");
    return;
}

if (!CursorInterface::isCursorAgentAuthenticated()) {
    QMessageBox::warning(this, "Authentication Required",
        "Please authenticate:\ncursor-agent login");
    return;
}
```

### Handle Timeouts

```cpp
CursorInterface cursor;
cursor.setTimeout(30000);  // 30 seconds for quick queries

QString response = cursor.executePrompt(prompt);

if (response.isEmpty()) {
    QString error = cursor.lastError();
    int exitCode = cursor.lastExitCode();
    
    qDebug() << "Error:" << error;
    qDebug() << "Exit code:" << exitCode;
}
```

---

## Performance Considerations

### Timeout Recommendations

- **Simple queries:** 10-30 seconds
- **File analysis:** 30-60 seconds
- **Multiple large files:** 60-120 seconds
- **Complex reasoning:** 90-180 seconds

### File Size Limits

Cursor Agent can handle:
- **KML/KMZ:** Up to 50 MB
- **GeoJSON:** Up to 100 MB
- **Rasters:** Context only (doesn't process pixels directly)

For large files:
1. Extract metadata first with GDAL
2. Pass summary to Cursor
3. Focus on specific regions

---

## Troubleshooting

### Issue: "cursor-agent: command not found"

**Solution:**
```bash
export PATH="$HOME/.local/bin:$PATH"
# Or add to ~/.bashrc permanently
```

### Issue: "Not logged in"

**Solution:**
```bash
cursor-agent login
# Follow browser authentication flow
```

### Issue: Timeout on file analysis

**Solution:**
```cpp
cursor.setTimeout(120000);  // Increase to 2 minutes
```

### Issue: Model not available

**Solution:**
```cpp
// Use fallback model
QString response = cursor.executePrompt(prompt, CursorInterface::Model::GPT5);
```

---

## Testing

### Verify Installation

```bash
cd /opt/agrs
export PATH="$HOME/.local/bin:$PATH"
cursor-agent status
# Should show: Logged in as rmelghar@uwaterloo.ca
```

### Test File Analysis

```bash
cursor-agent --print --model sonnet-4.5 \
  "Analyze: @/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/inputs/AOI.kml. \
   Provide location, area, terrain."
```

### Test in GUI

1. Launch `zeus_gui`
2. New Project → Fill in details
3. On Confirmation page, click "Generate AI Summary"
4. Observe Cursor Agent analysis in status label
5. Review comprehensive AI summary with Perplexity insights

---

## Future Enhancements

### Phase 1 ✅ (Complete)
- [x] CursorInterface class
- [x] System authentication
- [x] Project wizard integration
- [x] Error handling

### Phase 2 (Planned)
- [ ] Dataset quality analysis
- [ ] Batch file processing
- [ ] MCP server integration
- [ ] Chat session persistence

### Phase 3 (Advanced)
- [ ] PIRL training integration
- [ ] Automated code generation
- [ ] Project repository analysis
- [ ] Workflow optimization suggestions

---

## References

- **Cursor Agent Docs:** https://docs.cursor.com/cli
- **Model Documentation:** https://cursor.com/models
- **MCP Integration:** https://docs.cursor.com/mcp

---

## Maintenance

### Update Cursor Agent

```bash
cursor-agent update
```

### Check Status

```bash
cursor-agent status
cursor-agent --version
```

### Re-authenticate

```bash
cursor-agent logout
cursor-agent login
```

---

**Last Updated:** October 22, 2025  
**Integration Version:** 1.0.0  
**Cursor Agent Version:** 2025.10.20-f1b214f



