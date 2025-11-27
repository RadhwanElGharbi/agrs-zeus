#ifndef AGRS_ZEUS_HYDRAULICS_CONSTANTS_H
#define AGRS_ZEUS_HYDRAULICS_CONSTANTS_H

/**
 * @file HydraulicsConstants.h
 * @brief Physical constants and gas properties for pipeline hydraulics calculations
 * 
 * Contains all physical constants, gas properties, and material properties
 * needed for accurate hydraulic modeling of natural gas pipelines.
 */

namespace agrs {
namespace pirl {
namespace hydraulics {

// ============================================================================
// UNIVERSAL PHYSICAL CONSTANTS
// ============================================================================

/// Universal gas constant (J/(kmol·K))
constexpr double R_UNIVERSAL = 8314.46;

/// Gravitational acceleration (m/s²)
constexpr double GRAVITY = 9.81;

/// Standard temperature (K) - 15°C
constexpr double T_STANDARD = 288.15;

/// Standard pressure (kPa)
constexpr double P_STANDARD = 101.325;

// ============================================================================
// NATURAL GAS PROPERTIES (Typical Composition)
// ============================================================================

/// Molecular weight of natural gas mixture (kg/kmol)
/// Based on typical composition: 95% CH4, 3% C2H6, 1% C3H8, 1% N2
constexpr double GAS_MOLECULAR_WEIGHT = 16.8;

/// Specific gravity relative to air (dimensionless)
constexpr double GAS_SPECIFIC_GRAVITY = 0.58;

/// Critical pressure for natural gas (bar)
constexpr double GAS_CRITICAL_PRESSURE_BAR = 46.0;

/// Critical temperature for natural gas (K)
constexpr double GAS_CRITICAL_TEMPERATURE_K = 190.6;

/// Dynamic viscosity at operating conditions (Pa·s)
/// At 70 bar, 15°C
constexpr double GAS_DYNAMIC_VISCOSITY = 1.1e-5;

/// Specific heat at constant pressure (J/(kg·K))
constexpr double GAS_CP = 2200.0;

/// Specific heat at constant volume (J/(kg·K))
constexpr double GAS_CV = 1700.0;

/// Thermal conductivity (W/(m·K))
constexpr double GAS_THERMAL_CONDUCTIVITY = 0.033;

/// Joule-Thomson coefficient (K/bar)
/// Negative value indicates cooling during expansion
constexpr double GAS_JOULE_THOMSON_COEFF = -0.4;

// ============================================================================
// PIPELINE MATERIAL PROPERTIES (Carbon Steel)
// ============================================================================

/// Absolute roughness for new carbon steel pipe (mm)
constexpr double PIPE_ROUGHNESS_NEW = 0.045;

/// Absolute roughness for aged carbon steel pipe (mm)
/// After 20 years of operation
constexpr double PIPE_ROUGHNESS_AGED = 0.060;

/// Hazen-Williams coefficient for steel pipe
constexpr double HAZEN_WILLIAMS_C = 140.0;

// ============================================================================
// HYDRAULIC CALCULATION PARAMETERS
// ============================================================================

/// Weymouth friction factor (typical for gas transmission)
constexpr double WEYMOUTH_FRICTION_FACTOR = 0.094;

/// Minimum Reynolds number for turbulent flow
constexpr double RE_TURBULENT_MIN = 4000.0;

/// Maximum Reynolds number for laminar flow
constexpr double RE_LAMINAR_MAX = 2300.0;

/// Polytropic exponent for natural gas compression
constexpr double POLYTROPIC_EXPONENT = 1.3;

// ============================================================================
// COMPRESSOR STATION PARAMETERS
// ============================================================================

/// Typical compressor efficiency (mechanical)
constexpr double COMPRESSOR_EFFICIENCY = 0.82;

/// Minimum compression ratio (dimensionless)
constexpr double COMPRESSION_RATIO_MIN = 1.1;

/// Maximum compression ratio for single-stage (dimensionless)
constexpr double COMPRESSION_RATIO_MAX = 4.0;

/// Threshold for centrifugal vs reciprocating selection (compression ratio)
constexpr double COMPRESSOR_TYPE_THRESHOLD_RATIO = 2.5;

/// Threshold for centrifugal selection (minimum power, kW)
constexpr double COMPRESSOR_TYPE_THRESHOLD_POWER_KW = 1000.0;

// ============================================================================
// ECONOMIC PARAMETERS
// ============================================================================

/// Capital cost per kW for centrifugal compressor (USD/kW)
constexpr double CAPEX_CENTRIFUGAL_USD_PER_KW = 5000.0;

/// Capital cost per kW for reciprocating compressor (USD/kW)
constexpr double CAPEX_RECIPROCATING_USD_PER_KW = 6000.0;

/// Fixed cost per compressor station (USD)
/// Includes site preparation, buildings, piping, controls
constexpr double CAPEX_STATION_FIXED_USD = 5000000.0;

/// Energy cost (USD/kWh)
constexpr double ENERGY_COST_USD_PER_KWH = 0.05;

/// Operating hours per year
constexpr double OPERATING_HOURS_PER_YEAR = 8760.0;

/// Maintenance cost as fraction of CAPEX per year
constexpr double MAINTENANCE_COST_FRACTION = 0.03;

/// Personnel cost per station per year (USD)
constexpr double PERSONNEL_COST_USD_PER_YEAR = 400000.0;

/// NPV discount rate (fraction)
constexpr double NPV_DISCOUNT_RATE = 0.05;

/// Project lifetime for NPV calculations (years)
constexpr double PROJECT_LIFETIME_YEARS = 20.0;

// ============================================================================
// SAFETY AND OPERATIONAL LIMITS
// ============================================================================

/// Maximum safe gas velocity to prevent erosion (m/s)
constexpr double MAX_VELOCITY_EROSION_LIMIT = 15.0;

/// Minimum gas velocity to prevent liquid dropout (m/s)
constexpr double MIN_VELOCITY_DROPOUT_LIMIT = 3.0;

/// Safety margin for minimum pressure (bar)
/// Compressor placed when pressure falls to (min + margin)
constexpr double PRESSURE_SAFETY_MARGIN_BAR = 5.0;

/// Maximum allowable pressure drop per kilometer (bar/km)
/// For initial route feasibility checks
constexpr double MAX_PRESSURE_DROP_PER_KM = 0.2;

} // namespace hydraulics
} // namespace pirl
} // namespace agrs

#endif // AGRS_ZEUS_HYDRAULICS_CONSTANTS_H











