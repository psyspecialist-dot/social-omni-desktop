const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const initSqlJs = require('sql.js');
const express = require('express');
const createService = require('./api-service.cjs');

const platformUrls = Object.freeze({
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/upload',
  whatsapp: 'https://web.whatsapp.com/',
});
const rendererPath = path.join(__dirname, 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererPath).href;
const maxValueBytes = 10 * 1024 * 1024;
let database;
let databasePath;
let window;
let apiServer;
let apiService;
let apiPort;
const apiSecret = randomBytes(32).toString('hex');
const desktopWorkspace = '00000000-0000-4000-8000-000000000001';

if (!app.requestSingleInstanceLock()) app.quit();

function assertTrustedSender(event) {
  const url = event.senderFrame?.url?.split('#')[0];
  if (!window || event.sender !== window.webContents || url !== rendererUrl) {
    throw new Error('Untrusted desktop request.');
  }
}

function assertKey(key) {
  if (typeof key !== 'string' || !/^socialomni[-.:][a-z0-9_.:-]{1,80}$/i.test(key)) {
    throw new Error('Invalid local-data key.');
  }
}

function flushDatabase() {
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, Buffer.from(database.export()), { mode: 0o600 });
  fs.renameSync(temporaryPath, databasePath);
}

async function openDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
  });
  fs.mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 });
  databasePath = path.join(app.getPath('userData'), 'socialomni.sqlite');
  database = fs.existsSync(databasePath)
    ? new SQL.Database(fs.readFileSync(databasePath))
    : new SQL.Database();
  database.run('CREATE TABLE IF NOT EXISTS local_data (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  flushDatabase();
}

function registerIpc() {
  ipcMain.handle('socialomni:api-request', async (event, method, route, body) => {
    assertTrustedSender(event);
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || typeof route !== 'string' || !/^\/[a-z0-9/-]{1,120}$/i.test(route)) {
      throw new Error('Invalid local API request.');
    }
    const result = await fetch(`http://127.0.0.1:${apiPort}/api/socialomni${route}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-socialomni-secret': apiSecret, 'x-socialomni-workspace': desktopWorkspace },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || `Local request failed (${result.status}).`);
    return data;
  });
  ipcMain.handle('socialomni:get-item', (event, key) => {
    assertTrustedSender(event);
    assertKey(key);
    const statement = database.prepare('SELECT value FROM local_data WHERE key = ?');
    try {
      statement.bind([key]);
      return statement.step() ? statement.getAsObject().value : null;
    } finally {
      statement.free();
    }
  });
  ipcMain.handle('socialomni:set-item', (event, key, value) => {
    assertTrustedSender(event);
    assertKey(key);
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > maxValueBytes) {
      throw new Error('Local data must be text and no larger than 10 MB.');
    }
    database.run(
      'INSERT INTO local_data (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
    flushDatabase();
  });
  ipcMain.handle('socialomni:remove-item', (event, key) => {
    assertTrustedSender(event);
    assertKey(key);
    database.run('DELETE FROM local_data WHERE key = ?', [key]);
    flushDatabase();
  });
  ipcMain.handle('socialomni:open-platform', async (event, platform) => {
    assertTrustedSender(event);
    if (!Object.hasOwn(platformUrls, platform)) throw new Error('Unknown platform.');
    await shell.openExternal(platformUrls[platform]);
  });
}

async function startApi() {
  apiService = createService({ express, dbPath: path.join(app.getPath('userData'), 'socialomni-workspace.sqlite'), secret: apiSecret });
  const localApp = express();
  localApp.disable('x-powered-by');
  localApp.use(express.json({ limit: '8mb' }));
  localApp.use('/api/socialomni', apiService.router);
  apiServer = await new Promise((resolve, reject) => {
    const server = localApp.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
  apiPort = apiServer.address().port;
}

function createWindow() {
  if (!fs.existsSync(rendererPath)) {
    throw new Error('The renderer has not been built. Run the desktop export step before launching.');
  }
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 680,
    title: 'SocialOmni Desktop',
    backgroundColor: '#101827',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, destination) => {
    if (destination.split('#')[0] !== rendererUrl) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.loadFile(rendererPath).catch((error) => {
    dialog.showErrorBox('SocialOmni could not open', error.message);
    app.quit();
  });
  window.on('closed', () => { window = null; });
}

app.on('second-instance', () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});
app.whenReady().then(async () => {
  try {
    await openDatabase();
    await startApi();
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    dialog.showErrorBox('SocialOmni could not start', error instanceof Error ? error.message : 'Unknown startup error.');
    app.quit();
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => {
  if (apiServer) apiServer.close();
  if (apiService) apiService.close();
  if (database) {
    database.close();
  }
});
