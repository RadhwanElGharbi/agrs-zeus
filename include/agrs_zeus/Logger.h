#pragma once
#include <filesystem>
#include <memory>
#include <string>
#include <spdlog/spdlog.h>

namespace agrs::core {
class Logger {
public:
  static void init(const std::string& name,
                   const std::string& level,
                   const std::filesystem::path& logDir);
  static std::shared_ptr<spdlog::logger> get();
};
}
