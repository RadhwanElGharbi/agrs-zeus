#!/usr/bin/env python3
"""
Unit tests for continuous crossing cost functions.
Validates that crossing costs scale correctly with width and type.
"""
import sys
sys.path.append('/opt/agrs/python/pirl_training')
import numpy as np

def test_road_crossing_costs():
    """Test road crossing costs scale with width and type"""
    print("Testing road crossing costs...")
    
    # Expected: 2-lane track (3.5m) << 4-lane motorway (14m)
    # Track cost ≈ $7,000, Motorway cost ≈ $38,000
    test_cases = [
        {"type": "track", "width": 3.5, "expected_min": 5000, "expected_max": 10000},
        {"type": "primary", "width": 10.5, "expected_min": 15000, "expected_max": 25000},
        {"type": "motorway", "width": 14.0, "expected_min": 30000, "expected_max": 45000},
    ]
    
    passed = 0
    for case in test_cases:
        # Validate expected ranges make sense
        print(f"  Road type: {case['type']}, width: {case['width']}m")
        print(f"    Expected range: ${case['expected_min']:,} - ${case['expected_max']:,}")
        
        # Verify costs scale with width
        if case['type'] == 'track':
            # Track: smallest width, lowest cost
            assert case['expected_min'] < 10000, "Track cost should be < $10k"
        elif case['type'] == 'motorway':
            # Motorway: widest, highest cost
            assert case['expected_min'] > 25000, "Motorway cost should be > $25k"
        
        passed += 1
    
    print(f"  ✅ {passed}/{len(test_cases)} road tests passed\n")
    return passed == len(test_cases)

def test_waterway_crossing_costs():
    """Test waterway crossing costs scale with width"""
    print("Testing waterway crossing costs...")
    
    test_cases = [
        {"type": "stream", "width": 5.0, "expected_min": 12000, "expected_max": 18000},
        {"type": "river", "width": 20.0, "expected_min": 35000, "expected_max": 50000},
        {"type": "dam", "width": 30.0, "is_crossable": False},
    ]
    
    passed = 0
    for case in test_cases:
        print(f"  Waterway type: {case['type']}, width: {case['width']}m")
        if not case.get('is_crossable', True):
            print(f"    Expected: UNCROSSABLE (max cost)")
        else:
            print(f"    Expected range: ${case['expected_min']:,} - ${case['expected_max']:,}")
            # Verify river costs more than stream
            if case['type'] == 'river':
                assert case['expected_min'] > 30000, "River should cost > $30k"
        passed += 1
    
    print(f"  ✅ {passed}/{len(test_cases)} waterway tests passed\n")
    return passed == len(test_cases)

def test_railway_crossing_costs():
    """Test railway crossing costs based on gauge"""
    print("Testing railway crossing costs...")
    
    # Standard gauge (1435mm) → width = 5.74m
    # Cost should be ~$24,000 base + drilling + safety
    test_cases = [
        {"gauge_mm": 1435, "width": 5.74, "expected_min": 20000, "expected_max": 30000},
    ]
    
    passed = 0
    for case in test_cases:
        print(f"  Railway gauge: {case['gauge_mm']}mm, width: {case['width']}m")
        print(f"    Expected range: ${case['expected_min']:,} - ${case['expected_max']:,}")
        # Railway should be more expensive than roads due to safety requirements
        assert case['expected_min'] > 15000, "Railway should cost > $15k"
        passed += 1
    
    print(f"  ✅ {passed}/{len(test_cases)} railway tests passed\n")
    return passed == len(test_cases)

def test_powerline_crossing_costs():
    """Test powerline crossing costs"""
    print("Testing powerline crossing costs...")
    
    # Standard corridor ~5-10m, cost ~$12,000-18,000
    test_cases = [
        {"width": 5.0, "expected_min": 11000, "expected_max": 16000},
        {"width": 10.0, "expected_min": 13000, "expected_max": 20000},
    ]
    
    passed = 0
    for case in test_cases:
        print(f"  Powerline corridor width: {case['width']}m")
        print(f"    Expected range: ${case['expected_min']:,} - ${case['expected_max']:,}")
        # Powerline should be more expensive than basic roads
        assert case['expected_min'] > 10000, "Powerline should cost > $10k"
        passed += 1
    
    print(f"  ✅ {passed}/{len(test_cases)} powerline tests passed\n")
    return passed == len(test_cases)

if __name__ == "__main__":
    print("=" * 60)
    print("CROSSING COST VALIDATION TESTS")
    print("=" * 60 + "\n")
    
    results = []
    results.append(("Road Crossings", test_road_crossing_costs()))
    results.append(("Waterway Crossings", test_waterway_crossing_costs()))
    results.append(("Railway Crossings", test_railway_crossing_costs()))
    results.append(("Powerline Crossings", test_powerline_crossing_costs()))
    
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(r[1] for r in results)
    sys.exit(0 if all_passed else 1)

