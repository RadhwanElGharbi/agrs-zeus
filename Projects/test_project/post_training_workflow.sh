#!/bin/bash
################################################################################
# PIRL Post-Training Workflow
# Comprehensive validation, route generation, and analysis pipeline
################################################################################

set -e  # Exit on error

PROJECT_DIR="/opt/agrs/Projects/test_project"
cd "$PROJECT_DIR"

# Activate virtual environment
source /opt/agrs/python/pirl_venv/bin/activate
export PYTHONPATH="/opt/agrs/python/pirl_training:$PYTHONPATH"
export PATH="/opt/agrs/build:$PATH"

echo "================================================================================"
echo "PIRL POST-TRAINING WORKFLOW"
echo "================================================================================"
echo "Started at: $(date)"
echo ""

# Check if training completed successfully
echo "📋 Step 1: Checking Training Status..."
if [ ! -f "models/pirl_italy_v1_final.zip" ]; then
    echo "❌ ERROR: Training not complete. Model file not found!"
    echo "   Expected: models/pirl_italy_v1_final.zip"
    exit 1
fi
echo "✅ Training completed successfully!"
echo ""

# Verify model files
echo "📋 Step 2: Verifying Model Files..."
MODEL_SIZE=$(du -h models/pirl_italy_v1_final.zip | cut -f1)
echo "   Model file size: $MODEL_SIZE"

if [ -f "models/pirl_italy_v1_final_vecnormalize.pkl" ]; then
    echo "   ✅ VecNormalize stats found"
else
    echo "   ⚠️  VecNormalize stats not found (may affect route generation)"
fi

if [ -f "models/best_model/best_model.zip" ]; then
    BEST_SIZE=$(du -h models/best_model/best_model.zip | cut -f1)
    echo "   ✅ Best model checkpoint found ($BEST_SIZE)"
else
    echo "   ⚠️  No best model checkpoint found"
fi
echo ""

# Generate training summary
echo "📋 Step 3: Generating Training Summary..."
python3 - << 'PYTHON_SCRIPT'
import json
from pathlib import Path

log_file = Path("outputs/pirl_training/training_fixed.log")
if log_file.exists():
    with open(log_file, 'r') as f:
        lines = f.readlines()
    
    # Extract key metrics from last lines
    print("   Final Training Metrics:")
    for line in lines[-30:]:
        if "total_timesteps" in line and "|" in line:
            print(f"   {line.strip()}")
        elif "mean_reward" in line and "|" in line:
            print(f"   {line.strip()}")
        elif "explained_variance" in line and "|" in line:
            print(f"   {line.strip()}")
else:
    print("   ⚠️  Training log not found")
PYTHON_SCRIPT
echo ""

# Validate and export routes
echo "📋 Step 4: Generating Optimal Routes..."
echo "   This will test the model on the Italy AOI and generate detailed vector outputs"
echo ""
python3 validate_and_export_routes.py 2>&1 | tee outputs/validation/validation_run_$(date +%Y%m%d_%H%M%S).log
echo ""

# Generate cost analysis
echo "📋 Step 5: Performing Cost Analysis..."
if [ -f "outputs/validation/route_optimal.geojson" ]; then
    python3 - << 'PYTHON_COST_ANALYSIS'
import json
import geopandas as gpd
from pathlib import Path

route_file = Path("outputs/validation/route_optimal.geojson")
gdf = gpd.read_file(route_file)

print("\n   Route Statistics:")
print(f"   Total Segments: {len(gdf)}")
print(f"   Total Length: {gdf.geometry.length.sum() / 1000:.2f} km")

if 'segment_cost' in gdf.columns:
    total_cost = gdf['segment_cost'].sum()
    print(f"   Total Cost: ${total_cost:,.2f}")
    print(f"   Avg Cost/km: ${total_cost / (gdf.geometry.length.sum() / 1000):,.2f}")

if 'terrain_cost' in gdf.columns:
    print(f"\n   Cost Breakdown:")
    print(f"   - Terrain: ${gdf['terrain_cost'].sum():,.2f}")
    if 'crossing_cost' in gdf.columns:
        print(f"   - Crossings: ${gdf['crossing_cost'].sum():,.2f}")
    if 'environmental_cost' in gdf.columns:
        print(f"   - Environmental: ${gdf['environmental_cost'].sum():,.2f}")
PYTHON_COST_ANALYSIS
else
    echo "   ⚠️  Route file not found, skipping cost analysis"
fi
echo ""

# Check compliance with SAIPEM criteria
echo "📋 Step 6: Checking SAIPEM Compliance..."
if [ -f "outputs/validation/route_optimal.geojson" ]; then
    python3 - << 'PYTHON_COMPLIANCE'
import geopandas as gpd
from pathlib import Path

route_file = Path("outputs/validation/route_optimal.geojson")
gdf = gpd.read_file(route_file)

violations = []
if 'slope_deg' in gdf.columns:
    max_slope = gdf['slope_deg'].max()
    print(f"   Max Slope: {max_slope:.1f}° (limit: 30°)")
    if max_slope > 30:
        violations.append(f"Slope exceeds 30° ({max_slope:.1f}°)")

if 'no_go_violation' in gdf.columns:
    no_go_count = (gdf['no_go_violation'] == True).sum()
    print(f"   No-Go Zone Violations: {no_go_count} segments")
    if no_go_count > 0:
        violations.append(f"{no_go_count} segments in no-go zones")

if len(violations) == 0:
    print("\n   ✅ All SAIPEM criteria satisfied!")
else:
    print("\n   ⚠️  Violations detected:")
    for v in violations:
        print(f"      - {v}")
PYTHON_COMPLIANCE
else
    echo "   ⚠️  Route file not found, skipping compliance check"
fi
echo ""

# Generate comparison with baseline
echo "📋 Step 7: Comparing with Baseline Route..."
if [ -f "outputs/validation/route_optimal.geojson" ] && [ -f "outputs/validation/baseline_route.geojson" ]; then
    python3 - << 'PYTHON_COMPARISON'
import geopandas as gpd
from pathlib import Path

optimal = gpd.read_file("outputs/validation/route_optimal.geojson")
baseline = gpd.read_file("outputs/validation/baseline_route.geojson")

opt_length = optimal.geometry.length.sum() / 1000
base_length = baseline.geometry.length.sum() / 1000

print(f"   Optimal Route: {opt_length:.2f} km")
print(f"   Baseline Route: {base_length:.2f} km")
print(f"   Difference: {(opt_length - base_length):.2f} km ({((opt_length/base_length - 1)*100):.1f}%)")

if 'segment_cost' in optimal.columns and 'segment_cost' in baseline.columns:
    opt_cost = optimal['segment_cost'].sum()
    base_cost = baseline['segment_cost'].sum()
    savings = base_cost - opt_cost
    savings_pct = (savings / base_cost) * 100
    
    print(f"\n   Optimal Cost: ${opt_cost:,.2f}")
    print(f"   Baseline Cost: ${base_cost:,.2f}")
    print(f"   💰 Savings: ${savings:,.2f} ({savings_pct:.1f}%)")
PYTHON_COMPARISON
else
    echo "   ℹ️  Baseline route not available for comparison"
fi
echo ""

# Create summary report
echo "📋 Step 8: Creating Summary Report..."
REPORT_FILE="outputs/validation/POST_TRAINING_SUMMARY_$(date +%Y%m%d_%H%M%S).md"
cat > "$REPORT_FILE" << 'REPORT_HEADER'
# PIRL Post-Training Summary

## Training Completion
REPORT_HEADER

echo "- Completion Date: $(date)" >> "$REPORT_FILE"
echo "- Model Location: \`models/pirl_italy_v1_final.zip\`" >> "$REPORT_FILE"
echo "- Total Timesteps: 500,000" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "## Generated Outputs" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
ls -lh outputs/validation/*.geojson 2>/dev/null | awk '{print "- `" $9 "` (" $5 ")"}' >> "$REPORT_FILE" || echo "- No GeoJSON files generated" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "✅ Summary report created: $REPORT_FILE"
echo ""

# List all generated files
echo "📋 Step 9: Generated Output Files..."
echo "   Route Files:"
find outputs/validation -name "*.geojson" -type f -exec ls -lh {} \; 2>/dev/null | awk '{print "      " $9 " (" $5 ")"}'
echo ""
echo "   Reports:"
find outputs/validation -name "*.md" -o -name "*.txt" -type f -exec ls -lh {} \; 2>/dev/null | awk '{print "      " $9 " (" $5 ")"}'
echo ""

# Final summary
echo "================================================================================"
echo "✅ POST-TRAINING WORKFLOW COMPLETE"
echo "================================================================================"
echo "Completed at: $(date)"
echo ""
echo "Next Steps:"
echo "  1. Review generated routes in QGIS/ArcGIS"
echo "  2. Examine cost analysis and compliance reports"
echo "  3. Begin GUI integration for route visualization"
echo "  4. Prepare for deployment/demo"
echo ""
echo "Generated Files Location: $PROJECT_DIR/outputs/validation/"
echo "================================================================================"



