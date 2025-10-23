#include "agrs_zeus/Users.h"
#include <sodium.h>
#include <sqlite3.h>
#include <spdlog/spdlog.h>
#include <algorithm>
#include <cctype>
#include <iostream>
#include <ctime>
#include <iomanip>
#include <chrono>
#include <fstream>
#include <filesystem>
#include <sys/stat.h>

namespace agrs::core {

// Helper function to safely get text from SQLite column
std::string safe_get_text(sqlite3_stmt* stmt, int col) {
  const char* text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, col));
  return text ? text : "";
}
// Persistent key path for message encryption (0600 perms)
static std::filesystem::path message_key_path() {
  const char* home = std::getenv("HOME");
  std::filesystem::path base = home && *home ? std::filesystem::path(home) : std::filesystem::current_path();
  return base / ".local/state/agrs-zeus/keys/messages.key";
}

bool Users::loadOrCreateMessageKey(std::vector<unsigned char>& key, std::string& errorOut) {
  if (sodium_init() < 0) {
    errorOut = "libsodium init failed";
    return false;
  }
  key.resize(crypto_secretbox_KEYBYTES);

  auto path = message_key_path();
  std::error_code ec;
  std::filesystem::create_directories(path.parent_path(), ec);

  // Try to read existing key
  {
    std::ifstream in(path, std::ios::binary);
    if (in.good()) {
      in.read(reinterpret_cast<char*>(key.data()), key.size());
      if (in.gcount() == static_cast<std::streamsize>(key.size())) {
        return true;
      }
    }
  }

  // Create new random key
  randombytes_buf(key.data(), key.size());
  {
    std::ofstream out(path, std::ios::binary | std::ios::trunc);
    if (!out.good()) {
      errorOut = "Failed to write message key";
      return false;
    }
    out.write(reinterpret_cast<const char*>(key.data()), key.size());
  }
  // Set 0600 perms
  ::chmod(path.string().c_str(), 0600);
  return true;
}

bool Users::encryptMessage(const std::string& plaintext,
                           std::vector<unsigned char>& nonce,
                           std::vector<unsigned char>& ciphertext,
                           std::string& errorOut) {
  std::vector<unsigned char> key;
  if (!loadOrCreateMessageKey(key, errorOut)) return false;
  nonce.resize(crypto_secretbox_NONCEBYTES);
  randombytes_buf(nonce.data(), nonce.size());
  ciphertext.resize(plaintext.size() + crypto_secretbox_MACBYTES);
  if (crypto_secretbox_easy(ciphertext.data(),
                            reinterpret_cast<const unsigned char*>(plaintext.data()), plaintext.size(),
                            nonce.data(), key.data()) != 0) {
    errorOut = "Encryption failed";
    return false;
  }
  sodium_memzero(key.data(), key.size());
  return true;
}

bool Users::decryptMessage(const unsigned char* nonce,
                           size_t nonceLen,
                           const unsigned char* ciphertext,
                           size_t cipherLen,
                           std::string& plaintextOut,
                           std::string& errorOut) {
  if (nonceLen != crypto_secretbox_NONCEBYTES || cipherLen < crypto_secretbox_MACBYTES) {
    errorOut = "Invalid ciphertext";
    return false;
  }
  std::vector<unsigned char> key;
  if (!loadOrCreateMessageKey(key, errorOut)) return false;
  std::vector<unsigned char> plain(cipherLen - crypto_secretbox_MACBYTES);
  if (crypto_secretbox_open_easy(plain.data(), ciphertext, cipherLen, nonce, key.data()) != 0) {
    errorOut = "Decryption failed";
    return false;
  }
  sodium_memzero(key.data(), key.size());
  plaintextOut.assign(reinterpret_cast<char*>(plain.data()), plain.size());
  return true;
}

bool Users::sendMessage(const std::string& sender,
                        const std::string& recipient,
                        const std::string& plaintextBody,
                        std::string& errorOut) {
  // Encrypt body
  std::vector<unsigned char> nonce;
  std::vector<unsigned char> cipher;
  if (!encryptMessage(plaintextBody, nonce, cipher, errorOut)) return false;

  // Timestamps
  auto [currentDate, currentTime] = getCurrentDateTime();
  auto now_tp = std::chrono::system_clock::now();
  std::time_t tt = std::chrono::system_clock::to_time_t(now_tp);
  std::tm* tm_utc = std::gmtime(&tt);
  std::ostringstream iso;
  iso << std::put_time(tm_utc, "%Y-%m-%dT%H:%M:%SZ");
  std::string iso8601 = iso.str();

  // Insert
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "INSERT INTO messages(sender, recipient, body_ciphertext, nonce, sent_date, sent_time, sent_iso8601, status) VALUES(?, ?, ?, ?, ?, ?, ?, 'unread')";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  sqlite3_bind_text(stmt, 1, sender.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, recipient.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_blob(stmt, 3, cipher.data(), (int)cipher.size(), SQLITE_TRANSIENT);
  sqlite3_bind_blob(stmt, 4, nonce.data(), (int)nonce.size(), SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, currentDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 6, currentTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 7, iso8601.c_str(), -1, SQLITE_STATIC);
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

bool Users::getUnreadMessages(const std::string& recipient,
                              std::vector<Message>& messages,
                              std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"(
    SELECT id, sender, recipient, body_ciphertext, nonce, sent_date, sent_time, sent_iso8601, status
    FROM messages
    WHERE recipient = ? AND status = 'unread'
    ORDER BY sent_iso8601 ASC
  )";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  sqlite3_bind_text(stmt, 1, recipient.c_str(), -1, SQLITE_STATIC);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    Message m{};
    m.id = sqlite3_column_int64(stmt, 0);
    m.sender = safe_get_text(stmt, 1);
    m.recipient = safe_get_text(stmt, 2);
    const void* ciph = sqlite3_column_blob(stmt, 3);
    int ciphLen = sqlite3_column_bytes(stmt, 3);
    const void* nn = sqlite3_column_blob(stmt, 4);
    int nnLen = sqlite3_column_bytes(stmt, 4);
    m.sent_date = safe_get_text(stmt, 5);
    m.sent_time = safe_get_text(stmt, 6);
    m.sent_iso8601 = safe_get_text(stmt, 7);
    m.status = safe_get_text(stmt, 8);

    if (ciph && nn && ciphLen > 0 && nnLen == crypto_secretbox_NONCEBYTES) {
      std::string plaintext;
      if (!decryptMessage(reinterpret_cast<const unsigned char*>(nn), (size_t)nnLen,
                          reinterpret_cast<const unsigned char*>(ciph), (size_t)ciphLen,
                          plaintext, errorOut)) {
        sqlite3_finalize(stmt);
        return false;
      }
      m.body = plaintext;
    }
    messages.push_back(std::move(m));
  }
  sqlite3_finalize(stmt);
  return true;
}

bool Users::getInbox(const std::string& recipient, int limit, std::vector<Message>& messages, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"(
    SELECT id, sender, recipient, body_ciphertext, nonce, sent_date, sent_time, sent_iso8601, status
    FROM messages
    WHERE recipient = ?
    ORDER BY sent_iso8601 DESC
    LIMIT ?
  )";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  sqlite3_bind_text(stmt, 1, recipient.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_int(stmt, 2, limit);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    Message m{};
    m.id = sqlite3_column_int64(stmt, 0);
    m.sender = safe_get_text(stmt, 1);
    m.recipient = safe_get_text(stmt, 2);
    const void* ciph = sqlite3_column_blob(stmt, 3);
    int ciphLen = sqlite3_column_bytes(stmt, 3);
    const void* nn = sqlite3_column_blob(stmt, 4);
    int nnLen = sqlite3_column_bytes(stmt, 4);
    m.sent_date = safe_get_text(stmt, 5);
    m.sent_time = safe_get_text(stmt, 6);
    m.sent_iso8601 = safe_get_text(stmt, 7);
    m.status = safe_get_text(stmt, 8);
    if (ciph && nn && ciphLen > 0 && nnLen == crypto_secretbox_NONCEBYTES) {
      std::string plaintext;
      if (!decryptMessage(reinterpret_cast<const unsigned char*>(nn), (size_t)nnLen,
                          reinterpret_cast<const unsigned char*>(ciph), (size_t)ciphLen,
                          plaintext, errorOut)) {
        sqlite3_finalize(stmt);
        return false;
      }
      m.body = plaintext;
    }
    messages.push_back(std::move(m));
  }
  sqlite3_finalize(stmt);
  return true;
}

bool Users::getSent(const std::string& sender, int limit, std::vector<Message>& messages, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"(
    SELECT id, sender, recipient, body_ciphertext, nonce, sent_date, sent_time, sent_iso8601, status
    FROM messages
    WHERE sender = ?
    ORDER BY sent_iso8601 DESC
    LIMIT ?
  )";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  sqlite3_bind_text(stmt, 1, sender.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_int(stmt, 2, limit);
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    Message m{};
    m.id = sqlite3_column_int64(stmt, 0);
    m.sender = safe_get_text(stmt, 1);
    m.recipient = safe_get_text(stmt, 2);
    const void* ciph = sqlite3_column_blob(stmt, 3);
    int ciphLen = sqlite3_column_bytes(stmt, 3);
    const void* nn = sqlite3_column_blob(stmt, 4);
    int nnLen = sqlite3_column_bytes(stmt, 4);
    m.sent_date = safe_get_text(stmt, 5);
    m.sent_time = safe_get_text(stmt, 6);
    m.sent_iso8601 = safe_get_text(stmt, 7);
    m.status = safe_get_text(stmt, 8);
    if (ciph && nn && ciphLen > 0 && nnLen == crypto_secretbox_NONCEBYTES) {
      std::string plaintext;
      if (!decryptMessage(reinterpret_cast<const unsigned char*>(nn), (size_t)nnLen,
                          reinterpret_cast<const unsigned char*>(ciph), (size_t)ciphLen,
                          plaintext, errorOut)) {
        sqlite3_finalize(stmt);
        return false;
      }
      m.body = plaintext;
    }
    messages.push_back(std::move(m));
  }
  sqlite3_finalize(stmt);
  return true;
}

bool Users::markMessageRead(int64_t messageId, const std::string& recipient, std::string& errorOut) {
  // Update status + read timestamps (UTC ISO + EST display fields)
  auto [currentDate, currentTime] = getCurrentDateTime();
  auto now_tp = std::chrono::system_clock::now();
  std::time_t tt = std::chrono::system_clock::to_time_t(now_tp);
  std::tm* tm_utc = std::gmtime(&tt);
  std::ostringstream iso;
  iso << std::put_time(tm_utc, "%Y-%m-%dT%H:%M:%SZ");
  std::string iso8601 = iso.str();

  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE messages SET status='read', read_date=?, read_time=?, read_iso8601=? WHERE id=? AND recipient=?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  sqlite3_bind_text(stmt, 1, currentDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, currentTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, iso8601.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_int64(stmt, 4, messageId);
  sqlite3_bind_text(stmt, 5, recipient.c_str(), -1, SQLITE_STATIC);
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

bool Users::getMessage(int64_t messageId, const std::string& username, Message& message, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT id, sender, recipient, body_ciphertext, nonce, sent_date, sent_time, sent_iso8601, read_date, read_time, read_iso8601, status FROM messages WHERE id=? AND (sender=? OR recipient=?)";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_int64(stmt, 1, messageId);
  sqlite3_bind_text(stmt, 2, username.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, username.c_str(), -1, SQLITE_STATIC);
  
  if (sqlite3_step(stmt) != SQLITE_ROW) {
    sqlite3_finalize(stmt);
    errorOut = "Message not found or access denied";
    return false;
  }
  
  // Decrypt the message body
  std::vector<unsigned char> key;
  if (!loadOrCreateMessageKey(key, errorOut)) {
    sqlite3_finalize(stmt);
    return false;
  }
  
  const unsigned char* nonce = static_cast<const unsigned char*>(sqlite3_column_blob(stmt, 4));
  size_t nonceLen = sqlite3_column_bytes(stmt, 4);
  const unsigned char* ciphertext = static_cast<const unsigned char*>(sqlite3_column_blob(stmt, 3));
  size_t cipherLen = sqlite3_column_bytes(stmt, 3);
  
  std::string plaintext;
  if (!decryptMessage(nonce, nonceLen, ciphertext, cipherLen, plaintext, errorOut)) {
    sqlite3_finalize(stmt);
    return false;
  }
  
  // Populate the message struct
  message.id = sqlite3_column_int64(stmt, 0);
  message.sender = safe_get_text(stmt, 1);
  message.recipient = safe_get_text(stmt, 2);
  message.body = plaintext;
  message.sent_date = safe_get_text(stmt, 5);
  message.sent_time = safe_get_text(stmt, 6);
  message.sent_iso8601 = safe_get_text(stmt, 7);
  message.read_date = safe_get_text(stmt, 8);
  message.read_time = safe_get_text(stmt, 9);
  message.read_iso8601 = safe_get_text(stmt, 10);
  message.status = safe_get_text(stmt, 11);
  
  sqlite3_finalize(stmt);
  return true;
}

bool Users::clearAllMessages(const std::string& username, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE messages SET status='cleared' WHERE (sender=? OR recipient=?) AND status != 'cleared'";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, username.c_str(), -1, SQLITE_STATIC);
  
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

bool Users::notifyAdminsInboxLimit(const std::string& username, std::string& errorOut) {
  // Get all admin users
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT username FROM users WHERE permissions = 'admin' AND deactivated IS NULL OR deactivated = 0";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  std::vector<std::string> adminUsers;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    adminUsers.push_back(safe_get_text(stmt, 0));
  }
  sqlite3_finalize(stmt);
  
  // Send system notification to all admins
  std::string systemMessage = "SYSTEM ALERT: User '" + username + "' has reached the maximum of 50 unread messages.";
  for (const auto& admin : adminUsers) {
    if (admin != username) { // Don't send to the user themselves
      std::string sendError;
      sendMessage("SYSTEM", admin, systemMessage, sendError);
      // Ignore send errors for system notifications
    }
  }
  
  return true;
}

bool Users::userExists(const std::string& username, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT username FROM users WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_STATIC);
  
  bool exists = (sqlite3_step(stmt) == SQLITE_ROW);
  sqlite3_finalize(stmt);
  
  return exists;
}

bool Users::exportMessagesAdmin(const std::string& usernameOrAll,
                                const std::string& startDateTime,
                                const std::string& endDateTime,
                                const std::string& filePath,
                                std::string& errorOut) {
  // Build query including ISO
  bool filterUser = usernameOrAll != "all";
  std::string sql = R"(SELECT id, sender, recipient, sent_date, sent_time, sent_iso8601, status FROM messages WHERE )";
  if (filterUser) {
    sql += "(sender = ? OR recipient = ?) AND ";
  }
  sql += "(sent_date > ? OR (sent_date = ? AND sent_time >= ?)) AND (sent_date < ? OR (sent_date = ? AND sent_time <= ?)) ORDER BY sent_iso8601 ASC";

  // Parse compact dates
  if (startDateTime.length() != 10 || endDateTime.length() != 10) {
    errorOut = "Invalid date format. Use MMDDYYHHMM";
    return false;
  }
  std::string startDate = startDateTime.substr(4, 2) + "-" + startDateTime.substr(0, 2) + "-20" + startDateTime.substr(2, 2);
  std::string startTime = startDateTime.substr(6, 2) + ":" + startDateTime.substr(8, 2);
  std::string endDate = endDateTime.substr(4, 2) + "-" + endDateTime.substr(0, 2) + "-20" + endDateTime.substr(2, 2);
  std::string endTime = endDateTime.substr(6, 2) + ":" + endDateTime.substr(8, 2);

  sqlite3_stmt* stmt = nullptr;
  if (sqlite3_prepare_v2(db_.handle(), sql.c_str(), -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  int bindIdx = 1;
  if (filterUser) {
    sqlite3_bind_text(stmt, bindIdx++, usernameOrAll.c_str(), -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, bindIdx++, usernameOrAll.c_str(), -1, SQLITE_STATIC);
  }
  sqlite3_bind_text(stmt, bindIdx++, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, bindIdx++, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, bindIdx++, startTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, bindIdx++, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, bindIdx++, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, bindIdx++, endTime.c_str(), -1, SQLITE_STATIC);

  std::vector<std::array<std::string, 7>> rows;
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    std::array<std::string, 7> r;
    r[0] = std::to_string(sqlite3_column_int64(stmt, 0));
    r[1] = safe_get_text(stmt, 1);
    r[2] = safe_get_text(stmt, 2);
    r[3] = safe_get_text(stmt, 3);
    r[4] = safe_get_text(stmt, 4);
    r[5] = safe_get_text(stmt, 5);
    r[6] = safe_get_text(stmt, 6);
    rows.push_back(std::move(r));
  }
  sqlite3_finalize(stmt);

  std::ofstream file(filePath);
  if (!file.is_open()) {
    errorOut = "Failed to open file for writing: " + filePath;
    return false;
  }
  file << "ID,Sender,Recipient,Date,Time,ISO8601_UTC,Status\n";
  for (const auto& r : rows) {
    file << "\"" << r[0] << "\","
         << "\"" << r[1] << "\"," 
         << "\"" << r[2] << "\"," 
         << "\"" << r[3] << "\"," 
         << "\"" << r[4] << "\"," 
         << "\"" << r[5] << "\"," 
         << "\"" << r[6] << "\"\n";
  }
  file.close();
  return true;
}

bool Users::create(const std::string& username,
                   const std::string& password,
                   const std::string& role,
                   std::string& errorOut) {
  if (sodium_init() < 0) {
    errorOut = "libsodium init failed";
    return false;
  }

  unsigned char salt[crypto_pwhash_SALTBYTES];
  randombytes_buf(salt, sizeof salt);

  std::vector<unsigned char> hash(crypto_pwhash_BYTES_MIN);
  hash.resize(crypto_pwhash_BYTES_MIN);

  std::vector<char> hashed(crypto_pwhash_STRBYTES);

  if (crypto_pwhash_str(hashed.data(), password.c_str(), password.size(),
                        crypto_pwhash_OPSLIMIT_INTERACTIVE,
                        crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0) {
    errorOut = "out of memory while hashing";
    return false;
  }

  sqlite3_stmt* stmt = nullptr;
  const char* sql = "INSERT INTO users(username, password_hash, password_salt, role, first_name, last_name, position, department) VALUES(?, ?, ?, ?, ?, ?, ?, ?)";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, hashed.data(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_blob(stmt, 3, salt, (int)sizeof(salt), SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, role.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, username.c_str(), -1, SQLITE_TRANSIENT); // first_name default to username
  sqlite3_bind_text(stmt, 6, username.c_str(), -1, SQLITE_TRANSIENT); // last_name default to username
  sqlite3_bind_text(stmt, 7, "Employee", -1, SQLITE_TRANSIENT); // position default
  sqlite3_bind_text(stmt, 8, "General", -1, SQLITE_TRANSIENT); // department default

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "insert failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  spdlog::info("Created user {} with role {}", username, role);
  return true;
}

std::optional<User> Users::findByUsername(const std::string& username, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT id, username, role, first_name, middle_name, last_name, employee_number, "
                    "work_phone, work_email, personal_email, home_address, position, department, "
                    "direct_superior, years_employment, permissions, roles_admin, employment_status, "
                    "hire_date, last_login_date, account_status, profile_picture_path, work_type, "
                    "skills_certifications, admin_notes, temporary_password, deactivated, deactivation_date, "
                    "deactivation_reason, deactivated_by, created_at, updated_at "
                    "FROM users WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return std::nullopt;
  }
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);

  std::optional<User> user;
  if (sqlite3_step(stmt) == SQLITE_ROW) {
    User u{};
    u.id = sqlite3_column_int64(stmt, 0);
    u.username = safe_get_text(stmt, 1);
    u.role = safe_get_text(stmt, 2);
    u.first_name = safe_get_text(stmt, 3);
    u.middle_name = safe_get_text(stmt, 4);
    u.last_name = safe_get_text(stmt, 5);
    u.employee_number = safe_get_text(stmt, 6);
    u.work_phone = safe_get_text(stmt, 7);
    u.work_email = safe_get_text(stmt, 8);
    u.personal_email = safe_get_text(stmt, 9);
    u.home_address = safe_get_text(stmt, 10);
    u.position = safe_get_text(stmt, 11);
    u.department = safe_get_text(stmt, 12);
    u.direct_superior = safe_get_text(stmt, 13);
    u.years_employment = sqlite3_column_type(stmt, 14) == SQLITE_NULL ? 0 : sqlite3_column_int(stmt, 14);
    u.permissions = safe_get_text(stmt, 15);
    u.roles_admin = safe_get_text(stmt, 16);
    u.employment_status = safe_get_text(stmt, 17);
    u.hire_date = safe_get_text(stmt, 18);
    u.last_login_date = safe_get_text(stmt, 19);
    u.account_status = safe_get_text(stmt, 20);
    u.profile_picture_path = safe_get_text(stmt, 21);
    u.work_type = safe_get_text(stmt, 22);
    u.skills_certifications = safe_get_text(stmt, 23);
    u.admin_notes = safe_get_text(stmt, 24);
    u.temporary_password = sqlite3_column_int(stmt, 25) != 0;
    u.deactivated = sqlite3_column_int(stmt, 26) != 0;
    u.deactivation_date = safe_get_text(stmt, 27);
    u.deactivation_reason = safe_get_text(stmt, 28);
    u.deactivated_by = safe_get_text(stmt, 29);
    u.created_at = safe_get_text(stmt, 30);
    u.updated_at = safe_get_text(stmt, 31);
    user = u;
  }
  sqlite3_finalize(stmt);
  return user;
}

bool Users::updateProfile(const std::string& username, const User& profile, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE users SET first_name=?, middle_name=?, last_name=?, employee_number=?, "
                    "work_phone=?, work_email=?, personal_email=?, home_address=?, position=?, "
                    "department=?, direct_superior=?, years_employment=?, updated_at=datetime('now') "
                    "WHERE username=?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_text(stmt, 1, profile.first_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, profile.middle_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, profile.last_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, profile.employee_number.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, profile.work_phone.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 6, profile.work_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 7, profile.personal_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 8, profile.home_address.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 9, profile.position.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 10, profile.department.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 11, profile.direct_superior.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 12, profile.years_employment);
  sqlite3_bind_text(stmt, 13, username.c_str(), -1, SQLITE_TRANSIENT);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

bool Users::updateLastLogin(const std::string& username, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE users SET last_login_date=datetime('now') WHERE username=?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

std::vector<User> Users::getAllUsers(std::string& errorOut) {
  std::vector<User> users;
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT id, username, role, first_name, middle_name, last_name, employee_number, "
                    "work_phone, work_email, personal_email, home_address, position, department, "
                    "direct_superior, years_employment, permissions, roles_admin, employment_status, "
                    "hire_date, last_login_date, account_status, profile_picture_path, work_type, "
                    "skills_certifications, admin_notes, temporary_password, deactivated, deactivation_date, "
                    "deactivation_reason, deactivated_by, created_at, updated_at FROM users ORDER BY last_name, first_name";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return users;
  }

  while (sqlite3_step(stmt) == SQLITE_ROW) {
    User u{};
    u.id = sqlite3_column_int64(stmt, 0);
    u.username = safe_get_text(stmt, 1);
    u.role = safe_get_text(stmt, 2);
    u.first_name = safe_get_text(stmt, 3);
    u.middle_name = safe_get_text(stmt, 4);
    u.last_name = safe_get_text(stmt, 5);
    u.employee_number = safe_get_text(stmt, 6);
    u.work_phone = safe_get_text(stmt, 7);
    u.work_email = safe_get_text(stmt, 8);
    u.personal_email = safe_get_text(stmt, 9);
    u.home_address = safe_get_text(stmt, 10);
    u.position = safe_get_text(stmt, 11);
    u.department = safe_get_text(stmt, 12);
    u.direct_superior = safe_get_text(stmt, 13);
    u.years_employment = sqlite3_column_type(stmt, 14) == SQLITE_NULL ? 0 : sqlite3_column_int(stmt, 14);
    u.permissions = safe_get_text(stmt, 15);
    u.roles_admin = safe_get_text(stmt, 16);
    u.employment_status = safe_get_text(stmt, 17);
    u.hire_date = safe_get_text(stmt, 18);
    u.last_login_date = safe_get_text(stmt, 19);
    u.account_status = safe_get_text(stmt, 20);
    u.profile_picture_path = safe_get_text(stmt, 21);
    u.work_type = safe_get_text(stmt, 22);
    u.skills_certifications = safe_get_text(stmt, 23);
    u.admin_notes = safe_get_text(stmt, 24);
    u.temporary_password = sqlite3_column_int(stmt, 25) != 0;
    u.deactivated = sqlite3_column_int(stmt, 26) != 0;
    u.deactivation_date = safe_get_text(stmt, 27);
    u.deactivation_reason = safe_get_text(stmt, 28);
    u.deactivated_by = safe_get_text(stmt, 29);
    u.created_at = safe_get_text(stmt, 30);
    u.updated_at = safe_get_text(stmt, 31);
    users.push_back(u);
  }
  sqlite3_finalize(stmt);
  return users;
}

std::vector<User> Users::getUsersByDepartment(const std::string& department, std::string& errorOut) {
  std::vector<User> users;
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT id, username, role, first_name, middle_name, last_name, employee_number, "
                    "work_phone, work_email, personal_email, home_address, position, department, "
                    "direct_superior, years_employment, permissions, roles_admin, employment_status, "
                    "hire_date, last_login_date, account_status, profile_picture_path, work_type, "
                    "skills_certifications, admin_notes, temporary_password, created_at, updated_at FROM users WHERE department=? ORDER BY last_name, first_name";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return users;
  }

  sqlite3_bind_text(stmt, 1, department.c_str(), -1, SQLITE_TRANSIENT);

  while (sqlite3_step(stmt) == SQLITE_ROW) {
    User u{};
    u.id = sqlite3_column_int64(stmt, 0);
    u.username = safe_get_text(stmt, 1);
    u.role = safe_get_text(stmt, 2);
    u.first_name = safe_get_text(stmt, 3);
    u.middle_name = safe_get_text(stmt, 4);
    u.last_name = safe_get_text(stmt, 5);
    u.employee_number = safe_get_text(stmt, 6);
    u.work_phone = safe_get_text(stmt, 7);
    u.work_email = safe_get_text(stmt, 8);
    u.personal_email = safe_get_text(stmt, 9);
    u.home_address = safe_get_text(stmt, 10);
    u.position = safe_get_text(stmt, 11);
    u.department = safe_get_text(stmt, 12);
    u.direct_superior = safe_get_text(stmt, 13);
    u.years_employment = sqlite3_column_type(stmt, 14) == SQLITE_NULL ? 0 : sqlite3_column_int(stmt, 14);
    u.permissions = safe_get_text(stmt, 15);
    u.roles_admin = safe_get_text(stmt, 16);
    u.employment_status = safe_get_text(stmt, 17);
    u.hire_date = safe_get_text(stmt, 18);
    u.last_login_date = safe_get_text(stmt, 19);
    u.account_status = safe_get_text(stmt, 20);
    u.profile_picture_path = safe_get_text(stmt, 21);
    u.work_type = safe_get_text(stmt, 22);
    u.skills_certifications = safe_get_text(stmt, 23);
    u.admin_notes = safe_get_text(stmt, 24);
    u.temporary_password = sqlite3_column_int(stmt, 25) != 0;
    u.deactivated = sqlite3_column_int(stmt, 26) != 0;
    u.deactivation_date = safe_get_text(stmt, 27);
    u.deactivation_reason = safe_get_text(stmt, 28);
    u.deactivated_by = safe_get_text(stmt, 29);
    u.created_at = safe_get_text(stmt, 30);
    u.updated_at = safe_get_text(stmt, 31);
    users.push_back(u);
  }
  sqlite3_finalize(stmt);
  return users;
}

bool Users::addWorkSchedule(const WorkSchedule& schedule, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "INSERT INTO work_schedules(employee_id, task_name, task_description, start_date, start_time, "
                    "end_date, end_time, task_status, priority, assigned_by, notes) "
                    "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_int64(stmt, 1, schedule.employee_id);
  sqlite3_bind_text(stmt, 2, schedule.task_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, schedule.task_description.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, schedule.start_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, schedule.start_time.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 6, schedule.end_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 7, schedule.end_time.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 8, schedule.task_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 9, schedule.priority.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 10, schedule.assigned_by.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 11, schedule.notes.c_str(), -1, SQLITE_TRANSIENT);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "insert failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

std::vector<WorkSchedule> Users::getWorkSchedules(int64_t employee_id, 
                                                 const std::string& start_date, 
                                                 const std::string& end_date, 
                                                 std::string& errorOut) {
  std::vector<WorkSchedule> schedules;
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT id, employee_id, task_name, task_description, start_date, start_time, "
                    "end_date, end_time, task_status, priority, assigned_by, notes, created_at, updated_at "
                    "FROM work_schedules WHERE employee_id=? AND start_date>=? AND end_date<=? "
                    "ORDER BY start_date, start_time";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return schedules;
  }

  sqlite3_bind_int64(stmt, 1, employee_id);
  sqlite3_bind_text(stmt, 2, start_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, end_date.c_str(), -1, SQLITE_TRANSIENT);

  while (sqlite3_step(stmt) == SQLITE_ROW) {
    WorkSchedule s{};
    s.id = sqlite3_column_int64(stmt, 0);
    s.employee_id = sqlite3_column_int64(stmt, 1);
    s.task_name = safe_get_text(stmt, 2);
    s.task_description = safe_get_text(stmt, 3);
    s.start_date = safe_get_text(stmt, 4);
    s.start_time = safe_get_text(stmt, 5);
    s.end_date = safe_get_text(stmt, 6);
    s.end_time = safe_get_text(stmt, 7);
    s.task_status = safe_get_text(stmt, 8);
    s.priority = safe_get_text(stmt, 9);
    s.assigned_by = safe_get_text(stmt, 10);
    s.notes = safe_get_text(stmt, 11);
    s.created_at = safe_get_text(stmt, 12);
    s.updated_at = safe_get_text(stmt, 13);
    schedules.push_back(s);
  }
  sqlite3_finalize(stmt);
  return schedules;
}

bool Users::updateWorkSchedule(int64_t schedule_id, const WorkSchedule& schedule, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE work_schedules SET task_name=?, task_description=?, start_date=?, start_time=?, "
                    "end_date=?, end_time=?, task_status=?, priority=?, assigned_by=?, notes=?, updated_at=datetime('now') "
                    "WHERE id=?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_text(stmt, 1, schedule.task_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, schedule.task_description.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, schedule.start_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, schedule.start_time.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, schedule.end_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 6, schedule.end_time.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 7, schedule.task_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 8, schedule.priority.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 9, schedule.assigned_by.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 10, schedule.notes.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int64(stmt, 11, schedule_id);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

bool Users::deleteWorkSchedule(int64_t schedule_id, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "DELETE FROM work_schedules WHERE id=?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_int64(stmt, 1, schedule_id);

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "delete failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  return true;
}

// Employee creation and onboarding methods
std::string Users::generateUsername(const std::string& firstName, const std::string& middleName, const std::string& lastName, std::string& errorOut) {
  std::string baseUsername;
  
  if (middleName.empty()) {
    // No middle name: first letter + first 7 letters of last name
    baseUsername = std::string(1, std::tolower(firstName[0])) + 
                   lastName.substr(0, std::min(7UL, lastName.length()));
  } else {
    // With middle name: first letter + middle letter + first 6 letters of last name
    baseUsername = std::string(1, std::tolower(firstName[0])) + 
                   std::string(1, std::tolower(middleName[0])) + 
                   lastName.substr(0, std::min(6UL, lastName.length()));
  }
  
  // Convert to lowercase
  std::transform(baseUsername.begin(), baseUsername.end(), baseUsername.begin(), ::tolower);
  
  // Check for duplicates and append numbers
  int counter = 1;
  std::string username = baseUsername;
  
  while (true) {
    sqlite3_stmt* stmt = nullptr;
    const char* sql = "SELECT COUNT(*) FROM users WHERE username = ?";
    if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
      errorOut = sqlite3_errmsg(db_.handle());
      return "";
    }
    
    sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
    
    if (sqlite3_step(stmt) == SQLITE_ROW) {
      int count = sqlite3_column_int(stmt, 0);
      sqlite3_finalize(stmt);
      
      if (count == 0) {
        // Username is available
        break;
      }
    } else {
      sqlite3_finalize(stmt);
      errorOut = "Failed to check username availability";
      return "";
    }
    
    // Username taken, try next number
    username = baseUsername + (counter < 10 ? "0" : "") + std::to_string(counter);
    counter++;
  }
  
  return username;
}

std::string Users::generateRandomPassword() {
  const std::string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  std::string password;
  
  if (sodium_init() < 0) {
    return "";
  }
  
  for (int i = 0; i < 16; ++i) {
    uint32_t random_value;
    randombytes_buf(&random_value, sizeof(random_value));
    password += chars[random_value % chars.length()];
  }
  
  return password;
}

bool Users::validatePassword(const std::string& password, std::string& errorOut) {
  if (password.length() < 6) {
    errorOut = "Password must be at least 6 characters long";
    return false;
  }
  
  bool hasUpper = false, hasLower = false, hasDigit = false;
  
  for (char c : password) {
    if (std::isupper(c)) hasUpper = true;
    else if (std::islower(c)) hasLower = true;
    else if (std::isdigit(c)) hasDigit = true;
  }
  
  if (!hasUpper) {
    errorOut = "Password must contain at least one uppercase letter";
    return false;
  }
  
  if (!hasLower) {
    errorOut = "Password must contain at least one lowercase letter";
    return false;
  }
  
  if (!hasDigit) {
    errorOut = "Password must contain at least one number";
    return false;
  }
  
  return true;
}

bool Users::createEmployee(const User& profile, const std::string& tempPassword, std::string& generatedUsername, std::string& errorOut) {
  if (sodium_init() < 0) {
    errorOut = "libsodium init failed";
    return false;
  }

  // Generate username
  generatedUsername = generateUsername(profile.first_name, profile.middle_name, profile.last_name, errorOut);
  if (generatedUsername.empty()) {
    return false;
  }

  // Hash the temporary password
  std::vector<char> hashed(crypto_pwhash_STRBYTES);
  if (crypto_pwhash_str(hashed.data(), tempPassword.c_str(), tempPassword.size(),
                        crypto_pwhash_OPSLIMIT_INTERACTIVE,
                        crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0) {
    errorOut = "out of memory while hashing";
    return false;
  }

  // Generate salt
  unsigned char salt[crypto_pwhash_SALTBYTES];
  randombytes_buf(salt, sizeof salt);

  // Insert new employee
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "INSERT INTO users(username, password_hash, password_salt, role, first_name, middle_name, last_name, "
                    "employee_number, work_phone, work_email, personal_email, home_address, position, department, "
                    "direct_superior, years_employment, permissions, roles_admin, employment_status, hire_date, "
                    "account_status, work_type, skills_certifications, admin_notes, temporary_password) "
                    "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }

  sqlite3_bind_text(stmt, 1, generatedUsername.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, hashed.data(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_blob(stmt, 3, salt, (int)sizeof(salt), SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, profile.role.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, profile.first_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 6, profile.middle_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 7, profile.last_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 8, profile.employee_number.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 9, profile.work_phone.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 10, profile.work_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 11, profile.personal_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 12, profile.home_address.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 13, profile.position.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 14, profile.department.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 15, profile.direct_superior.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 16, profile.years_employment);
  sqlite3_bind_text(stmt, 17, profile.permissions.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 18, profile.roles_admin.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 19, profile.employment_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 20, profile.hire_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 21, profile.account_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 22, profile.work_type.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 23, profile.skills_certifications.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 24, profile.admin_notes.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 25, 1); // temporary_password = true

  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "insert failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  spdlog::info("Created employee {} with temporary password", generatedUsername);
  return true;
}

bool Users::changePassword(const std::string& username, const std::string& oldPassword, const std::string& newPassword, std::string& errorOut) {
  if (sodium_init() < 0) {
    errorOut = "libsodium init failed";
    return false;
  }

  // Verify old password first
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT password_hash FROM users WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  
  if (sqlite3_step(stmt) != SQLITE_ROW) {
    sqlite3_finalize(stmt);
    errorOut = "User not found";
    return false;
  }
  
  const char* storedHashPtr = reinterpret_cast<const char*>(sqlite3_column_text(stmt, 0));
  std::string storedHash = storedHashPtr ? storedHashPtr : "";
  sqlite3_finalize(stmt);
  
  // Verify old password
  if (crypto_pwhash_str_verify(storedHash.c_str(), oldPassword.c_str(), oldPassword.size()) != 0) {
    errorOut = "Invalid current password";
    return false;
  }
  
  // Hash new password
  std::vector<char> newHashed(crypto_pwhash_STRBYTES);
  if (crypto_pwhash_str(newHashed.data(), newPassword.c_str(), newPassword.size(),
                        crypto_pwhash_OPSLIMIT_INTERACTIVE,
                        crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0) {
    errorOut = "out of memory while hashing";
    return false;
  }
  
  // Update password
  sqlite3_stmt* updateStmt = nullptr;
  const char* updateSql = "UPDATE users SET password_hash = ?, temporary_password = 0, updated_at = datetime('now') WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), updateSql, -1, &updateStmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(updateStmt, 1, newHashed.data(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(updateStmt, 2, username.c_str(), -1, SQLITE_TRANSIENT);
  
  int rc = sqlite3_step(updateStmt);
  sqlite3_finalize(updateStmt);
  if (rc != SQLITE_DONE) {
    errorOut = "update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  return true;
}

bool Users::setSecurityQuestion(const std::string& username, const std::string& question, const std::string& answer, std::string& errorOut) {
  if (sodium_init() < 0) {
    errorOut = "libsodium init failed";
    return false;
  }

  // Get user ID
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "SELECT id FROM users WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  
  if (sqlite3_step(stmt) != SQLITE_ROW) {
    sqlite3_finalize(stmt);
    errorOut = "User not found";
    return false;
  }
  
  int64_t userId = sqlite3_column_int64(stmt, 0);
  sqlite3_finalize(stmt);
  
  // Hash question and answer
  std::vector<char> questionHash(crypto_pwhash_STRBYTES);
  std::vector<char> answerHash(crypto_pwhash_STRBYTES);
  
  if (crypto_pwhash_str(questionHash.data(), question.c_str(), question.size(),
                        crypto_pwhash_OPSLIMIT_INTERACTIVE,
                        crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0 ||
      crypto_pwhash_str(answerHash.data(), answer.c_str(), answer.size(),
                        crypto_pwhash_OPSLIMIT_INTERACTIVE,
                        crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0) {
    errorOut = "out of memory while hashing";
    return false;
  }
  
  // Insert security question
  sqlite3_stmt* insertStmt = nullptr;
  const char* insertSql = "INSERT INTO security_questions(user_id, question_hash, answer_hash) VALUES(?, ?, ?)";
  if (sqlite3_prepare_v2(db_.handle(), insertSql, -1, &insertStmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_int64(insertStmt, 1, userId);
  sqlite3_bind_text(insertStmt, 2, questionHash.data(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 3, answerHash.data(), -1, SQLITE_TRANSIENT);
  
  int rc = sqlite3_step(insertStmt);
  sqlite3_finalize(insertStmt);
  if (rc != SQLITE_DONE) {
    errorOut = "insert failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  return true;
}

bool Users::completeOnboarding(const std::string& username, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE users SET temporary_password = 0, updated_at = datetime('now') WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  return true;
}

bool Users::deactivateUser(const std::string& username, const std::string& reason, const std::string& deactivatedBy, std::string& errorOut) {
  // Get current date/time in EST format
  time_t now = time(0);
  struct tm* tm_info = localtime(&now);
  char dateTimeStr[20];
  strftime(dateTimeStr, sizeof(dateTimeStr), "%m-%d-%Y %H:%M", tm_info);
  
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE users SET deactivated = 1, deactivation_date = ?, deactivation_reason = ?, "
                    "deactivated_by = ?, updated_at = datetime('now') WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, dateTimeStr, -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, reason.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, deactivatedBy.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, username.c_str(), -1, SQLITE_TRANSIENT);
  
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  spdlog::info("Deactivated user: {} by {}", username, deactivatedBy);
  return true;
}

bool Users::deleteUser(const std::string& username, const std::string& reason, const std::string& deletedBy, std::string& errorOut) {
  // First, get the user data to copy to deleted_users table
  auto user = findByUsername(username, errorOut);
  if (!user) {
    errorOut = "User not found: " + username;
    return false;
  }
  
  // Get current date/time in EST format
  time_t now = time(0);
  struct tm* tm_info = localtime(&now);
  char dateTimeStr[20];
  strftime(dateTimeStr, sizeof(dateTimeStr), "%m-%d-%Y %H:%M", tm_info);
  
  // Copy user data to deleted_users table
  sqlite3_stmt* insertStmt = nullptr;
  const char* insertSql = "INSERT INTO deleted_users(original_user_id, username, role, first_name, middle_name, last_name, "
                          "employee_number, work_phone, work_email, personal_email, home_address, position, department, "
                          "direct_superior, years_employment, permissions, roles_admin, employment_status, hire_date, "
                          "last_login_date, account_status, profile_picture_path, work_type, skills_certifications, "
                          "admin_notes, deletion_date, deletion_reason, deleted_by, created_at, updated_at) "
                          "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  
  if (sqlite3_prepare_v2(db_.handle(), insertSql, -1, &insertStmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_int64(insertStmt, 1, user->id);
  sqlite3_bind_text(insertStmt, 2, user->username.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 3, user->role.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 4, user->first_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 5, user->middle_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 6, user->last_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 7, user->employee_number.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 8, user->work_phone.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 9, user->work_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 10, user->personal_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 11, user->home_address.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 12, user->position.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 13, user->department.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 14, user->direct_superior.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(insertStmt, 15, user->years_employment);
  sqlite3_bind_text(insertStmt, 16, user->permissions.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 17, user->roles_admin.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 18, user->employment_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 19, user->hire_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 20, user->last_login_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 21, user->account_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 22, user->profile_picture_path.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 23, user->work_type.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 24, user->skills_certifications.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 25, user->admin_notes.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 26, dateTimeStr, -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 27, reason.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 28, deletedBy.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 29, user->created_at.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(insertStmt, 30, user->updated_at.c_str(), -1, SQLITE_TRANSIENT);
  
  int rc = sqlite3_step(insertStmt);
  sqlite3_finalize(insertStmt);
  if (rc != SQLITE_DONE) {
    errorOut = "Failed to copy user data to deleted_users table: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  // Now delete the user from the main users table
  sqlite3_stmt* deleteStmt = nullptr;
  const char* deleteSql = "DELETE FROM users WHERE username = ?";
  if (sqlite3_prepare_v2(db_.handle(), deleteSql, -1, &deleteStmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(deleteStmt, 1, username.c_str(), -1, SQLITE_TRANSIENT);
  
  rc = sqlite3_step(deleteStmt);
  sqlite3_finalize(deleteStmt);
  if (rc != SQLITE_DONE) {
    errorOut = "Failed to delete user: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  spdlog::info("Deleted user: {} by {}", username, deletedBy);
  return true;
}

bool Users::updateEmployeeProfile(const std::string& username, const User& updatedProfile, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE users SET first_name = ?, middle_name = ?, last_name = ?, employee_number = ?, "
                    "work_phone = ?, work_email = ?, personal_email = ?, home_address = ?, position = ?, "
                    "department = ?, direct_superior = ?, years_employment = ?, permissions = ?, roles_admin = ?, "
                    "employment_status = ?, hire_date = ?, account_status = ?, work_type = ?, "
                    "skills_certifications = ?, admin_notes = ?, updated_at = datetime('now') "
                    "WHERE username = ?";
  
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, updatedProfile.first_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, updatedProfile.middle_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, updatedProfile.last_name.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, updatedProfile.employee_number.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, updatedProfile.work_phone.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 6, updatedProfile.work_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 7, updatedProfile.personal_email.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 8, updatedProfile.home_address.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 9, updatedProfile.position.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 10, updatedProfile.department.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 11, updatedProfile.direct_superior.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_int(stmt, 12, updatedProfile.years_employment);
  sqlite3_bind_text(stmt, 13, updatedProfile.permissions.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 14, updatedProfile.roles_admin.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 15, updatedProfile.employment_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 16, updatedProfile.hire_date.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 17, updatedProfile.account_status.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 18, updatedProfile.work_type.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 19, updatedProfile.skills_certifications.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 20, updatedProfile.admin_notes.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 21, username.c_str(), -1, SQLITE_TRANSIENT);
  
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "Profile update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  spdlog::info("Updated employee profile: {}", username);
  return true;
}

bool Users::updateEmployeeSelfProfile(const std::string& username, const std::string& workPhone, const std::string& workEmail, 
                                      const std::string& personalEmail, const std::string& homeAddress, std::string& errorOut) {
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "UPDATE users SET work_phone = ?, work_email = ?, personal_email = ?, home_address = ?, "
                    "updated_at = datetime('now') WHERE username = ?";
  
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, workPhone.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 2, workEmail.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 3, personalEmail.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 4, homeAddress.c_str(), -1, SQLITE_TRANSIENT);
  sqlite3_bind_text(stmt, 5, username.c_str(), -1, SQLITE_TRANSIENT);
  
  int rc = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  if (rc != SQLITE_DONE) {
    errorOut = "Self profile update failed: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  spdlog::info("Updated self profile: {}", username);
  return true;
}

bool Users::logFieldChange(const std::string& username, const std::string& fieldName, 
                          const std::string& previousValue, const std::string& newValue,
                          const std::string& changedBy, const std::string& changeType, std::string& errorOut) {
  auto [changeDate, changeTime] = getCurrentDateTime();
  
  // Build ISO 8601 string in UTC (Z). Keep UI date/time unchanged (EST display).
  auto now = std::chrono::system_clock::now();
  std::time_t tt = std::chrono::system_clock::to_time_t(now);
  std::tm* tm_utc = std::gmtime(&tt);
  std::ostringstream iso;
  iso << std::put_time(tm_utc, "%Y-%m-%dT%H:%M:%SZ");
  std::string iso8601 = iso.str();
  
  const char* sql = R"(
    INSERT INTO field_changes (username, field_name, previous_value, new_value, change_date, change_time, changed_by, change_type, change_iso8601)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  )";
  
  sqlite3_stmt* stmt;
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = "Failed to prepare field change log statement: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, fieldName.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, previousValue.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 4, newValue.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 5, changeDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 6, changeTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 7, changedBy.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 8, changeType.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 9, iso8601.c_str(), -1, SQLITE_STATIC);
  
  int result = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  
  if (result != SQLITE_DONE) {
    errorOut = "Failed to log field change: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  spdlog::debug("Logged field change: {} for user {} by {}", fieldName, username, changedBy);
  return true;
}

std::pair<std::string, std::string> Users::getCurrentDateTime() {
  auto now = std::chrono::system_clock::now();
  auto time_t = std::chrono::system_clock::to_time_t(now);
  
  // Convert to EST (UTC-5, or UTC-4 during DST)
  // For simplicity, we'll use EST year-round
  std::tm* tm_est = std::localtime(&time_t);
  
  std::ostringstream dateStream, timeStream;
  dateStream << std::put_time(tm_est, "%m-%d-%Y");
  timeStream << std::put_time(tm_est, "%H:%M") << " EST";
  
  return {dateStream.str(), timeStream.str()};
}

bool Users::getFieldChanges(const std::string& username, const std::string& startDateTime, 
                           const std::string& endDateTime, std::vector<std::map<std::string, std::string>>& changes, 
                           std::string& errorOut) {
  changes.clear();
  
  // Parse the compact date format MMDDYYHHMM to MM-DD-YYYY and HH:MM
  auto parseCompactDateTime = [](const std::string& compact) -> std::pair<std::string, std::string> {
    if (compact.length() != 10) return {"", ""};
    
    std::string month = compact.substr(0, 2);
    std::string day = compact.substr(2, 2);
    std::string year = "20" + compact.substr(4, 2); // Convert YY to 20YY
    std::string hour = compact.substr(6, 2);
    std::string minute = compact.substr(8, 2);
    
    std::string date = month + "-" + day + "-" + year;
    std::string time = hour + ":" + minute;
    
    return {date, time};
  };
  
  auto [startDate, startTime] = parseCompactDateTime(startDateTime);
  auto [endDate, endTime] = parseCompactDateTime(endDateTime);
  
  if (startDate.empty() || endDate.empty()) {
    errorOut = "Invalid date format. Use MMDDYYHHMM format.";
    return false;
  }
  
  const char* sql = R"(
    SELECT field_name, previous_value, new_value, change_date, change_time, changed_by, change_type, change_iso8601
    FROM field_changes 
    WHERE username = ? 
    AND ((change_date > ? OR (change_date = ? AND change_time >= ?))
    AND (change_date < ? OR (change_date = ? AND change_time <= ?)))
    ORDER BY change_date, change_time
  )";
  
  sqlite3_stmt* stmt;
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = "Failed to prepare field changes query: ";
    errorOut += sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 4, startTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 5, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 6, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 7, endTime.c_str(), -1, SQLITE_STATIC);
  
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    std::map<std::string, std::string> change;
    change["field_name"] = safe_get_text(stmt, 0);
    change["previous_value"] = safe_get_text(stmt, 1);
    change["new_value"] = safe_get_text(stmt, 2);
    change["change_date"] = safe_get_text(stmt, 3);
    change["change_time"] = safe_get_text(stmt, 4);
    change["changed_by"] = safe_get_text(stmt, 5);
    change["change_type"] = safe_get_text(stmt, 6);
    change["change_iso8601"] = safe_get_text(stmt, 7);
    changes.push_back(change);
  }
  
  sqlite3_finalize(stmt);
  return true;
}

bool Users::exportFieldChanges(const std::string& username, const std::string& startDateTime, 
                              const std::string& endDateTime, const std::string& filePath, std::string& errorOut) {
  std::vector<std::map<std::string, std::string>> changes;
  if (!getFieldChanges(username, startDateTime, endDateTime, changes, errorOut)) {
    return false;
  }
  
  std::ofstream file(filePath);
  if (!file.is_open()) {
    errorOut = "Failed to open file for writing: " + filePath;
    return false;
  }
  
  // Write CSV header
  file << "Field Name,Previous Value,New Value,Change Date,Change Time,Changed By,Change Type,ISO8601_UTC\n";
  
  // Write data rows
  for (const auto& change : changes) {
    auto itIso = change.find("change_iso8601");
    std::string iso = (itIso != change.end() ? itIso->second : "");
    file << "\"" << change.at("field_name") << "\"," 
         << "\"" << change.at("previous_value") << "\"," 
         << "\"" << change.at("new_value") << "\"," 
         << "\"" << change.at("change_date") << "\"," 
         << "\"" << change.at("change_time") << "\"," 
         << "\"" << change.at("changed_by") << "\"," 
         << "\"" << change.at("change_type") << "\"," 
         << "\"" << iso << "\"\n";
  }
  
  file.close();
  spdlog::info("Exported {} field changes for {} to {}", changes.size(), username, filePath);
  return true;
}

bool Users::logTerminalInput(const std::string& username, const std::string& command, std::string& errorOut) {
  // Filter out sensitive commands - don't log passwords or security questions
  std::string lowerCommand = command;
  std::transform(lowerCommand.begin(), lowerCommand.end(), lowerCommand.begin(), ::tolower);
  
  // Skip logging if command contains sensitive operations
  if (lowerCommand.find("password") != std::string::npos ||
      lowerCommand.find("security") != std::string::npos ||
      lowerCommand.find("question") != std::string::npos ||
      lowerCommand.find("answer") != std::string::npos) {
    // Don't log sensitive commands, but don't return error
    return true;
  }
  
  auto [currentDate, currentTime] = getCurrentDateTime();
  auto now_tp = std::chrono::system_clock::now();
  std::time_t tt = std::chrono::system_clock::to_time_t(now_tp);
  std::tm* tm_utc = std::gmtime(&tt);
  std::ostringstream iso;
  iso << std::put_time(tm_utc, "%Y-%m-%dT%H:%M:%SZ");
  std::string iso8601 = iso.str();
  
  // Get current Unix timestamp
  auto timestamp = std::chrono::duration_cast<std::chrono::seconds>(now_tp.time_since_epoch()).count();
  
  sqlite3_stmt* stmt = nullptr;
  const char* sql = "INSERT INTO terminal_inputs(username, command_input, input_date, input_time, unix_timestamp, input_iso8601) VALUES(?, ?, ?, ?, ?, ?)";
  
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, command.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, currentDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 4, currentTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_int64(stmt, 5, timestamp);
  sqlite3_bind_text(stmt, 6, iso8601.c_str(), -1, SQLITE_STATIC);
  
  int result = sqlite3_step(stmt);
  sqlite3_finalize(stmt);
  
  if (result != SQLITE_DONE) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  return true;
}

bool Users::getTerminalInputs(const std::string& startDateTime, const std::string& endDateTime, 
                             std::vector<std::map<std::string, std::string>>& inputs, std::string& errorOut) {
  // Parse the compact date format MMDDYYHHMM
  if (startDateTime.length() != 10 || endDateTime.length() != 10) {
    errorOut = "Invalid date format. Use MMDDYYHHMM";
    return false;
  }
  
  // Extract date and time components
  std::string startDate = startDateTime.substr(4, 2) + "-" + startDateTime.substr(0, 2) + "-20" + startDateTime.substr(2, 2);
  std::string startTime = startDateTime.substr(6, 2) + ":" + startDateTime.substr(8, 2);
  
  std::string endDate = endDateTime.substr(4, 2) + "-" + endDateTime.substr(0, 2) + "-20" + endDateTime.substr(2, 2);
  std::string endTime = endDateTime.substr(6, 2) + ":" + endDateTime.substr(8, 2);
  
  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"(
    SELECT username, command_input, input_date, input_time, input_iso8601 
    FROM terminal_inputs 
    WHERE (input_date > ? OR (input_date = ? AND input_time >= ?))
      AND (input_date < ? OR (input_date = ? AND input_time <= ?))
    ORDER BY input_date, input_time
  )";
  
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, startTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 4, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 5, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 6, endTime.c_str(), -1, SQLITE_STATIC);
  
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    std::map<std::string, std::string> input;
    input["username"] = safe_get_text(stmt, 0);
    input["command_input"] = safe_get_text(stmt, 1);
    input["input_date"] = safe_get_text(stmt, 2);
    input["input_time"] = safe_get_text(stmt, 3);
    input["input_iso8601"] = safe_get_text(stmt, 4);
    inputs.push_back(input);
  }
  
  sqlite3_finalize(stmt);
  return true;
}

bool Users::getTerminalInputsByUser(const std::string& username, const std::string& startDateTime, 
                                   const std::string& endDateTime, std::vector<std::map<std::string, std::string>>& inputs, 
                                   std::string& errorOut) {
  // Parse the compact date format MMDDYYHHMM
  if (startDateTime.length() != 10 || endDateTime.length() != 10) {
    errorOut = "Invalid date format. Use MMDDYYHHMM";
    return false;
  }
  
  // Extract date and time components
  std::string startDate = startDateTime.substr(4, 2) + "-" + startDateTime.substr(0, 2) + "-20" + startDateTime.substr(2, 2);
  std::string startTime = startDateTime.substr(6, 2) + ":" + startDateTime.substr(8, 2);
  
  std::string endDate = endDateTime.substr(4, 2) + "-" + endDateTime.substr(0, 2) + "-20" + endDateTime.substr(2, 2);
  std::string endTime = endDateTime.substr(6, 2) + ":" + endDateTime.substr(8, 2);
  
  sqlite3_stmt* stmt = nullptr;
  const char* sql = R"(
    SELECT username, command_input, input_date, input_time, input_iso8601 
    FROM terminal_inputs 
    WHERE username = ?
      AND (input_date > ? OR (input_date = ? AND input_time >= ?))
      AND (input_date < ? OR (input_date = ? AND input_time <= ?))
    ORDER BY input_date, input_time
  )";
  
  if (sqlite3_prepare_v2(db_.handle(), sql, -1, &stmt, nullptr) != SQLITE_OK) {
    errorOut = sqlite3_errmsg(db_.handle());
    return false;
  }
  
  sqlite3_bind_text(stmt, 1, username.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 2, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 3, startDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 4, startTime.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 5, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 6, endDate.c_str(), -1, SQLITE_STATIC);
  sqlite3_bind_text(stmt, 7, endTime.c_str(), -1, SQLITE_STATIC);
  
  while (sqlite3_step(stmt) == SQLITE_ROW) {
    std::map<std::string, std::string> input;
    input["username"] = safe_get_text(stmt, 0);
    input["command_input"] = safe_get_text(stmt, 1);
    input["input_date"] = safe_get_text(stmt, 2);
    input["input_time"] = safe_get_text(stmt, 3);
    input["input_iso8601"] = safe_get_text(stmt, 4);
    inputs.push_back(input);
  }
  
  sqlite3_finalize(stmt);
  return true;
}

bool Users::exportTerminalInputs(const std::string& startDateTime, const std::string& endDateTime, 
                                const std::string& filePath, std::string& errorOut) {
  std::vector<std::map<std::string, std::string>> inputs;
  if (!getTerminalInputs(startDateTime, endDateTime, inputs, errorOut)) {
    return false;
  }
  
  std::ofstream file(filePath);
  if (!file.is_open()) {
    errorOut = "Failed to open file for writing: " + filePath;
    return false;
  }
  
  // Write CSV header
  file << "Username,Command Input,Date,Time,ISO8601_UTC\n";
  
  // Write data rows
  for (const auto& input : inputs) {
    // ISO may not exist for older rows; be tolerant
    auto itIso = input.find("input_iso8601");
    std::string iso = (itIso != input.end() ? itIso->second : "");
    file << "\"" << input.at("username") << "\"," 
         << "\"" << input.at("command_input") << "\"," 
         << "\"" << input.at("input_date") << "\"," 
         << "\"" << input.at("input_time") << "\"," 
         << "\"" << iso << "\"\n";
  }
  
  file.close();
  spdlog::info("Exported {} terminal inputs to {}", inputs.size(), filePath);
  return true;
}

bool Users::exportTerminalInputsByUser(const std::string& username, const std::string& startDateTime, 
                                      const std::string& endDateTime, const std::string& filePath, std::string& errorOut) {
  std::vector<std::map<std::string, std::string>> inputs;
  if (!getTerminalInputsByUser(username, startDateTime, endDateTime, inputs, errorOut)) {
    return false;
  }
  
  std::ofstream file(filePath);
  if (!file.is_open()) {
    errorOut = "Failed to open file for writing: " + filePath;
    return false;
  }
  
  // Write CSV header
  file << "Username,Command Input,Date,Time,ISO8601_UTC\n";
  
  // Write data rows
  for (const auto& input : inputs) {
    auto itIso = input.find("input_iso8601");
    std::string iso = (itIso != input.end() ? itIso->second : "");
    file << "\"" << input.at("username") << "\"," 
         << "\"" << input.at("command_input") << "\"," 
         << "\"" << input.at("input_date") << "\"," 
         << "\"" << input.at("input_time") << "\"," 
         << "\"" << iso << "\"\n";
  }
  
  file.close();
  spdlog::info("Exported {} terminal inputs for {} to {}", inputs.size(), username, filePath);
  return true;
}

} // namespace agrs::core
