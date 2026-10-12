const crypto = require('node:crypto');
const PRODUCT = 'social-najhin';
const DEVICE = /^[a-f0-9]{64}$/;
function failure(message) { return Object.assign(new Error(message), { status: 400 }); }
function publicKey(value) {
  const key = crypto.createPublicKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ed25519') throw failure('The licensing public key must use Ed25519.');
  return key;
}
function privateKey(value) {
  const key = crypto.createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519') throw failure('The licensing signing key must use Ed25519.');
  return key;
}
function sign(claims, key) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `SN1.${payload}.${crypto.sign(null, Buffer.from(payload), key).toString('base64url')}`;
}
function verify(token, trustedKey, machineId, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 6000) throw failure('Invalid license certificate.');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'SN1' || !/^[\w-]+$/.test(parts[1]) || !/^[\w-]+$/.test(parts[2])) throw failure('Invalid license certificate.');
  if (!crypto.verify(null, Buffer.from(parts[1]), publicKey(trustedKey), Buffer.from(parts[2], 'base64url'))) throw failure('License signature verification failed.');
  const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (c.version !== 1 || c.product !== PRODUCT || c.entitlement !== 'perpetual' ||
      typeof c.licenseId !== 'string' || !/^[a-f0-9-]{36}$/i.test(c.licenseId) ||
      !DEVICE.test(c.machineId) || c.machineId !== machineId) throw failure('This license is not valid for this machine.');
  if (!Number.isInteger(c.maxDevices) || c.maxDevices < 1 || c.maxDevices > 10000 ||
      !Number.isInteger(c.devicesUsed) || c.devicesUsed < 1 || c.devicesUsed > c.maxDevices ||
      c.kind !== (c.maxDevices === 1 ? 'standard' : 'reseller')) throw failure('Invalid license device allowance.');
  if (!['none', 'monthly', 'yearly'].includes(c.supportPlan) ||
      (c.supportPlan === 'none' ? c.supportUntil !== null : !Number.isFinite(Date.parse(c.supportUntil)))) throw failure('Invalid license support period.');
  if (!Number.isFinite(Date.parse(c.issuedAt)) || Date.parse(c.issuedAt) > now + 300000) throw failure('License date is invalid. Check your computer clock.');
  if (!Number.isFinite(Date.parse(c.purchasedAt)) || Date.parse(c.purchasedAt) > Date.parse(c.issuedAt) + 300000) throw failure('Invalid license purchase date.');
  return c;
}
module.exports = { PRODUCT, DEVICE, failure, sign, verify, privateKey, publicKey };
