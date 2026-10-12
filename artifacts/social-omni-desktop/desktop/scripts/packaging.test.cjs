const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepare = require('./prepare-browsers.cjs');
const config = require('../package.json');

test('release builder and Windows peer stay on the Node-20-compatible version', () => {
  assert.equal(config.devDependencies['electron-builder'], '26.0.12');
  assert.equal(config.devDependencies['electron-builder-squirrel-windows'], '26.0.12');
  assert.equal(config.devDependencies.electron, '^40.0.0', 'preserve the app runtime');
  assert.ok(config.build.win.target.some(target => target.target === 'nsis' && target.arch.includes('x64')));
  for (const target of ['dmg', 'zip']) {
    assert.deepEqual(config.build.mac.target.find(entry => entry.target === target).arch, ['x64', 'arm64']);
  }
});

test('release targets map to matching Chromium platforms', () => {
  assert.deepEqual(prepare.target('win32', 1), { directory: 'win-x64', host: 'win64' });
  assert.equal(prepare.target('darwin', 3).host, 'mac15-arm64');
  assert.equal(prepare.target('darwin', 1).directory, 'mac-x64');
  assert.throws(() => prepare.target('win32', 3), /Unsupported/);
});
test('CI builds native Windows NSIS and macOS DMG/ZIP, without packaging the dev signer', () => {
  const workflowFile = [
    path.resolve(__dirname, '../source/.github/workflows/desktop-installers.yml'),
    path.resolve(__dirname, '../../../../.github/workflows/desktop-installers.yml'),
  ].find(file => fs.existsSync(file));
  assert.ok(workflowFile, 'Workflow contract is included with standalone source');
  const workflow = fs.readFileSync(workflowFile, 'utf8');
  assert.match(workflow, /os: windows-2022/);
  assert.match(workflow, /os: macos-14/);
  assert.match(workflow, /Install and build Windows x64 NSIS/);
  assert.match(workflow, /Verify Windows NSIS installer and silent installation/);
  assert.match(workflow, /hdiutil verify/);
  assert.equal(config.scripts['build:win'], 'electron-builder --win nsis --x64');
  assert.ok(!config.build.files.includes('scripts/**/*'));
  assert.match(fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8'), /developmentLicense && app\.isPackaged/);
});
test('incomplete browser downloads cannot pass package verification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-package-'));
  try {
    fs.mkdirSync(path.join(dir, 'chromium-1234'));
    assert.equal(prepare.hasChromium(dir), false);
    fs.writeFileSync(path.join(dir, 'chromium-1234', 'INSTALLATION_COMPLETE'), '');
    assert.equal(prepare.hasChromium(dir), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('installer protects user data and ships runtime dependencies', () => {
  assert.equal(config.name, 'socialomni-desktop', 'preserve existing app identity');
  assert.equal(config.build.nsis.deleteAppDataOnUninstall, false);
  assert.ok(config.build.asarUnpack.includes('**/*.wasm'));
  assert.equal(config.build.extraResources[0].to, 'browser-runtime');
  assert.ok(config.dependencies.playwright);
  assert.ok(config.dependencies['sql.js']);
  assert.ok(!config.build.files.some(pattern => pattern.includes('source/')));
});
