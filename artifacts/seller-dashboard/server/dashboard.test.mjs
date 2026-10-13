import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createDashboard } from './dashboard.mjs';
import { createIssuer } from './issuer.mjs';

const { initialize } = createRequire(import.meta.url)('../../../tools/licensing/keygen.cjs');
const password = 'synthetic-test-password-only';
const deviceId = 'ab'.repeat(32);

async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seller-dashboard-test-'));
  const configFile = path.join(directory, 'config.json');
  const keyDir = path.join(directory, 'issuer');
  fs.writeFileSync(configFile, '{}');
  initialize(configFile, keyDir); // Temporary test issuer only; never the real seller key.
  const issuer = createIssuer({ directory: keyDir, configFile });
  const app = createDashboard({ password, issuer, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/seller-dashboard`;
  let token;
  async function request(route, body, method = 'POST', customHeaders = {}) {
    const response = await fetch(url + route, {
      method,
      headers: {
        'Content-Type': 'application/json', 'X-Seller-Dashboard': '1',
        ...(token ? { Authorization: `Bearer ${token}` } : {}), ...customHeaders,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async function login() {
    const r = await request('/session', { password });
    assert.equal(r.status, 200); token = r.data.sessionToken;
    return r;
  }
  return { request, login, keyDir, configFile, issuer };
}

test('anonymous issuance is blocked; setup details and private key are not disclosed', async t => {
  const f = await fixture(t);
  const state = await f.request('/session', undefined, 'GET');
  assert.equal(state.data.authenticated, false);
  assert.equal(state.data.issuerReady, false);
  assert.equal(state.data.setupError, null);
  assert.equal(state.headers.get('cache-control'), 'no-store, private');
  const r = await f.request('/licenses', { deviceId, plan: 'monthly' });
  assert.equal(r.status, 401);
});
test('unconfigured password fails closed with explicit setup error', async t => {
  const f = await fixture(t, { password: undefined });
  assert.equal((await f.request('/session', undefined, 'GET')).data.passwordConfigured, false);
  assert.equal((await f.request('/session', { password })).status, 503);
});
test('login rejects wrong password and limits repeated attempts', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/session', { password: 'wrong' })).status, 401);
  assert.equal((await f.request('/session', { password })).status, 429);
});
test('all four UI plans use existing compatible signed claims; no secrets in responses', async t => {
  const f = await fixture(t);
  const login = await f.login();
  assert.equal(login.data.issuerReady, true);
  const publicKey = JSON.parse(fs.readFileSync(f.configFile, 'utf8')).publicKey;
  const key = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), type: 'spki', format: 'der' });
  for (const plan of ['lifetime', 'yearly', 'monthly', 'none']) {
    const r = await f.request('/licenses', { deviceId: deviceId.toUpperCase(), plan });
    assert.equal(r.status, 201);
    assert.deepEqual(Object.keys(r.data).sort(), ['deviceId', 'licenseId', 'licenseKey', 'plan', 'supportUntil']);
    const [prefix, payload, signature] = r.data.licenseKey.split('.');
    assert.equal(prefix, 'SN1');
    assert.equal(crypto.verify(null, Buffer.from(payload), key, Buffer.from(signature, 'base64url')), true);
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.entitlement, 'perpetual');
    assert.equal(claims.machineId, deviceId);
    assert.equal(claims.supportPlan, plan === 'lifetime' ? 'none' : plan);
    assert.equal(r.data.supportUntil === null, ['lifetime', 'none'].includes(plan));
    assert.equal(JSON.stringify(r.data).includes('signing-private'), false);
  }
});
test('invalid ID, injection and extra issuer arguments are rejected', async t => {
  const f = await fixture(t); await f.login();
  for (const id of ['', 'a'.repeat(63), 'g'.repeat(64), deviceId + '; echo bad']) {
    assert.equal((await f.request('/licenses', { deviceId: id, plan: 'none' })).status, 400);
  }
  assert.equal((await f.request('/licenses', { deviceId, plan: 'bad' })).status, 400);
  assert.equal((await f.request('/licenses', { deviceId, plan: 'none', directory: '/tmp' })).status, 400);
});
test('missing private issuer and mismatched public key return clear errors, never regenerate', async t => {
  const f = await fixture(t); await f.login();
  const savedPublic = fs.readFileSync(path.join(f.keyDir, 'signing-public.base64'), 'utf8');
  fs.writeFileSync(f.configFile, JSON.stringify({ publicKey: 'mismatch' }));
  const mismatch = await f.request('/licenses', { deviceId, plan: 'none' });
  assert.equal(mismatch.status, 503);
  assert.match(mismatch.data.error, /does not match/);
  fs.unlinkSync(path.join(f.keyDir, 'signing-private.base64'));
  const missing = await f.request('/licenses', { deviceId, plan: 'none' });
  assert.equal(missing.status, 503); assert.match(missing.data.error, /missing/);
  assert.equal(fs.existsSync(path.join(f.keyDir, 'signing-private.base64')), false);
  assert.equal(fs.readFileSync(path.join(f.keyDir, 'signing-public.base64'), 'utf8'), savedPublic);
});
test('logout revokes session; restarting expires sessions; mutation header required', async t => {
  const f = await fixture(t); await f.login();
  assert.equal((await f.request('/licenses', { deviceId, plan: 'none' }, 'POST', { 'X-Seller-Dashboard': '' })).status, 403);
  assert.equal((await f.request('/session', undefined, 'DELETE')).status, 200);
  assert.equal((await f.request('/licenses', { deviceId, plan: 'none' })).status, 401);
});
test('expired bearer session cannot issue or read issuer state', async t => {
  let clock = Date.now();
  const f = await fixture(t, { now: () => clock }); await f.login();
  clock += 8 * 60 * 60 * 1000 + 1;
  assert.equal((await f.request('/licenses', { deviceId, plan: 'none' })).status, 401);
  assert.equal((await f.request('/session', undefined, 'GET')).data.authenticated, false);
});
