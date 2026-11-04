/**
 * Two languages, and the small amount of machinery it takes to hold both at once.
 *
 * The diorama is a Japanese house drawn with English labels; the visitor who asked for it reads
 * Chinese. Rather than keep two copies of every string table and hope they stay in step, each
 * translatable value is a `Localized` pair, written side by side at the point of definition. A
 * missing half is then a `tsc` error at the source, not a blank label on screen.
 */

export type Locale = 'en' | 'zh';

/** Every locale the app ships with, in the order the toggle shows them. */
export const LOCALES: readonly Locale[] = ['en', 'zh'] as const;

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * A value written in both languages. Used for strings that live in data — a room's name, a
 * character's biography — where the two versions belong next to each other, not in a distant
 * table that has to be kept in sync by hand.
 */
export type Localized<T = string> = { readonly en: T; readonly zh: T };

/** The pair, in the visitor's language. Anything the visitor cannot read is not a translation. */
export function pick<T>(value: Localized<T>, locale: Locale): T {
  return value[locale] ?? value.en;
}

/**
 * Which language to open in. The visitor's own choice wins over the browser's, because it is the
 * only one of the two that was actually meant; the browser's is a guess made on their behalf.
 */
export const LOCALE_STORAGE_KEY = 'nobita-house:locale';

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'zh';
}

/** `localStorage` throws in a sandboxed frame and in some privacy modes; a language is not worth
 *  a blank page, so every access is guarded and simply forgotten if the store says no. */
export function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* The choice still applies for this visit; it just will not be remembered. */
  }
}

/** Anything starting `zh` — `zh-CN`, `zh-Hans`, `zh-TW` — is Chinese for our purposes. */
export function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;
  try {
    const nav = typeof navigator === 'undefined' ? '' : navigator.language;
    return nav.toLowerCase().startsWith('zh') ? 'zh' : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Tell the browser, so screen readers pick the right voice and CSS can special-case CJK. */
export function syncDocumentLang(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
}

/**
 * The word on the language button: each language named in its own script, which is the same
 * word whichever interface it is shown in. `中` is what a Chinese reader recognises, not `ZH`.
 */
export const LOCALE_GLYPH: Record<Locale, string> = { en: 'EN', zh: '中' };

/**
 * Full names, written in the *interface* language rather than their own: the button's tooltip
 * has to be read by whoever is looking at the page, so Chinese says `英文` and not `English`.
 */
export const LOCALE_NAME: Record<Locale, Localized> = {
  en: { en: 'English', zh: '英文' },
  zh: { en: '中文', zh: '中文' },
};
