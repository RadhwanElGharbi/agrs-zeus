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
    
    // Crossing context features (NEW - Phase 3: Enhanced Crossing Logic)
    double nearest_crossing_dist;           // Distance to nearest crossable feature (m)
    double nearest_crossing_width;          // Width of nearest crossing (m)
    double nearest_crossing_type;           // 0=none, 1=road, 2=waterway, 3=railway, 4=powerline (stored as double for alignment)
    double crossing_before_dist;            // Distance to feature before nearest
    double crossing_after_dist;             // Distance to feature after nearest
    double crossing_cardinal_alignment;     // How perpendicular to feature (0-1, 1=orthogonal)
    
    // Boundary awareness (NEW - Phase 4: Continuous Cost System)
    double distance_to_aoi_boundary;        // Distance to AOI edge (m)
    double distance_to_sea_boundary;        // Distance to sea/coastline (m)
    
    // Convert to vector for neural network input
    std::vector<float> to_vector() const;
    
    // State dimension (for NN architecture)
    static constexpr int dimension() { return 29; }  // Expanded from 27 to 29 (Phase 4)
};

// ============================================================================
// ACTION REPRESENTATION
// ============================================================================

/**
 * @brief Action representation for RL agent
 * 
 * Continuous + discrete action space: heading change + step size + crossing decision
 */
struct Action {
    double heading_change;  // radians, range: [-π/4, π/4]
    double step_size;       // meters, range: [10, 100]
    int crossing_decision;  // 0=normal, 1=cross, 2=request_contour, 3=avoid
    
    // Convert from neural network output
    static Action from_vector(const std::vector<float>& action_vec);
    
    // Convert to vector for NN output
    std::vector<float> to_vector() const;
    
    // Action dimension
    static constexpr int dimension() { return 3; }
    
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
    
    // Bend characteristics (NEW - pipeline physics)
    double heading_change_deg = 0.0;  // Bend angle in degrees
    double bend_radius_m = 0.0;        // Actual bend radius
    bool exceeds_field_bend_limit = false;  // > 5° field bend limit
    
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
    
    // Hydraulics (NEW - comprehensive pressure profile)
    double entry_pressure_bar = 0.0;        // Pressure at segment start (bar)
    double exit_pressure_bar = 0.0;         // Pressure at segment end (bar)
    double pressure_drop_pa = 0.0;          // Pressure drop in this segment (Pa)
    double cumulative_pressure_drop_pa = 0.0; // Total pressure drop from start (Pa)
    double flow_velocity_m_s = 0.0;         // Gas velocity (m/s)
    double reynolds_number = 0.0;           // Flow regime indicator
    bool has_compressor_station = false;    // Whether segment contains compressor
    std::string compressor_station_type;    // "centrifugal", "reciprocating", or empty
    bool requires_pumping_station = false;  // Legacy field (kept for compatibility)
    
    // RL metadata
    int step_number = 0;
    double reward = 0.0;
    double total_reward = 0.0;
    
    // Crossing context (NEW - Phase 3: Enhanced Crossing Logic)
    // Captured at segment creation for analysis and debugging
    double nearest_crossing_dist = 0.0;      // Distance to nearest crossable feature (m)
    double nearest_crossing_width = 0.0;     // Width of nearest crossing (m)
    double nearest_crossing_type = 0.0;      // 0=none, 1=road, 2=waterway, 3=railway, 4=powerline (stored as double for alignment)
    double crossing_before_dist = 0.0;       // Distance to feature before nearest (m)
    double crossing_after_dist = 0.0;        // Distance to feature after nearest (m)
    double crossing_cardinal_alignment = 0.0; // How perpendicular to feature (0-1, 1=orthogonal)
    
    // Boundary awareness (NEW - Phase 4: Continuous Cost System)
    double distance_to_aoi_boundary = 0.0;   // Distance to AOI edge (m)
    double distance_to_sea_boundary = 0.0;   // Distance to sea/coastline (m)
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
 * @brief Feature information for crossing decision-making
 */
struct CrossingFeature {
    OGRGeometry* geometry = nullptr;  // Not owned - pointer into dataset
    double width_m = 0.0;
    std::string feature_type;  // highway type, waterway type, railway type, etc.
    int num_lanes = 0;         // For roads
    int gauge_mm = 0;          // For railways (in millimeters)
    double distance_from_point = 0.0;
    bool is_crossable = true;  // dams/weirs are not crossable
    
    CrossingFeature() = default;
};

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
    double distance_to_land_cover_type(double x, double y, int land_cover_class) const;
    
    // Check if point is within AOI
    bool is_within_aoi(double x, double y) const;
    
    // Get AOI bounds
    void get_aoi_bounds(double& minx, double& miny, 
                       double& maxx, double& maxy) const;
    
    // Sea polygon constraint methods (NEW - 1km exclusion zone from largest water body)
    bool is_near_sea(double x, double y) const;
    bool has_sea_polygon() const { return sea_polygon_geom_ != nullptr; }
    double distance_to_sea(double x, double y) const;
    
    // Boundary distance calculations (NEW - Phase 4: Continuous Cost System)
    double calculate_distance_to_aoi_boundary(double x, double y) const;
    
    // Infrastructure checks
    bool has_power_lines() const { return power_lines_ != nullptr; }
    bool has_railways() const { return railways_ != nullptr; }
    
    // Additional dataset queries
    double get_geohazard_risk(double x, double y) const;  // Landslide, seismic risk
    double get_soil_bearing_capacity(double x, double y) const;  // Foundation suitability
    bool is_cadastre_complex(double x, double y) const;  // Complex land ownership
    double get_population_density(double x, double y) const;  // Social impact
    
    // Enhanced crossing logic methods (NEW - Phase 3)
    std::vector<CrossingFeature> get_nearest_crossing_features(
        double x, double y, double search_radius_m, int max_features = 3
    ) const;
    
    double calculate_road_width(const CrossingFeature& feature) const;
    double calculate_waterway_width(const CrossingFeature& feature) const;
    double calculate_railway_width(const CrossingFeature& feature) const;
    
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
    
    // Vector geometries for constraints (merged geometry collections for fast distance queries)
    std::unique_ptr<OGRGeometry> aoi_geom_;
    std::unique_ptr<OGRGeometry> protected_areas_;
    std::unique_ptr<OGRGeometry> water_bodies_;
    std::unique_ptr<OGRGeometry> roads_;
    std::unique_ptr<OGRGeometry> railways_;
    std::unique_ptr<OGRGeometry> cadastre_complex_;  // Complex land parcels
    std::unique_ptr<OGRGeometry> power_lines_;       // Power transmission lines
    std::unique_ptr<OGRGeometry> pipelines_;         // Existing pipelines
    std::unique_ptr<OGRGeometry> sea_polygon_geom_;  // Largest water polygon (sea) - 1km exclusion zone
    
    // Vector datasets for attribute queries (NEW - Phase 3: Enhanced Crossing Logic)
    std::unique_ptr<GDALDataset> roads_dataset_;
    std::unique_ptr<GDALDataset> waterways_dataset_;
    std::unique_ptr<GDALDataset> railways_dataset_;
    std::unique_ptr<GDALDataset> powerlines_dataset_;
    
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
    double hydraulic_cost(const SegmentHydraulics& hydraulics,
                         double segment_length_m) const;
    
    // Enhanced crossing cost calculation (NEW - Phase 3: Enhanced Crossing Logic)
    double calculate_road_crossing_cost(const CrossingFeature& feature) const;
    double calculate_waterway_crossing_cost(const CrossingFeature& feature) const;
    double calculate_railway_crossing_cost(const CrossingFeature& feature) const;
    double calculate_powerline_crossing_cost(const CrossingFeature& feature) const;
    
    // Continuous terrain cost (NEW - Phase 4: Continuous Cost System)
    double calculate_terrain_cost(double slope_percent,
                                  int land_cover_class,
                                  double segment_length_m,
                                  double soil_capacity,
                                  double geohazard_risk) const;
    
    // Apply parameter overrides from JSON (NEW - for parameter tuning)
    void apply_parameter_overrides(const nlohmann::json& overrides);
    
private:
    ProjectConfig config_;
    
    // Cost lookup tables
    std::map<std::string, double> terrain_multipliers_;
    std::map<int, double> landcover_costs_; // ESA WorldCover classes
    std::map<std::string, double> crossing_costs_;
    
    // Regional cost adjustments
    double regional_multiplier_;
    
    // Hydraulic cost parameters (overridable)
    double compressor_base_cost_ = 1000000.0;
    double compressor_power_cost_per_kw_ = 5000.0;
    double erosion_velocity_threshold_m_s_ = 15.0;
    double erosion_penalty_per_m_ = 150.0;
    double dropout_velocity_threshold_m_s_ = 3.0;
    double dropout_penalty_per_m_ = 75.0;
    double excessive_pressure_drop_threshold_bar_ = 5.0;
    double excessive_pressure_drop_per_bar_ = 10000.0;
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
    
    // Contouring support (NEW - Phase 3: Enhanced Crossing Logic)
    std::vector<std::pair<double, double>> active_contour_waypoints_;
    int current_waypoint_idx_;
    bool is_contouring_;
    
    // Parameter overrides (NEW - loaded from pirl_parameter_overrides.json)
    double progress_reward_multiplier_ = 2.0;
    double goal_bonus_ = 10000.0;
    double exploration_bonus_ = 100.0;
    double sea_penalty_ = -10000.0;
    double buildup_penalty_ = -10000.0;
    double powerline_penalty_ = -500.0;
    double railway_penalty_ = -500.0;
    double curvature_penalty_rate_ = -10.0;
    double out_of_bounds_penalty_ = -50.0;
    double cost_normalization_factor_ = 100000.0;
    double exploration_bonus_milestone_m_ = 1000.0;
    double powerline_clearance_m_ = 6.0;
    double railway_clearance_m_ = 10.0;
    double powerline_crossing_threshold_m_ = 2.0;
    double railway_crossing_threshold_m_ = 3.0;
    double sea_exclusion_distance_m_ = 1000.0;
    double contour_adherence_bonus_ = 50.0;  // Bonus for staying near contour waypoints
    double contour_buffer_safety_margin_m_ = 2.0;  // Extra buffer beyond minimum clearance
    
    // Helper: load parameter overrides from JSON
    void load_parameter_overrides(const std::string& override_file);
    
    // Helper: contouring support
    void generate_contour_waypoints(const CrossingFeature& feature, double current_x, double current_y);
    double calculate_contour_adherence_bonus() const;
    
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

