const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('../../artifacts/api-server/node_modules/express');
const createService = require('./service.cjs');

test('browser tasks are desktop-only, consent-gated, validated and persisted honestly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-routes-'));
  const workspace = randomUUID();
  let service, server, base;
  const start = async automation => {
    service = createService({ express, dbPath: path.join(dir, 'workspace.sqlite'), automation });
    const app = express(); app.use(express.json()); app.use(service.router);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); service.close(); };
  const request = async (method, route, body, status = 200) => {
    const r = await fetch(base + route, { method, headers: { 'content-type': 'application/json', 'x-socialomni-workspace': workspace }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data;
  };
  let launched = 0;
  try {
    await start();
    let state = await request('POST', '/initialize');
    assert.equal(state.settings.theme, 'dark');
    assert.equal(state.settings.delayMin, 5); assert.equal(state.settings.delayMax, 12);
    await request('POST', '/browser/jobs', { action: 'connect', accountId: 'any' }, 422);
    await stop();
    await start({ profileDir: path.join(dir, 'profiles'), chromium: { launchPersistentContext: async () => { launched++; throw new Error('Test browser intentionally unavailable'); } } });
    const account = (await request('POST', '/accounts', { platform: 'WhatsApp', displayLabel: 'Approved test label', handle: '+15550000001', status: 'Active label' })).store.accounts[0];
    await request('PUT', '/settings', { phoneNumbers: '+15550000002', messageContent: 'Consent test', delayMin: 5, delayMax: 12 });
    await request('PUT', '/settings', { delayMin: 4 }, 400);
    await request('PUT', '/settings', { delayMax: 13 }, 400);
    await request('POST', '/browser/jobs', { action: 'send', accountId: account.id }, 400);
    await request('POST', '/browser/jobs', { action: 'publish', accountId: account.id, approved: true }, 400);
    assert.equal(launched, 0, 'invalid requests must never launch a browser');
    state = await request('POST', '/browser/jobs', { action: 'send', accountId: account.id, approved: true });
    const jobId = state.jobs[0].id;
    await new Promise(resolve => setTimeout(resolve, 30));
    state = await request('GET', '/state');
    const job = state.jobs.find(j => j.id === jobId);
    assert.equal(job.mode, 'live'); assert.equal(job.status, 'Failed'); assert.equal(job.completedCount, 0);
    assert.equal(launched, 1);
    assert.equal(state.analytics.realMessagesSent || 0, 0);
    assert.ok(state.store.activity.some(a => a.message.includes('Test browser intentionally unavailable')));
    await stop();
    await start();
    state = await request('GET', '/state');
    assert.equal(state.jobs.find(j => j.id === jobId).status, 'Failed', 'failed live outcomes survive SQLite reload');
    assert.equal(state.automationAvailable, false);
    assert.equal(fs.statSync(path.join(dir, 'workspace.sqlite')).mode & 0o777, 0o600);
  } finally {
    if (server.listening) await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
