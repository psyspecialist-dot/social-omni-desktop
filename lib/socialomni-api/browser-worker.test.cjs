const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createBrowserWorker = require('./browser-worker.cjs');

test('shutdown awaits the persistent browser context flush', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-flush-'));
  let state = { jobs: [{ id: 'flush', mode: 'live', platform: 'WhatsApp', action: 'connect',
    accountId: 'account', status: 'Pending', createdAt: new Date().toISOString(), delayMin: 5, delayMax: 5 }], store: { activity: [] } };
  let finishFlush, closingContext;
  const context = {
    pages: () => [{ setDefaultTimeout() {} }],
    close: () => closingContext ||= new Promise(resolve => { finishFlush = resolve; }),
  };
  const worker = createBrowserWorker({
    get: () => structuredClone(state), save: (_id, next) => { state = structuredClone(next); },
    recordActivity() {}, kick() {},
    automation: { profileDir: dir, chromium: { launchPersistentContext: async () => context } },
  });
  try {
    worker.kick('workspace');
    await new Promise(resolve => setImmediate(resolve));
    let complete = false;
    const closing = worker.close().then(() => { complete = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(complete, false, 'closing must wait for saved cookies/session flush');
    finishFlush();
    t.mock.timers.tick(250);
    await closing;
    assert.equal(complete, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('group destinations are restricted to explicit HTTPS Facebook group URLs', () => {
  assert.equal(createBrowserWorker.groupUrl('https://www.facebook.com/groups/123'), 'https://www.facebook.com/groups/123/');
  for (const url of ['http://www.facebook.com/groups/123', 'https://evil.example/groups/123', 'https://www.facebook.com/groups/123/members', 'file:///etc/passwd']) {
    assert.throws(() => createBrowserWorker.groupUrl(url));
  }
});

test('live WhatsApp worker paces every action and counts only server-confirmed sends', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-browser-'));
  let state = {
    jobs: [{ id: 'job', mode: 'live', platform: 'WhatsApp', action: 'send', kind: 'whatsapp', accountId: 'account',
      status: 'Pending', createdAt: new Date().toISOString(), delayMin: 5, delayMax: 12, messageContent: 'Approved test',
      totalCount: 1, completedCount: 0, targets: [{ id: 'target', name: '+15550000001', sendStatus: 'Pending' }] }],
    store: { accounts: [{ id: 'account' }], campaigns: [], activity: [] }, analytics: { messagesSent: 7 },
  };
  const actions = [];
  let count = 0;
  const element = { isVisible: async () => false, first() { return this; }, waitFor: async () => {}, locator() { return this; } };
  const outgoing = { filter() { return this; }, count: async () => count, nth() { return element; } };
  const page = {
    setDefaultTimeout() {}, isClosed: () => false, url: () => 'https://web.whatsapp.com/',
    goto: async url => actions.push(['navigate', url, Date.now()]),
    getByText: () => element,
    locator(selector) {
      if (selector === '#pane-side') return { ...element, isVisible: async () => true };
      if (selector === '.message-out') return outgoing;
      if (selector.startsWith('footer')) return { ...element, fill: async text => actions.push(['type', text, Date.now()]) };
      return { ...element, click: async () => { actions.push(['send', '', Date.now()]); count++; } };
    },
  };
  let closed = false;
  const context = { pages: () => [page], close: async () => { closed = true; } };
  const worker = createBrowserWorker({
    get: () => structuredClone(state), save: (_id, next) => { state = structuredClone(next); },
    recordActivity: (s, message) => s.store.activity.push({ message }), kick() {},
    automation: { profileDir: dir, chromium: { launchPersistentContext: async () => context } },
  });
  try {
    worker.kick('workspace');
    for (let i = 0; i < 80 && state.jobs[0].status !== 'Completed'; i++) {
      t.mock.timers.tick(250);
      await new Promise(resolve => setImmediate(resolve));
    }
    // Each tick advances simulated time; allow the full 12-second maximum per action.
    for (let i = 0; i < 200 && state.jobs[0].status !== 'Completed'; i++) {
      t.mock.timers.tick(250); await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(state.jobs[0].status, 'Completed');
    assert.equal(state.jobs[0].targets[0].sendStatus, 'Sent');
    assert.equal(state.analytics.realMessagesSent, 1);
    assert.equal(state.analytics.messagesSent, 7, 'live execution must not increment simulation counters');
    assert.deepEqual(actions.map(a => a[0]), ['navigate', 'navigate', 'type', 'send']);
    for (let i = 1; i < actions.length; i++) assert.ok(actions[i][2] - actions[i - 1][2] >= 5000);
    assert.equal(state.store.activity.filter(a => a.message.startsWith('Waiting ')).length, 4);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(closed);
  } finally { worker.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('cancel during a paced wait prevents further browser actions', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-cancel-'));
  let state = { jobs: [{ id: 'job', mode: 'live', platform: 'WhatsApp', action: 'connect', accountId: 'account', status: 'Pending',
    createdAt: new Date().toISOString(), delayMin: 5, delayMax: 5 }], store: { activity: [] } };
  let navigations = 0;
  const page = { setDefaultTimeout() {}, isClosed: () => false, goto: async () => navigations++ };
  const context = { pages: () => [page], close: async () => {} };
  const browserEvents = [];
  const worker = createBrowserWorker({
    get: () => structuredClone(state), save: (_id, next) => { state = structuredClone(next); },
    recordActivity: () => {}, kick() {},
    automation: { profileDir: dir, chromium: { launchPersistentContext: async () => context }, onEvent: event => browserEvents.push(event) },
  });
  try {
    worker.kick('workspace');
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(browserEvents.some(event => event.phase === 'Browser opened'));
    state.jobs[0].status = 'Cancelled'; worker.cancel('job');
    t.mock.timers.tick(6000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(navigations, 0); assert.equal(state.jobs[0].status, 'Cancelled');
  } finally { worker.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Facebook joins needing manual review never become fake published posts', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-facebook-'));
  let state = {
    jobs: [{ id: 'fbjob', mode: 'live', platform: 'Facebook', action: 'publish', accountId: 'account',
      campaignId: 'campaign', status: 'Pending', createdAt: new Date().toISOString(), delayMin: 5, delayMax: 5,
      messageContent: 'Approved post', totalCount: 1, completedCount: 0,
      targets: [{ id: 'target', name: 'https://www.facebook.com/groups/123/', joinStatus: 'Pending', postStatus: 'Pending' }] }],
    store: { campaigns: [{ id: 'campaign', status: 'Draft' }], accounts: [{ id: 'account' }], activity: [] }, analytics: {},
  };
  let url = 'about:blank', joins = 0;
  const invisible = { first() { return this; }, isVisible: async () => false, count: async () => 0 };
  const page = {
    setDefaultTimeout() {}, isClosed: () => false, url: () => url,
    goto: async next => { url = next; }, getByText: () => invisible,
    getByRole(_role, { name }) {
      if (name.source.includes('your profile')) return { ...invisible, isVisible: async () => true };
      if (name.source.includes('Join group')) return { ...invisible, isVisible: async () => true, click: async () => joins++ };
      return invisible;
    },
  };
  const worker = createBrowserWorker({
    get: () => structuredClone(state), save: (_id, next) => { state = structuredClone(next); },
    recordActivity: (s, message) => s.store.activity.push({ message }), kick() {},
    automation: { profileDir: dir, chromium: { launchPersistentContext: async () => ({ pages: () => [page], close: async () => {} }) } },
  });
  try {
    worker.kick('workspace');
    for (let i = 0; i < 100 && state.jobs[0].status !== 'Completed'; i++) {
      t.mock.timers.tick(250); await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(joins, 1);
    assert.equal(state.jobs[0].status, 'Completed');
    assert.equal(state.jobs[0].targets[0].joinStatus, 'Needs review');
    assert.equal(state.jobs[0].targets[0].postStatus, 'Not posted');
    assert.equal(state.store.campaigns[0].status, 'Ready for review');
  } finally { worker.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
