#pragma once
#include <filesystem>
#include <optional>
#include <string>

namespace agrs::core {

struct Config {
  std::string logLevel{"info"};
  std::filesystem::path logDir;

  static Config load(const std::optional<std::filesystem::path>& cliPath = std::nullopt);
  static std::filesystem::path defaultConfigPath();
  static std::filesystem::path defaultLogDir();
};

} // namespace agrs::core
