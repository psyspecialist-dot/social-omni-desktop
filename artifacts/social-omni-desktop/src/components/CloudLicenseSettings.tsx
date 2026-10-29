import { useState } from 'react';
import { useI18n } from '@/i18n';
import type { ApiState, LicenseStatus } from '@/lib/api';

type Props = {
  license: LicenseStatus;
  perform: (method: 'POST' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
};
export default function CloudLicenseSettings({ license: l, perform }: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [method, setMethod] = useState('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [detach, setDetach] = useState(false);
  const signedIn = l.cloud?.signedIn;
  const run = async (action: string, body?: unknown) => {
    setBusy(true); setError(''); setNote('');
    try {
      const state = await perform('POST', `/license/cloud/${action}`, body);
      if (action === 'login') setNote(state.license?.status === 'active' ? 'Cloud sign-in and device activation succeeded.' : 'Signed in. App access has not been granted.');
      if (action === 'recheck') setNote(state.license?.status === 'active' ? 'Cloud access verified.' : 'App access has not been granted.');
      if (action === 'logout') setNote('Signed out. The device seat has not been released.');
      if (action === 'detach') setNote('This device was detached and its sessions revoked.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to verify cloud access. Check your connection and try again.');
    } finally {
      // Never retain credentials after the exchange, including failed requests.
      setPassword(''); setToken(''); setBusy(false); setDetach(false);
      // Account state also refreshes from the main process every second.
    }
  };
  const row = (label: string, value: string) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', fontSize: 12 }}><span>{t(label)}</span><span dir="auto">{value}</span></div>;
  return <section className="setting-card" id="license" data-testid="section-cloud-license">
    <div className="setting-head"><div><strong>{t('Cloud account & device activation')}</strong><p>{t('Sign in with your website account. Login alone does not grant app access.')}</p></div><span className="mono-tag" data-testid="status-license">{t(l.status === 'active' ? 'License active' : l.configured ? 'Not activated' : 'Cloud activation unavailable')}</span></div>
    <p className="heading-sub">{t('Cloud mode requires regular online verification. Existing offline certificates are preserved but are not used as a fallback.')}</p>
    {l.error && <p role="alert">{t(l.error)}</p>}
    {l.cloud?.warning && <p role="status">{t(l.cloud.warning)}</p>}
    <label className="field-label" htmlFor="cloud-machine">{t('Machine ID')}</label>
    <input id="cloud-machine" readOnly dir="ltr" className="field-input" value={l.machineId || ''} onFocus={e => e.currentTarget.select()} />
    {row('Account', l.cloud?.email || '—')}
    {row('Device status', l.cloud?.deviceStatus ? t(({ pending: 'Pending activation', active: 'Active', revoked: 'Detached', blocked: 'Blocked' } as Record<string, string>)[l.cloud.deviceStatus] || l.cloud.deviceStatus) : '—')}
    {row('Access model', l.cloud?.accessModel ? t(({ perpetual: 'Perpetual purchase', subscription: 'Access subscription', none: 'No entitlement' } as Record<string, string>)[l.cloud.accessModel] || l.cloud.accessModel) : '—')}
    {row('Devices allowed', l.maxDevices == null ? '—' : String(l.maxDevices))}
    {row('Active devices', l.devicesUsed == null ? '—' : String(l.devicesUsed))}
    {row('Updates & support', l.supportActive ? `${t('Active')} · ${l.supportUntil || ''}` : t('No active updates or support'))}
    {!signedIn ? <form onSubmit={e => {
      e.preventDefault();
      void run('login', method === 'token' ? { auth_token: token.trim() } : { email, password });
    }}>
      <label className="field-label" htmlFor="cloud-method">{t('Sign-in method')}</label>
      <select id="cloud-method" className="field-input" value={method} disabled={busy} onChange={e => { setMethod(e.target.value); setPassword(''); setToken(''); }}>
        <option value="password">{t('Email and password')}</option><option value="token">{t('Personal login token')}</option>
      </select>
      {method === 'password' ? <>
        <label className="field-label" htmlFor="cloud-email">{t('Email')}</label>
        <input id="cloud-email" className="field-input" type="email" dir="ltr" required maxLength={254} autoComplete="username" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} />
        <label className="field-label" htmlFor="cloud-password">{t('Password')}</label>
        <input id="cloud-password" className="field-input" type="password" dir="ltr" required maxLength={256} autoComplete="off" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} />
      </> : <>
        <label className="field-label" htmlFor="cloud-token">{t('Personal login token')}</label>
        <input id="cloud-token" className="field-input" type="password" dir="ltr" required maxLength={68} pattern="snp_[A-Za-z0-9_-]{64}" autoComplete="off" value={token} disabled={busy} onChange={e => setToken(e.target.value)} />
      </>}
      <button type="submit" className="button button-primary" disabled={busy || !l.configured || (l.cloud?.retryAfterSeconds || 0) > 0}>{t(busy ? 'Working…' : 'Sign in & activate this device')}</button>
    </form> : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="button button-primary" disabled={busy} onClick={() => void run('recheck')}>{t('Verify cloud access')}</button>
      {l.status !== 'active' && <button className="button button-secondary" disabled={busy} onClick={() => {
        setBusy(true); setError(''); setNote('');
        void perform('POST', '/license/activate').then(s => setNote(s.license?.status === 'active' ? 'Cloud sign-in and device activation succeeded.' : 'App access has not been granted.')).catch(e => setError(e.message)).finally(() => setBusy(false));
      }}>{t('Activate this device')}</button>}
      <button className="button button-secondary" disabled={busy} onClick={() => void run('logout')}>{t('Sign out')}</button>
      <button className="button button-secondary" disabled={busy} onClick={() => setDetach(true)}>{t('Detach this device')}</button>
    </div>}
    {detach && <div role="alertdialog" aria-label={t('Confirm device detachment')}>
      <p>{t('This releases this device seat and revokes all its cloud sessions. You will need to sign in and activate again. Other devices are not removed.')}</p>
      <button className="button button-primary" disabled={busy} onClick={() => void run('detach', { confirmed: true })}>{t('Confirm detachment')}</button>{' '}
      <button className="button button-secondary" disabled={busy} onClick={() => setDetach(false)}>{t('Cancel')}</button>
    </div>}
    {error && <p role="alert">{t(error)}</p>}
    {note && <p role="status">{t(note)}</p>}
    <p className="heading-sub">{t('Signing out does not release your device seat. Detaching is a separate action.')}</p>
    <a className="text-link" href={`${l.serverUrl}/account`} target="_blank" rel="noopener noreferrer">{t('Manage account & devices on website')}</a>
  </section>;
}
