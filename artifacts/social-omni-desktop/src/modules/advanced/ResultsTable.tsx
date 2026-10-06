import { useMemo, useState } from 'react';
import type { AdvancedResult, AdvancedTask } from '@workspace/api-client-react';
import { downloadAdvancedResults } from '@/lib/advanced-export';
import { Download, Search, Trash2 } from 'lucide-react';
import { KINDS, msg, when, type Kind } from './config';

interface Props { results: AdvancedResult[]; tasks: AdvancedTask[]; kinds: Kind[]; selectedTask: string; onSelectTask: (id: string) => void; onDelete: (id: string) => Promise<void> }
export default function ResultsTable({ results, tasks, kinds, selectedTask, onSelectTask, onDelete }: Props) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const shown = useMemo(() => results.filter(r => kinds.includes(r.kind as Kind) && (kind === 'all' || r.kind === kind) && (!selectedTask || r.taskId === selectedTask)
    && `${r.name} ${r.phone} ${r.email} ${r.address} ${r.website} ${r.status} ${r.reason}`.toLowerCase().includes(q.toLowerCase())), [results, kinds, kind, selectedTask, q]);
  const exportable = shown.filter(r => r.kind !== 'verify-email' || r.status !== 'Invalid');
  const exp = (f: 'csv' | 'xlsx') => { try { downloadAdvancedResults(exportable, f, kinds[0] === 'maps' ? 'extracted-data' : 'results'); setErr(''); } catch (e) { setErr(msg(e)); } };
  const del = async (id: string) => { setBusy(id); try { await onDelete(id); } catch (e) { setErr(msg(e)); } finally { setBusy(''); } };
  const scoped = tasks.filter(t => kinds.includes(t.kind));
  return <section className="wa-card" aria-label="Results" data-testid="panel-adv-results">
    <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
      <div><h2 style={{ margin: 0 }}>Results <span className="mono-tag">{shown.length}</span></h2><p className="wa-sub">Cells starting with = + - or @ are prefixed with an apostrophe in exports so spreadsheets never run them.</p></div>
       <div className="wa-row"><button className="button button-secondary" disabled={!exportable.length} onClick={() => exp('csv')} data-testid="button-adv-export-csv"><Download /> CSV</button><button className="button button-secondary" disabled={!exportable.length} onClick={() => exp('xlsx')} data-testid="button-adv-export-xlsx"><Download /> Excel</button></div></div>
    {shown.some(r => r.kind === 'verify-email') && <p className="wa-sub">Invalid email rows are excluded from exports. Unknown outcomes stay flagged, not assumed deliverable.</p>}
    <div className="toolbar"><div className="search-wrap"><Search /><input className="search-input" placeholder="Search results" aria-label="Search results" value={q} onChange={e => setQ(e.target.value)} data-testid="input-adv-search" /></div>
      <select className="field-select" value={kind} onChange={e => setKind(e.target.value)} aria-label="Filter by module" data-testid="select-adv-result-kind"><option value="all">All types</option>{kinds.map(k => <option key={k} value={k}>{KINDS[k].label}</option>)}</select>
      <select className="field-select" value={selectedTask} onChange={e => onSelectTask(e.target.value)} aria-label="Filter by task" data-testid="select-adv-result-task"><option value="">All tasks</option>{scoped.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    {err && <p className="wa-err" role="alert">{err}</p>}
    {!shown.length ? <div className="empty-state"><b>No results yet</b><p>Completed tasks list what they found here. Export covers what you see now.</p></div>
      : <div className="adv-table-wrap"><table className="adv-table"><thead><tr><th>Type</th><th>Name</th><th>Phone</th><th>Email</th><th>Website</th><th>Address</th><th>Status</th><th>Added</th><th><span className="sr-only">Delete</span></th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.id} data-testid={`row-adv-result-${r.id}`}><td>{r.kind}</td><td>{r.name || '—'}</td><td className="adv-mono">{r.phone || '—'}</td><td className="adv-mono">{r.email || '—'}</td><td className="adv-mono">{r.website || '—'}</td><td>{r.address || '—'}</td><td><span className="wa-chip" title={r.reason}>{r.status}</span>{r.reason && <div className="adv-reason">{r.reason}</div>}</td><td>{when(r.createdAt)}</td>
          <td><button className="small-icon" aria-label={`Delete result ${r.name || r.email || r.id}`} disabled={busy === r.id} onClick={() => void del(r.id)} data-testid={`button-adv-delete-result-${r.id}`}><Trash2 /></button></td></tr>)}</tbody></table></div>}
  </section>;
}
