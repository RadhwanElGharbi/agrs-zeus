#pragma once
#include <string>
#include <vector>
#include <map>
#include <set>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <iostream>
#include <iomanip>
#include <algorithm>

namespace agrs {
namespace tools {

// ============================================================================
// FETCH TOOL AVAILABILITY ANALYZER
// ============================================================================
// Analyzes dataset inventories to determine tool implementation status
// and assess pipeline routing readiness
// ============================================================================

struct DatasetEntry {
    std::string category;
    std::string country;
    std::string country_code;
    std::string dataset_name;
    std::string provider;
    std::string resolution;
    std::string data_type;
    std::string coverage;
    std::string fetch_tool;
    std::string license;
    bool is_implemented;
    bool is_guidance;
};

struct CategoryStatus {
    std::string category;
    int total_datasets;
    int implemented;
    int guidance;
    int not_implemented;
    double implementation_percentage;
    std::set<std::string> countries_covered;
    std::set<std::string> implemented_tools;
    std::set<std::string> missing_tools;
};

struct CountryStatus {
    std::string country;
    std::string country_code;
    std::map<std::string, bool> category_coverage; // category -> has_implemented_tool
    int total_categories;
    int covered_categories;
    double coverage_percentage;
};

class FetchToolAnalyzer {
private:
    std::vector<DatasetEntry> all_datasets;
    std::map<std::string, CategoryStatus> category_stats;
    std::map<std::string, CountryStatus> country_stats;
    std::vector<std::string> required_categories;
    
    // Dataset inventory files
    std::map<std::string, std::string> inventory_files = {
        {"DEM", "/opt/agrs/data/dem_datasets_inventory.csv"},
        {"Land Cover", "/opt/agrs/data/landcover_datasets_inventory.csv"},
        {"Hydrology", "/opt/agrs/data/hydrology_datasets_inventory.csv"},
        {"Infrastructure", "/opt/agrs/data/infrastructure_datasets_inventory.csv"},
        {"Protected Areas", "/opt/agrs/data/protected_areas_datasets_inventory.csv"},
        {"Geohazards", "/opt/agrs/data/geohazards_datasets_inventory.csv"},
        {"Administrative", "/opt/agrs/data/administrative_datasets_inventory.csv"},
        {"Cadastre", "/opt/agrs/data/cadastre_datasets_inventory.csv"},
        {"Socioeconomic", "/opt/agrs/data/socioeconomic_datasets_inventory.csv"},
        {"Climate", "/opt/agrs/data/climate_datasets_inventory.csv"},
        {"Imagery", "/opt/agrs/data/imagery_datasets_inventory.csv"}
    };
    
    bool is_tool_implemented(const std::string& tool_name) {
        // Check if tool is marked as implemented
        if (tool_name.empty() || 
            tool_name == "not_implemented" || 
            tool_name == "guidance" ||
            tool_name.find("(guidance)") != std::string::npos) {
            return false;
        }
        return true;
    }
    
    bool is_guidance_mode(const std::string& tool_name) {
        return tool_name.find("(guidance)") != std::string::npos || 
               tool_name == "guidance";
    }
    
    void load_inventory(const std::string& category, const std::string& filepath) {
        if (!std::filesystem::exists(filepath)) {
            std::cerr << "Warning: Inventory not found: " << filepath << std::endl;
            return;
        }
        
        std::ifstream file(filepath);
        std::string line;
        
        // Skip header
        std::getline(file, line);
        
        while (std::getline(file, line)) {
            if (line.empty() || line[0] == '#') continue;
            
            std::vector<std::string> fields;
            std::string current_field;
            bool in_quotes = false;
            
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
            
            if (fields.size() >= 9) {
                DatasetEntry entry;
                entry.category = category;
                entry.country = fields[0];
                entry.country_code = fields[1];
                entry.dataset_name = fields[2];
                entry.provider = fields[3];
                entry.resolution = fields[4];
                entry.data_type = fields.size() > 5 ? fields[5] : "";
                entry.coverage = fields.size() > 6 ? fields[6] : "";
                entry.fetch_tool = fields.size() > 7 ? fields[7] : "";
                entry.license = fields.size() > 8 ? fields[8] : "";
                entry.is_implemented = is_tool_implemented(entry.fetch_tool);
                entry.is_guidance = is_guidance_mode(entry.fetch_tool);
                
                all_datasets.push_back(entry);
            }
        }
    }
    
    void analyze_categories() {
        for (const auto& entry : all_datasets) {
            auto& cat = category_stats[entry.category];
            cat.category = entry.category;
            cat.total_datasets++;
            
            if (entry.is_implemented) {
                cat.implemented++;
                cat.implemented_tools.insert(entry.fetch_tool);
            } else if (entry.is_guidance) {
                cat.guidance++;
            } else {
                cat.not_implemented++;
            }
            
            if (!entry.fetch_tool.empty()) {
                if (!entry.is_implemented) {
                    cat.missing_tools.insert(entry.fetch_tool);
                }
            }
            
            if (entry.country_code != "GLOBAL") {
                cat.countries_covered.insert(entry.country_code);
            }
        }
        
        // Calculate percentages
        for (auto& [cat_name, cat] : category_stats) {
            if (cat.total_datasets > 0) {
                cat.implementation_percentage = 
                    (100.0 * cat.implemented) / cat.total_datasets;
            }
        }
    }
    
    void analyze_countries() {
        // Get unique countries
        std::set<std::string> countries;
        for (const auto& entry : all_datasets) {
            if (entry.country_code != "GLOBAL") {
                countries.insert(entry.country_code);
            }
        }
        
        // Analyze each country
        for (const auto& country_code : countries) {
            CountryStatus status;
            status.country_code = country_code;
            status.total_categories = inventory_files.size();
            status.covered_categories = 0;
            
            // Check coverage for each category
            for (const auto& [cat_name, _] : inventory_files) {
                bool has_implemented = false;
                
                for (const auto& entry : all_datasets) {
                    if (entry.category == cat_name && 
                        entry.country_code == country_code && 
                        entry.is_implemented) {
                        has_implemented = true;
                        break;
                    }
                }
                
                status.category_coverage[cat_name] = has_implemented;
                if (has_implemented) {
                    status.covered_categories++;
                }
            }
            
            status.coverage_percentage = 
                (100.0 * status.covered_categories) / status.total_categories;
            
            country_stats[country_code] = status;
        }
    }
    
public:
    FetchToolAnalyzer() {
        // Define required categories for pipeline routing
        required_categories = {
            "DEM",
            "Land Cover",
            "Hydrology",
            "Infrastructure",
            "Protected Areas",
            "Geohazards",
            "Administrative",
            "Cadastre",
            "Socioeconomic"
        };
    }
    
    void load_all_inventories() {
        std::cout << "Loading dataset inventories..." << std::endl;
        for (const auto& [category, filepath] : inventory_files) {
            load_inventory(category, filepath);
        }
        std::cout << "Loaded " << all_datasets.size() << " dataset entries" << std::endl;
        
        analyze_categories();
        analyze_countries();
    }
    
    void print_category_summary() {
        std::cout << "\n╔════════════════════════════════════════════════════════╗\n";
        std::cout << "║  FETCH TOOL AVAILABILITY BY CATEGORY                 ║\n";
        std::cout << "╚════════════════════════════════════════════════════════╝\n\n";
        
        for (const auto& [cat_name, cat] : category_stats) {
            std::cout << "📦 " << cat_name << "\n";
            std::cout << std::string(60, '-') << "\n";
            std::cout << "  Total Datasets:       " << cat.total_datasets << "\n";
            std::cout << "  ✅ Implemented:       " << cat.implemented 
                      << " (" << std::fixed << std::setprecision(1) 
                      << cat.implementation_percentage << "%)\n";
            std::cout << "  📖 Guidance Only:     " << cat.guidance << "\n";
            std::cout << "  ❌ Not Implemented:   " << cat.not_implemented << "\n";
            std::cout << "  🌍 Countries Covered: " << cat.countries_covered.size() << "\n";
            std::cout << "  🔧 Unique Tools:      " << cat.implemented_tools.size() << "\n";
            
            if (!cat.implemented_tools.empty()) {
                std::cout << "  📋 Tools:\n";
                for (const auto& tool : cat.implemented_tools) {
                    std::cout << "     • " << tool << "\n";
                }
            }
            
            std::cout << "\n";
        }
    }
    
    void print_pipeline_readiness() {
        std::cout << "\n╔════════════════════════════════════════════════════════╗\n";
        std::cout << "║  PIPELINE ROUTING READINESS ASSESSMENT               ║\n";
        std::cout << "╚════════════════════════════════════════════════════════╝\n\n";
        
        std::cout << "Required Categories for Pipeline Routing:\n";
        std::cout << std::string(60, '-') << "\n";
        
        int total_required = required_categories.size();
        int fully_ready = 0;
        int partially_ready = 0;
        int not_ready = 0;
        
        for (const auto& cat_name : required_categories) {
            if (category_stats.find(cat_name) == category_stats.end()) {
                std::cout << "❌ " << std::setw(20) << std::left << cat_name 
                          << " - NOT FOUND\n";
                not_ready++;
                continue;
            }
            
            const auto& cat = category_stats[cat_name];
            std::string status;
            std::string icon;
            
            if (cat.implementation_percentage >= 75.0) {
                status = "READY";
                icon = "✅";
                fully_ready++;
            } else if (cat.implementation_percentage >= 25.0) {
                status = "PARTIAL";
                icon = "⚠️ ";
                partially_ready++;
            } else {
                status = "LIMITED";
                icon = "❌";
                not_ready++;
            }
            
            std::cout << icon << " " << std::setw(20) << std::left << cat_name 
                      << " - " << std::setw(7) << status 
                      << " (" << cat.implemented << "/" << cat.total_datasets 
                      << " implemented, " << std::fixed << std::setprecision(0)
                      << cat.implementation_percentage << "%)\n";
        }
        
        std::cout << "\n" << std::string(60, '-') << "\n";
        std::cout << "Overall Readiness:\n";
        std::cout << "  ✅ Fully Ready:       " << fully_ready << "/" << total_required << "\n";
        std::cout << "  ⚠️  Partially Ready:  " << partially_ready << "/" << total_required << "\n";
        std::cout << "  ❌ Limited/Not Ready: " << not_ready << "/" << total_required << "\n";
        
        double readiness = (100.0 * fully_ready) / total_required;
        std::cout << "\n🎯 Pipeline Routing Readiness: " << std::fixed 
                  << std::setprecision(1) << readiness << "%\n";
        
        if (readiness >= 75.0) {
            std::cout << "   Status: ✅ READY for production pipeline routing\n";
        } else if (readiness >= 50.0) {
            std::cout << "   Status: ⚠️  PARTIAL coverage, suitable for pilot projects\n";
        } else {
            std::cout << "   Status: ❌ LIMITED coverage, additional tools needed\n";
        }
    }
    
    void print_country_coverage(const std::string& country_code = "") {
        std::cout << "\n╔════════════════════════════════════════════════════════╗\n";
        std::cout << "║  COUNTRY-SPECIFIC DATASET COVERAGE                   ║\n";
        std::cout << "╚════════════════════════════════════════════════════════╝\n\n";
        
        if (!country_code.empty()) {
            // Show specific country
            if (country_stats.find(country_code) == country_stats.end()) {
                std::cout << "❌ Country not found: " << country_code << "\n";
                return;
            }
            
            const auto& status = country_stats[country_code];
            std::cout << "Country: " << country_code << "\n";
            std::cout << std::string(60, '-') << "\n";
            std::cout << "Coverage: " << status.covered_categories << "/" 
                      << status.total_categories << " categories (" 
                      << std::fixed << std::setprecision(1) 
                      << status.coverage_percentage << "%)\n\n";
            
            for (const auto& cat_name : required_categories) {
                bool covered = status.category_coverage.find(cat_name) != 
                              status.category_coverage.end() && 
                              status.category_coverage.at(cat_name);
                std::cout << (covered ? "✅" : "❌") << " " << cat_name << "\n";
            }
        } else {
            // Show top countries by coverage
            std::vector<std::pair<std::string, double>> sorted_countries;
            for (const auto& [code, status] : country_stats) {
                sorted_countries.push_back({code, status.coverage_percentage});
            }
            
            std::sort(sorted_countries.begin(), sorted_countries.end(),
                     [](const auto& a, const auto& b) { return a.second > b.second; });
            
            std::cout << "Top 20 Countries by Dataset Coverage:\n";
            std::cout << std::string(60, '-') << "\n";
            
            int count = 0;
            for (const auto& [code, coverage] : sorted_countries) {
                if (count >= 20) break;
                
                const auto& status = country_stats[code];
                std::string icon = coverage >= 75.0 ? "✅" : 
                                  coverage >= 50.0 ? "⚠️ " : "❌";
                
                std::cout << icon << " " << std::setw(4) << code 
                          << " - " << std::setw(3) << status.covered_categories 
                          << "/" << status.total_categories 
                          << " categories (" << std::fixed << std::setprecision(0)
                          << coverage << "%)\n";
                count++;
            }
        }
    }
    
    void print_missing_tools() {
        std::cout << "\n╔════════════════════════════════════════════════════════╗\n";
        std::cout << "║  MISSING / GUIDANCE-ONLY TOOLS                       ║\n";
        std::cout << "╚════════════════════════════════════════════════════════╝\n\n";
        
        for (const auto& [cat_name, cat] : category_stats) {
            if (cat.missing_tools.empty() && cat.guidance == 0) continue;
            
            std::cout << "📦 " << cat_name << ":\n";
            
            if (!cat.missing_tools.empty()) {
                std::cout << "  Missing Tools:\n";
                for (const auto& tool : cat.missing_tools) {
                    if (tool.find("(guidance)") != std::string::npos) {
                        std::cout << "    📖 " << tool << " [GUIDANCE ONLY]\n";
                    } else {
                        std::cout << "    ❌ " << tool << " [NOT IMPLEMENTED]\n";
                    }
                }
            }
            std::cout << "\n";
        }
    }
    
    void generate_json_report(const std::string& output_path) {
        std::ofstream out(output_path);
        
        out << "{\n";
        out << "  \"report_date\": \"2025-10-17\",\n";
        out << "  \"total_datasets\": " << all_datasets.size() << ",\n";
        out << "  \"total_categories\": " << inventory_files.size() << ",\n";
        out << "  \"categories\": [\n";
        
        bool first_cat = true;
        for (const auto& [cat_name, cat] : category_stats) {
            if (!first_cat) out << ",\n";
            first_cat = false;
            
            out << "    {\n";
            out << "      \"name\": \"" << cat_name << "\",\n";
            out << "      \"total_datasets\": " << cat.total_datasets << ",\n";
            out << "      \"implemented\": " << cat.implemented << ",\n";
            out << "      \"guidance\": " << cat.guidance << ",\n";
            out << "      \"not_implemented\": " << cat.not_implemented << ",\n";
            out << "      \"implementation_percentage\": " << cat.implementation_percentage << ",\n";
            out << "      \"countries_covered\": " << cat.countries_covered.size() << ",\n";
            out << "      \"unique_tools\": " << cat.implemented_tools.size() << "\n";
            out << "    }";
        }
        
        out << "\n  ],\n";
        out << "  \"pipeline_routing_readiness\": {\n";
        
        int fully_ready = 0;
        for (const auto& cat_name : required_categories) {
            if (category_stats.find(cat_name) != category_stats.end()) {
                const auto& cat = category_stats[cat_name];
                if (cat.implementation_percentage >= 75.0) fully_ready++;
            }
        }
        
        double readiness = (100.0 * fully_ready) / required_categories.size();
        out << "    \"required_categories\": " << required_categories.size() << ",\n";
        out << "    \"fully_ready\": " << fully_ready << ",\n";
        out << "    \"readiness_percentage\": " << readiness << "\n";
        out << "  }\n";
        out << "}\n";
        
        std::cout << "\n✅ JSON report generated: " << output_path << "\n";
    }
    
    void generate_gui_json_report(const std::string& output_path, const std::string& country_code = "") {
        // Generate JSON in format expected by DatasetAvailabilityDialog
        std::ofstream out(output_path);
        if (!out.good()) {
            std::cerr << "Error: Could not write JSON to " << output_path << "\n";
            return;
        }
        
        // Group datasets by category
        std::map<std::string, std::vector<DatasetEntry>> by_category;
        for (const auto& ds : all_datasets) {
            // Only include if covers AOI (country matches or is global)
            if (!country_code.empty()) {
                if (ds.country_code != country_code && ds.coverage != "Global") {
                    continue;
                }
            }
            by_category[ds.category].push_back(ds);
        }
        
        out << "{\n";
        out << "  \"categories\": [\n";
        
        bool first_cat = true;
        for (const auto& [cat_name, datasets] : by_category) {
            if (datasets.empty()) continue;
            
            if (!first_cat) out << ",\n";
            first_cat = false;
            
            out << "    {\n";
            out << "      \"name\": \"" << cat_name << "\",\n";
            out << "      \"datasets\": [\n";
            
            bool first_ds = true;
            for (const auto& ds : datasets) {
                if (!first_ds) out << ",\n";
                first_ds = false;
                
                out << "        {\n";
                out << "          \"name\": \"" << ds.dataset_name;
                if (!ds.resolution.empty()) out << " (" << ds.resolution << ")";
                out << "\",\n";
                out << "          \"provider\": \"" << ds.provider << "\",\n";
                out << "          \"country\": \"" << ds.country << "\",\n";
                out << "          \"implemented\": " << (ds.is_implemented ? "true" : "false") << ",\n";
                out << "          \"covers_aoi\": true\n";  // If it's in this list, it covers AOI
                out << "        }";
            }
            
            out << "\n      ]\n";
            out << "    }";
        }
        
        out << "\n  ]\n";
        out << "}\n";
        out.close();
    }
};

} // namespace tools
} // namespace agrs

