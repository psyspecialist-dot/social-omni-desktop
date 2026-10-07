const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const express = require('../../artifacts/api-server/node_modules/express');
const createService = require('./service.cjs');
const registerBrowserIpc = require('../../artifacts/social-omni-desktop/desktop/browser-ipc.cjs');
const preloadPath = path.resolve(__dirname, '../../artifacts/social-omni-desktop/desktop/preload.js');

function harness(options) {
  const handlers = new Map(), listeners = new Map(), consoleMessages = [];
  const sender = {};
  let bridge;
  registerBrowserIpc({
    ...options,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: event => { if (event.sender !== sender) throw new Error('Untrusted desktop request.'); },
  });
  vm.runInNewContext(fs.readFileSync(preloadPath, 'utf8'), {
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'socialOmni'); bridge = api; } },
        ipcRenderer: {
          invoke: (channel, ...args) => handlers.get(channel)({ sender }, ...args),
          on: (channel, listener) => listeners.set(channel, listener),
          removeListener: (channel, listener) => { if (listeners.get(channel) === listener) listeners.delete(channel); },
        },
      };
    },
    console: { info: text => consoleMessages.push(text), error: text => consoleMessages.push(text) },
  });
  return { bridge, handlers, consoleMessages, emit: event => listeners.get('socialomni:browser-event')?.({}, event) };
}

test('actual preload invokes WhatsApp connect and Facebook search handlers, launches workers, and delivers failures without hanging', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-ipc-'));
  const workspace = randomUUID(), secret = 'test-only-secret', profiles = [];
  const events = [];
  let ipc;
  const service = createService({
    express, dbPath: path.join(directory, 'workspace.sqlite'), secret,
    automation: {
      profileDir: path.join(directory, 'profiles'),
      onEvent: event => ipc.emit(event),
      chromium: { launchPersistentContext: async (profile, options) => {
        profiles.push(profile);
        assert.equal(options.headless, false);
        assert.equal(options.timeout, 30000);
        throw new Error(profiles.length === 1 ? "Executable doesn't exist. Please run playwright install" : 'Profile already in use');
      } },
    },
  });
  const app = express(); app.use(express.json()); app.use('/api/socialomni', service.router);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  ipc = harness({ getConnection: () => ({ port: server.address().port, secret, workspace }) });
  const unsubscribe = ipc.bridge.onBrowserEvent(event => events.push(event));
  try {
    await ipc.bridge.apiRequest('POST', '/initialize');
    const account = async platform => {
      const state = await ipc.bridge.apiRequest('POST', '/accounts', { platform, displayLabel: `IPC ${platform}`, handle: 'test', status: 'Active label' });
      return state.store.accounts.find(a => a.platform === platform);
    };
    const whatsapp = await account('WhatsApp'), facebook = await account('Facebook');
    for (const body of [
      { action: 'connect', accountId: whatsapp.id },
      { action: 'connect', accountId: whatsapp.id },
      { action: 'search', accountId: facebook.id, keywords: 'photography' },
    ]) {
      const state = await ipc.bridge.startBrowserJob(body);
      assert.equal(state.jobs[0].action, body.action);
      // The invocation returns a queued state, not the five-minute sign-in promise.
      let saved;
      for (let n = 0; n < 100; n++) {
        saved = await ipc.bridge.apiRequest('GET', '/state');
        if (saved.jobs[0].status === 'Failed') break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(saved.jobs[0].status, 'Failed');
      assert.ok(saved.store.activity.some(a => a.message.startsWith('Browser task stopped:')));
    }
    assert.equal(profiles.length, 3);
    assert.equal(profiles[0], profiles[1], 'retries reuse the same saved session directory');
    assert.notEqual(profiles[0], profiles[2], 'sessions remain separate per account');
    assert.ok(events.some(e => e.platform === 'WhatsApp' && e.status === 'Running'));
    assert.ok(events.some(e => e.platform === 'Facebook' && e.status === 'Failed'));
    assert.ok(events.some(e => e.message.includes('npx playwright install chromium')));
    assert.ok(events.some(e => e.message.includes('Do not delete the saved profile')));
    assert.ok(ipc.consoleMessages.some(line => line.includes('Facebook')));
    await assert.rejects(ipc.handlers.get('socialomni:start-browser-job')({ sender: {} }, {}), /Untrusted/);
    await assert.rejects(ipc.bridge.apiRequest('POST', '/../bad', {}), /Invalid local API request/);
    const count = events.length;
    unsubscribe(); ipc.emit({ platform: 'WhatsApp', message: 'removed listener' });
    assert.equal(events.length, count);
  } finally {
    await new Promise(resolve => server.close(resolve));
    service.close(); fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('backend timeout becomes actionable renderer feedback', async () => {
  const ipc = harness({
    getConnection: () => ({ port: 1, secret: 'test', workspace: randomUUID() }),
    fetchImpl: async (_url, options) => {
      assert.ok(options.signal);
      throw Object.assign(new Error('deadline exceeded'), { name: 'TimeoutError' });
    },
  });
  await assert.rejects(ipc.bridge.startBrowserJob({ action: 'connect' }), /did not respond.*before retrying/);
});
