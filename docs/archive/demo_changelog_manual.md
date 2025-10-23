# Profile Changelog Demo

## New Commands Implemented

The `profile changelog` command allows viewing and exporting field change history for any employee.

### View Change History
```
profile changelog <username> MMDDYYHHMM MMDDYYHHMM
```

### Export Change History to CSV
```
profile changelog <username> export MMDDYYHHMM MMDDYYHHMM export_path
```

## Manual Test Instructions

1. **Launch zeus:**
   ```bash
   zeus
   ```

2. **Login as admin:**
   - Username: `radwan.elgharbi1`
   - Password: `RadwanIsAwesome@123`

3. **View profile help to see new commands:**
   ```
   profile help
   ```

4. **Test viewing field changes for jcsmith (should show the work_phone change we just made):**
   ```
   profile changelog jcsmith 0829200000 0830000000
   ```

5. **Test exporting field changes to CSV:**
   ```
   profile changelog jcsmith export 0829200000 0830000000 /tmp/jcsmith_changes.csv
   ```

6. **Verify the export by checking the file:**
   ```bash
   cat /tmp/jcsmith_changes.csv
   ```

## Expected Results

- The `profile help` command should now include the changelog commands
- The changelog view should show the work_phone change from "Fifteen" to "+1 5191112222"
- The CSV export should create a file with proper headers and the change data
- All users can view changelog history, but only admins can export to CSV

## Features

- **Date Range Filtering**: Uses the same MMDDYYHHMM format as login_attempts
- **Comprehensive Logging**: Shows field name, previous value, new value, date/time, and who made the change
- **CSV Export**: Properly formatted CSV with quoted fields for safe import
- **Access Control**: Viewing is available to all users, exporting only to admins
- **Integration**: Seamlessly integrated with the existing profile command family
