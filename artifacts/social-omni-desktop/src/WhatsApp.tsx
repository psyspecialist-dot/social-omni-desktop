import { useState } from 'react';
import { Play, Save } from 'lucide-react';
import './whatsapp.css';

type Settings = { keywords: string; delayMin: number; delayMax: number };
type Job = { id: string; kind: string; status: string; progress: number; steps: string[] };
interface Props { settings: Settings; onSave: (s: Settings) => Promise<void>; onRun: () => Promise<void>; jobs: Job[] }

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

export default function WhatsApp({ settings, onSave, onRun, jobs }: Props) {
  const [keywords, setKeywords] = useState(settings.keywords);
  const [min, setMin] = useState(settings.delayMin || 3);
  const [max, setMax] = useState(settings.delayMax || 5);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [runError, setRunError] = useState('');

  const changeMin = (v: number) => { setMin(v); if (v > max) setMax(v); setSaved(false); };
  const changeMax = (v: number) => { setMax(v); if (v < min) setMin(v); setSaved(false); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try { await onSave({ keywords, delayMin: min, delayMax: max }); setSaved(true); }
    catch (err) { setError(msg(err)); }
    finally { setSaving(false); }
  };
  const run = async () => {
    setRunning(true); setRunError('');
    try {
      if (keywords !== settings.keywords || min !== settings.delayMin || max !== settings.delayMax) {
        await onSave({ keywords, delayMin: min, delayMax: max });
        setSaved(true);
      }
      await onRun();
    } catch (err) { setRunError(msg(err)); } finally { setRunning(false); }
  };
  const relevant = jobs.filter(j => /whatsapp/i.test(j.kind));

  return <main className="page">
    <div className="page-heading"><div><div className="eyebrow">Local simulation</div><h1>WhatsApp</h1>
      <p className="heading-sub">Rehearse a keyword workflow on this device. Nothing is sent, joined, or collected.</p></div>
      <button type="button" className="button button-primary" onClick={run} disabled={running || jobs.some(j => j.kind === 'whatsapp' && ['Pending', 'Running'].includes(j.status))} data-testid="button-run-task"><Play /> {running || jobs.some(j => j.kind === 'whatsapp' && ['Pending', 'Running'].includes(j.status)) ? 'Simulation in progress…' : 'Run Task'}</button></div>
    <div className="wa-sim-note" role="note"><strong>Simulation only.</strong> No WhatsApp messages, group joins, contact scraping, or network activity occur. Progress below is a local rehearsal for manual review.</div>
    {runError && <div className="wa-feedback err" role="alert" data-testid="error-run">{runError}</div>}
    <div className="wa-grid">
      <section className="panel">
        <div className="panel-head"><div><div className="panel-title">Simulation settings</div><div className="panel-caption">Keywords and pacing used by the rehearsal.</div></div></div>
        <form className="wa-form" onSubmit={save}>
          <div className="field-group"><label className="field-label" htmlFor="wa-keywords">Target keywords<span className="field-hint">comma separated</span></label>
            <textarea id="wa-keywords" className="field-textarea" value={keywords} onChange={e => { setKeywords(e.target.value); setSaved(false); }} data-testid="input-keywords" /></div>
          <div className="wa-range-row">
            <div className="field-group"><label className="field-label" htmlFor="wa-min">Minimum delay<span className="wa-value">{min}s</span></label>
              <input id="wa-min" className="wa-range" type="range" min={3} max={30} value={min} onChange={e => changeMin(Number(e.target.value))} data-testid="slider-delay-min" /></div>
            <div className="field-group"><label className="field-label" htmlFor="wa-max">Maximum delay<span className="wa-value">{max}s</span></label>
              <input id="wa-max" className="wa-range" type="range" min={3} max={30} value={max} onChange={e => changeMax(Number(e.target.value))} data-testid="slider-delay-max" /></div>
          </div>
          <div className="form-actions"><button type="submit" className="button button-secondary" disabled={saving} data-testid="button-save-settings"><Save /> {saving ? 'Saving…' : 'Save settings'}</button></div>
          {error && <div className="wa-feedback err" role="alert" data-testid="error-save">{error}</div>}
          {saved && <div className="wa-feedback ok" role="status" data-testid="status-saved">Settings saved.</div>}
        </form>
      </section>
      <section className="panel">
        <div className="panel-head"><div><div className="panel-title">Simulation progress</div><div className="panel-caption">Steps complete one after another.</div></div></div>
        <div className="panel-body">
          {relevant.length ? relevant.map(j => {
            const pct = Math.max(0, Math.min(100, j.progress));
            const idx = Math.floor((pct / 100) * j.steps.length);
            return <div className="wa-job" key={j.id} data-testid={`row-job-${j.id}`}>
              <div className="wa-job-top"><div className="row-title">{j.kind}</div><span className="status">{j.status}</span></div>
              <div className="wa-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
              <ol className="wa-steps">{j.steps.map((s, i) => <li key={i} className={i < idx || pct >= 100 ? 'done' : i === idx ? 'current' : ''}><span>{String(i + 1).padStart(2, '0')}</span>{s}</li>)}</ol>
            </div>;
          }) : <div className="empty-state"><b>No simulation yet</b><p>Choose Run Task to rehearse the workflow locally.</p></div>}
        </div>
      </section>
    </div>
  </main>;
}
