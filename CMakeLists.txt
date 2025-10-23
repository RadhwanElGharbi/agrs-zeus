cmake_minimum_required(VERSION 3.20)

project(AGRS_ZEUS
  VERSION 0.1.0
  DESCRIPTION "AGRS ZEUS - Native app for Artemis Global Research Solutions Inc."
  LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(AGRS_ZEUS_WARNINGS_AS_ERRORS "Treat warnings as errors" OFF)
option(AGRS_ZEUS_ENABLE_TESTS "Build tests" ON)

include(FetchContent)

FetchContent_Declare(spdlog
  GIT_REPOSITORY https://github.com/gabime/spdlog.git
  GIT_TAG v1.12.0)
FetchContent_MakeAvailable(spdlog)

FetchContent_Declare(CLI11
  GIT_REPOSITORY https://github.com/CLIUtils/CLI11.git
  GIT_TAG v2.4.2)
FetchContent_MakeAvailable(CLI11)

FetchContent_Declare(nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3)
FetchContent_MakeAvailable(nlohmann_json)

if(AGRS_ZEUS_ENABLE_TESTS)
  FetchContent_Declare(Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.6.0)
  FetchContent_MakeAvailable(Catch2)
  enable_testing()
endif()

# System libraries
find_package(SQLite3 REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBSODIUM REQUIRED libsodium)

add_library(agrs_zeus_core
  src/core/Logger.cpp
  src/core/Config.cpp
  src/core/Database.cpp
  src/core/Migrations.cpp
  src/core/Users.cpp
  src/core/Auth.cpp
  src/core/LoginLogger.cpp
  src/app/Tools.cpp
  src/ai_operator/AIOperator.cpp
  src/pirl/PIRL.cpp
  src/pirl/PIRL_Environment.cpp
  src/pirl/PIRL_Utils.cpp)

target_include_directories(agrs_zeus_core PUBLIC
  ${PROJECT_SOURCE_DIR}/include
  ${PROJECT_BINARY_DIR}/_deps/cli11-src/include)

target_link_libraries(agrs_zeus_core
  PUBLIC spdlog::spdlog_header_only
         nlohmann_json::nlohmann_json
         SQLite::SQLite3
         ${LIBSODIUM_LIBRARIES})

target_include_directories(agrs_zeus_core PRIVATE ${LIBSODIUM_INCLUDE_DIRS})

# Link GDAL to core library (used by PIRL module and tools)
find_package(GDAL REQUIRED)
target_include_directories(agrs_zeus_core PRIVATE ${GDAL_INCLUDE_DIRS})
target_link_libraries(agrs_zeus_core PUBLIC ${GDAL_LIBRARIES})

if (AGRS_ZEUS_WARNINGS_AS_ERRORS)
  if (MSVC)
    target_compile_options(agrs_zeus_core PRIVATE /W4 /WX)
  else()
    target_compile_options(agrs_zeus_core PRIVATE -Wall -Wextra -Wpedantic -Werror)
  endif()
endif()

add_executable(zeus
  src/main.cpp
  src/app/App.cpp
  src/app/Tools.cpp
  src/pirl/PIRL.cpp
  src/pirl/PIRL_Environment.cpp
  src/pirl/PIRL_Utils.cpp)

target_include_directories(zeus PRIVATE ${PROJECT_SOURCE_DIR}/include)

target_compile_definitions(zeus PRIVATE
  AGRS_ZEUS_VERSION_MAJOR=${PROJECT_VERSION_MAJOR}
  AGRS_ZEUS_VERSION_MINOR=${PROJECT_VERSION_MINOR}
  AGRS_ZEUS_VERSION_PATCH=${PROJECT_VERSION_PATCH})

# Ensure CLI also has GDAL includes
target_include_directories(zeus PRIVATE ${GDAL_INCLUDE_DIRS})

target_link_libraries(zeus
  PRIVATE agrs_zeus_core
          CLI11::CLI11
          spdlog::spdlog_header_only
          nlohmann_json::nlohmann_json
          ${GDAL_LIBRARIES})

# Ensure zeus has access to libsodium headers (used directly in src/main.cpp)
target_include_directories(zeus PRIVATE ${LIBSODIUM_INCLUDE_DIRS})

install(TARGETS zeus RUNTIME DESTINATION bin)
install(DIRECTORY config/ DESTINATION share/agrs-zeus/config)

if(AGRS_ZEUS_ENABLE_TESTS)
  add_executable(agrs_zeus_tests
    tests/test_logger.cpp
    tests/test_dem_fetch.cpp)
  target_link_libraries(agrs_zeus_tests PRIVATE agrs_zeus_core Catch2::Catch2WithMain)
  add_test(NAME agrs_zeus_tests COMMAND agrs_zeus_tests)
endif()

# GUI Application (optional)
option(AGRS_ZEUS_BUILD_GUI "Build GUI application" ON)
if(AGRS_ZEUS_BUILD_GUI)
  message(STATUS "GUI build enabled")
  add_subdirectory(src/gui)
endif()

include(CPack)
set(CPACK_PACKAGE_NAME "agrs-zeus")
set(CPACK_PACKAGE_VERSION ${PROJECT_VERSION})
set(CPACK_GENERATOR "DEB;TGZ")
set(CPACK_DEBIAN_PACKAGE_MAINTAINER "Artemis GRS Inc.")
