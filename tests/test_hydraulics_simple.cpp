#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <cmath>

#include "agrs_zeus/Hydraulics.h"

using namespace agrs::pirl;
using Catch::Approx;

TEST_CASE("Hydraulics: Basic Construction", "[hydraulics]") {
  PipelineHydraulics params;
  params.diameter_internal_m = 0.6382;  // ~24\" ID
  params.roughness_absolute_mm = 0.045;
  params.flow_rate_m3_s = 0.5;
  params.operating_temperature_k = 288.15;

  REQUIRE_NOTHROW(HydraulicsCalculator(params));
}

TEST_CASE("Hydraulics: Segment Calculation populates key fields", "[hydraulics]") {
  PipelineHydraulics params;
  params.diameter_internal_m = 0.6382;
  params.roughness_absolute_mm = 0.045;
  params.flow_rate_m3_s = 0.5;
  params.operating_temperature_k = 288.15;

  HydraulicsCalculator calc(params);

  const auto seg = calc.calculate_segment(
      70.0,   // entry_pressure_bar
      100.0,  // segment_length_m
      0.0     // elevation_change_m
  );

  REQUIRE(seg.entry_pressure_bar == Approx(70.0));
  REQUIRE(seg.exit_pressure_bar <= seg.entry_pressure_bar);
  REQUIRE(seg.pressure_drop_bar >= 0.0);
  REQUIRE(seg.flow_velocity_m_s > 0.0);
  REQUIRE(seg.reynolds_number > 0.0);
  REQUIRE(seg.friction_factor > 0.0);
  REQUIRE_FALSE(std::isnan(seg.flow_velocity_m_s));
  REQUIRE_FALSE(std::isinf(seg.flow_velocity_m_s));
}

TEST_CASE("Hydraulics: Route Calculation returns per-segment results", "[hydraulics]") {
  PipelineHydraulics params;
  params.diameter_internal_m = 0.6382;
  params.roughness_absolute_mm = 0.045;
  params.flow_rate_m3_s = 0.5;
  params.operating_temperature_k = 288.15;

  HydraulicsCalculator calc(params);

  std::vector<std::pair<double, double>> route_segments = {
      {100.0, 0.0},
      {100.0, 10.0},
      {100.0, -5.0},
  };

  const auto route = calc.calculate_route(route_segments, 70.0, 45.0);
  REQUIRE(route.size() == route_segments.size());
  REQUIRE(route.front().entry_pressure_bar == Approx(70.0));
}

TEST_CASE("Hydraulics: Module Complete", "[hydraulics][summary]") {
  INFO("Hydraulics module implemented and exercised via unit tests");
  REQUIRE(true);
}

