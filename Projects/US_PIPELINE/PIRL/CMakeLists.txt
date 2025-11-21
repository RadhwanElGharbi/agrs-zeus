cmake_minimum_required(VERSION 3.15)
project(PIRL_US VERSION 1.0)

# C++17 standard required
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required packages
find_package(GDAL REQUIRED)

# Use PIRL virtual environment Python
set(Python3_EXECUTABLE "/opt/agrs/python/pirl_venv/bin/python3")

# Find Python and pybind11
find_package(Python3 COMPONENTS Interpreter Development REQUIRED)

# Try to find pybind11 via pip-installed pybind11
execute_process(
    COMMAND ${Python3_EXECUTABLE} -m pybind11 --cmakedir
    OUTPUT_VARIABLE pybind11_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
)

if(pybind11_DIR)
    message(STATUS "Found pybind11: ${pybind11_DIR}")
    find_package(pybind11 CONFIG REQUIRED)
else()
    message(FATAL_ERROR "pybind11 not found. Install with: pip3 install pybind11")
endif()

# Include directories
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${GDAL_INCLUDE_DIRS}
    ${YAML_CPP_INCLUDE_DIRS}
)

# Source files for C++ library
set(PIRL_US_SOURCES
    src/PIRL_US.cpp
)

# Headers
set(PIRL_US_HEADERS
    include/PIRL_US.h
)

# Create static library (optional, for testing)
add_library(pirl_us_core STATIC ${PIRL_US_SOURCES})
target_link_libraries(pirl_us_core 
    ${GDAL_LIBRARIES}
)

# Create Python module using pybind11
pybind11_add_module(pirl_native_us 
    python/pirl_native_bindings_us.cpp
    ${PIRL_US_SOURCES}
)

target_link_libraries(pirl_native_us PRIVATE
    ${GDAL_LIBRARIES}
)

# Set output directory for Python module
set_target_properties(pirl_native_us PROPERTIES
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/python
)

# Installation rules
install(TARGETS pirl_native_us
    LIBRARY DESTINATION ${CMAKE_CURRENT_SOURCE_DIR}/python
)

# Print configuration
message(STATUS "================================")
message(STATUS "US_PIPELINE PIRL Configuration")
message(STATUS "================================")
message(STATUS "C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "GDAL Include: ${GDAL_INCLUDE_DIRS}")
message(STATUS "GDAL Libraries: ${GDAL_LIBRARIES}")
message(STATUS "yaml-cpp: ${YAML_CPP_LIBRARIES}")
message(STATUS "Python Module: pirl_native_us")
message(STATUS "Output Directory: ${CMAKE_CURRENT_SOURCE_DIR}/python")
message(STATUS "================================")

