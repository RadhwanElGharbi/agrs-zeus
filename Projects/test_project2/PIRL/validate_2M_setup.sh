#!/bin/bash
# Comprehensive validation suite for 2M production training

set -e

echo "=========================================="
echo "2M PRODUCTION TRAINING - VALIDATION SUITE"
echo "=========================================="
echo ""

FAILED=0

# Change to PIRL directory
cd /opt/agrs/Projects/test_project2/PIRL

# Check 1: C++ module
echo "1. Checking C++ module compilation..."
if [ ! -f "/opt/agrs/build/pirl_native.cpython-312-x86_64-linux-gnu.so" ]; then
    echo "   ❌ FAIL: pirl_native module not found"
    FAILED=$((FAILED + 1))
else
    LAST_MODIFIED=$(stat -c %Y /opt/agrs/build/pirl_native.cpython-312-x86_64-linux-gnu.so)
    CURRENT_TIME=$(date +%s)
    AGE=$((CURRENT_TIME - LAST_MODIFIED))
    if [ $AGE -gt 3600 ]; then
        echo "   ⚠️  WARNING: Module is >1 hour old. Rebuild recommended."
    else
        echo "   ✅ PASS: Module up to date"
    fi
fi
echo ""

# Check 2: Parameter overrides
echo "2. Checking parameter overrides..."
if [ ! -f "pirl_parameter_overrides.json" ]; then
    echo "   ❌ FAIL: pirl_parameter_overrides.json not found"
    FAILED=$((FAILED + 1))
else
    python3 -c "import json; json.load(open('pirl_parameter_overrides.json'))" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "   ❌ FAIL: Invalid JSON structure"
        FAILED=$((FAILED + 1))
    else
        echo "   ✅ PASS: Override file valid"
    fi
fi
echo ""

# Check 3: Training config
echo "3. Checking training config..."
if [ ! -f "pirl_training_config_2M_production.yaml" ]; then
    echo "   ❌ FAIL: Config file not found"
    FAILED=$((FAILED + 1))
else
    echo "   ✅ PASS: Config file exists"
fi
echo ""

# Check 4: Run unit tests
echo "4. Running unit tests..."
echo ""

echo "  4a. Crossing cost tests..."
python3 tests/test_crossing_costs.py
if [ $? -ne 0 ]; then
    FAILED=$((FAILED + 1))
fi
echo ""

echo "  4b. Built-up distance tests..."
python3 tests/test_buildup_distance.py
if [ $? -ne 0 ]; then
    FAILED=$((FAILED + 1))
fi
echo ""

echo "  4c. Parameter override tests..."
python3 tests/test_parameter_overrides.py
if [ $? -ne 0 ]; then
    FAILED=$((FAILED + 1))
fi
echo ""

# Check 5: Integration tests
echo "5. Running integration tests..."
echo ""

echo "  5a. End-to-end training test..."
python3 tests/test_training_e2e.py
if [ $? -ne 0 ]; then
    FAILED=$((FAILED + 1))
fi
echo ""

# Check 6: Performance benchmarks
echo "6. Running performance benchmarks..."
echo ""

echo "  6a. FPS benchmark (100 steps)..."
python3 << 'EOF'
import sys
import time
sys.path.append('/opt/agrs/python/pirl_training')
from pirl_native_env import PIRLNativeEnvironment
import os

os.chdir('/opt/agrs/Projects/test_project2/PIRL')
env = PIRLNativeEnvironment("pirl_training_config_2M_production.yaml")
obs, info = env.reset()

start = time.time()
for i in range(100):
    action = env.action_space.sample()
    obs, reward, terminated, truncated, info = env.step(action)
    if terminated or truncated:
        obs, info = env.reset()
end = time.time()

fps = 100 / (end - start)
print(f"  FPS: {fps:.2f}")
print(f"  Expected: >10 FPS for CPU, >50 FPS for GPU")
if fps > 10:
    print(f"  ✅ PASS: Performance acceptable")
else:
    print(f"  ⚠️  WARNING: Performance below target")
EOF
echo ""

# Summary
echo "=========================================="
if [ $FAILED -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED"
    echo "=========================================="
    echo ""
    echo "System is ready for 2M production training!"
    echo ""
    echo "To start training:"
    echo "  GPU: ./train_2M_production_gpu.sh"
    echo "  CPU: ./train_2M_production_cpu.sh"
    echo ""
    echo "To monitor:"
    echo "  ./monitor_2M_training.sh [cpu|gpu]"
    exit 0
else
    echo "❌ $FAILED CHECKS FAILED"
    echo "=========================================="
    echo ""
    echo "Please fix the issues above before starting training."
    exit 1
fi

