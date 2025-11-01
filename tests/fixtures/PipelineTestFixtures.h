#pragma once

#include "agrs_zeus/PipelineSpecifications.h"
#include "agrs_zeus/Hydraulics.h"
#include "agrs_zeus/PIRL.h"
#include <cmath>

namespace agrs {
namespace pirl {
namespace test {

/**
 * @brief Standard test fixtures for pipeline testing
 * 
 * Provides common test data with known values for consistent testing
 * across all test suites.
 */
class PipelineTestFixtures {
public:
    // Standard 26" Natural Gas Pipeline Specifications (SAIPEM)
    static PipelineSpecifications create_standard_gas_specs() {
        PipelineSpecifications specs;
        specs.diameter_mm = 660.4;  // 26 inches
        specs.thickness_mm = 11.1;  // 0.437 inches
        specs.material = "Carbon Steel";
        specs.pipeline_type = "Gas";
        
        specs.mop_bar = 70.0;  // 70 bar MOP
        specs.dp_bar = 75.0;   // 75 bar DP
        specs.depth_of_cover_m = 1.5;  // 1.5m burial depth
        
        // Bend constraints
        specs.hdd_min_bend_radius_m = 792.48;  // 1200×D
        specs.hdd_applicable = true;
        specs.hot_bend_angles_deg = {5.0, 10.0, 22.5, 45.0, 90.0};
        specs.hot_bend_min_radius_m = 1.981;  // 3×D
        specs.hot_bend_max_count = 50;
        specs.field_bend_max_angle_deg = 5.0;
        
        // Clearance requirements
        specs.house_min_distance_m = 15.0;
        specs.powerlines_min_distance_m = 10.0;
        
        // SAIPEM criteria
        specs.max_slope_percent = 20.0;
        specs.prefer_orthogonal_crossings = true;
        specs.prefer_existing_rows = true;
        
        return specs;
    }
    
    // Natural gas fluid properties at standard conditions
    static HydraulicsCalculator::FluidProperties create_natural_gas_properties() {
        return HydraulicsCalculator::FluidProperties::for_natural_gas(
            7.0e6,    // 70 bar pressure
            288.15    // 15°C temperature
        );
    }
    
    // Crude oil fluid properties
    static HydraulicsCalculator::FluidProperties create_crude_oil_properties() {
        return HydraulicsCalculator::FluidProperties::for_crude_oil(288.15);
    }
    
    // Water fluid properties
    static HydraulicsCalculator::FluidProperties create_water_properties() {
        return HydraulicsCalculator::FluidProperties::for_water(288.15);
    }
    
    // Carbon steel material properties
    static HydraulicsCalculator::MaterialProperties create_carbon_steel_properties() {
        return HydraulicsCalculator::MaterialProperties::for_carbon_steel();
    }
    
    // HDPE material properties
    static HydraulicsCalculator::MaterialProperties create_hdpe_properties() {
        return HydraulicsCalculator::MaterialProperties::for_hdpe();
    }
    
    // Standard test state with known values
    static State create_standard_state() {
        State state;
        
        // Position (UTM 33N - Italy)
        state.x = 380000.0;
        state.y = 4800000.0;
        
        // Navigation
        state.goal_distance = 50000.0;  // 50km to goal
        state.goal_bearing = M_PI / 4;  // 45° northeast
        
        // Terrain
        state.elevation = 250.0;  // 250m elevation
        state.slope = 15.0;  // 15° slope
        state.aspect = 180.0;  // South-facing
        state.curvature = 0.001;  // Slight convex
        
        // Constraints (normalized 0-1)
        state.no_go_zone = 0.0;  // Not in no-go zone
        state.water_proximity = 0.8;  // 200m from water (normalized)
        state.road_proximity = 0.5;  // 500m from road
        
        // Risk factors (normalized 0-1)
        state.geohazard_risk = 0.3;  // Low-moderate risk
        state.soil_capacity = 0.7;  // Good soil
        state.cadastre_complex = 0.2;  // Simple ownership
        state.population_density = 0.1;  // Rural (100 people/km²)
        state.railway_proximity = 0.9;  // Far from railway
        
        // Hydraulics (Phase 2 additions)
        state.cumulative_pressure_drop_pa = 500000.0;  // 0.5 MPa drop so far
        state.segments_since_pump = 20.0;  // 2km since last pump
        state.flow_velocity_m_s = 15.0;  // 15 m/s velocity
        state.reynolds_number = 5000000.0;  // Turbulent flow
        
        // History
        state.prev_heading = M_PI / 4;  // Previous heading 45°
        
        return state;
    }
    
    // High-risk state for testing edge cases
    static State create_high_risk_state() {
        State state = create_standard_state();
        
        state.slope = 25.0;  // Steep slope (above SAIPEM 20% limit)
        state.geohazard_risk = 0.8;  // High geohazard risk
        state.population_density = 0.9;  // Dense urban (1200/km²)
        state.no_go_zone = 0.5;  // Near no-go zone
        state.water_proximity = 0.95;  // Very close to water (25m)
        
        return state;
    }
    
    // Safe state for baseline testing
    static State create_safe_state() {
        State state = create_standard_state();
        
        state.slope = 5.0;  // Gentle slope
        state.geohazard_risk = 0.1;  // Very low risk
        state.population_density = 0.05;  // Very rural (50/km²)
        state.no_go_zone = 0.0;  // Not in no-go zone
        state.water_proximity = 0.2;  // Far from water (1km)
        
        return state;
    }
    
    // Reference hydraulic calculations for validation
    struct ReferenceHydraulics {
        // For 26" gas pipeline, 100m horizontal segment, 70 bar inlet
        static constexpr double expected_reynolds = 5000000.0;  // ~5M (turbulent)
        static constexpr double expected_friction_factor = 0.015;  // Typical for steel
        static constexpr double expected_pressure_drop_pa = 150.0;  // ~150 Pa/100m
        static constexpr double expected_velocity_m_s = 15.0;  // ~15 m/s
        static constexpr int expected_flow_regime = 2;  // Turbulent
        
        // Laminar flow reference (small pipe, low velocity)
        static constexpr double laminar_reynolds = 1500.0;
        static constexpr double laminar_friction = 0.0427;  // 64/1500
        
        // Erosion/corrosion limits
        static constexpr double erosion_velocity_gas = 25.0;  // m/s
        static constexpr double erosion_velocity_liquid = 3.0;  // m/s
        static constexpr double corrosion_velocity_liquid = 0.5;  // m/s
        
        // Pumping station thresholds
        static constexpr double mop_trigger_threshold = 0.95;  // 95% of MOP
        static constexpr double pumping_station_cost = 1000000.0;  // $1M
        
        // Cost penalties (from plan)
        static constexpr double erosion_cost_per_m = 150.0;
        static constexpr double corrosion_cost_per_m = 75.0;
        static constexpr double cavitation_cost_per_m = 300.0;
        static constexpr double transitional_flow_cost_per_m = 10.0;
    };
    
    // Reference regulatory costs (from plan)
    struct ReferenceRegulatory {
        // Seismic slope violations (Italy NTC 2018)
        static constexpr double seismic_slope_moderate_cost = 200.0;  // $/m
        static constexpr double seismic_slope_severe_cost = 500.0;  // $/m
        
        // Protected area violations (Natura 2000)
        static constexpr double protected_buffer_cost = 200.0;  // $/m
        static constexpr double protected_direct_cost = 500.0;  // $/m
        
        // Water protection violations
        static constexpr double water_buffer_cost = 100.0;  // $/m
        static constexpr double water_critical_cost = 300.0;  // $/m
        
        // Urban area violations
        static constexpr double urban_standard_cost = 150.0;  // $/m
        static constexpr double urban_dense_cost = 400.0;  // $/m
        
        // Geohazard violations
        static constexpr double geohazard_moderate_cost = 250.0;  // $/m
        static constexpr double geohazard_high_cost = 600.0;  // $/m
        static constexpr double fault_zone_cost = 800.0;  // $/m
        
        // Thresholds (Italy)
        static constexpr double italy_slope_zone1_deg = 25.0;
        static constexpr double italy_slope_enhanced_deg = 35.0;
        static constexpr double protected_buffer_m = 100.0;
        static constexpr double protected_critical_m = 50.0;
        static constexpr double water_buffer_m = 50.0;
        static constexpr double water_critical_m = 25.0;
        static constexpr double urban_standard_density = 500.0;  // people/km²
        static constexpr double urban_dense_density = 1000.0;  // people/km²
        static constexpr double geohazard_moderate_threshold = 0.5;
        static constexpr double geohazard_high_threshold = 0.7;
    };
    
    // Physical constants for validation
    struct PhysicalConstants {
        static constexpr double g = 9.81;  // m/s² - gravity
        static constexpr double R_gas = 8.314;  // J/(mol·K) - universal gas constant
        static constexpr double atmospheric_pressure_pa = 101325.0;  // Pa
        static constexpr double water_density_kg_m3 = 1000.0;  // kg/m³
        static constexpr double steel_density_kg_m3 = 7850.0;  // kg/m³
        static constexpr double pi = M_PI;
        
        // Conversion factors
        static constexpr double bar_to_pa = 100000.0;
        static constexpr double psi_to_pa = 6894.76;
        static constexpr double inch_to_mm = 25.4;
        static constexpr double foot_to_m = 0.3048;
    };
    
    // Tolerance values for floating-point comparisons
    struct Tolerances {
        static constexpr double position = 0.01;  // 1cm position tolerance
        static constexpr double angle = 0.001;  // ~0.057° angle tolerance
        static constexpr double pressure = 100.0;  // 100 Pa pressure tolerance
        static constexpr double velocity = 0.01;  // 0.01 m/s velocity tolerance
        static constexpr double cost = 1.0;  // $1 cost tolerance
        static constexpr double ratio = 0.001;  // 0.1% ratio tolerance
        static constexpr double percentage = 0.1;  // 0.1% percentage tolerance
        
        // Target accuracies from plan
        static constexpr double hydraulics_accuracy = 0.02;  // 2% accuracy target
        static constexpr double regulatory_accuracy = 0.10;  // 10% accuracy target
        static constexpr double friction_accuracy = 0.001;  // 0.1% accuracy target
    };
};

} // namespace test
} // namespace pirl
} // namespace agrs


