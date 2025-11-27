cmake_minimum_required(VERSION 3.16)
project(pirl_parameter_tuner_us VERSION 1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Qt6 components
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt6 REQUIRED COMPONENTS Core Widgets)

# Source files
set(SOURCES
    main.cpp
    PIRLParameterTuningDialog_US.cpp
)

set(HEADERS
    PIRLParameterTuningDialog_US.h
)

# Create executable
add_executable(pirl_parameter_tuner_us ${SOURCES} ${HEADERS})

# Link Qt6
target_link_libraries(pirl_parameter_tuner_us
    Qt6::Core
    Qt6::Widgets
)

# Set output directory
set_target_properties(pirl_parameter_tuner_us PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..
)

# Install
install(TARGETS pirl_parameter_tuner_us
    RUNTIME DESTINATION ${CMAKE_CURRENT_SOURCE_DIR}/..
)

message(STATUS "================================")
message(STATUS "US_PIPELINE PIRL Parameter Tuner GUI")
message(STATUS "================================")
message(STATUS "Qt6 Version: ${Qt6_VERSION}")
message(STATUS "Output: pirl_parameter_tuner_us")
message(STATUS "================================")



