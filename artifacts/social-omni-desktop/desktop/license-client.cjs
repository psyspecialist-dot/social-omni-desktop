const fs = require('node:fs');
const { verify, publicKey } = require('./license-crypto.cjs');
const { machineId: detectMachine } = require('./license-machine.cjs');
const desktopOnly = () => ({
  native: false, configured: false, status: 'desktop_only', machineId: null,
  licenseId: null, maxDevices: null, devicesUsed: null, kind: null, supportPlan: null,
  supportUntil: null, supportActive: false, activatedAt: null, serverUrl: '', error: null,
});
function createLicenseClient({ file, config, secureStore, fetchImpl = fetch, detect = detectMachine, now = () => Date.now(), appVersion }) {
  if (config.mode === 'cloud' && config.enabled !== false) {
    return require('./cloud-license-client.cjs').createCloudLicenseClient({
      file: `${file}.cloud`, config, secureStore, fetchImpl, detect, appVersion,
    });
  }
  const mode = config.mode || 'online';
  const enabled = config.enabled !== false;
  let device = null, deviceError = null;
  try { device = detect(); } catch (error) { deviceError = error.message; }
  let validConfiguration = false;
  try {
    publicKey(config.publicKey);
    const url = mode === 'online' ? new URL(config.serverUrl) : null;
    validConfiguration = ['online', 'offline'].includes(mode) &&
      (!url || (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash)) &&
      Boolean(config.publicKey) &&
      (!config.releaseDate || Number.isFinite(Date.parse(config.releaseDate)));
  } catch { /* Fail closed; a release without an authority cannot activate. */ }
  const checkRelease = c => {
    if (config.releaseDate && Date.parse(config.releaseDate) > Math.max(Date.parse(c.purchasedAt), c.supportUntil ? Date.parse(c.supportUntil) : 0)) {
      throw new Error('This release is newer than your updates entitlement. Install a covered release or renew updates and support.');
    }
  };
  const status = () => {
    const result = { ...desktopOnly(), native: true, configured: validConfiguration, mode, enabled,
      status: validConfiguration ? 'not_activated' : 'unconfigured',
      machineId: device, serverUrl: config.serverUrl || '', error: deviceError };
    if (!enabled) return { ...result, configured: true, status: 'disabled', error: null };
    if (!validConfiguration || !device) return result;
    if (!fs.existsSync(file)) return result;
    try {
      if (!secureStore.available()) throw new Error('Native OS encryption is unavailable.');
      const saved = JSON.parse(secureStore.decrypt(fs.readFileSync(file)));
      const c = verify(saved.certificate, config.publicKey, device, now());
      // Expiry never disables a covered release, but cannot unlock future releases.
      checkRelease(c);
      return { ...result, status: 'active', licenseId: c.licenseId, maxDevices: c.maxDevices,
        devicesUsed: c.devicesUsed, kind: c.kind, supportPlan: c.supportPlan,
        supportUntil: c.supportUntil, supportActive: c.supportUntil !== null && Date.parse(c.supportUntil) > now(),
        activatedAt: c.issuedAt, error: null };
    } catch (error) { return { ...result, status: 'invalid', error: error.message }; }
  };
  return {
    status,
    assertActive() {
      if (!enabled) return;
      if (status().status !== 'active') throw Object.assign(new Error('Activate a valid device license in Settings before using the desktop application.'), { status: 403 });
    },
    async activate(key) {
      if (!enabled) throw new Error('License checking is disabled in this build.');
      if (!validConfiguration) throw new Error('License authority is not configured in this release.');
      if (!device) throw new Error(deviceError);
      if (!secureStore.available()) throw new Error('Native OS encryption is unavailable. License was not activated.');
      if (typeof key !== 'string' || key.length > 6000) throw new Error('Enter a valid license key.');
      let certificate;
      if (mode === 'offline') {
        certificate = key.trim();
      } else {
        if (!/^SNK-[A-Za-z0-9_-]{43}$/.test(key.trim())) throw new Error('Enter a valid license key.');
        const response = await fetchImpl(`${config.serverUrl.replace(/\/$/, '')}/api/socialomni/licensing/activate`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: key.trim(), machineId: device }),
          signal: AbortSignal.timeout(20000), redirect: 'error',
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'License activation failed.');
        certificate = body.certificate;
      }
      // Never persist an untrusted response or overwrite a working certificate.
      checkRelease(verify(certificate, config.publicKey, device, now()));
      const encrypted = secureStore.encrypt(JSON.stringify({ certificate }));
      fs.writeFileSync(`${file}.tmp`, encrypted, { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
      return status();
    },
    remove() { fs.rmSync(file, { force: true }); },
  };
}
module.exports = { createLicenseClient, desktopOnly };
