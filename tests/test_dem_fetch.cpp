#include <catch2/catch_test_macros.hpp>
#include <string>
#include <regex>

// We will test bbox parser indirectly by running a dry-run dem_fetch via system() and checking JSON shape.

static std::string run_cmd(const std::string& cmd) {
	FILE* pipe = popen(cmd.c_str(), "r");
	REQUIRE(pipe != nullptr);
	char buffer[256];
	std::string out;
	while (fgets(buffer, sizeof(buffer), pipe)) out += buffer;
	pclose(pipe);
	return out;
}

TEST_CASE("dem_fetch dry-run returns JSON plan", "[dem_fetch]") {
    std::string cmd = std::string("../build/zeus tools dem_fetch --bbox 55.0,24.8,55.6,25.3 -o /tmp/dem_30m.tif --dry-run | tr -d '\n' ");
	std::string out = run_cmd(cmd);
    REQUIRE(std::regex_search(out, std::regex("\\\"type\\\"\\s*:\\s*\\\"dem_fetch\\\"")));
    REQUIRE(std::regex_search(out, std::regex("\\\"resolution\\\"\\s*:\\s*\\\"30m\\\"")));
    REQUIRE(std::regex_search(out, std::regex("\\\"provider\\\"\\s*:")));
    REQUIRE(std::regex_search(out, std::regex("\\\"bbox\\\"\\s*:")));
}


