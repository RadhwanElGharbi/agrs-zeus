# AI Operator (Cursor Agent) Implementation Plan

**Date**: October 20, 2025  
**Status**: Planning → Implementation  
**Goal**: Integrate Cursor CLI Agent for autonomous project operations

## Overview

Implement a headless Cursor CLI integration that allows AGRS ZEUS to invoke AI operators for autonomous tasks such as:
- Reading and understanding project codebases
- Analyzing AOIs and datasets
- Running tools to solve pipeline routing problems
- Auto-standardizing project structures
- Format conversions
- Multi-step autonomous operations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  AGRS ZEUS GUI / CLI                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AI Operator Manager (C++)                           │   │
│  │  - Task Queue                                         │   │
│  │  - Context Builder                                    │   │
│  │  - Response Parser                                    │   │
│  └──────────────────┬────────────────────────────────────┘   │
│                     │                                          │
│                     ▼                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Cursor Agent Interface (Subprocess)                 │   │
│  │  - popen() / Boost.Process                           │   │
│  │  - stdin/stdout IPC                                  │   │
│  │  - JSON Output Parsing                               │   │
│  └──────────────────┬────────────────────────────────────┘   │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  Cursor Agent CLI           │
        │  (cursor-agent)             │
        │  - Claude 4.5 Sonnet        │
        │  - Codebase Indexing        │
        │  - Tool Execution           │
        │  - Multi-step Planning      │
        └────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 hours)

**1.1 Cursor CLI Installation Check**
- Detect if `cursor-agent` is installed
- Provide installation instructions if missing
- Check for API key configuration

**1.2 AI Operator Manager Class**
- Location: `/opt/agrs/include/agrs_zeus/AIOperator.h`
- Location: `/opt/agrs/src/ai_operator/AIOperator.cpp`
- Features:
  - Subprocess management (using Boost.Process or custom implementation)
  - Task queue with priority
  - Context management (codebase paths, project metadata)
  - Response streaming and parsing
  - Error handling and retry logic

**1.3 JSON Communication Protocol**
- Define request/response formats
- Task specification schema
- Progress reporting schema
- Result capture schema

### Phase 2: CLI Integration (1-2 hours)

**2.1 CLI Commands**
```bash
zeus ai <command> [options]

Commands:
  ask              Ask AI operator a question
  task             Execute a multi-step task
  analyze          Analyze codebase or project
  fix              Auto-fix issues
  standardize      Standardize project structure
  convert          Convert formats
```

**2.2 Tool Registration**
- Add to Tools.cpp
- CLI argument parsing
- Integration with AIOperator class

### Phase 3: GUI Integration (2-3 hours)

**3.1 AI Operator Panel**
- Dockable panel in MainWindow
- Task input field
- Real-time output display
- Progress indicator
- Task history

**3.2 Context Menu Integration**
- Right-click on project → "Ask AI Operator"
- Right-click on file/layer → "AI Analysis"
- Automatic invocation for complex operations

### Phase 4: Autonomous Operations (3-4 hours)

**4.1 Project Structure Validator**
- Scan project directory
- Compare against standard structure
- Generate AI task: "Reorganize project to match standard"
- Execute and validate

**4.2 Format Converter**
- Detect non-standard formats (e.g., Shapefiles)
- Generate AI task: "Convert all shapefiles to GeoPackage"
- Execute batch conversion
- Validate outputs

**4.3 Dataset Fetching Assistant**
- After dataset availability check
- Generate AI task: "Fetch and process [selected datasets] for this AOI"
- Monitor fetch progress
- Handle errors automatically

**4.4 Pipeline Routing Assistant**
- Analyze PIRL configuration
- Generate AI task: "Optimize PIRL parameters for this terrain profile"
- Execute parameter tuning
- Validate results

### Phase 5: Advanced Features (2-3 hours)

**5.1 Multi-Agent Parallel Execution**
- Launch multiple cursor-agent subprocesses
- Assign tasks to different agents
- Aggregate results

**5.2 Learning & Memory**
- Store successful task patterns
- Build knowledge base of solutions
- Reuse patterns for similar projects

**5.3 Interactive Mode**
- Two-way conversation with AI operator
- User approval for destructive operations
- Step-by-step execution with confirmations

## Technical Implementation Details

### 1. AIOperator Class Interface

```cpp
namespace agrs {
namespace ai {

enum class TaskPriority {
    LOW,
    NORMAL,
    HIGH,
    URGENT
};

enum class TaskStatus {
    QUEUED,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED
};

struct TaskContext {
    std::string project_path;
    std::string aoi_path;
    std::vector<std::string> relevant_files;
    std::map<std::string, std::string> metadata;
};

struct TaskResult {
    TaskStatus status;
    std::string output;
    std::vector<std::string> modified_files;
    std::vector<std::string> created_files;
    std::string error_message;
    double execution_time_seconds;
};

class AIOperator {
public:
    AIOperator();
    ~AIOperator();
    
    // Core operations
    bool is_available() const;
    std::string get_version() const;
    
    // Task execution
    std::string submit_task(const std::string& prompt,
                           const TaskContext& context,
                           TaskPriority priority = TaskPriority::NORMAL);
    
    TaskResult get_result(const std::string& task_id, bool wait = false);
    bool cancel_task(const std::string& task_id);
    
    // Streaming execution
    void execute_task_streaming(const std::string& prompt,
                               const TaskContext& context,
                               std::function<void(const std::string&)> output_callback);
    
    // Interactive mode
    void start_interactive_session(const TaskContext& context);
    std::string send_message(const std::string& message);
    void end_interactive_session();
    
    // Context management
    void set_codebase_path(const std::string& path);
    void add_relevant_file(const std::string& file);
    void set_metadata(const std::string& key, const std::string& value);
    
private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace ai
} // namespace agrs
```

### 2. Subprocess Management

Using Boost.Process for robust subprocess control:

```cpp
#include <boost/process.hpp>
namespace bp = boost::process;

class CursorAgentProcess {
public:
    void launch(const std::string& prompt, const TaskContext& ctx) {
        bp::ipstream output_stream;
        bp::ipstream error_stream;
        
        std::string cmd = build_command(prompt, ctx);
        
        process_ = bp::child(
            cmd,
            bp::std_out > output_stream,
            bp::std_err > error_stream,
            bp::start_dir = ctx.project_path
        );
        
        // Read output asynchronously
        std::thread output_reader([this, &output_stream]() {
            std::string line;
            while (std::getline(output_stream, line)) {
                handle_output(line);
            }
        });
        
        output_reader.detach();
    }
    
private:
    bp::child process_;
    std::string build_command(const std::string& prompt, const TaskContext& ctx);
    void handle_output(const std::string& line);
};
```

### 3. JSON Communication

```json
{
  "task_id": "task_20251020_001",
  "prompt": "Analyze this pipeline routing project and identify any missing datasets",
  "context": {
    "project_path": "/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO",
    "aoi_path": "/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/aoi/aoi.gpkg",
    "crs": "EPSG:32633",
    "relevant_files": [
      "/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/project_metadata.json",
      "/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/aoi/aoi_metadata.json"
    ]
  },
  "priority": "HIGH",
  "model": "claude-4.5-sonnet"
}
```

Response format:
```json
{
  "task_id": "task_20251020_001",
  "status": "COMPLETED",
  "output": "Analysis complete. Found 3 missing dataset categories:\n1. Cadastre data...",
  "modified_files": [],
  "created_files": [
    "/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/analysis/missing_datasets.md"
  ],
  "execution_time": 12.5,
  "timestamp": "2025-10-20T15:55:00Z"
}
```

## Use Cases

### Use Case 1: Automatic Project Standardization

```cpp
AIOperator ai;
TaskContext ctx;
ctx.project_path = "/opt/agrs/Projects/CLIENT_PROJECT";

std::string prompt = R"(
Analyze this project structure and reorganize it to match the AGRS standard:
- Create missing folders (aoi/, data/rasters/, data/vectors/, etc.)
- Move files to correct locations
- Convert shapefiles to GeoPackage
- Generate metadata JSON files
- Create processing log files
Document all changes in a migration report.
)";

std::string task_id = ai.submit_task(prompt, ctx, TaskPriority::HIGH);
TaskResult result = ai.get_result(task_id, true); // wait for completion

if (result.status == TaskStatus::COMPLETED) {
    std::cout << "✅ Project standardized successfully!\n";
    std::cout << result.output << "\n";
}
```

### Use Case 2: Interactive Dataset Analysis

```cpp
AIOperator ai;
ai.start_interactive_session(ctx);

std::string response1 = ai.send_message("What datasets are currently in this project?");
std::cout << response1 << "\n";

std::string response2 = ai.send_message("Which datasets are missing for pipeline routing?");
std::cout << response2 << "\n";

std::string response3 = ai.send_message("Fetch the top 3 most critical missing datasets");
std::cout << response3 << "\n";

ai.end_interactive_session();
```

### Use Case 3: GUI Autonomous Operation

From GUI context menu:
```cpp
void MainWindow::onAskAIOperator() {
    QString projectPath = m_currentProject;
    
    // Show AI Operator dialog
    AIOperatorDialog* dlg = new AIOperatorDialog(projectPath, this);
    dlg->setPrompt("Analyze this project and suggest optimizations");
    
    connect(dlg, &AIOperatorDialog::taskStarted, [this]() {
        m_consoleText->append(tr("[AI Operator] Task started..."));
    });
    
    connect(dlg, &AIOperatorDialog::outputReceived, [this](const QString& output) {
        m_consoleText->append(output);
    });
    
    connect(dlg, &AIOperatorDialog::taskCompleted, [this](const TaskResult& result) {
        m_consoleText->append(tr("[AI Operator] ✅ Task completed in %1s").arg(result.execution_time_seconds));
        // Refresh project view if files were modified
        if (!result.modified_files.empty()) {
            populateLayersFromProject(m_currentProject);
        }
    });
    
    dlg->show();
}
```

## Security & Safety

1. **Confirmation Dialogs**: Always confirm before:
   - Deleting files
   - Modifying critical project files
   - Running shell commands
   - Making bulk changes

2. **Sandbox Mode**: Option to run AI operator in read-only mode

3. **Audit Logging**: Log all AI operations to:
   - `/opt/agrs/Projects/<PROJECT>/logs/ai_operator.log`
   - Include timestamp, prompt, actions taken, files modified

4. **Rollback Capability**: Create snapshots before major operations

## File Structure

```
/opt/agrs/
├── include/agrs_zeus/
│   ├── AIOperator.h              # Main AI operator interface
│   └── gui/
│       └── AIOperatorDialog.h    # GUI dialog for AI tasks
├── src/
│   ├── ai_operator/
│   │   ├── AIOperator.cpp        # Core implementation
│   │   ├── CursorAgent.cpp       # Cursor CLI subprocess manager
│   │   ├── TaskQueue.cpp         # Task scheduling
│   │   └── ContextBuilder.cpp    # Context assembly
│   ├── app/
│   │   └── Tools.cpp             # CLI tool registration
│   └── gui/
│       ├── AIOperatorDialog.cpp  # GUI implementation
│       └── MainWindow.cpp        # Integration points
└── docs/
    ├── AI_OPERATOR_USER_GUIDE.md
    └── AI_OPERATOR_API.md
```

## Dependencies

1. **Boost.Process**: For subprocess management
   ```cmake
   find_package(Boost REQUIRED COMPONENTS process)
   ```

2. **nlohmann/json**: For JSON parsing (already included)

3. **Cursor CLI**: External dependency
   - Installation check in CMake
   - Runtime availability check

## Testing Strategy

1. **Unit Tests**: Test AIOperator class methods
2. **Integration Tests**: Test full task execution pipeline
3. **GUI Tests**: Test dialog interactions
4. **End-to-End Tests**: Complete autonomous operations
   - Create test project → Standardize → Validate
   - Fetch datasets → Process → Validate
   - Run PIRL optimization → Validate results

## Timeline Estimate

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 1 | Core Infrastructure | 2-3 hours |
| 2 | CLI Integration | 1-2 hours |
| 3 | GUI Integration | 2-3 hours |
| 4 | Autonomous Operations | 3-4 hours |
| 5 | Advanced Features | 2-3 hours |
| **Total** | | **10-15 hours** |

## Next Steps

1. ✅ Complete Perplexity research
2. ✅ Create implementation plan
3. ⏳ Implement Phase 1: Core Infrastructure
4. ⏳ Implement Phase 2: CLI Integration
5. ⏳ Implement Phase 3: GUI Integration
6. ⏳ Implement Phase 4: Autonomous Operations
7. ⏳ Testing & Documentation

## References

- [Cursor CLI Documentation](https://cursor.com/docs/cli/overview)
- [Cursor Blog: CLI Launch](https://cursor.com/blog/cli)
- [Boost.Process Documentation](https://www.boost.org/doc/libs/release/doc/html/process.html)
- Perplexity Research: `/opt/agrs/docs/CURSOR_HEADLESS_CLI_RESEARCH.md`
- Perplexity Research: `/opt/agrs/docs/CURSOR_AGENT_CPP_INTEGRATION.md`



