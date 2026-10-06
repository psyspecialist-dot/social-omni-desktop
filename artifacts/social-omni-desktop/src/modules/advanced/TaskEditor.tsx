import { useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import type { AdvancedTask, AdvancedTaskInput } from '@workspace/api-client-react';
import type { Account } from '@/lib/workspace';
import type { MediaAsset } from '@/lib/api';
import { readListFile } from '@/lib/advanced-export';
import { isDesktop } from '@/lib/persistence';
import { FileUp, X } from 'lucide-react';
import { KINDS, msg, type Kind } from './config';

const toLocal = (iso?: string) => { const d = iso ? new Date(iso) : null; if (!d || Number.isNaN(d.getTime())) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
interface Props { kinds: Kind[]; task?: AdvancedTask; accounts: Account[]; media: MediaAsset[]; onSave: (input: AdvancedTaskInput, id?: string) => Promise<void>; onClose: () => void }

export default function TaskEditor({ kinds, task, accounts, media, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>(task?.kind || kinds[0]);
  const [name, setName] = useState(task?.name || '');
  const [source, setSource] = useState(task?.source || '');
  const [message, setMessage] = useState(task?.message || '');
  const [subject, setSubject] = useState(task?.subject || '');
  const [query, setQuery] = useState(task?.query || '');
  const [limit, setLimit] = useState(String(task?.limit ?? 50));
  const [accountId, setAccountId] = useState(task?.accountId || '');
  const [mediaId, setMediaId] = useState(task?.mediaId || '');
  const [at, setAt] = useState(toLocal(task?.scheduledAt));
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const spec = KINDS[kind];
  const accts = accounts.filter(a => a.platform === spec.account);
  const images = media.filter(m => m.mime === 'image/jpeg' || m.mime === 'image/png');
  const file = useRef<HTMLInputElement>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr(t('Give this task a name.')); return; }
    if (isDesktop && at && Number.isNaN(new Date(at).getTime())) { setErr(t('Choose a valid schedule time.')); return; }
    if (isDesktop && at && approved && new Date(at).getTime() <= Date.now()) { setErr(t('Scheduled time must be in the future.')); return; }
    const input: AdvancedTaskInput = { kind, name: name.trim() };
    if (spec.source) input.source = source;
    if (spec.message) input.message = message;
    if (spec.subject) input.subject = subject;
    if (spec.query) input.query = query;
    if (spec.limit) input.limit = Math.max(1, Math.min(200, Math.round(Number(limit) || 1)));
    if (spec.account) input.accountId = accountId;
    if (spec.media) input.mediaId = mediaId;
    if (isDesktop && at) input.scheduledAt = new Date(at).toISOString();
    if (isDesktop && at && approved) input.approved = true;
    setBusy(true); setErr('');
    try { await onSave(input, task?.id); } catch (x) { setErr(msg(x, t)); setBusy(false); }
  };
  const lines = source.split(/\r?\n/).filter(l => l.trim()).length;
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <form className="dialog adv-dialog" role="dialog" aria-modal="true" aria-label={task ? t('Edit task') : t('New task')} onSubmit={submit} data-testid="dialog-adv-task">
      <div className="dialog-header"><div><h2>{task ? t('Edit task') : t('New task')}</h2><p>{t(spec.hint)}</p></div><button type="button" className="small-icon" onClick={onClose} aria-label={t('Close')}><X /></button></div>
      <div className="dialog-form">
        <div className="field-group"><label className="field-label" htmlFor="adv-kind">{t('Task type')}</label>
          <select id="adv-kind" className="field-select" style={{ width: '100%' }} value={kind} disabled={!!task} onChange={e => setKind(e.target.value as Kind)} data-testid="select-adv-kind">{kinds.map(k => <option key={k} value={k}>{t(KINDS[k].label)}</option>)}</select></div>
        <div className="field-group"><label className="field-label" htmlFor="adv-name">{t('Name')} <span className="field-hint">{name.length}/150</span></label><input id="adv-name" autoFocus className="field-input" maxLength={150} value={name} onChange={e => setName(e.target.value)} data-testid="input-adv-name" /></div>
        {spec.query && <div className="field-group"><label className="field-label" htmlFor="adv-query">{kind === 'maps' ? t('Search') : t('Keyword')}</label><input id="adv-query" className="field-input" maxLength={300} value={query} onChange={e => setQuery(e.target.value)} placeholder={t(spec.query)} data-testid="input-adv-query" /></div>}
        {spec.limit && <div className="field-group"><label className="field-label" htmlFor="adv-limit">{t('Limit')} <span className="field-hint">{t('1 to 200')}</span></label><input id="adv-limit" type="number" min={1} max={200} className="field-input" value={limit} onChange={e => setLimit(e.target.value)} data-testid="input-adv-limit" /></div>}
        {spec.account && <div className="field-group"><label className="field-label" htmlFor="adv-acct">{t('{platform} account', { platform: t(spec.account) })}</label>
          <select id="adv-acct" className="field-select" style={{ width: '100%' }} value={accountId} onChange={e => setAccountId(e.target.value)} data-testid="select-adv-account"><option value="">{accts.length ? t('Choose an account') : t('No {platform} account saved', { platform: t(spec.account) })}</option>{accts.map(a => <option key={a.id} value={a.id}>{a.displayLabel} ({a.handle})</option>)}</select></div>}
        {spec.media && <div className="field-group"><label className="field-label" htmlFor="adv-media">{t('Image (JPEG or PNG)')}</label>
          <select id="adv-media" className="field-select" style={{ width: '100%' }} value={mediaId} onChange={e => setMediaId(e.target.value)} data-testid="select-adv-media"><option value="">{images.length ? t('Choose saved media') : t('Upload a JPEG or PNG in WhatsApp Marketing first')}</option>{images.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}
        {spec.source && <div className="field-group"><label className="field-label" htmlFor="adv-src">{t(spec.source)} <span className="field-hint">{t('{n} lines', { n: lines })}</span></label>
          <textarea id="adv-src" className="field-textarea adv-mono" maxLength={15000} value={source} onChange={e => setSource(e.target.value)} placeholder={spec.sourcePlaceholder} data-testid="input-adv-source" />
          {kind !== 'telegram-members' && <><button type="button" className="button button-secondary" style={{ marginTop: 8 }} onClick={() => file.current?.click()}><FileUp /> {t('Import TXT or CSV')}</button>
            <input ref={file} type="file" accept=".txt,.csv" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const txt = await readListFile(f, kind); setSource(p => (p.trim() ? `${p.trim()}\n${txt}` : txt)); } catch (x) { setErr(msg(x, t)); } }} data-testid="input-adv-file" /></>}</div>}
        {spec.subject && <div className="field-group"><label className="field-label" htmlFor="adv-subj">{t('Subject')}</label><input id="adv-subj" className="field-input" maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} data-testid="input-adv-subject" /></div>}
        {spec.message && <div className="field-group"><label className="field-label" htmlFor="adv-msg">{t(spec.message)} <span className="field-hint">{message.length}/10000</span></label><textarea id="adv-msg" className="field-textarea" maxLength={10000} value={message} onChange={e => setMessage(e.target.value)} data-testid="input-adv-message" /></div>}
        <div className="field-group"><label className="field-label" htmlFor="adv-at">{isDesktop ? t('Schedule (optional)') : t('Schedule (optional · desktop only)')}</label><input id="adv-at" type="datetime-local" className="field-input" value={at} disabled={!isDesktop} onChange={e => setAt(e.target.value)} data-testid="input-adv-schedule" />
          <p className="adv-note">{t('Scheduled tasks run only while the desktop app is open. Tasks missed while closed become Needs review on restart and never run automatically.')}</p></div>
        {isDesktop && at && <label className="check-row"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} data-testid="check-adv-approve" />{t(spec.consent)} {t('Approve this schedule. Without approval it stays a Draft.')}</label>}
        {err && <p className="wa-err" role="alert" data-testid="error-adv-task">{err}</p>}
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>{t('Cancel')}</button><button className="button button-primary" disabled={busy} data-testid="button-adv-save">{busy ? t('Saving…') : isDesktop && at && approved ? t('Save and schedule') : t('Save draft')}</button></div>
      </div></form></div>;
}
