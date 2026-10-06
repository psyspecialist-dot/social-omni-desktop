const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { platforms, statuses, defaults, bad, text, oneOf, optionalId, campaignInput, accountInput, contactInput, parsePhones } = require('./validation.cjs');
const createWorker = require('./worker.cjs');
const leadSimulation = require('./leads.cjs');
const createBrowserWorker = require('./browser-worker.cjs');
const waSuite = require('./wa-suite.cjs');
const advanced = require('./advanced.cjs');
const createAdvancedWorker = require('./advanced-worker.cjs');
const payload = state => JSON.stringify({ store: state.store, settings: state.settings, jobs: state.jobs, leads: state.leads, analytics: state.analytics, waSuite: state.waSuite, advanced: state.advanced });
const blankStore = () => ({ campaigns: [], accounts: [], contacts: [], lists: [], activity: [] });
const recordActivity = (state, message, level = 'info') => {
  state.store.activity.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), message, level });
  state.store.activity = state.store.activity.slice(0, 100);
};
const validImport = (store) => {
  if (!store || typeof store !== 'object' || !['campaigns', 'accounts', 'contacts', 'lists', 'activity'].every(k => Array.isArray(store[k]))) throw bad('Invalid existing workspace.');
  if (JSON.stringify(store).length > 1024 * 1024) throw bad('Existing workspace exceeds 1 MB.');
  return {
    campaigns: store.campaigns.slice(0, 1000).map(c => ({ ...campaignInput(c), id: text(c.id, 'ID', 100), createdAt: text(c.createdAt, 'Created at', 100), updatedAt: text(c.updatedAt, 'Updated at', 100) })),
    accounts: store.accounts.slice(0, 1000).map(a => ({ ...accountInput(a), id: text(a.id, 'ID', 100) })),
    contacts: store.contacts.slice(0, 1000).map(c => ({ ...contactInput(c), id: text(c.id, 'ID', 100), createdAt: text(c.createdAt, 'Created at', 100) })),
    lists: store.lists.slice(0, 1000).map(l => text(l, 'List')),
    activity: store.activity.slice(0, 100).map(a => ({
      id: text(a.id, 'ID', 100), timestamp: text(a.timestamp, 'Timestamp', 100),
      message: text(a.message, 'Log message'), level: oneOf(a.level, ['info', 'success', 'warning'], 'log level'),
    })),
  };
};

function createService({ express, dbPath, secret, automation, secureStore }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  fs.chmodSync(dbPath, 0o600);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, content BLOB NOT NULL, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS media_workspace ON media(workspace_id)');
  db.exec('CREATE TABLE IF NOT EXISTS credential_vault (workspace_id TEXT NOT NULL, id TEXT NOT NULL, data BLOB NOT NULL, PRIMARY KEY(workspace_id,id))');
  const vault = {
    available: () => Boolean(secureStore?.available()),
    read(id,key) {
      const row=db.prepare('SELECT data FROM credential_vault WHERE workspace_id=? AND id=?').get(id,key);
      return row ? JSON.parse(secureStore.decrypt(Buffer.from(row.data))) : null;
    },
    write(id,key,value) {
      if (!secureStore?.available()) throw bad('Native OS encryption is unavailable; credentials were not saved.');
      db.prepare('INSERT INTO credential_vault VALUES (?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET data=excluded.data').run(id,key,secureStore.encrypt(JSON.stringify(value)));
    },
    remove(id,key) {db.prepare('DELETE FROM credential_vault WHERE workspace_id=? AND id=?').run(id,key);},
  };
  for (const row of db.prepare('SELECT id, payload FROM workspaces').all()) {
    const state = JSON.parse(row.payload);
    state.advanced = {...advanced.defaults(),...state.advanced};
    let advancedInterrupted = false;
    for (const task of state.advanced.tasks) {
      if (advanced.active(task) || task.status==='Scheduled' && Date.parse(task.scheduledAt)<=Date.now()) {
        Object.assign(task,{status:'Needs review',phase:'Interrupted or missed schedule',nextActionAt:null,error:'Review outcomes manually. Uncertain sends are never retried.'});
        advancedInterrupted = true;
      }
    }
    for (const c of state.advanced.connections) if (['connecting','code','password','testing'].includes(c.stage)) {c.stage='ready';c.error='Connection setup was interrupted. Save/test SMTP again or restart Telegram sign-in.';advancedInterrupted=true;}
    const interrupted = state.jobs.filter(j => ['Pending', 'Running'].includes(j.status));
    if (interrupted.length || advancedInterrupted) {
      interrupted.forEach(j => { j.status = 'Failed'; j.phase = 'Interrupted'; j.nextActionAt = null; });
      recordActivity(state, 'An unfinished task was interrupted when the app stopped. Live actions are never retried automatically; review platform outcomes before restarting.', 'warning');
      db.prepare('UPDATE workspaces SET payload = ? WHERE id = ?').run(JSON.stringify(state), row.id);
    }
  }
  const get = id => {
    const row = db.prepare('SELECT payload FROM workspaces WHERE id = ?').get(id);
    const media = db.prepare('SELECT id, name, mime, size FROM media WHERE workspace_id = ? ORDER BY created_at DESC').all(id);
    if (!row) return { store: blankStore(), settings: defaults(), jobs: [], media, leads: leadSimulation.defaults(), analytics: { messagesSent: 0 }, waSuite: waSuite.defaults(), advanced: advanced.defaults(), initialized: false, automationAvailable: Boolean(automation) };
    const state = { ...JSON.parse(row.payload), media, initialized: true };
    state.settings = { ...defaults(), ...state.settings };
    state.settings.delayMin = Math.max(5, Math.min(12, state.settings.delayMin));
    state.settings.delayMax = Math.max(state.settings.delayMin, Math.min(12, state.settings.delayMax));
    state.automationAvailable = Boolean(automation);
    state.leads = { ...leadSimulation.defaults(), ...state.leads };
    state.waSuite = { ...waSuite.defaults(), ...state.waSuite };
    state.advanced = {...advanced.defaults(),...state.advanced};
    state.analytics = state.analytics || { messagesSent: state.jobs.filter(j => j.kind === 'whatsapp').reduce((sum, j) => sum + (j.completedCount || 0), 0) };
    if (state.settings.brandVersion !== 'najhin') {
      state.settings.theme = 'dark';
      state.settings.brandVersion = 'najhin';
      db.prepare('UPDATE workspaces SET payload = ? WHERE id = ?').run(payload(state), id);
    }
    const due = state.store.campaigns.filter(c => c.status === 'Scheduled' && c.scheduledAt && Date.parse(c.scheduledAt) <= Date.now());
    if (due.length) {
      due.forEach(c => {
        c.status = 'Ready for review';
        c.updatedAt = new Date().toISOString();
        recordActivity(state, `“${c.title}” is due and ready for manual review.`, 'warning');
      });
      db.prepare('UPDATE workspaces SET payload = ? WHERE id = ?').run(payload(state), id);
    }
    return state;
  };
  const save = (id, state) => {
    // Do not silently discard queued jobs when retaining history.
    state.jobs = [...state.jobs.filter(j => ['Pending', 'Running'].includes(j.status)),
      ...state.jobs.filter(j => !['Pending', 'Running'].includes(j.status)).slice(0, 30)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    db.prepare('INSERT INTO workspaces (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload')
      .run(id, payload(state));
  };
  const browserWorker = createBrowserWorker({ get, save, recordActivity, automation, kick: id => worker.kick(id) });
  const worker = createWorker({ get, save, recordActivity, onLive: id => browserWorker.kick(id) });
  const advancedWorker = createAdvancedWorker({get,save,recordActivity,runtime:automation,vault,
    ids:()=>db.prepare('SELECT id FROM workspaces').all().map(r=>r.id),
    kickLegacy:id=>worker.kick(id),
    cancelLegacy:(_id,taskId)=>browserWorker.cancel(taskId),
    readMedia:(id,mediaId)=>db.prepare('SELECT mime,content FROM media WHERE workspace_id=? AND id=?').get(id,mediaId),
  });
  const requireMedia = (state, id) => {
    if (id && !state.media.some(m => m.id === id)) throw bad('Choose an existing attachment in this workspace.');
  };
  const requireAccount = (state, id, platform, forRun = false) => {
    if (!id) return;
    const account = state.store.accounts.find(a => a.id === id);
    if (!account || account.platform !== platform) throw bad(`Choose a ${platform} account in this workspace.`);
    if (forRun && account.status.startsWith('Paused')) throw bad('Choose an active simulated account before running.');
  };
  const router = express.Router();
  router.use((req, res, next) => {
    if (secret && req.get('x-socialomni-secret') !== secret) return res.status(403).json({ error: 'Forbidden.' });
    const id = req.get('x-socialomni-workspace');
    if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'A workspace ID is required.' });
    req.workspaceId = id;
    next();
  });
  const route = (verb, url, operation) => router[verb](url, (req, res) => {
    let transaction = false;
    try {
      const id = req.workspaceId;
      if (verb !== 'get') { db.exec('BEGIN IMMEDIATE'); transaction = true; }
      const state = get(id);
      if (verb==='post' && ['/jobs','/browser/jobs','/suite/session'].includes(url) &&
        (state.advanced.tasks.some(advanced.active) || advancedWorker.authBusy(id))) throw bad('Finish advanced tasks or connection setup before starting another worker.');
      const changed = operation(state, req);
      if (changed) {
        save(id, state);
        state.initialized = true;
      }
      if (transaction) { db.exec('COMMIT'); transaction = false; }
      if (changed) worker.kick(id);
      res.json(state);
    } catch (error) {
      if (transaction) db.exec('ROLLBACK');
      const status = error.status || 500;
      if (status === 500) req.log?.error({ err: error }, 'SocialOmni request failed');
      res.status(status).json({ error: status === 500 ? 'Local database operation failed.' : error.message });
    }
  });
  route('get', '/state', () => false);
  waSuite.install({ route, automation, recordActivity });
  advanced.install({route,runtime:automation,vault,engine:advancedWorker,recordActivity});
  route('post', '/import', (state, req) => {
    if (state.initialized) throw Object.assign(new Error('Workspace already initialized; import refused.'), { status: 409 });
    state.store = validImport(req.body?.store);
    state.settings = { ...defaults(), theme: req.body?.theme === 'dark' ? 'dark' : 'light' };
    recordActivity(state, 'Existing local workspace imported into SQLite.', 'success');
    return true;
  });
  route('post', '/initialize', state => {
    if (state.initialized) throw Object.assign(new Error('Workspace already initialized.'), { status: 409 });
    recordActivity(state, 'Local SQLite workspace initialized.');
    return true;
  });
  route('delete', '/state', (state, req) => {
    if (state.jobs.some(j => ['Pending', 'Running'].includes(j.status))) throw bad('Stop all running tasks before clearing the workspace.');
    if (state.advanced.tasks.some(advanced.active) || advancedWorker.authBusy(req.workspaceId)) throw bad('Stop advanced tasks and finish sign-in before clearing the workspace.');
    if (automation) for (const account of state.store.accounts) {
      if (/^[a-f0-9-]{36}$/i.test(account.id)) fs.rmSync(path.join(automation.profileDir, account.id), { recursive: true, force: true });
    }
    db.prepare('DELETE FROM media WHERE workspace_id = ?').run(req.workspaceId);
    state.store = blankStore();
    state.jobs = [];
    state.media = [];
    state.leads = leadSimulation.defaults();
    state.analytics = { messagesSent: 0 };
    state.waSuite = waSuite.defaults();
    state.advanced = advanced.defaults();
    db.prepare('DELETE FROM credential_vault WHERE workspace_id=?').run(req.workspaceId);
    state.settings = { ...defaults(), theme: state.settings.theme };
    recordActivity(state, 'Local workspace cleared.', 'warning');
    return true;
  });
  for (const [plural, validate] of [['campaigns', campaignInput], ['accounts', accountInput], ['contacts', contactInput]]) {
    route('post', `/${plural}`, (state, req) => {
      const record = { ...validate(req.body || {}), id: randomUUID() };
      if (state.store[plural].length >= 1000) throw bad('This workspace supports up to 1,000 records of each type.');
      if (plural === 'campaigns') {
        requireMedia(state, record.mediaId);
        requireAccount(state, record.accountId, record.platform);
        Object.assign(record, { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      if (plural === 'contacts') {
        record.createdAt = new Date().toISOString();
        if (!state.store.lists.includes(record.list)) state.store.lists.push(record.list);
      }
      state.store[plural].unshift(record);
      recordActivity(state, `Created ${plural.slice(0, -1)} “${record.title || record.displayLabel || record.name}”.`, 'success');
      return true;
    });
    route('patch', `/${plural}/:id`, (state, req) => {
      const record = state.store[plural].find(r => r.id === req.params.id);
      if (!record) throw Object.assign(new Error('Record not found.'), { status: 404 });
      const draft = validate(req.body || {});
      if (plural === 'campaigns') {
        requireMedia(state, draft.mediaId);
        requireAccount(state, draft.accountId, draft.platform);
      }
      Object.assign(record, draft);
      if (plural === 'contacts') state.waSuite.threads.filter(t => t.contactId === record.id).forEach(t => {
        t.optedIn = record.optedIn; t.name = record.name;
      });
      if ((plural === 'campaigns' && draft.status === 'Paused') || (plural === 'accounts' && draft.status.startsWith('Paused'))) {
        state.jobs.filter(j => ['Pending', 'Running'].includes(j.status) &&
          (plural === 'campaigns' ? j.campaignId === record.id : j.accountId === record.id)).forEach(j => {
          j.status = 'Cancelled'; j.phase = 'Cancelled'; j.nextActionAt = null;
          if (j.mode === 'live') browserWorker.cancel(j.id);
        });
      }
      if (plural === 'campaigns') record.updatedAt = new Date().toISOString();
      if (plural === 'contacts' && !state.store.lists.includes(record.list)) state.store.lists.push(record.list);
      recordActivity(state, `Updated ${plural.slice(0, -1)} “${record.title || record.displayLabel || record.name}”.`, 'success');
      return true;
    });
    route('delete', `/${plural}/:id`, (state, req) => {
      if (state.jobs.some(j => j.mode === 'live' && ['Pending', 'Running'].includes(j.status) &&
        ((plural === 'accounts' && j.accountId === req.params.id) || (plural === 'campaigns' && j.campaignId === req.params.id)))) throw bad('Stop the live browser task before deleting its account or campaign.');
      const index = state.store[plural].findIndex(r => r.id === req.params.id);
      if (index === -1) throw Object.assign(new Error('Record not found.'), { status: 404 });
      const [record] = state.store[plural].splice(index, 1);
      if (plural === 'campaigns') state.jobs.filter(j => j.campaignId === record.id && ['Pending', 'Running'].includes(j.status)).forEach(j => { j.status = 'Cancelled'; j.phase = 'Cancelled'; j.nextActionAt = null; });
      if (plural === 'accounts') {
        if (automation && /^[a-f0-9-]{36}$/i.test(record.id)) fs.rmSync(path.join(automation.profileDir, record.id), { recursive: true, force: true });
        state.store.campaigns.filter(c => c.accountId === record.id).forEach(c => { c.accountId = null; });
        if (state.settings.accountId === record.id) state.settings.accountId = null;
      }
      if (plural === 'contacts') state.store.lists = [...new Set(state.store.contacts.map(c => c.list))];
      if (plural === 'contacts') state.waSuite.threads.filter(t => t.contactId === record.id).forEach(t => { t.contactId = null; t.optedIn = false; });
      recordActivity(state, `Removed ${plural.slice(0, -1)} “${record.title || record.displayLabel || record.name}”.`, 'warning');
      return true;
    });
  }
  route('patch', '/campaigns/:id/status', (state, req) => {
    const campaign = state.store.campaigns.find(c => c.id === req.params.id);
    if (!campaign) throw Object.assign(new Error('Campaign not found.'), { status: 404 });
    const status = oneOf(req.body?.status, statuses, 'status');
    if (status === 'Scheduled' && (!campaign.scheduledAt || !Number.isFinite(Date.parse(campaign.scheduledAt)))) throw bad('Set a planned time first.');
    campaign.status = status;
    campaign.updatedAt = new Date().toISOString();
    if (status === 'Paused') state.jobs.filter(j => j.campaignId === campaign.id && ['Pending', 'Running'].includes(j.status)).forEach(j => { j.status = 'Cancelled'; j.phase = 'Cancelled'; j.nextActionAt = null; if (j.mode === 'live') browserWorker.cancel(j.id); });
    recordActivity(state, `Moved “${campaign.title}” to ${status}.`, status === 'Failed' ? 'warning' : 'info');
    return true;
  });
  route('put', '/settings', (state, req) => {
    const body = req.body || {};
    if ('licenseKey' in body) state.settings.licenseKey = text(body.licenseKey, 'Future license placeholder', 200);
    if ('theme' in body) state.settings.theme = oneOf(body.theme, ['light', 'dark'], 'theme');
    if ('keywords' in body) state.settings.keywords = text(body.keywords, 'Target keywords', 300);
    if ('phoneNumbers' in body) state.settings.phoneNumbers = parsePhones(body.phoneNumbers).join('\n');
    if ('messageContent' in body) state.settings.messageContent = text(body.messageContent, 'Message template', 10000);
    if ('mediaId' in body) {
      const id = optionalId(body.mediaId, 'Media ID'); requireMedia(state, id); state.settings.mediaId = id;
    }
    if ('accountId' in body) {
      const id = optionalId(body.accountId, 'Account ID'); requireAccount(state, id, 'WhatsApp'); state.settings.accountId = id;
    }
    if ('delayMin' in body || 'delayMax' in body) {
      const min = Number(body.delayMin ?? state.settings.delayMin), max = Number(body.delayMax ?? state.settings.delayMax);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 5 || max > 12 || max < min) throw bad('Delays must be between 5 and 12 seconds, with maximum at least minimum.');
      state.settings.delayMin = min;
      state.settings.delayMax = max;
    }
    recordActivity(state, 'Workspace settings saved.');
    return true;
  });
  route('post', '/activity', (state, req) => {
    const platform = oneOf(req.body?.platform, platforms, 'platform');
    recordActivity(state, `Opened official ${platform} site for manual review.`);
    return true;
  });
  const mediaTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
  route('post', '/media', (state, req) => {
    const body = req.body || {};
    const name = text(body.name, 'File name', 200);
    if (!name) throw bad('A file name is required.');
    const mime = oneOf(body.mime, mediaTypes, 'file type');
    if (typeof body.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) throw bad('Invalid attachment data.');
    const content = Buffer.from(body.data, 'base64');
    if (!content.length || content.length > 5 * 1024 * 1024) throw bad('Attachments must be nonempty and at most 5 MB.');
    // Validate signatures instead of trusting the browser-provided MIME type.
    const signature = content.subarray(0, 16);
    const matches = {
      'image/png': signature.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      'image/jpeg': signature[0] === 255 && signature[1] === 216 && signature[2] === 255,
      'image/gif': /^GIF8[79]a/.test(signature.toString('ascii')),
      'image/webp': signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP',
      'video/mp4': signature.toString('ascii', 4, 8) === 'ftyp',
      'video/webm': signature.subarray(0, 4).equals(Buffer.from([26,69,223,163])),
    };
    if (!matches[mime]) throw bad('File contents do not match the selected image or video format.');
    const total = db.prepare('SELECT COALESCE(SUM(size),0) AS total FROM media WHERE workspace_id = ?').get(req.workspaceId).total;
    if (total + content.length > 50 * 1024 * 1024) throw bad('This workspace has a 50 MB attachment limit. Remove unused attachments first.');
    const asset = { id: randomUUID(), name, mime, size: content.length };
    db.prepare('INSERT INTO media (id,workspace_id,name,mime,size,content,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(asset.id, req.workspaceId, name, mime, asset.size, content, new Date().toISOString());
    state.media.unshift(asset);
    recordActivity(state, `Saved attachment “${name}” (${asset.size} bytes) in SQLite.`, 'success');
    return true;
  });
  route('get', '/media/:id', (state, req) => {
    const asset = db.prepare('SELECT id,name,mime,size,content FROM media WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
    if (!asset) throw Object.assign(new Error('Attachment not found.'), { status: 404 });
    state.mediaContent = { id: asset.id, name: asset.name, mime: asset.mime, size: asset.size, dataUrl: `data:${asset.mime};base64,${Buffer.from(asset.content).toString('base64')}` };
    return false;
  });
  route('delete', '/media/:id', (state, req) => {
    const id = req.params.id;
    if (state.settings.mediaId === id || state.store.campaigns.some(c => c.mediaId === id) ||
      state.jobs.some(j => j.mediaId === id && ['Pending', 'Running'].includes(j.status))) throw bad('Remove this attachment from drafts or finish/cancel its rehearsal before deleting it.');
    const removed = db.prepare('DELETE FROM media WHERE id = ? AND workspace_id = ?').run(id, req.workspaceId);
    if (!removed.changes) throw Object.assign(new Error('Attachment not found.'), { status: 404 });
    state.media = state.media.filter(m => m.id !== id);
    recordActivity(state, 'Deleted unused attachment.');
    return true;
  });
  route('post', '/jobs', (state, req) => {
    const kind = oneOf(req.body?.kind, ['campaign', 'whatsapp', 'leads'], 'task type');
    const campaignId = kind === 'campaign' ? text(req.body?.campaignId, 'Campaign ID', 100) : null;
    const campaign = kind === 'campaign' ? state.store.campaigns.find(c => c.id === campaignId) : null;
    if (kind === 'campaign' && !campaign) throw bad('Choose an existing campaign.');
    if (campaign?.status === 'Paused') throw bad('Resume this campaign before running a rehearsal.');
    if (state.jobs.some(j => j.kind === kind && j.campaignId === campaignId && ['Pending', 'Running'].includes(j.status))) throw bad('This simulation is already running.');
    if (state.jobs.filter(j => ['Pending', 'Running'].includes(j.status)).length >= 20) throw bad('Wait for or cancel queued rehearsals before starting more.');
    if (kind === 'leads') {
      const job = leadSimulation.createJob(state);
      state.jobs.unshift(job);
      recordActivity(state, `Queued lead extraction simulation for ${job.totalCount} synthetic businesses in ${state.leads.city}. No Google Maps connection or scraping occurs.`);
      return true;
    }
    const config = campaign || state.settings;
    const accountId = config.accountId || null, mediaId = config.mediaId || null;
    requireAccount(state, accountId, campaign?.platform || 'WhatsApp', true);
    requireMedia(state, mediaId);
    const names = kind === 'whatsapp' ? parsePhones(state.settings.phoneNumbers) : (() => {
      const words = (campaign.keywords || state.settings.keywords || campaign.platform).split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      if (!words.length) words.push(campaign.platform);
      return Array.from({ length: campaign.targetGroupCount || 50 }, (_, i) => `Demo ${words[i % words.length]} group ${String(i + 1).padStart(3, '0')}`);
    })();
    const messageContent = kind === 'whatsapp' ? state.settings.messageContent : campaign.caption;
    if (!names.length) throw bad('Add target phone numbers before running.');
    if (!messageContent.trim()) throw bad('Add a message template or campaign caption before running.');
    const targets = names.map(name => ({ id: randomUUID(), name, joinStatus: 'Pending', postStatus: 'Pending', sendStatus: 'Pending' }));
    const job = {
      id: randomUUID(), kind, campaignId, status: 'Pending', progress: 0, currentStep: 0,
      steps: kind === 'whatsapp' ? ['Prepare saved template', 'Simulate messages sequentially', 'Review rehearsal results'] : ['Prepare saved content', 'Simulate group joins and posts sequentially', 'Review rehearsal results'],
      delayMin: state.settings.delayMin, delayMax: state.settings.delayMax, createdAt: new Date().toISOString(),
      targets, completedCount: 0, totalCount: targets.length, nextActionAt: null, phase: 'Queued',
      accountName: state.store.accounts.find(a => a.id === accountId)?.displayLabel || 'Demo workspace identity',
      accountId, mediaId, mediaName: state.media.find(m => m.id === mediaId)?.name || null, messageContent,
    };
    state.jobs.unshift(job);
    recordActivity(state, `Queued ${kind} rehearsal for ${targets.length} simulated targets. Jobs run one at a time; no platform actions occur.`);
    return true;
  });
  route('post', '/browser/jobs', (state, req) => {
    if (!automation) throw Object.assign(new Error('Live automation runs only in the downloaded desktop app on your computer.'), { status: 422 });
    const body = req.body || {};
    const action = oneOf(body.action, ['connect', 'search', 'send', 'publish'], 'browser action');
    const account = state.store.accounts.find(a => a.id === body.accountId);
    if (!account || !['WhatsApp', 'Facebook'].includes(account.platform)) throw bad('Choose a saved WhatsApp or Facebook account.');
    if (!/^[a-f0-9-]{36}$/i.test(account.id)) throw bad('This imported account cannot use a browser profile. Create a new account label first.');
    if (account.status.startsWith('Paused')) throw bad('Resume this account before connecting.');
    if ((action === 'send' && account.platform !== 'WhatsApp') || (['search', 'publish'].includes(action) && account.platform !== 'Facebook')) throw bad('Action does not match the selected platform.');
    if (state.jobs.some(j => ['Pending', 'Running'].includes(j.status))) throw bad('Finish or stop the current queue before launching a browser task.');
    if (['send', 'publish'].includes(action) && body.approved !== true) throw bad('Explicit consent and posting permission must be confirmed before live actions.');
    let names = [], content = '';
    if (action === 'send') {
      if (state.settings.mediaId) throw bad('Live media sending is not supported yet. Remove the attachment; text messages only.');
      names = parsePhones(state.settings.phoneNumbers);
      content = state.settings.messageContent;
      if (!names.length || !content.trim()) throw bad('Save phone numbers and a message first.');
    }
    if (action === 'publish') {
      const campaign = state.store.campaigns.find(c => c.id === body.campaignId && c.platform === 'Facebook');
      if (!campaign || campaign.status === 'Paused' || !campaign.caption.trim()) throw bad('Choose an active Facebook campaign with a caption.');
      if (campaign.mediaId) throw bad('Live media posts are not supported yet. Remove the attachment; text posts only.');
      content = campaign.caption;
      const urls = text(body.groupUrls, 'Approved group URLs', 5000).split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
      try { names = [...new Set(urls.map(createBrowserWorker.groupUrl))]; } catch (error) { throw bad(error.message); }
      if (!names.length || names.length > 20) throw bad('Provide between 1 and 20 approved Facebook group URLs.');
    }
    const keywords = action === 'search' ? text(body.keywords, 'Group search keywords', 300) : '';
    if (action === 'search' && !keywords) throw bad('Enter Facebook group search keywords.');
    const job = {
      id: randomUUID(), mode: 'live', action, platform: account.platform,
      kind: account.platform === 'WhatsApp' ? 'whatsapp' : 'campaign',
      campaignId: action === 'publish' ? body.campaignId : null,
      status: 'Pending', phase: 'Queued', progress: 0, currentStep: 0, completedCount: 0,
      createdAt: new Date().toISOString(), nextActionAt: null, steps: [],
      accountId: account.id, accountName: account.displayLabel, messageContent: content, keywords,
      delayMin: state.settings.delayMin, delayMax: state.settings.delayMax, totalCount: names.length,
      targets: names.map(name => ({ id: randomUUID(), name, joinStatus: 'Pending', postStatus: 'Pending', sendStatus: 'Pending' })),
    };
    state.jobs.unshift(job);
    recordActivity(state, `Queued live ${account.platform} ${action}. Browser actions use ${job.delayMin}–${job.delayMax}s pacing; this does not prevent bans.`);
    return true;
  });
  route('post', '/jobs/:id/cancel', (state, req) => {
    const job = state.jobs.find(j => j.id === req.params.id);
    if (!job || !['Pending', 'Running'].includes(job.status)) throw bad('There is no running task to cancel.');
    job.status = 'Cancelled';
    job.phase = 'Cancelled';
    job.nextActionAt = null;
    if (job.mode === 'live') browserWorker.cancel(job.id);
    recordActivity(state, job.mode === 'live' ? 'Live task cancelled. Already submitted actions cannot be undone.' : 'Simulation cancelled.', 'warning');
    return true;
  });
  route('put', '/leads', (state, req) => {
    Object.assign(state.leads, leadSimulation.draft(req.body || {}));
    recordActivity(state, 'Lead simulation inputs saved in SQLite.');
    return true;
  });
  route('delete', '/leads', state => {
    if (state.jobs.some(j => j.kind === 'leads' && ['Pending', 'Running'].includes(j.status))) throw bad('Stop or finish the lead simulation before clearing results.');
    state.leads.results = [];
    recordActivity(state, 'Simulated lead results cleared; saved search inputs retained.', 'warning');
    return true;
  });
  return { router, close: () => { advancedWorker.close(); worker.close(); browserWorker.close(); db.close(); } };
}

module.exports = createService;
