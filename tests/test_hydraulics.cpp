#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include "agrs_zeus/Hydraulics.h"
#include "agrs_zeus/PipelineSpecifications.h"

using namespace agrs::pirl;
using Catch::Approx;

TEST_CASE("Hydraulics module tests", "[hydraulics]") {
    
    SECTION("FluidProperties factory methods") {
        auto gas = HydraulicsCalculator::FluidProperties::for_natural_gas(7.0e6, 288.15);
        
        REQUIRE(gas.type == HydraulicsCalculator::FluidType::NATURAL_GAS);
        REQUIRE(gas.density_kg_m3 > 0.0);
        REQUIRE(gas.viscosity_pa_s > 0.0);
        REQUIRE(gas.temperature_k == Approx(288.15));
    }
    
    SECTION("MaterialProperties factory methods") {
        auto steel = HydraulicsCalculator::MaterialProperties::for_carbon_steel();
        
        REQUIRE(steel.type == HydraulicsCalculator::PipeMaterial::CARBON_STEEL);
        REQUIRE(steel.absolute_roughness_mm > 0.0);
        REQUIRE(steel.youngs_modulus_gpa > 0.0);
    }
    
    SECTION("HydraulicsCalculator construction") {
        PipelineSpecifications specs;
        specs.diameter_mm = 660.4;
        specs.thickness_mm = 11.1;
        
        auto fluid = HydraulicsCalculator::FluidProperties::for_natural_gas(7.0e6, 288.15);
        auto material = HydraulicsCalculator::MaterialProperties::for_carbon_steel();
        
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, fluid, material));
    }
    
    SECTION("Segment hydraulics calculation") {
        PipelineSpecifications specs;
        specs.diameter_mm = 660.4;
        specs.thickness_mm = 11.1;
        specs.mop_pa = 7.0e6;
        
        auto fluid = HydraulicsCalculator::FluidProperties::for_natural_gas(7.0e6, 288.15);
        auto material = HydraulicsCalculator::MaterialProperties::for_carbon_steel();
        HydraulicsCalculator calc(specs, fluid, material);
        
        // Test horizontal segment
        auto result = calc.calculate_segment_hydraulics(
            7.0e6,    // inlet_pressure_pa (70 bar)
            100.0,    // segment_length_m
            0.0,      // elevation_change_m
            288.15    // temperature_k
        );
        
        // Basic physical validity checks
        REQUIRE(result.flow_velocity_m_s >= 0.0);
        REQUIRE(result.reynolds_number > 0.0);
        REQUIRE(result.friction_factor > 0.0);
        REQUIRE(result.pressure_drop_pa >= 0.0);
        REQUIRE(result.outlet_pressure_pa > 0.0);
        REQUIRE(result.outlet_pressure_pa <= 7.0e6);  // Cannot exceed inlet
    }
    
    SECTION("Multiple fluid types construction") {
        PipelineSpecifications specs;
        specs.diameter_mm = 660.4;
        specs.thickness_mm = 11.1;
        
        auto material = HydraulicsCalculator::MaterialProperties::for_carbon_steel();
        
        // Test different fluids
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, 
            HydraulicsCalculator::FluidProperties::for_natural_gas(7.0e6, 288.15), 
            material));
        
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, 
            HydraulicsCalculator::FluidProperties::for_crude_oil(288.15), 
            material));
        
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, 
            HydraulicsCalculator::FluidProperties::for_water(288.15), 
            material));
    }
    
    SECTION("Multiple pipe materials construction") {
        PipelineSpecifications specs;
        specs.diameter_mm = 660.4;
        specs.thickness_mm = 11.1;
        
        auto fluid = HydraulicsCalculator::FluidProperties::for_natural_gas(7.0e6, 288.15);
        
        // Test different materials
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, fluid,
            HydraulicsCalculator::MaterialProperties::for_carbon_steel()));
        
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, fluid,
            HydraulicsCalculator::MaterialProperties::for_stainless_steel()));
        
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, fluid,
            HydraulicsCalculator::MaterialProperties::for_hdpe()));
        
        REQUIRE_NOTHROW(HydraulicsCalculator(specs, fluid,
            HydraulicsCalculator::MaterialProperties::for_coated_steel()));
    }
    
    SECTION("Pressure drop with elevation change") {
        PipelineSpecifications specs;
        specs.diameter_mm = 660.4;
        specs.thickness_mm = 11.1;
        
        auto fluid = HydraulicsCalculator::FluidProperties::for_natural_gas(7.0e6, 288.15);
        auto material = HydraulicsCalculator::MaterialProperties::for_carbon_steel();
        HydraulicsCalculator calc(specs, fluid, material);
        
        // Uphill segment
        auto uphill = calc.calculate_segment_hydraulics(7.0e6, 100.0, 50.0, 288.15);
        
        // Downhill segment
        auto downhill = calc.calculate_segment_hydraulics(7.0e6, 100.0, -50.0, 288.15);
        
        // Uphill should have more pressure drop than downhill
        REQUIRE(uphill.pressure_drop_pa > downhill.pressure_drop_pa);
    }
    
    SECTION("Flow regime detection") {
        PipelineSpecifications specs;
        specs.diameter_mm = 660.4;
        specs.thickness_mm = 11.1;
        
        auto fluid = HydraulicsCalculator::FluidProperties::for_natural_gas(7.0e6, 288.15);
        auto material = HydraulicsCalculator::MaterialProperties::for_carbon_steel();
        HydraulicsCalculator calc(specs, fluid, material);
        
        auto result = calc.calculate_segment_hydraulics(7.0e6, 100.0, 0.0, 288.15);
        
        // Flow regime: 0=laminar, 1=transitional, 2=turbulent
        REQUIRE(result.flow_regime >= 0);
        REQUIRE(result.flow_regime <= 2);
        
        // For gas pipelines, expect turbulent flow
        REQUIRE(result.reynolds_number > 2000.0);
    }
}
