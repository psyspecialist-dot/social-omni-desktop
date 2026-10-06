import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import type { AdvancedSuite, AdvancedTask, AdvancedTaskInput } from '@workspace/api-client-react';
import type { Account } from '@/lib/workspace';
import type { ApiState, MediaAsset } from '@/lib/api';
import { isDesktop } from '@/lib/persistence';
import { AlertTriangle, Ban, Info, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import TaskEditor from './TaskEditor';
import ResultsTable from './ResultsTable';
import { SmtpPanel, TelegramPanel } from './ConnectionPanel';
import { ACTIVE, KINDS, MODULES, NATIVE_NOTE, msg, when, type ModuleId } from './config';
import '../wa-suite.css';
import './advanced.css';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
interface Props { module: ModuleId; advanced?: AdvancedSuite; accounts: Account[]; media: MediaAsset[]; perform: Perform }
const tone: Record<string, string> = { Completed: 'green', Running: 'blue', Queued: 'blue', Scheduled: 'blue', Failed: 'red', 'Needs review': 'amber', Cancelled: '', Draft: '' };
const EMPTY: AdvancedSuite = { tasks: [], results: [], connections: [] };

function Countdown({ at }: { at?: string | null }) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  if (!at) return null;
  const s = Math.round((new Date(at).getTime() - now) / 1000);
  if (Number.isNaN(s)) return null;
  return <span className="adv-mono"> · {t('next')} {s > 0 ? t('in {m}m {s}s', { m: Math.floor(s / 60), s: String(s % 60).padStart(2, '0') }) : t('now')} ({when(at, locale)})</span>;
}

export default function AdvancedModule({ module, advanced, accounts, media, perform }: Props) {
  const { t, locale } = useI18n();
  const suite = advanced || EMPTY;
  const def = MODULES[module];
  const tasks = suite.tasks.filter(x => def.kinds.includes(x.kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [editor, setEditor] = useState<{ task?: AdvancedTask } | null>(null);
  const [runFor, setRunFor] = useState<AdvancedTask | null>(null);
  const [delFor, setDelFor] = useState<AdvancedTask | null>(null);
  const [consent, setConsent] = useState(false);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const running = suite.tasks.some(x => ['Queued', 'Running'].includes(x.status));
  const save = async (input: AdvancedTaskInput, id?: string) => { await perform(id ? 'PATCH' : 'POST', id ? `/advanced/tasks/${id}` : '/advanced/tasks', input); setEditor(null); };
  const act = async (key: string, fn: () => Promise<unknown>, done?: () => void) => { setBusy(key); setErr(''); try { await fn(); done?.(); } catch (e) { setErr(msg(e, t)); } finally { setBusy(''); } };
  const needsConn = module === 'email' ? 'smtp' : null;
  return <main className="page wa adv" data-testid={`page-adv-${module}`}>
    <div className="page-heading"><div><div className="eyebrow">{t(def.eyebrow)}</div><h1>{t(def.title)}</h1><p className="heading-sub">{t(def.sub)}</p></div>
      <button className="button button-primary" onClick={() => setEditor({})} data-testid="button-adv-new"><Plus /> {t('New task')}</button></div>
    {!isDesktop && <div className="wa-banner warn" role="note"><AlertTriangle /><div>{t(NATIVE_NOTE)}</div></div>}
    <div className="wa-banner info" role="note"><Info /><div>{t('Every run asks for your explicit consent and authorization. Uncertain sends are never retried automatically; check the destination before running again.')}</div></div>
    {module === 'email' && <div className="wa-banner warn" role="note"><AlertTriangle /><div>{t('Configure and test SMTP before sending. “Accepted by the server” is not “delivered”. The address checker verifies format and domain MX only: a ready domain still leaves the mailbox Unknown, and nothing here guarantees deliverability or prevents bounces. Messages are plain text; HTML and rich text are not supported.')}</div></div>}
    {module === 'extractors' && <div className="wa-banner info" role="note"><Info /><div>{t('Invalid addresses are excluded from clean exports. Valid domains show “Domain ready” and the mailbox status is Unknown. B2B fields are read from real sites; anything not found stays blank.')}</div></div>}
    {module === 'multi-platform' && <div className="wa-banner info" role="note"><Info /><div>{t('Telegram member export lists IDs, usernames and names from one group you administer. No emails or phones are returned, and members are not added to any outreach list. Instagram supports only your own feed image post.')}</div></div>}
    {err && <p className="wa-err" role="alert" data-testid="error-adv">{err}</p>}
    <section className="wa-card" aria-label={t('Tasks')} data-testid="panel-adv-tasks">
      <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ margin: 0 }}>{t('Tasks')} <span className="mono-tag">{tasks.length}</span></h2>{running && <span className="wa-chip blue">{t('One task at a time')}</span>}</div>
      {!tasks.length ? <div className="empty-state"><div className="empty-symbol"><Plus /></div><b>{t('No tasks yet')}</b><p>{t('Create a draft, review it, then approve a run or a schedule.')}</p><button className="button button-primary" onClick={() => setEditor({})}>{t('New task')}</button></div>
        : <div className="adv-tasks">{tasks.map(tk => {
          const live = ACTIVE.includes(tk.status);
          const editable = ['Draft', 'Scheduled'].includes(tk.status);
          return <article key={tk.id} className="adv-task" data-testid={`row-adv-task-${tk.id}`}>
            <div className="adv-task-main"><div><strong>{tk.name}</strong><span className="adv-sub">{t(KINDS[tk.kind].label)}{tk.query ? ` · ${tk.query}` : ''}{tk.scheduledAt ? ` · ${when(tk.scheduledAt, locale)}` : ''}</span></div><span className={`wa-chip ${tone[tk.status] || ''}`} data-testid={`status-adv-task-${tk.id}`}>{t(tk.status)}</span></div>
            {(tk.status === 'Running' || tk.status === 'Queued' || tk.progress > 0) && <><div className="adv-sub">{t(tk.phase || 'Waiting')} · {tk.completedCount}/{tk.totalCount || '?'}<Countdown at={tk.nextActionAt} /></div><div className="wa-prog" role="progressbar" aria-label={t('{name} progress', { name: tk.name })} aria-valuenow={tk.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${tk.progress}%` }} /></div></>}
            {tk.status === 'Needs review' && <p className="adv-note">{t('The app was closed when this was due, so it did not run. Review it and run again if you still want it.')}</p>}
            {tk.error && <p className="wa-err" role="alert">{t(tk.error)}</p>}
            <div className="adv-actions">
              {(tk.status === 'Draft' || tk.status === 'Needs review' || tk.status === 'Scheduled') && <button className="button button-primary" disabled={!isDesktop || running || busy === tk.id} title={isDesktop ? '' : t(NATIVE_NOTE)} onClick={() => { setConsent(false); setRunFor(tk); }} data-testid={`button-adv-run-${tk.id}`}><Play /> {tk.scheduledAt && tk.status !== 'Needs review' ? t('Approve') : t('Run')}</button>}
              {live && <button className="button button-secondary" disabled={busy === tk.id} onClick={() => void act(tk.id, () => perform('POST', `/advanced/tasks/${tk.id}/cancel`))} data-testid={`button-adv-cancel-${tk.id}`}><Ban /> {t('Cancel')}</button>}
              {editable && <button className="button button-quiet" onClick={() => setEditor({ task: tk })} data-testid={`button-adv-edit-${tk.id}`}><Pencil /> {t('Edit')}</button>}
              <button className="button button-quiet" onClick={() => setSelected(tk.id)} data-testid={`button-adv-results-${tk.id}`}>{t('Results')}</button>
              {tk.status !== 'Running' && <button className="button button-quiet" disabled={busy === tk.id} onClick={() => setDelFor(tk)} data-testid={`button-adv-delete-${tk.id}`}><Trash2 /> {t('Delete')}</button>}
            </div></article>; })}</div>}
    </section>
    <ResultsTable results={suite.results} tasks={suite.tasks} kinds={def.results} selectedTask={selected} onSelectTask={setSelected} onDelete={async id => { await perform('DELETE', `/advanced/results/${id}`); }} />
    {needsConn && <SmtpPanel connections={suite.connections} perform={perform} />}
    {module === 'multi-platform' && <TelegramPanel connections={suite.connections} perform={perform} />}
    {editor && <TaskEditor kinds={def.kinds} task={editor.task} accounts={accounts} media={media} onSave={save} onClose={() => setEditor(null)} />}
    {runFor && <div className="dialog-backdrop" onKeyDown={e => { if (e.key === 'Escape') setRunFor(null); }}><div className="dialog" role="alertdialog" aria-modal="true" aria-label={t('Approve run')} data-testid="dialog-adv-run">
      <div className="dialog-header"><div><h2>{t('Approve “{name}”', { name: runFor.name })}</h2><p>{runFor.scheduledAt ? t('This will be scheduled for {time}, while the app is open.', { time: when(runFor.scheduledAt, locale) }) : t('This starts now.')}</p></div></div>
      <div className="dialog-form"><label className="check-row" style={{ marginTop: 0 }}><input type="checkbox" autoFocus checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="check-adv-run-consent" />{t(KINDS[runFor.kind].consent)} {t('I understand uncertain sends are not retried automatically.')}</label>
        <div className="form-actions"><button className="button button-secondary" onClick={() => setRunFor(null)}>{t('Cancel')}</button><button className="button button-primary" disabled={!consent || busy === runFor.id} onClick={() => void act(runFor.id, () => perform('POST', `/advanced/tasks/${runFor.id}/run`, { approved: true }), () => setRunFor(null))} data-testid="button-adv-run-confirm">{busy === runFor.id ? t('Starting…') : t('Approve and run')}</button></div></div></div></div>}
    {delFor && <div className="dialog-backdrop" onKeyDown={e => { if (e.key === 'Escape') setDelFor(null); }}><div className="dialog" role="alertdialog" aria-modal="true" aria-label={t('Delete task')}><div className="dialog-header"><div><h2>{t('Delete {name}?', { name: delFor.name })}</h2><p>{t('The task record is removed. Saved results stay until you delete them.')}</p></div></div>
      <div className="dialog-form"><div className="form-actions" style={{ marginTop: 0 }}><button autoFocus className="button button-secondary" onClick={() => setDelFor(null)}>{t('Keep')}</button><button className="button button-primary" onClick={() => void act(delFor.id, () => perform('DELETE', `/advanced/tasks/${delFor.id}`), () => setDelFor(null))} data-testid="button-adv-delete-confirm">{t('Delete task')}</button></div></div></div></div>}
  </main>;
}
