/**
 * @file pirl_native_bindings.cpp
 * @brief Python bindings for C++ PIRL environment using pybind11
 * 
 * This module exposes the C++ PipelineEnvironment to Python, enabling
 * the trained PPO model to interact directly with the GIS-enabled
 * C++ environment without subprocess overhead.
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>
#include <pybind11/functional.h>

#include "agrs_zeus/PIRL.h"

namespace py = pybind11;

// Helper to convert State to numpy array for Python
py::array_t<float> state_to_numpy(const agrs::pirl::State& state) {
    std::vector<float> vec = state.to_vector();
    return py::array_t<float>(vec.size(), vec.data());
}

// Helper to convert numpy array to Action
agrs::pirl::Action numpy_to_action(py::array_t<float> action_array) {
    auto buf = action_array.request();
    if (buf.size != 2) {
        throw std::runtime_error("Action array must have size 2");
    }
    float* ptr = static_cast<float*>(buf.ptr);
    std::vector<float> action_vec{ptr[0], ptr[1]};
    return agrs::pirl::Action::from_vector(action_vec);
}

PYBIND11_MODULE(pirl_native, m) {
    m.doc() = "Native C++ PIRL environment for optimal pipeline routing";

    // ========================================================================
    // ProjectConfig::Point binding
    // ========================================================================
    py::class_<agrs::pirl::ProjectConfig::Point>(m, "Point")
        .def(py::init<>())
        .def_readwrite("x", &agrs::pirl::ProjectConfig::Point::x)
        .def_readwrite("y", &agrs::pirl::ProjectConfig::Point::y)
        .def_readwrite("crs", &agrs::pirl::ProjectConfig::Point::crs);

    // ========================================================================
    // ProjectConfig binding
    // ========================================================================
    py::class_<agrs::pirl::ProjectConfig>(m, "ProjectConfig")
        .def(py::init<>())
        .def_readwrite("project_name", &agrs::pirl::ProjectConfig::project_name)
        .def_readwrite("project_code", &agrs::pirl::ProjectConfig::project_code)
        .def_readwrite("client_name", &agrs::pirl::ProjectConfig::client_name)
        .def_readwrite("epsg_code", &agrs::pirl::ProjectConfig::epsg_code)
        .def_readwrite("start_point", &agrs::pirl::ProjectConfig::start_point)
        .def_readwrite("end_point", &agrs::pirl::ProjectConfig::end_point)
        .def_static("load_from_yaml", &agrs::pirl::ProjectConfig::load_from_yaml,
                    py::arg("yaml_path"),
                    "Load project configuration from YAML file");

    // ========================================================================
    // State binding
    // ========================================================================
    py::class_<agrs::pirl::State>(m, "State")
        .def(py::init<>())
        .def_readwrite("x", &agrs::pirl::State::x)
        .def_readwrite("y", &agrs::pirl::State::y)
        .def_readwrite("goal_distance", &agrs::pirl::State::goal_distance)
        .def_readwrite("goal_bearing", &agrs::pirl::State::goal_bearing)
        .def_readwrite("elevation", &agrs::pirl::State::elevation)
        .def_readwrite("slope", &agrs::pirl::State::slope)
        .def_readwrite("aspect", &agrs::pirl::State::aspect)
        .def_readwrite("curvature", &agrs::pirl::State::curvature)
        .def_readwrite("no_go_zone", &agrs::pirl::State::no_go_zone)
        .def_readwrite("water_proximity", &agrs::pirl::State::water_proximity)
        .def_readwrite("road_proximity", &agrs::pirl::State::road_proximity)
        .def_readwrite("geohazard_risk", &agrs::pirl::State::geohazard_risk)
        .def_readwrite("soil_capacity", &agrs::pirl::State::soil_capacity)
        .def_readwrite("cadastre_complex", &agrs::pirl::State::cadastre_complex)
        .def_readwrite("population_density", &agrs::pirl::State::population_density)
        .def_readwrite("railway_proximity", &agrs::pirl::State::railway_proximity)
        .def_readwrite("prev_heading", &agrs::pirl::State::prev_heading)
        .def_readwrite("prev_step_size", &agrs::pirl::State::prev_step_size)
        .def("to_vector", &agrs::pirl::State::to_vector,
             "Convert state to vector for neural network input")
        .def("to_numpy", &state_to_numpy,
             "Convert state to numpy array for neural network input")
        .def_static("dimension", &agrs::pirl::State::dimension,
                    "Get state space dimension (17)");

    // ========================================================================
    // Action binding
    // ========================================================================
    py::class_<agrs::pirl::Action>(m, "Action")
        .def(py::init<>())
        .def_readwrite("heading_change", &agrs::pirl::Action::heading_change)
        .def_readwrite("step_size", &agrs::pirl::Action::step_size)
        .def_static("from_vector", &agrs::pirl::Action::from_vector,
                    py::arg("action_vec"),
                    "Create action from neural network output vector")
        .def_static("from_numpy", &numpy_to_action,
                    py::arg("action_array"),
                    "Create action from numpy array")
        .def("to_vector", &agrs::pirl::Action::to_vector,
             "Convert action to vector")
        .def_static("dimension", &agrs::pirl::Action::dimension,
                    "Get action space dimension (2)");

    // ========================================================================
    // RewardInfo binding
    // ========================================================================
    py::class_<agrs::pirl::RewardInfo>(m, "RewardInfo")
        .def(py::init<>())
        .def_readwrite("total_reward", &agrs::pirl::RewardInfo::total_reward)
        .def_readwrite("progress_reward", &agrs::pirl::RewardInfo::progress_reward)
        .def_readwrite("cost_penalty", &agrs::pirl::RewardInfo::cost_penalty)
        .def_readwrite("constraint_penalty", &agrs::pirl::RewardInfo::constraint_penalty)
        .def_readwrite("curvature_penalty", &agrs::pirl::RewardInfo::curvature_penalty)
        .def_readwrite("goal_bonus", &agrs::pirl::RewardInfo::goal_bonus)
        .def_readwrite("slope_violation", &agrs::pirl::RewardInfo::slope_violation)
        .def_readwrite("no_go_violation", &agrs::pirl::RewardInfo::no_go_violation)
        .def_readwrite("crossing_violation", &agrs::pirl::RewardInfo::crossing_violation)
        .def_readwrite("termination_reason", &agrs::pirl::RewardInfo::termination_reason);

    // ========================================================================
    // RouteStats binding
    // ========================================================================
    py::class_<agrs::pirl::PipelineEnvironment::RouteStats>(m, "RouteStats")
        .def(py::init<>())
        .def_readwrite("total_length_m", &agrs::pirl::PipelineEnvironment::RouteStats::total_length_m)
        .def_readwrite("total_cost_usd", &agrs::pirl::PipelineEnvironment::RouteStats::total_cost_usd)
        .def_readwrite("avg_slope", &agrs::pirl::PipelineEnvironment::RouteStats::avg_slope)
        .def_readwrite("num_water_crossings", &agrs::pirl::PipelineEnvironment::RouteStats::num_water_crossings)
        .def_readwrite("num_road_crossings", &agrs::pirl::PipelineEnvironment::RouteStats::num_road_crossings)
        .def_readwrite("num_constraint_violations", &agrs::pirl::PipelineEnvironment::RouteStats::num_constraint_violations)
        .def_readwrite("curvature_max", &agrs::pirl::PipelineEnvironment::RouteStats::curvature_max);

    // ========================================================================
    // PipelineEnvironment binding (THE MAIN CLASS!)
    // ========================================================================
    py::class_<agrs::pirl::PipelineEnvironment>(m, "PipelineEnvironment")
        .def(py::init<const agrs::pirl::ProjectConfig&>(),
             py::arg("config"),
             "Create a new PIRL environment with the given configuration")
        
        // Gymnasium interface
        .def("reset", &agrs::pirl::PipelineEnvironment::reset,
             "Reset the environment to initial state and return initial observation")
        
        .def("step", [](agrs::pirl::PipelineEnvironment& self, py::array_t<float> action_array) {
            // Convert numpy action to C++ Action
            agrs::pirl::Action action = numpy_to_action(action_array);
            
            // Step the environment
            auto [new_state, reward_info] = self.step(action);
            
            // Convert state to numpy
            py::array_t<float> state_np = state_to_numpy(new_state);
            
            // Return (observation, reward, terminated, truncated, info)
            bool done = self.is_done();
            py::dict info;
            info["reward_info"] = reward_info;
            info["termination_reason"] = reward_info.termination_reason;
            
            return py::make_tuple(state_np, reward_info.total_reward, done, false, info);
        }, py::arg("action"),
           "Execute action and return (observation, reward, terminated, truncated, info)")
        
        .def("is_done", &agrs::pirl::PipelineEnvironment::is_done,
             "Check if episode has terminated")
        
        // Route access
        .def("get_current_route", &agrs::pirl::PipelineEnvironment::get_current_route,
             "Get the current route trajectory as list of (x, y) coordinate pairs")
        
        .def("get_route_stats", &agrs::pirl::PipelineEnvironment::get_route_stats,
             "Get statistics about the current route (length, cost, violations, etc.)")
        
        // Visualization
        .def("render", &agrs::pirl::PipelineEnvironment::render,
             py::arg("output_path"),
             "Render the current route to a GeoJSON file");

    // ========================================================================
    // Module-level convenience functions
    // ========================================================================
    
    m.def("load_config", &agrs::pirl::ProjectConfig::load_from_yaml,
          py::arg("yaml_path"),
          "Load project configuration from YAML file");
    
    m.def("create_environment", 
          [](const std::string& config_path) {
              agrs::pirl::ProjectConfig config = agrs::pirl::ProjectConfig::load_from_yaml(config_path);
              return agrs::pirl::PipelineEnvironment(config);
          },
          py::arg("config_path"),
          "Convenience function to create environment from YAML path");
}


