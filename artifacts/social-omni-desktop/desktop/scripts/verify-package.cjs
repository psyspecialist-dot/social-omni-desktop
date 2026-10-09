const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { hasChromium } = require('./prepare-browsers.cjs');

module.exports = async function verify(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  if (!fs.existsSync(path.join(resources, 'app.asar'))) throw new Error('Packaged application archive is missing.');
  if (!hasChromium(path.join(resources, 'browser-runtime'))) throw new Error('Packaged Chromium is missing; refusing to produce an installer.');
  const wasm = path.join(resources, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  if (!fs.existsSync(wasm)) throw new Error('Packaged SQLite WASM is missing.');
  const builder = createRequire(require.resolve('electron-builder'));
  const asar = createRequire(builder.resolve('app-builder-lib'))('@electron/asar');
  const files = new Set(asar.listPackage(path.join(resources, 'app.asar')));
  for (const file of ['main.js', 'preload.js', 'api-service.cjs', 'renderer/index.html',
    'node_modules/express/package.json', 'node_modules/playwright/package.json',
    'node_modules/sql.js/package.json', 'node_modules/nodemailer/package.json',
    'node_modules/telegram/package.json', 'node_modules/cheerio/package.json']) {
    if (!files.has(`/${file}`)) throw new Error(`Packaged runtime file is missing: ${file}`);
  }
  console.info(`Verified packaged application, Chromium and SQLite WASM: ${resources}`);
};
