const { AutomationError } = require('./automation-errors.cjs');

// Only the chat footer: never a search box, attachment caption or another dialog.
const composerSelector = 'footer [contenteditable="true"]:not([role="dialog"] [contenteditable])';
const sendIcons = '[data-icon="send"], [data-icon="send-light"], [data-icon="wds-ic-send"], [data-icon="wds-ic-send-filled"], [data-testid="send"]';
const sendNames = /^(?:send(?: message)?|إرسال|ارسال|envoyer)(?:\s|$)/i;
const normalized = text => text.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/\u200b/g, '').trim();
const composer = page => page.locator(composerSelector).filter({ visible: true }).first();

async function typeText(input, text) {
  if (normalized(await input.innerText())) {
    throw new AutomationError('A human draft is present. Nothing overwritten or sent.');
  }
  await input.fill(text);
  // fill already emits input; notify delegated controlled-editor listeners too.
  await notifyInput(input);
}

async function notifyInput(input) {
  await input.evaluate(el => {
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function sendText(page, { input = composer(page), text, guard = () => {},
  restriction = async () => {}, beforeSubmit = async () => {} } = {}) {
  const check = async () => {
    guard(); await restriction();
    if (!await input.isVisible() || !await input.evaluate(el =>
      Boolean(el.closest('footer')) && !el.closest('[role="dialog"], #pane-side'))) {
      throw new AutomationError('WhatsApp chat composer changed or closed. Nothing sent.');
    }
    if (!normalized(text || '') || normalized(await input.innerText()) !== normalized(text)) {
      throw new AutomationError('WhatsApp draft changed before Send. Nothing sent; existing text was preserved.');
    }
  };
  const footer = input.locator('xpath=ancestor::footer[1]');
  const candidates = [
    footer.getByRole('button', { name: sendNames }),
    footer.locator('[aria-label="Send" i], [aria-label="Send message" i], [aria-label="إرسال"], [aria-label="ارسال"], [aria-label="Envoyer" i]'),
    footer.locator('button, [role="button"]').filter({ has: page.locator(sendIcons) }),
    footer.locator(sendIcons),
  ];
  const { control, disabled } = await readyControl(page, candidates, check);
  if (!control && disabled) throw new AutomationError('WhatsApp Send is still disabled after readiness retries. Nothing sent.');
  await input.focus();
  await check();
  await beforeSubmit();
  await check();
  if (!await input.evaluate(el => document.activeElement === el)) {
    throw new AutomationError('WhatsApp composer lost keyboard focus. Nothing sent.');
  }
  try {
    if (control) await control.click({ timeout: 2000 });
    // Native browser input generates trusted keydown/keypress/keyup KeyboardEvents
    // (key: "Enter"). Synthetic dispatchEvent alone cannot do that reliably.
    else await input.press('Enter', { timeout: 2000 });
  } catch {
    throw new AutomationError('WhatsApp submission outcome is Unconfirmed. No automatic resend; review the conversation.');
  }
  // The caller must still wait for a NEW outgoing bubble and server check.
}

async function readyControl(page, candidates, check) {
  let control, disabled = false;
  // Safe retries: no Enter/click is dispatched during these readiness probes.
  for (let attempt = 0; attempt < 4 && !control; attempt++) {
    await check();
    await page.waitForTimeout(attempt === 0 ? 180 : 220);
    disabled = false;
    for (const candidate of candidates) {
      for (const item of await candidate.all()) {
        if (!await item.isVisible().catch(() => false)) continue;
        if (!await item.isEnabled().catch(() => false) ||
            await item.evaluate(el => Boolean(el.closest('[disabled], [aria-disabled="true"]'))).catch(() => true)) {
          disabled = true; continue;
        }
        try {
          // Playwright checks visibility, stability and overlays, without sending.
          await item.click({ trial: true, timeout: 300 });
          control = item; break;
        } catch { /* React may replace/enable the control on the next render. */ }
      }
      if (control) break;
    }
  }
  return { control, disabled };
}

module.exports = { composerSelector, composer, typeText, notifyInput, readyControl, sendText };
