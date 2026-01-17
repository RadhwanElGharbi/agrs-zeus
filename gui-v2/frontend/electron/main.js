const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;

// Production URLs for packaged app
const PRODUCTION_URL = 'https://zeus.agrsglobal.com';
const DEV_URL = 'http://localhost:3001';

// Start FastAPI backend server (dev mode only)
function startBackend() {
  // In packaged mode, use remote API - no local backend needed
  if (app.isPackaged) {
    console.log('Packaged mode: using remote API at https://api.agrsglobal.com/api');
    return;
  }

  const backendPath = path.join(__dirname, '../../backend');
  const venvPython = path.join(backendPath, 'venv/bin/python3');
  const pythonCmd = require('fs').existsSync(venvPython) ? venvPython : 'python3';

  console.log('Starting FastAPI backend...');
  console.log('Backend path:', backendPath);
  console.log('Python command:', pythonCmd);

  backendProcess = spawn(pythonCmd, ['main.py'], {
    cwd: backendPath,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  backendProcess.stdout.on('data', (data) => console.log(`Backend: ${data}`));
  backendProcess.stderr.on('data', (data) => console.error(`Backend Error: ${data}`));
  backendProcess.on('close', (code) => console.log(`Backend process exited with code ${code}`));
  backendProcess.on('error', (err) => console.error('Failed to start backend:', err));
}

// Stop backend server
function stopBackend() {
  if (backendProcess) {
    console.log('Stopping FastAPI backend...');
    backendProcess.kill();
  }
}

function createWindow() {
  const isDev = !app.isPackaged;
  const allowDevTools = isDev || process.env.ELECTRON_ALLOW_DEVTOOLS === 'true';

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: allowDevTools
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false
  });

  // Load the app - packaged mode loads remote, dev mode loads local
  const loadUrl = isDev ? DEV_URL : PRODUCTION_URL;
  console.log(`Loading: ${loadUrl}`);
  mainWindow.loadURL(loadUrl);

  if (isDev && allowDevTools) {
    mainWindow.webContents.openDevTools();
  }

  // Hard-disable devtools surfaces for packaged/remote mode
  if (!allowDevTools) {
    Menu.setApplicationMenu(null);

    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase();
      const isDevToolsShortcut =
        key === 'f12' ||
        ((input.control || input.meta) && input.shift && (key === 'i' || key === 'j' || key === 'c'));
      if (isDevToolsShortcut) event.preventDefault();
    });

    mainWindow.webContents.on('devtools-opened', () => {
      try { mainWindow.webContents.closeDevTools(); } catch (_) {}
    });
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// App lifecycle
app.whenReady().then(() => {
  startBackend();

  // In dev mode, wait for backend; in packaged mode, start immediately
  const startDelay = app.isPackaged ? 0 : 2000;
  setTimeout(() => createWindow(), startDelay);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => stopBackend());

// IPC Handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

