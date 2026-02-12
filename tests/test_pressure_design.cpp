#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <stdexcept>

#include "agrs_zeus/PressureDesign.h"

using Catch::Approx;

TEST_CASE("PressureDesign: Thickness from pressure (thin-wall baseline)", "[pressure_design]") {
  using namespace agrs::engineering;

  ThicknessFromPressureRequest req;
  req.outside_diameter_value = 762.0;
  req.outside_diameter_unit = "mm";
  req.design_pressure_value = 100.0;
  req.design_pressure_unit = "bar";

  req.allowable_input_type = AllowableStressInputType::SMYS_WITH_FACTORS;
  req.smys_value = 483.0;
  req.smys_unit = "MPa";
  req.design_factor = 0.72;
  req.joint_factor = 1.0;
  req.temperature_derating_factor = 1.0;

  req.method = PressureDesignMethod::THIN_WALL_BARLOW;

  const auto res = compute_required_thickness(req);

  // Expected (no allowances, no mill tolerance, no margins):
  // t = P*D/(2*SMYS*F*E*T)
  REQUIRE(res.required_nominal_thickness_mm == Approx(10.9558).margin(0.01));
  REQUIRE(res.required_net_thickness_m > 0.0);
  REQUIRE(res.allowable_hoop_stress_pa == Approx(347.76e6).margin(1e3));
  REQUIRE(res.effective_design_pressure_pa == Approx(1.0e7).margin(1.0));
  REQUIRE_FALSE(res.intermediates.empty());
}

TEST_CASE("PressureDesign: Thickness from pressure applies allowances and mill tolerance", "[pressure_design]") {
  using namespace agrs::engineering;

  ThicknessFromPressureRequest req;
  req.outside_diameter_value = 762.0;
  req.outside_diameter_unit = "mm";
  req.design_pressure_value = 100.0;
  req.design_pressure_unit = "bar";

  req.allowable_input_type = AllowableStressInputType::SMYS_WITH_FACTORS;
  req.smys_value = 483.0;
  req.smys_unit = "MPa";
  req.design_factor = 0.72;
  req.joint_factor = 1.0;
  req.temperature_derating_factor = 1.0;

  req.safety_margin_fraction = 0.10;      // +10% net thickness
  req.corrosion_allowance_value = 1.0;    // +1 mm
  req.corrosion_allowance_unit = "mm";
  req.additional_thickness_value = 0.5;   // +0.5 mm
  req.additional_thickness_unit = "mm";
  req.mill_tolerance_fraction = 0.125;    // 12.5% under-tolerance

  const auto res = compute_required_thickness(req);

  REQUIRE(res.required_nominal_thickness_mm > 10.9558);
  REQUIRE(res.required_gross_thickness_m > res.required_net_thickness_m);
  REQUIRE(res.required_nominal_thickness_m > res.required_gross_thickness_m);
}

TEST_CASE("PressureDesign: Max pressure from thickness (thin-wall)", "[pressure_design]") {
  using namespace agrs::engineering;

  PressureFromThicknessRequest req;
  req.outside_diameter_value = 762.0;
  req.outside_diameter_unit = "mm";
  req.nominal_wall_thickness_value = 12.7;
  req.nominal_wall_thickness_unit = "mm";

  req.allowable_input_type = AllowableStressInputType::SMYS_WITH_FACTORS;
  req.smys_value = 483.0;
  req.smys_unit = "MPa";
  req.design_factor = 0.72;
  req.joint_factor = 1.0;
  req.temperature_derating_factor = 1.0;

  req.method = PressureDesignMethod::THIN_WALL_BARLOW;

  const auto res = compute_max_pressure(req);

  REQUIRE(res.max_allowable_pressure_bar == Approx(115.9).margin(0.5));
  REQUIRE(res.available_net_thickness_m > 0.0);
}

TEST_CASE("PressureDesign: Thick-wall method rejects invalid stress/pressure relationship", "[pressure_design]") {
  using namespace agrs::engineering;

  ThicknessFromPressureRequest req;
  req.outside_diameter_value = 100.0;
  req.outside_diameter_unit = "mm";
  req.design_pressure_value = 200.0;
  req.design_pressure_unit = "bar";

  req.allowable_input_type = AllowableStressInputType::DIRECT_ALLOWABLE;
  req.allowable_hoop_stress_value = 150.0; // less than pressure (after unit conversion), invalid for Lamé solve
  req.allowable_hoop_stress_unit = "bar";

  req.method = PressureDesignMethod::THICK_WALL_LAME;

  REQUIRE_THROWS_AS(compute_required_thickness(req), std::invalid_argument);
}















