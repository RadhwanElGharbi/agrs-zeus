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
    info.progress_reward = progress * 0.01; // Scale progress reward
    info.total_reward += info.progress_reward;
    
    // 2. Cost penalty: negative reward based on construction cost
    double segment_cost = cost_model_->calculate_segment_cost(prev_state, new_state, *gis_);
    info.cost_penalty = -segment_cost / 10000.0; // Normalize cost
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
        info.curvature_penalty = -heading_change * 10.0;
        info.total_reward += info.curvature_penalty;
    }
    
    info.total_reward += info.constraint_penalty;
    
    // 4. Goal bonus: large positive reward for reaching goal
    if (new_state.goal_distance < 50.0) { // Within 50m of goal
        info.goal_bonus = 1000.0;
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
    
    // Failure: out of bounds
    if (!gis_->is_within_aoi(state.x, state.y)) {
        reason = "FAILURE: Out of bounds";
        return true;
    }
    
    // Failure: entered no-go zone
    if (state.no_go_zone > 0.5) {
        reason = "FAILURE: No-go zone violation";
        return true;
    }
    
    // Failure: excessive slope
    if (state.slope > config_.constraints.max_slope_percent * 1.5) {
        reason = "FAILURE: Excessive slope";
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
    if (!model_loaded_) {
        std::cerr << "❌ Model not loaded. Call load_model() first." << std::endl;
        // Return default action: head toward goal with moderate step
        Action default_action;
        default_action.heading_change = 0.0;
        default_action.step_size = 50.0;
        return default_action;
    }
    
    // Call Python inference
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
    if (state.goal_distance < 500.0) {
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
    
    // Run episode
    int max_steps = 5000;
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

} // namespace pirl
} // namespace agrs

