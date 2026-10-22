import { useSettings, type Language } from '@/store/settings';
import { en, type TranslationKey } from './en';
import { es } from './es';

const dictionaries: Record<Language, Partial<Record<TranslationKey, string>>> = { en, es };

export function translate(lang: Language, key: TranslationKey, vars?: Record<string, string | number>): string {
  let s: string = dictionaries[lang][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return s;
}

/** Hook: `const t = useT(); t('nav.home')`. Re-renders when the language changes. */
export function useT() {
  const lang = useSettings((s) => s.language);
  return (key: TranslationKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

export type { TranslationKey };
