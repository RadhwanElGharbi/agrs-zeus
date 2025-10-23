#include "agrs_zeus/Logger.h"
#include <vector>
#include <system_error>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <spdlog/sinks/rotating_file_sink.h>

namespace agrs::core {

namespace {
std::shared_ptr<spdlog::logger> s_logger;

void ensure_dir(const std::filesystem::path& p) {
  std::error_code ec;
  std::filesystem::create_directories(p, ec);
}

spdlog::level::level_enum to_level(std::string lvl) {
  for (auto &c : lvl) c = static_cast<char>(::tolower(c));
  if (lvl == "trace") return spdlog::level::trace;
  if (lvl == "debug") return spdlog::level::debug;
  if (lvl == "info")  return spdlog::level::info;
  if (lvl == "warn")  return spdlog::level::warn;
  if (lvl == "err" || lvl == "error") return spdlog::level::err;
  if (lvl == "critical") return spdlog::level::critical;
  return spdlog::level::info;
}
} // namespace

void Logger::init(const std::string& name,
                  const std::string& level,
                  const std::filesystem::path& logDir) {
  ensure_dir(logDir);
  auto console = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
  auto file = std::make_shared<spdlog::sinks::rotating_file_sink_mt>(
      (logDir / (name + ".log")).string(), 5 * 1024 * 1024, 3);

  std::vector<spdlog::sink_ptr> sinks{console, file};
  s_logger = std::make_shared<spdlog::logger>(name, sinks.begin(), sinks.end());
  s_logger->set_level(to_level(level));
  s_logger->set_pattern("[%Y-%m-%d %H:%M:%S.%e] [%^%l%$] [%n] %v");
  spdlog::set_default_logger(s_logger);
}

std::shared_ptr<spdlog::logger> Logger::get() {
  return s_logger ? s_logger : spdlog::default_logger();
}

} // namespace agrs::core
