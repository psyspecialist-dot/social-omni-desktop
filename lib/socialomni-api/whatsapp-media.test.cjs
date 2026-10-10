const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('../../artifacts/api-server/node_modules/playwright');
const createWorker = require('./browser-worker.cjs');

const fixture = `<!doctype html><style>[contenteditable]{min-height:24px;min-width:100px}</style><div id="pane-side">Chats</div><div id="main"></div>
<footer><div role="textbox" contenteditable="true"></div><button id="attach"><span data-icon="plus">+</span></button></footer>
<script>
window.submitted=[];
document.querySelector('#attach').onclick=()=>{
 const dialog=document.createElement('div');dialog.setAttribute('role','dialog');
 dialog.innerHTML='<input type="file" accept="image/*,video/*,application/pdf"><div role="textbox" contenteditable="true"></div><button><span data-icon="send">Send</span></button>';
 dialog.querySelector('button').onclick=()=>{
  const file=dialog.querySelector('input').files[0],caption=dialog.querySelector('[contenteditable]').textContent;
  window.submitted.push({name:file.name,type:file.type,size:file.size,caption});
  const bubble=document.createElement('div');bubble.className='message-out';
  bubble.innerHTML='<span class="selectable-text copyable-text"></span><span data-icon="msg-check">✓</span>';
  bubble.querySelector('.selectable-text').textContent=caption;
  document.querySelector('#main').append(bubble);dialog.remove();
 };
 document.body.append(dialog);
};
</script>`;

test('live worker uploads image, PDF and video payloads, captions and confirms accepted bubbles', { timeout: 30000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-media-'));
  const contexts = [];
  let state;
  const assets = {
    png: { name: 'image.png', mime: 'image/png', content: Buffer.from([137,80,78,71,13,10,26,10]) },
    pdf: { name: 'offer.pdf', mime: 'application/pdf', content: Buffer.from('%PDF-1.4\nfixture') },
    video: { name: 'demo.mp4', mime: 'video/mp4', content: Buffer.from('0000ftypisom') },
  };
  const worker = createWorker({
    get: () => structuredClone(state), save: (_id, next) => { state = structuredClone(next); },
    recordActivity() {}, kick() {}, readMedia: (_workspace, id) => assets[id],
    automation: { profileDir: directory, chromium: {
      async launchPersistentContext(profile) {
        const context = await chromium.launchPersistentContext(profile, { headless: true,
          executablePath: process.env.CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium', args: ['--no-sandbox'] });
        await context.route('https://web.whatsapp.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
        contexts.push(context); return context;
      },
    } },
  });
  try {
    for (const [id, asset] of Object.entries(assets)) {
      state = { jobs: [{ id, accountId: id, mode: 'live', platform: 'WhatsApp', action: 'send', kind: 'whatsapp',
        createdAt: new Date().toISOString(), status: 'Pending', delayMin: 0, delayMax: 0,
        mediaId: id, messageContent: id === 'video' ? '' : 'Approved caption', totalCount: 1, completedCount: 0,
        targets: [{ id: 'recipient', name: '+15550000001', sendStatus: 'Pending' }] }],
        store: { accounts: [{ id }], campaigns: [], activity: [] }, analytics: {} };
      worker.kick('workspace');
      const deadline = Date.now() + 8000;
      while (['Pending', 'Running'].includes(state.jobs[0].status) && Date.now() < deadline) await new Promise(r => setTimeout(r, 30));
      assert.equal(state.jobs[0].status, 'Completed', JSON.stringify({phase:state.jobs[0].phase,error:state.jobs[0].error}));
      assert.equal(state.jobs[0].targets[0].sendStatus, 'Sent');
      assert.equal(state.analytics.realMessagesSent, 1);
      const page = contexts.at(-1).pages()[0];
      assert.deepEqual(await page.evaluate(() => window.submitted), [
        { name: asset.name, type: asset.mime, size: asset.content.length, caption: id === 'video' ? '' : 'Approved caption' },
      ]);
    }
  } finally { await worker.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
