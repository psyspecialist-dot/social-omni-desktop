import { useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, Globe } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { AdvancedTask } from '@workspace/api-client-react';
import type { Account } from '@/lib/workspace';
import type { ApiState, MediaAsset, SimulationJob } from '@/lib/api';
import { isDesktop } from '@/lib/persistence';
import MediaUpload from '@/components/MediaUpload';
import { FB_PHASE, msg, when } from './config';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
export default function FacebookPanel({ accounts, media, jobs, tasks, perform }: { accounts: Account[]; media: MediaAsset[]; jobs: SimulationJob[]; tasks: AdvancedTask[]; perform: Perform }) {
  const { t, locale } = useI18n();
  const choices = accounts.filter(a => a.platform === 'Facebook' && !a.status.startsWith('Paused'));
  const [accountId, setAccountId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mediaId, setMediaId] = useState<string | null>(null);
  const acct = choices.find(a => a.id === accountId) ? accountId : choices.length === 1 ? choices[0].id : '';
  const jobBusy = jobs.some(j => FB_PHASE.includes(j.status));
  const taskBusy = tasks.some(x => ['Queued', 'Running'].includes(x.status));
  const latest = jobs.find(j => j.mode === 'live' && j.platform === 'Facebook');
  const disabled = !isDesktop || !acct || jobBusy || taskBusy || busy;
  const start = async () => { setBusy(true); setErr(''); try { await perform('POST', '/browser/jobs', { action: 'connect', accountId: acct }); } catch (e) { setErr(msg(e, t)); } finally { setBusy(false); } };
  return <section className="wa-card" aria-label={t('Facebook sign-in')} data-testid="panel-fb-signin">
    <h2 style={{ margin: 0 }}><Globe size={16} /> {t('Facebook sign-in (desktop browser)')}</h2>
    {!isDesktop && <div className="wa-banner warn" role="note"><AlertTriangle /><div>{t('The hosted preview cannot open a browser on your computer. Sign-in and all live actions are disabled here; drafts still save.')}</div></div>}
    <p className="wa-sub">{t('A visible browser opens. Sign in and clear any checkpoint yourself; nothing bypasses captchas. Account labels are not credentials: never enter passwords or cookies.')} <Link href="/accounts" className="text-link" data-testid="link-fb-accounts">{t('Add an active Facebook account label in Accounts')}</Link></p>
    <div className="wa-row">
      <select className="field-select" aria-label={t('Facebook account')} value={acct} onChange={e => setAccountId(e.target.value)} data-testid="select-fb-account"><option value="">{choices.length ? t('Choose an account') : t('No {platform} account saved', { platform: 'Facebook' })}</option>{choices.map(a => <option key={a.id} value={a.id}>{a.displayLabel}</option>)}</select>
      <button type="button" className="button button-secondary" disabled={disabled} onClick={() => void start()} data-testid="button-fb-signin">{busy ? t('Starting…') : t('Open browser / sign in')}</button>
    </div>
    {(jobBusy || taskBusy) && <p className="adv-note">{t('Sign-in is unavailable while a browser job or advanced task is pending or running.')}</p>}
    {err && <p className="wa-err" role="alert">{err}</p>}
    <div style={{ marginTop: 10 }} data-testid="status-fb-job">{latest ? <p className="adv-sub">{t('Latest browser job')}: {t(latest.status)} · {t(latest.phase || 'Waiting')} · {when(latest.createdAt, locale)}{latest.error && <span className="wa-err" role="alert"> · {t(latest.error)}</span>}</p> : <p className="adv-sub">{t('No Facebook browser job has run yet.')}</p>}</div>
    <h3 style={{ marginTop: 16 }}>{t('Facebook media library')}</h3>
    <p className="wa-sub">{t('Upload images or videos here, then pick them in a Facebook post task. PDFs are not accepted for Facebook posts.')}</p>
    <MediaUpload mediaId={mediaId} media={media} perform={perform} onChange={setMediaId} testId="fb-media" />
  </section>;
}
