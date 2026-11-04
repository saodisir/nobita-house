/**
 * The chrome's way into the language: one hook for which language is on, one for saying things
 * in it. Everything that renders a word goes through `useT`, so switching language re-renders
 * exactly the components that show text and nothing else.
 */
import { useCallback } from 'react';
import { useAppStore } from '../state/store';
import type { Locale } from './locale';
import { type TVars, translate, type UIKey } from './ui';

export type { Locale, Localized } from './locale';
export { pick } from './locale';
export type { TVars, UIKey } from './ui';

export function useLocale(): Locale {
  return useAppStore((s) => s.locale);
}

export type T = (key: UIKey, vars?: TVars) => string;

/**
 * `t('settings')` — the settings sheet's own name, in whichever language is on. The identity
 * changes with the language, so anything memoising on `t` re-runs when it should.
 */
export function useT(): T {
  const locale = useLocale();
  return useCallback((key: UIKey, vars?: TVars) => translate(key, locale, vars), [locale]);
}
