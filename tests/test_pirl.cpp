#include <catch2/catch_test_macros.hpp>
#include "agrs_zeus/PIRL.h"
#include <fstream>
#include <filesystem>

using namespace agrs::pirl;

// ============================================================================
// TEST FIXTURES
// ============================================================================

class PIRLTestFixture {
protected:
    std::string test_project_dir;
    
    void SetUp() {
        // Create temporary test project directory
        test_project_dir = "/tmp/pirl_test_project";
        std::filesystem::create_directories(test_project_dir + "/data/rasters");
        std::filesystem::create_directories(test_project_dir + "/data/vectors");
        std::filesystem::create_directories(test_project_dir + "/outputs");
        
        // Create minimal test configuration
        ProjectConfig config;
        config.project_name = "Test_Project";
        config.project_code = "TEST_001";
        config.client_name = "Test Client";
        config.epsg_code = 32633;
        config.measurement_units = "SI";
        config.start_point = {350000.0, 4750000.0, ""};
        config.end_point = {355000.0, 4755000.0, ""};
        config.project_dir = test_project_dir;
        config.save_to_yaml(test_project_dir + "/config.yaml");
    }
    
    void TearDown() {
        // Clean up test directory
        std::filesystem::remove_all(test_project_dir);
    }
};

// ============================================================================
// STATE TESTS
// ============================================================================

TEST_CASE("State representation", "[pirl][state]") {
    State state;
    state.x = 350000.0;
    state.y = 4750000.0;
    state.goal_distance = 7071.0; // ~7km diagonal
    state.goal_bearing = M_PI / 4.0; // 45 degrees
    state.elevation = 100.0;
    state.slope = 15.0;
    state.aspect = M_PI / 2.0;
    state.curvature = 0.001;
    state.no_go_zone = 0.0;
    state.water_proximity = 500.0;
    state.road_proximity = 200.0;
    state.prev_heading = M_PI / 4.0;
    
    SECTION("State to vector conversion") {
        auto vec = state.to_vector();
        REQUIRE(vec.size() == State::dimension());
        REQUIRE(vec[0] == static_cast<float>(state.x));
        REQUIRE(vec[1] == static_cast<float>(state.y));
        REQUIRE(vec[2] == static_cast<float>(state.goal_distance));
    }
    
    SECTION("State dimension is correct") {
        REQUIRE(State::dimension() == 12);
    }
}

// ============================================================================
// ACTION TESTS
// ============================================================================

TEST_CASE("Action representation", "[pirl][action]") {
    SECTION("Action from vector") {
        std::vector<float> vec = {0.5f, 0.8f}; // Normalized [-1, 1]
        Action action = Action::from_vector(vec);
        
        // Heading change should be scaled to ±π/4
        REQUIRE(action.heading_change >= -M_PI / 4.0);
        REQUIRE(action.heading_change <= M_PI / 4.0);
        
        // Step size should be in [10, 100]m
        REQUIRE(action.step_size >= 10.0);
        REQUIRE(action.step_size <= 100.0);
    }
    
    SECTION("Action to vector conversion") {
        Action action;
        action.heading_change = M_PI / 8.0;
        action.step_size = 50.0;
        
        auto vec = action.to_vector();
        REQUIRE(vec.size() == Action::dimension());
        REQUIRE(vec[0] == static_cast<float>(action.heading_change));
        REQUIRE(vec[1] == static_cast<float>(action.step_size));
    }
    
    SECTION("Action dimension is correct") {
        REQUIRE(Action::dimension() == 2);
    }
}

// ============================================================================
// PROJECT CONFIG TESTS
// ============================================================================

TEST_CASE("ProjectConfig YAML I/O", "[pirl][config]") {
    std::string test_yaml = "/tmp/test_pirl_config.yaml";
    
    SECTION("Save configuration") {
        ProjectConfig config;
        config.project_name = "Test Project";
        config.project_code = "TEST_001";
        config.client_name = "Test Client";
        config.epsg_code = 32633;
        config.measurement_units = "SI";
        config.start_point = {350000.0, 4750000.0, ""};
        config.end_point = {355000.0, 4755000.0, ""};
        config.constraints.max_slope_percent = 30.0;
        config.training.learning_rate = 0.0003;
        
        config.save_to_yaml(test_yaml);
        
        REQUIRE(std::filesystem::exists(test_yaml));
    }
    
    SECTION("Load configuration") {
        // First save a config
        ProjectConfig config1;
        config1.project_name = "Load Test";
        config1.epsg_code = 32633;
        config1.start_point = {100.0, 200.0, ""};
        config1.save_to_yaml(test_yaml);
        
        // Then load it
        ProjectConfig config2 = ProjectConfig::load_from_yaml(test_yaml);
        
        REQUIRE(config2.project_name == "Load Test");
        REQUIRE(config2.epsg_code == 32633);
        REQUIRE(config2.start_point.x == 100.0);
        REQUIRE(config2.start_point.y == 200.0);
    }
    
    // Cleanup
    std::filesystem::remove(test_yaml);
}

// ============================================================================
// COST MODEL TESTS
// ============================================================================

TEST_CASE("CostModel calculations", "[pirl][cost]") {
    ProjectConfig config;
    config.epsg_code = 32633;
    
    CostModel cost_model(config);
    
    SECTION("Terrain cost varies with slope") {
        // Flat terrain should be cheaper than steep
        double flat_cost = cost_model.terrain_cost(5.0, 30); // 5° slope, grassland
        double steep_cost = cost_model.terrain_cost(35.0, 30); // 35° slope, grassland
        
        REQUIRE(steep_cost > flat_cost);
        REQUIRE(flat_cost > 0.0);
    }
    
    SECTION("Land cover affects cost") {
        // Grassland should be cheaper than forest
        double grassland_cost = cost_model.terrain_cost(10.0, 30); // ESA class 30
        double forest_cost = cost_model.terrain_cost(10.0, 10);    // ESA class 10
        
        REQUIRE(forest_cost > grassland_cost);
    }
    
    SECTION("Water crossing costs") {
        double small_crossing = cost_model.water_crossing_cost(20.0, 1.0);
        double large_crossing = cost_model.water_crossing_cost(100.0, 3.0);
        
        REQUIRE(large_crossing > small_crossing);
        REQUIRE(small_crossing > 0.0);
    }
    
    SECTION("Road crossing costs") {
        double minor_road = cost_model.road_crossing_cost("minor_road");
        double major_road = cost_model.road_crossing_cost("major_road");
        
        REQUIRE(major_road > minor_road);
        REQUIRE(minor_road == 10000.0); // Expected value
    }
    
    SECTION("Railway crossing cost") {
        double railway_cost = cost_model.railway_crossing_cost();
        REQUIRE(railway_cost == 50000.0); // Expected value
    }
}

// ============================================================================
// PHYSICS CONSTRAINTS TESTS
// ============================================================================

TEST_CASE("PhysicsConstraints validation", "[pirl][physics]") {
    ProjectConfig config;
    config.constraints.max_slope_percent = 30.0;
    config.constraints.max_curvature_rad_per_m = 0.01;
    config.constraints.min_crossing_angle_deg = 45.0;
    
    PhysicsConstraints physics(config);
    
    SECTION("Slope limit check") {
        REQUIRE(physics.check_slope_limit(25.0) == true);  // Within limit
        REQUIRE(physics.check_slope_limit(35.0) == false); // Exceeds limit
    }
    
    SECTION("Curvature limit check") {
        REQUIRE(physics.check_curvature_limit(0.005) == true);  // Within limit
        REQUIRE(physics.check_curvature_limit(0.02) == false);  // Exceeds limit
    }
    
    SECTION("Crossing angle check") {
        REQUIRE(physics.check_crossing_angle(50.0, "road") == true);  // Good angle
        REQUIRE(physics.check_crossing_angle(30.0, "road") == false); // Too acute
    }
    
    SECTION("Slope penalty calculation") {
        double penalty_within = physics.slope_penalty(25.0);
        double penalty_exceed = physics.slope_penalty(35.0);
        
        REQUIRE(penalty_within == 0.0);
        REQUIRE(penalty_exceed < 0.0);
    }
}

// ============================================================================
// PIPELINE ENVIRONMENT TESTS
// ============================================================================

TEST_CASE("PipelineEnvironment functionality", "[pirl][environment]") {
    ProjectConfig config;
    config.project_name = "Env Test";
    config.epsg_code = 32633;
    config.start_point = {350000.0, 4750000.0, ""};
    config.end_point = {355000.0, 4755000.0, ""};
    config.project_dir = "/tmp/pirl_env_test";
    config.training.max_steps_per_episode = 100;
    
    // Create minimal test environment
    std::filesystem::create_directories(config.project_dir + "/data/rasters");
    
    SECTION("Environment reset") {
        PipelineEnvironment env(config);
        State initial_state = env.reset();
        
        REQUIRE(initial_state.x == config.start_point.x);
        REQUIRE(initial_state.y == config.start_point.y);
        REQUIRE(initial_state.goal_distance > 0.0);
        REQUIRE(env.is_done() == false);
    }
    
    SECTION("Environment step") {
        PipelineEnvironment env(config);
        env.reset();
        
        Action action;
        action.heading_change = 0.0; // Straight ahead
        action.step_size = 50.0;
        
        auto [new_state, reward_info] = env.step(action);
        
        REQUIRE(new_state.x != config.start_point.x); // Position changed
        REQUIRE(reward_info.total_reward != 0.0);     // Reward calculated
    }
    
    SECTION("Route tracking") {
        PipelineEnvironment env(config);
        env.reset();
        
        for (int i = 0; i < 5; ++i) {
            Action action;
            action.heading_change = 0.0;
            action.step_size = 50.0;
            env.step(action);
        }
        
        auto route = env.get_current_route();
        REQUIRE(route.size() == 6); // Initial + 5 steps
    }
    
    // Cleanup
    std::filesystem::remove_all(config.project_dir);
}

// ============================================================================
// PIRL AGENT TESTS
// ============================================================================

TEST_CASE("PIRLAgent basic functionality", "[pirl][agent]") {
    ProjectConfig config;
    config.project_name = "Agent Test";
    config.epsg_code = 32633;
    config.start_point = {350000.0, 4750000.0, ""};
    config.end_point = {355000.0, 4755000.0, ""};
    
    PIRLAgent agent(config);
    
    SECTION("Agent predict") {
        State state;
        state.x = 350000.0;
        state.y = 4750000.0;
        state.goal_distance = 7071.0;
        state.goal_bearing = M_PI / 4.0;
        state.slope = 10.0;
        state.prev_heading = 0.0;
        
        Action action = agent.predict(state, true);
        
        // Action should be valid
        REQUIRE(action.heading_change >= -M_PI / 4.0);
        REQUIRE(action.heading_change <= M_PI / 4.0);
        REQUIRE(action.step_size >= 10.0);
        REQUIRE(action.step_size <= 100.0);
    }
    
    SECTION("Model save/load") {
        std::string model_path = "/tmp/test_pirl_model.zip";
        
        // Save (should fail - no model trained)
        bool save_result = agent.save_model(model_path);
        REQUIRE(save_result == false);
        
        // Load (should fail - file doesn't exist)
        bool load_result = agent.load_model(model_path);
        REQUIRE(load_result == false);
    }
}

// ============================================================================
// TRAINING UTILITIES TESTS
// ============================================================================

TEST_CASE("Training scenario generation", "[pirl][training]") {
    std::string base_config = "/tmp/base_config.yaml";
    
    // Create base config
    ProjectConfig config;
    config.project_name = "Base";
    config.epsg_code = 32633;
    config.start_point = {350000.0, 4750000.0, ""};
    config.end_point = {355000.0, 4755000.0, ""};
    config.save_to_yaml(base_config);
    
    SECTION("Generate training scenarios") {
        auto scenarios = training::generate_training_scenarios(
            base_config, 
            5,  // num_easy
            5,  // num_medium
            5   // num_hard
        );
        
        REQUIRE(scenarios.size() == 15);
        
        // Easy scenarios should have short distances
        REQUIRE(scenarios[0].project_name.find("easy") != std::string::npos);
        
        // Hard scenarios should have longer distances
        REQUIRE(scenarios[14].project_name.find("hard") != std::string::npos);
    }
    
    // Cleanup
    std::filesystem::remove(base_config);
}

// ============================================================================
// EXPORT UTILITIES TESTS
// ============================================================================

TEST_CASE("Export utilities", "[pirl][export]") {
    std::vector<std::pair<double, double>> test_route = {
        {350000.0, 4750000.0},
        {350100.0, 4750100.0},
        {350200.0, 4750200.0}
    };
    
    SECTION("Export to GeoJSON") {
        std::string output = "/tmp/test_route.geojson";
        export_utils::export_to_geojson(test_route, output, 32633);
        
        REQUIRE(std::filesystem::exists(output));
        
        // Read and check basic structure
        std::ifstream file(output);
        std::string content((std::istreambuf_iterator<char>(file)),
                          std::istreambuf_iterator<char>());
        
        REQUIRE(content.find("\"type\": \"Feature\"") != std::string::npos);
        REQUIRE(content.find("\"LineString\"") != std::string::npos);
        REQUIRE(content.find("EPSG:32633") != std::string::npos);
        
        std::filesystem::remove(output);
    }
    
    SECTION("Export to Shapefile") {
        std::string output = "/tmp/test_route.shp";
        export_utils::export_to_shapefile(test_route, output, 32633);
        
        REQUIRE(std::filesystem::exists(output));
        
        std::filesystem::remove(output);
        std::filesystem::remove("/tmp/test_route.shx");
        std::filesystem::remove("/tmp/test_route.dbf");
        std::filesystem::remove("/tmp/test_route.prj");
    }
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

TEST_CASE("End-to-end route generation", "[pirl][integration]") {
    // Create test project
    std::string project_dir = "/tmp/pirl_integration_test";
    std::filesystem::create_directories(project_dir + "/data/rasters");
    std::filesystem::create_directories(project_dir + "/outputs");
    
    ProjectConfig config;
    config.project_name = "Integration Test";
    config.project_code = "INT_001";
    config.epsg_code = 32633;
    config.start_point = {350000.0, 4750000.0, ""};
    config.end_point = {351000.0, 4751000.0, ""}; // 1.4km diagonal
    config.project_dir = project_dir;
    config.training.max_steps_per_episode = 50;
    
    SECTION("Generate route without model") {
        PIRLAgent agent(config);
        
        auto route = agent.generate_route(
            {config.start_point.x, config.start_point.y},
            {config.end_point.x, config.end_point.y},
            project_dir
        );
        
        // Route should have been generated (heuristic mode)
        REQUIRE(route.size() > 0);
        
        // First point should be start
        REQUIRE(route[0].first == config.start_point.x);
        REQUIRE(route[0].second == config.start_point.y);
    }
    
    // Cleanup
    std::filesystem::remove_all(project_dir);
}

// ============================================================================
// PERFORMANCE BENCHMARKS
// ============================================================================

TEST_CASE("Performance benchmarks", "[pirl][benchmark]") {
    ProjectConfig config;
    config.project_name = "Benchmark";
    config.epsg_code = 32633;
    config.start_point = {350000.0, 4750000.0, ""};
    config.end_point = {355000.0, 4755000.0, ""};
    config.project_dir = "/tmp/pirl_benchmark";
    
    std::filesystem::create_directories(config.project_dir + "/data/rasters");
    
    SECTION("State conversion performance") {
        State state;
        state.x = 350000.0;
        state.y = 4750000.0;
        state.goal_distance = 7071.0;
        
        auto start = std::chrono::high_resolution_clock::now();
        
        for (int i = 0; i < 10000; ++i) {
            auto vec = state.to_vector();
        }
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
        
        // Should be very fast (< 1ms for 10k conversions)
        REQUIRE(duration.count() < 1000);
    }
    
    // Cleanup
    std::filesystem::remove_all(config.project_dir);
}



