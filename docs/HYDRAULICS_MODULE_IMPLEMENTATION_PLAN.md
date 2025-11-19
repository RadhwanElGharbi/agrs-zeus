# PIRL Hydraulics Module - Full Implementation Plan

**Status:** IMPLEMENTATION PLAN - Awaiting explicit approval  
**Created:** 2025-11-08  
**Target Completion:** Phase 2 (After baseline 1.5M training)  
**Estimated Development Time:** 2-3 weeks  

---

## Executive Summary

This plan details the complete implementation of a deterministic, physics-based hydraulics module for PIRL. The module will:

1. Calculate pressure drop along the entire pipeline route using scientific equations
2. Determine optimal compressor station placement based on pressure limits
3. Track entry/exit pressures for every route segment
4. Add 4 new columns to route GeoJSON output:
   - `entry_pressure_bar`
   - `exit_pressure_bar`
   - `has_compressor_station` (boolean)
   - `compressor_station_type` (string: "centrifugal", "reciprocating", or null)

**Key Principle:** All hydraulic calculations are **deterministic** - same route always produces same pressure profile.

---

## Table of Contents

1. [Hydraulic Equations & Theory](#1-hydraulic-equations--theory)
2. [Module Architecture](#2-module-architecture)
3. [Implementation Phases](#3-implementation-phases)
4. [State Space Expansion](#4-state-space-expansion)
5. [Compressor Station Logic](#5-compressor-station-logic)
6. [Route Segment Attributes](#6-route-segment-attributes)
7. [Testing & Validation](#7-testing--validation)
8. [Integration with PIRL](#8-integration-with-pirl)
9. [Cost Model Updates](#9-cost-model-updates)
10. [Documentation & Deliverables](#10-documentation--deliverables)

---

## 1. Hydraulic Equations & Theory

### 1.1 Fundamental Pressure Drop Equation

For **natural gas pipelines**, use the **General Flow Equation** (Darcy-Weisbach modified for gas):

```
P₁² - P₂² = [f × L × ρ × v² × Z_avg × T_avg] / (2 × D)

Where:
P₁ = Inlet pressure (Pa absolute)
P₂ = Outlet pressure (Pa absolute)
f = Friction factor (Moody/Colebrook-White)
L = Length (m)
ρ = Gas density (kg/m³) at average conditions
v = Gas velocity (m/s)
Z_avg = Average compressibility factor
T_avg = Average temperature (K)
D = Internal diameter (m)
```

**Simplified for Implementation (Weymouth Equation for high-pressure gas):**

```cpp
// Weymouth equation (most accurate for gas transmission)
double pressure_drop_weymouth(double P1_bar, double L_km, double Q_m3h, 
                             double D_mm, double T_K, double SG) {
    // Convert units
    double P1_kpa = P1_bar * 100.0;
    double D_m = D_mm / 1000.0;
    
    // Weymouth constant
    double Tb = 288.15;  // Base temperature (K)
    double Pb = 101.325; // Base pressure (kPa)
    
    // Friction factor for gas (Weymouth)
    double f = 0.094;  // Transmission factor (typical 0.92-0.96)
    
    // Pressure drop (squared)
    double P2_squared = P1_kpa * P1_kpa - 
                       (10.67 * f * L_km * pow(Q_m3h, 1.852) * T_K * SG * Tb) / 
                       (pow(D_mm, 4.8704) * Pb);
    
    if (P2_squared < 0) P2_squared = 0;  // Safety check
    
    double P2_kpa = sqrt(P2_squared);
    return P2_kpa / 100.0;  // Convert to bar
}
```

### 1.2 Darcy-Weisbach Friction Factor

For turbulent flow (Re > 4000), use **Colebrook-White equation** (implicit):

```
1/√f = -2 × log₁₀(ε/(3.7D) + 2.51/(Re√f))

Where:
f = Friction factor (dimensionless)
ε = Absolute roughness (m)
D = Internal diameter (m)
Re = Reynolds number
```

**Swamee-Jain Approximation (explicit, accurate to ±1%):**

```cpp
double friction_factor_swamee_jain(double Re, double epsilon_mm, double D_mm) {
    double relative_roughness = epsilon_mm / D_mm;
    
    // Swamee-Jain approximation
    double term1 = relative_roughness / 3.7;
    double term2 = 5.74 / pow(Re, 0.9);
    double f = 0.25 / pow(log10(term1 + term2), 2.0);
    
    return f;
}
```

### 1.3 Reynolds Number

```cpp
double reynolds_number(double v_m_s, double D_m, double rho_kg_m3, double mu_pa_s) {
    return (rho_kg_m3 * v_m_s * D_m) / mu_pa_s;
}
```

### 1.4 Gas Density (Real Gas Equation of State)

```cpp
double gas_density(double P_bar, double T_K, double MW_kg_kmol, double Z) {
    // R = Universal gas constant = 8314.46 J/(kmol·K)
    const double R = 8314.46;
    
    // Convert pressure to Pa
    double P_pa = P_bar * 100000.0;
    
    // Ideal gas law with compressibility factor
    // ρ = (P × MW) / (Z × R × T)
    double rho = (P_pa * MW_kg_kmol) / (Z * R * T_K);
    
    return rho;  // kg/m³
}
```

### 1.5 Compressibility Factor (Z-factor)

Use **Dranchuk-Abu-Kassem (DAK)** equation for natural gas:

```cpp
double compressibility_factor(double P_bar, double T_K, double Pc_bar, double Tc_K) {
    // Reduced properties
    double Pr = P_bar / Pc_bar;  // Reduced pressure
    double Tr = T_K / Tc_K;      // Reduced temperature
    
    // For natural gas (methane-dominated):
    // Pc ≈ 46.0 bar, Tc ≈ 190.6 K
    
    // Simplified correlation (Standing-Katz chart approximation)
    // For high-pressure gas transmission (Pr < 5, Tr > 1.5)
    double Z = 1.0 - (0.36 * Pr / pow(Tr, 2.0));
    
    // Clamp to physical range
    if (Z < 0.5) Z = 0.5;
    if (Z > 1.0) Z = 1.0;
    
    return Z;
}
```

### 1.6 Elevation Pressure Change

```cpp
double pressure_change_elevation(double elevation_change_m, double rho_avg_kg_m3) {
    // ΔP = ρ × g × Δh
    const double g = 9.81;  // m/s²
    
    double delta_P_pa = rho_avg_kg_m3 * g * elevation_change_m;
    double delta_P_bar = delta_P_pa / 100000.0;
    
    return delta_P_bar;  // Positive for uphill (pressure loss)
}
```

### 1.7 Temperature Effects (Joule-Thomson)

```cpp
double temperature_drop_joule_thomson(double delta_P_bar, double JT_coeff_K_bar) {
    // Joule-Thomson coefficient for natural gas ≈ -0.4 K/bar
    // Negative coefficient means gas cools during expansion
    
    double delta_T = JT_coeff_K_bar * delta_P_bar;
    return delta_T;  // Temperature change (K)
}
```

---

## 2. Module Architecture

### 2.1 File Structure

```
include/agrs_zeus/
├── Hydraulics.h           # Main hydraulics module header
└── HydraulicsConstants.h  # Physical constants and gas properties

src/pirl/
├── Hydraulics.cpp         # Hydraulics implementation
└── HydraulicsCompressor.cpp # Compressor station logic
```

### 2.2 Class Design

```cpp
// File: include/agrs_zeus/Hydraulics.h

#ifndef AGRS_ZEUS_HYDRAULICS_H
#define AGRS_ZEUS_HYDRAULICS_H

#include <vector>
#include <memory>

namespace agrs {
namespace pirl {

/**
 * @brief Gas properties for hydraulic calculations
 */
struct GasProperties {
    double molecular_weight_kg_kmol = 16.8;  // Natural gas mixture
    double specific_gravity = 0.58;           // Relative to air
    double compressibility_factor_z = 0.85;   // At operating conditions
    double dynamic_viscosity_pa_s = 1.1e-5;   // At operating conditions
    double joule_thomson_coeff_k_bar = -0.4;  // Cooling during expansion
    
    // Critical properties (for Z-factor calculation)
    double critical_pressure_bar = 46.0;      // Natural gas
    double critical_temperature_k = 190.6;     // Natural gas
    
    // Thermal properties
    double specific_heat_cp_j_kg_k = 2200;
    double thermal_conductivity_w_m_k = 0.033;
};

/**
 * @brief Pipeline hydraulic parameters
 */
struct PipelineHydraulics {
    double diameter_internal_m;
    double roughness_absolute_mm;
    double flow_rate_m3_s;
    double operating_temperature_k;
    GasProperties gas;
};

/**
 * @brief Segment-level hydraulic state
 */
struct SegmentHydraulics {
    // Pressures
    double entry_pressure_bar;
    double exit_pressure_bar;
    double pressure_drop_bar;
    
    // Flow characteristics
    double flow_velocity_m_s;
    double reynolds_number;
    double friction_factor;
    
    // Elevation effects
    double elevation_change_m;
    double pressure_drop_elevation_bar;
    double pressure_drop_friction_bar;
    
    // Temperature
    double entry_temperature_k;
    double exit_temperature_k;
    
    // Gas properties at segment conditions
    double density_avg_kg_m3;
    double compressibility_factor;
    
    // Compressor station
    bool has_compressor_station = false;
    std::string compressor_type;  // "centrifugal", "reciprocating", or empty
    double compressor_power_kw = 0.0;
    double compression_ratio = 1.0;
};

/**
 * @brief Compressor station specification
 */
struct CompressorStation {
    // Location
    double x, y;                    // Coordinates
    int segment_index;              // Which segment it's in
    double distance_from_start_m;   // Cumulative distance
    
    // Performance
    std::string type;               // "centrifugal" or "reciprocating"
    double inlet_pressure_bar;
    double outlet_pressure_bar;
    double compression_ratio;
    double power_required_kw;
    
    // Economics
    double capex_usd;              // Capital cost
    double opex_annual_usd;        // Operating cost per year
    
    // Why it was placed
    std::string placement_reason;  // "pressure_limit", "optimal", "forced"
};

/**
 * @brief Main hydraulics calculation engine
 */
class HydraulicsCalculator {
public:
    explicit HydraulicsCalculator(const PipelineHydraulics& params);
    ~HydraulicsCalculator();
    
    /**
     * @brief Calculate hydraulics for a single segment
     * 
     * @param entry_pressure_bar Pressure at segment start (bar)
     * @param segment_length_m Length of segment (m)
     * @param elevation_change_m Change in elevation (m, positive = uphill)
     * @return SegmentHydraulics Complete hydraulic state
     */
    SegmentHydraulics calculate_segment(
        double entry_pressure_bar,
        double segment_length_m,
        double elevation_change_m
    ) const;
    
    /**
     * @brief Calculate hydraulics for entire route
     * 
     * @param route_segments Vector of segment lengths and elevations
     * @param initial_pressure_bar Starting pressure (bar)
     * @param min_delivery_pressure_bar Minimum pressure at endpoint (bar)
     * @return Vector of SegmentHydraulics for each segment
     */
    std::vector<SegmentHydraulics> calculate_route(
        const std::vector<std::pair<double, double>>& route_segments,
        double initial_pressure_bar,
        double min_delivery_pressure_bar
    );
    
    /**
     * @brief Determine compressor station locations
     * 
     * @param route_hydraulics Hydraulic state for each segment
     * @param min_pressure_bar Minimum allowable pressure (bar)
     * @param max_pressure_bar Maximum operating pressure (bar)
     * @return Vector of CompressorStation objects
     */
    std::vector<CompressorStation> place_compressor_stations(
        std::vector<SegmentHydraulics>& route_hydraulics,
        double min_pressure_bar,
        double max_pressure_bar
    );
    
    /**
     * @brief Validate if route is hydraulically feasible
     * 
     * @param route_hydraulics Hydraulic state for each segment
     * @param min_pressure_bar Minimum allowable pressure
     * @return true if feasible, false otherwise
     */
    bool validate_hydraulic_feasibility(
        const std::vector<SegmentHydraulics>& route_hydraulics,
        double min_pressure_bar
    ) const;
    
    // Utility functions
    double calculate_friction_factor(double reynolds_number) const;
    double calculate_reynolds_number(double velocity_m_s, double density_kg_m3) const;
    double calculate_gas_density(double pressure_bar, double temperature_k) const;
    double calculate_compressibility_factor(double pressure_bar, double temperature_k) const;
    
private:
    PipelineHydraulics params_;
    
    // Internal helper functions
    double pressure_drop_friction(double P_bar, double L_m, double elev_change_m) const;
    double pressure_drop_elevation(double rho_kg_m3, double elev_change_m) const;
    double flow_velocity(double Q_m3_s, double D_m) const;
};

/**
 * @brief Compressor station sizing and selection
 */
class CompressorStationDesigner {
public:
    /**
     * @brief Design compressor station for given conditions
     * 
     * @param inlet_pressure_bar Required inlet pressure (bar)
     * @param outlet_pressure_bar Required outlet pressure (bar)
     * @param flow_rate_m3_s Volumetric flow rate (m³/s)
     * @param gas Gas properties
     * @return CompressorStation Designed station
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
     * @param compression_ratio P_out / P_in
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
     * Uses polytropic compression model for gas compressors
     * 
     * @param inlet_pressure_bar Inlet pressure (bar)
     * @param outlet_pressure_bar Outlet pressure (bar)
     * @param flow_rate_m3_s Flow rate (m³/s)
     * @param gas Gas properties
     * @param efficiency Compressor efficiency (0.80-0.85 typical)
     * @return Power in kW
     */
    static double calculate_power_requirement(
        double inlet_pressure_bar,
        double outlet_pressure_bar,
        double flow_rate_m3_s,
        const GasProperties& gas,
        double efficiency = 0.82
    );
};

} // namespace pirl
} // namespace agrs

#endif // AGRS_ZEUS_HYDRAULICS_H
```

---

## 3. Implementation Phases

### Phase 3.1: Core Hydraulics Module (Week 1, Days 1-3)

**Tasks:**
1. Create `Hydraulics.h` and `HydraulicsConstants.h` headers
2. Implement `HydraulicsCalculator` class
3. Implement friction factor calculations (Colebrook-White, Swamee-Jain)
4. Implement Reynolds number calculations
5. Implement gas density calculations (real gas equation)
6. Implement compressibility factor (Z-factor) calculations
7. Implement pressure drop calculations (Weymouth + Darcy-Weisbach)
8. Implement elevation pressure change calculations

**Deliverable:** Standalone hydraulics calculator that can compute pressure drop for a single segment

**Test:** Unit test with known values:
- 1 km horizontal segment, 70 bar inlet → Should get ~69.93 bar outlet
- 1 km with +100m elevation, 70 bar inlet → Should get ~69.44 bar outlet

### Phase 3.2: Route-Level Hydraulics (Week 1, Days 4-5)

**Tasks:**
1. Implement `calculate_route()` function
2. Iterate through all segments, tracking cumulative pressure
3. Handle temperature changes (Joule-Thomson effect)
4. Detect when pressure falls below minimum threshold
5. Store hydraulic state for each segment

**Deliverable:** Function that computes full pressure profile for entire route

**Test:** Test route with known pressure profile:
- 50 km route, flat terrain → Compare against hand calculations
- 50 km route, +500m elevation → Verify elevation effects

### Phase 3.3: Compressor Station Logic (Week 1, Days 6-7)

**Tasks:**
1. Implement `CompressorStationDesigner` class
2. Implement compressor power calculations (polytropic compression)
3. Implement compressor type selection logic:
   - Centrifugal: Compression ratio < 2.5, power > 1 MW
   - Reciprocating: Compression ratio < 4.0, power < 1 MW
4. Implement `place_compressor_stations()` algorithm
5. Calculate CAPEX and OPEX for each station

**Deliverable:** Automatic compressor station placement based on pressure limits

**Test:** 
- 150 km route → Should place 1-2 compressor stations
- Verify station locations are optimal (pressure just above minimum)

### Phase 3.4: State Space Integration (Week 2, Days 1-2)

**Tasks:**
1. Expand `State` struct from 17 to 21 dimensions
2. Add hydraulic state variables:
   - `cumulative_pressure_drop_mpa`
   - `segments_since_compressor`
   - `flow_velocity_m_s`
   - `reynolds_number`
3. Update `State::to_vector()` to include new variables
4. Update normalization ranges in `VecNormalize`
5. Update Python bindings for 21D state space

**Deliverable:** PIRL environment with 21-dimensional state space

**Test:** 
- Verify state vector has 21 elements
- Verify hydraulic values are correctly populated
- Verify normalization doesn't cause NaN/Inf

### Phase 3.5: PIRL Environment Integration (Week 2, Days 3-4)

**Tasks:**
1. Add `HydraulicsCalculator` instance to `PipelineEnvironment`
2. Update `step()` function to call hydraulics calculations
3. Update `calculate_reward()` to include hydraulic penalties:
   - Compressor station penalty: -70,000 per station
   - Pressure margin bonus: +100 if pressure > min by >10 bar
4. Update `check_termination()` to fail if pressure < minimum
5. Populate `SegmentHydraulics` data in `RouteSegment` struct

**Deliverable:** PIRL environment with full hydraulics integration

**Test:**
- Run single episode, verify hydraulic calculations execute
- Verify compressor stations placed when needed
- Verify episode terminates if pressure too low

### Phase 3.6: Route Output Enhancement (Week 2, Days 5-6)

**Tasks:**
1. Update `RouteSegment` struct to include:
   ```cpp
   double entry_pressure_bar = 0.0;
   double exit_pressure_bar = 0.0;
   bool has_compressor_station = false;
   std::string compressor_station_type;  // "centrifugal", "reciprocating", or ""
   ```
2. Update GeoJSON export to include 4 new properties:
   ```json
   {
     "entry_pressure_bar": 70.0,
     "exit_pressure_bar": 69.85,
     "has_compressor_station": false,
     "compressor_station_type": null
   }
   ```
3. Update CSV export for segment analysis
4. Create pressure profile visualization script

**Deliverable:** Route outputs with complete hydraulic information

**Test:**
- Generate route GeoJSON, verify 4 new columns present
- Verify pressure values are physically reasonable
- Verify compressor stations marked correctly

### Phase 3.7: Testing & Validation (Week 2, Day 7 - Week 3, Days 1-3)

**Tasks:**
1. Create comprehensive unit tests (see Section 7)
2. Create integration tests with PIRL
3. Validate against industry standards:
   - Compare with commercial pipeline simulation software
   - Verify pressure drops match expected values
4. Create validation report

**Deliverable:** Fully tested and validated hydraulics module

### Phase 3.8: Documentation (Week 3, Days 4-5)

**Tasks:**
1. Document all hydraulic equations with references
2. Create API documentation for all classes/functions
3. Create user guide for hydraulics module
4. Update PIRL training guide
5. Create example notebooks

**Deliverable:** Complete documentation package

---

## 4. State Space Expansion

### 4.1 Current State (17 Dimensions)

```cpp
struct State {
    // Position (2)
    double x, y;
    
    // Goal (2)
    double goal_distance;
    double goal_bearing;
    
    // Terrain (4)
    double elevation;
    double slope;
    double aspect;
    double curvature;
    
    // Constraints (3)
    double no_go_zone;
    double water_proximity;
    double road_proximity;
    
    // Environmental (4)
    double geohazard_risk;
    double soil_capacity;
    double cadastre_complex;
    double population_density;
    
    // Infrastructure (1)
    double railway_proximity;
    
    // History (2)
    double prev_heading;
    double prev_step_size;
};
```

### 4.2 Enhanced State (21 Dimensions) - NEW

```cpp
struct State {
    // ... existing 17 dimensions ...
    
    // Hydraulic State (4 NEW)
    double cumulative_pressure_drop_mpa;    // Total pressure loss so far (MPa)
    double segments_since_compressor;        // Number of segments since last compressor
    double flow_velocity_m_s;                // Current segment velocity (m/s)
    double reynolds_number;                  // Flow regime indicator (dimensionless)
};
```

### 4.3 State Normalization Ranges

```cpp
// Existing normalizations remain unchanged
// Add new normalizations:

// Hydraulic features
state_normalized[17] = cumulative_pressure_drop_mpa / 5.0;  // 0-5 MPa range
state_normalized[18] = segments_since_compressor / 1000.0;  // 0-1000 segments
state_normalized[19] = flow_velocity_m_s / 20.0;            // 0-20 m/s range
state_normalized[20] = reynolds_number / 10000000.0;        // 0-10M range
```

### 4.4 Neural Network Architecture Adjustment

**Current:** 17-dimensional input → 2 hidden layers × 64 neurons → 2-dimensional output

**Enhanced:** 21-dimensional input → 2 hidden layers × 64 neurons → 2-dimensional output

**Impact:**
- Input layer: 17×64 = 1,088 parameters → 21×64 = 1,344 parameters (+256 params)
- Total network parameters: ~10,500 → ~10,750 (+2.4% increase)
- Training time: +15-20% due to larger state space
- Required timesteps: 1.5M → 2.0M for same convergence

---

## 5. Compressor Station Logic

### 5.1 Placement Algorithm

```cpp
std::vector<CompressorStation> place_compressor_stations(
    std::vector<SegmentHydraulics>& route_hydraulics,
    double min_pressure_bar,
    double max_pressure_bar
) {
    std::vector<CompressorStation> stations;
    
    // Scan route for pressure violations
    for (size_t i = 0; i < route_hydraulics.size(); ++i) {
        auto& segment = route_hydraulics[i];
        
        // Check if pressure falls below minimum (with safety margin)
        const double SAFETY_MARGIN_BAR = 5.0;
        
        if (segment.exit_pressure_bar < (min_pressure_bar + SAFETY_MARGIN_BAR)) {
            // Need compressor station
            
            // Find optimal location (look back 10-20 segments for best spot)
            int placement_index = find_optimal_placement(
                route_hydraulics, i, min_pressure_bar, max_pressure_bar);
            
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
            
            // Reset pressure after compression
            route_hydraulics[placement_index].exit_pressure_bar = max_pressure_bar;
            
            // Recalculate downstream segments
            recalculate_downstream_pressures(route_hydraulics, placement_index + 1);
            
            stations.push_back(station);
        }
    }
    
    return stations;
}
```

### 5.2 Compressor Type Selection

```cpp
std::string select_compressor_type(double compression_ratio, double power_kw) {
    // Decision matrix based on industry standards
    
    // Centrifugal compressors:
    // - Best for: Low-medium compression ratios (1.2-2.5)
    // - High flow rates (> 100,000 m³/day)
    // - Continuous operation
    // - Lower maintenance
    
    // Reciprocating compressors:
    // - Best for: High compression ratios (2.5-4.0)
    // - Lower flow rates
    // - Can handle variable flow
    // - Higher efficiency at low flow
    
    if (compression_ratio <= 2.5 && power_kw >= 1000) {
        return "centrifugal";
    } else if (compression_ratio > 2.5) {
        return "reciprocating";
    } else {
        return "centrifugal";  // Default for most gas transmission
    }
}
```

### 5.3 Power Calculation (Polytropic Compression)

```cpp
double calculate_power_requirement(
    double P1_bar, 
    double P2_bar, 
    double Q_m3_s,
    const GasProperties& gas,
    double efficiency = 0.82
) {
    // Convert to absolute pressure (Pa)
    double P1_pa = P1_bar * 100000.0;
    double P2_pa = P2_bar * 100000.0;
    
    // Compression ratio
    double r = P2_pa / P1_pa;
    
    // Polytropic exponent (for natural gas)
    double n = 1.3;  // Typical for gas compression
    
    // Gas constant (specific)
    double R_specific = 8314.46 / gas.molecular_weight_kg_kmol;  // J/(kg·K)
    
    // Inlet temperature (assume standard)
    double T1 = 288.15;  // K
    
    // Theoretical power (polytropic)
    double W_theoretical = (n / (n - 1.0)) * P1_pa * Q_m3_s * 
                          (pow(r, (n - 1.0) / n) - 1.0) / efficiency;
    
    // Convert to kW
    double power_kw = W_theoretical / 1000.0;
    
    return power_kw;
}
```

### 5.4 Station Economics

```cpp
CompressorStation design_station(
    double inlet_pressure_bar,
    double outlet_pressure_bar,
    double flow_rate_m3_s,
    const GasProperties& gas
) {
    CompressorStation station;
    
    // Calculate performance
    station.inlet_pressure_bar = inlet_pressure_bar;
    station.outlet_pressure_bar = outlet_pressure_bar;
    station.compression_ratio = outlet_pressure_bar / inlet_pressure_bar;
    
    // Calculate power
    station.power_required_kw = calculate_power_requirement(
        inlet_pressure_bar, outlet_pressure_bar, flow_rate_m3_s, gas);
    
    // Select type
    station.type = select_compressor_type(
        station.compression_ratio, station.power_required_kw);
    
    // Economics
    // CAPEX: $4,000-6,000 per kW for centrifugal, $5,000-7,000 for reciprocating
    double capex_per_kw = (station.type == "centrifugal") ? 5000.0 : 6000.0;
    station.capex_usd = station.power_required_kw * capex_per_kw;
    
    // Add fixed costs (site prep, buildings, piping)
    station.capex_usd += 5000000.0;  // $5M fixed cost
    
    // OPEX: Energy + Maintenance + Personnel
    // Energy: $0.05/kWh × 8760 hours/year
    double energy_cost = station.power_required_kw * 8760 * 0.05;  // $/year
    
    // Maintenance: 3% of CAPEX per year
    double maintenance_cost = station.capex_usd * 0.03;
    
    // Personnel: $400k/year
    double personnel_cost = 400000.0;
    
    station.opex_annual_usd = energy_cost + maintenance_cost + personnel_cost;
    
    return station;
}
```

---

## 6. Route Segment Attributes

### 6.1 Enhanced RouteSegment Struct

```cpp
struct RouteSegment {
    // Existing attributes (geometry, terrain, costs, constraints)
    // ... (30+ existing attributes) ...
    
    // NEW: Hydraulic Attributes (4 new fields)
    
    // Pressure at segment entry (bar)
    double entry_pressure_bar = 0.0;
    
    // Pressure at segment exit (bar)
    double exit_pressure_bar = 0.0;
    
    // Whether this segment contains a compressor station
    bool has_compressor_station = false;
    
    // Type of compressor if present: "centrifugal", "reciprocating", or empty string
    std::string compressor_station_type;
    
    // Additional hydraulic info (not exported to GeoJSON, for internal use)
    double pressure_drop_friction_bar = 0.0;
    double pressure_drop_elevation_bar = 0.0;
    double flow_velocity_m_s = 0.0;
    double reynolds_number = 0.0;
    double friction_factor = 0.0;
};
```

### 6.2 GeoJSON Export Format

```json
{
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": {
      "name": "urn:ogc:def:crs:EPSG::32633"
    }
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[379648, 4805030], [379698, 4804985]]
      },
      "properties": {
        "segment_id": 0,
        "length_m": 58.3,
        "elevation_start_m": 12.5,
        "elevation_end_m": 14.2,
        "slope_percent": 2.9,
        
        // Existing attributes...
        "cost_usd": 8750,
        "terrain_difficulty": 0.3,
        
        // NEW: Hydraulic Attributes (4 new fields)
        "entry_pressure_bar": 70.0,
        "exit_pressure_bar": 69.998,
        "has_compressor_station": false,
        "compressor_station_type": null
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[408250, 4750180], [408300, 4750140]]
      },
      "properties": {
        "segment_id": 755,
        "length_m": 61.2,
        "elevation_start_m": 320.0,
        "elevation_end_m": 315.0,
        
        // Segment where compressor station is placed
        "entry_pressure_bar": 48.5,
        "exit_pressure_bar": 70.0,  // Compressed back to MOP
        "has_compressor_station": true,
        "compressor_station_type": "centrifugal",
        
        // Additional metadata (optional)
        "compressor_power_kw": 5200,
        "compression_ratio": 1.44,
        "compressor_capex_usd": 31000000,
        "compressor_opex_annual_usd": 3200000
      }
    }
  ]
}
```

### 6.3 Pressure Profile Summary

Add summary metadata to GeoJSON root properties:

```json
{
  "type": "FeatureCollection",
  "properties": {
    "route_summary": {
      "total_length_km": 75.2,
      "total_cost_usd": 48500000,
      
      // NEW: Hydraulic Summary
      "hydraulics": {
        "initial_pressure_bar": 70.0,
        "final_pressure_bar": 58.3,
        "min_pressure_bar": 48.2,
        "total_pressure_drop_bar": 11.7,
        "pressure_drop_friction_bar": 8.5,
        "pressure_drop_elevation_bar": 3.2,
        "compressor_stations_count": 0,
        "hydraulically_feasible": true,
        "min_delivery_pressure_bar": 45.0,
        "pressure_margin_bar": 13.3
      }
    }
  },
  "features": [...]
}
```

---

## 7. Testing & Validation

### 7.1 Unit Tests

**File:** `tests/test_hydraulics_unit.cpp`

```cpp
#include <gtest/gtest.h>
#include "agrs_zeus/Hydraulics.h"

using namespace agrs::pirl;

class HydraulicsTest : public ::testing::Test {
protected:
    PipelineHydraulics setup_test_pipeline() {
        PipelineHydraulics params;
        params.diameter_internal_m = 0.6382;  // 26" internal
        params.roughness_absolute_mm = 0.045;
        params.flow_rate_m3_s = 0.5;
        params.operating_temperature_k = 288.15;
        return params;
    }
};

TEST_F(HydraulicsTest, FrictionFactorCalculation) {
    HydraulicsCalculator calc(setup_test_pipeline());
    
    // Test with known Reynolds number
    double Re = 5000000;  // Turbulent flow
    double f = calc.calculate_friction_factor(Re);
    
    // Friction factor should be in range 0.01-0.02 for smooth steel
    EXPECT_GT(f, 0.01);
    EXPECT_LT(f, 0.02);
}

TEST_F(HydraulicsTest, ReynoldsNumberCalculation) {
    HydraulicsCalculator calc(setup_test_pipeline());
    
    double velocity = 7.3;  // m/s
    double density = 53.0;  // kg/m³ at 70 bar
    
    double Re = calc.calculate_reynolds_number(velocity, density);
    
    // Should be in turbulent regime (> 4000)
    EXPECT_GT(Re, 4000);
    EXPECT_LT(Re, 10000000);  // Reasonable upper bound
}

TEST_F(HydraulicsTest, SingleSegmentPressureDrop) {
    HydraulicsCalculator calc(setup_test_pipeline());
    
    // Test: 1 km horizontal segment at 70 bar
    SegmentHydraulics result = calc.calculate_segment(70.0, 1000.0, 0.0);
    
    // Pressure should drop slightly (friction only)
    EXPECT_LT(result.exit_pressure_bar, 70.0);
    EXPECT_GT(result.exit_pressure_bar, 69.8);  // Should be ~69.92 bar
    
    // Pressure drop should be small for 1 km
    EXPECT_LT(result.pressure_drop_bar, 0.3);
    
    // Velocity should be reasonable
    EXPECT_GT(result.flow_velocity_m_s, 1.0);
    EXPECT_LT(result.flow_velocity_m_s, 15.0);
}

TEST_F(HydraulicsTest, ElevationPressureDrop) {
    HydraulicsCalculator calc(setup_test_pipeline());
    
    // Test: 1 km segment with +100m elevation gain
    SegmentHydraulics result = calc.calculate_segment(70.0, 1000.0, 100.0);
    
    // Pressure drop should be larger due to elevation
    EXPECT_LT(result.exit_pressure_bar, 69.5);
    
    // Elevation component should be significant
    EXPECT_GT(result.pressure_drop_elevation_bar, 0.4);
}

TEST_F(HydraulicsTest, CompressorPowerCalculation) {
    GasProperties gas;
    gas.molecular_weight_kg_kmol = 16.8;
    
    double power = CompressorStationDesigner::calculate_power_requirement(
        50.0,  // 50 bar inlet
        70.0,  // 70 bar outlet
        0.5,   // 0.5 m³/s
        gas
    );
    
    // Power should be in reasonable range (5-10 MW for this compression)
    EXPECT_GT(power, 4000);   // > 4 MW
    EXPECT_LT(power, 12000);  // < 12 MW
}

TEST_F(HydraulicsTest, CompressorTypeSelection) {
    // Low compression ratio, high power → Centrifugal
    std::string type1 = CompressorStationDesigner::select_compressor_type(1.5, 8000);
    EXPECT_EQ(type1, "centrifugal");
    
    // High compression ratio → Reciprocating
    std::string type2 = CompressorStationDesigner::select_compressor_type(3.0, 800);
    EXPECT_EQ(type2, "reciprocating");
}
```

### 7.2 Integration Tests

**File:** `tests/test_hydraulics_integration.cpp`

```cpp
TEST(HydraulicsIntegration, FullRouteCalculation) {
    // Create test route: 50 km, gradually uphill (+300m)
    std::vector<std::pair<double, double>> route_segments;
    
    for (int i = 0; i < 500; ++i) {
        route_segments.push_back({100.0, 0.6});  // 100m length, +0.6m elevation
    }
    
    PipelineHydraulics params;
    params.diameter_internal_m = 0.6382;
    params.flow_rate_m3_s = 0.5;
    
    HydraulicsCalculator calc(params);
    
    auto result = calc.calculate_route(route_segments, 70.0, 45.0);
    
    // Should have calculated hydraulics for all segments
    EXPECT_EQ(result.size(), 500);
    
    // First segment starts at 70 bar
    EXPECT_FLOAT_EQ(result[0].entry_pressure_bar, 70.0);
    
    // Last segment should be above minimum delivery pressure
    EXPECT_GT(result[499].exit_pressure_bar, 45.0);
    
    // Pressure should decrease monotonically (if no compressors)
    for (size_t i = 1; i < result.size(); ++i) {
        if (!result[i-1].has_compressor_station) {
            EXPECT_LE(result[i].entry_pressure_bar, result[i-1].exit_pressure_bar + 0.01);
        }
    }
}

TEST(HydraulicsIntegration, CompressorStationPlacement) {
    // Create long route that requires compressor
    std::vector<std::pair<double, double>> route_segments;
    
    // 150 km route, flat terrain
    for (int i = 0; i < 1500; ++i) {
        route_segments.push_back({100.0, 0.0});
    }
    
    HydraulicsCalculator calc(setup_test_pipeline());
    
    auto hydraulics = calc.calculate_route(route_segments, 70.0, 45.0);
    auto stations = calc.place_compressor_stations(hydraulics, 45.0, 70.0);
    
    // Should place at least 1 compressor station
    EXPECT_GE(stations.size(), 1);
    
    // All stations should have valid properties
    for (const auto& station : stations) {
        EXPECT_GT(station.compression_ratio, 1.0);
        EXPECT_LT(station.compression_ratio, 4.0);
        EXPECT_GT(station.power_required_kw, 0.0);
        EXPECT_FALSE(station.type.empty());
    }
    
    // Final pressure should be above minimum
    EXPECT_GT(hydraulics.back().exit_pressure_bar, 45.0);
}
```

### 7.3 Validation Against Industry Standards

**Validation Test Cases:**

1. **Compare with Weymouth Equation (hand calculation)**
   - Route: 100 km, 26", 70 bar inlet, 0.5 m³/s
   - Expected: ~57 bar outlet (friction only)
   - Tolerance: ±2%

2. **Compare with Commercial Software (PIPESIM/OLGA)**
   - Run same route in commercial simulator
   - Compare pressure profiles
   - Tolerance: ±5%

3. **Physical Reasonableness Checks:**
   - Friction factor: 0.010-0.020 (smooth steel)
   - Reynolds number: >100,000 (turbulent)
   - Velocity: 1-15 m/s (safe range)
   - Pressure drop: 0.05-0.15 bar/km (typical)

### 7.4 Validation Report Template

**File:** `HYDRAULICS_VALIDATION_REPORT.md`

```markdown
# Hydraulics Module Validation Report

## Test Summary
- Date: YYYY-MM-DD
- Test Routes: 10
- Test Segments: 5,000+
- Pass Rate: XX%

## Unit Test Results
- Friction factor calculations: PASS
- Reynolds number calculations: PASS
- Pressure drop calculations: PASS
- Compressor power calculations: PASS

## Integration Test Results
- Full route hydraulics: PASS
- Compressor placement: PASS
- State space integration: PASS

## Industry Standard Comparison
| Test Case | PIRL Result | Expected | Deviation | Status |
|-----------|-------------|----------|-----------|--------|
| 100km flat | 57.2 bar | 57.0 bar | +0.4% | PASS |
| 50km +500m | 52.1 bar | 51.8 bar | +0.6% | PASS |

## Physical Validation
- All friction factors in valid range
- All Reynolds numbers indicate turbulent flow
- All velocities within safe limits
- No pressure violations detected

## Conclusion
Hydraulics module validated and ready for production use.
```

---

## 8. Integration with PIRL

### 8.1 Environment Initialization

```cpp
// File: src/pirl/PIRL_Environment.cpp

PipelineEnvironment::PipelineEnvironment(const ProjectConfig& config) 
    : config_(config) {
    
    // ... existing initialization ...
    
    // Initialize hydraulics calculator
    if (config_.has_pipeline_specs) {
        PipelineHydraulics hydraulics_params;
        hydraulics_params.diameter_internal_m = 
            (config_.pipeline_specs.diameter_mm - 2 * config_.pipeline_specs.wall_thickness_mm) / 1000.0;
        hydraulics_params.roughness_absolute_mm = 0.045;  // New steel
        hydraulics_params.flow_rate_m3_s = config_.pipeline_specs.flow_rate_m3_s;
        hydraulics_params.operating_temperature_k = config_.pipeline_specs.operating_temp_k;
        
        hydraulics_calculator_ = std::make_unique<HydraulicsCalculator>(hydraulics_params);
        
        std::cout << "✅ Hydraulics module initialized" << std::endl;
        std::cout << "   Flow rate: " << hydraulics_params.flow_rate_m3_s << " m³/s" << std::endl;
        std::cout << "   Internal diameter: " << hydraulics_params.diameter_internal_m << " m" << std::endl;
    }
}
```

### 8.2 Step Function Update

```cpp
State PipelineEnvironment::step(const Action& action) {
    // ... existing step logic ...
    
    // Update hydraulic state
    if (hydraulics_calculator_) {
        double segment_length = constrained_action.step_size;
        double elevation_change = new_state.elevation - current_state_.elevation;
        
        // Calculate segment hydraulics
        SegmentHydraulics segment_hydraulics = hydraulics_calculator_->calculate_segment(
            current_pressure_bar_,
            segment_length,
            elevation_change
        );
        
        // Update cumulative state
        cumulative_pressure_drop_mpa_ += segment_hydraulics.pressure_drop_bar / 10.0;
        current_pressure_bar_ = segment_hydraulics.exit_pressure_bar;
        segments_since_last_compressor_++;
        
        // Update state space (new dimensions 17-20)
        new_state.cumulative_pressure_drop_mpa = cumulative_pressure_drop_mpa_;
        new_state.segments_since_compressor = segments_since_last_compressor_;
        new_state.flow_velocity_m_s = segment_hydraulics.flow_velocity_m_s;
        new_state.reynolds_number = segment_hydraulics.reynolds_number / 1000000.0;  // Normalize
        
        // Store in trajectory
        RouteSegment segment;
        // ... existing segment attributes ...
        
        // Add hydraulic attributes
        segment.entry_pressure_bar = segment_hydraulics.entry_pressure_bar;
        segment.exit_pressure_bar = segment_hydraulics.exit_pressure_bar;
        segment.has_compressor_station = false;  // Will be set post-training
        segment.compressor_station_type = "";
        
        trajectory_.push_back(segment);
        
        // Check if compressor needed (pressure too low)
        if (current_pressure_bar_ < config_.pipeline_specs.min_delivery_pressure_bar + 5.0) {
            // Trigger compressor station placement in reward
            needs_compressor_station_ = true;
        }
    }
    
    return new_state;
}
```

### 8.3 Reward Function Update

```cpp
RewardInfo PipelineEnvironment::calculate_reward(const State& prev_state, 
                                                 const Action& action,
                                                 const State& new_state) {
    RewardInfo info;
    // ... existing reward calculations ...
    
    // Hydraulic penalties/bonuses
    if (hydraulics_calculator_) {
        // Penalty for low pressure margin
        double pressure_margin = current_pressure_bar_ - 
                                config_.pipeline_specs.min_delivery_pressure_bar;
        
        if (pressure_margin < 10.0) {
            // Approaching minimum pressure - large penalty
            info.hydraulic_penalty = -(10.0 - pressure_margin) * 100.0;
            info.total_reward += info.hydraulic_penalty;
        } else if (pressure_margin > 20.0) {
            // Good pressure margin - small bonus
            info.hydraulic_bonus = 10.0;
            info.total_reward += info.hydraulic_bonus;
        }
        
        // Compressor station penalty (if needed)
        if (needs_compressor_station_) {
            // Massive penalty for requiring compressor
            // $70M lifecycle cost / 1000 for normalization
            info.compressor_penalty = -70000.0;
            info.total_reward += info.compressor_penalty;
            
            // Reset compressor (would be placed here)
            needs_compressor_station_ = false;
            current_pressure_bar_ = config_.pipeline_specs.mop_bar;
            segments_since_last_compressor_ = 0;
        }
    }
    
    return info;
}
```

### 8.4 Termination Check Update

```cpp
bool PipelineEnvironment::check_termination(const State& state, std::string& reason) {
    // ... existing termination checks ...
    
    // Hydraulic failure: pressure below minimum
    if (hydraulics_calculator_ && 
        current_pressure_bar_ < config_.pipeline_specs.min_delivery_pressure_bar) {
        reason = "FAILURE: Pressure below minimum (" + 
                 std::to_string(current_pressure_bar_) + " bar < " +
                 std::to_string(config_.pipeline_specs.min_delivery_pressure_bar) + " bar)";
        return true;
    }
    
    return false;
}
```

---

## 9. Cost Model Updates

### 9.1 Add Compressor Station Costs

```cpp
// File: src/pirl/PIRL.cpp - CostModel::calculate_segment_cost

double CostModel::calculate_segment_cost(const State& from_state,
                                        const State& to_state,
                                        const GISDataManager& gis,
                                        RewardInfo* reward_info_out) {
    double total_cost = 0.0;
    
    // ... existing cost calculations ...
    
    // Hydraulic costs (NEW)
    if (from_state.cumulative_pressure_drop_mpa > 4.0) {
        // Approaching compressor station requirement
        // Add pressure-dependent cost factor
        double pressure_cost_factor = 1.0 + (from_state.cumulative_pressure_drop_mpa - 4.0) * 0.1;
        total_cost *= pressure_cost_factor;
    }
    
    // Note: Actual compressor station costs are applied post-training
    // during the compressor placement phase
    
    if (reward_info_out) {
        reward_info_out->hydraulic_cost = pressure_cost_factor;
    }
    
    return total_cost;
}
```

### 9.2 Post-Training Compressor Cost Addition

```cpp
// File: src/pirl/PIRL_Utils.cpp

void add_compressor_station_costs(std::vector<RouteSegment>& trajectory,
                                  const std::vector<CompressorStation>& stations) {
    
    for (const auto& station : stations) {
        // Find segment where station is placed
        if (station.segment_index < trajectory.size()) {
            auto& segment = trajectory[station.segment_index];
            
            // Mark segment as having compressor
            segment.has_compressor_station = true;
            segment.compressor_station_type = station.type;
            
            // Add CAPEX to segment cost
            segment.cost_usd += station.capex_usd;
            
            // Add NPV of OPEX (20-year horizon, 5% discount rate)
            double npv_factor = 12.462;  // Present value of annuity, 20 years at 5%
            segment.cost_usd += station.opex_annual_usd * npv_factor;
            
            // Store additional metadata
            segment.compressor_power_kw = station.power_required_kw;
            segment.compression_ratio = station.compression_ratio;
        }
    }
    
    // Recalculate total route cost
    double total_cost = 0.0;
    for (const auto& seg : trajectory) {
        total_cost += seg.cost_usd;
    }
    
    // Update route metadata
    std::cout << "Compressor stations added: " << stations.size() << std::endl;
    std::cout << "Total compressor CAPEX: $" << (stations.size() * 20000000) << std::endl;
    std::cout << "Updated total route cost: $" << total_cost << std::endl;
}
```

---

## 10. Documentation & Deliverables

### 10.1 API Documentation

**File:** `docs/HYDRAULICS_API.md`

Complete API documentation with:
- Class descriptions
- Function signatures
- Parameter descriptions
- Return value specifications
- Usage examples
- Code snippets

### 10.2 User Guide

**File:** `docs/HYDRAULICS_USER_GUIDE.md`

User-friendly guide covering:
- Overview of hydraulics module
- When to use hydraulics
- How to interpret results
- Pressure profile analysis
- Compressor station placement logic
- Troubleshooting common issues

### 10.3 Theory & Equations Reference

**File:** `docs/HYDRAULICS_THEORY.md`

Detailed technical reference:
- All equations with derivations
- Physical assumptions
- Limitations and applicability
- References to industry standards
- Validation against commercial software

### 10.4 Example Notebooks

**File:** `examples/hydraulics_example.ipynb`

Jupyter notebook demonstrating:
- Basic hydraulic calculations
- Single segment analysis
- Full route pressure profile
- Compressor station placement
- Visualization of results

### 10.5 Validation Report

**File:** `HYDRAULICS_VALIDATION_REPORT.md`

Comprehensive validation including:
- All test results
- Comparison with industry standards
- Physical validation checks
- Performance benchmarks
- Known limitations

---

## Implementation Checklist

### Week 1: Core Development

- [ ] Day 1: Create header files (Hydraulics.h, HydraulicsConstants.h)
- [ ] Day 2: Implement friction factor and Reynolds number calculations
- [ ] Day 3: Implement pressure drop calculations (Weymouth + Darcy-Weisbach)
- [ ] Day 4: Implement gas property calculations (density, Z-factor)
- [ ] Day 5: Implement route-level hydraulics (calculate_route function)
- [ ] Day 6: Implement compressor station designer class
- [ ] Day 7: Implement compressor placement algorithm

### Week 2: Integration & Testing

- [ ] Day 1: Expand state space to 21 dimensions
- [ ] Day 2: Update Python bindings for new state space
- [ ] Day 3: Integrate hydraulics into PipelineEnvironment
- [ ] Day 4: Update reward function with hydraulic penalties
- [ ] Day 5: Add 4 new attributes to RouteSegment struct
- [ ] Day 6: Update GeoJSON export with hydraulic data
- [ ] Day 7: Create unit tests for all hydraulic functions

### Week 3: Validation & Documentation

- [ ] Day 1: Create integration tests
- [ ] Day 2: Validate against industry standards
- [ ] Day 3: Create validation report
- [ ] Day 4: Write API documentation
- [ ] Day 5: Write user guide and theory reference
- [ ] Day 6: Create example notebooks
- [ ] Day 7: Final review and testing

---

## Success Criteria

### Technical Validation

- [ ] All unit tests pass (100% coverage for hydraulics module)
- [ ] Integration tests pass with PIRL environment
- [ ] Pressure drop calculations within ±5% of industry standards
- [ ] Compressor placement is physically reasonable
- [ ] No numerical instabilities (NaN, Inf) in calculations
- [ ] Performance: <1ms per segment calculation

### Functional Requirements

- [ ] 4 new columns present in all route GeoJSON outputs
- [ ] Pressure values physically reasonable (0-100 bar range)
- [ ] Compressor stations marked correctly in segments
- [ ] State space expanded to 21 dimensions
- [ ] Training converges with expanded state space

### Documentation

- [ ] Complete API documentation
- [ ] User guide with examples
- [ ] Theory document with all equations
- [ ] Validation report showing compliance
- [ ] Example notebook demonstrating usage

### Performance Targets

- [ ] Training time increase: <25% vs baseline
- [ ] Timesteps required: 2.0M for convergence
- [ ] Memory usage increase: <10%
- [ ] Route generation time: <5 seconds

---

## Risk Mitigation

### Risk 1: Training Doesn't Converge with 21D State

**Probability:** Low  
**Impact:** High

**Mitigation:**
- Start with 18D state (only 1 hydraulic feature: pressure drop)
- Gradually add features if initial training successful
- Increase timesteps to 2.5M if needed

### Risk 2: Hydraulic Calculations Too Slow

**Probability:** Low  
**Impact:** Medium

**Mitigation:**
- Pre-compute friction factors for common Re values
- Use lookup tables for Z-factor calculations
- Optimize critical code paths with profiling

### Risk 3: Pressure Calculations Diverge

**Probability:** Low  
**Impact:** High

**Mitigation:**
- Add safety checks for all calculations
- Clamp values to physical ranges
- Implement fallback to simplified equations if needed

### Risk 4: Compressor Placement Too Conservative

**Probability:** Medium  
**Impact:** Low

**Mitigation:**
- Tune safety margins based on validation
- Allow user to adjust placement aggressiveness
- Compare multiple placement strategies

---

## Post-Implementation Plan

### After Hydraulics Module Completion

1. **Retrain PIRL Model:**
   - Use 21D state space
   - Train for 2M timesteps
   - Compare routes with/without hydraulics

2. **Validate Route Quality:**
   - Check pressure profiles are realistic
   - Verify compressor placement is optimal
   - Compare with commercial software

3. **Performance Analysis:**
   - Measure training time increase
   - Assess route quality improvement
   - Evaluate cost accuracy

4. **Production Deployment:**
   - Update production training scripts
   - Create pressure profile visualization tools
   - Integrate with GUI for real-time display

---

**END OF IMPLEMENTATION PLAN**

**Status:** READY FOR APPROVAL  
**Next Step:** Await explicit approval to begin implementation  
**Estimated Effort:** 3 weeks (1 developer full-time)  
**Dependencies:** Baseline 1.5M training must complete first  





