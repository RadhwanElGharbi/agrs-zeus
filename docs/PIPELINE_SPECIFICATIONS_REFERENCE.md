# Pipeline Specifications Reference Document

**Purpose:** Comprehensive reference for pipeline specification variables that can enhance PIRL's physics modeling and cost optimization. This document catalogs potential enhancements for future implementation.

**Status:** REFERENCE ONLY - Not implemented unless explicitly requested

**Last Updated:** 2025-11-07

---

## Table of Contents

1. [Current Implementation](#current-implementation)
2. [Cold Bending Reference Table (Carbon Steel)](#cold-bending-reference-table-carbon-steel)
3. [Hydraulic & Flow Specifications](#hydraulic--flow-specifications)
4. [Pressure & Delivery Requirements](#pressure--delivery-requirements)
5. [Material & Structural Properties](#material--structural-properties)
6. [Operating Conditions](#operating-conditions)
7. [Construction & Installation Specs](#construction--installation-specs)
8. [Regulatory & Compliance](#regulatory--compliance)
9. [Economic Parameters](#economic-parameters)
10. [Implementation Priority](#implementation-priority)

---

## Current Implementation

**File:** `/opt/agrs/Projects/test_project2/pipeline_specs.json`

**Currently Specified:**
```json
{
  "diameter_mm": 660.4,
  "wall_thickness_mm": 11.1,
  "material": "Carbon Steel",
  "type": "Gas",
  "mop_bar": 70.0,
  "dp_bar": 75.0,
  "depth_of_cover_m": 1.5,
  "hdd_min_bend_radius_m": 792.48,
  "hot_bend_angles_deg": [5.0, 10.0, 22.5, 45.0, 90.0],
  "hot_bend_min_radius_m": 1.981,
  "hot_bend_max_count": 50,
  "field_bend_max_angle_deg": 5.0,  // ⚠️ SHOULD BE 20.0 for 26" carbon steel
  "house_min_distance_m": 15.0,
  "powerlines_min_distance_m": 10.0,
  "existing_pipelines_min_distance_m": 5.0,
  "max_slope_percent": 20.0,
  "flow_rate_m3_s": 0.5,
  "operating_temp_k": 288.15,
  "max_pressure_drop_mpa": 5.0
}
```

---

## Cold Bending Reference Table (Carbon Steel)

**Source:** `curve a 40DN (a freddo).pdf` - Italian pipeline cold bending standards

**Standard Bar Length:** 12.00 m (BARRA da 12.00 m)

**Bend Radius Rule:** 40 × DN (40 × Nominal Diameter)

### Complete Table for Carbon Steel Pipes

| DN (") | Diameter (mm) | Thickness (mm) | Development (m) | Bend Radius (m) | **α MAX (°)** | Sv (mm) | Sp MIN (mm) | Tg MAX (m) |
|--------|---------------|----------------|-----------------|-----------------|---------------|---------|-------------|------------|
| 4½     | 114.3         | 1.20           | 9.60            | 4.57            | 120°          | 8.0     | 5.30        | 7.92       |
| 6⅝     | 168.3         | 1.20           | 9.60            | 6.73            | 81°           | 11.7    | 5.73        | 5.82       |
| 8⅝     | 219.1         | 1.20           | 9.60            | 8.76            | 62°           | 15.3    | 6.13        | 5.35       |
| 10¾    | 273.1         | 1.20           | 9.60            | 10.92           | 50°           | 19.1    | 6.55        | 5.14       |
| 12¾    | 323.9         | 1.20           | 9.60            | 12.95           | 42°           | 22.6    | 6.95        | 5.03       |
| 14     | 355.6         | 1.20           | 9.60            | 14.22           | 38°           | 24.8    | 7.20        | 4.99       |
| 16     | 406.4         | 1.20           | 9.60            | 16.26           | 33°           | 28.4    | 7.60        | 4.94       |
| 18     | 457.2         | 1.20           | 9.60            | 18.29           | 30°           | 31.9    | 8.00        | 4.90       |
| 20     | 508.0         | 1.20           | 9.60            | 20.32           | 27°           | 35.5    | 8.40        | 4.89       |
| 22     | 558.8         | 1.20           | 9.60            | 22.35           | 24°           | 39.0    | 8.80        | 4.88       |
| **24** | **609.6**     | **1.20**       | **9.60**        | **24.38**       | **22°** ⭐    | **42.6**| **9.20**    | **4.86**   |
| **26** | **660.4**     | **1.30**       | **9.40**        | **26.42**       | **20°** ⭐    | **46.1**| **9.60**    | **4.75**   |
| 28     | 711.2         | 1.40           | 9.20            | 28.45           | 18°           | 49.6    | 10.00       | 4.64       |
| 30     | 762.0         | 1.50           | 9.00            | 30.48           | 17°           | 53.2    | 10.40       | 4.53       |
| 32     | 812.8         | 1.60           | 8.80            | 32.51           | 15°           | 56.7    | 10.80       | 4.43       |
| 34     | 863.6         | 1.70           | 8.60            | 34.54           | 14°           | 60.3    | 11.20       | 4.32       |
| 36     | 914.4         | 1.80           | 8.40            | 36.58           | 13°           | 63.8    | 11.60       | 4.22       |
| 38     | 965.2         | 1.90           | 8.20            | 38.61           | 12°           | 67.4    | 12.00       | 4.12       |
| 40     | 1016.0        | 2.00           | 8.00            | 40.64           | 11°           | 70.9    | 12.40       | 4.01       |
| 42     | 1066.8        | 2.15           | 7.70            | 42.67           | 10°           | 74.5    | 12.80       | 3.86       |
| 48     | 1219.2        | 2.45           | 7.10            | 48.77           | 8°            | 85.1    | 14.00       | 3.56       |

**Key Parameters:**
- **α MAX:** Maximum cold bend angle per 12m bar section
- **Sv:** Development length for the bend
- **Sp MIN:** Minimum straight section after bend
- **Tg MAX:** Maximum tangent length

### Critical Finding for 26" Pipeline:

**Current Project:**
- **Diameter:** 26" (660.4mm)
- **Maximum Cold Bend Angle:** **20° per 12m joint** ⭐
- **Current Implementation:** 5° (4× TOO RESTRICTIVE)
- **Bend Radius (40D):** 26.42m minimum

**Recommendation:** Update `field_bend_max_angle_deg` from 5.0 to 20.0 in future implementations.

---

## Hydraulic & Flow Specifications

**Status:** NOT IMPLEMENTED (reference only)

### Flow Characteristics

```json
"hydraulics": {
  // Basic Flow
  "volumetric_flow_rate_m3_s": 0.5,           // Current: ✅ Implemented
  "volumetric_flow_rate_m3_h": 1800,          // Derived
  "mass_flow_rate_kg_s": 26.5,                // Natural gas at 70 bar, 15°C
  "design_flow_rate_m3_day": 43200,           // Standard conditions (1 atm, 15°C)
  
  // Velocity Constraints
  "max_velocity_m_s": 15.0,                   // Erosion limit for gas
  "min_velocity_m_s": 3.0,                    // Prevent liquid dropout
  "design_velocity_m_s": 7.3,                 // Typical: 0.5 m³/s in 660mm pipe
  "erosional_velocity_limit_m_s": 20.0,       // C-factor = 100 (gas)
  
  // Pressure Parameters
  "inlet_pressure_bar": 70.0,                 // MOP at entry point
  "outlet_pressure_bar": 60.0,                // Typical delivery pressure
  "min_delivery_pressure_bar": 45.0,          // ⭐ NEW: Minimum acceptable
  "max_pressure_drop_per_km_bar": 0.15,       // Typical for gas transmission
  "allowable_total_pressure_drop_bar": 10.0,  // For entire route
  
  // Compressor/Pump Station Parameters
  "compression_ratio_max": 1.75,              // Typical: 70/40 = 1.75
  "compressor_efficiency": 0.85,              // Mechanical efficiency
  "compressor_power_requirement_kw": 5000,    // Estimated for this pipeline
  "min_distance_between_stations_km": 80,     // Typical for gas transmission
  "max_distance_between_stations_km": 150     // Before pressure becomes critical
}
```

### Fluid Properties (Natural Gas)

```json
"fluid_properties": {
  "fluid_type": "natural_gas",
  "gas_composition": {
    "methane_ch4_percent": 95.0,
    "ethane_c2h6_percent": 3.0,
    "propane_c3h8_percent": 1.0,
    "nitrogen_n2_percent": 1.0
  },
  "molecular_weight_kg_kmol": 16.8,           // Mixture MW
  "specific_gravity": 0.58,                   // Relative to air (0.6 typical)
  "gas_constant_j_kg_k": 494.0,               // R = 8314/MW
  "compressibility_factor_z": 0.85,           // At 70 bar, 15°C
  
  // Density (pressure/temperature dependent)
  "density_at_70bar_15c_kg_m3": 53.0,
  "density_at_stp_kg_m3": 0.72,               // Standard conditions
  
  // Viscosity
  "dynamic_viscosity_pa_s": 1.1e-5,           // At operating conditions
  "kinematic_viscosity_m2_s": 2.08e-7,        // μ/ρ
  
  // Thermal Properties
  "specific_heat_cp_j_kg_k": 2200,
  "specific_heat_cv_j_kg_k": 1700,
  "thermal_conductivity_w_m_k": 0.033,
  
  // Operating Conditions
  "operating_temperature_k": 288.15,          // Current: ✅ Implemented
  "operating_temperature_c": 15.0,
  "min_operating_temp_k": 273.15,             // 0°C
  "max_operating_temp_k": 323.15,             // 50°C
  "ambient_temperature_k": 283.15             // 10°C average
}
```

---

## Pressure & Delivery Requirements

**Status:** PARTIALLY IMPLEMENTED

### Pressure Management

```json
"pressure_specifications": {
  // Operating Pressures
  "maximum_operating_pressure_mop_bar": 70.0,     // Current: ✅ Implemented
  "design_pressure_dp_bar": 75.0,                 // Current: ✅ Implemented
  "maximum_allowable_operating_pressure_maop_bar": 72.0,
  "normal_operating_pressure_bar": 65.0,
  
  // Delivery Requirements ⭐ NEW
  "min_delivery_pressure_bar": 45.0,              // Contractual minimum at endpoint
  "target_delivery_pressure_bar": 50.0,           // Optimal for downstream
  "max_delivery_pressure_bar": 65.0,              // Upper bound
  
  // Pressure Testing
  "hydrostatic_test_pressure_bar": 112.5,         // 1.5 × DP
  "leak_test_pressure_bar": 80.0,
  "maximum_surge_pressure_bar": 85.0,
  
  // Pressure Drop Budget
  "max_pressure_drop_mpa": 5.0,                   // Current: ✅ Implemented
  "max_pressure_drop_bar": 50.0,
  "friction_pressure_drop_budget_bar": 30.0,      // Allocated to friction
  "elevation_pressure_drop_budget_bar": 20.0,     // Allocated to elevation
  
  // Safety Margins
  "overpressure_safety_margin_percent": 10.0,
  "underpressure_safety_margin_percent": 15.0
}
```

### Delivery Point Specifications ⭐ NEW

```json
"delivery_specifications": {
  // Pressure at Delivery
  "contractual_delivery_pressure_bar": 45.0,
  "min_acceptable_delivery_pressure_bar": 40.0,
  "delivery_pressure_tolerance_bar": 2.0,
  
  // Flow at Delivery
  "contractual_flow_rate_m3_h": 1800,
  "min_flow_rate_m3_h": 1500,
  "max_flow_rate_m3_h": 2000,
  
  // Quality Requirements
  "min_heating_value_mj_m3": 35.0,
  "max_water_content_mg_m3": 50.0,
  "max_h2s_content_ppm": 5.0,
  "max_co2_content_percent": 2.5,
  
  // Temperature at Delivery
  "delivery_temperature_c": 15.0,
  "min_delivery_temperature_c": 5.0,
  "max_delivery_temperature_c": 30.0
}
```

---

## Material & Structural Properties

**Status:** PARTIALLY IMPLEMENTED

### Pipe Material Specifications

```json
"material_properties": {
  // Material Type
  "material": "Carbon Steel",                     // Current: ✅ Implemented
  "grade": "API 5L X65",                          // ⭐ NEW: Common for gas pipelines
  "specification_standard": "API 5L PSL2",
  
  // Mechanical Properties
  "yield_strength_mpa": 448,                      // X65 grade
  "tensile_strength_mpa": 531,
  "elongation_percent": 18,
  "hardness_hv": 220,
  
  // Physical Properties
  "density_kg_m3": 7850,                          // Steel density
  "elastic_modulus_gpa": 207,
  "poisson_ratio": 0.30,
  "thermal_expansion_coefficient_k": 1.2e-5,
  
  // Corrosion & Coating
  "external_coating": "3-Layer Polyethylene (3LPE)",
  "coating_thickness_mm": 3.0,
  "internal_coating": "Epoxy",
  "cathodic_protection": "Impressed Current",
  "design_life_years": 50,
  
  // Manufacturing
  "pipe_manufacturing_process": "Seamless or ERW",
  "weld_type": "Longitudinal",
  "inspection_level": "100% UT and RT",
  
  // Surface Properties
  "absolute_roughness_mm": 0.045,                 // New steel
  "aged_roughness_mm": 0.060,                     // After 20 years
  "hazen_williams_coefficient": 140               // For hydraulic calcs
}
```

### Dimensional Specifications

```json
"dimensions": {
  // Current Implementation ✅
  "nominal_diameter_inch": 26,
  "nominal_diameter_mm": 660.4,
  "outer_diameter_mm": 660.4,
  "wall_thickness_mm": 11.1,
  
  // Derived Parameters ⭐ NEW
  "inner_diameter_mm": 638.2,                     // OD - 2×thickness
  "inner_diameter_m": 0.6382,
  "cross_sectional_area_m2": 0.320,
  "moment_of_inertia_m4": 0.00654,
  "section_modulus_m3": 0.0198,
  
  // Weight
  "pipe_weight_per_meter_kg": 180.5,
  "fluid_weight_per_meter_kg": 17.0,              // Gas at 70 bar
  "total_weight_per_meter_kg": 197.5,
  
  // Burial
  "depth_of_cover_m": 1.5,                        // Current: ✅ Implemented
  "trench_width_m": 1.2,
  "min_cover_agricultural_m": 1.2,
  "min_cover_road_crossing_m": 2.0,
  "min_cover_railway_crossing_m": 2.5,
  "min_cover_water_crossing_m": 1.5
}
```

---

## Operating Conditions

**Status:** PARTIALLY IMPLEMENTED

### Temperature Specifications

```json
"temperature_specifications": {
  // Operating Temperature
  "operating_temp_k": 288.15,                     // Current: ✅ Implemented (15°C)
  "operating_temp_c": 15.0,
  "design_temp_min_c": -10.0,
  "design_temp_max_c": 40.0,
  
  // Ambient Conditions
  "ambient_temp_summer_c": 30.0,
  "ambient_temp_winter_c": -5.0,
  "ground_temp_at_burial_depth_c": 12.0,
  
  // Heat Transfer ⭐ NEW
  "soil_thermal_conductivity_w_m_k": 1.5,
  "heat_transfer_coefficient_w_m2_k": 1.2,
  "joule_thomson_coefficient_k_bar": -0.4,       // For gas expansion
  
  // Temperature Drop Budget
  "max_temperature_drop_per_km_c": 0.5,
  "allowable_total_temp_drop_c": 5.0
}
```

### Environmental Conditions

```json
"environmental_conditions": {
  // Climate
  "climate_zone": "Mediterranean",
  "avg_annual_rainfall_mm": 800,
  "max_wind_speed_m_s": 25,
  "seismic_zone": "Zone 2 (Moderate)",
  
  // Soil Properties ⭐ NEW
  "soil_type": "Clay/Silt",
  "soil_bearing_capacity_kpa": 150,
  "soil_friction_angle_deg": 28,
  "soil_cohesion_kpa": 15,
  "groundwater_depth_m": 3.0,
  
  // Geotechnical
  "frost_depth_m": 0.3,
  "expansive_soil_potential": "Low",
  "liquefaction_potential": "Moderate",
  "landslide_risk": "Moderate to High"
}
```

---

## Construction & Installation Specs

**Status:** NOT IMPLEMENTED (reference only)

### Installation Methods

```json
"construction_specifications": {
  // Trenching
  "standard_trench_method": "Open Cut",
  "trench_depth_m": 1.5,                          // Current: ✅ (as depth_of_cover)
  "trench_width_m": 1.2,
  "bedding_material": "Sand",
  "bedding_thickness_mm": 150,
  "backfill_material": "Excavated soil, screened",
  
  // Special Crossing Methods
  "road_crossing_method": "Thrust Boring",        // Criterion 10
  "railway_crossing_method": "HDD (Trenchless)",  // Current: ✅ Criterion 12
  "river_crossing_method": "HDD or Open Cut",
  "hdd_min_bend_radius_m": 792.48,                // Current: ✅ Implemented
  
  // Bending Methods
  "cold_bending": {
    "method": "Field Bending",
    "max_angle_deg": 20.0,                        // ⚠️ Should be 20, currently 5
    "min_radius_m": 26.4,                         // Current: ✅ (40D rule)
    "equipment": "Hydraulic Bender",
    "bar_length_m": 12.0
  },
  "hot_bending": {
    "method": "Pre-fabricated Elbows",
    "available_angles_deg": [15, 30, 45, 60, 90], // Current: ✅ Implemented
    "min_radius_m": 1.981,                        // Current: ✅ Implemented
    "max_count": 50                               // Current: ✅ Implemented
  },
  
  // Welding ⭐ NEW
  "welding_specifications": {
    "welding_process": "SMAW or GTAW root, FCAW fill",
    "weld_inspection": "100% Radiographic or Ultrasonic",
    "heat_treatment": "PWHT not required for X65 <25mm",
    "min_preheat_temp_c": 50,
    "max_interpass_temp_c": 260
  },
  
  // Testing & Commissioning
  "testing_specifications": {
    "hydrostatic_test_duration_hours": 24,
    "test_medium": "Water with corrosion inhibitor",
    "leak_detection_method": "Pressure decay",
    "acceptable_pressure_drop_bar_hour": 0.1,
    "drying_method": "Nitrogen purge",
    "commissioning_gas": "Natural gas with odorant"
  }
}
```

---

## Regulatory & Compliance

**Status:** PARTIALLY IMPLEMENTED

### Standards & Codes ⭐ NEW

```json
"regulatory_compliance": {
  // Design Codes
  "primary_design_code": "EN 14161:2011",         // European gas pipelines
  "secondary_codes": [
    "ASME B31.8",                                 // US gas transmission
    "ISO 13623",                                  // International petroleum/gas
    "UNI 9860",                                   // Italian gas distribution
    "NTC 2018"                                    // Italian construction code
  ],
  
  // Safety Factors
  "design_factor": 0.72,                          // Class 1 location
  "location_class": "Class 1",                    // Rural/agricultural
  "safety_factor_pressure": 1.5,                  // Hydrostatic test = 1.5×DP
  "safety_factor_loads": 1.25,
  
  // Environmental Compliance
  "environmental_directives": [
    "EU Water Framework Directive 2000/60/EC",
    "Habitats Directive 92/43/EEC (Natura 2000)",
    "SEA Directive 2001/42/EC"
  ],
  
  // Clearance Requirements (from AI Routing Criteria)
  "clearances": {
    "houses_min_distance_m": 13.5,                // Current: ✅ Implemented
    "powerlines_overhead_min_distance_m": 6.0,    // Current: ✅ Implemented
    "powerlines_poles_min_distance_m": 6.0,
    "existing_pipelines_min_distance_m": 0.5,     // Current: ✅ Criterion 7
    "railways_min_distance_m": 10.0,              // Current: ✅ Implemented
    "roads_major_min_distance_m": 5.0,
    "water_bodies_min_distance_m": 10.0,
    "protected_areas_buffer_m": 100.0             // Current: ✅ Criterion 3
  },
  
  // Slope Constraints
  "terrain_constraints": {
    "max_slope_percent": 20.0,                    // Current: ✅ Criterion 2
    "max_slope_for_open_cut_percent": 15.0,
    "max_slope_for_equipment_percent": 30.0,
    "side_slope_avoidance": true                  // Current: ✅ Criterion 8
  },
  
  // Crossing Requirements
  "crossing_requirements": {
    "prefer_orthogonal": true,                    // Current: ✅ Criterion 5
    "min_crossing_angle_deg": 75.0,               // Current: ✅ Implemented
    "railway_crossing_method": "trenchless",      // Current: ✅ Criterion 12
    "road_asphalt_method": "thrust_boring",       // Current: ✅ Criterion 10
    "road_non_asphalt_method": "open_cut"         // Current: ✅ Criterion 11
  }
}
```

---

## Economic Parameters

**Status:** PARTIALLY IMPLEMENTED (costs in CostModel)

### Capital Costs (CAPEX) ⭐ NEW

```json
"capital_costs": {
  // Pipe & Materials
  "pipe_cost_usd_per_ton": 1200,
  "pipe_cost_usd_per_meter": 216,                 // 180kg × $1200/ton
  "coating_cost_usd_per_m2": 50,
  "cathodic_protection_cost_usd_per_km": 25000,
  
  // Construction
  "open_cut_trenching_usd_per_m": 150,
  "rock_excavation_additional_usd_per_m": 200,
  "hdd_drilling_usd_per_m": 2500,                 // For crossings
  "thrust_boring_usd_per_m": 1500,
  "river_crossing_usd_per_m": 3000,
  
  // Special Items
  "road_crossing_major_usd": 50000,               // Asphalt road
  "road_crossing_minor_usd": 15000,               // Gravel road
  "railway_crossing_usd": 250000,                 // Current: ✅ In CostModel
  "powerline_crossing_usd": 150000,               // Current: ✅ In CostModel
  "river_crossing_major_usd": 200000,
  "hot_bend_elbow_usd": 5000,                     // Pre-fabricated elbow
  
  // Right of Way
  "row_acquisition_agricultural_usd_per_m": 50,
  "row_acquisition_forest_usd_per_m": 150,
  "row_acquisition_urban_usd_per_m": 500,
  "temporary_construction_easement_usd_per_m": 20,
  
  // Compressor Stations
  "compressor_station_capex_5mw_usd": 20000000,  // $20M for 5MW station
  "compressor_station_capex_10mw_usd": 35000000,
  "metering_station_usd": 500000,
  "block_valve_station_usd": 100000,
  
  // Testing & Commissioning
  "hydrostatic_testing_usd_per_km": 5000,
  "commissioning_usd_per_km": 10000,
  
  // Regional Multipliers
  "italy_regional_cost_multiplier": 1.15,         // Current: ✅ In CostModel
  "urban_area_cost_multiplier": 1.5,
  "mountain_terrain_multiplier": 1.3,
  "protected_area_multiplier": 1.25
}
```

### Operating Costs (OPEX) ⭐ NEW

```json
"operating_costs": {
  // Annual Fixed Costs (per km)
  "inspection_patrol_usd_per_km_year": 500,
  "vegetation_management_usd_per_km_year": 300,
  "cathodic_protection_monitoring_usd_per_km_year": 200,
  "integrity_management_usd_per_km_year": 1000,
  
  // Compressor Station OPEX (per station per year)
  "compressor_energy_cost_usd_per_year": 2500000,  // $2.5M/year
  "compressor_maintenance_usd_per_year": 750000,   // $750k/year
  "compressor_personnel_usd_per_year": 400000,     // $400k/year
  "compressor_total_opex_usd_per_year": 3650000,   // $3.65M/year
  
  // Maintenance & Repair
  "routine_maintenance_usd_per_km_year": 2000,
  "coating_repair_usd_per_km_year": 500,
  "leak_detection_usd_per_km_year": 300,
  
  // Regulatory & Compliance
  "environmental_monitoring_usd_per_year": 50000,
  "safety_audits_usd_per_year": 25000,
  "permit_fees_usd_per_year": 10000,
  
  // Lifecycle Costs (20-year horizon)
  "major_overhaul_year": 10,                       // Major maintenance at year 10
  "major_overhaul_cost_usd": 5000000,
  "npv_discount_rate_percent": 5.0
}
```

---

## Implementation Priority

### Priority 1: Critical for Current Training (Implement Now)

1. **Field Bend Angle Correction**
   - Update `field_bend_max_angle_deg` from 5.0 to 20.0
   - Impact: 4× more turning flexibility, shorter routes
   - File: `pipeline_specs.json` line 18

2. **First Segment Urban Exception**
   - Allow built-up area for first 100m segment only
   - Impact: Prevent immediate termination in urban start location
   - File: `src/pirl/PIRL_Environment.cpp`

3. **Goal Distance Threshold**
   - Change from 50m to 200m
   - Impact: More realistic goal achievement criteria
   - File: `src/pirl/PIRL_Environment.cpp` line 382

### Priority 2: Important for Route Validation (Implement Next)

4. **Minimum Delivery Pressure**
   - Add `min_delivery_pressure_bar` = 45.0
   - Impact: Validate routes meet contractual requirements
   - Usage: Post-training validation script

5. **Pressure Drop Tracking**
   - Add cumulative pressure tracking to state
   - Impact: Verify routes stay within pressure limits
   - Expansion: State 17→18 dimensions

### Priority 3: Enhanced Physics (Future Implementation)

6. **Full Hydraulics Module**
   - Darcy-Weisbach friction calculations
   - Compressor station placement logic
   - Reynolds number, flow velocity tracking
   - Impact: Accurate pressure profiles, energy costs
   - Expansion: State 17→21 dimensions

7. **Material Properties**
   - Steel grade specifications (X65)
   - Corrosion allowances
   - Temperature effects
   - Impact: More realistic structural constraints

### Priority 4: Economic Optimization (Advanced)

8. **Detailed Cost Breakdown**
   - Separate CAPEX vs OPEX
   - Lifecycle cost analysis (NPV)
   - Regional cost adjustments
   - Impact: More accurate total cost of ownership

9. **Compressor Station Economics**
   - CAPEX: $20-35M per station
   - OPEX: $3.65M/year per station
   - Impact: Properly account for compression costs

### Not Recommended for Current Project

10. **Advanced Thermal Analysis**
    - Heat transfer calculations
    - Joule-Thomson effects
    - Reason: Minimal impact on 62-85km route, gas temperature stable

11. **Multi-Phase Flow**
    - Liquid dropout calculations
    - Slug flow modeling
    - Reason: Natural gas pipeline, single phase

12. **Dynamic Simulation**
    - Transient flow analysis
    - Surge pressure calculations
    - Reason: Steady-state sufficient for routing optimization

---

## Usage Notes

### How to Use This Document

1. **Reference Only:** None of these enhancements are implemented unless explicitly requested
2. **Incremental Implementation:** Implement in priority order based on project needs
3. **Validation:** Each parameter should be validated against project-specific requirements
4. **Documentation:** Update this document when parameters are implemented

### Adding New Parameters

When adding parameters to `pipeline_specs.json`:

1. Add parameter with clear units and description
2. Update validation script to check parameter
3. Update C++ code to read and use parameter
4. Document in this reference file
5. Update priority list if critical

### Cold Bending Table Usage

**For Carbon Steel Pipelines:**
- Use table to look up α MAX based on nominal diameter
- Interpolate for intermediate sizes
- This is for 12m bar sections (standard)
- Verify with actual cold bending standards for project region

**Example:** For 30" (762mm) pipeline:
- α MAX = 17° (from table)
- Bend radius = 30.48m (40D rule)
- Use these values in `pipeline_specs.json`

---

## Document Control

**Version:** 1.0  
**Created:** 2025-11-07  
**Last Updated:** 2025-11-07  
**Author:** AGRS ZEUS Development Team  
**Status:** Reference Only - Not Implemented  

**Change Log:**
- 2025-11-07: Initial document creation
- Added complete cold bending table for carbon steel (DN 4½ to DN 48)
- Documented 20° field bend angle for 26" pipeline
- Defined comprehensive hydraulics and pressure specifications
- Cataloged delivery pressure requirements
- Listed economic parameters (CAPEX/OPEX)
- Established implementation priority

**Next Review:** After completion of baseline 1.5M training run

---

**END OF DOCUMENT**











