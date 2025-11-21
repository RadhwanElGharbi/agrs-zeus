const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electron', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // Platform info
  platform: process.platform,
  
  // Future IPC methods will be added here
  // Example: openFile, saveFile, showDialog, etc.
});

console.log('Preload script loaded successfully');

