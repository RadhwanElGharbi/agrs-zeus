#include <catch2/catch_test_macros.hpp>
#include "agrs_zeus/PipelineSpecifications.h"
#include "agrs_zeus/PIRL.h"
#include <fstream>

using namespace agrs::pirl;

TEST_CASE("PipelineSpecifications JSON Loading", "[pipeline_specs]") {
    // Create temporary test JSON
    std::string test_json = R"({
        "diameter_mm": 660.4,
        "thickness_mm": 11.1,
        "material": "Carbon Steel",
        "type": "Gas",
        "mop_bar": 70.0,
        "dp_bar": 75.0,
        "depth_of_cover_m": 1.5,
        "hdd_min_bend_radius_m": 792.48,
        "hdd_applicable": false,
        "hot_bend_angles_deg": [5.0, 10.0, 22.5, 45.0, 90.0],
        "hot_bend_min_radius_m": 1.981,
        "hot_bend_max_count": 50,
        "field_bend_max_angle_deg": 5.0,
        "house_min_distance_m": 15.0,
        "poles_min_distance_m": 5.0,
        "powerlines_min_distance_m": 10.0,
        "max_slope_percent": 20.0,
        "prefer_orthogonal_crossings": true,
        "prefer_existing_rows": true,
        "orthogonal_crossing_threshold_deg": 45.0,
        "existing_row_bonus_usd_per_m": 50.0,
        "flow_rate_m3_s": 0.5,
        "operating_temp_k": 288.15,
        "max_pressure_drop_mpa": 5.0
    })";
    
    std::ofstream f("/tmp/test_pipeline_specs.json");
    f << test_json;
    f.close();
    
    SECTION("Load from JSON") {
        auto specs = PipelineSpecifications::load_from_json("/tmp/test_pipeline_specs.json");
        
        REQUIRE(specs.diameter_mm == 660.4);
        REQUIRE(specs.material == "Carbon Steel");
        REQUIRE(specs.pipeline_type == "Gas");
        REQUIRE(specs.mop_bar == 70.0);
        REQUIRE(specs.max_slope_percent == 20.0);
        REQUIRE(specs.hot_bend_angles_deg.size() == 5);
    }
    
    SECTION("Validate slope constraint") {
        auto specs = PipelineSpecifications::load_from_json("/tmp/test_pipeline_specs.json");
        
        REQUIRE(specs.validate_slope(15.0) == true);   // Within limit
        REQUIRE(specs.validate_slope(20.0) == true);   // At limit
        REQUIRE(specs.validate_slope(25.0) == false);  // Exceeds limit
    }
    
    SECTION("Validate hot bend angles") {
        auto specs = PipelineSpecifications::load_from_json("/tmp/test_pipeline_specs.json");
        
        REQUIRE(specs.validate_hot_bend_angle(5.0) == true);    // Available
        REQUIRE(specs.validate_hot_bend_angle(45.0) == true);   // Available
        REQUIRE(specs.validate_hot_bend_angle(90.0) == true);   // Available
        REQUIRE(specs.validate_hot_bend_angle(15.0) == false);  // Not available
        REQUIRE(specs.validate_hot_bend_angle(30.0) == false);  // Not available
    }
    
    SECTION("Validate clearances") {
        auto specs = PipelineSpecifications::load_from_json("/tmp/test_pipeline_specs.json");
        
        REQUIRE(specs.validate_clearance_house(20.0) == true);   // Sufficient
        REQUIRE(specs.validate_clearance_house(15.0) == true);   // At limit
        REQUIRE(specs.validate_clearance_house(10.0) == false);  // Too close
        
        REQUIRE(specs.validate_clearance_powerline(15.0) == true);   // Sufficient
        REQUIRE(specs.validate_clearance_powerline(10.0) == true);   // At limit
        REQUIRE(specs.validate_clearance_powerline(5.0) == false);   // Too close
    }
    
    SECTION("Validate hot bend count") {
        auto specs = PipelineSpecifications::load_from_json("/tmp/test_pipeline_specs.json");
        
        REQUIRE(specs.validate_hot_bend_count(30) == true);   // Within limit
        REQUIRE(specs.validate_hot_bend_count(50) == true);   // At limit
        REQUIRE(specs.validate_hot_bend_count(60) == false);  // Exceeds limit
    }
}

TEST_CASE("ProjectConfig Pipeline Specs Integration", "[pipeline_specs]") {
    // Create test JSON
    std::string test_json = R"({
        "diameter_mm": 660.4,
        "thickness_mm": 11.1,
        "material": "Carbon Steel",
        "type": "Gas",
        "mop_bar": 70.0,
        "max_slope_percent": 20.0,
        "hot_bend_angles_deg": [5.0, 10.0, 45.0, 90.0],
        "hot_bend_max_count": 50,
        "house_min_distance_m": 15.0,
        "powerlines_min_distance_m": 10.0
    })";
    
    std::ofstream f("/tmp/test_config_specs.json");
    f << test_json;
    f.close();
    
    SECTION("Load specs into ProjectConfig") {
        ProjectConfig config;
        bool success = config.load_pipeline_specs_from_json("/tmp/test_config_specs.json");
        
        REQUIRE(success == true);
        REQUIRE(config.has_pipeline_specs == true);
        REQUIRE(config.pipeline_specs.diameter_mm == 660.4);
        REQUIRE(config.pipeline_specs.max_slope_percent == 20.0);
    }
}


