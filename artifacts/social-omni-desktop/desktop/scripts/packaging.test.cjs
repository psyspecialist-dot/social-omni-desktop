const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const prepare = require('./prepare-browsers.cjs');
const config = require('../package.json');
const { verifyArchiveFiles } = require('./verify-package.cjs');

const archiveFixture = [
  'main.js', 'preload.js', 'editing.cjs', 'api-service.cjs', 'renderer/index.html',
  'license-client.cjs', 'license-crypto.cjs', 'license-machine.cjs', 'licensing-config.json',
  'smart-replies.cjs', 'whatsapp-media.cjs', 'facebook-media.cjs', 'wa-suite-browser.cjs',
  ...['express', 'playwright', 'sql.js', 'nodemailer', 'telegram', 'cheerio']
    .map(name => `node_modules/${name}/package.json`),
];

test('ASAR verification accepts Windows and POSIX separators, with or without a leading separator', () => {
  for (const separator of ['/', '\\']) {
    for (const prefix of ['', separator]) {
      const entries = archiveFixture.map(file => prefix + file.replace(/\//g, separator));
      assert.doesNotThrow(() => verifyArchiveFiles(entries));
    }
  }
});

test('ASAR verification still rejects each genuinely missing runtime file', () => {
  for (const missing of archiveFixture) {
    const entries = archiveFixture.filter(file => file !== missing).map(file => `\\${file.replace(/\//g, '\\')}`);
    assert.throws(() => verifyArchiveFiles(entries), { message: `Packaged runtime file is missing: ${missing}` });
  }
});

test('ASAR verification blocks the dev signer on Windows and POSIX hosts', () => {
  for (const signer of ['/scripts/dev-license.cjs', '\\scripts\\dev-license.cjs', 'scripts/dev-license.cjs']) {
    assert.throws(() => verifyArchiveFiles([...archiveFixture, signer]), /Development signer must not ship/);
  }
});

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
  assert.match(workflow, /\$installDir = Join-Path \$env:RUNNER_TEMP 'najhin-install-check'/);
  assert.match(workflow, /ArgumentList "\/S", "\/currentuser", "\/D=\$installDir"/);
  assert.match(workflow, /hdiutil verify/);
  assert.equal(config.scripts['build:win'], 'electron-builder --win nsis');
  assert.equal((workflow.match(/uses: actions\/setup-node@v4/g) || []).length, 2);
  assert.equal((workflow.match(/node-version: '20'/g) || []).length, 2);
  assert.doesNotMatch(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24\s*:/);
  assert.match(workflow, /Verify source build uses Node\.js 20/);
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
