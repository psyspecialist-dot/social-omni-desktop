const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { PRODUCT, DEVICE, failure, sign, privateKey } = require('./license-crypto.cjs');
const KEY = /^SNK-[A-Za-z0-9_-]{43}$/;
const keyHash = key => createHash('sha256').update(key).digest('hex');
function supportEnd(plan, from = new Date()) {
  if (plan === 'none') return null;
  if (!['monthly', 'yearly'].includes(plan)) throw failure('Support plan must be none, monthly, or yearly.');
  const date = new Date(from), day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (plan === 'monthly' ? 1 : 12));
  date.setUTCDate(Math.min(day, new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
  return date;
}

// This module runs ONLY on the authority server. Never ship its private key.
function createAuthority({ pool, signingKey, now = () => Date.now() }) {
  let signer;
  if (signingKey) signer = privateKey(signingKey);
  return {
    publicKey() {
      if (!signer) throw Object.assign(failure('License authority is not configured.'), { status: 503 });
      return require('node:crypto').createPublicKey(signer).export({ format: 'der', type: 'spki' }).toString('base64');
    },
    async issue({ maxDevices = 1, supportPlan = 'none' } = {}) {
      if (!signer) throw Object.assign(failure('License authority is not configured.'), { status: 503 });
      if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10000) throw failure('Devices must be an integer between 1 and 10000.');
      const supportUntil = supportEnd(supportPlan, new Date(now()));
      const key = `SNK-${randomBytes(32).toString('base64url')}`, licenseId = randomUUID();
      await pool.query('INSERT INTO social_najhin_licenses (id,key_hash,max_devices,support_plan,support_until) VALUES ($1,$2,$3,$4,$5)', [licenseId, keyHash(key), maxDevices, supportPlan, supportUntil]);
      return { licenseId, key, maxDevices, supportPlan, supportUntil };
    },
    async list() {
      return (await pool.query('SELECT l.id,l.max_devices,l.support_plan,l.support_until,l.enabled,COUNT(a.machine_id)::integer AS devices_used FROM social_najhin_licenses l LEFT JOIN social_najhin_activations a ON a.license_id=l.id GROUP BY l.id ORDER BY l.created_at DESC LIMIT 200')).rows;
    },
    async disable(id) {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw failure('A valid license ID is required.');
      if (!(await pool.query('UPDATE social_najhin_licenses SET enabled=false WHERE id=$1 RETURNING id', [id])).rowCount) throw failure('License not found.');
      return { disabled: true, existingOfflineCertificatesRemainValid: true };
    },
    async renew(id, plan) {
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !['monthly', 'yearly'].includes(plan)) throw failure('A valid license ID and monthly/yearly plan are required.');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = (await client.query('SELECT support_until FROM social_najhin_licenses WHERE id=$1 AND enabled=true FOR UPDATE', [id])).rows[0];
        if (!row) throw failure('Enabled license not found.');
        const supportUntil = supportEnd(plan, new Date(Math.max(now(), row.support_until ? new Date(row.support_until).getTime() : 0)));
        await client.query('UPDATE social_najhin_licenses SET support_plan=$2,support_until=$3 WHERE id=$1', [id, plan, supportUntil]);
        await client.query('COMMIT');
        return { licenseId: id, supportPlan: plan, supportUntil };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async activate({ key, machineId } = {}) {
      if (!signer) throw Object.assign(failure('License authority is not configured.'), { status: 503 });
      if (typeof key !== 'string' || !KEY.test(key) || typeof machineId !== 'string' || !DEVICE.test(machineId)) throw failure('Enter a valid license key and Machine ID.');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // One row lock serializes every registration for a pack, across servers.
        const result = await client.query('SELECT id,max_devices,support_plan,support_until,enabled,created_at FROM social_najhin_licenses WHERE key_hash=$1 FOR UPDATE', [keyHash(key)]);
        const license = result.rows[0];
        if (!license || !license.enabled) throw Object.assign(failure('License key is invalid or disabled.'), { status: 403 });
        const existing = await client.query('SELECT machine_id FROM social_najhin_activations WHERE license_id=$1 AND machine_id=$2', [license.id, machineId]);
        let count = Number((await client.query('SELECT COUNT(*) AS count FROM social_najhin_activations WHERE license_id=$1', [license.id])).rows[0].count);
        if (!existing.rows.length) {
          if (count >= license.max_devices) throw Object.assign(failure('This license has reached its maximum device allowance.'), { status: 409 });
          await client.query('INSERT INTO social_najhin_activations (license_id,machine_id) VALUES ($1,$2)', [license.id, machineId]);
          count++;
        }
        const certificate = sign({
          version: 1, product: PRODUCT, entitlement: 'perpetual',
          licenseId: license.id, machineId, maxDevices: license.max_devices,
          devicesUsed: count, kind: license.max_devices === 1 ? 'standard' : 'reseller',
          supportPlan: license.support_plan,
          supportUntil: license.support_until ? new Date(license.support_until).toISOString() : null,
          purchasedAt: new Date(license.created_at).toISOString(),
          issuedAt: new Date(now()).toISOString(),
        }, signer);
        await client.query('COMMIT');
        return { certificate };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  };
}
module.exports = { createAuthority, keyHash, supportEnd };
