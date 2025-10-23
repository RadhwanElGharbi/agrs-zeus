#include "agrs_zeus/Config.h"
#include <cstdlib>
#include <fstream>
#include <nlohmann/json.hpp>

namespace agrs::core {

namespace {

std::filesystem::path xdg_home(const char* key, const char* fallbackRel) {
  if (const char* v = std::getenv(key); v && *v) {
    return std::filesystem::path(v);
  }
  const char* home = std::getenv("HOME");
  std::filesystem::path base = home && *home ? std::filesystem::path(home) : std::filesystem::current_path();
  return base / fallbackRel;
}

std::filesystem::path xdg_config_home() { return xdg_home("XDG_CONFIG_HOME", ".config"); }
std::filesystem::path xdg_state_home()  { return xdg_home("XDG_STATE_HOME", ".local/state"); }

std::filesystem::path try_readable(const std::filesystem::path& p) {
  std::error_code ec;
  if (!p.empty() && std::filesystem::exists(p, ec) && std::filesystem::is_regular_file(p, ec)) {
    return p;
  }
  return {};
}

} // namespace

std::filesystem::path Config::defaultConfigPath() {
  // 1) XDG config
  auto xdg = xdg_config_home() / "agrs-zeus" / "config.json";
  if (auto p = try_readable(xdg); !p.empty()) return p;

  // 2) /etc
  auto etcp = std::filesystem::path("/etc/agrs-zeus/config.json");
  if (auto p = try_readable(etcp); !p.empty()) return p;

  // 3) relative (dev runs)
  auto rel = std::filesystem::current_path() / "config" / "default.json";
  if (auto p = try_readable(rel); !p.empty()) return p;

  return {};
}

std::filesystem::path Config::defaultLogDir() {
  return xdg_state_home() / "agrs-zeus" / "logs";
}

Config Config::load(const std::optional<std::filesystem::path>& cliPath) {
  Config cfg;
  cfg.logDir = defaultLogDir();

  std::filesystem::path path;
  if (cliPath && !cliPath->empty()) {
    path = *cliPath;
  } else {
    path = defaultConfigPath();
  }

  if (!path.empty()) {
    std::ifstream in(path);
    if (in.good()) {
      nlohmann::json j;
      in >> j;
      if (j.contains("logging")) {
        auto& l = j["logging"];
        if (l.contains("level") && l["level"].is_string()) {
          cfg.logLevel = l["level"].get<std::string>();
        }
        if (l.contains("dir") && l["dir"].is_string()) {
          cfg.logDir = std::filesystem::path(l["dir"].get<std::string>());
        }
      }
    }
  }
  return cfg;
}

} // namespace agrs::core
