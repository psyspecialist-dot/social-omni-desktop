const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDevelopmentLicense, NOTICE } = require('./dev-license.cjs');
const { createLicenseClient } = require('../license-client.cjs');
const { generateKeyPairSync } = require('node:crypto');

test('local dev license needs no Secrets, stays visibly marked, and cannot activate production', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-dev-'));
  const file = path.join(dir, 'certificate.bin');
  const secureStore = { available: () => true, encrypt: value => Buffer.from(value), decrypt: value => value.toString() };
  try {
    const opts = { isPackaged: false, file, secureStore, detect: () => 'a'.repeat(64) };
    const dev = await createDevelopmentLicense(opts);
    assert.equal(dev.status().status, 'active');
    assert.equal(dev.status().error, NOTICE);
    assert.doesNotThrow(() => dev.assertActive());
    const productionKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const production = createLicenseClient({ ...opts, config: { serverUrl: 'https://authority.example', publicKey: productionKey } });
    assert.equal(production.status().status, 'invalid');
    assert.throws(() => production.assertActive());
    await assert.rejects(() => createDevelopmentLicense({ ...opts, isPackaged: true }), /unavailable/);
    await assert.rejects(() => createDevelopmentLicense({ ...opts, isPackaged: undefined }), /unavailable/);
    await assert.rejects(() => createDevelopmentLicense({ ...opts, secureStore: { available: () => false } }), /encryption/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
