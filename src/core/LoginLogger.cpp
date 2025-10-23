#include "agrs_zeus/LoginLogger.h"
#include <sqlite3.h>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <cstdlib>

namespace agrs::core {

bool LoginLogger::logAttempt(const LoginAttempt& attempt, std::string& errorOut) {
  const char* sql = R"SQL(
    INSERT INTO login_attempts (
      username, password_length, attempt_date, attempt_time, timezone, unix_timestamp,
      successful, failure_reason, ip_address, user_agent, login_method,
      country_code, city, isp, account_locked, lockout_reason,
      device_hash, screen_resolution, timezone_offset, session_duration, login_count_today, attempt_iso8601
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  )SQL";

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_text(stmt, 1, attempt.username.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 2, attempt.password_length);
  sqlite3_bind_text(stmt, 3, attempt.attempt_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, attempt.attempt_time.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, attempt.timezone.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int64(stmt, 6, attempt.unix_timestamp);
  sqlite3_bind_int(stmt, 7, attempt.successful ? 1 : 0);
  sqlite3_bind_text(stmt, 8, attempt.failure_reason.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 9, attempt.ip_address.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 10, attempt.user_agent.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 11, attempt.login_method.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 12, attempt.country_code.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 13, attempt.city.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 14, attempt.isp.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 15, attempt.account_locked ? 1 : 0);
  sqlite3_bind_text(stmt, 16, attempt.lockout_reason.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 17, attempt.device_hash.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 18, attempt.screen_resolution.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 19, attempt.timezone_offset.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 20, attempt.session_duration);
  sqlite3_bind_int(stmt, 21, attempt.login_count_today);
  // Build ISO 8601 string in UTC (Z)
  auto now = std::time(nullptr);
  auto tm = *std::gmtime(&now);
  std::ostringstream iso;
  iso << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");
  auto iso_str = iso.str();
  sqlite3_bind_text(stmt, 22, iso_str.c_str(), -1, SQLITE_TRANSIENT);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  
  if (rc != SQLITE_DONE) {
    errorOut = "Failed to log login attempt: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  return true;
}

int LoginLogger::getLoginCountToday(const std::string& username, std::string& errorOut) {
  const char* sql = R"SQL(
    SELECT COUNT(*) FROM login_attempts 
    WHERE username = ? AND attempt_date = ?
  )SQL";

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return 0;
  }

  std::string today = getCurrentDate();
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, today.c_str(), -1, SQLITE_TRANSIENT);

  int count = 0;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    count = sqlite3_column_int(stmt, 0);
  }
  
  sqlite3_finalize(stmt);
  return count;
}

int LoginLogger::getFailedAttemptsInTimeRange(const std::string& username, const std::string& startTime, const std::string& endTime, std::string& errorOut) {
  // Convert MMDDYYHHMM format to date/time for comparison
  if (startTime.length() != 10 || endTime.length() != 10) {
    errorOut = "Invalid time format. Expected MMDDYYHHMM";
    return -1;
  }
  
  std::string startDate = startTime.substr(4, 2) + "-" + startTime.substr(0, 2) + "-20" + startTime.substr(2, 2);
  std::string startTimeStr = startTime.substr(6, 2) + ":" + startTime.substr(8, 2);
  std::string endDate = endTime.substr(4, 2) + "-" + endTime.substr(0, 2) + "-20" + endTime.substr(2, 2);
  std::string endTimeStr = endTime.substr(6, 2) + ":" + endTime.substr(8, 2);
  
  const char* sql = R"SQL(
    SELECT COUNT(*) FROM login_attempts 
    WHERE username = ? AND successful = 0 
    AND ((attempt_date > ?) OR (attempt_date = ? AND attempt_time >= ?))
    AND ((attempt_date < ?) OR (attempt_date = ? AND attempt_time <= ?))
  )SQL";

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return -1;
  }

  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, startDate.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, startDate.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, startTimeStr.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, endDate.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 6, endDate.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 7, endTimeStr.c_str(), -1, SQLITE_TRANSIENT);

  int count = 0;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    count = sqlite3_column_int(stmt, 0);
  }
  
  sqlite3_finalize(stmt);
  return count;
}

std::string LoginLogger::getCurrentTimezone() {
  return "EST"; // Default to EST, could be enhanced with timezone detection
}

std::string LoginLogger::getCurrentDate() {
  auto now = std::time(nullptr);
  auto tm = *std::localtime(&now);
  
  std::ostringstream oss;
  oss << std::put_time(&tm, "%m-%d-%Y");
  return oss.str();
}

std::string LoginLogger::getCurrentTime() {
  auto now = std::time(nullptr);
  auto tm = *std::localtime(&now);
  
  std::ostringstream oss;
  oss << std::put_time(&tm, "%H:%M:%S");
  return oss.str();
}

int64_t LoginLogger::getCurrentUnixTimestamp() {
  return std::time(nullptr);
}

} // namespace agrs::core
