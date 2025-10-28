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

namespace agrs {
namespace pirl {

// ============================================================================
// STATE IMPLEMENTATION
// ============================================================================

std::vector<float> State::to_vector() const {
    return {
        static_cast<float>(x),
        static_cast<float>(y),
        static_cast<float>(goal_distance),
        static_cast<float>(goal_bearing),
        static_cast<float>(elevation),
        static_cast<float>(slope),
        static_cast<float>(aspect),
        static_cast<float>(curvature),
        static_cast<float>(no_go_zone),
        static_cast<float>(water_proximity),
        static_cast<float>(road_proximity),
        static_cast<float>(geohazard_risk),
        static_cast<float>(soil_capacity),
        static_cast<float>(cadastre_complex),
        static_cast<float>(population_density),
        static_cast<float>(railway_proximity),
        static_cast<float>(prev_heading)
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
    // Clamp heading change to reasonable limits
    heading_change = std::clamp(heading_change, -M_PI / 4.0, M_PI / 4.0);
    
    // Clamp step size
    step_size = std::clamp(step_size, 10.0, 100.0);
    
    // Additional physics-based constraints would go here
    // (e.g., reduce step size if slope is high)
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
    landcover_costs_[80] = 500.0;  // Permanent water bodies
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
                                         const GISDataManager& gis) const {
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
        return false;
    }
    
    // Check slope limit
    double slope = gis.get_slope(new_x, new_y);
    if (!check_slope_limit(slope)) {
        return false;
    }
    
    // Check no-go zones
    if (!check_no_go_zones(new_x, new_y, gis)) {
        return false;
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
// TO BE CONTINUED IN PART 2...
// ============================================================================
// Remaining implementations:
// - PipelineEnvironment (full Gymnasium interface)
// - PIRLAgent (Python integration)
// - ProjectConfig (YAML loading/saving)
// - Training utilities
// - Export utilities

} // namespace pirl
} // namespace agrs

