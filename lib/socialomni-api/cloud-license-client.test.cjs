const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCloudLicenseClient } = require('./cloud-license-client.cjs');
const DEVICE = 'a'.repeat(64);
const snapshot = (active = false) => ({
  user: { user_id: '11111111-1111-4111-8111-111111111111', email: 'test@example.invalid', status: 'active' },
  device: { device_id: DEVICE, name: 'Test', platform: 'linux', app_version: '1.0.4', status: active ? 'active' : 'pending', is_current: true, activated_at: active ? new Date().toISOString() : null, last_seen_at: new Date().toISOString() },
  entitlement: { eligible: true, app_access: active, access_model: 'perpetual', reason: active ? 'OK' : 'DEVICE_NOT_ACTIVE', updates_allowed: false, support_until: '2020-01-01T00:00:00Z' },
  subscription: { status: 'expired', current_period_end: '2020-01-01T00:00:00Z', cancel_at_period_end: false },
  device_limits: { max_devices: 1, active_devices: active ? 1 : 0 },
  server_time: new Date().toISOString(), check_after_seconds: 900, offline_grace_seconds: 0,
});
const session = (s = snapshot()) => ({
  access_token: 'A'.repeat(43), refresh_token: 'R'.repeat(64), token_type: 'Bearer', expires_in: 900,
  session_expires_at: new Date(Date.now() + 86400000).toISOString(), access: s,
});
function fixture(t, handler, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-client-'));
  const file = path.join(dir, 'session.bin');
  const requests = [];
  let elapsed = 100;
  const options = {
    file, config: { serverUrl: 'https://accounts.example.invalid' }, detect: () => DEVICE,
    clock: () => elapsed,
    secureStore: { available: () => true, encrypt: v => Buffer.from(v).toString('base64'), decrypt: v => Buffer.from(v.toString(), 'base64').toString() },
    fetchImpl: async (url, init) => {
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal);
      requests.push({ route: new URL(url).pathname.replace('/v1/desktop/', ''), init });
      return handler(requests.at(-1), requests);
    }, ...overrides,
  };
  const client = createCloudLicenseClient(options);
  t.after(() => { client.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { client, options, file, requests, advance: ms => { elapsed += ms; } };
}
const json = (data, status = 200, headers) => new Response(JSON.stringify(data), { status, headers });
const credentials = { email: 'TEST@example.invalid', password: '  test-password  ' };

test('login exchanges credentials, auto-activates, redacts tokens and preserves perpetual access after support expiry', async t => {
  const f = fixture(t, ({ route, init }) => {
    if (route === 'auth/login') {
      const body = JSON.parse(init.body);
      assert.equal(body.email, 'test@example.invalid');
      assert.equal(body.password, credentials.password);
      assert.equal(body.device.device_id, DEVICE);
      assert.equal(body.device.app_version, '1.0.4');
      return json(session());
    }
    assert.equal(route, 'devices/activate');
    assert.equal(init.body, undefined);
    assert.equal(init.headers.authorization, `Bearer ${'A'.repeat(43)}`);
    return json(snapshot(true));
  }, { appVersion: '1.0.4' });
  const status = await f.client.login(credentials);
  assert.equal(status.status, 'active');
  assert.equal(status.supportActive, false);
  assert.doesNotThrow(() => f.client.assertActive());
  assert.ok(!JSON.stringify(status).includes('A'.repeat(43)));
  const saved = f.options.secureStore.decrypt(fs.readFileSync(f.file));
  assert.ok(!saved.includes('password'));
  assert.ok(!saved.includes('A'.repeat(43)));
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
});

test('a login without purchase cannot activate or authorize use', async t => {
  const s = snapshot();
  s.entitlement.eligible = false; s.entitlement.access_model = 'none'; s.entitlement.reason = 'NO_ENTITLEMENT';
  s.device_limits.max_devices = 0;
  const f = fixture(t, () => json(session(s)));
  const state = await f.client.login({ auth_token: `snp_${'T'.repeat(64)}` });
  assert.equal(state.cloud.signedIn, true);
  assert.equal(f.requests.length, 1);
  assert.throws(() => f.client.assertActive());
});

test('device limit remains a visible error, with an account session but no access', async t => {
  const f = fixture(t, ({ route }) => route === 'auth/login' ? json(session()) : json({ error: { code: 'DEVICE_LIMIT_REACHED' } }, 409));
  await assert.rejects(f.client.login(credentials), /Device limit reached/);
  assert.equal(f.client.status().cloud.signedIn, true);
  assert.equal(f.client.status().status, 'invalid');
  assert.throws(() => f.client.assertActive());
});

test('positive decisions expire monotonically and network errors cannot create offline access', async t => {
  let online = true;
  const f = fixture(t, () => { if (!online) throw new Error('network'); return json(session(snapshot(true))); });
  await f.client.login(credentials);
  online = false;
  await assert.rejects(f.client.recheck(), /Unable to verify/);
  assert.equal(f.client.status().status, 'active'); // Previously granted, still-fresh lease.
  f.advance(900001);
  assert.throws(() => f.client.assertActive());
});

test('explicit server denial immediately invalidates an unexpired positive decision', async t => {
  const denied = snapshot(true);
  denied.entitlement.app_access = false; denied.entitlement.eligible = false;
  denied.entitlement.reason = 'ENTITLEMENT_REVOKED';
  const f = fixture(t, ({ route }) => json(route === 'auth/login' ? session(snapshot(true)) : denied));
  await f.client.login(credentials);
  await f.client.recheck();
  assert.equal(f.client.status().cloud.reason, 'ENTITLEMENT_REVOKED');
  assert.throws(() => f.client.assertActive());
});

test('concurrent checks serialize rotation and never replay a refresh token', async t => {
  const f = fixture(t, ({ route }) => json(route.startsWith('auth/') ? session(snapshot(true)) : snapshot(true)));
  await f.client.login(credentials);
  f.advance(875000);
  await Promise.all([f.client.recheck(), f.client.recheck()]);
  assert.equal(f.requests.filter(r => r.route === 'auth/refresh').length, 1);
});

test('ambiguous refresh timeout destroys the consumed token and never retries it', async t => {
  const f = fixture(t, ({ route }) => {
    if (route === 'auth/refresh') throw new Error('timeout after send');
    return json(session(snapshot(true)));
  });
  await f.client.login(credentials);
  f.advance(875000);
  await assert.rejects(f.client.recheck());
  await assert.rejects(f.client.recheck());
  assert.equal(f.requests.filter(r => r.route === 'auth/refresh').length, 1);
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(f.client.status().cloud.signedIn, false);
});

test('restart restores only an encrypted, origin-bound refresh token; never a cached access decision', async t => {
  const f = fixture(t, () => json(session(snapshot(true))));
  await f.client.login(credentials);
  f.client.close();
  const restarted = createCloudLicenseClient(f.options);
  t.after(() => restarted.close());
  assert.equal(restarted.status().cloud.signedIn, true);
  assert.throws(() => restarted.assertActive());
  await restarted.recheck().catch(() => {});
  assert.equal(f.requests[1].route, 'auth/refresh');
});

test('safeStorage failure permits memory-only login with a visible warning', async t => {
  const f = fixture(t, () => json(session(snapshot(true))), { secureStore: { available: () => false } });
  const state = await f.client.login(credentials);
  assert.equal(state.status, 'active');
  assert.match(state.cloud.warning, /will not survive/);
  assert.equal(fs.existsSync(f.file), false);
});

test('logout clears local tokens even if server revocation fails, without claiming success', async t => {
  const f = fixture(t, ({ route }) => {
    if (route === 'auth/logout') throw new Error('unavailable');
    return json(session(snapshot(true)));
  });
  await f.client.login(credentials);
  await assert.rejects(f.client.logout(), /Unable to verify/);
  assert.equal(f.client.status().cloud.signedIn, false);
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(f.requests.some(r => r.route === 'devices/current'), false);
});

test('detachment uses DELETE current and clears the session after a 204', async t => {
  const f = fixture(t, ({ route, init }) => {
    if (route === 'auth/login') return json(session(snapshot(true)));
    assert.equal(route, 'devices/current'); assert.equal(init.method, 'DELETE'); assert.equal(init.body, undefined);
    return new Response(null, { status: 204 });
  });
  await f.client.login(credentials);
  await f.client.detach();
  assert.equal(f.client.status().cloud.signedIn, false);
});

test('mixed credentials, injected seat counts, and a response for another machine fail closed', async t => {
  const bad = snapshot(true); bad.device.device_id = 'b'.repeat(64);
  const f = fixture(t, () => json(session(bad)));
  await assert.rejects(f.client.login({ ...credentials, auth_token: `snp_${'T'.repeat(64)}` }));
  await assert.rejects(f.client.login({ ...credentials, max_devices: 500 }));
  assert.equal(f.requests.length, 0);
  await assert.rejects(f.client.login(credentials), /invalid API response/);
  assert.throws(() => f.client.assertActive());
  assert.equal(fs.existsSync(f.file), false);
});

test('rate limiting honors Retry-After and suspend invalidates access before resume', async t => {
  let limited = false;
  const f = fixture(t, () => limited ? json({ error: { code: 'RATE_LIMITED' } }, 429, { 'retry-after': '120' }) : json(session(snapshot(true))));
  await f.client.login(credentials);
  f.client.suspend();
  assert.throws(() => f.client.assertActive());
  limited = true;
  await assert.rejects(f.client.recheck());
  const count = f.requests.length;
  await assert.rejects(f.client.recheck());
  assert.equal(f.requests.length, count);
  assert.equal(f.client.status().cloud.retryAfterSeconds, 120);
});

test('activation rejection cannot leave a previously positive decision usable', async t => {
  const f = fixture(t, ({ route }) => route === 'auth/login' ? json(session(snapshot(true))) : json({ error: { code: 'DEVICE_BLOCKED' } }, 403));
  await f.client.login(credentials);
  await assert.rejects(f.client.activate(), /blocked/);
  assert.throws(() => f.client.assertActive());
});
