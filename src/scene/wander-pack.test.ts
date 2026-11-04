import { beforeEach, describe, expect, it } from 'vitest';
import { characters } from '../data/characters';
import { loopPosition, RUN_SPEED, WALK_LOOP_LENGTH, type WalkSample } from '../data/walk-routes';
import { GAME_CLIPS } from './walk-clips';
import { createWander, isPlaying, sampleWander, type WanderState } from './wander';
import { advancePack, clearPack, FOLLOW_GAP, joinPack } from './wander-pack';

/** A child's width across, metres: below this the two are the same model. */
const BODY = 0.36;
const DT = 1 / 60;
const mod = (a: number, m: number) => ((a % m) + m) % m;

function mount(): WanderState[] {
  clearPack();
  const states = characters.map((child, index) => createWander(index, child));
  for (const [index, state] of states.entries()) {
    const child = characters[index];
    if (!child) throw new Error(`no character at ${index}`);
    joinPack(child.id, index, state);
  }
  return states;
}

/** Every child's place, sampled from its own state. */
function places(states: readonly WanderState[], out: WalkSample[]): WalkSample[] {
  for (const [index, state] of states.entries()) {
    const slot = out[index];
    if (!slot) throw new Error(`no slot at ${index}`);
    sampleWander(state, index, slot);
  }
  return out;
}

const streetIndexes = characters
  .map((child, index) => ({ child, index }))
  .filter((entry) => entry.child.wander !== 'yard');

describe('wander pack', () => {
  beforeEach(() => {
    clearPack();
  });

  it('never lets a street walker close up on the one in front', () => {
    // The street is one lane. Every street walker is a point on that same line, so a child that
    // pauses is a wall across it, and the one behind used to walk straight through it: suneo and
    // dekisugi were inside each other's bodies for fourteen seconds at a stretch. The rule is
    // about distance round the loop, which is the only thing that separates them.
    const states = mount();
    let closest = Number.POSITIVE_INFINITY;
    let who = '';
    for (let step = 0; step < 60 * 600; step++) {
      advancePack(step * DT, true);
      for (let i = 0; i < streetIndexes.length; i++) {
        for (let j = i + 1; j < streetIndexes.length; j++) {
          const a = streetIndexes[i];
          const b = streetIndexes[j];
          if (!a || !b) continue;
          const sa = states[a.index];
          const sb = states[b.index];
          if (!sa || !sb) continue;
          const pa = loopPosition(a.index, sa.clock.d);
          const pb = loopPosition(b.index, sb.clock.d);
          const gap = Math.min(mod(pb - pa, WALK_LOOP_LENGTH), mod(pa - pb, WALK_LOOP_LENGTH));
          if (gap < closest) {
            closest = gap;
            who = `${a.child.id}-${b.child.id}`;
          }
        }
      }
    }
    // The clearance is measured before anyone moves, so for one frame the follower is aiming
    // at where the gap was, and can close by a frame of its own travel. Twice a walking pace is
    // the worst it can be out by.
    expect(closest, `${who} closed to ${closest.toFixed(3)} m`).toBeGreaterThan(FOLLOW_GAP - RUN_SPEED / 60);
  });

  it('keeps the two that used to merge right through each other a body apart', () => {
    // Gian and Dekisugi are 4.7 m apart on the outer lane and both walk at a metre a second, so
    // the one behind closed up and stayed closed. Measured in world space, not round the loop:
    // this is the number that decides whether it looks like two children or one.
    const states = mount();
    const out = characters.map(() => ({ x: 0, y: 0, z: 0, heading: 0 }));
    const watched = new Set(['jaian-suneo', 'jaian-dekisugi']);
    let closest = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 60 * 600; step++) {
      advancePack(step * DT, true);
      places(states, out);
      for (let i = 0; i < states.length; i++) {
        for (let j = i + 1; j < states.length; j++) {
          if (!watched.has(`${characters[i]?.id}-${characters[j]?.id}`)) continue;
          const a = out[i];
          const b = out[j];
          if (!a || !b) continue;
          closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
        }
      }
    }
    expect(closest).toBeGreaterThan(BODY);
  });

  it('advances a pack of one, so the studio and the single-character scenes still walk', () => {
    clearPack();
    const child = characters[0];
    if (!child) throw new Error('characters.ts is empty');
    const state = createWander(0, child);
    joinPack(child.id, 0, state);
    for (let step = 0; step < 600; step++) advancePack(step * DT, true);
    // Ten seconds at a metre a second, less the step off the mark and a pause part way.
    expect(state.clock.d).toBeGreaterThan(5);
  });

  it('stops the group for a game, all of them doing the same thing', () => {
    // A pause of its own is one child looking at something. A game is the other kind: everyone
    // out in the same place stopping at once. This is the only thing in the scene that makes
    // three children read as playing together rather than as three separate errands.
    const states = mount();
    let playingFrames = 0;
    let disjoint = 0;
    const clips = new Set<string>();
    for (let step = 0; step < 60 * 180; step++) {
      advancePack(step * DT, true);
      const on = states.filter((s) => s.game !== null);
      if (on.length === 0) continue;
      playingFrames++;
      const called = new Set(on.map((s) => s.game));
      // One game at a time, and only children who are actually out playing are in it.
      if (called.size !== 1) disjoint++;
      for (const s of on) if (!isPlaying(s)) disjoint++;
      for (const clip of called) if (clip) clips.add(clip);
    }
    expect(playingFrames).toBeGreaterThan(60 * 8);
    expect(disjoint, 'children in a game that are not playing together').toBe(0);
    // They take the games in turn rather than clapping for ever.
    expect(clips.size).toBeGreaterThan(1);
    for (const clip of clips) expect(GAME_CLIPS).toContain(clip);
  });

  it('runs each game for its eight seconds and then leaves everyone be', () => {
    const states = mount();
    const runs: number[] = [];
    let last: string | null = null;
    let startedAt = 0;
    for (let step = 0; step < 60 * 240; step++) {
      const elapsed = step * DT;
      advancePack(elapsed, true);
      const clip = states.find((s) => s.game !== null)?.game ?? null;
      if (clip && !last) startedAt = elapsed;
      if (!clip && last) runs.push(elapsed - startedAt);
      last = clip;
    }
    expect(runs.length).toBeGreaterThanOrEqual(3);
    for (const run of runs) expect(run).toBeCloseTo(8, 0);
  });

  it('calls the game off when the walk switch goes off', () => {
    const states = mount();
    let started = false;
    for (let step = 0; step < 60 * 90 && !started; step++) {
      advancePack(step * DT, true);
      started = states.some((s) => s.game !== null);
    }
    expect(started).toBe(true);
    advancePack(60 * 90 * DT + DT, false);
    expect(states.every((s) => s.game === null)).toBe(true);
  });
});
