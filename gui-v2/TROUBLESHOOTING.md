# AGRS ZEUS GUI v2 - Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: Core Dump / Crash on Launch

**Symptoms:**
- Application crashes immediately with "core dumped" error
- SUID sandbox error message
- Bus error

**Solutions:**

#### Solution A: Use --no-sandbox flag (Already Applied)
The `launch-gui.sh` script now includes the `--no-sandbox` flag automatically.

```bash
./launch-gui.sh
```

#### Solution B: Disable GPU Acceleration (Updated Script)
If you still get crashes, the script also disables GPU acceleration which helps with graphics driver issues.

#### Solution C: Use Unpacked Version
Try the unpacked directory version instead of AppImage:

```bash
./launch-gui-unpacked.sh
```

#### Solution D: Manual Launch with Full Compatibility Flags
If the scripts still don't work, try:

```bash
cd frontend/dist
./"AGRS ZEUS GUI v2-2.0.0.AppImage" \
  --no-sandbox \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-dev-shm-usage \
  --disable-setuid-sandbox
```

### Issue 2: Backend Not Starting

**Symptoms:**
- Frontend opens but shows connection errors
- API calls fail

**Solutions:**

#### Check Python Environment
```bash
cd backend
source venv/bin/activate
python --version  # Should be 3.11+
pip list | grep fastapi
```

#### Start Backend Manually
```bash
cd backend
source venv/bin/activate
python main.py
```

Backend should start on http://localhost:8000

#### Check Port Availability
```bash
netstat -tuln | grep 8000
# or
lsof -i :8000
```

If port 8000 is in use, stop the conflicting service or change the port in `backend/main.py`.

### Issue 3: Map Not Loading

**Symptoms:**
- Application opens but map area is blank
- Console errors about Mapbox token

**Solutions:**

#### Add Mapbox Token
1. Sign up at https://www.mapbox.com (free tier available)
2. Create an access token
3. Create `frontend/.env`:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
   ```
4. Rebuild:
   ```bash
   cd frontend
   npm run build
   npm run electron-pack
   ```

**Note:** The app should work without a token but will show a Mapbox watermark.

### Issue 4: Display Issues / Black Screen

**Symptoms:**
- Window opens but content is black
- Graphics artifacts

**Solutions:**

#### Try Software Rendering
```bash
export LIBGL_ALWAYS_SOFTWARE=1
./launch-gui.sh
```

#### Check Display Server
```bash
echo $XDG_SESSION_TYPE  # Should show 'wayland' or 'x11'
```

If using Wayland, try forcing X11:
```bash
GDK_BACKEND=x11 ./launch-gui.sh
```

### Issue 5: Permission Errors

**Symptoms:**
- "Permission denied" errors
- Cannot execute scripts

**Solutions:**

#### Make Scripts Executable
```bash
chmod +x launch-gui.sh
chmod +x launch-gui-unpacked.sh
chmod +x dev-start.sh
```

#### Check AppImage Permissions
```bash
chmod +x frontend/dist/"AGRS ZEUS GUI v2-2.0.0.AppImage"
```

### Issue 6: Missing Dependencies

**Symptoms:**
- Error about missing libraries
- "libgtk" or similar errors

**Solutions:**

#### Install Required Libraries (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install \
  libgtk-3-0 \
  libnotify4 \
  libnss3 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  libatspi2.0-0 \
  libdrm2 \
  libgbm1 \
  libxcb-dri3-0
```

### Issue 7: Development Mode Issues

**Symptoms:**
- `npm run dev` fails
- Port 3000 already in use

**Solutions:**

#### Check Node Version
```bash
node --version  # Should be 18+
```

#### Kill Existing Processes
```bash
pkill -f "next dev"
pkill -f "electron"
```

#### Use Different Port
Edit `frontend/package.json`:
```json
"dev:next": "next dev -p 3001"
```

### Issue 8: Build Failures

**Symptoms:**
- `npm run build` fails
- Electron-builder errors

**Solutions:**

#### Clean and Rebuild
```bash
cd frontend
rm -rf .next node_modules dist
npm install
npm run build
npm run electron-pack
```

#### Check Disk Space
```bash
df -h /opt/agrs
```

Ensure you have at least 2GB free.

## Debug Mode

### Enable Verbose Logging

#### Frontend
Edit `electron/main.js` and add at the top:
```javascript
process.env.ELECTRON_ENABLE_LOGGING = 1;
```

#### Backend
Run with debug level:
```bash
cd backend
source venv/bin/activate
LOG_LEVEL=debug python main.py
```

### Check Logs

#### Electron Logs
Logs are in:
- Linux: `~/.config/agrs-zeus-gui-v2/logs/`
- View in console when running from terminal

#### Backend Logs
Backend logs to stdout when run manually.

### Browser DevTools
Press `Ctrl+Shift+I` in the Electron window to open DevTools.

## System Requirements

### Minimum Requirements
- OS: Linux (Ubuntu 20.04+ or equivalent)
- RAM: 4GB
- Disk: 500MB free space
- Display: 1280x720

### Recommended
- OS: Ubuntu 22.04+
- RAM: 8GB
- Disk: 2GB free space
- Display: 1920x1080
- GPU: With WebGL support

## Getting Help

### Collect Debug Information

Run this command and save the output:

```bash
cat << 'EOF' > debug-info.txt
=== System Information ===
uname -a
cat /etc/os-release

=== Display ===
echo $DISPLAY
echo $XDG_SESSION_TYPE

=== Node/Python ===
node --version
python3 --version

=== Libraries ===
ldd frontend/dist/linux-unpacked/agrs-zeus-gui-v2 | grep "not found"

=== Processes ===
ps aux | grep -E "electron|agrs|fastapi"

=== Ports ===
netstat -tuln | grep -E "3000|8000"

=== Last Error ===
./launch-gui.sh 2>&1 | tail -20
EOF

bash debug-info.txt
```

### Known Working Configurations

✅ **Ubuntu 24.04**
- Node.js 18.x
- Python 3.12
- X11 display server
- Intel/AMD GPU with Mesa drivers

✅ **Ubuntu 22.04**
- Node.js 18.x
- Python 3.11
- X11 or Wayland
- NVIDIA with proprietary drivers

## Alternative Launch Methods

### Method 1: Direct AppImage Execution
```bash
cd /opt/agrs/gui-v2/frontend/dist
./"AGRS ZEUS GUI v2-2.0.0.AppImage" --no-sandbox --disable-gpu
```

### Method 2: Unpacked Directory
```bash
cd /opt/agrs/gui-v2/frontend/dist/linux-unpacked
./agrs-zeus-gui-v2 --no-sandbox --disable-gpu
```

### Method 3: Development Mode (Most Stable)
```bash
cd /opt/agrs/gui-v2
./dev-start.sh
```

Development mode is often more stable as it doesn't use AppImage packaging.

## Reinstallation

If all else fails, rebuild from source:

```bash
cd /opt/agrs/gui-v2/frontend

# Clean everything
rm -rf node_modules .next dist out

# Reinstall
npm install

# Rebuild
npm run build
npm run electron-pack
```

## Platform-Specific Notes

### Ubuntu 24.04+
- Works out of the box with updated script
- Use X11 if Wayland has issues

### Fedora/RHEL
May need additional dependencies:
```bash
sudo dnf install gtk3 nss libXScrnSaver
```

### Arch Linux
```bash
sudo pacman -S gtk3 nss libxss
```

## Still Having Issues?

1. Check the logs in `~/.config/agrs-zeus-gui-v2/`
2. Try development mode: `./dev-start.sh`
3. Review `docs/IMPLEMENTATION_SUMMARY.md` for technical details
4. Check if backend starts separately: `cd backend && source venv/bin/activate && python main.py`

---

**Last Updated**: November 21, 2025

