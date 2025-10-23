#pragma once
#include <optional>
#include <string>
#include "agrs_zeus/Database.h"

namespace agrs::core {

class Auth {
public:
  explicit Auth(Database& db) : db_(db) {}

  bool verifyPassword(const std::string& username, const std::string& password, std::string& errorOut);

private:
  Database& db_;
};

} // namespace agrs::core
