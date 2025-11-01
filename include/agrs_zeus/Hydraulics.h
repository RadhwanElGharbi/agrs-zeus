#ifndef AGRS_ZEUS_HYDRAULICS_H
#define AGRS_ZEUS_HYDRAULICS_H

#include "agrs_zeus/PipelineSpecifications.h"
#include <cmath>
#include <string>
#include <map>

namespace agrs {
namespace pirl {

/**
 * @brief Hydraulics calculator for pipeline flow analysis
 * 
 * Implements industry-standard hydraulic calculations for pipeline routing:
 * - Darcy-Weisbach equation for pressure drop
 * - Reynolds number for flow regime identification
 * - Colebrook-White friction factor
 * - Pumping/compression station placement
 * - Fluid-specific and material-specific properties
 */
class HydraulicsCalculator {
public:
    // ===== Fluid Types =====
    enum class FluidType {
        NATURAL_GAS,
        OIL_CRUDE,
        OIL_REFINED,
        WATER,
        NGL,         // Natural Gas Liquids
        CO2,
        HYDROGEN,
        AMMONIA
    };
    
    // ===== Pipe Materials =====
    enum class PipeMaterial {
        CARBON_STEEL,
        STAINLESS_STEEL,
        HDPE,       // High-Density Polyethylene
        COMPOSITE,
        COATED_STEEL
    };
    
    // ===== Fluid Properties =====
    struct FluidProperties {
        FluidType type;
        double density_kg_m3;           // Fluid density
        double viscosity_pa_s;          // Dynamic viscosity
        double temperature_k;           // Operating temperature
        double pressure_pa;             // Operating pressure
        double compressibility;         // Gas compressibility factor (Z)
        double molecular_weight;        // For gas calculations (kg/kmol)
        double specific_gravity;        // Relative to water (liquids) or air (gases)
        
        // Update properties based on pressure and temperature
        void update_for_conditions(double pressure_pa, double temperature_k);
        
        // Factory methods for common fluids
        static FluidProperties for_natural_gas(double pressure_pa, double temp_k);
        static FluidProperties for_crude_oil(double temp_k);
        static FluidProperties for_water(double temp_k);
        static FluidProperties for_hydrogen(double pressure_pa, double temp_k);
        static FluidProperties for_co2(double pressure_pa, double temp_k);
    };
    
    // ===== Material Properties =====
    struct MaterialProperties {
        PipeMaterial type;
        double absolute_roughness_mm;   // Material roughness
        double max_allowable_stress_mpa;
        double youngs_modulus_gpa;
        double thermal_expansion_coeff;
        bool corrosion_resistant;
        
        // Factory methods for common materials
        static MaterialProperties for_carbon_steel();
        static MaterialProperties for_stainless_steel();
        static MaterialProperties for_hdpe();
        static MaterialProperties for_coated_steel();
    };
    
    // ===== Segment Hydraulics Results =====
    struct SegmentHydraulics {
        // Common results
        double flow_velocity_m_s;       // Flow velocity
        double reynolds_number;         // Reynolds number
        double friction_factor;         // Darcy friction factor
        double pressure_drop_pa;        // Pressure drop in segment
        double head_loss_m;             // Head loss (for liquids)
        int flow_regime;                // 0=laminar, 1=transitional, 2=turbulent
        bool requires_pumping_station;  // Trigger for pump/compressor station
        bool erosion_risk;              // High velocity warning
        bool corrosion_risk;            // Low velocity warning (liquids)
        
        // Gas-specific
        double mach_number;             // For gas, check sonic flow limits
        double temperature_drop_k;      // Joule-Thomson effect
        
        // Liquid-specific
        double vapor_pressure_margin_pa;// Prevent cavitation
        bool cavitation_risk;
    };
    
    // ===== Velocity Limits =====
    struct VelocityLimits {
        double min_m_s;     // Below: sedimentation/corrosion risk
        double max_m_s;     // Above: erosion risk
        double optimal_m_s; // Target velocity
    };
    
    // ===== Constructor =====
    HydraulicsCalculator(const PipelineSpecifications& specs,
                        FluidType fluid_type,
                        PipeMaterial material);
    
    // ===== Main Calculation Methods =====
    
    /**
     * @brief Calculate hydraulics for a pipeline segment
     * @param length_m Segment length in meters
     * @param elevation_change_m Elevation change (positive = uphill)
     * @param flow_rate_m3_s Volumetric flow rate
     * @param upstream_pressure_pa Pressure at segment start
     * @param upstream_temperature_k Temperature at segment start
     * @return SegmentHydraulics with all calculated parameters
     */
    SegmentHydraulics calculate_segment(
        double length_m,
        double elevation_change_m,
        double flow_rate_m3_s,
        double upstream_pressure_pa,
        double upstream_temperature_k
    ) const;
    
    /**
     * @brief Calculate hydraulics for gas (compressible flow)
     * Uses Weymouth equation for natural gas pipelines
     */
    SegmentHydraulics calculate_gas_segment(
        double length_m,
        double elevation_change_m,
        double mass_flow_rate_kg_s,
        double upstream_pressure_pa,
        double upstream_temperature_k
    ) const;
    
    /**
     * @brief Calculate hydraulics for liquid (incompressible flow)
     * Uses Darcy-Weisbach equation
     */
    SegmentHydraulics calculate_liquid_segment(
        double length_m,
        double elevation_change_m,
        double volumetric_flow_rate_m3_s,
        double upstream_pressure_pa,
        double temperature_k
    ) const;
    
    // ===== Pumping Station Logic =====
    
    /**
     * @brief Check if pumping station is needed
     * @param accumulated_pressure_drop_pa Total pressure loss so far
     * @param current_pressure_pa Current pressure
     * @param mop_pa Maximum Operating Pressure
     * @return true if station required
     */
    bool needs_pumping_station(
        double accumulated_pressure_drop_pa,
        double current_pressure_pa,
        double mop_pa
    ) const;
    
    // ===== Friction Factor Calculation =====
    
    /**
     * @brief Calculate Darcy friction factor using Colebrook-White equation
     * Iterative solution (Swamee-Jain approximation for initial guess)
     * @param reynolds Reynolds number
     * @param relative_roughness ε/D (roughness / diameter)
     * @return Darcy friction factor f
     */
    double calculate_friction_factor(double reynolds, double relative_roughness) const;
    
    /**
     * @brief Calculate Reynolds number
     * Re = ρVD/μ = (4ṁ)/(πDμ)
     */
    double calculate_reynolds(
        double velocity_m_s,
        double diameter_m,
        const FluidProperties& fluid
    ) const;
    
    // ===== Velocity Limits =====
    
    /**
     * @brief Get velocity limits for current fluid/material combination
     */
    VelocityLimits get_velocity_limits() const;
    
    // ===== Fluid Property Updates =====
    
    /**
     * @brief Update fluid properties along route
     * Accounts for pressure and temperature changes
     */
    FluidProperties update_fluid_properties(
        const FluidProperties& upstream,
        double pressure_drop_pa,
        double temperature_drop_k
    ) const;
    
    // ===== Material Roughness Constants (mm) =====
    static constexpr double ROUGHNESS_CARBON_STEEL_NEW = 0.045;
    static constexpr double ROUGHNESS_CARBON_STEEL_OLD = 0.15;
    static constexpr double ROUGHNESS_STAINLESS_STEEL = 0.015;
    static constexpr double ROUGHNESS_HDPE = 0.0015;
    static constexpr double ROUGHNESS_COATED_STEEL = 0.03;
    
    // ===== Physical Constants =====
    static constexpr double GRAVITY_M_S2 = 9.80665;
    static constexpr double GAS_CONSTANT_J_MOL_K = 8.314462;  // Universal gas constant
    static constexpr double STANDARD_PRESSURE_PA = 101325.0;
    static constexpr double STANDARD_TEMP_K = 288.15;  // 15°C
    
private:
    PipelineSpecifications specs_;
    FluidType fluid_type_;
    PipeMaterial material_;
    FluidProperties fluid_properties_;
    MaterialProperties material_properties_;
    
    // ===== Helper Methods =====
    
    /**
     * @brief Calculate gas compressibility factor (Z)
     * Using Dranchuk-Abu-Kassem correlation for natural gas
     */
    double calculate_z_factor(double pressure_mpa, double temperature_k) const;
    
    /**
     * @brief Calculate Joule-Thomson coefficient
     * Temperature drop in gas expansion: μ_JT = (∂T/∂P)_H
     */
    double calculate_joule_thomson_coefficient(double pressure_mpa, double temperature_k) const;
    
    /**
     * @brief Calculate friction factor using Swamee-Jain approximation
     * Fast approximation for initial guess (±1% accuracy)
     */
    double swamee_jain_friction(double reynolds, double relative_roughness) const;
    
    /**
     * @brief Solve Colebrook-White equation iteratively
     * 1/√f = -2.0 log₁₀(ε/3.7D + 2.51/(Re√f))
     */
    double colebrook_white_friction(double reynolds, double relative_roughness, int max_iter = 20) const;
    
    /**
     * @brief Check for sonic flow (Mach number > 0.3 requires correction)
     */
    double calculate_mach_number(double velocity_m_s, double temperature_k) const;
    
    /**
     * @brief Calculate speed of sound in gas
     */
    double speed_of_sound_gas(double temperature_k) const;
};

}  // namespace pirl
}  // namespace agrs

#endif  // AGRS_ZEUS_HYDRAULICS_H


