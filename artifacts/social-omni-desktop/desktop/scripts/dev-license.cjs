// Explicit, unpackaged local testing only. Never include this signer in ASAR.
const { generateKeyPairSync, randomUUID } = require('node:crypto');
const { createLicenseClient } = require('../license-client.cjs');
const { machineId } = require('../license-machine.cjs');
const { sign } = require('../license-crypto.cjs');
const NOTICE = 'Development test license — not valid for distribution.';

async function createDevelopmentLicense({ isPackaged, file, secureStore, detect = machineId, now = Date.now }) {
  if (isPackaged !== false) throw new Error('Development licensing is unavailable in installed builds.');
  const device = detect();
  const pair = generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const key = `SNK-${'D'.repeat(43)}`;
  const client = createLicenseClient({
    file, secureStore, detect: () => device, now,
    config: { serverUrl: 'https://local-development.invalid', publicKey },
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      if (body.key !== key || body.machineId !== device) return { ok: false, json: async () => ({ error: NOTICE }) };
      const date = new Date(now()).toISOString();
      return { ok: true, json: async () => ({ certificate: sign({
        version: 1, product: 'social-najhin', entitlement: 'perpetual', licenseId: randomUUID(),
        machineId: device, maxDevices: 1, devicesUsed: 1, kind: 'standard',
        supportPlan: 'none', supportUntil: null, purchasedAt: date, issuedAt: date,
      }, pair.privateKey) }) };
    },
  });
  // A fresh in-memory test issuer per launch; no signing secret is written or logged.
  await client.activate(key);
  return { ...client, status: () => ({ ...client.status(), error: NOTICE }) };
}
module.exports = { createDevelopmentLicense, NOTICE };
