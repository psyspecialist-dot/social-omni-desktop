import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WaSuite, CrmThread, ChatbotRule, CrmThreadInput, ChatbotRuleInput, WaFilterResult } from '@workspace/api-client-react';
import type { Account, Contact } from '@/lib/workspace';
import type { ApiState, SimulationJob } from '@/lib/api';
import { isDesktop } from '@/lib/persistence';
import { importPhones, downloadFilter } from '@/lib/wa-filter-files';
import { AlertTriangle, Bot, Download, FileUp, Info, ListFilter, MessageSquare, Pencil, Play, Plus, Save, Search, Square, Trash2, UserPlus, X } from 'lucide-react';
import './wa-suite.css';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
interface Props { view: 'filter' | 'crm' | 'chatbots'; suite: WaSuite; accounts: Account[]; contacts: Contact[]; jobs: SimulationJob[]; perform: Perform }

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Request failed.');
const when = (v?: string | null) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'; };
const SESSION_NOTE = 'Live browser actions need the downloaded Social Najhin desktop app. They are disabled in this hosted preview.';

function Banner({ kind, children }: { kind: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  return <div className={`wa-banner ${kind}`} role={kind === 'bad' ? 'alert' : 'note'}>{kind === 'warn' || kind === 'bad' ? <AlertTriangle /> : <Info />}<div>{children}</div></div>;
}
function Confirm({ title, body, label, onYes, onNo, busy }: { title: string; body: string; label: string; onYes: () => void; onNo: () => void; busy?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onNo(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onNo]);
  return <div className="dialog-backdrop" onClick={onNo}><div className="dialog wa-modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
    <div className="dialog-header"><div><h2>{title}</h2><p>{body}</p></div></div>
    <div className="dialog-form"><div className="form-actions" style={{ marginTop: 0 }}>
      <button className="button button-secondary" autoFocus onClick={onNo} data-testid="button-wa-confirm-cancel">Cancel</button>
      <button className="button button-primary" disabled={busy} onClick={onYes} data-testid="button-wa-confirm-accept">{busy ? 'Working…' : label}</button></div></div></div></div>;
}
function Head({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="heading-sub">{sub}</p></div></div>;
}
function waAccounts(a: Account[]) { return a.filter(x => x.platform === 'WhatsApp'); }

/* Inbox listener controls shared by CRM and Chatbots */
function InboxControl({ accounts, jobs, perform }: { accounts: Account[]; jobs: SimulationJob[]; perform: Perform }) {
  const list = waAccounts(accounts);
  const [acc, setAcc] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const active = jobs.find(j => j.platform === 'WhatsApp' && j.action === 'inbox' && ['Pending', 'Running'].includes(j.status));
  const other = jobs.find(j => ['Pending', 'Running'].includes(j.status) && j !== active);
  const accountId = acc || list[0]?.id || '';
  const start = async () => { setBusy(true); setErr(''); try { await perform('POST', '/suite/session', { action: 'inbox', accountId, approved: true }); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  const stop = async () => { if (!active) return; setBusy(true); setErr(''); try { await perform('POST', `/jobs/${active.id}/cancel`); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  const can = isDesktop && ok && !!accountId && !other && !busy;
  return <section className="wa-card" aria-label="Inbox listener" data-testid="panel-wa-inbox">
    <div className="wa-row" style={{ justifyContent: 'space-between' }}><div><h2>Inbox listener</h2><p className="wa-sub">A visible local browser reads only the conversation you currently have open.</p></div>
      <span className={`wa-chip ${active ? 'green' : ''}`} data-testid="status-wa-inbox">{active ? `${active.status}${active.phase ? ` · ${active.phase}` : ''}` : 'Stopped'}</span></div>
    <ol className="wa-steps"><li>Start the listener and sign in to WhatsApp Web.</li><li>Open a client conversation yourself in that browser.</li><li>Record consent in CRM (opted in) for that contact.</li><li>New inbound texts after the baseline may trigger an enabled rule.</li></ol>
    <div style={{ height: 10 }} />
    {!isDesktop && <Banner kind="warn">{SESSION_NOTE}</Banner>}
    <div style={{ height: 8 }} />
    <Banner kind="info">Existing history is imported without auto-replies. Background chats are not synced, group chats never reply, and nothing is sent as cold outreach or historic replay.</Banner>
    {other && <><div style={{ height: 8 }} /><Banner kind="warn">Another {other.platform || ''} {other.action || other.kind} task is running. The queue is exclusive; stop it first.</Banner></>}
    <div className="wa-row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
      <label className="wa-lbl" style={{ margin: 0, minWidth: 190, flex: 1 }}>WhatsApp account
        <select className="field-select" style={{ width: '100%' }} value={accountId} onChange={e => setAcc(e.target.value)} disabled={!!active || !list.length} data-testid="select-wa-inbox-account">
          {!list.length && <option value="">No WhatsApp account saved</option>}{list.map(a => <option key={a.id} value={a.id}>{a.displayLabel} ({a.handle})</option>)}</select></label>
      {active ? <button className="button button-secondary wa-stop" onClick={stop} disabled={busy} data-testid="button-wa-inbox-stop"><Square /> Stop listener</button>
        : <button className="button button-primary" onClick={start} disabled={!can} data-testid="button-wa-inbox-start"><Play /> Start listener</button>}
    </div>
    <label className="check-row"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} disabled={!!active} data-testid="check-wa-inbox-consent" />I approve opening a local browser, and I will only enable replies for contacts who gave consent.</label>
    {!list.length && <p className="wa-sub" style={{ marginTop: 8 }}>Add a WhatsApp account in Accounts Manager first.</p>}
    {err && <p className="wa-err" role="alert" data-testid="error-wa-inbox">{err}</p>}
    {active && <div style={{ marginTop: 10 }}><div className="wa-sub">{active.accountName || 'Account'} · {active.steps?.[active.currentStep] || active.phase || 'listening'}{active.nextActionAt ? ` · next ${when(active.nextActionAt)}` : ''}</div><div className="wa-prog" role="progressbar" aria-valuenow={active.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${active.progress}%` }} /></div></div>}
  </section>;
}

/* ───────── Filter ───────── */
const FS = ['All', 'Active/Valid', 'Inactive', 'Unknown', 'Unverified'] as const;
const tone: Record<string, string> = { 'Active/Valid': 'green', Inactive: 'red', Unknown: 'amber', Unverified: '' };
const label: Record<string, string> = { 'Active/Valid': 'Active', Inactive: 'Inactive', Unknown: 'Unknown', Unverified: 'Unverified' };

function FilterView({ suite, accounts, jobs, perform }: Props) {
  const saved = suite.filter.source;
  const results = suite.filter.results;
  const [text, setText] = useState(saved);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<(typeof FS)[number]>('All');
  const [q, setQ] = useState('');
  const [acc, setAcc] = useState('');
  const [auth, setAuth] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [sbusy, setSbusy] = useState(false);
  useEffect(() => { if (!dirty.current) setText(saved); }, [saved]);
  const list = waAccounts(accounts);
  const accountId = acc || list[0]?.id || '';
  const job = jobs.find(j => j.platform === 'WhatsApp' && j.action === 'filter' && ['Pending', 'Running'].includes(j.status));
  const other = jobs.find(j => ['Pending', 'Running'].includes(j.status) && j !== job);
  const counts = useMemo(() => { const c: Record<string, number> = { All: results.length }; results.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; }); return c; }, [results]);
  const shown = useMemo(() => results.filter((r: WaFilterResult) => (tab === 'All' || r.status === tab) && `${r.input} ${r.phone}`.toLowerCase().includes(q.toLowerCase())), [results, tab, q]);
  const lines = text.split(/\r?\n/).filter(l => l.trim()).length;
  const over = lines > 200 || text.length > 10000;
  const doSave = async () => {
    setBusy(true); setErr(''); setNotice('');
    try { await perform('PUT', '/suite/filter', { source: text }); dirty.current = false; setConfirm(false); setNotice('List saved. Numbers are Unverified or Inactive (format) until a live check runs.'); }
    catch (e) { setErr(msg(e)); setConfirm(false); } finally { setBusy(false); }
  };
  const onFile = async (f?: File) => {
    if (!f) return; setErr('');
    try { const t = await importPhones(f); dirty.current = true; setText(p => (p.trim() ? `${p.trim()}\n${t}` : t)); setNotice(`Imported from ${f.name}. Review, then save.`); } catch (e) { setErr(msg(e)); }
  };
  const verify = async () => { setSbusy(true); setErr(''); try { await perform('POST', '/suite/session', { action: 'filter', accountId, approved: true }); } catch (e) { setErr(msg(e)); } finally { setSbusy(false); } };
  const cancel = async () => { if (!job) return; setSbusy(true); try { await perform('POST', `/jobs/${job.id}/cancel`); } catch (e) { setErr(msg(e)); } finally { setSbusy(false); } };
  const active = counts['Active/Valid'] || 0;
  const exp = (f: 'csv' | 'xlsx') => { try { downloadFilter(results, f); setNotice('Download started. Only Active records are included.'); } catch (e) { setErr(msg(e)); } };
  return <main className="page wa"><Head eyebrow="WhatsApp suite" title="Number Filter" sub="Check which numbers in a contact list you are authorized to use are registered on WhatsApp." />
    <Banner kind="warn">A number that looks correctly formatted is <b>not</b> proof it has WhatsApp. Only the live browser check can mark a number Active. No tool can guarantee account safety; checks are paced and rate-limited.</Banner>
    <div className="wa-split">
      <section className="wa-card" aria-label="Source list">
        <h2>Source list</h2><p className="wa-sub">Up to 200 numbers, one per line. Import txt, csv, or xlsx.</p><div style={{ height: 10 }} />
        <label className="wa-lbl" htmlFor="wa-src">Phone numbers <small className={over ? 'wa-err' : ''}>{lines}/200 lines</small></label>
        <textarea id="wa-src" className="field-textarea" style={{ minHeight: 190, fontFamily: 'var(--app-font-mono)' }} value={text} onChange={e => { dirty.current = true; setText(e.target.value); }} placeholder="+14155550123&#10;+442071838750" data-testid="input-wa-source" />
        <div className="wa-row" style={{ marginTop: 10 }}>
          <label className="button button-secondary" style={{ cursor: 'pointer' }}><FileUp /> Import file<input type="file" accept=".txt,.csv,.xlsx" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-wa-file" /></label>
          <button className="button button-primary" disabled={busy || over || !text.trim()} onClick={() => (results.length ? setConfirm(true) : void doSave())} data-testid="button-wa-save-source"><Save /> {busy ? 'Saving…' : 'Save list'}</button>
          {dirty.current && text !== saved && <span className="wa-chip amber">Unsaved</span>}
        </div>
        {over && <p className="wa-err" role="alert">Limit is 200 numbers and 10,000 characters.</p>}
        {err && <p className="wa-err" role="alert" data-testid="error-wa-filter">{err}</p>}
        {notice && <p className="wa-sub" role="status" style={{ marginTop: 8 }} data-testid="status-wa-filter-notice">{notice}</p>}
      </section>
      <section className="wa-card" aria-label="Live verification">
        <h2>Live verification</h2><p className="wa-sub">Opens a visible browser and checks saved numbers one at a time.</p><div style={{ height: 10 }} />
        {!isDesktop && <Banner kind="warn">{SESSION_NOTE} Verification is backend-only and never runs from this page.</Banner>}
        {other && <><div style={{ height: 8 }} /><Banner kind="warn">Another task is running; the queue is exclusive.</Banner></>}
        <div style={{ height: 10 }} />
        <label className="wa-lbl">WhatsApp account<select className="field-select" style={{ width: '100%' }} value={accountId} onChange={e => setAcc(e.target.value)} disabled={!list.length || !!job} data-testid="select-wa-filter-account">{!list.length && <option value="">No WhatsApp account saved</option>}{list.map(a => <option key={a.id} value={a.id}>{a.displayLabel}</option>)}</select></label>
        <label className="check-row"><input type="checkbox" checked={auth} onChange={e => setAuth(e.target.checked)} data-testid="check-wa-authorized" />I am authorized to use this contact list.</label>
        <label className="check-row"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} data-testid="check-wa-reviewed" />I reviewed the saved source above ({results.length} checked entries).</label>
        <div className="wa-row" style={{ marginTop: 12 }}>
          {job ? <button className="button button-secondary" onClick={cancel} disabled={sbusy} data-testid="button-wa-filter-stop"><Square /> Stop check</button>
            : <button className="button button-primary" onClick={verify} disabled={!isDesktop || !auth || !reviewed || !accountId || !results.length || !!other || sbusy || (dirty.current && text !== saved)} data-testid="button-wa-filter-start"><Play /> Start live check</button>}
        </div>
        {dirty.current && text !== saved && <p className="wa-sub" style={{ marginTop: 8 }}>Save your edits before verifying.</p>}
        {job && <div style={{ marginTop: 10 }}><div className="wa-sub">{job.phase || job.steps?.[job.currentStep] || 'Checking'} · {job.completedCount ?? 0}/{job.totalCount ?? '?'}{job.nextActionAt ? ` · next ${when(job.nextActionAt)}` : ''}</div><div className="wa-prog" role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${job.progress}%` }} /></div></div>}
      </section>
    </div>
    <section className="wa-card" aria-label="Results" data-testid="panel-wa-results">
      <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="wa-tabs" role="group" aria-label="Filter by status">{FS.map(s => <button key={s} className="wa-tab" aria-pressed={tab === s} onClick={() => setTab(s)} data-testid={`tab-wa-${s.replace('/', '-').toLowerCase()}`}>{s === 'All' ? 'All' : label[s]}<b>{counts[s] || 0}</b></button>)}</div>
        <div className="wa-row"><div className="search-wrap" style={{ minWidth: 170 }}><Search /><input className="search-input" placeholder="Search numbers" aria-label="Search results" value={q} onChange={e => setQ(e.target.value)} data-testid="input-wa-search" /></div>
          <button className="button button-secondary" disabled={!active} onClick={() => exp('csv')} title={active ? '' : 'No Active numbers to export'} data-testid="button-wa-export-csv"><Download /> CSV</button>
          <button className="button button-secondary" disabled={!active} onClick={() => exp('xlsx')} title={active ? '' : 'No Active numbers to export'} data-testid="button-wa-export-xlsx"><Download /> Excel</button></div></div>
      {!results.length ? <div className="empty-state"><div className="empty-symbol"><ListFilter /></div><b>No numbers saved yet</b><p>Paste or import a list above and save it. Exports include Active numbers only.</p></div>
        : !shown.length ? <div className="empty-state"><b>No matching numbers</b><p>Change the status tab or search.</p></div>
          : <div className="wa-list" role="list">{shown.map(r => <div className="wa-item" role="listitem" key={r.id} style={{ cursor: 'default' }} data-testid={`row-wa-result-${r.id}`}>
            <div style={{ minWidth: 0 }}><strong style={{ fontFamily: 'var(--app-font-mono)' }}>{r.phone || r.input}</strong><span className="m">{r.reason}{r.checkedAt ? ` · ${when(r.checkedAt)}` : ''}</span></div>
            <span className={`wa-chip ${tone[r.status]}`}>{label[r.status]}</span></div>)}</div>}
    </section>
    {confirm && <Confirm title="Replace existing checks?" body="Saving a new list discards the previous results. Numbers will return to Unverified or Inactive until checked again." label="Replace and save" busy={busy} onYes={() => void doSave()} onNo={() => setConfirm(false)} />}
  </main>;
}

/* ───────── CRM ───────── */
const STATUSES: CrmThreadInput['status'][] = ['New', 'Follow-up', 'Closed/Won', 'Urgent'];
const sTone: Record<string, string> = { New: 'blue', 'Follow-up': 'amber', 'Closed/Won': 'green', Urgent: 'red' };
const blank: CrmThreadInput = { name: '', phone: '', status: 'New', notes: '', optedIn: false };
const mTone: Record<string, string> = { Received: 'blue', Accepted: 'green', Unconfirmed: 'amber' };

function CrmView({ suite, accounts, contacts, jobs, perform }: Props) {
  const threads = suite.threads;
  const [q, setQ] = useState('');
  const [sf, setSf] = useState('All');
  const [sel, setSel] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<CrmThreadInput>(blank);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [del, setDel] = useState<CrmThread | null>(null);
  const [imp, setImp] = useState(false);
  const thread = threads.find(t => t.id === sel);
  const loaded = useRef<string | null>(null);
  const consentTouched = useRef(false);
  useEffect(() => {
    if (!sel || sel === 'new') return;
    if ((loaded.current !== sel || !dirty) && thread) { loaded.current = sel; setForm({ name: thread.name, phone: thread.phone, status: thread.status, notes: thread.notes, optedIn: thread.optedIn }); setDirty(false); }
    else if (thread && !consentTouched.current) setForm(f => ({ ...f, optedIn: thread.optedIn }));
  }, [sel, thread, dirty]);
  const pick = (id: string | 'new') => { if (dirty && !window.confirm('Discard unsaved changes?')) return; loaded.current = null; consentTouched.current = false; setErr(''); setSel(id); if (id === 'new') { setForm(blank); setDirty(false); } };
  const set = <K extends keyof CrmThreadInput>(k: K, v: CrmThreadInput[K]) => { if (k === 'optedIn') consentTouched.current = true; setDirty(true); setForm(f => ({ ...f, [k]: v })); };
  const list = threads.filter(t => (sf === 'All' || t.status === sf) && `${t.name} ${t.phone}`.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    if (!form.name.trim() && !form.phone.trim()) { setErr('Enter a name or phone number.'); return; }
    setBusy(true); setErr('');
    try { await perform(sel === 'new' ? 'POST' : 'PATCH', sel === 'new' ? '/suite/threads' : `/suite/threads/${sel}`, { ...form, consentChanged: sel === 'new' || consentTouched.current }); consentTouched.current = false; setDirty(false); if (sel === 'new') { setSel(null); setForm(blank); } }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const remove = async () => { if (!del) return; setBusy(true); try { await perform('DELETE', `/suite/threads/${del.id}`); if (sel === del.id) { setSel(null); setDirty(false); } setDel(null); } catch (e) { setErr(msg(e)); setDel(null); } finally { setBusy(false); } };
  const importable = contacts.filter(c => c.channel === 'Phone' && !threads.some(t => t.phone.replace(/\D/g, '') === c.value.replace(/\D/g, '')));
  const importAll = async () => {
    setBusy(true); setErr('');
    try { for (const c of importable) await perform('POST', '/suite/threads', { name: c.name, phone: c.value, status: 'New', notes: '', optedIn: c.optedIn } satisfies CrmThreadInput); setImp(false); }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  return <main className="page wa"><Head eyebrow="WhatsApp suite" title="Client CRM" sub="Conversations, notes, status and consent in one local record." />
    <InboxControl accounts={accounts} jobs={jobs} perform={perform} />
    <div className="wa-crm">
      <section className="wa-card" aria-label="Chats">
        <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ margin: 0 }}>Chats <span className="mono-tag">{threads.length}</span></h2>
          <div className="wa-row"><button className="button button-secondary" onClick={() => setImp(true)} data-testid="button-wa-import-contacts"><UserPlus /> Import</button><button className="button button-primary" onClick={() => pick('new')} data-testid="button-wa-new-thread"><Plus /> Add</button></div></div>
        <div className="search-wrap" style={{ maxWidth: 'none', marginBottom: 8 }}><Search /><input className="search-input" placeholder="Search name or phone" aria-label="Search chats" value={q} onChange={e => setQ(e.target.value)} data-testid="input-wa-crm-search" /></div>
        <div className="wa-tabs" style={{ marginBottom: 8 }}>{['All', ...STATUSES].map(s => <button key={s} className="wa-tab" aria-pressed={sf === s} onClick={() => setSf(s)}>{s}</button>)}</div>
        {!threads.length ? <div className="empty-state"><div className="empty-symbol"><MessageSquare /></div><b>No client records</b><p>Add a record, import phone contacts, or let the listener create chats from open conversations.</p></div>
          : !list.length ? <div className="empty-state"><b>No matches</b></div>
            : <div className="wa-list">{list.map(t => <button key={t.id} className="wa-item" aria-current={sel === t.id} onClick={() => pick(t.id)} data-testid={`row-wa-thread-${t.id}`}>
              <div style={{ minWidth: 0 }}><strong>{t.name || t.phone}</strong><span className="m">{t.phone} · {t.messages.length} msg · {when(t.updatedAt)}</span></div>
              <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}><span className={`wa-chip ${sTone[t.status]}`}>{t.status}</span><span className={`wa-chip ${t.optedIn ? 'green' : ''}`}>{t.optedIn ? 'Consent' : 'No consent'}</span></div></button>)}</div>}
      </section>
      <section className="wa-card" aria-label="Record editor">
        {!sel ? <div className="empty-state"><div className="empty-symbol"><MessageSquare /></div><b>Select a chat</b><p>Pick a record to read messages and edit notes, status and consent.</p></div> : <>
          <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ margin: 0 }}>{sel === 'new' ? 'New record' : thread?.name || 'Record'}</h2>
            <div className="wa-row">{thread && <button className="button button-danger" onClick={() => setDel(thread)} data-testid="button-wa-delete-thread"><Trash2 /> Delete</button>}<button className="small-icon" aria-label="Close editor" onClick={() => { setSel(null); setDirty(false); }}><X /></button></div></div>
          {thread && <>{thread.contactId && <p className="wa-sub" style={{ marginBottom: 8 }}>Linked to a local contact automatically.</p>}
            {thread.messages.length ? <div className="wa-msgs" role="log" aria-label="Messages" tabIndex={0}>{thread.messages.map(m => <div key={m.id} className={`wa-msg ${m.direction === 'outgoing' ? 'out' : ''} ${m.status === 'Unconfirmed' ? 'unc' : ''}`}>{m.text}<footer><span>{when(m.timestamp)}</span><span className={`wa-chip ${mTone[m.status]}`}>{m.status}</span>{m.ruleId && <span>auto-rule</span>}</footer></div>)}</div>
              : <p className="wa-sub">No messages synced. Open this conversation in the listener browser to import it.</p>}
            {thread.messages.some(m => m.status === 'Unconfirmed') && <div style={{ marginTop: 8 }}><Banner kind="warn">An Unconfirmed message may or may not have been sent. Check WhatsApp before retrying to avoid duplicates.</Banner></div>}
            <div style={{ height: 12 }} /></>}
          <div className="wa-grid2"><label className="wa-lbl">Name<input className="field-input" maxLength={150} value={form.name} onChange={e => set('name', e.target.value)} data-testid="input-wa-thread-name" /></label>
            <label className="wa-lbl">Phone<input className="field-input" maxLength={30} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+14155550123" data-testid="input-wa-thread-phone" /></label></div>
          <label className="wa-lbl">Status<select className="field-select" style={{ width: '100%' }} value={form.status} onChange={e => set('status', e.target.value as CrmThreadInput['status'])} data-testid="select-wa-thread-status">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="wa-lbl">Notes &amp; tags <small>{form.notes.length}/10000</small><textarea className="field-textarea" maxLength={10000} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="#vip prefers evenings…" data-testid="input-wa-thread-notes" /></label>
          <label className="check-row"><input type="checkbox" checked={form.optedIn} onChange={e => set('optedIn', e.target.checked)} data-testid="check-wa-thread-consent" />Opted in. This contact consented to automatic replies. Required for chatbot rules.</label>
          {err && <p className="wa-err" role="alert" data-testid="error-wa-crm">{err}</p>}
          <div className="form-actions"><button className="button button-primary" onClick={save} disabled={busy || (sel !== 'new' && !dirty)} data-testid="button-wa-save-thread"><Save /> {busy ? 'Saving…' : sel === 'new' ? 'Add record' : 'Save changes'}</button></div></>}
      </section>
    </div>
    {del && <Confirm title={`Delete ${del.name || del.phone}?`} body="This removes the chat record, its notes and message history. A linked contact in Contacts is kept." label="Delete record" busy={busy} onYes={() => void remove()} onNo={() => setDel(null)} />}
    {imp && <Confirm title="Import phone contacts" body={importable.length ? `Create ${importable.length} CRM record(s) from saved phone contacts. Consent flags are copied from the contact.` : 'All saved phone contacts already have CRM records, or none exist.'} label={importable.length ? `Import ${importable.length}` : 'Close'} busy={busy} onYes={() => (importable.length ? void importAll() : setImp(false))} onNo={() => setImp(false)} />}
  </main>;
}

/* ───────── Chatbots ───────── */
const blankRule: ChatbotRuleInput = { name: '', keyword: '', match: 'contains', template: '', enabled: true, delayMin: 3, delayMax: 6, cooldownMinutes: 5 };
function validateRule(r: ChatbotRuleInput) {
  if (!r.name.trim()) return 'Name is required.';
  if (!r.keyword.trim()) return 'Keyword is required.';
  if (!r.template.trim()) return 'Reply template is required.';
  if (![r.delayMin, r.delayMax].every(n => Number.isInteger(n) && n >= 3 && n <= 8)) return 'Delay must be whole seconds from 3 to 8.';
  if (r.delayMax < r.delayMin) return 'Maximum delay must be at least the minimum.';
  if (!Number.isInteger(r.cooldownMinutes) || r.cooldownMinutes < 1 || r.cooldownMinutes > 1440) return 'Cooldown must be 1 to 1440 minutes.';
  return '';
}
function ChatbotsView({ suite, accounts, jobs, perform }: Props) {
  const rules = suite.rules;
  const [sel, setSel] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<ChatbotRuleInput>(blankRule);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [del, setDel] = useState<ChatbotRule | null>(null);
  const [probe, setProbe] = useState('');
  const loaded = useRef<string | null>(null);
  const rule = rules.find(r => r.id === sel);
  const enabledTouched = useRef(false);
  useEffect(() => {
    if (sel && sel !== 'new' && rule && (loaded.current !== sel || !dirty)) { loaded.current = sel; const { id: _i, createdAt: _c, ...rest } = rule; setForm(rest); setDirty(false); }
    else if (rule && !enabledTouched.current) setForm(f => ({ ...f, enabled: rule.enabled }));
  }, [sel, rule, dirty]);
  const open = (id: string | 'new') => { if (dirty && !window.confirm('Discard unsaved changes?')) return; loaded.current = null; enabledTouched.current = false; setErr(''); setSel(id); if (id === 'new') { setForm(blankRule); setDirty(false); } };
  const set = <K extends keyof ChatbotRuleInput>(k: K, v: ChatbotRuleInput[K]) => { if (k === 'enabled') enabledTouched.current = true; setDirty(true); setForm(f => ({ ...f, [k]: v })); };
  const num = (k: 'delayMin' | 'delayMax' | 'cooldownMinutes') => (e: { target: { value: string } }) => set(k, e.target.value === '' ? NaN : Number(e.target.value));
  const problem = validateRule(form);
  const save = async () => {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr('');
    try { await perform(sel === 'new' ? 'POST' : 'PATCH', sel === 'new' ? '/suite/rules' : `/suite/rules/${sel}`, { ...form, enabledChanged: sel === 'new' || enabledTouched.current }); enabledTouched.current = false; setDirty(false); if (sel === 'new') { setSel(null); } }
    catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const toggle = async (r: ChatbotRule) => { const { id: _i, createdAt: _c, ...rest } = r; try { await perform('PATCH', `/suite/rules/${r.id}`, { ...rest, enabled: !r.enabled, enabledChanged: true }); } catch (e) { setErr(msg(e)); } };
  const remove = async () => { if (!del) return; setBusy(true); try { await perform('DELETE', `/suite/rules/${del.id}`); if (sel === del.id) { setSel(null); setDirty(false); } setDel(null); } catch (e) { setErr(msg(e)); setDel(null); } finally { setBusy(false); } };
  const kw = form.keyword.trim().toLowerCase(); const p = probe.trim().toLowerCase();
  const hit = !!kw && !!p && (form.match === 'exact' ? p === kw : p.includes(kw));
  const sorted = [...rules].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <main className="page wa"><Head eyebrow="WhatsApp suite" title="Chatbots" sub="Keyword auto-replies for opted-in, direct conversations only." />
    <InboxControl accounts={accounts} jobs={jobs} perform={perform} />
    <Banner kind="info">Newest enabled rules are checked first and only one reply goes out per incoming message. Matching ignores case. Opt-out and per-contact cooldown protect your contacts. {'{{name}}'} is optional in templates.</Banner>
    <div className="wa-crm">
      <section className="wa-card" aria-label="Rules">
        <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ margin: 0 }}>Rules <span className="mono-tag">{rules.length}</span></h2><button className="button button-primary" onClick={() => open('new')} data-testid="button-wa-new-rule"><Plus /> New rule</button></div>
        {!rules.length ? <div className="empty-state"><div className="empty-symbol"><Bot /></div><b>No rules yet</b><p>Create a keyword rule, for example “price” answering with your price list.</p></div>
          : <div className="wa-list">{sorted.map(r => <div key={r.id} className="wa-item" aria-current={sel === r.id} data-testid={`row-wa-rule-${r.id}`}>
            <button style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => open(r.id)} aria-label={`Edit ${r.name}`}><strong>{r.name}</strong><span className="m">{r.match} “{r.keyword}” · {r.delayMin}-{r.delayMax}s · {r.cooldownMinutes}m cooldown</span></button>
            <span className={`wa-chip ${r.enabled ? 'green' : ''}`}>{r.enabled ? 'On' : 'Off'}</span>
            <button className="small-icon" onClick={() => void toggle(r)} aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`} title={r.enabled ? 'Disable' : 'Enable'} data-testid={`button-wa-toggle-${r.id}`}>{r.enabled ? <Square /> : <Play />}</button>
            <button className="small-icon" onClick={() => open(r.id)} aria-label={`Edit ${r.name}`}><Pencil /></button>
            <button className="small-icon" onClick={() => setDel(r)} aria-label={`Delete ${r.name}`} data-testid={`button-wa-delete-rule-${r.id}`}><Trash2 /></button></div>)}</div>}
      </section>
      <section className="wa-card" aria-label="Rule editor">
        {!sel ? <div className="empty-state"><div className="empty-symbol"><Bot /></div><b>Select or create a rule</b><p>Rules never start conversations. They only answer new inbound messages.</p></div> : <>
          <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}><h2 style={{ margin: 0 }}>{sel === 'new' ? 'New rule' : 'Edit rule'}</h2><button className="small-icon" aria-label="Close editor" onClick={() => { setSel(null); setDirty(false); }}><X /></button></div>
          <div className="wa-grid2"><label className="wa-lbl">Name<input className="field-input" maxLength={100} value={form.name} onChange={e => set('name', e.target.value)} data-testid="input-wa-rule-name" /></label>
            <label className="wa-lbl">Keyword<input className="field-input" maxLength={200} value={form.keyword} onChange={e => set('keyword', e.target.value)} data-testid="input-wa-rule-keyword" /></label></div>
          <label className="wa-lbl">Match<select className="field-select" style={{ width: '100%' }} value={form.match} onChange={e => set('match', e.target.value as ChatbotRuleInput['match'])} data-testid="select-wa-rule-match"><option value="contains">Contains keyword</option><option value="exact">Exact message</option></select></label>
          <label className="wa-lbl">Reply template <small>{form.template.length}/2000</small><textarea className="field-textarea" maxLength={2000} value={form.template} onChange={e => set('template', e.target.value)} placeholder="Hi {{name}}, thanks for asking…" data-testid="input-wa-rule-template" /></label>
          <div className="wa-grid3"><label className="wa-lbl">Delay min (s)<input type="number" min={3} max={8} className="field-input" value={Number.isNaN(form.delayMin) ? '' : form.delayMin} onChange={num('delayMin')} data-testid="input-wa-rule-dmin" /></label>
            <label className="wa-lbl">Delay max (s)<input type="number" min={3} max={8} className="field-input" value={Number.isNaN(form.delayMax) ? '' : form.delayMax} onChange={num('delayMax')} data-testid="input-wa-rule-dmax" /></label>
            <label className="wa-lbl">Cooldown (min)<input type="number" min={1} max={1440} className="field-input" value={Number.isNaN(form.cooldownMinutes) ? '' : form.cooldownMinutes} onChange={num('cooldownMinutes')} data-testid="input-wa-rule-cooldown" /></label></div>
          <label className="check-row" style={{ marginTop: 0 }}><input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} data-testid="check-wa-rule-enabled" />Enabled</label>
          <div className="wa-card" style={{ marginTop: 12, background: 'hsl(var(--muted))' }}><h2>Test preview <span className="wa-sub">(nothing is sent)</span></h2>
            <input className="field-input" aria-label="Sample incoming message" placeholder="Type a sample incoming message" value={probe} onChange={e => setProbe(e.target.value)} data-testid="input-wa-rule-probe" />
            {p && <p className="wa-sub" style={{ marginTop: 8 }} role="status" data-testid="text-wa-rule-preview">{hit ? <><span className="wa-chip green">Match</span> {form.template.replace(/\{\{name\}\}/g, 'Sample Client') || '(empty template)'}</> : <span className="wa-chip">No match</span>}</p>}</div>
          {(err || (dirty && problem)) && <p className="wa-err" role="alert" style={{ marginTop: 8 }} data-testid="error-wa-rule">{err || problem}</p>}
          <div className="form-actions"><button className="button button-primary" onClick={save} disabled={busy || !!problem || (sel !== 'new' && !dirty)} data-testid="button-wa-save-rule"><Save /> {busy ? 'Saving…' : sel === 'new' ? 'Create rule' : 'Save rule'}</button></div></>}
      </section>
    </div>
    {del && <Confirm title={`Delete “${del.name}”?`} body="This rule stops replying immediately. Past messages sent by it remain in chat history." label="Delete rule" busy={busy} onYes={() => void remove()} onNo={() => setDel(null)} />}
  </main>;
}

export default function WhatsAppSuite(props: Props) {
  if (!props.suite) return <main className="page wa" aria-busy="true"><div className="wa-skel" /><div className="wa-skel" /><div className="wa-skel" /></main>;
  if (props.view === 'filter') return <FilterView {...props} />;
  if (props.view === 'crm') return <CrmView {...props} />;
  return <ChatbotsView {...props} />;
}
