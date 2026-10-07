import { useMemo, useState, type FormEvent } from 'react';
import { useI18n } from '@/i18n';
import { Play, Save, Square } from 'lucide-react';
import type { ApiState, MediaAsset, SimulationJob, SimulationSettings } from '@/lib/api';
import type { Account } from '@/lib/workspace';
import MediaUpload from '@/components/MediaUpload';
import RichMessage from '@/components/RichMessage';
import SimQueue from '@/components/SimQueue';
import LiveAutomation from '@/components/LiveAutomation';
import './whatsapp.css';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
type Draft = Pick<SimulationSettings, 'keywords' | 'delayMin' | 'delayMax' | 'phoneNumbers' | 'messageContent' | 'mediaId' | 'accountId'>;
interface Props {
  settings: SimulationSettings; media: MediaAsset[]; accounts: Account[]; jobs: SimulationJob[];
  perform: Perform; onSave: (s: Draft) => Promise<void>; onRun: () => Promise<void>; onCancel: (id: string) => void;
}

export const parsePhones = (raw: string) => raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
const normalize = (s: string) => s.replace(/[\s().-]/g, '');

export default function WhatsApp({ settings, media, accounts, jobs, perform, onSave, onRun, onCancel }: Props) {
  const { t } = useI18n();
  const msg = (e: unknown) => (e instanceof Error ? e.message : t('Something went wrong.'));
  const [d, setD] = useState<Draft>({ keywords: settings.keywords, delayMin: settings.delayMin || 5, delayMax: settings.delayMax || 12, phoneNumbers: settings.phoneNumbers || '', messageContent: settings.messageContent || '', mediaId: settings.mediaId ?? null, accountId: settings.accountId ?? null });
  const [busy, setBusy] = useState<'' | 'save' | 'run'>('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const set = (p: Partial<Draft>) => { setD(v => ({ ...v, ...p })); setSaved(false); };
  const waAccounts = accounts.filter(a => a.platform === 'WhatsApp');

  const phones = useMemo(() => parsePhones(d.phoneNumbers).map(normalize), [d.phoneNumbers]);
  const problem = useMemo(() => {
    if (phones.length > 200) return t('Use at most 200 phone numbers.');
    const bad = phones.find(p => !/^\+[1-9]\d{6,14}$/.test(p));
    if (bad) return t('"{bad}" is not in international format, for example +14155550123.', { bad });
    if (new Set(phones).size !== phones.length) return t('Each phone number can appear only once.');
    return '';
  }, [phones, t]);
  const dirty = d.keywords !== settings.keywords || d.delayMin !== settings.delayMin || d.delayMax !== settings.delayMax || d.phoneNumbers !== settings.phoneNumbers
    || d.messageContent !== settings.messageContent || d.mediaId !== (settings.mediaId ?? null) || d.accountId !== (settings.accountId ?? null);
  const active = jobs.find(j => j.kind === 'whatsapp' && ['Pending', 'Running'].includes(j.status));
  const [mediaBusy, setMediaBusy] = useState(false);
  const relevant = jobs.filter(j => j.kind === 'whatsapp');
  const needs = !phones.length ? t('Add at least one phone number.') : !d.messageContent.trim() ? t('Write a message first.') : problem;

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (problem) { setError(problem); return; }
    setBusy('save'); setError(''); setSaved(false);
    try { await onSave(d); setSaved(true); } catch (err) { setError(msg(err)); } finally { setBusy(''); }
  };
  const run = async () => {
    if (needs) { setError(needs); return; }
    setBusy('run'); setError('');
    try { if (dirty) await onSave(d); await onRun(); setSaved(true); } catch (err) { setError(msg(err)); } finally { setBusy(''); }
  };
  // Media is stored server-side as soon as uploaded; the selection is saved with the form.
  const changeMedia = (id: string | null) => set({ mediaId: id });
  const changeMin = (v: number) => set({ delayMin: v, delayMax: Math.max(v, d.delayMax) });
  const changeMax = (v: number) => set({ delayMax: v, delayMin: Math.min(v, d.delayMin) });

  return <main className="page">
    <div className="page-heading"><div><div className="eyebrow">{t('Social Najhin')}</div><h1>{t('WhatsApp Marketing')}</h1>
      <p className="heading-sub">{t('Save your message, connect a local browser, and send only to opted-in recipients.')}</p></div>
      <div style={{ display: 'flex', gap: 8 }}>
        {active && <button type="button" className="button button-secondary" onClick={() => onCancel(active.id)} data-testid="button-cancel-run"><Square /> {t('Stop')}</button>}
        <button type="button" className="button button-secondary" onClick={run} disabled={mediaBusy || busy !== '' || Boolean(active)} data-testid="button-run-task"><Play /> {busy === 'run' ? t('Starting…') : active ? t('Queue active…') : t('Rehearse only')}</button></div></div>
    <LiveAutomation platform="WhatsApp" accounts={accounts} jobs={jobs} perform={perform} draftPreview={d} beforeSend={async () => { if (problem) throw new Error(problem); await onSave(d); }} />
    <div className="wa-sim-note" role="note"><strong>{t('Draft & rehearsal tools.')}</strong> {t('Rehearse only never sends anything. The separate live browser controls above send real messages after your approval. Live sending uses the current text draft; attachments are rehearsal-only.')}</div>
    {error && <div className="wa-feedback err" role="alert" data-testid="error-run">{error}</div>}
    <div className="wa-grid wide">
      <form className="wa-stack" onSubmit={save}>
        <section className="panel">
          <div className="panel-head"><div><div className="panel-title">{t('Recipients')}</div><div className="panel-caption">{t('{n} of 200 numbers', { n: phones.length })}</div></div></div>
          <div className="wa-form">
            <div className="field-group"><label className="field-label" htmlFor="wa-phones">{t('Target phone numbers')}<span className="field-hint">{t('comma or new line')}</span></label>
              <textarea id="wa-phones" className="field-textarea" value={d.phoneNumbers} onChange={e => set({ phoneNumbers: e.target.value })} placeholder={'+14155550123, +442071838750\n+819012345678'} data-testid="textarea-phones" />
              {problem ? <div className="wa-feedback err" role="alert" data-testid="error-phones">{problem}</div> : <div className="wa-hint">{t('International format with a leading plus. Spaces and dashes are ignored.')}</div>}</div>
            <div className="field-group"><label className="field-label" htmlFor="wa-account">{t('Simulated account')}<span className="field-hint">{t('optional')}</span></label>
              <select id="wa-account" className="field-select" style={{ width: '100%' }} value={d.accountId ?? ''} onChange={e => set({ accountId: e.target.value || null })} data-testid="select-account">
                <option value="">{t('Demo workspace identity')}</option>{waAccounts.map(a => <option key={a.id} value={a.id}>{a.displayLabel} ({t(a.status)})</option>)}</select></div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><div className="panel-title">{t('Message')}</div><div className="panel-caption">{t('Use *bold*, _italic_, ~strike~, and `mono`.')}</div></div></div>
          <div className="wa-form">
            <RichMessage value={d.messageContent} onChange={v => set({ messageContent: v })} />
            <div className="field-group" style={{ marginTop: 14 }}><div className="field-label">{t('Image or video')}</div>
              <MediaUpload mediaId={d.mediaId} media={media} perform={perform} onChange={changeMedia} onBusyChange={setMediaBusy} testId="wa-media" /></div>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><div><div className="panel-title">{t('Pacing')}</div><div className="panel-caption">{t('A random delay between the two values is drawn for each recipient.')}</div></div></div>
          <div className="wa-form">
            <div className="field-group"><label className="field-label" htmlFor="wa-keywords">{t('Target keywords')}<span className="field-hint">{t('comma separated, optional')}</span></label>
              <textarea id="wa-keywords" className="field-textarea" style={{ minHeight: 60 }} value={d.keywords} onChange={e => set({ keywords: e.target.value })} data-testid="input-keywords" /></div>
            <div className="wa-range-row">
              <div className="field-group"><label className="field-label" htmlFor="wa-min">{t('Minimum delay')}<span className="wa-value">{d.delayMin}{t('s')}</span></label>
                <input id="wa-min" className="wa-range" type="range" min={5} max={12} value={d.delayMin} onChange={e => changeMin(Number(e.target.value))} data-testid="slider-delay-min" /></div>
              <div className="field-group"><label className="field-label" htmlFor="wa-max">{t('Maximum delay')}<span className="wa-value">{d.delayMax}{t('s')}</span></label>
                <input id="wa-max" className="wa-range" type="range" min={5} max={12} value={d.delayMax} onChange={e => changeMax(Number(e.target.value))} data-testid="slider-delay-max" /></div>
            </div>
            <div className="form-actions"><button type="submit" className="button button-secondary" disabled={mediaBusy || busy !== ''} data-testid="button-save-settings"><Save /> {mediaBusy ? t('Saving attachment…') : busy === 'save' ? t('Saving…') : t('Save inputs')}</button></div>
            {saved && !dirty && <div className="wa-feedback ok" role="status" data-testid="status-saved">{t('Inputs saved.')}</div>}
            {dirty && <div className="wa-hint">{t('Unsaved changes. Both live sending and rehearsal save the draft first.')}</div>}
          </div>
        </section>
      </form>
      <section className="panel" style={{ position: 'sticky', top: 12 }}>
        <div className="panel-head"><div><div className="panel-title">{t('Live queue')}</div><div className="panel-caption">{t('Observed live outcomes and explicitly labelled rehearsals.')}</div></div></div>
        <div className="panel-body">
          {relevant.length ? relevant.slice(0, 3).map(j => <SimQueue key={j.id} job={j} testId={j.id} />)
            : <div className="empty-state"><b>{t('No run yet')}</b><p>{t('Add numbers and a message, then choose live sending or Rehearse only.')}</p></div>}
        </div>
      </section>
    </div>
  </main>;
}
