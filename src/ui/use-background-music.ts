import { useEffect, useState } from 'react';

const ENABLED_KEY = 'nobita-house.music';
const VOLUME_KEY = 'nobita-house.music-volume';

// Private mode or blocked storage throws; the choice then simply lasts for this visit.
function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Nothing to do: see readStorage.
  }
}

/** Music is on unless the visitor turned it off earlier. */
export function loadMusicEnabled(): boolean {
  return readStorage(ENABLED_KEY) !== 'off';
}

export function saveMusicEnabled(enabled: boolean): void {
  writeStorage(ENABLED_KEY, enabled ? 'on' : 'off');
}

/** The visitor's saved volume (0–1), or `fallback` when nothing valid is stored. */
export function loadMusicVolume(fallback: number): number {
  const stored = readStorage(VOLUME_KEY);
  const volume = stored === null || stored.trim() === '' ? Number.NaN : Number(stored);
  return Number.isFinite(volume) ? clampVolume(volume) : fallback;
}

export function saveMusicVolume(volume: number): void {
  writeStorage(VOLUME_KEY, String(clampVolume(volume)));
}

const clampVolume = (volume: number) => Math.min(1, Math.max(0, volume));

/**
 * Looped background track that auto-plays and remembers the visitor's on/off choice and volume
 * across reloads. Browsers reject sound before the first user gesture, so a blocked auto-play
 * retries on the first click or key press. `playing` mirrors the element itself, so a rejected
 * play() never reads as on.
 */
export function useBackgroundMusic(src: string, defaultVolume = 1) {
  const [audio] = useState(() => Object.assign(new Audio(src), { loop: true, preload: 'none' }));
  const [enabled, setEnabled] = useState(loadMusicEnabled);
  const [volume, setVolumeState] = useState(() => loadMusicVolume(defaultVolume));
  const [playing, setPlaying] = useState(false);

  // Track the element's real state, and silence it on unmount (e.g. leaving for the studio).
  useEffect(() => {
    const sync = () => setPlaying(!audio.paused);
    audio.addEventListener('play', sync);
    audio.addEventListener('pause', sync);
    return () => {
      audio.removeEventListener('play', sync);
      audio.removeEventListener('pause', sync);
      audio.pause();
    };
  }, [audio]);

  useEffect(() => {
    audio.volume = volume;
  }, [audio, volume]);

  // Follow the saved choice; while auto-play is blocked, try again on each gesture until it sounds.
  useEffect(() => {
    if (!enabled) {
      audio.pause();
      return;
    }
    const start = () => audio.play().catch(() => {});
    const stopRetrying = () => {
      document.removeEventListener('click', start);
      document.removeEventListener('keydown', start);
    };
    document.addEventListener('click', start);
    document.addEventListener('keydown', start);
    audio.addEventListener('play', stopRetrying, { once: true });
    start();
    return () => {
      stopRetrying();
      audio.removeEventListener('play', stopRetrying);
    };
  }, [audio, enabled]);

  const toggle = () => {
    const next = audio.paused;
    saveMusicEnabled(next);
    setEnabled(next);
    // Play inside the click itself, which the browser always allows.
    if (next) audio.play().catch(() => {});
  };

  const setVolume = (next: number) => {
    const clamped = clampVolume(next);
    saveMusicVolume(clamped);
    setVolumeState(clamped);
  };

  return { playing, toggle, volume, setVolume };
}

export type BackgroundMusic = ReturnType<typeof useBackgroundMusic>;
