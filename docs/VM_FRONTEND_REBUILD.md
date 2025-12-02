# VM Frontend Rebuild Instructions

## Context
The Digital Twin GUI has been updated to connect to UE5's embedded Pixel Streaming server at `ws://localhost:80`. This allows viewing the Rocky Meadows map in the GUI when accessed from Windows.

## Steps to Apply Changes

### 1. Pull Latest Code
```bash
cd /home/radwan-el-gharbi/Dev/agrs-zeus/etn
git pull origin feature/digital-twin
```

### 2. Rebuild Frontend
```bash
cd gui-v2/frontend
npm run build
```

### 3. Restart Frontend Service
```bash
pm2 restart agrs-frontend
```

## Verification

1. Make sure UE5 is streaming on Windows (Pixel Streaming → Stream Level Editor)
2. Open browser **on Windows**: `http://192.168.0.126:3000`
3. Navigate to **Digital Twin** view
4. Click **Connect**
5. You should see the Rocky Meadows landscape streaming

## Notes
- The GUI must be accessed from **Windows browser** (not VM) for localhost:80 to work
- UE5's embedded signaling server runs on port 80 when "Stream Level Editor" is active
