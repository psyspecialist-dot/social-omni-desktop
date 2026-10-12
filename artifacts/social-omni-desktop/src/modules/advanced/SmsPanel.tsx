import { useEffect, useRef, useState } from 'react';
import { isDesktop } from '@/lib/persistence';
import { useI18n } from '@/i18n';
import type { AdvancedConnection } from '@workspace/api-client-react';
import type { ApiState } from '@/lib/api';
import { estimateSms, isE164ish, renderSms, SMS_TEST_BODY } from '@/lib/sms';
import { ExternalLink, Send, Smartphone, Trash2 } from 'lucide-react';
import { NATIVE_NOTE, msg } from './config';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
const SID = /^AC[0-9a-fA-F]{32}$/, KEY = /^SK[0-9a-fA-F]{32}$/, FROM = /^\+[1-9]\d{6,14}$/;

export default function SmsPanel({ connections, perform }: { connections: AdvancedConnection[]; perform: Perform }) {
  const { t } = useI18n();
  const conn = connections.find(x => x.id === 'twilio');
  const st = conn?.settings;
  const [f, setF] = useState({ accountSid: st?.accountSid || '', apiKeySid: st?.apiKeySid || '', apiKeySecret: '', from: st?.from || '' });
  const [sessionOnly, setSessionOnly] = useState(conn?.configured ? Boolean(conn.sessionOnly) : true);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [rcpt, setRcpt] = useState('');
  const [rname, setRname] = useState('');
  const [agree, setAgree] = useState(false);
  const agreeRef = useRef(false);
  const [tBusy, setTBusy] = useState(false);
  const submitting = useRef(false);
  const [tErr, setTErr] = useState('');
  const [tOk, setTOk] = useState('');
  const sig = JSON.stringify([st, conn?.configured, conn?.sessionOnly]);
  useEffect(() => {
    if (dirty.current) return;
    setF(p => ({ ...p, accountSid: st?.accountSid || '', apiKeySid: st?.apiKeySid || '', from: st?.from || '' }));
    setSessionOnly(conn?.configured ? Boolean(conn.sessionOnly) : true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const desktop = isDesktop || Boolean(window.socialOmni?.isDesktop);
  const off = !desktop;
  const stage = (conn?.stage || '').toLowerCase();
  const expired = /expired/i.test(conn?.error || '') || stage === 'expired';
  const testing = stage === 'testing';
  const set = (k: string, v: string) => { dirty.current = true; setF(p => ({ ...p, [k]: v })); };
  const changed = !conn?.configured || f.accountSid.trim() !== (st?.accountSid || '') || f.apiKeySid.trim() !== (st?.apiKeySid || '') || sessionOnly !== Boolean(conn?.sessionOnly);
  const needSecret = changed || expired;
  const setConsent = (v: boolean) => { agreeRef.current = v; setAgree(v); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!desktop || busy) return; setErr(''); setOk('');
    if (!SID.test(f.accountSid.trim())) { setErr(t('Enter a valid Twilio Account SID and API Key SID.')); return; }
    if (!KEY.test(f.apiKeySid.trim())) { setErr(t('Enter a valid Twilio Account SID and API Key SID.')); return; }
    if (!FROM.test(f.from.trim())) { setErr(t('From must be a +country number such as +14155550123.')); return; }
    if (needSecret && !f.apiKeySecret) { setErr(t('Enter the Twilio API key secret for this account and key.')); return; }
    setBusy(true);
    try { await perform('PUT', '/advanced/connections/twilio', { accountSid: f.accountSid.trim(), apiKeySid: f.apiKeySid.trim(), apiKeySecret: f.apiKeySecret, from: f.from.trim(), sessionOnly }); dirty.current = false; setOk(t('Twilio settings saved. A read-only connection check is running; no SMS is sent.')); }
    catch (x) { setErr(msg(x, t)); } finally { setF(p => ({ ...p, apiKeySecret: '' })); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr(''); setOk('');
    try { await perform('DELETE', '/advanced/connections/twilio'); dirty.current = false; setF({ accountSid: '', apiKeySid: '', apiKeySecret: '', from: '' }); setSessionOnly(true); setOk(t('Twilio credentials removed.')); }
    catch (x) { setErr(msg(x, t)); } finally { setF(p => ({ ...p, apiKeySecret: '' })); setBusy(false); }
  };
  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desktop || !agreeRef.current || !conn?.configured || testing || busy || submitting.current) return;
    setTErr(''); setTOk('');
    const r = rcpt.trim();
    if (!isE164ish(r) || r.length > 40) { setTErr(t('Enter the test recipient with + and the country code.')); return; }
    if (/[<>\r\n]/.test(rname) || rname.length > 150) { setTErr(t('Recipient name must not contain angle brackets or newlines.')); return; }
    submitting.current = true; setTBusy(true);
    try { await perform('POST', '/advanced/sms/test-message', { recipient: r, ...(rname.trim() ? { recipientName: rname.trim() } : {}), approved: true }); setTOk(t('Test SMS queued. Check the task and its results; queued is not sent or delivered, and charges may apply.')); }
    catch (x) { setTErr(`${msg(x, t)} ${t('Review the task list and results before trying again; the app does not retry automatically.')}`); }
    finally { submitting.current = false; setConsent(false); setTBusy(false); }
  };
  const chip = expired ? t('Expired') : !conn?.configured ? t('Not configured') : testing ? t('Testing…') : conn.connected ? `${conn.label} · ${t('Connected')}` : `${conn.label} · ${t(conn.stage || 'error')}`;
  const est = estimateSms(renderSms(SMS_TEST_BODY, rname.trim() || '', rcpt.trim() || '+15551234567'));
  return <section className="wa-card" aria-label={t('Twilio connection')} data-testid="panel-adv-sms">
    <div className="wa-row" style={{ justifyContent: 'space-between' }}><div><h2><Smartphone size={15} style={{ verticalAlign: -2 }} /> {t('Twilio connection')}</h2><p className="wa-sub">{t('Your own Twilio account. The API key secret is never returned after saving.')}</p></div><span className={`wa-chip ${conn?.connected ? 'green' : expired || stage === 'error' ? 'red' : 'amber'}`} data-testid="status-adv-sms">{chip}</span></div>
    {off && <p className="adv-note" role="note" data-testid="note-sms-desktop">{t(NATIVE_NOTE)} {t('A Replit connection does not transfer into the standalone desktop app, and paid sending is never enabled through this unauthenticated hosted page. Enter the API key inside the desktop app.')}</p>}
    {conn?.error && <p className="wa-err" role="alert">{t(conn.error)}</p>}
    <p className="adv-note">{t('Create an API key in the')} <a className="text-link" href="https://console.twilio.com" target="_blank" rel="noreferrer">console.twilio.com <ExternalLink size={10} /></a> {t('with Messaging read and send permissions. From must be a Twilio-owned SMS-capable number. Trial accounts reach only verified recipients, and regional registration may apply. Never share secrets in chat.')}</p>
    <p className="adv-note">{t('Connected means only that authentication and read access worked. No message was sent and send permission is not verified; use one approved test.')}</p>
    <form onSubmit={save} autoComplete="off"><fieldset disabled={off} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="wa-grid2">
      <label className="wa-lbl">{t('Twilio Account SID')}<input className="field-input adv-mono" value={f.accountSid} onChange={e => set('accountSid', e.target.value)} placeholder="AC…" autoComplete="off" data-testid="input-sms-account" /></label>
      <label className="wa-lbl">{t('Twilio API Key SID')}<input className="field-input adv-mono" value={f.apiKeySid} onChange={e => set('apiKeySid', e.target.value)} placeholder="SK…" autoComplete="off" data-testid="input-sms-key" /></label>
      <label className="wa-lbl">{t('Twilio API key secret')}<input className="field-input" type="password" value={f.apiKeySecret} onChange={e => setF(p => ({ ...p, apiKeySecret: e.target.value }))} placeholder={conn?.configured && !needSecret ? t('Leave empty to keep the saved secret') : ''} autoComplete="new-password" data-testid="input-sms-secret" /></label>
      <label className="wa-lbl">{t('From number')}<input className="field-input adv-mono" value={f.from} onChange={e => set('from', e.target.value)} placeholder="+14155550123" data-testid="input-sms-from" /></label></div>
      <label className="check-row"><input type="checkbox" checked={sessionOnly} onChange={e => { dirty.current = true; setSessionOnly(e.target.checked); }} data-testid="check-sms-session" />{t('Keep the API key secret in memory for this session only')}</label>
      <p className="adv-note">{sessionOnly ? t('Session-only credentials are kept in memory and expire when you close the app or service. You will need to enter them again next time.') : t('The secret is saved on this computer, encrypted by your operating system, and remains after closing the app.')} {t('Changing the account, key or this setting requires entering the secret again.')}</p></fieldset>
      {err && <p className="wa-err" role="alert" data-testid="error-adv-sms">{err}</p>}{ok && <p className="wa-sub" role="status">{ok}</p>}
      <div className="form-actions"><button type="button" className="button button-danger" disabled={off || busy || !conn?.configured} onClick={() => void remove()} data-testid="button-sms-remove"><Trash2 /> {t('Remove')}</button><button className="button button-primary" disabled={off || busy || !f.accountSid || !f.apiKeySid || !f.from || (needSecret && !f.apiKeySecret)} data-testid="button-sms-save">{busy ? t('Testing…') : t('Save and verify')}</button></div></form>
    <form onSubmit={sendTest} autoComplete="off" style={{ marginTop: 18, borderTop: '1px solid hsl(var(--border))', paddingTop: 14 }} data-testid="form-sms-test">
      <h3 style={{ fontSize: 13, margin: '0 0 8px' }}>{t('Send a test SMS')}</h3>
      <p className="adv-note" data-testid="note-sms-test-body">{t('Exact text')}: <span className="adv-mono">{SMS_TEST_BODY}</span><br />{t('Estimated {n} segment(s), {enc}. Names can change the estimate; Twilio bills per segment and this is not an exact price.', { n: est.segments, enc: est.encoding })}</p>
      <fieldset disabled={off} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><div className="wa-grid2">
        <label className="wa-lbl">{t('Test recipient')}<input className="field-input adv-mono" maxLength={40} value={rcpt} onChange={e => setRcpt(e.target.value)} placeholder="+14155550123" data-testid="input-sms-test-recipient" /></label>
        <label className="wa-lbl">{t('Recipient name (optional)')}<input className="field-input" maxLength={150} value={rname} onChange={e => setRname(e.target.value)} data-testid="input-sms-test-name" /></label></div>
        <label className="check-row"><input type="checkbox" checked={agree} onChange={e => setConsent(e.target.checked)} data-testid="check-sms-test-consent" />{t('I permit sending one paid test SMS to this number, and the recipient agreed to receive it.')}</label></fieldset>
      {tErr && <p className="wa-err" role="alert" data-testid="error-sms-test">{tErr}</p>}{tOk && <p className="wa-sub" role="status" data-testid="status-sms-test">{tOk}</p>}
      <div className="form-actions"><button className="button button-primary" disabled={off || tBusy || !agree || !rcpt.trim() || !conn?.configured || testing} data-testid="button-sms-test-send"><Send /> {tBusy ? t('Queuing…') : t('Queue test SMS')}</button></div></form>
  </section>;
}
