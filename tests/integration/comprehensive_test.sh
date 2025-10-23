#!/bin/bash

echo "=== Comprehensive Feature Test for AGRS ZEUS ==="
echo ""

# Test 1: Basic login and help system
echo "Test 1: Login and Help System"
cat << 'EOF' | zeus
radwan.elgharbi1
RadwanIsAwesome@123
help
help admin
profile help
quit
EOF

echo ""
echo "Test 2: Profile Management Features"
cat << 'EOF' | zeus
radwan.elgharbi1
RadwanIsAwesome@123
profile view
profile employee jcsmith
employees
RadwanIsAwesome@123
quit
EOF

echo ""
echo "Test 3: Field Change Logging and Changelog"
cat << 'EOF' | zeus
radwan.elgharbi1
RadwanIsAwesome@123
profile edit_user jcsmith department
RadwanIsAwesome@123
Engineering
profile changelog jcsmith 0829200000 0830000000
profile changelog jcsmith export 0829200000 0830000000 /tmp/test_changes.csv
quit
EOF

echo ""
echo "Test 4: Login Attempts Logging"
cat << 'EOF' | zeus
radwan.elgharbi1
RadwanIsAwesome@123
logs login_attempts 0829200000 0830000000
logs login_attempts export 0829200000 0830000000 /tmp/test_logins.csv
RadwanIsAwesome@123
quit
EOF

echo ""
echo "=== Checking Generated Files ==="
echo "Field Changes CSV:"
if [ -f "/tmp/test_changes.csv" ]; then
    head -5 /tmp/test_changes.csv
else
    echo "No field changes CSV found"
fi

echo ""
echo "Login Attempts CSV:"
if [ -f "/tmp/test_logins.csv" ]; then
    head -5 /tmp/test_logins.csv
else
    echo "No login attempts CSV found"
fi

echo ""
echo "=== Test Complete ==="
