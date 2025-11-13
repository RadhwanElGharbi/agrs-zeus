/**
 * @file Hydraulics.cpp
 * @brief Implementation of hydraulics module for pipeline pressure calculations
 * 
 * All equations are deterministic and based on industry standards:
 * - Darcy-Weisbach for pressure drop
 * - Swamee-Jain for friction factor
 * - Real gas equation of state for density
 * - Polytropic compression for compressor power
 */

#include "../../include/agrs_zeus/Hydraulics.h"
#include "../../include/agrs_zeus/HydraulicsConstants.h"
#include <cmath>
#include <algorithm>
#include <stdexcept>
#include <iostream>

namespace agrs {
namespace pirl {

using namespace hydraulics;

// ============================================================================
// HYDRAULICS CALCULATOR - CONSTRUCTION
// ============================================================================

HydraulicsCalculator::HydraulicsCalculator(const PipelineHydraulics& params)
    : params_(params) {
    
    // Validate parameters
    if (params_.diameter_internal_m <= 0.0) {
        throw std::invalid_argument("Pipe diameter must be positive");
    }
    if (params_.flow_rate_m3_s <= 0.0) {
        throw std::invalid_argument("Flow rate must be positive");
    }
    if (params_.operating_temperature_k <= 0.0) {
        throw std::invalid_argument("Temperature must be positive (Kelvin)");
    }
    
    std::cout << "[Hydraulics] Calculator initialized:" << std::endl;
    std::cout << "  Internal diameter: " << params_.diameter_internal_m << " m" << std::endl;
    std::cout << "  Flow rate: " << params_.flow_rate_m3_s << " m³/s" << std::endl;
    std::cout << "  Operating temp: " << params_.operating_temperature_k << " K" << std::endl;
}

// ============================================================================
// FUNDAMENTAL CALCULATIONS
// ============================================================================

double HydraulicsCalculator::calculate_friction_factor(double reynolds_number) const {
    // Use Swamee-Jain approximation of Colebrook-White equation
    // Accurate to ±1% for turbulent flow
    // f = 0.25 / [log₁₀(ε/(3.7D) + 5.74/Re^0.9)]²
    
    if (reynolds_number < RE_LAMINAR_MAX) {
        // Laminar flow: f = 64/Re
        return 64.0 / reynolds_number;
    }
    
    // Turbulent flow
    double relative_roughness = params_.roughness_absolute_mm / (params_.diameter_internal_m * 1000.0);
    
    double term1 = relative_roughness / 3.7;
    double term2 = 5.74 / std::pow(reynolds_number, 0.9);
    
    double log_term = std::log10(term1 + term2);
    double f = 0.25 / (log_term * log_term);
    
    // Safety bounds
    f = std::clamp(f, 0.008, 0.100);
    
    return f;
}

double HydraulicsCalculator::calculate_reynolds_number(double velocity_m_s, double density_kg_m3) const {
    // Re = (ρ × v × D) / μ
    double Re = (density_kg_m3 * velocity_m_s * params_.diameter_internal_m) / 
                params_.gas.dynamic_viscosity_pa_s;
    
    return Re;
}

double HydraulicsCalculator::calculate_gas_density(double pressure_bar, double temperature_k) const {
    // Real gas equation of state: ρ = (P × MW) / (Z × R × T)
    
    // Calculate Z-factor at these conditions
    double Z = calculate_compressibility_factor(pressure_bar, temperature_k);
    
    // Convert pressure to Pa
    double pressure_pa = pressure_bar * 100000.0;
    
    // Calculate density
    double rho = (pressure_pa * params_.gas.molecular_weight_kg_kmol) / 
                 (Z * R_UNIVERSAL * temperature_k);
    
    return rho;
}

double HydraulicsCalculator::calculate_compressibility_factor(double pressure_bar, double temperature_k) const {
    // Simplified Standing-Katz correlation for natural gas
    // Valid for high-pressure gas transmission (Pr < 5, Tr > 1.5)
    
    // Reduced properties
    double Pr = pressure_bar / params_.gas.critical_pressure_bar;
    double Tr = temperature_k / params_.gas.critical_temperature_k;
    
    // Simplified correlation
    // Z = 1 - (0.36 × Pr / Tr²)
    double Z = 1.0 - (0.36 * Pr / (Tr * Tr));
    
    // Physical bounds
    Z = std::clamp(Z, 0.5, 1.0);
    
    return Z;
}

double HydraulicsCalculator::calculate_flow_velocity(double flow_rate_m3_s, double diameter_m) const {
    // v = Q / A where A = π(D/2)²
    double area = M_PI * (diameter_m / 2.0) * (diameter_m / 2.0);
    double velocity = flow_rate_m3_s / area;
    
    return velocity;
}

// ============================================================================
// PRESSURE DROP CALCULATIONS
// ============================================================================

double HydraulicsCalculator::calculate_pressure_drop_friction(
    double entry_pressure_bar,
    double segment_length_m,
    double elevation_change_m) const {
    
    // Use Darcy-Weisbach equation:
    // ΔP = (f × L × ρ × v²) / (2 × D)
    
    // Calculate gas properties at entry conditions
    double density = calculate_gas_density(entry_pressure_bar, params_.operating_temperature_k);
    double velocity = calculate_flow_velocity(params_.flow_rate_m3_s, params_.diameter_internal_m);
    
    // Calculate Reynolds number
    double Re = calculate_reynolds_number(velocity, density);
    
    // Calculate friction factor
    double f = calculate_friction_factor(Re);
    
    // Calculate pressure drop (in Pa)
    double delta_P_pa = (f * segment_length_m * density * velocity * velocity) / 
                        (2.0 * params_.diameter_internal_m);
    
    // Convert to bar
    double delta_P_bar = delta_P_pa / 100000.0;
    
    return delta_P_bar;
}

double HydraulicsCalculator::calculate_pressure_change_elevation(
    double density_kg_m3,
    double elevation_change_m) const {
    
    // ΔP = ρ × g × Δh
    // Positive elevation change (uphill) = pressure loss
    
    double delta_P_pa = density_kg_m3 * GRAVITY * elevation_change_m;
    double delta_P_bar = delta_P_pa / 100000.0;
    
    return delta_P_bar;
}

// ============================================================================
// SEGMENT CALCULATION
// ============================================================================

SegmentHydraulics HydraulicsCalculator::calculate_segment(
    double entry_pressure_bar,
    double segment_length_m,
    double elevation_change_m) const {
    
    SegmentHydraulics result;
    
    // Entry conditions
    result.entry_pressure_bar = entry_pressure_bar;
    result.entry_temperature_k = params_.operating_temperature_k;
    result.elevation_change_m = elevation_change_m;
    
    // Calculate gas properties at entry
    double density_entry = calculate_gas_density(entry_pressure_bar, params_.operating_temperature_k);
    
    // Calculate velocity
    result.flow_velocity_m_s = calculate_flow_velocity(params_.flow_rate_m3_s, params_.diameter_internal_m);
    
    // Check velocity limits
    if (result.flow_velocity_m_s > MAX_VELOCITY_EROSION_LIMIT) {
        std::cerr << "[Hydraulics] WARNING: Velocity " << result.flow_velocity_m_s 
                  << " m/s exceeds erosion limit " << MAX_VELOCITY_EROSION_LIMIT << " m/s" << std::endl;
    }
    
    // Calculate Reynolds number
    result.reynolds_number = calculate_reynolds_number(result.flow_velocity_m_s, density_entry);
    
    // Calculate friction factor
    result.friction_factor = calculate_friction_factor(result.reynolds_number);
    
    // Calculate pressure drop from friction
    result.pressure_drop_friction_bar = calculate_pressure_drop_friction(
        entry_pressure_bar, segment_length_m, elevation_change_m);
    
    // Calculate pressure change from elevation
    result.pressure_drop_elevation_bar = calculate_pressure_change_elevation(
        density_entry, elevation_change_m);
    
    // Total pressure drop
    result.pressure_drop_bar = result.pressure_drop_friction_bar + result.pressure_drop_elevation_bar;
    
    // Exit pressure
    result.exit_pressure_bar = entry_pressure_bar - result.pressure_drop_bar;
    
    // Exit temperature (including Joule-Thomson effect)
    double temp_change = params_.gas.joule_thomson_coeff_k_bar * result.pressure_drop_bar;
    result.exit_temperature_k = result.entry_temperature_k + temp_change;
    
    // Average properties for segment
    double avg_pressure = (entry_pressure_bar + result.exit_pressure_bar) / 2.0;
    result.density_avg_kg_m3 = calculate_gas_density(avg_pressure, params_.operating_temperature_k);
    result.compressibility_factor = calculate_compressibility_factor(avg_pressure, params_.operating_temperature_k);
    
    return result;
}

// ============================================================================
// ROUTE CALCULATION
// ============================================================================

std::vector<SegmentHydraulics> HydraulicsCalculator::calculate_route(
    const std::vector<std::pair<double, double>>& route_segments,
    double initial_pressure_bar,
    double min_delivery_pressure_bar) {
    
    std::vector<SegmentHydraulics> result;
    result.reserve(route_segments.size());
    
    double current_pressure = initial_pressure_bar;
    
    std::cout << "[Hydraulics] Calculating route pressure profile..." << std::endl;
    std::cout << "  Initial pressure: " << initial_pressure_bar << " bar" << std::endl;
    std::cout << "  Minimum delivery: " << min_delivery_pressure_bar << " bar" << std::endl;
    std::cout << "  Segments: " << route_segments.size() << std::endl;
    
    for (size_t i = 0; i < route_segments.size(); ++i) {
        double length_m = route_segments[i].first;
        double elevation_change_m = route_segments[i].second;
        
        // Calculate segment hydraulics
        SegmentHydraulics segment = calculate_segment(
            current_pressure, length_m, elevation_change_m);
        
        result.push_back(segment);
        
        // Update current pressure for next segment
        current_pressure = segment.exit_pressure_bar;
        
        // Log progress every 100 segments
        if ((i + 1) % 100 == 0) {
            std::cout << "  Segment " << (i + 1) << "/" << route_segments.size() 
                      << ": P = " << current_pressure << " bar" << std::endl;
        }
        
        // Check for negative pressure (indicates problem)
        if (current_pressure <= 0.0) {
            std::cerr << "[Hydraulics] ERROR: Pressure dropped to zero at segment " << i << std::endl;
            break;
        }
    }
    
    double final_pressure = result.back().exit_pressure_bar;
    double total_pressure_drop = initial_pressure_bar - final_pressure;
    
    std::cout << "[Hydraulics] Route calculation complete:" << std::endl;
    std::cout << "  Final pressure: " << final_pressure << " bar" << std::endl;
    std::cout << "  Total pressure drop: " << total_pressure_drop << " bar" << std::endl;
    
    if (final_pressure < min_delivery_pressure_bar) {
        std::cout << "  ⚠️  WARNING: Final pressure below minimum (" 
                  << final_pressure << " < " << min_delivery_pressure_bar << ")" << std::endl;
        std::cout << "  Compressor station(s) required!" << std::endl;
    } else {
        std::cout << "  ✅ Route hydraulically feasible without compression" << std::endl;
    }
    
    return result;
}

// ============================================================================
// HYDRAULIC FEASIBILITY VALIDATION
// ============================================================================

bool HydraulicsCalculator::validate_hydraulic_feasibility(
    const std::vector<SegmentHydraulics>& route_hydraulics,
    double min_pressure_bar) const {
    
    if (route_hydraulics.empty()) {
        return false;
    }
    
    // Check all segment pressures
    for (size_t i = 0; i < route_hydraulics.size(); ++i) {
        if (route_hydraulics[i].exit_pressure_bar < min_pressure_bar) {
            std::cout << "[Hydraulics] Infeasible: Pressure " << route_hydraulics[i].exit_pressure_bar 
                      << " bar < " << min_pressure_bar << " bar at segment " << i << std::endl;
            return false;
        }
        
        if (route_hydraulics[i].exit_pressure_bar <= 0.0) {
            std::cout << "[Hydraulics] Infeasible: Negative pressure at segment " << i << std::endl;
            return false;
        }
    }
    
    return true;
}

// ============================================================================
// COMPRESSOR STATION PLACEMENT
// ============================================================================

int HydraulicsCalculator::find_optimal_compressor_placement(
    const std::vector<SegmentHydraulics>& route_hydraulics,
    size_t violation_index,
    double min_pressure_bar,
    double max_pressure_bar) const {
    
    // Look back up to 20 segments or 10% of route length
    int lookback = std::min<int>(20, route_hydraulics.size() / 10);
    
    // Find location where pressure is closest to (min + safety margin)
    double target_pressure = min_pressure_bar + PRESSURE_SAFETY_MARGIN_BAR;
    
    int best_index = violation_index;
    double best_diff = 999999.0;
    
    for (int i = std::max(0, static_cast<int>(violation_index) - lookback); 
         i <= static_cast<int>(violation_index); ++i) {
        
        double pressure = route_hydraulics[i].exit_pressure_bar;
        double diff = std::abs(pressure - target_pressure);
        
        if (diff < best_diff && pressure > min_pressure_bar) {
            best_diff = diff;
            best_index = i;
        }
    }
    
    return best_index;
}

void HydraulicsCalculator::recalculate_downstream_pressures(
    std::vector<SegmentHydraulics>& route_hydraulics,
    size_t start_index) {
    
    if (start_index >= route_hydraulics.size()) {
        return;
    }
    
    // Get starting pressure (after compression)
    double current_pressure = route_hydraulics[start_index].exit_pressure_bar;
    
    // Recalculate all downstream segments
    for (size_t i = start_index + 1; i < route_hydraulics.size(); ++i) {
        // Get segment geometry
        double length_m = route_hydraulics[i].exit_pressure_bar - route_hydraulics[i].entry_pressure_bar;
        double elevation_change = route_hydraulics[i].elevation_change_m;
        
        // Recalculate with new entry pressure
        route_hydraulics[i] = calculate_segment(current_pressure, length_m, elevation_change);
        
        current_pressure = route_hydraulics[i].exit_pressure_bar;
    }
}

std::vector<CompressorStation> HydraulicsCalculator::place_compressor_stations(
    std::vector<SegmentHydraulics>& route_hydraulics,
    double min_pressure_bar,
    double max_pressure_bar) {
    
    std::vector<CompressorStation> stations;
    
    std::cout << "[Hydraulics] Checking compressor station requirements..." << std::endl;
    
    // Scan route for pressure violations
    for (size_t i = 0; i < route_hydraulics.size(); ++i) {
        double pressure = route_hydraulics[i].exit_pressure_bar;
        
        // Check if pressure falls below minimum (with safety margin)
        if (pressure < (min_pressure_bar + PRESSURE_SAFETY_MARGIN_BAR)) {
            
            std::cout << "  Pressure violation at segment " << i 
                      << ": " << pressure << " bar" << std::endl;
            
            // Find optimal placement location
            int placement_index = find_optimal_compressor_placement(
                route_hydraulics, i, min_pressure_bar, max_pressure_bar);
            
            std::cout << "  Placing compressor at segment " << placement_index << std::endl;
            
            // Design compressor station
            CompressorStation station = CompressorStationDesigner::design_station(
                route_hydraulics[placement_index].exit_pressure_bar,
                max_pressure_bar,
                params_.flow_rate_m3_s,
                params_.gas
            );
            
            station.segment_index = placement_index;
            station.placement_reason = "pressure_limit";
            
            // Mark segment as having compressor
            route_hydraulics[placement_index].has_compressor_station = true;
            route_hydraulics[placement_index].compressor_type = station.type;
            route_hydraulics[placement_index].compressor_power_kw = station.power_required_kw;
            route_hydraulics[placement_index].compression_ratio = station.compression_ratio;
            
            // Reset pressure after compression
            route_hydraulics[placement_index].exit_pressure_bar = max_pressure_bar;
            
            // Recalculate downstream pressures
            recalculate_downstream_pressures(route_hydraulics, placement_index);
            
            stations.push_back(station);
            
            std::cout << "  Station placed: " << station.type 
                      << ", " << station.power_required_kw << " kW" << std::endl;
            std::cout << "  Compression: " << station.inlet_pressure_bar << " → " 
                      << station.outlet_pressure_bar << " bar" << std::endl;
        }
    }
    
    if (stations.empty()) {
        std::cout << "  ✅ No compressor stations required" << std::endl;
    } else {
        std::cout << "  Total compressor stations: " << stations.size() << std::endl;
    }
    
    return stations;
}

// ============================================================================
// COMPRESSOR STATION DESIGNER - IMPLEMENTATION
// ============================================================================

CompressorStation CompressorStationDesigner::design_station(
    double inlet_pressure_bar,
    double outlet_pressure_bar,
    double flow_rate_m3_s,
    const GasProperties& gas) {
    
    CompressorStation station;
    
    // Performance parameters
    station.inlet_pressure_bar = inlet_pressure_bar;
    station.outlet_pressure_bar = outlet_pressure_bar;
    station.compression_ratio = outlet_pressure_bar / inlet_pressure_bar;
    
    // Validate compression ratio
    if (station.compression_ratio < COMPRESSION_RATIO_MIN) {
        std::cerr << "[Compressor] WARNING: Compression ratio " << station.compression_ratio 
                  << " below minimum " << COMPRESSION_RATIO_MIN << std::endl;
    }
    if (station.compression_ratio > COMPRESSION_RATIO_MAX) {
        std::cerr << "[Compressor] WARNING: Compression ratio " << station.compression_ratio 
                  << " exceeds maximum " << COMPRESSION_RATIO_MAX << std::endl;
        std::cerr << "  Consider two-stage compression" << std::endl;
    }
    
    // Calculate power requirement
    station.power_required_kw = calculate_power_requirement(
        inlet_pressure_bar, outlet_pressure_bar, flow_rate_m3_s, gas);
    
    // Select compressor type
    station.type = select_compressor_type(station.compression_ratio, station.power_required_kw);
    
    // Calculate economics
    station.capex_usd = calculate_capex(station.power_required_kw, station.type);
    station.opex_annual_usd = calculate_opex_annual(station.power_required_kw, station.capex_usd);
    station.lifecycle_cost_usd = calculate_lifecycle_cost(station.capex_usd, station.opex_annual_usd);
    
    return station;
}

std::string CompressorStationDesigner::select_compressor_type(
    double compression_ratio,
    double power_kw) {
    
    // Selection logic based on industry standards:
    // - Centrifugal: Best for low-medium compression, high flow, continuous operation
    // - Reciprocating: Best for high compression, lower flow, variable conditions
    
    if (compression_ratio <= COMPRESSOR_TYPE_THRESHOLD_RATIO && 
        power_kw >= COMPRESSOR_TYPE_THRESHOLD_POWER_KW) {
        return "centrifugal";
    } else if (compression_ratio > COMPRESSOR_TYPE_THRESHOLD_RATIO) {
        return "reciprocating";
    } else {
        return "centrifugal";  // Default for gas transmission
    }
}

double CompressorStationDesigner::calculate_power_requirement(
    double inlet_pressure_bar,
    double outlet_pressure_bar,
    double flow_rate_m3_s,
    const GasProperties& gas,
    double efficiency) {
    
    // Polytropic compression model:
    // W = (n/(n-1)) × P₁ × Q × [(P₂/P₁)^((n-1)/n) - 1] / η
    
    // Convert pressures to Pa
    double P1_pa = inlet_pressure_bar * 100000.0;
    double P2_pa = outlet_pressure_bar * 100000.0;
    
    // Compression ratio
    double r = P2_pa / P1_pa;
    
    // Polytropic exponent
    double n = POLYTROPIC_EXPONENT;
    
    // Calculate power (W)
    double power_w = (n / (n - 1.0)) * P1_pa * flow_rate_m3_s * 
                     (std::pow(r, (n - 1.0) / n) - 1.0) / efficiency;
    
    // Convert to kW
    double power_kw = power_w / 1000.0;
    
    return power_kw;
}

double CompressorStationDesigner::calculate_capex(
    double power_kw,
    const std::string& compressor_type) {
    
    double cost_per_kw = (compressor_type == "centrifugal") ? 
                         CAPEX_CENTRIFUGAL_USD_PER_KW : 
                         CAPEX_RECIPROCATING_USD_PER_KW;
    
    double capex = (power_kw * cost_per_kw) + CAPEX_STATION_FIXED_USD;
    
    return capex;
}

double CompressorStationDesigner::calculate_opex_annual(
    double power_kw,
    double capex_usd) {
    
    // Energy cost
    double energy_cost = power_kw * OPERATING_HOURS_PER_YEAR * ENERGY_COST_USD_PER_KWH;
    
    // Maintenance cost (% of CAPEX)
    double maintenance_cost = capex_usd * MAINTENANCE_COST_FRACTION;
    
    // Personnel cost
    double personnel_cost = PERSONNEL_COST_USD_PER_YEAR;
    
    double opex = energy_cost + maintenance_cost + personnel_cost;
    
    return opex;
}

double CompressorStationDesigner::calculate_lifecycle_cost(
    double capex_usd,
    double opex_annual_usd) {
    
    // NPV of annuity: PV = PMT × [(1 - (1+r)^-n) / r]
    // Where PMT = annual payment, r = discount rate, n = years
    
    double r = NPV_DISCOUNT_RATE;
    double n = PROJECT_LIFETIME_YEARS;
    
    double annuity_factor = (1.0 - std::pow(1.0 + r, -n)) / r;
    double opex_npv = opex_annual_usd * annuity_factor;
    
    double lifecycle_cost = capex_usd + opex_npv;
    
    return lifecycle_cost;
}

} // namespace pirl
} // namespace agrs
