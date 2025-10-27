# AGRS ZEUS GUI - CMake Configuration

cmake_minimum_required(VERSION 3.20)

# Find Qt6
find_package(Qt6 REQUIRED COMPONENTS Core Widgets OpenGL OpenGLWidgets Concurrent Network)

# Find OpenSceneGraph
find_package(OpenSceneGraph REQUIRED COMPONENTS osg osgViewer osgGA osgDB osgUtil)

# Qt MOC for Q_OBJECT classes
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# GUI source files
set(GUI_SOURCES
    main.cpp
    MainWindow.cpp
    MapWidget.cpp
    Terrain3DWidget.cpp
    BackendInterface.cpp
    ProjectSetupWizard.cpp
    CRSSelectorDialog.cpp
    DatasetAvailabilityDialog.cpp
    CursorInterface.cpp
    TerminalWidget.cpp
    ClipToAOIDialog.cpp
    AttributeTableDialog.cpp
    VectorStyleDialog.cpp
    FeatureIdentifyDialog.cpp
    PerplexityChatDialog.cpp
)

# GUI header files
set(GUI_HEADERS
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/MainWindow.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/MapWidget.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/Terrain3DWidget.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/BackendInterface.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/ProjectSetupWizard.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/CRSSelectorDialog.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/DatasetAvailabilityDialog.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/CursorInterface.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/TerminalWidget.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/ClipToAOIDialog.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/AttributeTableDialog.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/VectorStyleDialog.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/FeatureIdentifyDialog.h
    ${CMAKE_SOURCE_DIR}/include/agrs_zeus/gui/PerplexityChatDialog.h
)

# Create executable
add_executable(zeus_gui
    ${GUI_SOURCES}
    ${GUI_HEADERS}
)

# Include directories
target_include_directories(zeus_gui PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/src/app
    ${CMAKE_BINARY_DIR}/_deps/cli11-src/include
    ${OPENSCENEGRAPH_INCLUDE_DIRS}
    ${GDAL_INCLUDE_DIRS}
)

# Link libraries
target_link_libraries(zeus_gui
    Qt6::Core
    Qt6::Widgets
    Qt6::OpenGL
    Qt6::OpenGLWidgets
    Qt6::Concurrent
    Qt6::Network
    ${OPENSCENEGRAPH_LIBRARIES}
    agrs_zeus_core  # Main ZEUS library with Tools.cpp
    ${GDAL_LIBRARY}
)

# Set C++ standard
target_compile_features(zeus_gui PRIVATE cxx_std_17)

# Set output directory
set_target_properties(zeus_gui PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}
)

# Install target
install(TARGETS zeus_gui
    RUNTIME DESTINATION bin
)

message(STATUS "GUI executable: zeus_gui will be built")






