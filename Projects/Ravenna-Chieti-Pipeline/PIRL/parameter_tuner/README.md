# PIRL Parameter Tuner

A standalone Qt dialog for interactively tuning PIRL training parameters and cost matrix values.

## Overview

The PIRL Parameter Tuner provides a GUI for modifying:

1. **PPO Reward Weights**: Progress multiplier, goal bonus, exploration bonus, constraint penalties
2. **Cost Matrix - Terrain**: Multipliers for flat, rolling, hilly, mountainous, steep terrain
3. **Cost Matrix - Land Cover**: Construction costs for ESA WorldCover classes (10-100)
4. **Cost Matrix - Infrastructure**: Crossing costs for roads, railways, powerlines, rivers
5. **Hydraulic Costs**: Compressor stations, velocity penalties, pressure drop penalties
6. **Constraint Thresholds**: Hard constraints like max slope, clearances, exclusion zones

## Building

The parameter tuner is built as part of the main AGRS project:

```bash
cd /opt/agrs
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make pirl_parameter_tuner
```

The executable is automatically copied to the project PIRL directory:
```
/opt/agrs/Projects/test_project2/PIRL/pirl_parameter_tuner
```

## Running

### Option 1: From Project Directory

```bash
cd /opt/agrs/Projects/test_project2/PIRL
./pirl_parameter_tuner
```

### Option 2: From Anywhere (with path argument)

```bash
/opt/agrs/Projects/test_project2/PIRL/pirl_parameter_tuner /opt/agrs/Projects/test_project2
```

## Usage Workflow

1. **Launch Dialog**: Run the executable from the project PIRL directory
2. **Review Current Values**: All tabs display current parameters (defaults or previously overridden)
3. **Modify Parameters**: 
   - Adjust any spinbox values
   - See live preview of reward calculations
   - Terrain example costs update automatically
4. **Validate**: Click "Validate Parameters" to check for issues
5. **Export**: Click "Export to JSON" to save changes
6. **Train**: Run training - parameters are automatically loaded

## Output File

Parameters are exported to:
```
/opt/agrs/Projects/test_project2/PIRL/pirl_parameter_overrides.json
```

This file is automatically loaded by the training environment on the next run.

## Automatic Loading

When you run training:

```bash
cd /opt/agrs/Projects/test_project2/PIRL
python train_pirl_direct.py
```

The C++ environment automatically:
1. Checks for `pirl_parameter_overrides.json`
2. Loads and applies all overrides
3. Logs which parameters were overridden
4. Trains with your custom parameters

Example output:
```
⚙️  Loading parameter overrides from: /opt/agrs/Projects/test_project2/PIRL/pirl_parameter_overrides.json
✅ Parameter overrides applied successfully
   Progress multiplier: 2.0 → 3.5 (OVERRIDDEN)
   Goal bonus: 10000.0 → 15000.0 (OVERRIDDEN)
   ...
```

## Parameter Guidelines

### PPO Rewards

- **Progress Multiplier (0.1 - 10.0)**: Controls how strongly the agent seeks the goal
  - Too low (< 0.5): Agent may not progress effectively
  - Too high (> 5.0): Agent may ignore costs and constraints
  - Default: 2.0 (balanced)

- **Goal Bonus (1000 - 50000)**: Large reward for reaching goal
  - Should be >> single step cost penalties
  - Default: 10000.0

- **Exploration Bonus (10 - 1000)**: Reward for reaching new milestones
  - Encourages exploring toward goal
  - Default: 100.0

- **Constraint Penalties**: Should be strong enough to prevent violations but not so strong they paralyze exploration
  - Termination penalties (sea, built-up): -10000 (very strong)
  - Clearance penalties (powerline, railway): -500 (moderate)

### Cost Matrix

- **Terrain Multipliers**: Based on construction difficulty
  - Flat: 1.0 (baseline)
  - Rolling: 1.3 (30% more difficult)
  - Hilly: 1.8 (80% more difficult)
  - Mountainous: 3.0 (3× baseline)
  - Steep: 5.0 (5× baseline)

- **Land Cover Costs**: Reflects clearing, compensation, and crossing costs
  - Grassland: $100/m (minimal clearing)
  - Tree cover: $150/m (forest clearing)
  - Cropland: $200/m (compensation)
  - Water bodies: $3500/m (crossing infrastructure)

- **Infrastructure Crossings**: One-time costs
  - Roads: $25k-50k (open cut)
  - Railways: $250k (HDD required)
  - Powerlines: $150k (HDD for safety)
  - Rivers: $80k-500k (depends on size)

### Hydraulic Costs

- **Compressor Stations**: ~$1M base + $5k/kW
- **Velocity Penalties**: 
  - Erosion (>15 m/s): $150/m for protective coatings
  - Dropout (<3 m/s): $75/m for enhanced drainage
- **Excessive Pressure Drop**: $10k per bar over 5 bar/segment

### Constraint Thresholds

- **Max Slope**: 20% (industry standard for gas pipelines)
- **Min Delivery Pressure**: 45 bar (project requirement)
- **Clearances**: Safety regulations
  - Powerlines: 6m minimum
  - Railways: 10m minimum
- **Sea Exclusion**: 1000m (prevents offshore routing)

## Validation

The "Validate Parameters" button checks for:

- Reward balance (goal-seeking vs constraint avoidance)
- Logical consistency (min < max for pressures, thresholds < clearances)
- Reasonable ranges (warns if values are extreme)

## Reward Balance

The preview shows expected rewards for a typical 62km route:

**Healthy Balance:**
```
Total Positive Rewards: +140,000
Single Termination Penalty: -10,000
Ratio: 14:1 (goal-seeking dominates)
```

If constraints are too strong relative to goal rewards, the agent will be too cautious to explore.

## Tips for Experimentation

1. **Start Conservative**: Make small adjustments (10-20%) to see effects
2. **A/B Testing**: Save different configurations with descriptive timestamps
3. **Monitor Training**: Watch for changes in success rate and route quality
4. **Cost Validation**: Ensure route costs match real-world expectations

## File Structure

```
parameter_tuner/
├── main.cpp                           # Application entry point
├── PIRLParameterTuningDialog.h        # Dialog class definition
├── PIRLParameterTuningDialog.cpp      # Dialog implementation
├── CMakeLists.txt                     # Build configuration
├── pirl_parameters_default.json       # Default values (extracted from C++)
└── README.md                          # This file
```

## Future Enhancements

- Preset configurations (Conservative, Aggressive, Balanced)
- Parameter history and comparison tool
- A/B testing framework
- Visual reward heatmaps
- Export to different formats (YAML, CSV)

## Support

For issues or questions:
- Check `/opt/agrs/docs/HYDRAULICS_MODULE_IMPLEMENTATION_PLAN.md` for detailed parameter descriptions
- Review training logs for parameter application confirmation
- Validate parameters before long training runs














