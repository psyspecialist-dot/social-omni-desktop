const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verify, sign } = require('./license-crypto.cjs');
const { createLicenseClient } = require('./license-client.cjs');
const { machineId } = require('./license-machine.cjs');
const createService = require('./service.cjs');
const express = require('../../artifacts/api-server/node_modules/express');
const NOW = Date.now();
const MACHINE = 'a'.repeat(64);
const pair = crypto.generateKeyPairSync('ed25519');
const pub = pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const claims = (extra = {}) => ({
  version: 1, product: 'social-najhin', entitlement: 'perpetual', licenseId: crypto.randomUUID(),
  machineId: MACHINE, maxDevices: 5, devicesUsed: 2, kind: 'reseller',
  supportPlan: 'monthly', supportUntil: new Date(NOW - 1000).toISOString(),
  issuedAt: new Date(NOW).toISOString(), ...extra,
  purchasedAt: new Date(NOW - 86400000).toISOString(),
});
function vault() {
  const key = crypto.randomBytes(32);
  return {
    available: () => true,
    encrypt(value) {
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    },
    decrypt(value) {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(-16));
      return Buffer.concat([decipher.update(value.subarray(12, -16)), decipher.final()]).toString('utf8');
    },
  };
}
test('signed certificates reject tampering, other machines, wrong issuer, and invalid allowances', () => {
  const c = claims(), token = sign(c, pair.privateKey);
  assert.equal(verify(token, pub, MACHINE, NOW).maxDevices, 5);
  const bits = token.split('.');
  bits[1] = Buffer.from(JSON.stringify({ ...c, maxDevices: 50 })).toString('base64url');
  assert.throws(() => verify(bits.join('.'), pub, MACHINE, NOW), /signature/);
  assert.throws(() => verify(token, pub, 'b'.repeat(64), NOW), /machine/);
  const other = crypto.generateKeyPairSync('ed25519');
  assert.throws(() => verify(sign(c, other.privateKey), pub, MACHINE, NOW), /signature/);
  assert.throws(() => verify(sign(claims({ maxDevices: 0 }), pair.privateKey), pub, MACHINE, NOW), /allowance/);
  assert.throws(() => verify(sign(claims({ issuedAt: new Date(NOW + 3600000).toISOString() }), pair.privateKey), pub, MACHINE, NOW), /clock/);
});
test('activation verifies before saving, persists encrypted, works offline after restart, and expired support keeps core use', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-license-'));
  const file = path.join(dir, 'certificate.bin'), store = vault();
  let requests = 0;
  const config = { serverUrl: 'https://authority.example', publicKey: pub };
  const opts = { file, config, secureStore: store, detect: () => MACHINE, now: () => NOW };
  try {
    const manager = createLicenseClient({ ...opts, fetchImpl: async (_url, request) => {
      requests++; assert.equal(request.redirect, 'error');
      assert.equal(JSON.parse(request.body).machineId, MACHINE);
      return { ok: true, json: async () => ({ certificate: sign(claims(), pair.privateKey) }) };
    } });
    assert.equal(manager.status().status, 'not_activated');
    await manager.activate(`SNK-${crypto.randomBytes(32).toString('base64url')}`);
    assert.equal(requests, 1); assert.equal(manager.status().status, 'active');
    assert.equal(manager.status().supportActive, false);
    assert.doesNotThrow(() => manager.assertActive());
    assert.equal(fs.readFileSync(file).includes(Buffer.from('SN1.')), false);
    const offline = createLicenseClient({ ...opts, fetchImpl: () => { throw new Error('No network available'); } });
    assert.equal(offline.status().status, 'active');
    assert.doesNotThrow(() => offline.assertActive());
    const newer = createLicenseClient({ ...opts, config: { ...config, releaseDate: new Date(NOW + 1000).toISOString() } });
    assert.equal(newer.status().status, 'invalid'); assert.throws(() => newer.assertActive());
    const covered = createLicenseClient({ ...opts, config: { ...config, releaseDate: new Date(NOW - 2000).toISOString() } });
    assert.equal(covered.status().status, 'active');
    assert.equal(createLicenseClient({ ...opts, detect: () => 'b'.repeat(64) }).status().status, 'invalid');
    const before = fs.readFileSync(file);
    const invalid = createLicenseClient({ ...opts, fetchImpl: async () => ({ ok: true, json: async () => ({ certificate: 'SN1.invalid.invalid' }) }) });
    await assert.rejects(() => invalid.activate(`SNK-${crypto.randomBytes(32).toString('base64url')}`));
    assert.deepEqual(fs.readFileSync(file), before);
    offline.remove(); assert.equal(offline.status().status, 'not_activated');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('unconfigured authority, unavailable Machine ID, and missing OS encryption never activate', async () => {
  const opts = { file: '/tmp/not-written-license', secureStore: { available: () => false },
    config: { serverUrl: 'https://authority.example', publicKey: pub }, detect: () => MACHINE };
  const noEncryption = createLicenseClient(opts);
  await assert.rejects(() => noEncryption.activate(`SNK-${crypto.randomBytes(32).toString('base64url')}`), /encryption/);
  const noAuthority = createLicenseClient({ ...opts, config: {} });
  assert.equal(noAuthority.status().status, 'unconfigured'); assert.throws(() => noAuthority.assertActive());
  const noMachine = createLicenseClient({ ...opts, detect: () => { throw new Error('Machine ID unavailable'); } });
  assert.equal(noMachine.status().machineId, null);
  await assert.rejects(() => noMachine.activate('anything'), /Machine ID/);
});
test('Machine ID parsers hash stable Mac/Windows/Linux identifiers and refuse absent or zero identifiers', () => {
  const raw = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const mac = () => machineId({ platform: 'darwin', run: () => `"IOPlatformUUID" = "${raw}"` });
  const windows = () => machineId({ platform: 'win32', run: () => `MachineGuid    REG_SZ    ${raw}` });
  const linux = () => machineId({ platform: 'linux', read: () => raw });
  assert.match(mac(), /^[a-f0-9]{64}$/); assert.equal(mac(), mac());
  assert.equal(windows(), mac()); assert.equal(linux(), mac());
  assert.notEqual(mac(), raw);
  assert.throws(() => machineId({ platform: 'linux', read: () => '0'.repeat(32) }), /unavailable/);
  assert.throws(() => machineId({ platform: 'darwin', run: () => '' }), /unavailable/);
});
test('native API license guard preserves inspection, settings and bootstrap, rejects unlicensed writes, and accepts activation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-license-api-'));
  let active = false;
  const manager = {
    status: () => ({ native: true, status: active ? 'active' : 'not_activated' }),
    assertActive() { if (!active) throw Object.assign(new Error('Activation required'), { status: 403 }); },
    async activate(key) { if (key !== 'approved') throw new Error('Invalid key'); active = true; },
    remove() { active = false; },
  };
  const service = createService({ express, dbPath: path.join(dir, 'data.sqlite'), licenseClient: manager });
  const app = express(); app.use(express.json()); app.use(service.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const call = (method, route, body) => fetch(`http://127.0.0.1:${server.address().port}${route}`, { method,
    headers: { 'content-type': 'application/json', 'x-socialomni-workspace': crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined });
  try {
    assert.equal((await call('GET', '/license')).status, 200);
    assert.equal((await call('POST', '/initialize')).status, 200);
    assert.equal((await call('PUT', '/settings', { language: 'ar' })).status, 200);
    assert.equal((await call('PUT', '/settings', { licenseKey: 'fake' })).status, 400);
    assert.equal((await call('POST', '/jobs', {})).status, 403);
    assert.equal((await call('POST', '/license/activate', { key: 'wrong' })).status, 400);
    const result = await call('POST', '/license/activate', { key: 'approved' });
    assert.equal(result.status, 200); assert.equal((await result.json()).license.status, 'active');
    assert.equal((await call('DELETE', '/license')).status, 200);
    assert.equal((await call('POST', '/jobs', {})).status, 403);
  } finally { await service.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});
