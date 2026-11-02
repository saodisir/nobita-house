import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMusicEnabled, loadMusicVolume, saveMusicEnabled, saveMusicVolume } from './use-background-music';

const throwingStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('music preferences', () => {
  let items: Map<string, string>;

  beforeEach(() => {
    items = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  describe('on/off', () => {
    it('defaults to on for a first visit', () => {
      expect(loadMusicEnabled()).toBe(true);
    });

    it('remembers turning the music off and back on', () => {
      saveMusicEnabled(false);
      expect(loadMusicEnabled()).toBe(false);
      saveMusicEnabled(true);
      expect(loadMusicEnabled()).toBe(true);
    });

    it('falls back to on when storage throws', () => {
      vi.stubGlobal('localStorage', throwingStorage);
      expect(() => saveMusicEnabled(false)).not.toThrow();
      expect(loadMusicEnabled()).toBe(true);
    });
  });

  describe('volume', () => {
    it('uses the fallback for a first visit', () => {
      expect(loadMusicVolume(0.3)).toBe(0.3);
    });

    it('remembers the chosen volume, including silence', () => {
      saveMusicVolume(0.45);
      expect(loadMusicVolume(0.3)).toBe(0.45);
      saveMusicVolume(0);
      expect(loadMusicVolume(0.3)).toBe(0);
    });

    it('clamps out-of-range values on save and load', () => {
      saveMusicVolume(1.8);
      expect(loadMusicVolume(0.3)).toBe(1);
      items.set('nobita-house.music-volume', '-2');
      expect(loadMusicVolume(0.3)).toBe(0);
    });

    it('ignores junk in storage', () => {
      for (const junk of ['', ' ', 'loud', 'NaN', 'Infinity']) {
        items.set('nobita-house.music-volume', junk);
        expect(loadMusicVolume(0.3)).toBe(0.3);
      }
    });

    it('falls back when storage throws', () => {
      vi.stubGlobal('localStorage', throwingStorage);
      expect(() => saveMusicVolume(0.5)).not.toThrow();
      expect(loadMusicVolume(0.3)).toBe(0.3);
    });
  });
});
