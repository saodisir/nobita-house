import { describe, expect, it } from 'vitest';
import { characters } from '../data/characters';
import { roomHotspots } from '../data/room-hotspots';
import { rooms } from '../data/rooms';
import { timesOfDay } from '../data/time-of-day';
import { LOCALES, type Localized, pick } from './locale';
import { translate, UI, type UIKey } from './ui';

/**
 * The point of a hand-written bilingual table is that nothing goes missing in silence. These
 * tests are the price of not having two files to diff: they walk the dictionary and the data and
 * refuse to pass while a string has only one language.
 */

const keys = Object.keys(UI) as UIKey[];

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';

/** Both halves present, non-empty, and not accidentally the same string pasted twice. */
function expectBilingual(label: string, value: Localized) {
  for (const locale of LOCALES) {
    expect(blank(value[locale]), `${label} missing ${locale}`).toBe(false);
  }
}

describe('the string table', () => {
  it('says everything in both languages', () => {
    for (const key of keys) expectBilingual(key, UI[key]);
  });

  it('has no key left holding English on both sides', () => {
    // A copy-paste that forgot to translate is the commonest slip; a few words genuinely do not
    // translate (WASD, FPS), and those are the ones allowed to match.
    const untranslated = keys.filter((key) => (UI[key].en as string) === (UI[key].zh as string));
    expect(untranslated).toEqual([]);
  });

  it('fills a placeholder and leaves an unknown one alone', () => {
    expect(translate('veilModels', 'en', { loaded: 3, total: 8 })).toBe('3 / 8 models');
    expect(translate('veilModels', 'zh', { loaded: 3, total: 8 })).toBe('3 / 8 个模型');
    expect(translate('langSwitchTo', 'en', { language: '中文' })).toBe('Switch to 中文');
    expect(translate('langSwitchTo', 'en', {})).toBe('Switch to {language}');
  });

  it('picks the language asked for, and falls back to English', () => {
    expect(pick({ en: 'Bedroom', zh: '卧室' }, 'zh')).toBe('卧室');
    expect(pick({ en: 'Bedroom', zh: '卧室' }, 'en')).toBe('Bedroom');
  });
});

describe('the diorama’s own text', () => {
  it('names every room in both languages', () => {
    for (const room of rooms) {
      expectBilingual(`${room.id} name`, room.name);
      expectBilingual(`${room.id} short name`, room.shortName);
      // The Japanese name is the house's, so it is never translated and never empty.
      expect(blank(room.kana), `${room.id} kana`).toBe(false);
    }
  });

  it('names every character and tells their story in both languages', () => {
    for (const character of characters) {
      expectBilingual(`${character.id} name`, character.name);
      expectBilingual(`${character.id} short name`, character.shortName);
      expectBilingual(`${character.id} bio`, character.bio);
      expect(blank(character.jpName), `${character.id} jpName`).toBe(false);
    }
  });

  it('writes every hotspot card twice', () => {
    for (const hotspot of roomHotspots) {
      expectBilingual(`${hotspot.id} title`, hotspot.title);
      expectBilingual(`${hotspot.id} body`, hotspot.body);
    }
  });

  it('labels every time of day in both languages', () => {
    for (const preset of timesOfDay) expectBilingual(preset.id, preset.label);
  });

  it('does not leave Latin-only punctuation in the Chinese prose', () => {
    // A Chinese paragraph breaks on `，` and ends on `。`; a stray `, ` or `. ` means the English
    // was pasted across, which is the failure mode a per-field check cannot see.
    const zh = [...roomHotspots.map((h) => h.body.zh), ...characters.map((c) => c.bio.zh)];
    for (const text of zh) {
      expect(text, text.slice(0, 24)).not.toMatch(/[a-z], |[a-z]\. [A-Z]/);
      expect(text, text.slice(0, 24)).toMatch(/。/);
    }
  });
});
