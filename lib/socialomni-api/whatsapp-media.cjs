const { readable, AutomationError } = require('./automation-errors.cjs');

// FilePayload avoids leaving private attachments in temporary files on disk.
async function attach(page, media, caption, { guard = () => {}, restriction = async () => {}, act = async (_phase, fn) => fn() } = {}) {
  if (!media?.content?.length || !media.name || !media.mime) throw new AutomationError('Attachment no longer exists. Nothing sent.');
  const document = media.mime === 'application/pdf';
  const attachButton = await readable(page, [
    page.locator('footer button:has([data-icon="plus"]), footer [role="button"]:has([data-icon="plus"]), footer [role="button"]:has([data-icon="plus-rounded"]), footer [role="button"]:has([data-icon="clip"])'),
    page.getByRole('button', { name: /^(attach|attach file|إرفاق|إرفاق ملف)$/i }),
  ], 'WhatsApp attachment menu');
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
  const deadline = Date.now() + 15000;
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
  const preview = page.locator('[role="dialog"], [data-animate-modal-popup], [data-testid="media-editor"], [data-testid="media-preview"]');
  const previewSend = await readable(page, [
    preview.getByRole('button', { name: /^(send|send media|إرسال|ارسال)$/i }).filter({ visible: true }),
    preview.locator('button, [role="button"]').filter({ has: page.locator(sendIcons), visible: true }),
    // Some previews have no dialog role. Never select the ordinary chat composer.
    page.locator('button, [role="button"]')
      .filter({ has: page.locator(sendIcons), visible: true })
      .locator('xpath=self::*[not(ancestor::footer) and not(ancestor::*[@id="pane-side"])]'),
  ], 'WhatsApp attachment preview Send button', 30000);
  if (caption.trim()) {
    const editor = await readable(page, [
      page.locator('[role="dialog"] [contenteditable="true"][role="textbox"]'),
      page.locator('[data-animate-modal-popup] [contenteditable="true"][role="textbox"]'),
      page.locator('[contenteditable="true"][role="textbox"][aria-label*="caption" i], [contenteditable="true"][role="textbox"][aria-label*="تعليق"]'),
      page.locator('[contenteditable="true"][role="textbox"]:not(footer [contenteditable]):not(#pane-side [contenteditable])').filter({ visible: true }),
    ], 'WhatsApp attachment caption');
    // Never silently put a caption into the ordinary text-message composer.
    if (await editor.evaluate(el => Boolean(el.closest('footer, #pane-side')))) {
      throw new AutomationError('WhatsApp attachment caption is unavailable. Nothing sent; inspect the attachment preview.');
    }
    await act('Typing WhatsApp attachment caption…', () => editor.fill(caption));
  }
  guard(); await restriction();
  return previewSend;
}

module.exports = { attach };
