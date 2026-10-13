const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createLicenseClient } = require('../license-client.cjs');
const { sign } = require('../license-crypto.cjs');
const { installEditing } = require('../editing.cjs');
test('offline activation, restart, wrong device, tampering, removal and disabled config', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-offline-test-'));
  try {
    const pair = crypto.generateKeyPairSync('ed25519'), machine = 'a'.repeat(64);
    const date = new Date().toISOString();
    const token = sign({ version: 1, product: 'social-najhin', entitlement: 'perpetual',
      licenseId: crypto.randomUUID(), machineId: machine, maxDevices: 1, devicesUsed: 1,
      kind: 'standard', supportPlan: 'none', supportUntil: null, purchasedAt: date, issuedAt: date }, pair.privateKey);
    const options = { file: path.join(dir, 'certificate'), config: { mode: 'offline', enabled: true,
      publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), releaseDate: '2026-10-12T00:00:00Z' },
      detect: () => machine, fetchImpl: () => { throw new Error('Offline activation must never call the network.'); },
      secureStore: { available: () => true, encrypt: s => Buffer.from(s), decrypt: b => b.toString() } };
    const client = createLicenseClient(options);
    assert.equal(client.status().status, 'not_activated');
    await client.activate(token);
    assert.equal(createLicenseClient(options).status().status, 'active');
    await assert.rejects(() => client.activate(token + 'x'));
    assert.equal(client.status().status, 'active', 'bad keys cannot overwrite an active certificate');
    assert.equal(createLicenseClient({ ...options, detect: () => 'b'.repeat(64) }).status().status, 'invalid');
    await assert.rejects(() => createLicenseClient({ ...options, secureStore: { available: () => false } }).activate(token), /encryption/);
    client.remove(); assert.equal(client.status().status, 'not_activated');
    await client.activate(token); assert.equal(client.status().status, 'active');
    const disabled = createLicenseClient({ ...options, config: { enabled: false } });
    assert.equal(disabled.status().status, 'disabled'); assert.doesNotThrow(() => disabled.assertActive());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('native editing exposes platform roles and verifies clipboard content', () => {
  let handler, clipboardValue, menu;
  const attach = installEditing({ app: {}, Menu: { buildFromTemplate: t => t, setApplicationMenu: t => { menu = t; } },
    clipboard: { writeText: text => { clipboardValue = text; }, readText: () => clipboardValue },
    ipcMain: { handle: (_name, fn) => { handler = fn; } }, assertTrustedSender: e => { if (!e.trusted) throw new Error('Untrusted'); }, getWindow: () => null });
  assert.equal(typeof attach, 'function');
  assert.ok(menu.find(m => m.label === 'Edit / تحرير').submenu.some(m => m.role === 'paste'));
  assert.equal(handler({ trusted: true }, 'device'), true);
  assert.throws(() => handler({}, 'device'), /Untrusted/);
  assert.throws(() => handler({ trusted: true }, 'x'.repeat(6001)), /Invalid clipboard/);
  let mismatchHandler;
  installEditing({ app: {}, Menu: { buildFromTemplate: t => t, setApplicationMenu: () => {} },
    clipboard: { writeText: () => {}, readText: () => 'different' },
    ipcMain: { handle: (_name, fn) => { mismatchHandler = fn; } }, assertTrustedSender: () => {}, getWindow: () => null });
  assert.throws(() => mismatchHandler({}, 'device'), /Clipboard verification failed/);
});
