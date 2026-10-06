const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const platforms = ['Instagram', 'Facebook', 'TikTok', 'WhatsApp'];
const statuses = ['Draft', 'Scheduled', 'Ready for review', 'Paused', 'Sent', 'Failed'];
const blankStore = () => ({ campaigns: [], accounts: [], contacts: [], lists: [], activity: [] });
const defaults = () => ({ theme: 'light', keywords: '', delayMin: 3, delayMax: 5 });
const bad = (message) => Object.assign(new Error(message), { status: 400 });
const text = (value, name, max = 1000) => {
  if (typeof value !== 'string' || value.length > max) throw bad(`${name} must be text of at most ${max} characters.`);
  return value.trim();
};
const oneOf = (value, options, name) => {
  if (!options.includes(value)) throw bad(`Invalid ${name}.`);
  return value;
};
const recordActivity = (state, message, level = 'info') => {
  state.store.activity.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), message, level });
  state.store.activity = state.store.activity.slice(0, 100);
};
const campaignInput = (body) => {
  const title = text(body.title, 'Title');
  if (!title) throw bad('A campaign title is required.');
  const status = oneOf(body.status, statuses, 'campaign status');
  const scheduledAt = text(body.scheduledAt, 'Scheduled time', 100);
  if (status === 'Scheduled' && (!scheduledAt || !Number.isFinite(Date.parse(scheduledAt)))) throw bad('Choose a valid planned time.');
  return { title, status, scheduledAt, platform: oneOf(body.platform, platforms, 'platform'), caption: text(body.caption, 'Caption') };
};
const accountInput = (body) => {
  const displayLabel = text(body.displayLabel, 'Label');
  if (!displayLabel) throw bad('An account label is required.');
  return { displayLabel, platform: oneOf(body.platform, platforms, 'platform'), handle: text(body.handle, 'Handle'), status: oneOf(body.status, ['Active label', 'Paused label'], 'label status') };
};
const contactInput = (body) => {
  const name = text(body.name, 'Name'), value = text(body.value, 'Contact value');
  if (!name || !value) throw bad('Name and contact value are required.');
  const channel = oneOf(body.channel, ['Email', 'Phone'], 'channel');
  if (channel === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw bad('Enter a valid email address.');
  if (channel === 'Phone' && !/^\+?[\d\s().-]{7,30}$/.test(value)) throw bad('Enter a valid phone number.');
  if (typeof body.optedIn !== 'boolean') throw bad('Consent indicator must be a boolean.');
  return { name, value, channel, optedIn: body.optedIn, list: text(body.list, 'List') || 'Unlisted' };
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

function createService({ express, dbPath, secret }) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  for (const row of db.prepare('SELECT id, payload FROM workspaces').all()) {
    const state = JSON.parse(row.payload);
    const interrupted = state.jobs.filter(j => ['Pending', 'Running'].includes(j.status));
    if (interrupted.length) {
      interrupted.forEach(j => { j.status = 'Failed'; });
      recordActivity(state, 'An unfinished simulation was interrupted when the app stopped. Start it again if needed.', 'warning');
      db.prepare('UPDATE workspaces SET payload = ? WHERE id = ?').run(JSON.stringify(state), row.id);
    }
  }
  const get = id => {
    const row = db.prepare('SELECT payload FROM workspaces WHERE id = ?').get(id);
    if (!row) return { store: blankStore(), settings: defaults(), jobs: [], initialized: false };
    const state = { ...JSON.parse(row.payload), initialized: true };
    const due = state.store.campaigns.filter(c => c.status === 'Scheduled' && c.scheduledAt && Date.parse(c.scheduledAt) <= Date.now());
    if (due.length) {
      due.forEach(c => {
        c.status = 'Ready for review';
        c.updatedAt = new Date().toISOString();
        recordActivity(state, `“${c.title}” is due and ready for manual review.`, 'warning');
      });
      db.prepare('UPDATE workspaces SET payload = ? WHERE id = ?').run(JSON.stringify({ store: state.store, settings: state.settings, jobs: state.jobs }), id);
    }
    return state;
  };
  const save = (id, state) => {
    state.jobs = state.jobs.slice(0, 30);
    db.prepare('INSERT INTO workspaces (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload')
      .run(id, JSON.stringify({ store: state.store, settings: state.settings, jobs: state.jobs }));
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
    try {
      const id = req.workspaceId;
      const state = get(id);
      const changed = operation(state, req);
      if (changed) save(id, state);
      res.json(state);
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) req.log?.error({ err: error }, 'SocialOmni request failed');
      res.status(status).json({ error: status === 500 ? 'Local database operation failed.' : error.message });
    }
  });
  route('get', '/state', () => false);
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
  route('delete', '/state', state => {
    state.store = blankStore();
    state.jobs = [];
    recordActivity(state, 'Local workspace cleared.', 'warning');
    return true;
  });
  for (const [plural, validate] of [['campaigns', campaignInput], ['accounts', accountInput], ['contacts', contactInput]]) {
    route('post', `/${plural}`, (state, req) => {
      const record = { ...validate(req.body || {}), id: randomUUID() };
      if (plural === 'campaigns') Object.assign(record, { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
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
      Object.assign(record, validate(req.body || {}));
      if (plural === 'campaigns') record.updatedAt = new Date().toISOString();
      if (plural === 'contacts' && !state.store.lists.includes(record.list)) state.store.lists.push(record.list);
      recordActivity(state, `Updated ${plural.slice(0, -1)} “${record.title || record.displayLabel || record.name}”.`, 'success');
      return true;
    });
    route('delete', `/${plural}/:id`, (state, req) => {
      const index = state.store[plural].findIndex(r => r.id === req.params.id);
      if (index === -1) throw Object.assign(new Error('Record not found.'), { status: 404 });
      const [record] = state.store[plural].splice(index, 1);
      if (plural === 'campaigns') state.jobs.filter(j => j.campaignId === record.id && ['Pending', 'Running'].includes(j.status)).forEach(j => { j.status = 'Cancelled'; });
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
    if (status === 'Paused') state.jobs.filter(j => j.campaignId === campaign.id && ['Pending', 'Running'].includes(j.status)).forEach(j => { j.status = 'Cancelled'; });
    recordActivity(state, `Moved “${campaign.title}” to ${status}.`, status === 'Failed' ? 'warning' : 'info');
    return true;
  });
  route('put', '/settings', (state, req) => {
    const body = req.body || {};
    if ('theme' in body) state.settings.theme = oneOf(body.theme, ['light', 'dark'], 'theme');
    if ('keywords' in body) state.settings.keywords = text(body.keywords, 'Target keywords', 300);
    if ('delayMin' in body || 'delayMax' in body) {
      const min = Number(body.delayMin ?? state.settings.delayMin), max = Number(body.delayMax ?? state.settings.delayMax);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 3 || max > 30 || max < min) throw bad('Simulation delays must be between 3 and 30 seconds, with maximum at least minimum.');
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
  const stepsFor = (kind, keywordCount) => kind === 'whatsapp'
    ? [`Simulated review of ${keywordCount} configured keyword${keywordCount === 1 ? '' : 's'}`, 'Simulated WhatsApp preparation delay', 'Manual messaging handoff ready']
    : ['Simulated campaign preparation', 'Simulated group-join review delay', 'Manual publishing handoff ready'];
  const timers = new Set();
  function schedule(id, jobId) {
    const state = get(id), job = state.jobs.find(j => j.id === jobId);
    if (!job || !['Pending', 'Running'].includes(job.status)) return;
    const delay = job.status === 'Pending' ? 0 : (job.delayMin + Math.floor(Math.random() * (job.delayMax - job.delayMin + 1))) * 1000;
    const timer = setTimeout(() => {
      timers.delete(timer);
      try {
        const current = get(id), active = current.jobs.find(j => j.id === jobId);
        if (!active || !['Pending', 'Running'].includes(active.status)) return;
        active.status = 'Running';
        active.currentStep++;
        active.progress = Math.round((active.currentStep / active.steps.length) * 100);
        recordActivity(current, `${active.kind === 'whatsapp' ? 'WhatsApp' : 'Campaign'} simulation: ${active.steps[active.currentStep - 1]} (${active.progress}%).`);
        if (active.currentStep >= active.steps.length) {
          active.status = 'Completed';
          recordActivity(current, 'Simulation completed. No external action was performed.', 'success');
          if (active.campaignId) {
            const campaign = current.store.campaigns.find(c => c.id === active.campaignId);
            if (campaign && campaign.status !== 'Paused') { campaign.status = 'Ready for review'; campaign.updatedAt = new Date().toISOString(); }
          }
        }
        save(id, current);
        if (active.status === 'Running') schedule(id, jobId);
      } catch (error) {
        // Record a recoverable worker error, rather than pretending the run completed.
        const failed = get(id), item = failed.jobs.find(j => j.id === jobId);
        if (item) { item.status = 'Failed'; recordActivity(failed, 'Simulation stopped after a local worker error.', 'warning'); save(id, failed); }
      }
    }, delay);
    timers.add(timer);
  }
  route('post', '/jobs', (state, req) => {
    const kind = oneOf(req.body?.kind, ['campaign', 'whatsapp'], 'task type');
    const campaignId = kind === 'campaign' ? text(req.body?.campaignId, 'Campaign ID', 100) : null;
    if (kind === 'campaign' && !state.store.campaigns.some(c => c.id === campaignId)) throw bad('Choose an existing campaign.');
    if (state.jobs.some(j => j.kind === kind && j.campaignId === campaignId && ['Pending', 'Running'].includes(j.status))) throw bad('This simulation is already running.');
    const keywordCount = state.settings.keywords.split(',').map(s => s.trim()).filter(Boolean).length;
    const job = { id: randomUUID(), kind, campaignId, status: 'Pending', progress: 0, currentStep: 0, steps: stepsFor(kind, keywordCount), delayMin: state.settings.delayMin, delayMax: state.settings.delayMax, createdAt: new Date().toISOString() };
    state.jobs.unshift(job);
    recordActivity(state, `${kind === 'whatsapp' ? 'WhatsApp' : 'Campaign'} simulation pending. No platform actions will be performed.`);
    setImmediate(() => schedule(req.workspaceId, job.id));
    return true;
  });
  route('post', '/jobs/:id/cancel', (state, req) => {
    const job = state.jobs.find(j => j.id === req.params.id);
    if (!job || !['Pending', 'Running'].includes(job.status)) throw bad('There is no running task to cancel.');
    job.status = 'Cancelled';
    recordActivity(state, 'Simulation cancelled.', 'warning');
    return true;
  });
  return { router, close: () => { for (const timer of timers) clearTimeout(timer); db.close(); } };
}

module.exports = createService;
