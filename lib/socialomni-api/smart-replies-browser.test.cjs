const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('../../artifacts/api-server/node_modules/playwright');
const engine = require('./wa-suite-browser.cjs');

test('optional AI reaches confirmed Send, yields to keyword rules, and suppresses failures or disabling', { timeout: 20000 }, async t => {
  const browser = await chromium.launch({ headless: true, executablePath: '/repl/tools/bin/chromium', args: ['--no-sandbox'] });
  try {
    for (const scenario of ['ai', 'keyword', 'failure', 'disabled']) await t.test(scenario, async () => {
      const page = await browser.newPage();
      const thread = { id: 'client', name: 'Client', phone: '+15550000002', optedIn: true, messages: [] };
      const state = { waSuite: { threads: [thread], ai: { enabled: true, revision: 'test' }, rules: scenario === 'keyword' ? [
        { id: 'rule', name: 'Core rule', enabled: true, match: 'exact', keyword: 'help', template: 'Rule reply', delayMin: 3, delayMax: 3, cooldownMinutes: 1 },
      ] : [] }, store: { contacts: [], lists: [] }, analytics: {} };
      await page.setContent(`<div id="pane-side"><div role="row"><span title="Client">Client</span><span aria-label="1 unread message">1</span></div></div>
        <div id="main"><header><span title="Client">Client</span></header><div class="message-in" data-id="false_15550000002@c.us_in"><span class="selectable-text">help</span></div></div>
        <footer><div role="textbox" contenteditable="true" style="min-height:24px"></div><button onclick="const b=document.createElement('div');b.className='message-out';b.setAttribute('data-id','true_15550000002@c.us_out');b.innerHTML='<span class=selectable-text>'+document.querySelector('[contenteditable]').textContent+'</span><span data-icon=msg-check>✓</span>';document.querySelector('#main').append(b);document.querySelector('[contenteditable]').textContent=''"><span data-icon="send">Send</span></button></footer>`);
      await page.locator('[role="row"]').evaluate(el => el.onclick = () => el.querySelector('[aria-label]')?.remove());
      let running = true, calls = 0;
      const job = { accountId: 'account', replyToExistingUnread: true, currentStep: 0, completedCount: 0 };
      const watching = engine.inbox({ page, job, getState: () => state, update: fn => fn(job, state),
        guard: () => { if (!running) throw new Error('Stopped'); }, restriction: async () => {}, act: async (_phase, fn) => fn(),
        generateReply: async () => {
          calls++;
          if (scenario === 'failure') throw new Error('Provider unavailable');
          if (scenario === 'disabled') state.waSuite.ai.enabled = false;
          return 'AI reply';
        },
      }).catch(e => { if (running) throw e; });
      try {
        const deadline = Date.now() + 5000;
        while (!(scenario === 'keyword' || scenario === 'ai' ? job.completedCount : calls && job.phase === 'Watching unread inbox' || calls && job.phase === 'Watching open conversation')) {
          if (Date.now() > deadline) throw new Error(`Timed out: ${scenario} / ${job.phase}`);
          await new Promise(r => setTimeout(r, 30));
        }
        assert.equal(calls, scenario === 'keyword' ? 0 : 1);
        assert.equal(await page.locator('.message-out').count(), ['ai', 'keyword'].includes(scenario) ? 1 : 0);
        if (scenario === 'ai') assert.equal(thread.messages.at(-1).text, 'AI reply');
      } finally { running = false; await watching; await page.close(); }
    });
  } finally { await browser.close(); }
});
