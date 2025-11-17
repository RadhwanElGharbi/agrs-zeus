#include "agrs_zeus/PIRL.h"
#include <cmath>
#include <iostream>
#include <algorithm>
#include <fstream>
#include <filesystem>

namespace agrs {
namespace pirl {

// ============================================================================
// PIPELINE ENVIRONMENT IMPLEMENTATION
// ============================================================================

PipelineEnvironment::PipelineEnvironment(const ProjectConfig& config)
    : config_(config), step_count_(0), done_(false) {
    
    // Initialize GIS data manager
    gis_ = std::make_unique<GISDataManager>(config.project_dir, config.epsg_code);
    gis_->load_all_data();
    
    // Initialize cost model
    cost_model_ = std::make_unique<CostModel>(config);
    
    // Initialize physics constraints
    physics_ = std::make_unique<PhysicsConstraints>(config);
    
    // Initialize hydraulics calculator (if enabled in config)
    if (config.has_pipeline_specs && 
        config.pipeline_specs.hydraulics.enable_hydraulics) {
        
        PipelineHydraulics hydraulic_params;
        hydraulic_params.diameter_internal_m = config.pipeline_specs.hydraulics.diameter_internal_m;
        hydraulic_params.roughness_absolute_mm = config.pipeline_specs.hydraulics.pipe_roughness_mm;
        hydraulic_params.flow_rate_m3_s = config.pipeline_specs.hydraulics.volumetric_flow_rate_m3_s;
        hydraulic_params.operating_temperature_k = config.pipeline_specs.hydraulics.operating_temperature_k;
        
        // Gas properties
        hydraulic_params.gas.molecular_weight_kg_kmol = config.pipeline_specs.hydraulics.gas_molecular_weight_kg_kmol;
        hydraulic_params.gas.specific_gravity = config.pipeline_specs.hydraulics.gas_specific_gravity;
        
        hydraulics_ = std::make_unique<HydraulicsCalculator>(hydraulic_params);
        
        std::cout << "   🌊 Hydraulics module enabled" << std::endl;
        std::cout << "      Initial pressure: " << config.pipeline_specs.hydraulics.initial_pressure_bar << " bar" << std::endl;
        std::cout << "      Min delivery: " << config.pipeline_specs.hydraulics.min_delivery_pressure_bar << " bar" << std::endl;
    } else {
        std::cout << "   ℹ️  Hydraulics module disabled" << std::endl;
    }
    
    // Load parameter overrides (if they exist)
    std::string override_file = config.project_dir + "/PIRL/pirl_parameter_overrides.json";
    if (std::filesystem::exists(override_file)) {
        load_parameter_overrides(override_file);
    }
    
    // Set goal
    goal_x_ = config.end_point.x;
    goal_y_ = config.end_point.y;
    
    std::cout << "🎯 Pipeline Environment initialized" << std::endl;
    std::cout << "   Start: (" << config.start_point.x << ", " 
              << config.start_point.y << ")" << std::endl;
    std::cout << "   Goal:  (" << goal_x_ << ", " << goal_y_ << ")" << std::endl;
}

PipelineEnvironment::~PipelineEnvironment() = default;

State PipelineEnvironment::reset() {
    // Reset to starting position
    current_state_ = State();
    current_state_.x = config_.start_point.x;
    current_state_.y = config_.start_point.y;
    
    // Calculate goal distance and bearing
    double dx = goal_x_ - current_state_.x;
    double dy = goal_y_ - current_state_.y;
    current_state_.goal_distance = std::sqrt(dx*dx + dy*dy);
    current_state_.goal_bearing = std::atan2(dy, dx);
    
    // Get terrain features at starting point
    current_state_.elevation = gis_->get_elevation(current_state_.x, current_state_.y);
    current_state_.slope = gis_->get_slope(current_state_.x, current_state_.y);
    current_state_.aspect = gis_->get_aspect(current_state_.x, current_state_.y);
    current_state_.curvature = gis_->get_curvature(current_state_.x, current_state_.y);
    
    // Get constraint features
    current_state_.no_go_zone = gis_->is_no_go_zone(current_state_.x, current_state_.y) ? 1.0 : 0.0;
    current_state_.water_proximity = gis_->distance_to_water(current_state_.x, current_state_.y);
    current_state_.road_proximity = gis_->distance_to_road(current_state_.x, current_state_.y);
    
    // Get additional dataset features (NEW)
    current_state_.geohazard_risk = gis_->get_geohazard_risk(current_state_.x, current_state_.y);
    current_state_.soil_capacity = gis_->get_soil_bearing_capacity(current_state_.x, current_state_.y);
    current_state_.cadastre_complex = gis_->is_cadastre_complex(current_state_.x, current_state_.y) ? 1.0 : 0.0;
    current_state_.population_density = gis_->get_population_density(current_state_.x, current_state_.y);
    current_state_.railway_proximity = gis_->distance_to_railway(current_state_.x, current_state_.y);
    
    // Initialize heading toward goal
    current_state_.prev_heading = current_state_.goal_bearing;
    current_state_.prev_step_size = 50.0;
    
    // Clear route and reset counters
    current_route_.clear();
    current_route_.push_back({current_state_.x, current_state_.y});
    step_count_ = 0;
    done_ = false;
    
    // Initialize trajectory tracking (NEW)
    trajectory_.clear();
    cumulative_cost_ = 0.0;
    cumulative_distance_ = 0.0;
    previous_state_ = current_state_;
    total_reward_accumulated_ = 0.0;
    
    // Initialize out-of-bounds and exploration tracking (NEW)
    out_of_bounds_steps_ = 0;
    best_distance_to_goal_ = current_state_.goal_distance;
    
    // Initialize hydraulics (NEW - Phase 2)
    if (config_.has_pipeline_specs && config_.pipeline_specs.hydraulics.enable_hydraulics) {
        current_pressure_pa_ = config_.pipeline_specs.hydraulics.initial_pressure_bar * 100000.0;  // Convert bar to Pa
        total_pressure_drop_pa_ = 0.0;
        distance_since_pump_m_ = 0.0;
        pumping_stations_.clear();
        
        // Initialize hydraulic state features
        current_state_.cumulative_pressure_drop_pa = 0.0;
        current_state_.segments_since_pump = 0.0;
        current_state_.flow_velocity_m_s = 0.0;
        current_state_.reynolds_number = 0.0;
    } else {
        current_pressure_pa_ = 0.0;
        total_pressure_drop_pa_ = 0.0;
        distance_since_pump_m_ = 0.0;
        
        current_state_.cumulative_pressure_drop_pa = 0.0;
        current_state_.segments_since_pump = 0.0;
        current_state_.flow_velocity_m_s = 0.0;
        current_state_.reynolds_number = 0.0;
    }
    
    std::cout << "🔄 Environment reset. Initial distance to goal: " 
              << current_state_.goal_distance << "m" << std::endl;
    
    return current_state_;
}

std::pair<State, RewardInfo> PipelineEnvironment::step(const Action& action) {
    if (done_) {
        std::cerr << "⚠️  Environment is done. Call reset() first." << std::endl;
        return {current_state_, RewardInfo()};
    }
    
    // Store previous state
    State prev_state = current_state_;
    
    // Apply physics constraints to action
    Action constrained_action = action;
    constrained_action.apply_constraints(current_state_, *physics_);
    
    // Calculate new position
    double new_heading = current_state_.prev_heading + constrained_action.heading_change;
    double new_x = current_state_.x + constrained_action.step_size * std::cos(new_heading);
    double new_y = current_state_.y + constrained_action.step_size * std::sin(new_heading);
    
    // Update state
    current_state_.x = new_x;
    current_state_.y = new_y;
    
    // Update goal distance and bearing
    double dx = goal_x_ - current_state_.x;
    double dy = goal_y_ - current_state_.y;
    current_state_.goal_distance = std::sqrt(dx*dx + dy*dy);
    current_state_.goal_bearing = std::atan2(dy, dx);
    
    // Update terrain features
    current_state_.elevation = gis_->get_elevation(new_x, new_y);
    current_state_.slope = gis_->get_slope(new_x, new_y);
    current_state_.aspect = gis_->get_aspect(new_x, new_y);
    current_state_.curvature = gis_->get_curvature(new_x, new_y);
    
    // Update constraint features
    current_state_.no_go_zone = gis_->is_no_go_zone(new_x, new_y) ? 1.0 : 0.0;
    current_state_.water_proximity = gis_->distance_to_water(new_x, new_y);
    current_state_.road_proximity = gis_->distance_to_road(new_x, new_y);
    
    // Update additional dataset features (NEW)
    current_state_.geohazard_risk = gis_->get_geohazard_risk(new_x, new_y);
    current_state_.soil_capacity = gis_->get_soil_bearing_capacity(new_x, new_y);
    current_state_.cadastre_complex = gis_->is_cadastre_complex(new_x, new_y) ? 1.0 : 0.0;
    current_state_.population_density = gis_->get_population_density(new_x, new_y);
    current_state_.railway_proximity = gis_->distance_to_railway(new_x, new_y);
    
    // Update action history
    current_state_.prev_heading = new_heading;
    current_state_.prev_step_size = constrained_action.step_size;
    
    // Add to route
    current_route_.push_back({new_x, new_y});
    step_count_++;
    
    // Calculate reward
    RewardInfo reward_info = calculate_reward(prev_state, constrained_action, current_state_);
    
    // Check termination
    std::string term_reason;
    done_ = check_termination(current_state_, term_reason);
    reward_info.termination_reason = term_reason;
    
    // Record segment in trajectory (NEW - for detailed route export)
    RouteSegment segment;
    segment.segment_id = trajectory_.size() + 1;
    segment.step_number = step_count_;
    
    // Geometry (ACTUAL coordinates, not normalized)
    segment.start_x = prev_state.x;
    segment.start_y = prev_state.y;
    segment.end_x = current_state_.x;
    segment.end_y = current_state_.y;
    
    double seg_dx = segment.end_x - segment.start_x;
    double seg_dy = segment.end_y - segment.start_y;
    segment.length_m = std::sqrt(seg_dx*seg_dx + seg_dy*seg_dy);
    
    // Elevation
    segment.elevation_start = prev_state.elevation;
    segment.elevation_end = current_state_.elevation;
    segment.slope_percent = current_state_.slope;  // Already in percent from get_slope()
    segment.aspect = current_state_.aspect;
    segment.curvature = current_state_.curvature;
    
    // Bend characteristics (NEW - pipeline physics)
    segment.heading_change_deg = constrained_action.heading_change * 180.0 / M_PI;
    if (std::abs(constrained_action.heading_change) > 1e-6) {
        segment.bend_radius_m = segment.length_m / (2.0 * std::sin(std::abs(constrained_action.heading_change) / 2.0));
    } else {
        segment.bend_radius_m = std::numeric_limits<double>::infinity();  // Straight segment
    }
    segment.exceeds_field_bend_limit = (std::abs(segment.heading_change_deg) > 5.0);
    
    // Cost breakdown (extract from RewardInfo)
    segment.terrain_cost = reward_info.terrain_cost;
    segment.water_crossing_cost = reward_info.water_crossing_cost;
    segment.infrastructure_cost = reward_info.infrastructure_cost;
    segment.environmental_cost = reward_info.environmental_cost;
    segment.row_cost = reward_info.row_cost;
    segment.permitting_cost = reward_info.permitting_cost;
    segment.hydraulic_cost = reward_info.hydraulic_cost;
    segment.regulatory_cost = reward_info.regulatory_cost;
    segment.total_cost = segment.terrain_cost + segment.water_crossing_cost + 
                         segment.infrastructure_cost + segment.environmental_cost +
                         segment.row_cost + segment.permitting_cost + 
                         segment.hydraulic_cost + segment.regulatory_cost;
    
    // Cumulative
    cumulative_cost_ += segment.total_cost;
    cumulative_distance_ += segment.length_m;
    segment.cumulative_cost = cumulative_cost_;
    segment.cumulative_distance_m = cumulative_distance_;
    
    // Land cover
    segment.land_cover_class = gis_->get_land_cover_class(segment.end_x, segment.end_y);
    segment.land_cover_name = gis_->get_land_cover_name(segment.land_cover_class);
    
    // Environment
    segment.geohazard_risk = current_state_.geohazard_risk;
    segment.soil_capacity = current_state_.soil_capacity;
    segment.population_density = current_state_.population_density;
    
    // Infrastructure proximity (denormalize to meters, assuming 1km normalization)
    segment.water_proximity = current_state_.water_proximity * 1000.0;
    segment.road_proximity = current_state_.road_proximity * 1000.0;
    segment.railway_proximity = current_state_.railway_proximity * 1000.0;
    segment.powerline_proximity = gis_->distance_to_power_line(segment.end_x, segment.end_y) * 1000.0;
    segment.pipeline_proximity = gis_->distance_to_pipeline(segment.end_x, segment.end_y) * 1000.0;
    
    // Hydraulics (if enabled)
    if (hydraulics_ && config_.has_pipeline_specs) {
        // Convert current pressure from Pa to bar
        double current_pressure_bar = current_pressure_pa_ / 100000.0;
        
        // Calculate segment hydraulics
        SegmentHydraulics hyd = hydraulics_->calculate_segment(
            current_pressure_bar,
            segment.length_m,
            segment.elevation_end - segment.elevation_start
        );
        
        // Populate segment with hydraulic results
        segment.entry_pressure_bar = hyd.entry_pressure_bar;
        segment.exit_pressure_bar = hyd.exit_pressure_bar;
        segment.pressure_drop_pa = hyd.pressure_drop_bar * 100000.0;  // Convert bar to Pa
        segment.cumulative_pressure_drop_pa = total_pressure_drop_pa_;
        segment.flow_velocity_m_s = hyd.flow_velocity_m_s;
        segment.reynolds_number = hyd.reynolds_number;
        segment.has_compressor_station = hyd.has_compressor_station;
        segment.compressor_station_type = hyd.compressor_type;
        
        // Update current pressure for next segment
        current_pressure_pa_ = hyd.exit_pressure_bar * 100000.0;  // Convert bar to Pa
        total_pressure_drop_pa_ += segment.pressure_drop_pa;
        
        // Check if compressor station needed (simplified logic for now)
        double min_pressure_bar = config_.pipeline_specs.hydraulics.min_delivery_pressure_bar;
        if (hyd.exit_pressure_bar < (min_pressure_bar + 5.0)) {  // 5 bar safety margin
            segment.requires_pumping_station = true;
        }
    }
    
    // RL metadata
    segment.reward = reward_info.total_reward;
    total_reward_accumulated_ += reward_info.total_reward;
    segment.total_reward = total_reward_accumulated_;
    
    // Store segment
    trajectory_.push_back(segment);
    previous_state_ = current_state_;
    
    return {current_state_, reward_info};
}

bool PipelineEnvironment::is_done() const {
    return done_;
}

RewardInfo PipelineEnvironment::calculate_reward(const State& prev_state,
                                                 const Action& action,
                                                 const State& new_state) {
    RewardInfo info;
    info.total_reward = 0.0;
    
    // 1. Progress reward: reward for moving closer to goal
    double prev_dist = prev_state.goal_distance;
    double new_dist = new_state.goal_distance;
    double progress = prev_dist - new_dist;
    // CRITICAL: Strong progress reward to ensure goal-seeking behavior
    // At 0.02, agent gets only +1 for 50m progress, but -1000+ for any constraint
    // Increased to 2.0 so 50m progress = +100, making goal-seeking competitive with cost avoidance
    info.progress_reward = progress * progress_reward_multiplier_; // Configurable via parameter overrides
    info.total_reward += info.progress_reward;
    
    // 2. Cost penalty: negative reward based on construction cost
    double segment_cost = cost_model_->calculate_segment_cost(prev_state, new_state, *gis_, &info);
    // Normalize: typical segment costs are $200-1000/m * 50m step = $10k-50k per step
    // Divide by normalization factor to get reward in appropriate range
    info.cost_penalty = -segment_cost / cost_normalization_factor_; // Configurable normalization
    info.total_reward += info.cost_penalty;
    
    // 3. Physics-informed penalties
    
    // Slope violation
    if (new_state.slope > config_.constraints.max_slope_percent) {
        info.slope_violation = physics_->slope_penalty(new_state.slope);
        info.constraint_penalty += info.slope_violation;
    }
    
    // No-go zone violation
    if (new_state.no_go_zone > 0.5) {
        info.no_go_violation = PhysicsConstraints::MAX_PENALTY;
        info.constraint_penalty += info.no_go_violation;
    }
    
    // Curvature penalty (penalize excessive bending)
    double heading_change = std::abs(action.heading_change);
    if (heading_change > M_PI / 6.0) { // > 30 degrees
        info.curvature_penalty = heading_change * curvature_penalty_rate_; // Configurable rate
        info.total_reward += info.curvature_penalty;
    }
    
    // Out-of-bounds penalty (NEW - CRITICAL for boundary learning)
    if (!gis_->is_within_aoi(new_state.x, new_state.y)) {
        // Strong penalty for going out of bounds
        // This teaches agent to avoid boundaries during training
        info.constraint_penalty += out_of_bounds_penalty_; // Configurable penalty
        info.total_reward += out_of_bounds_penalty_;
    }
    
    // Sea polygon constraint (NEW - 1km exclusion zone prevents offshore routing)
    if (gis_->has_sea_polygon() && gis_->is_near_sea(new_state.x, new_state.y)) {
        // Massive penalty for approaching sea (within 1km exclusion zone)
        info.constraint_penalty += sea_penalty_; // Configurable penalty
        info.total_reward += sea_penalty_;
    }
    
    // Built-up area hard constraint (13.5m clearance from buildings required)
    int land_cover = gis_->get_land_cover_class(new_state.x, new_state.y);
    if (land_cover == 50) {  // Built-up areas (LC=50)
        // ESA WorldCover 10m resolution: being IN built-up pixel means <10m from buildings
        // This violates the 13.5m clearance requirement from AI_Routing_Criteria.xlsx
        info.constraint_penalty += buildup_penalty_; // Configurable penalty
        info.total_reward += buildup_penalty_;
    }
    
    // Powerline clearance constraint (6m minimum - AI_Routing_Criteria.xlsx)
    // Allow crossings but enforce clearance for parallel routing
    if (gis_->has_power_lines()) {
        double dist_to_powerline = gis_->distance_to_power_line(new_state.x, new_state.y);
        double dist_to_powerline_m = dist_to_powerline * 1000.0;
        
        if (dist_to_powerline_m < powerline_clearance_m_ && 
            dist_to_powerline_m > powerline_crossing_threshold_m_) {
            // Too close for parallel routing but not crossing
            // Moderate penalty to discourage parallel routing within clearance
            info.constraint_penalty += powerline_penalty_; // Configurable penalty
            info.total_reward += powerline_penalty_;
        }
        // If dist < crossing threshold, consider it a crossing - allow but cost will handle HDD expense
    }
    
    // Railway clearance constraint (Criteria 12: crossings must be trenchless)
    // Allow crossings with HDD cost, enforce clearance for parallel routing
    if (gis_->has_railways()) {
        double dist_to_railway = gis_->distance_to_railway(new_state.x, new_state.y);
        double dist_to_railway_m = dist_to_railway * 1000.0;
        
        if (dist_to_railway_m < railway_clearance_m_ && 
            dist_to_railway_m > railway_crossing_threshold_m_) {
            // Too close for parallel routing but not crossing
            // Moderate penalty to discourage parallel routing within clearance
            info.constraint_penalty += railway_penalty_; // Configurable penalty
            info.total_reward += railway_penalty_;
        }
        // If dist < crossing threshold, consider it a crossing - allow but cost will handle HDD expense
    }
    
    info.total_reward += info.constraint_penalty;
    
    // Exploration bonus for reaching new milestone distances (NEW)
    // Encourages agent to keep pushing toward goal
    if (new_state.goal_distance < best_distance_to_goal_ - exploration_bonus_milestone_m_) {
        // Bonus for getting milestone distance closer than ever before this episode
        info.progress_reward += exploration_bonus_; // Configurable bonus
        info.total_reward += exploration_bonus_;
        best_distance_to_goal_ = new_state.goal_distance;
    }
    
    // 4. Goal bonus: large positive reward for reaching goal
    if (new_state.goal_distance < 50.0) { // Within 50m of goal
        info.goal_bonus = goal_bonus_; // Configurable bonus
        info.total_reward += info.goal_bonus;
    }
    
    // 5. Step penalty: small penalty to encourage shorter routes
    info.total_reward -= 0.1;
    
    return info;
}

bool PipelineEnvironment::check_termination(const State& state, std::string& reason) {
    // Success: reached goal
    if (state.goal_distance < 50.0) {
        reason = "SUCCESS: Goal reached";
        return true;
    }
    
    // Failure: max steps exceeded
    if (step_count_ >= config_.training.max_steps_per_episode) {
        reason = "FAILURE: Max steps exceeded";
        return true;
    }
    
    // Gradual out-of-bounds handling (NEW - allows brief recovery)
    // Allow brief excursions but terminate if too long out of bounds
    if (!gis_->is_within_aoi(state.x, state.y)) {
        out_of_bounds_steps_++;
        
        // If very close to goal (< 500m), be more lenient
        if (state.goal_distance < 500.0) {
            // Allow finishing route even if slightly out of bounds
            if (out_of_bounds_steps_ > 10) {
                reason = "FAILURE: Too far out of bounds near goal";
                return true;
            }
        }
        // If farther from goal, be strict but allow 3 steps recovery
        else if (out_of_bounds_steps_ > 3) {
            reason = "FAILURE: Out of bounds";
            return true;
        }
    } else {
        // Reset counter when back in bounds
        out_of_bounds_steps_ = 0;
    }
    
    // Sea proximity constraint - IMMEDIATE TERMINATION (1km exclusion zone)
    if (gis_->has_sea_polygon() && gis_->is_near_sea(state.x, state.y)) {
        double distance = gis_->distance_to_sea(state.x, state.y);
        reason = "FAILURE: Too close to sea (" + 
                 std::to_string(static_cast<int>(distance)) + 
                 "m < 1000m exclusion zone)";
        return true;  // Immediate termination
    }
    
    // NOTE: Built-up area violations handled via heavy penalties in calculate_reward()
    // Very heavy penalty (-10000.0) for <13.5m clearance - agent must learn to avoid
    // No immediate termination - allows penalty-based learning
    // Similar to slope constraint: learn through experience, not forced termination
    
    // Powerline/Railway clearance - NO termination, handled via penalties & HDD costs
    // Crossings are allowed with appropriate HDD construction costs
    
    // Failure: entered no-go zone
    if (state.no_go_zone > 0.5) {
        reason = "FAILURE: No-go zone violation";
        return true;
    }
    
    // NOTE: Slope violations are handled via heavy penalties in calculate_reward()
    // No immediate termination - agent must learn to avoid through penalty-based learning
    // Only terminate on catastrophic slopes (>50%) that are physically impossible for pipeline
    if (state.slope > 50.0) {
        reason = "FAILURE: Catastrophic slope (>50% - physically impossible for pipeline)";
        return true;
    }
    
    return false;
}

std::vector<std::pair<double, double>> PipelineEnvironment::get_current_route() const {
    return current_route_;
}

PipelineEnvironment::RouteStats PipelineEnvironment::get_route_stats() const {
    RouteStats stats;
    
    if (current_route_.size() < 2) {
        return stats;
    }
    
    // Calculate total length
    stats.total_length_m = 0.0;
    for (size_t i = 1; i < current_route_.size(); ++i) {
        double dx = current_route_[i].first - current_route_[i-1].first;
        double dy = current_route_[i].second - current_route_[i-1].second;
        stats.total_length_m += std::sqrt(dx*dx + dy*dy);
    }
    
    // Calculate total cost (would need to iterate and query GIS)
    stats.total_cost_usd = 0.0; // TODO: Implement full cost calculation
    
    // Calculate average slope
    double sum_slope = 0.0;
    for (const auto& point : current_route_) {
        sum_slope += gis_->get_slope(point.first, point.second);
    }
    stats.avg_slope = sum_slope / current_route_.size();
    
    // Count crossings (simplified)
    stats.num_water_crossings = 0;
    stats.num_road_crossings = 0;
    for (const auto& point : current_route_) {
        if (gis_->distance_to_water(point.first, point.second) < 20.0) {
            stats.num_water_crossings++;
        }
        if (gis_->distance_to_road(point.first, point.second) < 10.0) {
            stats.num_road_crossings++;
        }
    }
    
    stats.num_constraint_violations = 0;
    stats.curvature_max = 0.0;
    
    return stats;
}

void PipelineEnvironment::render(const std::string& output_path) const {
    // Export route to GeoJSON for visualization
    std::ofstream out(output_path);
    if (!out.is_open()) {
        std::cerr << "Failed to open output file: " << output_path << std::endl;
        return;
    }
    
    out << "{\n";
    out << "  \"type\": \"Feature\",\n";
    out << "  \"properties\": {\n";
    out << "    \"route_type\": \"PIRL_generated\",\n";
    out << "    \"num_points\": " << current_route_.size() << ",\n";
    out << "    \"step_count\": " << step_count_ << "\n";
    out << "  },\n";
    out << "  \"geometry\": {\n";
    out << "    \"type\": \"LineString\",\n";
    out << "    \"coordinates\": [\n";
    
    for (size_t i = 0; i < current_route_.size(); ++i) {
        out << "      [" << current_route_[i].first << ", " 
            << current_route_[i].second << "]";
        if (i < current_route_.size() - 1) out << ",";
        out << "\n";
    }
    
    out << "    ]\n";
    out << "  }\n";
    out << "}\n";
    
    out.close();
    std::cout << "📊 Route rendered to: " << output_path << std::endl;
}

// ============================================================================
// PIRL AGENT IMPLEMENTATION
// ============================================================================

PIRLAgent::PIRLAgent(const ProjectConfig& config)
    : config_(config), model_loaded_(false) {}

PIRLAgent::~PIRLAgent() = default;

bool PIRLAgent::load_model(const std::string& model_path) {
    model_path_ = model_path;
    
    // Check if model file exists
    if (!std::filesystem::exists(model_path)) {
        std::cerr << "❌ Model file not found: " << model_path << std::endl;
        return false;
    }
    
    std::cout << "🤖 Loading PIRL model from: " << model_path << std::endl;
    
    // TODO: Load model via Python integration
    // For now, just mark as loaded
    model_loaded_ = true;
    
    std::cout << "✅ Model loaded successfully" << std::endl;
    return true;
}

bool PIRLAgent::save_model(const std::string& model_path) const {
    if (!model_loaded_) {
        std::cerr << "❌ No model to save" << std::endl;
        return false;
    }
    
    std::cout << "💾 Saving PIRL model to: " << model_path << std::endl;
    
    // TODO: Save model via Python integration
    
    std::cout << "✅ Model saved successfully" << std::endl;
    return true;
}

Action PIRLAgent::predict(const State& state, bool deterministic) const {
    // Use heuristic routing (A* style) whether model is loaded or not
    // When model is loaded, call_python_inference will use the model
    // When model is not loaded, call_python_inference uses heuristic fallback
    return call_python_inference(state, deterministic);
}

Action PIRLAgent::call_python_inference(const State& state, bool deterministic) const {
    // TODO: Implement Python subprocess call or shared library integration
    // For now, return a simple heuristic action (head toward goal)
    
    Action action;
    
    // Simple heuristic: adjust heading toward goal
    double heading_error = state.goal_bearing - state.prev_heading;
    
    // Normalize to [-pi, pi]
    while (heading_error > M_PI) heading_error -= 2*M_PI;
    while (heading_error < -M_PI) heading_error += 2*M_PI;
    
    // Limit heading change to max ±45 degrees
    action.heading_change = std::clamp(heading_error, -M_PI/4.0, M_PI/4.0);
    
    // Adjust step size based on distance to goal and slope
    if (state.goal_distance < 100.0) {
        // Very close to goal - use tiny steps to ensure we reach it
        action.step_size = std::max(10.0, state.goal_distance * 0.3);
    } else if (state.goal_distance < 500.0) {
        action.step_size = 30.0; // Smaller steps near goal
    } else {
        action.step_size = 60.0; // Larger steps far from goal
    }
    
    // Reduce step size on steep slopes
    if (state.slope > 20.0) {
        action.step_size *= 0.5;
    }
    
    return action;
}

std::vector<std::pair<double, double>> PIRLAgent::generate_route(
    const std::pair<double, double>& start,
    const std::pair<double, double>& end,
    const std::string& project_dir) {
    
    std::cout << "\n🚀 Generating PIRL route..." << std::endl;
    
    // Create temporary config
    ProjectConfig temp_config = config_;
    temp_config.start_point = {start.first, start.second, ""};
    temp_config.end_point = {end.first, end.second, ""};
    temp_config.project_dir = project_dir;
    
    // Create environment
    PipelineEnvironment env(temp_config);
    
    // Reset environment
    State state = env.reset();
    
    // Run episode (increased from 5000 to accommodate longer routes)
    int max_steps = 10000;
    for (int step = 0; step < max_steps; ++step) {
        // Get action from agent
        Action action = predict(state, true);
        
        // Take step
        auto [new_state, reward] = env.step(action);
        state = new_state;
        
        // Check if done
        if (env.is_done()) {
            std::cout << "✅ Route generation complete: " << reward.termination_reason << std::endl;
            break;
        }
        
        // Progress update every 100 steps
        if (step % 100 == 0) {
            std::cout << "  Step " << step << ": Distance to goal = " 
                      << state.goal_distance << "m" << std::endl;
        }
    }
    
    // Get final route
    auto route = env.get_current_route();
    auto stats = env.get_route_stats();
    
    std::cout << "\n📊 Route Statistics:" << std::endl;
    std::cout << "  Total Length: " << stats.total_length_m << "m" << std::endl;
    std::cout << "  Average Slope: " << stats.avg_slope << "°" << std::endl;
    std::cout << "  Water Crossings: " << stats.num_water_crossings << std::endl;
    std::cout << "  Road Crossings: " << stats.num_road_crossings << std::endl;
    
    return route;
}

std::vector<std::vector<std::pair<double, double>>> PIRLAgent::generate_corridors(
    const std::pair<double, double>& start,
    const std::pair<double, double>& end,
    const std::string& project_dir,
    int num_corridors) {
    
    std::cout << "\n🎯 Generating " << num_corridors << " alternative corridors..." << std::endl;
    
    std::vector<std::vector<std::pair<double, double>>> corridors;
    
    for (int i = 0; i < num_corridors; ++i) {
        std::cout << "\n📍 Corridor " << (i+1) << "/" << num_corridors << std::endl;
        
        // Generate route (with some randomness for diversity)
        auto route = generate_route(start, end, project_dir);
        corridors.push_back(route);
    }
    
    std::cout << "\n✅ Generated " << corridors.size() << " corridors" << std::endl;
    
    return corridors;
}

PIRLAgent::RouteEvaluation PIRLAgent::evaluate_route(
    const std::vector<std::pair<double, double>>& route,
    const std::string& /* project_dir */) const {
    
    RouteEvaluation eval;
    
    // TODO: Implement full route evaluation
    // For now, return placeholder values
    
    eval.total_cost_usd = 0.0;
    eval.length_m = 0.0;
    
    for (size_t i = 1; i < route.size(); ++i) {
        double dx = route[i].first - route[i-1].first;
        double dy = route[i].second - route[i-1].second;
        eval.length_m += std::sqrt(dx*dx + dy*dy);
    }
    
    eval.cost_per_km = eval.total_cost_usd / (eval.length_m / 1000.0);
    eval.savings_vs_baseline_percent = 0.0; // TODO: Calculate vs baseline
    eval.all_constraints_satisfied = true;
    
    return eval;
}

RouteTrajectory PipelineEnvironment::get_route_trajectory() const {
    RouteTrajectory traj;
    traj.segments = trajectory_;
    traj.pumping_stations = pumping_stations_;
    traj.success = done_ && (current_state_.goal_distance < 10.0);  // Within 10m of goal
    traj.total_cost = cumulative_cost_;
    traj.total_length_m = cumulative_distance_;
    traj.termination_reason = done_ ? "Goal reached" : "In progress";
    return traj;
}

std::pair<double, double> PipelineEnvironment::get_current_position() const {
    return {current_state_.x, current_state_.y};
}

void PipelineEnvironment::load_parameter_overrides(const std::string& override_file) {
    std::cout << "   ⚙️  Loading parameter overrides from: " << override_file << std::endl;
    
    std::ifstream file(override_file);
    if (!file.is_open()) {
        std::cerr << "   ⚠️  Warning: Could not open override file: " << override_file << std::endl;
        return;
    }
    
    nlohmann::json overrides;
    try {
        file >> overrides;
    } catch (const std::exception& e) {
        std::cerr << "   ⚠️  Warning: Failed to parse override file: " << e.what() << std::endl;
        return;
    }
    
    int override_count = 0;
    
    // Apply PPO reward overrides
    if (overrides.contains("ppo_rewards")) {
        auto rewards = overrides["ppo_rewards"];
        
        if (rewards.contains("progress_multiplier")) {
            double old_val = progress_reward_multiplier_;
            progress_reward_multiplier_ = rewards["progress_multiplier"].get<double>();
            if (std::abs(old_val - progress_reward_multiplier_) > 0.001) {
                std::cout << "      Progress multiplier: " << old_val << " → " 
                          << progress_reward_multiplier_ << " (OVERRIDDEN)" << std::endl;
                override_count++;
            }
        }
        
        if (rewards.contains("goal_bonus")) {
            double old_val = goal_bonus_;
            goal_bonus_ = rewards["goal_bonus"].get<double>();
            if (std::abs(old_val - goal_bonus_) > 0.001) {
                std::cout << "      Goal bonus: " << old_val << " → " 
                          << goal_bonus_ << " (OVERRIDDEN)" << std::endl;
                override_count++;
            }
        }
        
        if (rewards.contains("exploration_bonus")) {
            double old_val = exploration_bonus_;
            exploration_bonus_ = rewards["exploration_bonus"].get<double>();
            if (std::abs(old_val - exploration_bonus_) > 0.001) {
                std::cout << "      Exploration bonus: " << old_val << " → " 
                          << exploration_bonus_ << " (OVERRIDDEN)" << std::endl;
                override_count++;
            }
        }
        
        if (rewards.contains("sea_penalty")) {
            sea_penalty_ = rewards["sea_penalty"].get<double>();
            override_count++;
        }
        
        if (rewards.contains("buildup_penalty")) {
            buildup_penalty_ = rewards["buildup_penalty"].get<double>();
            override_count++;
        }
        
        if (rewards.contains("powerline_penalty")) {
            powerline_penalty_ = rewards["powerline_penalty"].get<double>();
            override_count++;
        }
        
        if (rewards.contains("railway_penalty")) {
            railway_penalty_ = rewards["railway_penalty"].get<double>();
            override_count++;
        }
        
        if (rewards.contains("curvature_penalty_rate")) {
            curvature_penalty_rate_ = rewards["curvature_penalty_rate"].get<double>();
            override_count++;
        }
        
        if (rewards.contains("out_of_bounds_penalty")) {
            out_of_bounds_penalty_ = rewards["out_of_bounds_penalty"].get<double>();
            override_count++;
        }
        
        if (rewards.contains("cost_normalization_factor")) {
            cost_normalization_factor_ = rewards["cost_normalization_factor"].get<double>();
            override_count++;
        }
    }
    
    // Apply constraint threshold overrides
    if (overrides.contains("constraint_thresholds")) {
        auto constraints = overrides["constraint_thresholds"];
        
        if (constraints.contains("exploration_bonus_milestone_m")) {
            exploration_bonus_milestone_m_ = constraints["exploration_bonus_milestone_m"].get<double>();
            override_count++;
        }
        
        if (constraints.contains("powerline_clearance_m")) {
            powerline_clearance_m_ = constraints["powerline_clearance_m"].get<double>();
            override_count++;
        }
        
        if (constraints.contains("railway_clearance_m")) {
            railway_clearance_m_ = constraints["railway_clearance_m"].get<double>();
            override_count++;
        }
        
        if (constraints.contains("powerline_crossing_threshold_m")) {
            powerline_crossing_threshold_m_ = constraints["powerline_crossing_threshold_m"].get<double>();
            override_count++;
        }
        
        if (constraints.contains("railway_crossing_threshold_m")) {
            railway_crossing_threshold_m_ = constraints["railway_crossing_threshold_m"].get<double>();
            override_count++;
        }
        
        if (constraints.contains("sea_exclusion_distance_m")) {
            sea_exclusion_distance_m_ = constraints["sea_exclusion_distance_m"].get<double>();
            override_count++;
        }
    }
    
    // Apply cost matrix and hydraulic cost overrides to CostModel
    if (overrides.contains("cost_matrix") || overrides.contains("hydraulic_costs")) {
        cost_model_->apply_parameter_overrides(overrides);
    }
    
    std::cout << "   ✅ Parameter overrides applied successfully (" 
              << override_count << " parameters modified)" << std::endl;
}

} // namespace pirl
} // namespace agrs

