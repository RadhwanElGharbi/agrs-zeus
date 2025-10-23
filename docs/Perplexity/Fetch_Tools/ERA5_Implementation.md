# ERA5 Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

To automatically download ERA5 climate reanalysis data for a specific geographic bounding box using the CDS API in Python, you need to:

1. **Set up and authenticate the CDS API** by registering at the Copernicus Climate Data Store (CDS) and configuring your API key locally.
2. Use the **`cdsapi` Python library** to script data requests.
3. Specify the **geographic bounding box, time range, variables, and output format** in the request.
4. Choose from available **climate variables** such as temperature, precipitation, and wind.
5. Select output formats like **NetCDF or GRIB**.
6. Run a complete Python script to automate the download.

---

### 1. CDS API Setup and Authentication

- Register for a free account at the [Copernicus Climate Data Store](https://cds.climate.copernicus.eu/).
- After logging in, go to your **User Profile > API key** section to find your API key.
- Create a file named `.cdsapirc` in your home directory with the following content (replace with your actual URL, key, and email):

```ini
url: https://cds.climate.copernicus.eu/api/v2
key: <your-uid>:<your-api-key>
email: your-email@example.com
```

- Install the CDS API client in Python:

```bash
pip install cdsapi
```

---

### 2. Python Code Using `cdsapi` Library

Import the library and create a client instance:

```python
import cdsapi

c = cdsapi.Client()
```

---

### 3. How to Specify Bounding Box, Time Range, Variables

In the CDS API request dictionary:

- **Bounding box**: Use `"area"` parameter as `[North, West, South, East]` in degrees.
- **Time range**: Specify `"year"`, `"month"`, `"day"`, and `"time"` as lists or strings.
- **Variables**: List climate variables like `"2m_temperature"`, `"total_precipitation"`, `"10m_u_component_of_wind"`, `"10m_v_component_of_wind"`, etc.

Example snippet for a bounding box over Europe:

```python
area = [55, -10, 35, 30]  # North, West, South, East
```

---

### 4. Available Climate Variables in ERA5

Common variables include:

- **Temperature**: `"2m_temperature"`, `"surface_temperature"`
- **Precipitation**: `"total_precipitation"`
- **Wind**: `"10m_u_component_of_wind"`, `"10m_v_component_of_wind"`
- Others: `"mean_sea_level_pressure"`, `"surface_pressure"`, `"dewpoint_temperature"`, etc.

You can find the full list in the CDS documentation for ERA5.

---

### 5. Output Formats

- `"format"` parameter supports `"netcdf"` (NetCDF) or `"grib"` (GRIB).
- NetCDF is widely used for climate data analysis.

---

### 6. Example Complete Python Script for Automated Fetching

```python
import cdsapi

def download_era5_data():
    c = cdsapi.Client()

    c.retrieve(
        'reanalysis-era5-single-levels',  # ERA5 single-level data
        {
            'product_type': 'reanalysis',
            'variable': [
                '2m_temperature',
                'total_precipitation',
                '10m_u_component_of_wind',
                '10m_v_component_of_wind',
            ],
            'year': '2023',
            'month': ['01', '02', '03'],  # Jan to Mar 2023
            'day': [f'{day:02d}' for day in range(1, 32)],  # All days of month
            'time': [
                '00:00', '06:00', '12:00', '18:00'
            ],
            'area': [55, -10, 35, 30],  # North, West, South, East (Europe)
            'format': 'netcdf',
        },
        'era5_europe_jan_mar_2023.nc')  # Output filename

if __name__ == "__main__":
    download_era5_data()
```

---

This script will download ERA5 single-level reanalysis data for temperature, precipitation, and wind components over the specified bounding box and time range, saving it as a NetCDF file.

---

**Summary:**

- Register and set up `.cdsapirc` for authentication.
- Use `cdsapi.Client()` in Python.
- Specify `"area"` for bbox, `"year"`, `"month"`, `"day"`, `"time"` for time range.
- Select variables like `"2m_temperature"`, `"total_precipitation"`, `"10m_u_component_of_wind"`.
- Choose output format `"netcdf"` or `"grib"`.
- Run the Python script to automate downloading ERA5 data.

This approach is the standard and recommended method to programmatically access ERA5 data from the Copernicus Climate Data Store using Python.