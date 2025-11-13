#include "agrs_zeus/PipelineSpecifications.h"
#include <fstream>
#include <cmath>
#include <stdexcept>
#include <algorithm>

namespace agrs {
namespace pirl {

PipelineSpecifications PipelineSpecifications::load_from_json(const std::string& json_path) {
    std::ifstream file(json_path);
    if (!file.is_open()) {
        throw std::runtime_error("Cannot open pipeline_specs.json: " + json_path);
    }
    
    nlohmann::json j;
    file >> j;
    
    PipelineSpecifications specs;
    
    // Physical properties
    specs.diameter_mm = j.value("diameter_mm", 660.4);  // 26 inches
    specs.thickness_mm = j.value("thickness_mm", 11.1);
    specs.material = j.value("material", "Carbon Steel");
    specs.pipeline_type = j.value("type", "Gas");
    
    // Pressure parameters
    specs.mop_bar = j.value("mop_bar", 70.0);
    specs.dp_bar = j.value("dp_bar", 75.0);
    
    // Construction constraints
    specs.depth_of_cover_m = j.value("depth_of_cover_m", 1.5);
    
    // HDD constraints
    specs.hdd_min_bend_radius_m = j.value("hdd_min_bend_radius_m", 1200.0 * (specs.diameter_mm / 1000.0));
    specs.hdd_applicable = j.value("hdd_applicable", false);
    
    // Hot bend constraints
    if (j.contains("hot_bend_angles_deg")) {
        specs.hot_bend_angles_deg = j["hot_bend_angles_deg"].get<std::vector<double>>();
    } else {
        specs.hot_bend_angles_deg = {5.0, 10.0, 22.5, 45.0, 90.0};  // Standard angles
    }
    specs.hot_bend_min_radius_m = j.value("hot_bend_min_radius_m", 3.0 * (specs.diameter_mm / 1000.0));
    specs.hot_bend_max_count = j.value("hot_bend_max_count", 50);
    
    // Field bend constraints
    specs.field_bend_max_angle_deg = j.value("field_bend_max_angle_deg", 5.0);
    
    // Clearance requirements
    specs.house_min_distance_m = j.value("house_min_distance_m", 15.0);
    specs.poles_min_distance_m = j.value("poles_min_distance_m", 5.0);
    specs.powerlines_min_distance_m = j.value("powerlines_min_distance_m", 10.0);
    
    // SAIPEM-specific constraints
    specs.max_slope_percent = j.value("max_slope_percent", 20.0);
    specs.prefer_orthogonal_crossings = j.value("prefer_orthogonal_crossings", true);
    specs.prefer_existing_rows = j.value("prefer_existing_rows", true);
    specs.orthogonal_crossing_threshold_deg = j.value("orthogonal_crossing_threshold_deg", 45.0);
    specs.existing_row_bonus_usd_per_m = j.value("existing_row_bonus_usd_per_m", 50.0);
    
    // Hydraulic parameters
    specs.flow_rate_m3_s = j.value("flow_rate_m3_s", 0.5);
    specs.operating_temp_k = j.value("operating_temp_k", 288.15);  // 15°C
    specs.max_pressure_drop_mpa = j.value("max_pressure_drop_mpa", 5.0);
    
    // Comprehensive Hydraulics Configuration (NEW)
    if (j.contains("hydraulics")) {
        auto h = j["hydraulics"];
        specs.hydraulics.enable_hydraulics = h.value("enable_hydraulics", false);
        specs.hydraulics.enable_compressor_placement = h.value("enable_compressor_placement", false);
        specs.hydraulics.initial_pressure_bar = h.value("initial_pressure_bar", 70.0);
        specs.hydraulics.min_delivery_pressure_bar = h.value("min_delivery_pressure_bar", 45.0);
        specs.hydraulics.max_operating_pressure_bar = h.value("max_operating_pressure_bar", 75.0);
        specs.hydraulics.volumetric_flow_rate_m3_s = h.value("volumetric_flow_rate_m3_s", 1.0);
        specs.hydraulics.operating_temperature_k = h.value("operating_temperature_k", 288.15);
        specs.hydraulics.gas_molecular_weight_kg_kmol = h.value("gas_molecular_weight_kg_kmol", 16.8);
        specs.hydraulics.gas_specific_gravity = h.value("gas_specific_gravity", 0.58);
        specs.hydraulics.pipe_roughness_mm = h.value("pipe_roughness_mm", 0.045);
        
        // Calculate internal diameter from OD and thickness
        double diameter_internal_mm = specs.diameter_mm - 2.0 * specs.thickness_mm;
        specs.hydraulics.diameter_internal_m = diameter_internal_mm / 1000.0;
        
        specs.hydraulics.compressor_capex_per_kw_usd = h.value("compressor_capex_per_kw_usd", 5000.0);
        specs.hydraulics.compressor_opex_fraction = h.value("compressor_opex_fraction", 0.03);
        specs.hydraulics.energy_cost_usd_per_kwh = h.value("energy_cost_usd_per_kwh", 0.05);
    }
    
    return specs;
}

bool PipelineSpecifications::validate_route_curvature(double radius_m, bool is_hdd_section) const {
    if (is_hdd_section && hdd_applicable) {
        return radius_m >= hdd_min_bend_radius_m;
    }
    // For regular sections, use hot bend radius as minimum
    return radius_m >= hot_bend_min_radius_m;
}

bool PipelineSpecifications::validate_hot_bend_angle(double angle_deg) const {
    // Check if angle matches any available hot bend angle (within 0.5° tolerance)
    const double tolerance = 0.5;
    for (double available_angle : hot_bend_angles_deg) {
        if (std::abs(angle_deg - available_angle) <= tolerance) {
            return true;
        }
    }
    return false;
}

bool PipelineSpecifications::validate_field_bend_angle(double angle_deg) const {
    return angle_deg <= field_bend_max_angle_deg;
}

bool PipelineSpecifications::validate_clearance_house(double distance_m) const {
    return distance_m >= house_min_distance_m;
}

bool PipelineSpecifications::validate_clearance_powerline(double distance_m) const {
    return distance_m >= powerlines_min_distance_m;
}

bool PipelineSpecifications::validate_hot_bend_count(int count) const {
    return count <= hot_bend_max_count;
}

bool PipelineSpecifications::validate_slope(double slope_percent) const {
    return slope_percent <= max_slope_percent;
}

}  // namespace pirl
}  // namespace agrs


