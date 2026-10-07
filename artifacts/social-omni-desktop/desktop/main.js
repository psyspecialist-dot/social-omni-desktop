const { app, BrowserWindow, dialog, ipcMain, shell, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomBytes } = require('node:crypto');
const initSqlJs = require('sql.js');
const express = require('express');
const createService = require('./api-service.cjs');
const registerBrowserIpc = require('./browser-ipc.cjs');
// Visible macOS app name changes independently of the existing storage location.
const existingUserDataPath = app.getPath('userData');
app.setName('Social Najhin');
app.setPath('userData', existingUserDataPath);

const platformUrls = Object.freeze({
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/upload',
  whatsapp: 'https://web.whatsapp.com/',
});
const rendererPath = path.join(__dirname, 'renderer', 'index.html');
const appIconPath = path.join(__dirname, 'renderer', 'assets', 'images', 'app-icon.png');
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
  registerBrowserIpc({ ipcMain, assertTrustedSender, getConnection: () => ({ port: apiPort, secret: apiSecret, workspace: desktopWorkspace }) });
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
  apiService = createService({
    express, dbPath: path.join(app.getPath('userData'), 'socialomni-workspace.sqlite'), secret: apiSecret,
    automation: {
      chromium: require('playwright').chromium,
      profileDir: path.join(app.getPath('userData'), 'browser-profiles'),
      onEvent: (event) => {
        const log = event.level === 'warning' ? console.warn : console.info;
        log(`[Social Najhin · ${event.platform} · ${event.status}] ${event.message}`);
        if (window && !window.isDestroyed()) window.webContents.send('socialomni:browser-event', event);
      },
    },
    secureStore: {available:()=>safeStorage.isEncryptionAvailable() && (process.platform!=='linux' || safeStorage.getSelectedStorageBackend()!=='basic_text'),
      encrypt:value=>safeStorage.encryptString(value),decrypt:value=>safeStorage.decryptString(value)},
  });
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
    title: 'Social Najhin',
    icon: appIconPath,
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
  window.webContents.setWindowOpenHandler(({url}) => {
    if (['https://my.telegram.org','https://my.telegram.org/'].includes(url)) void shell.openExternal('https://my.telegram.org/');
    return {action:'deny'};
  });
  window.webContents.on('will-navigate', (event, destination) => {
    if (destination.split('#')[0] !== rendererUrl) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.loadFile(rendererPath).catch((error) => {
    dialog.showErrorBox('Social Najhin could not open', error.message);
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
    if (process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
    await openDatabase();
    await startApi();
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (error) {
    dialog.showErrorBox('Social Najhin could not start', error instanceof Error ? error.message : 'Unknown startup error.');
    app.quit();
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
let quitting = false;
let readyToQuit = false;
app.on('before-quit', (event) => {
  if (readyToQuit) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  // Give persistent contexts time to flush cookies without trapping the app on exit.
  Promise.race([
    Promise.resolve(apiService?.close()),
    new Promise(resolve => { const timer = setTimeout(resolve, 5000); timer.unref(); }),
  ]).catch(error => console.warn('Browser shutdown:', error.message)).finally(() => {
    if (apiServer) apiServer.close();
    if (database) database.close();
    readyToQuit = true;
    app.quit();
  });
});
