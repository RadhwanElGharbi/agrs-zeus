# Termination Coordinate Monitoring

**Date**: November 17, 2025  
**Status**: ✅ **IMPLEMENTED**

## What Was Added

Enhanced termination logging to show **exact coordinates** where the agent stops, for both successful and failed episodes.

## Termination Output Examples

### Success 🎉
```
🎉 SUCCESS: Goal reached @ (408381, 4750127)
```

### Out of Bounds 🚫
```
🚫 FAILURE: Out of bounds @ (362050, 4780234)
```

### Catastrophic Slope ⛰️
```
⛰️  FAILURE: Catastrophic slope (>50% - physically impossible for pipeline) @ (385420, 4795678) [slope=68%]
```

### Sea Proximity 🌊
```
🌊 FAILURE: Too close to sea (850m < 1000m exclusion zone) @ (370125, 4755890)
```

### Max Steps ⏱️
```
⏱️  FAILURE: Max steps exceeded @ (395670, 4770456)
```

### No-Go Zone 🚫
```
🚫 FAILURE: No-go zone violation @ (380125, 4802345)
```

## Coordinates Format

- **UTM Zone 33N** (EPSG:32633)
- Format: `(Easting, Northing)` in meters
- Rounded to nearest meter for readability
- Includes additional context where relevant (slope %, sea distance, etc.)

## Where to Find This Information

1. **Console Output**: Printed directly to stdout/stderr during training
2. **Training Log**: Captured in `training_TIMESTAMP.log` via `tee` command
3. **Python Logging**: Also logged via Python's logging system

## Usage in Monitoring

When monitoring training, you'll see:
```bash
# Episode starts
🔄 Environment reset. Initial distance to goal: 61967.1m

# Agent explores...
# (Many steps)

# Episode terminates
🚫 FAILURE: Out of bounds @ (362050, 4780234)
```

You can then:
1. **Copy the coordinates** and paste into ArcGIS/QGIS
2. **Add as point geometry** to visualize termination locations
3. **Analyze patterns** - where does the agent commonly fail?
4. **Compare to constraints** - is it hitting sea boundary, protected areas, etc.?

## Files Modified

- `/opt/agrs/src/pirl/PIRL_Environment.cpp` - `check_termination()` function

## Implementation Details

Added a lambda function `format_coords()` that:
- Converts double coordinates to integers (meter precision)
- Formats as `@ (x, y)` string
- Appends to existing termination reason strings
- Outputs to stdout with emoji indicators for visibility

---

**Status**: ✅ **PRODUCTION READY**  
**Performance Impact**: Negligible (only on termination, not per-step)

