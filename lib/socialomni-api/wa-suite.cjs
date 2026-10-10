const { randomUUID } = require('node:crypto');
const { bad, text, oneOf } = require('./validation.cjs');

const defaults = () => ({ filter: { source: '', results: [] }, threads: [], rules: [] });
const phone = value => {
  const clean = String(value).replace(/[\s().'-]/g, '').replace(/^\+/, '');
  return /^[1-9]\d{6,14}$/.test(clean) ? `+${clean}` : '';
};
const filterInput = source => {
  source = text(source, 'Phone list', 10000);
  const inputs = source.split(/[\n\r,;]+/).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const results = [];
  for (const input of inputs) {
    const normalized = phone(input), key = normalized || input;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ id: randomUUID(), input, phone: normalized, status: normalized ? 'Unverified' : 'Inactive',
      reason: normalized ? 'Format accepted; WhatsApp registration has not been checked.' : 'Invalid international phone-number format; not queried on WhatsApp.', checkedAt: null });
  }
  if (!results.length || results.length > 200) throw bad('Import between 1 and 200 unique numbers, including country codes.');
  return { source, results };
};
const threadInput = body => {
  const name = text(body.name, 'Client name', 150), raw = text(body.phone, 'Phone', 30);
  if (!name || (raw && !phone(raw))) throw bad('Enter a name and a valid international phone number.');
  if (typeof body.optedIn !== 'boolean') throw bad('Consent must be explicitly set.');
  const tags = body.tags ?? [];
  if (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 50)) throw bad('Use at most 20 nonempty tags, each at most 50 characters.');
  return { name, phone: raw ? phone(raw) : '', status: oneOf(body.status, ['New', 'Follow-up', 'Closed/Won', 'Urgent'], 'CRM status'),
    notes: text(body.notes, 'Notes', 10000), tags: [...new Set(tags.map(tag => tag.trim()))], optedIn: body.optedIn };
};
const ruleInput = body => {
  const name = text(body.name, 'Rule name', 100), keyword = text(body.keyword, 'Keyword', 200), template = text(body.template, 'Response template', 2000);
  if (!name || !keyword || !template) throw bad('Rule name, keyword, and response template are required.');
  if (typeof body.enabled !== 'boolean') throw bad('Rule enabled must be a boolean.');
  const { delayMin, delayMax, cooldownMinutes } = body;
  if (![delayMin, delayMax, cooldownMinutes].every(Number.isInteger) || delayMin < 3 || delayMax > 8 || delayMax < delayMin || cooldownMinutes < 1 || cooldownMinutes > 1440) {
    throw bad('Reply delays must be 3–8 seconds (maximum at least minimum); cooldown must be 1–1440 minutes.');
  }
  return { name, keyword, template, match: oneOf(body.match, ['contains', 'exact'], 'keyword match'), enabled: body.enabled, delayMin, delayMax, cooldownMinutes };
};
const matches = (rule, value) => {
  const incoming = value.trim().toLocaleLowerCase(), keyword = rule.keyword.toLocaleLowerCase();
  return rule.enabled && (rule.match === 'exact' ? incoming === keyword : incoming.includes(keyword));
};
const optOut = value => /^(stop|unsubscribe|opt[\s-]?out|do not contact me|don't contact me)[.! ]*$/i.test(value.trim());
const linkContact = (state, thread) => {
  if (!thread.phone) return;
  let contact = state.store.contacts.find(c => c.channel === 'Phone' && phone(c.value) === thread.phone);
  if (!contact) {
    if (state.store.contacts.length >= 1000) throw bad('Contact limit reached. Remove unused contacts before adding CRM clients.');
    contact = { id: randomUUID(), name: thread.name, channel: 'Phone', value: thread.phone, optedIn: thread.optedIn, list: 'WA-CRM', createdAt: new Date().toISOString() };
    state.store.contacts.unshift(contact);
  } else {
    contact.name = thread.name; contact.optedIn = thread.optedIn;
  }
  thread.contactId = contact.id;
  if (!state.store.lists.includes(contact.list)) state.store.lists.push(contact.list);
};

function install({ route, automation, recordActivity }) {
  const busy = state => state.jobs.some(j => ['Pending', 'Running'].includes(j.status));
  route('put', '/suite/filter', (state, req) => {
    if (state.jobs.some(j => j.action === 'filter' && ['Pending', 'Running'].includes(j.status))) throw bad('Stop the filter before replacing its list.');
    state.waSuite.filter = filterInput(req.body?.source);
    recordActivity(state, `WaFilter imported ${state.waSuite.filter.results.length} unique entries. Valid formatting is not proof of WhatsApp registration.`);
    return true;
  });
  for (const [collection, validate] of [['threads', threadInput], ['rules', ruleInput]]) {
    route('post', `/suite/${collection}`, (state, req) => {
      const records = state.waSuite[collection], draft = validate(req.body || {});
      if (records.length >= (collection === 'rules' ? 100 : 1000)) throw bad('Module record limit reached.');
      if (collection === 'threads' && (!draft.phone || records.some(t => t.phone === draft.phone))) throw bad('Use a unique international phone number, or edit its existing CRM thread.');
      const now = new Date().toISOString();
      const record = { ...draft, id: randomUUID(), createdAt: now };
      if (collection === 'threads') {
        Object.assign(record, { messages: [], updatedAt: now, contactId: null, accountId: null, remoteKey: null });
        linkContact(state, record);
      }
      records.unshift(record);
      recordActivity(state, `Created ${collection === 'rules' ? 'chatbot rule' : 'CRM client'} “${record.name}”.`, 'success');
      return true;
    });
    route('patch', `/suite/${collection}/:id`, (state, req) => {
      const record = state.waSuite[collection].find(r => r.id === req.params.id);
      if (!record) throw Object.assign(new Error('Module record not found.'), { status: 404 });
      const draft = validate(req.body || {});
      if (collection === 'threads' && !Object.hasOwn(req.body || {}, 'tags')) draft.tags = record.tags || [];
      if (collection === 'threads' && req.body.consentChanged === false) draft.optedIn = record.optedIn;
      if (collection === 'rules' && req.body.enabledChanged === false) draft.enabled = record.enabled;
      if (collection === 'threads' && draft.phone && state.waSuite.threads.some(t => t.id !== record.id && t.phone === draft.phone)) throw bad('That phone number already belongs to another CRM client.');
      if (collection === 'threads' && record.remoteKey && record.phone && draft.phone !== record.phone) throw bad('A synced conversation cannot be moved to another phone number. Create a separate client instead.');
      Object.assign(record, draft);
      if (collection === 'threads') { record.updatedAt = new Date().toISOString(); linkContact(state, record); }
      recordActivity(state, `Updated ${collection === 'rules' ? 'chatbot rule' : 'CRM client'} “${record.name}”.`);
      return true;
    });
    route('delete', `/suite/${collection}/:id`, (state, req) => {
      if (collection === 'threads' && state.jobs.some(j => j.action === 'inbox' && ['Pending', 'Running'].includes(j.status))) throw bad('Stop inbox sync before deleting a CRM thread.');
      const records = state.waSuite[collection], index = records.findIndex(r => r.id === req.params.id);
      if (index < 0) throw Object.assign(new Error('Module record not found.'), { status: 404 });
      records.splice(index, 1);
      recordActivity(state, `Removed ${collection === 'rules' ? 'chatbot rule' : 'CRM thread; linked contact retained'}.`, 'warning');
      return true;
    });
  }
  route('post', '/suite/session', (state, req) => {
    if (!automation) throw Object.assign(new Error('WaFilter verification and inbox monitoring run only in the downloaded desktop app.'), { status: 422 });
    const body = req.body || {}, action = oneOf(body.action, ['filter', 'inbox'], 'module action');
    if (body.replyToExistingUnread !== undefined && typeof body.replyToExistingUnread !== 'boolean') throw bad('Existing unread reply approval must be a boolean.');
    if (body.approved !== true) throw bad('Confirm authorization for these contacts and automatic replies before starting.');
    const account = state.store.accounts.find(a => a.id === body.accountId && a.platform === 'WhatsApp');
    if (!account || account.status.startsWith('Paused') || !/^[a-f0-9-]{36}$/i.test(account.id)) throw bad('Choose an active saved WhatsApp account.');
    if (busy(state)) throw bad('Stop or finish the current browser/queue task before starting another module.');
    const results = state.waSuite.filter.results.filter(r => r.phone);
    if (action === 'filter' && !results.length) throw bad('Import valid-format phone numbers first.');
    const job = { id: randomUUID(), mode: 'live', platform: 'WhatsApp', kind: 'whatsapp', action, accountId: account.id,
      accountName: account.displayLabel, campaignId: null, status: 'Pending', phase: 'Queued', createdAt: new Date().toISOString(),
      progress: 0, currentStep: 0, completedCount: 0, totalCount: action === 'filter' ? results.length : 0, nextActionAt: null, steps: [],
      delayMin: state.settings.delayMin, delayMax: state.settings.delayMax,
      replyToExistingUnread: action === 'inbox' && body.replyToExistingUnread === true,
      targets: action === 'filter' ? results.map(r => ({ id: r.id, name: r.phone, joinStatus: 'Pending', postStatus: 'Pending', sendStatus: 'Pending' })) : [] };
    if (action === 'filter') for (const result of results) {
      result.status = 'Unverified'; result.reason = 'Queued for a live registration check.'; result.checkedAt = null;
    }
    state.jobs.unshift(job);
    recordActivity(state, `Queued ${action === 'filter' ? 'WaFilter (5–12s browser pacing)' : 'unread inbox observer (new opted-in messages only; chatbot delays 3–8s)'}. Delays do not prevent bans.`);
    return true;
  });
}
module.exports = { defaults, phone, filterInput, threadInput, ruleInput, matches, optOut, linkContact, install };
