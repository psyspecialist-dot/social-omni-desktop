const { randomUUID } = require('node:crypto');
const suite = require('./wa-suite.cjs');

const peerFromId = id => /^(?:true|false)_([^_]+)_.+/.exec(id || '')?.[1] || '';
const directPeer = peer => /@(c\.us|s\.whatsapp\.net|lid)$/.test(peer);
async function snapshot(page) {
  return page.locator('#main').evaluate(main => ({
    name: main.querySelector('header [title]')?.getAttribute('title') || '',
    messages: Array.from(main.querySelectorAll('.message-in, .message-out')).map(el => ({
      id: el.closest('[data-id]')?.getAttribute('data-id') || '',
      text: Array.from(el.querySelectorAll('.selectable-text.copyable-text')).at(-1)?.textContent || '',
      direction: el.classList.contains('message-in') ? 'incoming' : 'outgoing',
      status: el.classList.contains('message-in') ? 'Received' :
        el.querySelector('[data-icon="msg-check"],[data-icon="msg-dblcheck"]') ? 'Accepted' : 'Unconfirmed',
    })).filter(m => m.id && m.text),
  }));
}

async function filter({ page, job, act, update, guard, restriction }) {
  for (const target of job.targets) {
    await act(`Checking WhatsApp registration for ${target.name}…`, () => page.goto(`https://web.whatsapp.com/send?phone=${target.name.slice(1)}`, { waitUntil: 'domcontentloaded' }));
    const deadline = Date.now() + 30000;
    let status = 'Unknown', reason = 'No definitive platform response. Not classified as inactive.';
    while (Date.now() < deadline) {
      guard(); await restriction();
      if (await page.getByText(/phone number shared via url is invalid|phone number.*is(n't| not) on whatsapp|is not registered on whatsapp|رقم الهاتف.*(غير صحيح|غير صالح|ليس.*واتساب|غير مسجل)/i).first().isVisible().catch(() => false)) {
        status = 'Inactive'; reason = 'WhatsApp explicitly reported an invalid or unregistered number.'; break;
      }
      if (await page.locator('footer [contenteditable="true"][role="textbox"]').first().isVisible().catch(() => false)) {
        status = 'Active/Valid'; reason = 'WhatsApp opened a direct-chat composer. This does not confirm consent or recipient activity.'; break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    update((j, state) => {
      const result = state.waSuite.filter.results.find(r => r.id === target.id);
      if (result) Object.assign(result, { status, reason, checkedAt: new Date().toISOString() });
      j.completedCount++; j.currentStep++; j.progress = Math.round(j.completedCount / j.totalCount * 100);
    }, `WaFilter: ${target.name} — ${status}. ${reason}`, status === 'Active/Valid' ? 'success' : 'warning');
    if (status === 'Unknown') throw new Error('Number check was inconclusive. Filter stopped instead of marking remaining numbers inactive; review WhatsApp manually.');
  }
}

async function inbox({ page, job, getState, act, update, guard, restriction }) {
  const observed = new Map();
  update(j => { j.phase = 'Watching open conversation'; }, 'Open a direct client conversation in the local WhatsApp browser. Initial visible history is synced without replies. New incoming text can trigger opted-in rules; groups and background chats are not monitored.');
  while (true) {
    guard(); await restriction();
    if (!await page.locator('#main').isVisible().catch(() => false)) {
      await new Promise(resolve => setTimeout(resolve, 1000)); continue;
    }
    const current = await snapshot(page);
    const peer = peerFromId(current.messages.at(-1)?.id);
    if (!directPeer(peer)) { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
    const key = `${job.accountId}:${peer}`;
    const baseline = !observed.has(key), known = observed.get(key) || new Set();
    const fresh = current.messages.filter(m => peerFromId(m.id) === peer && !known.has(m.id));
    if (fresh.length) {
      update((_j, state) => {
        let thread = state.waSuite.threads.find(t => t.remoteKey === key);
        const phone = /@(c\.us|s\.whatsapp\.net)$/.test(peer) ? suite.phone(peer.split('@')[0]) : suite.phone(current.name);
        if (!thread && phone) thread = state.waSuite.threads.find(t => t.phone === phone && !t.remoteKey);
        if (!thread) {
          if (state.waSuite.threads.length >= 1000) throw new Error('CRM is full. Stop monitoring and remove unused clients.');
          thread = { id: randomUUID(), name: (current.name || phone || 'WhatsApp client').slice(0, 150), phone,
            status: 'New', notes: '', optedIn: false, contactId: null, messages: [], updatedAt: new Date().toISOString() };
          state.waSuite.threads.unshift(thread);
          suite.linkContact(state, thread);
        }
        thread.accountId = job.accountId; thread.remoteKey = key;
        const storedIds = new Set(thread.messages.map(m => m.id));
        for (const message of fresh) if (!storedIds.has(message.id)) thread.messages.push({
          ...message, text: message.text.slice(0, 10000), timestamp: new Date().toISOString(),
          status: message.status,
        });
        thread.messages = thread.messages.slice(-200);
        thread.updatedAt = new Date().toISOString();
        // Opt-out takes precedence even when another message in the same batch matches a rule.
        if (fresh.some(m => m.direction === 'incoming' && suite.optOut(m.text))) {
          thread.optedIn = false; suite.linkContact(state, thread);
        }
        _j.phase = 'Watching open conversation'; _j.nextActionAt = null;
      }, `${baseline ? 'Initial history' : 'New messages'} synced for ${current.name || 'client'} (${fresh.length}).`, 'info');
    }
    for (const m of current.messages) known.add(m.id);
    if (known.size > 50000) throw new Error('Session observation limit reached. Review and restart monitoring.');
    observed.set(key, known);
    const incoming = baseline ? null : fresh.filter(m => m.direction === 'incoming').at(-1);
    if (incoming && !fresh.some(m => m.direction === 'incoming' && suite.optOut(m.text))) {
      const state = getState(), thread = state.waSuite.threads.find(t => t.remoteKey === key);
      const rules = state.waSuite.rules;
      const eligible = thread?.optedIn && (!thread.contactId || state.store.contacts.find(c => c.id === thread.contactId)?.optedIn);
      const rule = eligible ? rules.find(r => suite.matches(r, incoming.text)) : null;
      const lastAttempt = rule && thread.ruleLastAttempts?.[rule.id];
      if (rule && (!lastAttempt || Date.now() - Date.parse(lastAttempt) >= rule.cooldownMinutes * 60000)) {
        const response = rule.template.replace(/\{\{name\}\}/g, thread.name);
        const attemptId = `bot-${randomUUID()}`;
        let attempted = false, count = 0;
        const outgoing = page.locator('.message-out').filter({ hasText: response });
        await act(`Replying with rule “${rule.name}”…`, async () => {
          const latest = getState(), latestThread = latest.waSuite.threads.find(t => t.id === thread.id);
          const latestRule = latest.waSuite.rules.find(r => r.id === rule.id);
          const beforeSend = await snapshot(page);
          if (peerFromId(beforeSend.messages.at(-1)?.id) !== peer) throw new Error('Watched conversation changed while a reply was waiting. Nothing sent.');
          if (beforeSend.messages.some(m => !known.has(m.id) && m.direction === 'incoming' && suite.optOut(m.text))) {
            update((j, s) => { const t = s.waSuite.threads.find(t => t.id === thread.id); t.optedIn = false; suite.linkContact(s, t); j.phase = 'Watching open conversation'; }, 'Opt-out received while waiting; reply suppressed.', 'warning');
            return;
          }
          if (!latestThread?.optedIn || (latestThread.contactId && !latest.store.contacts.find(c => c.id === latestThread.contactId)?.optedIn) ||
            !latestRule?.enabled || latestRule.template !== rule.template || !suite.matches(latestRule, incoming.text)) {
            update(j => { j.phase = 'Watching open conversation'; }, 'Consent or rule changed while waiting; reply suppressed.', 'warning'); return;
          }
          const input = page.locator('footer [contenteditable="true"][role="textbox"]').first();
          if ((await input.textContent() || '').trim()) {
            update(j => { j.phase = 'Watching open conversation'; }, 'A human-written draft is in the composer. Auto-reply suppressed so the draft is not overwritten.', 'warning'); return;
          }
          // Reserve a durable attempt BEFORE touching Send. Ambiguous failures never auto-retry.
          update((_j, s) => {
            const t = s.waSuite.threads.find(t => t.id === thread.id);
            t.ruleLastAttempts = { ...t.ruleLastAttempts, [rule.id]: new Date().toISOString() };
            t.messages.push({
              id: attemptId, text: response, direction: 'outgoing', status: 'Unconfirmed', timestamp: new Date().toISOString(), ruleId: rule.id,
            });
          });
          count = await outgoing.count();
          await input.fill(response);
          await restriction();
          const finalState = getState(), finalThread = finalState.waSuite.threads.find(t => t.id === thread.id);
          const finalRule = finalState.waSuite.rules.find(r => r.id === rule.id);
          if (!finalThread?.optedIn || !finalRule?.enabled || finalRule.template !== rule.template ||
            (finalThread.contactId && !finalState.store.contacts.find(c => c.id === finalThread.contactId)?.optedIn)) throw new Error('Consent or rule changed before Send. Reply not submitted; inspect the browser draft.');
          await page.locator('button:has([data-icon="send"]), [role="button"]:has([data-icon="send"])').first().click();
          attempted = true;
        }, { min: rule.delayMin, max: rule.delayMax });
        if (attempted) {
          await outgoing.nth(count).waitFor({ timeout: 30000 });
          await outgoing.nth(count).locator('[data-icon="msg-check"], [data-icon="msg-dblcheck"]').first().waitFor({ timeout: 30000 });
          await restriction();
          const confirmedId = await outgoing.nth(count).evaluate(el => el.closest('[data-id]')?.getAttribute('data-id'));
          if (confirmedId) known.add(confirmedId);
          update((j, s) => {
            const t = s.waSuite.threads.find(t => t.id === thread.id), reply = t.messages.find(m => m.id === attemptId);
            reply.status = 'Accepted'; if (confirmedId) reply.id = confirmedId;
            t.messages = t.messages.slice(-200); t.updatedAt = new Date().toISOString();
            s.analytics.realMessagesSent = (s.analytics.realMessagesSent || 0) + 1;
            j.completedCount++; j.phase = 'Watching open conversation'; j.nextActionAt = null;
          }, `WhatsApp accepted the auto-reply from “${rule.name}”. Recipient delivery is not guaranteed.`, 'success');
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
module.exports = { filter, inbox, peerFromId, directPeer, snapshot };
