import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Download, FileSpreadsheet, MapPin, Play, Save, Search, Square, Trash2 } from 'lucide-react';
import type { ApiState, Lead, LeadWorkspace, SimulationJob } from '@/lib/api';
import { downloadLeads } from '@/lib/lead-export';
import { isDesktop } from '@/lib/persistence';
import './leads.css';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
interface Props { leads: LeadWorkspace; jobs: SimulationJob[]; perform: Perform; onCancel: (id: string) => void }

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function Leads({ leads, jobs, perform, onCancel }: Props) {
  const [keyword, setKeyword] = useState(leads.keyword);
  const [city, setCity] = useState(leads.city);
  const [count, setCount] = useState(String(leads.targetCount));
  const touched = useRef(false);
  const [busy, setBusy] = useState<'' | 'save' | 'run' | 'clear'>('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [exportMsg, setExportMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [q, setQ] = useState('');

  // Follow saved props until the user starts editing; never clobber unsaved edits during polling.
  useEffect(() => {
    if (touched.current) return;
    setKeyword(leads.keyword); setCity(leads.city); setCount(String(leads.targetCount));
  }, [leads.keyword, leads.city, leads.targetCount]);

  const n = Number(count);
  const dirty = keyword !== leads.keyword || city !== leads.city || n !== leads.targetCount || count.trim() === '';
  const jobsOfKind = useMemo(() => jobs.filter(j => j.kind === 'leads'), [jobs]);
  const active = jobsOfKind.find(j => ['Pending', 'Running'].includes(j.status));
  const latest = active ?? jobsOfKind[0];
  const problem = !keyword.trim() ? 'Enter a niche or keyword, for example "dentist".'
    : !city.trim() ? 'Enter a city or location.'
    : !Number.isInteger(n) || n < 1 || n > 200 ? 'Target count must be a whole number from 1 to 200.' : '';

  const edit = (fn: () => void) => { touched.current = true; fn(); setOk(''); };
  const draft = () => ({ keyword: keyword.trim(), city: city.trim(), targetCount: n });

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(''); setOk('');
    // Drafts may be saved with empty text; only the count must be valid.
    if (!Number.isInteger(n) || n < 1 || n > 200) { setError('Target count must be a whole number from 1 to 200.'); return; }
    setBusy('save');
    try { await perform('PUT', '/leads', { keyword: keyword.trim(), city: city.trim(), targetCount: n }); touched.current = false; setOk(`Draft saved in ${isDesktop ? 'local' : 'preview'} SQLite.`); }
    catch (err) { setError(msg(err)); } finally { setBusy(''); }
  };
  const run = async () => {
    setError(''); setOk('');
    if (problem) { setError(problem); return; }
    setBusy('run');
    try {
      if (dirty) { await perform('PUT', '/leads', draft()); touched.current = false; }
      await perform('POST', '/jobs', { kind: 'leads' });
      setOk('Simulated extraction started.');
    } catch (err) { setError(msg(err)); } finally { setBusy(''); }
  };
  const clear = async () => {
    setError(''); setOk(''); setBusy('clear');
    try { await perform('DELETE', '/leads'); setConfirmClear(false); setOk('Saved results cleared.'); }
    catch (err) { setError(msg(err)); } finally { setBusy(''); }
  };
  const exportAs = (fmt: 'csv' | 'xlsx') => {
    try {
      downloadLeads(leads.results, fmt);
      setExportMsg({ kind: 'ok', text: `Exported ${leads.results.length} synthetic result${leads.results.length === 1 ? '' : 's'} as ${fmt.toUpperCase()}${q.trim() ? ' (all results, not only the filtered view)' : ''}.` });
    } catch (err) { setExportMsg({ kind: 'err', text: `Export failed: ${msg(err)}` }); }
  };

  const shown: Lead[] = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return leads.results;
    return leads.results.filter(l => [l.businessName, l.phoneNumber, l.address, l.website].some(v => v.toLowerCase().includes(t)));
  }, [leads.results, q]);
  const total = leads.results.length;
  const pct = latest ? Math.max(0, Math.min(100, Math.round(latest.progress))) : 0;
  const done = latest?.completedCount ?? 0, goal = latest?.totalCount ?? 0;

  return <main className="page leads-page">
    <div className="page-heading"><div><div className="eyebrow">GMB Scraper · local simulation</div><h1>Google Maps Lead Extractor</h1>
      <p className="heading-sub">Rehearse a business lead search for a niche and city. Every business below is invented.</p></div>
      <div style={{ display: 'flex', gap: 8 }}>
        {active && <button type="button" className="button button-secondary" onClick={() => onCancel(active.id)} data-testid="button-stop-leads"><Square /> Stop</button>}
        <button type="button" className="button button-primary" onClick={run} disabled={busy !== '' || Boolean(active)} data-testid="button-run-leads"><Play /> {busy === 'run' ? 'Starting…' : active ? 'Extraction in progress…' : 'Run extraction'}</button></div></div>
    <div className="ld-note" role="note"><strong>Simulation only.</strong> No requests are made to Google Maps or any real directory. Businesses, phone numbers, addresses and websites are synthetic and do not belong to real companies. {isDesktop ? 'Drafts and results are stored locally on this computer.' : 'In this hosted preview, drafts and results are stored on the preview server, not your device.'}</div>
    {error && <div className="ld-fb err" role="alert" data-testid="error-leads" style={{ marginBottom: 12 }}>{error}</div>}
    {ok && <div className="ld-fb ok" role="status" data-testid="status-leads" style={{ marginBottom: 12 }}>{ok}</div>}
    <div className="ld-grid">
      <div className="ld-stack">
        <form className="panel" onSubmit={save}>
          <div className="panel-head"><div><div className="panel-title">Search</div><div className="panel-caption">Saved as a draft in {isDesktop ? 'local SQLite' : 'preview SQLite'}</div></div><MapPin size={16} /></div>
          <div className="ld-form">
            <div className="field-group"><label className="field-label" htmlFor="ld-keyword">Niche or keyword</label>
              <input id="ld-keyword" className="field-input" value={keyword} onChange={e => edit(() => setKeyword(e.target.value))} placeholder="dentist, yoga studio, bakery" data-testid="input-lead-keyword" /></div>
            <div className="field-group"><label className="field-label" htmlFor="ld-city">City or location</label>
              <input id="ld-city" className="field-input" value={city} onChange={e => edit(() => setCity(e.target.value))} placeholder="Austin, TX" data-testid="input-lead-city" /></div>
            <div className="field-group"><label className="field-label" htmlFor="ld-count">Target count<span className="field-hint">1 to 200</span></label>
              <input id="ld-count" className="field-input" type="number" min={1} max={200} step={1} value={count} onChange={e => edit(() => setCount(e.target.value))} data-testid="input-lead-count" /></div>
            {problem && dirty === dirty && <div className="ld-fb hint" data-testid="hint-lead-problem">{problem}</div>}
            <div className="ld-actions">
              <button type="submit" className="button button-secondary" disabled={busy !== ''} data-testid="button-save-leads"><Save /> {busy === 'save' ? 'Saving…' : 'Save draft'}</button></div>
            {dirty ? <div className="ld-fb hint">Unsaved changes. Run extraction saves them first.</div> : <div className="ld-fb hint">Draft matches what is saved.</div>}
          </div>
        </form>
        <section className="panel">
          <div className="panel-head"><div><div className="panel-title">Latest run</div><div className="panel-caption">Results append to existing ones</div></div>
            {latest && <span className={`status ${latest.status === 'Completed' ? 'status-sent' : latest.status === 'Failed' ? 'status-failed' : latest.status === 'Cancelled' ? 'status-draft' : 'status-scheduled'}`} data-testid="status-lead-job">{latest.status}</span>}</div>
          {latest ? <div className="ld-job" data-testid="card-lead-job">
            <div className="ld-job-top"><b style={{ fontSize: 12 }}>{done} of {goal || '?'} found</b><span className="ld-count">{pct}%</span></div>
            <div className="ld-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
            <div className="ld-meta"><span>{latest.phase || latest.steps[latest.currentStep] || 'Queued'}</span>
              {active && latest.nextActionAt && <span>next {new Date(latest.nextActionAt).toLocaleTimeString()}</span>}</div>
          </div> : <div className="empty-state"><b>No run yet</b><p>Fill in a niche and city, then choose Run extraction.</p></div>}
        </section>
      </div>
      <section className="panel" style={{ minWidth: 0 }}>
        <div className="panel-head"><div><div className="panel-title">Results</div><div className="panel-caption" data-testid="text-lead-count">{total} saved synthetic {total === 1 ? 'lead' : 'leads'}{q.trim() ? `, ${shown.length} match the filter` : ''}</div></div>
          <span className="mono-tag">simulated</span></div>
        <div className="ld-tools">
          <div className="search-wrap"><Search /><input className="search-input" placeholder="Filter results" value={q} onChange={e => setQ(e.target.value)} aria-label="Filter results" data-testid="input-lead-filter" /></div>
          <span style={{ flex: 1 }} />
          <button type="button" className="button button-secondary" disabled={!total} onClick={() => exportAs('xlsx')} data-testid="button-export-xlsx"><FileSpreadsheet /> Export Excel (.xlsx)</button>
          <button type="button" className="button button-secondary" disabled={!total} onClick={() => exportAs('csv')} data-testid="button-export-csv"><Download /> Export CSV</button>
          <button type="button" className="button button-danger" disabled={!total || busy !== ''} onClick={() => setConfirmClear(true)} data-testid="button-clear-leads"><Trash2 /> Clear</button>
        </div>
        {(exportMsg || confirmClear) && <div style={{ padding: '0 20px 14px' }}>
          {exportMsg && <div className={`ld-fb ${exportMsg.kind}`} role={exportMsg.kind === 'err' ? 'alert' : 'status'} data-testid="status-export">{exportMsg.text}</div>}
          {confirmClear && <div className="ld-confirm" role="alertdialog" aria-label="Clear synthetic lead results">
            <b>Delete all {total} saved results?</b> This removes synthetic results only; your search draft stays. {active ? 'A run is active, so clearing will be refused until you stop it.' : 'This cannot be undone.'}
            <div className="ld-actions"><button type="button" className="button button-danger" onClick={clear} disabled={busy === 'clear'} data-testid="button-confirm-clear">{busy === 'clear' ? 'Clearing…' : 'Delete results'}</button>
              <button type="button" className="button button-secondary" onClick={() => setConfirmClear(false)}>Keep them</button></div></div>}
        </div>}
        {total === 0 ? <div className="empty-state"><div className="empty-symbol"><MapPin /></div><b>No results yet</b><p>Run an extraction to generate synthetic businesses. They are saved and kept across runs.</p></div>
          : shown.length === 0 ? <div className="empty-state"><b>No matches</b><p>Nothing matches "{q}". Exports still include all {total} results.</p></div>
          : <div className="ld-scroll"><table className="ld-table"><thead><tr><th>Business Name</th><th>Phone Number</th><th>Address</th><th>Website</th></tr></thead>
            <tbody>{shown.map(l => <tr key={l.id} data-testid={`row-lead-${l.id}`}><td className="ld-name">{l.businessName}</td><td className="ld-mono">{l.phoneNumber}</td><td>{l.address}</td><td className="ld-mono">{l.website}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  </main>;
}
