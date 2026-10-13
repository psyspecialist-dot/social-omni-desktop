#!/usr/bin/env node
// SELLER ONLY. Uses built-in Node crypto; never prints or embeds the private key.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const defaultDirectory = path.join(os.homedir(), '.social-najhin-offline-issuer');
function initialize(configFile, directory = defaultDirectory) {
  if (!configFile) throw new Error('Provide --config pointing to desktop/licensing-config.json.');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const privateFile = path.join(directory, 'signing-private.base64');
  if (fs.existsSync(privateFile) || fs.existsSync(path.join(directory, 'signing-public.base64'))) throw new Error('An issuer already exists. Use configure; never overwrite your signing key.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const pair = crypto.generateKeyPairSync('ed25519');
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  fs.writeFileSync(privateFile, pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(path.join(directory, 'signing-public.base64'), publicKey, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(configFile, JSON.stringify({ ...config, enabled: true, mode: 'offline', publicKey, serverUrl: '' }, null, 2) + '\n');
  return { publicKey, privateKeyFile: privateFile, warning: 'Private key stays outside Git and all distribution bundles. Back it up securely.' };
}
function configure(configFile, directory = defaultDirectory) {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const publicKey = fs.readFileSync(path.join(directory, 'signing-public.base64'), 'utf8').trim();
  fs.writeFileSync(configFile, JSON.stringify({ ...config, enabled: true, mode: 'offline', publicKey, serverUrl: '' }, null, 2) + '\n');
  return { publicKey };
}
function issue(device, { directory = defaultDirectory, plan = 'none', purchasedAt = new Date().toISOString() } = {}) {
  if (!/^[a-f0-9]{64}$/i.test(device || '')) throw new Error('Device ID must contain exactly 64 hexadecimal characters.');
  if (!['none', 'monthly', 'yearly'].includes(plan)) throw new Error('Plan must be none, monthly, or yearly.');
  if (!Number.isFinite(Date.parse(purchasedAt)) || Date.parse(purchasedAt) > Date.now() + 300000) throw new Error('Invalid purchase date.');
  const key = crypto.createPrivateKey({ key: Buffer.from(fs.readFileSync(path.join(directory, 'signing-private.base64'), 'utf8').trim(), 'base64'), type: 'pkcs8', format: 'der' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Invalid issuer key.');
  const date = new Date(), issuedAt = date.toISOString();
  let supportUntil = null;
  if (plan !== 'none') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + (plan === 'monthly' ? 1 : 12));
    date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
    supportUntil = date.toISOString();
  }
  const claims = { version: 1, product: 'social-najhin', entitlement: 'perpetual',
    licenseId: crypto.randomUUID(), machineId: device.toLowerCase(), maxDevices: 1, devicesUsed: 1,
    kind: 'standard', supportPlan: plan, supportUntil, purchasedAt, issuedAt };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const licenseKey = `SN1.${payload}.${crypto.sign(null, Buffer.from(payload), key).toString('base64url')}`;
  return { licenseKey, licenseId: claims.licenseId, deviceId: claims.machineId, supportUntil };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  try {
    const directory = option('--key-dir', defaultDirectory);
    let result;
    if (args[0] === 'init') result = initialize(option('--config'), directory);
    else if (args[0] === 'configure') result = configure(option('--config'), directory);
    else if (args[0] === 'issue') result = issue(option('--device'), { directory, plan: option('--plan', 'none'), purchasedAt: option('--purchased-at', new Date().toISOString()) });
    else {
      console.log('Seller only / للبائع فقط\nNode.js 20+\ninit --config PATH\nconfigure --config PATH\nissue --device DEVICE_ID [--plan none|monthly|yearly] [--purchased-at ISO_DATE]\nOptional: --key-dir PRIVATE_DIRECTORY. Never include that directory in a distribution.');
      process.exit(0);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { initialize, configure, issue };
