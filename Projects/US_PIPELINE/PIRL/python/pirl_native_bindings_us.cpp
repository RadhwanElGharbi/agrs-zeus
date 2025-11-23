#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>
#include "../include/PIRL_US.h"

namespace py = pybind11;

PYBIND11_MODULE(pirl_native_us, m) {
    m.doc() = "US_PIPELINE PIRL Native C++ Bindings (Simplified 7D State Space)";

    // State class
    py::class_<agrs::pirl_us::State>(m, "State")
        .def(py::init<>())
        .def_readwrite("x", &agrs::pirl_us::State::x)
        .def_readwrite("y", &agrs::pirl_us::State::y)
        .def_readwrite("goal_distance", &agrs::pirl_us::State::goal_distance)
        .def_readwrite("goal_bearing", &agrs::pirl_us::State::goal_bearing)
        .def_readwrite("slope", &agrs::pirl_us::State::slope)
        .def_readwrite("distance_to_boundary", &agrs::pirl_us::State::distance_to_boundary)
        .def_readwrite("prev_heading", &agrs::pirl_us::State::prev_heading)
        .def("to_vector", &agrs::pirl_us::State::to_vector,
             "Convert state to 7D vector for neural network")
        .def_static("dimension", &agrs::pirl_us::State::dimension,
                   "Get state space dimension (7)");

    // Action class
    py::class_<agrs::pirl_us::Action>(m, "Action")
        .def(py::init<>())
        .def_readwrite("heading_change", &agrs::pirl_us::Action::heading_change)
        .def_readwrite("step_size", &agrs::pirl_us::Action::step_size)
        .def("to_vector", &agrs::pirl_us::Action::to_vector)
        .def_static("from_vector", &agrs::pirl_us::Action::from_vector,
                   "Create action from 2D neural network output")
        .def_static("dimension", &agrs::pirl_us::Action::dimension,
                   "Get action space dimension (2)");

    // RewardInfo struct
    py::class_<agrs::pirl_us::RewardInfo>(m, "RewardInfo")
        .def(py::init<>())
        .def_readonly("total_reward", &agrs::pirl_us::RewardInfo::total_reward)
        .def_readonly("progress_reward", &agrs::pirl_us::RewardInfo::progress_reward)
        .def_readonly("slope_violation", &agrs::pirl_us::RewardInfo::slope_violation)
        .def_readonly("constraint_penalty", &agrs::pirl_us::RewardInfo::constraint_penalty)
        .def_readonly("curvature_penalty", &agrs::pirl_us::RewardInfo::curvature_penalty)
        .def_readonly("goal_bonus", &agrs::pirl_us::RewardInfo::goal_bonus)
        .def_readonly("termination_reason", &agrs::pirl_us::RewardInfo::termination_reason);

    // RouteSegment struct
    py::class_<agrs::pirl_us::RouteSegment>(m, "RouteSegment")
        .def(py::init<>())
        .def_readonly("start_x", &agrs::pirl_us::RouteSegment::start_x)
        .def_readonly("start_y", &agrs::pirl_us::RouteSegment::start_y)
        .def_readonly("end_x", &agrs::pirl_us::RouteSegment::end_x)
        .def_readonly("end_y", &agrs::pirl_us::RouteSegment::end_y)
        .def_readonly("length_m", &agrs::pirl_us::RouteSegment::length_m)
        .def_readonly("segment_id", &agrs::pirl_us::RouteSegment::segment_id)
        .def_readonly("elevation_start", &agrs::pirl_us::RouteSegment::elevation_start)
        .def_readonly("elevation_end", &agrs::pirl_us::RouteSegment::elevation_end)
        .def_readonly("max_slope_percent", &agrs::pirl_us::RouteSegment::max_slope_percent)
        .def_readonly("cumulative_distance_m", &agrs::pirl_us::RouteSegment::cumulative_distance_m)
        .def_readonly("step_number", &agrs::pirl_us::RouteSegment::step_number)
        .def_readonly("reward", &agrs::pirl_us::RouteSegment::reward)
        .def_readonly("total_reward", &agrs::pirl_us::RouteSegment::total_reward)
        .def_readonly("distance_to_aoi_boundary", &agrs::pirl_us::RouteSegment::distance_to_aoi_boundary);

    // RouteTrajectory struct
    py::class_<agrs::pirl_us::RouteTrajectory>(m, "RouteTrajectory")
        .def(py::init<>())
        .def_readonly("segments", &agrs::pirl_us::RouteTrajectory::segments)
        .def_readonly("success", &agrs::pirl_us::RouteTrajectory::success)
        .def_readonly("total_length_m", &agrs::pirl_us::RouteTrajectory::total_length_m)
        .def_readonly("termination_reason", &agrs::pirl_us::RouteTrajectory::termination_reason);

    // Config nested classes
    py::class_<agrs::pirl_us::PipelineEnvironment::Config::Point>(m, "Point")
        .def(py::init<>())
        .def_readwrite("x", &agrs::pirl_us::PipelineEnvironment::Config::Point::x)
        .def_readwrite("y", &agrs::pirl_us::PipelineEnvironment::Config::Point::y);

    py::class_<agrs::pirl_us::PipelineEnvironment::Config>(m, "Config")
        .def(py::init<>())
        .def_readwrite("project_dir", &agrs::pirl_us::PipelineEnvironment::Config::project_dir)
        .def_readwrite("epsg_code", &agrs::pirl_us::PipelineEnvironment::Config::epsg_code)
        .def_readwrite("start_point", &agrs::pirl_us::PipelineEnvironment::Config::start_point)
        .def_readwrite("end_point", &agrs::pirl_us::PipelineEnvironment::Config::end_point)
        .def_readwrite("max_slope_percent", &agrs::pirl_us::PipelineEnvironment::Config::max_slope_percent)
        .def_readwrite("max_steps_per_episode", &agrs::pirl_us::PipelineEnvironment::Config::max_steps_per_episode)
        .def_readwrite("step_size_min_m", &agrs::pirl_us::PipelineEnvironment::Config::step_size_min_m)
        .def_readwrite("step_size_max_m", &agrs::pirl_us::PipelineEnvironment::Config::step_size_max_m);

    // PipelineEnvironment class
    py::class_<agrs::pirl_us::PipelineEnvironment>(m, "PipelineEnvironment")
        .def(py::init<const agrs::pirl_us::PipelineEnvironment::Config&>())
        .def("reset", &agrs::pirl_us::PipelineEnvironment::reset,
             "Reset environment to initial state")
        .def("step", [](agrs::pirl_us::PipelineEnvironment& env, py::array_t<float> action_array) {
            // Convert numpy array to std::vector
            auto action_buf = action_array.request();
            if (action_buf.ndim != 1 || action_buf.shape[0] != 2) {
                throw std::runtime_error("Action must be a 1D array of length 2");
            }
            
            float* action_ptr = static_cast<float*>(action_buf.ptr);
            std::vector<float> action_vec = {action_ptr[0], action_ptr[1]};
            agrs::pirl_us::Action action = agrs::pirl_us::Action::from_vector(action_vec);
            
            // Execute step
            auto [new_state, reward_info] = env.step(action);
            
            // Convert state to numpy array
            auto state_vec = new_state.to_vector();
            py::array_t<float> observation(state_vec.size());
            auto obs_buf = observation.request();
            float* obs_ptr = static_cast<float*>(obs_buf.ptr);
            for (size_t i = 0; i < state_vec.size(); ++i) {
                obs_ptr[i] = state_vec[i];
            }
            
            // Create info dict
            py::dict info;
            info["reward_info"] = reward_info;
            info["termination_reason"] = reward_info.termination_reason;
            
            // Determine terminated vs truncated
            bool terminated = env.is_done() && 
                            (reward_info.termination_reason == "SUCCESS_GOAL_REACHED" ||
                             reward_info.termination_reason == "OUT_OF_BOUNDS" ||
                             reward_info.termination_reason == "SLOPE_VIOLATION_30%");
            bool truncated = env.is_done() && 
                           (reward_info.termination_reason == "MAX_STEPS_5000");
            
            return py::make_tuple(observation, reward_info.total_reward, terminated, truncated, info);
        }, "Execute one step in the environment")
        .def("is_done", &agrs::pirl_us::PipelineEnvironment::is_done,
             "Check if episode is done")
        .def("get_current_route", &agrs::pirl_us::PipelineEnvironment::get_current_route,
             "Get current route as list of (x,y) coordinates")
        .def("get_route_trajectory", &agrs::pirl_us::PipelineEnvironment::get_route_trajectory,
             "Get detailed route trajectory with segment information")
        .def("get_current_position", &agrs::pirl_us::PipelineEnvironment::get_current_position,
             "Get current position as (x,y) tuple")
        .def("render", &agrs::pirl_us::PipelineEnvironment::render,
             "Render current route to file");
}

