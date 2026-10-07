import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { Globe, Play, ShieldCheck, Square } from 'lucide-react';
import { isDesktop } from '@/lib/persistence';
import type { Account, Campaign } from '@/lib/workspace';
import type { ApiState, SimulationJob } from '@/lib/api';
import SimQueue from './SimQueue';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
export default function LiveAutomation({ platform, accounts, campaigns = [], jobs, perform, beforeSend, draftPreview }: {
  platform: 'WhatsApp' | 'Facebook'; accounts: Account[]; campaigns?: Campaign[]; jobs: SimulationJob[];
  perform: Perform; beforeSend?: () => Promise<void>; draftPreview?: { phoneNumbers: string; messageContent: string; mediaId: string | null };
}) {
  const { t, locale } = useI18n();
  const choices = accounts.filter(a => a.platform === platform && !a.status.startsWith('Paused'));
  const [accountId, setAccountId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [keywords, setKeywords] = useState('');
  const [groups, setGroups] = useState('');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [events, setEvents] = useState<BrowserAutomationEvent[]>([]);
  useEffect(() => window.socialOmni?.onBrowserEvent?.(event => {
    if (event.platform === platform) setEvents(previous => [...previous, event].slice(-80));
  }), [platform]);
  useEffect(() => { setApproved(false); }, [accountId, campaignId, groups, draftPreview?.phoneNumbers, draftPreview?.messageContent, draftPreview?.mediaId]);
  const selectedAccount = choices.find(a => a.id === accountId);
  const available = isDesktop && Boolean(selectedAccount);
  const active = jobs.find(j => ['Pending', 'Running'].includes(j.status));
  const latest = jobs.find(j => j.mode === 'live' && j.platform === platform);
  const search = jobs.find(j => j.mode === 'live' && j.platform === 'Facebook' && j.discoveredGroups?.length);
  const start = async (action: 'connect' | 'search' | 'send' | 'publish') => {
    if (busy) return;
    setBusy(action); setError(''); setEvents([]);
    try {
      if (action === 'send') await beforeSend?.();
      await perform('POST', '/browser/jobs', { action, accountId, campaignId, keywords, groupUrls: groups, approved });
      setApproved(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start the browser.'); }
    finally { setBusy(''); }
  };
  const stop = async () => {
    if (!active) return;
    setBusy('stop'); setError('');
    try { await perform('POST', `/jobs/${active.id}/cancel`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to stop.'); }
    finally { setBusy(''); }
  };
  return <section className="live-panel" data-testid={`live-${platform.toLowerCase()}`}>
    <div className="panel-head"><div><div className="panel-title"><Globe size={16} /> {t('Local browser automation')} · {t(platform)}</div><div className="panel-caption">{t('Real actions · visible Playwright browser · private account profile')}</div></div><ShieldCheck size={18} /></div>
    <div style={{ padding: 20 }}>
      <p className="live-warning">{isDesktop
        ? t('Live sends, membership requests and posts cannot be undone by cancelling. Use only opted-in recipients and groups that permit your content. Pacing does not prevent bans. Restrictions and verification challenges stop the task.')
        : t('Live automation is desktop-only. Download Social Najhin from Settings and run it locally. The hosted preview cannot launch a browser on your computer; its rehearsal controls remain simulated.')}</p>
      <div className="live-controls">
        <label className="live-field">{t('Saved account')}
          <select className="field-select" value={accountId} onChange={e => setAccountId(e.target.value)} data-testid={`live-account-${platform.toLowerCase()}`} disabled={Boolean(active)}>
            <option value="">{t('Select a {platform} account', { platform: t(platform) })}</option>{choices.map(a => <option key={a.id} value={a.id}>{a.displayLabel}</option>)}
          </select>
        </label>
        <button type="button" className="button button-secondary" onClick={() => start('connect')} disabled={!available || Boolean(active) || Boolean(busy)} data-testid={`live-connect-${platform.toLowerCase()}`}>{busy === 'connect' ? t('Starting…') : t('Open browser / sign in')}</button>
      </div>
      {!choices.length && <p className="heading-sub">{t('Add a {platform} account in Accounts Manager first. Do not enter cookies or passwords.', { platform: t(platform) })}</p>}
      {selectedAccount?.browserConnectedAt && <p className="live-status">{t('Last sign-in detected: {date}. Every run checks the session again.', { date: new Date(selectedAccount.browserConnectedAt).toLocaleString(locale) })}</p>}
      {platform === 'WhatsApp' && draftPreview && <div style={{ marginTop: 16 }}>
        <p className="section-label">{t('Review current live message')}</p>
        <div className="live-warning" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 170, overflow: 'auto' }}>
          <strong>{t('Recipients:')}</strong> {draftPreview.phoneNumbers || t('Enter recipients in the draft below.')}
          {'\n\n'}<strong>{t('Message:')}</strong> {draftPreview.messageContent || t('Enter a message in the draft below.')}
        </div>
        {draftPreview.mediaId && <p role="note" className="heading-sub">{t('Remove the draft attachment before live sending. Live execution is text-only.')}</p>}
      </div>}
      {platform === 'Facebook' && <>
        <div className="live-controls" style={{ marginTop: 16 }}>
          <label className="live-field">{t('Group search keywords')}<input className="field-input" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder={t('e.g. local photography')} disabled={Boolean(active)} /></label>
          <button type="button" className="button button-secondary" onClick={() => start('search')} disabled={!available || !keywords.trim() || Boolean(active) || Boolean(busy)} data-testid="live-search-facebook">{busy === 'search' ? t('Starting…') : t('Search groups for review')}</button>
        </div>
        {search?.discoveredGroups && <div style={{ marginTop: 12 }}>{search.discoveredGroups.map(group => <label key={group.url} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" disabled={Boolean(active)} checked={groups.split('\n').includes(group.url)} onChange={e => {
            const urls = groups.split('\n').filter(Boolean);
            setGroups(e.target.checked ? [...new Set([...urls, group.url])].join('\n') : urls.filter(u => u !== group.url).join('\n'));
            setApproved(false);
          }} /> <span>{group.name} <small>{group.url}</small></span>
        </label>)}</div>}
        <div className="live-controls" style={{ marginTop: 16 }}>
          <label className="live-field">{t('Facebook campaign')}<select className="field-select" value={campaignId} onChange={e => { setCampaignId(e.target.value); setApproved(false); }} disabled={Boolean(active)}>
            <option value="">{t('Choose saved text campaign')}</option>{campaigns.filter(c => c.platform === 'Facebook').map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></label>
          <label className="live-field">{t('Approved group URLs (one per line, up to 20)')}<textarea className="field-textarea" value={groups} onChange={e => { setGroups(e.target.value); setApproved(false); }} placeholder={t('https://www.facebook.com/groups/your-group/')} disabled={Boolean(active)} /></label>
        </div>
        {campaignId && <p className="heading-sub">{t('Post preview:')} {campaigns.find(c => c.id === campaignId)?.caption || t('Save a caption first.')}</p>}
      </>}
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18 }}>
        <input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} disabled={!isDesktop || Boolean(active)} data-testid={`live-consent-${platform.toLowerCase()}`} />
        <span>{platform === 'WhatsApp' ? t('I confirm every listed recipient opted in to this message, and approve sending the saved text now.') : t('I reviewed every selected group, am eligible to request membership, have permission for this content, and approve submitting the saved post now.')}</span>
      </label>
      <div className="live-controls" style={{ marginTop: 18 }}>
        <button type="button" className="button button-primary" onClick={() => start(platform === 'WhatsApp' ? 'send' : 'publish')} disabled={!available || !approved || Boolean(active) || Boolean(busy) || (platform === 'Facebook' && (!campaignId || !groups.trim()))} data-testid={`live-run-${platform.toLowerCase()}`}><Play size={15} /> {busy ? t('Starting…') : platform === 'WhatsApp' ? t('Send approved messages') : t('Join / post to approved groups')}</button>
        {active?.mode === 'live' && <button type="button" className="button button-danger" onClick={stop} disabled={Boolean(busy)}><Square size={14} /> {t('Stop browser task')}</button>}
      </div>
      <p className="heading-sub">{t('Text-only execution. Sign-in / WhatsApp QR scan happens manually in the browser. Sessions are separate per account. English platform controls are required. Review outcomes before any retry.')}</p>
      {error && <p className="wa-feedback error" role="alert">{t(error)}</p>}
      {isDesktop && <div style={{ marginTop: 18 }}>
        <p className="section-label">{t('Browser activity')}</p>
        <div role="log" aria-live="polite" aria-relevant="additions" data-testid={`browser-log-${platform.toLowerCase()}`} style={{ maxHeight: 200, overflowY: 'auto', overflowWrap: 'anywhere' }}>
          {events.length ? events.map((event, index) => <p key={`${event.at}-${index}`} className={event.level === 'warning' ? 'wa-feedback error' : 'heading-sub'}>
            <time>{new Date(event.at).toLocaleTimeString(locale)}</time> · {t(event.message)}
          </p>) : <p className="heading-sub">{t('Browser progress and errors appear here when a task starts.')}</p>}
        </div>
      </div>}
      {latest && <div style={{ marginTop: 18 }}><SimQueue job={latest} testId={`live-${latest.id}`} /></div>}
    </div>
  </section>;
}
