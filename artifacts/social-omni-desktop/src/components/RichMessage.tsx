import { useRef, type ReactNode } from 'react';
import { Bold, Italic, Strikethrough, Code } from 'lucide-react';
import { useI18n } from '@/i18n';

const marks: { key: string; label: string; token: string; icon: ReactNode }[] = [
  { key: 'bold', label: 'Bold', token: '*', icon: <Bold size={14} /> },
  { key: 'italic', label: 'Italic', token: '_', icon: <Italic size={14} /> },
  { key: 'strike', label: 'Strikethrough', token: '~', icon: <Strikethrough size={14} /> },
  { key: 'mono', label: 'Monospace', token: '`', icon: <Code size={14} /> },
];
const Tag: Record<string, 'strong' | 'em' | 's' | 'code'> = { '*': 'strong', _: 'em', '~': 's', '`': 'code' };

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /([*_~`])([^\s*_~`](?:[^*_~`\n]*[^\s*_~`])?)\1/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const T = Tag[m[1]];
    out.push(<T key={`${keyBase}-${i++}`}>{inline(m[2], `${keyBase}-${i}`)}</T>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function FormattedPreview({ text }: { text: string }) {
  const { t } = useI18n();
  if (!text.trim()) return <p className="rm-empty">{t('Your formatted message appears here.')}</p>;
  return <div className="rm-preview" data-testid="preview-message">{text.split('\n').map((line, i) => <p key={i}>{line ? inline(line, `l${i}`) : '\u00a0'}</p>)}</div>;
}

export default function RichMessage({ value, onChange, max = 10000, testId = 'message' }: { value: string; onChange: (v: string) => void; max?: number; testId?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (token: string) => {
    const el = ref.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || t('text');
    const next = value.slice(0, s) + token + sel + token + value.slice(e);
    if (next.length > max) return;
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + 1, s + 1 + sel.length); });
  };
  return <div className="rm">
    <div className="rm-toolbar" role="toolbar" aria-label={t('Message formatting')}>
      {marks.map(m => <button key={m.key} type="button" className="small-icon" aria-label={t(m.label)} title={`${t(m.label)} (${m.token}${t('text')}${m.token})`} onClick={() => wrap(m.token)} data-testid={`button-format-${m.key}`}>{m.icon}</button>)}
      <span className="field-hint" style={{ marginInlineStart: 'auto' }}>{value.length} / {max}</span>
    </div>
    <textarea ref={ref} className="field-textarea rm-input" value={value} maxLength={max} onChange={e => onChange(e.target.value)} placeholder={t('Write your message or template. Select text, then use the toolbar.')} aria-label={t('Message content')} data-testid={`textarea-${testId}`} />
    <div className="rm-label">{t('Live preview')}</div>
    <FormattedPreview text={value} />
  </div>;
}
