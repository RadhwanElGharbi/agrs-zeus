#ifndef AGRS_AIOPERATOR_H
#define AGRS_AIOPERATOR_H

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <functional>
#include <chrono>

namespace agrs {
namespace ai {

// Forward declarations
class CursorAgentProcess;

/**
 * @brief Priority levels for AI operator tasks
 */
enum class TaskPriority {
    LOW,
    NORMAL,
    HIGH,
    URGENT
};

/**
 * @brief Status of an AI operator task
 */
enum class TaskStatus {
    QUEUED,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED
};

/**
 * @brief Context information for an AI operator task
 * 
 * Provides the AI with relevant information about the project,
 * codebase, and specific files to focus on.
 */
struct TaskContext {
    std::string project_path;                      ///< Root path of the project
    std::string aoi_path;                          ///< Path to AOI file
    std::string crs;                               ///< Coordinate Reference System
    std::vector<std::string> relevant_files;       ///< Files relevant to this task
    std::map<std::string, std::string> metadata;   ///< Additional metadata key-value pairs
    
    TaskContext() = default;
    TaskContext(const std::string& proj_path) : project_path(proj_path) {}
};

/**
 * @brief Result of an AI operator task
 */
struct TaskResult {
    TaskStatus status;                          ///< Final status of the task
    std::string output;                         ///< Complete output from AI
    std::vector<std::string> modified_files;    ///< Files that were modified
    std::vector<std::string> created_files;     ///< Files that were created
    std::vector<std::string> deleted_files;     ///< Files that were deleted
    std::string error_message;                  ///< Error message if failed
    double execution_time_seconds;              ///< Total execution time
    std::chrono::system_clock::time_point timestamp;  ///< Completion timestamp
};

/**
 * @brief Main interface for AI Operator (Cursor Agent) integration
 * 
 * This class provides a C++ interface to the Cursor CLI Agent,
 * enabling autonomous AI operations on projects.
 * 
 * Example usage:
 * @code
 * AIOperator ai;
 * if (!ai.is_available()) {
 *     std::cerr << "Cursor Agent not installed\n";
 *     return 1;
 * }
 * 
 * TaskContext ctx("/opt/agrs/Projects/MY_PROJECT");
 * std::string task_id = ai.submit_task(
 *     "Analyze project structure and suggest improvements",
 *     ctx
 * );
 * 
 * TaskResult result = ai.get_result(task_id, true);
 * std::cout << result.output << "\n";
 * @endcode
 */
class AIOperator {
public:
    AIOperator();
    ~AIOperator();
    
    // Disable copy
    AIOperator(const AIOperator&) = delete;
    AIOperator& operator=(const AIOperator&) = delete;
    
    /**
     * @brief Check if Cursor Agent CLI is available
     * @return true if cursor-agent is installed and accessible
     */
    bool is_available() const;
    
    /**
     * @brief Get the version of Cursor Agent CLI
     * @return Version string, or empty if not available
     */
    std::string get_version() const;
    
    /**
     * @brief Get installation instructions if not available
     * @return Installation command/instructions
     */
    static std::string get_install_instructions();
    
    /**
     * @brief Submit a task to the AI operator
     * @param prompt The instruction/question for the AI
     * @param context Project and codebase context
     * @param priority Task priority level
     * @return Task ID for tracking
     */
    std::string submit_task(const std::string& prompt,
                           const TaskContext& context,
                           TaskPriority priority = TaskPriority::NORMAL);
    
    /**
     * @brief Get the result of a submitted task
     * @param task_id Task identifier
     * @param wait If true, blocks until task completes
     * @return Task result
     */
    TaskResult get_result(const std::string& task_id, bool wait = false);
    
    /**
     * @brief Cancel a running or queued task
     * @param task_id Task identifier
     * @return true if successfully cancelled
     */
    bool cancel_task(const std::string& task_id);
    
    /**
     * @brief Execute a task with streaming output
     * @param prompt The instruction for the AI
     * @param context Project and codebase context
     * @param output_callback Called for each line of output
     */
    void execute_task_streaming(const std::string& prompt,
                               const TaskContext& context,
                               std::function<void(const std::string&)> output_callback);
    
    /**
     * @brief Start an interactive session with the AI
     * @param context Project context for the session
     */
    void start_interactive_session(const TaskContext& context);
    
    /**
     * @brief Send a message in the interactive session
     * @param message Message to send
     * @return AI's response
     */
    std::string send_message(const std::string& message);
    
    /**
     * @brief End the interactive session
     */
    void end_interactive_session();
    
    /**
     * @brief Check if an interactive session is active
     */
    bool is_session_active() const;
    
    /**
     * @brief Set the AI model to use
     * @param model Model identifier (e.g., "claude-4.5-sonnet", "gpt-4")
     */
    void set_model(const std::string& model);
    
    /**
     * @brief Set the working directory for AI operations
     * @param path Directory path
     */
    void set_codebase_path(const std::string& path);
    
    /**
     * @brief Add a file to the AI's context
     * @param file File path
     */
    void add_relevant_file(const std::string& file);
    
    /**
     * @brief Set a metadata key-value pair
     * @param key Metadata key
     * @param value Metadata value
     */
    void set_metadata(const std::string& key, const std::string& value);
    
    /**
     * @brief Get list of all active task IDs
     */
    std::vector<std::string> get_active_tasks() const;
    
    /**
     * @brief Get list of completed task IDs
     */
    std::vector<std::string> get_completed_tasks() const;
    
    /**
     * @brief Clear completed task history
     */
    void clear_completed_tasks();

private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;
};

} // namespace ai
} // namespace agrs

#endif // AGRS_AIOPERATOR_H



