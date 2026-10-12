import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { useHashLocation } from 'wouter/use-hash-location';
import { isDesktop, openOfficialPlatform, readLocal } from '@/lib/persistence';
import { apiRequest, type ApiState, type MediaAsset, type SimulationJob, type SimulationSettings, type LeadWorkspace, type SimulationAnalytics, type LicenseStatus } from '@/lib/api';
import LicenseSettings, { LicenseNotice } from '@/components/LicenseSettings';
import WhatsApp from '@/WhatsApp';
import Leads from '@/Leads';
import MediaUpload from '@/components/MediaUpload';
import SimQueue from '@/components/SimQueue';
import LiveAutomation from '@/components/LiveAutomation';
import WhatsAppSuite from '@/modules/WhatsAppSuite';
import { SmartReplySettings } from '@/components/SmartReplySettings';
import type { WaSuite, AdvancedSuite } from '@workspace/api-client-react';
import AdvancedModule from '@/modules/advanced/AdvancedModule';
import NetworkHub, { type HubData } from '@/components/NetworkHub';
import { STORAGE_KEY, THEME_KEY, platforms, statuses, isoIn, seedStore, parseStore, type CampaignStatus, type Campaign, type Account, type Contact, type Store } from '@/lib/workspace';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { I18nProvider, Ltr, makeT, useI18n, localeFor, normalizeLang, type Lang } from '@/i18n';
import Help from '@/pages/Help';
import '@/i18n/i18n.css';
import { Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity, AlertCircle, ArrowUpRight, AtSign, CalendarClock, Check,
  CheckCircle2, CircleHelp, ClipboardList, ExternalLink, FileText,
   LayoutDashboard, ListFilter, Menu, Moon, MapPin,
   Database, Download, Languages, BookOpen, Mail, Smartphone, MessageCircle, Send, Pause, Play, Pencil, Plus, Search, Settings2, ShieldCheck, Sun, Trash2, Users, X,
} from 'lucide-react';

const queryClient = new QueryClient();
let uiLang: Lang = 'en';
const formatDate = (value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? makeT(uiLang)('Not scheduled') : new Intl.DateTimeFormat(localeFor(uiLang), options).format(date);
};
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(localeFor(uiLang), { hour: 'numeric', minute: '2-digit' }).format(date);
};
const titleForPath: Record<string, string> = { '/': 'Overview & Analytics', '/campaigns': 'Campaigns', '/automation': 'Facebook & Instagram Automation', '/accounts': 'Accounts Manager', '/whatsapp': 'WhatsApp Marketing', '/leads': 'Google Maps Lead Extractor', '/contacts': 'Contacts', '/settings': 'Settings & License', '/wafilter': 'WaFilter', '/wa-crm': 'WA-CRM', '/chatbots': 'Auto-Reply / Chatbot', '/extractors': 'B2B & Data Extractors', '/multi-platform': 'Telegram & Facebook Automation', '/facebook': 'Facebook Groups', '/email': 'Email Marketing', '/sms': 'SMS Marketing', '/help': 'Help & Guidelines' };

function Workspace() {
  const [store, setStore] = useState<Store>(seedStore);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [lang, setLang] = useState<Lang>('en');
  const langRef = useRef<Lang>('en');
  const langWrites = useRef(0);
  const t = useMemo(() => makeT(lang), [lang]);
  uiLang = lang;
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SimulationSettings>({ theme: 'dark', keywords: '', delayMin: 5, delayMax: 12, phoneNumbers: '', messageContent: '', mediaId: null, accountId: null, licenseKey: '', language: 'en' });
  const [leads, setLeads] = useState<LeadWorkspace>({ keyword: '', city: '', targetCount: 10, results: [] });
  const [analytics, setAnalytics] = useState<SimulationAnalytics>({ messagesSent: 0 });
  const [license, setLicense] = useState<LicenseStatus | undefined>(undefined);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [jobs, setJobs] = useState<SimulationJob[]>([]);
  const [waSuite, setWaSuite] = useState<WaSuite>({ filter: { source: '', results: [] }, threads: [], rules: [] });
  const [advanced, setAdvanced] = useState<AdvancedSuite>({ tasks: [], results: [], connections: [] });
  const writes = useRef(0);
  const revision = useRef(0);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [dialog, setDialog] = useState<{ type: 'campaign' | 'account' | 'contact'; item?: Campaign | Account | Contact } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);
  const [path, setPath] = useLocation();
  const applyState = (data: ApiState) => {
    setStore(data.store);
    if (data.license) setLicense(data.license);
    setSettings(data.settings);
    setJobs(data.jobs);
    setWaSuite(data.waSuite || { filter: { source: '', results: [] }, threads: [], rules: [] });
    setAdvanced(data.advanced || { tasks: [], results: [], connections: [] });
    setMedia(data.media || []);
    setLeads(data.leads);
    setAnalytics(data.analytics);
    setTheme(data.settings.theme);
    const saved = normalizeLang(data.settings.language);
    // A saved language never overrides an in-flight optimistic language change.
    if (saved && !langWrites.current) { langRef.current = saved; setLang(saved); }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data = await apiRequest('GET', '/state');
      if (!data.initialized) {
        const [records, oldTheme] = await Promise.all([readLocal(STORAGE_KEY), readLocal(THEME_KEY)]);
        data = records === null
          ? await apiRequest('POST', '/initialize')
          : await apiRequest('POST', '/import', { store: parseStore(records), theme: oldTheme });
      }
      if (!cancelled) { applyState(data); setReady(true); }
    })().catch(error => {
      if (!cancelled) setStorageError(`${makeT(langRef.current)('Cannot load local records:')} ${error instanceof Error ? error.message : makeT(langRef.current)('Storage is unavailable.')}`);
    });
    return () => { cancelled = true; };
  }, []);
  const perform = async (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => {
    writes.current++;
    setSaving(true);
    try {
      const data = await apiRequest(method, route, body);
      revision.current++;
      applyState(data);
      setStorageError('');
      return data;
    } finally {
      writes.current--;
      if (!writes.current) setSaving(false);
    }
  };
  const report = (error: unknown) => {
    const message = error instanceof Error ? t(error.message) : t('The local request failed.');
    setStorageError(t('Changes were not saved: {message}', { message }));
    setToast(message);
  };
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let refreshSequence = 0;
    const refresh = () => {
      if (writes.current) return;
      const sequence = ++refreshSequence;
      const start = revision.current;
      apiRequest('GET', '/state').then(data => {
        if (!cancelled && sequence === refreshSequence && !writes.current && start === revision.current) { applyState(data); setStorageError(''); }
      }).catch(error => { if (!cancelled) setStorageError(t('Live updates unavailable: {error}. Saved records have not been replaced.', { error: String(error) })); });
    };
    const unsubscribe = window.socialOmni?.onBrowserEvent?.(refresh);
    const timer = window.setInterval(() => {
      refresh();
    }, 1000);
    return () => { cancelled = true; unsubscribe?.(); window.clearInterval(timer); };
  }, [ready]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  useEffect(() => { document.title = 'Social Najhin'; }, []);
  useEffect(() => { const el = document.documentElement; el.lang = lang; el.dir = lang === 'ar' ? 'rtl' : 'ltr'; }, [lang]);
  const changeLanguage = () => {
    if (langWrites.current) return;
    const prev = langRef.current;
    const next: Lang = prev === 'ar' ? 'en' : 'ar';
    langRef.current = next; setLang(next);
    langWrites.current++;
    perform('PUT', '/settings', { language: next }).catch(error => {
      if (langRef.current === next) { langRef.current = prev; setLang(prev); }
      report(error);
    }).finally(() => { langWrites.current--; });
  };
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer); }, [toast]);
  const handoff = (platform: string) => {
    openOfficialPlatform(platform).then(() => perform('POST', '/activity', { platform }))
      .catch(report);
  };
  const saveCampaign = async (draft: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    await perform(id ? 'PATCH' : 'POST', id ? `/campaigns/${id}` : '/campaigns', draft);
    setDialog(null);
  };
  const saveAccount = async (draft: Omit<Account, 'id'>, id?: string) => {
    await perform(id ? 'PATCH' : 'POST', id ? `/accounts/${id}` : '/accounts', draft);
    setDialog(null);
  };
  const saveContact = async (draft: Omit<Contact, 'id' | 'createdAt'>, id?: string) => {
    await perform(id ? 'PATCH' : 'POST', id ? `/contacts/${id}` : '/contacts', draft);
    setDialog(null);
  };
  const remove = (kind: 'campaign' | 'account' | 'contact', item: Campaign | Account | Contact) => {
    const name = 'title' in item ? item.title : 'displayLabel' in item ? item.displayLabel : item.name;
    setConfirm({ title: t('Remove {name}?', { name }), body: `${t('This record will be permanently removed from this workspace.')}${kind === 'account' && isDesktop ? ` ${t('Its local browser profile and saved sign-in session will also be deleted.')}` : ''} ${t('This cannot be undone.')}`, onConfirm: () => {
      void perform('DELETE', `/${kind === 'campaign' ? 'campaigns' : kind === 'account' ? 'accounts' : 'contacts'}/${item.id}`)
        .then(() => setConfirm(null)).catch(report);
    } });
  };
  const saveStatus = (id: string, status: CampaignStatus) => {
    const campaign = store.campaigns.find(c => c.id === id);
    if (!campaign) return;
    if (status === 'Scheduled' && (!campaign.scheduledAt || Number.isNaN(new Date(campaign.scheduledAt).getTime()))) {
      setToast(t('Edit this campaign and choose a valid planned handoff time first.'));
      return;
    }
    void perform('PATCH', `/campaigns/${id}/status`, { status }).catch(report);
  };
  const clearWorkspace = () => setConfirm({ title: t('Clear local workspace?'), body: t('This permanently removes campaigns, accounts, contacts, media, inputs, leads, WaFilter results, CRM notes and chats, chatbot rules, counters, license placeholder, jobs, advanced tasks and results, encrypted SMTP and Telegram connections, activity, and local browser profiles from this workspace. It cannot be undone.'), onConfirm: () => {
    void perform('DELETE', '/state').then(() => setConfirm(null)).catch(report);
  } });
  const runTask = async (kind: 'campaign' | 'whatsapp', campaignId?: string) => {
    if (isDesktop && kind === 'campaign') {
      const campaign = store.campaigns.find(c => c.id === campaignId);
      if (campaign?.platform !== 'Facebook') throw new Error(t('Use the approved live task controls in Telegram & Facebook Automation for this platform.'));
      const accountId = campaign.accountId || store.accounts.find(a => a.platform === 'Facebook' && !a.status.startsWith('Paused'))?.id;
      await perform('POST', '/browser/jobs', { action: 'search', accountId, keywords: campaign.keywords || settings.keywords });
      setPath('/automation');
      return;
    }
    await perform('POST', '/jobs', { kind, campaignId, mode: 'rehearsal' });
  };
  const cancelTask = (id: string) => { void perform('POST', `/jobs/${id}/cancel`).catch(report); };
  const hub: HubData = (() => {
    const count = (kinds: string[]) => advanced.tasks.filter(t => kinds.includes(t.kind));
    const tone = (kinds: string[]): HubData['tones'][string] => { const t = count(kinds); return t.some(x => x.status === 'Failed') ? 'fail' : t.some(x => x.status === 'Needs review') ? 'review' : t.some(x => ['Running', 'Queued'].includes(x.status)) ? 'live' : undefined; };
    const res = (kinds: string[]) => advanced.results.filter(r => kinds.includes(r.kind)).length;
    const ex = ['whatsapp-members', 'maps', 'b2b', 'verify-email'], mp = ['telegram-send', 'telegram-members', 'telegram-channel', 'facebook-search', 'facebook-join', 'facebook-post', 'instagram-post'], fb = ['facebook-search', 'facebook-join', 'facebook-post'], em = ['email-send', 'verify-email'];
    const smsT = advanced.tasks.filter(x => x.kind === 'sms-send'), smsR = advanced.results.filter(r => r.kind === 'sms-send'), smsD = smsR.filter(r => (r.providerStatus || '').toLowerCase() === 'delivered').length;
    const live = (p: string, a?: string) => jobs.some(j => j.platform === p && (!a || j.action === a) && ['Pending', 'Running'].includes(j.status)) ? 'live' as const : undefined;
    return {
      counts: {
        '/whatsapp': t('{n} live sends', { n: analytics.realMessagesSent || 0 }), '/wafilter': t('{n} numbers', { n: waSuite.filter.results.length }), '/wa-crm': t('{n} chats', { n: waSuite.threads.length }), '/chatbots': t('{n} rules', { n: waSuite.rules.length }),
        '/campaigns': t('{n} plans', { n: store.campaigns.length }), '/automation': t('{n} plans', { n: store.campaigns.filter(c => ['Facebook', 'Instagram'].includes(c.platform)).length }),
        '/multi-platform': t('{n} tasks · {r} results', { n: count(mp).length, r: res(mp) }), '/facebook': t('{n} tasks · {r} results', { n: count(fb).length, r: res(fb) }), '/email': t('{n} campaigns', { n: count(['email-send']).length }), '/sms': t('{n} campaigns · {r} results · {d} delivered', { n: smsT.length, r: smsR.length, d: smsD }), '/extractors': t('{n} tasks · {r} results', { n: count(ex).length, r: res(ex) }),
        '/leads': t('{n} saved', { n: leads.results.length }), '/contacts': t('{n} contacts', { n: store.contacts.length }), '/accounts': t('{n} accounts', { n: store.accounts.length }), '/settings': t('Theme · license'), '/help': t('Open the guide'),
      },
      tones: { '/extractors': tone(ex), '/multi-platform': tone(mp), '/facebook': tone(fb), '/email': tone(em), '/sms': tone(['sms-send']), '/whatsapp': live('WhatsApp'), '/wa-crm': live('WhatsApp', 'inbox'), '/wafilter': live('WhatsApp', 'filter'), '/automation': live('Facebook') },
    };
  })();
  if (!ready) return <I18nProvider lang={lang}><main className="page" data-testid="status-storage-loading"><h1>Social Najhin</h1><p role={storageError ? 'alert' : 'status'}>{storageError || t('Loading local workspace…')}</p>{storageError && <button className="button button-secondary" onClick={() => window.location.reload()} data-testid="button-retry-load">{t('Retry without changing saved records')}</button>}</main></I18nProvider>;
  return (
    <I18nProvider lang={lang}><QueryClientProvider client={queryClient}>
      <TooltipProvider>
          <div className="app-shell">
            <Sidebar active={path} open={mobileNav} close={() => setMobileNav(false)} />
            {mobileNav && <button aria-label={t('Close navigation')} className="dialog-backdrop" style={{ zIndex: 20, padding: 0, border: 0 }} onClick={() => setMobileNav(false)} data-testid="button-close-navigation" />}
            <div className="main-area">
              <header className="topbar">
                <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label={t('Open navigation')} data-testid="button-open-navigation"><Menu /></button>
                <div className="crumb">{t('WORKSPACE')} <span style={{ opacity: .5, padding: '0 6px' }}>/</span> {t(titleForPath[path] || 'Workspace')}</div>
                <div className="top-actions">
                  <Link href="/help" className="help-link-top" data-testid="link-help-top" aria-label={t('Help & Guidelines')}><BookOpen size={15} /><span>{t('Guide')}</span></Link>
                  <button type="button" className="lang-toggle" onClick={changeLanguage} lang={lang === 'ar' ? 'en' : 'ar'} aria-label={lang === 'ar' ? 'Switch language to English' : 'التبديل إلى اللغة العربية'} title={lang === 'ar' ? 'Switch language to English' : 'التبديل إلى اللغة العربية'} data-testid="button-toggle-language"><Languages size={15} /><span className="lang-code" dir="ltr"><b className={lang === 'en' ? 'on' : ''}>EN</b> / <b className={lang === 'ar' ? 'on' : ''}>AR</b></span><span className="lang-name">{lang === 'ar' ? 'English' : 'العربية'}</span></button>
                  <button className="icon-button" onClick={() => { void perform('PUT', '/settings', { theme: theme === 'dark' ? 'light' : 'dark' }).catch(report); }} aria-label={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')} data-testid="button-toggle-theme-top">{theme === 'dark' ? <Sun size={16} /> : <Moon size={15} />}</button>
                   <div className="profile-chip"><span className="profile-avatar">SN</span><span>{t('Local workspace')}</span></div>
                </div>
              </header>
               {storageError && <div className="storage-alert" role="alert" data-testid="error-storage-save">{storageError}<button className="button button-secondary" onClick={() => { apiRequest('GET', '/state').then(data => { applyState(data); setStorageError(''); }).catch(report); }} data-testid="button-retry-save">{t('Reconnect')}</button></div>}
              <LicenseNotice license={license} />
              <ErrorBoundary resetKey={path}>
                <Switch>
                  <Route path="/"><NetworkHub data={hub} /><Dashboard jobs={jobs} store={store} leads={leads} analytics={analytics} onStatus={saveStatus} run={id => { void runTask('campaign', id).catch(report); }} /></Route>
                   <Route path="/extractors"><AdvancedModule module="extractors" advanced={advanced} accounts={store.accounts} media={media} perform={perform} /></Route>
                   <Route path="/multi-platform"><AdvancedModule module="multi-platform" advanced={advanced} accounts={store.accounts} media={media} perform={perform} /></Route>
                   <Route path="/facebook"><AdvancedModule module="facebook" advanced={advanced} accounts={store.accounts} media={media} perform={perform} jobs={jobs} /></Route>
                   <Route path="/sms"><AdvancedModule module="sms" advanced={advanced} accounts={store.accounts} media={media} perform={perform} /></Route>
                   <Route path="/email"><AdvancedModule module="email" advanced={advanced} accounts={store.accounts} media={media} perform={perform} /></Route>
                   <Route path="/campaigns"><Campaigns jobs={jobs} store={store} perform={perform} open={item => setDialog({ type: 'campaign', item })} create={() => setDialog({ type: 'campaign' })} remove={item => remove('campaign', item)} status={saveStatus} handoff={handoff} run={id => { void runTask('campaign', id).catch(report); }} /></Route>
                    <Route path="/automation"><Campaigns automation jobs={jobs} store={store} perform={perform} open={item => setDialog({ type: 'campaign', item })} create={() => setDialog({ type: 'campaign' })} remove={item => remove('campaign', item)} status={saveStatus} handoff={handoff} run={id => { void runTask('campaign', id).catch(report); }} /></Route>
                   <Route path="/accounts"><Accounts store={store} open={item => setDialog({ type: 'account', item })} create={() => setDialog({ type: 'account' })} remove={item => remove('account', item)} handoff={handoff} /></Route>
                   <Route path="/whatsapp"><WhatsApp settings={settings} media={media} accounts={store.accounts} jobs={jobs} perform={perform} onSave={async value => { await perform('PUT', '/settings', value); }} onRun={() => runTask('whatsapp')} onCancel={cancelTask} /></Route>
                   <Route path="/wafilter"><WhatsAppSuite view="filter" suite={waSuite} accounts={store.accounts} contacts={store.contacts} jobs={jobs} perform={perform} /></Route>
                   <Route path="/wa-crm"><WhatsAppSuite view="crm" suite={waSuite} accounts={store.accounts} contacts={store.contacts} jobs={jobs} perform={perform} /></Route>
                   <Route path="/chatbots"><WhatsAppSuite view="chatbots" suite={waSuite} accounts={store.accounts} contacts={store.contacts} jobs={jobs} perform={perform} /></Route>
                   <Route path="/leads"><Leads leads={leads} jobs={jobs} perform={perform} onCancel={cancelTask} /></Route>
                  <Route path="/contacts"><Contacts store={store} open={item => setDialog({ type: 'contact', item })} create={() => setDialog({ type: 'contact' })} remove={item => remove('contact', item)} /></Route>
                  <Route path="/settings"><Settings license={license} perform={perform} smartReplies={<SmartReplySettings ai={waSuite.ai} perform={perform} />} settings={settings} saveSettings={async value => { await perform('PUT', '/settings', value); }} theme={theme} setTheme={value => { void perform('PUT', '/settings', { theme: value }).catch(report); }} store={store} clear={clearWorkspace} onToggleLang={changeLanguage} /></Route>
                  <Route path="/help"><Help /></Route>
                  <Route component={NotFound} />
                </Switch>
              </ErrorBoundary>
               <section className="activity-console" aria-label={t('Live local activity log')} data-testid="console-activity"><div className="activity-console-head"><strong><Activity size={13} /> {t('Live execution & activity')}</strong><span data-testid="status-storage">{storageError ? t('Connection issue') : saving ? t('Saving…') : isDesktop ? t('Saved · local SQLite') : t('Saved · preview SQLite')}</span></div>
                 {jobs.slice(0, 3).map(job => <div key={job.id} className="job-line"><span>{job.kind === 'whatsapp' ? 'WhatsApp' : job.kind === 'leads' ? t('Lead extraction') : t('Campaign')} · {t(job.status)}</span><div className="job-progress" role="progressbar" aria-label={t('Task progress')} aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${job.progress}%` }} /></div><span>{job.progress}%</span>{['Pending', 'Running'].includes(job.status) && <button type="button" className="button button-quiet" onClick={() => cancelTask(job.id)} aria-label={t('Cancel task')}>{t('Cancel')}</button>}</div>)}
                  <div role="log" aria-live="polite">{store.activity.slice(0, 6).map(entry => <div className="console-log" key={entry.id}><time>{formatTime(entry.timestamp)}</time><span className={`log-level log-${entry.level}`}>{t(entry.level)}</span><span>{t(entry.message)}</span></div>)}</div></section>
            </div>
          </div>
          {dialog && <EditorDialog automation={path === '/automation'} key={`${dialog.type}-${dialog.item?.id || 'new'}`} kind={dialog.type} item={dialog.item} store={store} media={media} perform={perform}
            close={() => setDialog(null)} saveCampaign={saveCampaign} saveAccount={saveAccount} saveContact={saveContact} />}
          {confirm && <ConfirmDialog title={confirm.title} body={confirm.body} cancel={() => setConfirm(null)} accept={confirm.onConfirm} />}
          {toast && <div className="toast" role="status" data-testid="status-toast">{toast}</div>}
          <Toaster />
      </TooltipProvider>
    </QueryClientProvider></I18nProvider>
  );
}

function App() {
  return <WouterRouter hook={isDesktop ? useHashLocation : undefined} base={isDesktop ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')}><Workspace /></WouterRouter>;
}

function Sidebar({ active, open, close }: { active: string; open: boolean; close: () => void }) {
  const { t } = useI18n();
  const nav = [
    { href: '/', title: 'Overview & Analytics', icon: LayoutDashboard },
    { href: '/campaigns', title: 'Campaigns', icon: ClipboardList },
    { href: '/accounts', title: 'Accounts Manager', icon: AtSign },
    { href: '/automation', title: 'Facebook & Instagram', icon: ClipboardList },
    { href: '/leads', title: 'Google Maps Leads', icon: MapPin },
    { href: '/contacts', title: 'Contacts', icon: Users },
    { href: '/wafilter', title: 'WaFilter', icon: ListFilter },
    { href: '/wa-crm', title: 'WA-CRM', icon: MessageCircle },
    { href: '/chatbots', title: 'Auto-Reply / Chatbot', icon: Activity },
  ];
  return <aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><div className="brand-mark"><img src={`${import.meta.env.BASE_URL}assets/images/app-icon.png`} alt="" width={35} height={35} /></div><div><div className="brand-name">Social Najhin</div><div className="brand-sub">{t('desktop management suite')}</div></div>
      <button className="small-icon" style={{ color: 'inherit', marginInlineStart: 'auto' }} onClick={close} aria-label={t('Close navigation')} data-testid="button-sidebar-close"><X /></button>
    </div>
    <Link href="/help" onClick={close} className={`nav-link nav-help ${active === '/help' ? 'active' : ''}`} data-testid="link-nav-help"><BookOpen /><span>{t('Help & Guidelines')}</span></Link>
    <div className="nav-label">{t('Your workspace')}</div>
    {nav.map(({ href, title, icon: Icon }) => <Link key={href} href={href} onClick={close} className={`nav-link ${active === href ? 'active' : ''}`} data-testid={`link-nav-${title.toLowerCase()}`}><Icon /><span>{t(title)}</span></Link>)}
    <div className="nav-label" style={{ marginTop: 10 }}>{t('Growth tools')}</div>
    {[{ href: '/facebook', title: 'Facebook Groups', icon: Activity }, { href: '/extractors', title: 'B2B & Data Extractors', icon: Database }, { href: '/multi-platform', title: 'Telegram & Facebook', icon: Send }, { href: '/email', title: 'Email Marketing', icon: Mail }, { href: '/sms', title: 'SMS Marketing', icon: Smartphone }].map(({ href, title, icon: Icon }) => <Link key={href} href={href} onClick={close} className={`nav-link ${active === href ? 'active' : ''}`} data-testid={`link-nav-${href.slice(1)}`}><Icon /><span>{t(title)}</span></Link>)}
    <Link href="/whatsapp" onClick={close} className={`nav-link ${active === '/whatsapp' ? 'active' : ''}`} data-testid="link-nav-whatsapp"><MessageCircle /><span>{t('WhatsApp Marketing')}</span></Link>
    <div className="nav-label" style={{ marginTop: 18 }}>{t('Preferences')}</div>
    <Link href="/settings" onClick={close} className={`nav-link ${active === '/settings' ? 'active' : ''}`} data-testid="link-nav-settings"><Settings2 /><span>{t('Settings & License')}</span></Link>
    <div className="side-bottom">
      <div className="nav-label">{t('Privacy by default')}</div>
      <div className="local-indicator"><i className="local-dot" /><div><strong>{isDesktop ? t('Stored on this device') : t('Preview workspace')}</strong><span>{isDesktop ? t('No remote sync') : t('On Replit’s server')}</span></div></div>
    </div>
  </aside>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  const { t } = useI18n();
  return <div className="page-heading"><div><div className="eyebrow">{t(eyebrow)}</div><h1>{t(title)}</h1><p className="heading-sub">{t(subtitle)}</p></div>{action}</div>;
}
function StatusPill({ value }: { value: CampaignStatus }) {
  const { t } = useI18n();
  const styles: Record<CampaignStatus, string> = { 'Ready for review': 'status-ready', Scheduled: 'status-scheduled', Draft: 'status-draft', Paused: 'status-paused', Sent: 'status-sent', Failed: 'status-failed' };
  return <span className={`status ${styles[value]}`} data-testid={`status-campaign-${value.toLowerCase().replaceAll(' ', '-')}`}>{t(value)}</span>;
}
function Dashboard({ jobs, store, leads, analytics, onStatus, run }: { jobs: SimulationJob[]; store: Store; leads: LeadWorkspace; analytics: SimulationAnalytics; onStatus: (id: string, status: CampaignStatus) => void; run: (id: string) => void }) {
  const { t } = useI18n();
  const upcoming = [...store.campaigns].filter(c => ['Scheduled', 'Ready for review'].includes(c.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 4);
  return <main className="page">
    <PageHeading eyebrow="Social Najhin" title="Overview & Analytics" subtitle="Local workspace analytics, approved desktop execution, and clearly labeled rehearsals." action={<Link href="/campaigns" className="button button-primary" data-testid="button-new-campaign"><Plus /> {t('Plan a campaign')}</Link>} />
    <div className="stat-grid">
      <Stat title="Total campaigns" value={store.campaigns.length} note="Saved campaign plans" icon={<ClipboardList />} trend="All platforms" />
      <Stat title="Active accounts" value={store.accounts.filter(a => a.status.startsWith('Active')).length} note="Saved account labels" icon={<AtSign />} trend="Session checked per run" />
      <Stat title="Messages sent" value={analytics.realMessagesSent || 0} note="Server-accepted live sends" icon={<MessageCircle />} trend={t('{n} simulated', { n: analytics.messagesSent })} />
      <Stat title="Scraped leads" value={leads.results.length} note="Saved extraction results" icon={<MapPin />} trend="Review data source" />
    </div>
    <div className="dash-grid">
      <section className="panel">
        <div className="panel-head"><div><div className="panel-title">{t('Next on your desk')}</div><div className="panel-caption">{t('Due items become review reminders — never auto-published.')}</div></div><Link className="text-link" href="/campaigns" data-testid="link-all-campaigns">{t('All campaigns')} <ArrowUpRight size={12} style={{ verticalAlign: 'middle' }} /></Link></div>
        <div className="panel-body">
          {upcoming.length ? upcoming.map(item => <div className="schedule-row" key={item.id} data-testid={`row-upcoming-${item.id}`}>
            <div className="date-block"><b>{formatDate(item.scheduledAt, { day: '2-digit' })}</b><span>{formatDate(item.scheduledAt, { month: 'short' })}</span></div>
            <div><div className="row-title">{item.title}</div><div className="row-meta"><i className="platform-dot" />{t(item.platform)}<span>·</span>{formatTime(item.scheduledAt)}</div></div>
             <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><StatusPill value={item.status} /><button type="button" className="small-icon" title={t('Start Campaign simulation')} aria-label={t('Start Campaign simulation for {name}', { name: item.title })} onClick={() => run(item.id)} data-testid={`button-start-campaign-${item.id}`}><Play /></button>{item.status === 'Ready for review' && <button title={t('Record as sent after manual handoff')} aria-label={t('Record as sent after manual handoff')} className="small-icon" onClick={() => onStatus(item.id, 'Sent')} data-testid={`button-record-sent-${item.id}`}><Check /></button>}</div>
          </div>) : <Empty symbol={<CalendarClock />} title="Your calendar is clear" text="New planned campaigns will appear here when they are ready for review." />}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><div className="panel-title">{t('Recent activity')}</div><div className="panel-caption">{t('A local record of changes in this workspace.')}</div></div><Activity size={16} color="hsl(var(--muted-foreground))" /></div>
        <div className="panel-body">
          {store.activity.slice(0, 5).length ? store.activity.slice(0, 5).map(entry => <div className="activity-item" key={entry.id} data-testid={`activity-entry-${entry.id}`}>
            <div className="activity-mark">{entry.level === 'success' ? <Check size={13} /> : entry.level === 'warning' ? <AlertCircle size={13} /> : <Activity size={13} />}</div>
            <div className="activity-copy">{t(entry.message)}<time>{formatDate(entry.timestamp, { month: 'short', day: 'numeric' })} · {formatTime(entry.timestamp)}</time></div>
          </div>) : <Empty symbol={<Activity />} title="Nothing logged yet" text="Edits to campaigns, accounts, and contacts will be noted here." />}
        </div>
      </section>
    </div>
    <section className="panel" style={{ marginBottom: 16 }} data-testid="panel-live-queues"><div className="panel-head"><div><div className="panel-title">{t('Live queues')}</div><div className="panel-caption">{t('Simulated runs only. Nothing is sent or posted.')}</div></div></div><div className="panel-body">
      {jobs.filter(j => ['Pending', 'Running'].includes(j.status)).length ? jobs.filter(j => ['Pending', 'Running'].includes(j.status)).map(j => <div key={j.id}><div className="sq-title">{j.action === 'filter' ? t('WaFilter verification') : j.action === 'inbox' ? t('WA-CRM / Chatbot listener') : j.kind === 'whatsapp' ? t('WhatsApp message run') : j.kind === 'leads' ? t('Google Maps lead simulation') : t('Campaign: {name}', { name: store.campaigns.find(c => c.id === j.campaignId)?.title || t('removed campaign') })}</div>{j.kind === 'leads' ? <p role="status">{t('{done}/{total} synthetic leads', { done: j.completedCount ?? 0, total: j.totalCount ?? 0 })} · {t(j.status)} · {j.progress}%</p> : <SimQueue job={j} testId={`dash-${j.id}`} />}</div>) : <Empty symbol={<Activity />} title="No task running" text="Start an approved local browser task or a clearly labelled rehearsal to watch its queue here." />}
    </div></section>
    <div className="console" data-testid="status-local-console"><div className="console-orb"><ShieldCheck size={17} /></div><div className="console-copy"><b>{isDesktop ? t('Local workspace is ready') : t('Preview workspace is ready')}</b><span>{isDesktop ? t('Data is in SQLite on this computer. Live browser actions require your approval.') : t('Data is in SQLite on the preview server. Live automation requires the downloaded Social Najhin desktop app.')}</span></div><div className="console-state">{t('Standing by')}</div></div>
  </main>;
}
function Stat({ title, value, note, icon, trend }: { title: string; value: number; note: string; icon: ReactNode; trend: string }) {
  const { t } = useI18n();
  return <div className="stat-card" data-testid={`metric-${title.toLowerCase().replaceAll(' ', '-')}`}><div className="stat-top"><span>{t(title)}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value.toString().padStart(2, '0')}</div><div className="stat-note">{t(note)} <span style={{ marginInlineStart: 5, fontFamily: 'var(--app-font-mono)', fontSize: 9 }}>· {t(trend)}</span></div></div>;
}
function Empty({ symbol, title, text, action }: { symbol: ReactNode; title: string; text: string; action?: ReactNode }) {
  const { t } = useI18n();
  return <div className="empty-state"><div className="empty-symbol">{symbol}</div><b>{t(title)}</b><p>{t(text)}</p>{action}</div>;
}

function Campaigns({ automation = false, jobs, store, perform, open, create, remove, status, handoff, run }: { automation?: boolean; jobs: SimulationJob[]; store: Store; perform: (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>; open: (c: Campaign) => void; create: () => void; remove: (c: Campaign) => void; status: (id: string, s: CampaignStatus) => void; handoff: (platform: string) => void; run: (id: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All statuses');
  const [tab, setTab] = useState<'all' | 'review'>('all');
  const scoped = useMemo(() => automation ? store.campaigns.filter(c => ['Facebook', 'Instagram'].includes(c.platform)) : store.campaigns, [store.campaigns, automation]);
  const filtered = useMemo(() => scoped.filter(c => {
    const matchQuery = `${c.title} ${c.platform} ${c.caption}`.toLowerCase().includes(query.toLowerCase());
    return matchQuery && (filter === 'All statuses' || c.status === filter) && (tab === 'all' || c.status === 'Ready for review');
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [scoped, query, filter, tab]);
  return <main className="page">
    <PageHeading eyebrow="Social Najhin" title={automation ? 'Facebook & Instagram Automation' : 'Campaigns'} subtitle={automation ? 'Facebook: local browser search and approved group actions. Instagram remains planning and rehearsal only.' : 'Save campaign plans and choose between explicit live execution and rehearsal.'} action={<button className="button button-primary" onClick={create} data-testid="button-create-campaign"><Plus /> {t('New campaign')}</button>} />
    <LiveAutomation platform="Facebook" accounts={store.accounts} campaigns={store.campaigns} jobs={jobs} perform={perform} />
    <div className="toolbar">
      <div className="search-wrap"><Search /><input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search campaigns or captions')} aria-label={t('Search campaigns')} data-testid="input-search-campaigns" /></div>
      <select className="field-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label={t('Filter campaigns by status')} data-testid="select-campaign-status"><option value="All statuses">{t('All statuses')}</option>{statuses.map(s => <option key={s} value={s}>{t(s)}</option>)}</select>
      <span className="filter-count">{filtered.length} {filtered.length === 1 ? t('campaign') : t('campaigns')}</span>
    </div>
    <div className="toolbar" style={{ marginTop: -3 }}>
      <button className={`button ${tab === 'all' ? 'button-primary' : 'button-secondary'}`} onClick={() => setTab('all')} data-testid="button-tab-all-campaigns"><ListFilter size={14} /> {t('All campaigns')} <span className="mono-tag">{scoped.length}</span></button>
      <button className={`button ${tab === 'review' ? 'button-primary' : 'button-secondary'}`} onClick={() => setTab('review')} data-testid="button-tab-review-queue"><CheckCircle2 size={14} /> {t('Review queue')} <span className="mono-tag">{scoped.filter(c => c.status === 'Ready for review').length}</span></button>
    </div>
    <div className="list-panel">
      {filtered.length ? <>
        <div className="list-header"><span>{t('Campaign')}</span><span>{t('Platform')}</span><span>{t('Scheduled')}</span><span>{t('Status')}</span><span style={{ textAlign: 'end' }}>{t('Actions')}</span></div>
        {filtered.map(c => <div className="list-row" key={c.id} data-testid={`row-campaign-${c.id}`}>
          <div className="list-cell-main">{c.title}<div className="list-cell-sub">{c.caption || t('No caption added yet')}</div></div>
          <div className="list-cell-main" style={{ fontSize: 11, fontWeight: 500 }}>{t(c.platform)}</div>
          <div className="list-cell-main" style={{ fontSize: 11, fontWeight: 500 }}>{formatDate(c.scheduledAt)}<div className="list-cell-sub">{formatTime(c.scheduledAt)}</div></div>
          <div><select className="field-select" style={{ minWidth: 110, maxWidth: 155, padding: '7px 8px', fontSize: 10 }} value={c.status} onChange={e => status(c.id, e.target.value as CampaignStatus)} aria-label={t('Change status for {name}', { name: c.title })} data-testid={`select-status-${c.id}`}>{statuses.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></div>
           <div className="row-actions"><button className="small-icon" aria-label={t('Start Campaign simulation for {name}', { name: c.title })} title={t('Start Campaign simulation')} onClick={() => run(c.id)} data-testid={`button-start-campaign-${c.id}`}><Play /></button><button className="small-icon" aria-label={t('Open official {name}', { name: c.platform })} title={t('Open official {name}', { name: c.platform })} onClick={() => handoff(c.platform)} data-testid={`button-handoff-${c.id}`}><ExternalLink /></button>{['Scheduled', 'Ready for review', 'Paused'].includes(c.status) && <button className="small-icon" aria-label={t(c.status === 'Paused' ? 'Resume review reminder for {name}' : 'Pause review reminder for {name}', { name: c.title })} onClick={() => status(c.id, c.status === 'Paused' ? new Date(c.scheduledAt).getTime() > Date.now() ? 'Scheduled' : 'Ready for review' : 'Paused')} data-testid={`button-pause-resume-${c.id}`}>{c.status === 'Paused' ? <Play /> : <Pause />}</button>}<button className="small-icon" aria-label={t('Edit {name}', { name: c.title })} onClick={() => open(c)} data-testid={`button-edit-campaign-${c.id}`}><Pencil /></button><button className="small-icon" aria-label={t('Delete {name}', { name: c.title })} onClick={() => remove(c)} data-testid={`button-delete-campaign-${c.id}`}><Trash2 /></button></div>
        </div>)}
      </> : <Empty symbol={<FileText />} title={query || filter !== 'All statuses' || tab === 'review' ? 'No matching campaigns' : 'Start with a small plan'} text={query || filter !== 'All statuses' || tab === 'review' ? 'Try a different search or status filter.' : 'Keep your upcoming social work clear, intentional, and on your terms.'} action={<button className="button button-primary" onClick={create} data-testid="button-empty-create-campaign"><Plus /> {t('Create campaign')}</button>} />}
    </div>
    <section className="panel" style={{ marginTop: 16 }} data-testid="panel-group-queues"><div className="panel-head"><div><div className="panel-title">{t('Campaign queues')}</div><div className="panel-caption">{t('Each queue is labeled Live or Simulated. Use the local browser controls above for real Facebook actions.')}</div></div></div><div className="panel-body">
      {(() => { const latest = scoped.map(c => ({ c, j: jobs.find(j => j.kind === 'campaign' && j.campaignId === c.id) })).filter(x => x.j); return latest.length ? latest.map(({ c, j }) => <div key={c.id}><div className="sq-title">{c.title} <span className="mono-tag">{t(c.platform)}</span></div><SimQueue job={j!} testId={`camp-${c.id}`} /></div>) : <Empty symbol={<ListFilter />} title="No group queue yet" text="Press Start Campaign simulation on a campaign to see Pending, Joined, and Posted counters." />; })()}
    </div></section>
     <div style={{ marginTop: 13, color: 'hsl(var(--muted-foreground))', fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CircleHelp size={13} /> {t('Start Campaign runs a local progress simulation. It never joins groups or publishes anything. Scheduled items move to Ready for review.')}</div>
  </main>;
}

function Accounts({ store, open, create, remove, handoff }: { store: Store; open: (a: Account) => void; create: () => void; remove: (a: Account) => void; handoff: (platform: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const accounts = store.accounts.filter(a => `${a.platform} ${a.displayLabel} ${a.handle}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="page">
    <PageHeading eyebrow="Identity, not credentials" title="Accounts Manager" subtitle="SQLite-backed simulated accounts for Facebook, Instagram, TikTok, and WhatsApp. Nothing connects to a platform." action={<button className="button button-primary" onClick={create} data-testid="button-add-account"><Plus /> {t('Add account')}</button>} />
    <div className="toolbar"><div className="search-wrap"><Search /><input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Find an account label')} aria-label={t('Search accounts')} data-testid="input-search-accounts" /></div><span className="filter-count">{t('{n} labels', { n: accounts.length })}</span></div>
    {accounts.length ? <div className="list-panel acct-scroll"><table className="acct-table" data-testid="table-accounts"><thead><tr><th>{t('Platform')}</th><th>{t('Account Name')}</th><th>{t('Phone / Username')}</th><th>{t('Demo session')}</th><th>{t('Status')}</th><th style={{ textAlign: 'end' }}>{t('Actions')}</th></tr></thead><tbody>
      {accounts.map(account => <tr key={account.id} data-testid={`row-account-${account.id}`}><td><span className="mono-tag">{t(account.platform)}</span></td><td><b>{account.displayLabel}</b></td><td><Ltr>{account.handle || t('Not added')}</Ltr></td><td className="account-handle">{account.demoSession || t('None')}</td><td><span className="account-status">{t(account.status)}</span></td>
        <td><div className="row-actions"><button className="small-icon" title={t('Open official {name} site', { name: account.platform })} aria-label={t('Open official {name} site', { name: account.platform })} onClick={() => handoff(account.platform)} data-testid={`button-open-platform-${account.id}`}><ExternalLink /></button>
        <button className="small-icon" aria-label={t('Edit {name}', { name: account.displayLabel })} onClick={() => open(account)} data-testid={`button-edit-account-${account.id}`}><Pencil /></button>
        <button className="small-icon" aria-label={t('Remove {name}', { name: account.displayLabel })} onClick={() => remove(account)} data-testid={`button-delete-account-${account.id}`}><Trash2 /></button></div></td></tr>)}
    </tbody></table></div> : <div className="list-panel"><Empty symbol={<AtSign />} title={query ? 'No matching accounts' : 'Keep your identities together'} text={query ? 'Try another platform, name, or username.' : 'Add simulated accounts. Real credentials and cookies are never requested.'} action={<button className="button button-primary" onClick={create} data-testid="button-empty-add-account"><Plus /> {t('Add account')}</button>} /></div>}
    <p style={{ marginTop: 15, fontSize: 10, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>{t('Accounts are saved labels. Connect WhatsApp or Facebook from its automation module in the desktop app; sign in manually in the visible browser. Sessions remain in private local browser profiles, not the account table. Never enter credentials or cookies here.')}</p>
  </main>;
}

function Contacts({ store, open, create, remove }: { store: Store; open: (c: Contact) => void; create: () => void; remove: (c: Contact) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [list, setList] = useState('All lists');
  const [consent, setConsent] = useState('Opted in & out');
  const contacts = store.contacts.filter(c => `${c.name} ${c.value} ${c.list}`.toLowerCase().includes(query.toLowerCase()) && (list === 'All lists' || c.list === list) && (consent === 'Opted in & out' || (consent === 'Opted in' ? c.optedIn : !c.optedIn)));
  return <main className="page">
    <PageHeading eyebrow="People who chose to be here" title="Contacts" subtitle="A small, careful local directory. No sending, syncing, or importing." action={<button className="button button-primary" onClick={create} data-testid="button-add-contact"><Plus /> {t('Add contact')}</button>} />
    <div className="consent-note"><strong>{t('Consent stays visible.')}</strong> {t('Keep only records with explicit permission for your intended use. This directory has no send action.')}</div>
    <div className="toolbar"><div className="search-wrap"><Search /><input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search people, details, or lists')} aria-label={t('Search contacts')} data-testid="input-search-contacts" /></div>
      <select className="field-select" value={list} onChange={e => setList(e.target.value)} aria-label={t('Filter contacts by list')} data-testid="select-contact-list"><option value="All lists">{t('All lists')}</option>{store.lists.map(item => <option key={item}>{item}</option>)}</select>
      <select className="field-select" value={consent} onChange={e => setConsent(e.target.value)} aria-label={t('Filter contacts by consent')} data-testid="select-contact-consent"><option value="Opted in & out">{t('Opted in & out')}</option><option value="Opted in">{t('Opted in')}</option><option value="Opted out">{t('Opted out')}</option></select>
      <span className="filter-count">{t('{n} records', { n: contacts.length })}</span></div>
    {contacts.length ? <div className="contact-grid">{contacts.map(person => <article className="contact-card" key={person.id} data-testid={`card-contact-${person.id}`}>
      <div className="contact-top"><div className="contact-topline"><div className="contact-initial">{person.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}</div><div><div className="contact-name">{person.name}</div><div className="contact-channel">{t(person.channel)} · {t('added {date}', { date: formatDate(person.createdAt) })}</div></div></div>
        <button className="small-icon" aria-label={t('Edit {name}', { name: person.name })} onClick={() => open(person)} data-testid={`button-edit-contact-${person.id}`}><Pencil /></button></div>
      <div className="contact-value"><Ltr>{person.value}</Ltr></div>
      <div className="contact-footer"><span className={`opt-in ${person.optedIn ? '' : 'opt-out'}`}>{person.optedIn ? t('Explicit opt-in') : t('Opted out')}</span><span className="mono-tag">{person.list || t('Unlisted')}</span>
        <button className="small-icon" aria-label={t('Delete {name}', { name: person.name })} onClick={() => remove(person)} data-testid={`button-delete-contact-${person.id}`}><Trash2 /></button></div>
    </article>)}</div> : <div className="list-panel"><Empty symbol={<Users />} title={query || list !== 'All lists' ? 'No matching contacts' : 'Build a considered list'} text={query || list !== 'All lists' ? 'Adjust your filters to see more records.' : 'Add a contact only when you have clear, explicit permission. Every record remains on this device.'} action={<button className="button button-primary" onClick={create} data-testid="button-empty-add-contact"><Plus /> {t('Add contact')}</button>} /></div>}
    {store.lists.length > 0 && <div className="section-label">{t('Your lists')} · {store.lists.join(' / ')}</div>}
  </main>;
}

function Settings({ license, perform, settings, saveSettings, theme, setTheme, store, clear, onToggleLang, smartReplies }: { license?: LicenseStatus; perform: (method: 'POST' | 'DELETE', route: string, body?: unknown) => Promise<ApiState>; smartReplies: ReactNode; onToggleLang: () => void; settings: SimulationSettings; saveSettings: (v: Partial<SimulationSettings>) => Promise<void>; theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void; store: Store; clear: () => void }) {
  const { t, lang } = useI18n();
  const [min, setMin] = useState(settings.delayMin);
  const [max, setMax] = useState(settings.delayMax);
  const [note, setNote] = useState('');
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadNote, setDownloadNote] = useState('');
  const downloadDesktop = async () => {
    setDownloadBusy(true); setDownloadNote('');
    try {
      const response = await fetch('/api/socialomni/download', { cache: 'no-store' });
      if (!response.ok) throw new Error(t('Download unavailable ({status}). Please try again.', { status: response.status }));
      if (!response.headers.get('content-type')?.includes('application/zip')) throw new Error(t('The server did not return a ZIP file. Please try again.'));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'social-najhin-desktop.zip';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setDownloadNote(t('ZIP sent to your browser. Check Downloads, unzip it, and follow README.md for macOS setup.'));
    } catch (error) {
      setDownloadNote(error instanceof Error ? error.message : t('Download failed. Please try again.'));
    } finally { setDownloadBusy(false); }
  };
  useEffect(() => { setMin(settings.delayMin); setMax(settings.delayMax); }, [settings.delayMin, settings.delayMax]);
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  const saveDelay = () => { setNote(''); saveSettings({ delayMin: min, delayMax: max }).then(() => setNote(t('Delay settings saved.'))).catch(e => setNote(e instanceof Error ? e.message : t('Could not save.'))); };
  return <main className="page">
    <PageHeading eyebrow="Make the desk yours" title="Settings & License" subtitle="Preferences, local data controls, and license activation." />
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t('Settings sections')}><button onClick={() => go('appearance')} data-testid="settings-nav-appearance">{t('Appearance')}</button><button onClick={() => go('local-data')} data-testid="settings-nav-local-data">{t('Local data')}</button><button onClick={() => go('simulation')} data-testid="settings-nav-simulation">{t('Simulation')}</button><button onClick={() => go('license')} data-testid="settings-nav-license">{t('License')}</button></nav>
      <div className="settings-content">
        {smartReplies}
        <section className="setting-card" id="appearance"><div className="setting-head"><div><strong>{t('Appearance')}</strong><p>{t('Choose the reading mode that feels right at your desk.')}</p></div><div className="mode-switch">
          <button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')} data-testid="button-theme-light"><Sun size={14} /> {t('Light')}</button>
          <button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')} data-testid="button-theme-dark"><Moon size={14} /> {t('Dark')}</button>
        </div></div>
          <div className="setting-head" style={{ marginTop: 16 }}><div><strong>{t('Language')}</strong><p>{t('Switch between English and Arabic. Arabic uses a right-to-left layout.')}</p></div><button type="button" className="lang-toggle" onClick={onToggleLang} data-testid="button-toggle-language-settings"><Languages size={15} /><span className="lang-code" dir="ltr"><b className={lang === 'en' ? 'on' : ''}>EN</b> / <b className={lang === 'ar' ? 'on' : ''}>AR</b></span><span className="lang-name">{lang === 'ar' ? 'English' : 'العربية'}</span></button></div></section>
         <section className="setting-card" id="local-data"><div className="setting-head"><div><strong>{t('Local data')}</strong><p>{isDesktop ? t('Your campaign plan, account labels, contact records, lists, jobs, and activity live in SQLite on this computer. The browser preview and desktop application do not sync. Old records are imported once when first opened.') : t('Your campaign plan, account labels, contact records, lists, jobs, and activity live in SQLite on the Replit preview server, separated by an anonymous browser workspace ID. Do not enter private contacts in this shared hosted preview. The browser preview and desktop application do not sync. Old records are imported once when first opened.')}</p></div><span className="mono-tag">{isDesktop ? t('THIS DEVICE') : t('PREVIEW SERVER')}</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 17 }}><span className="mono-tag">{t('{n} campaigns', { n: store.campaigns.length })}</span><span className="mono-tag">{t('{n} account labels', { n: store.accounts.length })}</span><span className="mono-tag">{t('{n} contact records', { n: store.contacts.length })}</span><span className="mono-tag">{t('{n} lists', { n: store.lists.length })}</span></div>
           <div style={{ marginTop: 18, borderTop: '1px solid hsl(var(--border))', paddingTop: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}><div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{t('Remove all local records from this workspace.')}</div><button className="button button-danger" onClick={clear} data-testid="button-clear-local-data"><Trash2 size={14} /> {t('Clear workspace')}</button></div>
        </section>
        <section className="setting-card" id="simulation"><div className="setting-head"><div><strong>{t('Simulation defaults')}</strong><p>{t('Random delay between simulated steps, shared with the WhatsApp page. Everything here is a local rehearsal: no sends, no joins, no real sessions.')} {t('Delays are rate controls only, not protection against restrictions or bans.')}</p></div><span className="mono-tag">{t('SIMULATED')}</span></div>
          <div className="form-grid" style={{ marginTop: 15 }}>
          <div className="field-group"><label className="field-label" htmlFor="set-min">{t('Minimum delay')}<span className="field-hint">{min}{t('s')}</span></label><input id="set-min" type="range" min={5} max={12} value={min} onChange={e => { const v = Number(e.target.value); setMin(v); if (v > max) setMax(v); }} style={{ width: '100%' }} data-testid="settings-delay-min" /></div>
          <div className="field-group"><label className="field-label" htmlFor="set-max">{t('Maximum delay')}<span className="field-hint">{max}{t('s')}</span></label><input id="set-max" type="range" min={5} max={12} value={max} onChange={e => { const v = Number(e.target.value); setMax(v); if (v < min) setMin(v); }} style={{ width: '100%' }} data-testid="settings-delay-max" /></div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><button className="button button-secondary" onClick={saveDelay} data-testid="button-save-delay">{t('Save delay')}</button><Link href="/whatsapp" className="text-link" data-testid="link-settings-whatsapp">{t('Open WhatsApp rehearsal')}</Link>{note && <span role="status" style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))' }} data-testid="status-delay-saved">{note}</span>}</div>
        </section>
        <LicenseSettings license={license} perform={perform} />
         <section className="setting-card"><div className="setting-head"><div><strong>{isDesktop ? t('Secure desktop bridge') : t('Run Social Najhin locally')}</strong><p>{isDesktop ? t('The renderer uses a restricted preload bridge and local SQLite. Live actions run in visible local Playwright browsers with private account profiles.') : t('Download the complete application ZIP, unzip it, then run npm install and npm start inside the social-najhin-desktop folder. The install includes Chromium for local browser automation. Includes frontend/backend source, main.js, preload.js, package.json, and a macOS README. This is source, not a signed installer.')}</p></div><ShieldCheck size={18} color="hsl(var(--primary))" /></div>{!isDesktop && <><button type="button" className="button button-primary" style={{ marginTop: 16 }} onClick={downloadDesktop} disabled={downloadBusy} data-testid="link-download-desktop"><Download size={14} /> {downloadBusy ? t('Downloading ZIP…') : t('Download desktop ZIP')}</button>{downloadNote && <p role="status" style={{ marginTop: 12 }}>{downloadNote}</p>}</>}</section>
      </div>
    </div>
  </main>;
}

type EditorFields = { title: string; platform: string; caption: string; scheduledAt: string; campaignStatus: CampaignStatus; displayLabel: string; handle: string; accountStatus: string; name: string; channel: 'Email' | 'Phone'; value: string; optedIn: boolean; list: string };

function EditorDialog({ automation = false, kind, item, store, media, perform, close: dismiss, saveCampaign, saveAccount, saveContact }: {
  automation?: boolean;
  kind: 'campaign' | 'account' | 'contact'; item?: Campaign | Account | Contact; store: Store; media: MediaAsset[]; perform: (m: 'POST' | 'PUT' | 'PATCH' | 'DELETE', r: string, b?: unknown) => Promise<ApiState>; close: () => void;
  saveCampaign: (c: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>;
  saveAccount: (a: Omit<Account, 'id'>, id?: string) => Promise<void>;
  saveContact: (c: Omit<Contact, 'id' | 'createdAt'>, id?: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const isEdit = Boolean(item);
  const initialCampaign = item && 'title' in item ? item : null;
  const initialAccount = item && 'displayLabel' in item ? item : null;
  const initialContact = item && 'name' in item ? item : null;
  const form = useForm<EditorFields>({ defaultValues: {
    title: initialCampaign?.title || '', platform: initialCampaign?.platform || initialAccount?.platform || 'Instagram',
    caption: initialCampaign?.caption || '', scheduledAt: initialCampaign?.scheduledAt || isoIn(1, 10),
    campaignStatus: initialCampaign?.status || 'Draft', displayLabel: initialAccount?.displayLabel || '',
    handle: initialAccount?.handle || '', accountStatus: initialAccount?.status || 'Active label',
    name: initialContact?.name || '', channel: initialContact?.channel || 'Email', value: initialContact?.value || '',
    optedIn: initialContact?.optedIn ?? false, list: initialContact?.list || store.lists[0] || 'New list',
  } });
  const { title, platform, caption, scheduledAt, campaignStatus, displayLabel, handle, accountStatus, name, channel, value, optedIn, list } = form.watch();
  const setTitle = (v: string) => form.setValue('title', v);
  const setPlatform = (v: string) => form.setValue('platform', v);
  const setCaption = (v: string) => form.setValue('caption', v);
  const setScheduledAt = (v: string) => form.setValue('scheduledAt', v);
  const setCampaignStatus = (v: CampaignStatus) => form.setValue('campaignStatus', v);
  const setDisplayLabel = (v: string) => form.setValue('displayLabel', v);
  const setHandle = (v: string) => form.setValue('handle', v);
  const setAccountStatus = (v: string) => form.setValue('accountStatus', v);
  const setName = (v: string) => form.setValue('name', v);
  const setChannel = (v: 'Email' | 'Phone') => form.setValue('channel', v);
  const setValue = (v: string) => form.setValue('value', v);
  const setOptedIn = (v: boolean) => form.setValue('optedIn', v);
  const setList = (v: string) => form.setValue('list', v);
  const [keywords, setKeywords] = useState(initialCampaign?.keywords || '');
  const [groupCount, setGroupCount] = useState(String(initialCampaign?.targetGroupCount ?? 50));
  const [mediaId, setMediaId] = useState<string | null>(initialCampaign?.mediaId ?? null);
  const [accountId, setAccountId] = useState<string | null>(initialCampaign?.accountId ?? null);
  const [demoSession, setDemoSession] = useState(initialAccount?.demoSession || '');
  const [mediaBusy, setMediaBusy] = useState(false);
  const close = () => { if (!mediaBusy) dismiss(); };
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if ([title, caption, displayLabel, handle, name, value, list].some(v => v.length > 1000)) { setError(t('Each text field must be 1,000 characters or fewer.')); return; }
    setSubmitting(true);
    setError('');
    try {
    if (kind === 'campaign') {
      if (!title.trim()) { setError(t('Give this campaign a title.')); return; }
      if (campaignStatus === 'Scheduled' && (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime()))) { setError(t('Choose a valid planned handoff time for a scheduled reminder.')); return; }
      const count = Number(groupCount);
      if (!Number.isInteger(count) || count < 1 || count > 1000) { setError(t('Target group count must be a whole number from 1 to 1000.')); return; }
      await saveCampaign({ title: title.trim(), platform, caption: caption.trim(), scheduledAt, status: campaignStatus, keywords: keywords.trim(), targetGroupCount: count, mediaId, accountId }, initialCampaign?.id);
    } else if (kind === 'account') {
      if (!displayLabel.trim()) { setError(t('Add a recognizable label.')); return; }
      const demo = demoSession.trim();
      if (demo && !demo.startsWith('demo-')) { setError(t('Demo session reference must start with demo-. It is a fake label, never a real session.')); return; }
      await saveAccount({ platform, displayLabel: displayLabel.trim(), handle: handle.trim(), status: accountStatus, demoSession: demo }, initialAccount?.id);
    } else {
      if (!name.trim() || !value.trim()) { setError(t('Name and contact value are required.')); return; }
      if (channel === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) { setError(t('Enter a valid email address.')); return; }
      if (channel === 'Phone' && !/^\+?[\d\s().-]{7,30}$/.test(value.trim())) { setError(t('Enter a valid phone number.')); return; }
      await saveContact({ name: name.trim(), channel, value: value.trim(), optedIn, list: list.trim() || 'Unlisted' }, initialContact?.id);
    }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t('Could not save this record.'));
    } finally { setSubmitting(false); }
  };
  const heading = kind === 'campaign' ? t(isEdit ? 'Edit campaign' : 'Plan a campaign') : kind === 'account' ? t(isEdit ? 'Edit account label' : 'Add account label') : t(isEdit ? 'Edit contact' : 'Add contact');
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-header"><div><h2 id="dialog-title">{heading}</h2><p>{kind === 'campaign' ? t('A plan and reminder, not an automatic post.') : kind === 'account' ? t('A label only. Never add sign-in details.') : t('Keep consent and purpose clear.')}</p></div><button className="small-icon" onClick={close} aria-label={t('Close dialog')} data-testid="button-close-dialog"><X /></button></div>
      <Form {...form}><form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        {kind === 'campaign' && <>
          <div className="field-group"><label className="field-label" htmlFor="campaign-title">{t('Campaign title')}</label><input id="campaign-title" className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('A name you’ll recognize')} autoFocus data-testid="input-campaign-title" /></div>
          <div className="form-grid"><div className="field-group"><label className="field-label" htmlFor="campaign-platform">{t('Platform')}</label><select id="campaign-platform" className="field-select" style={{ width: '100%' }} value={platform} onChange={e => setPlatform(e.target.value)} data-testid="select-campaign-platform">{(automation ? ['Facebook', 'Instagram'] : platforms).map(p => <option key={p} value={p}>{t(p)}</option>)}</select></div>
            <div className="field-group"><label className="field-label" htmlFor="campaign-status">{t('Status')}</label><select id="campaign-status" className="field-select" style={{ width: '100%' }} value={campaignStatus} onChange={e => setCampaignStatus(e.target.value as CampaignStatus)} data-testid="select-campaign-edit-status">{statuses.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></div></div>
          <div className="field-group"><label className="field-label" htmlFor="campaign-caption">{t('Caption or working notes')} <span className="field-hint">{caption.length} / 1000</span></label><textarea id="campaign-caption" maxLength={1000} className="field-textarea" value={caption} onChange={e => setCaption(e.target.value)} placeholder={t('Keep your working copy here. It will not be sent anywhere.')} data-testid="textarea-campaign-caption" /></div>
          <div className="field-group"><label className="field-label" htmlFor="campaign-date">{t('Planned handoff time')}</label><input type="datetime-local" id="campaign-date" className="field-input" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} data-testid="input-campaign-date" /></div>
          <div className="field-group"><label className="field-label" htmlFor="campaign-keywords">{t('Keywords')} <span className="field-hint">{t('comma separated')}</span></label><input id="campaign-keywords" className="field-input" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder={t('bakery, sourdough, local')} data-testid="input-campaign-keywords" />
            {(platform === 'Facebook' || platform === 'Instagram') && <div className="wa-hint">{t('Group names are hypothetical and derived from these keywords. No real groups are ever discovered.')}</div>}</div>
          <div className="form-grid"><div className="field-group"><label className="field-label" htmlFor="campaign-groups">{t('Target group count')} <span className="field-hint">{t('1 to 1,000')}</span></label><input id="campaign-groups" type="number" min={1} max={1000} className="field-input" value={groupCount} onChange={e => setGroupCount(e.target.value)} data-testid="input-campaign-groups" /><div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{[50, 100, 200, 500].map(n => <button type="button" key={n} className="button button-quiet" onClick={() => setGroupCount(String(n))} data-testid={`button-group-count-${n}`}>{n}</button>)}</div></div>
            <div className="field-group"><label className="field-label" htmlFor="campaign-account">{t('Simulated account')} <span className="field-hint">{t('optional')}</span></label><select id="campaign-account" className="field-select" style={{ width: '100%' }} value={accountId ?? ''} onChange={e => setAccountId(e.target.value || null)} data-testid="select-campaign-account"><option value="">{t('No account')}</option>{store.accounts.filter(a => a.platform === platform).map(a => <option key={a.id} value={a.id}>{a.displayLabel}</option>)}{accountId && !store.accounts.some(a => a.id === accountId && a.platform === platform) && <option value={accountId}>{t('Saved account (other platform or removed)')}</option>}</select></div></div>
          <div className="field-group"><div className="field-label">{t('Media')}</div><MediaUpload mediaId={mediaId} media={media} perform={perform} onChange={setMediaId} onBusyChange={setMediaBusy} testId="campaign-media" /></div>
        </>}
        {kind === 'account' && <>
          <div className="field-group"><label className="field-label" htmlFor="account-platform">{t('Platform')}</label><select id="account-platform" className="field-select" style={{ width: '100%' }} value={platform} onChange={e => setPlatform(e.target.value)} data-testid="select-account-platform">{platforms.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></div>
          <div className="field-group"><label className="field-label" htmlFor="account-label">{t('Account Name')}</label><input id="account-label" className="field-input" value={displayLabel} onChange={e => setDisplayLabel(e.target.value)} placeholder={t('e.g. Studio account')} autoFocus data-testid="input-account-label" /></div>
          <div className="field-group"><label className="field-label" htmlFor="account-handle">{t('Phone / Username')} <span className="field-hint">{t('optional')}</span></label><input id="account-handle" className="field-input" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@yourhandle" data-testid="input-account-handle" /></div>
          <div className="field-group"><label className="field-label" htmlFor="account-status">{t('Label status')}</label><select id="account-status" className="field-select" style={{ width: '100%' }} value={accountStatus} onChange={e => setAccountStatus(e.target.value)} data-testid="select-account-status">{!['Active label', 'Paused label'].includes(accountStatus) && <option value={accountStatus}>{t(accountStatus)}</option>}<option value="Active label">{t('Active label')}</option><option value="Paused label">{t('Paused label')}</option></select></div>
          <div className="field-group"><label className="field-label" htmlFor="account-demo">{t('Demo session reference')} <span className="field-hint">{t('optional, fake only')}</span></label><input id="account-demo" className="field-input" value={demoSession} onChange={e => setDemoSession(e.target.value)} placeholder="demo-studio-01" autoComplete="off" data-testid="input-account-demo" /><div className="wa-hint">{t('A made-up label that must start with demo-. Never paste a cookie, token, or password.')}</div></div>
          <div className="consent-note" style={{ marginBottom: 0 }}>{t('Real credentials are not accepted. Do not enter a password, recovery code, cookie, or session detail.')}</div>
        </>}
        {kind === 'contact' && <>
          <div className="field-group"><label className="field-label" htmlFor="contact-name">{t('Name')}</label><input id="contact-name" className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('First and last name')} autoFocus data-testid="input-contact-name" /></div>
          <div className="form-grid"><div className="field-group"><label className="field-label" htmlFor="contact-channel">{t('Channel')}</label><select id="contact-channel" className="field-select" style={{ width: '100%' }} value={channel} onChange={e => setChannel(e.target.value as 'Email' | 'Phone')} data-testid="select-contact-channel"><option value="Email">{t('Email')}</option><option value="Phone">{t('Phone')}</option></select></div>
            <div className="field-group"><label className="field-label" htmlFor="contact-list">{t('List')}</label><input id="contact-list" className="field-input" list="known-lists" value={list} onChange={e => setList(e.target.value)} placeholder={t('Name a list')} data-testid="input-contact-list" /><datalist id="known-lists">{store.lists.map(item => <option key={item} value={item} />)}</datalist></div></div>
          <div className="field-group"><label className="field-label" htmlFor="contact-value">{channel === 'Email' ? t('Email address') : t('Phone number')}</label><input id="contact-value" dir="ltr" type={channel === 'Email' ? 'email' : 'tel'} className="field-input" value={value} onChange={e => setValue(e.target.value)} placeholder={channel === 'Email' ? 'name@example.com' : '+1 555 000 0000'} data-testid="input-contact-value" /></div>
          <label className="check-row"><input type="checkbox" checked={optedIn} onChange={e => setOptedIn(e.target.checked)} data-testid="checkbox-contact-opt-in" /><span>{t('I have explicit permission to keep this contact record for its intended purpose. Consent can be withdrawn at any time.')}</span></label>
        </>}
        {error && <div role="alert" style={{ color: 'hsl(var(--destructive))', fontSize: 11, marginTop: 8 }} data-testid="error-dialog-form">{error}</div>}
        <div className="form-actions"><button type="button" className="button button-secondary" disabled={mediaBusy || submitting} onClick={close} data-testid="button-cancel-form">{t('Cancel')}</button><button type="submit" className="button button-primary" disabled={mediaBusy || submitting} data-testid="button-save-form"><Check size={14} /> {mediaBusy ? t('Saving attachment…') : submitting ? t('Saving…') : isEdit ? t('Save changes') : t('Save to SQLite')}</button></div>
      </form></Form>
    </section>
  </div>;
}

function ConfirmDialog({ title, body, cancel, accept }: { title: string; body: string; cancel: () => void; accept: () => void }) {
  const { t } = useI18n();
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) cancel(); }}><section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <div className="dialog-header"><div><h2 id="confirm-title">{title}</h2><p>{body}</p></div><button className="small-icon" onClick={cancel} aria-label={t('Close confirmation')} data-testid="button-close-confirm"><X /></button></div>
    <div className="form-actions" style={{ padding: '17px 22px 21px', margin: 0 }}><button className="button button-secondary" onClick={cancel} data-testid="button-cancel-confirm">{t('Keep it')}</button><button className="button button-danger" onClick={accept} data-testid="button-accept-confirm"><Trash2 size={14} /> {t('Remove locally')}</button></div>
  </section></div>;
}

export default App;
