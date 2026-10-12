const { readable, AutomationError } = require('./automation-errors.cjs');

// FilePayload avoids leaving private attachments in temporary files on disk.
async function attach(page, media, caption, { guard = () => {}, restriction = async () => {}, act = async (_phase, fn) => fn() } = {}) {
  if (!media?.content?.length || !media.name || !media.mime) throw new AutomationError('Attachment no longer exists. Nothing sent.');
  const document = media.mime === 'application/pdf';
  const attachButton = await readable(page, [
    page.locator('footer button:has([data-icon="plus"]), footer [role="button"]:has([data-icon="plus"]), footer [role="button"]:has([data-icon="plus-rounded"]), footer [role="button"]:has([data-icon="clip"])'),
    page.getByRole('button', { name: /^(attach|attach file|إرفاق|إرفاق ملف)$/i }),
  ], 'WhatsApp attachment menu', 60000);
  await act('Opening WhatsApp attachment menu…', () => attachButton.click());
  // Some layouts mount the input only after selecting Document/Photos & videos.
  const findInput = async () => {
    const inputs = page.locator('input[type="file"]');
    for (let i = 0; i < await inputs.count(); i++) {
      const candidate = inputs.nth(i);
      const accepts = (await candidate.getAttribute('accept') || '').toLowerCase();
      const compatible = document
        ? !accepts || accepts === '*' || accepts.includes('application/pdf') || accepts.includes('.pdf')
        : accepts.includes(media.mime) || accepts.includes(media.mime.split('/')[0] + '/*') ||
          (media.mime.startsWith('image/') && accepts.includes('image')) ||
          (media.mime.startsWith('video/') && accepts.includes('video'));
      if (compatible) return candidate;
    }
    return null;
  };
  let input = await findInput();
  const option = page.getByText(document ? /^(document|مستند)$/i : /^(photos & videos|photos and videos|الصور ومقاطع الفيديو)$/i).first();
  // Set an already mounted hidden input directly; do not open an OS file dialog.
  if (!input && await option.isVisible().catch(() => false)) await option.click();
  const deadline = Date.now() + 60000;
  while (!input && Date.now() < deadline) {
    guard(); await restriction();
    input = await findInput();
    if (!input) await page.waitForTimeout(200);
  }
  if (!input) throw new AutomationError('Required platform control unavailable: WhatsApp attachment file input. Nothing sent.');
  await act('Uploading WhatsApp attachment…', () => input.setInputFiles({
    name: media.name.replace(/[\\/]/g, '_'), mimeType: media.mime, buffer: Buffer.from(media.content),
  }));
  const sendIcons = '[data-icon="send"], [data-icon="send-light"], [data-icon="wds-ic-send"], [data-icon="wds-ic-send-filled"]';
  const previewSelector = '[role="dialog"], [data-animate-modal-popup], [data-testid="media-editor"], [data-testid="media-preview"]';
  const preview = page.locator(previewSelector);
  const sendNames = /^(?:send(?:\b|$)|envoyer(?:\b|$)|إرسال|ارسال)/i;
  const sendLabels = '[aria-label*="send" i], [aria-label*="إرسال"], [aria-label*="ارسال"], [aria-label*="envoyer" i]';
  const labeledControls = `button:is(${sendLabels}), [role="button"]:is(${sendLabels})`;
  const outsideComposer = 'xpath=self::*[not(ancestor::footer) and not(ancestor::*[@id="pane-side"])]';
  const sendCandidates = [
    preview.getByRole('button', { name: sendNames }).filter({ visible: true }),
    preview.locator(labeledControls).filter({ visible: true }),
    preview.locator('button, [role="button"]').filter({ has: page.locator(sendIcons), visible: true }),
    // New black Send controls can be a plain div/span with delegated clicks,
    // rather than a button or an element exposing role=button.
    preview.locator(sendIcons).filter({ visible: true }),
    preview.locator(sendLabels).filter({ visible: true }),
    page.getByRole('button', { name: sendNames }).filter({ visible: true }).locator(outsideComposer),
    page.locator(labeledControls).filter({ visible: true }).locator(outsideComposer),
    // Some previews have no dialog role. Never select the ordinary chat composer.
    page.locator('button, [role="button"]')
      .filter({ has: page.locator(sendIcons), visible: true })
      .locator(outsideComposer),
    page.locator(sendIcons).filter({ visible: true }).locator(outsideComposer),
    page.locator(sendLabels).filter({ visible: true }).locator(outsideComposer),
  ];
  const captionCandidates = [
      preview.locator('[contenteditable="true"][role="textbox"], textarea').filter({ visible: true }),
      page.locator('[role="dialog"] [contenteditable="true"][role="textbox"]'),
      page.locator('[data-animate-modal-popup] [contenteditable="true"][role="textbox"]'),
      page.locator('[contenteditable="true"][role="textbox"][aria-label*="caption" i], [contenteditable="true"][role="textbox"][aria-label*="تعليق"]'),
      page.locator('[contenteditable="true"][role="textbox"]:not(footer [contenteditable]):not(#pane-side [contenteditable])').filter({ visible: true }),
  ];
  let editor;
  if (caption.trim()) {
    editor = await readable(page, captionCandidates, 'WhatsApp attachment caption', 60000);
    // Never silently put a caption into the ordinary text-message composer.
    if (await editor.evaluate(el => Boolean(el.closest('footer, #pane-side')))) {
      throw new AutomationError('WhatsApp attachment caption is unavailable. Nothing sent; inspect the attachment preview.');
    }
    await act('Typing WhatsApp attachment caption…', () => editor.fill(caption));
  }
  guard(); await restriction();
  // Probe without a five-second delay: a verified keyboard preview is an
  // immediate alternative, not a retry after an attempted Send.
  for (const candidate of sendCandidates) {
    const control=candidate.first();
    if(await control.isVisible().catch(()=>false))return control;
  }
  // Only a missing selector permits Enter; never retry a failed/ambiguous click.
  if (!editor) {
    for (const candidate of captionCandidates) {
      if (await candidate.first().isVisible().catch(() => false)) { editor = candidate.first(); break; }
    }
  }
  let keyboardTarget = editor && await editor.evaluate((el, selector) =>
    Boolean(el.closest(selector)) && !el.closest('footer, #pane-side'), previewSelector) ? editor : null;
  if (!keyboardTarget) {
    const focusedPreview = preview.filter({ visible: true });
    for (let i = 0; i < await focusedPreview.count(); i++) {
      const candidate = focusedPreview.nth(i);
      if (await candidate.evaluate(el => document.activeElement === el && !el.closest('footer, #pane-side'))) {
        keyboardTarget = candidate; break;
      }
    }
  }
  if (!keyboardTarget) throw new AutomationError('WhatsApp media preview Send button unavailable and no verified preview keyboard target. Nothing sent.');
  // Preserve the worker's Unconfirmed reservation and acknowledgement checks.
  return { async click() {
    guard(); await restriction();
    if (!await keyboardTarget.isVisible() || !await keyboardTarget.evaluate((el, selector) =>
      Boolean(el.closest(selector)) && !el.closest('footer, #pane-side'), previewSelector)) {
      throw new AutomationError('WhatsApp media preview closed or changed. Keyboard submission stopped.');
    }
    await keyboardTarget.focus();
    guard(); await restriction();
    if (!await keyboardTarget.isVisible() || !await keyboardTarget.evaluate(el => document.activeElement === el)) {
      throw new AutomationError('WhatsApp media preview could not be focused. Nothing sent.');
    }
    await page.keyboard.press('Enter');
  } };
}

module.exports = { attach };
