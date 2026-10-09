// Local-only browser execution. No stealth plugins, CAPTCHA bypass or automatic retries.
const fs = require('node:fs');
const path = require('node:path');
const waSuiteBrowser = require('./wa-suite-browser.cjs');
const mapsBrowser = require('./advanced-browser.cjs');
const { readable, publicError } = require('./automation-errors.cjs');
const firstJob = state => state.jobs.filter(j => ['Pending', 'Running'].includes(j.status))
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
const groupUrl = value => {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'www.facebook.com' || !/^\/groups\/[a-zA-Z0-9._-]+\/?$/.test(url.pathname)) throw new Error('Use https://www.facebook.com/groups/<group-id> URLs.');
  return `https://www.facebook.com${url.pathname.replace(/\/?$/, '/')}`;
};

module.exports = function createBrowserWorker({ get, save, recordActivity, automation, kick }) {
  const running = new Map();
  let closed = false;
  const notify = (job, message, level = 'info') => {
    if (!automation?.onEvent || !message) return;
    try {
      automation.onEvent({ jobId: job.id, platform: job.platform, status: job.status,
        phase: job.phase || job.status, message, level, at: new Date().toISOString() });
    } catch (error) { console.warn('Browser feedback unavailable:', error.message); }
  };
  const update = (workspace, jobId, change, message, level = 'info') => {
    const state = get(workspace), job = state.jobs.find(j => j.id === jobId);
    if (closed) throw new Error('Application closing.');
    if (!job || !['Pending', 'Running'].includes(job.status)) throw new Error('Task cancelled.');
    change(job, state);
    if (message) recordActivity(state, message, level);
    save(workspace, state);
    notify(job, message, level);
    return job;
  };
  async function execute(workspace, jobId) {
    let context;
    try {
      const job = update(workspace, jobId, j => { j.status = 'Running'; j.phase = 'Connecting…'; }, 'Connecting to a visible local browser. Sign in manually; passwords and QR codes are not captured by the app.');
      const profile = path.join(automation.profileDir, job.kind === 'leads' ? 'maps-research' : job.accountId);
      fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
      context = await automation.chromium.launchPersistentContext(profile, {
        headless: false, viewport: null, locale: 'en-US', timeout: 30000,
      });
      running.get(workspace).context = context;
      update(workspace, jobId, j => { j.phase = 'Browser opened'; }, 'Browser opened. Using the saved private account session.');
      const page = context.pages()[0] || await context.newPage();
      page.setDefaultTimeout(15000);
      const guard = () => {
        if (closed) throw new Error('Application closing.');
        const latest = get(workspace).jobs.find(j => j.id === jobId);
        if (!latest || !['Pending', 'Running'].includes(latest.status)) throw new Error('Task cancelled.');
        if (page.isClosed()) throw new Error('Browser closed. Task stopped.');
      };
      const restriction = async () => {
        guard();
        if (/checkpoint|challenge|captcha|\/sorry|\/blocked/i.test(page.url()) ||
          await page.getByText(/temporarily blocked|try again later|unusual activity|account.*(restricted|suspended)|too many requests|verify you are human/i).first().isVisible().catch(() => false)) {
          throw new Error('Platform restriction or verification challenge detected. Resolve it manually; automation will not bypass or retry it.');
        }
      };
      const wait = async (pacing) => {
        guard();
        const min = pacing?.min ?? job.delayMin, max = pacing?.max ?? job.delayMax;
        const seconds = min + Math.floor(Math.random() * (max - min + 1));
        const end = Date.now() + seconds * 1000;
        update(workspace, jobId, j => { j.phase = 'Waiting'; j.nextActionAt = new Date(end).toISOString(); }, `Waiting ${seconds} seconds before the next browser action.`);
        while (Date.now() < end) { await new Promise(resolve => setTimeout(resolve, Math.min(250, end - Date.now()))); guard(); }
      };
      const act = async (phase, operation, pacing) => {
        await wait(pacing); await restriction();
        update(workspace, jobId, j => { j.phase = phase; j.nextActionAt = null; }, phase);
        await operation();
        await restriction();
      };
      if (job.kind === 'leads') {
        await mapsBrowser.execute({
          runtime: automation, existingContext: context,
          task: { kind: 'maps', query: job.keywords, limit: job.totalCount },
          guard, setContext() {},
          pace: phase => act(phase, async () => {}),
          result: data => update(workspace, jobId, (j, state) => {
            if (state.leads.results.length >= 2000) throw new Error('Saved lead limit reached. Export and remove old results.');
            state.leads.results.push({ id: require('node:crypto').randomUUID(), jobId, keyword: job.keyword, city: job.city,
              businessName: data.name, phoneNumber: data.phone || '', address: data.address || '', website: data.website || '',
              createdAt: new Date().toISOString(), simulated: false });
            j.completedCount++; j.currentStep++; j.progress = Math.min(99, Math.round(j.completedCount / j.totalCount * 100));
          }, `Extracted public business: ${data.name}. Missing details stay blank.`, 'success'),
        });
      } else {
      // Navigate immediately: sign-in must not open a blank browser for a pacing interval.
      update(workspace, jobId, j => { j.phase = 'Opening sign-in…'; }, 'Opening sign-in…');
      await page.goto(job.platform === 'WhatsApp' ? 'https://web.whatsapp.com/' : 'https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      update(workspace, jobId, j => { j.phase = 'Waiting for sign-in / QR'; }, `Complete ${job.platform === 'WhatsApp' ? 'the WhatsApp QR scan' : 'Facebook sign-in'} in the local browser. Waiting up to five minutes.`);
      const deadline = Date.now() + 300000;
      while (true) {
        await restriction();
        const signedIn = job.platform === 'WhatsApp'
          ? await page.locator('#pane-side').isVisible().catch(() => false) ||
            await page.locator('[aria-label="Chat list"],[aria-label="قائمة الدردشات"]').first().isVisible().catch(() => false)
          : !/\/login|\/recover/i.test(page.url()) && (
            await page.getByRole('button', { name: /^(your profile|account|حسابك|ملفك الشخصي)$/i }).first().isVisible().catch(() => false) ||
            await page.getByRole('link', { name: /^(your profile|ملفك الشخصي)$/i }).first().isVisible().catch(() => false));
        if (signedIn) break;
        if (Date.now() > deadline) throw new Error('Sign-in timed out. Connect again and complete sign-in in the browser.');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      update(workspace, jobId, (_j, state) => {
        const account = state.store.accounts.find(a => a.id === job.accountId);
        if (account) account.browserConnectedAt = new Date().toISOString();
      }, 'Sign-in detected. Session remains in the private local browser profile.', 'success');
      if (['filter', 'inbox'].includes(job.action)) {
        await waSuiteBrowser[job.action]({
          page, job, act, guard, restriction, getState: () => get(workspace),
          update: (change, message, level) => update(workspace, jobId, change, message, level),
        });
      }
      if (job.action === 'search') {
        const searchInput = await readable(page, [
          page.getByRole('combobox', { name: /search facebook|بحث في فيسبوك/i }),
          page.getByRole('textbox', { name: /search facebook|بحث في فيسبوك/i }),
          page.locator('input[placeholder="Search Facebook"], input[aria-label="Search Facebook"], input[placeholder="بحث في فيسبوك"]'),
        ], 'Facebook search input');
        await act('Typing Facebook search keywords…', () => searchInput.fill(job.keywords));
        await act('Submitting Facebook search…', () => searchInput.press('Enter'));
        if (!new URL(page.url()).pathname.startsWith('/search/groups')) {
          const groupsFilter = await readable(page, [
            page.locator('a[href*="/search/groups/"]'),
            page.getByRole('link', { name: /^(groups|المجموعات)$/i }),
            page.getByRole('button', { name: /^(groups|المجموعات)$/i }),
          ], 'Facebook Groups search filter');
          await act('Searching Facebook groups…', () => groupsFilter.click());
        }
        await readable(page, [page.locator('a[href*="/groups/"]')], 'Facebook group search result link');
        await restriction();
        const results = await page.locator('a[href*="/groups/"]').evaluateAll(links => links.map(a => ({ url: a.href.split('?')[0], name: a.innerText.trim() })).filter(a => a.name));
        const groups = [];
        for (const result of results) {
          try {
            const url = groupUrl(result.url);
            if (!groups.some(g => g.url === url)) groups.push({ url, name: result.name.slice(0, 200) });
          } catch { /* Ignore navigation links and non-group URLs. */ }
          if (groups.length === 20) break;
        }
        if (!groups.length) throw new Error('No readable group results. Review the browser manually; no joins or posts were attempted.');
        update(workspace, jobId, j => { j.discoveredGroups = groups; }, `Found ${groups.length} groups for review. Nothing joined or posted.`, 'success');
      }
      if (job.action === 'join') {
        for (const target of job.targets) {
          await act(`Opening approved group ${target.name}…`,()=>page.goto(groupUrl(target.name),{waitUntil:'domcontentloaded'}));
          if (groupUrl(page.url())!==groupUrl(target.name)) throw new Error('Facebook redirected away from the approved group.');
           const join=page.getByRole('button',{name:/^(Join group|انضمام إلى المجموعة)$/i}).first();
           const member=page.getByRole('button',{name:/^(joined|member|تم الانضمام|عضو)$/i}).first();
           if(!await member.isVisible().catch(()=>false) && await join.isVisible()) await act(`Requesting group membership…`,async()=>{
             update(workspace,jobId,j=>{j.targets.find(t=>t.id===target.id).joinStatus='Needs review';});
             await join.click();
           });
          await restriction();
           await readable(page,[member,page.getByRole('button',{name:/cancel request|إلغاء الطلب/i})],'Facebook membership confirmation',10000).catch(error=>{if(!error.publicMessage)throw error;});
           const requested=await page.getByRole('button',{name:/cancel request|إلغاء الطلب/i}).first().isVisible().catch(()=>false);
           const joined=await member.isVisible().catch(()=>false);
          update(workspace,jobId,j=>{
            j.targets.find(t=>t.id===target.id).joinStatus=requested?'Requested':joined?'Joined':'Needs review';
            j.completedCount++;j.progress=Math.round(j.completedCount/j.totalCount*100);
          }, requested?'Membership requested; administrator approval may be required.':joined?'Membership detected.':'Membership outcome unclear; review manually.','warning');
          if(!requested && !joined) throw new Error('Membership outcome unclear. No automatic retry.');
        }
      }
      if (job.action === 'send' || job.action === 'publish') {
        for (const target of job.targets) {
          guard();
          if (job.platform === 'WhatsApp') {
            await act(`Opening chat for ${target.name}…`, () => page.goto(`https://web.whatsapp.com/send?phone=${target.name.replace('+', '')}`, { waitUntil: 'domcontentloaded' }));
            // An explicit invalid-number response is safe to skip; ambiguous sends stop.
            const invalid = page.getByText(/phone number shared via url is invalid|phone number.*is(n't| not) on whatsapp|is not registered on whatsapp|رقم الهاتف.*(غير صحيح|غير صالح|ليس.*واتساب|غير مسجل)/i).first();
            const deadline = Date.now() + 60000;
            while (!await page.locator('footer [contenteditable="true"][role="textbox"],footer [contenteditable="true"][data-tab]').first().isVisible().catch(() => false)) {
              await restriction();
              if (await invalid.isVisible().catch(() => false) || Date.now() >= deadline) break;
              await page.waitForTimeout(200);
            }
            if (await invalid.isVisible().catch(() => false)) {
              update(workspace, jobId, j => {
                const row = j.targets.find(t => t.id === target.id);
                row.sendStatus = 'Failed'; row.error = 'WhatsApp rejected this phone number. No message was submitted.';
                j.currentStep++; j.progress = Math.round(j.currentStep / j.totalCount * 100);
              }, `WhatsApp rejected ${target.name}. No message was submitted; continuing with the next recipient.`, 'warning');
              continue;
            }
            const input = await readable(page, [page.locator('footer [contenteditable="true"][role="textbox"]'), page.locator('footer [contenteditable="true"][data-tab]')], 'WhatsApp direct-chat message composer', 60000);
            await act(`Typing message for ${target.name}…`, () => input.fill(job.messageContent));
            const outgoing = page.locator('.message-out').filter({ hasText: job.messageContent });
            const count = await outgoing.count();
            const send = await readable(page, [page.locator('button:has([data-icon="send"]), [role="button"]:has([data-icon="send"])'), page.getByRole('button', { name: /^(send|إرسال)$/i })], 'WhatsApp Send button');
            await act(`Sending to ${target.name}…`, async () => {
              update(workspace, jobId, j => { j.targets.find(t => t.id === target.id).sendStatus = 'Unconfirmed'; });
              await send.click();
            });
            // Confirm a NEW outgoing bubble and a server-accepted check, not just a click.
            await outgoing.nth(count).waitFor({ timeout: 30000 });
            await outgoing.nth(count).locator('[data-icon="msg-check"], [data-icon="msg-dblcheck"]').first().waitFor({ timeout: 30000 });
            await restriction();
            update(workspace, jobId, (j, state) => {
              j.targets.find(t => t.id === target.id).sendStatus = 'Sent';
              state.analytics.realMessagesSent = (state.analytics.realMessagesSent || 0) + 1;
            }, `WhatsApp accepted the message to ${target.name}. Delivery to the recipient is not guaranteed.`, 'success');
          } else {
            await act(`Opening approved group ${target.name}…`, () => page.goto(groupUrl(target.name), { waitUntil: 'domcontentloaded' }));
            if (groupUrl(page.url()) !== groupUrl(target.name)) throw new Error('Facebook redirected away from the approved group. No join or post attempted.');
             const matchingPosts = page.getByText(job.messageContent, { exact: true }).filter({ visible: true });
            const previousPostCount = await matchingPosts.count();
             const member = page.getByRole('button', { name: /^(joined|member|تم الانضمام|عضو)$/i }).first();
             const join = page.getByRole('button', { name: /^(Join group|انضمام إلى المجموعة)$/i }).first();
             if (!await member.isVisible().catch(() => false) && await join.isVisible()) {
               await act(`Requesting membership in ${target.name}…`, async () => {
                 update(workspace, jobId, j => { j.targets.find(t => t.id === target.id).joinStatus = 'Needs review'; });
                 await join.click();
               });
              // Membership may need admin approval or questions. Never invent answers.
              const composer = page.getByRole('button', { name: /write something/i }).first();
              if (!await composer.isVisible()) {
                update(workspace, jobId, j => {
                  const t = j.targets.find(t => t.id === target.id); t.joinStatus = 'Needs review'; t.postStatus = 'Not posted';
                }, 'Join flow opened. Membership approval or questions require manual review; no confirmed join or post is recorded.', 'warning');
                update(workspace, jobId, j => { j.completedCount++; j.progress = Math.round(j.completedCount / j.totalCount * 100); });
                continue;
              }
            }
             const composer = await readable(page, [page.getByRole('button', { name: /write something|create.*post|اكتب شيئ|إنشاء منشور/i })], 'Facebook group post composer');
             const joined = await member.isVisible().catch(() => false);
             update(workspace, jobId, j => { j.targets.find(t => t.id === target.id).joinStatus = joined ? 'Joined' : 'Needs review'; });
            await act('Opening group post editor…', () => composer.click());
             const dialog = page.getByRole('dialog').last();
             const editor = await readable(page, [dialog.locator('[contenteditable="true"][role="textbox"]'), dialog.locator('textarea')], 'Facebook group post editor');
             await act('Typing approved group post…', () => editor.fill(job.messageContent));
             const post = await readable(page, [dialog.getByRole('button', { name: /^(post|نشر)$/i })], 'Facebook Post button');
             await act('Publishing approved group post…', async () => {
               update(workspace, jobId, j => { j.targets.find(t => t.id === target.id).postStatus = 'Unconfirmed'; });
               await post.click();
             });
            await dialog.waitFor({ state: 'hidden', timeout: 30000 });
            await matchingPosts.nth(previousPostCount).waitFor({ timeout: 30000 });
            await restriction();
            update(workspace, jobId, j => { j.targets.find(t => t.id === target.id).postStatus = 'Posted'; }, `Post appeared in ${target.name}; moderation may still apply.`, 'success');
          }
          update(workspace, jobId, j => {
            j.completedCount++; j.currentStep++; j.progress = Math.round(j.currentStep / j.totalCount * 100);
          });
        }
      }
      }
      const rejected = get(workspace).jobs.find(j => j.id === jobId).targets?.some(t => t.sendStatus === 'Failed');
      update(workspace, jobId, (j, state) => {
        j.status = rejected ? 'Failed' : 'Completed'; j.phase = rejected ? 'Finished with errors' : 'Done'; j.progress = 100; j.nextActionAt = null;
        if (rejected) j.error = 'Some recipients failed. Review the recipient table. Confirmed sends are not retried.';
        const campaign = state.store.campaigns.find(c => c.id === j.campaignId);
        if (campaign) {
          campaign.status = j.targets.every(t => t.postStatus === 'Posted') ? 'Sent' : 'Ready for review';
          campaign.updatedAt = new Date().toISOString();
        }
      }, rejected ? 'Some recipients failed. Review the recipient table. Confirmed sends are not retried.' : job.kind === 'leads' ? 'Public Google Maps extraction completed. Results contain observed listings only.' : 'Local browser task done. Review actual platform outcomes; pending membership requests are not completed joins.', rejected ? 'warning' : 'success');
    } catch (error) {
      if (closed) return;
      const state = get(workspace), job = state.jobs.find(j => j.id === jobId);
      if (job && ['Pending', 'Running'].includes(job.status)) {
        const failedPhase = job.phase;
        job.status = 'Failed'; job.phase = 'Stopped — review required'; job.nextActionAt = null;
        const reason = /executable doesn't exist|please run.*playwright install/is.test(error.message)
          ? 'Chromium is missing. Run npx playwright install chromium in the desktop folder, then try again.'
          : /processsingleton|singletonlock|profile.*(in use|locked)/i.test(error.message)
            ? 'This account profile is already in use. Close its other browser window before retrying. Do not delete the saved profile.'
            : error.publicMessage || error.name === 'TimeoutError' ? publicError(error, failedPhase) : error.message.slice(0, 2000);
        job.error = reason;
        if (job.platform === 'WhatsApp' && job.action === 'send') {
          const row = job.targets.find(t => t.sendStatus === 'Unconfirmed') || job.targets[job.currentStep];
          if (row) {
            if (row.sendStatus === 'Pending') row.sendStatus = 'Failed';
            row.error = reason;
          }
        }
        const message = `Browser task stopped: ${reason}. If an action was submitted, verify it manually before retrying to avoid duplicates.`;
        recordActivity(state, message, 'warning');
        save(workspace, state);
        notify(job, message, 'warning');
      }
    } finally {
      if (context) await context.close().catch(() => {});
      running.delete(workspace);
      if (!closed) kick(workspace);
    }
  }
  return {
    kick(workspace) {
      if (closed || !automation || running.has(workspace)) return;
      const job = firstJob(get(workspace));
      if (!job || job.mode !== 'live') return;
      const runtime = { jobId: job.id, context: null, promise: null };
      running.set(workspace, runtime);
      runtime.promise = execute(workspace, job.id);
    },
    cancel(jobId) {
      for (const [workspace, runtime] of running) if (runtime.jobId === jobId) {
        const job = get(workspace).jobs.find(j => j.id === jobId);
        if (job) notify(job, 'Live task cancelled. Already submitted actions cannot be undone.', 'warning');
        void runtime.context?.close().catch(() => {});
      }
    },
    close() {
      closed = true;
      return Promise.allSettled([...running.values()].map(async runtime => {
        await runtime.context?.close().catch(() => {});
        await runtime.promise;
      }));
    },
  };
};
module.exports.groupUrl = groupUrl;
