import { describe, expect, it } from 'vitest';
import { type CharacterDef, characterById, characters } from '../data/characters';
import { HOUSE_PATH_LENGTH } from '../data/house-path';
import { layout } from '../data/scene';
import type { WalkSample } from '../data/walk-routes';
import { advanceWander, createWander, sampleWander, type WanderState, wanderSpeed } from './wander';

/** A child's width across, metres: the margin the wall and the gate are checked with. */
const BODY = 0.36;

const nobita = characterById('nobita');
if (!nobita) throw new Error('characters.ts has no nobita');
const def: CharacterDef = nobita;

/**
 * Run one child for `seconds` at 60 Hz, sampling every frame. Returns the states it passed
 * through and the largest distance it moved between two frames.
 */
function run(state: WanderState, index: number, seconds: number, walking = true) {
  const out: WalkSample = { x: 0, y: 0, z: 0, heading: 0 };
  const dt = 1 / 60;
  const legs = new Set<WanderState['leg']>();
  let maxStep = 0;
  let maxHouseD = 0;
  sampleWander(state, index, out);
  let px = out.x;
  let py = out.y;
  let pz = out.z;
  for (let t = 0; t < seconds; t += dt) {
    advanceWander(state, dt, walking);
    sampleWander(state, index, out);
    legs.add(state.leg);
    maxHouseD = Math.max(maxHouseD, state.houseD);
    maxStep = Math.max(maxStep, Math.hypot(out.x - px, out.y - py, out.z - pz));
    px = out.x;
    py = out.y;
    pz = out.z;
  }
  return { legs, maxStep, maxHouseD };
}

describe('wander', () => {
  it('does not jump when the stroll is switched on', () => {
    // The spot is in front of the wall and the lap is behind it. Without the walk out through
    // the gate the child appears inside the garden on the first frame — a two-metre jump.
    for (let index = 0; index < 6; index++) {
      const child = characterById(
        ['jaian', 'shizuka', 'nobita', 'doraemon', 'suneo', 'dekisugi'][index] ?? '',
      );
      if (!child) throw new Error('missing character');
      const state = createWander(index, child);
      const { maxStep } = run(state, index, 30);
      // A frame at the yard's pace covers 1.3 cm; anything past 5 cm is a cut, not a walk.
      expect(maxStep, `${child.id} jumped`).toBeLessThan(0.05);
    }
  });

  it('does not put a child indoors before it has walked out of the gate', () => {
    const state = createWander(2, def);
    let enteredAt: number | null = null;
    for (let i = 0; i < 600; i++) {
      advanceWander(state, 1 / 60, true);
      if (state.leg === 'in' && enteredAt === null) enteredAt = state.exit;
    }
    // The spot is in front of the wall, the front door behind it: the child has to be out on
    // the lap before the door is a way in.
    expect(enteredAt).toBe(1);
  });

  it('sends the child that may go indoors all the way in, and back out again', () => {
    const state = createWander(2, def);
    const { legs, maxHouseD } = run(state, 2, 200);
    expect(legs.has('in')).toBe(true);
    expect(legs.has('turn')).toBe(true);
    expect(legs.has('out')).toBe(true);
    expect(maxHouseD).toBeCloseTo(HOUSE_PATH_LENGTH, 6);
    // And it comes back to the lap rather than standing in the doorway.
    expect(state.leg).toBe('yard');
  });

  it('walks at its pace, not at a run', () => {
    const state = createWander(2, def);
    let top = 0;
    for (let i = 0; i < 600; i++) {
      advanceWander(state, 1 / 60, true);
      top = Math.max(top, wanderSpeed(state));
    }
    expect(top).toBeLessThan(1);
    expect(top).toBeGreaterThan(0.5);
  });

  it('comes back to its spot when the stroll is switched off', () => {
    const state = createWander(2, def);
    const out: WalkSample = { x: 0, y: 0, z: 0, heading: 0 };
    for (let i = 0; i < 300; i++) advanceWander(state, 1 / 60, true);
    advanceWander(state, 1 / 60, false);
    sampleWander(state, 2, out);
    expect(out.x).toBeCloseTo(def.position[0], 6);
    expect(out.z).toBeCloseTo(def.position[2], 6);
    expect(state.leg).toBe('yard');
    expect(state.exit).toBe(0);
  });

  it('walks out of the yard through the gate, not through the wall beside it', () => {
    // The lot is walled and the gate is the only way through. A child that went from its spot
    // straight to its point on the lap crossed the wall beside the opening — the body half a
    // metre west of a gate it was not walking at.
    const half = layout.lot.wallThickness / 2;
    const x0 = layout.wall.gateX - layout.wall.gateWidth / 2 + BODY / 2;
    const x1 = layout.wall.gateX + layout.wall.gateWidth / 2 - BODY / 2;
    for (const index of [1, 2, 3]) {
      const child = characters[index];
      if (!child) throw new Error(`no character at ${index}`);
      const state = createWander(index, child);
      const out: WalkSample = { x: 0, y: 0, z: 0, heading: 0 };
      const seen: string[] = [];
      for (let i = 0; i < 60 * 40; i++) {
        advanceWander(state, 1 / 60, true);
        sampleWander(state, index, out);
        if (state.leg !== 'yard') continue;
        if (Math.abs(out.z - layout.wall.frontZ) >= half + BODY / 2) continue;
        seen.push(`${out.x.toFixed(2)}, ${out.z.toFixed(2)} at ${(i / 60).toFixed(1)} s`);
        expect(out.x, `${child.id} in the wall at ${seen.at(-1)}`).toBeGreaterThan(x0);
        expect(out.x, `${child.id} in the wall at ${seen.at(-1)}`).toBeLessThan(x1);
      }
      // It does cross the wall line on the way out, so the check above is not vacuous.
      expect(seen.length, `${child.id} never crossed the wall line`).toBeGreaterThan(0);
    }
  });

  it('keeps a street walker off the yard lap', () => {
    const gian = characterById('jaian');
    if (!gian) throw new Error('characters.ts has no jaian');
    const state = createWander(0, gian);
    const { legs } = run(state, 0, 60);
    expect(legs).toEqual(new Set(['yard']));
    expect(state.exit).toBe(0);
  });
});
