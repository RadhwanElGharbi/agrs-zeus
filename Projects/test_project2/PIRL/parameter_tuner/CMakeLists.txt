cmake_minimum_required(VERSION 3.20)

# Extract project name from directory path for unique target name
# CMAKE_CURRENT_SOURCE_DIR is Projects/<NAME>/PIRL/parameter_tuner, so go up 2 levels to get <NAME>
get_filename_component(PROJECT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
get_filename_component(PROJECT_NAME_FROM_PATH "${PROJECT_DIR}" NAME)
set(TARGET_NAME "pirl_parameter_tuner_${PROJECT_NAME_FROM_PATH}")

project(${TARGET_NAME} VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTOUIC ON)

# Find Qt6
find_package(Qt6 REQUIRED COMPONENTS Core Widgets)

# Source files
add_executable(${TARGET_NAME}
    main.cpp
    PIRLParameterTuningDialog.cpp
    PIRLParameterTuningDialog.h
)

# Link Qt libraries
target_link_libraries(${TARGET_NAME}
    Qt6::Core 
    Qt6::Widgets
)

# Install to project PIRL directory (project-specific, not global)
set(PROJECT_PIRL_DIR "${CMAKE_SOURCE_DIR}/Projects/test_project2/PIRL")
install(TARGETS ${TARGET_NAME} DESTINATION ${PROJECT_PIRL_DIR})

# Also copy default parameters JSON to project directory
install(FILES pirl_parameters_default.json DESTINATION ${PROJECT_PIRL_DIR})

# Post-build: Automatically copy executable to project directory for immediate use
# Always copy as "pirl_parameter_tuner" (without project suffix) for consistency
add_custom_command(TARGET ${TARGET_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy
        $<TARGET_FILE:${TARGET_NAME}>
        ${PROJECT_PIRL_DIR}/pirl_parameter_tuner
    COMMAND ${CMAKE_COMMAND} -E copy
        ${CMAKE_CURRENT_SOURCE_DIR}/pirl_parameters_default.json
        ${PROJECT_PIRL_DIR}/pirl_parameters_default.json
    COMMENT "Copying pirl_parameter_tuner to project PIRL directory"
)

# Print build information
message(STATUS "PIRL Parameter Tuner will be installed to: ${PROJECT_PIRL_DIR}")

