# VM Instructions: Pixel Streaming Integration for Digital Twin

**From:** Windows UE5 Development Environment  
**To:** VM Agent at `192.168.0.126`  
**Date:** December 2, 2025  
**Purpose:** Apply GUI changes to enable UE5 Pixel Streaming in the Digital Twin view

---

## Summary

The Digital Twin view has been updated to connect to UE5 Pixel Streaming running on the Windows host (`192.168.0.41`). This enables real-time 3D visualization with full mouse/keyboard interactivity.

**Branch:** `feature/gui-v2`  
**Files Changed:**
- `gui-v2/frontend/src/lib/pixelStreaming.ts` (NEW)
- `gui-v2/frontend/src/components/DigitalTwin/DigitalTwinView.tsx` (UPDATED)

---

## Step 1: Pull Latest Code

```bash
cd /opt/agrs
git fetch origin
git checkout feature/gui-v2
git pull origin feature/gui-v2
```

---

## Step 2: Verify Files

Confirm the new files exist:

```bash
ls -la /opt/agrs/gui-v2/frontend/src/lib/pixelStreaming.ts
ls -la /opt/agrs/gui-v2/frontend/src/components/DigitalTwin/DigitalTwinView.tsx
```

Expected output should show both files with recent timestamps.

---

## Step 3: Install Dependencies (if needed)

```bash
cd /opt/agrs/gui-v2/frontend
npm install
```

---

## Step 4: Rebuild Frontend

```bash
cd /opt/agrs/gui-v2/frontend
npm run build
```

---

## Step 5: Restart Frontend Service

```bash
pm2 restart agrs-frontend
```

Or if using systemd:
```bash
sudo systemctl restart agrs-frontend
```

---

## Step 6: Verify Service Status

```bash
pm2 status
# or
pm2 logs agrs-frontend --lines 20
```

---

## Verification

### From Windows Browser

1. Open `http://192.168.0.126:3000`
2. Navigate to **Digital Twin** view (in sidebar)
3. You should see:
   - "UE5 Digital Twin" placeholder with Connect button
   - Signaling URL displayed: `ws://192.168.0.41:80`

### Test Connection (requires UE5 streaming on Windows)

1. On Windows: Start UE5 with Pixel Streaming enabled
2. On Windows browser: Click **Connect** in Digital Twin view
3. Status should progress: `Connecting...` → `Waiting for UE5` → `Live`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 Windows Host (192.168.0.41)                     │
│  ┌────────────────────┐    ┌─────────────────────────────────┐ │
│  │   UE5 Digital Twin │───▶│  Pixel Streaming                │ │
│  │   (Renders Scene)  │    │  - Signaling Server (port 80)   │ │
│  └────────────────────┘    │  - WebRTC Streamer (port 8888)  │ │
│                            └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                      │
                                      │ WebRTC + WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      VM (192.168.0.126)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              GUI v2 Frontend (port 3000)                │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │  DigitalTwinView.tsx                              │  │   │
│  │  │  └── pixelStreaming.ts client                     │  │   │
│  │  │      └── Connects to ws://192.168.0.41:80         │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Backend API (port 8000)                    │   │
│  │  └── /api/digital-twin/* endpoints                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## New Features

### DigitalTwinView.tsx

| Feature | Description |
|---------|-------------|
| **Connect/Disconnect** | One-click streaming control |
| **Input Toggle** | Enable/disable mouse/keyboard passthrough |
| **Fullscreen Mode** | Immersive viewing |
| **Settings Panel** | Configure signaling URL |
| **Live Stats** | Resolution, FPS, bitrate display |
| **Project Context** | Sends selected project name to UE5 |

### pixelStreaming.ts

| Feature | Description |
|---------|-------------|
| **WebRTC Client** | Full peer connection management |
| **WebSocket Signaling** | Connects to UE5's signaling server |
| **Input Handling** | Mouse clicks, movement, wheel, keyboard |
| **Data Channel** | Bidirectional communication with UE5 |
| **Auto-Reconnect** | Automatic reconnection on disconnect |
| **Statistics** | FPS, bitrate, resolution reporting |

---

## Configuration

### Default Signaling URL

```typescript
const DEFAULT_SIGNALING_URL = 'ws://192.168.0.41:80'
```

This can be changed in the Settings panel within the Digital Twin view.

### Input Events Sent to UE5

| Event | Data |
|-------|------|
| `MouseDown` | button, x, y (normalized 0-65535) |
| `MouseUp` | button, x, y |
| `MouseMove` | x, y, deltaX, deltaY |
| `MouseWheel` | delta |
| `KeyDown` | keyCode, repeat |
| `KeyUp` | keyCode |

### Commands Sent to UE5

| Command | Purpose |
|---------|---------|
| `SetProject` | Send project name on connect |
| `ReloadTerrain` | Request terrain reload |

---

## Troubleshooting

### "Connection Error" on Connect

1. Verify UE5 is running with Pixel Streaming on Windows
2. Check Windows firewall allows ports 80 and 8888
3. Verify network connectivity: `ping 192.168.0.41` from VM

### "Waiting for UE5" stays indefinitely

1. In UE5: Go to **Pixel Streaming** → **Stream Level Editor**
2. Or run packaged game with `-PixelStreamingIP=0.0.0.0 -PixelStreamingPort=8888`

### Stream connects but no video

1. Check browser console for WebRTC errors
2. Verify UDP traffic is allowed between VM and Windows host
3. Try Chrome/Edge instead of Firefox (better WebRTC support)

### Input not working

1. Click inside the video to focus
2. Check if "Input On" button is active (green)
3. Some browsers require user interaction before input capture

---

## Windows Host Requirements

For the stream to work, Windows host needs:

### 1. Open Firewall Ports (Run as Admin)

```powershell
netsh advfirewall firewall add rule name="Pixel Streaming 80" dir=in action=allow protocol=TCP localport=80
netsh advfirewall firewall add rule name="Pixel Streaming 8888" dir=in action=allow protocol=TCP localport=8888
netsh advfirewall firewall add rule name="Pixel Streaming UDP" dir=in action=allow protocol=UDP localport=8888
```

### 2. Start UE5 with Pixel Streaming

**Option A - From Editor:**
- Pixel Streaming → Stream Level Editor

**Option B - Packaged Game:**
```powershell
AGRSDigitalTwin.exe -AudioMixer -PixelStreamingIP=0.0.0.0 -PixelStreamingPort=8888
```

---

## File Locations on VM

| File | Path |
|------|------|
| pixelStreaming.ts | `/opt/agrs/gui-v2/frontend/src/lib/pixelStreaming.ts` |
| DigitalTwinView.tsx | `/opt/agrs/gui-v2/frontend/src/components/DigitalTwin/DigitalTwinView.tsx` |
| Frontend build | `/opt/agrs/gui-v2/frontend/.next/` |
| PM2 config | Check with `pm2 show agrs-frontend` |

---

## Quick Commands Reference

```bash
# Pull and rebuild
cd /opt/agrs && git pull origin feature/gui-v2
cd gui-v2/frontend && npm run build && pm2 restart agrs-frontend

# Check logs
pm2 logs agrs-frontend --lines 50

# Check service status
pm2 status

# Test backend connectivity
curl http://localhost:8000/api/digital-twin/health
```

---

*Document created for VM agent to apply Pixel Streaming integration changes.*

