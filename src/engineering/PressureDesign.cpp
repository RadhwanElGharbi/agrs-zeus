#include "agrs_zeus/PressureDesign.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace agrs::engineering {
namespace {

constexpr double PA_PER_BAR = 100000.0;
constexpr double PA_PER_PSI = 6894.757293168;
constexpr double INCH_TO_M = 0.0254;

std::string to_lower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return s;
}

void require_finite_positive(const double v, const char* name) {
  if (!std::isfinite(v) || v <= 0.0) {
    std::ostringstream oss;
    oss << name << " must be finite and > 0";
    throw std::invalid_argument(oss.str());
  }
}

void require_finite_nonnegative(const double v, const char* name) {
  if (!std::isfinite(v) || v < 0.0) {
    std::ostringstream oss;
    oss << name << " must be finite and >= 0";
    throw std::invalid_argument(oss.str());
  }
}

double length_to_m(double value, const std::string& unit_raw) {
  require_finite_positive(value, "length");
  const std::string u = to_lower(unit_raw);
  if (u == "m" || u == "meter" || u == "metre") {
    return value;
  }
  if (u == "mm" || u == "millimeter" || u == "millimetre") {
    return value / 1000.0;
  }
  if (u == "in" || u == "inch" || u == "inches") {
    return value * INCH_TO_M;
  }
  std::ostringstream oss;
  oss << "Unsupported length unit: '" << unit_raw << "'";
  throw std::invalid_argument(oss.str());
}

double pressure_to_pa(double value, const std::string& unit_raw) {
  require_finite_positive(value, "pressure");
  const std::string u = to_lower(unit_raw);
  if (u == "pa") {
    return value;
  }
  if (u == "kpa") {
    return value * 1000.0;
  }
  if (u == "mpa") {
    return value * 1e6;
  }
  if (u == "bar") {
    return value * PA_PER_BAR;
  }
  if (u == "psi") {
    return value * PA_PER_PSI;
  }
  std::ostringstream oss;
  oss << "Unsupported pressure unit: '" << unit_raw << "'";
  throw std::invalid_argument(oss.str());
}

double pa_to_bar(double pa) {
  return pa / PA_PER_BAR;
}

double m_to_mm(double m) {
  return m * 1000.0;
}

double compute_allowable_hoop_stress_pa(const AllowableStressInputType type,
                                       const double smys_value,
                                       const std::string& smys_unit,
                                       const double allowable_value,
                                       const std::string& allowable_unit,
                                       const double design_factor,
                                       const double joint_factor,
                                       const double temperature_derating_factor,
                                       std::vector<std::string>& warnings,
                                       std::vector<NamedValue>& inter) {
  // Validate factors
  if (!std::isfinite(design_factor) || design_factor <= 0.0) {
    throw std::invalid_argument("design_factor must be finite and > 0");
  }
  if (!std::isfinite(joint_factor) || joint_factor <= 0.0) {
    throw std::invalid_argument("joint_factor must be finite and > 0");
  }
  if (!std::isfinite(temperature_derating_factor) || temperature_derating_factor <= 0.0) {
    throw std::invalid_argument("temperature_derating_factor must be finite and > 0");
  }

  if (design_factor > 1.0) {
    warnings.emplace_back("design_factor > 1.0 is unusual; verify input intent");
  }
  if (joint_factor > 1.0) {
    warnings.emplace_back("joint_factor > 1.0 is unusual; verify input intent");
  }
  if (temperature_derating_factor > 1.0) {
    warnings.emplace_back("temperature_derating_factor > 1.0 is unusual; verify input intent");
  }

  inter.push_back({"design_factor", design_factor, "1", "Engineer-supplied design factor"});
  inter.push_back({"joint_factor", joint_factor, "1", "Engineer-supplied joint factor"});
  inter.push_back({"temperature_derating_factor", temperature_derating_factor, "1", "Engineer-supplied temperature derating"});

  if (type == AllowableStressInputType::DIRECT_ALLOWABLE) {
    const double s_allow = pressure_to_pa(allowable_value, allowable_unit);
    inter.push_back({"allowable_hoop_stress", s_allow, "Pa", "Direct allowable hoop stress (as entered)"});
    return s_allow;
  }

  // SMYS_WITH_FACTORS
  const double smys_pa = pressure_to_pa(smys_value, smys_unit);
  inter.push_back({"smys", smys_pa, "Pa", "Specified minimum yield strength (SMYS) converted to Pa"});

  const double allowable_pa = smys_pa * design_factor * joint_factor * temperature_derating_factor;
  inter.push_back({"allowable_hoop_stress", allowable_pa, "Pa", "Computed allowable hoop stress = SMYS*F*E*T"});
  return allowable_pa;
}

void validate_common_margins(double surge_margin_fraction, double safety_margin_fraction, double mill_tolerance_fraction,
                             std::vector<std::string>& warnings) {
  require_finite_nonnegative(surge_margin_fraction, "surge_margin_fraction");
  require_finite_nonnegative(safety_margin_fraction, "safety_margin_fraction");
  require_finite_nonnegative(mill_tolerance_fraction, "mill_tolerance_fraction");
  if (mill_tolerance_fraction >= 1.0) {
    throw std::invalid_argument("mill_tolerance_fraction must be < 1.0");
  }
  if (surge_margin_fraction > 1.0) {
    warnings.emplace_back("surge_margin_fraction > 1.0 doubles pressure or more; verify input intent");
  }
  if (safety_margin_fraction > 1.0) {
    warnings.emplace_back("safety_margin_fraction > 1.0 doubles thickness or more; verify input intent");
  }
  if (mill_tolerance_fraction > 0.25) {
    warnings.emplace_back("mill_tolerance_fraction > 0.25 is unusual; verify input intent");
  }
}

} // namespace

ThicknessFromPressureResult compute_required_thickness(const ThicknessFromPressureRequest& req) {
  ThicknessFromPressureResult out;

  // Validate/convert primary inputs
  const double d_o_m = length_to_m(req.outside_diameter_value, req.outside_diameter_unit);
  const double p_design_pa = pressure_to_pa(req.design_pressure_value, req.design_pressure_unit);

  out.intermediates.push_back({"outside_diameter", d_o_m, "m", "Outside diameter converted to meters"});
  out.intermediates.push_back({"design_pressure", p_design_pa, "Pa", "Design pressure converted to Pa"});

  validate_common_margins(req.surge_margin_fraction, req.safety_margin_fraction, req.mill_tolerance_fraction,
                          out.warnings);

  // Convert allowances
  const double ca_m = (req.corrosion_allowance_value == 0.0)
                          ? 0.0
                          : length_to_m(req.corrosion_allowance_value, req.corrosion_allowance_unit);
  const double add_m = (req.additional_thickness_value == 0.0)
                           ? 0.0
                           : length_to_m(req.additional_thickness_value, req.additional_thickness_unit);

  require_finite_nonnegative(ca_m, "corrosion_allowance");
  require_finite_nonnegative(add_m, "additional_thickness");

  out.intermediates.push_back({"corrosion_allowance", ca_m, "m", "Corrosion allowance converted to meters"});
  out.intermediates.push_back({"additional_thickness", add_m, "m", "Additional thickness converted to meters"});
  out.intermediates.push_back({"mill_tolerance_fraction", req.mill_tolerance_fraction, "1", "Nominal thickness under-tolerance fraction"});
  out.intermediates.push_back({"surge_margin_fraction", req.surge_margin_fraction, "1", "Effective pressure multiplier margin"});
  out.intermediates.push_back({"safety_margin_fraction", req.safety_margin_fraction, "1", "Net thickness multiplier margin"});

  // Compute allowable stress
  const double s_allow_pa =
      compute_allowable_hoop_stress_pa(req.allowable_input_type, req.smys_value, req.smys_unit,
                                       req.allowable_hoop_stress_value, req.allowable_hoop_stress_unit,
                                       req.design_factor, req.joint_factor, req.temperature_derating_factor,
                                       out.warnings, out.intermediates);
  out.allowable_hoop_stress_pa = s_allow_pa;

  // Effective design pressure (surge margin increases pressure)
  const double p_eff_pa = p_design_pa * (1.0 + req.surge_margin_fraction);
  out.effective_design_pressure_pa = p_eff_pa;
  out.intermediates.push_back({"effective_design_pressure", p_eff_pa, "Pa", "P_eff = P_design*(1+surge_margin_fraction)"});

  // Compute required net thickness
  double t_net_m = 0.0;
  if (req.method == PressureDesignMethod::THIN_WALL_BARLOW) {
    // Thin-wall hoop stress: sigma = P*D/(2*t)  =>  t = P*D/(2*sigma_allow)
    t_net_m = (p_eff_pa * d_o_m) / (2.0 * s_allow_pa);
    out.intermediates.push_back({"t_net_formula", t_net_m, "m", "Thin-wall: t = P*D/(2*allowable)"});
  } else {
    // Thick-wall (Lamé): sigma_theta(r_i) = P*(r_o^2 + r_i^2)/(r_o^2 - r_i^2)
    // Solve for r_i: r_i = r_o*sqrt((sigma - P)/(sigma + P)), thickness = r_o - r_i
    const double r_o = d_o_m / 2.0;
    if (s_allow_pa <= p_eff_pa) {
      throw std::invalid_argument("Thick-wall method requires allowable_hoop_stress > effective_design_pressure (same units)");
    }
    const double ratio = (s_allow_pa - p_eff_pa) / (s_allow_pa + p_eff_pa);
    if (!(ratio > 0.0 && ratio < 1.0) || !std::isfinite(ratio)) {
      throw std::invalid_argument("Invalid thick-wall solution ratio; check inputs");
    }
    const double r_i = r_o * std::sqrt(ratio);
    t_net_m = r_o - r_i;
    out.intermediates.push_back({"t_net_formula", t_net_m, "m", "Thick-wall (Lamé): t = r_o - r_i, r_i = r_o*sqrt((S-P)/(S+P))"});
  }

  if (!std::isfinite(t_net_m) || t_net_m <= 0.0) {
    throw std::invalid_argument("Computed net thickness is non-finite or <= 0; check inputs");
  }

  // Apply safety margin to net thickness
  t_net_m *= (1.0 + req.safety_margin_fraction);
  out.intermediates.push_back({"t_net_after_safety", t_net_m, "m", "t_net *= (1+safety_margin_fraction)"});

  // Sanity / regime warnings
  out.thin_wall_ratio_t_over_d = t_net_m / d_o_m;
  out.intermediates.push_back({"t_over_d", out.thin_wall_ratio_t_over_d, "1", "Thickness ratio for thin-wall assumption"});
  if (out.thin_wall_ratio_t_over_d > 0.1 && req.method == PressureDesignMethod::THIN_WALL_BARLOW) {
    out.warnings.emplace_back("t/D > 0.1; thin-wall assumption may be weak; consider thick-wall method");
  }
  if (out.thin_wall_ratio_t_over_d < 0.005 && req.method == PressureDesignMethod::THICK_WALL_LAME) {
    out.warnings.emplace_back("t/D < 0.005; thick-wall method likely unnecessary; thin-wall is usually adequate");
  }

  // Add allowances
  const double t_gross_m = t_net_m + ca_m + add_m;
  out.required_net_thickness_m = t_net_m;
  out.required_gross_thickness_m = t_gross_m;
  out.intermediates.push_back({"t_gross", t_gross_m, "m", "t_gross = t_net + corrosion_allowance + additional_thickness"});

  // Apply mill tolerance (ensure net thickness after negative tolerance meets requirements)
  const double denom = (1.0 - req.mill_tolerance_fraction);
  if (denom <= 0.0) {
    throw std::invalid_argument("mill_tolerance_fraction results in non-positive (1 - tol); check input");
  }
  const double t_nom_m = t_gross_m / denom;
  out.required_nominal_thickness_m = t_nom_m;
  out.required_nominal_thickness_mm = m_to_mm(t_nom_m);
  out.intermediates.push_back({"t_nominal", t_nom_m, "m", "t_nominal = t_gross / (1 - mill_tolerance_fraction)"});

  return out;
}

PressureFromThicknessResult compute_max_pressure(const PressureFromThicknessRequest& req) {
  PressureFromThicknessResult out;

  const double d_o_m = length_to_m(req.outside_diameter_value, req.outside_diameter_unit);
  const double t_nom_m = length_to_m(req.nominal_wall_thickness_value, req.nominal_wall_thickness_unit);

  out.intermediates.push_back({"outside_diameter", d_o_m, "m", "Outside diameter converted to meters"});
  out.intermediates.push_back({"t_nominal", t_nom_m, "m", "Nominal wall thickness converted to meters"});

  validate_common_margins(req.surge_margin_fraction, req.safety_margin_fraction, req.mill_tolerance_fraction, out.warnings);

  const double ca_m = (req.corrosion_allowance_value == 0.0)
                          ? 0.0
                          : length_to_m(req.corrosion_allowance_value, req.corrosion_allowance_unit);
  const double add_m = (req.additional_thickness_value == 0.0)
                           ? 0.0
                           : length_to_m(req.additional_thickness_value, req.additional_thickness_unit);

  out.intermediates.push_back({"corrosion_allowance", ca_m, "m", "Corrosion allowance converted to meters"});
  out.intermediates.push_back({"additional_thickness", add_m, "m", "Additional thickness converted to meters"});
  out.intermediates.push_back({"mill_tolerance_fraction", req.mill_tolerance_fraction, "1", "Nominal thickness under-tolerance fraction"});
  out.intermediates.push_back({"surge_margin_fraction", req.surge_margin_fraction, "1", "Reported pressure reduced for surge margin"});
  out.intermediates.push_back({"safety_margin_fraction", req.safety_margin_fraction, "1", "Reported pressure reduced for safety margin"});

  // Compute allowable stress
  const double s_allow_pa =
      compute_allowable_hoop_stress_pa(req.allowable_input_type, req.smys_value, req.smys_unit,
                                       req.allowable_hoop_stress_value, req.allowable_hoop_stress_unit,
                                       req.design_factor, req.joint_factor, req.temperature_derating_factor,
                                       out.warnings, out.intermediates);
  out.allowable_hoop_stress_pa = s_allow_pa;

  // Compute available net thickness after negative tolerance and allowances
  const double t_after_tol_m = t_nom_m * (1.0 - req.mill_tolerance_fraction);
  const double t_net_avail_m = t_after_tol_m - ca_m - add_m;
  out.available_net_thickness_m = t_net_avail_m;
  out.intermediates.push_back({"t_after_mill_tolerance", t_after_tol_m, "m", "t_after_tol = t_nominal*(1-mill_tolerance_fraction)"});
  out.intermediates.push_back({"t_net_available", t_net_avail_m, "m", "t_net_available = t_after_tol - corrosion_allowance - additional_thickness"});

  if (!std::isfinite(t_net_avail_m) || t_net_avail_m <= 0.0) {
    out.warnings.emplace_back("Available net thickness <= 0 after allowances; computed max pressure will be 0");
    out.max_allowable_pressure_pa = 0.0;
    out.max_allowable_pressure_bar = 0.0;
    return out;
  }

  out.thin_wall_ratio_t_over_d = t_net_avail_m / d_o_m;
  out.intermediates.push_back({"t_over_d", out.thin_wall_ratio_t_over_d, "1", "Thickness ratio for thin-wall assumption"});
  if (out.thin_wall_ratio_t_over_d > 0.1 && req.method == PressureDesignMethod::THIN_WALL_BARLOW) {
    out.warnings.emplace_back("t/D > 0.1; thin-wall assumption may be weak; consider thick-wall method");
  }

  // Compute raw max pressure (without margins)
  double p_raw_pa = 0.0;
  if (req.method == PressureDesignMethod::THIN_WALL_BARLOW) {
    // sigma = P*D/(2*t)  =>  P = 2*sigma*t/D
    p_raw_pa = (2.0 * s_allow_pa * t_net_avail_m) / d_o_m;
    out.intermediates.push_back({"p_raw_formula", p_raw_pa, "Pa", "Thin-wall: P = 2*allowable*t/D"});
  } else {
    const double r_o = d_o_m / 2.0;
    const double r_i = r_o - t_net_avail_m;
    if (r_i <= 0.0) {
      throw std::invalid_argument("Thick-wall requires positive inner radius; check thickness vs diameter");
    }
    // Invert Lamé hoop stress at inner wall:
    // P = S*(r_o^2 - r_i^2)/(r_o^2 + r_i^2)
    const double ro2 = r_o * r_o;
    const double ri2 = r_i * r_i;
    p_raw_pa = s_allow_pa * (ro2 - ri2) / (ro2 + ri2);
    out.intermediates.push_back({"p_raw_formula", p_raw_pa, "Pa", "Thick-wall (Lamé): P = S*(ro^2-ri^2)/(ro^2+ri^2)"});
  }

  if (!std::isfinite(p_raw_pa) || p_raw_pa < 0.0) {
    throw std::invalid_argument("Computed max pressure is non-finite or negative; check inputs");
  }

  // Reduce reported allowable pressure for margins (engineer wants headroom)
  const double margin_div = (1.0 + req.surge_margin_fraction) * (1.0 + req.safety_margin_fraction);
  if (!std::isfinite(margin_div) || margin_div <= 0.0) {
    throw std::invalid_argument("Invalid margins; (1+surge)*(1+safety) must be > 0");
  }
  const double p_allow_pa = p_raw_pa / margin_div;
  out.max_allowable_pressure_pa = p_allow_pa;
  out.max_allowable_pressure_bar = pa_to_bar(p_allow_pa);
  out.intermediates.push_back({"p_allowable_after_margins", p_allow_pa, "Pa", "P_allow = P_raw / ((1+surge)*(1+safety))"});

  return out;
}

} // namespace agrs::engineering


