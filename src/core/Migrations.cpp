#include "agrs_zeus/Migrations.h"
#include <spdlog/spdlog.h>

namespace agrs::core {

static const char* SCHEMA_SQL = R"SQL(
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt BLOB NOT NULL,
  role TEXT NOT NULL,
  
  -- Basic Information
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  employee_number TEXT UNIQUE,
  
  -- Contact Information
  work_phone TEXT,
  work_email TEXT UNIQUE,
  personal_email TEXT,
  home_address TEXT,
  
  -- Employment Information
  position TEXT NOT NULL,
  department TEXT NOT NULL,
  direct_superior TEXT,
  years_employment INTEGER,
  
  -- Admin Only Fields
  permissions TEXT,
  roles_admin TEXT,
  employment_status TEXT DEFAULT 'active',
  hire_date TEXT,
  last_login_date TEXT,
  account_status TEXT DEFAULT 'active',
  profile_picture_path TEXT,
  work_type TEXT DEFAULT 'full-time',
  skills_certifications TEXT,
  admin_notes TEXT,
  
  -- System Fields
  temporary_password BOOLEAN DEFAULT FALSE,
  deactivated BOOLEAN DEFAULT FALSE,
  deactivation_date TEXT,
  deactivation_reason TEXT,
  deactivated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  task_description TEXT,
  start_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_date TEXT NOT NULL,
  end_time TEXT NOT NULL,
  task_status TEXT DEFAULT 'assigned',
  priority TEXT DEFAULT 'medium',
  assigned_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS security_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  question_hash TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deleted_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  first_name TEXT,
  middle_name TEXT,
  last_name TEXT,
  employee_number TEXT,
  work_phone TEXT,
  work_email TEXT,
  personal_email TEXT,
  home_address TEXT,
  position TEXT,
  department TEXT,
  direct_superior TEXT,
  years_employment INTEGER,
  permissions TEXT,
  roles_admin TEXT,
  employment_status TEXT,
  hire_date TEXT,
  last_login_date TEXT,
  account_status TEXT,
  profile_picture_path TEXT,
  work_type TEXT,
  skills_certifications TEXT,
  admin_notes TEXT,
  deletion_date TEXT NOT NULL,
  deletion_reason TEXT,
  deleted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  role TEXT PRIMARY KEY,
  description TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  password_length INTEGER,
  attempt_date TEXT NOT NULL,
  attempt_time TEXT NOT NULL,
  timezone TEXT DEFAULT 'EST',
  unix_timestamp INTEGER,
  successful BOOLEAN NOT NULL,
  failure_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  login_method TEXT DEFAULT 'interactive',
  country_code TEXT,
  city TEXT,
  isp TEXT,
  account_locked BOOLEAN DEFAULT FALSE,
  lockout_reason TEXT,
  device_hash TEXT,
  screen_resolution TEXT,
  timezone_offset TEXT,
  session_duration INTEGER,
  login_count_today INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_login_username ON login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_login_successful ON login_attempts(successful);
CREATE INDEX IF NOT EXISTS idx_login_timestamp ON login_attempts(unix_timestamp);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_users_employee_number ON users(employee_number);
CREATE INDEX IF NOT EXISTS idx_users_work_email ON users(work_email);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
CREATE INDEX IF NOT EXISTS idx_work_schedules_employee_id ON work_schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_dates ON work_schedules(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_security_questions_user_id ON security_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_users_original_id ON deleted_users(original_user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_users_deletion_date ON deleted_users(deletion_date);

CREATE TABLE IF NOT EXISTS field_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    field_name TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    change_date TEXT NOT NULL,
    change_time TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    change_type TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_field_changes_username ON field_changes(username);
CREATE INDEX IF NOT EXISTS idx_field_changes_date ON field_changes(change_date);
CREATE INDEX IF NOT EXISTS idx_field_changes_changed_by ON field_changes(changed_by);

CREATE TABLE IF NOT EXISTS terminal_inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    command_input TEXT NOT NULL,
    input_date TEXT NOT NULL,
    input_time TEXT NOT NULL,
    timezone TEXT DEFAULT 'EST',
    unix_timestamp INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_terminal_inputs_username ON terminal_inputs(username);
CREATE INDEX IF NOT EXISTS idx_terminal_inputs_date ON terminal_inputs(input_date);
CREATE INDEX IF NOT EXISTS idx_terminal_inputs_timestamp ON terminal_inputs(unix_timestamp);

-- ISO 8601 timestamp columns (UTC, stored as ISO strings with Z)
-- These columns may already exist in existing databases

-- Encrypted private messages between users (never delete by policy)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  body_ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  sent_date TEXT NOT NULL,
  sent_time TEXT NOT NULL,
  sent_iso8601 TEXT,
  read_date TEXT,
  read_time TEXT,
  read_iso8601 TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_status ON messages(recipient, status, sent_iso8601);
CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient ON messages(sender, recipient, sent_iso8601);

INSERT OR IGNORE INTO roles(role, description) VALUES
  ('admin', 'Full permissions'),
  ('user', 'Standard user');
)SQL";

bool Migrations::applyAll(Database& db, std::string& errorOut) {
  if (!db.exec(SCHEMA_SQL, errorOut)) {
    spdlog::error("Migration failed: {}", errorOut);
    return false;
  }
  return true;
}

} // namespace agrs::core
