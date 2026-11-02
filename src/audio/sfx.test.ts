import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenMotion } from '../editor/house/build-shell';
import { isSfxEnabled, loadSfxEnabled, saveSfxEnabled, setSfxEnabled, sfxForToggle } from './sfx';

const slide: OpenMotion = { kind: 'slide', axis: 'x', distance: 0.6 };
const swing: OpenMotion = { kind: 'swing', degrees: -90 };

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('sfx', () => {
  describe('motion → sound mapping', () => {
    it('sweeps a sliding leaf and whooshes a hinged one', () => {
      expect(sfxForToggle(slide, 'start')).toBe('slide');
      expect(sfxForToggle(swing, 'start')).toBe('swing');
    });

    it('clacks every arrival, however the leaf travels', () => {
      expect(sfxForToggle(slide, 'end')).toBe('clack');
      expect(sfxForToggle(swing, 'end')).toBe('clack');
    });
  });

  describe('enabled flag', () => {
    let items: Map<string, string>;

    beforeEach(() => {
      items = new Map();
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => items.get(key) ?? null,
        setItem: (key: string, value: string) => items.set(key, value),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      setSfxEnabled(true);
    });

    it('defaults to on for a first visit', () => {
      expect(loadSfxEnabled()).toBe(true);
      expect(isSfxEnabled()).toBe(true);
    });

    it('applies immediately and remembers the off choice', () => {
      setSfxEnabled(false);
      expect(isSfxEnabled()).toBe(false);
      expect(items.get('nobita-house.sfx')).toBe('off');
      expect(loadSfxEnabled()).toBe(false);
      setSfxEnabled(true);
      expect(isSfxEnabled()).toBe(true);
      expect(loadSfxEnabled()).toBe(true);
    });

    it('falls back to on when storage throws', () => {
      vi.stubGlobal('localStorage', throwingStorage);
      expect(() => saveSfxEnabled(false)).not.toThrow();
      expect(loadSfxEnabled()).toBe(true);
    });
  });
});
