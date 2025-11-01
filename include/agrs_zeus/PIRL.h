#pragma once

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <optional>
#include <functional>
#include "agrs_zeus/PipelineSpecifications.h"
#include "agrs_zeus/Hydraulics.h"

// Forward declarations for GDAL
class GDALDataset;
class OGRGeometry;
class OGRPoint;

namespace agrs {
namespace pirl {

// ============================================================================
// FORWARD DECLARATIONS
// ============================================================================

class GISDataManager;
class CostModel;
class PhysicsConstraints;
class PipelineEnvironment;
class PIRLAgent;

// ============================================================================
// CONFIGURATION STRUCTURES
// ============================================================================

/**
 * @brief Project-specific configuration for PIRL routing
 * 
 * Allows easy adaptation to different clients and projects through YAML
 */
struct ProjectConfig {
    // Project identification
    std::string project_name;
    std::string project_code;
    std::string client_name;
    
    // CRS and units
    int epsg_code;
    std::string measurement_units; // "SI" or "Imperial"
    
    // Start and end points
    struct Point {
        double x, y;
        std::string crs;
    };
    Point start_point;
    Point end_point;
    
    // Cost weights (normalized to sum to 1.0)
    struct CostWeights {
        double terrain_difficulty = 0.30;
        double water_crossings = 0.20;
        double infrastructure_crossings = 0.15;
        double environmental_impact = 0.15;
        double row_acquisition = 0.10;
        double permitting_complexity = 0.10;
    };
    CostWeights cost_weights;
    
    // Client-specific criteria
    std::map<std::string, double> client_criteria;
    
    // Constraint thresholds
    struct Constraints {
        double max_slope_percent = 30.0;
        double max_curvature_rad_per_m = 0.01;
        double min_crossing_angle_deg = 45.0;
        double buffer_protected_areas_m = 100.0;
        double buffer_water_bodies_m = 50.0;
        double max_segment_length_m = 100.0;
    };
    Constraints constraints;
    
    // Training parameters
    struct TrainingParams {
        int num_episodes = 10000;
        int max_steps_per_episode = 5000;
        double learning_rate = 0.0003;
        int batch_size = 256;
        int num_parallel_envs = 16;
        std::string algorithm = "PPO"; // "PPO" or "SAC"
    };
    TrainingParams training;
    
    // Paths
    std::string project_dir;
    std::string data_dir;
    std::string output_dir;
    std::string model_save_path;
    
    // Pipeline specifications (hard constraints)
    PipelineSpecifications pipeline_specs;
    bool has_pipeline_specs = false;
    
    // Load pipeline specifications from JSON
    bool load_pipeline_specs_from_json(const std::string& json_path);
    
    // Load from YAML file
    static ProjectConfig load_from_yaml(const std::string& yaml_path);
    
    // Save to YAML file
    void save_to_yaml(const std::string& yaml_path) const;
};

// ============================================================================
// STATE REPRESENTATION
// ============================================================================

/**
 * @brief State representation for RL agent
 * 
 * Encodes current position and local terrain/constraint information
 */
struct State {
    // Current position (in project CRS)
    double x, y;
    
    // Direction and distance to goal
    double goal_distance;
    double goal_bearing; // radians
    
    // Local terrain features (within observation radius)
    double elevation;
    double slope;
    double aspect;
    double curvature;
    
    // Local constraints (binary: 0 = allowed, 1 = forbidden)
    double no_go_zone;      // Protected areas, exclusion zones
    double water_proximity; // Distance to nearest water body (normalized)
    double road_proximity;  // Distance to nearest road (normalized)
    
    // Additional dataset features (NEW - enhanced state space)
    double geohazard_risk;     // Landslide/seismic risk (0-1)
    double soil_capacity;      // Soil bearing capacity (0-1)
    double cadastre_complex;   // Complex land ownership (0-1)
    double population_density; // Population density (0-1)
    double railway_proximity;  // Distance to railways (normalized)
    
    // Hydraulic features (NEW - Phase 2)
    double cumulative_pressure_drop_pa;  // Total pressure loss so far
    double segments_since_pump;          // Distance since last pump station
    double flow_velocity_m_s;            // Current segment velocity
    double reynolds_number;              // Flow regime indicator
    
    // Previous action (for continuity)
    double prev_heading;
    double prev_step_size;
    
    // Convert to vector for neural network input
    std::vector<float> to_vector() const;
    
    // State dimension (for NN architecture)
    static constexpr int dimension() { return 21; }  // Expanded from 17 to 21 (Phase 2)
};

// ============================================================================
// ACTION REPRESENTATION
// ============================================================================

/**
 * @brief Action representation for RL agent
 * 
 * Continuous action space: heading change + step size
 */
struct Action {
    double heading_change;  // radians, range: [-π/4, π/4]
    double step_size;       // meters, range: [10, 100]
    
    // Convert from neural network output
    static Action from_vector(const std::vector<float>& action_vec);
    
    // Convert to vector for NN output
    std::vector<float> to_vector() const;
    
    // Action dimension
    static constexpr int dimension() { return 2; }
    
    // Apply physics constraints (ensure feasible)
    void apply_constraints(const State& current_state, 
                          const PhysicsConstraints& physics);
};

// ============================================================================
// REWARD STRUCTURE
// ============================================================================

/**
 * @brief Reward breakdown for transparency and debugging
 */
struct RewardInfo {
    double total_reward;
    
    // Reward components
    double progress_reward;        // Positive: moving toward goal
    double cost_penalty;           // Negative: terrain/crossing costs
    double constraint_penalty;     // Large negative: violating constraints
    double curvature_penalty;      // Negative: excessive bends
    double goal_bonus;             // Large positive: reaching goal
    
    // Physics-informed penalties
    double slope_violation;        // Violating max slope
    double no_go_violation;        // Entering forbidden zones
    double crossing_violation;     // Bad crossing angles
    
    // Cost breakdown (NEW - for detailed tracking)
    double terrain_cost = 0.0;
    double water_crossing_cost = 0.0;
    double infrastructure_cost = 0.0;
    double environmental_cost = 0.0;
    double row_cost = 0.0;
    double permitting_cost = 0.0;
    double hydraulic_cost = 0.0;
    double regulatory_cost = 0.0;
    
    // Debug info
    std::string termination_reason;
};

// ============================================================================
// ROUTE TRAJECTORY STRUCTURES
// ============================================================================

/**
 * @brief Detailed segment information for route export
 */
struct RouteSegment {
    // Geometry (actual UTM coordinates, not normalized)
    double start_x = 0.0, start_y = 0.0;
    double end_x = 0.0, end_y = 0.0;
    double length_m = 0.0;
    int segment_id = 0;
    
    // Elevation
    double elevation_start = 0.0;
    double elevation_end = 0.0;
    double slope_percent = 0.0;
    double aspect = 0.0;
    double curvature = 0.0;
    
    // Cost breakdown (USD)
    double total_cost = 0.0;
    double terrain_cost = 0.0;
    double water_crossing_cost = 0.0;
    double infrastructure_cost = 0.0;
    double environmental_cost = 0.0;
    double row_cost = 0.0;
    double permitting_cost = 0.0;
    double hydraulic_cost = 0.0;
    double regulatory_cost = 0.0;
    
    // Cumulative
    double cumulative_cost = 0.0;
    double cumulative_distance_m = 0.0;
    
    // Land cover
    int land_cover_class = 0;
    std::string land_cover_name;
    
    // Environment
    double geohazard_risk = 0.0;
    double soil_capacity = 0.0;
    double population_density = 0.0;
    
    // Infrastructure proximity (meters)
    double water_proximity = 0.0;
    double road_proximity = 0.0;
    double railway_proximity = 0.0;
    double powerline_proximity = 0.0;
    double pipeline_proximity = 0.0;
    
    // Hydraulics
    double pressure_drop_pa = 0.0;
    double cumulative_pressure_drop_pa = 0.0;
    double flow_velocity_m_s = 0.0;
    double reynolds_number = 0.0;
    bool requires_pumping_station = false;
    
    // RL metadata
    int step_number = 0;
    double reward = 0.0;
    double total_reward = 0.0;
};

/**
 * @brief Full route trajectory with metadata
 */
struct RouteTrajectory {
    std::vector<RouteSegment> segments;
    std::vector<std::pair<double, double>> pumping_stations;
    bool success = false;
    double total_cost = 0.0;
    double total_length_m = 0.0;
    std::string termination_reason;
};

// ============================================================================
// GIS DATA MANAGER
// ============================================================================

/**
 * @brief Manages all geospatial data for the routing environment
 * 
 * GENERALIZED: Works for any project location and CRS
 */
class GISDataManager {
public:
    GISDataManager(const std::string& project_dir, int epsg_code);
    ~GISDataManager();
    
    // Load all datasets for the project
    void load_all_data();
    
    // Query terrain features at a point
    double get_elevation(double x, double y) const;
    double get_slope(double x, double y) const;
    double get_aspect(double x, double y) const;
    double get_curvature(double x, double y) const;
    
    // Query constraints at a point
    bool is_no_go_zone(double x, double y) const;
    double distance_to_water(double x, double y) const;
    double distance_to_road(double x, double y) const;
    double distance_to_railway(double x, double y) const;
    double distance_to_power_line(double x, double y) const;
    double distance_to_pipeline(double x, double y) const;
    
    // Query land cover
    int get_land_cover_class(double x, double y) const;
    std::string get_land_cover_name(int land_cover_class) const;
    
    // Check if point is within AOI
    bool is_within_aoi(double x, double y) const;
    
    // Get AOI bounds
    void get_aoi_bounds(double& minx, double& miny, 
                       double& maxx, double& maxy) const;
    
    // Additional dataset queries
    double get_geohazard_risk(double x, double y) const;  // Landslide, seismic risk
    double get_soil_bearing_capacity(double x, double y) const;  // Foundation suitability
    bool is_cadastre_complex(double x, double y) const;  // Complex land ownership
    double get_population_density(double x, double y) const;  // Social impact
    
private:
    std::string project_dir_;
    int epsg_code_;
    
    // GDAL datasets (owned pointers)
    std::unique_ptr<GDALDataset> dem_;
    std::unique_ptr<GDALDataset> slope_;
    std::unique_ptr<GDALDataset> landcover_;
    std::unique_ptr<GDALDataset> geohazards_;      // Landslide/seismic risk
    std::unique_ptr<GDALDataset> soil_;            // Soil properties
    std::unique_ptr<GDALDataset> population_;      // Population density
    
    // Vector geometries for constraints
    std::unique_ptr<OGRGeometry> aoi_geom_;
    std::unique_ptr<OGRGeometry> protected_areas_;
    std::unique_ptr<OGRGeometry> water_bodies_;
    std::unique_ptr<OGRGeometry> roads_;
    std::unique_ptr<OGRGeometry> railways_;
    std::unique_ptr<OGRGeometry> cadastre_complex_;  // Complex land parcels
    std::unique_ptr<OGRGeometry> power_lines_;       // Power transmission lines
    std::unique_ptr<OGRGeometry> pipelines_;         // Existing pipelines
    
    // Helper: sample raster at point
    double sample_raster(GDALDataset* dataset, double x, double y) const;
    
    // Helper: distance to nearest geometry
    double distance_to_geometry(OGRGeometry* geom, double x, double y) const;
};

// ============================================================================
// COST MODEL
// ============================================================================

/**
 * @brief Comprehensive cost model for pipeline construction
 * 
 * Based on research: PIPELINE_CONSTRUCTION_COST_MATRIX.md
 */
class CostModel {
public:
    CostModel(const ProjectConfig& config);
    
    // Calculate total cost for a segment
    double calculate_segment_cost(const State& from_state,
                                  const State& to_state,
                                  const GISDataManager& gis,
                                  RewardInfo* reward_info_out = nullptr) const;
    
    // Individual cost components ($/meter)
    double terrain_cost(double slope, int land_cover_class) const;
    double water_crossing_cost(double crossing_width, double depth) const;
    double road_crossing_cost(const std::string& road_type) const;
    double railway_crossing_cost() const;
    double environmental_cost(bool is_protected_area, 
                             double buffer_distance) const;
    double row_acquisition_cost(int land_cover_class, 
                               const std::string& region) const;
    
    // Apply regional multipliers
    double apply_regional_multiplier(double base_cost) const;
    
    // Apply client-specific criteria adjustments
    double apply_client_criteria(double base_cost, 
                                 const std::map<std::string, double>& criteria_scores) const;
    
    // Hydraulic costs (NEW - Phase 2)
    double hydraulic_cost(const HydraulicsCalculator::SegmentHydraulics& hydraulics,
                         double segment_length_m) const;
    
private:
    ProjectConfig config_;
    
    // Cost lookup tables
    std::map<std::string, double> terrain_multipliers_;
    std::map<int, double> landcover_costs_; // ESA WorldCover classes
    std::map<std::string, double> crossing_costs_;
    
    // Regional cost adjustments
    double regional_multiplier_;
};

// ============================================================================
// PHYSICS CONSTRAINTS
// ============================================================================

/**
 * @brief Physics-informed constraints for pipeline routing
 * 
 * Enforces engineering and safety constraints
 */
class PhysicsConstraints {
public:
    PhysicsConstraints(const ProjectConfig& config);
    
    // Check if action is physically feasible (enhanced with hard constraints)
    bool is_action_feasible(const State& state, 
                           const Action& action,
                           const GISDataManager& gis) const;
    
    // Individual constraint checks
    bool check_slope_limit(double slope) const;
    bool check_curvature_limit(double curvature) const;
    bool check_crossing_angle(double angle, const std::string& feature_type) const;
    bool check_no_go_zones(double x, double y, const GISDataManager& gis) const;
    
    // Pipeline specification hard constraints (NEW)
    bool check_pipeline_clearances(double x, double y, const GISDataManager& gis) const;
    bool check_pipeline_slope(double slope) const;
    bool check_bend_angle(double angle_deg, bool is_hdd_section) const;
    bool check_hot_bend_count(int current_count) const;
    
    // Constraint penalties (for reward shaping)
    double slope_penalty(double slope) const;
    double curvature_penalty(double curvature) const;
    double crossing_angle_penalty(double angle) const;
    
    // Maximum penalties
    static constexpr double MAX_PENALTY = -1000.0;
    
    // Violation reasons for debugging
    mutable std::string last_violation_reason;
    
private:
    ProjectConfig config_;
};

// ============================================================================
// PIPELINE ENVIRONMENT (Gymnasium-compatible)
// ============================================================================

/**
 * @brief Custom RL environment for pipeline routing
 * 
 * Compatible with Python Gymnasium interface (called from Python)
 */
class PipelineEnvironment {
public:
    PipelineEnvironment(const ProjectConfig& config);
    ~PipelineEnvironment();
    
    // Gymnasium interface
    State reset();
    std::pair<State, RewardInfo> step(const Action& action);
    bool is_done() const;
    
    // Get current route
    std::vector<std::pair<double, double>> get_current_route() const;
    
    // Get route statistics
    struct RouteStats {
        double total_length_m;
        double total_cost_usd;
        double avg_slope;
        int num_water_crossings;
        int num_road_crossings;
        int num_constraint_violations;
        double curvature_max;
    };
    RouteStats get_route_stats() const;
    
    // Get detailed route trajectory (NEW)
    RouteTrajectory get_route_trajectory() const;
    
    // Get current position (actual UTM coordinates)
    std::pair<double, double> get_current_position() const;
    
    // Render (for visualization)
    void render(const std::string& output_path) const;
    
private:
    ProjectConfig config_;
    std::unique_ptr<GISDataManager> gis_;
    std::unique_ptr<CostModel> cost_model_;
    std::unique_ptr<PhysicsConstraints> physics_;
    std::unique_ptr<HydraulicsCalculator> hydraulics_;  // NEW: Hydraulics calculator
    
    // Current state
    State current_state_;
    std::vector<std::pair<double, double>> current_route_;
    int step_count_;
    bool done_;
    
    // Goal
    double goal_x_, goal_y_;
    
    // Hydraulic tracking (NEW - Phase 2)
    double current_pressure_pa_;           // Current pressure in pipeline
    double total_pressure_drop_pa_;        // Accumulated pressure drop
    double distance_since_pump_m_;         // Distance since last pumping station
    std::vector<std::pair<double, double>> pumping_stations_;  // Locations of pumping stations
    
    // Trajectory tracking (NEW - for detailed route export)
    std::vector<RouteSegment> trajectory_;
    double cumulative_cost_;
    double cumulative_distance_;
    State previous_state_;  // For segment start coordinates
    double total_reward_accumulated_;  // Cumulative reward
    
    // Out-of-bounds tracking (NEW - for gradual termination)
    int out_of_bounds_steps_;  // Consecutive steps out of bounds
    
    // Exploration tracking (NEW - for milestone bonuses)
    double best_distance_to_goal_;  // Best distance achieved this episode
    
    // Helper: calculate reward
    RewardInfo calculate_reward(const State& prev_state,
                               const Action& action,
                               const State& new_state);
    
    // Helper: check termination conditions
    bool check_termination(const State& state, std::string& reason);
};

// ============================================================================
// PIRL AGENT
// ============================================================================

/**
 * @brief Physics-Informed RL Agent for pipeline routing
 * 
 * NOTE: Heavy training logic implemented in Python (Stable-Baselines3)
 * This class provides C++ interface for inference and integration
 */
class PIRLAgent {
public:
    PIRLAgent(const ProjectConfig& config);
    ~PIRLAgent();
    
    // Load pre-trained model
    bool load_model(const std::string& model_path);
    
    // Save model
    bool save_model(const std::string& model_path) const;
    
    // Inference: get action from state
    Action predict(const State& state, bool deterministic = true) const;
    
    // Generate full route (uses environment)
    std::vector<std::pair<double, double>> generate_route(
        const std::pair<double, double>& start,
        const std::pair<double, double>& end,
        const std::string& project_dir);
    
    // Generate multiple alternative corridors
    std::vector<std::vector<std::pair<double, double>>> generate_corridors(
        const std::pair<double, double>& start,
        const std::pair<double, double>& end,
        const std::string& project_dir,
        int num_corridors = 5);
    
    // Evaluate route quality
    struct RouteEvaluation {
        double total_cost_usd;
        double length_m;
        double cost_per_km;
        double savings_vs_baseline_percent;
        bool all_constraints_satisfied;
        std::vector<std::string> constraint_violations;
        PipelineEnvironment::RouteStats stats;
    };
    RouteEvaluation evaluate_route(
        const std::vector<std::pair<double, double>>& route,
        const std::string& project_dir) const;
    
private:
    ProjectConfig config_;
    
    // Model path (Python model loaded via subprocess or shared library)
    std::string model_path_;
    bool model_loaded_;
    
    // Helper: call Python inference
    Action call_python_inference(const State& state, bool deterministic) const;
};

// ============================================================================
// TRAINING INTERFACE (Called from Python)
// ============================================================================

/**
 * @brief Training utilities for PIRL model
 * 
 * NOTE: Actual training happens in Python using Stable-Baselines3
 * These are helper functions for curriculum learning and data preparation
 */
namespace training {

// Generate training scenarios (curriculum learning)
std::vector<ProjectConfig> generate_training_scenarios(
    const std::string& base_config_path,
    int num_easy = 100,
    int num_medium = 200,
    int num_hard = 100);

// Create synthetic training data
void create_synthetic_projects(
    const std::string& output_dir,
    int num_projects = 100);

// Evaluate trained model on test set
struct EvaluationResults {
    double avg_cost_savings_percent;
    double success_rate;
    double avg_constraint_violations;
    double avg_solution_time_seconds;
    std::vector<std::string> failed_projects;
};
EvaluationResults evaluate_model(
    const std::string& model_path,
    const std::string& test_projects_dir);

} // namespace training

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * @brief Export routes to various formats
 */
namespace export_utils {

// Export route to GeoJSON
void export_to_geojson(
    const std::vector<std::pair<double, double>>& route,
    const std::string& output_path,
    int epsg_code);

// Export route to Shapefile
void export_to_shapefile(
    const std::vector<std::pair<double, double>>& route,
    const std::string& output_path,
    int epsg_code);

// Export route statistics to CSV
void export_stats_to_csv(
    const PIRLAgent::RouteEvaluation& eval,
    const std::string& output_path);

// Generate comparison report (PIRL vs baseline)
void generate_comparison_report(
    const std::vector<std::pair<double, double>>& pirl_route,
    const std::vector<std::pair<double, double>>& baseline_route,
    const std::string& project_dir,
    const std::string& output_pdf_path);

} // namespace export_utils

} // namespace pirl
} // namespace agrs

