const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initialize, issue } = require('./keygen.cjs');
const { verify } = require('../../lib/socialomni-api/license-crypto.cjs');
test('seller tool issues compatible device-bound licenses without exposing the private key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-keygen-test-'));
  try {
    const configFile = path.join(dir, 'config.json');
    fs.writeFileSync(configFile, '{}');
    const setup = initialize(configFile, path.join(dir, 'private'));
    assert.equal(Object.keys(setup).includes('privateKey'), false);
    const config = JSON.parse(fs.readFileSync(configFile));
    assert.equal(config.mode, 'offline'); assert.equal(config.enabled, true);
    for (const plan of ['none', 'monthly', 'yearly']) {
      const result = issue('a'.repeat(64), { directory: path.join(dir, 'private'), plan });
      assert.equal(verify(result.licenseKey, setup.publicKey, 'a'.repeat(64)).supportPlan, plan);
      assert.throws(() => verify(result.licenseKey, setup.publicKey, 'b'.repeat(64)), /not valid for this machine/);
    }
    assert.throws(() => initialize(configFile, path.join(dir, 'private')), /already exists/);
    assert.throws(() => issue('bad', { directory: dir }), /64 hexadecimal/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
