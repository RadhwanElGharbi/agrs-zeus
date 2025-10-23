#pragma once
#include <string>
#include <vector>
#include <map>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <filesystem>
#include <iostream>

namespace agrs {
namespace tools {

// ============================================================================
// DATASET STRUCTURES
// ============================================================================

// DEM-specific dataset structure (for backward compatibility with dem_fetch)
struct DEMDataset {
    std::string country;
    std::string country_code;
    std::string dataset_name;
    std::string provider;
    int resolution_m;
    std::string coverage;
    std::string data_format;
    std::string implementation_status;
    std::string fetch_tool;
    std::string url;
    std::string license;
    std::string notes;
    
    // Helper to get resolution as string (for compatibility)
    std::string get_resolution() const {
        return std::to_string(resolution_m) + "m";
    }
};

// Generic dataset structure (for all other categories)
struct Dataset {
    std::string country;
    std::string country_code;
    std::string dataset_name;
    std::string provider;
    std::string resolution; // Can be "Vector", "10", "30", etc.
    std::string data_type;  // "Vector", "Raster", "Raster/Vector"
    std::string coverage;
    std::string fetch_tool;
    std::string license;
    std::string update_frequency;
    std::string notes;
    
    // Helper to get numeric resolution (returns 0 for vector data)
    int get_resolution_m() const {
        if (resolution == "Vector" || resolution == "Variable" || resolution == "Point") {
            return 0;
        }
        try {
            // Handle ranges like "1-2"
            if (resolution.find("-") != std::string::npos) {
                return std::stoi(resolution.substr(0, resolution.find("-")));
            }
            // Handle decimals like "0.5"
            if (resolution.find(".") != std::string::npos) {
                return (int)(std::stof(resolution));
            }
            return std::stoi(resolution);
        } catch (...) {
            return 0;
        }
    }
};

// Generic country detection (shared across all routers)
inline std::string get_country_from_coords(double lon, double lat) {
    // TIER 1 OIL & GAS COUNTRIES
    
    // USA (including Alaska)
    if (lon >= -180.0 && lon <= -66.9 && lat >= 24.4 && lat <= 71.4) return "US";
    
    // UAE (check before Saudi Arabia due to overlap)
    if (lon >= 51.5 && lon <= 56.4 && lat >= 22.6 && lat <= 26.1) return "AE";
    
    // Kuwait (check before Saudi Arabia due to overlap)
    if (lon >= 46.5 && lon <= 48.5 && lat >= 28.5 && lat <= 30.1) return "KW";
    
    // Qatar (check before Saudi Arabia due to overlap)
    if (lon >= 50.7 && lon <= 51.7 && lat >= 24.5 && lat <= 26.2) return "QA";
    
    // Oman (check before Saudi Arabia due to overlap)
    if (lon >= 51.8 && lon <= 59.8 && lat >= 16.6 && lat <= 26.4) return "OM";
    
    // Saudi Arabia (larger bounding box, check after smaller Gulf states)
    if (lon >= 34.5 && lon <= 55.7 && lat >= 16.3 && lat <= 32.2) return "SA";
    
    // Russia
    if (lon >= 19.6 && lon <= 190.0 && lat >= 41.2 && lat <= 81.9) return "RU";
    
    // Canada
    if (lon >= -141.0 && lon <= -52.6 && lat >= 41.7 && lat <= 83.1) return "CA";
    
    // Iraq
    if (lon >= 38.8 && lon <= 48.6 && lat >= 29.1 && lat <= 37.4) return "IQ";
    
    // China
    if (lon >= 73.5 && lon <= 135.1 && lat >= 18.2 && lat <= 53.6) return "CN";
    
    // Iran
    if (lon >= 44.0 && lon <= 63.3 && lat >= 25.1 && lat <= 39.8) return "IR";
    
    // Brazil
    if (lon >= -73.9 && lon <= -34.7 && lat >= -33.7 && lat <= 5.3) return "BR";
    
    // Venezuela
    if (lon >= -73.3 && lon <= -59.8 && lat >= 0.7 && lat <= 12.2) return "VE";
    
    // Norway
    if (lon >= 4.5 && lon <= 31.1 && lat >= 57.9 && lat <= 71.2) return "NO";
    
    // Mexico
    if (lon >= -118.4 && lon <= -86.7 && lat >= 14.5 && lat <= 32.7) return "MX";
    
    // Nigeria
    if (lon >= 2.7 && lon <= 14.7 && lat >= 4.3 && lat <= 13.9) return "NG";
    
    // Algeria
    if (lon >= -8.7 && lon <= 12.0 && lat >= 18.9 && lat <= 37.1) return "DZ";
    
    // Angola
    if (lon >= 11.7 && lon <= 24.1 && lat >= -18.0 && lat <= -4.4) return "AO";
    
    // Libya
    if (lon >= 9.4 && lon <= 25.2 && lat >= 19.5 && lat <= 33.2) return "LY";
    
    // Kazakhstan
    if (lon >= 46.5 && lon <= 87.3 && lat >= 40.6 && lat <= 55.4) return "KZ";
    
    // Australia
    if (lon >= 112.9 && lon <= 153.6 && lat >= -43.6 && lat <= -10.4) return "AU";
    
    // Indonesia
    if (lon >= 95.0 && lon <= 141.0 && lat >= -11.0 && lat <= 6.0) return "ID";
    
    // Malaysia
    if (lon >= 99.6 && lon <= 119.3 && lat >= 0.9 && lat <= 7.4) return "MY";
    
    // Azerbaijan
    if (lon >= 44.8 && lon <= 50.4 && lat >= 38.4 && lat <= 41.9) return "AZ";
    
    // Egypt
    if (lon >= 24.7 && lon <= 36.9 && lat >= 22.0 && lat <= 31.7) return "EG";
    
    // EUROPEAN UNION COUNTRIES
    
    // Italy
    if (lon >= 6.6 && lon <= 18.5 && lat >= 36.0 && lat <= 47.1) return "IT";
    
    // France
    if (lon >= -5.0 && lon <= 9.6 && lat >= 41.3 && lat <= 51.1) return "FR";
    
    // Germany
    if (lon >= 5.9 && lon <= 15.0 && lat >= 47.3 && lat <= 55.1) return "DE";
    
    // Spain
    if (lon >= -18.2 && lon <= 4.3 && lat >= 27.6 && lat <= 43.8) return "ES";
    
    // UK
    if (lon >= -8.6 && lon <= 1.8 && lat >= 49.9 && lat <= 60.8) return "GB";
    
    // Netherlands
    if (lon >= 3.4 && lon <= 7.2 && lat >= 50.7 && lat <= 53.5) return "NL";
    
    // Belgium
    if (lon >= 2.5 && lon <= 6.4 && lat >= 49.5 && lat <= 51.5) return "BE";
    
    // Switzerland
    if (lon >= 6.0 && lon <= 10.5 && lat >= 45.8 && lat <= 47.8) return "CH";
    
    // Austria
    if (lon >= 9.5 && lon <= 17.2 && lat >= 46.4 && lat <= 49.0) return "AT";
    
    // Sweden
    if (lon >= 11.1 && lon <= 24.2 && lat >= 55.3 && lat <= 69.1) return "SE";
    
    // Denmark
    if (lon >= 8.1 && lon <= 15.2 && lat >= 54.5 && lat <= 57.8) return "DK";
    
    // Finland
    if (lon >= 19.5 && lon <= 31.6 && lat >= 59.7 && lat <= 70.1) return "FI";
    
    // Poland
    if (lon >= 14.1 && lon <= 24.1 && lat >= 49.0 && lat <= 54.8) return "PL";
    
    // Czech Republic
    if (lon >= 12.1 && lon <= 18.9 && lat >= 48.6 && lat <= 51.1) return "CZ";
    
    // Portugal
    if (lon >= -9.5 && lon <= -6.2 && lat >= 36.9 && lat <= 42.2) return "PT";
    
    // Greece
    if (lon >= 19.4 && lon <= 28.2 && lat >= 34.8 && lat <= 41.7) return "GR";
    
    // Ireland
    if (lon >= -10.5 && lon <= -6.0 && lat >= 51.4 && lat <= 55.4) return "IE";
    
    // Romania
    if (lon >= 20.3 && lon <= 29.7 && lat >= 43.6 && lat <= 48.3) return "RO";
    
    // Hungary
    if (lon >= 16.1 && lon <= 22.9 && lat >= 45.7 && lat <= 48.6) return "HU";
    
    // Bulgaria
    if (lon >= 22.4 && lon <= 28.6 && lat >= 41.2 && lat <= 44.2) return "BG";
    
    // Croatia
    if (lon >= 13.5 && lon <= 19.4 && lat >= 42.4 && lat <= 46.5) return "HR";
    
    // Slovenia
    if (lon >= 13.4 && lon <= 16.6 && lat >= 45.4 && lat <= 46.9) return "SI";
    
    // Slovakia
    if (lon >= 16.8 && lon <= 22.6 && lat >= 47.7 && lat <= 49.6) return "SK";
    
    // Lithuania
    if (lon >= 20.9 && lon <= 26.8 && lat >= 53.9 && lat <= 56.4) return "LT";
    
    // Latvia
    if (lon >= 20.9 && lon <= 28.2 && lat >= 55.6 && lat <= 58.1) return "LV";
    
    // Estonia
    if (lon >= 21.8 && lon <= 28.2 && lat >= 57.5 && lat <= 59.7) return "EE";
    
    // Luxembourg
    if (lon >= 5.7 && lon <= 6.5 && lat >= 49.4 && lat <= 50.2) return "LU";
    
    // Malta
    if (lon >= 14.2 && lon <= 14.6 && lat >= 35.8 && lat <= 36.1) return "MT";
    
    // Cyprus
    if (lon >= 32.3 && lon <= 34.6 && lat >= 34.6 && lat <= 35.7) return "CY";
    
    return "GLOBAL"; // Fallback to global datasets
}

// Generic dataset router template
template<typename DatasetType = Dataset>
class DatasetRouter {
private:
    std::vector<DatasetType> datasets;
    std::map<std::string, std::vector<DatasetType>> by_country;
    std::string inventory_path;
    std::string category_name;
    
    void load_inventory() {
        if (!std::filesystem::exists(inventory_path)) {
            std::cerr << "Warning: " << category_name << " inventory not found at " << inventory_path << std::endl;
            return;
        }
        
        std::ifstream file(inventory_path);
        std::string line;
        
        // Skip header
        std::getline(file, line);
        
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '#') continue;
            
            std::stringstream ss(line);
            std::string field;
            std::vector<std::string> fields;
            
            // Handle CSV with potential quoted fields
            bool in_quotes = false;
            std::string current_field;
            
            for (char c : line) {
                if (c == '"') {
                    in_quotes = !in_quotes;
                } else if (c == ',' && !in_quotes) {
                    fields.push_back(current_field);
                    current_field.clear();
                } else {
                    current_field += c;
                }
            }
            fields.push_back(current_field);
            
            if (fields.size() >= 11) {
                DatasetType ds;
                ds.country = fields[0];
                ds.country_code = fields[1];
                ds.dataset_name = fields[2];
                ds.provider = fields[3];
                ds.resolution = fields[4];
                ds.data_type = fields[5];
                ds.coverage = fields[6];
                ds.fetch_tool = fields[7];
                ds.license = fields[8];
                ds.update_frequency = fields[9];
                ds.notes = fields[10];
                
                datasets.push_back(ds);
                by_country[ds.country_code].push_back(ds);
                by_country[ds.country].push_back(ds);
            }
        }
    }
    
public:
    DatasetRouter(const std::string& inv_path, const std::string& cat_name) 
        : inventory_path(inv_path), category_name(cat_name) {
        load_inventory();
    }
    
    DatasetType find_best_dataset(double lon, double lat, const std::string& prefer_type = "") {
        std::string country = get_country_from_coords(lon, lat);
        
        std::cout << "📍 Location: " << lat << "°N, " << lon << "°E" << std::endl;
        std::cout << "🗺️  Detected Country/Region: " << country << std::endl;
        std::cout << "📦 Category: " << category_name << std::endl;
        if (!prefer_type.empty()) {
            std::cout << "🎯 Preferred Type: " << prefer_type << std::endl;
        }
        std::cout << std::endl;
        
        // Get datasets for this country
        std::vector<DatasetType> candidates;
        
        if (by_country.find(country) != by_country.end()) {
            candidates = by_country[country];
        }
        
        // Add global fallbacks
        if (by_country.find("GLOBAL") != by_country.end()) {
            auto global_ds = by_country["GLOBAL"];
            candidates.insert(candidates.end(), global_ds.begin(), global_ds.end());
        }
        
        if (candidates.empty()) {
            std::cerr << "❌ No " << category_name << " datasets found for location" << std::endl;
            return DatasetType();
        }
        
        // Filter by preferred type if specified
        if (!prefer_type.empty()) {
            std::vector<DatasetType> type_filtered;
            for (const auto& ds : candidates) {
                if (ds.data_type.find(prefer_type) != std::string::npos) {
                    type_filtered.push_back(ds);
                }
            }
            if (!type_filtered.empty()) {
                candidates = type_filtered;
            }
        }
        
        // Prioritize implemented tools (not marked as "(guidance)")
        std::vector<DatasetType> implemented;
        for (const auto& ds : candidates) {
            if (ds.fetch_tool.find("(guidance)") == std::string::npos && 
                ds.fetch_tool != "not_implemented" &&
                ds.fetch_tool != "guidance") {
                implemented.push_back(ds);
            }
        }
        
        if (implemented.empty()) {
            std::cout << "⚠️  No fully implemented " << category_name << " datasets for " << country << std::endl;
            std::cout << "Available datasets (guidance/not implemented):" << std::endl;
            for (size_t i = 0; i < std::min(candidates.size(), (size_t)5); i++) {
                const auto& ds = candidates[i];
                std::cout << "  • " << ds.dataset_name << " - " << ds.provider 
                          << " [" << ds.fetch_tool << "]" << std::endl;
            }
            std::cout << std::endl;
            
            // Return best candidate even if not implemented
            if (!candidates.empty()) {
                return candidates[0];
            }
            return DatasetType();
        }
        
        // Sort by resolution (prefer finer for rasters)
        std::sort(implemented.begin(), implemented.end(), 
                  [](const DatasetType& a, const DatasetType& b) {
                      int res_a = a.get_resolution_m();
                      int res_b = b.get_resolution_m();
                      
                      // Prefer implemented over guidance
                      bool a_impl = a.fetch_tool.find("(guidance)") == std::string::npos;
                      bool b_impl = b.fetch_tool.find("(guidance)") == std::string::npos;
                      if (a_impl != b_impl) return a_impl;
                      
                      // For rasters, prefer finer resolution
                      if (res_a > 0 && res_b > 0) {
                          return res_a < res_b;
                      }
                      
                      // Vector data comes first
                      if (res_a == 0 && res_b > 0) return true;
                      if (res_b == 0 && res_a > 0) return false;
                      
                      return false; // Equal
                  });
        
        DatasetType best = implemented[0];
        
        std::cout << "✅ Selected Dataset:" << std::endl;
        std::cout << "   Name:       " << best.dataset_name << std::endl;
        std::cout << "   Provider:   " << best.provider << std::endl;
        std::cout << "   Resolution: " << best.resolution << std::endl;
        std::cout << "   Type:       " << best.data_type << std::endl;
        std::cout << "   Coverage:   " << best.coverage << std::endl;
        std::cout << "   Tool:       " << best.fetch_tool << std::endl;
        std::cout << "   License:    " << best.license << std::endl;
        if (!best.notes.empty()) {
            std::cout << "   Notes:      " << best.notes << std::endl;
        }
        std::cout << std::endl;
        
        return best;
    }
    
    void list_datasets_for_country(const std::string& country_code) {
        if (by_country.find(country_code) == by_country.end()) {
            std::cout << "No " << category_name << " datasets found for: " << country_code << std::endl;
            return;
        }
        
        auto datasets_list = by_country[country_code];
        
        std::cout << category_name << " Datasets for " << country_code << ":" << std::endl;
        std::cout << std::string(80, '=') << std::endl;
        
        for (const auto& ds : datasets_list) {
            std::cout << "\n📊 " << ds.dataset_name << std::endl;
            std::cout << "   Provider:   " << ds.provider << std::endl;
            std::cout << "   Resolution: " << ds.resolution << std::endl;
            std::cout << "   Type:       " << ds.data_type << std::endl;
            std::cout << "   Coverage:   " << ds.coverage << std::endl;
            std::cout << "   Tool:       " << ds.fetch_tool << std::endl;
            std::cout << "   License:    " << ds.license << std::endl;
            std::cout << "   Update:     " << ds.update_frequency << std::endl;
            if (!ds.notes.empty()) {
                std::cout << "   Notes:      " << ds.notes << std::endl;
            }
        }
        
        std::cout << std::endl;
    }
    
    std::vector<DatasetType> get_all_datasets() const {
        return datasets;
    }
    
    size_t get_dataset_count() const {
        return datasets.size();
    }
};

// ============================================================================
// DEM-SPECIFIC ROUTER (Specialized for backward compatibility)
// ============================================================================

class DEMRouter {
private:
    std::vector<DEMDataset> datasets;
    std::map<std::string, std::vector<DEMDataset>> by_country;
    
    void load_inventory() {
        std::filesystem::path inv_path = "/opt/agrs/data/dem_datasets_inventory.csv";
        
        if (!std::filesystem::exists(inv_path)) {
            std::cerr << "Warning: DEM inventory not found at " << inv_path << std::endl;
            return;
        }
        
        std::ifstream file(inv_path);
        std::string line;
        
        // Skip header
        std::getline(file, line);
        
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '#') continue;
            
            std::stringstream ss(line);
            std::string field;
            std::vector<std::string> fields;
            
            while (std::getline(ss, field, ',')) {
                fields.push_back(field);
            }
            
            if (fields.size() >= 12) {
                DEMDataset ds;
                ds.country = fields[0];
                ds.country_code = fields[1];
                ds.dataset_name = fields[2];
                ds.provider = fields[3];
                try {
                    ds.resolution_m = std::stoi(fields[4]);
                } catch (...) {
                    // Handle non-integer resolutions like "0.5" or "1-2"
                    if (fields[4].find("-") != std::string::npos) {
                        ds.resolution_m = std::stoi(fields[4].substr(0, fields[4].find("-")));
                    } else if (fields[4].find(".") != std::string::npos) {
                        ds.resolution_m = (int)(std::stof(fields[4]));
                    } else {
                        ds.resolution_m = 30;
                    }
                }
                ds.coverage = fields[5];
                ds.data_format = fields[6];
                ds.implementation_status = fields[7];
                ds.fetch_tool = fields[8];
                ds.url = fields[9];
                ds.license = fields[10];
                ds.notes = fields[11];
                
                datasets.push_back(ds);
                by_country[ds.country_code].push_back(ds);
                by_country[ds.country].push_back(ds);
            }
        }
    }
    
public:
    DEMRouter() {
        load_inventory();
    }
    
    DEMDataset find_best_dem(double lon, double lat, int target_resolution_m) {
        std::string country = get_country_from_coords(lon, lat);
        
        std::cout << "📍 Location: " << lat << "°N, " << lon << "°E" << std::endl;
        std::cout << "🗺️  Detected Country/Region: " << country << std::endl;
        std::cout << "🎯 Target Resolution: " << target_resolution_m << "m" << std::endl;
        std::cout << std::endl;
        
        // Get datasets for this country
        std::vector<DEMDataset> candidates;
        
        if (by_country.find(country) != by_country.end()) {
            candidates = by_country[country];
        }
        
        // Add global fallbacks
        if (by_country.find("GLOBAL") != by_country.end()) {
            auto global_ds = by_country["GLOBAL"];
            candidates.insert(candidates.end(), global_ds.begin(), global_ds.end());
        }
        
        if (candidates.empty()) {
            std::cerr << "❌ No DEM datasets found for location" << std::endl;
            return DEMDataset();
        }
        
        // Filter for implemented datasets
        std::vector<DEMDataset> implemented;
        for (const auto& ds : candidates) {
            if (ds.implementation_status == "implemented") {
                implemented.push_back(ds);
            }
        }
        
        if (implemented.empty()) {
            std::cout << "⚠️  No fully implemented DEM datasets for " << country << std::endl;
            std::cout << "Available datasets (not yet implemented):" << std::endl;
            for (const auto& ds : candidates) {
                if (ds.resolution_m <= target_resolution_m * 2) {
                    std::cout << "  • " << ds.dataset_name << " (" << ds.resolution_m << "m) - "
                              << ds.provider << " [" << ds.implementation_status << "]" << std::endl;
                }
            }
            std::cout << std::endl;
            std::cout << "Falling back to global datasets..." << std::endl;
            
            for (const auto& ds : candidates) {
                if (ds.implementation_status == "implemented") {
                    implemented.push_back(ds);
                }
            }
        }
        
        // Sort by resolution (closest to target, prefer finer)
        std::sort(implemented.begin(), implemented.end(), 
                  [target_resolution_m](const DEMDataset& a, const DEMDataset& b) {
                      int diff_a = std::abs(a.resolution_m - target_resolution_m);
                      int diff_b = std::abs(b.resolution_m - target_resolution_m);
                      
                      if (diff_a == diff_b) {
                          return a.resolution_m < b.resolution_m;
                      }
                      
                      return diff_a < diff_b;
                  });
        
        DEMDataset best = implemented[0];
        
        std::cout << "✅ Selected DEM Dataset:" << std::endl;
        std::cout << "   Name:       " << best.dataset_name << std::endl;
        std::cout << "   Provider:   " << best.provider << std::endl;
        std::cout << "   Resolution: " << best.resolution_m << "m" << std::endl;
        std::cout << "   Coverage:   " << best.coverage << std::endl;
        std::cout << "   Tool:       " << best.fetch_tool << std::endl;
        std::cout << "   License:    " << best.license << std::endl;
        if (!best.notes.empty()) {
            std::cout << "   Notes:      " << best.notes << std::endl;
        }
        std::cout << std::endl;
        
        return best;
    }
    
    void list_datasets_for_country(const std::string& country_code) {
        if (by_country.find(country_code) == by_country.end()) {
            std::cout << "No datasets found for country code: " << country_code << std::endl;
            return;
        }
        
        auto datasets_list = by_country[country_code];
        
        std::cout << "DEM Datasets for " << country_code << ":" << std::endl;
        std::cout << std::string(80, '=') << std::endl;
        
        for (const auto& ds : datasets_list) {
            std::cout << "\n📊 " << ds.dataset_name << std::endl;
            std::cout << "   Provider:   " << ds.provider << std::endl;
            std::cout << "   Resolution: " << ds.resolution_m << "m" << std::endl;
            std::cout << "   Coverage:   " << ds.coverage << std::endl;
            std::cout << "   Status:     " << ds.implementation_status << std::endl;
            std::cout << "   Tool:       " << ds.fetch_tool << std::endl;
            std::cout << "   License:    " << ds.license << std::endl;
            std::cout << "   URL:        " << ds.url << std::endl;
            if (!ds.notes.empty()) {
                std::cout << "   Notes:      " << ds.notes << std::endl;
            }
        }
        
        std::cout << std::endl;
    }
};

} // namespace tools
} // namespace agrs

