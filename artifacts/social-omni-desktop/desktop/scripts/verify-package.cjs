const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { hasChromium } = require('./prepare-browsers.cjs');
const { verifyLicenseConfiguration } = require('./verify-license-config.cjs');

function verifyArchiveFiles(entries) {
  // ASAR lists paths using the build host's separators (Windows uses backslashes).
  const files = new Set(entries.map(file => `/${file.replace(/\\/g, '/').replace(/^\/+/, '')}`));
  if (files.has('/scripts/dev-license.cjs')) throw new Error('Development signer must not ship in an installer.');
  for (const file of ['main.js', 'preload.js', 'editing.cjs', 'api-service.cjs', 'renderer/index.html',
    'license-client.cjs', 'license-crypto.cjs', 'license-machine.cjs', 'licensing-config.json',
    'smart-replies.cjs', 'whatsapp-media.cjs', 'facebook-media.cjs', 'wa-suite-browser.cjs',
    'node_modules/express/package.json', 'node_modules/playwright/package.json',
    'node_modules/sql.js/package.json', 'node_modules/nodemailer/package.json',
    'node_modules/telegram/package.json', 'node_modules/cheerio/package.json']) {
    if (!files.has(`/${file}`)) throw new Error(`Packaged runtime file is missing: ${file}`);
  }
}

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
  const archive = path.join(resources, 'app.asar');
  verifyArchiveFiles(asar.listPackage(archive));
  verifyLicenseConfiguration(JSON.parse(asar.extractFile(archive, 'licensing-config.json').toString('utf8')));
  console.info(`Verified packaged application, Chromium and SQLite WASM: ${resources}`);
};
module.exports.verifyArchiveFiles = verifyArchiveFiles;
