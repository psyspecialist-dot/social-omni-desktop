import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ar } from './ar';
import { extraAr } from './extra-ar';

const servicePatterns = Object.entries(extraAr).flatMap(([pattern, translated]) => {
  const names: string[] = [];
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{(\w+)\\\}/g, (_, name: string) => { names.push(name); return '(.+?)'; });
  return names.length ? [{ regex: new RegExp(`^${escaped}$`), names, translated }] : [];
});
export type Lang = 'en' | 'ar';
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Catalog-based translation. Keys are the canonical English strings (which are also the
 * English output), so stored enum values (Draft, Running, Opted in, ...) are never changed:
 * only their presentation goes through t(). Missing Arabic keys fall back to English.
 */
export function makeT(lang: Lang): TFn {
  return (key, vars) => {
    let out = key;
    if (lang === 'ar') {
      out = extraAr[key] ?? ar[key] ?? key;
      if (out === key && !vars) {
        // Service events stay canonical in SQLite. Translate only their display,
        // preserving names and other captured user content verbatim.
        for (const {regex, names, translated} of servicePatterns) {
          const match = regex.exec(key);
          if (!match) continue;
          out = translated;
          names.forEach((name,i) => { const value = ['status','kind','platform','action'].includes(name) ? (extraAr[match[i+1]] ?? ar[match[i+1]] ?? match[i+1]) : match[i+1]; out = out.split(`{${name}}`).join(value); });
          break;
        }
      }
    }
    if (vars) for (const [name, value] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(value));
    return out;
  };
}

export const localeFor = (lang: Lang) => (lang === 'ar' ? 'ar-u-nu-latn' : 'en');
export const normalizeLang = (value: unknown): Lang | null => (value === 'ar' || value === 'en' ? value : null);

interface I18n { lang: Lang; dir: 'ltr' | 'rtl'; t: TFn; locale: string }
const make = (lang: Lang): I18n => ({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t: makeT(lang), locale: localeFor(lang) });
const Ctx = createContext<I18n>(make('en'));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => make(lang), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);

/** Left-to-right isolation for emails, URLs, phone numbers and code inside RTL text. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi dir="ltr" className={`ltr-iso ${className || ''}`}>{children}</bdi>;
}
