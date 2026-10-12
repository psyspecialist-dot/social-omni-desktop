import { useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import type { AdvancedResult, AdvancedTask } from '@workspace/api-client-react';
import { downloadAdvancedResults } from '@/lib/advanced-export';
import { smsStatusLabel } from '@/lib/sms';
import { Download, RefreshCw, Search, Trash2 } from 'lucide-react';
import { KINDS, msg, normalizeGroupUrl, safePermalink, when, type Kind } from './config';

interface Props { results: AdvancedResult[]; tasks: AdvancedTask[]; kinds: Kind[]; selectedTask: string; onSelectTask: (id: string) => void; onDelete: (id: string) => Promise<void>; onRefresh?: (id: string) => Promise<void>; refreshDisabled?: boolean; onHandoff?: (kind: 'facebook-join' | 'facebook-post', urls: string[], taskId: string) => void }
export default function ResultsTable({ results, tasks, kinds, selectedTask, onSelectTask, onDelete, onRefresh, refreshDisabled, onHandoff }: Props) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const shown = useMemo(() => results.filter(r => kinds.includes(r.kind as Kind) && (kind === 'all' || r.kind === kind) && (!selectedTask || r.taskId === selectedTask)
    && `${r.name} ${r.phone} ${r.email} ${r.address} ${r.website} ${r.status} ${r.reason}`.toLowerCase().includes(q.toLowerCase())), [results, kinds, kind, selectedTask, q]);
  const exportable = shown.filter(r => r.kind !== 'verify-email' || r.status !== 'Invalid');
  const exp = (f: 'csv' | 'xlsx') => { try { downloadAdvancedResults(exportable, f, kinds[0] === 'maps' ? 'extracted-data' : 'results'); setErr(''); } catch (e) { setErr(msg(e, t)); } };
  const ref = async (id: string) => { if (!onRefresh) return; setBusy(id); setErr(''); try { await onRefresh(id); } catch (e) { setErr(msg(e, t)); } finally { setBusy(''); } };
  const del = async (id: string) => { const r = results.find(x => x.id === id); if (r?.kind.startsWith('facebook-') && !window.confirm(t('Delete this record? Deleting it does not undo any join request or post already made in Facebook.'))) return; if (r?.providerId && !window.confirm(t('Delete this SMS record? Deleting it cannot undo a message already submitted to Twilio.'))) return; setBusy(id); try { await onDelete(id); } catch (e) { setErr(msg(e, t)); } finally { setBusy(''); } };
  const urlOf = (r: AdvancedResult) => r.kind === 'facebook-search' ? normalizeGroupUrl(r.website) || normalizeGroupUrl(r.name) : null;
  const sel = shown.filter(r => picked.includes(r.id) && urlOf(r));
  const selUrls = [...new Set(sel.map(r => urlOf(r) as string))];
  const selTasks = new Set(sel.map(r => r.taskId));
  const hand = (k: 'facebook-join' | 'facebook-post') => { if (onHandoff && selUrls.length) onHandoff(k, selUrls, [...selTasks][0]); };
  const scoped = tasks.filter(t => kinds.includes(t.kind));
  return <section className="wa-card" aria-label={t('Results')} data-testid="panel-adv-results">
    <div className="wa-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
      <div><h2 style={{ margin: 0 }}>{t('Results')} <span className="mono-tag">{shown.length}</span></h2><p className="wa-sub">{t('Cells starting with = + - or @ are prefixed with an apostrophe in exports so spreadsheets never run them.')}</p></div>
       <div className="wa-row"><button className="button button-secondary" disabled={!exportable.length} onClick={() => exp('csv')} data-testid="button-adv-export-csv"><Download /> {t('CSV')}</button><button className="button button-secondary" disabled={!exportable.length} onClick={() => exp('xlsx')} data-testid="button-adv-export-xlsx"><Download /> {t('Excel')}</button></div></div>
    {shown.some(r => r.kind === 'verify-email') && <p className="wa-sub">{t('Invalid email rows are excluded from exports. Unknown outcomes stay flagged, not assumed deliverable.')}</p>}
    <div className="toolbar"><div className="search-wrap"><Search /><input className="search-input" placeholder={t('Search results')} aria-label={t('Search results')} value={q} onChange={e => setQ(e.target.value)} data-testid="input-adv-search" /></div>
      <select className="field-select" value={kind} onChange={e => setKind(e.target.value)} aria-label={t('Filter by module')} data-testid="select-adv-result-kind"><option value="all">{t('All types')}</option>{kinds.map(k => <option key={k} value={k}>{t(KINDS[k].label)}</option>)}</select>
      <select className="field-select" value={selectedTask} onChange={e => onSelectTask(e.target.value)} aria-label={t('Filter by task')} data-testid="select-adv-result-task"><option value="">{t('All tasks')}</option>{scoped.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    {onHandoff && <div className="wa-row" style={{ marginBottom: 10 }} data-testid="bar-fb-handoff"><span className="adv-sub">{t('{n} found groups selected', { n: selUrls.length })}</span><button type="button" className="button button-secondary" disabled={!selUrls.length} onClick={() => hand('facebook-join')} data-testid="button-fb-handoff-join">{t('Review as join request')}</button><button type="button" className="button button-secondary" disabled={!selUrls.length} onClick={() => hand('facebook-post')} data-testid="button-fb-handoff-post">{t('Review as post task')}</button><span className="adv-sub">{t('Found groups are never joined or posted to automatically. This opens an unsaved editor.')}</span></div>}
    {err && <p className="wa-err" role="alert">{err}</p>}
    {!shown.length ? <div className="empty-state"><b>{t('No results yet')}</b><p>{t('Completed tasks list what they found here. Export covers what you see now.')}</p></div>
      : <div className="adv-table-wrap"><table className="adv-table"><thead><tr>{onHandoff && <th><span className="sr-only">{t('Select')}</span></th>}<th>{t('Type')}</th><th>{t('Name')}</th><th>{t('Phone')}</th><th>{t('Email')}</th><th>{t('Website')}</th><th>{t('Address')}</th><th>{t('Status')}</th><th>{t('Added')}</th><th><span className="sr-only">{t('Delete')}</span></th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.id} data-testid={`row-adv-result-${r.id}`}>{onHandoff && <td>{urlOf(r) ? <input type="checkbox" aria-label={t('Select group {name}', { name: r.name })} checked={picked.includes(r.id)} onChange={e => setPicked(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} data-testid={`check-fb-found-${r.id}`} /> : null}</td>}<td>{KINDS[r.kind as Kind] ? t(KINDS[r.kind as Kind].label) : r.kind}</td><td>{r.name || '—'}</td><td className="adv-mono">{r.phone || '—'}</td><td className="adv-mono">{r.email || '—'}</td><td className="adv-mono">{r.kind === 'facebook-post' && r.status === 'Posted' && safePermalink(r.website) ? <a href={safePermalink(r.website) as string} target="_blank" rel="noopener noreferrer" data-testid={`link-fb-permalink-${r.id}`}>{r.website}</a> : r.website || '—'}</td><td>{r.address || '—'}</td><td><span className="wa-chip" title={r.reason ? t(r.reason) : undefined}>{t(r.status)}</span>{r.reason && <div className="adv-reason">{t(r.reason)}</div>}{r.kind === 'sms-send' && <div className="adv-reason adv-mono" data-testid={`detail-sms-${r.id}`}>{r.providerStatus && <div>{t(smsStatusLabel(r.providerStatus))} ({r.providerStatus})</div>}{r.providerId && <div>{t('Message ID')}: {r.providerId}</div>}{r.estimatedSegments != null && <div>{t('Estimated segments')}: {r.estimatedSegments}{r.encoding ? ` · ${r.encoding}` : ''}</div>}{r.segments != null && <div>{t('Segments')}: {r.segments}</div>}{r.statusCheckedAt && <div>{t('Status checked')}: {when(r.statusCheckedAt, locale)}</div>}{r.statusRefreshError && <div className="wa-err">{t(r.statusRefreshError)}</div>}</div>}</td><td>{when(r.createdAt, locale)}</td>
          <td>{onRefresh && r.kind === 'sms-send' && r.providerId && <button className="small-icon" title={t('Check status with Twilio (lookup only, nothing is resent)')} aria-label={t('Refresh SMS status {name}', { name: r.name || r.phone || r.id })} disabled={refreshDisabled || busy === r.id} onClick={() => void ref(r.id)} data-testid={`button-sms-refresh-${r.id}`}><RefreshCw /></button>}<button className="small-icon" aria-label={t('Delete result {name}', { name: r.name || r.email || r.id })} disabled={busy === r.id} onClick={() => void del(r.id)} data-testid={`button-adv-delete-result-${r.id}`}><Trash2 /></button></td></tr>)}</tbody></table></div>}
  </section>;
}
