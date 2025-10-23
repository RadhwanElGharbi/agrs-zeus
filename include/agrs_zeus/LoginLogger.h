#pragma once
#include <string>
#include <optional>
#include "agrs_zeus/Database.h"

namespace agrs::core {

struct LoginAttempt {
  std::string username;
  int password_length;
  std::string attempt_date;
  std::string attempt_time;
  std::string timezone;
  int64_t unix_timestamp;
  bool successful;
  std::string failure_reason;
  std::string ip_address;
  std::string user_agent;
  std::string login_method;
  std::string country_code;
  std::string city;
  std::string isp;
  bool account_locked;
  std::string lockout_reason;
  std::string device_hash;
  std::string screen_resolution;
  std::string timezone_offset;
  int session_duration;
  int login_count_today;
};

class LoginLogger {
public:
  explicit LoginLogger(Database& db) : db_(db) {}

  bool logAttempt(const LoginAttempt& attempt, std::string& errorOut);
  int getLoginCountToday(const std::string& username, std::string& errorOut);
  int getFailedAttemptsInTimeRange(const std::string& username, const std::string& startTime, const std::string& endTime, std::string& errorOut);
  std::string getCurrentTimezone();
  std::string getCurrentDate();
  std::string getCurrentTime();
  int64_t getCurrentUnixTimestamp();

private:
  Database& db_;
};

} // namespace agrs::core
