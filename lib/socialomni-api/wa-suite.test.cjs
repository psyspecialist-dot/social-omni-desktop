const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('../../artifacts/api-server/node_modules/express');
const createService = require('./service.cjs');
const suite = require('./wa-suite.cjs');
const browser = require('./wa-suite-browser.cjs');
const rule = { name: 'Price reply', keyword: 'price', match: 'contains', template: 'Hello {{name}}, our price is $10.', enabled: true, delayMin: 3, delayMax: 3, cooldownMinutes: 5 };

test('suite CRUD, contact consent synchronization, isolation, validation and SQLite recovery', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-suite-')), workspace = randomUUID();
  let service, server, base;
  const start = async () => {
    service = createService({ express, dbPath: path.join(dir, 'suite.sqlite') });
    const app = express(); app.use(express.json()); app.use(service.router);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); service.close(); };
  const request = async (method, route, body, status = 200, id = workspace) => {
    const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json', 'x-socialomni-workspace': id }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data;
  };
  try {
    await start(); await request('POST', '/initialize');
    let state = await request('PUT', '/suite/filter', { source: '+15550000001\n+1 (555) 000-0001\nnot-a-number\n+15550000002' });
    assert.equal(state.waSuite.filter.results.length, 3);
    assert.deepEqual(state.waSuite.filter.results.map(r => r.status), ['Unverified', 'Inactive', 'Unverified']);
    await request('PUT', '/suite/filter', { source: '' }, 400);
    assert.equal((await request('GET', '/state')).waSuite.filter.results.length, 3, 'invalid imports must not destroy results');
    await request('POST', '/suite/session', { action: 'filter', approved: true, accountId: randomUUID() }, 422);
    const client = { name: 'Test Client', phone: '+15550000001', notes: 'Call back tomorrow', status: 'Follow-up', optedIn: true };
    state = await request('POST', '/suite/threads', client);
    const threadId = state.waSuite.threads[0].id, contactId = state.waSuite.threads[0].contactId;
    assert.equal(state.store.contacts[0].optedIn, true); assert.equal(state.store.contacts[0].id, contactId);
    await request('POST', '/suite/threads', client, 400);
    state = await request('PATCH', `/suite/threads/${threadId}`, { ...client, status: 'Urgent', notes: 'Edited local note', optedIn: false });
    assert.equal(state.store.contacts[0].optedIn, false);
    state = await request('PATCH', `/suite/threads/${threadId}`, { ...client, status: 'Urgent', notes: 'Edited local note', consentChanged: false });
    assert.equal(state.waSuite.threads[0].optedIn, false, 'stale note edit must preserve an opt-out');
    state = await request('PATCH', `/contacts/${contactId}`, { name: 'Test Client', value: client.phone, channel: 'Phone', list: 'WA-CRM', optedIn: true });
    assert.equal(state.waSuite.threads[0].optedIn, true);
    state = await request('POST', '/suite/rules', rule); const ruleId = state.waSuite.rules[0].id;
    await request('POST', '/suite/rules', { ...rule, delayMin: 2 }, 400);
    await request('POST', '/suite/rules', { ...rule, delayMax: 9 }, 400);
    await request('POST', '/suite/rules', { ...rule, delayMin: 8, delayMax: 3 }, 400);
    await request('POST', '/suite/rules', { ...rule, enabled: 'true' }, 400);
    await request('PATCH', `/suite/rules/${ruleId}`, { ...rule, enabled: false, template: 'Updated' });
    state = await request('PATCH', `/suite/rules/${ruleId}`, { ...rule, template: 'Updated', enabledChanged: false });
    assert.equal(state.waSuite.rules[0].enabled, false, 'stale template edit must preserve a disabled rule');
    const isolated = await request('GET', '/state', undefined, 200, randomUUID());
    assert.deepEqual(isolated.waSuite, suite.defaults());
    await stop(); await start();
    state = await request('GET', '/state');
    assert.equal(state.waSuite.threads[0].notes, 'Edited local note');
    assert.equal(state.waSuite.threads[0].status, 'Urgent');
    assert.equal(state.waSuite.rules[0].enabled, false); assert.equal(state.waSuite.rules[0].template, 'Updated');
    await request('DELETE', `/suite/rules/${ruleId}`);
    state = await request('DELETE', `/suite/threads/${threadId}`);
    assert.equal(state.waSuite.threads.length, 0); assert.equal(state.store.contacts.length, 1);
    state = await request('DELETE', '/state');
    assert.deepEqual(state.waSuite, suite.defaults());
  } finally { if (server?.listening) await stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('WaFilter records actual platform outcomes, not syntactic or simulated success', async () => {
  const state = { waSuite: { ...suite.defaults(), filter: suite.filterInput('+15550000001\n+15550000002') } };
  const job = { targets: state.waSuite.filter.results.map(r => ({ id: r.id, name: r.phone })), completedCount: 0, totalCount: 2, currentStep: 0 };
  let current = '', paced = 0;
  const element = { first() { return this; }, isVisible: async () => current.endsWith('00002') };
  const page = { goto: async url => { current = url; }, getByText: () => element,
    locator: () => ({ ...element, isVisible: async () => current.endsWith('00001') }) };
  await browser.filter({ page, job, act: async (_label, operation) => { paced++; await operation(); },
    update: change => change(job, state), guard() {}, restriction: async () => {} });
  assert.equal(paced, 2);
  assert.deepEqual(state.waSuite.filter.results.map(r => r.status), ['Active/Valid', 'Inactive']);
  assert.equal(job.progress, 100);
  assert.equal(browser.directPeer('123@g.us'), false);
  assert.equal(browser.directPeer('123@lid'), true);
});

test('watched-chat bot ignores baseline, waits, confirms, deduplicates, enforces cooldown and honors STOP', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const id = randomUUID(), accountId = randomUUID(), contactId = randomUUID();
  const state = {
    waSuite: { ...suite.defaults(), threads: [{ id, name: 'Client', phone: '+15550000001', notes: '', status: 'New', optedIn: true, contactId, messages: [], remoteKey: null }],
      rules: [{ ...rule, id: 'rule', createdAt: new Date().toISOString() }] },
    store: { contacts: [{ id: contactId, optedIn: true, value: '+15550000001', name: 'Client', channel: 'Phone', list: 'WA-CRM' }], lists: ['WA-CRM'] },
    analytics: { messagesSent: 7 },
  };
  const messages = [{ id: 'false_15550000001@c.us_old', direction: 'incoming', text: 'price', status: 'Received' }];
  let running = true, sends = 0;
  const waits = [];
  const bubble = { waitFor: async () => {}, locator() { return this; }, first() { return this; },
    evaluate: async () => 'true_15550000001@c.us_sent' };
  const page = {
    locator(selector) {
      if (selector === '#main') return { isVisible: async () => true, evaluate: async () => ({ name: 'Client', messages: structuredClone(messages) }) };
      if (selector === '.message-out') return { filter() { return this; }, count: async () => 0, nth: () => bubble };
      if (selector.startsWith('footer')) return { first() { return this; }, textContent: async () => '', fill: async () => {} };
      return { first() { return this; }, click: async () => { sends++; messages.push({ id: 'true_15550000001@c.us_sent', direction: 'outgoing', text: 'Hello Client, our price is $10.', status: 'Accepted' }); } };
    },
  };
  const job = { accountId, completedCount: 0 };
  const finished = browser.inbox({ page, job, getState: () => state,
    update: change => change(job, state), guard: () => { if (!running) throw new Error('Cancelled'); }, restriction: async () => {},
    act: async (_phase, operation, pacing) => { waits.push(pacing); await new Promise(resolve => setTimeout(resolve, pacing.min * 1000)); await operation(); },
  }).catch(e => e.message);
  const step = async seconds => { t.mock.timers.tick(seconds * 1000); await new Promise(resolve => setImmediate(resolve)); };
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sends, 0, 'historic keyword never triggers');
  messages.push({ id: 'false_15550000001@c.us_new', direction: 'incoming', text: 'PRICE please', status: 'Received' });
  await step(1);
  assert.deepEqual(waits, [{ min: 3, max: 3 }]);
  await step(2); assert.equal(sends, 0, 'no immediate reply');
  await step(1); assert.equal(sends, 1);
  assert.equal(state.analytics.realMessagesSent, 1); assert.equal(state.analytics.messagesSent, 7);
  assert.equal(state.waSuite.threads[0].messages.filter(m => m.direction === 'outgoing').length, 1);
  await step(1); assert.equal(sends, 1, 'existing incoming and observed outgoing must not duplicate');
  messages.push({ id: 'false_15550000001@c.us_again', direction: 'incoming', text: 'price', status: 'Received' });
  await step(1); assert.equal(sends, 1, 'cooldown blocks new repeat');
  messages.push({ id: 'false_15550000001@c.us_stop', direction: 'incoming', text: 'STOP', status: 'Received' });
  await step(1);
  assert.equal(state.waSuite.threads[0].optedIn, false); assert.equal(state.store.contacts[0].optedIn, false);
  running = false; await step(1); assert.equal(await finished, 'Cancelled');
});
