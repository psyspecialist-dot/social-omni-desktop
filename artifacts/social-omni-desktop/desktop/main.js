const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const initSqlJs = require('sql.js');

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
  if (database) {
    database.close();
  }
});
