#include <catch2/catch_all.hpp>
#include "agrs_zeus/Logger.h"

TEST_CASE("Logger initializes", "[logger]") {
  auto tmp = std::filesystem::temp_directory_path() / "agrs-zeus-test-logs";
  agrs::core::Logger::init("agrs-zeus-test", "debug", tmp);
  auto lg = agrs::core::Logger::get();
  REQUIRE(lg != nullptr);
  lg->debug("test message");
}
