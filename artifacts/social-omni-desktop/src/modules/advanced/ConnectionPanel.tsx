import { useEffect, useRef, useState } from 'react';
import { isDesktop } from '@/lib/persistence';
import { useI18n } from '@/i18n';
import type { AdvancedConnection } from '@workspace/api-client-react';
import type { ApiState } from '@/lib/api';
import { ExternalLink, KeyRound, Mail, Send, Trash2 } from 'lucide-react';
import { NATIVE_NOTE, msg } from './config';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
const find = (c: AdvancedConnection[], id: string) => c.find(x => x.id === id);

export function SmtpPanel({ connections, perform }: { connections: AdvancedConnection[]; perform: Perform }) {
  const { t } = useI18n();
  const conn = find(connections, 'smtp');
  const st = conn?.settings;
  const initial = () => ({ host: st?.host || '', port: st?.port === 465 ? '465' : '587', secure: st?.port === 465 ? true : st?.port === 587 ? false : false, username: st?.username || '', password: '', from: st?.from || '' });
  const [f, setF] = useState(initial);
  const [sessionOnly, setSessionOnly] = useState(conn?.configured ? Boolean(conn.sessionOnly) : true);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [rcpt, setRcpt] = useState('');
  const [rname, setRname] = useState('');
  const [agree, setAgree] = useState(false);
  const [tBusy, setTBusy] = useState(false);
  const testSubmitting = useRef(false);
  const [tErr, setTErr] = useState('');
  const [tOk, setTOk] = useState('');
  const sig = JSON.stringify([st, conn?.configured, conn?.sessionOnly]);
  useEffect(() => {
    if (dirty.current) return;
    setF(p => ({ ...p, host: st?.host || '', port: st?.port === 465 ? '465' : '587', secure: st?.port === 465, username: st?.username || '', from: st?.from || '' }));
    setSessionOnly(conn?.configured ? Boolean(conn.sessionOnly) : true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const desktop = isDesktop || Boolean(window.socialOmni?.isDesktop);
  const stage = (conn?.stage || '').toLowerCase();
  const expired = /expired/i.test(conn?.error || '');
  const testing = stage === 'testing';
  const set = (k: string, v: string | boolean) => { dirty.current = true; setF(p => ({ ...p, [k]: v })); };
  const setPort = (p: string) => { dirty.current = true; setF(x => ({ ...x, port: p, secure: p === '465' })); };
  const setSecure = (s: boolean) => { dirty.current = true; setF(x => ({ ...x, secure: s, port: s ? '465' : '587' })); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!desktop) return; setBusy(true); setErr(''); setOk('');
    try { await perform('PUT', '/advanced/connections/smtp', { host: f.host.trim(), port: f.secure ? 465 : 587, secure: f.secure, username: f.username.trim(), password: f.password, from: f.from.trim(), sessionOnly }); dirty.current = false; setOk(t('SMTP settings saved. A connection test is running; check its status below.')); }
    catch (x) { setErr(msg(x, t)); } finally { setF(p => ({ ...p, password: '' })); setBusy(false); }
  };
  const remove = async () => { setBusy(true); setErr(''); try { await perform('DELETE', '/advanced/connections/smtp'); dirty.current = false; setF({ host: '', port: '587', secure: false, username: '', password: '', from: '' }); setSessionOnly(true); setOk(t('SMTP credentials removed.')); } catch (x) { setErr(msg(x, t)); } finally { setF(p => ({ ...p, password: '' })); setBusy(false); } };
  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desktop || !agree || !conn?.configured || testing || busy || testSubmitting.current) return;
    setTErr(''); setTOk('');
    const r = rcpt.trim();
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(r) || r.length > 254) { setTErr(t('Enter a valid test recipient email.')); return; }
    if (/[<>\r\n]/.test(rname) || rname.length > 150) { setTErr(t('Recipient name must not contain angle brackets or newlines.')); return; }
    testSubmitting.current = true; setTBusy(true);
    try { await perform('POST', '/advanced/smtp/test-message', { recipient: r, ...(rname.trim() ? { recipientName: rname.trim() } : {}), approved: true }); setTOk(t('Test email queued. Check the task and its results for “Accepted by the server”. Accepted does not mean delivered.')); }
    catch (x) { setTErr(`${msg(x, t)} ${t('Check the task list before trying again; the app does not retry automatically.')}`); }
    finally { testSubmitting.current = false; setAgree(false); setTBusy(false); }
  };
  const off = !desktop;
  const chip = expired ? t('Expired') : !conn?.configured ? t('Not configured') : testing ? t('Testing…') : conn.connected ? `${conn.label} · ${t('Connected')}` : `${conn.label} · ${t(conn.stage)}`;
  return <section className="wa-card" aria-label={t('SMTP connection')} data-testid="panel-adv-smtp">
    <div className="wa-row" style={{ justifyContent: 'space-between' }}><div><h2><Mail size={15} style={{ verticalAlign: -2 }} /> {t('SMTP connection')}</h2><p className="wa-sub">{t('Your own mail server settings. The password is never returned after saving.')}</p></div><span className={`wa-chip ${conn?.connected ? 'green' : expired ? 'red' : 'amber'}`} data-testid="status-adv-smtp">{chip}</span></div>
    {off && <p className="adv-note" role="note" data-testid="note-smtp-desktop">{t(NATIVE_NOTE)}</p>}
    {conn?.error && <p className="wa-err" role="alert">{t(conn.error)}</p>}
    <p className="adv-note">{t('The server accepting a message does not mean it was delivered. Bounces and spam filtering happen later and are not tracked here.')}</p>
    <form onSubmit={save} autoComplete="off"><fieldset disabled={off} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="wa-grid2">
      <label className="wa-lbl">{t('Host')}<input className="field-input" value={f.host} onChange={e => set('host', e.target.value)} placeholder={t('smtp.yourprovider.com')} data-testid="input-smtp-host" /></label>
      <label className="wa-lbl">{t('Port')}<select className="field-select" style={{ width: '100%' }} value={f.port} onChange={e => setPort(e.target.value)} data-testid="input-smtp-port"><option value="587">587 · STARTTLS</option><option value="465">465 · SSL/TLS</option></select></label>
      <label className="wa-lbl">{t('Username')}<input className="field-input" value={f.username} onChange={e => set('username', e.target.value)} autoComplete="off" data-testid="input-smtp-user" /></label>
      <label className="wa-lbl">{t('Password')}<input className="field-input" type="password" value={f.password} onChange={e => set('password', e.target.value)} placeholder={conn?.configured ? t('Leave empty to keep saved password') : ''} autoComplete="new-password" data-testid="input-smtp-password" /></label>
      <label className="wa-lbl">{t('From address')}<input className="field-input" type="email" value={f.from} onChange={e => set('from', e.target.value)} placeholder={t('you@yourdomain.com')} data-testid="input-smtp-from" /></label></div>
      <label className="check-row"><input type="checkbox" checked={f.secure} onChange={e => setSecure(e.target.checked)} data-testid="check-smtp-secure" />{t('Use SSL/TLS from the start (port 465). Off uses port 587.')}</label>
      <label className="check-row"><input type="checkbox" checked={sessionOnly} onChange={e => { dirty.current = true; setSessionOnly(e.target.checked); }} data-testid="check-smtp-session" />{t('Keep credentials in memory for this session only')}</label>
      <p className="adv-note">{sessionOnly ? t('Session-only credentials are kept in memory and expire when you close the app. You will need to enter them again next time.') : t('Credentials are saved on this computer, encrypted by your operating system, and remain after closing the app.')} {t('Changing this setting replaces the previously stored credentials, so enter the password again.')}</p></fieldset>
      {err && <p className="wa-err" role="alert" data-testid="error-adv-smtp">{err}</p>}{ok && <p className="wa-sub" role="status">{ok}</p>}
      <div className="form-actions"><button type="button" className="button button-danger" disabled={off || busy || !conn?.configured} onClick={() => void remove()} data-testid="button-smtp-remove"><Trash2 /> {t('Remove')}</button><button className="button button-primary" disabled={off || busy || !f.host || !f.from} data-testid="button-smtp-save">{busy ? t('Testing…') : t('Save and test')}</button></div></form>
    <form onSubmit={sendTest} autoComplete="off" style={{ marginTop: 18, borderTop: '1px solid hsl(var(--border))', paddingTop: 14 }} data-testid="form-smtp-test">
      <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>{t('Send a test email')}</h3>
      <fieldset disabled={off} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="wa-grid2">
        <label className="wa-lbl">{t('Test recipient')}<input className="field-input" type="email" maxLength={254} value={rcpt} onChange={e => setRcpt(e.target.value)} placeholder="you@example.com" data-testid="input-smtp-test-recipient" /></label>
        <label className="wa-lbl">{t('Recipient name (optional)')}<input className="field-input" maxLength={150} value={rname} onChange={e => setRname(e.target.value)} data-testid="input-smtp-test-name" /></label></div>
        <label className="check-row"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} data-testid="check-smtp-test-consent" />{t('I permit sending one test email to this address.')}</label></fieldset>
      {tErr && <p className="wa-err" role="alert" data-testid="error-smtp-test">{tErr}</p>}{tOk && <p className="wa-sub" role="status" data-testid="status-smtp-test">{tOk}</p>}
      <div className="form-actions"><button className="button button-primary" disabled={off || tBusy || !agree || !rcpt.trim() || !conn?.configured || testing} data-testid="button-smtp-test-send"><Send /> {tBusy ? t('Queuing…') : t('Queue test email')}</button></div></form>
  </section>;
}

export function TelegramPanel({ connections, perform }: { connections: AdvancedConnection[]; perform: Perform }) {
  const { t } = useI18n();
  const conn = find(connections, 'telegram');
  const [api, setApi] = useState({ id: '', hash: '' });
  const [phone, setPhone] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!window.socialOmni) return null;
  const stage = conn?.stage || 'absent';
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); } catch (x) { setErr(msg(x, t)); } finally { setBusy(false); } };
  const saveKeys = (e: React.FormEvent) => { e.preventDefault(); void run(async () => { await perform('PUT', '/advanced/connections/telegram', { apiId: Number(api.id), apiHash: api.hash }); setApi({ id: '', hash: '' }); }).finally(() => setApi(p => ({ ...p, hash: '' }))); };
  const auth = (action: 'start' | 'code' | 'password', value: string) => run(async () => { try { await perform('POST', '/advanced/telegram/auth', { action, value }); } finally { setSecret(''); } if (action === 'start') setPhone(''); });
  return <section className="wa-card" aria-label={t('Telegram connection')} data-testid="panel-adv-telegram">
    <div className="wa-row" style={{ justifyContent: 'space-between' }}><div><h2><Send size={15} style={{ verticalAlign: -2 }} /> {t('Telegram connection')}</h2><p className="wa-sub">{t('Use your own Telegram API credentials. The signed-in session is encrypted on this computer.')}</p></div><span className={`wa-chip ${stage === 'connected' ? 'green' : stage === 'error' ? 'red' : 'amber'}`} data-testid="status-adv-telegram">{t(stage)}</span></div>
    <ol className="wa-steps"><li>{t('Sign in at')} <a className="text-link" href="https://my.telegram.org" target="_blank" rel="noreferrer">{t('my.telegram.org')} <ExternalLink size={10} /></a> {t('and open API development tools.')}</li><li>{t('Create an app and copy its api_id and api_hash below.')}</li><li>{t('Enter your phone number, then the login code Telegram sends you (and your 2FA password if asked). There is no session to copy or paste.')}</li></ol>
    {conn?.error && <p className="wa-err" role="alert">{t(conn.error)}</p>}
    {(stage === 'absent' || stage === 'error' || !conn?.configured) && <form onSubmit={saveKeys} autoComplete="off" style={{ marginTop: 10 }}><div className="wa-grid2">
      <label className="wa-lbl">{t('api_id')}<input className="field-input" inputMode="numeric" value={api.id} onChange={e => setApi(p => ({ ...p, id: e.target.value.replace(/\D/g, '') }))} data-testid="input-tg-apiid" /></label>
      <label className="wa-lbl">{t('api_hash')}<input className="field-input" type="password" value={api.hash} onChange={e => setApi(p => ({ ...p, hash: e.target.value }))} autoComplete="new-password" placeholder={conn?.configured ? t('Leave empty to keep saved hash') : ''} data-testid="input-tg-apihash" /></label></div>
      <div className="form-actions" style={{ marginTop: 10 }}><button className="button button-primary" disabled={busy || !api.id} data-testid="button-tg-save">{t('Save API credentials')}</button></div></form>}
    {conn?.configured && ['ready', 'error'].includes(stage) && <form onSubmit={e => { e.preventDefault(); void auth('start', phone.trim()); }} style={{ marginTop: 10 }}><label className="wa-lbl">{t('Phone number')}<input className="field-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+14155550123" data-testid="input-tg-phone" /></label><div className="form-actions" style={{ marginTop: 10 }}><button className="button button-primary" disabled={busy || !phone.trim()} data-testid="button-tg-start"><KeyRound /> {t('Send login code')}</button></div></form>}
    {stage === 'connecting' && <p className="wa-sub" role="status" style={{ marginTop: 10 }}>{t('Connecting to Telegram…')}</p>}
    {(stage === 'code' || stage === 'password') && <form onSubmit={e => { e.preventDefault(); void auth(stage === 'code' ? 'code' : 'password', secret); }} style={{ marginTop: 10 }} data-testid={`form-tg-${stage}`}><label className="wa-lbl">{stage === 'code' ? t('Login code from Telegram') : t('Two-step verification password')}<input autoFocus className="field-input" type={stage === 'code' ? 'text' : 'password'} inputMode={stage === 'code' ? 'numeric' : undefined} autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} data-testid="input-tg-secret" /></label><div className="form-actions" style={{ marginTop: 10 }}><button className="button button-primary" disabled={busy || !secret} data-testid="button-tg-verify">{t('Continue')}</button></div></form>}
    {err && <p className="wa-err" role="alert" data-testid="error-adv-telegram">{err}</p>}
    {conn?.configured && <div className="form-actions"><button className="button button-danger" disabled={busy} onClick={() => void run(() => perform('DELETE', '/advanced/connections/telegram'))} data-testid="button-tg-remove"><Trash2 /> {t('Remove credentials and session')}</button></div>}
  </section>;
}
