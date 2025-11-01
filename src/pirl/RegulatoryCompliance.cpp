#include "agrs_zeus/RegulatoryCompliance.h"
#include "agrs_zeus/PIRL.h"
#include <cmath>
#include <algorithm>
#include <iostream>

namespace agrs {
namespace pirl {

RegulatoryCompliance::RegulatoryCompliance(const std::string& country_code, 
                                         const std::string& region)
    : country_code_(country_code), region_(region) {
    
    initialize_default_thresholds();
    initialize_default_costs();
}

void RegulatoryCompliance::initialize_default_thresholds() {
    // Default thresholds based on country
    if (country_code_ == "ITA") {
        // Italian regulations (NTC 2018, Natura 2000)
        thresholds_.max_slope_seismic_zone1_deg = 25.0;
        thresholds_.max_slope_seismic_zone2_deg = 30.0;
        thresholds_.enhanced_seismic_slope_deg = 35.0;
        thresholds_.min_buffer_protected_area_m = 100.0;
        thresholds_.critical_protected_area_m = 50.0;
        thresholds_.min_buffer_water_source_m = 50.0;
        thresholds_.critical_water_source_m = 25.0;
        thresholds_.max_population_density_standard = 500.0;
        thresholds_.max_population_density_urban = 1000.0;
        thresholds_.max_geohazard_risk_standard = 0.5;
        thresholds_.critical_geohazard_risk = 0.7;
    }
    else if (country_code_ == "USA") {
        // US regulations (FERC, state codes)
        thresholds_.max_slope_seismic_zone1_deg = 30.0;
        thresholds_.max_slope_seismic_zone2_deg = 35.0;
        thresholds_.enhanced_seismic_slope_deg = 40.0;
        thresholds_.min_buffer_protected_area_m = 100.0;
        thresholds_.critical_protected_area_m = 30.0;
        thresholds_.min_buffer_water_source_m = 100.0;  // Stricter in US
        thresholds_.critical_water_source_m = 50.0;
        thresholds_.max_population_density_standard = 400.0;
        thresholds_.max_population_density_urban = 800.0;
        thresholds_.max_geohazard_risk_standard = 0.5;
        thresholds_.critical_geohazard_risk = 0.7;
    }
    else if (country_code_ == "CAN") {
        // Canadian regulations (similar to US)
        thresholds_.max_slope_seismic_zone1_deg = 28.0;
        thresholds_.max_slope_seismic_zone2_deg = 33.0;
        thresholds_.enhanced_seismic_slope_deg = 38.0;
        thresholds_.min_buffer_protected_area_m = 100.0;
        thresholds_.critical_protected_area_m = 30.0;
        thresholds_.min_buffer_water_source_m = 100.0;
        thresholds_.critical_water_source_m = 50.0;
        thresholds_.max_population_density_standard = 400.0;
        thresholds_.max_population_density_urban = 800.0;
        thresholds_.max_geohazard_risk_standard = 0.5;
        thresholds_.critical_geohazard_risk = 0.7;
    }
    else {
        // Generic conservative defaults
        thresholds_.max_slope_seismic_zone1_deg = 25.0;
        thresholds_.max_slope_seismic_zone2_deg = 30.0;
        thresholds_.enhanced_seismic_slope_deg = 35.0;
        thresholds_.min_buffer_protected_area_m = 100.0;
        thresholds_.critical_protected_area_m = 50.0;
        thresholds_.min_buffer_water_source_m = 50.0;
        thresholds_.critical_water_source_m = 25.0;
        thresholds_.max_population_density_standard = 500.0;
        thresholds_.max_population_density_urban = 1000.0;
        thresholds_.max_geohazard_risk_standard = 0.5;
        thresholds_.critical_geohazard_risk = 0.7;
    }
}

void RegulatoryCompliance::initialize_default_costs() {
    // Costs in $/m based on regulatory research
    // Italy-specific costs (from test_project2 regulatory docs)
    
    // Seismic violations (NTC 2018)
    violation_costs_[ViolationType::SEISMIC_SLOPE_MODERATE] = 200.0;  // Enhanced engineering
    violation_costs_[ViolationType::SEISMIC_SLOPE_SEVERE] = 500.0;     // Specialized design
    
    // Protected areas (Natura 2000)
    violation_costs_[ViolationType::PROTECTED_AREA_BUFFER] = 200.0;   // Environmental mitigation
    violation_costs_[ViolationType::PROTECTED_AREA_DIRECT] = 500.0;   // Special permits, EIA
    
    // Water protection
    violation_costs_[ViolationType::WATER_SOURCE_BUFFER] = 100.0;     // Water quality measures
    violation_costs_[ViolationType::WATER_SOURCE_CRITICAL] = 300.0;   // Stringent controls
    
    // Urban areas
    violation_costs_[ViolationType::URBAN_STANDARD] = 150.0;          // Enhanced safety
    violation_costs_[ViolationType::URBAN_DENSE] = 400.0;             // Major urban complications
    
    // Geohazards
    violation_costs_[ViolationType::GEOHAZARD_MODERATE] = 250.0;      // Geotechnical stabilization
    violation_costs_[ViolationType::GEOHAZARD_HIGH] = 600.0;          // Seismic protection systems
    violation_costs_[ViolationType::FAULT_ZONE_ACTIVE] = 800.0;       // Maximum protection
}

std::vector<RegulatoryCompliance::RegulatoryViolation> 
RegulatoryCompliance::check_segment(
    const State& state,
    const GISDataManager& gis,
    const PipelineSpecifications& specs) const {
    
    std::vector<RegulatoryViolation> violations;
    
    // Check all violation types
    auto seismic_v = check_seismic_violations(state, gis);
    auto protected_v = check_protected_area_violations(state, gis);
    auto urban_v = check_urban_violations(state, gis);
    auto water_v = check_water_violations(state, gis);
    auto geohazard_v = check_geohazard_violations(state, gis);
    
    // Combine all violations
    violations.insert(violations.end(), seismic_v.begin(), seismic_v.end());
    violations.insert(violations.end(), protected_v.begin(), protected_v.end());
    violations.insert(violations.end(), urban_v.begin(), urban_v.end());
    violations.insert(violations.end(), water_v.begin(), water_v.end());
    violations.insert(violations.end(), geohazard_v.begin(), geohazard_v.end());
    
    return violations;
}

double RegulatoryCompliance::calculate_regulatory_cost(
    const std::vector<RegulatoryViolation>& violations) const {
    
    double total_cost = 0.0;
    
    for (const auto& violation : violations) {
        total_cost += violation.mitigation_cost_usd;
    }
    
    return total_cost;
}

double RegulatoryCompliance::get_violation_cost(ViolationType type) const {
    auto it = violation_costs_.find(type);
    if (it != violation_costs_.end()) {
        return it->second;
    }
    return 0.0;
}

int RegulatoryCompliance::get_seismic_zone(double x, double y, const GISDataManager& gis) const {
    // Get geohazard risk value (0-1) and map to seismic zone
    // In Italy, Central Apennines is Zone 1 (highest)
    // For now, use geohazard_risk as proxy
    // TODO: Load actual seismic zone map from regulatory docs
    
    // Simplified: assume high geohazard = Zone 1
    // Real implementation would query seismic zone shapefile
    return 1;  // Zone 1 (highest) for test_project2 in Central Apennines
}

std::vector<RegulatoryCompliance::RegulatoryViolation>
RegulatoryCompliance::check_seismic_violations(
    const State& state, const GISDataManager& gis) const {
    
    std::vector<RegulatoryViolation> violations;
    
    int seismic_zone = get_seismic_zone(state.x, state.y, gis);
    
    if (seismic_zone == 1) {
        // Seismic Zone 1 (highest risk) - strictest rules
        if (state.slope > thresholds_.enhanced_seismic_slope_deg) {
            RegulatoryViolation v;
            v.regulation_id = "NTC_2018_Seismic_Zone1_Severe";
            v.description = "Slope exceeds " + std::to_string(thresholds_.enhanced_seismic_slope_deg) + 
                          "° in Seismic Zone 1 - specialized seismic design required";
            v.severity = 0.9;
            v.mitigation_cost_usd = get_violation_cost(ViolationType::SEISMIC_SLOPE_SEVERE);
            v.permit_delay_months = 3.0;
            v.location_x = state.x;
            v.location_y = state.y;
            violations.push_back(v);
        }
        else if (state.slope > thresholds_.max_slope_seismic_zone1_deg) {
            RegulatoryViolation v;
            v.regulation_id = "NTC_2018_Seismic_Zone1_Moderate";
            v.description = "Slope exceeds " + std::to_string(thresholds_.max_slope_seismic_zone1_deg) + 
                          "° in Seismic Zone 1 - enhanced engineering required";
            v.severity = 0.6;
            v.mitigation_cost_usd = get_violation_cost(ViolationType::SEISMIC_SLOPE_MODERATE);
            v.permit_delay_months = 1.5;
            v.location_x = state.x;
            v.location_y = state.y;
            violations.push_back(v);
        }
    }
    else if (seismic_zone == 2) {
        // Seismic Zone 2 (moderate risk)
        if (state.slope > thresholds_.max_slope_seismic_zone2_deg) {
            RegulatoryViolation v;
            v.regulation_id = "NTC_2018_Seismic_Zone2";
            v.description = "Slope exceeds " + std::to_string(thresholds_.max_slope_seismic_zone2_deg) + 
                          "° in Seismic Zone 2";
            v.severity = 0.5;
            v.mitigation_cost_usd = get_violation_cost(ViolationType::SEISMIC_SLOPE_MODERATE);
            v.permit_delay_months = 1.0;
            v.location_x = state.x;
            v.location_y = state.y;
            violations.push_back(v);
        }
    }
    
    return violations;
}

std::vector<RegulatoryCompliance::RegulatoryViolation>
RegulatoryCompliance::check_protected_area_violations(
    const State& state, const GISDataManager& gis) const {
    
    std::vector<RegulatoryViolation> violations;
    
    // Check if in protected area or buffer zone
    bool in_protected = gis.is_no_go_zone(state.x, state.y);  // Protected areas marked as no-go
    
    if (in_protected) {
        // Direct violation - within protected area boundary
        RegulatoryViolation v;
        v.regulation_id = "Natura2000_Direct";
        v.description = "Route passes through protected area (Natura 2000) - requires special permits and extensive EIA";
        v.severity = 0.8;
        v.mitigation_cost_usd = get_violation_cost(ViolationType::PROTECTED_AREA_DIRECT);
        v.permit_delay_months = 6.0;
        v.location_x = state.x;
        v.location_y = state.y;
        violations.push_back(v);
    }
    // Note: Buffer zone check would require distance calculation to protected area boundary
    // For now, using simplified check
    
    return violations;
}

std::vector<RegulatoryCompliance::RegulatoryViolation>
RegulatoryCompliance::check_urban_violations(
    const State& state, const GISDataManager& gis) const {
    
    std::vector<RegulatoryViolation> violations;
    
    // Population density is already normalized in state (0-1)
    // Convert back to people/km² for threshold comparison
    // Assuming max population in data is ~1000 people/km²
    double pop_density_per_km2 = state.population_density * 1000.0;
    
    if (pop_density_per_km2 > thresholds_.max_population_density_urban) {
        RegulatoryViolation v;
        v.regulation_id = "Urban_Dense";
        v.description = "High population density area (>" + 
                       std::to_string(thresholds_.max_population_density_urban) + 
                       " people/km²) - major urban routing complications";
        v.severity = 0.7;
        v.mitigation_cost_usd = get_violation_cost(ViolationType::URBAN_DENSE);
        v.permit_delay_months = 4.0;
        v.location_x = state.x;
        v.location_y = state.y;
        violations.push_back(v);
    }
    else if (pop_density_per_km2 > thresholds_.max_population_density_standard) {
        RegulatoryViolation v;
        v.regulation_id = "Urban_Standard";
        v.description = "Moderate population density area - enhanced safety and community engagement required";
        v.severity = 0.4;
        v.mitigation_cost_usd = get_violation_cost(ViolationType::URBAN_STANDARD);
        v.permit_delay_months = 2.0;
        v.location_x = state.x;
        v.location_y = state.y;
        violations.push_back(v);
    }
    
    return violations;
}

std::vector<RegulatoryCompliance::RegulatoryViolation>
RegulatoryCompliance::check_water_violations(
    const State& state, const GISDataManager& gis) const {
    
    std::vector<RegulatoryViolation> violations;
    
    // Water proximity is normalized (0-1) in state
    // Convert to actual distance (assuming max distance ~500m)
    double water_distance_m = state.water_proximity * 500.0;
    
    if (water_distance_m < thresholds_.critical_water_source_m) {
        RegulatoryViolation v;
        v.regulation_id = "Water_Protection_Critical";
        v.description = "Too close to water source (<" + 
                       std::to_string(thresholds_.critical_water_source_m) + 
                       "m) - stringent environmental controls required";
        v.severity = 0.8;
        v.mitigation_cost_usd = get_violation_cost(ViolationType::WATER_SOURCE_CRITICAL);
        v.permit_delay_months = 3.0;
        v.location_x = state.x;
        v.location_y = state.y;
        violations.push_back(v);
    }
    else if (water_distance_m < thresholds_.min_buffer_water_source_m) {
        RegulatoryViolation v;
        v.regulation_id = "Water_Protection_Buffer";
        v.description = "Within water source buffer zone - water quality protection measures required";
        v.severity = 0.5;
        v.mitigation_cost_usd = get_violation_cost(ViolationType::WATER_SOURCE_BUFFER);
        v.permit_delay_months = 1.5;
        v.location_x = state.x;
        v.location_y = state.y;
        violations.push_back(v);
    }
    
    return violations;
}

std::vector<RegulatoryCompliance::RegulatoryViolation>
RegulatoryCompliance::check_geohazard_violations(
    const State& state, const GISDataManager& gis) const {
    
    std::vector<RegulatoryViolation> violations;
    
    // Geohazard risk is already 0-1 in state
    if (state.geohazard_risk > thresholds_.critical_geohazard_risk) {
        RegulatoryViolation v;
        v.regulation_id = "Geohazard_High";
        v.description = "High landslide/seismic risk area - seismic protection systems required";
        v.severity = 0.9;
        v.mitigation_cost_usd = get_violation_cost(ViolationType::GEOHAZARD_HIGH);
        v.permit_delay_months = 4.0;
        v.location_x = state.x;
        v.location_y = state.y;
        violations.push_back(v);
    }
    else if (state.geohazard_risk > thresholds_.max_geohazard_risk_standard) {
        RegulatoryViolation v;
        v.regulation_id = "Geohazard_Moderate";
        v.description = "Moderate geohazard risk - geotechnical stabilization required";
        v.severity = 0.6;
        v.mitigation_cost_usd = get_violation_cost(ViolationType::GEOHAZARD_MODERATE);
        v.permit_delay_months = 2.0;
        v.location_x = state.x;
        v.location_y = state.y;
        violations.push_back(v);
    }
    
    return violations;
}

bool RegulatoryCompliance::load_thresholds_from_docs(const std::string& docs_path) {
    // TODO: Parse regulatory documents to extract thresholds
    // For now, using defaults from initialize_default_thresholds()
    std::cout << "⚠️  Loading thresholds from " << docs_path << " not yet implemented." << std::endl;
    std::cout << "    Using default thresholds for " << country_code_ << std::endl;
    return false;
}

}  // namespace pirl
}  // namespace agrs


