const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepare = require('./prepare-browsers.cjs');
const config = require('../package.json');

test('release targets map to matching Chromium platforms', () => {
  assert.deepEqual(prepare.target('win32', 1), { directory: 'win-x64', host: 'win64' });
  assert.equal(prepare.target('darwin', 3).host, 'mac15-arm64');
  assert.equal(prepare.target('darwin', 1).directory, 'mac-x64');
  assert.throws(() => prepare.target('win32', 3), /Unsupported/);
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
