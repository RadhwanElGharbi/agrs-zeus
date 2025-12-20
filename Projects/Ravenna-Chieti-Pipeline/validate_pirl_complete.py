#!/usr/bin/env python3
"""
Comprehensive PIRL Pre-Training Validation
Validates all components before starting training.
"""
import sys
import json
from pathlib import Path
from typing import Dict, List, Tuple

def check_file_exists(path: Path, name: str) -> Tuple[bool, str]:
    """Check if a file exists and return status."""
    if path.exists():
        size = path.stat().st_size
        if size == 0:
            return False, f"❌ {name}: EXISTS BUT EMPTY"
        return True, f"✅ {name}: {size:,} bytes"
    return False, f"❌ {name}: MISSING"

def check_raster_datasets():
    """Validate all 5 required raster datasets."""
    print("=" * 70)
    print("1. RASTER DATASETS (5 required)")
    print("=" * 70)
    
    rasters_dir = Path("data/rasters/processed")
    required_rasters = {
        "DEM": "dem_epsg32633_processed.tif",
        "Land Cover": "landcover_epsg32633_processed.tif",
        "Geohazards": "geohazards_epsg32633_processed.tif",
        "Soil": "soil_epsg32633_processed.tif",
        "Population": "population_epsg32633_processed.tif",
    }
    
    all_ok = True
    for name, filename in required_rasters.items():
        path = rasters_dir / filename
        ok, msg = check_file_exists(path, name)
        print(f"  {msg}")
        if not ok:
            all_ok = False
    
    return all_ok

def check_vector_datasets():
    """Validate all 7 required vector datasets."""
    print("\n" + "=" * 70)
    print("2. VECTOR DATASETS (7 required)")
    print("=" * 70)
    
    try:
        from osgeo import ogr
    except ImportError:
        print("  ⚠️  GDAL not available, skipping feature counts")
        return True
    
    vectors_dir = Path("data/vectors/processed")
    required_vectors = {
        "AOI": "aoi_epsg32633_processed.gpkg",
        "Water Bodies": "osm_waterways_epsg32633_processed.gpkg",
        "Roads": "osm_roads_epsg32633_processed.gpkg",
        "Railways": "osm_railways_epsg32633_processed.gpkg",
        "Power Lines": "osm_power_lines_epsg32633_processed.gpkg",
        "Protected Areas": "protected_areas_epsg32633_processed.gpkg",
        "Pipelines": "pipelines_epsg32633_processed.gpkg",
    }
    
    all_ok = True
    total_features = 0
    
    for name, filename in required_vectors.items():
        path = vectors_dir / filename
        if not path.exists():
            print(f"  ❌ {name}: MISSING")
            all_ok = False
            continue
        
        # Get feature count
        try:
            ds = ogr.Open(str(path))
            if ds:
                layer = ds.GetLayer(0)
                count = layer.GetFeatureCount()
                total_features += count
                
                if count == 0:
                    if name in ["Protected Areas"]:
                        print(f"  ⚠️  {name}: 0 features (acceptable for rural area)")
                    else:
                        print(f"  ⚠️  {name}: 0 features (may need data)")
                else:
                    print(f"  ✅ {name}: {count:,} features")
                ds = None
            else:
                print(f"  ❌ {name}: Cannot open file")
                all_ok = False
        except Exception as e:
            print(f"  ❌ {name}: Error reading - {e}")
            all_ok = False
    
    print(f"\n  Total Features: {total_features:,}")
    return all_ok

def check_pipeline_specs():
    """Validate pipeline specifications."""
    print("\n" + "=" * 70)
    print("3. PIPELINE SPECIFICATIONS")
    print("=" * 70)
    
    specs_path = Path("pipeline_specs.json")
    if not specs_path.exists():
        print("  ❌ pipeline_specs.json: MISSING")
        return False
    
    try:
        with open(specs_path) as f:
            specs = json.load(f)
        
        required_fields = [
            "type", "material", "diameter_mm", "wall_thickness_mm",
            "mop_pa", "dp_pa", "depth_of_cover_m", "operating_temp_k",
            "field_bend_max_angle_deg", "hot_bend_angles_deg",
            "hdd_min_radius_m", "hot_bend_max_count",
            "powerlines_min_distance_m", "existing_pipelines_min_distance_m",
            "houses_min_distance_m", "max_slope_percent"
        ]
        
        missing = [f for f in required_fields if f not in specs]
        if missing:
            print(f"  ❌ Missing fields: {', '.join(missing)}")
            return False
        
        print(f"  ✅ All required fields present")
        print(f"  ✅ Type: {specs['type']}, Material: {specs['material']}")
        print(f"  ✅ Diameter: {specs['diameter_mm']}mm, MOP: {specs.get('mop_pa', specs.get('mop_bar', 0))/1e5:.0f} bar")
        print(f"  ✅ Max Slope: {specs['max_slope_percent']}%")
        print(f"  ✅ Operating Temp: {specs['operating_temp_k']}K")
        
        return True
    except Exception as e:
        print(f"  ❌ Error reading specs: {e}")
        return False

def check_pirl_config():
    """Validate PIRL training configuration."""
    print("\n" + "=" * 70)
    print("4. PIRL TRAINING CONFIGURATION")
    print("=" * 70)
    
    config_path = Path("PIRL/pirl_training_config.yaml")
    if not config_path.exists():
        print("  ❌ pirl_training_config.yaml: MISSING")
        return False
    
    try:
        import yaml
        with open(config_path) as f:
            config = yaml.safe_load(f)
        
        # Check key sections
        required_sections = ["project", "cost_weights", "constraints", "training"]
        missing = [s for s in required_sections if s not in config]
        if missing:
            print(f"  ❌ Missing sections: {', '.join(missing)}")
            return False
        
        print(f"  ✅ All required sections present")
        
        # Validate cost weights sum to ~1.0
        if "cost_weights" in config:
            weights = config["cost_weights"]
            total = sum([
                weights.get("terrain_difficulty", 0),
                weights.get("water_crossings", 0),
                weights.get("infrastructure_crossings", 0),
                weights.get("environmental_impact", 0),
                weights.get("row_acquisition", 0),
                weights.get("permitting_complexity", 0),
                weights.get("hydraulic_costs", 0),
                weights.get("regulatory_penalties", 0),
            ])
            print(f"  ✅ Cost weights sum: {total:.2f} (should be ~1.0)")
            if abs(total - 1.0) > 0.05:
                print(f"  ⚠️  Weights don't sum to 1.0 (off by {abs(total-1.0):.2f})")
        
        # Check training params
        if "training" in config:
            training = config["training"]
            print(f"  ✅ Total timesteps: {training.get('total_timesteps', 'N/A'):,}")
            print(f"  ✅ Learning rate: {training.get('learning_rate', 'N/A')}")
            print(f"  ✅ Batch size: {training.get('n_steps', 'N/A')}")
        
        return True
    except ImportError:
        print("  ⚠️  PyYAML not available, skipping detailed validation")
        print(f"  ✅ Config file exists ({config_path.stat().st_size:,} bytes)")
        return True
    except Exception as e:
        print(f"  ❌ Error reading config: {e}")
        return False

def check_python_environment():
    """Validate Python environment and dependencies."""
    print("\n" + "=" * 70)
    print("5. PYTHON ENVIRONMENT")
    print("=" * 70)
    
    # Check Python version
    print(f"  ✅ Python: {sys.version.split()[0]}")
    
    # Check critical packages
    packages = {
        "numpy": "NumPy",
        "gymnasium": "Gymnasium (RL environment)",
        "stable_baselines3": "Stable-Baselines3 (PPO)",
        "torch": "PyTorch",
        "pirl_native": "PIRL Native (C++ bindings)",
    }
    
    all_ok = True
    for module, name in packages.items():
        try:
            if module == "pirl_native":
                sys.path.insert(0, "/opt/agrs/python/pirl_training")
            __import__(module)
            print(f"  ✅ {name}")
        except ImportError:
            print(f"  ❌ {name}: NOT INSTALLED")
            all_ok = False
    
    return all_ok

def check_cpp_backend():
    """Validate C++ backend compilation."""
    print("\n" + "=" * 70)
    print("6. C++ BACKEND")
    print("=" * 70)
    
    # Check if pirl_native module loads
    try:
        sys.path.insert(0, "/opt/agrs/python/pirl_training")
        import pirl_native
        print("  ✅ pirl_native module loads")
        
        # Check if key classes are available
        if hasattr(pirl_native, "PipelineEnvironment"):
            print("  ✅ PipelineEnvironment class available")
        else:
            print("  ❌ PipelineEnvironment class not found")
            return False
        
        if hasattr(pirl_native, "State"):
            print("  ✅ State struct available")
        else:
            print("  ❌ State struct not found")
            return False
        
        return True
    except Exception as e:
        print(f"  ❌ Error loading pirl_native: {e}")
        return False

def check_project_metadata():
    """Validate project metadata."""
    print("\n" + "=" * 70)
    print("7. PROJECT METADATA")
    print("=" * 70)
    
    metadata_path = Path("project_metadata.json")
    if not metadata_path.exists():
        print("  ❌ project_metadata.json: MISSING")
        return False
    
    try:
        with open(metadata_path) as f:
            metadata = json.load(f)
        
        print(f"  ✅ Project: {metadata.get('project_name', 'N/A')}")
        print(f"  ✅ CRS: EPSG:{metadata.get('crs_epsg', 'N/A')}")
        
        if metadata.get('crs_epsg') != 32633:
            print(f"  ⚠️  CRS is not EPSG:32633 (should be UTM 33N)")
        
        return True
    except Exception as e:
        print(f"  ❌ Error reading metadata: {e}")
        return False

def check_aoi():
    """Validate AOI definition."""
    print("\n" + "=" * 70)
    print("8. AREA OF INTEREST (AOI)")
    print("=" * 70)
    
    aoi_json = Path("aoi/project_aoi.json")
    if not aoi_json.exists():
        print("  ❌ project_aoi.json: MISSING")
        return False
    
    try:
        with open(aoi_json) as f:
            aoi = json.load(f)
        
        start = aoi.get("start_point", {})
        end = aoi.get("end_point", {})
        
        print(f"  ✅ Start: {start.get('latitude', 'N/A')}°N, {start.get('longitude', 'N/A')}°E")
        print(f"  ✅ End: {end.get('latitude', 'N/A')}°N, {end.get('longitude', 'N/A')}°E")
        
        # Calculate approximate distance
        import math
        if "latitude" in start and "latitude" in end:
            lat1, lon1 = start["latitude"], start["longitude"]
            lat2, lon2 = end["latitude"], end["longitude"]
            
            # Haversine formula (approximate)
            R = 6371  # Earth radius in km
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
            c = 2 * math.asin(math.sqrt(a))
            distance = R * c
            
            print(f"  ✅ Straight-line distance: ~{distance:.1f} km")
        
        return True
    except Exception as e:
        print(f"  ❌ Error reading AOI: {e}")
        return False

def main():
    """Run all validation checks."""
    print("\n" + "╔" + "=" * 68 + "╗")
    print("║" + " " * 15 + "PIRL PRE-TRAINING VALIDATION" + " " * 25 + "║")
    print("╚" + "=" * 68 + "╝\n")
    
    results = {
        "Raster Datasets": check_raster_datasets(),
        "Vector Datasets": check_vector_datasets(),
        "Pipeline Specifications": check_pipeline_specs(),
        "PIRL Configuration": check_pirl_config(),
        "Python Environment": check_python_environment(),
        "C++ Backend": check_cpp_backend(),
        "Project Metadata": check_project_metadata(),
        "AOI Definition": check_aoi(),
    }
    
    # Summary
    print("\n" + "=" * 70)
    print("VALIDATION SUMMARY")
    print("=" * 70)
    
    passed = sum(results.values())
    total = len(results)
    
    for check, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}  {check}")
    
    print(f"\n  Result: {passed}/{total} checks passed")
    
    if passed == total:
        print("\n" + "╔" + "=" * 68 + "╗")
        print("║" + " " * 15 + "✅ ALL CHECKS PASSED - READY TO TRAIN!" + " " * 14 + "║")
        print("╚" + "=" * 68 + "╝\n")
        return 0
    else:
        print("\n" + "╔" + "=" * 68 + "╗")
        print("║" + " " * 10 + "❌ VALIDATION FAILED - FIX ISSUES BEFORE TRAINING" + " " * 9 + "║")
        print("╚" + "=" * 68 + "╝\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
