const fs = require('node:fs');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { machineId } = require('./license-machine.cjs');

const failure = (code, status = 400) => Object.assign(new Error(code), { code, status });
const MESSAGES = {
  INVALID_CREDENTIALS: 'Email, password or personal login token is incorrect.',
  INVALID_SESSION: 'Your cloud session is no longer valid. Sign in again.',
  SESSION_EXPIRED: 'Your cloud session expired. Sign in again.',
  REFRESH_REUSED: 'Your cloud session was revoked. Sign in again.',
  ACCOUNT_SUSPENDED: 'Your account is suspended. Contact the seller.',
  DEVICE_LIMIT_REACHED: 'Device limit reached. Manage your devices on the account website.',
  DEVICE_BLOCKED: 'This device is blocked. Contact the seller.',
  NO_ENTITLEMENT: 'This account has no purchase entitlement.',
  ENTITLEMENT_SUSPENDED: 'Your purchase entitlement is suspended.',
  ENTITLEMENT_REVOKED: 'Your purchase entitlement was revoked.',
  SUBSCRIPTION_INACTIVE: 'The access subscription is inactive.',
  DEVICE_NOT_ACTIVE: 'This device is not activated.',
  APP_ACCESS_DENIED: 'Cloud access was denied.',
  RATE_LIMITED: 'Too many requests. Wait before trying again.',
  SERVICE_UNAVAILABLE: 'Unable to verify cloud access. Check your connection and try again.',
  INVALID_RESPONSE: 'The account website returned an invalid API response.',
  INVALID_CONFIGURATION: 'Cloud authority is not configured in this release.',
  MACHINE_ID_UNAVAILABLE: 'Machine ID is unavailable. Activation was not attempted.',
  SECURE_STORAGE: 'Secure system storage is unavailable. This session will not survive an app restart.',
};

// Only this main-process object ever holds authentication tokens.
function createCloudLicenseClient({
  file, config, secureStore, fetchImpl = fetch, detect = machineId,
  appVersion = '1.0.4', platform = process.platform, deviceName = os.hostname(),
  clock = () => performance.now(), wallClock = () => Date.now(),
}) {
  let device = null, configured = false, configurationError = null, base = '';
  try {
    const url = new URL(config.serverUrl);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
      throw failure('INVALID_CONFIGURATION');
    }
    base = url.origin;
  } catch { configurationError = 'INVALID_CONFIGURATION'; }
  if (!configurationError) {
    try {
      device = detect();
      if (!/^[a-f0-9]{64}$/.test(device)) throw failure('MACHINE_ID_UNAVAILABLE');
      configured = true;
    } catch { device = null; configured = false; configurationError = 'MACHINE_ID_UNAVAILABLE'; }
  }
  let accessToken = null, refreshToken = null, snapshot = null;
  let tokenUntil = 0, decisionUntil = 0, nextCheck = 0, retryUntil = 0;
  let error = null, warning = null, busy = false, stopped = false;
  let queue = Promise.resolve();
  const serial = fn => {
    const promise = queue.then(async () => {
      busy = true;
      try { return await fn(); } finally { busy = false; }
    });
    queue = promise.catch(() => {});
    return promise;
  };
  const erase = () => {
    accessToken = refreshToken = null;
    snapshot = null;
    tokenUntil = decisionUntil = nextCheck = 0;
    fs.rmSync(file, { force: true });
  };
  const save = () => {
    if (!secureStore.available()) {
      fs.rmSync(file, { force: true });
      warning = MESSAGES.SECURE_STORAGE;
      return;
    }
    try {
      const encrypted = secureStore.encrypt(JSON.stringify({ origin: base, device, refreshToken }));
      fs.writeFileSync(`${file}.tmp`, encrypted, { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
      warning = null;
    } catch {
      fs.rmSync(file, { force: true });
      warning = MESSAGES.SECURE_STORAGE;
    }
  };
  const validateSnapshot = value => {
    const e = value?.entitlement, d = value?.device, u = value?.user, limits = value?.device_limits;
    const reasons = ['OK', 'NO_ENTITLEMENT', 'ENTITLEMENT_SUSPENDED', 'ENTITLEMENT_REVOKED', 'SUBSCRIPTION_INACTIVE', 'DEVICE_NOT_ACTIVE', 'DEVICE_BLOCKED'];
    if (!e || !d || !u || !limits || d.device_id !== device || d.is_current !== true ||
      !['pending', 'active', 'revoked', 'blocked'].includes(d.status) ||
      !['active', 'suspended'].includes(u.status) || typeof u.email !== 'string' || typeof u.user_id !== 'string' ||
      !['none', 'perpetual', 'subscription'].includes(e.access_model) || !reasons.includes(e.reason) ||
      typeof e.app_access !== 'boolean' || typeof e.eligible !== 'boolean' || typeof e.updates_allowed !== 'boolean' ||
      !Number.isInteger(limits.max_devices) || limits.max_devices < 0 || limits.max_devices > 500 ||
      !Number.isInteger(limits.active_devices) || limits.active_devices < 0 ||
      !Number.isInteger(value.check_after_seconds) || value.check_after_seconds < 1 || value.check_after_seconds > 900 ||
      value.offline_grace_seconds !== 0 || !Number.isFinite(Date.parse(value.server_time)) ||
      !value.subscription || !['none', 'trialing', 'active', 'past_due', 'canceled', 'expired'].includes(value.subscription.status)) {
      throw failure('INVALID_RESPONSE', 502);
    }
    if (e.app_access && (!e.eligible || u.status !== 'active' || d.status !== 'active' || e.reason !== 'OK' ||
      e.access_model === 'none' || limits.active_devices < 1 || limits.active_devices > limits.max_devices)) {
      throw failure('INVALID_RESPONSE', 502);
    }
    if (e.app_access && e.access_model === 'subscription' &&
      (!['active', 'trialing'].includes(value.subscription.status) ||
       !(Date.parse(value.subscription.current_period_end) > Date.parse(value.server_time)))) {
      throw failure('INVALID_RESPONSE', 502);
    }
    return value;
  };
  const acceptSnapshot = (value, started) => {
    snapshot = validateSnapshot(value);
    // Response latency counts toward the lease; never extend a decision using local wall time.
    decisionUntil = started + value.check_after_seconds * 1000;
    nextCheck = Math.max(clock(), decisionUntil - Math.min(30000, value.check_after_seconds * 200));
    error = value.entitlement.app_access ? null : (MESSAGES[value.entitlement.reason] || MESSAGES.APP_ACCESS_DENIED);
  };
  async function request(route, { method = 'GET', body, token } = {}) {
    if (!configured) throw failure(configurationError || 'INVALID_CONFIGURATION');
    if (clock() < retryUntil) throw failure('RATE_LIMITED', 429);
    let response;
    try {
      response = await fetchImpl(`${base}/v1/desktop/${route}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw failure('SERVICE_UNAVAILABLE', 503); }
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      retryUntil = clock() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000;
    }
    if (response.status === 204 && response.ok) return null;
    const text = await response.text();
    if (text.length > 262144) throw failure('INVALID_RESPONSE', 502);
    let data;
    try { data = JSON.parse(text); } catch { throw failure('INVALID_RESPONSE', 502); }
    if (!response.ok) throw failure(Object.hasOwn(MESSAGES, data?.error?.code) ? data.error.code : 'SERVICE_UNAVAILABLE', response.status);
    return data;
  }
  const acceptSession = (data, started) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(data?.access_token) ||
      !/^[A-Za-z0-9_-]{64}$/.test(data?.refresh_token) || data.token_type !== 'Bearer' ||
      data.expires_in !== 900 || !(Date.parse(data.session_expires_at) > wallClock())) throw failure('INVALID_RESPONSE', 502);
    validateSnapshot(data.access);
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    tokenUntil = started + data.expires_in * 1000;
    acceptSnapshot(data.access, started);
    save();
  };
  async function rotate() {
    if (!refreshToken) throw failure('INVALID_SESSION', 401);
    const old = refreshToken, started = clock();
    // Delete the consumed token before sending. A timeout must never replay it.
    refreshToken = null;
    fs.rmSync(file, { force: true });
    try { acceptSession(await request('auth/refresh', { method: 'POST', body: { refresh_token: old } }), started); }
    catch (e) { erase(); throw e; }
  }
  async function authorized(route, options) {
    if (!accessToken || clock() >= tokenUntil - 30000) await rotate();
    try { return await request(route, { ...options, token: accessToken }); }
    catch (e) {
      if (e.status !== 401) throw e;
      await rotate();
      return request(route, { ...options, token: accessToken });
    }
  }
  async function check() {
    const started = clock();
    try { acceptSnapshot(await authorized('entitlement'), started); }
    catch (e) {
      error = MESSAGES[e.code] || MESSAGES.SERVICE_UNAVAILABLE;
      if ([401, 403].includes(e.status) || e.code === 'INVALID_RESPONSE') decisionUntil = 0;
      if (e.status === 401) erase();
      nextCheck = clock() + 30000;
      throw e;
    }
  }
  const status = () => {
    const active = !!snapshot?.entitlement.app_access && clock() < decisionUntil;
    return {
      native: true, enabled: true, mode: 'cloud', configured,
      status: !configured ? 'unconfigured' : active ? 'active' : snapshot || refreshToken ? 'invalid' : 'not_activated',
      machineId: device, licenseId: snapshot?.user.user_id || null,
      maxDevices: snapshot?.device_limits.max_devices ?? null,
      devicesUsed: snapshot?.device_limits.active_devices ?? null,
      kind: null, supportPlan: null, supportUntil: snapshot?.entitlement.support_until || null,
      supportActive: !!snapshot?.entitlement.updates_allowed,
      activatedAt: snapshot?.device.activated_at || null, serverUrl: base,
      error: (configurationError && MESSAGES[configurationError]) || error || (snapshot && !active ? MESSAGES.SERVICE_UNAVAILABLE : null),
      cloud: { signedIn: !!(accessToken || refreshToken), email: snapshot?.user.email || null,
        deviceStatus: snapshot?.device.status || null, accessModel: snapshot?.entitlement.access_model || null,
        reason: snapshot?.entitlement.reason || null, warning, busy, retryAfterSeconds: Math.max(0, Math.ceil((retryUntil - clock()) / 1000)) },
    };
  };
  const report = async fn => {
    try { return await fn(); }
    catch (e) {
      if ([401, 403].includes(e.status) || e.code === 'INVALID_RESPONSE') decisionUntil = 0;
      error = MESSAGES[e.code] || MESSAGES.SERVICE_UNAVAILABLE;
      throw Object.assign(new Error(error), { status: e.status || 503 });
    }
  };
  const client = {
    status,
    assertActive() {
      if (status().status !== 'active') throw Object.assign(new Error(error || MESSAGES.SERVICE_UNAVAILABLE), { status: 403 });
    },
    login: credentials => serial(() => report(async () => {
      const keys = Object.keys(credentials || {});
      const byToken = keys.length === 1 && keys[0] === 'auth_token' && /^snp_[A-Za-z0-9_-]{64}$/.test(credentials.auth_token);
      const byPassword = keys.length === 2 && keys.includes('email') && keys.includes('password') &&
        typeof credentials.email === 'string' && credentials.email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email.trim()) &&
        typeof credentials.password === 'string' && credentials.password.length > 0 && credentials.password.length <= 256;
      if (!byToken && !byPassword) throw failure('INVALID_CREDENTIALS');
      if (accessToken || refreshToken) throw failure('APP_ACCESS_DENIED', 409); // Sign out before switching accounts.
      const started = clock();
      acceptSession(await request('auth/login', { method: 'POST', body: {
        ...(byToken ? { auth_token: credentials.auth_token } : { email: credentials.email.trim().toLowerCase(), password: credentials.password }),
        device: { device_id: device, name: deviceName.slice(0, 128) || 'Desktop', platform, app_version: appVersion },
      } }), started);
      if (snapshot.entitlement.eligible && snapshot.device.status !== 'active') {
        const activating = clock();
        acceptSnapshot(await authorized('devices/activate', { method: 'POST' }), activating);
      }
      return status();
    })),
    activate: () => serial(() => report(async () => {
      const started = clock();
      acceptSnapshot(await authorized('devices/activate', { method: 'POST' }), started);
      return status();
    })),
    recheck: () => serial(() => report(async () => { await check(); return status(); })),
    logout: () => serial(() => report(async () => {
      try { if (accessToken || refreshToken) await authorized('auth/logout', { method: 'POST' }); }
      finally { erase(); error = null; }
      return status();
    })),
    detach: () => serial(() => report(async () => {
      await authorized('devices/current', { method: 'DELETE' });
      erase(); error = null;
      return status();
    })),
    suspend() { decisionUntil = 0; nextCheck = Infinity; },
    resume() { decisionUntil = 0; nextCheck = 0; if (accessToken || refreshToken) void client.recheck().catch(() => {}); },
    close() { stopped = true; clearInterval(timer); },
  };
  try {
    if (configured && fs.existsSync(file) && secureStore.available()) {
      const saved = JSON.parse(secureStore.decrypt(fs.readFileSync(file)));
      if (saved.origin === base && saved.device === device && /^[A-Za-z0-9_-]{64}$/.test(saved.refreshToken)) refreshToken = saved.refreshToken;
      else fs.rmSync(file, { force: true });
    }
  } catch { fs.rmSync(file, { force: true }); error = MESSAGES.INVALID_SESSION; }
  const timer = setInterval(() => {
    if (!stopped && !busy && (accessToken || refreshToken) && clock() >= Math.max(nextCheck, retryUntil)) {
      void client.recheck().catch(() => {});
    }
  }, 1000);
  timer.unref();
  return client;
}
module.exports = { createCloudLicenseClient };
