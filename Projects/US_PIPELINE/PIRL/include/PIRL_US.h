#pragma once

#include <string>
#include <vector>
#include <map>
#include <memory>
#include <optional>
#include <functional>

// Forward declarations for GDAL
class GDALDataset;
class OGRGeometry;
class OGRPoint;

namespace agrs {
namespace pirl_us {

// ============================================================================
// SIMPLIFIED STATE REPRESENTATION (7D)
// ============================================================================

struct State {
    // Position (2D)
    double x, y;
    
    // Navigation (2D)
    double goal_distance;
    double goal_bearing; // radians
    
    // Terrain (1D) - PRIMARY OPTIMIZATION FACTOR
    double slope;
    
    // Constraints (1D)
    double distance_to_boundary;
    
    // Action history (1D)
    double prev_heading;
    
    // Convert to vector for neural network input
    std::vector<float> to_vector() const;
    
    // State dimension (for NN architecture)
    static constexpr int dimension() { return 7; }
};

// ============================================================================
// SIMPLIFIED ACTION REPRESENTATION (2D)
// ============================================================================

struct Action {
    double heading_change;  // radians, range: [-π/4, π/4]
    double step_size;       // meters, range: [40, 300]
    
    // Convert from neural network output
    static Action from_vector(const std::vector<float>& action_vec);
    
    // Convert to vector for NN output
    std::vector<float> to_vector() const;
    
    // Action dimension
    static constexpr int dimension() { return 2; }
    
    // Apply physics constraints
    void apply_constraints(const State& current_state);
};

// ============================================================================
// REWARD STRUCTURE
// ============================================================================

struct RewardInfo {
    double total_reward;
    
    // Reward components
    double progress_reward;        // Positive: moving toward goal
    double slope_violation;        // Slope reward/penalty (renamed from cost_penalty)
    double constraint_penalty;     // Boundary penalties
    double curvature_penalty;      // Excessive bends
    double goal_bonus;             // Reaching goal
    
    // Debug info
    std::string termination_reason;
};

// ============================================================================
// ROUTE TRAJECTORY STRUCTURES
// ============================================================================

struct RouteSegment {
    // Geometry
    double start_x = 0.0, start_y = 0.0;
    double end_x = 0.0, end_y = 0.0;
    double length_m = 0.0;
    int segment_id = 0;
    
    // Elevation
    double elevation_start = 0.0;
    double elevation_end = 0.0;
    double max_slope_percent = 0.0;  // Maximum slope along segment path
    
    // Cumulative
    double cumulative_distance_m = 0.0;
    
    // RL metadata
    int step_number = 0;
    double reward = 0.0;
    double total_reward = 0.0;
    
    // Boundary awareness
    double distance_to_aoi_boundary = 0.0;
};

struct RouteTrajectory {
    std::vector<RouteSegment> segments;
    bool success = false;
    double total_length_m = 0.0;
    std::string termination_reason;
};

// ============================================================================
// GIS DATA MANAGER (DEM-Only)
// ============================================================================

class GISDataManager {
public:
    GISDataManager(const std::string& project_dir, int epsg_code);
    ~GISDataManager();
    
    // Load DEM and AOI only
    void load_all_data();
    
    // Query terrain features
    double get_elevation(double x, double y) const;
    double get_slope(double x, double y) const;
    double get_max_slope_along_path(double x1, double y1, double x2, double y2, double sample_interval_m = 10.0) const;
    
    // Query constraints
    bool is_within_aoi(double x, double y) const;
    double calculate_distance_to_aoi_boundary(double x, double y) const;
    
    // Get AOI bounds
    void get_aoi_bounds(double& minx, double& miny, 
                       double& maxx, double& maxy) const;
    
private:
    std::string project_dir_;
    int epsg_code_;
    
    // GDAL datasets (owned pointers)
    std::unique_ptr<GDALDataset> dem_;
    std::unique_ptr<OGRGeometry> aoi_geom_;
    
    // Helper: sample raster at point
    double sample_raster(GDALDataset* dataset, double x, double y) const;
};

// ============================================================================
// SIMPLIFIED PIPELINE ENVIRONMENT
// ============================================================================

class PipelineEnvironment {
public:
    // Configuration structure
    struct Config {
        std::string project_dir;
        int epsg_code;
        
        struct Point {
            double x, y;
        };
        Point start_point;
        Point end_point;
        
        double max_slope_percent = 50.0;
        int max_steps_per_episode = 5000;
        double step_size_min_m = 40.0;
        double step_size_max_m = 300.0;
    };
    
    PipelineEnvironment(const Config& config);
    ~PipelineEnvironment();
    
    // Gymnasium interface
    State reset();
    std::pair<State, RewardInfo> step(const Action& action);
    bool is_done() const;
    
    // Get current route
    std::vector<std::pair<double, double>> get_current_route() const;
    
    // Get detailed route trajectory
    RouteTrajectory get_route_trajectory() const;
    
    // Get current position
    std::pair<double, double> get_current_position() const;
    
    // Render (for visualization)
    void render(const std::string& output_path) const;
    
private:
    Config config_;
    std::unique_ptr<GISDataManager> gis_;
    
    // Current state
    State current_state_;
    std::vector<std::pair<double, double>> current_route_;
    int step_count_;
    bool done_;
    
    // Goal and start positions
    double goal_x_, goal_y_;
    double start_x_, start_y_;
    
    // Trajectory tracking
    std::vector<RouteSegment> trajectory_;
    double cumulative_distance_;
    State previous_state_;
    double total_reward_accumulated_;
    
    // Exploration tracking
    double best_distance_to_goal_;
    
    // Helper: calculate reward
    RewardInfo calculate_reward(const State& prev_state,
                               const Action& action,
                               const State& new_state);
    
    // Helper: check termination conditions
    bool check_termination(const State& state, std::string& reason);
};

} // namespace pirl_us
} // namespace agrs

