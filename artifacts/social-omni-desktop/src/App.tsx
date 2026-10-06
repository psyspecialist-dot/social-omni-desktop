import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { useHashLocation } from 'wouter/use-hash-location';
import { isDesktop, openOfficialPlatform, readLocal, writeLocal } from '@/lib/persistence';
import { STORAGE_KEY, THEME_KEY, platforms, statuses, newId, isoIn, seedStore, parseStore, type CampaignStatus, type Campaign, type Account, type Contact, type ActivityEntry, type Store } from '@/lib/workspace';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity, AlertCircle, ArrowUpRight, AtSign, CalendarClock, Check,
  CheckCircle2, CircleHelp, ClipboardList, ExternalLink, FileText,
  LayoutDashboard, ListFilter, Menu, Moon,
   Download, Pause, Play, Pencil, Plus, Search, Settings2, ShieldCheck, Sun, Trash2, Users, X,
} from 'lucide-react';

const queryClient = new QueryClient();
const formatDate = (value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : new Intl.DateTimeFormat('en', options).format(date);
};
const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
};
const titleForPath: Record<string, string> = { '/': 'Dashboard', '/campaigns': 'Campaigns', '/accounts': 'Accounts', '/contacts': 'Contacts', '/settings': 'Settings' };

function Workspace() {
  const [store, setStore] = useState<Store>(seedStore);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [saving, setSaving] = useState(false);
  const saveGeneration = useRef(0);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [dialog, setDialog] = useState<{ type: 'campaign' | 'account' | 'contact'; item?: Campaign | Account | Contact } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null);
  const [path] = useLocation();
  const addActivity = (message: string, level: ActivityEntry['level'] = 'info') => ({ id: newId(), timestamp: new Date().toISOString(), level, message });
  useEffect(() => {
    let cancelled = false;
    Promise.all([readLocal(STORAGE_KEY), readLocal(THEME_KEY)]).then(([records, savedTheme]) => {
      if (cancelled) return;
      setStore(parseStore(records));
      setTheme(savedTheme === 'dark' ? 'dark' : 'light');
      setReady(true);
    }).catch(error => {
      if (!cancelled) setStorageError(`Cannot load local records: ${error instanceof Error ? error.message : 'Storage is unavailable.'}`);
    });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const generation = ++saveGeneration.current;
    setSaving(true);
    writeLocal(STORAGE_KEY, JSON.stringify(store)).then(() => {
      if (generation === saveGeneration.current) { setSaving(false); setStorageError(''); }
    }).catch(error => {
      if (generation === saveGeneration.current) {
        setSaving(false);
        setStorageError(`Changes are not saved: ${error instanceof Error ? error.message : 'Storage is unavailable.'} Keep this window open and try again.`);
      }
    });
  }, [store, ready]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (ready) writeLocal(THEME_KEY, theme).catch(() => setStorageError('The appearance preference could not be saved.'));
  }, [theme, ready]);
  useEffect(() => { document.title = `${titleForPath[path] || 'Workspace'} | SocialOmni Desktop`; }, [path]);
  useEffect(() => {
    if (!ready) return;
    const promoteDueItems = () => {
      const dueIds = new Set(store.campaigns.filter(c => c.status === 'Scheduled' && new Date(c.scheduledAt).getTime() <= Date.now()).map(c => c.id));
      if (!dueIds.size) return;
      setStore(prev => {
        const due = prev.campaigns.filter(c => dueIds.has(c.id) && c.status === 'Scheduled');
        if (!due.length) return prev;
        return {
          ...prev,
          campaigns: prev.campaigns.map(c => dueIds.has(c.id) && c.status === 'Scheduled' ? { ...c, status: 'Ready for review', updatedAt: new Date().toISOString() } : c),
          activity: [...due.map(c => addActivity(`“${c.title}” is due and ready for your review.`, 'warning')), ...prev.activity].slice(0, 50),
        };
      });
    };
    promoteDueItems();
    const timer = window.setInterval(promoteDueItems, 30_000);
    return () => window.clearInterval(timer);
  }, [store.campaigns, ready]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer); }, [toast]);
  const mutate = (next: (current: Store) => Store, message: string, level: ActivityEntry['level'] = 'info') => {
    setStore(prev => ({ ...next(prev), activity: [addActivity(message, level), ...prev.activity].slice(0, 50) }));
    setToast(message);
  };
  const handoff = (platform: string) => {
    openOfficialPlatform(platform).then(() => mutate(current => current, `Opened official ${platform}. Review and publish there yourself.`))
      .catch(error => setToast(error instanceof Error ? error.message : 'Could not open the platform.'));
  };
  const saveCampaign = (draft: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    const timestamp = new Date().toISOString();
    mutate(prev => ({ ...prev, campaigns: id
      ? prev.campaigns.map(c => c.id === id ? { ...c, ...draft, updatedAt: timestamp } : c)
      : [{ ...draft, id: newId(), createdAt: timestamp, updatedAt: timestamp }, ...prev.campaigns] }),
    id ? `Updated “${draft.title}”.` : `Created “${draft.title}”.`, 'success');
    setDialog(null);
  };
  const saveAccount = (draft: Omit<Account, 'id'>, id?: string) => {
    mutate(prev => ({ ...prev, accounts: id ? prev.accounts.map(a => a.id === id ? { ...a, ...draft } : a) : [{ ...draft, id: newId() }, ...prev.accounts] }),
      id ? `Updated ${draft.displayLabel}.` : `Added ${draft.displayLabel}.`, 'success');
    setDialog(null);
  };
  const saveContact = (draft: Omit<Contact, 'id' | 'createdAt'>, id?: string) => {
    mutate(prev => ({
      ...prev,
      lists: draft.list && !prev.lists.includes(draft.list) ? [...prev.lists, draft.list] : prev.lists,
      contacts: id ? prev.contacts.map(c => c.id === id ? { ...c, ...draft } : c) : [{ ...draft, id: newId(), createdAt: new Date().toISOString() }, ...prev.contacts],
    }), id ? `Updated ${draft.name}’s contact record.` : `Added ${draft.name} to your local contacts.`, 'success');
    setDialog(null);
  };
  const remove = (kind: 'campaign' | 'account' | 'contact', item: Campaign | Account | Contact) => {
    const name = 'title' in item ? item.title : 'displayLabel' in item ? item.displayLabel : item.name;
    setConfirm({ title: `Remove ${name}?`, body: 'This record will be removed from this device. This cannot be undone.', onConfirm: () => {
      mutate(prev => ({ ...prev, [kind === 'campaign' ? 'campaigns' : kind === 'account' ? 'accounts' : 'contacts']:
        prev[kind === 'campaign' ? 'campaigns' : kind === 'account' ? 'accounts' : 'contacts'].filter(entry => entry.id !== item.id) }) as Store,
      `Removed ${name}.`, 'warning');
      setConfirm(null);
    } });
  };
  const saveStatus = (id: string, status: CampaignStatus) => {
    const campaign = store.campaigns.find(c => c.id === id);
    if (!campaign) return;
    if (status === 'Scheduled' && (!campaign.scheduledAt || Number.isNaN(new Date(campaign.scheduledAt).getTime()))) {
      setToast('Edit this campaign and choose a valid planned handoff time first.');
      return;
    }
    mutate(prev => ({ ...prev, campaigns: prev.campaigns.map(c => c.id === id ? { ...c, status, updatedAt: new Date().toISOString() } : c) }),
      status === 'Sent' ? `Recorded “${campaign.title}” as sent after your manual handoff.` : `Moved “${campaign.title}” to ${status}.`,
      status === 'Sent' ? 'success' : status === 'Failed' ? 'warning' : 'info');
  };
  const clearWorkspace = () => setConfirm({ title: 'Clear local workspace?', body: 'This removes campaigns, account labels, contacts, lists, and activity from this device. The workspace will be left empty.', onConfirm: () => {
    const clean = { campaigns: [], accounts: [], contacts: [], lists: [], activity: [addActivity('Local workspace cleared.', 'warning')] };
    setStore(clean); setConfirm(null); setToast('Workspace cleared from this device.');
  } });
  if (!ready) return <main className="page" data-testid="status-storage-loading"><h1>SocialOmni Desktop</h1><p role={storageError ? 'alert' : 'status'}>{storageError || 'Loading local workspace…'}</p>{storageError && <button className="button button-secondary" onClick={() => window.location.reload()} data-testid="button-retry-load">Retry without changing saved records</button>}</main>;
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
          <div className="app-shell">
            <Sidebar active={path} open={mobileNav} close={() => setMobileNav(false)} />
            {mobileNav && <button aria-label="Close navigation" className="dialog-backdrop" style={{ zIndex: 20, padding: 0, border: 0 }} onClick={() => setMobileNav(false)} data-testid="button-close-navigation" />}
            <div className="main-area">
              <header className="topbar">
                <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu /></button>
                <div className="crumb">WORKSPACE <span style={{ opacity: .5, padding: '0 6px' }}>/</span> {titleForPath[path] || 'Workspace'}</div>
                <div className="top-actions">
                  <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} data-testid="button-toggle-theme-top">{theme === 'dark' ? <Sun size={16} /> : <Moon size={15} />}</button>
                   <div className="profile-chip"><span className="profile-avatar">SO</span><span>Local workspace</span></div>
                </div>
              </header>
               {storageError && <div className="storage-alert" role="alert" data-testid="error-storage-save">{storageError}<button className="button button-secondary" onClick={() => { writeLocal(STORAGE_KEY, JSON.stringify(store)).then(() => setStorageError('')).catch(error => setStorageError(`Still not saved: ${String(error)}`)); }} data-testid="button-retry-save">Retry save</button></div>}
              <ErrorBoundary resetKey={path}>
                <Switch>
                  <Route path="/"><Dashboard store={store} onStatus={saveStatus} /></Route>
                   <Route path="/campaigns"><Campaigns store={store} open={item => setDialog({ type: 'campaign', item })} create={() => setDialog({ type: 'campaign' })} remove={item => remove('campaign', item)} status={saveStatus} handoff={handoff} /></Route>
                   <Route path="/accounts"><Accounts store={store} open={item => setDialog({ type: 'account', item })} create={() => setDialog({ type: 'account' })} remove={item => remove('account', item)} handoff={handoff} /></Route>
                  <Route path="/contacts"><Contacts store={store} open={item => setDialog({ type: 'contact', item })} create={() => setDialog({ type: 'contact' })} remove={item => remove('contact', item)} /></Route>
                  <Route path="/settings"><Settings theme={theme} setTheme={setTheme} store={store} clear={clearWorkspace} /></Route>
                  <Route component={NotFound} />
                </Switch>
              </ErrorBoundary>
               <section className="activity-console" aria-label="Live local activity log" data-testid="console-activity"><div className="activity-console-head"><strong><Activity size={13} /> Local activity log</strong><span data-testid="status-storage">{storageError ? 'Not saved' : saving ? 'Saving…' : isDesktop ? 'Saved · SQLite' : 'Saved · browser storage'}</span></div><div role="log" aria-live="polite">{store.activity.slice(0, 4).map(entry => <div className="console-log" key={entry.id}><time>{formatTime(entry.timestamp)}</time><span className={`log-level log-${entry.level}`}>{entry.level}</span><span>{entry.message}</span></div>)}</div></section>
            </div>
          </div>
          {dialog && <EditorDialog key={`${dialog.type}-${dialog.item?.id || 'new'}`} kind={dialog.type} item={dialog.item} store={store}
            close={() => setDialog(null)} saveCampaign={saveCampaign} saveAccount={saveAccount} saveContact={saveContact} />}
          {confirm && <ConfirmDialog title={confirm.title} body={confirm.body} cancel={() => setConfirm(null)} accept={confirm.onConfirm} />}
          {toast && <div className="toast" role="status" data-testid="status-toast">{toast}</div>}
          <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return <WouterRouter hook={isDesktop ? useHashLocation : undefined} base={isDesktop ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')}><Workspace /></WouterRouter>;
}

function Sidebar({ active, open, close }: { active: string; open: boolean; close: () => void }) {
  const nav = [
    { href: '/', title: 'Overview', icon: LayoutDashboard },
    { href: '/campaigns', title: 'Campaigns', icon: ClipboardList },
    { href: '/accounts', title: 'Accounts', icon: AtSign },
    { href: '/contacts', title: 'Contacts', icon: Users },
  ];
  return <aside className={`sidebar ${open ? 'open' : ''}`}>
    <div className="brand"><div className="brand-mark">so</div><div><div className="brand-name">SocialOmni</div><div className="brand-sub">personal control desk</div></div>
      <button className="small-icon" style={{ color: 'inherit', marginLeft: 'auto' }} onClick={close} aria-label="Close navigation" data-testid="button-sidebar-close"><X /></button>
    </div>
    <div className="nav-label">Your workspace</div>
    {nav.map(({ href, title, icon: Icon }) => <Link key={href} href={href} onClick={close} className={`nav-link ${active === href ? 'active' : ''}`} data-testid={`link-nav-${title.toLowerCase()}`}><Icon /><span>{title}</span></Link>)}
    <div className="nav-label" style={{ marginTop: 18 }}>Preferences</div>
    <Link href="/settings" onClick={close} className={`nav-link ${active === '/settings' ? 'active' : ''}`} data-testid="link-nav-settings"><Settings2 /><span>Settings</span></Link>
    <div className="side-bottom">
      <div className="nav-label">Privacy by default</div>
      <div className="local-indicator"><i className="local-dot" /><div><strong>Stored on this device</strong><span>No remote sync</span></div></div>
    </div>
  </aside>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="heading-sub">{subtitle}</p></div>{action}</div>;
}
function StatusPill({ value }: { value: CampaignStatus }) {
  const styles: Record<CampaignStatus, string> = { 'Ready for review': 'status-ready', Scheduled: 'status-scheduled', Draft: 'status-draft', Paused: 'status-paused', Sent: 'status-sent', Failed: 'status-failed' };
  return <span className={`status ${styles[value]}`} data-testid={`status-campaign-${value.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>;
}
function Dashboard({ store, onStatus }: { store: Store; onStatus: (id: string, status: CampaignStatus) => void }) {
  const pending = store.campaigns.filter(c => c.status === 'Ready for review').length;
  const scheduled = store.campaigns.filter(c => c.status === 'Scheduled').length;
  const active = store.campaigns.filter(c => !['Sent', 'Failed', 'Paused'].includes(c.status)).length;
  const upcoming = [...store.campaigns].filter(c => ['Scheduled', 'Ready for review'].includes(c.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 4);
  const optedIn = store.contacts.filter(c => c.optedIn).length;
  return <main className="page">
    <PageHeading eyebrow="Your desk is ready" title="A little more in order." subtitle="Your campaign plan, people, and handoffs — all in one quiet place." action={<Link href="/campaigns" className="button button-primary" data-testid="button-new-campaign"><Plus /> Plan a campaign</Link>} />
    <div className="stat-grid">
      <Stat title="In motion" value={active} note="Campaigns not yet closed" icon={<ClipboardList />} trend="Current plan" />
      <Stat title="Ready to review" value={pending} note="Your next decision" icon={<CheckCircle2 />} trend={pending ? 'Needs a look' : 'All caught up'} />
      <Stat title="On the calendar" value={scheduled} note="Scheduled for later" icon={<CalendarClock />} trend="Manual handoff only" />
      <Stat title="Opted-in contacts" value={optedIn} note="Records stored locally" icon={<Users />} trend={`${store.lists.length} contact lists`} />
    </div>
    <div className="dash-grid">
      <section className="panel">
        <div className="panel-head"><div><div className="panel-title">Next on your desk</div><div className="panel-caption">Due items become review reminders — never auto-published.</div></div><Link className="text-link" href="/campaigns" data-testid="link-all-campaigns">All campaigns <ArrowUpRight size={12} style={{ verticalAlign: 'middle' }} /></Link></div>
        <div className="panel-body">
          {upcoming.length ? upcoming.map(item => <div className="schedule-row" key={item.id} data-testid={`row-upcoming-${item.id}`}>
            <div className="date-block"><b>{formatDate(item.scheduledAt, { day: '2-digit' })}</b><span>{formatDate(item.scheduledAt, { month: 'short' })}</span></div>
            <div><div className="row-title">{item.title}</div><div className="row-meta"><i className="platform-dot" />{item.platform}<span>·</span>{formatTime(item.scheduledAt)}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><StatusPill value={item.status} />{item.status === 'Ready for review' && <button title="Record as sent after manual handoff" className="small-icon" onClick={() => onStatus(item.id, 'Sent')} data-testid={`button-record-sent-${item.id}`}><Check /></button>}</div>
          </div>) : <Empty symbol={<CalendarClock />} title="Your calendar is clear" text="New planned campaigns will appear here when they are ready for review." />}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><div className="panel-title">Recent activity</div><div className="panel-caption">A local record of changes in this workspace.</div></div><Activity size={16} color="hsl(var(--muted-foreground))" /></div>
        <div className="panel-body">
          {store.activity.slice(0, 5).length ? store.activity.slice(0, 5).map(entry => <div className="activity-item" key={entry.id} data-testid={`activity-entry-${entry.id}`}>
            <div className="activity-mark">{entry.level === 'success' ? <Check size={13} /> : entry.level === 'warning' ? <AlertCircle size={13} /> : <Activity size={13} />}</div>
            <div className="activity-copy">{entry.message}<time>{formatDate(entry.timestamp, { month: 'short', day: 'numeric' })} · {formatTime(entry.timestamp)}</time></div>
          </div>) : <Empty symbol={<Activity />} title="Nothing logged yet" text="Edits to campaigns, accounts, and contacts will be noted here." />}
        </div>
      </section>
    </div>
    <div className="console" data-testid="status-local-console"><div className="console-orb"><ShieldCheck size={17} /></div><div className="console-copy"><b>Local workspace is ready</b><span>Data stays {isDesktop ? 'in local SQLite' : 'in this browser'}. SocialOmni never publishes or contacts anyone for you.</span></div><div className="console-state">Standing by</div></div>
  </main>;
}
function Stat({ title, value, note, icon, trend }: { title: string; value: number; note: string; icon: ReactNode; trend: string }) {
  return <div className="stat-card" data-testid={`metric-${title.toLowerCase().replaceAll(' ', '-')}`}><div className="stat-top"><span>{title}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value.toString().padStart(2, '0')}</div><div className="stat-note">{note} <span style={{ marginLeft: 5, fontFamily: 'var(--app-font-mono)', fontSize: 9 }}>· {trend}</span></div></div>;
}
function Empty({ symbol, title, text, action }: { symbol: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-symbol">{symbol}</div><b>{title}</b><p>{text}</p>{action}</div>;
}

function Campaigns({ store, open, create, remove, status, handoff }: { store: Store; open: (c: Campaign) => void; create: () => void; remove: (c: Campaign) => void; status: (id: string, s: CampaignStatus) => void; handoff: (platform: string) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All statuses');
  const [tab, setTab] = useState<'all' | 'review'>('all');
  const filtered = useMemo(() => store.campaigns.filter(c => {
    const matchQuery = `${c.title} ${c.platform} ${c.caption}`.toLowerCase().includes(query.toLowerCase());
    return matchQuery && (filter === 'All statuses' || c.status === filter) && (tab === 'all' || c.status === 'Ready for review');
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [store.campaigns, query, filter, tab]);
  return <main className="page">
    <PageHeading eyebrow="Plan, then hand off" title="Campaigns" subtitle="Shape the work here. You decide when and where anything goes live." action={<button className="button button-primary" onClick={create} data-testid="button-create-campaign"><Plus /> New campaign</button>} />
    <div className="toolbar">
      <div className="search-wrap"><Search /><input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search campaigns or captions" aria-label="Search campaigns" data-testid="input-search-campaigns" /></div>
      <select className="field-select" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter campaigns by status" data-testid="select-campaign-status"><option>All statuses</option>{statuses.map(s => <option key={s}>{s}</option>)}</select>
      <span className="filter-count">{filtered.length} {filtered.length === 1 ? 'campaign' : 'campaigns'}</span>
    </div>
    <div className="toolbar" style={{ marginTop: -3 }}>
      <button className={`button ${tab === 'all' ? 'button-primary' : 'button-secondary'}`} onClick={() => setTab('all')} data-testid="button-tab-all-campaigns"><ListFilter size={14} /> All campaigns <span className="mono-tag">{store.campaigns.length}</span></button>
      <button className={`button ${tab === 'review' ? 'button-primary' : 'button-secondary'}`} onClick={() => setTab('review')} data-testid="button-tab-review-queue"><CheckCircle2 size={14} /> Review queue <span className="mono-tag">{store.campaigns.filter(c => c.status === 'Ready for review').length}</span></button>
    </div>
    <div className="list-panel">
      {filtered.length ? <>
        <div className="list-header"><span>Campaign</span><span>Platform</span><span>Scheduled</span><span>Status</span><span style={{ textAlign: 'right' }}>Actions</span></div>
        {filtered.map(c => <div className="list-row" key={c.id} data-testid={`row-campaign-${c.id}`}>
          <div className="list-cell-main">{c.title}<div className="list-cell-sub">{c.caption || 'No caption added yet'}</div></div>
          <div className="list-cell-main" style={{ fontSize: 11, fontWeight: 500 }}>{c.platform}</div>
          <div className="list-cell-main" style={{ fontSize: 11, fontWeight: 500 }}>{formatDate(c.scheduledAt)}<div className="list-cell-sub">{formatTime(c.scheduledAt)}</div></div>
          <div><select className="field-select" style={{ minWidth: 110, maxWidth: 155, padding: '7px 8px', fontSize: 10 }} value={c.status} onChange={e => status(c.id, e.target.value as CampaignStatus)} aria-label={`Change status for ${c.title}`} data-testid={`select-status-${c.id}`}>{statuses.map(s => <option key={s}>{s}</option>)}</select></div>
          <div className="row-actions"><button className="small-icon" aria-label={`Open official ${c.platform}`} onClick={() => handoff(c.platform)} data-testid={`button-handoff-${c.id}`}><ExternalLink /></button>{['Scheduled', 'Ready for review', 'Paused'].includes(c.status) && <button className="small-icon" aria-label={`${c.status === 'Paused' ? 'Resume' : 'Pause'} review reminder for ${c.title}`} onClick={() => status(c.id, c.status === 'Paused' ? new Date(c.scheduledAt).getTime() > Date.now() ? 'Scheduled' : 'Ready for review' : 'Paused')} data-testid={`button-pause-resume-${c.id}`}>{c.status === 'Paused' ? <Play /> : <Pause />}</button>}<button className="small-icon" aria-label={`Edit ${c.title}`} onClick={() => open(c)} data-testid={`button-edit-campaign-${c.id}`}><Pencil /></button><button className="small-icon" aria-label={`Delete ${c.title}`} onClick={() => remove(c)} data-testid={`button-delete-campaign-${c.id}`}><Trash2 /></button></div>
        </div>)}
      </> : <Empty symbol={<FileText />} title={query || filter !== 'All statuses' || tab === 'review' ? 'No matching campaigns' : 'Start with a small plan'} text={query || filter !== 'All statuses' || tab === 'review' ? 'Try a different search or status filter.' : 'Keep your upcoming social work clear, intentional, and on your terms.'} action={<button className="button button-primary" onClick={create} data-testid="button-empty-create-campaign"><Plus /> Create campaign</button>} />}
    </div>
    <div style={{ marginTop: 13, color: 'hsl(var(--muted-foreground))', fontSize: 10, display: 'flex', alignItems: 'center', gap: 6 }}><CircleHelp size={13} /> When a scheduled time arrives, an item moves to Ready for review. It is never published automatically.</div>
  </main>;
}

function Accounts({ store, open, create, remove, handoff }: { store: Store; open: (a: Account) => void; create: () => void; remove: (a: Account) => void; handoff: (platform: string) => void }) {
  const [query, setQuery] = useState('');
  const accounts = store.accounts.filter(a => `${a.platform} ${a.displayLabel} ${a.handle}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="page">
    <PageHeading eyebrow="Identity, not credentials" title="Accounts" subtitle="Keep platform labels close at hand. Sign-in happens on the official site." action={<button className="button button-primary" onClick={create} data-testid="button-add-account"><Plus /> Add account label</button>} />
    <div className="toolbar"><div className="search-wrap"><Search /><input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find an account label" aria-label="Search accounts" data-testid="input-search-accounts" /></div><span className="filter-count">{accounts.length} labels</span></div>
    {accounts.length ? <div className="account-grid">{accounts.map(account => <article className="account-card" key={account.id} data-testid={`card-account-${account.id}`}>
      <div className="account-top"><div className="platform-glyph">{account.platform.slice(0, 2).toUpperCase()}</div><span className="mono-tag">{account.platform}</span></div>
      <div className="account-name">{account.displayLabel}</div><div className="account-handle">{account.handle || 'No handle added'}</div>
      <div className="account-bottom"><span className="account-status">{account.status}</span><div className="account-actions">
        <button className="small-icon" title={`Open official ${account.platform} site`} onClick={() => handoff(account.platform)} data-testid={`button-open-platform-${account.id}`}><ExternalLink /></button>
        <button className="small-icon" title="Edit label" onClick={() => open(account)} data-testid={`button-edit-account-${account.id}`}><Pencil /></button>
        <button className="small-icon" title="Remove label" onClick={() => remove(account)} data-testid={`button-delete-account-${account.id}`}><Trash2 /></button>
      </div></div>
    </article>)}</div> : <div className="list-panel"><Empty symbol={<AtSign />} title={query ? 'No matching labels' : 'Keep your identities together'} text={query ? 'Try another platform or label.' : 'Add non-secret labels for the accounts you manage. Credentials never belong here.'} action={<button className="button button-primary" onClick={create} data-testid="button-empty-add-account"><Plus /> Add account label</button>} /></div>}
    <p style={{ marginTop: 15, fontSize: 10, color: 'hsl(var(--muted-foreground))', lineHeight: 1.6 }}>Open site is a user-initiated handoff to the platform’s official website. SocialOmni does not store passwords, cookies, or sign-in sessions.</p>
  </main>;
}

function Contacts({ store, open, create, remove }: { store: Store; open: (c: Contact) => void; create: () => void; remove: (c: Contact) => void }) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState('All lists');
  const [consent, setConsent] = useState('Opted in & out');
  const contacts = store.contacts.filter(c => `${c.name} ${c.value} ${c.list}`.toLowerCase().includes(query.toLowerCase()) && (list === 'All lists' || c.list === list) && (consent === 'Opted in & out' || (consent === 'Opted in' ? c.optedIn : !c.optedIn)));
  return <main className="page">
    <PageHeading eyebrow="People who chose to be here" title="Contacts" subtitle="A small, careful local directory. No sending, syncing, or importing." action={<button className="button button-primary" onClick={create} data-testid="button-add-contact"><Plus /> Add contact</button>} />
    <div className="consent-note"><strong>Consent stays visible.</strong> Keep only records with explicit permission for your intended use. This directory has no send action.</div>
    <div className="toolbar"><div className="search-wrap"><Search /><input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people, details, or lists" aria-label="Search contacts" data-testid="input-search-contacts" /></div>
      <select className="field-select" value={list} onChange={e => setList(e.target.value)} aria-label="Filter contacts by list" data-testid="select-contact-list"><option>All lists</option>{store.lists.map(item => <option key={item}>{item}</option>)}</select>
      <select className="field-select" value={consent} onChange={e => setConsent(e.target.value)} aria-label="Filter contacts by consent" data-testid="select-contact-consent"><option>Opted in &amp; out</option><option>Opted in</option><option>Opted out</option></select>
      <span className="filter-count">{contacts.length} records</span></div>
    {contacts.length ? <div className="contact-grid">{contacts.map(person => <article className="contact-card" key={person.id} data-testid={`card-contact-${person.id}`}>
      <div className="contact-top"><div className="contact-topline"><div className="contact-initial">{person.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}</div><div><div className="contact-name">{person.name}</div><div className="contact-channel">{person.channel} · added {formatDate(person.createdAt)}</div></div></div>
        <button className="small-icon" aria-label={`Edit ${person.name}`} onClick={() => open(person)} data-testid={`button-edit-contact-${person.id}`}><Pencil /></button></div>
      <div className="contact-value">{person.value}</div>
      <div className="contact-footer"><span className={`opt-in ${person.optedIn ? '' : 'opt-out'}`}>{person.optedIn ? 'Explicit opt-in' : 'Opted out'}</span><span className="mono-tag">{person.list || 'Unlisted'}</span>
        <button className="small-icon" aria-label={`Delete ${person.name}`} onClick={() => remove(person)} data-testid={`button-delete-contact-${person.id}`}><Trash2 /></button></div>
    </article>)}</div> : <div className="list-panel"><Empty symbol={<Users />} title={query || list !== 'All lists' ? 'No matching contacts' : 'Build a considered list'} text={query || list !== 'All lists' ? 'Adjust your filters to see more records.' : 'Add a contact only when you have clear, explicit permission. Every record remains on this device.'} action={<button className="button button-primary" onClick={create} data-testid="button-empty-add-contact"><Plus /> Add contact</button>} /></div>}
    {store.lists.length > 0 && <div className="section-label">Your lists · {store.lists.join(' / ')}</div>}
  </main>;
}

function Settings({ theme, setTheme, store, clear }: { theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void; store: Store; clear: () => void }) {
  const [license, setLicense] = useState('');
  const [licenseState, setLicenseState] = useState('');
  return <main className="page">
    <PageHeading eyebrow="Make the desk yours" title="Settings" subtitle="A few preferences, plus a clear view of where your data lives." />
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections"><button className="active" data-testid="settings-nav-appearance">Appearance</button><button onClick={() => document.getElementById('local-data')?.scrollIntoView({ behavior: 'smooth' })} data-testid="settings-nav-local-data">Local data</button><button onClick={() => document.getElementById('license')?.scrollIntoView({ behavior: 'smooth' })} data-testid="settings-nav-license">License</button></nav>
      <div className="settings-content">
        <section className="setting-card"><div className="setting-head"><div><strong>Appearance</strong><p>Choose the reading mode that feels right at your desk.</p></div><div className="mode-switch">
          <button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')} data-testid="button-theme-light"><Sun size={14} /> Light</button>
          <button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')} data-testid="button-theme-dark"><Moon size={14} /> Dark</button>
        </div></div></section>
         <section className="setting-card" id="local-data"><div className="setting-head"><div><strong>Local data</strong><p>Your campaign plan, account labels, contact records, lists, and activity live {isDesktop ? 'in SQLite on this computer' : 'in this browser’s local storage'}. No remote sync is connected. Example records are included for exploring the app; edit or clear them to start your own workspace.</p></div><span className="mono-tag">THIS DEVICE</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 17 }}><span className="mono-tag">{store.campaigns.length} campaigns</span><span className="mono-tag">{store.accounts.length} account labels</span><span className="mono-tag">{store.contacts.length} contact records</span><span className="mono-tag">{store.lists.length} lists</span></div>
           <div style={{ marginTop: 18, borderTop: '1px solid hsl(var(--border))', paddingTop: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}><div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>Remove all local records from this workspace.</div><button className="button button-danger" onClick={clear} data-testid="button-clear-local-data"><Trash2 size={14} /> Clear workspace</button></div>
        </section>
        <section className="setting-card" id="license"><div className="setting-head"><div><strong>License · test placeholder</strong><p>License validation is intentionally not connected in this local preview.</p></div><span className="mono-tag">NOT ACTIVE</span></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 15 }}><input className="field-input" value={license} onChange={e => setLicense(e.target.value)} placeholder="Test-only license placeholder" aria-label="Test-only license placeholder" data-testid="input-license-placeholder" /><button className="button button-secondary" onClick={() => setLicenseState(license.trim() ? 'Placeholder noted — no license check was performed.' : 'Enter a placeholder value first.')} data-testid="button-test-license">Test placeholder</button></div>
          {licenseState && <div role="status" style={{ fontSize: 10, color: 'hsl(var(--muted-foreground))', marginTop: 9 }} data-testid="status-license-placeholder">{licenseState}</div>}
        </section>
         <section className="setting-card"><div className="setting-head"><div><strong>{isDesktop ? 'Secure desktop bridge' : 'Run locally with Electron'}</strong><p>{isDesktop ? 'The renderer uses a restricted preload bridge and local SQLite. Platform logins stay in your default browser.' : 'Download the desktop source folder, unzip it, then run npm install and npm start inside it. It includes the built interface, main.js, preload.js, package.json, and instructions. This is source, not a signed installer.'}</p></div><ShieldCheck size={18} color="hsl(var(--primary))" /></div>{!isDesktop && <a className="button button-primary" style={{ marginTop: 16 }} href={`${import.meta.env.BASE_URL}downloads/socialomni-desktop.zip`} download data-testid="link-download-desktop"><Download size={14} /> Download desktop folder</a>}</section>
      </div>
    </div>
  </main>;
}

type EditorFields = { title: string; platform: string; caption: string; scheduledAt: string; campaignStatus: CampaignStatus; displayLabel: string; handle: string; accountStatus: string; name: string; channel: 'Email' | 'Phone'; value: string; optedIn: boolean; list: string };

function EditorDialog({ kind, item, store, close, saveCampaign, saveAccount, saveContact }: {
  kind: 'campaign' | 'account' | 'contact'; item?: Campaign | Account | Contact; store: Store; close: () => void;
  saveCampaign: (c: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => void;
  saveAccount: (a: Omit<Account, 'id'>, id?: string) => void;
  saveContact: (c: Omit<Contact, 'id' | 'createdAt'>, id?: string) => void;
}) {
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
  const [error, setError] = useState('');
  const submit = () => {
    if ([title, caption, displayLabel, handle, name, value, list].some(v => v.length > 1000)) { setError('Each text field must be 1,000 characters or fewer.'); return; }
    if (kind === 'campaign') {
      if (!title.trim()) { setError('Give this campaign a title.'); return; }
      if (campaignStatus === 'Scheduled' && (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime()))) { setError('Choose a valid planned handoff time for a scheduled reminder.'); return; }
      saveCampaign({ title: title.trim(), platform, caption: caption.trim(), scheduledAt, status: campaignStatus }, initialCampaign?.id);
    } else if (kind === 'account') {
      if (!displayLabel.trim()) { setError('Add a recognizable label.'); return; }
      saveAccount({ platform, displayLabel: displayLabel.trim(), handle: handle.trim(), status: accountStatus }, initialAccount?.id);
    } else {
      if (!name.trim() || !value.trim()) { setError('Name and contact value are required.'); return; }
      if (channel === 'Email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) { setError('Enter a valid email address.'); return; }
      if (channel === 'Phone' && !/^\+?[\d\s().-]{7,30}$/.test(value.trim())) { setError('Enter a valid phone number.'); return; }
      saveContact({ name: name.trim(), channel, value: value.trim(), optedIn, list: list.trim() || 'Unlisted' }, initialContact?.id);
    }
  };
  const heading = kind === 'campaign' ? `${isEdit ? 'Edit' : 'Plan a'} campaign` : kind === 'account' ? `${isEdit ? 'Edit' : 'Add'} account label` : `${isEdit ? 'Edit' : 'Add'} contact`;
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-header"><div><h2 id="dialog-title">{heading}</h2><p>{kind === 'campaign' ? 'A plan and reminder, not an automatic post.' : kind === 'account' ? 'A label only. Never add sign-in details.' : 'Keep consent and purpose clear.'}</p></div><button className="small-icon" onClick={close} aria-label="Close dialog" data-testid="button-close-dialog"><X /></button></div>
      <Form {...form}><form className="dialog-form" onSubmit={form.handleSubmit(submit)}>
        {kind === 'campaign' && <>
          <div className="field-group"><label className="field-label" htmlFor="campaign-title">Campaign title</label><input id="campaign-title" className="field-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="A name you’ll recognize" autoFocus data-testid="input-campaign-title" /></div>
          <div className="form-grid"><div className="field-group"><label className="field-label" htmlFor="campaign-platform">Platform</label><select id="campaign-platform" className="field-select" style={{ width: '100%' }} value={platform} onChange={e => setPlatform(e.target.value)} data-testid="select-campaign-platform">{platforms.map(p => <option key={p}>{p}</option>)}</select></div>
            <div className="field-group"><label className="field-label" htmlFor="campaign-status">Status</label><select id="campaign-status" className="field-select" style={{ width: '100%' }} value={campaignStatus} onChange={e => setCampaignStatus(e.target.value as CampaignStatus)} data-testid="select-campaign-edit-status">{statuses.map(s => <option key={s}>{s}</option>)}</select></div></div>
          <div className="field-group"><label className="field-label" htmlFor="campaign-caption">Caption or working notes <span className="field-hint">{caption.length} / 1000</span></label><textarea id="campaign-caption" maxLength={1000} className="field-textarea" value={caption} onChange={e => setCaption(e.target.value)} placeholder="Keep your working copy here. It will not be sent anywhere." data-testid="textarea-campaign-caption" /></div>
          <div className="field-group"><label className="field-label" htmlFor="campaign-date">Planned handoff time</label><input type="datetime-local" id="campaign-date" className="field-input" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} data-testid="input-campaign-date" /></div>
        </>}
        {kind === 'account' && <>
          <div className="field-group"><label className="field-label" htmlFor="account-platform">Platform</label><select id="account-platform" className="field-select" style={{ width: '100%' }} value={platform} onChange={e => setPlatform(e.target.value)} data-testid="select-account-platform">{platforms.map(p => <option key={p}>{p}</option>)}</select></div>
          <div className="field-group"><label className="field-label" htmlFor="account-label">Display label</label><input id="account-label" className="field-input" value={displayLabel} onChange={e => setDisplayLabel(e.target.value)} placeholder="e.g. Studio account" autoFocus data-testid="input-account-label" /></div>
          <div className="field-group"><label className="field-label" htmlFor="account-handle">Handle or page name <span className="field-hint">optional</span></label><input id="account-handle" className="field-input" value={handle} onChange={e => setHandle(e.target.value)} placeholder="@yourhandle" data-testid="input-account-handle" /></div>
          <div className="field-group"><label className="field-label" htmlFor="account-status">Label status</label><select id="account-status" className="field-select" style={{ width: '100%' }} value={accountStatus} onChange={e => setAccountStatus(e.target.value)} data-testid="select-account-status"><option>Active label</option><option>Paused label</option></select></div>
          <div className="consent-note" style={{ marginBottom: 0 }}>Do not enter a password, recovery code, cookie, or session detail.</div>
        </>}
        {kind === 'contact' && <>
          <div className="field-group"><label className="field-label" htmlFor="contact-name">Name</label><input id="contact-name" className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" autoFocus data-testid="input-contact-name" /></div>
          <div className="form-grid"><div className="field-group"><label className="field-label" htmlFor="contact-channel">Channel</label><select id="contact-channel" className="field-select" style={{ width: '100%' }} value={channel} onChange={e => setChannel(e.target.value as 'Email' | 'Phone')} data-testid="select-contact-channel"><option>Email</option><option>Phone</option></select></div>
            <div className="field-group"><label className="field-label" htmlFor="contact-list">List</label><input id="contact-list" className="field-input" list="known-lists" value={list} onChange={e => setList(e.target.value)} placeholder="Name a list" data-testid="input-contact-list" /><datalist id="known-lists">{store.lists.map(item => <option key={item} value={item} />)}</datalist></div></div>
          <div className="field-group"><label className="field-label" htmlFor="contact-value">{channel === 'Email' ? 'Email address' : 'Phone number'}</label><input id="contact-value" type={channel === 'Email' ? 'email' : 'tel'} className="field-input" value={value} onChange={e => setValue(e.target.value)} placeholder={channel === 'Email' ? 'name@example.com' : '+1 555 000 0000'} data-testid="input-contact-value" /></div>
          <label className="check-row"><input type="checkbox" checked={optedIn} onChange={e => setOptedIn(e.target.checked)} data-testid="checkbox-contact-opt-in" /><span>I have explicit permission to keep this contact record for its intended purpose. Consent can be withdrawn at any time.</span></label>
        </>}
        {error && <div role="alert" style={{ color: 'hsl(var(--destructive))', fontSize: 11, marginTop: 8 }} data-testid="error-dialog-form">{error}</div>}
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={close} data-testid="button-cancel-form">Cancel</button><button type="submit" className="button button-primary" data-testid="button-save-form"><Check size={14} /> {isEdit ? 'Save changes' : 'Save locally'}</button></div>
      </form></Form>
    </section>
  </div>;
}

function ConfirmDialog({ title, body, cancel, accept }: { title: string; body: string; cancel: () => void; accept: () => void }) {
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) cancel(); }}><section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
    <div className="dialog-header"><div><h2 id="confirm-title">{title}</h2><p>{body}</p></div><button className="small-icon" onClick={cancel} aria-label="Close confirmation" data-testid="button-close-confirm"><X /></button></div>
    <div className="form-actions" style={{ padding: '17px 22px 21px', margin: 0 }}><button className="button button-secondary" onClick={cancel} data-testid="button-cancel-confirm">Keep it</button><button className="button button-danger" onClick={accept} data-testid="button-accept-confirm"><Trash2 size={14} /> Remove locally</button></div>
  </section></div>;
}

export default App;
