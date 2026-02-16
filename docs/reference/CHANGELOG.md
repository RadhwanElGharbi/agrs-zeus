# AGRS ZEUS Changelog

## [Unreleased]

### Added
- **Complete Employee Onboarding System**
  - Admin-initiated employee account creation with `create employee` command
  - Automatic username generation based on employee names with duplicate detection
  - Random 16-character temporary password generation
  - First login onboarding flow with password change and security question setup
  - Password validation with security requirements (6+ chars, upper/lower/number)
  - Secure storage of security questions and answers
  - Temporary password flag to track onboarding status
- Enhanced employee profile system with comprehensive employee information
- Work schedule management system for tracking employee tasks
- New admin commands for employee management:
  - `employees` - List all employees
  - `employee <username>` - View detailed employee profile
  - `create employee` - Create new employee account with temporary password
  - `schedule <username> MMDDYYHHMM MMDDYYHHMM` - View employee work schedule
  - `schedule <username> export MMDDYYHHMM MMDDYYHHMM export_path` - Export schedule to CSV
- Employee profile fields including:
  - Basic information (name, employee number, position, department)
  - Contact information (phone, email, address)
  - Employment details (hire date, years, work type, status)
  - Admin-only fields (permissions, skills, notes)
- Work schedule tracking with task details, dates, priorities, and status
- Last login tracking for security monitoring
- Database schema updates for enhanced user profiles and work schedules
- Security questions table for account recovery
- **Terminal Input Logging System**
  - Automatic logging of all user terminal commands with date/time stamps
  - Smart filtering to exclude sensitive data (passwords, security questions)
  - Admin commands to view and query terminal input logs:
    - `logs terminal_inputs MMDDYYHHMM MMDDYYHHMM` - View all terminal inputs
    - `logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM` - View user-specific inputs
    - `logs terminal_inputs MMDDYYHHMM MMDDYYHHMM export export_path` - Export all terminal inputs to CSV
    - `logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM export export_path` - Export user-specific inputs to CSV
  - Database table `terminal_inputs` for audit trail and security monitoring

### Changed
- Updated database schema to include comprehensive employee profile fields
- Enhanced user creation with default profile information
- Improved admin help system with new employee management commands

## [0.1.0] - 2025-08-27

### Added
- Initial AGRS ZEUS terminal application
- Interactive login system with hidden password input
- Persistent terminal session with command processing
- Admin-only debug logging (database path visible only to admins)
- Login attempt logging with comprehensive security data
- Admin commands for login attempt management:
  - `logs login_attempts MMDDYYHHMM MMDDYYHHMM` - View login attempts with compact date format
  - `logs login_attempts export MMDDYYHHMM MMDDYYHHMM export_path` - Export login attempts to CSV
- Database schema with users, roles, and login_attempts tables
- User authentication with secure password hashing
- Command-line interface with subcommands for database and user management
- Professional logging system with rotating file sinks
- Configuration management with JSON-based settings
- XDG Base Directory compliance for data storage
- CMake build system with CPack packaging support
- Comprehensive documentation and command manual

### Security
- Secure password hashing using libsodium
- Hidden password input during login
- Generic login failure messages (no specific error details)
- Admin password verification for sensitive operations
- Login attempt logging with IP address and security metadata

### Technical
- C++20 standard compliance
- SQLite3 database backend
- CLI11 command-line parsing
- spdlog logging framework
- nlohmann/json configuration
- Catch2 unit testing framework
- Professional file organization and build structure
