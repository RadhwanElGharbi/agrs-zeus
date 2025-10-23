#include "agrs_zeus/Auth.h"
#include <sodium.h>
#include <sqlite3.h>

namespace agrs::core {

bool Auth::verifyPassword(const std::string& username, const std::string& password, std::string& errorOut) {
  if (sodium_init() < 0) {
    errorOut = "libsodium init failed";
    return false;
  }
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT password_hash FROM users WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  bool ok = false;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    const char* stored = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
    if (stored) {
      ok = crypto_pwhash_str_verify(stored, password.c_str(), password.size()) == 0;
    }
  } else {
    errorOut = "user not found";
  }
  sqlite3_finalize(stmt);
  return ok;
}

} // namespace agrs::core
