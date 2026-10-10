import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { isDesktop } from '@/lib/persistence';
import type { WaAiSettings } from '@workspace/api-client-react';
import type { ApiState } from '@/lib/api';

type Perform = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>;
export function SmartReplySettings({ ai, perform }: { ai?: WaAiSettings; perform: Perform }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(ai?.enabled ?? false);
  const [instructions, setInstructions] = useState(ai?.instructions ?? '');
  const [key, setKey] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!dirty) { setEnabled(ai?.enabled ?? false); setInstructions(ai?.instructions ?? ''); } }, [ai?.revision, dirty]);
  async function save(removeKey = false) {
    setBusy(true); setMessage('');
    try {
      await perform('PUT', '/suite/ai', { enabled: removeKey ? false : enabled, instructions, ...(key && !removeKey ? { key } : {}), removeKey });
      setKey(''); setDirty(false); if (removeKey) setEnabled(false);
      setMessage(t('Saved. Keyword rules remain the default and take priority.'));
    } catch (e) { setMessage(e instanceof Error ? e.message : t('Could not save.')); }
    finally { setBusy(false); }
  }
  return <section className="setting-card" id="smart-replies">
    <div className="setting-head"><div><strong>{t('Optional OpenAI smart replies')}</strong><p>{t('Keyword rules always run first. AI answers unmatched messages only when enabled for opted-in clients. Chat text and recent context are sent to OpenAI; provider charges apply.')}</p></div></div>
    {!isDesktop && <p className="wa-sub">{t('Key storage is available only in the desktop app with native OS encryption.')}</p>}
    <label className="wa-field"><span>{t('OpenAI API Key')}</span><input type="password" autoComplete="off" spellCheck={false} value={key} disabled={!isDesktop || busy} placeholder={ai?.hasKey ? t('Key saved securely — leave blank to keep it') : 'sk-…'} onChange={e => { setKey(e.target.value); setDirty(true); }} data-testid="input-openai-key" /></label>
    <label className="check-row"><input type="checkbox" checked={enabled} disabled={!isDesktop || busy} onChange={e => { setEnabled(e.target.checked); setDirty(true); }} data-testid="check-openai-enabled" />{t('Enable AI replies for unmatched messages')}</label>
    <label className="wa-field"><span>{t('Business instructions for AI')}</span><textarea rows={3} maxLength={2000} value={instructions} disabled={!isDesktop || busy} onChange={e => { setInstructions(e.target.value); setDirty(true); }} /></label>
    <p className="wa-sub">{t('Model: gpt-4o-mini. Keys are encrypted locally, never exported or returned by the API. Start the unread inbox listener to receive replies.')}</p>
    <div className="form-actions"><button className="button button-primary" disabled={!isDesktop || busy || !dirty} onClick={() => void save()} data-testid="button-save-openai">{t('Save')}</button><button className="button" disabled={!isDesktop || busy || !ai?.hasKey} onClick={() => void save(true)}>{t('Remove saved key')}</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}

export function TextMenuBuilder({ perform }: { perform: Perform }) {
  const { t } = useI18n();
  const [keyword, setKeyword] = useState('menu');
  const [menu, setMenu] = useState(t('Reply 1 for Sales, 2 for Support.'));
  const [sales, setSales] = useState('');
  const [support, setSupport] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true); setMessage('');
    try { await perform('PUT', '/suite/menu', { keyword, menu, sales, support }); setMessage(t('Menu saved. Its three rules are available below for editing or disabling.')); }
    catch (e) { setMessage(e instanceof Error ? e.message : t('Could not save.')); }
    finally { setBusy(false); }
  }
  return <details className="setting-card"><summary>{t('Set up a QR text menu')}</summary>
    <p>{t('Text menus work with your QR session, without Meta Cloud API. Choices match exactly, including Arabic digits. Saving updates the three menu rules; other keyword rules stay unchanged.')}</p>
    <label className="wa-field"><span>{t('Menu keyword')}</span><input value={keyword} maxLength={200} onChange={e => setKeyword(e.target.value)} /></label>
    <label className="wa-field"><span>{t('Menu text')}</span><textarea value={menu} maxLength={2000} onChange={e => setMenu(e.target.value)} /></label>
    <label className="wa-field"><span>{t('Reply to choice 1 — Sales')}</span><textarea value={sales} maxLength={2000} onChange={e => setSales(e.target.value)} /></label>
    <label className="wa-field"><span>{t('Reply to choice 2 — Support')}</span><textarea value={support} maxLength={2000} onChange={e => setSupport(e.target.value)} /></label>
    <button className="button button-primary" disabled={busy || !keyword.trim() || !menu.trim() || !sales.trim() || !support.trim()} onClick={() => void save()}>{t('Save text menu')}</button>
    {message && <p role="status">{message}</p>}
  </details>;
}
