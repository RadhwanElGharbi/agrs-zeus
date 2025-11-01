#include <catch2/catch_test_macros.hpp>
#include "agrs_zeus/RegulatoryCompliance.h"

using namespace agrs::pirl;

TEST_CASE("Regulatory compliance module tests", "[regulatory]") {
    
    SECTION("RegulatoryCompliance construction for Italy") {
        REQUIRE_NOTHROW(RegulatoryCompliance("ITA", "Marche-Umbria"));
    }
    
    SECTION("RegulatoryCompliance construction for USA") {
        REQUIRE_NOTHROW(RegulatoryCompliance("USA", "Federal"));
    }
    
    SECTION("RegulatoryCompliance construction for Canada") {
        REQUIRE_NOTHROW(RegulatoryCompliance("CAN", "Federal"));
    }
    
    SECTION("ViolationType enumeration") {
        // Test all violation types are defined
        using VT = RegulatoryCompliance::ViolationType;
        
        REQUIRE(static_cast<int>(VT::SEISMIC_SLOPE_MODERATE) >= 0);
        REQUIRE(static_cast<int>(VT::SEISMIC_SLOPE_SEVERE) >= 0);
        REQUIRE(static_cast<int>(VT::PROTECTED_AREA_BUFFER) >= 0);
        REQUIRE(static_cast<int>(VT::PROTECTED_AREA_DIRECT) >= 0);
        REQUIRE(static_cast<int>(VT::WATER_SOURCE_BUFFER) >= 0);
        REQUIRE(static_cast<int>(VT::WATER_SOURCE_CRITICAL) >= 0);
        REQUIRE(static_cast<int>(VT::URBAN_STANDARD) >= 0);
        REQUIRE(static_cast<int>(VT::URBAN_DENSE) >= 0);
        REQUIRE(static_cast<int>(VT::GEOHAZARD_MODERATE) >= 0);
        REQUIRE(static_cast<int>(VT::GEOHAZARD_HIGH) >= 0);
        REQUIRE(static_cast<int>(VT::FAULT_ZONE_ACTIVE) >= 0);
    }
    
    SECTION("Multiple country construction") {
        // Test that multiple instances can be created
        RegulatoryCompliance italy("ITA", "Marche-Umbria");
        RegulatoryCompliance usa("USA", "Federal");
        RegulatoryCompliance canada("CAN", "Federal");
        
        // All should construct successfully
        REQUIRE(true);
    }
}
