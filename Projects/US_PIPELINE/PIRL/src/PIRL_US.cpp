#include "../include/PIRL_US.h"
#include <gdal_priv.h>
#include <ogr_geometry.h>
#include <ogr_spatialref.h>
#include <ogrsf_frmts.h>
#include <ogr_api.h>
#include <cmath>
#include <fstream>
#include <iostream>
#include <iomanip>
#include <algorithm>
#include <filesystem>
#include <sstream>
#include <limits>

namespace agrs {
namespace pirl_us {

// ============================================================================
// STATE IMPLEMENTATION
// ============================================================================

std::vector<float> State::to_vector() const {
    // Normalize coordinates to reasonable range
    constexpr double coord_scale = 100000.0;  // 100km
    
    // Helper to safely clip values and prevent NaN/Inf
    auto safe_float = [](double val, double min_val = -1000.0, double max_val = 1000.0) -> float {
        if (std::isnan(val) || std::isinf(val)) return 0.0f;
        return static_cast<float>(std::clamp(val, min_val, max_val));
    };
    
    // 7-dimensional state vector
    std::vector<float> vec(7, 0.0f);
    
    vec[0] = safe_float(x / coord_scale, 0.0, 10.0);
    vec[1] = safe_float(y / coord_scale, 0.0, 100.0);
    vec[2] = safe_float(goal_distance / 100000.0, 0.0, 10.0);
    vec[3] = safe_float(goal_bearing, -3.15, 3.15);
    vec[4] = safe_float(slope / 100.0, 0.0, 1.0);  // Normalize slope (0-100%)
    vec[5] = safe_float(distance_to_boundary / 1000.0, 0.0, 10.0);
    vec[6] = safe_float(prev_heading, -3.15, 3.15);
    
    return vec;
}

// ============================================================================
// ACTION IMPLEMENTATION
// ============================================================================

Action Action::from_vector(const std::vector<float>& action_vec) {
    Action action;
    if (action_vec.size() >= 2) {
        // Neural network outputs in range [-1, 1], scale to actual ranges
        action.heading_change = action_vec[0] * (M_PI / 4.0); // ±45 degrees
        action.step_size = (action_vec[1] + 1.0) * 130.0 + 40.0; // 40-300m range
    }
    return action;
}

std::vector<float> Action::to_vector() const {
    return {
        static_cast<float>(heading_change),
        static_cast<float>(step_size)
    };
}

void Action::apply_constraints(const State& current_state) {
    // Clamp step size first
    step_size = std::clamp(step_size, 40.0, 300.0);
    
    // Initial heading change limit
    heading_change = std::clamp(heading_change, -M_PI / 4.0, M_PI / 4.0);
    
    // Bend radius enforcement
    if (std::abs(heading_change) > 1e-6) {  // Only if actually turning
        double current_bend_radius = step_size / (2.0 * std::sin(std::abs(heading_change) / 2.0));
        
        // Field bend constraints (cold bending)
        const double FIELD_BEND_MAX_ANGLE_DEG = 5.0;
        const double FIELD_BEND_MAX_ANGLE_RAD = FIELD_BEND_MAX_ANGLE_DEG * M_PI / 180.0;
        
        // Minimum bend radius for cold bending (40D rule)
        const double PIPE_DIAMETER_M = 0.6604;
        const double MIN_COLD_BEND_RADIUS = PIPE_DIAMETER_M * 40.0;  // 26.4m
        
        // Calculate maximum heading change for this step size
        double max_angle_for_radius = 2.0 * std::asin(step_size / (2.0 * MIN_COLD_BEND_RADIUS));
        double max_angle_for_field_bend = FIELD_BEND_MAX_ANGLE_RAD;
        
        // Use most restrictive constraint
        double max_allowed_angle = std::min(max_angle_for_radius, max_angle_for_field_bend);
        
        // Clamp heading change
        heading_change = std::clamp(heading_change, -max_allowed_angle, max_allowed_angle);
    }
    
    // Reduce step size on steep slopes
    if (current_state.slope > 15.0) {
        double slope_factor = 1.0 - ((current_state.slope - 15.0) / 50.0);
        slope_factor = std::clamp(slope_factor, 0.5, 1.0);
        step_size *= slope_factor;
    }
}

// ============================================================================
// GIS DATA MANAGER IMPLEMENTATION
// ============================================================================

GISDataManager::GISDataManager(const std::string& project_dir, int epsg_code)
    : project_dir_(project_dir), epsg_code_(epsg_code) {
    GDALAllRegister();
}

GISDataManager::~GISDataManager() = default;

void GISDataManager::load_all_data() {
    std::cout << "🗺️  Loading GIS data for US_PIPELINE (simplified)..." << std::endl;
    
    namespace fs = std::filesystem;
    
    // Load DEM (REQUIRED)
    std::string dem_path = project_dir_ + "/data/rasters/dem.tif";
    if (fs::exists(dem_path)) {
        dem_.reset(static_cast<GDALDataset*>(
            GDALOpen(dem_path.c_str(), GA_ReadOnly)));
        if (dem_) {
            std::cout << "  ✅ DEM loaded" << std::endl;
        } else {
            std::cerr << "  ⚠️  Failed to load DEM" << std::endl;
        }
    } else {
        std::cerr << "  ❌ DEM not found: " << dem_path << std::endl;
        throw std::runtime_error("DEM is required for US_PIPELINE PIRL");
    }
    
    // Load AOI boundary (REQUIRED)
    std::string aoi_path = project_dir_ + "/aoi/aoi.kmz";
    if (!fs::exists(aoi_path)) {
        aoi_path = project_dir_ + "/aoi/aoi.gpkg";
    }
    if (fs::exists(aoi_path)) {
        GDALDataset* aoi_ds = static_cast<GDALDataset*>(
            GDALOpenEx(aoi_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (aoi_ds && aoi_ds->GetLayerCount() > 0) {
            OGRLayer* layer = aoi_ds->GetLayer(0);
            OGRFeature* feature;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    aoi_geom_.reset(geom->clone());
                    std::cout << "  ✅ AOI boundary loaded" << std::endl;
                    break;
                }
                OGRFeature::DestroyFeature(feature);
            }
            GDALClose(aoi_ds);
        }
    } else {
        std::cerr << "  ❌ AOI not found" << std::endl;
        throw std::runtime_error("AOI boundary is required for US_PIPELINE PIRL");
    }
    
    std::cout << "✅ GIS data loading complete (DEM + AOI only)" << std::endl;
}

double GISDataManager::sample_raster(GDALDataset* dataset, double x, double y) const {
    if (!dataset) return 0.0;
    
    // Get raster's spatial reference
    const OGRSpatialReference* rasterSRS = dataset->GetSpatialRef();
    if (!rasterSRS) {
        return 0.0;
    }
    
    // Create project spatial reference (UTM)
    OGRSpatialReference projectSRS;
    projectSRS.importFromEPSG(epsg_code_);
    
    // Check if coordinate transformation is needed
    bool needsTransform = !rasterSRS->IsSame(&projectSRS);
    
    double sample_x = x;
    double sample_y = y;
    
    if (needsTransform) {
        OGRCoordinateTransformation* transform = 
            OGRCreateCoordinateTransformation(&projectSRS, rasterSRS);
        
        if (!transform) {
            return 0.0;
        }
        
        if (!transform->Transform(1, &sample_x, &sample_y)) {
            delete transform;
            return 0.0;
        }
        
        delete transform;
    }
    
    // Get geotransform
    double geotransform[6];
    if (dataset->GetGeoTransform(geotransform) != CE_None) {
        return 0.0;
    }
    
    // Convert coordinates to pixel/line
    double pixel = (sample_x - geotransform[0]) / geotransform[1];
    double line = (sample_y - geotransform[3]) / geotransform[5];
    
    int px = static_cast<int>(pixel);
    int py = static_cast<int>(line);
    
    // Check bounds
    if (px < 0 || px >= dataset->GetRasterXSize() ||
        py < 0 || py >= dataset->GetRasterYSize()) {
        return 0.0;
    }
    
    // Read single pixel
    GDALRasterBand* band = dataset->GetRasterBand(1);
    if (!band) return 0.0;
    
    float value;
    if (band->RasterIO(GF_Read, px, py, 1, 1, &value, 1, 1, 
                      GDT_Float32, 0, 0) != CE_None) {
        return 0.0;
    }
    
    // Check for NoData
    int hasNoData;
    double noDataValue = band->GetNoDataValue(&hasNoData);
    if (hasNoData && value == noDataValue) {
        return 0.0;
    }
    
    return static_cast<double>(value);
}

double GISDataManager::get_elevation(double x, double y) const {
    return sample_raster(dem_.get(), x, y);
}

double GISDataManager::get_slope(double x, double y) const {
    if (!dem_) {
        return 0.0;
    }

    double geotransform[6];
    double dx = 10.0;
    double dy = 10.0;
    if (dem_->GetGeoTransform(geotransform) == CE_None) {
        if (std::abs(geotransform[1]) > 0.0) dx = std::abs(geotransform[1]);
        if (std::abs(geotransform[5]) > 0.0) dy = std::abs(geotransform[5]);
    }

    // Sample 3x3 neighborhood
    const double z1 = get_elevation(x - dx, y + dy);
    const double z2 = get_elevation(x,      y + dy);
    const double z3 = get_elevation(x + dx, y + dy);
    const double z4 = get_elevation(x - dx, y);
    const double z5 = get_elevation(x,      y);
    const double z6 = get_elevation(x + dx, y);
    const double z7 = get_elevation(x - dx, y - dy);
    const double z8 = get_elevation(x,      y - dy);
    const double z9 = get_elevation(x + dx, y - dy);

    // Horn gradient
    const double denom_x = 8.0 * dx;
    const double denom_y = 8.0 * dy;
    const double dzdx = denom_x > 0.0 ? ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / denom_x : 0.0;
    const double dzdy = denom_y > 0.0 ? ((z7 + 2.0 * z8 + z9) - (z1 + 2.0 * z2 + z3)) / denom_y : 0.0;

    // Percent slope
    const double gradient = std::sqrt(dzdx * dzdx + dzdy * dzdy);
    return gradient * 100.0;
}

double GISDataManager::get_max_slope_along_path(double x1, double y1, double x2, double y2, double sample_interval_m) const {
    if (!dem_) {
        return 0.0;
    }
    
    // Calculate path length
    double dx = x2 - x1;
    double dy = y2 - y1;
    double path_length = std::sqrt(dx * dx + dy * dy);
    
    if (path_length < 1.0) {
        // Very short segment, just return slope at end point
        return get_slope(x2, y2);
    }
    
    // Calculate number of samples (at least 3: start, middle, end)
    int num_samples = std::max(3, static_cast<int>(std::ceil(path_length / sample_interval_m)) + 1);
    
    // Direction vector (normalized)
    double dir_x = dx / path_length;
    double dir_y = dy / path_length;
    
    // Sample along the path and find maximum slope
    double max_slope = 0.0;
    
    for (int i = 0; i < num_samples; ++i) {
        double t = static_cast<double>(i) / static_cast<double>(num_samples - 1);  // 0.0 to 1.0
        double sample_x = x1 + t * dx;
        double sample_y = y1 + t * dy;
        
        double slope_at_point = get_slope(sample_x, sample_y);
        max_slope = std::max(max_slope, slope_at_point);
    }
    
    return max_slope;
}

bool GISDataManager::is_within_aoi(double x, double y) const {
    if (!aoi_geom_) {
        double minx, miny, maxx, maxy;
        get_aoi_bounds(minx, miny, maxx, maxy);
        return (x >= minx && x <= maxx && y >= miny && y <= maxy);
    }
    
    OGRPoint point(x, y);
    
    if (aoi_geom_->getSpatialReference()) {
        point.assignSpatialReference(aoi_geom_->getSpatialReference());
    }
    
    return aoi_geom_->Contains(&point);
}

double GISDataManager::calculate_distance_to_aoi_boundary(double x, double y) const {
    if (!aoi_geom_) {
        return std::numeric_limits<double>::max();
    }
    
    OGRPoint point(x, y);
    
    if (aoi_geom_->getSpatialReference()) {
        point.assignSpatialReference(aoi_geom_->getSpatialReference());
    }
    
    if (aoi_geom_->Contains(&point)) {
        OGRGeometry* boundary = aoi_geom_->getBoundary();
        if (boundary) {
            double dist = boundary->Distance(&point);
            delete boundary;
            return dist;
        }
    }
    
    return 0.0;
}

void GISDataManager::get_aoi_bounds(double& minx, double& miny, 
                                   double& maxx, double& maxy) const {
    if (dem_) {
        double geotransform[6];
        if (dem_->GetGeoTransform(geotransform) == CE_None) {
            minx = geotransform[0];
            maxy = geotransform[3];
            maxx = minx + geotransform[1] * dem_->GetRasterXSize();
            miny = maxy + geotransform[5] * dem_->GetRasterYSize();
            return;
        }
    }
    
    minx = miny = 0.0;
    maxx = maxy = 1000.0;
}

// ============================================================================
// PIPELINE ENVIRONMENT IMPLEMENTATION
// ============================================================================

PipelineEnvironment::PipelineEnvironment(const Config& config)
    : config_(config), step_count_(0), done_(false), 
      cumulative_distance_(0.0), total_reward_accumulated_(0.0) {
    
    // Create GIS data manager
    gis_ = std::make_unique<GISDataManager>(config.project_dir, config.epsg_code);
    gis_->load_all_data();
    
    // Set goal and start positions
    goal_x_ = config.end_point.x;
    goal_y_ = config.end_point.y;
    start_x_ = config.start_point.x;
    start_y_ = config.start_point.y;
    
    std::cout << "✅ US_PIPELINE PIRL Environment initialized" << std::endl;
    std::cout << "   Start: (" << start_x_ << ", " << start_y_ << ")" << std::endl;
    std::cout << "   Goal:  (" << goal_x_ << ", " << goal_y_ << ")" << std::endl;
    
    double dx = goal_x_ - start_x_;
    double dy = goal_y_ - start_y_;
    double total_dist = std::sqrt(dx*dx + dy*dy);
    std::cout << "   Distance: " << total_dist << " m (" << total_dist/1000.0 << " km)" << std::endl;
}

PipelineEnvironment::~PipelineEnvironment() = default;

State PipelineEnvironment::reset() {
    // Reset state
    current_state_ = State();
    current_state_.x = start_x_;
    current_state_.y = start_y_;
    
    // Calculate goal distance and bearing
    double dx = goal_x_ - current_state_.x;
    double dy = goal_y_ - current_state_.y;
    current_state_.goal_distance = std::sqrt(dx*dx + dy*dy);
    current_state_.goal_bearing = std::atan2(dy, dx);
    
    // Get slope at start
    current_state_.slope = gis_->get_slope(current_state_.x, current_state_.y);
    
    // Get distance to boundary
    current_state_.distance_to_boundary = 
        gis_->calculate_distance_to_aoi_boundary(current_state_.x, current_state_.y);
    
    // Initial heading (toward goal)
    current_state_.prev_heading = current_state_.goal_bearing;
    
    // Reset tracking
    current_route_.clear();
    current_route_.push_back({current_state_.x, current_state_.y});
    trajectory_.clear();
    step_count_ = 0;
    done_ = false;
    cumulative_distance_ = 0.0;
    total_reward_accumulated_ = 0.0;
    best_distance_to_goal_ = current_state_.goal_distance;
    
    previous_state_ = current_state_;
    
    return current_state_;
}

std::pair<State, RewardInfo> PipelineEnvironment::step(const Action& action) {
    // Store previous state
    previous_state_ = current_state_;
    
    // Apply action constraints
    Action constrained_action = action;
    constrained_action.apply_constraints(current_state_);
    
    // Calculate new position
    double new_heading = current_state_.prev_heading + constrained_action.heading_change;
    double new_x = current_state_.x + constrained_action.step_size * std::cos(new_heading);
    double new_y = current_state_.y + constrained_action.step_size * std::sin(new_heading);
    
    // Update state
    current_state_.x = new_x;
    current_state_.y = new_y;
    current_state_.prev_heading = new_heading;
    
    // Update goal distance and bearing
    double dx = goal_x_ - current_state_.x;
    double dy = goal_y_ - current_state_.y;
    current_state_.goal_distance = std::sqrt(dx*dx + dy*dy);
    current_state_.goal_bearing = std::atan2(dy, dx);
    
    // Update terrain - use MAX SLOPE along the segment path (sampled every 10m)
    current_state_.slope = gis_->get_max_slope_along_path(
        previous_state_.x, previous_state_.y, 
        current_state_.x, current_state_.y, 
        10.0  // Sample every 10m
    );
    
    // Update boundary distance
    current_state_.distance_to_boundary = 
        gis_->calculate_distance_to_aoi_boundary(current_state_.x, current_state_.y);
    
    // Update tracking
    current_route_.push_back({current_state_.x, current_state_.y});
    step_count_++;
    cumulative_distance_ += constrained_action.step_size;
    
    // Update best distance
    if (current_state_.goal_distance < best_distance_to_goal_) {
        best_distance_to_goal_ = current_state_.goal_distance;
    }
    
    // Calculate reward
    RewardInfo reward_info = calculate_reward(previous_state_, constrained_action, current_state_);
    total_reward_accumulated_ += reward_info.total_reward;
    
    // Create trajectory segment
    RouteSegment segment;
    segment.start_x = previous_state_.x;
    segment.start_y = previous_state_.y;
    segment.end_x = current_state_.x;
    segment.end_y = current_state_.y;
    segment.length_m = constrained_action.step_size;
    segment.segment_id = step_count_;
    segment.elevation_start = gis_->get_elevation(previous_state_.x, previous_state_.y);
    segment.elevation_end = gis_->get_elevation(current_state_.x, current_state_.y);
    segment.max_slope_percent = current_state_.slope;  // Max slope along segment path
    segment.cumulative_distance_m = cumulative_distance_;
    segment.step_number = step_count_;
    segment.reward = reward_info.total_reward;
    segment.total_reward = total_reward_accumulated_;
    segment.distance_to_aoi_boundary = current_state_.distance_to_boundary;
    
    trajectory_.push_back(segment);
    
    // Check termination
    std::string reason;
    done_ = check_termination(current_state_, reason);
    reward_info.termination_reason = reason;
    
    return {current_state_, reward_info};
}

RewardInfo PipelineEnvironment::calculate_reward(const State& prev_state,
                                                 const Action& action,
                                                 const State& new_state) {
    RewardInfo info;
    info.total_reward = 0.0;
    
    // 1. Progress reward (moving toward goal) - FIXED per segment for 7347m journey
    //    Option 2 (Per-Segment Normalized): 50-50 split between progress and terrain
    double prev_dist = prev_state.goal_distance;
    double curr_dist = new_state.goal_distance;
    double progress = prev_dist - curr_dist;
    
    // REVISED: Progress-based reward with step cost to encourage efficiency
    // - Reward: +10 per 100m of progress toward goal
    // - Step cost: -5 per step (penalizes circuitous routes)
    // - Net: Only profitable if making ~50m+ progress per step
    double progress_reward_component = (progress / 100.0) * 10.0;  // +10 per 100m progress
    double step_cost = -2.0;  // Reduced step cost for better exploration  // Fixed cost per step
    info.progress_reward = progress_reward_component + step_cost;
    info.total_reward += info.progress_reward;
    
    // 2. Slope reward/penalty - BALANCED with 25% hard limit
    double slope = new_state.slope;
    double slope_reward = 0.0;
    
    if (slope <= 5.0) {
        // Excellent terrain (0-5%): Strong reward - A* baseline territory
        slope_reward = 80.0;
    } else if (slope <= 10.0) {
        // Good terrain (5-10%): Positive, encouraging
        slope_reward = 80.0 - (slope - 5.0) * 10.0;  // 80 → 30
    } else if (slope <= 15.0) {
        // Acceptable terrain (10-15%): Small positive to neutral
        slope_reward = 30.0 - (slope - 10.0) * 6.0;  // 30 → 0
    } else if (slope <= 20.0) {
        // Marginal terrain (15-20%): Slight penalty
        slope_reward = -(slope - 15.0) * 10.0;  // 0 → -50
    } else if (slope <= 25.0) {
        // Near-limit terrain (20-25%): Strong penalty before termination
        slope_reward = -50.0 - (slope - 20.0) * 30.0;  // -50 → -200
    } else {
        // Terminal violation (>25%) - should not reach here due to termination
        slope_reward = -500.0;
    }
    
    info.slope_violation = slope_reward;
    info.total_reward += slope_reward;
    
    // 3. Boundary penalty (within 100m of AOI boundary) - ALWAYS APPLY
    double boundary_dist = new_state.distance_to_boundary;
    if (boundary_dist < 100.0) {
        // Linear penalty increasing as approaching boundary
        double boundary_penalty = -50.0 * (1.0 - boundary_dist / 100.0);
        info.constraint_penalty = boundary_penalty;
        info.total_reward += boundary_penalty;
    } else {
        info.constraint_penalty = 0.0;
    }
    
    // 4. Curvature penalty - REDUCED to allow more path exploration
    double curvature_penalty = -0.1 * std::abs(action.heading_change);  // REDUCED from -0.5
    info.curvature_penalty = curvature_penalty;
    info.total_reward += curvature_penalty;
    
    // 5. Goal bonus (reaching destination) - Scaled for 43-segment journey
    if (curr_dist < 100.0) {  // Within 100m of goal (increased from 50m)
        // OLD (too high for per-segment normalized system):
        // info.goal_bonus = 2000.0;  // Increased from 1000.0 for stronger goal-seeking
        
        // NEW (Option 2 - 10× base reward of 100):
        info.goal_bonus = 4000.0;  // Balanced: reward goal but also care about path quality  // Scaled for journey length, 10× base per-segment reward
        info.total_reward += info.goal_bonus;
    } else {
        info.goal_bonus = 0.0;
    }
    
    return info;
}

bool PipelineEnvironment::check_termination(const State& state, std::string& reason) {
    // 1. Out of bounds
    if (!gis_->is_within_aoi(state.x, state.y)) {
        reason = "OUT_OF_BOUNDS";
        // std::cout << "🚫 " << reason << std::endl;  // Silenced for quiet training
        return true;
    }
    
    // 2. Slope termination (25%)
    if (state.slope > 30.0) {
        reason = "SLOPE_VIOLATION_30%";
        // std::cout << "⛰️  " << reason << " (slope: " << state.slope << "%)" << std::endl;  // Silenced for quiet training
        return true;
    }
    
    // 3. Goal reached - print detailed route stats
    if (state.goal_distance < 50.0) {
        reason = "SUCCESS_GOAL_REACHED";
        
        // Calculate route stats
        double total_length = cumulative_distance_;
        double max_slope = 0.0;
        double sum_slope = 0.0;
        for (const auto& seg : trajectory_) {
            if (seg.max_slope_percent > max_slope) max_slope = seg.max_slope_percent;
            sum_slope += seg.max_slope_percent;
        }
        double avg_slope = trajectory_.empty() ? 0.0 : sum_slope / trajectory_.size();
        
        // A* baseline: 8370.7m length, 3.87% avg slope, 14.92% max slope
        double efficiency = (7347.0 / total_length) * 100.0;  // straight line / actual
        double vs_astar_len = ((8370.7 - total_length) / 8370.7) * 100.0;
        double vs_astar_slope = ((3.87 - avg_slope) / 3.87) * 100.0;
        
        std::cout << "✅ GOAL | len = " << std::fixed << std::setprecision(3) << (total_length / 1000.0) 
                  << "km | avg_slope = " << std::setprecision(1) << avg_slope 
                  << "% | max_slope = " << max_slope 
                  << "% | eff = " << std::setprecision(0) << efficiency 
                  << "% | vs_A*: " << std::setprecision(1) << std::showpos << vs_astar_len << "% len, "
                  << vs_astar_slope << "% slope" << std::noshowpos << std::endl;
        return true;
    }
    
    // 4. Max steps
    if (step_count_ >= config_.max_steps_per_episode) {
        reason = "MAX_STEPS_5000";
        std::cout << "⏱️  " << reason << std::endl;
        return true;
    }
    
    return false;
}

bool PipelineEnvironment::is_done() const {
    return done_;
}

std::vector<std::pair<double, double>> PipelineEnvironment::get_current_route() const {
    return current_route_;
}

RouteTrajectory PipelineEnvironment::get_route_trajectory() const {
    RouteTrajectory traj;
    traj.segments = trajectory_;
    traj.success = (!trajectory_.empty() && 
                   trajectory_.back().segment_id > 0 &&
                   current_state_.goal_distance < 50.0);
    traj.total_length_m = cumulative_distance_;
    traj.termination_reason = done_ ? "completed" : "in_progress";
    return traj;
}

std::pair<double, double> PipelineEnvironment::get_current_position() const {
    return {current_state_.x, current_state_.y};
}

void PipelineEnvironment::render(const std::string& output_path) const {
    // Simple GeoJSON export - full implementation in generate_geojson_us.py
    std::cout << "Render to " << output_path << " (use generate_geojson_us.py for full export)" << std::endl;
}

} // namespace pirl_us
} // namespace agrs

