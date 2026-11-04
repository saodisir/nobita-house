import { describe, expect, it } from 'vitest';
import { clipStride, GAME_CLIPS, moveClipFor, PLAY_CLIPS, pauseClipFor, WAIT_CLIPS } from './walk-clips';

/** Stand-in clips: only the names matter to the choice, never the tracks. */
const clips = (...names: string[]) => names.map((name) => ({ name })) as never;

describe('walk clips', () => {
  it('plays the game the group is in, whatever the place would otherwise ask for', () => {
    expect(pauseClipFor(0, clips('idle', 'talk', 'dance'), false, 'dance')).toBe('dance');
  });

  it('plays rather than waits where there is room, and waits at the kerb', () => {
    const all = clips('idle', ...PLAY_CLIPS, ...WAIT_CLIPS);
    for (let i = 0; i < PLAY_CLIPS.length; i++) {
      expect(pauseClipFor(i, all, true, null)).toBe(PLAY_CLIPS[i]);
    }
    for (let i = 0; i < WAIT_CLIPS.length; i++) {
      // Picked by index out of the waiting list, so the two children who stop together differ.
      expect(pauseClipFor(i, all, false, null)).toBe(WAIT_CLIPS[i]);
    }
  });

  it('falls back to idle on a model that has none of it', () => {
    // The posed sculpts and the proxies carry no clips at all; the GLBs carry a subset.
    expect(pauseClipFor(0, clips('idle'), true, 'dance')).toBe('idle');
    expect(pauseClipFor(0, clips('idle', 'look-around'), true, null)).toBe('look-around');
    expect(pauseClipFor(0, clips(), true, 'dance')).toBeNull();
  });

  it('runs only when the model has a run clip and the pace is past a walk', () => {
    expect(moveClipFor(true, clips('walk', 'run'))).toBe('run');
    expect(moveClipFor(false, clips('walk', 'run'))).toBe('walk');
    // A model with no run keeps its walk, at a walk's time scale: legs that cannot run should
    // not be driven at the rate of a run.
    expect(moveClipFor(true, clips('walk'))).toBe('walk');
    expect(moveClipFor(true, clips())).toBeNull();
  });

  it('gives a run cycle more ground than a walk cycle of the same model', () => {
    expect(clipStride('walk', 1)).toBe(1);
    expect(clipStride('run', 1)).toBeGreaterThan(1.5);
    expect(clipStride('clap', 1)).toBe(1);
  });

  it('has games the models can actually play', () => {
    // Every game clip is a loop in `animations.ts`, or a one-shot whose shape is cyclic.
    expect(GAME_CLIPS.length).toBeGreaterThan(2);
    expect(new Set(GAME_CLIPS).size).toBe(GAME_CLIPS.length);
  });
});
