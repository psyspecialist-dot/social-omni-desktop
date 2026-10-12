const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = createRequire(path.resolve(__dirname, '../db/package.json'))('pg');
const { createAuthority, keyHash, supportEnd } = require('./license-authority.cjs');
const { verify } = require('./license-crypto.cjs');
test('real PostgreSQL authority atomically enforces 1/5/10/50 devices, retries and same-machine renewal', { timeout: 60000 }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  const pair = crypto.generateKeyPairSync('ed25519');
  const authority = createAuthority({ pool, signingKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') });
  const pub = authority.publicKey(), ids = [];
  try {
    for (const max of [1, 5, 10, 50]) {
      const issued = await authority.issue({ maxDevices: max, supportPlan: 'none' });
      const id = issued.licenseId, key = issued.key;
      ids.push(id);
      assert.equal((await pool.query('SELECT key_hash FROM social_najhin_licenses WHERE id=$1', [id])).rows[0].key_hash, keyHash(key));
      const machines = Array.from({ length: max + 3 }, (_, i) => crypto.createHash('sha256').update(`${id}:${i}`).digest('hex'));
      const results = await Promise.allSettled(machines.map(machineId => authority.activate({ key, machineId })));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, max);
      for (const r of results.filter(r => r.status === 'rejected')) assert.equal(r.reason.status, 409);
      const winner = results.findIndex(r => r.status === 'fulfilled');
      const repeat = await Promise.all(Array.from({ length: 8 }, () => authority.activate({ key, machineId: machines[winner] })));
      repeat.forEach(r => assert.equal(verify(r.certificate, pub, machines[winner]).devicesUsed, max));
      assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM social_najhin_activations WHERE license_id=$1', [id])).rows[0].n), max);
      await authority.renew(id, 'yearly');
      const renewed = await authority.activate({ key, machineId: machines[winner] });
      assert.equal(verify(renewed.certificate, pub, machines[winner]).supportPlan, 'yearly');
      assert.equal((await authority.list()).some(l => l.id === id && l.devices_used === max), true);
      await authority.disable(id);
      await assert.rejects(() => authority.activate({ key, machineId: machines[winner] }), { status: 403 });
      // A permanent offline certificate cannot be remotely revoked.
      assert.equal(verify(renewed.certificate, pub, machines[winner]).entitlement, 'perpetual');
    }
    await assert.rejects(() => authority.activate({ key: 'fake', machineId: 'a'.repeat(64) }), { status: 400 });
    await assert.rejects(() => authority.issue({ maxDevices: 0 }), { status: 400 });
    await assert.rejects(() => createAuthority({ pool }).activate({}), { status: 503 });
  } finally {
    if (ids.length) {
      await pool.query('DELETE FROM social_najhin_activations WHERE license_id=ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM social_najhin_licenses WHERE id=ANY($1::uuid[])', [ids]);
    }
    await pool.end();
  }
});
test('monthly/yearly support periods use calendar dates and clamp leap days', () => {
  assert.equal(supportEnd('monthly', new Date('2026-01-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(supportEnd('yearly', new Date('2024-02-29T12:00:00Z')).toISOString(), '2025-02-28T12:00:00.000Z');
});
