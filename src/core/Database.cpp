#include "agrs_zeus/Database.h"
#include <system_error>
#include <spdlog/spdlog.h>

namespace agrs::core {

namespace {
std::filesystem::path xdg_state_home() {
  if (const char* v = std::getenv("XDG_STATE_HOME"); v && *v) return std::filesystem::path(v);
  const char* home = std::getenv("HOME");
  std::filesystem::path base = home && *home ? std::filesystem::path(home) : std::filesystem::current_path();
  return base / ".local/state";
}
}

std::filesystem::path Database::defaultDbPath() {
  return xdg_state_home() / "agrs-zeus" / "data" / "agrs_zeus.db";
}

void Database::ensureParentDirectoryExists(const std::filesystem::path& filePath) {
  std::error_code ec;
  std::filesystem::create_directories(filePath.parent_path(), ec);
}

Database::Database(const std::filesystem::path& databasePath) : path_(databasePath) {
  ensureParentDirectoryExists(path_);
  int rc = sqlite3_open(path_.string().c_str(), &db_);
  if (rc != SQLITE_OK) {
    spdlog::error("Failed to open DB {}: {}", path_.string(), sqlite3_errmsg(db_));
    throw std::runtime_error("Failed to open database");
  }
  // spdlog::debug("Opened DB at {}", path_.string());
}

Database::~Database() {
  if (db_) sqlite3_close(db_);
}

bool Database::exec(const std::string& sql, std::string& errorOut) {
  char* errMsg = nullptr;
  int rc = sqlite3_exec(db_, sql.c_str(), nullptr, nullptr, &errMsg);
  if (rc != SQLITE_OK) {
    if (errMsg) {
      errorOut = errMsg;
      sqlite3_free(errMsg);
    } else {
      errorOut = "Unknown SQLite error";
    }
    return false;
  }
  return true;
}

} // namespace agrs::core
