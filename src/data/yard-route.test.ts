import { describe, expect, it } from 'vitest';
import { HOUSE_FOOTPRINT } from './house-site';
import { layout, type Rect } from './scene';
import { sampleYard, YARD_LOOP_LENGTH, YARD_Y, type YardSample, yardCorners } from './yard-route';

const LOT: Rect = {
  x0: -layout.lot.width / 2,
  x1: layout.lot.width / 2,
  z0: layout.wall.frontZ - layout.lot.depth,
  z1: layout.wall.frontZ,
};

/** Every lane `wander.ts` gives a child. A lane is only legal if all three are. */
const LATERALS = [-0.55, 0, 0.55];
const STEP = 0.05;

const inside = (x: number, z: number, r: Rect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

describe('yard route', () => {
  it('stays on the lot and clear of the house on every lane, all the way round', () => {
    const s: YardSample = { x: 0, y: 0, z: 0, heading: 0 };
    for (const lateral of LATERALS) {
      for (let u = 0; u < YARD_LOOP_LENGTH; u += STEP) {
        sampleYard(u, lateral, s);
        const where = `lane ${lateral} at ${u.toFixed(2)} m: (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`;
        expect(inside(s.x, s.z, LOT), `off the lot — ${where}`).toBe(true);
        expect(inside(s.x, s.z, HOUSE_FOOTPRINT), `through the house — ${where}`).toBe(false);
      }
    }
  });

  it('keeps a body-width off the house and the walls', () => {
    // A child is about 0.36 m across; a metre of clearance is what makes the lap read as
    // walking round a garden rather than squeezing along the plaster.
    const s: YardSample = { x: 0, y: 0, z: 0, heading: 0 };
    for (let u = 0; u < YARD_LOOP_LENGTH; u += STEP) {
      sampleYard(u, 0, s);
      const offHouse = Math.max(
        HOUSE_FOOTPRINT.x0 - s.x,
        s.x - HOUSE_FOOTPRINT.x1,
        HOUSE_FOOTPRINT.z0 - s.z,
        s.z - HOUSE_FOOTPRINT.z1,
      );
      expect(offHouse, `against the house at ${u.toFixed(2)} m`).toBeGreaterThan(0.9);
      const offWall = Math.min(s.x - LOT.x0, LOT.x1 - s.x, s.z - LOT.z0, LOT.z1 - s.z);
      expect(offWall, `against the lot wall at ${u.toFixed(2)} m`).toBeGreaterThan(0.9);
    }
  });

  it('starts on the gate axis, so the lap begins where the children come in', () => {
    const [first] = yardCorners;
    expect(first?.[0]).toBeCloseTo(layout.wall.gateX, 6);
    const s = sampleYard(0, 0, { x: 0, y: 0, z: 0, heading: 0 });
    expect(s.x).toBeCloseTo(layout.wall.gateX, 6);
  });

  it('is one flat lap, wrapping cleanly at its length', () => {
    const a = sampleYard(0, 0, { x: 0, y: 0, z: 0, heading: 0 });
    const b = sampleYard(YARD_LOOP_LENGTH, 0, { x: 0, y: 0, z: 0, heading: 0 });
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
    for (let u = 0; u < YARD_LOOP_LENGTH; u += 1) {
      expect(sampleYard(u, 0, { x: 0, y: 0, z: 0, heading: 0 }).y).toBe(YARD_Y);
    }
    // Four sides round a 15 × 18 m lot with the house in the middle: comfortably over 40 m.
    expect(YARD_LOOP_LENGTH).toBeGreaterThan(40);
  });

  it('faces along the lap, never across it', () => {
    const s: YardSample = { x: 0, y: 0, z: 0, heading: 0 };
    for (let u = 0; u < YARD_LOOP_LENGTH; u += STEP) {
      const before = sampleYard(u, 0, { x: 0, y: 0, z: 0, heading: 0 });
      sampleYard(u + STEP, 0, s);
      const travelled = Math.atan2(s.x - before.x, s.z - before.z);
      const gap = Math.abs(travelled - before.heading);
      const wrapped = Math.min(gap, Math.PI * 2 - gap);
      // Across a corner the heading step is one right angle; along a side it is zero.
      expect(wrapped).toBeLessThan(Math.PI / 2 + 0.01);
    }
  });
});
