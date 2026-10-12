const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('../../artifacts/api-server/node_modules/playwright');
const createWorker = require('./browser-worker.cjs');

function mediaFixture({ icon = 'send', root = 'dialog', label = '', hiddenDuplicate = false, keyboard = false, focusedWindow = false, plainControl = false } = {}) {
const controls = '<input type="file" accept="image/*,video/*,application/pdf"><div role="textbox" contenteditable="true"></div>' +
 (hiddenDuplicate ? '<button style="display:none"><span data-icon="send"></span></button>' : '') +
 `<div ${plainControl ? '' : 'role="button"'} data-preview-send ${label ? `aria-label="${label}"` : ''}>${icon ? `<span data-icon="${icon}">Send</span>` : label}</div>`;
return `<!doctype html><meta charset="utf-8"><style>[contenteditable],[role="button"]{min-height:24px;min-width:100px}</style><div id="pane-side">Chats</div><div id="main"></div>
<footer><div role="textbox" contenteditable="true"></div><button id="attach"><span data-icon="plus">+</span></button><button id="composer-send"><span data-icon="wds-ic-send-filled">Send text</span></button></footer>
<script>
window.submitted=[];window.composerSends=0;window.keyboardSends=0;
document.querySelector('#composer-send').onclick=()=>window.composerSends++;
document.querySelector('#attach').onclick=()=>{
 const dialog=document.createElement('div');
 ${root === 'dialog' ? "dialog.setAttribute('role','dialog');" : root === 'editor' ? "dialog.setAttribute('data-testid','media-editor');" : ''}
 ${focusedWindow ? "dialog.setAttribute('tabindex','0');" : ''}
 dialog.innerHTML=${JSON.stringify(controls)};
 function submit(){
  const file=dialog.querySelector('input').files[0],caption=dialog.querySelector('[contenteditable]')?.textContent || '';
  window.submitted.push({name:file.name,type:file.type,size:file.size,caption});
  const bubble=document.createElement('div');bubble.className='message-out';
  bubble.innerHTML='<span class="selectable-text copyable-text"></span><span data-icon="msg-check">✓</span>';
  bubble.querySelector('.selectable-text').textContent=caption;
  document.querySelector('#main').append(bubble);dialog.remove();
 }
 dialog.querySelector('[data-preview-send]').onclick=submit;
 ${keyboard ? `dialog.addEventListener('keydown', event => {
   if(event.key==='Enter' && (document.activeElement===dialog || document.activeElement===dialog.querySelector('[contenteditable]'))) {
     event.preventDefault();window.keyboardSends++;submit();
   }
 });` : ''}
 document.body.append(dialog);
 ${focusedWindow ? "dialog.querySelector('[contenteditable]').remove();dialog.focus();" : ''}
};
</script>`;
}

test('live worker sends media from multilingual and keyboard previews without clicking the composer', { timeout: 90000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'najhin-media-'));
  const contexts = [];
  let state;
  const assets = {
    png: { name: 'image.png', mime: 'image/png', content: Buffer.from([137,80,78,71,13,10,26,10]) },
    pdf: { name: 'offer.pdf', mime: 'application/pdf', content: Buffer.from('%PDF-1.4\nfixture') },
    video: { name: 'demo.mp4', mime: 'video/mp4', content: Buffer.from('0000ftypisom') },
  };
  const cases = [
    { id: 'png', preview: {} },
    { id: 'pdf', preview: {} },
    { id: 'video', preview: {} },
    { id: 'modern-image', assetId: 'png', preview: { icon: 'wds-ic-send-filled', hiddenDuplicate: true } },
    { id: 'unscoped-image', assetId: 'png', preview: { icon: 'wds-ic-send', root: 'none' } },
    { id: 'accessible-image', assetId: 'png', preview: { icon: '', root: 'editor', label: 'Send' } },
    { id: 'arabic-image', assetId: 'png', preview: { icon: '', label: 'إرسال', hiddenDuplicate: true } },
    { id: 'light-image', assetId: 'png', preview: { icon: 'send-light' } },
    { id: 'french-image', assetId: 'png', preview: { icon: '', label: 'Envoyer' } },
    { id: 'partial-label-image', assetId: 'png', preview: { icon: '', label: 'Click to Send', root: 'none' } },
    { id: 'black-plain-send-image', assetId: 'png', preview: { icon: 'send', root: 'none', plainControl: true } },
    { id: 'plain-arabic-send-image', assetId: 'png', preview: { icon: '', label: 'إرسال الصورة', root: 'none', plainControl: true } },
    { id: 'keyboard-image', assetId: 'png', preview: { icon: '', keyboard: true } },
    { id: 'keyboard-empty-image', assetId: 'png', emptyCaption: true, preview: { icon: '', keyboard: true } },
    { id: 'keyboard-window-image', assetId: 'png', emptyCaption: true, preview: { icon: '', keyboard: true, focusedWindow: true } },
    { id: 'unsafe-keyboard-image', assetId: 'png', expectFailure: true, preview: { icon: '', root: 'none', keyboard: true } },
  ];
  let fixture;
  const worker = createWorker({
    get: () => structuredClone(state), save: (_id, next) => { state = structuredClone(next); },
    recordActivity() {}, kick() {}, readMedia: (_workspace, id) => assets[id],
    automation: { profileDir: directory, chromium: {
      async launchPersistentContext(profile, options) {
        assert.equal(options.timeout,60000);
        const context = await chromium.launchPersistentContext(profile, { headless: true,
          executablePath: process.env.CHROMIUM_EXECUTABLE || '/repl/tools/bin/chromium', args: ['--no-sandbox'] });
        await context.route('https://web.whatsapp.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture }));
        contexts.push(context); return context;
      },
    } },
  });
  try {
    for (const { id, assetId = id, preview, emptyCaption = id === 'video', expectFailure = false } of cases) {
      const asset = assets[assetId];
      fixture = mediaFixture(preview);
      state = { jobs: [{ id, accountId: id, mode: 'live', platform: 'WhatsApp', action: 'send', kind: 'whatsapp',
        createdAt: new Date().toISOString(), status: 'Pending', delayMin: 0, delayMax: 0,
        mediaId: assetId, messageContent: emptyCaption ? '' : 'Approved caption', totalCount: 1, completedCount: 0,
        targets: [{ id: 'recipient', name: '+15550000001', sendStatus: 'Pending' }] }],
        store: { accounts: [{ id }], campaigns: [], activity: [] }, analytics: {} };
      worker.kick('workspace');
      const deadline = Date.now() + 12000;
      while (['Pending', 'Running'].includes(state.jobs[0].status) && Date.now() < deadline) await new Promise(r => setTimeout(r, 30));
      if (expectFailure) {
        assert.equal(state.jobs[0].status, 'Failed', JSON.stringify({id,phase:state.jobs[0].phase,error:state.jobs[0].error}));
        const page = contexts.at(-1).pages()[0];
        assert.deepEqual(await page.evaluate(() => window.submitted), []);
        assert.equal(await page.evaluate(() => window.keyboardSends + window.composerSends), 0);
        await contexts.at(-1).close();
        continue;
      }
      assert.equal(state.jobs[0].status, 'Completed', JSON.stringify({id,phase:state.jobs[0].phase,error:state.jobs[0].error}));
      assert.equal(state.jobs[0].targets[0].sendStatus, 'Sent');
      assert.equal(state.analytics.realMessagesSent, 1);
      const page = contexts.at(-1).pages()[0];
      assert.deepEqual(await page.evaluate(() => window.submitted), [
        { name: asset.name, type: asset.mime, size: asset.content.length, caption: emptyCaption ? '' : 'Approved caption' },
      ]);
      assert.equal(await page.evaluate(() => window.composerSends), 0);
      assert.equal(await page.evaluate(() => window.keyboardSends), preview.keyboard ? 1 : 0);
      await contexts.at(-1).close();
    }
  } finally { await worker.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
