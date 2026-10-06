import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'wouter';
import { Activity, AtSign, ClipboardList, Database, Mail, MapPin, MessageCircle, Send, Settings2, Users, Bot, ListFilter, MessagesSquare } from 'lucide-react';
import './network.css';

export interface HubNode { href: string; label: string; meta: string; icon: ComponentType<{ size?: number }>; tone?: 'live' | 'review' | 'fail' }
export interface HubData { counts: Record<string, string>; tones: Record<string, HubNode['tone']> }

const BASE: Omit<HubNode, 'meta' | 'tone'>[] = [
  { href: '/whatsapp', label: 'WhatsApp Marketing', icon: MessageCircle },
  { href: '/wafilter', label: 'WaFilter', icon: ListFilter },
  { href: '/wa-crm', label: 'WA-CRM', icon: MessagesSquare },
  { href: '/chatbots', label: 'Auto-Reply / Chatbot', icon: Bot },
  { href: '/campaigns', label: 'Campaigns', icon: ClipboardList },
  { href: '/automation', label: 'Facebook & Instagram', icon: Activity },
  { href: '/multi-platform', label: 'Telegram & Facebook', icon: Send },
  { href: '/email', label: 'Email Marketing', icon: Mail },
  { href: '/extractors', label: 'B2B & Data Extractors', icon: Database },
  { href: '/leads', label: 'Google Maps Leads', icon: MapPin },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/accounts', label: 'Accounts Manager', icon: AtSign },
  { href: '/settings', label: 'Settings & License', icon: Settings2 },
];

export default function NetworkHub({ data }: { data: HubData }) {
  const [hot, setHot] = useState<string | null>(null);
  const layout = useMemo(() => BASE.map((n, i) => {
    const a = (-90 + (360 / BASE.length) * i) * Math.PI / 180;
    const x = 50 + 41 * Math.cos(a), y = 50 + 40 * Math.sin(a);
    const mx = (50 + x) / 2, my = (50 + y) / 2;
    const bend = i % 2 ? 9 : -9;
    const cx = mx - Math.sin(a) * bend, cy = my + Math.cos(a) * bend;
    return { ...n, x, y, d: `M50 50 Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}` };
  }), []);
  return <section className="nj-stage" aria-label="Social Najhin module network" data-testid="network-hub">
    <svg className="nj-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {layout.map(n => <g key={n.href}><path d={n.d} className={`nj-line ${hot === n.href ? 'hot' : ''}`} /><path d={n.d} className={`nj-flow tone-${data.tones[n.href] || 'none'} ${hot === n.href ? 'hot' : ''}`} /></g>)}
    </svg>
    <div className="nj-hub" aria-hidden="false"><i className="nj-ring r1" /><i className="nj-ring r2" /><i className="nj-ring r3" />
      <div className="nj-core"><span className="nj-mono">SN</span><h2>Social Najhin</h2><small>all modules · one local workspace</small></div></div>
    <ul className="nj-nodes">{layout.map(n => { const Icon = n.icon; const tone = data.tones[n.href];
      return <li key={n.href} style={{ left: `${n.x}%`, top: `${n.y}%` }} className="nj-li">
        <Link href={n.href} className={`nj-node ${tone ? `tone-${tone}` : ''}`} onMouseEnter={() => setHot(n.href)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(n.href)} onBlur={() => setHot(null)} data-testid={`node-${n.href.slice(1)}`}>
          <span className="nj-ico"><Icon size={16} /></span><span className="nj-txt"><b>{n.label}</b><em>{data.counts[n.href] || 'Open'}</em></span>{tone && <i className="nj-dot" />}
        </Link></li>; })}</ul>
  </section>;
}
