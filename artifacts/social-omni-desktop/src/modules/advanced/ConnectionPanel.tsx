import { useState } from 'react';
import type { AdvancedConnection } from '@workspace/api-client-react';
import type { ApiState } from '@/lib/api';
import { ExternalLink, KeyRound, Mail, Send, Trash2 } from 'lucide-react';
import { msg } from './config';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
const find = (c: AdvancedConnection[], id: string) => c.find(x => x.id === id);

export function SmtpPanel({ connections, perform }: { connections: AdvancedConnection[]; perform: Perform }) {
  const conn = find(connections, 'smtp');
  const [f, setF] = useState({ host: '', port: '587', secure: false, username: '', password: '', from: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  if (!window.socialOmni) return null;
  const set = (k: string, v: string | boolean) => setF(p => ({ ...p, [k]: v }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(''); setOk('');
    try { await perform('PUT', '/advanced/connections/smtp', { host: f.host.trim(), port: Number(f.port), secure: f.secure, username: f.username.trim(), password: f.password, from: f.from.trim() }); setF(p => ({ ...p, password: '' })); setOk('SMTP settings saved. A connection test is running; check its status below.'); }
    catch (x) { setErr(msg(x)); setF(p => ({ ...p, password: '' })); } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await perform('DELETE', '/advanced/connections/smtp'); setOk('SMTP credentials removed.'); } catch (x) { setErr(msg(x)); } finally { setBusy(false); } };
  return <section className="wa-card" aria-label="SMTP connection" data-testid="panel-adv-smtp">
    <div className="wa-row" style={{ justifyContent: 'space-between' }}><div><h2><Mail size={15} style={{ verticalAlign: -2 }} /> SMTP connection</h2><p className="wa-sub">Your own mail server login. It stays on this computer, encrypted, and is never shown again.</p></div><span className={`wa-chip ${conn?.connected ? 'green' : 'amber'}`} data-testid="status-adv-smtp">{conn?.configured ? `${conn.label} · ${conn.stage}` : 'Not configured'}</span></div>
    {conn?.error && <p className="wa-err" role="alert">{conn.error}</p>}
    <p className="adv-note">The server accepting a message does not mean it was delivered. Bounces and spam filtering happen later and are not tracked here.</p>
    <form onSubmit={save} autoComplete="off"><div className="wa-grid2">
      <label className="wa-lbl">Host<input className="field-input" value={f.host} onChange={e => set('host', e.target.value)} placeholder="smtp.yourprovider.com" data-testid="input-smtp-host" /></label>
      <label className="wa-lbl">Port<input className="field-input" type="number" value={f.port} onChange={e => set('port', e.target.value)} data-testid="input-smtp-port" /></label>
      <label className="wa-lbl">Username<input className="field-input" value={f.username} onChange={e => set('username', e.target.value)} autoComplete="off" data-testid="input-smtp-user" /></label>
      <label className="wa-lbl">Password<input className="field-input" type="password" value={f.password} onChange={e => set('password', e.target.value)} placeholder={conn?.configured ? 'Leave empty to keep saved password' : ''} autoComplete="new-password" data-testid="input-smtp-password" /></label>
      <label className="wa-lbl">From address<input className="field-input" type="email" value={f.from} onChange={e => set('from', e.target.value)} placeholder="you@yourdomain.com" data-testid="input-smtp-from" /></label></div>
      <label className="check-row"><input type="checkbox" checked={f.secure} onChange={e => set('secure', e.target.checked)} />Use SSL/TLS from the start (usually port 465)</label>
      {err && <p className="wa-err" role="alert" data-testid="error-adv-smtp">{err}</p>}{ok && <p className="wa-sub" role="status">{ok}</p>}
      <div className="form-actions"><button type="button" className="button button-danger" disabled={busy || !conn?.configured} onClick={() => void remove()} data-testid="button-smtp-remove"><Trash2 /> Remove</button><button className="button button-primary" disabled={busy || !f.host || !f.from} data-testid="button-smtp-save">{busy ? 'Testing…' : 'Save and test'}</button></div></form>
  </section>;
}

export function TelegramPanel({ connections, perform }: { connections: AdvancedConnection[]; perform: Perform }) {
  const conn = find(connections, 'telegram');
  const [api, setApi] = useState({ id: '', hash: '' });
  const [phone, setPhone] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!window.socialOmni) return null;
  const stage = conn?.stage || 'absent';
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(''); try { await fn(); } catch (x) { setErr(msg(x)); } finally { setBusy(false); } };
  const saveKeys = (e: React.FormEvent) => { e.preventDefault(); void run(async () => { await perform('PUT', '/advanced/connections/telegram', { apiId: Number(api.id), apiHash: api.hash }); setApi({ id: '', hash: '' }); }).finally(() => setApi(p => ({ ...p, hash: '' }))); };
  const auth = (action: 'start' | 'code' | 'password', value: string) => run(async () => { try { await perform('POST', '/advanced/telegram/auth', { action, value }); } finally { setSecret(''); } if (action === 'start') setPhone(''); });
  return <section className="wa-card" aria-label="Telegram connection" data-testid="panel-adv-telegram">
    <div className="wa-row" style={{ justifyContent: 'space-between' }}><div><h2><Send size={15} style={{ verticalAlign: -2 }} /> Telegram connection</h2><p className="wa-sub">Use your own Telegram API credentials. The signed-in session is encrypted on this computer.</p></div><span className={`wa-chip ${stage === 'connected' ? 'green' : stage === 'error' ? 'red' : 'amber'}`} data-testid="status-adv-telegram">{stage}</span></div>
    <ol className="wa-steps"><li>Sign in at <a className="text-link" href="https://my.telegram.org" target="_blank" rel="noreferrer">my.telegram.org <ExternalLink size={10} /></a> and open API development tools.</li><li>Create an app and copy its api_id and api_hash below.</li><li>Enter your phone number, then the login code Telegram sends you (and your 2FA password if asked). There is no session to copy or paste.</li></ol>
    {conn?.error && <p className="wa-err" role="alert">{conn.error}</p>}
    {(stage === 'absent' || stage === 'error' || !conn?.configured) && <form onSubmit={saveKeys} autoComplete="off" style={{ marginTop: 10 }}><div className="wa-grid2">
      <label className="wa-lbl">api_id<input className="field-input" inputMode="numeric" value={api.id} onChange={e => setApi(p => ({ ...p, id: e.target.value.replace(/\D/g, '') }))} data-testid="input-tg-apiid" /></label>
      <label className="wa-lbl">api_hash<input className="field-input" type="password" value={api.hash} onChange={e => setApi(p => ({ ...p, hash: e.target.value }))} autoComplete="new-password" placeholder={conn?.configured ? 'Leave empty to keep saved hash' : ''} data-testid="input-tg-apihash" /></label></div>
      <div className="form-actions" style={{ marginTop: 10 }}><button className="button button-primary" disabled={busy || !api.id} data-testid="button-tg-save">Save API credentials</button></div></form>}
    {conn?.configured && ['ready', 'error'].includes(stage) && <form onSubmit={e => { e.preventDefault(); void auth('start', phone.trim()); }} style={{ marginTop: 10 }}><label className="wa-lbl">Phone number<input className="field-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+14155550123" data-testid="input-tg-phone" /></label><div className="form-actions" style={{ marginTop: 10 }}><button className="button button-primary" disabled={busy || !phone.trim()} data-testid="button-tg-start"><KeyRound /> Send login code</button></div></form>}
    {stage === 'connecting' && <p className="wa-sub" role="status" style={{ marginTop: 10 }}>Connecting to Telegram…</p>}
    {(stage === 'code' || stage === 'password') && <form onSubmit={e => { e.preventDefault(); void auth(stage === 'code' ? 'code' : 'password', secret); }} style={{ marginTop: 10 }} data-testid={`form-tg-${stage}`}><label className="wa-lbl">{stage === 'code' ? 'Login code from Telegram' : 'Two-step verification password'}<input autoFocus className="field-input" type={stage === 'code' ? 'text' : 'password'} inputMode={stage === 'code' ? 'numeric' : undefined} autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} data-testid="input-tg-secret" /></label><div className="form-actions" style={{ marginTop: 10 }}><button className="button button-primary" disabled={busy || !secret} data-testid="button-tg-verify">Continue</button></div></form>}
    {err && <p className="wa-err" role="alert" data-testid="error-adv-telegram">{err}</p>}
    {conn?.configured && <div className="form-actions"><button className="button button-danger" disabled={busy} onClick={() => void run(() => perform('DELETE', '/advanced/connections/telegram'))} data-testid="button-tg-remove"><Trash2 /> Remove credentials and session</button></div>}
  </section>;
}
