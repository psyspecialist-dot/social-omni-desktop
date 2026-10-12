// Operator-only CLI: no license issuance/renewal endpoints are exposed publicly.
import { createRequire } from 'node:module';
import { randomBytes, randomUUID, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../../lib/db/package.json', import.meta.url));
const { keyHash, createAuthority } = require('../../../lib/socialomni-api/license-authority.cjs');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
function period(plan, start = new Date()) {
  if (plan === 'none') return null;
  if (!['monthly', 'yearly'].includes(plan)) throw new Error('Plan must be none, monthly, or yearly.');
  const date = new Date(start), day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (plan === 'monthly' ? 1 : 12));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}
async function run() {
  if (args[0] === 'keygen') {
    // Run this on the owner's computer. The private key is NOT printed.
    const folder = path.join(homedir(), '.social-najhin-licensing');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const privateFile = path.join(folder, 'signing-private.base64');
    const publicFile = path.join(folder, 'signing-public.base64');
    writeFileSync(privateFile, privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), { mode: 0o600, flag: 'wx' });
    writeFileSync(publicFile, publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), { mode: 0o600, flag: 'wx' });
    writeFileSync(path.join(folder, 'admin-token.txt'), randomBytes(32).toString('base64url'), { mode: 0o600, flag: 'wx' });
    console.log('Key pair created outside the repository. Import the private file into LICENSE_SIGNING_PRIVATE_KEY using Secrets. Keep a secure backup.');
    console.log(`Public key file: ${publicFile}`);
    return;
  }
  if (args[0] === 'public-key') {
    console.log(createAuthority({ signingKey: process.env.LICENSE_SIGNING_PRIVATE_KEY }).publicKey());
    return;
  }
  if (!['issue', 'list', 'renew', 'disable'].includes(args[0])) throw new Error('Commands: keygen | public-key | issue --devices N --plan none/monthly/yearly | list | renew --id UUID --plan monthly/yearly | disable --id UUID');
  if (args.includes('--server')) {
    const server = new URL(option('--server'));
    if (server.protocol !== 'https:' || server.username || server.password || server.search || server.hash) throw new Error('--server must be the published HTTPS authority root.');
    if (!process.env.LICENSE_ADMIN_TOKEN) throw new Error('Set LICENSE_ADMIN_TOKEN securely in your local CLI environment. Never put it in a command argument.');
    const id = option('--id');
    if (['renew','disable'].includes(args[0]) && (!args.includes('--id') || !/^[a-f0-9-]{36}$/i.test(id))) throw new Error('A valid --id is required.');
    const route = args[0] === 'list' || args[0] === 'issue' ? '' : `/${id}/${args[0]}`;
    const body = args[0] === 'issue' ? { maxDevices: args.includes('--devices') ? Number(option('--devices')) : 1, supportPlan: args.includes('--plan') ? option('--plan') : 'none' }
      : args[0] === 'renew' ? { supportPlan: option('--plan') } : {};
    const response = await fetch(`${server.href.replace(/\/$/, '')}/api/socialomni/licensing/admin/licenses${route}`, {
      method: args[0] === 'list' ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.LICENSE_ADMIN_TOKEN}` },
      body: args[0] === 'list' ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Administration request failed.');
    console.log(JSON.stringify(data));
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('Run administrative commands in the authorized server workspace with DATABASE_URL.');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (args[0] === 'issue') {
      const devices = args.includes('--devices') ? Number(option('--devices')) : 1;
      const plan = args.includes('--plan') ? option('--plan') : 'none';
      if (!Number.isInteger(devices) || devices < 1 || devices > 10000) throw new Error('Devices must be an integer between 1 and 10000.');
      // Require a configured authority before selling a key.
      createAuthority({ signingKey: process.env.LICENSE_SIGNING_PRIVATE_KEY }).publicKey();
      const key = `SNK-${randomBytes(32).toString('base64url')}`, id = randomUUID();
      await pool.query('INSERT INTO social_najhin_licenses (id,key_hash,max_devices,support_plan,support_until) VALUES ($1,$2,$3,$4,$5)', [id, keyHash(key), devices, plan, period(plan)]);
      console.log(JSON.stringify({ licenseId: id, key, maxDevices: devices, supportPlan: plan, warning: 'Shown once. Deliver securely to the buyer; never commit or log this output.' }));
    } else if (args[0] === 'list') {
      const rows = await pool.query('SELECT l.id,l.max_devices,l.support_plan,l.support_until,l.enabled,COUNT(a.machine_id)::integer AS devices_used FROM social_najhin_licenses l LEFT JOIN social_najhin_activations a ON a.license_id=l.id GROUP BY l.id ORDER BY l.created_at DESC LIMIT 200');
      console.table(rows.rows);
    } else {
      const id = option('--id');
      if (!args.includes('--id') || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('A valid --id is required.');
      if (args[0] === 'disable') {
        const result = await pool.query('UPDATE social_najhin_licenses SET enabled=false WHERE id=$1 RETURNING id', [id]);
        if (!result.rowCount) throw new Error('License not found.');
        console.log('Further activation and renewal downloads disabled. Permanent offline certificates already issued remain valid.');
      } else {
        const plan = option('--plan');
        if (!args.includes('--plan') || !['monthly', 'yearly'].includes(plan)) throw new Error('Renewal plan must be monthly or yearly.');
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const row = (await client.query('SELECT support_until FROM social_najhin_licenses WHERE id=$1 AND enabled=true FOR UPDATE', [id])).rows[0];
          if (!row) throw new Error('Enabled license not found.');
          const start = new Date(Math.max(Date.now(), row.support_until ? new Date(row.support_until).getTime() : 0));
          await client.query('UPDATE social_najhin_licenses SET support_plan=$2,support_until=$3 WHERE id=$1', [id, plan, period(plan, start)]);
          await client.query('COMMIT');
          console.log('Support renewed. Each device must use Activate again with the same pack key to download its updated certificate. No additional seat is consumed.');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      }
    }
  } finally { await pool.end(); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
