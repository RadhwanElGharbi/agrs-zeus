#include "agrs_zeus/AIOperator.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <sstream>
#include <thread>
#include <mutex>
#include <unordered_map>
#include <chrono>

namespace agrs {
namespace ai {

namespace {
static std::string now_iso_utc() {
    using namespace std::chrono;
    auto now = system_clock::now();
    std::time_t t = system_clock::to_time_t(now);
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&t));
    return std::string(buf);
}

static std::string shell_escape(const std::string& s) {
    std::string out;
    out.reserve(s.size() + 2);
    out.push_back('\'');
    for (char c : s) {
        if (c == '\'') out += "'\\\''"; else out.push_back(c);
    }
    out.push_back('\'');
    return out;
}
}

struct AIOperator::Impl {
    std::string model{"claude-4.5-sonnet"};
    std::string codebasePath;
    std::vector<std::string> relevantFiles;
    std::map<std::string, std::string> metadata;
    bool sessionActive{false};
    std::mutex mutex;

    struct StoredResult {
        TaskResult result;
        bool ready{false};
    };
    std::unordered_map<std::string, StoredResult> results;

    bool check_binary_available(const char* bin) const {
        std::string cmd = std::string("which ") + bin + " > /dev/null 2>&1";
        int rc = std::system(cmd.c_str());
        return rc == 0;
    }

    std::string run_command_capture(const std::string& cmd, const std::string& start_dir, int& exit_code) const {
        std::string full = cmd;
        if (!start_dir.empty()) {
            full = "sh -lc " + shell_escape("cd " + start_dir + " && " + cmd);
        } else {
            full = "sh -lc " + shell_escape(cmd);
        }

        FILE* pipe = popen(full.c_str(), "r");
        if (!pipe) {
            exit_code = -1;
            return std::string("Failed to start subprocess");
        }
        std::ostringstream oss;
        char buffer[4096];
        while (fgets(buffer, sizeof(buffer), pipe)) {
            oss << buffer;
        }
        exit_code = pclose(pipe);
        return oss.str();
    }
};

AIOperator::AIOperator() : pImpl(std::make_unique<Impl>()) {}
AIOperator::~AIOperator() = default;

bool AIOperator::is_available() const {
    return pImpl->check_binary_available("cursor-agent");
}

std::string AIOperator::get_version() const {
    if (!is_available()) return std::string();
    int ec = 0;
    std::string out = pImpl->run_command_capture("cursor-agent --version", "", ec);
    if (ec != 0) return std::string();
    return out;
}

std::string AIOperator::get_install_instructions() {
    return "Cursor Agent CLI not found. Install with:\n"
           "  curl https://cursor.com/install -fsS | bash\n"
           "Then ensure 'cursor-agent' is on PATH and API keys are configured.";
}

std::string AIOperator::submit_task(const std::string& prompt,
                                    const TaskContext& context,
                                    TaskPriority /*priority*/) {
    std::lock_guard<std::mutex> lock(pImpl->mutex);
    // Create a simple task id
    std::string task_id = std::string("task_") + now_iso_utc();

    TaskResult tr{};
    tr.status = TaskStatus::FAILED;
    tr.execution_time_seconds = 0.0;
    tr.timestamp = std::chrono::system_clock::now();

    auto t0 = std::chrono::steady_clock::now();

    if (!is_available()) {
        tr.error_message = get_install_instructions();
        pImpl->results[task_id] = Impl::StoredResult{tr, true};
        return task_id;
    }

    std::string cmd = "cursor-agent chat ";
    // Prefer model if supported by CLI env/config; we keep it simple here
    cmd += shell_escape(prompt);

    int ec = 0;
    std::string start_dir = context.project_path.empty() ? pImpl->codebasePath : context.project_path;
    std::string output = pImpl->run_command_capture(cmd, start_dir, ec);

    auto t1 = std::chrono::steady_clock::now();
    tr.execution_time_seconds = std::chrono::duration<double>(t1 - t0).count();
    tr.timestamp = std::chrono::system_clock::now();

    if (ec == 0) {
        tr.status = TaskStatus::COMPLETED;
        tr.output = output;
    } else {
        tr.status = TaskStatus::FAILED;
        tr.error_message = output;
        tr.output = output;
    }

    pImpl->results[task_id] = Impl::StoredResult{tr, true};
    return task_id;
}

TaskResult AIOperator::get_result(const std::string& task_id, bool /*wait*/) {
    std::lock_guard<std::mutex> lock(pImpl->mutex);
    auto it = pImpl->results.find(task_id);
    if (it != pImpl->results.end()) {
        return it->second.result;
    }
    TaskResult tr{};
    tr.status = TaskStatus::FAILED;
    tr.error_message = "Unknown task_id";
    tr.timestamp = std::chrono::system_clock::now();
    return tr;
}

bool AIOperator::cancel_task(const std::string& /*task_id*/) {
    // Minimal implementation: no background processes retained yet
    return false;
}

void AIOperator::execute_task_streaming(const std::string& prompt,
                                        const TaskContext& context,
                                        std::function<void(const std::string&)> output_callback) {
    if (!output_callback) return;
    if (!is_available()) {
        output_callback(get_install_instructions());
        return;
    }

    std::string cmd = "cursor-agent chat ";
    cmd += shell_escape(prompt);

    std::string start_dir = context.project_path.empty() ? pImpl->codebasePath : context.project_path;
    std::string full = "sh -lc " + shell_escape((start_dir.empty() ? cmd : ("cd " + start_dir + " && " + cmd)));

    FILE* pipe = popen(full.c_str(), "r");
    if (!pipe) {
        output_callback("Failed to start subprocess");
        return;
    }
    char buffer[4096];
    while (fgets(buffer, sizeof(buffer), pipe)) {
        output_callback(std::string(buffer));
    }
    pclose(pipe);
}

void AIOperator::start_interactive_session(const TaskContext& context) {
    (void)context;
    pImpl->sessionActive = false; // Not implemented yet
}

std::string AIOperator::send_message(const std::string& message) {
    (void)message;
    return std::string("Interactive session not implemented yet.");
}

void AIOperator::end_interactive_session() {
    pImpl->sessionActive = false;
}

bool AIOperator::is_session_active() const {
    return pImpl->sessionActive;
}

void AIOperator::set_model(const std::string& model) {
    pImpl->model = model;
}

void AIOperator::set_codebase_path(const std::string& path) {
    pImpl->codebasePath = path;
}

void AIOperator::add_relevant_file(const std::string& file) {
    pImpl->relevantFiles.push_back(file);
}

void AIOperator::set_metadata(const std::string& key, const std::string& value) {
    pImpl->metadata[key] = value;
}

std::vector<std::string> AIOperator::get_active_tasks() const {
    return {}; // Not tracking active async tasks yet
}

std::vector<std::string> AIOperator::get_completed_tasks() const {
    std::vector<std::string> ids;
    for (const auto& kv : pImpl->results) ids.push_back(kv.first);
    return ids;
}

void AIOperator::clear_completed_tasks() {
    std::lock_guard<std::mutex> lock(pImpl->mutex);
    pImpl->results.clear();
}

} // namespace ai
} // namespace agrs




