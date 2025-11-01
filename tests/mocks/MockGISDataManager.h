#pragma once

#include "agrs_zeus/PIRL.h"
#include <memory>
#include <map>

namespace agrs {
namespace pirl {
namespace test {

/**
 * @brief Mock GISDataManager for testing without real GIS data
 * 
 * Provides configurable return values for all GIS queries to enable
 * comprehensive unit testing without external dependencies.
 */
class MockGISDataManager {
public:
    // Configurable return values for terrain queries
    double mock_elevation = 100.0;
    double mock_slope = 15.0;
    double mock_aspect = 180.0;
    double mock_curvature = 0.0;
    
    // Configurable return values for constraint queries
    bool mock_is_protected_area = false;
    bool mock_is_no_go_zone = false;
    bool mock_is_water_body = false;
    bool mock_is_cadastre_complex = false;
    
    // Configurable return values for proximity queries (normalized 0-1)
    double mock_distance_to_water = 200.0;  // meters
    double mock_distance_to_road = 500.0;
    double mock_distance_to_railway = 1000.0;
    double mock_distance_to_powerline = 300.0;
    double mock_distance_to_pipeline = 400.0;
    double mock_distance_to_protected = 150.0;
    
    // Configurable return values for risk queries (normalized 0-1)
    double mock_geohazard_risk = 0.3;
    double mock_soil_capacity = 0.7;
    double mock_population_density = 200.0;  // people/km²
    
    // Configurable return values for infrastructure
    bool mock_near_fault_zone = false;
    double mock_fault_distance = 5000.0;  // meters
    
    // Land cover type
    int mock_landcover_class = 10;  // 10 = cropland
    
    MockGISDataManager() = default;
    ~MockGISDataManager() = default;
    
    // Terrain query methods
    double get_elevation(double x, double y) const {
        return mock_elevation;
    }
    
    double get_slope(double x, double y) const {
        return mock_slope;
    }
    
    double get_aspect(double x, double y) const {
        return mock_aspect;
    }
    
    double get_curvature(double x, double y) const {
        return mock_curvature;
    }
    
    // Constraint query methods
    bool is_protected_area(double x, double y) const {
        return mock_is_protected_area;
    }
    
    bool is_no_go_zone(double x, double y) const {
        return mock_is_no_go_zone;
    }
    
    bool is_water_body(double x, double y) const {
        return mock_is_water_body;
    }
    
    bool is_cadastre_complex(double x, double y) const {
        return mock_is_cadastre_complex;
    }
    
    // Proximity query methods (return distance in meters)
    double distance_to_water(double x, double y) const {
        return mock_distance_to_water;
    }
    
    double distance_to_road(double x, double y) const {
        return mock_distance_to_road;
    }
    
    double distance_to_railway(double x, double y) const {
        return mock_distance_to_railway;
    }
    
    double distance_to_power_line(double x, double y) const {
        return mock_distance_to_powerline;
    }
    
    double distance_to_pipeline(double x, double y) const {
        return mock_distance_to_pipeline;
    }
    
    double distance_to_protected_area(double x, double y) const {
        return mock_distance_to_protected;
    }
    
    // Risk query methods
    double get_geohazard_risk(double x, double y) const {
        return mock_geohazard_risk;
    }
    
    double get_soil_capacity(double x, double y) const {
        return mock_soil_capacity;
    }
    
    double get_population_density(double x, double y) const {
        return mock_population_density;
    }
    
    // Infrastructure query methods
    bool near_fault_zone(double x, double y, double buffer_m = 1000.0) const {
        return mock_near_fault_zone || mock_fault_distance < buffer_m;
    }
    
    double distance_to_fault(double x, double y) const {
        return mock_fault_distance;
    }
    
    // Land cover query
    int get_landcover_class(double x, double y) const {
        return mock_landcover_class;
    }
    
    // Setter methods for easy test configuration
    void set_terrain(double elevation, double slope, double aspect = 180.0, double curvature = 0.0) {
        mock_elevation = elevation;
        mock_slope = slope;
        mock_aspect = aspect;
        mock_curvature = curvature;
    }
    
    void set_constraints(bool protected_area, bool no_go, bool water_body, bool cadastre) {
        mock_is_protected_area = protected_area;
        mock_is_no_go_zone = no_go;
        mock_is_water_body = water_body;
        mock_is_cadastre_complex = cadastre;
    }
    
    void set_proximities(double water, double road, double railway, double powerline, double pipeline) {
        mock_distance_to_water = water;
        mock_distance_to_road = road;
        mock_distance_to_railway = railway;
        mock_distance_to_powerline = powerline;
        mock_distance_to_pipeline = pipeline;
    }
    
    void set_risks(double geohazard, double soil, double population) {
        mock_geohazard_risk = geohazard;
        mock_soil_capacity = soil;
        mock_population_density = population;
    }
    
    void set_fault_zone(bool near_fault, double distance = 5000.0) {
        mock_near_fault_zone = near_fault;
        mock_fault_distance = distance;
    }
    
    // Convenience method to reset to safe defaults
    void reset_to_safe_defaults() {
        mock_elevation = 100.0;
        mock_slope = 10.0;  // Safe slope
        mock_aspect = 180.0;
        mock_curvature = 0.0;
        
        mock_is_protected_area = false;
        mock_is_no_go_zone = false;
        mock_is_water_body = false;
        mock_is_cadastre_complex = false;
        
        mock_distance_to_water = 200.0;  // Safe distance
        mock_distance_to_road = 500.0;
        mock_distance_to_railway = 1000.0;
        mock_distance_to_powerline = 300.0;
        mock_distance_to_pipeline = 400.0;
        mock_distance_to_protected = 150.0;
        
        mock_geohazard_risk = 0.2;  // Low risk
        mock_soil_capacity = 0.8;  // Good soil
        mock_population_density = 100.0;  // Rural
        
        mock_near_fault_zone = false;
        mock_fault_distance = 5000.0;
        
        mock_landcover_class = 10;  // Cropland
    }
    
    // Convenience method to set high-risk scenario
    void set_high_risk_scenario() {
        mock_slope = 35.0;  // Steep
        mock_geohazard_risk = 0.8;  // High risk
        mock_near_fault_zone = true;
        mock_fault_distance = 500.0;  // Close to fault
        mock_is_protected_area = true;
        mock_distance_to_water = 30.0;  // Too close
        mock_population_density = 1200.0;  // Dense urban
    }
};

} // namespace test
} // namespace pirl
} // namespace agrs


