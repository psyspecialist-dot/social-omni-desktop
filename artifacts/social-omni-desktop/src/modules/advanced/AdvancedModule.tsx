import { useEffect, useState } from 'react';
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
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  if (!at) return null;
  const s = Math.round((new Date(at).getTime() - now) / 1000);
  if (Number.isNaN(s)) return null;
  return <span className="adv-mono"> · next {s > 0 ? `in ${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : 'now'} ({when(at)})</span>;
}

export default function AdvancedModule({ module, advanced, accounts, media, perform }: Props) {
  const suite = advanced || EMPTY;
  const def = MODULES[module];
  const tasks = suite.tasks.filter(t => def.kinds.includes(t.kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [editor, setEditor] = useState<{ task?: AdvancedTask } | null>(null);
  const [runFor, setRunFor] = useState<AdvancedTask | null>(null);
  const [delFor, setDelFor] = useState<AdvancedTask | null>(null);
  const [consent, setConsent] = useState(false);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const running = suite.tasks.some(t => ['Queued', 'Running'].includes(t.status));
  const save = async (input: AdvancedTaskInput, id?: string) => { await perform(id ? 'PATCH' : 'POST', id ? `/advanced/tasks/${id}` : '/advanced/tasks', input); setEditor(null); };
  const act = async (key: string, fn: () => Promise<unknown>, done?: () => void) => { setBusy(key); setErr(''); try { await fn(); done?.(); } catch (e) { setErr(msg(e)); } finally { setBusy(''); } };
  const needsConn = module === 'email' ? 'smtp' : null;
  return <main className="page wa adv" data-testid={`page-adv-${module}`}>
    <div className="page-heading"><div><div className="eyebrow">{def.eyebrow}</div><h1>{def.title}</h1><p className="heading-sub">{def.sub}</p></div>
      <button className="button button-primary" onClick={() => setEditor({})} data-testid="button-adv-new"><Plus /> New task</button></div>
    {!isDesktop && <div className="wa-banner warn" role="note"><AlertTriangle /><div>{NATIVE_NOTE}</div></div>}
    <div className="wa-banner info" role="note"><Info /><div>Every run asks for your explicit consent and authorization. Uncertain sends are never retried automatically; check the destination before running again.</div></div>
    {module === 'email' && <div className="wa-banner warn" role="note"><AlertTriangle /><div>Configure and test SMTP before sending. &ldquo;Accepted by the server&rdquo; is not &ldquo;delivered&rdquo;. The address checker verifies format and domain MX only: a ready domain still leaves the mailbox Unknown, and nothing here guarantees deliverability or prevents bounces. Messages are plain text; HTML and rich text are not supported.</div></div>}
    {module === 'extractors' && <div className="wa-banner info" role="note"><Info /><div>Invalid addresses are excluded from clean exports. Valid domains show &ldquo;Domain ready&rdquo; and the mailbox status is Unknown. B2B fields are read from real sites; anything not found stays blank.</div></div>}
    {module === 'multi-platform' && <div className="wa-banner info" role="note"><Info /><div>Telegram member export lists IDs, usernames and names from one group you administer. No emails or phones are returned, and members are not added to any outreach list. Instagram supports only your own feed image post.</div></div>}
    {err && <p className="wa-err" role="alert" data-testid="error-adv">{err}</p>}
    <section className="wa-card" aria-label="Tasks" data-testid="panel-adv-tasks">
      <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ margin: 0 }}>Tasks <span className="mono-tag">{tasks.length}</span></h2>{running && <span className="wa-chip blue">One task at a time</span>}</div>
      {!tasks.length ? <div className="empty-state"><div className="empty-symbol"><Plus /></div><b>No tasks yet</b><p>Create a draft, review it, then approve a run or a schedule.</p><button className="button button-primary" onClick={() => setEditor({})}>New task</button></div>
        : <div className="adv-tasks">{tasks.map(t => {
          const live = ACTIVE.includes(t.status);
          const editable = ['Draft', 'Scheduled'].includes(t.status);
          return <article key={t.id} className="adv-task" data-testid={`row-adv-task-${t.id}`}>
            <div className="adv-task-main"><div><strong>{t.name}</strong><span className="adv-sub">{KINDS[t.kind].label}{t.query ? ` · ${t.query}` : ''}{t.scheduledAt ? ` · ${when(t.scheduledAt)}` : ''}</span></div><span className={`wa-chip ${tone[t.status] || ''}`} data-testid={`status-adv-task-${t.id}`}>{t.status}</span></div>
            {(t.status === 'Running' || t.status === 'Queued' || t.progress > 0) && <><div className="adv-sub">{t.phase || 'Waiting'} · {t.completedCount}/{t.totalCount || '?'}<Countdown at={t.nextActionAt} /></div><div className="wa-prog" role="progressbar" aria-label={`${t.name} progress`} aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${t.progress}%` }} /></div></>}
            {t.status === 'Needs review' && <p className="adv-note">The app was closed when this was due, so it did not run. Review it and run again if you still want it.</p>}
            {t.error && <p className="wa-err" role="alert">{t.error}</p>}
            <div className="adv-actions">
              {(t.status === 'Draft' || t.status === 'Needs review' || t.status === 'Scheduled') && <button className="button button-primary" disabled={!isDesktop || running || busy === t.id} title={isDesktop ? '' : NATIVE_NOTE} onClick={() => { setConsent(false); setRunFor(t); }} data-testid={`button-adv-run-${t.id}`}><Play /> {t.scheduledAt && t.status !== 'Needs review' ? 'Approve' : 'Run'}</button>}
              {live && <button className="button button-secondary" disabled={busy === t.id} onClick={() => void act(t.id, () => perform('POST', `/advanced/tasks/${t.id}/cancel`))} data-testid={`button-adv-cancel-${t.id}`}><Ban /> Cancel</button>}
              {editable && <button className="button button-quiet" onClick={() => setEditor({ task: t })} data-testid={`button-adv-edit-${t.id}`}><Pencil /> Edit</button>}
              <button className="button button-quiet" onClick={() => setSelected(t.id)} data-testid={`button-adv-results-${t.id}`}>Results</button>
              {t.status !== 'Running' && <button className="button button-quiet" disabled={busy === t.id} onClick={() => setDelFor(t)} data-testid={`button-adv-delete-${t.id}`}><Trash2 /> Delete</button>}
            </div></article>; })}</div>}
    </section>
    <ResultsTable results={suite.results} tasks={suite.tasks} kinds={def.results} selectedTask={selected} onSelectTask={setSelected} onDelete={async id => { await perform('DELETE', `/advanced/results/${id}`); }} />
    {needsConn && <SmtpPanel connections={suite.connections} perform={perform} />}
    {module === 'multi-platform' && <TelegramPanel connections={suite.connections} perform={perform} />}
    {editor && <TaskEditor kinds={def.kinds} task={editor.task} accounts={accounts} media={media} onSave={save} onClose={() => setEditor(null)} />}
    {runFor && <div className="dialog-backdrop" onKeyDown={e => { if (e.key === 'Escape') setRunFor(null); }}><div className="dialog" role="alertdialog" aria-modal="true" aria-label="Approve run" data-testid="dialog-adv-run">
      <div className="dialog-header"><div><h2>Approve &ldquo;{runFor.name}&rdquo;</h2><p>{runFor.scheduledAt ? `This will be scheduled for ${when(runFor.scheduledAt)}, while the app is open.` : 'This starts now.'}</p></div></div>
      <div className="dialog-form"><label className="check-row" style={{ marginTop: 0 }}><input type="checkbox" autoFocus checked={consent} onChange={e => setConsent(e.target.checked)} data-testid="check-adv-run-consent" />{KINDS[runFor.kind].consent} I understand uncertain sends are not retried automatically.</label>
        <div className="form-actions"><button className="button button-secondary" onClick={() => setRunFor(null)}>Cancel</button><button className="button button-primary" disabled={!consent || busy === runFor.id} onClick={() => void act(runFor.id, () => perform('POST', `/advanced/tasks/${runFor.id}/run`, { approved: true }), () => setRunFor(null))} data-testid="button-adv-run-confirm">{busy === runFor.id ? 'Starting…' : 'Approve and run'}</button></div></div></div></div>}
    {delFor && <div className="dialog-backdrop" onKeyDown={e => { if (e.key === 'Escape') setDelFor(null); }}><div className="dialog" role="alertdialog" aria-modal="true" aria-label="Delete task"><div className="dialog-header"><div><h2>Delete {delFor.name}?</h2><p>The task record is removed. Saved results stay until you delete them.</p></div></div>
      <div className="dialog-form"><div className="form-actions" style={{ marginTop: 0 }}><button autoFocus className="button button-secondary" onClick={() => setDelFor(null)}>Keep</button><button className="button button-primary" onClick={() => void act(delFor.id, () => perform('DELETE', `/advanced/tasks/${delFor.id}`), () => setDelFor(null))} data-testid="button-adv-delete-confirm">Delete task</button></div></div></div></div>}
  </main>;
}
