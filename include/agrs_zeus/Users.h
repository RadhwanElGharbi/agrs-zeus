#pragma once
#include <optional>
#include <string>
#include <vector>
#include <map>
#include <filesystem>
#include "agrs_zeus/Database.h"

namespace agrs::core {

struct User {
  int64_t id;
  std::string username;
  std::string role;
  
  // Basic Information
  std::string first_name;
  std::string middle_name;
  std::string last_name;
  std::string employee_number;
  
  // Contact Information
  std::string work_phone;
  std::string work_email;
  std::string personal_email;
  std::string home_address;
  
  // Employment Information
  std::string position;
  std::string department;
  std::string direct_superior;
  int years_employment;
  
  // Admin Only Fields
  std::string permissions;
  std::string roles_admin;
  std::string employment_status;
  std::string hire_date;
  std::string last_login_date;
  std::string account_status;
  std::string profile_picture_path;
  std::string work_type;
  std::string skills_certifications;
  std::string admin_notes;
  
  // System Fields
  bool temporary_password;
  bool deactivated;
  std::string deactivation_date;
  std::string deactivation_reason;
  std::string deactivated_by;
  std::string created_at;
  std::string updated_at;
};

struct WorkSchedule {
  int64_t id;
  int64_t employee_id;
  std::string task_name;
  std::string task_description;
  std::string start_date;
  std::string start_time;
  std::string end_date;
  std::string end_time;
  std::string task_status;
  std::string priority;
  std::string assigned_by;
  std::string notes;
  std::string created_at;
  std::string updated_at;
};

struct SecurityQuestion {
  int64_t id;
  int64_t user_id;
  std::string question_hash;
  std::string answer_hash;
  std::string created_at;
  std::string updated_at;
};

struct Message {
  int64_t id;
  std::string sender;
  std::string recipient;
  std::string body; // plaintext in memory only
  std::string sent_date;
  std::string sent_time;
  std::string sent_iso8601;
  std::string read_date;
  std::string read_time;
  std::string read_iso8601;
  std::string status; // unread|read
};

class Users {
public:
  explicit Users(Database& db) : db_(db) {}

  bool create(const std::string& username,
              const std::string& password,
              const std::string& role,
              std::string& errorOut);

  std::optional<User> findByUsername(const std::string& username, std::string& errorOut);
  
  // Profile management methods
  bool updateProfile(const std::string& username, const User& profile, std::string& errorOut);
  bool updateLastLogin(const std::string& username, std::string& errorOut);
  std::vector<User> getAllUsers(std::string& errorOut);
  std::vector<User> getUsersByDepartment(const std::string& department, std::string& errorOut);
  
  // Work schedule methods
  bool addWorkSchedule(const WorkSchedule& schedule, std::string& errorOut);
  std::vector<WorkSchedule> getWorkSchedules(int64_t employee_id, 
                                            const std::string& start_date, 
                                            const std::string& end_date, 
                                            std::string& errorOut);
  bool updateWorkSchedule(int64_t schedule_id, const WorkSchedule& schedule, std::string& errorOut);
  bool deleteWorkSchedule(int64_t schedule_id, std::string& errorOut);
  
  // Employee creation and onboarding methods
  bool createEmployee(const User& profile, const std::string& tempPassword, std::string& generatedUsername, std::string& errorOut);
  std::string generateUsername(const std::string& firstName, const std::string& middleName, const std::string& lastName, std::string& errorOut);
  std::string generateRandomPassword();
  bool validatePassword(const std::string& password, std::string& errorOut);
  bool changePassword(const std::string& username, const std::string& oldPassword, const std::string& newPassword, std::string& errorOut);
  bool setSecurityQuestion(const std::string& username, const std::string& question, const std::string& answer, std::string& errorOut);
  bool completeOnboarding(const std::string& username, std::string& errorOut);
  
  // User management methods
  bool deactivateUser(const std::string& username, const std::string& reason, const std::string& deactivatedBy, std::string& errorOut);
  bool deleteUser(const std::string& username, const std::string& reason, const std::string& deletedBy, std::string& errorOut);
  
  // Profile management methods
  bool updateEmployeeProfile(const std::string& username, const User& updatedProfile, std::string& errorOut);
  bool updateEmployeeSelfProfile(const std::string& username, const std::string& workPhone, const std::string& workEmail, 
                                 const std::string& personalEmail, const std::string& homeAddress, std::string& errorOut);
  
  // Field change logging
  bool logFieldChange(const std::string& username, const std::string& fieldName, 
                      const std::string& previousValue, const std::string& newValue,
                      const std::string& changedBy, const std::string& changeType, std::string& errorOut);
  
  // Field change log viewing/exporting
  bool getFieldChanges(const std::string& username, const std::string& startDateTime, 
                      const std::string& endDateTime, std::vector<std::map<std::string, std::string>>& changes, 
                      std::string& errorOut);
  bool exportFieldChanges(const std::string& username, const std::string& startDateTime, 
                         const std::string& endDateTime, const std::string& filePath, std::string& errorOut);
  
  // Terminal input logging
  bool logTerminalInput(const std::string& username, const std::string& command, std::string& errorOut);
  bool getTerminalInputs(const std::string& startDateTime, const std::string& endDateTime, 
                        std::vector<std::map<std::string, std::string>>& inputs, std::string& errorOut);
  bool getTerminalInputsByUser(const std::string& username, const std::string& startDateTime, 
                              const std::string& endDateTime, std::vector<std::map<std::string, std::string>>& inputs, 
                              std::string& errorOut);
  
  // Terminal input export
  bool exportTerminalInputs(const std::string& startDateTime, const std::string& endDateTime, 
                           const std::string& filePath, std::string& errorOut);
  bool exportTerminalInputsByUser(const std::string& username, const std::string& startDateTime, 
                                 const std::string& endDateTime, const std::string& filePath, std::string& errorOut);

  // Messaging (encrypted at rest)
  bool sendMessage(const std::string& sender,
                   const std::string& recipient,
                   const std::string& plaintextBody,
                   std::string& errorOut);

  bool getUnreadMessages(const std::string& recipient,
                         std::vector<Message>& messages,
                         std::string& errorOut);

  bool getInbox(const std::string& recipient,
                int limit,
                std::vector<Message>& messages,
                std::string& errorOut);

  bool getSent(const std::string& sender,
               int limit,
               std::vector<Message>& messages,
               std::string& errorOut);

  bool markMessageRead(int64_t messageId,
                       const std::string& recipient,
                       std::string& errorOut);

  bool getMessage(int64_t messageId,
                  const std::string& username,
                  Message& message,
                  std::string& errorOut);

  bool clearAllMessages(const std::string& username,
                        std::string& errorOut);

  bool notifyAdminsInboxLimit(const std::string& username,
                              std::string& errorOut);

  bool userExists(const std::string& username,
                  std::string& errorOut);

  bool exportMessagesAdmin(const std::string& usernameOrAll,
                           const std::string& startDateTime,
                           const std::string& endDateTime,
                           const std::string& filePath,
                           std::string& errorOut);

private:
  Database& db_;
  
  // Helper method for getting current timestamp in EST
  std::pair<std::string, std::string> getCurrentDateTime();

  // Encryption helpers (libsodium secretbox)
  bool loadOrCreateMessageKey(std::vector<unsigned char>& key, std::string& errorOut);
  bool encryptMessage(const std::string& plaintext,
                      std::vector<unsigned char>& nonce,
                      std::vector<unsigned char>& ciphertext,
                      std::string& errorOut);
  bool decryptMessage(const unsigned char* nonce,
                      size_t nonceLen,
                      const unsigned char* ciphertext,
                      size_t cipherLen,
                      std::string& plaintextOut,
                      std::string& errorOut);
};

} // namespace agrs::core
