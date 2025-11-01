#!/usr/bin/env python3
"""
Test the session management fix by calling zeus commands in sequence
"""

import subprocess
import sys
from pathlib import Path
import tempfile

print("=" * 80)
print("SESSION MANAGEMENT FIX TEST")
print("=" * 80)
print()

project_dir = Path("/opt/agrs/Projects/test_project")
config_path = project_dir / "pirl_training_config.yaml"
temp_dir = Path(tempfile.mkdtemp(prefix='pirl_test_'))

print(f"Temp dir: {temp_dir}")
print()

# Step 1: Reset episode (creates session)
print("STEP 1: Resetting episode...")
result = subprocess.run([
    'zeus', 'tools', 'pirl_reset_episode',
    '--config', str(config_path),
    '--output-dir', str(temp_dir)
], capture_output=True, text=True)

print(result.stdout)
if result.returncode != 0:
    print("ERROR:", result.stderr)
    sys.exit(1)

# Check if session file was created
session_file = temp_dir / 'session_id.txt'
if not session_file.exists():
    print("❌ Session file not created!")
    sys.exit(1)

with open(session_file, 'r') as f:
    session_id = f.read().strip()

print(f"✅ Session created: {session_id}")
print()

# Step 2: Take one step
print("STEP 2: Taking a step...")
action_file = temp_dir / 'action.json'
with open(action_file, 'w') as f:
    f.write('{"heading_change": 0.1, "step_size": 50.0}')

result = subprocess.run([
    'zeus', 'tools', 'pirl_step',
    '--config', str(config_path),
    '--action-file', str(action_file),
    '--output-dir', str(temp_dir)
], capture_output=True, text=True)

print(result.stdout)
if result.returncode != 0:
    print("ERROR:", result.stderr)
    sys.exit(1)

print()

# Step 3: Get route
print("STEP 3: Extracting route...")
route_file = temp_dir / 'route.geojson'

result = subprocess.run([
    'zeus', 'tools', 'pirl_get_route',
    '--output-dir', str(temp_dir),
    '--route-file', str(route_file)
], capture_output=True, text=True)

print(result.stdout)
if result.returncode != 0:
    print("ERROR:", result.stderr)
    print()
    print("This is expected - sessions don't persist across process boundaries")
    print("The global session map is lost when the process ends")
    sys.exit(1)

print()
print("✅ SUCCESS! Route extracted")

# Show route
if route_file.exists():
    with open(route_file, 'r') as f:
        import json
        route_data = json.load(f)
        num_points = len(route_data['features'][0]['geometry']['coordinates'])
        print(f"Route has {num_points} points")



