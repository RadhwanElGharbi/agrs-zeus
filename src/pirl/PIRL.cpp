#include "agrs_zeus/PIRL.h"
#include <gdal_priv.h>
#include <ogr_geometry.h>
#include <ogr_spatialref.h>
#include <ogrsf_frmts.h>
#include <ogr_api.h>
#include <cmath>
#include <fstream>
#include <iostream>
#include <algorithm>
#include <random>
#include <filesystem>
#include <sstream>
#include <limits>

namespace agrs {
namespace pirl {

// ============================================================================
// STATE IMPLEMENTATION
// ============================================================================

std::vector<float> State::to_vector() const {
    // Normalize coordinates to reasonable range (divide by 100km to get ~0-10 range)
    // This prevents NaN issues in VecNormalize with huge UTM coordinates
    constexpr double coord_scale = 100000.0;  // 100km
    
    // Helper to safely clip values and prevent NaN/Inf
    auto safe_float = [](double val, double min_val = -1000.0, double max_val = 1000.0) -> float {
        if (std::isnan(val) || std::isinf(val)) return 0.0f;
        return static_cast<float>(std::clamp(val, min_val, max_val));
    };
    
    return {
        safe_float(x / coord_scale, 0.0, 10.0),                  // Normalize coordinates
        safe_float(y / coord_scale, 0.0, 100.0),                 // Normalize coordinates  
        safe_float(goal_distance / 100000.0, 0.0, 10.0),         // Normalize to ~100km
        safe_float(goal_bearing, -3.15, 3.15),                   // Radians [-π, π]
        safe_float(elevation / 1000.0, -1.0, 10.0),              // Normalize to km
        safe_float(slope / 100.0, 0.0, 1.0),                     // Normalize slope (was degrees/percent)
        safe_float(aspect, -3.15, 3.15),                         // Radians
        safe_float(curvature, -1.0, 1.0),                        // Small values
        safe_float(no_go_zone, 0.0, 1.0),                        // Binary 0/1
        safe_float(water_proximity, 0.0, 1.0),                   // Normalized 0-1
        safe_float(road_proximity, 0.0, 1.0),                    // Normalized 0-1
        safe_float(geohazard_risk, 0.0, 1.0),                    // 0-1
        safe_float(soil_capacity, 0.0, 1.0),                     // 0-1 (clamp bad values)
        safe_float(cadastre_complex, 0.0, 1.0),                  // 0-1
        safe_float(population_density / 1000.0, 0.0, 10.0),      // Normalize to thousands/km²
        safe_float(railway_proximity, 0.0, 1.0),                 // Normalized 0-1
        safe_float(cumulative_pressure_drop_pa / 1e6, 0.0, 100.0),  // Normalize to MPa
        safe_float(segments_since_pump / 100000.0, 0.0, 10.0),   // Normalize to ~100km
        safe_float(flow_velocity_m_s / 30.0, 0.0, 5.0),          // Normalize to max velocity
        safe_float(reynolds_number / 1e6, 0.0, 100.0),           // Normalize to millions
        safe_float(prev_heading, -3.15, 3.15)                    // Radians
    };
}

// ============================================================================
// ACTION IMPLEMENTATION
// ============================================================================

Action Action::from_vector(const std::vector<float>& action_vec) {
    Action action;
    if (action_vec.size() >= 2) {
        // Neural network outputs in range [-1, 1], scale to actual ranges
        action.heading_change = action_vec[0] * (M_PI / 4.0); // ±45 degrees
        action.step_size = (action_vec[1] + 1.0) * 45.0 + 10.0; // 10-100m
    }
    return action;
}

std::vector<float> Action::to_vector() const {
    return {
        static_cast<float>(heading_change),
        static_cast<float>(step_size)
    };
}

void Action::apply_constraints(const State& current_state, 
                              const PhysicsConstraints& physics) {
    // Clamp step size first (needed for bend radius calculation)
    step_size = std::clamp(step_size, 10.0, 100.0);
    
    // Initial heading change limit
    heading_change = std::clamp(heading_change, -M_PI / 4.0, M_PI / 4.0);
    
    // ============================================================================
    // BEND RADIUS ENFORCEMENT (based on pipeline specifications)
    // ============================================================================
    
    // For pipe bending, we need to ensure the bend radius meets minimum requirements
    // Bend radius R = L / (2 * sin(θ/2)) where L = step_size, θ = heading_change
    
    if (std::abs(heading_change) > 1e-6) {  // Only if actually turning
        double current_bend_radius = step_size / (2.0 * std::sin(std::abs(heading_change) / 2.0));
        
        // Determine minimum allowable bend radius based on bend type
        // From pipeline_specs.json:
        // - Hot bend min radius: 1.981m (very tight, pre-fabricated bends)
        // - Field bend max angle: 5° (very gentle, cold bending)
        // - HDD min radius: 792.48m (for trenchless crossings)
        
        // For normal routing, we use field bend constraints (cold bending)
        // Field bends are limited to 5° maximum per joint/step
        // This translates to a minimum bend radius for the given step size
        
        const double FIELD_BEND_MAX_ANGLE_DEG = 5.0;  // From specs
        const double FIELD_BEND_MAX_ANGLE_RAD = FIELD_BEND_MAX_ANGLE_DEG * M_PI / 180.0;
        
        // For cold field bending, typical industry standard is 40D (40 × diameter)
        // Pipeline diameter = 660.4mm = 0.6604m
        // Minimum bend radius = 40 × 0.6604 = 26.4m for cold bending
        const double PIPE_DIAMETER_M = 0.6604;
        const double MIN_COLD_BEND_RADIUS = PIPE_DIAMETER_M * 40.0;  // 26.4m
        
        // Calculate maximum heading change for this step size to meet minimum radius
        double max_angle_for_radius = 2.0 * std::asin(step_size / (2.0 * MIN_COLD_BEND_RADIUS));
        
        // Also enforce field bend angle limit (5° per step for cold bending)
        double max_angle_for_field_bend = FIELD_BEND_MAX_ANGLE_RAD;
        
        // Use the most restrictive constraint
        double max_allowed_angle = std::min(max_angle_for_radius, max_angle_for_field_bend);
        
        // Clamp heading change to meet bend radius requirements
        heading_change = std::clamp(heading_change, -max_allowed_angle, max_allowed_angle);
        
        // Recalculate actual bend radius after constraint
        double final_bend_radius = step_size / (2.0 * std::sin(std::abs(heading_change) / 2.0));
        
        // Ensure we meet the minimum (safety check)
        if (final_bend_radius < MIN_COLD_BEND_RADIUS - 0.1) {
            // If still violating, reduce heading change further
            heading_change = std::clamp(heading_change, 
                                       -max_allowed_angle * 0.9, 
                                       max_allowed_angle * 0.9);
        }
    }
    
    // Additional physics-based constraints
    
    // Reduce step size on steep slopes (harder to bend pipe on incline)
    if (current_state.slope > 15.0) {  // > 15% slope
        double slope_factor = 1.0 - ((current_state.slope - 15.0) / 50.0);
        slope_factor = std::clamp(slope_factor, 0.5, 1.0);
        step_size *= slope_factor;
    }
}

// ============================================================================
// GIS DATA MANAGER IMPLEMENTATION
// ============================================================================

GISDataManager::GISDataManager(const std::string& project_dir, int epsg_code)
    : project_dir_(project_dir), epsg_code_(epsg_code) {
    GDALAllRegister();
}

GISDataManager::~GISDataManager() = default;

void GISDataManager::load_all_data() {
    std::cout << "🗺️  Loading GIS data for project: " << project_dir_ << std::endl;
    
    namespace fs = std::filesystem;
    
    // Load DEM
    std::string dem_path = project_dir_ + "/data/rasters/dem.tif";
    if (fs::exists(dem_path)) {
        dem_.reset(static_cast<GDALDataset*>(
            GDALOpen(dem_path.c_str(), GA_ReadOnly)));
        if (dem_) {
            std::cout << "  ✅ DEM loaded" << std::endl;
        } else {
            std::cerr << "  ⚠️  Failed to load DEM" << std::endl;
        }
    } else {
        std::cerr << "  ❌ DEM not found: " << dem_path << std::endl;
    }
    
    // Load slope (if available, otherwise calculate from DEM)
    std::string slope_path = project_dir_ + "/derived/terrain_analysis/slope.tif";
    if (fs::exists(slope_path)) {
        slope_.reset(static_cast<GDALDataset*>(
            GDALOpen(slope_path.c_str(), GA_ReadOnly)));
        if (slope_) {
            std::cout << "  ✅ Slope loaded" << std::endl;
        }
    } else {
        std::cout << "  ⚠️  Slope raster not found, will calculate on-the-fly" << std::endl;
    }
    
    // Load land cover
    std::string landcover_path = project_dir_ + "/data/rasters/landcover.tif";
    if (fs::exists(landcover_path)) {
        landcover_.reset(static_cast<GDALDataset*>(
            GDALOpen(landcover_path.c_str(), GA_ReadOnly)));
        if (landcover_) {
            std::cout << "  ✅ Land cover loaded" << std::endl;
        }
    }
    
    // Load geohazards (landslide susceptibility, seismic risk)
    std::string geohazards_path = project_dir_ + "/data/rasters/geohazards.tif";
    if (fs::exists(geohazards_path)) {
        geohazards_.reset(static_cast<GDALDataset*>(
            GDALOpen(geohazards_path.c_str(), GA_ReadOnly)));
        if (geohazards_) {
            std::cout << "  ✅ Geohazards loaded" << std::endl;
        }
    }
    
    // Load soil properties
    std::string soil_path = project_dir_ + "/data/rasters/soil.tif";
    if (fs::exists(soil_path)) {
        soil_.reset(static_cast<GDALDataset*>(
            GDALOpen(soil_path.c_str(), GA_ReadOnly)));
        if (soil_) {
            std::cout << "  ✅ Soil properties loaded" << std::endl;
        }
    }
    
    // Load population density
    std::string population_path = project_dir_ + "/data/rasters/population.tif";
    if (fs::exists(population_path)) {
        population_.reset(static_cast<GDALDataset*>(
            GDALOpen(population_path.c_str(), GA_ReadOnly)));
        if (population_) {
            std::cout << "  ✅ Population density loaded" << std::endl;
        }
    }
    
    // Load vector geometries
    std::cout << "  🔄 Loading vector constraints..." << std::endl;
    
    // Load AOI boundary
    std::string aoi_path = project_dir_ + "/data/vectors/aoi.gpkg";
    if (!fs::exists(aoi_path)) {
        aoi_path = project_dir_ + "/data/vectors/aoi.shp";
    }
    if (fs::exists(aoi_path)) {
        GDALDataset* aoi_ds = static_cast<GDALDataset*>(
            GDALOpenEx(aoi_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (aoi_ds && aoi_ds->GetLayerCount() > 0) {
            OGRLayer* layer = aoi_ds->GetLayer(0);
            OGRFeature* feature;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    aoi_geom_.reset(geom->clone());
                    std::cout << "    ✅ AOI boundary loaded" << std::endl;
                    break;
                }
                OGRFeature::DestroyFeature(feature);
            }
            GDALClose(aoi_ds);
        }
    }
    
    // Load protected areas
    std::string protected_path = project_dir_ + "/data/vectors/protected_areas.gpkg";
    if (!fs::exists(protected_path)) {
        protected_path = project_dir_ + "/data/vectors/protected_areas.shp";
    }
    if (fs::exists(protected_path)) {
        GDALDataset* prot_ds = static_cast<GDALDataset*>(
            GDALOpenEx(protected_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (prot_ds && prot_ds->GetLayerCount() > 0) {
            OGRLayer* layer = prot_ds->GetLayer(0);
            OGRGeometryCollection* collection = new OGRGeometryCollection();
            OGRFeature* feature;
            int count = 0;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    collection->addGeometry(geom);
                    count++;
                }
                OGRFeature::DestroyFeature(feature);
            }
            if (count > 0) {
                protected_areas_.reset(collection);
                std::cout << "    ✅ Protected areas loaded (" << count << " features)" << std::endl;
            } else {
                delete collection;
            }
            GDALClose(prot_ds);
        }
    }
    
    // Load sea polygon (largest water body - 1km exclusion zone)
    std::string sea_polygon_path = project_dir_ + "/data/vectors/sea_polygon.gpkg";
    
    if (fs::exists(sea_polygon_path)) {
        std::cout << "    🌊 Loading sea polygon..." << std::endl;
        GDALDataset* sea_ds = static_cast<GDALDataset*>(
            GDALOpenEx(sea_polygon_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (sea_ds && sea_ds->GetLayerCount() > 0) {
            OGRLayer* layer = sea_ds->GetLayer(0);
            OGRFeature* feature = layer->GetNextFeature();
            if (feature) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    sea_polygon_geom_.reset(geom->clone());
                    
                    // Get area from attributes if available
                    double area_km2 = 0.0;
                    int area_field_idx = feature->GetFieldIndex("area_km2");
                    if (area_field_idx >= 0) {
                        area_km2 = feature->GetFieldAsDouble(area_field_idx);
                    } else {
                        // Calculate from geometry  
                        OGREnvelope envelope;
                        geom->getEnvelope(&envelope);
                        double width = envelope.MaxX - envelope.MinX;
                        double height = envelope.MaxY - envelope.MinY;
                        area_km2 = (width * height) / 1000000.0;  // Rough estimate
                    }
                    
                    std::cout << "       ✅ Sea polygon loaded:" << std::endl;
                    std::cout << "          Area: " << area_km2 << " km²" << std::endl;
                    std::cout << "          Exclusion zone: 1000 m (1 km)" << std::endl;
                    std::cout << "          🔒 Offshore routing will be blocked" << std::endl;
                }
                OGRFeature::DestroyFeature(feature);
            }
            GDALClose(sea_ds);
        }
    } else {
        std::cout << "    ℹ️  No sea polygon (inland project or extract with extract_sea_polygon.py)" << std::endl;
    }
    
    // Load water bodies
    std::string water_path = project_dir_ + "/data/vectors/water_bodies.gpkg";
    if (!fs::exists(water_path)) {
        water_path = project_dir_ + "/data/vectors/hydrology.gpkg";
    }
    if (!fs::exists(water_path)) {
        water_path = project_dir_ + "/data/vectors/water_bodies.shp";
    }
    if (fs::exists(water_path)) {
        GDALDataset* water_ds = static_cast<GDALDataset*>(
            GDALOpenEx(water_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (water_ds && water_ds->GetLayerCount() > 0) {
            OGRLayer* layer = water_ds->GetLayer(0);
            OGRGeometryCollection* collection = new OGRGeometryCollection();
            OGRFeature* feature;
            int count = 0;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    collection->addGeometry(geom);
                    count++;
                }
                OGRFeature::DestroyFeature(feature);
            }
            if (count > 0) {
                water_bodies_.reset(collection);
                std::cout << "    ✅ Water bodies loaded (" << count << " features)" << std::endl;
            } else {
                delete collection;
            }
            GDALClose(water_ds);
        }
    }
    
    // Load roads
    std::string roads_path = project_dir_ + "/data/vectors/roads.gpkg";
    if (!fs::exists(roads_path)) {
        roads_path = project_dir_ + "/data/vectors/infrastructure.gpkg";
    }
    if (!fs::exists(roads_path)) {
        roads_path = project_dir_ + "/data/vectors/roads.shp";
    }
    if (fs::exists(roads_path)) {
        GDALDataset* roads_ds = static_cast<GDALDataset*>(
            GDALOpenEx(roads_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (roads_ds && roads_ds->GetLayerCount() > 0) {
            OGRLayer* layer = roads_ds->GetLayer(0);
            OGRGeometryCollection* collection = new OGRGeometryCollection();
            OGRFeature* feature;
            int count = 0;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    collection->addGeometry(geom);
                    count++;
                }
                OGRFeature::DestroyFeature(feature);
            }
            if (count > 0) {
                roads_.reset(collection);
                std::cout << "    ✅ Roads loaded (" << count << " features)" << std::endl;
            } else {
                delete collection;
            }
            GDALClose(roads_ds);
        }
    }
    
    // Load railways
    std::string railways_path = project_dir_ + "/data/vectors/railways.gpkg";
    if (!fs::exists(railways_path)) {
        railways_path = project_dir_ + "/data/vectors/railways.shp";
    }
    if (fs::exists(railways_path)) {
        GDALDataset* rail_ds = static_cast<GDALDataset*>(
            GDALOpenEx(railways_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (rail_ds && rail_ds->GetLayerCount() > 0) {
            OGRLayer* layer = rail_ds->GetLayer(0);
            OGRGeometryCollection* collection = new OGRGeometryCollection();
            OGRFeature* feature;
            int count = 0;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    collection->addGeometry(geom);
                    count++;
                }
                OGRFeature::DestroyFeature(feature);
            }
            if (count > 0) {
                railways_.reset(collection);
                std::cout << "    ✅ Railways loaded (" << count << " features)" << std::endl;
            } else {
                delete collection;
            }
            GDALClose(rail_ds);
        }
    }
    
    // Load cadastre (complex land parcels requiring special ROW negotiation)
    std::string cadastre_path = project_dir_ + "/data/vectors/cadastre_complex.gpkg";
    if (!fs::exists(cadastre_path)) {
        cadastre_path = project_dir_ + "/data/vectors/cadastre.gpkg";
    }
    if (!fs::exists(cadastre_path)) {
        cadastre_path = project_dir_ + "/data/vectors/cadastre.shp";
    }
    if (fs::exists(cadastre_path)) {
        GDALDataset* cad_ds = static_cast<GDALDataset*>(
            GDALOpenEx(cadastre_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (cad_ds && cad_ds->GetLayerCount() > 0) {
            OGRLayer* layer = cad_ds->GetLayer(0);
            OGRGeometryCollection* collection = new OGRGeometryCollection();
            OGRFeature* feature;
            int count = 0;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    collection->addGeometry(geom);
                    count++;
                }
                OGRFeature::DestroyFeature(feature);
            }
            if (count > 0) {
                cadastre_complex_.reset(collection);
                std::cout << "    ✅ Cadastre parcels loaded (" << count << " features)" << std::endl;
            } else {
                delete collection;
            }
            GDALClose(cad_ds);
        }
    }
    
    // Load power lines (transmission lines)
    std::string power_path = project_dir_ + "/data/vectors/power_lines.gpkg";
    if (!fs::exists(power_path)) {
        power_path = project_dir_ + "/data/vectors/power_lines.shp";
    }
    if (fs::exists(power_path)) {
        GDALDataset* power_ds = static_cast<GDALDataset*>(
            GDALOpenEx(power_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (power_ds && power_ds->GetLayerCount() > 0) {
            OGRLayer* layer = power_ds->GetLayer(0);
            OGRGeometryCollection* collection = new OGRGeometryCollection();
            OGRFeature* feature;
            int count = 0;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    collection->addGeometry(geom);
                    count++;
                }
                OGRFeature::DestroyFeature(feature);
            }
            if (count > 0) {
                power_lines_.reset(collection);
                std::cout << "    ✅ Power lines loaded (" << count << " features)" << std::endl;
            } else {
                delete collection;
            }
            GDALClose(power_ds);
        }
    } else {
        std::cerr << "    ❌ Power lines not found (REQUIRED)" << std::endl;
    }
    
    // Load existing pipelines
    std::string pipelines_path = project_dir_ + "/data/vectors/pipelines.gpkg";
    if (!fs::exists(pipelines_path)) {
        pipelines_path = project_dir_ + "/data/vectors/pipelines.shp";
    }
    if (fs::exists(pipelines_path)) {
        GDALDataset* pipe_ds = static_cast<GDALDataset*>(
            GDALOpenEx(pipelines_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
        if (pipe_ds && pipe_ds->GetLayerCount() > 0) {
            OGRLayer* layer = pipe_ds->GetLayer(0);
            OGRGeometryCollection* collection = new OGRGeometryCollection();
            OGRFeature* feature;
            int count = 0;
            while ((feature = layer->GetNextFeature()) != nullptr) {
                OGRGeometry* geom = feature->GetGeometryRef();
                if (geom) {
                    collection->addGeometry(geom);
                    count++;
                }
                OGRFeature::DestroyFeature(feature);
            }
            if (count > 0) {
                pipelines_.reset(collection);
                std::cout << "    ✅ Existing pipelines loaded (" << count << " features)" << std::endl;
            } else {
                delete collection;
            }
            GDALClose(pipe_ds);
        }
    } else {
        std::cerr << "    ❌ Existing pipelines not found (REQUIRED)" << std::endl;
    }
    
    std::cout << "✅ GIS data loading complete" << std::endl;
}

double GISDataManager::distance_to_geometry(OGRGeometry* geom, double x, double y) const {
    if (!geom) return 1.0; // Large default distance if no geometry loaded (normalized)
    
    OGRPoint point(x, y);
    
    // Set spatial reference if needed
    if (geom->getSpatialReference()) {
        point.assignSpatialReference(geom->getSpatialReference());
    }
    
    double distance = geom->Distance(&point);
    
    // Return normalized distance (0 = touching, 1 = >1000m away)
    return std::min(distance / 1000.0, 1.0);
}

double GISDataManager::sample_raster(GDALDataset* dataset, double x, double y) const {
    if (!dataset) return 0.0;
    
    // Get raster's spatial reference
    const OGRSpatialReference* rasterSRS = dataset->GetSpatialRef();
    if (!rasterSRS) {
        std::cerr << "⚠️  Raster has no spatial reference" << std::endl;
        return 0.0;
    }
    
    // Create project spatial reference (UTM)
    OGRSpatialReference projectSRS;
    projectSRS.importFromEPSG(epsg_code_);
    
    // Check if coordinate transformation is needed
    bool needsTransform = !rasterSRS->IsSame(&projectSRS);
    
    double sample_x = x;
    double sample_y = y;
    
    if (needsTransform) {
        // Create coordinate transformation
        OGRCoordinateTransformation* transform = 
            OGRCreateCoordinateTransformation(&projectSRS, rasterSRS);
        
        if (!transform) {
            std::cerr << "⚠️  Failed to create coordinate transformation" << std::endl;
            return 0.0;
        }
        
        // Transform coordinates from project CRS to raster CRS
        if (!transform->Transform(1, &sample_x, &sample_y)) {
            std::cerr << "⚠️  Coordinate transformation failed" << std::endl;
            delete transform;
            return 0.0;
        }
        
        delete transform;
    }
    
    // Get geotransform
    double geotransform[6];
    if (dataset->GetGeoTransform(geotransform) != CE_None) {
        return 0.0;
    }
    
    // Convert coordinates to pixel/line using transformed coordinates
    double pixel = (sample_x - geotransform[0]) / geotransform[1];
    double line = (sample_y - geotransform[3]) / geotransform[5];
    
    int px = static_cast<int>(pixel);
    int py = static_cast<int>(line);
    
    // Check bounds
    if (px < 0 || px >= dataset->GetRasterXSize() ||
        py < 0 || py >= dataset->GetRasterYSize()) {
        return 0.0;
    }
    
    // Read single pixel
    GDALRasterBand* band = dataset->GetRasterBand(1);
    if (!band) return 0.0;
    
    float value;
    if (band->RasterIO(GF_Read, px, py, 1, 1, &value, 1, 1, 
                      GDT_Float32, 0, 0) != CE_None) {
        return 0.0;
    }
    
    // Check for NoData
    int hasNoData;
    double noDataValue = band->GetNoDataValue(&hasNoData);
    if (hasNoData && value == noDataValue) {
        return 0.0;
    }
    
    return static_cast<double>(value);
}

double GISDataManager::get_elevation(double x, double y) const {
    return sample_raster(dem_.get(), x, y);
}

double GISDataManager::get_slope(double x, double y) const {
    // Primary: derive slope percent from DEM using Horn 3x3 (ArcGIS/gdaldem default)
    if (!dem_) {
        // Fallback: use slope raster if DEM unavailable
        if (slope_) {
            return sample_raster(slope_.get(), x, y);
        }
        return 0.0;
    }

    double geotransform[6];
    double dx = 10.0; // fallback
    double dy = 10.0; // fallback
    if (dem_->GetGeoTransform(geotransform) == CE_None) {
        if (std::abs(geotransform[1]) > 0.0) dx = std::abs(geotransform[1]);
        if (std::abs(geotransform[5]) > 0.0) dy = std::abs(geotransform[5]);
    }

    // Sample 3x3 neighborhood elevations
    const double z1 = get_elevation(x - dx, y + dy);
    const double z2 = get_elevation(x,      y + dy);
    const double z3 = get_elevation(x + dx, y + dy);
    const double z4 = get_elevation(x - dx, y);
    const double z5 = get_elevation(x,      y);
    const double z6 = get_elevation(x + dx, y);
    const double z7 = get_elevation(x - dx, y - dy);
    const double z8 = get_elevation(x,      y - dy);
    const double z9 = get_elevation(x + dx, y - dy);

    // Horn gradient (assumes square cells; if dx != dy, scale accordingly)
    const double denom_x = 8.0 * dx;
    const double denom_y = 8.0 * dy;
    const double dzdx = denom_x > 0.0 ? ((z3 + 2.0 * z6 + z9) - (z1 + 2.0 * z4 + z7)) / denom_x : 0.0;
    const double dzdy = denom_y > 0.0 ? ((z7 + 2.0 * z8 + z9) - (z1 + 2.0 * z2 + z3)) / denom_y : 0.0;

    // Percent slope = 100 * sqrt((dz/dx)^2 + (dz/dy)^2)
    const double gradient = std::sqrt(dzdx * dzdx + dzdy * dzdy);
    return gradient * 100.0;
}

double GISDataManager::get_aspect(double x, double y) const {
    if (!dem_) return 0.0;
    
    double h = 10.0;
    double z0 = get_elevation(x, y);
    double zx = get_elevation(x + h, y);
    double zy = get_elevation(x, y + h);
    
    double dzdx = (zx - z0) / h;
    double dzdy = (zy - z0) / h;
    
    return std::atan2(dzdy, dzdx);
}

double GISDataManager::get_curvature(double x, double y) const {
    if (!dem_) return 0.0;
    
    // Simple curvature estimation using second derivatives
    double h = 10.0;
    double z0 = get_elevation(x, y);
    double zx1 = get_elevation(x + h, y);
    double zx2 = get_elevation(x - h, y);
    double zy1 = get_elevation(x, y + h);
    double zy2 = get_elevation(x, y - h);
    
    double d2zdx2 = (zx1 - 2*z0 + zx2) / (h * h);
    double d2zdy2 = (zy1 - 2*z0 + zy2) / (h * h);
    
    return std::abs(d2zdx2 + d2zdy2);
}

bool GISDataManager::is_no_go_zone(double x, double y) const {
    if (!protected_areas_) return false;
    
    OGRPoint point(x, y);
    
    // Set spatial reference if needed
    if (protected_areas_->getSpatialReference()) {
        point.assignSpatialReference(protected_areas_->getSpatialReference());
    }
    
    // Check if point is within any protected area
    return protected_areas_->Contains(&point);
}

double GISDataManager::distance_to_water(double x, double y) const {
    if (!water_bodies_) {
        // No water data loaded, return normalized far distance
        return 1.0;
    }
    
    return distance_to_geometry(water_bodies_.get(), x, y);
}

double GISDataManager::distance_to_road(double x, double y) const {
    if (!roads_) {
        // No road data loaded, return normalized far distance
        return 1.0;
    }
    
    return distance_to_geometry(roads_.get(), x, y);
}

double GISDataManager::distance_to_railway(double x, double y) const {
    if (!railways_) {
        // No railway data loaded, return normalized far distance
        return 1.0;
    }
    
    return distance_to_geometry(railways_.get(), x, y);
}

double GISDataManager::distance_to_power_line(double x, double y) const {
    if (!power_lines_) {
        // No power line data loaded, return normalized far distance
        return 1.0;
    }
    
    return distance_to_geometry(power_lines_.get(), x, y);
}

double GISDataManager::distance_to_pipeline(double x, double y) const {
    if (!pipelines_) {
        // No pipeline data loaded, return normalized far distance
        return 1.0;
    }
    
    return distance_to_geometry(pipelines_.get(), x, y);
}

int GISDataManager::get_land_cover_class(double x, double y) const {
    if (landcover_) {
        return static_cast<int>(sample_raster(landcover_.get(), x, y));
    }
    return 0; // Unknown
}

std::string GISDataManager::get_land_cover_name(int land_cover_class) const {
    static std::map<int, std::string> landcover_map = {
        {10, "tree_cover"},
        {20, "shrubland"},
        {30, "grassland"},
        {40, "cropland"},
        {50, "built_up"},
        {60, "bare_vegetation"},
        {70, "snow_ice"},
        {80, "water_bodies"},
        {90, "herbaceous_wetland"},
        {95, "mangroves"},
        {100, "moss_lichen"}
    };
    auto it = landcover_map.find(land_cover_class);
    return (it != landcover_map.end()) ? it->second : "unknown";
}

bool GISDataManager::is_within_aoi(double x, double y) const {
    if (!aoi_geom_) {
        // No AOI geometry loaded, use DEM bounds instead
        double minx, miny, maxx, maxy;
        get_aoi_bounds(minx, miny, maxx, maxy);
        return (x >= minx && x <= maxx && y >= miny && y <= maxy);
    }
    
    OGRPoint point(x, y);
    
    // Set spatial reference if needed
    if (aoi_geom_->getSpatialReference()) {
        point.assignSpatialReference(aoi_geom_->getSpatialReference());
    }
    
    // Check if point is within AOI
    return aoi_geom_->Contains(&point);
}

// Sea polygon constraint: 1km exclusion zone
double GISDataManager::distance_to_sea(double x, double y) const {
    if (!sea_polygon_geom_) {
        return std::numeric_limits<double>::max();  // No sea = infinitely far
    }
    
    OGRPoint point(x, y);
    
    // Set spatial reference if needed
    if (sea_polygon_geom_->getSpatialReference()) {
        point.assignSpatialReference(sea_polygon_geom_->getSpatialReference());
    }
    
    return sea_polygon_geom_->Distance(&point);
}

bool GISDataManager::is_near_sea(double x, double y) const {
    if (!sea_polygon_geom_) {
        return false;  // No sea polygon = can't be near it
    }
    
    const double SEA_EXCLUSION_DISTANCE_M = 1000.0;  // 1 km buffer
    double distance = distance_to_sea(x, y);
    
    // Terminate if within 1 km of sea polygon
    return distance < SEA_EXCLUSION_DISTANCE_M;
}

void GISDataManager::get_aoi_bounds(double& minx, double& miny, 
                                   double& maxx, double& maxy) const {
    if (dem_) {
        double geotransform[6];
        if (dem_->GetGeoTransform(geotransform) == CE_None) {
            minx = geotransform[0];
            maxy = geotransform[3];
            maxx = minx + geotransform[1] * dem_->GetRasterXSize();
            miny = maxy + geotransform[5] * dem_->GetRasterYSize();
            return;
        }
    }
    
    // Default bounds
    minx = miny = 0.0;
    maxx = maxy = 1000.0;
}

double GISDataManager::get_geohazard_risk(double x, double y) const {
    if (geohazards_) {
        // Geohazard raster: 0 = low risk, 100 = high risk
        // Normalize to 0-1 range
        return sample_raster(geohazards_.get(), x, y) / 100.0;
    }
    return 0.0;  // No hazard data = assume low risk
}

double GISDataManager::get_soil_bearing_capacity(double x, double y) const {
    if (soil_) {
        // Soil raster: normalized bearing capacity (0-1)
        // 1 = excellent, 0 = poor/unsuitable
        return sample_raster(soil_.get(), x, y);
    }
    return 0.5;  // No soil data = assume moderate bearing capacity
}

bool GISDataManager::is_cadastre_complex(double x, double y) const {
    if (!cadastre_complex_) return false;
    
    OGRPoint point(x, y);
    
    // Set spatial reference if needed
    if (cadastre_complex_->getSpatialReference()) {
        point.assignSpatialReference(cadastre_complex_->getSpatialReference());
    }
    
    // Check if point is within any complex cadastre parcel
    return cadastre_complex_->Contains(&point);
}

double GISDataManager::get_population_density(double x, double y) const {
    if (population_) {
        // Population raster: people per sq km
        // Normalize: 0 = rural (<10/km²), 1 = dense urban (>1000/km²)
        double density = sample_raster(population_.get(), x, y);
        return std::min(density / 1000.0, 1.0);
    }
    return 0.0;  // No population data = assume rural
}

// ============================================================================
// COST MODEL IMPLEMENTATION
// ============================================================================

CostModel::CostModel(const ProjectConfig& config) : config_(config) {
    // Initialize cost lookup tables based on research
    // Source: /opt/agrs/docs/PIPELINE_CONSTRUCTION_COST_MATRIX.md
    
    // Terrain multipliers (relative to flat terrain = 1.0)
    terrain_multipliers_["flat"] = 1.0;
    terrain_multipliers_["rolling"] = 1.3;
    terrain_multipliers_["hilly"] = 1.8;
    terrain_multipliers_["mountainous"] = 3.0;
    terrain_multipliers_["steep"] = 5.0;
    
    // Land cover construction costs ($/meter) - ESA WorldCover classes
    landcover_costs_[10] = 150.0;  // Tree cover
    landcover_costs_[20] = 120.0;  // Shrubland
    landcover_costs_[30] = 100.0;  // Grassland
    landcover_costs_[40] = 200.0;  // Cropland
    landcover_costs_[50] = 80.0;   // Built-up
    landcover_costs_[60] = 100.0;  // Bare/sparse vegetation
    landcover_costs_[70] = 100.0;  // Snow and ice
    landcover_costs_[80] = 3500.0; // Permanent water bodies (UPDATED: realistic offshore cost)
                                    // Note: With coastline constraint, agent won't reach offshore
                                    // This cost now represents inland water body traversal
    landcover_costs_[90] = 400.0;  // Herbaceous wetland
    landcover_costs_[95] = 350.0;  // Mangroves
    landcover_costs_[100] = 250.0; // Moss and lichen
    
    // Crossing costs
    crossing_costs_["minor_road"] = 10000.0;  // $10k per crossing
    crossing_costs_["major_road"] = 25000.0;  // $25k per crossing
    crossing_costs_["railway"] = 50000.0;     // $50k per crossing
    crossing_costs_["water_small"] = 15000.0; // $15k per crossing
    crossing_costs_["water_large"] = 100000.0; // $100k per crossing
    
    // Regional multiplier (would be set based on project location)
    regional_multiplier_ = 1.0; // Default (North America baseline)
}

double CostModel::calculate_segment_cost(const State& from_state,
                                         const State& to_state,
                                         const GISDataManager& gis,
                                         RewardInfo* reward_info_out) const {
    // Calculate segment length
    double dx = to_state.x - from_state.x;
    double dy = to_state.y - from_state.y;
    double length = std::sqrt(dx*dx + dy*dy);
    
    // Get average slope for segment
    double avg_slope = (from_state.slope + to_state.slope) / 2.0;
    
    // Get land cover
    int landcover_class = gis.get_land_cover_class(to_state.x, to_state.y);
    
    // Base terrain cost ($/meter)
    double terrain_cost_val = terrain_cost(avg_slope, landcover_class);
    
    // Check for crossings
    double crossing_cost_val = 0.0;
    if (to_state.water_proximity < 0.02) {  // Normalized < 20m
        crossing_cost_val += water_crossing_cost(20.0, 2.0); // Assume 20m width, 2m depth
    }
    if (to_state.road_proximity < 0.01) {  // Normalized < 10m
        crossing_cost_val += road_crossing_cost("major_road");
    }
    
    // Environmental cost
    double env_cost_val = environmental_cost(
        from_state.no_go_zone > 0.5, from_state.water_proximity);
    
    // === NEW COST FACTORS ===
    
    // Geohazard risk penalty (landslide, seismic)
    double geohazard_risk = gis.get_geohazard_risk(to_state.x, to_state.y);
    double geohazard_cost = 0.0;
    if (geohazard_risk > 0.3) {  // Medium to high risk
        // Add cost for geotechnical mitigation
        geohazard_cost = 50.0 * geohazard_risk;  // Up to $50/m extra
    }
    if (geohazard_risk > 0.7) {  // High risk
        // Add cost for advanced engineering
        geohazard_cost += 100.0;  // Additional $100/m for high-risk areas
    }
    
    // Soil bearing capacity penalty
    double soil_capacity = gis.get_soil_bearing_capacity(to_state.x, to_state.y);
    double soil_cost = 0.0;
    if (soil_capacity < 0.5) {  // Poor soil
        // Add cost for foundation enhancement
        soil_cost = 30.0 * (1.0 - soil_capacity);  // Up to $30/m for very poor soil
    }
    
    // Cadastre complexity penalty (difficult ROW acquisition)
    double cadastre_cost = 0.0;
    bool is_complex_cadastre = gis.is_cadastre_complex(to_state.x, to_state.y);
    if (is_complex_cadastre) {
        // Add cost for complex land negotiations
        cadastre_cost = 75.0;  // $75/m extra for complex parcels
    }
    
    // Population density penalty (social impact, permitting complexity)
    double pop_density = gis.get_population_density(to_state.x, to_state.y);
    double social_cost = 0.0;
    if (pop_density > 0.1) {  // Populated areas
        // Add cost for social engagement, permits, route modifications
        social_cost = 40.0 * pop_density;  // Up to $40/m in dense urban areas
    }
    if (pop_density > 0.5) {  // Dense urban
        // Add cost for enhanced safety measures
        social_cost += 60.0;  // Additional $60/m in urban cores
    }
    
    // Cumulative per-meter costs
    double per_meter_cost = terrain_cost_val + env_cost_val + geohazard_cost + 
                           soil_cost + cadastre_cost + social_cost;
    
    // Linear costs (per meter)
    double linear_cost = per_meter_cost * length;
    
    // Point costs (crossings, one-time)
    double point_cost = crossing_cost_val;
    
    // Total segment cost
    double total_cost = linear_cost + point_cost;
    
    // Apply regional multiplier
    total_cost *= regional_multiplier_;
    
    // Store breakdown in RewardInfo if provided
    if (reward_info_out) {
        reward_info_out->terrain_cost = terrain_cost_val * length * regional_multiplier_;
        reward_info_out->water_crossing_cost = (to_state.water_proximity < 0.02) ? 
            water_crossing_cost(20.0, 2.0) * regional_multiplier_ : 0.0;
        
        // Infrastructure crossing costs (roads, railways, powerlines)
        double infra_cost = 0.0;
        
        // Road crossing
        if (to_state.road_proximity < 0.01) {  // < 10m = crossing
            infra_cost += road_crossing_cost("major_road") * regional_multiplier_;
        }
        
        // Railway crossing - MUST use HDD (Criteria 12: trenchless crossing)
        if (to_state.railway_proximity < 0.003) {  // < 3m = crossing railway corridor
            // HDD costs are significantly higher than open cut
            // Typical HDD: $500-2000/m depending on diameter, geology, length
            // For 660mm pipe at ~100m crossing: $150k-$300k
            double hdd_cost_railway = 250000.0;  // $250k for railway HDD crossing
            infra_cost += hdd_cost_railway * regional_multiplier_;
        }
        
        // Powerline crossing - Requires HDD for safety (overhead clearance during construction)
        double powerline_dist_m = gis.distance_to_power_line(to_state.x, to_state.y) * 1000.0;
        if (powerline_dist_m < 2.0) {  // < 2m = crossing powerline corridor
            // HDD required to avoid electrical hazards during construction
            // Shorter crossing than railway, but still expensive
            double hdd_cost_powerline = 150000.0;  // $150k for powerline HDD crossing
            infra_cost += hdd_cost_powerline * regional_multiplier_;
        }
        
        reward_info_out->infrastructure_cost = infra_cost;
        reward_info_out->environmental_cost = (env_cost_val * length + geohazard_cost * length) * regional_multiplier_;
        reward_info_out->row_cost = cadastre_cost * length * regional_multiplier_;
        reward_info_out->permitting_cost = social_cost * length * regional_multiplier_;
        // Hydraulic and regulatory costs will be set separately in PipelineEnvironment
        reward_info_out->hydraulic_cost = 0.0;
        reward_info_out->regulatory_cost = 0.0;
    }
    
    // TODO: Apply client-specific cost weights if configured
    // This would allow different projects to prioritize different factors
    
    return total_cost;
}

double CostModel::terrain_cost(double slope, int land_cover_class) const {
    // Determine terrain difficulty multiplier from slope
    double terrain_mult = 1.0;
    if (slope < 5.0) {
        terrain_mult = terrain_multipliers_.at("flat");
    } else if (slope < 15.0) {
        terrain_mult = terrain_multipliers_.at("rolling");
    } else if (slope < 25.0) {
        terrain_mult = terrain_multipliers_.at("hilly");
    } else if (slope < 35.0) {
        terrain_mult = terrain_multipliers_.at("mountainous");
    } else {
        terrain_mult = terrain_multipliers_.at("steep");
    }
    
    // Get land cover cost
    double lc_cost = 100.0; // Default
    if (landcover_costs_.find(land_cover_class) != landcover_costs_.end()) {
        lc_cost = landcover_costs_.at(land_cover_class);
    }
    
    return lc_cost * terrain_mult;
}

double CostModel::water_crossing_cost(double crossing_width, double depth) const {
    // Simplified water crossing cost model
    if (crossing_width < 30.0) {
        return crossing_costs_.at("water_small");
    } else {
        return crossing_costs_.at("water_large");
    }
}

double CostModel::road_crossing_cost(const std::string& road_type) const {
    if (crossing_costs_.find(road_type) != crossing_costs_.end()) {
        return crossing_costs_.at(road_type);
    }
    return crossing_costs_.at("major_road");
}

double CostModel::railway_crossing_cost() const {
    return crossing_costs_.at("railway");
}

double CostModel::hydraulic_cost(const SegmentHydraulics& hydraulics,
                                 double segment_length_m) const {
    double cost = 0.0;
    
    // Major cost: Compressor station required
    if (hydraulics.has_compressor_station) {
        // Cost depends on power requirement and type
        // Base cost is configurable via parameter overrides
        cost += compressor_base_cost_;
        
        // Add power-based cost (based on compressor_power_kw if available)
        if (hydraulics.compressor_power_kw > 0.0) {
            // CAPEX per kW is configurable
            cost += hydraulics.compressor_power_kw * compressor_power_cost_per_kw_;
        }
    }
    
    // Penalty for suboptimal flow velocity
    // Erosion risk (too fast) - threshold and penalty rate configurable
    if (hydraulics.flow_velocity_m_s > erosion_velocity_threshold_m_s_) {
        // High velocity causes erosion: protective coatings/measures required
        double erosion_factor = (hydraulics.flow_velocity_m_s - erosion_velocity_threshold_m_s_) / 5.0;  // Normalized
        cost += erosion_penalty_per_m_ * erosion_factor * segment_length_m;
    }
    
    // Penalty for very low velocity - risk of liquid dropout in gas lines
    if (hydraulics.flow_velocity_m_s < dropout_velocity_threshold_m_s_ && hydraulics.flow_velocity_m_s > 0.0) {
        // Low velocity allows liquid dropout: enhanced drainage/monitoring required
        double dropout_factor = (dropout_velocity_threshold_m_s_ - hydraulics.flow_velocity_m_s) / dropout_velocity_threshold_m_s_;  // Normalized
        cost += dropout_penalty_per_m_ * dropout_factor * segment_length_m;
    }
    
    // Penalty for high pressure drop (indicates inefficient route)
    if (hydraulics.pressure_drop_bar > excessive_pressure_drop_threshold_bar_) {
        // Excessive pressure drop per segment indicates suboptimal routing
        double excessive_drop = hydraulics.pressure_drop_bar - excessive_pressure_drop_threshold_bar_;
        cost += excessive_drop * excessive_pressure_drop_per_bar_;
    }
    
    return cost;
}

double CostModel::environmental_cost(bool is_protected_area, 
                                    double buffer_distance) const {
    if (is_protected_area) {
        return 500.0; // High cost per meter in protected areas
    }
    if (buffer_distance < 50.0) {
        return 200.0; // Moderate cost near protected areas
    }
    return 0.0;
}

double CostModel::row_acquisition_cost(int land_cover_class, 
                                      const std::string& region) const {
    // Simplified ROW cost (would be much more complex in reality)
    return 50.0; // $50/meter average
}

double CostModel::apply_regional_multiplier(double base_cost) const {
    return base_cost * regional_multiplier_;
}

double CostModel::apply_client_criteria(double base_cost, 
                                       const std::map<std::string, double>& criteria_scores) const {
    // Apply client-specific adjustments
    // For now, just return base cost
    // TODO: Implement client criteria scoring
    return base_cost;
}

// ============================================================================
// PHYSICS CONSTRAINTS IMPLEMENTATION
// ============================================================================

PhysicsConstraints::PhysicsConstraints(const ProjectConfig& config) 
    : config_(config) {}

bool PhysicsConstraints::is_action_feasible(const State& state, 
                                           const Action& action,
                                           const GISDataManager& gis) const {
    // Calculate new position
    double new_x = state.x + action.step_size * std::cos(state.prev_heading + action.heading_change);
    double new_y = state.y + action.step_size * std::sin(state.prev_heading + action.heading_change);
    
    // Check if within AOI
    if (!gis.is_within_aoi(new_x, new_y)) {
        last_violation_reason = "Position outside AOI";
        return false;
    }
    
    // Check slope limit (uses pipeline specs if available)
    double slope = gis.get_slope(new_x, new_y);
    if (!check_pipeline_slope(slope)) {
        return false;
    }
    
    // Check no-go zones
    if (!check_no_go_zones(new_x, new_y, gis)) {
        last_violation_reason = "Position in no-go zone";
        return false;
    }
    
    // Check pipeline clearances (hard constraints from specs)
    if (!check_pipeline_clearances(new_x, new_y, gis)) {
        return false;
    }
    
    // Check bend angle if applicable
    double angle_deg = std::abs(action.heading_change * 180.0 / M_PI);
    if (angle_deg > 0.1) {  // Only check if there's a significant bend
        if (!check_bend_angle(angle_deg, false)) {  // Assuming non-HDD for now
            return false;
        }
    }
    
    return true;
}

bool PhysicsConstraints::check_slope_limit(double slope) const {
    return slope <= config_.constraints.max_slope_percent;
}

bool PhysicsConstraints::check_curvature_limit(double curvature) const {
    return curvature <= config_.constraints.max_curvature_rad_per_m;
}

bool PhysicsConstraints::check_crossing_angle(double angle, 
                                             const std::string& feature_type) const {
    return angle >= config_.constraints.min_crossing_angle_deg;
}

bool PhysicsConstraints::check_no_go_zones(double x, double y, 
                                          const GISDataManager& gis) const {
    return !gis.is_no_go_zone(x, y);
}

double PhysicsConstraints::slope_penalty(double slope) const {
    if (slope <= config_.constraints.max_slope_percent) {
        return 0.0;
    }
    // Exponential penalty for exceeding slope limit
    double excess = slope - config_.constraints.max_slope_percent;
    return -10.0 * excess;
}

double PhysicsConstraints::curvature_penalty(double curvature) const {
    if (curvature <= config_.constraints.max_curvature_rad_per_m) {
        return 0.0;
    }
    double excess = curvature - config_.constraints.max_curvature_rad_per_m;
    return -100.0 * excess;
}

double PhysicsConstraints::crossing_angle_penalty(double angle) const {
    if (angle >= config_.constraints.min_crossing_angle_deg) {
        return 0.0;
    }
    double deficit = config_.constraints.min_crossing_angle_deg - angle;
    return -5.0 * deficit;
}

// ============================================================================
// PIPELINE SPECIFICATION HARD CONSTRAINTS (NEW)
// ============================================================================

bool PhysicsConstraints::check_pipeline_clearances(double x, double y, const GISDataManager& gis) const {
    if (!config_.has_pipeline_specs) {
        return true;  // No specs loaded, skip check
    }
    
    const auto& specs = config_.pipeline_specs;
    
    // Check clearance from power lines
    double dist_to_powerline = gis.distance_to_power_line(x, y);
    if (dist_to_powerline < specs.powerlines_min_distance_m) {
        last_violation_reason = "Clearance violation: Too close to power lines (" + 
                               std::to_string(dist_to_powerline) + "m < " + 
                               std::to_string(specs.powerlines_min_distance_m) + "m)";
        return false;
    }
    
    // Check clearance from existing pipelines
    double dist_to_pipeline = gis.distance_to_pipeline(x, y);
    if (dist_to_pipeline < 5.0) {  // Minimum 5m from existing pipelines
        last_violation_reason = "Clearance violation: Too close to existing pipeline (" + 
                               std::to_string(dist_to_pipeline) + "m < 5.0m)";
        return false;
    }
    
    // TODO: Add house clearance check when building footprint data is available
    
    return true;
}

bool PhysicsConstraints::check_pipeline_slope(double slope) const {
    if (!config_.has_pipeline_specs) {
        return check_slope_limit(slope);  // Fall back to general constraint
    }
    
    const auto& specs = config_.pipeline_specs;
    if (!specs.validate_slope(slope)) {
        last_violation_reason = "Slope violation: " + std::to_string(slope) + "% > " + 
                               std::to_string(specs.max_slope_percent) + "%";
        return false;
    }
    
    return true;
}

bool PhysicsConstraints::check_bend_angle(double angle_deg, bool is_hdd_section) const {
    if (!config_.has_pipeline_specs) {
        return true;  // No specs, skip check
    }
    
    const auto& specs = config_.pipeline_specs;
    
    // For HDD sections, use HDD radius constraint
    // For regular sections, check if angle matches available hot bend angles
    if (is_hdd_section) {
        // Convert angle to radius (simplified - would need actual calculation)
        // For now, just check if angle is reasonable for HDD
        if (angle_deg > 45.0) {  // Sharp bends not allowed in HDD
            last_violation_reason = "HDD bend angle too sharp: " + std::to_string(angle_deg) + "° > 45°";
            return false;
        }
    } else {
        // Check if field bend (< 5°) or hot bend (must match available angles)
        if (angle_deg <= specs.field_bend_max_angle_deg) {
            return true;  // Field bend is OK
        }
        
        // Must be a hot bend - check if angle is available
        if (!specs.validate_hot_bend_angle(angle_deg)) {
            last_violation_reason = "Bend angle " + std::to_string(angle_deg) + 
                                   "° does not match available hot bend angles";
            return false;
        }
    }
    
    return true;
}

bool PhysicsConstraints::check_hot_bend_count(int current_count) const {
    if (!config_.has_pipeline_specs) {
        return true;  // No limit if specs not loaded
    }
    
    const auto& specs = config_.pipeline_specs;
    if (!specs.validate_hot_bend_count(current_count)) {
        last_violation_reason = "Hot bend count " + std::to_string(current_count) + 
                               " exceeds maximum " + std::to_string(specs.hot_bend_max_count);
        return false;
    }
    
    return true;
}

// ============================================================================
// TO BE CONTINUED IN PART 2...
// ============================================================================
void CostModel::apply_parameter_overrides(const nlohmann::json& overrides) {
    std::cout << "   ⚙️  Applying cost matrix and hydraulic cost overrides..." << std::endl;
    
    int override_count = 0;
    
    // Apply cost matrix overrides
    if (overrides.contains("cost_matrix")) {
        auto cost_matrix = overrides["cost_matrix"];
        
        // Terrain multipliers
        if (cost_matrix.contains("terrain_multipliers")) {
            auto terrain = cost_matrix["terrain_multipliers"];
            for (auto it = terrain.begin(); it != terrain.end(); ++it) {
                std::string key = it.key();
                double value = it.value().get<double>();
                if (terrain_multipliers_.count(key)) {
                    terrain_multipliers_[key] = value;
                    override_count++;
                }
            }
        }
        
        // Land cover costs
        if (cost_matrix.contains("landcover_costs")) {
            auto landcover = cost_matrix["landcover_costs"];
            for (auto it = landcover.begin(); it != landcover.end(); ++it) {
                int key = std::stoi(it.key());
                double value = it.value().get<double>();
                landcover_costs_[key] = value;
                override_count++;
            }
        }
        
        // Infrastructure costs
        if (cost_matrix.contains("infrastructure_costs")) {
            auto infra = cost_matrix["infrastructure_costs"];
            for (auto it = infra.begin(); it != infra.end(); ++it) {
                std::string key = it.key();
                double value = it.value().get<double>();
                crossing_costs_[key] = value;
                override_count++;
            }
        }
    }
    
    // Apply hydraulic cost overrides
    if (overrides.contains("hydraulic_costs")) {
        auto hydraulic = overrides["hydraulic_costs"];
        
        if (hydraulic.contains("compressor_base_cost")) {
            compressor_base_cost_ = hydraulic["compressor_base_cost"].get<double>();
            override_count++;
        }
        
        if (hydraulic.contains("compressor_power_cost_per_kw")) {
            compressor_power_cost_per_kw_ = hydraulic["compressor_power_cost_per_kw"].get<double>();
            override_count++;
        }
        
        if (hydraulic.contains("erosion_velocity_threshold_m_s")) {
            erosion_velocity_threshold_m_s_ = hydraulic["erosion_velocity_threshold_m_s"].get<double>();
            override_count++;
        }
        
        if (hydraulic.contains("erosion_penalty_per_m")) {
            erosion_penalty_per_m_ = hydraulic["erosion_penalty_per_m"].get<double>();
            override_count++;
        }
        
        if (hydraulic.contains("dropout_velocity_threshold_m_s")) {
            dropout_velocity_threshold_m_s_ = hydraulic["dropout_velocity_threshold_m_s"].get<double>();
            override_count++;
        }
        
        if (hydraulic.contains("dropout_penalty_per_m")) {
            dropout_penalty_per_m_ = hydraulic["dropout_penalty_per_m"].get<double>();
            override_count++;
        }
        
        if (hydraulic.contains("excessive_pressure_drop_threshold_bar")) {
            excessive_pressure_drop_threshold_bar_ = hydraulic["excessive_pressure_drop_threshold_bar"].get<double>();
            override_count++;
        }
        
        if (hydraulic.contains("excessive_pressure_drop_per_bar")) {
            excessive_pressure_drop_per_bar_ = hydraulic["excessive_pressure_drop_per_bar"].get<double>();
            override_count++;
        }
    }
    
    std::cout << "      Cost model overrides applied (" << override_count << " parameters)" << std::endl;
}

// Remaining implementations:
// - PipelineEnvironment (full Gymnasium interface)
// - PIRLAgent (Python integration)
// - ProjectConfig (YAML loading/saving)
// - Training utilities
// - Export utilities

} // namespace pirl
} // namespace agrs

