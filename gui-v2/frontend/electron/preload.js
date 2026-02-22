const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  platform: process.platform,

  // GDAL status
  getGdalStatus: () => ipcRenderer.invoke('get-gdal-status'),

  // Local project cache -- directory + sync
  pickLocalCacheDirectory: () => ipcRenderer.invoke('local-cache-pick-directory'),
  checkProjectLocalCache: (payload) => ipcRenderer.invoke('local-cache-check', payload),
  syncProjectLocalCache: (payload) => ipcRenderer.invoke('local-cache-sync', payload),

  // Local file server
  ensureLocalCacheService: (payload) => ipcRenderer.invoke('local-cache-ensure-service', payload),
  stopLocalCacheService: () => ipcRenderer.invoke('local-cache-stop-service'),
  getLocalCacheStatus: () => ipcRenderer.invoke('local-cache-get-status'),
  getLocalCacheApiBase: () => ipcRenderer.invoke('local-cache-get-api-base'),

  // Background polling for discrepancy
  startPolling: (payload) => ipcRenderer.invoke('local-cache-start-polling', payload),
  stopPolling: () => ipcRenderer.invoke('local-cache-stop-polling'),
  onDriftDetected: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('local-cache-drift', handler);
    return () => ipcRenderer.removeListener('local-cache-drift', handler);
  },

  // Push local changes to server
  pushFilesToServer: (payload) => ipcRenderer.invoke('local-cache-push-files', payload),

  // Route export
  exportRouteBundle: (payload) => ipcRenderer.invoke('route-export-bundle', payload),

  // Native window fullscreen
  setFullscreen: (isFullscreen) => ipcRenderer.invoke('set-fullscreen', isFullscreen),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  onFullscreenChange: (callback) => {
    const handler = (_event, isFullscreen) => callback(isFullscreen);
    ipcRenderer.on('fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('fullscreen-changed', handler);
  }
});

console.log('Preload script loaded successfully');
