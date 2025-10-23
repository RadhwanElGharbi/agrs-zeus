#include <iostream>
#include <filesystem>
#include <optional>
#include <string>
#include <sstream>
#include <iomanip>
#include <fstream>
#include <algorithm>
#include <cctype>
#include <vector>
#include <map>
#include <regex>
#include <termios.h>
#include <unistd.h>
#include <sqlite3.h>
#include <CLI/CLI.hpp>
#include <thread>
#include <atomic>
#include <cstdio>
#include <array>
#include <nlohmann/json.hpp>
#include <sodium.h>
#include <sys/wait.h>
#include "agrs_zeus/Config.h"
#include "agrs_zeus/Logger.h"
#include "agrs_zeus/Database.h"
#include "agrs_zeus/Migrations.h"
#include "agrs_zeus/Users.h"
#include "agrs_zeus/Auth.h"
#include "agrs_zeus/LoginLogger.h"
#include "agrs_zeus/Tools.h"

// Forward declarations
void handle_logs_command_with_compact_format(const std::string& start_datetime, const std::string& end_datetime, const std::string& username);
void handle_export_command_with_compact_format(const std::string& start_datetime, const std::string& end_datetime, const std::string& export_path, const std::string& username);
void handle_terminal_inputs_command(const std::string& start_datetime, const std::string& end_datetime, const std::string& username);
void handle_terminal_inputs_user_command(const std::string& target_username, const std::string& start_datetime, const std::string& end_datetime, const std::string& username);
void handle_terminal_inputs_export_command(const std::string& start_datetime, const std::string& end_datetime, const std::string& export_path, const std::string& username);
void handle_terminal_inputs_user_export_command(const std::string& target_username, const std::string& start_datetime, const std::string& end_datetime, const std::string& export_path, const std::string& username);

// --- Tools helpers (GDAL/OGR based translators) ---
static std::string to_iso8601_utc() {
  using namespace std::chrono;
  auto now = system_clock::now();
  std::time_t t = system_clock::to_time_t(now);
  std::tm tm{};
  gmtime_r(&t, &tm);
  char buf[32];
  std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
  return std::string(buf);
}

static bool ensure_dir(const std::filesystem::path& p, std::string& err) {
  std::error_code ec;
  if (std::filesystem::exists(p, ec)) {
    if (std::filesystem::is_directory(p, ec)) return true;
    err = "Destination path exists and is not a directory";
    return false;
  }
  if (!std::filesystem::create_directories(p, ec)) {
    if (ec) {
      err = "Failed to create destination directory: " + ec.message();
      return false;
    }
  }
  return true;
}

static int run_cmd_capture(const std::string& cmd, std::string& out, std::string& err) {
  out.clear();
  err.clear();
  std::array<char, 4096> buffer{};
  std::string full = cmd + " 2>&1";
  FILE* pipe = popen(full.c_str(), "r");
  if (!pipe) {
    err = "Failed to run command";
    return -1;
  }
  while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
    out.append(buffer.data());
  }
  int rc = pclose(pipe);
  return WEXITSTATUS(rc);
}

static std::string sha256_bytes_to_hex(const unsigned char* digest) {
  static const char* hex = "0123456789abcdef";
  std::string s(64, '\0');
  for (int i = 0; i < 32; ++i) {
    s[2*i] = hex[(digest[i] >> 4) & 0xF];
    s[2*i+1] = hex[digest[i] & 0xF];
  }
  return s;
}

static bool sha256_file(const std::filesystem::path& path, std::string& hex, std::string& err) {
  std::ifstream in(path, std::ios::binary);
  if (!in) { err = "Cannot open file for hashing: " + path.string(); return false; }
  crypto_hash_sha256_state state;
  if (crypto_hash_sha256_init(&state) != 0) { err = "sha256 init failed"; return false; }
  std::array<unsigned char, 1<<16> buf{};
  while (in) {
    in.read(reinterpret_cast<char*>(buf.data()), buf.size());
    std::streamsize got = in.gcount();
    if (got > 0) {
      if (crypto_hash_sha256_update(&state, buf.data(), static_cast<unsigned long long>(got)) != 0) {
        err = "sha256 update failed"; return false;
      }
    }
  }
  unsigned char digest[crypto_hash_sha256_BYTES];
  if (crypto_hash_sha256_final(&state, digest) != 0) { err = "sha256 final failed"; return false; }
  hex = sha256_bytes_to_hex(digest);
  return true;
}

static bool sha256_shapefile_compound(const std::filesystem::path& shp, std::string& hex, std::string& err) {
  // Hash all sidecar files deterministically by name
  std::vector<std::filesystem::path> parts;
  auto stem = shp;
  stem.replace_extension("");
  std::vector<std::string> exts = {".shp", ".shx", ".dbf", ".prj", ".cpg", ".qpj", ".sbn", ".sbx"};
  for (const auto& e : exts) {
    auto p = stem;
    p += e;
    std::error_code ec;
    if (std::filesystem::exists(p, ec) && std::filesystem::is_regular_file(p, ec)) {
      parts.push_back(p);
    }
  }
  std::sort(parts.begin(), parts.end());
  crypto_hash_sha256_state state;
  if (crypto_hash_sha256_init(&state) != 0) { err = "sha256 init failed"; return false; }
  for (const auto& p : parts) {
    std::ifstream in(p, std::ios::binary);
    if (!in) { err = "Cannot open file for hashing: " + p.string(); return false; }
    std::array<unsigned char, 1<<16> buf{};
    while (in) {
      in.read(reinterpret_cast<char*>(buf.data()), buf.size());
      std::streamsize got = in.gcount();
      if (got > 0) {
        if (crypto_hash_sha256_update(&state, buf.data(), static_cast<unsigned long long>(got)) != 0) {
          err = "sha256 update failed"; return false;
        }
      }
    }
  }
  unsigned char digest[crypto_hash_sha256_BYTES];
  if (crypto_hash_sha256_final(&state, digest) != 0) { err = "sha256 final failed"; return false; }
  hex = sha256_bytes_to_hex(digest);
  return true;
}

static bool write_json_file(const std::filesystem::path& p, const nlohmann::json& j, std::string& err) {
  std::ofstream out(p);
  if (!out) { err = "Failed to write manifest: " + p.string(); return false; }
  out << j.dump();
  return true;
}

static bool sha256_directory(const std::filesystem::path& dir, std::string& hex, std::string& err) {
  if (!std::filesystem::exists(dir) || !std::filesystem::is_directory(dir)) {
    err = "Not a directory: " + dir.string();
    return false;
  }
  crypto_hash_sha256_state state;
  if (crypto_hash_sha256_init(&state) != 0) { err = "sha256 init failed"; return false; }
  std::vector<std::filesystem::path> files;
  for (auto& p : std::filesystem::recursive_directory_iterator(dir)) {
    if (p.is_regular_file()) files.push_back(p.path());
  }
  std::sort(files.begin(), files.end());
  std::array<unsigned char, 1<<16> buf{};
  for (const auto& f : files) {
    std::ifstream in(f, std::ios::binary);
    if (!in) { err = "Cannot open file for hashing: " + f.string(); return false; }
    while (in) {
      in.read(reinterpret_cast<char*>(buf.data()), buf.size());
      std::streamsize got = in.gcount();
      if (got > 0) {
        if (crypto_hash_sha256_update(&state, buf.data(), static_cast<unsigned long long>(got)) != 0) { err = "sha256 update failed"; return false; }
      }
    }
  }
  unsigned char digest[crypto_hash_sha256_BYTES];
  if (crypto_hash_sha256_final(&state, digest) != 0) { err = "sha256 final failed"; return false; }
  hex = sha256_bytes_to_hex(digest);
  return true;
}

static std::string format_duration(std::chrono::steady_clock::duration d) {
  using namespace std::chrono;
  long long secs = duration_cast<seconds>(d).count();
  char buf[16];
  std::snprintf(buf, sizeof(buf), "%02lld:%02lld", secs / 60, secs % 60);
  return std::string(buf);
}

static std::optional<int> parse_epsg_from_wkt(const std::string& wkt) {
  std::smatch m;
  // Prefer PROJCRS-level EPSG if present
  static const std::regex re_proj_id(R"(PROJCRS\[[\s\S]*?ID\[\s*\"EPSG\"\s*,\s*(\d+)\s*\]])");
  if (std::regex_search(wkt, m, re_proj_id)) {
    return std::stoi(m[1]);
  }
  // Generic ID["EPSG", ####]
  static const std::regex re_id_epsg(R"(ID\[\s*\"EPSG\"\s*,\s*(\d+)\s*\])");
  if (std::regex_search(wkt, m, re_id_epsg)) {
    return std::stoi(m[1]);
  }
  // Fallback: occurrences of EPSG:####
  static const std::regex re_epsg_colon(R"(EPSG[:\s]*(\d+))");
  if (std::regex_search(wkt, m, re_epsg_colon)) {
    return std::stoi(m[1]);
  }
  return std::nullopt;
}

static bool check_binary_available(const std::string& name) {
  std::string out, err;
  int rc = run_cmd_capture("which " + name, out, err);
  return rc == 0 && !out.empty();
}

// Tools namespace - placeholder for future GPKG-focused tools


static std::string version_string() {
  return std::to_string(AGRS_ZEUS_VERSION_MAJOR) + "." +
         std::to_string(AGRS_ZEUS_VERSION_MINOR) + "." +
         std::to_string(AGRS_ZEUS_VERSION_PATCH);
}

// String utilities for robust input/role handling
static inline std::string ltrim_copy(const std::string &s) {
  auto it = std::find_if(s.begin(), s.end(), [](unsigned char ch) { return !std::isspace(ch); });
  return std::string(it, s.end());
}

static inline std::string rtrim_copy(const std::string &s) {
  auto it = std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) { return !std::isspace(ch); }).base();
  return std::string(s.begin(), it);
}

static inline std::string trim_copy(const std::string &s) {
  return rtrim_copy(ltrim_copy(s));
}

static inline std::string to_lower_copy(std::string s) {
  std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return s;
}

// Phone number validation function
bool validatePhoneNumber(const std::string& phone) {
  if (phone.empty()) {
    return true; // Allow empty phone numbers
  }
  
  // Phone number patterns:
  // +1 5149712858 (with country code and space)
  // 5149712858 (just digits)
  
  std::regex phonePattern(R"(^(\+\d{1,3} )?\d{10,15}$)");
  
  if (!std::regex_match(phone, phonePattern)) {
    return false;
  }
  
  // Additional validation: ensure no letters, hyphens, or brackets
  for (char c : phone) {
    if (c != '+' && c != ' ' && !std::isdigit(c)) {
      return false;
    }
  }
  
  // If it has a country code, ensure there's exactly one space after it
  if (phone[0] == '+') {
    size_t spacePos = phone.find(' ');
    if (spacePos == std::string::npos || phone.find(' ', spacePos + 1) != std::string::npos) {
      return false; // No space after country code, or multiple spaces
    }
  }
  
  return true;
}

std::string get_password_input() {
  struct termios old_terminal, new_terminal;
  std::string password;
  
  // Check if input is from a terminal (not piped)
  if (isatty(STDIN_FILENO)) {
    // Get current terminal settings
    tcgetattr(STDIN_FILENO, &old_terminal);
    new_terminal = old_terminal;
    
    // Disable echo
    new_terminal.c_lflag &= ~(ECHO);
    
    // Set new terminal settings
    tcsetattr(STDIN_FILENO, TCSANOW, &new_terminal);
    
    // Read password
    std::getline(std::cin, password);
    
    // Restore old terminal settings
    tcsetattr(STDIN_FILENO, TCSANOW, &old_terminal);
  } else {
    // Input is piped, just read normally
    std::getline(std::cin, password);
  }
  
  return password;
}

void logLoginAttempt(agrs::core::Database& db, const std::string& username, const std::string& password, 
                     bool successful, const std::string& failure_reason = "") {
  agrs::core::LoginLogger logger(db);
  std::string err;
  
  agrs::core::LoginAttempt attempt;
  attempt.username = username;
  attempt.password_length = password.length();
  attempt.attempt_date = logger.getCurrentDate();
  attempt.attempt_time = logger.getCurrentTime();
  attempt.timezone = logger.getCurrentTimezone();
  attempt.unix_timestamp = logger.getCurrentUnixTimestamp();
  attempt.successful = successful;
  attempt.failure_reason = failure_reason;
  attempt.ip_address = "127.0.0.1"; // Local for now, could be enhanced
  attempt.user_agent = "AGRS-ZEUS-Terminal/1.0";
  attempt.login_method = "interactive";
  attempt.country_code = "US"; // Default, could be enhanced with geolocation
  attempt.city = "Unknown";
  attempt.isp = "Unknown";
  attempt.account_locked = false;
  attempt.lockout_reason = "";
  attempt.device_hash = "terminal";
  attempt.screen_resolution = "80x24";
  attempt.timezone_offset = "EST+0";
  attempt.session_duration = 0;
  attempt.login_count_today = logger.getLoginCountToday(username, err) + 1;
  
  logger.logAttempt(attempt, err);
  if (!err.empty()) {
    spdlog::warn("Failed to log login attempt: {}", err);
  }
}

// Admin command functions
bool verify_admin_password(const std::string& username, const std::string& password) {
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  std::string err;
  if (!agrs::core::Migrations::applyAll(db, err)) {
    return false;
  }
  agrs::core::Auth auth(db);
  return auth.verifyPassword(username, password, err);
}

void handle_logs_command() {
  std::cout << "\n=== Login Attempts Viewer ===\n";
  std::cout << "Enter start date/time (MM-DD-YYYY HH:MM:SS): ";
  std::string start_datetime;
  std::getline(std::cin, start_datetime);
  
  std::cout << "Enter end date/time (MM-DD-YYYY HH:MM:SS): ";
  std::string end_datetime;
  std::getline(std::cin, end_datetime);
  
  if (start_datetime.empty() || end_datetime.empty()) {
    std::cout << "Date/time cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Convert datetime strings to SQLite format
  std::string start_sql = start_datetime.substr(6, 4) + "-" + start_datetime.substr(0, 2) + "-" + 
                          start_datetime.substr(3, 2) + " " + start_datetime.substr(11);
  std::string end_sql = end_datetime.substr(6, 4) + "-" + end_datetime.substr(0, 2) + "-" + 
                        end_datetime.substr(3, 2) + " " + end_datetime.substr(11);
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  std::string err;
  
  // Query login attempts between the specified dates
  std::string query = "SELECT id, username, password_length, attempt_date, attempt_time, "
                      "successful, failure_reason, ip_address, user_agent, login_method, "
                      "country_code, city, isp, account_locked, device_hash, screen_resolution, "
                      "timezone_offset, session_duration, login_count_today, created_at "
                      "FROM login_attempts "
                      "WHERE (attempt_date > ? OR (attempt_date = ? AND attempt_time >= ?)) "
                      "AND (attempt_date < ? OR (attempt_date = ? AND attempt_time <= ?)) "
                      "ORDER BY id DESC";
  
  sqlite3_stmt* stmt;
  if (sqlite3_prepare_v2(db.handle(), query.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
    std::cout << "Error preparing query: " << sqlite3_errmsg(db.handle()) << "\n\n";
    return;
  }
  
  // Extract date and time from input - handle both formats
  std::string start_date, start_time, end_date, end_time;
  
  // Check if datetime includes time (has space)
  size_t start_space = start_datetime.find(' ');
  if (start_space != std::string::npos) {
    start_date = start_datetime.substr(0, start_space);
    start_time = start_datetime.substr(start_space + 1);
  } else {
    start_date = start_datetime;
    start_time = "00:00:00"; // Default to start of day
  }
  
  size_t end_space = end_datetime.find(' ');
  if (end_space != std::string::npos) {
    end_date = end_datetime.substr(0, end_space);
    end_time = end_datetime.substr(end_space + 1);
  } else {
    end_date = end_datetime;
    end_time = "23:59:59"; // Default to end of day
  }
  
  sqlite3_bind_text(stmt, 1, start_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, start_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, start_time.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 4, end_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 5, end_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 6, end_time.c_str(), -1, SQLITE_STATIC);
  
  std::cout << "\nLogin Attempts between " << start_datetime << " and " << end_datetime << ":\n";
  std::cout << std::string(120, '-') << "\n";
  std::cout << std::left << std::setw(4) << "ID" << std::setw(20) << "Username" << std::setw(12) << "Date" 
            << std::setw(10) << "Time" << std::setw(8) << "Success" << std::setw(15) << "IP Address" 
            << std::setw(20) << "Failure Reason" << "\n";
  std::cout << std::string(120, '-') << "\n";
  
  int count = 0;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    int id = sqlite3_column_int(stmt, 0);
    const char* username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
    int password_length = sqlite3_column_int(stmt, 2);
    const char* date = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
    const char* time = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
    bool successful = sqlite3_column_int(stmt, 5) != 0;
    const char* failure_reason = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 6));
    const char* ip = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 7));
    
    std::cout << std::left << std::setw(4) << id << std::setw(20) << (username ? username : "") 
              << std::setw(12) << (date ? date : "") << std::setw(10) << (time ? time : "") 
              << std::setw(8) << (successful ? "Yes" : "No") << std::setw(15) << (ip ? ip : "") 
              << std::setw(20) << (failure_reason ? failure_reason : "") << "\n";
    count++;
  }
  
  std::cout << std::string(120, '-') << "\n";
  std::cout << "Total records: " << count << "\n\n";
  
  sqlite3_finalize(stmt);
}

void handle_export_command() {
  std::cout << "\n=== Export Login Attempts to CSV ===\n";
  std::cout << "Enter start date/time (MM-DD-YYYY HH:MM:SS): ";
  std::string start_datetime;
  std::getline(std::cin, start_datetime);
  
  std::cout << "Enter end date/time (MM-DD-YYYY HH:MM:SS): ";
  std::string end_datetime;
  std::getline(std::cin, end_datetime);
  
  std::cout << "Enter output export_path (e.g., login_attempts.csv): ";
  std::string export_path;
  std::getline(std::cin, export_path);
  
  if (start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
    std::cout << "Date/time and export_path cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Convert datetime strings to SQLite format
  std::string start_sql = start_datetime.substr(6, 4) + "-" + start_datetime.substr(0, 2) + "-" + 
                          start_datetime.substr(3, 2) + " " + start_datetime.substr(11);
  std::string end_sql = end_datetime.substr(6, 4) + "-" + end_datetime.substr(0, 2) + "-" + 
                        end_datetime.substr(3, 2) + " " + end_datetime.substr(11);
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  
  // Extract date and time from input for export - handle both formats
  std::string start_date, start_time, end_date, end_time;
  
  // Check if datetime includes time (has space)
  size_t start_space = start_datetime.find(' ');
  if (start_space != std::string::npos) {
    start_date = start_datetime.substr(0, start_space);
    start_time = start_datetime.substr(start_space + 1);
  } else {
    start_date = start_datetime;
    start_time = "00:00:00"; // Default to start of day
  }
  
  size_t end_space = end_datetime.find(' ');
  if (end_space != std::string::npos) {
    end_date = end_datetime.substr(0, end_space);
    end_time = end_datetime.substr(end_space + 1);
  } else {
    end_date = end_datetime;
    end_time = "23:59:59"; // Default to end of day
  }
  
  // Use SQLite's CSV export functionality
  std::string export_query = ".mode csv\n.headers on\n.output " + export_path + "\n"
                            "SELECT id, username, password_length, attempt_date, attempt_time, "
                            "timezone, unix_timestamp, successful, failure_reason, ip_address, "
                            "user_agent, login_method, country_code, city, isp, account_locked, "
                            "lockout_reason, device_hash, screen_resolution, timezone_offset, "
                            "session_duration, login_count_today, created_at "
                            "FROM login_attempts "
                            "WHERE (attempt_date > '" + start_date + "' OR (attempt_date = '" + start_date + "' AND attempt_time >= '" + start_time + "')) "
                            "AND (attempt_date < '" + end_date + "' OR (attempt_date = '" + end_date + "' AND attempt_time <= '" + end_time + "')) "
                            "ORDER BY id DESC";
  
  // Create a temporary SQL file for the export
  std::string temp_sql_file = "/tmp/export_query.sql";
  std::ofstream sql_file(temp_sql_file);
  sql_file << ".mode csv\n";
  sql_file << ".headers on\n";
  sql_file << ".output " << export_path << "\n";
  sql_file << "SELECT id, username, password_length, attempt_date, attempt_time, "
           << "timezone, unix_timestamp, successful, failure_reason, ip_address, "
           << "user_agent, login_method, country_code, city, isp, account_locked, "
           << "lockout_reason, device_hash, screen_resolution, timezone_offset, "
           << "session_duration, login_count_today, created_at, attempt_iso8601 "
           << "FROM login_attempts "
           << "WHERE (attempt_date > '" << start_date << "' OR (attempt_date = '" << start_date << "' AND attempt_time >= '" << start_time << "')) "
           << "AND (attempt_date < '" << end_date << "' OR (attempt_date = '" << end_date << "' AND attempt_time <= '" << end_time << "')) "
           << "ORDER BY id DESC;\n";
  sql_file.close();
  
  // Execute the export using the SQL file
  std::string sqlite_cmd = "sqlite3 " + db.path().string() + " < " + temp_sql_file;
  int result = system(sqlite_cmd.c_str());
  
  // Clean up temporary file
  std::remove(temp_sql_file.c_str());
  
  if (result == 0) {
    std::cout << "Export completed successfully!\n";
    std::cout << "File saved as: " << export_path << "\n\n";
  } else {
    std::cout << "Export failed. Please check file permissions and try again.\n\n";
  }
}

// New functions for compact format commands
void handle_logs_command_with_compact_format(const std::string& start_datetime, const std::string& end_datetime, const std::string& username) {
  std::cout << "\n=== Login Attempts Viewer ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string password = get_password_input();
  std::cout << std::endl;
  
  if (password.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(username, password)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  if (start_datetime.empty() || end_datetime.empty()) {
    std::cout << "Date/time cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Convert MMDDYYHHMM format to MM-DD-YYYY HH:MM format
  std::string start_date, start_time, end_date, end_time;
  
  if (start_datetime.length() == 10) {
    // Format: MMDDYYHHMM -> MM-DD-20YY HH:MM
    start_date = start_datetime.substr(0, 2) + "-" + start_datetime.substr(2, 2) + "-20" + start_datetime.substr(4, 2);
    start_time = start_datetime.substr(6, 2) + ":" + start_datetime.substr(8, 2) + ":00";
  } else {
    std::cout << "Invalid date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  if (end_datetime.length() == 10) {
    // Format: MMDDYYHHMM -> MM-DD-20YY HH:MM
    end_date = end_datetime.substr(0, 2) + "-" + end_datetime.substr(2, 2) + "-20" + end_datetime.substr(4, 2);
    end_time = end_datetime.substr(6, 2) + ":" + end_datetime.substr(8, 2) + ":59";
  } else {
    std::cout << "Invalid date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  std::string err;
  
  // Query login attempts between the specified dates
  std::string query = "SELECT id, username, password_length, attempt_date, attempt_time, "
                      "successful, failure_reason, ip_address, user_agent, login_method, "
                      "country_code, city, isp, account_locked, device_hash, screen_resolution, "
                      "timezone_offset, session_duration, login_count_today, created_at "
                      "FROM login_attempts "
                      "WHERE (attempt_date > ? OR (attempt_date = ? AND attempt_time >= ?)) "
                      "AND (attempt_date < ? OR (attempt_date = ? AND attempt_time <= ?)) "
                      "ORDER BY id DESC";
  
  sqlite3_stmt* stmt;
  if (sqlite3_prepare_v2(db.handle(), query.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
    std::cout << "Error preparing query: " << sqlite3_errmsg(db.handle()) << "\n\n";
    return;
  }
  
  sqlite3_bind_text(stmt, 1, start_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, start_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, start_time.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 4, end_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 5, end_date.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 6, end_time.c_str(), -1, SQLITE_STATIC);
  
  std::cout << "\nLogin Attempts between " << start_datetime << " and " << end_datetime << ":\n";
  std::cout << std::string(120, '-') << "\n";
  std::cout << std::left << std::setw(4) << "ID" << std::setw(20) << "Username" << std::setw(12) << "Date" 
            << std::setw(10) << "Time" << std::setw(8) << "Success" << std::setw(15) << "IP Address" 
            << std::setw(20) << "Failure Reason" << "\n";
  std::cout << std::string(120, '-') << "\n";
  
  int count = 0;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    int id = sqlite3_column_int(stmt, 0);
    const char* username = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
    int password_length = sqlite3_column_int(stmt, 2);
    const char* date = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
    const char* time = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
    bool successful = sqlite3_column_int(stmt, 5) != 0;
    const char* failure_reason = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 6));
    const char* ip = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 7));
    
    std::cout << std::left << std::setw(4) << id << std::setw(20) << (username ? username : "") 
              << std::setw(12) << (date ? date : "") << std::setw(10) << (time ? time : "") 
              << std::setw(8) << (successful ? "Yes" : "No") << std::setw(15) << (ip ? ip : "") 
              << std::setw(20) << (failure_reason ? failure_reason : "") << "\n";
    count++;
  }
  
  std::cout << std::string(120, '-') << "\n";
  std::cout << "Total records: " << count << "\n\n";
  
  sqlite3_finalize(stmt);
}

void handle_export_command_with_compact_format(const std::string& start_datetime, const std::string& end_datetime, const std::string& export_path, const std::string& username) {
  std::cout << "\n=== Export Login Attempts to CSV ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string password = get_password_input();
  std::cout << std::endl;
  
  if (password.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(username, password)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  if (start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
    std::cout << "Date/time and export path cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Convert MMDDYYHHMM format to MM-DD-YYYY HH:MM format
  std::string start_date, start_time, end_date, end_time;
  
  if (start_datetime.length() == 10) {
    // Format: MMDDYYHHMM -> MM-DD-20YY HH:MM
    start_date = start_datetime.substr(0, 2) + "-" + start_datetime.substr(2, 2) + "-20" + start_datetime.substr(4, 2);
    start_time = start_datetime.substr(6, 2) + ":" + start_datetime.substr(8, 2) + ":00";
  } else {
    std::cout << "Invalid date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  if (end_datetime.length() == 10) {
    // Format: MMDDYYHHMM -> MM-DD-20YY HH:MM
    end_date = end_datetime.substr(0, 2) + "-" + end_datetime.substr(2, 2) + "-20" + end_datetime.substr(4, 2);
    end_time = end_datetime.substr(6, 2) + ":" + end_datetime.substr(8, 2) + ":59";
  } else {
    std::cout << "Invalid date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  
  // Create a temporary SQL file for the export
  std::string temp_sql_file = "/tmp/export_query.sql";
  std::ofstream sql_file(temp_sql_file);
  sql_file << ".mode csv\n";
  sql_file << ".headers on\n";
  sql_file << ".output " << export_path << "\n";
  sql_file << "SELECT id, username, password_length, attempt_date, attempt_time, "
           << "timezone, unix_timestamp, successful, failure_reason, ip_address, "
           << "user_agent, login_method, country_code, city, isp, account_locked, "
           << "lockout_reason, device_hash, screen_resolution, timezone_offset, "
           << "session_duration, login_count_today, created_at "
           << "FROM login_attempts "
           << "WHERE (attempt_date > '" << start_date << "' OR (attempt_date = '" << start_date << "' AND attempt_time >= '" << start_time << "')) "
           << "AND (attempt_date < '" << end_date << "' OR (attempt_date = '" << end_date << "' AND attempt_time <= '" << end_time << "')) "
           << "ORDER BY id DESC;\n";
  sql_file.close();
  
  // Execute the export using the SQL file
  std::string sqlite_cmd = "sqlite3 " + db.path().string() + " < " + temp_sql_file;
  int result = system(sqlite_cmd.c_str());
  
  // Clean up temporary file
  std::remove(temp_sql_file.c_str());
  
  if (result == 0) {
    std::cout << "Export completed successfully!\n";
    std::cout << "File saved as: " << export_path << "\n\n";
  } else {
    std::cout << "Export failed. Please check file permissions and try again.\n\n";
  }
}

void handle_terminal_inputs_command(const std::string& start_datetime, const std::string& end_datetime, const std::string& username) {
  std::cout << "\n=== Terminal Input Logs ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string password = get_password_input();
  std::cout << std::endl;
  
  if (password.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(username, password)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  if (start_datetime.empty() || end_datetime.empty()) {
    std::cout << "Date/time cannot be empty. Cancelled.\n\n";
    return;
  }
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  std::vector<std::map<std::string, std::string>> inputs;
  if (!users.getTerminalInputs(start_datetime, end_datetime, inputs, error)) {
    std::cout << "Error retrieving terminal inputs: " << error << "\n\n";
    return;
  }
  
  if (inputs.empty()) {
    std::cout << "No terminal inputs found for the specified time range.\n\n";
    return;
  }
  
  std::cout << "\nTerminal Inputs between " << start_datetime << " and " << end_datetime << ":\n";
  std::cout << std::string(120, '-') << "\n";
  std::cout << std::left << std::setw(20) << "Username" << std::setw(12) << "Date" 
            << std::setw(10) << "Time" << std::setw(78) << "Command" << "\n";
  std::cout << std::string(120, '-') << "\n";
  
  for (const auto& input : inputs) {
    std::cout << std::left << std::setw(20) << input.at("username")
              << std::setw(12) << input.at("input_date") 
              << std::setw(10) << input.at("input_time")
              << std::setw(78) << input.at("command_input") << "\n";
  }
  
  std::cout << std::string(120, '-') << "\n";
  std::cout << "Total records: " << inputs.size() << "\n\n";
}

void handle_terminal_inputs_user_command(const std::string& target_username, const std::string& start_datetime, const std::string& end_datetime, const std::string& username) {
  std::cout << "\n=== Terminal Input Logs for " << target_username << " ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string password = get_password_input();
  std::cout << std::endl;
  
  if (password.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(username, password)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  if (start_datetime.empty() || end_datetime.empty()) {
    std::cout << "Date/time cannot be empty. Cancelled.\n\n";
    return;
  }
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  std::vector<std::map<std::string, std::string>> inputs;
  if (!users.getTerminalInputsByUser(target_username, start_datetime, end_datetime, inputs, error)) {
    std::cout << "Error retrieving terminal inputs: " << error << "\n\n";
    return;
  }
  
  if (inputs.empty()) {
    std::cout << "No terminal inputs found for " << target_username << " in the specified time range.\n\n";
    return;
  }
  
  std::cout << "\nTerminal Inputs for " << target_username << " between " << start_datetime << " and " << end_datetime << ":\n";
  std::cout << std::string(120, '-') << "\n";
  std::cout << std::left << std::setw(20) << "Username" << std::setw(12) << "Date" 
            << std::setw(10) << "Time" << std::setw(78) << "Command" << "\n";
  std::cout << std::string(120, '-') << "\n";
  
  for (const auto& input : inputs) {
    std::cout << std::left << std::setw(20) << input.at("username")
              << std::setw(12) << input.at("input_date") 
              << std::setw(10) << input.at("input_time")
              << std::setw(78) << input.at("command_input") << "\n";
  }
  
  std::cout << std::string(120, '-') << "\n";
  std::cout << "Total records: " << inputs.size() << "\n\n";
}

void handle_terminal_inputs_export_command(const std::string& start_datetime, const std::string& end_datetime, const std::string& export_path, const std::string& username) {
  std::cout << "\n=== Export Terminal Input Logs to CSV ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string password = get_password_input();
  std::cout << std::endl;
  
  if (password.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(username, password)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  if (start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
    std::cout << "Date/time and export path cannot be empty. Cancelled.\n\n";
    return;
  }
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  if (!users.exportTerminalInputs(start_datetime, end_datetime, export_path, error)) {
    std::cout << "Failed to export terminal inputs: " << error << "\n\n";
    return;
  }
  
  std::cout << "Terminal input logs exported successfully to: " << export_path << "\n\n";
}

void handle_terminal_inputs_user_export_command(const std::string& target_username, const std::string& start_datetime, const std::string& end_datetime, const std::string& export_path, const std::string& username) {
  std::cout << "\n=== Export Terminal Input Logs for " << target_username << " to CSV ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string password = get_password_input();
  std::cout << std::endl;
  
  if (password.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(username, password)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  if (start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
    std::cout << "Date/time and export path cannot be empty. Cancelled.\n\n";
    return;
  }
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  if (!users.exportTerminalInputsByUser(target_username, start_datetime, end_datetime, export_path, error)) {
    std::cout << "Failed to export terminal inputs: " << error << "\n\n";
    return;
  }
  
  std::cout << "Terminal input logs for " << target_username << " exported successfully to: " << export_path << "\n\n";
}

void handle_employees_command(const std::string& adminUsername) {
  std::cout << "\n=== Employee Directory ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string adminPassword = get_password_input();
  std::cout << std::endl;
  
  if (adminPassword.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(adminUsername, adminPassword)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  auto allUsers = users.getAllUsers(error);
  if (!error.empty()) {
    std::cout << "Error retrieving employees: " << error << "\n\n";
    return;
  }
  
  if (allUsers.empty()) {
    std::cout << "No employees found.\n\n";
    return;
  }
  
  std::cout << std::left << std::setw(8) << "ID" << std::setw(20) << "Username" << std::setw(15) << "First Name" 
            << std::setw(15) << "Last Name" << std::setw(15) << "Position" << std::setw(15) << "Department" 
            << std::setw(10) << "Status" << "\n";
  std::cout << std::string(100, '-') << "\n";
  
  for (const auto& user : allUsers) {
    std::cout << std::left << std::setw(8) << user.id << std::setw(20) << user.username 
              << std::setw(15) << user.first_name << std::setw(15) << user.last_name 
              << std::setw(15) << user.position << std::setw(15) << user.department 
              << std::setw(10) << user.employment_status << "\n";
  }
  
  std::cout << std::string(100, '-') << "\n";
  std::cout << "Total employees: " << allUsers.size() << "\n\n";
}

void handle_employee_profile_command(const std::string& target_username) {
  std::cout << "\n=== Employee Profile: " << target_username << " ===\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  auto user = users.findByUsername(target_username, error);
  if (!user) {
    std::cout << "Employee not found: " << target_username << "\n\n";
    return;
  }
  
  std::cout << "Basic Information:\n";
  std::cout << "  ID: " << user->id << "\n";
  std::cout << "  Username: " << user->username << "\n";
  std::cout << "  Name: " << user->first_name << " " << user->middle_name << " " << user->last_name << "\n";
  std::cout << "  Employee Number: " << (user->employee_number.empty() ? "Not set" : user->employee_number) << "\n";
  std::cout << "  Position: " << user->position << "\n";
  std::cout << "  Department: " << user->department << "\n";
  std::cout << "  Direct Superior: " << (user->direct_superior.empty() ? "Not set" : user->direct_superior) << "\n";
  std::cout << "  Years Employment: " << user->years_employment << "\n";
  std::cout << "  Work Type: " << user->work_type << "\n";
  std::cout << "  Employment Status: " << user->employment_status << "\n";
  std::cout << "  Account Status: " << user->account_status << "\n";
  
  std::cout << "\nContact Information:\n";
  std::cout << "  Work Phone: " << (user->work_phone.empty() ? "Not set" : user->work_phone) << "\n";
  std::cout << "  Work Email: " << (user->work_email.empty() ? "Not set" : user->work_email) << "\n";
  std::cout << "  Personal Email: " << (user->personal_email.empty() ? "Not set" : user->personal_email) << "\n";
  std::cout << "  Home Address: " << (user->home_address.empty() ? "Not set" : user->home_address) << "\n";
  
  std::cout << "\nAdmin Information:\n";
  std::cout << "  Role: " << user->role << "\n";
  std::cout << "  Hire Date: " << (user->hire_date.empty() ? "Not set" : user->hire_date) << "\n";
  std::cout << "  Last Login: " << (user->last_login_date.empty() ? "Never" : user->last_login_date) << "\n";
  std::cout << "  Skills/Certifications: " << (user->skills_certifications.empty() ? "Not set" : user->skills_certifications) << "\n";
  std::cout << "  Admin Notes: " << (user->admin_notes.empty() ? "None" : user->admin_notes) << "\n";
  
  std::cout << "\nSystem Information:\n";
  std::cout << "  Created: " << user->created_at << "\n";
  std::cout << "  Last Updated: " << user->updated_at << "\n\n";
}

void handle_schedule_command(const std::string& target_username, const std::string& start_datetime, const std::string& end_datetime) {
  std::cout << "\n=== Work Schedule: " << target_username << " ===\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  auto user = users.findByUsername(target_username, error);
  if (!user) {
    std::cout << "Employee not found: " << target_username << "\n\n";
    return;
  }
  
  // Convert MMDDYYHHMM format to MM-DD-YYYY format
  std::string start_date, end_date;
  
  if (start_datetime.length() == 10) {
    start_date = start_datetime.substr(0, 2) + "-" + start_datetime.substr(2, 2) + "-20" + start_datetime.substr(4, 2);
  } else {
    std::cout << "Invalid start date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  if (end_datetime.length() == 10) {
    end_date = end_datetime.substr(0, 2) + "-" + end_datetime.substr(2, 2) + "-20" + end_datetime.substr(4, 2);
  } else {
    std::cout << "Invalid end date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  auto schedules = users.getWorkSchedules(user->id, start_date, end_date, error);
  if (!error.empty()) {
    std::cout << "Error retrieving schedule: " << error << "\n\n";
    return;
  }
  
  if (schedules.empty()) {
    std::cout << "No work schedule entries found for the specified date range.\n\n";
    return;
  }
  
  std::cout << "Date Range: " << start_date << " to " << end_date << "\n\n";
  std::cout << std::left << std::setw(6) << "ID" << std::setw(25) << "Task Name" << std::setw(12) << "Start Date" 
            << std::setw(10) << "Start Time" << std::setw(12) << "End Date" << std::setw(10) << "End Time" 
            << std::setw(12) << "Status" << std::setw(10) << "Priority" << std::setw(15) << "Assigned By" << "\n";
  std::cout << std::string(120, '-') << "\n";
  
  for (const auto& schedule : schedules) {
    std::cout << std::left << std::setw(6) << schedule.id << std::setw(25) << schedule.task_name 
              << std::setw(12) << schedule.start_date << std::setw(10) << schedule.start_time 
              << std::setw(12) << schedule.end_date << std::setw(10) << schedule.end_time 
              << std::setw(12) << schedule.task_status << std::setw(10) << schedule.priority 
              << std::setw(15) << schedule.assigned_by << "\n";
  }
  
  std::cout << std::string(120, '-') << "\n";
  std::cout << "Total tasks: " << schedules.size() << "\n\n";
}

void handle_schedule_export_command(const std::string& target_username, const std::string& start_datetime, const std::string& end_datetime, const std::string& export_path) {
  std::cout << "\n=== Export Work Schedule to CSV ===\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  auto user = users.findByUsername(target_username, error);
  if (!user) {
    std::cout << "Employee not found: " << target_username << "\n\n";
    return;
  }
  
  // Convert MMDDYYHHMM format to MM-DD-YYYY format
  std::string start_date, end_date;
  
  if (start_datetime.length() == 10) {
    start_date = start_datetime.substr(0, 2) + "-" + start_datetime.substr(2, 2) + "-20" + start_datetime.substr(4, 2);
  } else {
    std::cout << "Invalid start date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  if (end_datetime.length() == 10) {
    end_date = end_datetime.substr(0, 2) + "-" + end_datetime.substr(2, 2) + "-20" + end_datetime.substr(4, 2);
  } else {
    std::cout << "Invalid end date format. Expected MMDDYYHHMM (10 digits).\n\n";
    return;
  }
  
  // Create a temporary SQL file for the export
  std::string temp_sql_file = "/tmp/schedule_export_query.sql";
  std::ofstream sql_file(temp_sql_file);
  sql_file << ".mode csv\n";
  sql_file << ".headers on\n";
  sql_file << ".output " << export_path << "\n";
  sql_file << "SELECT ws.id, u.username, u.first_name, u.last_name, ws.task_name, ws.task_description, "
           << "ws.start_date, ws.start_time, ws.end_date, ws.end_time, ws.task_status, ws.priority, "
           << "ws.assigned_by, ws.notes, ws.created_at, ws.updated_at "
           << "FROM work_schedules ws "
           << "JOIN users u ON ws.employee_id = u.id "
           << "WHERE u.id = " << user->id << " AND ws.start_date >= '" << start_date << "' AND ws.end_date <= '" << end_date << "' "
           << "ORDER BY ws.start_date, ws.start_time;\n";
  sql_file.close();
  
  // Execute the export using the SQL file
  std::string sqlite_cmd = "sqlite3 " + db.path().string() + " < " + temp_sql_file;
  int result = system(sqlite_cmd.c_str());
  
  // Clean up temporary file
  std::remove(temp_sql_file.c_str());
  
  if (result == 0) {
    std::cout << "Schedule export completed successfully!\n";
    std::cout << "File saved as: " << export_path << "\n\n";
  } else {
    std::cout << "Export failed. Please check file permissions and try again.\n\n";
  }
}

void handle_create_employee_command(const std::string& adminUsername) {
  std::cout << "\n=== Create New Employee Account ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string adminPassword = get_password_input();
  std::cout << std::endl;
  
  if (adminPassword.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(adminUsername, adminPassword)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  // Create employee profile
  agrs::core::User profile;
  
  std::cout << "Enter employee information:\n\n";
  
  std::cout << "First name: ";
  std::getline(std::cin, profile.first_name);
  if (profile.first_name.empty()) {
    std::cout << "First name is required. Cancelled.\n\n";
    return;
  }
  
  std::cout << "Middle name (optional): ";
  std::getline(std::cin, profile.middle_name);
  
  std::cout << "Last name: ";
  std::getline(std::cin, profile.last_name);
  if (profile.last_name.empty()) {
    std::cout << "Last name is required. Cancelled.\n\n";
    return;
  }
  
  std::cout << "Employee number: ";
  std::getline(std::cin, profile.employee_number);
  
  std::cout << "Position/Role: ";
  std::getline(std::cin, profile.position);
  if (profile.position.empty()) {
    std::cout << "Position is required. Cancelled.\n\n";
    return;
  }
  
  std::cout << "Department: ";
  std::getline(std::cin, profile.department);
  if (profile.department.empty()) {
    std::cout << "Department is required. Cancelled.\n\n";
    return;
  }
  
  std::cout << "Direct superior: ";
  std::getline(std::cin, profile.direct_superior);
  
  std::cout << "Work phone number: ";
  std::getline(std::cin, profile.work_phone);
  
  std::cout << "Work email: ";
  std::getline(std::cin, profile.work_email);
  
  std::cout << "Home address: ";
  std::getline(std::cin, profile.home_address);
  
  std::cout << "Permissions: ";
  std::getline(std::cin, profile.permissions);
  
  std::cout << "Roles: ";
  std::getline(std::cin, profile.roles_admin);
  
  std::cout << "Employment status (active/inactive/terminated/on leave): ";
  std::getline(std::cin, profile.employment_status);
  if (profile.employment_status.empty()) {
    profile.employment_status = "active";
  }
  
  std::cout << "Hire date (YYYY-MM-DD): ";
  std::getline(std::cin, profile.hire_date);
  
  std::cout << "Work type (full-time/part-time): ";
  std::getline(std::cin, profile.work_type);
  if (profile.work_type.empty()) {
    profile.work_type = "full-time";
  }
  
  std::cout << "Skills/Certifications: ";
  std::getline(std::cin, profile.skills_certifications);
  
  std::cout << "Admin notes: ";
  std::getline(std::cin, profile.admin_notes);
  
  // Set defaults
  profile.role = "user";
  profile.years_employment = 0;
  profile.account_status = "active";
  profile.temporary_password = true;
  
  // Generate random password
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string tempPassword = users.generateRandomPassword();
  
  if (tempPassword.empty()) {
    std::cout << "Failed to generate temporary password. Cancelled.\n\n";
    return;
  }
  
  // Create employee
  std::string generatedUsername, error;
  if (!users.createEmployee(profile, tempPassword, generatedUsername, error)) {
    std::cout << "Failed to create employee: " << error << "\n\n";
    return;
  }
  
  std::cout << "\n=== Employee Account Created Successfully ===\n";
  std::cout << "Username: " << generatedUsername << "\n";
  std::cout << "Temporary Password: " << tempPassword << "\n";
  std::cout << "Name: " << profile.first_name << " " << profile.middle_name << " " << profile.last_name << "\n";
  std::cout << "Position: " << profile.position << "\n";
  std::cout << "Department: " << profile.department << "\n";
  std::cout << "\nIMPORTANT: Provide the temporary password to the new employee.\n";
  std::cout << "They will be required to change it on first login.\n\n";
}

void handle_deactivate_user_command(const std::string& adminUsername) {
  std::cout << "\n=== Deactivate User Account ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string adminPassword = get_password_input();
  std::cout << std::endl;
  
  if (adminPassword.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(adminUsername, adminPassword)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  // Get username to deactivate
  std::cout << "Enter username to deactivate: ";
  std::string targetUsername;
  std::getline(std::cin, targetUsername);
  
  if (targetUsername.empty()) {
    std::cout << "Username cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Check if user exists
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  auto user = users.findByUsername(targetUsername, error);
  if (!user) {
    std::cout << "User not found: " << targetUsername << "\n\n";
    return;
  }
  
  if (user->deactivated) {
    std::cout << "User " << targetUsername << " is already deactivated.\n\n";
    return;
  }
  
  // Get deactivation reason
  std::cout << "Enter deactivation reason: ";
  std::string reason;
  std::getline(std::cin, reason);
  
  if (reason.empty()) {
    std::cout << "Reason cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Confirm deactivation with password
  std::cout << "\nConfirm deactivation by entering your password again: ";
  std::string confirmPassword = get_password_input();
  std::cout << std::endl;
  
  if (confirmPassword != adminPassword) {
    std::cout << "Password confirmation failed. Deactivation cancelled.\n\n";
    return;
  }
  
  // Perform deactivation
  if (!users.deactivateUser(targetUsername, reason, adminUsername, error)) {
    std::cout << "Failed to deactivate user: " << error << "\n\n";
    return;
  }
  
  std::cout << "\n=== User Deactivated Successfully ===\n";
  std::cout << "Username: " << targetUsername << "\n";
  std::cout << "Reason: " << reason << "\n";
  std::cout << "Deactivated by: " << adminUsername << "\n\n";
}

void handle_delete_user_command(const std::string& adminUsername) {
  std::cout << "\n=== Delete User Account ===\n";
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string adminPassword = get_password_input();
  std::cout << std::endl;
  
  if (adminPassword.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(adminUsername, adminPassword)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  // Get username to delete
  std::cout << "Enter username to delete: ";
  std::string targetUsername;
  std::getline(std::cin, targetUsername);
  
  if (targetUsername.empty()) {
    std::cout << "Username cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Check if user exists
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  auto user = users.findByUsername(targetUsername, error);
  if (!user) {
    std::cout << "User not found: " << targetUsername << "\n\n";
    return;
  }
  
  // Get deletion reason
  std::cout << "Enter deletion reason: ";
  std::string reason;
  std::getline(std::cin, reason);
  
  if (reason.empty()) {
    std::cout << "Reason cannot be empty. Cancelled.\n\n";
    return;
  }
  
  // Confirm deletion with password
  std::cout << "\nConfirm deletion by entering your password again: ";
  std::string confirmPassword = get_password_input();
  std::cout << std::endl;
  
  if (confirmPassword != adminPassword) {
    std::cout << "Password confirmation failed. Deletion cancelled.\n\n";
    return;
  }
  
  // Perform deletion
  if (!users.deleteUser(targetUsername, reason, adminUsername, error)) {
    std::cout << "Failed to delete user: " << error << "\n\n";
    return;
  }
  
  std::cout << "\n=== User Deleted Successfully ===\n";
  std::cout << "Username: " << targetUsername << "\n";
  std::cout << "Reason: " << reason << "\n";
  std::cout << "Deleted by: " << adminUsername << "\n";
  std::cout << "User data has been archived in deleted_users table.\n\n";
}

void handle_profile_edit_command(const std::string& username, const std::string& field) {
  std::cout << "\n=== Edit My Profile ===\n";
  
  // Valid fields for self-editing
  std::vector<std::string> validFields = {"work_phone", "work_email", "personal_email", "home_address"};
  
  // If no field specified or invalid field, show available fields
  if (field.empty() || std::find(validFields.begin(), validFields.end(), field) == validFields.end()) {
    std::cout << "Available fields you can edit:\n";
    std::cout << "  work_phone     - Your work phone number\n";
    std::cout << "  work_email     - Your work email address\n";
    std::cout << "  personal_email - Your personal email address\n";
    std::cout << "  home_address   - Your home address\n\n";
    std::cout << "Usage: profile edit <field_name>\n";
    std::cout << "Example: profile edit work_phone\n\n";
    return;
  }
  
  // Get current user profile
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  auto currentUser = users.findByUsername(username, error);
  if (!currentUser) {
    std::cout << "Error retrieving your profile information.\n\n";
    return;
  }
  
  std::string currentValue;
  std::string fieldLabel;
  
  // Get current value and field label
  if (field == "work_phone") {
    currentValue = currentUser->work_phone;
    fieldLabel = "Work phone";
  } else if (field == "work_email") {
    currentValue = currentUser->work_email;
    fieldLabel = "Work email";
  } else if (field == "personal_email") {
    currentValue = currentUser->personal_email;
    fieldLabel = "Personal email";
  } else if (field == "home_address") {
    currentValue = currentUser->home_address;
    fieldLabel = "Home address";
  }
  
  std::cout << "Editing: " << fieldLabel << "\n";
  std::cout << "Current value: " << (currentValue.empty() ? "(not set)" : currentValue) << "\n\n";
  std::cout << "Enter new value (press Enter to cancel): ";
  
  std::string newValue;
  std::getline(std::cin, newValue);
  
  if (newValue.empty()) {
    std::cout << "Edit cancelled.\n\n";
    return;
  }
  
  // Validate phone numbers
  if (field == "work_phone" && !validatePhoneNumber(newValue)) {
    std::cout << "Invalid phone number format. Please use:\n";
    std::cout << "  - Digits only: 5149712858\n";
    std::cout << "  - With country code: +1 5149712858\n";
    std::cout << "  - No hyphens, brackets, or letters allowed\n\n";
    return;
  }
  
  // Confirm change
  std::cout << "\nChange " << fieldLabel << " to: " << newValue << "\n";
  std::cout << "Confirm? (yes/no): ";
  std::string confirmation;
  std::getline(std::cin, confirmation);
  
  if (to_lower_copy(trim_copy(confirmation)) != "yes") {
    std::cout << "Edit cancelled.\n\n";
    return;
  }
  
  // Update the specific field
  std::string workPhone = currentUser->work_phone;
  std::string workEmail = currentUser->work_email;
  std::string personalEmail = currentUser->personal_email;
  std::string homeAddress = currentUser->home_address;
  
  if (field == "work_phone") workPhone = newValue;
  else if (field == "work_email") workEmail = newValue;
  else if (field == "personal_email") personalEmail = newValue;
  else if (field == "home_address") homeAddress = newValue;
  
  // Update profile
  if (!users.updateEmployeeSelfProfile(username, workPhone, workEmail, personalEmail, homeAddress, error)) {
    std::cout << "Failed to update profile: " << error << "\n\n";
    return;
  }
  
  // Log the field change
  std::string logError;
  if (!users.logFieldChange(username, field, currentValue, newValue, username, "self_edit", logError)) {
    spdlog::warn("Failed to log field change for {}: {}", field, logError);
  }
  
  std::cout << "\n=== Profile Updated Successfully ===\n";
  std::cout << fieldLabel << " updated to: " << newValue << "\n\n";
}

void handle_profile_edit_user_command(const std::string& adminUsername, const std::string& targetUsername, const std::vector<std::string>& fields) {
  std::cout << "\n=== Edit Employee Profile ===\n";
  
  // Admin-only fields
  std::vector<std::string> validFields = {
    "first_name", "middle_name", "last_name", "employee_number", "position", "department",
    "direct_superior", "years_employment", "work_phone", "work_email", "personal_email",
    "home_address", "permissions", "roles", "employment_status", "hire_date", 
    "account_status", "work_type", "skills", "admin_notes"
  };
  
  // If no fields specified, show available fields
  if (fields.empty()) {
    std::cout << "Available fields you can edit for any employee:\n";
    std::cout << "Personal Info:\n";
    std::cout << "  first_name, middle_name, last_name, employee_number\n";
    std::cout << "Work Info:\n";
    std::cout << "  position, department, direct_superior, years_employment\n";
    std::cout << "Contact Info:\n";
    std::cout << "  work_phone, work_email, personal_email, home_address\n";
    std::cout << "Admin Fields:\n";
    std::cout << "  permissions, roles, employment_status, hire_date, account_status\n";
    std::cout << "  work_type, skills, admin_notes\n\n";
    std::cout << "Usage: profile edit_user <username> <field1> [field2] [field3] ...\n";
    std::cout << "Single field: profile edit_user jsmith work_phone\n";
    std::cout << "Multiple fields: profile edit_user jsmith position department direct_superior\n\n";
    return;
  }
  
  // Validate all fields
  for (const auto& field : fields) {
    if (std::find(validFields.begin(), validFields.end(), field) == validFields.end()) {
      std::cout << "Invalid field: " << field << "\n";
      std::cout << "Use 'profile edit_user " << targetUsername << "' to see available fields.\n\n";
      return;
    }
  }
  
  // Prompt for admin password verification
  std::cout << "Admin password required: ";
  std::string adminPassword = get_password_input();
  std::cout << std::endl;
  
  if (adminPassword.empty()) {
    std::cout << "Password cannot be empty. Access denied.\n\n";
    return;
  }
  
  if (!verify_admin_password(adminUsername, adminPassword)) {
    std::cout << "Invalid admin password. Access denied.\n\n";
    return;
  }
  
  std::cout << "Admin verification successful.\n\n";
  
  // Get current user profile
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  auto currentUser = users.findByUsername(targetUsername, error);
  if (!currentUser) {
    std::cout << "User not found: " << targetUsername << "\n\n";
    return;
  }
  
  std::cout << "Editing profile for: " << currentUser->first_name << " " << currentUser->last_name << " (" << targetUsername << ")\n";
  std::cout << "Fields to edit: ";
  for (size_t i = 0; i < fields.size(); ++i) {
    std::cout << fields[i];
    if (i < fields.size() - 1) std::cout << ", ";
  }
  std::cout << "\n\n";
  
  // Helper function to get field label and current value
  auto getFieldInfo = [&currentUser](const std::string& field) -> std::pair<std::string, std::string> {
    if (field == "first_name") return {"First name", currentUser->first_name};
    else if (field == "middle_name") return {"Middle name", currentUser->middle_name};
    else if (field == "last_name") return {"Last name", currentUser->last_name};
    else if (field == "employee_number") return {"Employee number", currentUser->employee_number};
    else if (field == "position") return {"Position", currentUser->position};
    else if (field == "department") return {"Department", currentUser->department};
    else if (field == "direct_superior") return {"Direct superior", currentUser->direct_superior};
    else if (field == "years_employment") return {"Years of employment", std::to_string(currentUser->years_employment)};
    else if (field == "work_phone") return {"Work phone", currentUser->work_phone};
    else if (field == "work_email") return {"Work email", currentUser->work_email};
    else if (field == "personal_email") return {"Personal email", currentUser->personal_email};
    else if (field == "home_address") return {"Home address", currentUser->home_address};
    else if (field == "permissions") return {"Permissions", currentUser->permissions};
    else if (field == "roles") return {"Roles", currentUser->roles_admin};
    else if (field == "employment_status") return {"Employment status", currentUser->employment_status};
    else if (field == "hire_date") return {"Hire date", currentUser->hire_date};
    else if (field == "account_status") return {"Account status", currentUser->account_status};
    else if (field == "work_type") return {"Work type", currentUser->work_type};
    else if (field == "skills") return {"Skills/Certifications", currentUser->skills_certifications};
    else if (field == "admin_notes") return {"Admin notes", currentUser->admin_notes};
    return {"Unknown", ""};
  };
  
  // Collect new values for all fields
  std::map<std::string, std::string> newValues;
  bool cancelled = false;
  
  for (const auto& field : fields) {
    auto [fieldLabel, currentValue] = getFieldInfo(field);
    
    std::cout << fieldLabel << " [" << (currentValue.empty() ? "(not set)" : currentValue) << "]: ";
    std::string newValue;
    std::getline(std::cin, newValue);
    
    if (newValue.empty()) {
      std::cout << "Keeping current value for " << fieldLabel << ".\n";
      newValues[field] = currentValue; // Keep current value
    } else {
      // Validate phone numbers
      if (field == "work_phone" && !validatePhoneNumber(newValue)) {
        std::cout << "Invalid phone number format. Please use:\n";
        std::cout << "  - Digits only: 5149712858\n";
        std::cout << "  - With country code: +1 5149712858\n";
        std::cout << "  - No hyphens, brackets, or letters allowed\n";
        std::cout << "Keeping current value for " << fieldLabel << ".\n";
        newValues[field] = currentValue;
      } else {
        newValues[field] = newValue;
      }
    }
  }
  
  // Show summary of changes
  std::cout << "\n=== Summary of Changes ===\n";
  bool hasChanges = false;
  for (const auto& field : fields) {
    auto [fieldLabel, currentValue] = getFieldInfo(field);
    if (newValues[field] != currentValue) {
      std::cout << fieldLabel << ": \"" << (currentValue.empty() ? "(not set)" : currentValue) 
                << "\" → \"" << newValues[field] << "\"\n";
      hasChanges = true;
    }
  }
  
  if (!hasChanges) {
    std::cout << "No changes made.\n\n";
    return;
  }
  
  // Confirm all changes
  std::cout << "\nConfirm all changes? (yes/no): ";
  std::string confirmation;
  std::getline(std::cin, confirmation);
  
  if (to_lower_copy(trim_copy(confirmation)) != "yes") {
    std::cout << "All changes cancelled.\n\n";
    return;
  }
  
  // Create updated profile with all field changes
  agrs::core::User updatedProfile = *currentUser;
  
  for (const auto& field : fields) {
    const std::string& newValue = newValues[field];
    
    if (field == "first_name") updatedProfile.first_name = newValue;
    else if (field == "middle_name") updatedProfile.middle_name = newValue;
    else if (field == "last_name") updatedProfile.last_name = newValue;
    else if (field == "employee_number") updatedProfile.employee_number = newValue;
    else if (field == "position") updatedProfile.position = newValue;
    else if (field == "department") updatedProfile.department = newValue;
    else if (field == "direct_superior") updatedProfile.direct_superior = newValue;
    else if (field == "years_employment") {
      if (newValue != std::to_string(currentUser->years_employment)) {
        try {
          updatedProfile.years_employment = std::stoi(newValue);
        } catch (const std::exception& e) {
          std::cout << "Invalid number for years of employment: " << newValue << ". Keeping current value.\n";
        }
      }
    }
    else if (field == "work_phone") updatedProfile.work_phone = newValue;
    else if (field == "work_email") updatedProfile.work_email = newValue;
    else if (field == "personal_email") updatedProfile.personal_email = newValue;
    else if (field == "home_address") updatedProfile.home_address = newValue;
    else if (field == "permissions") updatedProfile.permissions = newValue;
    else if (field == "roles") updatedProfile.roles_admin = newValue;
    else if (field == "employment_status") updatedProfile.employment_status = newValue;
    else if (field == "hire_date") updatedProfile.hire_date = newValue;
    else if (field == "account_status") updatedProfile.account_status = newValue;
    else if (field == "work_type") updatedProfile.work_type = newValue;
    else if (field == "skills") updatedProfile.skills_certifications = newValue;
    else if (field == "admin_notes") updatedProfile.admin_notes = newValue;
  }
  
  // Update profile
  if (!users.updateEmployeeProfile(targetUsername, updatedProfile, error)) {
    std::cout << "Failed to update profile: " << error << "\n\n";
    return;
  }
  
  // Log all field changes
  for (const auto& field : fields) {
    auto [fieldLabel, currentValue] = getFieldInfo(field);
    if (newValues[field] != currentValue) {
      std::string logError;
      if (!users.logFieldChange(targetUsername, field, currentValue, newValues[field], 
                                adminUsername, "admin_edit", logError)) {
        spdlog::warn("Failed to log field change for {}: {}", field, logError);
      }
    }
  }
  
  std::cout << "\n=== Profile Updated Successfully ===\n";
  std::cout << "Updated " << fields.size() << " field(s) for " << targetUsername << "\n\n";
}

void handle_profile_changelog_command(const std::string& username, const std::string& targetUsername, 
                                      const std::string& startDateTime, const std::string& endDateTime) {
  std::cout << "\n=== Field Change Log for " << targetUsername << " ===\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  std::vector<std::map<std::string, std::string>> changes;
  if (!users.getFieldChanges(targetUsername, startDateTime, endDateTime, changes, error)) {
    std::cout << "Failed to retrieve field changes: " << error << "\n\n";
    return;
  }
  
  if (changes.empty()) {
    std::cout << "No field changes found for the specified date range.\n\n";
    return;
  }
  
  std::cout << "Found " << changes.size() << " field change(s):\n\n";
  
  for (size_t i = 0; i < changes.size(); ++i) {
    const auto& change = changes[i];
    std::cout << "[" << (i + 1) << "] Field: " << change.at("field_name") << "\n";
    std::cout << "    Previous: \"" << (change.at("previous_value").empty() ? "(not set)" : change.at("previous_value")) << "\"\n";
    std::cout << "    New:      \"" << change.at("new_value") << "\"\n";
    std::cout << "    Date:     " << change.at("change_date") << " " << change.at("change_time") << "\n";
    std::cout << "    By:       " << change.at("changed_by") << " (" << change.at("change_type") << ")\n";
    std::cout << "\n";
  }
}

void handle_profile_changelog_export_command(const std::string& username, const std::string& targetUsername,
                                             const std::string& startDateTime, const std::string& endDateTime,
                                             const std::string& exportPath) {
  std::cout << "\n=== Exporting Field Change Log ===\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  if (!users.exportFieldChanges(targetUsername, startDateTime, endDateTime, exportPath, error)) {
    std::cout << "Failed to export field changes: " << error << "\n\n";
    return;
  }
  
  std::cout << "Field change log exported successfully to: " << exportPath << "\n\n";
}

void handle_profile_view_command(const std::string& username) {
  std::cout << "\n=== My Profile ===\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  auto user = users.findByUsername(username, error);
  if (!user) {
    std::cout << "Error retrieving your profile information.\n\n";
    return;
  }
  
  std::cout << "Basic Information:\n";
  std::cout << "  Username: " << user->username << "\n";
  std::cout << "  Name: " << user->first_name;
  if (!user->middle_name.empty()) std::cout << " " << user->middle_name;
  std::cout << " " << user->last_name << "\n";
  std::cout << "  Employee Number: " << (user->employee_number.empty() ? "Not set" : user->employee_number) << "\n";
  std::cout << "  Position: " << user->position << "\n";
  std::cout << "  Department: " << user->department << "\n";
  std::cout << "  Direct Superior: " << (user->direct_superior.empty() ? "Not set" : user->direct_superior) << "\n";
  std::cout << "  Years Employment: " << user->years_employment << "\n";
  std::cout << "  Work Type: " << user->work_type << "\n";
  std::cout << "  Employment Status: " << user->employment_status << "\n";
  
  std::cout << "\nContact Information:\n";
  std::cout << "  Work Phone: " << (user->work_phone.empty() ? "Not set" : user->work_phone) << "\n";
  std::cout << "  Work Email: " << (user->work_email.empty() ? "Not set" : user->work_email) << "\n";
  std::cout << "  Personal Email: " << (user->personal_email.empty() ? "Not set" : user->personal_email) << "\n";
  std::cout << "  Home Address: " << (user->home_address.empty() ? "Not set" : user->home_address) << "\n";
  
  std::cout << "\nWork Information:\n";
  std::cout << "  Role: " << user->role << "\n";
  std::cout << "  Hire Date: " << (user->hire_date.empty() ? "Not set" : user->hire_date) << "\n";
  std::cout << "  Last Login: " << (user->last_login_date.empty() ? "Never" : user->last_login_date) << "\n";
  std::cout << "  Skills/Certifications: " << (user->skills_certifications.empty() ? "Not set" : user->skills_certifications) << "\n";
  
  std::cout << "\nSystem Information:\n";
  std::cout << "  Created: " << user->created_at << "\n";
  std::cout << "  Last Updated: " << user->updated_at << "\n\n";
}

void handle_employee_profile_limited_command(const std::string& target_username) {
  std::cout << "\n=== Employee Profile: " << target_username << " ===\n";
  
  agrs::core::Database db(agrs::core::Database::defaultDbPath());
  agrs::core::Users users(db);
  std::string error;
  
  auto user = users.findByUsername(target_username, error);
  if (!user) {
    std::cout << "Employee not found: " << target_username << "\n\n";
    return;
  }
  
  std::cout << "Basic Information:\n";
  std::cout << "  Username: " << user->username << "\n";
  std::cout << "  Name: " << user->first_name;
  if (!user->middle_name.empty()) std::cout << " " << user->middle_name;
  std::cout << " " << user->last_name << "\n";
  std::cout << "  Employee Number: " << (user->employee_number.empty() ? "Not set" : user->employee_number) << "\n";
  std::cout << "  Position: " << user->position << "\n";
  std::cout << "  Department: " << user->department << "\n";
  std::cout << "  Direct Superior: " << (user->direct_superior.empty() ? "Not set" : user->direct_superior) << "\n";
  std::cout << "  Employment Status: " << user->employment_status << "\n";
  
  std::cout << "\nContact Information:\n";
  std::cout << "  Work Email: " << (user->work_email.empty() ? "Not set" : user->work_email) << "\n";
  std::cout << "  Work Phone: " << (user->work_phone.empty() ? "Not set" : user->work_phone) << "\n\n";
}

void run_zeus_terminal(const std::string& username, const std::string& role) {
  std::cout << "\n=== AGRS ZEUS Terminal ===\n";
  std::cout << "Logged in as: " << username << " (" << role << ")\n";
  std::cout << "Type 'help' for available commands, 'quit' to exit.\n\n";
  
  std::string input;
  const std::string normalizedRole = to_lower_copy(trim_copy(role));

  // Local ID mapping system for messages
  // Maps local IDs (1, 2, 3...) to global database IDs
  std::map<int, int64_t> localToGlobalIdMap;
  std::map<int64_t, int> globalToLocalIdMap;
  int nextLocalId = 1;

  // Helper function to build local ID mapping from messages
  auto buildLocalIdMapping = [&](const std::vector<agrs::core::Message>& messages) {
    localToGlobalIdMap.clear();
    globalToLocalIdMap.clear();
    nextLocalId = 1;
    
    for (const auto& msg : messages) {
      localToGlobalIdMap[nextLocalId] = msg.id;
      globalToLocalIdMap[msg.id] = nextLocalId;
      nextLocalId++;
    }
  };

  // Helper function to truncate message content to first 10 words
  auto truncateMessage = [](const std::string& message, int maxWords = 10) -> std::string {
    std::istringstream iss(message);
    std::vector<std::string> words;
    std::string word;
    
    while (iss >> word && words.size() < maxWords) {
      words.push_back(word);
    }
    
    if (words.size() < maxWords) {
      return message; // Return original if less than max words
    }
    
    std::ostringstream oss;
    for (size_t i = 0; i < words.size(); ++i) {
      if (i > 0) oss << " ";
      oss << words[i];
    }
    oss << "...";
    return oss.str();
  };

  // Rate limiting and session management
  auto lastMessageTime = std::chrono::steady_clock::now();
  auto lastActivityTime = std::chrono::steady_clock::now();
  const auto MESSAGE_RATE_LIMIT = std::chrono::seconds(1);
  const auto SESSION_TIMEOUT = std::chrono::hours(6);
  
  // Background notifier for unread messages (improved)
  std::atomic<bool> notifierRunning{true};
  std::thread notifier([&]() {
    size_t prevCount = 0;
    // Create connection once at login
    agrs::core::Database dbN(agrs::core::Database::defaultDbPath());
    agrs::core::Users usersN(dbN);
    
    while (notifierRunning.load()) {
      try {
        std::vector<agrs::core::Message> msgs;
        std::string errN;
        if (usersN.getUnreadMessages(username, msgs, errN)) {
          if (msgs.size() > prevCount) {
            const auto& m = msgs.back();
            std::cout << "\n[New message] From " << m.sender << " at " << m.sent_time << ". Use 'msg unread' to view." << std::endl;
            std::cout << "zeus> " << std::flush;
          }
          prevCount = msgs.size();
        }
      } catch (...) {
        // ignore notifier errors
      }
      std::this_thread::sleep_for(std::chrono::seconds(60)); // Changed from 3 to 60 seconds
    }
  });
  while (true) {
    // Check session timeout
    auto now = std::chrono::steady_clock::now();
    if (now - lastActivityTime > SESSION_TIMEOUT) {
      std::cout << "\nSession timed out due to inactivity. Please log in again.\n";
      notifierRunning.store(false);
      if (notifier.joinable()) notifier.join();
      break;
    }
    
    std::cout << "zeus> ";
    std::getline(std::cin, input);
    input = trim_copy(input);
    
    if (input.empty()) continue;
    
    // Update activity time for any input
    lastActivityTime = std::chrono::steady_clock::now();
    
    // Log terminal input (non-sensitive commands only)
    agrs::core::Database db(agrs::core::Database::defaultDbPath());
    agrs::core::Users users(db);
    std::string logError;
    // Avoid logging message content; mask msg send lines
    std::string masked = input;
    if (masked.rfind("msg send ", 0) == 0) {
      size_t pos = masked.find(' ', 9);
      if (pos != std::string::npos) {
        std::string recipient = masked.substr(9, pos - 9);
        masked = "msg send " + recipient + " [hidden]";
      } else {
        masked = "msg send [hidden]";
      }
    }
    if (!users.logTerminalInput(username, masked, logError)) {
      spdlog::warn("Failed to log terminal input: {}", logError);
    }
    
    if (input == "quit") {
      std::cout << "Goodbye!\n";
      notifierRunning.store(false);
      if (notifier.joinable()) notifier.join();
      break;
    }
    
    if (input == "help") {
      std::cout << "\nAvailable commands:\n";
      std::cout << "  help     - Show this help\n";
      std::cout << "  help admin - Show admin commands (admin only)\n";
      std::cout << "  version  - Show version information\n";
      std::cout << "  status   - Show current user status\n";
      std::cout << "  msg help - Messaging commands\n";
      std::cout << "  profile help - Show all profile-related commands\n";
      std::cout << "  quit     - Exit the terminal\n\n";
      continue;
    }
    
    if (input == "help admin") {
      if (normalizedRole == "admin") {
        std::cout << "\nAdmin commands:\n";
        std::cout << "  logs login_attempts MMDDYYHHMM MMDDYYHHMM - View login attempts\n";
        std::cout << "  logs login_attempts export MMDDYYHHMM MMDDYYHHMM export_path - Export to CSV\n";
        std::cout << "  logs messages <all|username> MMDDYYHHMM MMDDYYHHMM - View messages metadata\n";
        std::cout << "  logs messages <all|username> MMDDYYHHMM MMDDYYHHMM export export_path - Export to CSV\n";
        std::cout << "  logs terminal_inputs MMDDYYHHMM MMDDYYHHMM - View terminal command logs\n";
        std::cout << "  logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM - View terminal logs for specific user\n";
        std::cout << "  logs terminal_inputs MMDDYYHHMM MMDDYYHHMM export export_path - Export terminal logs to CSV\n";
        std::cout << "  logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM export export_path - Export user terminal logs to CSV\n";
        std::cout << "  employees - List all employees (requires password)\n";
        std::cout << "  create employee - Create new employee account\n";
        std::cout << "  deactivate user - Deactivate user account\n";
        std::cout << "  delete user - Delete user account (archives data)\n";
        std::cout << "  schedule <username> MMDDYYHHMM MMDDYYHHMM - View employee work schedule\n";
        std::cout << "  schedule <username> export MMDDYYHHMM MMDDYYHHMM export_path - Export schedule to CSV\n";
        std::cout << "  help admin - Show this admin help\n\n";
      } else {
        std::cout << "Access denied. Admin privileges required.\n\n";
      }
      continue;
    }
    
    if (input == "version") {
      std::cout << "AGRS ZEUS version " << version_string() << "\n";
      continue;
    }
    
    if (input == "status") {
      std::cout << "User: " << username << "\n";
      std::cout << "Role: " << role << "\n";
      std::cout << "Session: Active\n\n";
      continue;
    }
    
    // Admin-only commands
    if (normalizedRole == "admin") {
      if (input == "logs") {
        std::cout << "Usage:\n";
        std::cout << "  logs login_attempts MMDDYYHHMM MMDDYYHHMM\n";
        std::cout << "  logs login_attempts export MMDDYYHHMM MMDDYYHHMM export_path\n";
        std::cout << "  logs terminal_inputs MMDDYYHHMM MMDDYYHHMM\n";
        std::cout << "  logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM\n";
        std::cout << "  logs terminal_inputs MMDDYYHHMM MMDDYYHHMM export export_path\n";
        std::cout << "  logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM export export_path\n\n";
        continue;
      }
      // Parse logs command with parameters
      if (input.size() >= 5 && input.rfind("logs ", 0) == 0) {
        std::istringstream iss(input.substr(5)); // Skip "logs "
        std::string subcommand;
        iss >> subcommand;
        
        if (subcommand == "login_attempts") {
          std::string next_param;
          iss >> next_param;
          
          if (next_param == "export") {
            // Export command: logs login_attempts export MMDDYYHHMM MMDDYYHHMM export_path
            std::string start_datetime, end_datetime, export_path;
            iss >> start_datetime >> end_datetime >> export_path;
            
            if (start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
              std::cout << "Usage: logs login_attempts export MMDDYYHHMM MMDDYYHHMM export_path\n";
              std::cout << "Format: MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)\n";
              std::cout << "Example: logs login_attempts export 0826250000 0826252359 my_logs.csv\n\n";
            } else {
              handle_export_command_with_compact_format(start_datetime, end_datetime, export_path, username);
            }
          } else {
            // View command: logs login_attempts MMDDYYHHMM MMDDYYHHMM
            std::string start_datetime = next_param;
            std::string end_datetime;
            iss >> end_datetime;
            
            if (start_datetime.empty() || end_datetime.empty()) {
              std::cout << "Usage: logs login_attempts MMDDYYHHMM MMDDYYHHMM\n";
              std::cout << "Format: MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)\n";
              std::cout << "Example: logs login_attempts 0826250000 0826252359\n\n";
            } else {
              handle_logs_command_with_compact_format(start_datetime, end_datetime, username);
            }
          }
          continue;
        }

        if (subcommand == "messages") {
          // Prompt for admin password verification
          std::cout << "Admin password required: ";
          std::string pwd = get_password_input();
          std::cout << std::endl;
          if (pwd.empty()) { std::cout << "Password cannot be empty. Access denied.\n\n"; continue; }
          if (!verify_admin_password(username, pwd)) { std::cout << "Invalid admin password. Access denied.\n\n"; continue; }

          std::string userOrAll;
          iss >> userOrAll;
          std::string p1, p2;
          iss >> p1 >> p2;
          if (userOrAll.empty() || p1.empty() || p2.empty()) {
            std::cout << "Usage: logs messages <all|username> MMDDYYHHMM MMDDYYHHMM [export export_path]\n\n";
          } else {
            std::string maybeExport;
            iss >> maybeExport;
            if (maybeExport == "export") {
              std::string exportPath; iss >> exportPath;
              if (exportPath.empty()) {
                std::cout << "Export path required.\n\n";
              } else {
                agrs::core::Database db3(agrs::core::Database::defaultDbPath());
                agrs::core::Users u3(db3);
                std::string err;
                if (!u3.exportMessagesAdmin(userOrAll, p1, p2, exportPath, err)) {
                  std::cout << "Export failed: " << err << "\n\n";
                } else {
                  std::cout << "Messages exported to: " << exportPath << "\n\n";
                }
              }
            } else {
              // View summary (no body content)
              agrs::core::Database db3(agrs::core::Database::defaultDbPath());
              sqlite3_stmt* stmt = nullptr;
              std::string sql = "SELECT id, sender, recipient, sent_date, sent_time, sent_iso8601, status FROM messages WHERE ";
              bool filterUser = userOrAll != "all";
              if (filterUser) sql += "(sender=? OR recipient=?) AND ";
              sql += "(sent_date > ? OR (sent_date = ? AND sent_time >= ?)) AND (sent_date < ? OR (sent_date = ? AND sent_time <= ?)) ORDER BY sent_iso8601 ASC";

              // Parse compact
              auto parseCompact = [](const std::string& dt){ return std::array<std::string,2>{dt.substr(4,2)+"-"+dt.substr(0,2)+"-20"+dt.substr(2,2), dt.substr(6,2)+":"+dt.substr(8,2)}; };
              if (p1.size()!=10 || p2.size()!=10) { std::cout << "Invalid date format. Use MMDDYYHHMM.\n\n"; continue; }
              auto s = parseCompact(p1); auto e = parseCompact(p2);
              if (sqlite3_prepare_v2(db3.handle(), sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
                std::cout << "Error: " << sqlite3_errmsg(db3.handle()) << "\n\n"; continue;
              }
              int bi=1;
              if (filterUser) { sqlite3_bind_text(stmt, bi++, userOrAll.c_str(), -1, SQLITE_STATIC); sqlite3_bind_text(stmt, bi++, userOrAll.c_str(), -1, SQLITE_STATIC); }
              sqlite3_bind_text(stmt, bi++, s[0].c_str(), -1, SQLITE_STATIC);
              sqlite3_bind_text(stmt, bi++, s[0].c_str(), -1, SQLITE_STATIC);
              sqlite3_bind_text(stmt, bi++, s[1].c_str(), -1, SQLITE_STATIC);
              sqlite3_bind_text(stmt, bi++, e[0].c_str(), -1, SQLITE_STATIC);
              sqlite3_bind_text(stmt, bi++, e[0].c_str(), -1, SQLITE_STATIC);
              sqlite3_bind_text(stmt, bi++, e[1].c_str(), -1, SQLITE_STATIC);
              int cnt=0;
              std::cout << "\nMessages (metadata only):\n";
              while (sqlite3_step(stmt) == SQLITE_ROW) {
                long long id = sqlite3_column_int64(stmt, 0);
                const char* sdr = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 1));
                const char* rcp = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 2));
                const char* d = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 3));
                const char* t = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 4));
                const char* iso = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 5));
                const char* st = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 6));
                std::cout << "  [" << id << "] " << (sdr?sdr:"") << " -> " << (rcp?rcp:"") << " at " << (d?d:"") << " " << (t?t:"") << " (" << (st?st:"") << ")";
                if (iso) std::cout << " UTC=" << iso;
                std::cout << "\n";
                cnt++;
              }
              sqlite3_finalize(stmt);
              if (cnt==0) std::cout << "No messages found.\n";
              std::cout << "\n";
            }
          }
          continue;
        }
        
        if (subcommand == "terminal_inputs") {
          std::string next_param;
          iss >> next_param;
          
          // Check if next_param is a date (MMDDYYHHMM format) or username
          if (next_param.length() == 10 && std::all_of(next_param.begin(), next_param.end(), ::isdigit)) {
            // All terminal inputs: logs terminal_inputs MMDDYYHHMM MMDDYYHHMM [export export_path]
            std::string start_datetime = next_param;
            std::string end_datetime;
            iss >> end_datetime;
            
            // Check if there's an export parameter
            std::string export_param;
            iss >> export_param;
            
            if (export_param == "export") {
              // Export command: logs terminal_inputs MMDDYYHHMM MMDDYYHHMM export export_path
              std::string export_path;
              iss >> export_path;
              
              if (start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
                std::cout << "Usage: logs terminal_inputs MMDDYYHHMM MMDDYYHHMM export export_path\n";
                std::cout << "Format: MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)\n";
                std::cout << "Example: logs terminal_inputs 0829200000 0829235959 export terminal_logs.csv\n\n";
              } else {
                handle_terminal_inputs_export_command(start_datetime, end_datetime, export_path, username);
              }
            } else {
              // View command: logs terminal_inputs MMDDYYHHMM MMDDYYHHMM
              if (start_datetime.empty() || end_datetime.empty()) {
                std::cout << "Usage: logs terminal_inputs MMDDYYHHMM MMDDYYHHMM\n";
                std::cout << "Format: MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)\n";
                std::cout << "Example: logs terminal_inputs 0829200000 0829235959\n\n";
              } else {
                handle_terminal_inputs_command(start_datetime, end_datetime, username);
              }
            }
          } else {
            // Specific user: logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM [export export_path]
            std::string target_username = next_param;
            std::string start_datetime, end_datetime;
            iss >> start_datetime >> end_datetime;
            
            // Check if there's an export parameter
            std::string export_param;
            iss >> export_param;
            
            if (export_param == "export") {
              // Export command: logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM export export_path
              std::string export_path;
              iss >> export_path;
              
              if (target_username.empty() || start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
                std::cout << "Usage: logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM export export_path\n";
                std::cout << "Format: MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)\n";
                std::cout << "Example: logs terminal_inputs jcsmith 0829200000 0829235959 export jcsmith_logs.csv\n\n";
              } else {
                handle_terminal_inputs_user_export_command(target_username, start_datetime, end_datetime, export_path, username);
              }
            } else {
              // View command: logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM
              if (target_username.empty() || start_datetime.empty() || end_datetime.empty()) {
                std::cout << "Usage: logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM\n";
                std::cout << "Format: MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)\n";
                std::cout << "Example: logs terminal_inputs jcsmith 0829200000 0829235959\n\n";
              } else {
                handle_terminal_inputs_user_command(target_username, start_datetime, end_datetime, username);
              }
            }
          }
          continue;
        }
        
        std::cout << "Unknown logs subcommand: " << subcommand << "\n";
        std::cout << "Available: login_attempts, terminal_inputs\n\n";
        continue;
      }
      

      
      // Handle employees command (admin only)
      if (input == "employees") {
        handle_employees_command(username);
        continue;
      }
      
      // Handle create employee command
      if (input == "create employee") {
        handle_create_employee_command(username);
        continue;
      }
      
      // Handle deactivate user command
      if (input == "deactivate user") {
        handle_deactivate_user_command(username);
        continue;
      }
      
      // Handle delete user command
      if (input == "delete user") {
        handle_delete_user_command(username);
        continue;
      }
      

      

      
      // Handle schedule command
      if (input.size() >= 9 && input.rfind("schedule ", 0) == 0) {
        std::istringstream iss(input.substr(9)); // Skip "schedule "
        std::string target_username, next_param;
        iss >> target_username >> next_param;
        
        if (target_username.empty()) {
          std::cout << "Usage: schedule <username> MMDDYYHHMM MMDDYYHHMM\n";
          std::cout << "       schedule <username> export MMDDYYHHMM MMDDYYHHMM export_path\n";
          std::cout << "Example: schedule radwan.elgharbi1 0826250000 0826252359\n";
          std::cout << "Example: schedule radwan.elgharbi1 export 0826250000 0826252359 schedule.csv\n\n";
        } else if (next_param == "export") {
          // Export command: schedule <username> export MMDDYYHHMM MMDDYYHHMM export_path
          std::string start_datetime, end_datetime, export_path;
          iss >> start_datetime >> end_datetime >> export_path;
          
          if (start_datetime.empty() || end_datetime.empty() || export_path.empty()) {
            std::cout << "Usage: schedule <username> export MMDDYYHHMM MMDDYYHHMM export_path\n";
            std::cout << "Format: MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)\n";
            std::cout << "Example: schedule radwan.elgharbi1 export 0826250000 0826252359 schedule.csv\n\n";
          } else {
            handle_schedule_export_command(target_username, start_datetime, end_datetime, export_path);
          }
        } else {
          // View command: schedule <username> MMDDYYHHMM MMDDYYHHMM
          std::string start_datetime = next_param;
          std::string end_datetime;
          iss >> end_datetime;
          
          if (start_datetime.empty() || end_datetime.empty()) {
            std::cout << "Usage: schedule <username> MMDDYYHHMM MMDDYYHHMM\n";
            std::cout << "Format: MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)\n";
            std::cout << "Example: schedule radwan.elgharbi1 0826250000 0826252359\n\n";
          } else {
            handle_schedule_command(target_username, start_datetime, end_datetime);
          }
        }
        continue;
      }
    }
    

    
    // Handle profile commands (available to all users)
    if (input.size() >= 7 && input.rfind("profile", 0) == 0) {
      if (input == "profile") {
        std::cout << "Use 'profile help' to see all profile-related commands.\n\n";
        continue;
      }
      
      if (input.size() >= 8 && input.rfind("profile ", 0) == 0) {
        std::istringstream iss(input.substr(8)); // Skip "profile "
        std::string subcommand;
        iss >> subcommand;
        
        if (subcommand == "help") {
          // Show all profile commands
          std::cout << "\nProfile commands:\n";
          std::cout << "  profile view - View your own profile\n";
          std::cout << "  profile edit <field> - Edit your profile field\n";
          std::cout << "  profile employee <username> - View employee profile\n";
          std::cout << "  profile changelog <username> <start> <end> - View field change history\n";
          if (normalizedRole == "admin") {
            std::cout << "  profile edit_user <username> <field1> [field2] ... - Edit employee's profile field(s)\n";
            std::cout << "  profile changelog <username> export <start> <end> <path> - Export change history\n";
          }
          std::cout << "\nExamples:\n";
          std::cout << "  profile view\n";
          std::cout << "  profile edit work_phone\n";
          std::cout << "  profile employee jsmith\n";
          std::cout << "  profile changelog jsmith 0826250000 0827252359\n";
          if (normalizedRole == "admin") {
            std::cout << "  profile edit_user jsmith position\n";
            std::cout << "  profile edit_user jsmith position department direct_superior\n";
            std::cout << "  profile changelog jsmith export 0826250000 0827252359 changes.csv\n";
          }
          std::cout << "\n";
        } else if (subcommand == "view") {
          // profile view - show own profile
          handle_profile_view_command(username);
        } else if (subcommand == "edit") {
          // profile edit <field> for self-editing
          std::string field;
          iss >> field;
          handle_profile_edit_command(username, field);
        } else if (subcommand == "employee") {
          // profile employee <username> - view other employee profile
          std::string targetUsername;
          iss >> targetUsername;
          if (targetUsername.empty()) {
            std::cout << "Usage: profile employee <username>\n";
            std::cout << "Example: profile employee jsmith\n\n";
          } else {
            // Admin users get full profile, non-admin get limited view
            if (normalizedRole == "admin") {
              handle_employee_profile_command(targetUsername);
            } else {
              handle_employee_profile_limited_command(targetUsername);
            }
          }
        } else if (subcommand == "edit_user" && normalizedRole == "admin") {
          // profile edit_user <username> <field1> [field2] [field3] ... for admin editing
          std::string targetUsername;
          iss >> targetUsername;
          
          if (targetUsername.empty()) {
            std::cout << "Usage: profile edit_user <username> <field1> [field2] [field3] ...\n";
            std::cout << "Single field: profile edit_user jsmith work_phone\n";
            std::cout << "Multiple fields: profile edit_user jsmith position department direct_superior\n\n";
          } else {
            // Collect all remaining fields
            std::vector<std::string> fields;
            std::string field;
            while (iss >> field) {
              fields.push_back(field);
            }
            handle_profile_edit_user_command(username, targetUsername, fields);
          }
        } else if (subcommand == "edit_user") {
          std::cout << "Access denied. Admin privileges required for edit_user.\n\n";
        } else if (subcommand == "changelog") {
          // profile changelog <username> MMDDYYHHMM MMDDYYHHMM
          // profile changelog <username> export MMDDYYHHMM MMDDYYHHMM export_path
          std::string targetUsername, param1, param2, param3;
          iss >> targetUsername >> param1 >> param2 >> param3;
          
          if (targetUsername.empty()) {
            std::cout << "Usage:\n";
            std::cout << "  profile changelog <username> MMDDYYHHMM MMDDYYHHMM\n";
            std::cout << "  profile changelog <username> export MMDDYYHHMM MMDDYYHHMM export_path\n\n";
            std::cout << "Examples:\n";
            std::cout << "  profile changelog jsmith 0826250000 0827252359\n";
            std::cout << "  profile changelog jsmith export 0826250000 0827252359 changes.csv\n\n";
          } else if (param1 == "export") {
            if (param2.empty() || param3.empty()) {
              std::cout << "Usage: profile changelog <username> export MMDDYYHHMM MMDDYYHHMM export_path\n\n";
            } else {
              std::string exportPath;
              iss >> exportPath;
              if (exportPath.empty()) {
                std::cout << "Export path required for export command.\n\n";
              } else {
                handle_profile_changelog_export_command(username, targetUsername, param2, param3, exportPath);
              }
            }
          } else if (param1.empty() || param2.empty()) {
            std::cout << "Usage: profile changelog <username> MMDDYYHHMM MMDDYYHHMM\n\n";
          } else {
            // View changelog: username startdate enddate
            handle_profile_changelog_command(username, targetUsername, param1, param2);
          }
        } else {
          std::cout << "Unknown profile subcommand: " << subcommand << "\n";
          std::cout << "Use 'profile help' to see available commands.\n\n";
        }
      }
      continue;
    }
    
    // Messaging commands (all users)
    if (input == "msg help") {
      std::cout << "\nMessaging commands:\n";
      std::cout << "  msg send <username> <message>\n";
      std::cout << "  msg unread\n";
      std::cout << "  msg inbox [limit]\n";
      std::cout << "  msg sent [limit]\n";
      std::cout << "  msg read <id> - Display full message content\n";
      std::cout << "  msg clear <id> - Mark message as cleared\n";
      std::cout << "  msg clear all - Clear all messages\n\n";
      continue;
    }

    if (input.rfind("msg ", 0) == 0) {
      std::istringstream iss(input.substr(4));
      std::string sub;
      iss >> sub;
      agrs::core::Database db2(agrs::core::Database::defaultDbPath());
      agrs::core::Users users2(db2);
      std::string err;

      if (sub == "send") {
        // Check rate limiting
        auto now = std::chrono::steady_clock::now();
        if (now - lastMessageTime < MESSAGE_RATE_LIMIT) {
          std::cout << "Rate limit exceeded. Please wait at least 1 second between messages.\n\n";
          continue;
        }
        
        std::string to;
        iss >> to;
        std::string message;
        std::getline(iss, message);
        message = trim_copy(message);
        if (!message.empty() && message[0] == ' ') message.erase(0, 1);
        if (to.empty() || message.empty()) {
          std::cout << "Usage: msg send <username> <message>\n\n";
        } else {
          // Validate that the recipient username exists
          if (!users2.userExists(to, err)) {
            std::cout << "Error: Username '" << to << "' does not exist. Please check the username and try again.\n\n";
          } else {
            // Check recipient's unread message limit
            std::vector<agrs::core::Message> unreadMsgs;
            if (users2.getUnreadMessages(to, unreadMsgs, err)) {
              if (unreadMsgs.size() >= 50) {
                std::cout << "Error: Recipient '" << to << "' has reached the maximum of 50 unread messages. Please try again later.\n\n";
                continue;
              }
            }
            
            if (!users2.sendMessage(username, to, message, err)) {
              std::cout << "Failed to send message: " << err << "\n\n";
            } else {
              std::cout << "Message sent.\n\n";
              lastMessageTime = now; // Update rate limit timer
              
              // Check if recipient now has 50 unread messages and notify admins
              if (users2.getUnreadMessages(to, unreadMsgs, err) && unreadMsgs.size() >= 50) {
                users2.notifyAdminsInboxLimit(to, err);
              }
            }
          }
        }
        continue;
      }

      if (sub == "unread") {
        std::vector<agrs::core::Message> msgs;
        if (!users2.getUnreadMessages(username, msgs, err)) {
          std::cout << "Error: " << err << "\n\n";
        } else if (msgs.empty()) {
          std::cout << "No unread messages.\n\n";
        } else {
          std::cout << "\nUnread messages (" << msgs.size() << "):\n";
          buildLocalIdMapping(msgs);
          for (const auto& m : msgs) {
            std::cout << "  [" << globalToLocalIdMap[m.id] << "] from " << m.sender << " at " << m.sent_date << " " << m.sent_time << ": " << truncateMessage(m.body) << "\n";
          }
          std::cout << "\n";
        }
        continue;
      }

      if (sub == "inbox") {
        int limit = 20;
        if (!(iss >> limit)) limit = 20;
        std::vector<agrs::core::Message> msgs;
        if (!users2.getInbox(username, limit, msgs, err)) {
          std::cout << "Error: " << err << "\n\n";
        } else if (msgs.empty()) {
          std::cout << "Inbox empty.\n\n";
        } else {
          std::cout << "\nInbox (latest " << msgs.size() << "):\n";
          buildLocalIdMapping(msgs);
          for (const auto& m : msgs) {
            std::cout << "  [" << globalToLocalIdMap[m.id] << "] from " << m.sender << " at " << m.sent_date << " " << m.sent_time << " (" << m.status << "): " << truncateMessage(m.body) << "\n";
          }
          std::cout << "\n";
        }
        continue;
      }

      if (sub == "sent") {
        int limit = 20;
        if (!(iss >> limit)) limit = 20;
        std::vector<agrs::core::Message> msgs;
        if (!users2.getSent(username, limit, msgs, err)) {
          std::cout << "Error: " << err << "\n\n";
        } else if (msgs.empty()) {
          std::cout << "No sent messages.\n\n";
        } else {
          std::cout << "\nSent (latest " << msgs.size() << "):\n";
          buildLocalIdMapping(msgs);
          for (const auto& m : msgs) {
            std::cout << "  [" << globalToLocalIdMap[m.id] << "] to " << m.recipient << " at " << m.sent_date << " " << m.sent_time << ": " << truncateMessage(m.body) << "\n";
          }
          std::cout << "\n";
        }
        continue;
      }

      if (sub == "read") {
        long long id = 0;
        iss >> id;
        if (id <= 0) { std::cout << "Usage: msg read <id>\n\n"; continue; }
        // Convert local ID to global ID
        int64_t globalId = localToGlobalIdMap[id];
        if (globalId == 0) {
          std::cout << "Invalid message ID. Use 'msg unread', 'msg inbox', or 'msg sent' to see available messages.\n\n";
          continue;
        }
        
        agrs::core::Message message;
        if (!users2.getMessage(globalId, username, message, err)) {
          std::cout << "Failed to retrieve message: " << err << "\n\n";
        } else {
          std::cout << "\n=== Message Details ===\n";
          std::cout << "From: " << message.sender << "\n";
          std::cout << "To: " << message.recipient << "\n";
          std::cout << "Date: " << message.sent_date << " " << message.sent_time << "\n";
          std::cout << "Status: " << message.status << "\n";
          std::cout << "Content:\n";
          std::cout << message.body << "\n\n";
        }
        continue;
      }

      if (sub == "clear") {
        std::string clearTarget;
        iss >> clearTarget;
        if (clearTarget.empty()) {
          std::cout << "Usage: msg clear <id> or msg clear all\n\n";
          continue;
        }
        
        if (clearTarget == "all") {
          // Clear all messages for the user
          if (!users2.clearAllMessages(username, err)) {
            std::cout << "Failed to clear all messages: " << err << "\n\n";
          } else {
            std::cout << "All messages cleared.\n\n";
          }
        } else {
          // Clear specific message by ID
          long long id = std::stoll(clearTarget);
          if (id <= 0) {
            std::cout << "Usage: msg clear <id> or msg clear all\n\n";
            continue;
          }
          
          // Convert local ID to global ID
          int64_t globalId = localToGlobalIdMap[id];
          if (globalId == 0) {
            std::cout << "Invalid message ID. Use 'msg unread', 'msg inbox', or 'msg sent' to see available messages.\n\n";
            continue;
          }
          
          if (!users2.markMessageRead(globalId, username, err)) {
            std::cout << "Failed to clear message: " << err << "\n\n";
          } else {
            std::cout << "Message cleared.\n\n";
          }
        }
        continue;
      }

      std::cout << "Unknown msg subcommand. Use 'msg help'.\n\n";
      continue;
    }

    // Handle other commands here as needed
    std::cout << "Unknown command: " << input << "\n";
    std::cout << "Type 'help' for available commands.\n\n";
  }
}

// Function to check if user has exceeded login attempt limit
bool checkLoginRateLimit(agrs::core::Database& db, const std::string& username, std::string& errorOut) {
  agrs::core::LoginLogger logger(db);
  
  // Get current time in EST for comparison
  auto now = std::chrono::system_clock::now();
  auto time_t = std::chrono::system_clock::to_time_t(now);
  std::tm* tm = std::localtime(&time_t);
  
  // Calculate time 1 hour ago
  auto oneHourAgo = now - std::chrono::hours(1);
  auto time_t_ago = std::chrono::system_clock::to_time_t(oneHourAgo);
  std::tm* tm_ago = std::localtime(&time_t_ago);
  
  // Format as MMDDYYHHMM for the logger
  std::ostringstream startTime, endTime;
  startTime << std::setfill('0') << std::setw(2) << (tm_ago->tm_mon + 1)
            << std::setw(2) << tm_ago->tm_mday
            << std::setw(2) << (tm_ago->tm_year % 100)
            << std::setw(2) << tm_ago->tm_hour
            << std::setw(2) << tm_ago->tm_min;
  endTime << std::setfill('0') << std::setw(2) << (tm->tm_mon + 1)
          << std::setw(2) << tm->tm_mday
          << std::setw(2) << (tm->tm_year % 100)
          << std::setw(2) << tm->tm_hour
          << std::setw(2) << tm->tm_min;
  
  // Count failed login attempts in the last hour
  int failedAttempts = logger.getFailedAttemptsInTimeRange(username, startTime.str(), endTime.str(), errorOut);
  if (failedAttempts < 0) {
    return false; // Error occurred
  }
  
  return failedAttempts < 10; // Allow if less than 10 failed attempts
}

// Database backup functions
void performHourlyBackup() {
  std::string dbPath = agrs::core::Database::defaultDbPath().string();
  std::string backupDir = "/opt/agrs/backups";
  std::string hourlyBackup = backupDir + "/hourly_backup.db";
  
  // Create backup directory if it doesn't exist
  std::filesystem::create_directories(backupDir);
  
  // Copy database file
  std::filesystem::copy_file(dbPath, hourlyBackup, std::filesystem::copy_options::overwrite_existing);
  
  spdlog::info("Hourly backup completed: {}", hourlyBackup);
}

void performDailyBackup() {
  std::string dbPath = agrs::core::Database::defaultDbPath().string();
  std::string backupDir = "/opt/agrs/backups";
  std::string dailyBackup = backupDir + "/daily_backup.db";
  
  // Create backup directory if it doesn't exist
  std::filesystem::create_directories(backupDir);
  
  // Copy database file
  std::filesystem::copy_file(dbPath, dailyBackup, std::filesystem::copy_options::overwrite_existing);
  
  spdlog::info("Daily backup completed: {}", dailyBackup);
}

// Background backup thread
void startBackupThread() {
  std::thread backupThread([]() {
    auto lastHourly = std::chrono::steady_clock::now();
    auto lastDaily = std::chrono::steady_clock::now();
    
    while (true) {
      auto now = std::chrono::steady_clock::now();
      
      // Check hourly backup (every 1 hour)
      if (now - lastHourly >= std::chrono::hours(1)) {
        performHourlyBackup();
        lastHourly = now;
      }
      
      // Check daily backup (every 24 hours)
      if (now - lastDaily >= std::chrono::hours(24)) {
        performDailyBackup();
        lastDaily = now;
      }
      
      // Sleep for 1 minute before checking again
      std::this_thread::sleep_for(std::chrono::minutes(1));
    }
  });
  
  backupThread.detach();
}

int main(int argc, char* argv[]) {
  CLI::App cli{"AGRS ZEUS - Artemis Global Research Solutions Inc."};
  std::optional<std::filesystem::path> cfgPath;
  std::string overrideLogLevel;
  std::optional<std::filesystem::path> overrideLogDir;

  cli.set_version_flag("--version", version_string());
  cli.add_option("-c,--config", cfgPath, "Path to config.json");
  cli.add_option("--log-level", overrideLogLevel, "Log level: trace, debug, info, warn, err, critical");
  cli.add_option("--log-dir", overrideLogDir, "Log directory");

  // Subcommands for terminal app
  auto* cmdDb = cli.add_subcommand("db", "Database operations");
  auto* cmdInit = cmdDb->add_subcommand("init", "Initialize database and apply migrations");
  auto* cmdUser = cli.add_subcommand("user", "User management");
  auto* cmdUserCreate = cmdUser->add_subcommand("create", "Create a new user");
  std::string newUsername, newPassword, newRole;
  cmdUserCreate->add_option("--username", newUsername, "Username")->required();
  cmdUserCreate->add_option("--password", newPassword, "Password")->required();
  cmdUserCreate->add_option("--role", newRole, "Role (admin|user)")->default_val("user");

  auto* cmdAuth = cli.add_subcommand("auth", "Authentication");
  auto* cmdAuthLogin = cmdAuth->add_subcommand("login", "Verify username/password");
  std::string loginUser, loginPassword;
  cmdAuthLogin->add_option("--username", loginUser, "Username")->required();
  cmdAuthLogin->add_option("--password", loginPassword, "Password")->required();

  // Tools namespace registration
  agrs::tools::ToolsOptions toolsOpts;
  std::cerr << "[zeus] before register_tools_commands" << std::endl;
  agrs::tools::register_tools_commands(cli, toolsOpts);
  std::cerr << "[zeus] after register_tools_commands" << std::endl;

  try {
    cli.parse(argc, argv);
  } catch(const CLI::ParseError &e) {
    return cli.exit(e);
  }

  auto config = agrs::core::Config::load(cfgPath);
  if (!overrideLogLevel.empty()) config.logLevel = overrideLogLevel;
  if (overrideLogDir) config.logDir = *overrideLogDir;

  agrs::core::Logger::init("agrs-zeus", config.logLevel, config.logDir);
  spdlog::info("AGRS ZEUS starting (v{})", version_string());
  spdlog::info("Logs at: {}", config.logDir.string());

  // Start background backup thread
  startBackupThread();

  using agrs::core::Database;
  using agrs::core::Migrations;
  using agrs::core::Users;
  using agrs::core::Auth;

  if (cmdInit->parsed()) {
    Database db(Database::defaultDbPath());
    std::string err;
    if (!Migrations::applyAll(db, err)) {
      spdlog::error("DB init failed: {}", err);
      return 1;
    }
    spdlog::info("Database initialized at {}", db.path().string());
    return 0;
  }

  if (cmdUserCreate->parsed()) {
    Database db(Database::defaultDbPath());
    std::string err;
    if (!Migrations::applyAll(db, err)) {
      spdlog::error("DB init failed: {}", err);
      return 1;
    }
    Users users(db);
    if (!users.create(newUsername, newPassword, newRole, err)) {
      spdlog::error("Create user failed: {}", err);
      return 2;
    }
    spdlog::info("User {} created with role {}", newUsername, newRole);
    return 0;
  }

  if (cmdAuthLogin->parsed()) {
    Database db(Database::defaultDbPath());
    std::string err;
    if (!Migrations::applyAll(db, err)) {
      spdlog::error("DB init failed: {}", err);
      return 1;
    }
    Auth auth(db);
    bool ok = auth.verifyPassword(loginUser, loginPassword, err);
    
    // Log the login attempt
    logLoginAttempt(db, loginUser, loginPassword, ok, ok ? "" : err);
    
    if (!ok) {
      spdlog::error("Login failed");
      return 3;
    }
    spdlog::info("Login successful for {}", loginUser);
    return 0;
  }

  // Handle tools commands
  if (auto rc = agrs::tools::handle_tools_commands(toolsOpts)) return *rc;

  // Interactive login when no subcommands provided
  if (!cli.got_subcommand("db") && !cli.got_subcommand("user") && !cli.got_subcommand("auth")) {
    std::cout << "\n=== AGRS ZEUS Login ===\n\n";
    std::cout << "Login credentials required to use AGRS Zeus.\n";
    std::cout << "Please contact zeus@agrsglobal.com for access information.\n\n";
    
    std::string username, password;
    std::cout << "Username: ";
    std::getline(std::cin, username);
    
    std::cout << "Password: ";
    password = get_password_input();
    std::cout << std::endl; // Add newline after password input
    
    if (username.empty() || password.empty()) {
      std::cout << "\nLogin cancelled.\n";
      return 0;
    }
    
    Database db(Database::defaultDbPath());
    std::string err;
    if (!Migrations::applyAll(db, err)) {
      spdlog::error("DB init failed: {}", err);
      return 1;
    }
    
    // Check login rate limiting before authentication
    if (!checkLoginRateLimit(db, username, err)) {
      std::cout << "\nLogin blocked: " << err << "\n";
      std::cout << "Too many failed login attempts. Please try again later.\n";
      return 3;
    }
    
    Auth auth(db);
    bool ok = auth.verifyPassword(username, password, err);
    
    // Log the login attempt
    logLoginAttempt(db, username, password, ok, ok ? "" : err);
    
    if (!ok) {
      std::cout << "\nLogin failed.\n";
      std::cout << "Access denied. Program terminating.\n";
      return 3;
    }
    
    // Get user role for the terminal session
    Users users(db);
    auto user = users.findByUsername(username, err);
    if (!user) {
      std::cout << "\nError retrieving user information.\n";
      return 1;
    }
    
    std::cout << "\nLogin successful for " << username << "!\n";
    std::cout << "Welcome to AGRS ZEUS.\n";
    
    // Check if this is a first login with temporary password
    if (user->temporary_password) {
      std::cout << "\n=== First Login - Password Change Required ===\n";
      std::cout << "You are logging in with a temporary password.\n";
      std::cout << "You must change your password and set up security questions.\n\n";
      
      // Password change process - no need to re-enter current password
      // since we just verified it during login
      
      std::cout << "New password: ";
      std::string newPassword = get_password_input();
      std::cout << std::endl;
      
      std::cout << "Confirm new password: ";
      std::string confirmPassword = get_password_input();
      std::cout << std::endl;
      
      if (newPassword != confirmPassword) {
        std::cout << "Passwords do not match. Please restart the login process.\n";
        return 3;
      }
      
      // Validate new password
      std::string validationError;
      if (!users.validatePassword(newPassword, validationError)) {
        std::cout << "Password validation failed: " << validationError << "\n";
        std::cout << "Password requirements:\n";
        std::cout << "- At least 6 characters long\n";
        std::cout << "- At least one uppercase letter\n";
        std::cout << "- At least one lowercase letter\n";
        std::cout << "- At least one number\n";
        std::cout << "Please restart the login process.\n";
        return 3;
      }
      
      // Change password
      if (!users.changePassword(username, password, newPassword, err)) {
        std::cout << "Failed to change password: " << err << "\n";
        return 3;
      }
      
      std::cout << "Password changed successfully!\n\n";
      
      // Security question setup
      std::cout << "=== Security Question Setup ===\n";
      std::cout << "Create a security question and answer for account recovery.\n\n";
      
      std::cout << "Security question: ";
      std::string securityQuestion;
      std::getline(std::cin, securityQuestion);
      
      if (securityQuestion.empty()) {
        std::cout << "Security question cannot be empty. Please restart the login process.\n";
        return 3;
      }
      
      std::cout << "Security answer: ";
      std::string securityAnswer;
      std::string securityAnswerHidden = get_password_input();
      securityAnswer = securityAnswerHidden;
      
      if (securityAnswer.empty()) {
        std::cout << "Security answer cannot be empty. Please restart the login process.\n";
        return 3;
      }
      
      // Set security question
      if (!users.setSecurityQuestion(username, securityQuestion, securityAnswer, err)) {
        std::cout << "Failed to set security question: " << err << "\n";
        return 3;
      }
      
      std::cout << "\n=== Confirmation ===\n";
      std::cout << "Please review your information:\n";
      std::cout << "New password: [hidden]" << "\n";
      std::cout << "Security question: " << securityQuestion << "\n";
      std::cout << "Security answer: [hidden]" << "\n\n";
      
      std::cout << "Is this information correct? (yes/no): ";
      std::string confirmation;
      std::getline(std::cin, confirmation);
      
      if (to_lower_copy(trim_copy(confirmation)) != "yes") {
        std::cout << "Information not confirmed. Please restart the login process.\n";
        return 3;
      }
      
      // Complete onboarding
      if (!users.completeOnboarding(username, err)) {
        std::cout << "Failed to complete onboarding: " << err << "\n";
        return 3;
      }
      
      std::cout << "\n=== Onboarding Complete ===\n";
      std::cout << "Your account has been successfully set up!\n";
      std::cout << "You can now use AGRS ZEUS with your new password.\n\n";
      
      // Update the user object to reflect the changes
      user = users.findByUsername(username, err);
      if (!user) {
        std::cout << "Error retrieving updated user information.\n";
        return 1;
      }
    }
    
    // Update last login time
    users.updateLastLogin(username, err);
    
    // Enable debug logging for admin users
    if (user->role == "admin") {
      spdlog::set_level(spdlog::level::debug);
      spdlog::debug("Debug logging enabled for admin user: {}", username);
    } else if (user->temporary_password) {
      // Enable debug logging for users with temporary passwords during onboarding
      spdlog::set_level(spdlog::level::debug);
      spdlog::debug("Debug logging enabled for temporary password user: {}", username);
    }
    
    // Launch the persistent terminal session
    run_zeus_terminal(username, user->role);
    return 0;
  }

  spdlog::info("AGRS ZEUS initialized. Use subcommands: db, user, auth.");
  return 0;
}
