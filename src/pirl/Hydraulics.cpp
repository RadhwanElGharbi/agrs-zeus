#include "agrs_zeus/Hydraulics.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>

namespace agrs {
namespace pirl {

// ============================================================================
// FLUID PROPERTIES IMPLEMENTATIONS
// ============================================================================

void HydraulicsCalculator::FluidProperties::update_for_conditions(
    double pressure_pa, double temperature_k) {
    this->pressure_pa = pressure_pa;
    this->temperature_k = temperature_k;
    
    // Update density and viscosity based on pressure and temperature
    // For gases, use ideal gas law with compressibility factor
    if (type == FluidType::NATURAL_GAS || type == FluidType::HYDROGEN || 
        type == FluidType::CO2 || type == FluidType::AMMONIA) {
        // ρ = (P * M) / (Z * R * T)
        // where M = molecular weight, Z = compressibility factor, R = gas constant
        double z = compressibility; // Already calculated
        density_kg_m3 = (pressure_pa * molecular_weight) / 
                       (z * GAS_CONSTANT_J_MOL_K * temperature_k * 1000.0);
        
        // Viscosity update using Sutherland's formula (simplified)
        // μ(T) = μ₀ * (T/T₀)^0.7
        double ref_temp = 288.15; // 15°C reference
        double temp_ratio = temperature_k / ref_temp;
        viscosity_pa_s *= std::pow(temp_ratio, 0.7);
    }
    // For liquids, temperature effects are smaller
    else {
        // Density changes slightly with temperature (thermal expansion)
        // Viscosity decreases with temperature (approximate)
        double temp_diff = temperature_k - 288.15;
        viscosity_pa_s *= std::exp(-0.02 * temp_diff); // Approximate
    }
}

HydraulicsCalculator::FluidProperties 
HydraulicsCalculator::FluidProperties::for_natural_gas(double pressure_pa, double temp_k) {
    FluidProperties props;
    props.type = FluidType::NATURAL_GAS;
    props.molecular_weight = 18.5; // kg/kmol (typical natural gas mix)
    props.specific_gravity = 0.64; // Relative to air
    props.temperature_k = temp_k;
    props.pressure_pa = pressure_pa;
    
    // Calculate compressibility factor (Z) for real gas
    // Using simplified correlation for natural gas
    double pr = pressure_pa / 4.6e6; // Reduced pressure (Pc ~ 4.6 MPa)
    double tr = temp_k / 190.0;      // Reduced temperature (Tc ~ 190 K)
    props.compressibility = 1.0 - (0.36 * pr / tr); // Simplified Z-factor
    
    // Calculate density using real gas law
    props.density_kg_m3 = (pressure_pa * props.molecular_weight) / 
                         (props.compressibility * GAS_CONSTANT_J_MOL_K * temp_k * 1000.0);
    
    // Dynamic viscosity (Pa·s) - typical for natural gas
    props.viscosity_pa_s = 1.1e-5 * std::pow(temp_k / 288.15, 0.7);
    
    return props;
}

HydraulicsCalculator::FluidProperties 
HydraulicsCalculator::FluidProperties::for_crude_oil(double temp_k) {
    FluidProperties props;
    props.type = FluidType::OIL_CRUDE;
    props.density_kg_m3 = 850.0; // kg/m³ (typical crude oil)
    props.specific_gravity = 0.85; // Relative to water
    props.temperature_k = temp_k;
    props.pressure_pa = STANDARD_PRESSURE_PA;
    props.molecular_weight = 200.0; // kg/kmol (approximate)
    props.compressibility = 0.0; // Incompressible
    
    // Viscosity strongly depends on temperature
    // Using exponential relationship: μ = μ₀ * exp(B/T)
    double mu_0 = 0.001; // Pa·s at reference temp
    double B = 2000.0;    // Empirical constant
    props.viscosity_pa_s = mu_0 * std::exp(B / temp_k);
    
    return props;
}

HydraulicsCalculator::FluidProperties 
HydraulicsCalculator::FluidProperties::for_water(double temp_k) {
    FluidProperties props;
    props.type = FluidType::WATER;
    props.density_kg_m3 = 1000.0; // kg/m³
    props.specific_gravity = 1.0;
    props.temperature_k = temp_k;
    props.pressure_pa = STANDARD_PRESSURE_PA;
    props.molecular_weight = 18.0; // kg/kmol
    props.compressibility = 0.0; // Incompressible
    
    // Water viscosity (Vogel equation)
    props.viscosity_pa_s = 0.001792 * std::exp(-1.94 - 4.8 * log(temp_k / 273.15));
    
    return props;
}

HydraulicsCalculator::FluidProperties 
HydraulicsCalculator::FluidProperties::for_hydrogen(double pressure_pa, double temp_k) {
    FluidProperties props;
    props.type = FluidType::HYDROGEN;
    props.molecular_weight = 2.016; // kg/kmol
    props.specific_gravity = 0.07; // Relative to air
    props.temperature_k = temp_k;
    props.pressure_pa = pressure_pa;
    props.compressibility = 1.05; // H2 is close to ideal gas
    
    props.density_kg_m3 = (pressure_pa * props.molecular_weight) / 
                         (props.compressibility * GAS_CONSTANT_J_MOL_K * temp_k * 1000.0);
    
    props.viscosity_pa_s = 8.8e-6 * std::pow(temp_k / 273.15, 0.68);
    
    return props;
}

HydraulicsCalculator::FluidProperties 
HydraulicsCalculator::FluidProperties::for_co2(double pressure_pa, double temp_k) {
    FluidProperties props;
    props.type = FluidType::CO2;
    props.molecular_weight = 44.01; // kg/kmol
    props.specific_gravity = 1.52; // Relative to air
    props.temperature_k = temp_k;
    props.pressure_pa = pressure_pa;
    
    // CO2 compressibility factor (more complex than ideal gas)
    double pr = pressure_pa / 7.38e6; // Reduced pressure
    double tr = temp_k / 304.2;       // Reduced temperature
    props.compressibility = 1.0 - (0.5 * pr / tr);
    
    props.density_kg_m3 = (pressure_pa * props.molecular_weight) / 
                         (props.compressibility * GAS_CONSTANT_J_MOL_K * temp_k * 1000.0);
    
    props.viscosity_pa_s = 1.5e-5 * std::pow(temp_k / 273.15, 0.8);
    
    return props;
}

// ============================================================================
// MATERIAL PROPERTIES IMPLEMENTATIONS
// ============================================================================

HydraulicsCalculator::MaterialProperties 
HydraulicsCalculator::MaterialProperties::for_carbon_steel() {
    MaterialProperties props;
    props.type = PipeMaterial::CARBON_STEEL;
    props.absolute_roughness_mm = ROUGHNESS_CARBON_STEEL_NEW;
    props.max_allowable_stress_mpa = 360.0; // API 5L X52
    props.youngs_modulus_gpa = 207.0;
    props.thermal_expansion_coeff = 11.7e-6; // per °C
    props.corrosion_resistant = false;
    return props;
}

HydraulicsCalculator::MaterialProperties 
HydraulicsCalculator::MaterialProperties::for_stainless_steel() {
    MaterialProperties props;
    props.type = PipeMaterial::STAINLESS_STEEL;
    props.absolute_roughness_mm = ROUGHNESS_STAINLESS_STEEL;
    props.max_allowable_stress_mpa = 480.0; // 316L stainless
    props.youngs_modulus_gpa = 193.0;
    props.thermal_expansion_coeff = 17.3e-6;
    props.corrosion_resistant = true;
    return props;
}

HydraulicsCalculator::MaterialProperties 
HydraulicsCalculator::MaterialProperties::for_hdpe() {
    MaterialProperties props;
    props.type = PipeMaterial::HDPE;
    props.absolute_roughness_mm = ROUGHNESS_HDPE;
    props.max_allowable_stress_mpa = 10.0; // PE100
    props.youngs_modulus_gpa = 1.1;
    props.thermal_expansion_coeff = 200e-6; // Much higher than steel
    props.corrosion_resistant = true;
    return props;
}

HydraulicsCalculator::MaterialProperties 
HydraulicsCalculator::MaterialProperties::for_coated_steel() {
    MaterialProperties props;
    props.type = PipeMaterial::COATED_STEEL;
    props.absolute_roughness_mm = ROUGHNESS_COATED_STEEL;
    props.max_allowable_stress_mpa = 360.0;
    props.youngs_modulus_gpa = 207.0;
    props.thermal_expansion_coeff = 11.7e-6;
    props.corrosion_resistant = true; // Coating provides resistance
    return props;
}

// ============================================================================
// HYDRAULICS CALCULATOR CONSTRUCTOR
// ============================================================================

HydraulicsCalculator::HydraulicsCalculator(
    const PipelineSpecifications& specs,
    FluidType fluid_type,
    PipeMaterial material)
    : specs_(specs), fluid_type_(fluid_type), material_(material) {
    
    // Initialize fluid properties based on type
    switch (fluid_type) {
        case FluidType::NATURAL_GAS:
            fluid_properties_ = FluidProperties::for_natural_gas(
                specs.mop_bar * 1e5, specs.operating_temp_k);
            break;
        case FluidType::OIL_CRUDE:
            fluid_properties_ = FluidProperties::for_crude_oil(specs.operating_temp_k);
            break;
        case FluidType::WATER:
            fluid_properties_ = FluidProperties::for_water(specs.operating_temp_k);
            break;
        case FluidType::HYDROGEN:
            fluid_properties_ = FluidProperties::for_hydrogen(
                specs.mop_bar * 1e5, specs.operating_temp_k);
            break;
        case FluidType::CO2:
            fluid_properties_ = FluidProperties::for_co2(
                specs.mop_bar * 1e5, specs.operating_temp_k);
            break;
        default:
            fluid_properties_ = FluidProperties::for_natural_gas(
                specs.mop_bar * 1e5, specs.operating_temp_k);
    }
    
    // Initialize material properties
    switch (material) {
        case PipeMaterial::CARBON_STEEL:
            material_properties_ = MaterialProperties::for_carbon_steel();
            break;
        case PipeMaterial::STAINLESS_STEEL:
            material_properties_ = MaterialProperties::for_stainless_steel();
            break;
        case PipeMaterial::HDPE:
            material_properties_ = MaterialProperties::for_hdpe();
            break;
        case PipeMaterial::COATED_STEEL:
            material_properties_ = MaterialProperties::for_coated_steel();
            break;
        default:
            material_properties_ = MaterialProperties::for_carbon_steel();
    }
}

// ============================================================================
// MAIN CALCULATION METHODS
// ============================================================================

HydraulicsCalculator::SegmentHydraulics HydraulicsCalculator::calculate_segment(
    double length_m,
    double elevation_change_m,
    double flow_rate_m3_s,
    double upstream_pressure_pa,
    double upstream_temperature_k) const {
    
    // Determine if gas or liquid
    bool is_gas = (fluid_type_ == FluidType::NATURAL_GAS || 
                   fluid_type_ == FluidType::HYDROGEN ||
                   fluid_type_ == FluidType::CO2 ||
                   fluid_type_ == FluidType::AMMONIA);
    
    if (is_gas) {
        // Convert volumetric to mass flow rate
        double mass_flow_rate_kg_s = flow_rate_m3_s * fluid_properties_.density_kg_m3;
        return calculate_gas_segment(length_m, elevation_change_m, 
                                     mass_flow_rate_kg_s, upstream_pressure_pa,
                                     upstream_temperature_k);
    } else {
        return calculate_liquid_segment(length_m, elevation_change_m,
                                        flow_rate_m3_s, upstream_pressure_pa,
                                        upstream_temperature_k);
    }
}

HydraulicsCalculator::SegmentHydraulics HydraulicsCalculator::calculate_gas_segment(
    double length_m,
    double elevation_change_m,
    double mass_flow_rate_kg_s,
    double upstream_pressure_pa,
    double upstream_temperature_k) const {
    
    SegmentHydraulics result = {};
    
    // Pipeline geometry
    double diameter_m = specs_.diameter_mm / 1000.0;
    double area_m2 = M_PI * diameter_m * diameter_m / 4.0;
    
    // Update fluid properties for current conditions
    FluidProperties fluid = fluid_properties_;
    fluid.update_for_conditions(upstream_pressure_pa, upstream_temperature_k);
    
    // Calculate flow velocity
    result.flow_velocity_m_s = mass_flow_rate_kg_s / (fluid.density_kg_m3 * area_m2);
    
    // Calculate Reynolds number
    result.reynolds_number = calculate_reynolds(result.flow_velocity_m_s, diameter_m, fluid);
    
    // Determine flow regime
    if (result.reynolds_number < 2300) {
        result.flow_regime = 0; // Laminar
    } else if (result.reynolds_number < 4000) {
        result.flow_regime = 1; // Transitional
    } else {
        result.flow_regime = 2; // Turbulent
    }
    
    // Calculate friction factor
    double relative_roughness = material_properties_.absolute_roughness_mm / (diameter_m * 1000.0);
    result.friction_factor = calculate_friction_factor(result.reynolds_number, relative_roughness);
    
    // Darcy-Weisbach pressure drop (simplified for gas)
    // ΔP = f * (L/D) * (ρ * v² / 2)
    double velocity_head = fluid.density_kg_m3 * result.flow_velocity_m_s * result.flow_velocity_m_s / 2.0;
    double friction_loss_pa = result.friction_factor * (length_m / diameter_m) * velocity_head;
    
    // Elevation pressure change (ρ * g * Δh)
    double elevation_loss_pa = fluid.density_kg_m3 * GRAVITY_M_S2 * elevation_change_m;
    
    // Total pressure drop
    result.pressure_drop_pa = friction_loss_pa + elevation_loss_pa;
    
    // Joule-Thomson effect (temperature drop in gas expansion)
    double jt_coeff = calculate_joule_thomson_coefficient(upstream_pressure_pa / 1e6, upstream_temperature_k);
    result.temperature_drop_k = jt_coeff * (result.pressure_drop_pa / 1e6);
    
    // Calculate Mach number
    result.mach_number = calculate_mach_number(result.flow_velocity_m_s, upstream_temperature_k);
    
    // Check for pumping station need
    double downstream_pressure = upstream_pressure_pa - result.pressure_drop_pa;
    result.requires_pumping_station = needs_pumping_station(
        result.pressure_drop_pa, downstream_pressure, specs_.mop_bar * 1e5);
    
    // Check for erosion risk (high velocity)
    VelocityLimits limits = get_velocity_limits();
    result.erosion_risk = (result.flow_velocity_m_s > limits.max_m_s);
    result.corrosion_risk = false; // Not applicable for gas
    
    return result;
}

HydraulicsCalculator::SegmentHydraulics HydraulicsCalculator::calculate_liquid_segment(
    double length_m,
    double elevation_change_m,
    double volumetric_flow_rate_m3_s,
    double upstream_pressure_pa,
    double temperature_k) const {
    
    SegmentHydraulics result = {};
    
    // Pipeline geometry
    double diameter_m = specs_.diameter_mm / 1000.0;
    double area_m2 = M_PI * diameter_m * diameter_m / 4.0;
    
    // Flow velocity
    result.flow_velocity_m_s = volumetric_flow_rate_m3_s / area_m2;
    
    // Reynolds number
    result.reynolds_number = calculate_reynolds(result.flow_velocity_m_s, diameter_m, fluid_properties_);
    
    // Flow regime
    if (result.reynolds_number < 2300) {
        result.flow_regime = 0; // Laminar
    } else if (result.reynolds_number < 4000) {
        result.flow_regime = 1; // Transitional
    } else {
        result.flow_regime = 2; // Turbulent
    }
    
    // Friction factor
    double relative_roughness = material_properties_.absolute_roughness_mm / (diameter_m * 1000.0);
    result.friction_factor = calculate_friction_factor(result.reynolds_number, relative_roughness);
    
    // Darcy-Weisbach equation for incompressible flow
    // h_f = f * (L/D) * (v²/2g)
    result.head_loss_m = result.friction_factor * (length_m / diameter_m) * 
                         (result.flow_velocity_m_s * result.flow_velocity_m_s) / (2.0 * GRAVITY_M_S2);
    
    // Convert head loss to pressure drop
    result.pressure_drop_pa = fluid_properties_.density_kg_m3 * GRAVITY_M_S2 * 
                              (result.head_loss_m + elevation_change_m);
    
    // Check for pumping station need
    double downstream_pressure = upstream_pressure_pa - result.pressure_drop_pa;
    result.requires_pumping_station = needs_pumping_station(
        result.pressure_drop_pa, downstream_pressure, specs_.mop_bar * 1e5);
    
    // Velocity checks
    VelocityLimits limits = get_velocity_limits();
    result.erosion_risk = (result.flow_velocity_m_s > limits.max_m_s);
    result.corrosion_risk = (result.flow_velocity_m_s < limits.min_m_s);
    
    // Cavitation check (vapor pressure margin)
    double vapor_pressure_pa = 2340.0; // Water at 20°C (example)
    result.vapor_pressure_margin_pa = downstream_pressure - vapor_pressure_pa;
    result.cavitation_risk = (result.vapor_pressure_margin_pa < 50000.0); // 0.5 bar safety margin
    
    // No temperature drop for liquids (incompressible)
    result.temperature_drop_k = 0.0;
    result.mach_number = 0.0;
    
    return result;
}

// ============================================================================
// HELPER METHODS
// ============================================================================

bool HydraulicsCalculator::needs_pumping_station(
    double accumulated_pressure_drop_pa,
    double current_pressure_pa,
    double mop_pa) const {
    
    // Need station if pressure drops below minimum operating pressure
    double min_operating_pressure = mop_pa * 0.6; // 60% of MOP as minimum
    
    // Or if accumulated pressure drop exceeds max allowable
    double max_pressure_drop = specs_.max_pressure_drop_mpa * 1e6;
    
    return (current_pressure_pa < min_operating_pressure) ||
           (accumulated_pressure_drop_pa > max_pressure_drop);
}

double HydraulicsCalculator::calculate_friction_factor(
    double reynolds, double relative_roughness) const {
    
    // For laminar flow, use Hagen-Poiseuille
    if (reynolds < 2300) {
        return 64.0 / reynolds;
    }
    
    // For turbulent flow, use Colebrook-White with Swamee-Jain initial guess
    return colebrook_white_friction(reynolds, relative_roughness);
}

double HydraulicsCalculator::calculate_reynolds(
    double velocity_m_s,
    double diameter_m,
    const FluidProperties& fluid) const {
    
    // Re = ρVD/μ
    return (fluid.density_kg_m3 * velocity_m_s * diameter_m) / fluid.viscosity_pa_s;
}

HydraulicsCalculator::VelocityLimits HydraulicsCalculator::get_velocity_limits() const {
    VelocityLimits limits;
    
    // Limits depend on fluid type and material
    if (fluid_type_ == FluidType::NATURAL_GAS) {
        limits.min_m_s = 3.0;   // Below: inefficient
        limits.max_m_s = 30.0;  // Above: erosion risk
        limits.optimal_m_s = 15.0;
    } else if (fluid_type_ == FluidType::WATER) {
        limits.min_m_s = 0.5;   // Below: sedimentation
        limits.max_m_s = 3.0;   // Above: erosion
        limits.optimal_m_s = 1.5;
    } else if (fluid_type_ == FluidType::OIL_CRUDE) {
        limits.min_m_s = 0.3;   // Below: wax deposition
        limits.max_m_s = 2.0;   // Above: erosion
        limits.optimal_m_s = 1.0;
    } else {
        // Default (conservative)
        limits.min_m_s = 1.0;
        limits.max_m_s = 5.0;
        limits.optimal_m_s = 2.5;
    }
    
    return limits;
}

double HydraulicsCalculator::swamee_jain_friction(
    double reynolds, double relative_roughness) const {
    
    // Swamee-Jain approximation (±1% accuracy)
    // f = 0.25 / [log₁₀(ε/3.7D + 5.74/Re^0.9)]²
    double term1 = relative_roughness / 3.7;
    double term2 = 5.74 / std::pow(reynolds, 0.9);
    double log_term = std::log10(term1 + term2);
    return 0.25 / (log_term * log_term);
}

double HydraulicsCalculator::colebrook_white_friction(
    double reynolds, double relative_roughness, int max_iter) const {
    
    // Start with Swamee-Jain guess
    double f = swamee_jain_friction(reynolds, relative_roughness);
    
    // Iterate Colebrook-White equation
    // 1/√f = -2.0 log₁₀(ε/3.7D + 2.51/(Re√f))
    for (int i = 0; i < max_iter; ++i) {
        double sqrt_f = std::sqrt(f);
        double term1 = relative_roughness / 3.7;
        double term2 = 2.51 / (reynolds * sqrt_f);
        double rhs = -2.0 * std::log10(term1 + term2);
        double f_new = 1.0 / (rhs * rhs);
        
        // Check convergence
        if (std::abs(f_new - f) < 1e-6) {
            return f_new;
        }
        f = f_new;
    }
    
    return f; // Return last iteration if not converged
}

double HydraulicsCalculator::calculate_mach_number(
    double velocity_m_s, double temperature_k) const {
    
    double speed_of_sound = speed_of_sound_gas(temperature_k);
    return velocity_m_s / speed_of_sound;
}

double HydraulicsCalculator::speed_of_sound_gas(double temperature_k) const {
    // c = √(γRT/M) where γ = heat capacity ratio, R = gas constant, M = molecular weight
    double gamma = 1.3; // For natural gas (approximate)
    double r_specific = GAS_CONSTANT_J_MOL_K / fluid_properties_.molecular_weight;
    return std::sqrt(gamma * r_specific * temperature_k * 1000.0);
}

double HydraulicsCalculator::calculate_z_factor(
    double pressure_mpa, double temperature_k) const {
    
    // Simplified Z-factor calculation for natural gas
    // Using Hall-Yarborough correlation (simplified)
    double pr = pressure_mpa / 4.6; // Reduced pressure
    double tr = temperature_k / 190.0; // Reduced temperature
    
    // Simplified equation (more accurate correlations available)
    return 1.0 - (0.36 * pr / tr) + (0.1 * pr * pr / (tr * tr));
}

double HydraulicsCalculator::calculate_joule_thomson_coefficient(
    double pressure_mpa, double temperature_k) const {
    
    // μ_JT for natural gas (approximate)
    // Typically 0.4-0.6 K/MPa at pipeline conditions
    return 0.5; // K/MPa (simplified - more accurate correlations available)
}

HydraulicsCalculator::FluidProperties HydraulicsCalculator::update_fluid_properties(
    const FluidProperties& upstream,
    double pressure_drop_pa,
    double temperature_drop_k) const {
    
    FluidProperties downstream = upstream;
    downstream.pressure_pa -= pressure_drop_pa;
    downstream.temperature_k -= temperature_drop_k;
    downstream.update_for_conditions(downstream.pressure_pa, downstream.temperature_k);
    
    return downstream;
}

}  // namespace pirl
}  // namespace agrs


