const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');

const fsp = fs.promises;
const localFileServer = require('./localFileServer');

let mainWindow;
let backendProcess;

// Production URLs for packaged app
const PRODUCTION_URL = 'https://zeus.agrsglobal.com';
const DEV_URL = 'http://localhost:3001';
const PACKAGED_REMOTE_API = 'https://api.agrsglobal.com/api';
const DEV_REMOTE_API = 'http://localhost:8000/api';

const LOCAL_SERVER_PORT = 9090;

// Background polling state
let pollingInterval = null;
let pollingProjectName = null;
let pollingBaseDir = null;
let pollingToken = null;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getRemoteApiBase() {
  const fromEnv = (process.env.ELECTRON_REMOTE_API_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv.endsWith('/api') ? fromEnv : `${fromEnv}/api`;
  return app.isPackaged ? PACKAGED_REMOTE_API : DEV_REMOTE_API;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeResolveWithin(baseDir, relativePath) {
  const resolvedBase = path.resolve(baseDir);
  const normalizedRelative = String(relativePath || '').replace(/\\/g, '/');
  const resolvedTarget = path.resolve(resolvedBase, normalizedRelative);
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Unsafe path outside base directory: ${relativePath}`);
  }
  return resolvedTarget;
}

function toPosixRelative(baseDir, absolutePath) {
  return path.relative(baseDir, absolutePath).split(path.sep).join('/');
}

function sanitizePathComponent(value, fallback = 'item') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function normalizeExportRelativePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) throw new Error('Export file path is required.');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`Invalid export file path: ${relativePath}`);
  }
  return parts.join('/');
}

function buildRouteExportFolderName(projectName, routeId) {
  const routeBase = String(routeId || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || 'route';
  const routeStem = routeBase.replace(/\.geojson$/i, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${sanitizePathComponent(projectName, 'project')}_${sanitizePathComponent(routeStem, 'route')}_export_${stamp}`;
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// ---------------------------------------------------------------------------
// GDAL detection
// ---------------------------------------------------------------------------

function getGdalBinDir() {
  // 1. Bundled GDAL in app resources
  const resourcesDir = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'resources', 'gdal')
    : path.join(__dirname, 'gdal', process.platform === 'win32' ? 'win32' : 'linux');

  const ext = process.platform === 'win32' ? '.exe' : '';
  const testTool = path.join(resourcesDir, `gdalwarp${ext}`);

  if (fs.existsSync(testTool)) {
    console.log('[GDAL] Using bundled GDAL from:', resourcesDir);
    return resourcesDir;
  }

  // 2. System PATH
  console.log('[GDAL] Bundled GDAL not found, will use system PATH');
  return null;
}

function checkGdalAvailability(gdalDir) {
  return new Promise((resolve) => {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const tool = gdalDir
      ? path.join(gdalDir, `gdalwarp${ext}`)
      : 'gdalwarp';

    const opts = { timeout: 10000 };
    if (gdalDir) {
      // Set cwd + PATH so Windows finds DLLs next to the .exe
      const sep = process.platform === 'win32' ? ';' : ':';
      opts.cwd = gdalDir;
      opts.env = {
        ...process.env,
        PATH: `${gdalDir}${sep}${process.env.PATH || ''}`,
        GDAL_DATA: path.join(gdalDir, 'gdal-data'),
        PROJ_LIB: path.join(gdalDir, 'proj-data'),
      };
    }

    execFile(tool, ['--version'], opts, (err, stdout) => {
      if (err) {
        console.warn('[GDAL] Not available:', err.message);
        resolve({ available: false, version: null });
      } else {
        const version = (stdout || '').trim().split('\n')[0];
        console.log('[GDAL] Available:', version);
        resolve({ available: true, version });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Manifest building (runs on user's local filesystem)
// ---------------------------------------------------------------------------

async function collectFilesRecursive(rootDir) {
  const files = [];
  async function walk(currentDir) {
    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  if (fs.existsSync(rootDir)) await walk(rootDir);
  files.sort();
  return files;
}

function computeManifestFingerprint(files) {
  const hash = crypto.createHash('sha256');
  for (const entry of files) {
    hash.update(`${entry.relative_path}|${entry.size_bytes}|${entry.sha256}\n`);
  }
  return hash.digest('hex');
}

async function buildLocalDataManifest(projectDirectory) {
  const files = [];
  let totalSizeBytes = 0;

  // Scan data/, aoi/ directories and root-level files (matching server manifest scope)
  const dirsToScan = ['data', 'aoi'];
  for (const subdir of dirsToScan) {
    const dirPath = path.join(projectDirectory, subdir);
    if (!fs.existsSync(dirPath)) continue;
    const dirFiles = await collectFilesRecursive(dirPath);
    for (const filePath of dirFiles) {
      const stat = await fsp.stat(filePath);
      const sha = await sha256File(filePath);
      const relativePath = `${subdir}/${toPosixRelative(dirPath, filePath)}`;
      files.push({ relative_path: relativePath, size_bytes: Number(stat.size), sha256: sha });
      totalSizeBytes += Number(stat.size);
    }
  }

  // Root-level files
  for (const rootFile of ['project_metadata.json', 'pipeline_specs.json']) {
    const filePath = path.join(projectDirectory, rootFile);
    if (!fs.existsSync(filePath)) continue;
    const stat = await fsp.stat(filePath);
    const sha = await sha256File(filePath);
    files.push({ relative_path: rootFile, size_bytes: Number(stat.size), sha256: sha });
    totalSizeBytes += Number(stat.size);
  }

  files.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
  return { file_count: files.length, total_size_bytes: totalSizeBytes, fingerprint: computeManifestFingerprint(files), files };
}

function compareManifests(remoteManifest, localManifest) {
  const remoteByPath = new Map((remoteManifest.files || []).map(f => [f.relative_path, f]));
  const localByPath = new Map((localManifest.files || []).map(f => [f.relative_path, f]));

  const missing = [], changed = [], extra = [];
  for (const [rp, rf] of remoteByPath) {
    const lf = localByPath.get(rp);
    if (!lf) missing.push(rp);
    else if (rf.sha256 !== lf.sha256 || rf.size_bytes !== lf.size_bytes) changed.push(rp);
  }
  for (const lp of localByPath.keys()) {
    if (!remoteByPath.has(lp)) extra.push(lp);
  }

  missing.sort(); changed.sort(); extra.sort();
  return {
    missing_count: missing.length, changed_count: changed.length, extra_count: extra.length,
    in_sync: missing.length === 0 && changed.length === 0 && extra.length === 0,
    missing_paths: missing, changed_paths: changed, extra_paths: extra
  };
}

// ---------------------------------------------------------------------------
// Remote API communication
// ---------------------------------------------------------------------------

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}

async function fetchRemoteManifest(projectName, token) {
  const base = getRemoteApiBase();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetchJson(`${base}/projects/${encodeURIComponent(projectName)}/data/manifest`, headers);
}

async function downloadFile(projectName, relativePath, targetPath, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const base = getRemoteApiBase();
  const url = `${base}/projects/${encodeURIComponent(projectName)}/data/file?path=${encodeURIComponent(relativePath)}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${relativePath}`);
  const data = Buffer.from(await response.arrayBuffer());
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.tmp-${Date.now()}`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, targetPath);
}

async function ensureProjectMetadata(projectName, projectDirectory, token) {
  const metaPath = path.join(projectDirectory, 'project_metadata.json');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const base = getRemoteApiBase();
  try {
    const response = await fetch(`${base}/projects/${encodeURIComponent(projectName)}/metadata`, { headers });
    if (response.ok) {
      const metadata = await response.json();
      await fsp.mkdir(projectDirectory, { recursive: true });
      await fsp.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('[Sync] Failed to fetch project metadata:', err.message);
  }
}

async function removeEmptyDirs(rootDir) {
  if (!fs.existsSync(rootDir)) return;
  for (const entry of await fsp.readdir(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(rootDir, entry.name);
    await removeEmptyDirs(child);
    if ((await fsp.readdir(child)).length === 0) await fsp.rmdir(child);
  }
}

// ---------------------------------------------------------------------------
// IPC: Local Cache Operations
// ---------------------------------------------------------------------------

async function checkProjectLocalCache({ projectName, baseDirectory, token }) {
  if (!projectName || !baseDirectory) throw new Error('projectName and baseDirectory are required.');
  const projDir = safeResolveWithin(baseDirectory, projectName);
  const remoteManifest = await fetchRemoteManifest(projectName, token);
  const localManifest = await buildLocalDataManifest(projDir);
  const discrepancy = compareManifests(remoteManifest, localManifest);

  return {
    project_name: projectName, base_directory: baseDirectory, project_directory: projDir,
    remote_manifest: { file_count: remoteManifest.file_count || 0, total_size_bytes: remoteManifest.total_size_bytes || 0, fingerprint: remoteManifest.fingerprint || '' },
    local_manifest: { file_count: localManifest.file_count, total_size_bytes: localManifest.total_size_bytes, fingerprint: localManifest.fingerprint },
    discrepancy
  };
}

async function syncProjectLocalCache({ projectName, baseDirectory, token }) {
  if (!projectName || !baseDirectory) throw new Error('projectName and baseDirectory are required.');
  const projDir = safeResolveWithin(baseDirectory, projectName);
  await fsp.mkdir(path.join(projDir, 'data'), { recursive: true });

  const remoteManifest = await fetchRemoteManifest(projectName, token);
  const localBefore = await buildLocalDataManifest(projDir);
  const discBefore = compareManifests(remoteManifest, localBefore);

  const toDownload = [...discBefore.missing_paths, ...discBefore.changed_paths];
  let downloadedCount = 0;
  for (const relPath of toDownload) {
    // Files are relative to project root (data/..., aoi/..., project_metadata.json)
    await downloadFile(projectName, relPath, safeResolveWithin(projDir, relPath), token);
    downloadedCount++;
  }

  let deletedCount = 0;
  for (const relPath of discBefore.extra_paths) {
    const target = safeResolveWithin(projDir, relPath);
    if (fs.existsSync(target)) { await fsp.unlink(target); deletedCount++; }
  }
  await removeEmptyDirs(path.join(projDir, 'data'));
  await removeEmptyDirs(path.join(projDir, 'aoi'));

  const localAfter = await buildLocalDataManifest(projDir);
  const discAfter = compareManifests(remoteManifest, localAfter);

  return {
    project_name: projectName, base_directory: baseDirectory, project_directory: projDir,
    downloaded_count: downloadedCount, deleted_count: deletedCount,
    remote_manifest: { file_count: remoteManifest.file_count || 0, total_size_bytes: remoteManifest.total_size_bytes || 0, fingerprint: remoteManifest.fingerprint || '' },
    local_manifest: { file_count: localAfter.file_count, total_size_bytes: localAfter.total_size_bytes, fingerprint: localAfter.fingerprint },
    discrepancy_before: discBefore, discrepancy_after: discAfter
  };
}

async function ensureLocalServer({ baseDirectory }) {
  if (!baseDirectory) throw new Error('baseDirectory is required.');
  const resolved = path.resolve(baseDirectory);
  await fsp.mkdir(resolved, { recursive: true });

  if (localFileServer.isRunning()) {
    const status = localFileServer.getStatus();
    if (status.base_directory === resolved) return status;
    localFileServer.stop();
  }

  const gdalDir = getGdalBinDir();
  const remoteApi = getRemoteApiBase();
  await localFileServer.start(LOCAL_SERVER_PORT, resolved, gdalDir, remoteApi);
  return localFileServer.getStatus();
}

// ---------------------------------------------------------------------------
// IPC: Push files to server
// ---------------------------------------------------------------------------

async function pushFilesToServer({ projectName, baseDirectory, filePaths, token }) {
  if (!projectName || !baseDirectory || !filePaths?.length) {
    throw new Error('projectName, baseDirectory, and filePaths are required.');
  }

  const dataRoot = path.join(safeResolveWithin(baseDirectory, projectName), 'data');
  const base = getRemoteApiBase();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const results = [];

  for (const relPath of filePaths) {
    const localPath = safeResolveWithin(dataRoot, relPath);
    if (!fs.existsSync(localPath)) {
      results.push({ path: relPath, status: 'skipped', reason: 'file not found locally' });
      continue;
    }

    const fileBuffer = await fsp.readFile(localPath);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), relPath);
    formData.append('relative_path', relPath);

    const pushHeaders = { ...headers };
    const response = await fetch(
      `${base}/projects/${encodeURIComponent(projectName)}/data/push`,
      { method: 'POST', headers: pushHeaders, body: formData }
    );

    if (response.ok) {
      const data = await response.json();
      results.push({ path: relPath, status: data.status || 'pushed' });
    } else {
      const detail = await response.text();
      results.push({ path: relPath, status: 'error', reason: detail });
    }
  }

  return { project_name: projectName, results };
}

// ---------------------------------------------------------------------------
// Background Polling
// ---------------------------------------------------------------------------

function startPolling({ projectName, baseDirectory, token }) {
  stopPolling();
  pollingProjectName = projectName;
  pollingBaseDir = baseDirectory;
  pollingToken = token;

  console.log(`[Polling] Started for project '${projectName}', interval: 30s`);

  pollingInterval = setInterval(async () => {
    try {
      const projDir = safeResolveWithin(pollingBaseDir, pollingProjectName);
      if (!fs.existsSync(path.join(projDir, 'data'))) return;

      const remoteManifest = await fetchRemoteManifest(pollingProjectName, pollingToken);
      const localManifest = await buildLocalDataManifest(projDir);
      const discrepancy = compareManifests(remoteManifest, localManifest);

      if (!discrepancy.in_sync && mainWindow && !mainWindow.isDestroyed()) {
        const direction =
          discrepancy.missing_count > 0 || discrepancy.changed_count > 0
            ? (discrepancy.extra_count > 0 ? 'both' : 'server-ahead')
            : 'local-ahead';

        mainWindow.webContents.send('local-cache-drift', {
          project_name: pollingProjectName,
          direction,
          discrepancy
        });
      }
    } catch (err) {
      console.warn('[Polling] Check failed:', err.message);
    }
  }, 30000);
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Polling] Stopped');
  }
  pollingProjectName = null;
  pollingBaseDir = null;
  pollingToken = null;
}

// ---------------------------------------------------------------------------
// Backend process management (dev mode only)
// ---------------------------------------------------------------------------

function startBackend() {
  if (app.isPackaged) {
    console.log(`Packaged mode: using remote API at ${getRemoteApiBase()}`);
    return;
  }

  const backendPath = path.join(__dirname, '../../backend');
  const venvPython = path.join(backendPath, 'venv/bin/python3');
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';
  const { spawn } = require('child_process');

  console.log('Starting FastAPI backend...');
  backendProcess = spawn(pythonCmd, ['main.py'], { cwd: backendPath, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  backendProcess.stdout.on('data', (d) => console.log(`Backend: ${d}`));
  backendProcess.stderr.on('data', (d) => console.error(`Backend Error: ${d}`));
  backendProcess.on('close', (code) => console.log(`Backend exited: ${code}`));
  backendProcess.on('error', (err) => console.error('Failed to start backend:', err));
}

function stopBackend() {
  if (backendProcess && backendProcess.exitCode === null && !backendProcess.killed) {
    console.log('Stopping backend...');
    backendProcess.kill();
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  const isDev = !app.isPackaged;
  const allowDevTools = isDev || process.env.ELECTRON_ALLOW_DEVTOOLS === 'true';

  mainWindow = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1200, minHeight: 800,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: allowDevTools
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false
  });

  const loadUrl = isDev ? DEV_URL : PRODUCTION_URL;
  console.log(`Loading: ${loadUrl}`);
  mainWindow.loadURL(loadUrl);

  if (isDev && allowDevTools) mainWindow.webContents.openDevTools();

  if (!allowDevTools) {
    Menu.setApplicationMenu(null);
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase();
      if (key === 'f12' || ((input.control || input.meta) && input.shift && ['i', 'j', 'c'].includes(key))) {
        event.preventDefault();
      }
    });
    mainWindow.webContents.on('devtools-opened', () => {
      try { mainWindow.webContents.closeDevTools(); } catch {}
    });
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.on('enter-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fullscreen-changed', true);
    }
  });
  mainWindow.on('leave-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fullscreen-changed', false);
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  const gdalDir = getGdalBinDir();
  const gdalStatus = await checkGdalAvailability(gdalDir);
  console.log('[GDAL] Status:', JSON.stringify(gdalStatus));

  startBackend();

  const startDelay = app.isPackaged ? 0 : 2000;
  setTimeout(() => createWindow(), startDelay);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopPolling();
  localFileServer.stop();
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  stopPolling();
  localFileServer.stop();
  stopBackend();
});

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-path', () => app.getAppPath());

ipcMain.handle('get-gdal-status', async () => {
  const gdalDir = getGdalBinDir();
  return checkGdalAvailability(gdalDir);
});

ipcMain.handle('local-cache-pick-directory', async () => {
  const response = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  if (response.canceled || !response.filePaths?.length) return { cancelled: true };
  return { cancelled: false, directory: response.filePaths[0] };
});

ipcMain.handle('route-export-bundle', async (_event, payload) => {
  const projectName = String(payload?.projectName || '').trim();
  const routeId = String(payload?.routeId || '').trim();
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const manifestFromPayload =
    payload?.manifest && typeof payload.manifest === 'object' && !Array.isArray(payload.manifest)
      ? payload.manifest
      : {};

  if (!projectName) throw new Error('projectName is required.');
  if (!routeId) throw new Error('routeId is required.');
  if (!files.length) throw new Error('At least one file is required for route export.');

  const response = await dialog.showOpenDialog(mainWindow, {
    title: 'Select folder to export route',
    properties: ['openDirectory', 'createDirectory']
  });
  if (response.canceled || !response.filePaths?.length) return { cancelled: true };

  const targetDirectory = path.resolve(response.filePaths[0]);
  await fsp.mkdir(targetDirectory, { recursive: true });

  const baseFolderName = buildRouteExportFolderName(projectName, routeId);
  let folderName = baseFolderName;
  let exportDirectory = safeResolveWithin(targetDirectory, folderName);
  let suffix = 2;
  while (fs.existsSync(exportDirectory)) {
    folderName = `${baseFolderName}_${suffix}`;
    exportDirectory = safeResolveWithin(targetDirectory, folderName);
    suffix += 1;
  }

  await fsp.mkdir(exportDirectory, { recursive: true });

  let writtenFiles = 0;
  for (const file of files) {
    const relativePath = normalizeExportRelativePath(file?.relativePath);
    const targetPath = safeResolveWithin(exportDirectory, relativePath);
    await fsp.mkdir(path.dirname(targetPath), { recursive: true });

    const encoding = file?.encoding === 'base64' ? 'base64' : 'utf8';
    const content = typeof file?.content === 'string' ? file.content : JSON.stringify(file?.content ?? null, null, 2);
    if (encoding === 'base64') {
      await fsp.writeFile(targetPath, Buffer.from(content, 'base64'));
    } else {
      await fsp.writeFile(targetPath, content, 'utf8');
    }
    writtenFiles += 1;
  }

  const manifestPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    project_name: projectName,
    route_id: routeId,
    folder_name: folderName,
    files: files.map((file) => ({
      relative_path: normalizeExportRelativePath(file?.relativePath),
      encoding: file?.encoding === 'base64' ? 'base64' : 'utf8'
    })),
    ...manifestFromPayload
  };
  const manifestPath = safeResolveWithin(exportDirectory, 'route_export_manifest.json');
  await fsp.writeFile(manifestPath, JSON.stringify(manifestPayload, null, 2), 'utf8');
  writtenFiles += 1;

  return {
    cancelled: false,
    directory: exportDirectory,
    folder: folderName,
    files_written: writtenFiles
  };
});

ipcMain.handle('local-cache-check', async (_event, payload) => {
  return checkProjectLocalCache(payload || {});
});

ipcMain.handle('local-cache-sync', async (_event, payload) => {
  return syncProjectLocalCache(payload || {});
});

ipcMain.handle('local-cache-ensure-service', async (_event, payload) => {
  return ensureLocalServer(payload || {});
});

ipcMain.handle('local-cache-stop-service', async () => {
  localFileServer.stop();
  return localFileServer.getStatus();
});

ipcMain.handle('local-cache-get-status', () => localFileServer.getStatus());

ipcMain.handle('local-cache-get-api-base', () => {
  return `http://127.0.0.1:${LOCAL_SERVER_PORT}/api`;
});

ipcMain.handle('local-cache-start-polling', (_event, payload) => {
  startPolling(payload || {});
  return { polling: true };
});

ipcMain.handle('local-cache-stop-polling', () => {
  stopPolling();
  return { polling: false };
});

ipcMain.handle('local-cache-push-files', async (_event, payload) => {
  return pushFilesToServer(payload || {});
});

ipcMain.handle('set-fullscreen', (_event, isFullscreen) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!!isFullscreen);
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('is-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isFullScreen();
  }
  return false;
});
