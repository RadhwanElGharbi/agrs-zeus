# Parameter Tuner Enhancement Implementation Plan

## Current Status
✅ Training validation complete - all systems working
✅ Header file updated with new UI element declarations
⏳ Implementation file needs comprehensive enhancements

## Required Enhancements

### Tab 2: Terrain Cost Model (ENHANCED)

**New Controls to Add:**
1. **Currency Selector** (QComboBox)
   - Options: USD, EUR, CAD, GBP, AUD, JPY
   - Default: USD
   - Position: Top of tab

2. **Base Terrain Cost** (QDoubleSpinBox) - Already exists as `m_terrainBaseCost`
   - Range: 50-500 $/m
   - Default: 100 $/m

3. **Slope Cost Factors** (QGroupBox with 2 spinboxes)
   - Linear Factor: 0.01-0.5 (default: 0.05)
   - Quadratic Factor: 0.001-0.01 (default: 0.002)
   - Formula display: `cost_multiplier = 1.0 + linear*slope + quadratic*slope²`

4. **Dynamic Slope Range Table** (QTableWidget) - FUTURE ENHANCEMENT
   - Columns: Min Slope %, Max Slope %, Multiplier
   - Add/Remove row buttons
   - Default ranges: 0-5% (1.0x), 5-15% (1.3x), 15-25% (1.8x), etc.

5. **Soil Factor Range** (QGroupBox with 2 spinboxes)
   - Min Factor: 1.0 (excellent soil)
   - Max Factor: 1.0-5.0 (default: 2.0, poor soil)

6. **Geohazard Factor Range** (QGroupBox with 2 spinboxes)
   - Min Factor: 1.0 (no risk)
   - Max Factor: 1.0-5.0 (default: 2.5, high risk)

**Modified Layout:**
```
[Currency: USD ▼]
[Base Terrain Cost: 100 $/m]

Slope Cost Factors
├─ Linear Factor: 0.05
├─ Quadratic Factor: 0.002
└─ Formula: 1.0 + 0.05*slope + 0.002*slope²

Soil Bearing Capacity Multipliers
├─ Excellent Soil (1.0): 1.0x
└─ Poor Soil (0.0): 2.0x

Geohazard Risk Multipliers
├─ No Risk (0.0): 1.0x
└─ High Risk (1.0): 2.5x

[Existing terrain multipliers table...]
```

### Tab 3: Land Cover (ENHANCED - Now Multipliers)

**Changes:**
1. Replace "Cost ($/m)" column with "Multiplier"
2. Add reference label: "Base Cost: $100/m (from Terrain tab)"
3. Calculate actual cost = base_cost * multiplier
4. Update all spinbox ranges to 0.5-50.0 (multipliers, not absolute)

**Modified Table:**
```
Base Reference Cost: $100/m

ESA Class | Name              | Multiplier | Actual Cost
----------|-------------------|------------|------------
10        | Tree Cover        | 1.5x       | $150/m
20        | Shrubland         | 1.2x       | $120/m
30        | Grassland         | 1.0x       | $100/m (baseline)
40        | Cropland          | 2.0x       | $200/m
50        | Built-up          | 3.0x       | $300/m
80        | Water Bodies      | 35.0x      | $3,500/m
...
```

### Tab 4: Infrastructure Crossings (ENHANCED - Component-based)

**Complete Restructure:**
Replace single "crossing cost" values with 4-component breakdown for each type.

**New Layout:**
```
Road Crossings (HDD)
├─ Base Cost (mobilization): $5,000
├─ Drilling Cost per meter: $150/m
├─ Installation Cost per meter: $80/m
└─ Drill Length Multiplier: 1.4x

Waterway Crossings (HDD)
├─ Base Cost (environmental): $8,000
├─ Drilling Cost per meter: $200/m
├─ Installation Cost per meter: $100/m
└─ Drill Length Multiplier: 1.6x

Railway Crossings (HDD)
├─ Base Cost (permitting): $15,000
├─ Drilling Cost per meter: $250/m
├─ Installation Cost per meter: $120/m
└─ Drill Length Multiplier: 1.8x

Powerline Crossings (HDD)
├─ Base Cost (coordination): $10,000
├─ Drilling Cost per meter: $180/m
├─ Installation Cost per meter: $90/m
└─ Drill Length Multiplier: 1.5x
```

**Formula Display (for each type):**
```
Total Cost = base + (width * multiplier * (drilling + installation))
Example for 10m road: $5,000 + (10 * 1.4 * ($150 + $80)) = $8,220
```

## Implementation Steps

### Step 1: Update setupTerrainTab()
- Add currency selector at top
- Keep existing base terrain cost
- Add "Slope Factors" QGroupBox with linear/quadratic spinboxes
- Add "Soil Factors" QGroupBox with min/max spinboxes
- Add "Geohazard Factors" QGroupBox with min/max spinboxes
- Keep existing terrain multipliers table

### Step 2: Update setupLandcoverTab()
- Add base cost reference label (reads from terrain tab)
- Change table column from "Cost" to "Multiplier"
- Update all spinbox ranges to 0.5-50.0
- Add dynamic "Actual Cost" column (calculated)
- Update onParameterChanged() to recalculate when terrain base changes

### Step 3: Update setupInfrastructureTab()
- Remove old single-cost table
- Create 4 QGroupBox widgets (Road, Waterway, Railway, Powerline)
- Each group has 4 spinboxes: base, drilling/m, installation/m, multiplier
- Add formula display label for each group
- Show example calculation

### Step 4: Update buildParametersJSON()
- Export currency field
- Export slope_linear, slope_quadratic
- Export soil_factor_range [min, max]
- Export geohazard_factor_range [min, max]
- Export landcover_multipliers (not absolute costs)
- Export crossing_costs with 4 components per type

### Step 5: Update loadCurrentParameters()
- Read currency (default USD)
- Read slope factors (defaults)
- Read soil/geohazard ranges
- Read landcover multipliers
- Read crossing cost components

## Testing Plan

1. Open parameter tuner
2. Verify all new controls appear
3. Modify currency → verify no impact on calculations
4. Modify base terrain cost → verify landcover actual costs update
5. Modify slope factors → verify they export correctly
6. Modify landcover multipliers → verify actual costs calculate
7. Modify crossing components → verify formula displays correct total
8. Export to JSON → verify structure matches pirl_parameter_overrides.json format
9. Load exported JSON → verify all values populate correctly

## Files to Modify

- [x] PIRLParameterTuningDialog.h (header - DONE)
- [ ] PIRLParameterTuningDialog.cpp (implementation - IN PROGRESS)
- [ ] pirl_parameters_default.json (add new fields)

## Decision Required

Given the complexity of modifying the large .cpp file (946 lines), would you prefer:

**Option A:** I create a complete new version of the three key functions (setupTerrainTab, setupLandcoverTab, setupInfrastructureTab) as separate files you can review

**Option B:** I systematically search-replace each section (will take many iterations)

**Option C:** I provide you with the code sections to manually integrate

Which approach do you prefer?

