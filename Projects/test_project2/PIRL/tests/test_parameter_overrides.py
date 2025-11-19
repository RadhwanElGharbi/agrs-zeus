#!/usr/bin/env python3
"""
Test that parameter overrides load correctly from JSON.
"""
import sys
import json
import os
sys.path.append('/opt/agrs/python/pirl_training')

def test_override_file_structure():
    """Validate override file has correct structure"""
    print("Test 1: Override file structure validation")
    
    override_path = '/opt/agrs/Projects/test_project2/PIRL/pirl_parameter_overrides.json'
    
    if not os.path.exists(override_path):
        print(f"  ❌ FAIL: Override file not found at {override_path}")
        return False
    
    with open(override_path, 'r') as f:
        overrides = json.load(f)
    
    # Check required top-level sections
    required_sections = ['ppo_rewards', 'cost_model']
    for section in required_sections:
        if section not in overrides:
            print(f"  ❌ FAIL: Missing section '{section}'")
            return False
        print(f"  ✅ Found section: {section}")
    
    # Check ppo_rewards fields
    required_ppo = ['progress_multiplier', 'cost_normalization_factor', 'goal_bonus', 'exploration_bonus']
    for field in required_ppo:
        if field not in overrides['ppo_rewards']:
            print(f"  ❌ FAIL: Missing ppo_rewards.{field}")
            return False
    print(f"  ✅ All PPO reward fields present")
    
    # Check cost_model fields
    if 'crossing_costs' not in overrides['cost_model']:
        print(f"  ❌ FAIL: Missing cost_model.crossing_costs")
        return False
    
    crossing_types = ['road', 'waterway', 'railway', 'powerline']
    for ctype in crossing_types:
        if ctype not in overrides['cost_model']['crossing_costs']:
            print(f"  ❌ FAIL: Missing crossing_costs.{ctype}")
            return False
        
        required_fields = ['base_cost', 'drilling_cost_per_m', 'installation_cost_per_m', 'drill_length_multiplier']
        for field in required_fields:
            if field not in overrides['cost_model']['crossing_costs'][ctype]:
                print(f"  ❌ FAIL: Missing crossing_costs.{ctype}.{field}")
                return False
    
    print(f"  ✅ All crossing cost fields present")
    print("  ✅ PASS: All required fields present\n")
    return True

def test_parameter_loading():
    """Test that environment loads parameters correctly"""
    print("Test 2: Parameter loading in environment")
    
    try:
        from pirl_native_env import PIRLNativeEnvironment
        
        # Change to project PIRL directory for relative path resolution
        os.chdir('/opt/agrs/Projects/test_project2/PIRL')
        
        env = PIRLNativeEnvironment("pirl_training_config_2M_production.yaml")
        print("  ✅ PASS: Environment initialized with overrides\n")
        return True
    except Exception as e:
        print(f"  ❌ FAIL: {e}\n")
        return False

def test_parameter_values():
    """Test that loaded values match expected ranges"""
    print("Test 3: Parameter value validation")
    
    override_path = '/opt/agrs/Projects/test_project2/PIRL/pirl_parameter_overrides.json'
    with open(override_path, 'r') as f:
        overrides = json.load(f)
    
    # Validate reasonable ranges
    checks = [
        (overrides['ppo_rewards']['progress_multiplier'] > 0, "progress_multiplier > 0"),
        (overrides['ppo_rewards']['goal_bonus'] > 0, "goal_bonus > 0"),
        (overrides['ppo_rewards']['cost_normalization_factor'] > 0, "cost_normalization > 0"),
        (overrides['cost_model']['crossing_costs']['road']['base_cost'] > 0, "road base_cost > 0"),
        (overrides['cost_model']['crossing_costs']['road']['drill_length_multiplier'] >= 1.0, "drill multiplier >= 1.0"),
        (overrides['cost_model']['crossing_costs']['waterway']['base_cost'] > overrides['cost_model']['crossing_costs']['road']['base_cost'], "waterway more expensive than road"),
        (overrides['cost_model']['crossing_costs']['railway']['base_cost'] > overrides['cost_model']['crossing_costs']['waterway']['base_cost'], "railway most expensive"),
    ]
    
    all_passed = True
    for check, desc in checks:
        if check:
            print(f"  ✅ {desc}")
        else:
            print(f"  ❌ {desc}")
            all_passed = False
    
    print(f"  {'✅ PASS' if all_passed else '❌ FAIL'}: Value validation\n")
    return all_passed

if __name__ == "__main__":
    print("=" * 60)
    print("PARAMETER OVERRIDE LOADING TESTS")
    print("=" * 60 + "\n")
    
    results = []
    results.append(test_override_file_structure())
    results.append(test_parameter_loading())
    results.append(test_parameter_values())
    
    print("=" * 60)
    all_passed = all(results)
    print(f"{'✅ ALL TESTS PASSED' if all_passed else '❌ SOME TESTS FAILED'}")
    print("=" * 60)
    
    sys.exit(0 if all_passed else 1)

