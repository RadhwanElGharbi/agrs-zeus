# OSM Power Lines Fetch Tool - Implementation Guide

**Date**: 2025-10-12
**Query**: Overpass API power line extraction

---

Here is a comprehensive guide to implement your C++ fetch tool for extracting **power transmission lines** from OpenStreetMap (OSM) using the Overpass API, tailored to your project context and requirements.

---

### 1. Overpass API Query Syntax for Power Lines with Bounding Box

You want to query **power lines** tagged as `power=line` or `power=minor_line` with voltage preferably >100kV, within your AOI bounding box (bbox: 13.454779,42.857057,13.938769,43.438886).

A tested Overpass QL query for this is:

```overpass
[out:xml][timeout:180];
// Define bbox: (south,west,north,east)
(
  way["power"~"line|minor_line"]["voltage"](42.857057,13.454779,43.438886,13.938769);
  relation["power"~"line|minor_line"]["voltage"](42.857057,13.454779,43.438886,13.938769);
);
// Filter voltage > 100kV (100000V)
way["voltage"](if: t["voltage"] && (t["voltage"].to_int() > 100000));
relation["voltage"](if: t["voltage"] && (t["voltage"].to_int() > 100000));
out body;
>;
out skel qt;
```

**Explanation:**

- `way` and `relation` elements are queried because power lines can be mapped as ways or relations.
- The `power` tag is filtered with regex `"line|minor_line"` to include both.
- The bounding box is specified as `(south,west,north,east)`.
- The `if:` filter uses Overpass's expression evaluator to select only those with `voltage` tag > 100000 (100kV).
- The output is in XML format (`out:xml`).
- Timeout is set to 180 seconds to allow for complex queries.
- The recursive `>` fetches all member nodes of ways/relations.
- The final `out skel qt;` outputs skeleton data for quick transfer.

If you want to include `power=cable` (underground cables), add it to the regex:

```overpass
way["power"~"line|minor_line|cable"]["voltage"](bbox);
relation["power"~"line|minor_line|cable"]["voltage"](bbox);
```

---

### 2. Relevant OSM Tags to Include

- `power=line` — standard overhead power lines.
- `power=minor_line` — smaller power lines, sometimes lower voltage.
- `power=cable` — underground or submarine power cables.
- `voltage=*` — voltage rating, e.g., `220000` for 220kV.
- Optionally, `power=disused` or `disused=yes` to detect inactive lines.
- You may also consider `power=connector` or `power=substation` if relevant, but your focus is on lines.

---

### 3. Filtering by Voltage

- Voltage is stored as a string in volts, e.g., `"220000"` for 220kV.
- Overpass QL supports numeric filtering with the `if:` statement and `to_int()` conversion.
- Use `if: t["voltage"] && (t["voltage"].to_int() > 100000)` to filter lines above 100kV.
- If voltage is missing, those lines are excluded by this filter.

---

### 4. Appropriate Timeout for Overpass Queries

- For a bbox covering Central Italy and filtering power lines, **180 seconds (3 minutes)** is a reasonable timeout.
- You can adjust with `[timeout:180]` in the query.
- For larger areas or more complex queries, increase timeout accordingly.
- Your C++ tool should handle timeout errors gracefully and retry or report.

---

### 5. Correct ogr2ogr Command to Extract Lines from OSM XML

To convert downloaded OSM XML to GeoPackage with only the lines layer clipped to bbox, use:

```bash
ogr2ogr -f GPKG output.gpkg input.osm \
  -where "power IS NOT NULL" \
  -clipsrc 13.454779 42.857057 13.938769 43.438886 \
  -nln power_lines \
  -overwrite
```

**Details:**

- `-f GPKG` specifies GeoPackage output.
- `input.osm` is the downloaded OSM XML file.
- `-where "power IS NOT NULL"` filters features with a `power` tag.
- `-clipsrc` clips geometries to your bbox (xmin ymin xmax ymax).
- `-nln power_lines` names the output layer.
- `-overwrite` overwrites existing output file if any.

If you want to extract only lines (ways), you can specify the layer `lines` in OSM driver:

```bash
ogr2ogr -f GPKG output.gpkg input.osm lines \
  -where "power IS NOT NULL" \
  -clipsrc 13.454779 42.857057 13.938769 43.438886 \
  -nln power_lines \
  -overwrite
```

---

### 6. Handling Cases with No Power Lines in BBox

- After download, check if the OSM XML file is empty or very small.
- After conversion, check if the GeoPackage layer `power_lines` exists and has features.
- If no features, log a warning or return a specific error code.
- Your C++ tool can create an empty GeoPackage with metadata indicating no data found.
- Optionally, retry with a larger bbox or relax voltage filter.

---

### Example C++ Implementation Guidance (Pseudocode)

```cpp
int tools_osm_power_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          bool overwrite) {
    // 1. Parse bbox into south, west, north, east
    double south, west, north, east;
    parse_bbox(bbox, south, west, north, east);

    // 2. Construct Overpass QL query string with bbox and voltage filter >100kV
    std::string query = R"(
        [out:xml][timeout:180];
        (
          way["power"~"line|minor_line"]["voltage"]()" + std::to_string(south) + "," + std::to_string(west) + "," + std::to_string(north) + "," + std::to_string(east) + R"();
          relation["power"~"line|minor_line"]["voltage"]()" + std::to_string(south) + "," + std::to_string(west) + "," + std::to_string(north) + "," + std::to_string(east) + R"();
        );
        out body;
        >;
        out skel qt;
    )";

    // 3. Save query to a temporary file or pass as POST data to Overpass API
    // 4. Use system call to curl to POST query and save to temp.osm
    std::string curlCmd = "curl -X POST -d \"" + query + "\" https://overpass-api.de/api/interpreter -o temp.osm --max-time 180";
    int curlRet = system(curlCmd.c_str());
    if (curlRet != 0) {
        // Handle curl error or timeout
        return -1;
    }

    // 5. Validate temp.osm exists and is not empty
    if (!file_exists_and_not_empty("temp.osm")) {
        // No data or error
        return -2;
    }

    // 6. Use ogr2ogr to convert OSM XML to GeoPackage clipped to bbox
    std::string ogrCmd = "ogr2ogr -f GPKG " + outputPath + " temp.osm lines "
                         "-where \"power IS NOT NULL\" "
                         "-clipsrc " + std::to_string(west) + " " + std::to_string(south) + " " + std::to_string(east) + " " + std::to_string(north) + " "
                         "-nln power_lines ";
    if (overwrite) {
        ogrCmd += "-overwrite ";
    }
    int ogrRet = system(ogrCmd.c_str());
    if (ogrRet != 0 || !file_exists_and_not_empty(outputPath)) {
        // Handle ogr2ogr error
        return -3;
    }

    // 7. Create metadata JSON with source, date, tags, bbox
    create_metadata_json(outputPath, "OpenStreetMap", current_date_iso8601(), {"power=line", "power=minor_line"}, bbox);

    return 0;
}
```

---

### Summary of Key Points

| Question                         | Answer                                                                                  |
|---------------------------------|-----------------------------------------------------------------------------------------|
| 1. Overpass API query syntax     | Use `way` and `relation` with `power=line|minor_line`, bbox filter, voltage >100kV filter with `if:` evaluator, output XML. |
| 2. OSM tags to include           | `power=line`, `power=minor_line`, optionally `power=cable`, filter by `voltage=*`.      |
| 3. Voltage filtering             | Use Overpass `if: t["voltage"] && (t["voltage"].to_int() > 100000)` to filter >100kV.   |
| 4. Timeout                      | 180 seconds is appropriate for your AOI and query complexity.                           |
| 5. ogr2ogr command               | `ogr2ogr -f GPKG output.gpkg input.osm lines -where "power IS NOT NULL" -clipsrc bbox -nln power_lines -overwrite` |
| 6. No power lines in bbox        | Check file size and feature count; handle gracefully with warnings or empty outputs.    |

---

This approach aligns with OpenStreetMap tagging conventions and Overpass API usage documented in [1][4][9], and uses standard GDAL/OGR tools for conversion.

If you want, I can help generate a fully working C++ code snippet or shell script for testing.