#pragma once
#include <filesystem>
#include <string>
#include <sqlite3.h>

namespace agrs::core {

class Database {
public:
  static std::filesystem::path defaultDbPath();

  explicit Database(const std::filesystem::path& databasePath);
  ~Database();

  Database(const Database&) = delete;
  Database& operator=(const Database&) = delete;

  sqlite3* handle() const { return db_; }
  const std::filesystem::path& path() const { return path_; }

  bool exec(const std::string& sql, std::string& errorOut);

private:
  static void ensureParentDirectoryExists(const std::filesystem::path& filePath);

  sqlite3* db_{nullptr};
  std::filesystem::path path_;
};

} // namespace agrs::core
