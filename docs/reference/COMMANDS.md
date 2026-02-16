# AGRS ZEUS Terminal Commands

## Basic Commands

### `help`
Shows available commands for the current user.

### `help admin`
Shows admin-only commands (requires admin privileges).

### `version`
Displays the current version of AGRS ZEUS.

### `status`
Shows current user status and session information.

### `quit`
Exits the interactive terminal session.

## Admin Commands

### Login Attempts Management

#### `logs login_attempts MMDDYYHHMM MMDDYYHHMM`
View login attempts between specified start and end dates/times.

**Format:** MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)

**Example:**
```
logs login_attempts 0826250000 0826252359
```

#### `logs login_attempts export MMDDYYHHMM MMDDYYHHMM export_path`
Export login attempts to CSV file between specified dates/times.

**Format:** MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)

**Example:**
```
logs login_attempts export 0826250000 0826252359 login_attempts.csv
```

### Terminal Input Logging

#### `logs terminal_inputs MMDDYYHHMM MMDDYYHHMM` *(Admin Only)*
View all terminal command inputs between specified start and end dates/times. Requires admin password verification.

**Format:** MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)

**Example:**
```
logs terminal_inputs 0829200000 0829235959
```

**Note:** Sensitive commands containing passwords or security questions are automatically filtered and not logged.

#### `logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM` *(Admin Only)*
View terminal command inputs for a specific user between specified dates/times. Requires admin password verification.

**Format:** MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)

**Example:**
```
logs terminal_inputs jcsmith 0829200000 0829235959
```

#### `logs terminal_inputs MMDDYYHHMM MMDDYYHHMM export export_path` *(Admin Only)*
Export all terminal command inputs to CSV file between specified dates/times. Requires admin password verification.

**Format:** MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)

**Example:**
```
logs terminal_inputs 0829200000 0829235959 export terminal_logs.csv
```

#### `logs terminal_inputs <username> MMDDYYHHMM MMDDYYHHMM export export_path` *(Admin Only)*
Export terminal command inputs for a specific user to CSV file between specified dates/times. Requires admin password verification.

**Format:** MMDDYYHHMM (e.g., 0829200000 for 08-29-25 20:00)

**Example:**
```
logs terminal_inputs jcsmith 0829200000 0829235959 export jcsmith_logs.csv
```

### Employee Management

#### `employees` *(Admin Only)*
Lists all employees in the system with basic information. Requires admin password verification for security.

**Example:**
```
employees
```

### Profile Management

All profile-related commands are organized under the `profile` command family. Use `profile help` to see all available options.

#### `profile help`
Shows all available profile commands based on your role.

**Example:**
```
profile help
```

#### `profile view`
**All Users**: View your own complete profile information (excludes sensitive admin fields like permissions, account_status, and admin_notes).

**Example:**
```
profile view
```

#### `profile employee <username>`
View another employee's profile information. The level of detail depends on your role:

**Admin users see complete profile:**
- Basic information (name, position, department, etc.)
- Contact information (phone, emails, address)
- Administrative information (role, permissions, notes)
- System information (creation date, last login, etc.)

**Non-admin users see limited profile:**
- Username, name, employee number
- Position, department, direct superior
- Employment status
- Work email and work phone only

**Example:**
```
profile employee radwan.elgharbi1
```

#### `create employee`
Create a new employee account with a temporary password. The admin will be prompted for:
- Employee information (name, position, department, etc.)
- Admin password verification

The system will:
- Generate a unique username based on the employee's name
- Create a random 16-character temporary password
- Display the temporary password for the admin to provide to the new employee

**Example:**
```
create employee
```

**Username Generation Rules:**
- With middle name: `[first_letter][middle_letter][last_6_letters][##]` (e.g., `rmelghar01`)
- Without middle name: `[first_letter][last_7_letters][##]` (e.g., `relgharb01`)
- Numbers (01, 02, etc.) are appended for duplicate usernames

#### `deactivate user`
Deactivate a user account with audit logging. The admin will be prompted for:
- Admin password verification
- Username to deactivate
- Deactivation reason
- Password confirmation

The system will:
- Mark the user account as deactivated
- Record deactivation date/time (MM-DD-YYYY HH:MM EST)
- Store deactivation reason and approving admin
- Maintain user data for audit purposes

**Example:**
```
deactivate user
```

#### `delete user`
Delete a user account and archive the data. The admin will be prompted for:
- Admin password verification
- Username to delete
- Deletion reason
- Password confirmation

The system will:
- Copy all user data to deleted_users table
- Remove user from active users table
- Record deletion date/time (MM-DD-YYYY HH:MM EST)
- Store deletion reason and approving admin

**Example:**
```
delete user
```

#### `profile edit <field>`
**All Users**: Edit specific fields of your own profile. Available fields:
- `work_phone` - Your work phone number (validated format required)
- `work_email` - Your work email address  
- `personal_email` - Your personal email address
- `home_address` - Your home address

**Phone Number Format Requirements:**
- Digits only: `5149712858`
- With country code: `+1 5149712858` (space required after country code)
- No hyphens, brackets, letters, or other symbols allowed

If no field is specified or an invalid field is entered, the system shows available options.

**Examples:**
```
profile edit work_phone
profile edit work_email
profile edit
```

#### `profile edit_user <username> <field1> [field2] [field3] ...`
**Admin Only**: Edit one or more fields of any employee's profile. Admin will be prompted for:
- Admin password verification
- Current values for each field
- New values for each field (or keep current by pressing Enter)
- Summary of all changes
- Confirmation before saving all changes

Available fields include all profile information:
- Personal: `first_name`, `middle_name`, `last_name`, `employee_number`
- Work: `position`, `department`, `direct_superior`, `years_employment`
- Contact: `work_phone`, `work_email`, `personal_email`, `home_address`
- Admin: `permissions`, `roles`, `employment_status`, `hire_date`, `account_status`, `work_type`, `skills`, `admin_notes`

**Examples:**
```
profile edit_user jsmith work_phone                              # Edit single field
profile edit_user jsmith position department direct_superior    # Edit multiple fields
profile edit_user jsmith                                        # Show available fields
```

**Multi-field editing workflow:**
1. Admin password verification
2. Shows current values for each field
3. Prompts for new value for each field (Enter to keep current)
4. Shows summary of changes
5. Confirms all changes before applying

#### `profile changelog <username> <start> <end>`
**All Users**: View field change history for any employee within a date range.

**Parameters:**
- `<username>` - Target employee's username
- `<start>` - Start date/time in MMDDYYHHMM format 
- `<end>` - End date/time in MMDDYYHHMM format

**Example:**
```
profile changelog jsmith 0826250000 0827252359
```

#### `profile changelog <username> export <start> <end> <path>`
**Admin Only**: Export field change history to CSV file.

**Parameters:**
- `<username>` - Target employee's username
- `export` - Keyword to trigger export mode
- `<start>` - Start date/time in MMDDYYHHMM format
- `<end>` - End date/time in MMDDYYHHMM format  
- `<path>` - File path for CSV export

**Example:**
```
profile changelog jsmith export 0826250000 0827252359 changes.csv
```

#### Using Profile Commands

To use any profile command, simply start with `profile`:
```
profile                    # Shows help message
profile help              # Shows all profile commands
profile view              # View your own profile
profile edit work_phone   # Edit your work phone
profile employee jsmith   # View jsmith's profile
profile changelog jsmith 0826250000 0827252359   # View change history

# Admin commands
profile edit_user jsmith position                    # Edit one field
profile edit_user jsmith position department role   # Edit multiple fields
profile changelog jsmith export 0826250000 0827252359 changes.csv  # Export changes
```

### Work Schedule Management

#### `schedule <username> MMDDYYHHMM MMDDYYHHMM`
View employee work schedule between specified dates.

**Format:** MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)

**Example:**
```
schedule radwan.elgharbi1 0826250000 0826252359
```

#### `schedule <username> export MMDDYYHHMM MMDDYYHHMM export_path`
Export employee work schedule to CSV file.

**Format:** MMDDYYHHMM (e.g., 0826250000 for 08-26-25 00:00)

**Example:**
```
schedule radwan.elgharbi1 export 0826250000 0826252359 schedule.csv
```

## Audit and Security Features

### Field Change Logging
All profile field changes are automatically logged to the database with the following information:
- **Previous Value**: The value before the change
- **New Value**: The value after the change  
- **Date/Time**: When the change occurred (MM-DD-YYYY HH:MM EST format)
- **Changed By**: Username of who made the change (self-edit or admin username)
- **Change Type**: Either "self_edit" or "admin_edit"

This provides a complete audit trail for all profile modifications.

### Phone Number Validation
Phone numbers are validated during entry and editing to ensure consistent formatting:
- **Valid Formats**: `5149712858` or `+1 5149712858`
- **Requirements**: Only digits and optional country code with single space
- **Rejected**: Hyphens, brackets, letters, multiple spaces, or other symbols

## Employee Profile Fields

### Basic Information
- **First Name, Middle Name, Last Name** - Employee's full name
- **Employee Number** - Unique employee identifier
- **Position/Role** - Job title and responsibilities
- **Department** - Organizational unit
- **Direct Superior** - Reporting manager
- **Years Employment** - Length of service

### Contact Information
- **Work Phone** - Office phone number
- **Work Email** - Company email address
- **Personal Email** - Personal email address
- **Home Address** - Residential address

### Admin-Only Fields
- **Permissions** - System access permissions
- **Roles (Admin)** - Administrative roles
- **Employment Status** - active, inactive, terminated, on leave
- **Hire Date** - Date of employment
- **Last Login Date** - Most recent system access
- **Account Status** - active, locked, suspended
- **Profile Picture Path** - Path to employee photo
- **Work Type** - full-time, part-time
- **Skills/Certifications** - Professional qualifications
- **Admin Notes** - Administrative notes

## Work Schedule Fields

### Task Information
- **Task Name** - Name of the assigned task
- **Task Description** - Detailed task description
- **Start Date/Time** - When the task begins
- **End Date/Time** - When the task ends
- **Task Status** - assigned, in-progress, completed, cancelled
- **Priority** - low, medium, high, critical
- **Assigned By** - Who assigned the task
- **Notes** - Additional task notes

## First Login Process

When a new employee logs in with their temporary password for the first time, they will be required to:

1. **Change Password** - Set a new secure password
   - Must be at least 6 characters long
   - Must contain at least one uppercase letter
   - Must contain at least one lowercase letter
   - Must contain at least one number

2. **Set Security Question** - Create a security question and answer for account recovery

3. **Confirm Information** - Review and confirm the new password and security question

After completing this process, the employee can use their new password for future logins.

## Date/Time Format

All date/time parameters use the compact format: **MMDDYYHHMM**

- **MM** - Month (01-12)
- **DD** - Day (01-31)
- **YY** - Year (25 for 2025)
- **HH** - Hour (00-23, 24-hour format)
- **MM** - Minute (00-59)

**Examples:**
- `0826250000` = August 26, 2025 at 00:00
- `1225252359` = December 25, 2025 at 23:59

## Geospatial Data Processing Tools

The `tools` command family provides comprehensive geospatial data processing capabilities for AI-ready analysis. All tools enforce SI units policy and maintain Float32 precision for analytical consistency.

## Phase 0 Standards
All tools now follow these standards:
- **RAW outputs**: Properly reprojected to requested CRS and clipped to AOI
- **Sidecar JSON**: Every output includes comprehensive metadata in `.json` format
- **SI Units**: Float32 with explicit units, SI prefixes converted to exponent format
- **Naming**: Standardized format: `YYYYMMDD_<TYPE>_<RES>_<SOURCE>_<FORMAT>_<CRS>_<AOI>.tif`

### Unified Search

#### `tools search [options]`
Unified search across multiple geospatial data providers.

**Options:**
- `--aoi <path>` - AOI vector file (GeoJSON, Shapefile)
- `--bbox <coords>` - BBox minx,miny,maxx,maxy in EPSG:4326
- `--datetime <range>` - ISO 8601 date/time range (e.g., 2024-10-01/2024-10-31)
- `--theme <type>` - Data theme: imagery|dem|landcover|protected|roads|hydro (default: imagery)
- `--cloud <percent>` - Max cloud cover percent for imagery (default: 30)
- `-o, --output <dir>` - Output directory for results
- `--overwrite` - Overwrite outputs

**Example:**
```
tools search --aoi wyoming.geojson --theme imagery --datetime 2024-10-01/2024-10-31 -o search_results/
```

### GeoAI Processing

#### `tools geoai --task <task> <input> <output> [options]`
Geospatial AI processing using torchgeo and other ML libraries.

**Parameters:**
- `<input>` - Input raster file path
- `<output>` - Output file path

**Options:**
- `--task <task>` - AI task: cloud_mask|water_detect|change_detect|landcover_seg (default: cloud_mask)
- `--model <model>` - Model to use: s2cloudless|unet|segformer (default: s2cloudless)
- `--overwrite` - Overwrite output

**Example:**
```
tools geoai --task cloud_mask input_s2.tif cloud_mask.tif --model s2cloudless
```

### Data Translation

#### `tools gpkg_translate <input> <output> [options]`
Extract and organize GPKG contents into AI-friendly formats.

**Parameters:**
- `<input>` - Input GPKG file path
- `<output>` - Output directory for organized data

**Options:**
- `--separate-layers` - Separate layers into individual files
- `--vector-format <format>` - Format for vector layers (default: geojson)
- `--raster-format <format>` - Format for raster layers (default: cog)
- `--table-format <format>` - Format for attribute tables (default: parquet)
- `--filter-layers <regex>` - Regex filter for layer names
- `--include-metadata` - Generate detailed metadata files
- `--overwrite` - Overwrite existing outputs

**Example:**
```
tools gpkg_translate Dubai_Context.gpkg ./output --separate-layers --include-metadata --overwrite
```

### Raster Operations

#### `tools raster_query <raster> <longitude> <latitude> [options]`
Query raster values at specific coordinates with SI units enforcement.

**Parameters:**
- `<raster>` - Raster file path (must be Float32 with explicit units)
- `<longitude>` - Longitude in WGS84 decimal degrees
- `<latitude>` - Latitude in WGS84 decimal degrees

**Options:**
- `--format <format>` - Output format (default: json)

**Example:**
```
tools raster_query elevation.tif 55.2665759 25.0827660
```

**Output:** JSON with coordinate transformation, SI unit conversion, and metadata.

#### `tools raster_extract_band <input> <band> <output> [options]`
Extract a single band as Float32 with explicit unit metadata.

**Parameters:**
- `<input>` - Input raster file path
- `<band>` - Band index (1-based)
- `<output>` - Output raster path

**Options:**
- `--unit <unit>` - Unit metadata for output band (default: '1' for dimensionless)
- `--cog` - Write as Cloud Optimized GeoTIFF (default: on)
- `--overwrite` - Overwrite output if exists

**Example:**
```
tools raster_extract_band ndwi_rgb.tif 3 blue_channel.tif --unit 1 --overwrite
```

#### `tools raster_rescale_index <input> <output> [options]`
Rescale encoded index raster to dimensionless Float32 range.

**Parameters:**
- `<input>` - Input raster path
- `<output>` - Output raster path

**Options:**
- `--index <type>` - Index type (ndbi|evi|custom) (default: custom)
- `--auto` - Auto-detect source range via stats (default: on)
- `--src-min <value>` - Source min (override auto-detection)
- `--src-max <value>` - Source max (override auto-detection)
- `--dst-min <value>` - Destination min (default: -1)
- `--dst-max <value>` - Destination max (default: 1)
- `--cog` - Write as COG (default: on)
- `--overwrite` - Overwrite output

**Example:**
```
tools raster_rescale_index encoded_index.tif index_float32.tif --auto --overwrite
```

#### `tools raster_calc <inputs...> <output> <expression> [options]`
Perform raster calculations using mathematical expressions.

**Parameters:**
- `<inputs...>` - Input raster file paths (referenced as A, B, C, etc.)
- `<output>` - Output raster path
- `<expression>` - Mathematical expression (e.g., 'A+B', '(A>0.3)*1')

**Options:**
- `--type <datatype>` - Output data type (default: Float32)
- `--overwrite` - Overwrite output if exists

**Example:**
```
tools raster_calc water1.tif water2.tif difference.tif '(A==1)*(B!=1)*1' --type Byte --overwrite
```

#### `tools raster_sample <raster> <longitude> <latitude> [options]`
Sample raster values at specific coordinates.

**Parameters:**
- `<raster>` - Raster file path
- `<longitude>` - Longitude in WGS84 decimal degrees
- `<latitude>` - Latitude in WGS84 decimal degrees

**Options:**
- `--format <format>` - Output format (default: json)

**Example:**
```
tools raster_sample water_mask.tif 55.1184871 25.1051161
```

#### `tools raster_align <input> <output> <reference> [options]`
Align raster to match reference raster extent and resolution.

**Parameters:**
- `<input>` - Input raster path
- `<output>` - Output raster path
- `<reference>` - Reference raster path

**Options:**
- `--overwrite` - Overwrite output if exists

**Example:**
```
tools raster_align raster2.tif raster2_aligned.tif reference.tif --overwrite
```

#### `tools raster_polygonize <input> <output> [options]`
Convert raster pixels to vector polygons.

**Parameters:**
- `<input>` - Input raster path
- `<output>` - Output vector path

**Options:**
- `--field <name>` - Field name for pixel values (default: pixel_val)
- `--overwrite` - Overwrite output if exists

**Example:**
```
tools raster_polygonize water_mask.tif water_polygons.shp --overwrite
```

### Specialized Detection Tools

#### `tools dem_fetch --bbox <minx,miny,maxx,maxy> -o <output> [options]`
Fetch DEM data for an AOI. Defaults to open 30 m sources. High-resolution (10 m/1 m) is opt-in and may require credentials.

Parameters:
- `--bbox <minx,miny,maxx,maxy>`: Bounding box in EPSG:4326
- `--aoi <path>`: AOI vector path (GeoJSON/Shapefile). If provided without `--bbox`, extent is derived from AOI
- `-o, --output <path>`: Output COG path

Options:
- `--res <30m|10m|1m>`: Desired resolution (default: 30m)
- `--provider <auto|opentopo|srtm|nasadem|copernicus>`: Data provider (default: auto)
- `--to-crs <EPSG:xxxx>`: Reproject output to target CRS
- `--overwrite`: Overwrite output if exists
- `--dry-run`: Print planned fetch (JSON) but do not download

Notes:
- Output is Float32, unit `m` (meters), COG, preserving CRS unless `--to-crs` is set.
- Vertical datum is preserved and reported in metadata when available.

Example:
```
zeus tools dem_fetch --bbox 55.0,24.8,55.6,25.3 --res 30m --provider auto --to-crs EPSG:32640 -o out/dem_30m.tif --dry-run
```

#### `tools raster_water_detect <input> <output> [options]`
Detect water features from RGB raster using improved thresholds.

**Parameters:**
- `<input>` - Input RGB raster path
- `<output>` - Output water mask path

**Options:**
- `--blue-threshold <value>` - Minimum blue channel value (default: 50000)
- `--red-green-max <value>` - Maximum red/green channel value (default: 28000)
- `--overwrite` - Overwrite output if exists

**Water Detection Criteria:**
- Blue >= 50,000 AND Red <= 28,000 AND Green <= 28,000

**Example:**
```
tools raster_water_detect ndwi_rgb.tif water_mask.tif --blue-threshold 50000 --red-green-max 28000 --overwrite
```

#### `tools raster_cloud_detect <input> <output> [options]`
Detect cloud features from RGB raster using R=G pattern analysis.

**Parameters:**
- `<input>` - Input RGB raster path
- `<output>` - Output cloud mask path

**Options:**
- `--red-green-min <value>` - Minimum red/green channel value (default: 33000)
- `--red-green-max <value>` - Maximum red/green channel value (default: 45000)
- `--blue-min <value>` - Minimum blue channel value (default: 50000)
- `--overwrite` - Overwrite output if exists

**Cloud Detection Criteria:**
- Red == Green (exact equality)
- 33,000 <= Red/Green <= 45,000
- Blue > 50,000

**Example:**
```
tools raster_cloud_detect satellite_rgb.tif cloud_mask.tif --red-green-min 33000 --red-green-max 45000 --blue-min 50000 --overwrite
```

### Vector Operations

#### `tools vector_query <vector> <longitude> <latitude> [options]`
Query vector features at specific coordinates.

**Parameters:**
- `<vector>` - Vector file path
- `<longitude>` - Longitude in WGS84 decimal degrees
- `<latitude>` - Latitude in WGS84 decimal degrees

**Options:**
- `--query-type <type>` - Query type (nearest|contains) (default: nearest)

**Example:**
```
tools vector_query buildings.geojson 55.2897217 25.1589447 --query-type contains
```

## SI Units Policy

All geospatial tools enforce the International System of Units (SI Units) policy:

### Raster Data Requirements
- **Data Type**: Float32 for all analytical rasters
- **Units**: Explicit unit metadata required
- **Length Units**: Automatically converted to meters with conversion reporting
- **Dimensionless Indices**: Unit must be "1" or "unitless"

### Unit Conversion Reporting
When unit conversions occur, tools display:
- Original unit and value
- SI unit and converted value
- Conversion factor applied
- Conversion metadata in JSON output

### Examples
```json
{
  "value_source": 3.5,
  "value_si": 3.5,
  "units": {
    "source": "m",
    "si": "m"
  },
  "conversion": {
    "applied": false,
    "factor": 1.0
  }
}
```

## Tool Integration Workflow

### Typical Water Body Analysis Workflow
```bash
# 1. Extract GPKG data
tools gpkg_translate Dubai_Context.gpkg ./data --separate-layers --overwrite

# 2. Extract RGB bands from composite
tools raster_extract_band composite.tif 1 red.tif --unit 1 --overwrite
tools raster_extract_band composite.tif 2 green.tif --unit 1 --overwrite  
tools raster_extract_band composite.tif 3 blue.tif --unit 1 --overwrite

# 3. Detect water features (NDWI-based water detection has been removed)
# Use raster_calc with appropriate spectral index expressions instead

# 4. Detect clouds for masking
tools raster_cloud_detect ndwi_composite.tif cloud_mask.tif --overwrite

# 5. Create analysis-ready difference mask
tools raster_calc water1.tif water2.tif water_diff.tif '(A==1)*(B!=1)*1' --overwrite

# 6. Convert to vectors for spatial analysis
tools raster_polygonize water_diff.tif water_polygons.shp --overwrite

# 7. Sample specific coordinates
tools raster_sample water_mask.tif 55.1184871 25.1051161
```

### Error Handling
All tools provide consistent error handling:
- Input validation with clear error messages
- SI units compliance checking
- Coordinate system validation
- File existence and permissions checking
- Detailed logging for debugging

### Performance Characteristics
- **Memory Usage**: 2-4 GB for typical raster operations
- **Processing Time**: ~30 seconds per band extraction, ~45 seconds per water detection
- **Scalability**: Handles rasters up to 10GB efficiently
- **Optimization**: Single-threaded GDAL operations with potential for parallelization
