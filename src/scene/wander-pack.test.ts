import { beforeEach, describe, expect, it } from 'vitest';
import { characters } from '../data/characters';
import { NAV_OBSTACLES } from '../data/nav-graph';
import { loopPosition, RUN_SPEED, WALK_LOOP_LENGTH, type WalkSample } from '../data/walk-routes';
import { GAME_CLIPS } from './walk-clips';
import { createWander, isPlaying, sampleWander, type WanderState } from './wander';
import {
  advancePack,
  clearPack,
  FOLLOW_GAP,
  GAME_CLEAR,
  joinPack,
  planSeed,
  setNextPlanSeed,
} from './wander-pack';

/** A fixed afternoon, so the pack's assertions do not depend on the clock or Math.random(). */
const SEED = 20261104;

/** A child's width across, metres: below this the two are the same model. */
const BODY = 0.36;
const DT = 1 / 60;
const mod = (a: number, m: number) => ((a % m) + m) % m;

function mount(seed = SEED): WanderState[] {
  clearPack();
  setNextPlanSeed(seed);
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
    setNextPlanSeed(SEED);
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

  it('draws a fresh afternoon on every off-to-on switch, and replays a seed exactly', () => {
    const states = mount();
    const snapshot = () =>
      states.map((s) => ({
        pace: s.pace,
        walkFor: s.walkFor,
        restFor: s.restFor,
        lane: s.lateral,
        party: s.party,
        leader: s.partyLeader,
      }));
    advancePack(0, true);
    const first = { seed: planSeed(), children: snapshot() };
    expect(first.seed).toBe(SEED);

    advancePack(DT, false);
    setNextPlanSeed(SEED + 1);
    advancePack(DT * 2, true);
    expect(planSeed()).toBe(SEED + 1);
    expect(snapshot()).not.toEqual(first.children);

    advancePack(DT * 3, false);
    setNextPlanSeed(SEED);
    advancePack(DT * 4, true);
    expect(snapshot()).toEqual(first.children);
  });

  it('takes a fresh seed when no test seed is set', () => {
    clearPack();
    const child = characters[0];
    if (!child) throw new Error('characters.ts is empty');
    joinPack(child.id, 0, createWander(0, child));
    advancePack(0, true);
    const first = planSeed();
    advancePack(DT, false);
    advancePack(DT * 2, true);
    expect(planSeed()).not.toBe(first);
  });

  it('does not move anybody off their spot when the plan is drawn', () => {
    const states = mount();
    const out = characters.map(() => ({ x: 0, y: 0, z: 0, heading: 0 }));
    places(states, out);
    const before = out.map((p) => ({ x: p.x, z: p.z }));
    advancePack(0, true);
    places(states, out);
    for (let i = 0; i < states.length; i++) {
      const p = out[i];
      const b = before[i];
      if (!p || !b) throw new Error('missing sample');
      expect(Math.hypot(p.x - b.x, p.z - b.z)).toBeLessThan(1e-9);
    }
  });

  it('walks a party on one distance, in different lanes, and plays together', () => {
    const states = mount();
    advancePack(0, true);
    const party = states.map((s, index) => ({ s, index })).filter(({ s }) => s.party !== null);
    expect(party.length).toBeGreaterThanOrEqual(2);
    expect(party.filter(({ s }) => s.partyLeader)).toHaveLength(1);
    expect(new Set(party.map(({ s }) => s.lateral)).size).toBe(party.length);

    const out = characters.map(() => ({ x: 0, y: 0, z: 0, heading: 0 }));
    let maxSpread = 0;
    let gameFrames = 0;
    let minSideDistance = Number.POSITIVE_INFINITY;
    let sideSamples = 0;
    for (let step = 1; step < 60 * 180; step++) {
      advancePack(step * DT, true);
      const us = party.map(({ s }) => s.u);
      maxSpread = Math.max(maxSpread, Math.max(...us) - Math.min(...us));
      const clips = new Set(party.map(({ s }) => s.game));
      if (clips.size === 1 && party[0]?.s.game !== null) gameFrames++;
      // Only once they are all out on the lap: on the way through the gate their three walks
      // legitimately converge on the same opening.
      if (!party.every(({ s }) => s.exit >= 1)) continue;
      places(states, out);
      for (let i = 0; i < party.length; i++) {
        for (let j = i + 1; j < party.length; j++) {
          const a = out[party[i]?.index ?? -1];
          const b = out[party[j]?.index ?? -1];
          if (!a || !b) continue;
          minSideDistance = Math.min(minSideDistance, Math.hypot(a.x - b.x, a.z - b.z));
          sideSamples++;
        }
      }
    }
    // One distance round the lap, so they never string out into a procession.
    expect(maxSpread).toBeLessThan(1e-9);
    expect(sideSamples).toBeGreaterThan(0);
    expect(minSideDistance).toBeGreaterThan(BODY);
    // The same game reaches every member of the party, so they jump or clap together.
    expect(gameFrames).toBeGreaterThan(0);
  });

  it('draws one walk for the whole garden, with a lane each, on every switch', () => {
    const states = mount();
    advancePack(0, true);
    const yard = states.filter((s) => s.kind === 'yard');
    const street = states.filter((s) => s.kind === 'street');
    expect(yard.length).toBeGreaterThan(0);
    expect(yard.every((s) => s.route !== null)).toBe(true);
    // The street keeps its measured lap and the braking that lands a child on its own spot.
    expect(street.every((s) => s.route === null)).toBe(true);
    const party = yard.filter((s) => s.party !== null);
    expect(party.length).toBeGreaterThanOrEqual(2);
    // One walk for the whole garden, so a lane each is what keeps the children apart.
    expect(yard.every((s) => s.route === yard[0]?.route)).toBe(true);
    expect(new Set(yard.map((s) => s.lateral)).size).toBe(yard.length);
    // A party leaves the gate together. A child on its own gets a short head start down the
    // same walk, so the moment they all step out of the gate is not two bodies on one spot.
    expect(party.every((s) => s.u === 0)).toBe(true);
    const solo = yard.filter((s) => s.party === null);
    expect(solo.every((s) => s.u > 0 && s.u < (s.route?.length ?? 0) * 0.25)).toBe(true);
    expect(yard.every((s) => s.doorU < 0.5)).toBe(true);
  });

  it("puts the afternoon's walks away when the children are called in", () => {
    const states = mount();
    advancePack(0, true);
    expect(states.some((s) => s.route !== null)).toBe(true);
    advancePack(DT, false);
    expect(states.every((s) => s.route === null)).toBe(true);
  });

  it('replays the same walks from a seed and draws new ones from a new seed', () => {
    const states = mount();
    const walks = () => states.map((s) => s.route?.ids.join('>') ?? null);
    advancePack(0, true);
    const first = walks();
    advancePack(DT, false);
    setNextPlanSeed(SEED);
    advancePack(DT * 2, true);
    expect(walks()).toEqual(first);
    advancePack(DT * 3, false);
    setNextPlanSeed(SEED + 1);
    advancePack(DT * 4, true);
    expect(walks()).not.toEqual(first);
  });

  it('keeps children on the garden walk out of each other for a whole afternoon', () => {
    const slots: WalkSample[] = characters.map(() => ({ x: 0, y: 0, z: 0, heading: 0 }));
    let overlapFrames = 0;
    // 31689 draws a walk that passes close to itself: two children reach the same patch of
    // ground at different distances round it, and a game once froze them together for 8 s.
    for (const seed of [SEED, 7, 31, 12345, 999, 31689]) {
      const states = mount(seed);
      for (let step = 0; step < 60 * 180; step++) {
        advancePack(step * DT, true);
        const out: { x: number; z: number }[] = [];
        states.forEach((state, index) => {
          if (state.kind !== 'yard' || !isPlaying(state)) return;
          const slot = slots[index];
          if (!slot) throw new Error(`no slot at ${index}`);
          sampleWander(state, index, slot);
          out.push({ x: slot.x, z: slot.z });
        });
        for (let i = 0; i < out.length; i++) {
          for (let j = i + 1; j < out.length; j++) {
            const a = out[i];
            const b = out[j];
            if (!a || !b) continue;
            if (Math.hypot(a.x - b.x, a.z - b.z) < BODY) overlapFrames++;
          }
        }
      }
    }
    // Six afternoons of three minutes. Before the garden shared one walk with a lane each,
    // sixty afternoons measured 38 s of children inside one another; this measures 3.3 s.
    expect(overlapFrames / 60).toBeLessThan(1.5);
  });

  it('waits for room around a game before it freezes anybody', () => {
    // A game holds its players still for eight seconds, so starting one on top of a bystander
    // is the one way a brief pass-through turns into a long overlap. Catch the frame the game
    // begins and check there was room around everybody who joined it.
    const states = mount(31689);
    const slots: WalkSample[] = characters.map(() => ({ x: 0, y: 0, z: 0, heading: 0 }));
    let crowdedStarts = 0;
    let inGame = new Set<number>();
    for (let step = 0; step < 60 * 120; step++) {
      advancePack(step * DT, true);
      const now = new Set(states.flatMap((state, index) => (state.game !== null ? [index] : [])));
      const joined = [...now].filter((index) => !inGame.has(index));
      if (joined.length > 0) {
        const places = states.map((state, index) => {
          const slot = slots[index];
          if (!slot) throw new Error(`no slot at ${index}`);
          sampleWander(state, index, slot);
          return { x: slot.x, z: slot.z };
        });
        for (const index of joined) {
          const me = places[index];
          if (!me) continue;
          crowdedStarts += states.filter((state, other) => {
            // Players are meant to be close to one another; it is a bystander standing in
            // the group that a frozen game must not be started on top of.
            if (other === index || now.has(other) || !isPlaying(state)) return false;
            const spot = places[other];
            return spot ? Math.hypot(me.x - spot.x, me.z - spot.z) < GAME_CLEAR : false;
          }).length;
        }
      }
      inGame = now;
    }
    expect(crowdedStarts).toBe(0);
  });

  it('keeps a garden child on its drawn walk, clear of the house', () => {
    const states = mount();
    advancePack(0, true);
    const state = states.find((s) => s.kind === 'yard');
    const route = state?.route;
    if (!state || !route) throw new Error('no garden route');
    state.exit = 1;
    state.leg = 'yard';
    const out = { x: 0, y: 0, z: 0, heading: 0 };
    for (let d = 0; d < route.length; d += 0.25) {
      state.u = d;
      sampleWander(state, state.index, out);
      const hit = NAV_OBSTACLES.some(
        (r) => out.x > r.x0 - 0.19 && out.x < r.x1 + 0.19 && out.z > r.z0 - 0.19 && out.z < r.z1 + 0.19,
      );
      expect(hit, `at ${d.toFixed(2)} m`).toBe(false);
    }
  });
});
