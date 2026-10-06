const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('../../artifacts/api-server/node_modules/express');
const createService = require('./service.cjs');

test('SQLite drafts, attachments, sequential queues, validation, cancellation and restart recovery', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'socialomni-test-'));
  const dbPath = path.join(directory, 'workspace.sqlite');
  const workspace = randomUUID();
  let service, server, base;
  const start = async () => {
    service = createService({ express, dbPath, secret: 'demo-test-secret' });
    const app = express();
    app.use(express.json({ limit: '8mb' }));
    app.use(service.router);
    server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => { await new Promise(resolve => server.close(resolve)); service.close(); };
  const request = async (method, route, body, expected = 200, id = workspace) => {
    const response = await fetch(`${base}${route}`, {
      method, headers: { 'content-type': 'application/json', 'x-socialomni-workspace': id, 'x-socialomni-secret': 'demo-test-secret' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
  const waitFor = async predicate => {
    const until = Date.now() + 20000;
    do {
      const state = await request('GET', '/state');
      if (predicate(state)) return state;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < until);
    throw new Error('Queue did not reach the expected state.');
  };
  try {
    await start();
    assert.equal((await request('POST', '/initialize')).initialized, true);
    await request('POST', '/accounts', { platform: 'WhatsApp', displayLabel: 'Demo sender', handle: '+15550000001', status: 'Active (simulated)', demoSession: 'real-cookie' }, 400);
    const account = (await request('POST', '/accounts', { platform: 'WhatsApp', displayLabel: 'Demo sender', handle: '+15550000001', status: 'Active (simulated)', demoSession: 'demo-test' })).store.accounts[0];
    const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lR8AAAAASUVORK5CYII=';
    await request('POST', '/media', { name: 'not-image.png', mime: 'image/png', data: Buffer.from('Not an image').toString('base64') }, 400);
    const media = (await request('POST', '/media', { name: 'demo.png', mime: 'image/png', data })).media[0];
    const content = (await request('GET', `/media/${media.id}`)).mediaContent;
    assert.equal(content.dataUrl, `data:image/png;base64,${data}`);
    await request('GET', `/media/${media.id}`, undefined, 404, randomUUID());
    assert.equal((await request('GET', '/state')).mediaContent, undefined);
    const settings = {
      phoneNumbers: '+15550000002,\n+15550000003,+1 (555) 000-0002',
      messageContent: '**Hello** {phone}', keywords: 'coffee', delayMin: 3, delayMax: 3,
      accountId: account.id, mediaId: media.id,
    };
    let state = await request('PUT', '/settings', settings);
    assert.equal(state.settings.phoneNumbers, '+15550000002\n+15550000003');
    await request('PUT', '/settings', { delayMin: 2 }, 400);
    await request('PUT', '/settings', { phoneNumbers: 'not-a-number' }, 400);
    assert.equal((await request('GET', '/state')).settings.messageContent, settings.messageContent);
    const campaign = (await request('POST', '/campaigns', {
      title: 'Demo group rehearsal', platform: 'Facebook', caption: 'A saved caption',
      status: 'Draft', scheduledAt: '', keywords: 'coffee, art', targetGroupCount: 1, mediaId: media.id,
    })).store.campaigns[0];
    const whatsappId = (await request('POST', '/jobs', { kind: 'whatsapp' })).jobs[0].id;
    const campaignId = (await request('POST', '/jobs', { kind: 'campaign', campaignId: campaign.id })).jobs[0].id;
    state = await waitFor(s => s.jobs.find(j => j.id === whatsappId)?.status === 'Running');
    assert.equal(state.jobs.find(j => j.id === campaignId).status, 'Pending');
    await request('DELETE', `/media/${media.id}`, undefined, 400);
    state = await waitFor(s => s.jobs.find(j => j.id === whatsappId)?.status === 'Completed');
    assert.equal(state.jobs.find(j => j.id === whatsappId).completedCount, 2);
    assert.equal(state.jobs.find(j => j.id === whatsappId).targets.every(t => t.sendStatus === 'Sent'), true);
    state = await waitFor(s => s.jobs.find(j => j.id === campaignId)?.status === 'Completed');
    const completed = state.jobs.find(j => j.id === campaignId);
    assert.equal(completed.targets[0].joinStatus, 'Joined');
    assert.equal(completed.targets[0].postStatus, 'Posted');
    assert.match(completed.targets[0].name, /Demo coffee group/);
    assert.equal(completed.progress, 100);
    assert.equal(state.store.activity.some(a => a.message.includes('Simulated uploading')), true);
    assert.equal(state.store.activity.some(a => a.message.includes('Waiting 3s')), true);
    const cancelledId = (await request('POST', '/jobs', { kind: 'whatsapp' })).jobs[0].id;
    await request('POST', `/jobs/${cancelledId}/cancel`);
    state = await request('GET', '/state');
    assert.equal(state.jobs.find(j => j.id === cancelledId).status, 'Cancelled');
    const interruptedId = (await request('POST', '/jobs', { kind: 'whatsapp' })).jobs[0].id;
    await stop();
    await start();
    state = await request('GET', '/state');
    assert.equal(state.jobs.find(j => j.id === interruptedId).status, 'Failed');
    assert.equal(state.settings.messageContent, settings.messageContent);
    assert.equal(state.store.campaigns[0].targetGroupCount, 1);
    assert.equal((await request('GET', `/media/${media.id}`)).mediaContent.dataUrl, content.dataUrl);
    await request('PUT', '/settings', { mediaId: null });
    await request('PATCH', `/campaigns/${campaign.id}`, { ...state.store.campaigns[0], mediaId: null });
    await request('DELETE', `/media/${media.id}`);
    await request('PUT', '/settings', { theme: 'dark' });
    state = await request('DELETE', '/state');
    assert.equal(state.media.length, 0);
    assert.equal(state.store.accounts.length, 0);
    assert.equal(state.settings.phoneNumbers, '');
    assert.equal(state.settings.theme, 'dark');
  } finally {
    if (server?.listening) await stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
