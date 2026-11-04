import { motion } from 'motion/react';
import { LOCALE_GLYPH, LOCALE_NAME, pick } from '../i18n/locale';
import { useLocale, useT } from '../i18n/use-i18n';
import { useAppStore } from '../state/store';
import { press } from './motion-presets';

/**
 * The interface's language, as one button.
 *
 * It reads the way the rest of this toolbar reads — the label names what pressing it *does*, not
 * what is currently true, exactly like Walk and Stroll: in English the button says `中`, because
 * `中` is what you get. Showing the current language instead would leave a reader who cannot
 * read it unable to find the way out.
 *
 * A button rather than a two-segment switch: two segments cost 74px, and the phone toolbar has
 * no 74px to give. The glyph is that language's own word for itself in either interface, which
 * is the one string on the page that must never be translated.
 */
export function LangControl() {
  const locale = useLocale();
  const setLocale = useAppStore((s) => s.setLocale);
  const t = useT();
  const next = locale === 'zh' ? 'en' : 'zh';
  const name = pick(LOCALE_NAME[next], locale);
  return (
    <motion.button
      type="button"
      className="lang"
      onClick={() => setLocale(next)}
      title={t('langSwitchTo', { language: name })}
      aria-label={t('langSwitchTo', { language: name })}
      whileTap={press}
    >
      <span className="lang__glyph" lang={next === 'zh' ? 'zh-CN' : 'en'} aria-hidden="true">
        {LOCALE_GLYPH[next]}
      </span>
    </motion.button>
  );
}
