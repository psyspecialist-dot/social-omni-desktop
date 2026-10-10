const { AutomationError } = require('./automation-errors.cjs');

async function attach(page, dialog, media, { act, guard, restriction }) {
  if (!media?.content?.length || !/^(image|video)\//.test(media.mime)) {
    throw new AutomationError('Choose an existing image or video for Facebook. Nothing posted.');
  }
  const picker = dialog.getByRole('button', { name: /photo\/video|photo.*video|صورة.*فيديو/i }).first();
  if (await picker.isVisible().catch(() => false)) await act('Opening Facebook media picker…', () => picker.click());
  const deadline = Date.now() + 15000;
  let input;
  while (!input && Date.now() < deadline) {
    guard(); await restriction();
    const inputs = dialog.locator('input[type="file"]');
    for (let i = 0; i < await inputs.count(); i++) {
      const candidate = inputs.nth(i);
      const accept = await candidate.getAttribute('accept') || '';
      if (!accept || accept === '*' || accept.includes(media.mime.split('/')[0])) { input = candidate; break; }
    }
    if (!input) await page.waitForTimeout(200);
  }
  if (!input) throw new AutomationError('Required platform control unavailable: Facebook media file input. Nothing posted.');
  await act('Uploading approved Facebook media…', () => input.setInputFiles({
    name: media.name.replace(/[\\/]/g, '_'), mimeType: media.mime, buffer: Buffer.from(media.content),
  }));
}

module.exports = { attach };
