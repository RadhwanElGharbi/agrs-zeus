#pragma once

#include "agrs_zeus/Hydraulics.h"
#include "agrs_zeus/RegulatoryCompliance.h"
#include "agrs_zeus/PIRL.h"
#include <cmath>
#include <string>
#include <sstream>

namespace agrs {
namespace pirl {
namespace test {

/**
 * @brief Utility functions for testing
 */
class TestUtils {
public:
    // Floating-point comparison with epsilon
    static bool compare_doubles(double a, double b, double epsilon = 1e-6) {
        return std::abs(a - b) < epsilon;
    }
    
    // Floating-point comparison with relative tolerance
    static bool compare_doubles_relative(double a, double b, double relative_tol = 0.02) {
        if (a == 0.0 && b == 0.0) return true;
        if (a == 0.0 || b == 0.0) return std::abs(a - b) < 1e-10;
        return std::abs((a - b) / a) < relative_tol;
    }
    
    // Check if value is within range
    static bool in_range(double value, double min, double max) {
        return value >= min && value <= max;
    }
    
    // Check if value is within percentage of target
    static bool within_percent(double value, double target, double percent) {
        double tolerance = std::abs(target * percent / 100.0);
        return std::abs(value - target) <= tolerance;
    }
    
    // Validate hydraulics result
    static bool validate_hydraulics_result(
        const HydraulicsCalculator::SegmentHydraulics& result,
        std::string& error_msg
    ) {
        std::ostringstream oss;
        
        // Check for NaN/Inf
        if (std::isnan(result.flow_velocity_m_s) || std::isinf(result.flow_velocity_m_s)) {
            oss << "Invalid velocity: " << result.flow_velocity_m_s;
            error_msg = oss.str();
            return false;
        }
        
        if (std::isnan(result.reynolds_number) || std::isinf(result.reynolds_number)) {
            oss << "Invalid Reynolds number: " << result.reynolds_number;
            error_msg = oss.str();
            return false;
        }
        
        if (std::isnan(result.friction_factor) || std::isinf(result.friction_factor)) {
            oss << "Invalid friction factor: " << result.friction_factor;
            error_msg = oss.str();
            return false;
        }
        
        if (std::isnan(result.pressure_drop_pa) || std::isinf(result.pressure_drop_pa)) {
            oss << "Invalid pressure drop: " << result.pressure_drop_pa;
            error_msg = oss.str();
            return false;
        }
        
        // Check for physical validity
        if (result.flow_velocity_m_s < 0.0) {
            oss << "Negative velocity: " << result.flow_velocity_m_s;
            error_msg = oss.str();
            return false;
        }
        
        if (result.reynolds_number < 0.0) {
            oss << "Negative Reynolds number: " << result.reynolds_number;
            error_msg = oss.str();
            return false;
        }
        
        if (result.friction_factor <= 0.0) {
            oss << "Non-positive friction factor: " << result.friction_factor;
            error_msg = oss.str();
            return false;
        }
        
        // Check flow regime consistency
        if (result.reynolds_number < 2000 && result.flow_regime != 0) {
            oss << "Flow regime inconsistent: Re=" << result.reynolds_number 
                << " but regime=" << result.flow_regime << " (expected 0=laminar)";
            error_msg = oss.str();
            return false;
        }
        
        if (result.reynolds_number > 4000 && result.flow_regime != 2) {
            oss << "Flow regime inconsistent: Re=" << result.reynolds_number 
                << " but regime=" << result.flow_regime << " (expected 2=turbulent)";
            error_msg = oss.str();
            return false;
        }
        
        error_msg = "Valid";
        return true;
    }
    
    // Validate regulatory violation
    static bool validate_violation(
        const RegulatoryCompliance::RegulatoryViolation& violation,
        std::string& error_msg
    ) {
        std::ostringstream oss;
        
        // Check severity range
        if (violation.severity < 0.0 || violation.severity > 1.0) {
            oss << "Severity out of range [0,1]: " << violation.severity;
            error_msg = oss.str();
            return false;
        }
        
        // Check cost is non-negative
        if (violation.mitigation_cost_usd < 0.0) {
            oss << "Negative cost: " << violation.mitigation_cost_usd;
            error_msg = oss.str();
            return false;
        }
        
        // Check permit delay is non-negative
        if (violation.permit_delay_months < 0.0) {
            oss << "Negative permit delay: " << violation.permit_delay_months;
            error_msg = oss.str();
            return false;
        }
        
        // Check regulation ID is not empty
        if (violation.regulation_id.empty()) {
            oss << "Empty regulation ID";
            error_msg = oss.str();
            return false;
        }
        
        // Check description is not empty
        if (violation.description.empty()) {
            oss << "Empty description";
            error_msg = oss.str();
            return false;
        }
        
        error_msg = "Valid";
        return true;
    }
    
    // Assert physical validity of state
    static bool assert_physical_validity(const State& state, std::string& error_msg) {
        std::ostringstream oss;
        
        // Check for NaN/Inf in all dimensions
        double values[] = {
            state.x, state.y,
            state.goal_distance, state.goal_bearing,
            state.elevation, state.slope, state.aspect, state.curvature,
            state.no_go_zone, state.water_proximity, state.road_proximity,
            state.geohazard_risk, state.soil_capacity, state.cadastre_complex,
            state.population_density, state.railway_proximity,
            state.cumulative_pressure_drop_pa, state.segments_since_pump,
            state.flow_velocity_m_s, state.reynolds_number,
            state.prev_heading
        };
        
        const char* names[] = {
            "x", "y",
            "goal_distance", "goal_bearing",
            "elevation", "slope", "aspect", "curvature",
            "no_go_zone", "water_proximity", "road_proximity",
            "geohazard_risk", "soil_capacity", "cadastre_complex",
            "population_density", "railway_proximity",
            "cumulative_pressure_drop_pa", "segments_since_pump",
            "flow_velocity_m_s", "reynolds_number",
            "prev_heading"
        };
        
        for (size_t i = 0; i < 21; ++i) {
            if (std::isnan(values[i])) {
                oss << "NaN value in " << names[i];
                error_msg = oss.str();
                return false;
            }
            if (std::isinf(values[i])) {
                oss << "Inf value in " << names[i];
                error_msg = oss.str();
                return false;
            }
        }
        
        // Check physical range constraints
        if (state.goal_distance < 0.0) {
            oss << "Negative goal distance: " << state.goal_distance;
            error_msg = oss.str();
            return false;
        }
        
        if (state.slope < 0.0 || state.slope > 90.0) {
            oss << "Slope out of range [0,90]: " << state.slope;
            error_msg = oss.str();
            return false;
        }
        
        if (state.aspect < 0.0 || state.aspect > 360.0) {
            oss << "Aspect out of range [0,360]: " << state.aspect;
            error_msg = oss.str();
            return false;
        }
        
        // Check normalized values [0,1]
        double normalized_values[] = {
            state.no_go_zone, state.water_proximity, state.road_proximity,
            state.geohazard_risk, state.soil_capacity, state.cadastre_complex,
            state.railway_proximity
        };
        
        const char* normalized_names[] = {
            "no_go_zone", "water_proximity", "road_proximity",
            "geohazard_risk", "soil_capacity", "cadastre_complex",
            "railway_proximity"
        };
        
        for (size_t i = 0; i < 7; ++i) {
            if (normalized_values[i] < 0.0 || normalized_values[i] > 1.0) {
                oss << normalized_names[i] << " out of range [0,1]: " << normalized_values[i];
                error_msg = oss.str();
                return false;
            }
        }
        
        // Check hydraulic values are non-negative
        if (state.cumulative_pressure_drop_pa < 0.0) {
            oss << "Negative cumulative pressure drop: " << state.cumulative_pressure_drop_pa;
            error_msg = oss.str();
            return false;
        }
        
        if (state.segments_since_pump < 0.0) {
            oss << "Negative segments since pump: " << state.segments_since_pump;
            error_msg = oss.str();
            return false;
        }
        
        if (state.flow_velocity_m_s < 0.0) {
            oss << "Negative flow velocity: " << state.flow_velocity_m_s;
            error_msg = oss.str();
            return false;
        }
        
        if (state.reynolds_number < 0.0) {
            oss << "Negative Reynolds number: " << state.reynolds_number;
            error_msg = oss.str();
            return false;
        }
        
        error_msg = "Valid";
        return true;
    }
    
    // Calculate percentage error
    static double percentage_error(double measured, double expected) {
        if (expected == 0.0) return 0.0;
        return std::abs((measured - expected) / expected) * 100.0;
    }
    
    // Check energy conservation (for hydraulics)
    static bool check_energy_conservation(
        double inlet_pressure_pa,
        double outlet_pressure_pa,
        double elevation_change_m,
        double friction_loss_pa,
        double density_kg_m3,
        std::string& error_msg,
        double tolerance = 0.02  // 2% tolerance
    ) {
        // Energy equation: P_out = P_in - friction_loss - rho*g*dh
        double g = 9.81;
        double expected_outlet = inlet_pressure_pa - friction_loss_pa - density_kg_m3 * g * elevation_change_m;
        
        double error = percentage_error(outlet_pressure_pa, expected_outlet);
        if (error > tolerance * 100.0) {
            std::ostringstream oss;
            oss << "Energy conservation violated: "
                << "Expected outlet=" << expected_outlet << " Pa, "
                << "Actual outlet=" << outlet_pressure_pa << " Pa, "
                << "Error=" << error << "%";
            error_msg = oss.str();
            return false;
        }
        
        error_msg = "Energy conserved";
        return true;
    }
    
    // Format double for display
    static std::string format_double(double value, int precision = 6) {
        std::ostringstream oss;
        oss.precision(precision);
        oss << std::fixed << value;
        return oss.str();
    }
    
    // Create test summary string
    static std::string create_summary(int passed, int failed, int total) {
        std::ostringstream oss;
        oss << "Tests: " << passed << "/" << total << " passed";
        if (failed > 0) {
            oss << ", " << failed << " failed";
        }
        double pass_rate = (total > 0) ? (100.0 * passed / total) : 0.0;
        oss << " (" << format_double(pass_rate, 1) << "%)";
        return oss.str();
    }
};

} // namespace test
} // namespace pirl
} // namespace agrs


