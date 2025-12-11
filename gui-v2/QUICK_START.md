# AGRS ZEUS GUI v2 - Quick Start Guide

## 🚀 Running the Application (3 Easy Steps)

### Step 1: Navigate to GUI v2 Directory
```bash
cd /opt/agrs/gui-v2
```

### Step 2: Launch the Application
```bash
./launch-gui.sh
```

### Step 3: Wait for App to Open
The native desktop window will appear in ~4-5 seconds.

---

## That's It! 🎉

The application is now running. You should see:
- A dark-themed enterprise UI
- Sidebar with navigation options
- Interactive map in the main area

---

## Alternative: Development Mode

For development with hot-reload:

```bash
cd /opt/agrs/gui-v2
./dev-start.sh
```

This will:
- Auto-install dependencies (if needed)
- Start the FastAPI backend
- Launch Electron with live reload

---

## What You'll See

### Main Interface
- **Left**: Collapsible sidebar with navigation menu
- **Top**: Search bar and user controls
- **Center**: Interactive Mapbox GL JS map
- **Bottom**: Status indicators

### Features Available Now
- ✅ Interactive map (zoom, pan, rotate)
- ✅ Dark theme UI
- ✅ Navigation sidebar
- ✅ Backend API health check
- ✅ Map controls (zoom in/out, reset view)

### Coming Soon
- 🔜 Real project data
- 🔜 PIRL training interface
- 🔜 Dataset visualization
- 🔜 User authentication

---

## Troubleshooting

### App won't start?

1. **Make script executable**:
   ```bash
   chmod +x launch-gui.sh
   ```

2. **Check if AppImage exists**:
   ```bash
   ls -lh frontend/dist/*.AppImage
   ```

3. **If missing, rebuild**:
   ```bash
   cd frontend
   npm install
   npm run build
   npm run electron-pack
   ```

### Map not loading?

The map will work without a Mapbox token but will show a watermark. For full functionality:

1. Get free token: https://www.mapbox.com
2. Create `frontend/.env`:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
   ```
3. Rebuild: `cd frontend && npm run build && npm run electron-pack`

### Backend not responding?

The backend auto-starts with the app. Check terminal for errors.

Manual backend start:
```bash
cd backend
source venv/bin/activate
python main.py
```

---

## Keyboard Shortcuts

- **Ctrl+Shift+I**: Toggle Developer Tools
- **Ctrl+Q**: Quit application
- **Map Navigation**:
  - Click+Drag: Pan
  - Scroll: Zoom
  - Ctrl+Click+Drag: Rotate
  - Shift+Click+Drag: Pitch (3D tilt)

---

## API Documentation

While the app is running, visit:
- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc

---

## File Locations

- **Executable**: `frontend/dist/AGRS ZEUS GUI v2-2.0.0.AppImage`
- **Size**: ~191 MB
- **Backend API**: http://localhost:8000
- **Source Code**: `/opt/agrs/gui-v2/`

---

## Next Steps

1. **Explore the Interface**: Click around, try the map controls
2. **Check API Docs**: Visit http://localhost:8000/api/docs
3. **Review Implementation**: Read `docs/IMPLEMENTATION_SUMMARY.md`
4. **Add Mapbox Token**: For full map features
5. **Provide Feedback**: Note what you like, what needs improvement

---

## Support

For issues or questions:
- Check `README.md` for detailed documentation
- Review `docs/IMPLEMENTATION_SUMMARY.md`
- Check `frontend/README.md` and `backend/README.md`

---

**Status**: ✅ Ready to Use

**Last Updated**: November 21, 2025







