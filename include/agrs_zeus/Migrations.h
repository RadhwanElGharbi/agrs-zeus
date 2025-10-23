#pragma once
#include <string>
#include "agrs_zeus/Database.h"

namespace agrs::core {

class Migrations {
public:
  static bool applyAll(Database& db, std::string& errorOut);
};

} // namespace agrs::core
