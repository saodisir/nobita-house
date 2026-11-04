import { describe, expect, it } from 'vitest';
import { inSwing, SWING_SWEEPS, type SwingSweep } from './door-sweep';

const RADIUS = 0.19;

const front = (): SwingSweep => {
  const s = SWING_SWEEPS.find((leaf) => leaf.id === 'door-front');
  if (!s) throw new Error('plan.ts has no hinged front door');
  return s;
};

/** A point `along` metres from the hinge toward the latch, `out` metres onto the swing side. */
const at = (s: SwingSweep, along: number, out: number) => ({
  x: s.hx + s.ux * along + s.vx * out,
  z: s.hz + s.uz * along + s.vz * out,
});

describe('a hinged leaf sweeps a quarter-disc', () => {
  it('finds every hinged leaf a walker can reach', () => {
    expect(SWING_SWEEPS.map((s) => s.id).sort()).toEqual(
      ['door-back', 'door-front', 'door-toilet', 'door-yoshitsu'].sort(),
    );
  });

  it('keeps the shut direction and the open direction perpendicular', () => {
    for (const s of SWING_SWEEPS) expect(Math.abs(s.ux * s.vx + s.uz * s.vz)).toBe(0);
  });

  it('counts a body just off the shut leaf, on the side it opens into', () => {
    const s = front();
    const p = at(s, 0.3, 0.35);
    expect(inSwing(s, p.x, p.z, RADIUS)).toBe(true);
  });

  it('does not count the room behind the wall, which the leaf never enters', () => {
    const s = front();
    const p = at(s, 0.3, -0.6);
    expect(inSwing(s, p.x, p.z, RADIUS)).toBe(false);
  });

  it('does not count a body farther away than the leaf can reach', () => {
    const s = front();
    const p = at(s, 0.3, 2);
    expect(inSwing(s, p.x, p.z, RADIUS)).toBe(false);
  });

  it('does not count a body past the hinge', () => {
    const s = front();
    const p = at(s, -1, 0.2);
    expect(inSwing(s, p.x, p.z, RADIUS)).toBe(false);
  });
});
