const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('../../artifacts/api-server/node_modules/express');
const createService = require('./service.cjs');

test('lead drafts, sequential synthetic results, cancellation, SQLite recovery, license and analytics', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'socialomni-leads-'));
  const dbPath = path.join(dir, 'data.sqlite'), workspace = randomUUID();
  let service, server, base;
  const start = async () => {
    service = createService({ express, dbPath });
    const app = express(); app.use(express.json()); app.use(service.router);
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); service.close(); };
  const request = async (method, route, body, expected = 200, id = workspace) => {
    const r = await fetch(base + route, { method, headers: { 'content-type': 'application/json', 'x-socialomni-workspace': id }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await r.json(); assert.equal(r.status, expected, JSON.stringify(json)); return json;
  };
  const settle = async jobId => {
    for (let i = 0; i < 160; i++) {
      const state = await request('GET', '/state');
      if (state.jobs.find(j => j.id === jobId)?.status === 'Completed') return state;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error('Timed out waiting for simulation');
  };
  await start();
  try {
    await request('POST', '/initialize');
    await request('POST', '/jobs', { kind: 'leads' }, 400);
    await request('PUT', '/leads', { keyword: 'cafes', city: 'Example City', targetCount: 3 });
    await request('PUT', '/leads', { keyword: 'bad', city: 'bad', targetCount: 201 }, 400);
    assert.equal((await request('GET', '/state')).leads.keyword, 'cafes');
    await request('PUT', '/settings', { licenseKey: 'DEMO-TEST-PLACEHOLDER' });
    let state = await request('POST', '/jobs', { kind: 'leads' });
    const id = state.jobs[0].id;
    await request('POST', '/jobs', { kind: 'leads' }, 400);
    await request('DELETE', '/leads', undefined, 400);
    // Changing the draft cannot change an already queued run's inputs.
    await request('PUT', '/leads', { keyword: 'restaurants', city: 'Different City', targetCount: 10 });
    state = await settle(id);
    assert.equal(state.leads.results.length, 3);
    assert.equal(state.jobs.find(j => j.id === id).progress, 100);
    assert.ok(state.leads.results.every(l => l.simulated && l.keyword === 'cafes' && l.city === 'Example City' && /^https:\/\/business-\d+\.example$/.test(l.website) && /^\+120255501\d{2}$/.test(l.phoneNumber)));
    const isolated = await request('GET', '/state', undefined, 200, randomUUID());
    assert.equal(isolated.leads.results.length, 0);
    state = await request('POST', '/jobs', { kind: 'leads' });
    const cancelledId = state.jobs[0].id;
    await new Promise(r => setTimeout(r, 160));
    state = await request('POST', `/jobs/${cancelledId}/cancel`);
    const afterStop = state.leads.results.length;
    await new Promise(r => setTimeout(r, 1100));
    assert.equal((await request('GET', '/state')).leads.results.length, afterStop);
    await request('POST', '/jobs', { kind: 'leads' });
    await stop(); await start();
    state = await request('GET', '/state');
    assert.equal(state.leads.results.length, afterStop);
    assert.equal(state.leads.keyword, 'restaurants');
    assert.equal(state.settings.licenseKey, 'DEMO-TEST-PLACEHOLDER');
    assert.ok(state.jobs.some(j => j.kind === 'leads' && j.status === 'Failed' && j.phase === 'Interrupted'));
    state = await request('DELETE', '/leads');
    assert.equal(state.leads.results.length, 0);
    assert.equal(state.leads.keyword, 'restaurants');
    await request('PUT', '/settings', { phoneNumbers: '+15550000001', messageContent: 'Demo message', delayMin: 5, delayMax: 5 });
    state = await request('POST', '/jobs', { kind: 'whatsapp' });
    state = await settle(state.jobs[0].id);
    assert.equal(state.analytics.messagesSent, 1);
    const campaign = { title: '200+ group rehearsal', platform: 'Facebook', caption: 'Demo caption', scheduledAt: '', status: 'Draft', keywords: 'cafes', targetGroupCount: 250 };
    state = await request('POST', '/campaigns', campaign);
    assert.equal(state.store.campaigns[0].targetGroupCount, 250);
    await request('POST', '/campaigns', { ...campaign, targetGroupCount: 1001 }, 400);
    await stop(); await start();
    state = await request('GET', '/state');
    assert.equal(state.analytics.messagesSent, 1);
    assert.equal(state.store.campaigns[0].targetGroupCount, 250);
    state = await request('DELETE', '/state');
    assert.equal(state.analytics.messagesSent, 0);
    assert.equal(state.settings.licenseKey, '');
    assert.deepEqual(state.leads, { keyword: '', city: '', targetCount: 10, results: [] });
  } finally { await stop(); fs.rmSync(dir, { recursive: true, force: true }); }
});
