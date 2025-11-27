# Access AGRS ZEUS GUI v2 from Windows 11 Host Machine

This guide explains how to access the GUI running in your Ubuntu VM from your Windows 11 host computer.

## 🎯 Why Access from Host?

**Problem:** VMware VMs have limited WebGL support, causing Mapbox GL JS maps to fail.

**Solution:** Access the GUI from your Windows 11 host machine where GPU/WebGL works properly!

---

## 📋 Quick Start (3 Steps)

### **Step 1: Start the Server in VM**

In your Ubuntu VM terminal:

```bash
cd /opt/agrs/gui-v2
./launch-web.sh
```

Wait for:
```
✅ Backend API: http://localhost:8000
  - Local:        http://localhost:3000
```

### **Step 2: Find Your VM's IP Address**

The VM's IP address is: **`192.168.0.126`**

(This was automatically configured)

### **Step 3: Trust the Dev Certificate (one-time)**

Because Mapbox GL JS now requires HTTPS, the Next.js dev server ships with a self‑signed cert located here:

```
/opt/agrs/gui-v2/frontend/certs/dev-cert.pem
```

Copy that file to Windows (e.g. `scp radwan@192.168.0.126:/opt/agrs/gui-v2/frontend/certs/dev-cert.pem C:\Users\<you>\Downloads\agrs-dev-cert.pem`) and double‑click it to import into the **Trusted Root Certification Authorities** store. This removes the scary warning screen.

> ✅ You only have to do this once per machine. If you prefer to “Proceed anyway” on the browser warning, importing isn’t strictly required.

### **Step 4: Open Browser on Windows 11**

On your **Windows 11** computer, open any modern browser **_using HTTPS_**:

```
https://192.168.0.126:3000
```

Accept the certificate (or install it as noted above).  
🎉 **The AGRS ZEUS GUI should load with a working Mapbox map!**

---

## 🔧 Configuration Details

### What Was Changed

1. **Backend (FastAPI)**
   - Now listens on `0.0.0.0` instead of `127.0.0.1`
   - Allows connections from any network interface
   - Port 8000 accessible from host

2. **Frontend (Next.js)**
   - Dev server binds to `0.0.0.0` (all interfaces)
   - Port 3000 accessible from host
   - Hot reload still works

3. **CORS (Cross-Origin)**
   - Configured to allow requests from host machine
   - Backend accepts requests from Windows browser

---

## 🌐 URLs to Use

### **From Windows 11 Host:**
- **GUI**: https://192.168.0.126:3000
- **API**: http://192.168.0.126:8000
- **API Docs**: http://192.168.0.126:8000/api/docs

### **From Ubuntu VM:**
- **GUI**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/api/docs

Both work! Use whichever is more convenient.

---

## 🔥 Firewall Configuration

### Ubuntu VM (If Firewall is Active)

If you can't connect from Windows, you may need to allow the ports:

```bash
# Check if firewall is active
sudo ufw status

# If active, allow ports
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp

# Reload firewall
sudo ufw reload
```

### Windows 11 (Usually Not Needed)

Windows Firewall typically allows outbound connections by default, so no changes needed.

---

## 🧪 Testing Connection

### Test 1: Ping VM from Windows

Open **PowerShell** on Windows 11:

```powershell
ping 192.168.0.126
```

✅ Should get replies (4 packets received)

### Test 2: Test Backend API

In Windows browser, go to:
```
http://192.168.0.126:8000/api/health
```

✅ Should see JSON response:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "version": "2.0.0"
}
```

### Test 3: Test Frontend (HTTPS)

In Windows browser, go to:
```
https://192.168.0.126:3000
```

✅ Should see the AGRS ZEUS GUI with working Mapbox map (after trusting the cert).

---

## 📱 Network Topology

```
┌─────────────────────────────────┐
│   Windows 11 Host Machine       │
│   IP: 192.168.0.X               │
│                                 │
│   Browser:                      │
│   http://192.168.0.126:3000    │
└────────────┬────────────────────┘
             │ Network
             │ (NAT/Bridged)
             ▼
┌─────────────────────────────────┐
│   Ubuntu VM (VMware)            │
│   IP: 192.168.0.126             │
│                                 │
│   Services:                     │
│   - Next.js: 0.0.0.0:3000      │
│   - FastAPI: 0.0.0.0:8000      │
└─────────────────────────────────┘
```

---

## 🎨 Expected Result

When you access from Windows 11, you should see:

1. ✅ **Dark-themed enterprise UI**
2. ✅ **Collapsible sidebar** with navigation
3. ✅ **Interactive Mapbox GL JS map** (fully working!)
4. ✅ **Zoom controls** and map interactions
5. ✅ **No black screen** - actual map tiles loading

---

## 🐛 Troubleshooting

### Issue 1: Can't Connect from Windows

**Symptoms:** "This site can't be reached" or timeout

**Solutions:**

1. **Check VM is running**: Make sure Ubuntu VM is powered on
2. **Check servers are running**: Look for "Local: http://localhost:3000" in terminal
3. **Verify IP address**: Run `hostname -I` in VM to confirm IP
4. **Check network mode**: 
   - VMware: Use "Bridged" or "NAT" networking
   - Not "Host-only"
5. **Disable Ubuntu firewall temporarily**:
   ```bash
   sudo ufw disable
   ```
   (Re-enable after testing: `sudo ufw enable`)

### Issue 2: Browser shows warning “Connection is not private”

**Solution:** Import `frontend/certs/dev-cert.pem` into Windows Trusted Root store or click “Proceed (unsafe)” once.

### Issue 3: Map Still Black

**Symptoms:** GUI loads but map area is black

**Solutions:**

1. **Check browser console** (F12 → Console) for errors
2. **Try different browser**: Chrome, Firefox, Edge
3. **Clear browser cache**: Ctrl+Shift+Delete
4. **Check Mapbox token**: Should be configured correctly

### Issue 3: API Errors

**Symptoms:** Frontend loads but shows "API Connected: No"

**Solutions:**

1. **Check backend is running**: Go to http://192.168.0.126:8000/api/health
2. **Check CORS**: Backend should allow your host machine
3. **Restart both servers**: Ctrl+C then `./launch-web.sh`

---

## 💡 Pro Tips

### Tip 1: Use Windows Terminal

Install **Windows Terminal** from Microsoft Store for better terminal experience when testing.

### Tip 2: Bookmark the URLs

Bookmark these in your Windows browser:
- GUI: https://192.168.0.126:3000
- API Docs: http://192.168.0.126:8000/api/docs

### Tip 3: Keep VM Terminal Visible

Keep the Ubuntu VM terminal visible to see server logs while using GUI from Windows.

### Tip 4: Hot Reload Works

When you edit code in the VM, the changes will automatically appear in your Windows browser (hot reload)!

---

## 🔐 Security Note

**Important:** This configuration allows network access to the development server.

**For production:**
- Use proper authentication
- Configure firewall rules
- Use HTTPS/TLS
- Restrict CORS to specific origins
- Don't expose on public networks

**Current setup is for local development only** (same LAN).

---

## 🚀 Alternative: VS Code Remote

You can also edit code on Windows and have it execute in the VM:

1. Install **VS Code** on Windows
2. Install **Remote - SSH** extension
3. Connect to Ubuntu VM via SSH
4. Edit files in VS Code on Windows
5. Code runs in VM, access GUI from Windows

Best of both worlds!

---

## 📊 Performance

**Expected performance when accessing from host:**

- **Initial load**: 2-4 seconds
- **Map rendering**: Instant (GPU accelerated)
- **Hot reload**: < 1 second
- **API calls**: < 100ms

Much better than running in VM!

---

## ✅ Checklist

Before accessing from Windows:

- [ ] VM is powered on and running
- [ ] Servers started with `./launch-web.sh`
- [ ] Can see "Local: http://localhost:3000" in terminal
- [ ] VM IP is 192.168.0.126 (verify with `hostname -I`)
- [ ] VMware networking is Bridged or NAT (not Host-only)
- [ ] Firewall allows ports 3000 and 8000 (or disabled for testing)

On Windows:
- [ ] Browser open (Chrome, Firefox, or Edge)
- [ ] Navigate to https://192.168.0.126:3000
- [ ] GUI loads and map displays properly

---

**Status:** Ready to use from Windows 11 host machine! 🎉

**Last Updated:** November 21, 2025

