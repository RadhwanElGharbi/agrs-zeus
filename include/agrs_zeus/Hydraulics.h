#ifndef AGRS_ZEUS_HYDRAULICS_H
#define AGRS_ZEUS_HYDRAULICS_H

/**
 * @file Hydraulics.h
 * @brief Complete hydraulics module for pipeline pressure profile calculations
 * 
 * This module provides deterministic, physics-based hydraulic calculations for
 * natural gas pipelines, including:
 * - Pressure drop calculations (Weymouth, Darcy-Weisbach)
 * - Friction factor calculations (Colebrook-White, Swamee-Jain)
 * - Gas property calculations (density, compressibility)
 * - Compressor station placement and sizing
 * - Route-level pressure profile generation
 */

#include <vector>
#include <memory>
#include <string>
#include <cmath>
#include "HydraulicsConstants.h"

namespace agrs {
namespace pirl {

// ============================================================================
// GAS PROPERTIES STRUCTURE
// ============================================================================

/**
 * @brief Gas properties for hydraulic calculations
 * 
 * Contains all thermodynamic and transport properties needed for
 * accurate hydraulic modeling of natural gas pipelines.
 */
struct GasProperties {
    /// Molecular weight (kg/kmol)
    double molecular_weight_kg_kmol = hydraulics::GAS_MOLECULAR_WEIGHT;
    
    /// Specific gravity relative to air (dimensionless)
    double specific_gravity = hydraulics::GAS_SPECIFIC_GRAVITY;
    
    /// Compressibility factor at operating conditions (dimensionless)
    double compressibility_factor_z = 0.85;
    
    /// Dynamic viscosity at operating conditions (Pa·s)
    double dynamic_viscosity_pa_s = hydraulics::GAS_DYNAMIC_VISCOSITY;
    
    /// Joule-Thomson coefficient (K/bar)
    double joule_thomson_coeff_k_bar = hydraulics::GAS_JOULE_THOMSON_COEFF;
    
    /// Critical pressure (bar)
    double critical_pressure_bar = hydraulics::GAS_CRITICAL_PRESSURE_BAR;
    
    /// Critical temperature (K)
    double critical_temperature_k = hydraulics::GAS_CRITICAL_TEMPERATURE_K;
    
    /// Specific heat at constant pressure (J/(kg·K))
    double specific_heat_cp_j_kg_k = hydraulics::GAS_CP;
    
    /// Thermal conductivity (W/(m·K))
    double thermal_conductivity_w_m_k = hydraulics::GAS_THERMAL_CONDUCTIVITY;
};

// ============================================================================
// PIPELINE HYDRAULIC PARAMETERS
// ============================================================================

/**
 * @brief Pipeline hydraulic parameters
 * 
 * Contains all geometric and operating parameters needed for
 * hydraulic calculations.
 */
struct PipelineHydraulics {
    /// Internal diameter (m)
    double diameter_internal_m;
    
    /// Absolute roughness (mm)
    double roughness_absolute_mm = hydraulics::PIPE_ROUGHNESS_NEW;
    
    /// Volumetric flow rate (m³/s)
    double flow_rate_m3_s;
    
    /// Operating temperature (K)
    double operating_temperature_k = hydraulics::T_STANDARD;
    
    /// Gas properties
    GasProperties gas;
};

// ============================================================================
// SEGMENT-LEVEL HYDRAULIC STATE
// ============================================================================

/**
 * @brief Segment-level hydraulic state
 * 
 * Contains complete hydraulic information for a single pipeline segment,
 * calculated using deterministic equations.
 */
struct SegmentHydraulics {
    // Pressures
    double entry_pressure_bar = 0.0;           ///< Pressure at segment start (bar)
    double exit_pressure_bar = 0.0;            ///< Pressure at segment end (bar)
    double pressure_drop_bar = 0.0;            ///< Total pressure drop (bar)
    
    // Pressure drop components
    double pressure_drop_friction_bar = 0.0;   ///< Pressure drop due to friction (bar)
    double pressure_drop_elevation_bar = 0.0;  ///< Pressure change due to elevation (bar)
    
    // Flow characteristics
    double flow_velocity_m_s = 0.0;            ///< Gas velocity (m/s)
    double reynolds_number = 0.0;              ///< Reynolds number (dimensionless)
    double friction_factor = 0.0;              ///< Darcy friction factor (dimensionless)
    
    // Elevation
    double elevation_change_m = 0.0;           ///< Elevation change (m, positive = uphill)
    
    // Temperature
    double entry_temperature_k = 0.0;          ///< Temperature at segment start (K)
    double exit_temperature_k = 0.0;           ///< Temperature at segment end (K)
    
    // Gas properties at segment conditions
    double density_avg_kg_m3 = 0.0;            ///< Average gas density (kg/m³)
    double compressibility_factor = 0.0;       ///< Z-factor at average conditions
    
    // Compressor station (if present)
    bool has_compressor_station = false;       ///< Whether segment contains compressor
    std::string compressor_type;               ///< "centrifugal", "reciprocating", or empty
    double compressor_power_kw = 0.0;          ///< Compressor power requirement (kW)
    double compression_ratio = 1.0;            ///< Compression ratio (dimensionless)
};

// ============================================================================
// COMPRESSOR STATION SPECIFICATION
// ============================================================================

/**
 * @brief Compressor station specification
 * 
 * Contains complete information about a compressor station,
 * including performance, economics, and placement rationale.
 */
struct CompressorStation {
    // Location
    double x = 0.0;                            ///< X coordinate
    double y = 0.0;                            ///< Y coordinate
    int segment_index = -1;                    ///< Segment index in route
    double distance_from_start_m = 0.0;        ///< Cumulative distance from start (m)
    
    // Performance
    std::string type;                          ///< "centrifugal" or "reciprocating"
    double inlet_pressure_bar = 0.0;           ///< Inlet pressure (bar)
    double outlet_pressure_bar = 0.0;          ///< Outlet pressure (bar)
    double compression_ratio = 1.0;            ///< Compression ratio (dimensionless)
    double power_required_kw = 0.0;            ///< Power requirement (kW)
    
    // Economics
    double capex_usd = 0.0;                    ///< Capital cost (USD)
    double opex_annual_usd = 0.0;              ///< Annual operating cost (USD/year)
    double lifecycle_cost_usd = 0.0;           ///< NPV of 20-year lifecycle (USD)
    
    // Rationale
    std::string placement_reason;              ///< "pressure_limit", "optimal", "forced"
};

// ============================================================================
// MAIN HYDRAULICS CALCULATOR
// ============================================================================

/**
 * @brief Main hydraulics calculation engine
 * 
 * Provides deterministic, physics-based hydraulic calculations for
 * natural gas pipelines using industry-standard equations.
 * 
 * All calculations are based on:
 * - Weymouth equation for gas transmission
 * - Darcy-Weisbach equation with Colebrook-White friction factor
 * - Real gas equation of state with Z-factor correction
 * - Polytropic compression model
 */
class HydraulicsCalculator {
public:
    /**
     * @brief Constructor
     * @param params Pipeline hydraulic parameters
     */
    explicit HydraulicsCalculator(const PipelineHydraulics& params);
    
    /**
     * @brief Destructor
     */
    ~HydraulicsCalculator() = default;
    
    // ========================================================================
    // SEGMENT-LEVEL CALCULATIONS
    // ========================================================================
    
    /**
     * @brief Calculate hydraulics for a single segment
     * 
     * Uses Darcy-Weisbach equation for pressure drop calculation,
     * with Swamee-Jain approximation for friction factor.
     * 
     * @param entry_pressure_bar Pressure at segment start (bar)
     * @param segment_length_m Length of segment (m)
     * @param elevation_change_m Change in elevation (m, positive = uphill)
     * @return SegmentHydraulics Complete hydraulic state for segment
     */
    SegmentHydraulics calculate_segment(
        double entry_pressure_bar,
        double segment_length_m,
        double elevation_change_m
    ) const;
    
    // ========================================================================
    // ROUTE-LEVEL CALCULATIONS
    // ========================================================================
    
    /**
     * @brief Calculate hydraulics for entire route
     * 
     * Iterates through all segments, tracking cumulative pressure changes.
     * Detects when pressure falls below minimum delivery requirement.
     * 
     * @param route_segments Vector of (length_m, elevation_change_m) pairs
     * @param initial_pressure_bar Starting pressure at route origin (bar)
     * @param min_delivery_pressure_bar Minimum required pressure at endpoint (bar)
     * @return Vector of SegmentHydraulics for each segment
     */
    std::vector<SegmentHydraulics> calculate_route(
        const std::vector<std::pair<double, double>>& route_segments,
        double initial_pressure_bar,
        double min_delivery_pressure_bar
    );
    
    /**
     * @brief Validate if route is hydraulically feasible
     * 
     * Checks if final pressure meets minimum delivery requirement and
     * all intermediate pressures are within safe limits.
     * 
     * @param route_hydraulics Hydraulic state for each segment
     * @param min_pressure_bar Minimum allowable pressure (bar)
     * @return true if feasible, false otherwise
     */
    bool validate_hydraulic_feasibility(
        const std::vector<SegmentHydraulics>& route_hydraulics,
        double min_pressure_bar
    ) const;
    
    // ========================================================================
    // COMPRESSOR STATION LOGIC
    // ========================================================================
    
    /**
     * @brief Determine compressor station locations
     * 
     * Scans route for pressure violations and places compressor stations
     * at optimal locations to maintain required pressure profile.
     * 
     * @param route_hydraulics Hydraulic state for each segment (modified in place)
     * @param min_pressure_bar Minimum allowable pressure (bar)
     * @param max_pressure_bar Maximum operating pressure (bar)
     * @return Vector of CompressorStation objects
     */
    std::vector<CompressorStation> place_compressor_stations(
        std::vector<SegmentHydraulics>& route_hydraulics,
        double min_pressure_bar,
        double max_pressure_bar
    );
    
    // ========================================================================
    // FUNDAMENTAL HYDRAULIC CALCULATIONS
    // ========================================================================
    
    /**
     * @brief Calculate friction factor using Swamee-Jain approximation
     * 
     * Explicit approximation of Colebrook-White equation, accurate to ±1%.
     * 
     * @param reynolds_number Reynolds number (dimensionless)
     * @return Darcy friction factor (dimensionless)
     */
    double calculate_friction_factor(double reynolds_number) const;
    
    /**
     * @brief Calculate Reynolds number
     * 
     * Re = (ρ × v × D) / μ
     * 
     * @param velocity_m_s Flow velocity (m/s)
     * @param density_kg_m3 Gas density (kg/m³)
     * @return Reynolds number (dimensionless)
     */
    double calculate_reynolds_number(double velocity_m_s, double density_kg_m3) const;
    
    /**
     * @brief Calculate gas density using real gas equation of state
     * 
     * ρ = (P × MW) / (Z × R × T)
     * 
     * @param pressure_bar Pressure (bar)
     * @param temperature_k Temperature (K)
     * @return Gas density (kg/m³)
     */
    double calculate_gas_density(double pressure_bar, double temperature_k) const;
    
    /**
     * @brief Calculate gas compressibility factor (Z-factor)
     * 
     * Uses simplified Standing-Katz correlation for natural gas.
     * 
     * @param pressure_bar Pressure (bar)
     * @param temperature_k Temperature (K)
     * @return Compressibility factor Z (dimensionless)
     */
    double calculate_compressibility_factor(double pressure_bar, double temperature_k) const;
    
    /**
     * @brief Calculate flow velocity
     * 
     * v = Q / A where A = π(D/2)²
     * 
     * @param flow_rate_m3_s Volumetric flow rate (m³/s)
     * @param diameter_m Internal diameter (m)
     * @return Flow velocity (m/s)
     */
    double calculate_flow_velocity(double flow_rate_m3_s, double diameter_m) const;
    
    /**
     * @brief Get pipeline parameters
     * @return Reference to pipeline hydraulic parameters
     */
    const PipelineHydraulics& get_parameters() const { return params_; }
    
private:
    PipelineHydraulics params_;  ///< Pipeline hydraulic parameters
    
    /**
     * @brief Calculate pressure drop due to friction
     * 
     * Uses Darcy-Weisbach equation:
     * ΔP = (f × L × ρ × v²) / (2 × D)
     * 
     * @param entry_pressure_bar Inlet pressure (bar)
     * @param segment_length_m Segment length (m)
     * @param elevation_change_m Elevation change (m)
     * @return Pressure drop due to friction (bar)
     */
    double calculate_pressure_drop_friction(
        double entry_pressure_bar,
        double segment_length_m,
        double elevation_change_m
    ) const;
    
    /**
     * @brief Calculate pressure change due to elevation
     * 
     * ΔP = ρ × g × Δh
     * 
     * @param density_kg_m3 Average gas density (kg/m³)
     * @param elevation_change_m Elevation change (m, positive = uphill)
     * @return Pressure change (bar, positive = pressure loss for uphill)
     */
    double calculate_pressure_change_elevation(
        double density_kg_m3,
        double elevation_change_m
    ) const;
    
    /**
     * @brief Find optimal compressor placement location
     * 
     * Looks back from pressure violation point to find best location
     * for compressor station placement.
     * 
     * @param route_hydraulics Hydraulic state for all segments
     * @param violation_index Index where pressure violation detected
     * @param min_pressure_bar Minimum allowable pressure
     * @param max_pressure_bar Maximum operating pressure
     * @return Optimal segment index for compressor placement
     */
    int find_optimal_compressor_placement(
        const std::vector<SegmentHydraulics>& route_hydraulics,
        size_t violation_index,
        double min_pressure_bar,
        double max_pressure_bar
    ) const;
    
    /**
     * @brief Recalculate pressures downstream of compressor
     * 
     * After placing a compressor station, recalculate all downstream
     * segment pressures starting from the compression point.
     * 
     * @param route_hydraulics Hydraulic state for all segments (modified)
     * @param start_index Index to start recalculation from
     */
    void recalculate_downstream_pressures(
        std::vector<SegmentHydraulics>& route_hydraulics,
        size_t start_index
    );
};

// ============================================================================
// COMPRESSOR STATION DESIGNER
// ============================================================================

/**
 * @brief Compressor station sizing and selection
 * 
 * Provides static methods for designing compressor stations based on
 * required compression ratio and flow conditions.
 */
class CompressorStationDesigner {
public:
    /**
     * @brief Design compressor station for given conditions
     * 
     * Calculates power requirement, selects compressor type,
     * and estimates CAPEX and OPEX.
     * 
     * @param inlet_pressure_bar Required inlet pressure (bar)
     * @param outlet_pressure_bar Required outlet pressure (bar)
     * @param flow_rate_m3_s Volumetric flow rate (m³/s)
     * @param gas Gas properties
     * @return CompressorStation Fully designed station
     */
    static CompressorStation design_station(
        double inlet_pressure_bar,
        double outlet_pressure_bar,
        double flow_rate_m3_s,
        const GasProperties& gas
    );
    
    /**
     * @brief Select compressor type based on conditions
     * 
     * Selection criteria:
     * - Centrifugal: compression ratio < 2.5, power > 1 MW
     * - Reciprocating: compression ratio > 2.5 or power < 1 MW
     * 
     * @param compression_ratio Compression ratio (P_out / P_in)
     * @param power_kw Power requirement (kW)
     * @return "centrifugal" or "reciprocating"
     */
    static std::string select_compressor_type(
        double compression_ratio,
        double power_kw
    );
    
    /**
     * @brief Calculate compressor power requirement
     * 
     * Uses polytropic compression model:
     * W = (n/(n-1)) × P₁ × Q × [(P₂/P₁)^((n-1)/n) - 1] / η
     * 
     * @param inlet_pressure_bar Inlet pressure (bar)
     * @param outlet_pressure_bar Outlet pressure (bar)
     * @param flow_rate_m3_s Volumetric flow rate (m³/s)
     * @param gas Gas properties
     * @param efficiency Compressor efficiency (default: 0.82)
     * @return Power requirement (kW)
     */
    static double calculate_power_requirement(
        double inlet_pressure_bar,
        double outlet_pressure_bar,
        double flow_rate_m3_s,
        const GasProperties& gas,
        double efficiency = hydraulics::COMPRESSOR_EFFICIENCY
    );
    
    /**
     * @brief Calculate CAPEX for compressor station
     * 
     * CAPEX = (power × cost_per_kw) + fixed_cost
     * 
     * @param power_kw Power requirement (kW)
     * @param compressor_type "centrifugal" or "reciprocating"
     * @return Capital cost (USD)
     */
    static double calculate_capex(
        double power_kw,
        const std::string& compressor_type
    );
    
    /**
     * @brief Calculate annual OPEX for compressor station
     * 
     * OPEX = energy_cost + maintenance_cost + personnel_cost
     * 
     * @param power_kw Power requirement (kW)
     * @param capex_usd Capital cost (USD)
     * @return Annual operating cost (USD/year)
     */
    static double calculate_opex_annual(
        double power_kw,
        double capex_usd
    );
    
    /**
     * @brief Calculate lifecycle cost (NPV over 20 years)
     * 
     * Lifecycle = CAPEX + NPV(OPEX, 20 years, 5%)
     * 
     * @param capex_usd Capital cost (USD)
     * @param opex_annual_usd Annual operating cost (USD/year)
     * @return Net present value of lifecycle cost (USD)
     */
    static double calculate_lifecycle_cost(
        double capex_usd,
        double opex_annual_usd
    );
};

} // namespace pirl
} // namespace agrs

#endif // AGRS_ZEUS_HYDRAULICS_H
