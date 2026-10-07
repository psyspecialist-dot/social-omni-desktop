const { contextBridge, ipcRenderer } = require('electron');

async function invokeBackend(channel, ...args) {
  try { return await ipcRenderer.invoke(channel, ...args); }
  catch (error) {
    const message = error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
    console.error(`[Social Najhin · IPC] ${message}`);
    throw new Error(message);
  }
}
contextBridge.exposeInMainWorld('socialOmni', Object.freeze({
  isDesktop: true,
  getItem: (key) => ipcRenderer.invoke('socialomni:get-item', key),
  setItem: (key, value) => ipcRenderer.invoke('socialomni:set-item', key, value),
  removeItem: (key) => ipcRenderer.invoke('socialomni:remove-item', key),
  openPlatform: (platform) => ipcRenderer.invoke('socialomni:open-platform', platform),
  apiRequest: (method, route, body) => invokeBackend('socialomni:api-request', method, route, body),
  startBrowserJob: (body) => invokeBackend('socialomni:start-browser-job', body),
  onBrowserEvent: (callback) => {
    if (typeof callback !== 'function') throw new Error('A browser-event callback is required.');
    const listener = (_event, data) => {
      console.info(`[Social Najhin · ${data.platform} · ${data.status}] ${data.message}`);
      callback(data);
    };
    ipcRenderer.on('socialomni:browser-event', listener);
    return () => ipcRenderer.removeListener('socialomni:browser-event', listener);
  },
}));
