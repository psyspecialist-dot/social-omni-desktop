const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('socialOmni', Object.freeze({
  isDesktop: true,
  getItem: (key) => ipcRenderer.invoke('socialomni:get-item', key),
  setItem: (key, value) => ipcRenderer.invoke('socialomni:set-item', key, value),
  removeItem: (key) => ipcRenderer.invoke('socialomni:remove-item', key),
  openPlatform: (platform) => ipcRenderer.invoke('socialomni:open-platform', platform),
  apiRequest: (method, route, body) => ipcRenderer.invoke('socialomni:api-request', method, route, body),
}));
