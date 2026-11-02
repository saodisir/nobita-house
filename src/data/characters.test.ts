import { describe, expect, it } from 'vitest';
import { motions } from './animations';
import { characters } from './characters';
import { layout } from './scene';

describe('character data', () => {
  it('has unique kebab-case ids', () => {
    const ids = characters.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });
  it('stands on the sidewalk in front of the wall, ordered left to right', () => {
    const sidewalkStart = layout.wall.frontZ;
    const sidewalkEnd = layout.wall.frontZ + layout.sidewalk.depth;
    for (const c of characters) {
      expect(c.position[1]).toBe(layout.standY);
      expect(c.position[2]).toBeGreaterThan(sidewalkStart);
      expect(c.position[2]).toBeLessThan(sidewalkEnd + 0.1);
      expect(c.height).toBeGreaterThan(1);
      expect(c.height).toBeLessThan(1.8);
    }
    const xs = characters.map((c) => c.position[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
  it('rests only in looping clips the motion catalog knows', () => {
    for (const c of characters) {
      if (!c.rest) continue;
      const motion = motions.find((m) => m.id === c.rest?.clip);
      expect(motion, `${c.id} rests in ${c.rest.clip}`).toBeDefined();
      expect(motion?.loop).toBe(true);
    }
  });
  it('seats wall sitters over a front wall run, clear of the gate and the pier caps', () => {
    const { gateX, gateWidth, frontZ, copingTop, midPierX } = layout.wall;
    const sitters = characters.filter((c) => c.rest && c.rest.offset[1] > 1);
    expect(sitters.map((c) => c.id)).toEqual(['jaian', 'suneo']);
    for (const c of sitters) {
      const offset = c.rest?.offset ?? [0, 0, 0];
      const x = c.position[0];
      expect(Math.abs(x - gateX), `${c.id} off the gate`).toBeGreaterThan(gateWidth / 2 + 0.3);
      for (const pier of midPierX) expect(Math.abs(x - pier), `${c.id} off the pier`).toBeGreaterThan(0.45);
      // The model origin sits below the coping top by the clip's seat height, and over the wall.
      expect(c.position[1] + offset[1]).toBeLessThan(copingTop);
      expect(Math.abs(c.position[2] + offset[2] - frontZ)).toBeLessThan(0.3);
    }
  });
  it('gives every character a walking stride shorter than they are tall', () => {
    for (const c of characters) {
      expect(c.stride).toBeGreaterThan(0);
      expect(c.stride).toBeLessThan(c.height);
    }
  });
});
