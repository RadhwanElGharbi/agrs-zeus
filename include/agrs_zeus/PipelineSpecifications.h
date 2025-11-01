#ifndef AGRS_ZEUS_PIPELINE_SPECIFICATIONS_H
#define AGRS_ZEUS_PIPELINE_SPECIFICATIONS_H

#include <string>
#include <vector>
#include <nlohmann/json.hpp>

namespace agrs {
namespace pirl {

/**
 * @brief Pipeline specifications with hard constraints for routing
 * 
 * This struct encapsulates all pipeline-specific parameters that must be
 * satisfied as absolute constraints during route optimization. Violations
 * of these constraints render routes infeasible.
 */
struct PipelineSpecifications {
    // ===== Physical Properties =====
    double diameter_mm;           ///< Pipeline outer diameter in millimeters
    double thickness_mm;          ///< Wall thickness in millimeters
    std::string material;         ///< Pipe material (e.g., "Carbon Steel", "Stainless Steel")
    std::string pipeline_type;    ///< Content type: "Gas", "Oil", "Water", "NGL", etc.
    
    // ===== Pressure Parameters =====
    double mop_bar;  ///< Maximum Operating Pressure in bar
    double dp_bar;   ///< Design Pressure in bar
    
    // ===== Construction Constraints =====
    double depth_of_cover_m;  ///< Minimum depth of cover in meters
    
    // ===== HDD (Horizontal Directional Drilling) Constraints =====
    // For trenchless subsurface installation
    double hdd_min_bend_radius_m;  ///< Minimum bend radius for HDD (e.g., 1200*D for steel)
    bool hdd_applicable;           ///< Whether HDD method is applicable for this project
    
    // ===== Hot Bend Constraints =====
    // For manufactured directional changes (induction bending)
    std::vector<double> hot_bend_angles_deg;  ///< Available hot bend angles (e.g., 5°, 10°, 22.5°, 45°, 90°)
    double hot_bend_min_radius_m;             ///< Minimum radius for hot bends (typically 3D to 5D where D=diameter)
    int hot_bend_max_count;                   ///< Maximum number of hot bends allowed along route
    
    // ===== Field Bend Constraints =====
    // For small adjustments during installation (cold bends)
    double field_bend_max_angle_deg;  ///< Maximum angle for cold field bends (typically 3-5°)
    
    // ===== Clearance Requirements (Hard Constraints) =====
    double house_min_distance_m;      ///< Minimum distance from residential structures
    double poles_min_distance_m;      ///< Minimum distance from utility poles
    double powerlines_min_distance_m; ///< Minimum distance from power transmission lines
    
    // ===== SAIPEM-Specific Constraints =====
    double max_slope_percent;              ///< Maximum allowable slope (e.g., 20% for SAIPEM)
    bool prefer_orthogonal_crossings;      ///< Prefer 90° crossing angles for infrastructure
    bool prefer_existing_rows;             ///< Prefer existing rights-of-way when available
    double orthogonal_crossing_threshold_deg;  ///< Threshold for orthogonal crossing penalty (e.g., 45°)
    double existing_row_bonus_usd_per_m;       ///< Cost reduction for using existing ROW
    
    // ===== Hydraulic Parameters =====
    double flow_rate_m3_s;        ///< Design flow rate in cubic meters per second
    double operating_temp_k;      ///< Operating temperature in Kelvin
    double max_pressure_drop_mpa; ///< Maximum allowable pressure drop between stations (MPa)
    
    /**
     * @brief Load pipeline specifications from JSON file
     * @param json_path Path to pipeline_specs.json file
     * @return PipelineSpecifications struct populated from JSON
     * @throws std::runtime_error if file cannot be read or JSON is malformed
     */
    static PipelineSpecifications load_from_json(const std::string& json_path);
    
    /**
     * @brief Validate route curvature constraints
     * @param radius_m Bend radius in meters
     * @param is_hdd_section Whether this is an HDD section
     * @return true if curvature is within limits, false otherwise
     */
    bool validate_route_curvature(double radius_m, bool is_hdd_section) const;
    
    /**
     * @brief Validate hot bend angle
     * @param angle_deg Bend angle in degrees
     * @return true if angle matches available hot bend angles, false otherwise
     */
    bool validate_hot_bend_angle(double angle_deg) const;
    
    /**
     * @brief Validate field bend angle
     * @param angle_deg Bend angle in degrees
     * @return true if angle is within field bend limits, false otherwise
     */
    bool validate_field_bend_angle(double angle_deg) const;
    
    /**
     * @brief Validate clearance from residential structures
     * @param distance_m Distance in meters
     * @return true if clearance is sufficient, false otherwise
     */
    bool validate_clearance_house(double distance_m) const;
    
    /**
     * @brief Validate clearance from power lines
     * @param distance_m Distance in meters
     * @return true if clearance is sufficient, false otherwise
     */
    bool validate_clearance_powerline(double distance_m) const;
    
    /**
     * @brief Validate hot bend count
     * @param count Number of hot bends used so far
     * @return true if count is within limits, false otherwise
     */
    bool validate_hot_bend_count(int count) const;
    
    /**
     * @brief Validate slope constraint
     * @param slope_percent Slope in percent
     * @return true if slope is within limits, false otherwise
     */
    bool validate_slope(double slope_percent) const;
};

}  // namespace pirl
}  // namespace agrs

#endif  // AGRS_ZEUS_PIPELINE_SPECIFICATIONS_H


