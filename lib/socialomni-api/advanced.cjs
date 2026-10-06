const { randomUUID } = require('node:crypto');
const { bad, text, oneOf } = require('./validation.cjs');
const kinds = ['maps','b2b','verify-email','email-send','telegram-send','telegram-members','telegram-channel','facebook-search','facebook-join','facebook-post','instagram-post'];
const active = t => ['Queued','Running'].includes(t.status);
const defaults = () => ({ tasks: [], results: [], connections: [] });
const lines = value => [...new Set(String(value || '').split(/[\r\n]+/).map(v => v.trim()).filter(Boolean))];
const email = value => {
  if(typeof value!=='string' || value.length>254) return false;
  const parts=value.split('@');if(parts.length!==2) return false;
  const [local,domain]=parts,labels=domain.split('.');
  return local.length>0 && local.length<=64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) && labels.length>=2 &&
    labels.every(label=>label.length<=63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) &&
    /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(labels.at(-1));
};
function taskInput(body) {
  const kind = oneOf(body.kind, kinds, 'task kind'), name = text(body.name, 'Task name', 150);
  if (!name) throw bad('Task name is required.');
  const task = { kind, name, source: text(body.source || '', 'Source', 15000), message: text(body.message || '', 'Message', 10000),
    subject: text(body.subject || '', 'Subject', 200), query: text(body.query || '', 'Query', 300),
    accountId: text(body.accountId || '', 'Account', 100), mediaId: text(body.mediaId || '', 'Media', 100),
    limit: body.limit ?? (['maps','telegram-members','facebook-search'].includes(kind)?20:200), scheduledAt: text(body.scheduledAt || '', 'Scheduled time', 100), approved: body.approved === true };
  if (!Number.isInteger(task.limit) || task.limit < 1 || task.limit > 200) throw bad('Limit must be 1–200.');
  if (lines(task.source).length > 200) throw bad('Use at most 200 unique targets.');
  if (task.scheduledAt && (!Number.isFinite(Date.parse(task.scheduledAt)) || Date.parse(task.scheduledAt) < Date.now())) throw bad('Choose a future scheduled time.');
  return task;
}
function validateRun(state, task, runtime) {
  if (!runtime) throw Object.assign(new Error('Live tasks run only in the downloaded desktop app.'), { status: 422 });
  if (!task.approved) throw bad('Confirm permission and recipient consent before running.');
  if (['maps','facebook-search'].includes(task.kind) && !task.query) throw bad('Enter a search query.');
  if (!['maps','facebook-search','instagram-post'].includes(task.kind) && !lines(task.source).length) throw bad('Enter targets first.');
  if (['email-send','telegram-send','telegram-channel','facebook-post','instagram-post'].includes(task.kind) && !task.message) throw bad('Message or caption is required.');
  if (task.kind === 'email-send') {
    if (!task.subject || /[\r\n]/.test(task.subject)) throw bad('Enter a single-line email subject.');
    if (lines(task.source).some(v => !email(v))) throw bad('Clean invalid email addresses before sending.');
  }
  if (task.kind.startsWith('facebook-') || task.kind === 'instagram-post') {
    const platform = task.kind.startsWith('facebook-') ? 'Facebook' : 'Instagram';
    const account = state.store.accounts.find(a => a.id === task.accountId && a.platform === platform && !a.status.startsWith('Paused'));
    if (!account) throw bad(`Choose an active ${platform} account.`);
    if (/^facebook-(join|post)$/.test(task.kind)) {
      const { groupUrl } = require('./browser-worker.cjs');
      for (const url of lines(task.source)) { try { groupUrl(url); } catch { throw bad('Use exact https://www.facebook.com/groups/<group-id> URLs.'); } }
    }
    if (task.kind === 'instagram-post' && !state.media.some(m => m.id === task.mediaId && ['image/jpeg','image/png'].includes(m.mime))) throw bad('Choose a saved JPEG or PNG image.');
  }
  if (task.kind === 'email-send' && !state.advanced.connections.find(c => c.id === 'smtp')?.configured) throw bad('Configure the local SMTP connection first.');
  if (task.kind.startsWith('telegram-') && !state.advanced.connections.find(c => c.id === 'telegram')?.connected) throw bad('Authorize the local Telegram account first.');
}
function install({ route, runtime, vault, engine, recordActivity }) {
  const idle = state => !state.jobs.some(j => ['Pending','Running'].includes(j.status)) && !state.advanced.tasks.some(active);
  const find = (state, id) => { const t = state.advanced.tasks.find(t => t.id === id); if (!t) throw Object.assign(new Error('Task not found.'), { status: 404 }); return t; };
  const queue = (state, task, workspaceId) => {
    validateRun(state, task, runtime);
    if (engine.authBusy(workspaceId)) throw bad('Finish connection setup before starting tasks.');
    if (!task.scheduledAt && !idle(state)) throw bad('Finish or cancel the active task first.');
    task.status = task.scheduledAt ? 'Scheduled' : 'Queued';
    task.phase = task.status; task.error = '';
  };
  route('post','/advanced/tasks', (state, req) => {
    if (state.advanced.tasks.length >= 200) throw bad('Remove old tasks before creating more (limit 200).');
    const t = { ...taskInput(req.body || {}), id: randomUUID(), status: 'Draft', phase: 'Draft', progress: 0, completedCount: 0, totalCount: 0, error: '', createdAt: new Date().toISOString(), nextActionAt: null };
    if (t.approved && t.scheduledAt) queue(state, t, req.workspaceId);
    state.advanced.tasks.unshift(t);
    recordActivity(state, `${t.kind}: saved “${t.name}” (${t.status}).`);
    return true;
  });
  route('patch','/advanced/tasks/:id', (state, req) => {
    const t = find(state, req.params.id);
    if (!['Draft','Scheduled'].includes(t.status)) throw bad('Only unstarted drafts and schedules can be edited.');
    Object.assign(t, taskInput(req.body || {}), { status: 'Draft', phase: 'Draft' });
    if (t.approved && t.scheduledAt) queue(state, t, req.workspaceId);
    return true;
  });
  route('post','/advanced/tasks/:id/run', (state, req) => {
    const t = find(state, req.params.id);
    if (!['Draft','Scheduled'].includes(t.status)) throw bad('This task has already started. Review outcomes; create a new task rather than retrying uncertain sends.');
    if (req.body?.approved !== true) throw bad('Explicit approval is required.');
    t.approved = true;
    if (t.scheduledAt && Date.parse(t.scheduledAt) <= Date.now()) throw bad('Missed schedule: edit its time or clear it and review targets first.');
    const old = t.status; t.status = 'Draft';
    try { queue(state, t, req.workspaceId); } catch (e) { t.status = old; throw e; }
    recordActivity(state, `${t.kind}: ${t.status.toLowerCase()} “${t.name}”. Rate controls do not guarantee account safety.`);
    return true;
  });
  route('post','/advanced/tasks/:id/cancel', (state, req) => {
    const t = find(state, req.params.id);
    if (!['Scheduled','Queued','Running'].includes(t.status)) throw bad('No active task to cancel.');
    t.status = 'Cancelled'; t.phase = 'Cancelled'; t.nextActionAt = null;
    const legacy=state.jobs.find(j=>j.id===t.id);
    if (legacy && ['Pending','Running'].includes(legacy.status)) {legacy.status='Cancelled';legacy.phase='Cancelled';legacy.nextActionAt=null;}
    engine.cancel(req.workspaceId, t.id);
    recordActivity(state, 'Task cancelled. Already submitted actions cannot be undone.', 'warning');
    return true;
  });
  route('delete','/advanced/tasks/:id', (state, req) => {
    const t = find(state, req.params.id);
    if (active(t) || t.status === 'Scheduled') throw bad('Cancel this task before deleting it.');
    state.advanced.tasks = state.advanced.tasks.filter(r => r.id !== t.id); return true;
  });
  route('delete','/advanced/results/:id', (state, req) => {
    if (state.advanced.tasks.some(active)) throw bad('Stop active tasks before deleting results.');
    if (!state.advanced.results.some(r => r.id === req.params.id)) throw Object.assign(new Error('Result not found.'), { status: 404 });
    state.advanced.results = state.advanced.results.filter(r => r.id !== req.params.id); return true;
  });
  route('put','/advanced/connections/:id', (state, req) => {
    if (!runtime || !vault.available()) throw Object.assign(new Error('Credentials can only be saved with native OS encryption in the desktop app.'), { status: 422 });
    if (!idle(state) || engine.authBusy(req.workspaceId)) throw bad('Stop active tasks or finish Telegram sign-in before editing connections.');
    const id = oneOf(req.params.id, ['smtp','telegram'], 'connection'), b = req.body || {}, old = vault.read(req.workspaceId,id) || {};
    let config;
    if (id === 'smtp') {
      const host = text(b.host, 'SMTP host', 250), from = text(b.from, 'Sender email', 254), username = text(b.username || '', 'SMTP username', 300);
      if (!/^[a-z0-9.-]+$/i.test(host) || !email(from) || !Number.isInteger(b.port) || ![465,587].includes(b.port) || typeof b.secure !== 'boolean' || b.secure !== (b.port === 465)) throw bad('Use a valid sender and SMTP host, port 465/TLS or 587/STARTTLS.');
      const password = text(b.password || '', 'SMTP password', 1000) || old.password;
      if (!username || !password) throw bad('SMTP username and password are required.');
      config = {host,from,username,password,port:b.port,secure:b.secure};
    } else {
      const apiHash = text(b.apiHash || '', 'Telegram API hash', 100) || old.apiHash;
      if (!Number.isInteger(b.apiId) || b.apiId < 1 || !/^[a-f0-9]{32}$/i.test(apiHash || '')) throw bad('Enter your Telegram API ID and 32-character API hash.');
      config = { apiId: b.apiId, apiHash, session: old.apiId === b.apiId && old.apiHash === apiHash ? old.session || '' : '' };
    }
    vault.write(req.workspaceId,id,config);
    const connection = { id, configured: true, connected: Boolean(config.session), label: id === 'smtp' ? `${config.from} via ${config.host}` : 'Local Telegram API account',
      stage: config.session ? 'connected' : id==='smtp'?'testing':'ready', error: '' };
    state.advanced.connections = [...state.advanced.connections.filter(c => c.id !== id),connection];
    if (id==='smtp') engine.testSmtp(req.workspaceId);
    recordActivity(state, `${id} connection saved with OS encryption. Credentials are never included in workspace responses.`, 'success');
    return true;
  });
  route('delete','/advanced/connections/:id', (state, req) => {
    if (!runtime || !idle(state) || engine.authBusy(req.workspaceId)) throw bad('Finish tasks and sign-in before removing local credentials.');
    const id = oneOf(req.params.id,['smtp','telegram'],'connection');
    vault.remove(req.workspaceId,id);
    state.advanced.connections = state.advanced.connections.filter(c => c.id !== id);
    recordActivity(state, `${id} credentials and session removed.`, 'warning'); return true;
  });
  route('post','/advanced/telegram/auth', (state, req) => {
    if (!runtime || !vault.available()) throw Object.assign(new Error('Telegram sign-in is native desktop only.'), {status:422});
    if (!idle(state)) throw bad('Stop active tasks before signing in.');
    const action = oneOf(req.body?.action,['start','code','password'],'auth action'), value = text(req.body?.value,'Sign-in value',300);
    if (action === 'start') {
      if (!/^\+[1-9]\d{6,14}$/.test(value)) throw bad('Enter a phone number with country code.');
      if (!vault.read(req.workspaceId,'telegram')) throw bad('Save Telegram API settings first.');
      if (engine.authBusy(req.workspaceId)) throw bad('Telegram sign-in is already in progress.');
      const c = state.advanced.connections.find(c=>c.id==='telegram'); c.stage = 'connecting'; c.error = '';
      engine.beginAuth(req.workspaceId,value);
    } else engine.answerAuth(req.workspaceId,action,value);
    return true;
  });
}
module.exports = {defaults,lines,email,taskInput,validateRun,active,install};
