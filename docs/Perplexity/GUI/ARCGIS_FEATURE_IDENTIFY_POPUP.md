# ArcGIS Feature Identification Popup - Implementation Research

## Overview
ArcGIS Pro uses the "Explore" tool (formerly "Identify" in ArcMap) to display feature attributes when users click on map features. This research documents the UI/UX patterns and information displayed.

## User Interaction Pattern

### Click Detection
1. **Mouse Click Event**: Capture left-click on map canvas
2. **Spatial Query**: Hit-test to find feature(s) at clicked location
3. **Tolerance**: Small buffer around click point (e.g., 5-10 pixels)
4. **Multiple Features**: If multiple features overlap, show all in list/tabs

### Popup Behavior
- **Immediate Display**: Popup appears instantly on click
- **Modal vs Modeless**: ArcGIS uses modeless popup (doesn't block interaction)
- **Positioning**: Near click location, avoiding screen edges
- **Close Action**: Click outside, press ESC, or click close button

## Information Displayed in Popup

### Header Section
```
┌─────────────────────────────────────────┐
│ 🗺️ Layer Name                      [×]  │
│ Feature 1 of 3                          │
├─────────────────────────────────────────┤
```
- **Layer Name**: Name of the layer containing the feature
- **Layer Icon**: Visual indicator of layer type
- **Feature Count**: "Feature X of Y" if multiple features found
- **Navigation**: Previous/Next arrows if multiple features
- **Close Button**: X button to dismiss popup

### Geometry Information Section
Displayed **before** attributes for spatial context:

**Point Features:**
- Geometry Type: Point
- Coordinates: X, Y (in current map CRS)
- Latitude/Longitude: If CRS is geographic
- Elevation: If Z-coordinate exists

**Line Features:**
- Geometry Type: LineString/MultiLineString
- Length: Calculated in map units
- Vertices Count: Number of points in line
- Start Point: X, Y coordinates
- End Point: X, Y coordinates

**Polygon Features:**
- Geometry Type: Polygon/MultiPolygon
- Area: Calculated in map units² (or hectares, acres)
- Perimeter: Calculated in map units
- Centroid: X, Y coordinates
- Vertices Count: Number of boundary points

### Attribute Fields Section
```
┌─────────────────────────────────────────┐
│ Field Name 1:        Value 1            │
│ Field Name 2:        Value 2            │
│ Field Name 3:        Value 3            │
│ ...                                     │
└─────────────────────────────────────────┘
```

**Display Format:**
- **Field Name**: Left-aligned, bold text
- **Field Value**: Right-aligned, regular text
- **Null Values**: Display as "(null)" or empty
- **Long Text**: Wrap or truncate with "..."
- **Hyperlinks**: Clickable if URL detected
- **Dates**: Format as MM/DD/YYYY or ISO 8601
- **Numbers**: Format with appropriate precision

**Field Order:**
1. FID/ObjectID (always first)
2. Primary identifier fields (name, id, etc.)
3. Alphabetical or schema order for remaining fields

### Action Buttons Section
```
┌─────────────────────────────────────────┐
│ [Zoom To] [Flash] [Select] [Edit]      │
└─────────────────────────────────────────┘
```

**Common Actions:**
- **Zoom To**: Zoom map to feature extent
- **Flash**: Briefly highlight feature on map
- **Select**: Add feature to selection set
- **Edit Attributes**: Open editable attribute form
- **Copy Attributes**: Copy to clipboard
- **Related Records**: View related tables

## UI Design Guidelines

### Popup Window Sizing
- **Width**: 300-400 pixels
- **Max Height**: 60% of viewport height
- **Scrollable**: Vertical scroll if content exceeds height
- **Resizable**: Optional drag handles for user adjustment

### Visual Styling
- **Background**: White or light gray (#F5F5F5)
- **Border**: 1px solid gray with drop shadow
- **Header**: Colored bar matching layer color or theme
- **Font**: Sans-serif (Arial, Segoe UI, Roboto)
- **Field Names**: Bold, 11-12pt
- **Field Values**: Regular, 11-12pt
- **Spacing**: 4-8px padding between rows

### Responsive Behavior
- **Small Screens**: Popup takes 80% of viewport
- **Large Screens**: Fixed size with scrolling
- **Touch Devices**: Larger tap targets (44x44px minimum)

## Multiple Features Handling

When click intersects multiple features:

### Option 1: Stacked Cards (ArcGIS Pro Style)
```
┌───────────────────────────────────┐
│ 📍 Roads (3 features)        [×] │
├───────────────────────────────────┤
│ ▼ Feature 1: Highway 101         │
│   Type: Highway                   │
│   Speed: 65 mph                   │
│                                   │
│ ▶ Feature 2: Main Street         │
│                                   │
│ ▶ Feature 3: Oak Avenue          │
└───────────────────────────────────┘
```

### Option 2: Tab View
```
┌───────────────────────────────────┐
│ [Roads] [Buildings] [Points]  [×]│
├───────────────────────────────────┤
│ Type: Highway                     │
│ Name: Highway 101                 │
│ Speed: 65 mph                     │
└───────────────────────────────────┘
```

### Option 3: Dropdown Selection
```
┌───────────────────────────────────┐
│ [▼ Highway 101 (Roads)       ] [×]│
│   • Main Street (Roads)           │
│   • Building 42 (Buildings)       │
├───────────────────────────────────┤
│ Type: Highway                     │
│ Name: Highway 101                 │
│ Speed: 65 mph                     │
└───────────────────────────────────┘
```

## Implementation Recommendations for ZEUS

### Phase 1: Basic Popup
1. ✅ Detect mouse click on MapWidget
2. ✅ Spatial query to find features at click point
3. ✅ Display popup dialog with:
   - Layer name
   - Feature ID
   - All attribute fields
   - Close button

### Phase 2: Enhanced Display
4. Add geometry information section
5. Format field values appropriately (dates, numbers)
6. Add "Zoom To" button
7. Add "Flash" button (briefly highlight feature)

### Phase 3: Multiple Features
8. Handle overlapping features
9. Add previous/next navigation
10. Show feature count (1 of N)

### Phase 4: Advanced Features
11. Copy attributes to clipboard
12. Edit attributes inline
13. Configurable popup content
14. Custom popup templates per layer

## Technical Implementation Notes

### Spatial Query (GDAL/OGR)
```cpp
// Convert screen coordinates to geographic coordinates
double lon, lat;
screenToGeo(clickX, clickY, lon, lat);

// Create point geometry at click location
OGRPoint clickPoint(lon, lat);

// Buffer by tolerance (e.g., 0.0001 degrees ≈ 10m at equator)
OGRGeometry* buffer = clickPoint.Buffer(tolerance);

// Spatial filter on layer
layer->SetSpatialFilter(buffer);

// Iterate through matching features
OGRFeature* feature;
while ((feature = layer->GetNextFeature()) != nullptr) {
    // Add to results
}
```

### Geometry Calculations
```cpp
// Area (for polygons)
double area = geometry->toPolygon()->get_Area();

// Length (for lines)
double length = geometry->toLineString()->get_Length();

// Centroid
OGRPoint centroid;
geometry->Centroid(&centroid);
double cx = centroid.getX();
double cy = centroid.getY();
```

### Field Type Formatting
```cpp
switch (fieldDefn->GetType()) {
    case OFTInteger:
    case OFTInteger64:
        value = QString::number(feature->GetFieldAsInteger(i));
        break;
    case OFTReal:
        value = QString::number(feature->GetFieldAsDouble(i), 'f', 4);
        break;
    case OFTDate:
    case OFTDateTime:
        // Format as readable date
        break;
    case OFTString:
        value = feature->GetFieldAsString(i);
        break;
}
```

## References
- ArcGIS Pro: Explore tool documentation
- ArcGIS Desktop: Identify features
- QGIS: Feature identification implementation
- GDAL/OGR: Spatial filter API
