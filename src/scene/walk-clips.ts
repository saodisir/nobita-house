import type { AnimationClip } from 'three';

/**
 * Which clip a child is playing, from what it is doing and where it is standing.
 *
 * Split out of `character.tsx` because this is the one part of the fade between clips that is
 * a decision rather than a side effect: given a ground speed, a place and the clips a model
 * actually carries, which animation should be up. Keeping it pure means the fallbacks — a
 * model with no `run`, a model with no `clap` — are testable without a renderer.
 */

/** Jumping, clapping, dancing: what children do where there is room to do it. */
export const PLAY_CLIPS = ['clap', 'dance', 'house-dancing', 'swing-dancing'] as const;

/**
 * Standing about, on the pavement: they are waiting at the kerb, not dancing in the road.
 * These are all authored standing loops.
 */
export const WAIT_CLIPS = ['look-around', 'talk', 'think', 'idle'] as const;

/**
 * The games the whole group joins in, in rotation. `jump` and `cheer` are one-shots in the
 * catalog, but both are cyclic in shape — take off and land, arms up and down — so played on a
 * loop they read as a child hopping and cheering rather than as a pose snapping back.
 */
export const GAME_CLIPS = ['clap', 'dance', 'jump', 'cheer', 'swing-dancing', 'house-dancing'] as const;

/** Ground a run clip covers in one cycle, as a multiple of the same model's walking stride. */
export const RUN_STRETCH = 1.8;
/** Above this share of the running pace the walk clip no longer fits and `run` takes over. */
export const RUN_AT = 0.7;

const names = (animations: readonly AnimationClip[]) => new Set(animations.map((clip) => clip.name));

/**
 * The clip a child stands in when it has stopped: a game if the group is in one, otherwise a
 * play loop out where there is room, otherwise a standing loop on the pavement, otherwise
 * whatever the model rests in.
 *
 * Each list is read from the child's own place in it and then all the way round, so a model
 * that is missing one clip does not fall straight through to a bare idle: the next child in
 * the rotation simply gets a different loop.
 */
export function pauseClipFor(
  index: number,
  animations: readonly AnimationClip[],
  outside: boolean,
  game: string | null,
): string | null {
  const has = names(animations);
  // A game the model cannot play is no game: fall through to the place's own loops rather
  // than fading out of the walk and standing there frozen.
  if (game && has.has(game)) return game;
  const first = index % Math.max(1, (outside ? PLAY_CLIPS : WAIT_CLIPS).length);
  for (const list of outside ? [PLAY_CLIPS, WAIT_CLIPS] : [WAIT_CLIPS]) {
    for (let k = 0; k < list.length; k++) {
      const name = list[(first + k) % list.length];
      if (name && has.has(name)) return name;
    }
  }
  return has.has('idle') ? 'idle' : null;
}

/**
 * `walk` or `run`, whichever the pace and the model between them allow. The pace arrives
 * already reduced to a flag: `use-walker.ts` reads the live speed every frame, and re-rendering
 * on the flag rather than on the number is what keeps this from crossing clips ten times a
 * second as a child accelerates.
 */
export function moveClipFor(running: boolean, animations: readonly AnimationClip[]): string | null {
  const has = names(animations);
  if (running && has.has('run')) return 'run';
  return has.has('walk') ? 'walk' : null;
}

/**
 * Ground one cycle of `clip` covers, metres: the divisor that keeps the feet planted at any
 * speed. A run covers more ground per cycle than a walk, so the same model runs its cycle
 * slower than its speed alone would suggest.
 */
export function clipStride(clip: string, stride: number): number {
  return clip === 'run' ? stride * RUN_STRETCH : stride;
}
