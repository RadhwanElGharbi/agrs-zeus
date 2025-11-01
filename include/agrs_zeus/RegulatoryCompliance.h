#ifndef AGRS_ZEUS_REGULATORY_COMPLIANCE_H
#define AGRS_ZEUS_REGULATORY_COMPLIANCE_H

#include <string>
#include <vector>
#include <map>
#include <memory>

namespace agrs {
namespace pirl {

// Forward declarations
struct State;
class GISDataManager;
struct PipelineSpecifications;

/**
 * @brief Regulatory compliance system for pipeline routing
 * 
 * Quantifies regulatory violations as cost penalties (not hard constraints).
 * Loads jurisdiction-specific thresholds and calculates mitigation costs.
 */
class RegulatoryCompliance {
public:
    /**
     * @brief Represents a regulatory violation detected during routing
     */
    struct RegulatoryViolation {
        std::string regulation_id;        // e.g., "NTC_2018_Seismic_Zone1"
        std::string description;          // Human-readable description
        double severity;                  // 0-1 (0=minor, 1=critical)
        double mitigation_cost_usd;       // Cost to achieve compliance
        double permit_delay_months;       // Estimated time impact
        double location_x;                // Where violation occurred
        double location_y;
    };
    
    /**
     * @brief Regulatory thresholds for a jurisdiction
     */
    struct RegulatoryThresholds {
        // Seismic constraints (Italy: NTC 2018)
        double max_slope_seismic_zone1_deg;      // 25° in Seismic Zone 1
        double max_slope_seismic_zone2_deg;      // 30° in Seismic Zone 2
        double enhanced_seismic_slope_deg;       // 35° requires specialized design
        
        // Protected areas (EU: Natura 2000, WDPA)
        double min_buffer_protected_area_m;      // 100m typical
        double critical_protected_area_m;        // 50m = major violation
        
        // Water protection
        double min_buffer_water_source_m;        // 50m from drinking water
        double critical_water_source_m;          // 25m = critical violation
        
        // Urban constraints
        double max_population_density_standard;  // 500 people/km²
        double max_population_density_urban;     // 1000 people/km²
        
        // Geohazard thresholds
        double max_geohazard_risk_standard;      // 0.5 risk index
        double critical_geohazard_risk;          // 0.7 = high risk
    };
    
    /**
     * @brief Violation type enumeration for cost lookup
     */
    enum class ViolationType {
        SEISMIC_SLOPE_MODERATE,      // Slope exceeds zone limit
        SEISMIC_SLOPE_SEVERE,        // Slope requires specialized design
        PROTECTED_AREA_BUFFER,       // Within buffer zone
        PROTECTED_AREA_DIRECT,       // Within protected boundary
        WATER_SOURCE_BUFFER,         // Near water source
        WATER_SOURCE_CRITICAL,       // Too close to water source
        URBAN_STANDARD,              // Moderate population density
        URBAN_DENSE,                 // High population density
        GEOHAZARD_MODERATE,          // Moderate landslide/seismic risk
        GEOHAZARD_HIGH,              // High risk area
        FAULT_ZONE_ACTIVE            // Active fault zone
    };
    
    /**
     * @brief Constructor
     * @param country_code ISO 3166 country code (e.g., "ITA", "USA", "CAN")
     * @param region Optional region/state for sub-national regulations
     */
    RegulatoryCompliance(const std::string& country_code, 
                        const std::string& region = "");
    
    /**
     * @brief Check a route segment for regulatory violations
     * @param state Current state at this position
     * @param gis GIS data manager for spatial queries
     * @param specs Pipeline specifications
     * @return Vector of detected violations
     */
    std::vector<RegulatoryViolation> check_segment(
        const State& state,
        const GISDataManager& gis,
        const PipelineSpecifications& specs
    ) const;
    
    /**
     * @brief Calculate total cost penalty for violations
     * @param violations List of violations detected
     * @return Total cost in USD
     */
    double calculate_regulatory_cost(
        const std::vector<RegulatoryViolation>& violations
    ) const;
    
    /**
     * @brief Get cost for specific violation type
     * @param type Type of violation
     * @return Cost per meter in USD
     */
    double get_violation_cost(ViolationType type) const;
    
    /**
     * @brief Load thresholds from regulatory documentation
     * @param docs_path Path to regulatory_docs/ directory
     * @return true if successful
     */
    bool load_thresholds_from_docs(const std::string& docs_path);
    
    /**
     * @brief Get current thresholds
     */
    const RegulatoryThresholds& get_thresholds() const { return thresholds_; }
    
    /**
     * @brief Check if in seismic zone
     * @param x X coordinate
     * @param y Y coordinate
     * @param gis GIS data manager
     * @return Seismic zone (0=none, 1=highest, 2=moderate, 3=low)
     */
    int get_seismic_zone(double x, double y, const GISDataManager& gis) const;
    
private:
    std::string country_code_;
    std::string region_;
    RegulatoryThresholds thresholds_;
    
    // Cost lookup table ($/m)
    std::map<ViolationType, double> violation_costs_;
    
    /**
     * @brief Initialize default thresholds based on country
     */
    void initialize_default_thresholds();
    
    /**
     * @brief Initialize default costs based on country
     */
    void initialize_default_costs();
    
    /**
     * @brief Check seismic slope violations
     */
    std::vector<RegulatoryViolation> check_seismic_violations(
        const State& state, const GISDataManager& gis) const;
    
    /**
     * @brief Check protected area violations
     */
    std::vector<RegulatoryViolation> check_protected_area_violations(
        const State& state, const GISDataManager& gis) const;
    
    /**
     * @brief Check urban area violations
     */
    std::vector<RegulatoryViolation> check_urban_violations(
        const State& state, const GISDataManager& gis) const;
    
    /**
     * @brief Check water protection violations
     */
    std::vector<RegulatoryViolation> check_water_violations(
        const State& state, const GISDataManager& gis) const;
    
    /**
     * @brief Check geohazard violations
     */
    std::vector<RegulatoryViolation> check_geohazard_violations(
        const State& state, const GISDataManager& gis) const;
};

}  // namespace pirl
}  // namespace agrs

#endif  // AGRS_ZEUS_REGULATORY_COMPLIANCE_H


