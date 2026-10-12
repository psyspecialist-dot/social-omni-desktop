import { useState } from 'react';
import { Link } from 'wouter';
import { Copy, KeyRound, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ApiState, LicenseStatus } from '@/lib/api';

type Perform = (method: 'POST' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;

const statusLabel: Record<LicenseStatus['status'], string> = {
  active: 'License active', not_activated: 'Not activated', invalid: 'License invalid',
  unconfigured: 'Licensing not configured', desktop_only: 'Desktop app only',
};

export function licenseNeedsAttention(l?: LicenseStatus) {
  return !!l && l.native && l.status !== 'active';
}

export default function LicenseSettings({ license, perform }: { license?: LicenseStatus; perform: Perform }) {
  const { t, lang } = useI18n();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const l: LicenseStatus = license ?? { native: false, configured: false, status: 'desktop_only', machineId: null, licenseId: null, maxDevices: null, devicesUsed: null, kind: null, supportPlan: null, supportUntil: null, supportActive: false, activatedAt: null, serverUrl: '', error: null };
  const date = (v: string | null) => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' }).format(d); };
  const canActivate = l.native && l.configured && l.status !== 'desktop_only' && l.status !== 'unconfigured';
  const run = async (fn: () => Promise<ApiState>, ok: string) => {
    setBusy(true); setErr(''); setNote('');
    try { await fn(); setNote(t(ok)); } catch (e) { setErr(e instanceof Error ? t(e.message) : t('The local request failed.')); } finally { setBusy(false); }
  };
  const activate = () => {
    const k = key.trim();
    if (!k) { setErr(t('Enter your license key.')); return; }
    void run(async () => { const r = await perform('POST', '/license/activate', { key: k }); setKey(''); return r; }, 'License activated on this device.');
  };
  const copy = async () => {
    if (!l.machineId) return;
    try { await navigator.clipboard.writeText(l.machineId); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setErr(t('Copy failed. Select the Machine ID and copy it manually.')); }
  };
  const support = !l.supportPlan || l.supportPlan === 'none' ? t('No updates or support plan') : `${t(l.supportPlan === 'monthly' ? 'Monthly updates & support' : 'Yearly updates & support')} · ${l.supportActive ? t('Active until {date}', { date: date(l.supportUntil) }) : t('Expired {date}', { date: date(l.supportUntil) })}`;
  const row = (label: string, value: string, id: string) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 12 }}><span style={{ opacity: .7 }}>{t(label)}</span><span data-testid={id} dir="auto" style={{ textAlign: 'end' }}>{value}</span></div>;
  return <section className="setting-card" id="license" aria-label={t('License activation')} data-testid="section-license">
    <div className="setting-head"><div><strong>{t('License')}</strong><p>{t('One-time perpetual license for this app. Monthly or yearly plans only cover updates and support; expired support never blocks the core app.')}</p></div><span className="mono-tag" data-testid="status-license">{t(statusLabel[l.status])}</span></div>
    {l.status === 'desktop_only' && <p className="heading-sub" role="status" data-testid="status-license-desktop-only">{t('Activation is only available in the downloaded desktop app. This hosted preview never activates a license.')}</p>}
    {l.status === 'unconfigured' && <p className="heading-sub" role="status" data-testid="status-license-unconfigured">{t('This build has no license authority address or public key bundled, so activation is disabled.')}</p>}
    {l.error && <p role="alert" className="heading-sub" data-testid="error-license">{t(l.error)}</p>}
    <div style={{ marginTop: 10 }}>
      <div className="field-label">{t('Machine ID')}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <code dir="ltr" data-testid="text-machine-id" style={{ wordBreak: 'break-all', fontSize: 11 }}>{l.machineId || '—'}</code>
        <button type="button" className="button button-secondary" onClick={() => void copy()} disabled={!l.machineId} aria-label={t('Copy Machine ID')} data-testid="button-copy-machine-id"><Copy size={13} /> {copied ? t('Copied') : t('Copy')}</button>
      </div>
      {row('Devices allowed', l.maxDevices == null ? '—' : String(l.maxDevices), 'text-max-devices')}
      {row('Devices used (last activation)', l.devicesUsed == null ? '—' : String(l.devicesUsed), 'text-devices-used')}
      {row('Edition', l.kind ? t(l.kind === 'reseller' ? 'Reseller' : 'Standard') : '—', 'text-license-kind')}
      {row('Updates & support', support, 'text-support-status')}
      {l.licenseId && row('License ID', l.licenseId, 'text-license-id')}
      {l.activatedAt && row('Activated', date(l.activatedAt), 'text-activated-at')}
      <p className="heading-sub" style={{ fontSize: 10 }}>{t('Device count shows the figure from the last activation, not a live count.')}</p>
    </div>
    <form onSubmit={e => { e.preventDefault(); activate(); }} style={{ marginTop: 12 }}>
      <div className="field-group"><label className="field-label" htmlFor="license-key">{t('License key')}</label>
        <input id="license-key" dir="ltr" className="field-input" autoComplete="off" spellCheck={false} maxLength={4000} value={key} disabled={!canActivate || busy} onChange={e => { setKey(e.target.value); setErr(''); }} aria-label={t('License key')} data-testid="input-license-key" /></div>
      <button type="submit" className="button button-primary" disabled={!canActivate || busy || !key.trim()} aria-label={t('Activate license')} data-testid="button-activate-license"><KeyRound size={14} /> {busy ? t('Working…') : t('Activate')}</button>
    </form>
    {note && <p role="status" className="heading-sub" data-testid="status-license-note">{note}</p>}
    {err && <p role="alert" className="heading-sub" data-testid="error-license-action">{err}</p>}
    <p className="heading-sub" style={{ fontSize: 11 }}><ShieldCheck size={12} style={{ verticalAlign: 'middle' }} /> {t('First activation needs an internet connection. After that, the signed certificate is verified offline. Disabling or revoking a license centrally cannot instantly revoke certificates already issued to devices.')}</p>
    {l.native && l.status === 'active' && <div style={{ marginTop: 8 }}>
      {!confirmRemove ? <button type="button" className="button button-secondary" onClick={() => setConfirmRemove(true)} disabled={busy} data-testid="button-remove-license">{t('Remove local certificate')}</button>
        : <div role="alertdialog" aria-label={t('Confirm certificate removal')} data-testid="dialog-remove-license">
          <p className="heading-sub">{t('This deletes only the certificate stored on this device. It does NOT free the device slot on the license server. You will need your key and internet to activate again; the same registered machine does not consume another slot.')}</p>
          <button type="button" className="button button-primary" disabled={busy} onClick={() => { setConfirmRemove(false); void run(() => perform('DELETE', '/license'), 'Local certificate removed. The device slot was not freed.'); }} data-testid="button-confirm-remove-license">{t('Remove certificate')}</button>{' '}
          <button type="button" className="button button-secondary" onClick={() => setConfirmRemove(false)} data-testid="button-cancel-remove-license">{t('Cancel')}</button></div>}
    </div>}
  </section>;
}

export function LicenseNotice({ license }: { license?: LicenseStatus }) {
  const { t } = useI18n();
  if (!licenseNeedsAttention(license)) return null;
  return <div className="storage-alert" role="alert" data-testid="notice-license-inactive">{t('License is not active. Settings stay readable, but other changes are rejected until you activate.')} <Link href="/settings" className="text-link" data-testid="link-license-settings">{t('Open license settings')}</Link></div>;
}
