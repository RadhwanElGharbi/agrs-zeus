# AGRS ZEUS Desktop App - Build & Distribution Guide

## Overview

The AGRS ZEUS desktop application is an Electron-based client that connects to the ZEUS backend server. It provides local data caching, GDAL-powered tile rendering, and a native installer/updater wizard for enterprise on-premises deployment.

**Architecture**: Workstations on the LAN run the Electron app, which loads the frontend from the ZEUS server and optionally syncs project data locally for faster rendering.

---

## Prerequisites (Build Server - Linux VM)

| Dependency | Purpose | Install |
|---|---|---|
| Node.js 18+ | Frontend build + Electron packaging | `nvm install 18` or `apt install nodejs` |
| npm | Package management | Comes with Node.js |
| wine + wine32 | Cross-compile Windows .exe from Linux | See [Wine Setup](#wine-setup) |
| GDAL CLI tools | Bundled with Linux AppImage; system tools for dev | `apt install gdal-bin` |
| Python 3.12+ venv | Backend (for `prepare-gdal-win64.sh` doesn't need this, but backend does) | System python |

### Wine Setup

Required for building the Windows `.exe` installer from Linux:

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine64 wine32:i386
```

After install, initialize the wine prefix:

```bash
rm -rf ~/.wine  # Only if you have a stale 64-bit prefix
WINEPREFIX="$HOME/.wine" WINEARCH=win32 wine wineboot --init
```

Verify:
```bash
wine --version
# Should print: wine-9.x
```

---

## Build Commands

### Full Build (Both Platforms)

```bash
/opt/agrs/scripts/build-installer.sh
```

### Linux Only

```bash
/opt/agrs/scripts/build-installer.sh linux
```

### Windows Only

```bash
/opt/agrs/scripts/build-installer.sh win
```

### What the Build Script Does

1. **Prepares GDAL Win64 binaries** - Downloads GISInternals GDAL 3.8.4 SDK, extracts `gdalwarp.exe`, `ogr2ogr.exe`, `gdal_translate.exe`, `gdalinfo.exe` + 39 DLLs + data files into `gui-v2/frontend/electron/gdal/win32/` (~72MB)
2. **Copies Linux GDAL binaries** - Copies system GDAL tools to `gui-v2/frontend/electron/gdal/linux/`
3. **Runs `next build`** - Produces static HTML/JS export in `gui-v2/frontend/out/`
4. **Runs `electron-builder`** - Packages the app + GDAL into platform installers
5. **Updates `app_version.json`** - Writes download links for the backend to serve

---

## Build Artifacts

All artifacts go to `gui-v2/frontend/dist/`:

| Artifact | Platform | Description |
|---|---|---|
| `AGRS-ZEUS-Setup-{version}.exe` | Windows | NSIS installer wizard with directory chooser, shortcuts, upgrade-in-place |
| `AGRS-ZEUS-{version}-linux.AppImage` | Linux | Standalone executable, no install needed |

Typical sizes: ~275MB (Windows), ~272MB (Linux). The size includes the Electron runtime + bundled GDAL.

---

## Distribution

### How Users Get the Installer

The backend serves installers via the API:

- **Version check**: `GET /api/app/latest-version` - Returns current version + download links
- **Download**: `GET /api/app/downloads/{filename}` - Serves the actual file

Users access via browser on their workstation:
```
http://<server-ip>:8000/api/app/downloads/AGRS-ZEUS-Setup-2.3.0.exe
```

### Update Notification

The Electron app includes an `UpdateNotificationBanner` component that:
- Checks `/api/app/latest-version` every 5 minutes
- Compares server version against the running app version
- Shows a notification with download links when an update is available
- User dismisses or downloads; dismissed version is remembered in localStorage

### Version Manifest

The version manifest lives at `gui-v2/backend/app_version.json`:

```json
{
  "version": "2.3.0",
  "release_date": "2026-02-15",
  "release_notes": "Description of changes...",
  "downloads": [
    {
      "platform": "windows",
      "label": "Windows Installer (.exe)",
      "url": "/api/app/downloads/AGRS-ZEUS-Setup-2.3.0.exe",
      "filename": "AGRS-ZEUS-Setup-2.3.0.exe"
    },
    {
      "platform": "linux",
      "label": "Linux AppImage",
      "url": "/api/app/downloads/AGRS-ZEUS-2.3.0-linux.AppImage",
      "filename": "AGRS-ZEUS-2.3.0-linux.AppImage"
    }
  ]
}
```

The build script updates this automatically. You can also edit it manually.

---

## Windows Installer Behavior

The NSIS installer wizard provides:

- **Custom install directory** - User picks where to install (default: `C:\Users\<user>\AppData\Local\Programs\agrs-zeus-gui-v2\`)
- **Upgrade detection** - If a previous version exists (via registry), it upgrades in-place
- **Desktop shortcut** - "AGRS ZEUS" on desktop
- **Start menu shortcut** - Under Start Menu programs
- **Uninstaller** - Added to Windows "Add or Remove Programs"

Configuration in `gui-v2/frontend/package.json` under `build.nsis`:
```json
{
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "perMachine": false,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "AGRS ZEUS",
  "artifactName": "AGRS-ZEUS-Setup-${version}.${ext}"
}
```

---

## What's Bundled in the Installer

### Electron App
- `electron/main.js` - Main process (sync, local server, GDAL detection, background polling)
- `electron/preload.js` - IPC bridge for renderer
- `electron/localFileServer.js` - Node.js HTTP server for local-first data rendering
- `out/` - Next.js static export (the frontend UI)

### GDAL Binaries (in `resources/gdal/`)
- `gdalwarp.exe` / `gdalwarp` - Raster tile rendering (warp to Web Mercator)
- `gdal_translate.exe` / `gdal_translate` - Raster format conversion (TIF to PNG)
- `ogr2ogr.exe` / `ogr2ogr` - Vector format conversion (GPKG to GeoJSON, MVT generation)
- `gdalinfo.exe` / `gdalinfo` - Raster metadata inspection
- Supporting DLLs (Windows only): libgdal, proj, geos, sqlite3, tiff, jpeg, png, etc.
- GDAL data files: coordinate system definitions, projection grids

### GDAL Fallback
If GDAL binaries are not found or fail, the local file server automatically proxies requests to the remote backend server. This means the app works even without GDAL -- just without local tile rendering.

---

## Local Data Cache Feature

### How It Works

1. User enables per-project in **Settings > Project Local Data Cache**
2. User picks a local directory via native folder picker
3. User clicks **Sync** - Electron downloads all project `data/`, `aoi/`, and metadata files from the server
4. Electron starts a local HTTP server on `localhost:9090` serving the synced files
5. Frontend URLs point to `localhost:9090` instead of the remote server
6. Raster tiles rendered locally via GDAL; vectors served as pre-cached GeoJSON

### What Gets Synced
- `data/rasters/processed/*.tif` + metadata sidecars
- `data/vectors/processed/*.gpkg` + metadata sidecars
- `data/creator/` (operator annotations)
- `data/sorties/` (field collection sessions)
- `aoi/` (area of interest, start/end points)
- `project_metadata.json`
- `pipeline_specs.json`

### Background Polling
Every 30 seconds, Electron compares the remote manifest fingerprint against the local one. If they differ, a notification appears:
- **Server-ahead**: "Project data has changed on the server" with Sync button
- **Local-ahead**: Red "LOCAL CHANGES" indicator in sidebar footer, opens Project Controls

---

## Releasing a New Version

### Step-by-step

1. **Make code changes** in `gui-v2/frontend/` and/or `gui-v2/backend/`

2. **Bump version** in `gui-v2/frontend/package.json`:
   ```json
   "version": "2.4.0"
   ```

3. **Run the build**:
   ```bash
   /opt/agrs/scripts/build-installer.sh
   ```

4. **Restart the backend** (so the new `app_version.json` is served):
   ```bash
   /opt/agrs/scripts/agrs-control-wrapper.sh restart-zeus-backend
   ```

5. **Verify**:
   ```bash
   curl -s http://localhost:8000/api/app/latest-version | python3 -m json.tool
   ```

6. **Users** will see the update notification in their Electron app and can download the new installer.

---

## Troubleshooting

### Build fails with "cannot clean dist/win-unpacked"
Previous builds may leave root-owned files:
```bash
sudo rm -rf /opt/agrs/gui-v2/frontend/dist/win-unpacked
```

### Build fails with "wine is required"
Install wine:
```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine64 wine32:i386
rm -rf ~/.wine
WINEPREFIX="$HOME/.wine" WINEARCH=win32 wine wineboot --init
```

### Build fails with "kernel32.dll not found"
Wine prefix is 64-bit but rcedit needs 32-bit:
```bash
rm -rf ~/.wine
WINEPREFIX="$HOME/.wine" WINEARCH=win32 wine wineboot --init
```

### Raster tiles not rendering locally
GDAL not found on user's workstation. The local server will proxy to remote automatically. To fix permanently, ensure GDAL is bundled (re-run `prepare-gdal-win64.sh` and rebuild).

### "Local cache requires ZEUS Desktop v2.3.0+"
User is on an older Electron app. They need to download and install the latest version.

---

## File Reference

| File | Purpose |
|---|---|
| `scripts/build-installer.sh` | Main build script for both platforms |
| `scripts/prepare-gdal-win64.sh` | Downloads and extracts GDAL Windows binaries |
| `gui-v2/frontend/package.json` | Version, NSIS config, electron-builder config |
| `gui-v2/frontend/electron/main.js` | Electron main process (sync, server, polling, GDAL) |
| `gui-v2/frontend/electron/preload.js` | IPC bridge exposed to renderer |
| `gui-v2/frontend/electron/localFileServer.js` | Local HTTP server mirroring backend API routes |
| `gui-v2/frontend/electron/gdal/win32/` | Windows GDAL binaries (populated by build script) |
| `gui-v2/frontend/electron/gdal/linux/` | Linux GDAL binaries (populated by build script) |
| `gui-v2/frontend/public/icon.ico` | Windows installer icon |
| `gui-v2/frontend/public/icon.png` | App icon (source) |
| `gui-v2/frontend/dist/` | Build output directory |
| `gui-v2/backend/app_version.json` | Version manifest served by API |
| `gui-v2/backend/api/app_updates.py` | Version check + download endpoints |
| `gui-v2/backend/api/project_data_sync.py` | Manifest + file download + push approval endpoints |
