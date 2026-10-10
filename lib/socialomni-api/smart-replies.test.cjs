const { test } = require('node:test');
const assert = require('node:assert/strict');
const smart = require('./smart-replies.cjs');
const suite = require('./wa-suite.cjs');

test('AI calls only the fixed OpenAI endpoint, bounds context and sanitizes failures', async () => {
  const key = 'sk-fixture-key-not-a-real-credential';
  let request;
  const provider = smart({
    vault: { read: () => ({ key }) },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: ' Helpful reply ' } }] }) };
    },
  });
  assert.equal(await provider.generate('workspace', { messages: Array.from({ length: 15 }, (_, i) => ({ id: `${i}`, direction: 'incoming', text: 'hello' })) }, { id: 'last', text: 'Question' }, { instructions: 'Only known facts' }), 'Helpful reply');
  assert.equal(request.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(request.options.redirect, 'error');
  const body = JSON.parse(request.options.body);
  assert.equal(body.messages.length, 10);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.ok(!request.options.body.includes(key));
  const failing = smart({ vault: { read: () => ({ key }) }, fetchImpl: async () => ({ ok: false, status: 401, json: () => { throw new Error(key); } }) });
  await assert.rejects(failing.generate('workspace', { messages: [] }, { text: 'Hi' }, {}), e => !e.message.includes(key) && /HTTP 401/.test(e.message));
});

test('AI defaults off, persists public config without key, and removal disables it', () => {
  const routes = {}, saved = new Map();
  smart({ automation: {}, recordActivity() {}, vault: {
    available: () => true, read: (_, k) => saved.get(k), write: (_, k, v) => saved.set(k, v), remove: (_, k) => saved.delete(k),
  } }).install((method, path, fn) => { routes[path] = fn; });
  const state = { waSuite: suite.defaults() };
  assert.equal(state.waSuite.ai.enabled, false);
  const change = body => routes['/suite/ai'](state, { workspaceId: 'workspace', body });
  assert.throws(() => change({ enabled: true, instructions: '' }), /Save an OpenAI key/);
  const key = 'sk-fixture-key-not-a-real-credential';
  change({ enabled: true, instructions: 'Be concise', key });
  assert.equal(state.waSuite.ai.hasKey, true);
  assert.ok(!JSON.stringify(state).includes(key));
  change({ enabled: false, instructions: '' });
  assert.equal(state.waSuite.ai.hasKey, true);
  change({ enabled: false, instructions: '', removeKey: true });
  assert.equal(saved.size, 0);
  assert.equal(state.waSuite.ai.hasKey, false);
});

test('QR menu updates three exact rules, normalizes numeric choices, and preserves other rules', () => {
  const routes = {};
  suite.install({ route: (method, path, fn) => { routes[path] = fn; }, recordActivity() {} });
  const state = { waSuite: suite.defaults(), jobs: [] };
  state.waSuite.rules.push({ id: 'other', keyword: 'price', enabled: true, match: 'contains' });
  const request = { body: { keyword: 'menu', menu: 'Reply 1 for Sales, 2 for Support', sales: 'Sales reply', support: 'Support reply' } };
  routes['/suite/menu'](state, request);
  assert.equal(state.waSuite.rules.length, 4);
  assert.equal(state.waSuite.rules[3].id, 'other');
  assert.ok(!Number.isNaN(Date.parse(state.waSuite.rules[0].createdAt)));
  assert.equal(suite.matches(state.waSuite.rules[1], ' ١. '), true);
  assert.equal(suite.matches(state.waSuite.rules[2], '۲'), true);
  assert.equal(suite.matches(state.waSuite.rules[1], '123'), false);
  request.body.sales = 'Updated Sales';
  routes['/suite/menu'](state, request);
  assert.equal(state.waSuite.rules.length, 4);
  assert.equal(state.waSuite.rules[1].template, 'Updated Sales');
});
