const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('../../artifacts/api-server/node_modules/playwright');
const send = require('./whatsapp-send.cjs');

test('WhatsApp submission uses real browser events and never retries ambiguous sends', { timeout: 45000 }, async t => {
  const browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath(), args: ['--no-sandbox'] });
  async function fixture(button = '', { delayed = false, keyboard = false } = {}) {
    const page = await browser.newPage();
    await page.setContent(`<aside><button aria-label="Send" onclick="window.wrong++">Unrelated Send</button></aside>
      <footer><div contenteditable="true" data-lexical-editor="true" style="min-height:32px"></div>${button}</footer>
      <script>
      window.sends=0;window.wrong=0;window.keys=[];window.inputs=0;window.changes=0;
      const input=document.querySelector('footer [contenteditable]');
      window.submit=()=>{window.sends++;input.textContent='';};
      input.addEventListener('input',()=>{window.inputs++;});
      input.addEventListener('change',()=>{
        window.changes++;
        if(${delayed}) setTimeout(()=>{document.querySelector('footer button').disabled=false;},350);
      });
      input.addEventListener('keydown',e=>{
        window.keys.push({key:e.key,trusted:e.isTrusted});
        if(${keyboard} && e.key==='Enter' && window.inputs && window.changes){e.preventDefault();window.submit();}
      });
      </script>`);
    return page;
  }
  try {
    for (const [name, markup] of [
      ['legacy icon', '<button onclick="submit()"><span data-icon="send"></span></button>'],
      ['new SVG icon and plain clickable container', '<div onclick="submit()"><svg data-icon="wds-ic-send-filled" width="24" height="24"><path d="M0 0h24v24H0z"/></svg></div>'],
      ['accessible Arabic Send without icon', '<div role="button" aria-label="إرسال" onclick="submit()">إرسال</div>'],
      ['accessible English Send without icon', '<button aria-label="Send message" onclick="submit()">Send</button>'],
    ]) await t.test(name, async () => {
      const page = await fixture(markup);
      try {
        const input = send.composer(page);
        await send.typeText(input, 'Hello\nمرحبا');
        let reservations = 0;
        await send.sendText(page, { input, text: 'Hello\nمرحبا', beforeSubmit: () => { reservations++; } });
        assert.equal(reservations, 1);
        assert.deepEqual(await page.evaluate(() => [sends, wrong]), [1, 0]);
      } finally { await page.close(); }
    });
    await t.test('delayed React-enabled control becomes actionable without manual click', async () => {
      const page = await fixture('<button disabled aria-label="Send" onclick="submit()">Send</button>', { delayed: true });
      try {
        await send.typeText(send.composer(page), 'Delayed');
        await send.sendText(page, { text: 'Delayed' });
        assert.equal(await page.evaluate(() => sends), 1);
      } finally { await page.close(); }
    });
    await t.test('unknown Send layout uses trusted Enter, input and change events', async () => {
      const page = await fixture('', { keyboard: true });
      try {
        await send.typeText(send.composer(page), 'Keyboard submission');
        await send.sendText(page, { text: 'Keyboard submission' });
        const result = await page.evaluate(() => ({ sends, wrong, keys, inputs, changes }));
        assert.equal(result.sends, 1); assert.equal(result.wrong, 0);
        assert.ok(result.inputs && result.changes);
        assert.deepEqual(result.keys, [{ key: 'Enter', trusted: true }]);
      } finally { await page.close(); }
    });
    await t.test('a disabled Send button is not bypassed with Enter', async () => {
      const page = await fixture('<button disabled aria-label="Send">Send</button>', { keyboard: true });
      try {
        await send.typeText(send.composer(page), 'Not ready');
        await assert.rejects(send.sendText(page, { text: 'Not ready' }), /still disabled/);
        assert.deepEqual(await page.evaluate(() => [sends, keys.length]), [0, 0]);
      } finally { await page.close(); }
    });
    await t.test('human drafts and changes during readiness checks are preserved', async () => {
      const page = await fixture('', { keyboard: true });
      try {
        await send.composer(page).fill('Human draft');
        await assert.rejects(send.typeText(send.composer(page), 'Replace me'), /human draft/);
        assert.equal(await send.composer(page).innerText(), 'Human draft');
        await assert.rejects(send.sendText(page, { text: 'Different message' }), /draft changed/);
        await assert.rejects(send.sendText(page, { text: 'Human draft',
          beforeSubmit: () => send.composer(page).fill('Edited while waiting') }), /draft changed/);
        assert.equal(await send.composer(page).innerText(), 'Edited while waiting');
        assert.equal(await page.evaluate(() => sends), 0);
      } finally { await page.close(); }
    });
    await t.test('consent/cancellation failures stop before submission', async () => {
      const page = await fixture('<button aria-label="Send" onclick="submit()">Send</button>');
      try {
        await send.typeText(send.composer(page), 'Consent required');
        await assert.rejects(send.sendText(page, { text: 'Consent required', beforeSubmit: () => { throw Error('Consent revoked'); } }), /Consent revoked/);
        assert.equal(await page.evaluate(() => sends), 0);
      } finally { await page.close(); }
    });
    await t.test('a click that submitted and then reported an error never falls back or retries', async () => {
      const page = await fixture('<button aria-label="Send" onclick="submit()">Send</button>', { keyboard: true });
      try {
        const input = send.composer(page), locate = input.locator.bind(input);
        input.locator = selector => {
          const footer = locate(selector), byRole = footer.getByRole.bind(footer);
          footer.getByRole = (...args) => {
            const list = byRole(...args), all = list.all.bind(list);
            list.all = async () => (await all()).map(item => {
              const click = item.click.bind(item);
              item.click = async options => {
                await click(options);
                if (!options?.trial) throw Error('Transport failed after dispatch');
              };
              return item;
            });
            return list;
          };
          return footer;
        };
        await send.typeText(input, 'Exactly once');
        await assert.rejects(send.sendText(page, { input, text: 'Exactly once' }), /Unconfirmed.*No automatic resend/);
        assert.deepEqual(await page.evaluate(() => [sends, keys.length]), [1, 0]);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
});
