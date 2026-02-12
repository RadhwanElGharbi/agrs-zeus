/**
 * @file zeus_engineering_bindings.cpp
 * @brief pybind11 bindings for AGRS ZEUS engineering calculation core
 *
 * Phase 1: Pressure Design (gas transmission) calculations.
 * FastAPI should treat this as an in-process, deterministic compute engine.
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <algorithm>
#include <cctype>
#include <stdexcept>
#include <string>

#include "agrs_zeus/PressureDesign.h"

namespace py = pybind11;

namespace {

std::string to_lower(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return s;
}

template <typename T>
void set_if_present(const py::dict& d, const char* key, T& out) {
  if (d.contains(key) && !d[key].is_none()) {
    out = d[key].cast<T>();
  }
}

agrs::engineering::PressureDesignMethod parse_method(const py::handle& v) {
  if (v.is_none()) {
    return agrs::engineering::PressureDesignMethod::THIN_WALL_BARLOW;
  }
  if (py::isinstance<py::int_>(v)) {
    const int vi = v.cast<int>();
    if (vi == 0) return agrs::engineering::PressureDesignMethod::THIN_WALL_BARLOW;
    if (vi == 1) return agrs::engineering::PressureDesignMethod::THICK_WALL_LAME;
    throw std::invalid_argument("Invalid method int; expected 0 (THIN_WALL_BARLOW) or 1 (THICK_WALL_LAME)");
  }
  if (py::isinstance<py::str>(v)) {
    const std::string s = to_lower(v.cast<std::string>());
    if (s == "thin_wall_barlow" || s == "barlow" || s == "thin" || s == "thinwall") {
      return agrs::engineering::PressureDesignMethod::THIN_WALL_BARLOW;
    }
    if (s == "thick_wall_lame" || s == "lame" || s == "thick" || s == "thickwall") {
      return agrs::engineering::PressureDesignMethod::THICK_WALL_LAME;
    }
    throw std::invalid_argument("Invalid method string; expected 'thin_wall_barlow' or 'thick_wall_lame'");
  }
  throw std::invalid_argument("Invalid method type; expected int or str");
}

agrs::engineering::AllowableStressInputType parse_allowable_type(const py::handle& v) {
  if (v.is_none()) {
    return agrs::engineering::AllowableStressInputType::SMYS_WITH_FACTORS;
  }
  if (py::isinstance<py::int_>(v)) {
    const int vi = v.cast<int>();
    if (vi == 0) return agrs::engineering::AllowableStressInputType::DIRECT_ALLOWABLE;
    if (vi == 1) return agrs::engineering::AllowableStressInputType::SMYS_WITH_FACTORS;
    throw std::invalid_argument("Invalid allowable_input_type int; expected 0 (DIRECT_ALLOWABLE) or 1 (SMYS_WITH_FACTORS)");
  }
  if (py::isinstance<py::str>(v)) {
    const std::string s = to_lower(v.cast<std::string>());
    if (s == "direct_allowable" || s == "direct") {
      return agrs::engineering::AllowableStressInputType::DIRECT_ALLOWABLE;
    }
    if (s == "smys_with_factors" || s == "smys") {
      return agrs::engineering::AllowableStressInputType::SMYS_WITH_FACTORS;
    }
    throw std::invalid_argument("Invalid allowable_input_type string; expected 'direct_allowable' or 'smys_with_factors'");
  }
  throw std::invalid_argument("Invalid allowable_input_type type; expected int or str");
}

py::dict named_value_to_dict(const agrs::engineering::NamedValue& nv) {
  py::dict d;
  d["key"] = nv.key;
  d["value"] = nv.value;
  d["unit"] = nv.unit;
  d["note"] = nv.note;
  return d;
}

py::dict thickness_result_to_dict(const agrs::engineering::ThicknessFromPressureResult& r) {
  py::dict d;
  d["required_net_thickness_m"] = r.required_net_thickness_m;
  d["required_gross_thickness_m"] = r.required_gross_thickness_m;
  d["required_nominal_thickness_m"] = r.required_nominal_thickness_m;
  d["required_nominal_thickness_mm"] = r.required_nominal_thickness_mm;
  d["effective_design_pressure_pa"] = r.effective_design_pressure_pa;
  d["allowable_hoop_stress_pa"] = r.allowable_hoop_stress_pa;
  d["thin_wall_ratio_t_over_d"] = r.thin_wall_ratio_t_over_d;

  py::list inter;
  for (const auto& nv : r.intermediates) {
    inter.append(named_value_to_dict(nv));
  }
  d["intermediates"] = inter;
  d["warnings"] = r.warnings;
  return d;
}

py::dict pressure_result_to_dict(const agrs::engineering::PressureFromThicknessResult& r) {
  py::dict d;
  d["max_allowable_pressure_pa"] = r.max_allowable_pressure_pa;
  d["max_allowable_pressure_bar"] = r.max_allowable_pressure_bar;
  d["available_net_thickness_m"] = r.available_net_thickness_m;
  d["allowable_hoop_stress_pa"] = r.allowable_hoop_stress_pa;
  d["thin_wall_ratio_t_over_d"] = r.thin_wall_ratio_t_over_d;

  py::list inter;
  for (const auto& nv : r.intermediates) {
    inter.append(named_value_to_dict(nv));
  }
  d["intermediates"] = inter;
  d["warnings"] = r.warnings;
  return d;
}

} // namespace

PYBIND11_MODULE(zeus_engineering_native, m) {
  m.doc() = "Native C++ engineering calculations for AGRS ZEUS (pybind11)";

  py::enum_<agrs::engineering::PressureDesignMethod>(m, "PressureDesignMethod")
      .value("THIN_WALL_BARLOW", agrs::engineering::PressureDesignMethod::THIN_WALL_BARLOW)
      .value("THICK_WALL_LAME", agrs::engineering::PressureDesignMethod::THICK_WALL_LAME);

  py::enum_<agrs::engineering::AllowableStressInputType>(m, "AllowableStressInputType")
      .value("DIRECT_ALLOWABLE", agrs::engineering::AllowableStressInputType::DIRECT_ALLOWABLE)
      .value("SMYS_WITH_FACTORS", agrs::engineering::AllowableStressInputType::SMYS_WITH_FACTORS);

  m.def(
      "compute_required_thickness",
      [](const py::dict& payload) -> py::dict {
        agrs::engineering::ThicknessFromPressureRequest req;

        // Geometry
        set_if_present(payload, "outside_diameter_value", req.outside_diameter_value);
        set_if_present(payload, "outside_diameter_unit", req.outside_diameter_unit);

        // Loading
        set_if_present(payload, "design_pressure_value", req.design_pressure_value);
        set_if_present(payload, "design_pressure_unit", req.design_pressure_unit);

        // Strength input
        if (payload.contains("allowable_input_type") && !payload["allowable_input_type"].is_none()) {
          req.allowable_input_type = parse_allowable_type(payload["allowable_input_type"]);
        }
        set_if_present(payload, "smys_value", req.smys_value);
        set_if_present(payload, "smys_unit", req.smys_unit);
        set_if_present(payload, "allowable_hoop_stress_value", req.allowable_hoop_stress_value);
        set_if_present(payload, "allowable_hoop_stress_unit", req.allowable_hoop_stress_unit);

        // Factors
        set_if_present(payload, "design_factor", req.design_factor);
        set_if_present(payload, "joint_factor", req.joint_factor);
        set_if_present(payload, "temperature_derating_factor", req.temperature_derating_factor);

        // Margins / allowances
        set_if_present(payload, "surge_margin_fraction", req.surge_margin_fraction);
        set_if_present(payload, "safety_margin_fraction", req.safety_margin_fraction);
        set_if_present(payload, "corrosion_allowance_value", req.corrosion_allowance_value);
        set_if_present(payload, "corrosion_allowance_unit", req.corrosion_allowance_unit);
        set_if_present(payload, "additional_thickness_value", req.additional_thickness_value);
        set_if_present(payload, "additional_thickness_unit", req.additional_thickness_unit);
        set_if_present(payload, "mill_tolerance_fraction", req.mill_tolerance_fraction);

        if (payload.contains("method") && !payload["method"].is_none()) {
          req.method = parse_method(payload["method"]);
        }

        const auto r = agrs::engineering::compute_required_thickness(req);
        return thickness_result_to_dict(r);
      },
      py::arg("payload"),
      "Compute required nominal wall thickness from design pressure (engineer-driven inputs).");

  m.def(
      "compute_max_pressure",
      [](const py::dict& payload) -> py::dict {
        agrs::engineering::PressureFromThicknessRequest req;

        // Geometry
        set_if_present(payload, "outside_diameter_value", req.outside_diameter_value);
        set_if_present(payload, "outside_diameter_unit", req.outside_diameter_unit);
        set_if_present(payload, "nominal_wall_thickness_value", req.nominal_wall_thickness_value);
        set_if_present(payload, "nominal_wall_thickness_unit", req.nominal_wall_thickness_unit);

        // Strength input
        if (payload.contains("allowable_input_type") && !payload["allowable_input_type"].is_none()) {
          req.allowable_input_type = parse_allowable_type(payload["allowable_input_type"]);
        }
        set_if_present(payload, "smys_value", req.smys_value);
        set_if_present(payload, "smys_unit", req.smys_unit);
        set_if_present(payload, "allowable_hoop_stress_value", req.allowable_hoop_stress_value);
        set_if_present(payload, "allowable_hoop_stress_unit", req.allowable_hoop_stress_unit);

        // Factors
        set_if_present(payload, "design_factor", req.design_factor);
        set_if_present(payload, "joint_factor", req.joint_factor);
        set_if_present(payload, "temperature_derating_factor", req.temperature_derating_factor);

        // Allowances / margins
        set_if_present(payload, "corrosion_allowance_value", req.corrosion_allowance_value);
        set_if_present(payload, "corrosion_allowance_unit", req.corrosion_allowance_unit);
        set_if_present(payload, "additional_thickness_value", req.additional_thickness_value);
        set_if_present(payload, "additional_thickness_unit", req.additional_thickness_unit);
        set_if_present(payload, "mill_tolerance_fraction", req.mill_tolerance_fraction);
        set_if_present(payload, "surge_margin_fraction", req.surge_margin_fraction);
        set_if_present(payload, "safety_margin_fraction", req.safety_margin_fraction);

        if (payload.contains("method") && !payload["method"].is_none()) {
          req.method = parse_method(payload["method"]);
        }

        const auto r = agrs::engineering::compute_max_pressure(req);
        return pressure_result_to_dict(r);
      },
      py::arg("payload"),
      "Compute max allowable pressure from nominal wall thickness (engineer-driven inputs).");
}















