#pragma once

/**
 * @file PressureDesign.h
 * @brief Engineer-driven pressure design calculations (C++ authoritative core)
 *
 * This module intentionally does NOT encode any specific standard as a hard rule.
 * It provides physics-based relationships with explicit, engineer-supplied factors
 * and produces a transparent intermediate breakdown + warnings for validation.
 *
 * Phase 1 scope: gas transmission pressure design (thin-wall + optional thick-wall).
 */

#include <string>
#include <vector>

namespace agrs::engineering {

// ============================================================================
// TYPES
// ============================================================================

enum class PressureDesignMethod {
  THIN_WALL_BARLOW = 0,
  THICK_WALL_LAME = 1,
};

enum class AllowableStressInputType {
  DIRECT_ALLOWABLE = 0,  // engineer enters final allowable hoop stress
  SMYS_WITH_FACTORS = 1, // engineer enters SMYS; module applies factors to compute allowable
};

struct NamedValue {
  std::string key;
  double value = 0.0;
  std::string unit;
  std::string note;
};

// ============================================================================
// REQUESTS
// ============================================================================

struct ThicknessFromPressureRequest {
  // Geometry
  double outside_diameter_value = 0.0;
  std::string outside_diameter_unit = "mm"; // mm|m|in

  // Loading
  double design_pressure_value = 0.0;
  std::string design_pressure_unit = "bar"; // Pa|kPa|MPa|bar|psi

  // Strength input
  AllowableStressInputType allowable_input_type = AllowableStressInputType::SMYS_WITH_FACTORS;
  double smys_value = 0.0;
  std::string smys_unit = "MPa"; // Pa|kPa|MPa|bar|psi
  double allowable_hoop_stress_value = 0.0;
  std::string allowable_hoop_stress_unit = "MPa"; // Pa|kPa|MPa|bar|psi

  // Factors (dimensionless, engineer-controlled)
  double design_factor = 0.72;               // F
  double joint_factor = 1.0;                 // E
  double temperature_derating_factor = 1.0;  // T

  // Margins / allowances
  double surge_margin_fraction = 0.0;   // increases pressure: P_eff = P*(1+surge)
  double safety_margin_fraction = 0.0;  // increases net thickness: t_net *= (1+safety)

  double corrosion_allowance_value = 0.0;
  std::string corrosion_allowance_unit = "mm";
  double additional_thickness_value = 0.0;
  std::string additional_thickness_unit = "mm";

  double mill_tolerance_fraction = 0.0; // e.g., 0.125 for 12.5% under-tolerance

  PressureDesignMethod method = PressureDesignMethod::THIN_WALL_BARLOW;
};

struct PressureFromThicknessRequest {
  // Geometry
  double outside_diameter_value = 0.0;
  std::string outside_diameter_unit = "mm"; // mm|m|in

  double nominal_wall_thickness_value = 0.0;
  std::string nominal_wall_thickness_unit = "mm";

  // Strength input
  AllowableStressInputType allowable_input_type = AllowableStressInputType::SMYS_WITH_FACTORS;
  double smys_value = 0.0;
  std::string smys_unit = "MPa";
  double allowable_hoop_stress_value = 0.0;
  std::string allowable_hoop_stress_unit = "MPa";

  // Factors (dimensionless)
  double design_factor = 0.72;
  double joint_factor = 1.0;
  double temperature_derating_factor = 1.0;

  // Allowances / margins
  double corrosion_allowance_value = 0.0;
  std::string corrosion_allowance_unit = "mm";
  double additional_thickness_value = 0.0;
  std::string additional_thickness_unit = "mm";

  double mill_tolerance_fraction = 0.0;
  double surge_margin_fraction = 0.0; // reduces reported allowable pressure: P_allow / (1+surge)
  double safety_margin_fraction = 0.0; // reduces reported allowable pressure: P_allow / (1+safety)

  PressureDesignMethod method = PressureDesignMethod::THIN_WALL_BARLOW;
};

// ============================================================================
// RESULTS
// ============================================================================

struct ThicknessFromPressureResult {
  // Key outputs (canonical SI)
  double required_net_thickness_m = 0.0;     // from formula before CA/additions
  double required_gross_thickness_m = 0.0;   // net + CA + additional
  double required_nominal_thickness_m = 0.0; // gross adjusted for mill tolerance

  // Convenience outputs
  double required_nominal_thickness_mm = 0.0;

  // Derived
  double effective_design_pressure_pa = 0.0;
  double allowable_hoop_stress_pa = 0.0;
  double thin_wall_ratio_t_over_d = 0.0;

  std::vector<NamedValue> intermediates;
  std::vector<std::string> warnings;
};

struct PressureFromThicknessResult {
  // Key outputs (canonical SI)
  double max_allowable_pressure_pa = 0.0; // after removing margins (surge/safety)
  double max_allowable_pressure_bar = 0.0;

  // Derived
  double available_net_thickness_m = 0.0; // after CA/additional and mill tolerance
  double allowable_hoop_stress_pa = 0.0;
  double thin_wall_ratio_t_over_d = 0.0;

  std::vector<NamedValue> intermediates;
  std::vector<std::string> warnings;
};

// ============================================================================
// API
// ============================================================================

ThicknessFromPressureResult compute_required_thickness(const ThicknessFromPressureRequest& req);
PressureFromThicknessResult compute_max_pressure(const PressureFromThicknessRequest& req);

} // namespace agrs::engineering


