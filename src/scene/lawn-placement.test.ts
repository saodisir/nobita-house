import { describe, expect, it } from 'vitest';
import { HOUSE_SETBACK, heroLot, houseTransform, houseVariants, inHeroLot, layout } from '../data/scene';
import { gardenClearance } from './firefly-placement';
import {
  BLADE_SPACING,
  isHeroLawn,
  KEEP_OUT_MARGIN,
  LAWN_KEEP_OUTS,
  MAX_HEIGHT,
  MIN_HEIGHT,
  NEIGHBOUR_SPACING,
  neighbourLawn,
  placeLawnBlades,
} from './lawn-placement';

describe('lawn placement', () => {
  const blades = placeLawnBlades(heroLot, isHeroLawn);
  // NaN for a missing entry fails every range check below, so a short array cannot pass.
  const at = (n: number) => ({
    x: blades.base[n * 4] ?? Number.NaN,
    z: blades.base[n * 4 + 1] ?? Number.NaN,
    height: blades.shape[n * 4] ?? Number.NaN,
  });

  it('grows the same lawn on every load', () => {
    const again = placeLawnBlades(heroLot, isHeroLawn);
    expect(again.count).toBe(blades.count);
    expect(again.base).toEqual(blades.base);
    expect(again.shape).toEqual(blades.shape);
  });

  it('covers the open garden densely but stays one affordable draw', () => {
    // About 145 m² of the 18 m lot is lawn once the house, its steps, the path, beds, gravel
    // bands, props and worn ground are out of it. At 3 triangles a blade the cap is ~200k
    // triangles in one instanced draw, about what the house itself costs.
    const perSquareMetre = 1 / (BLADE_SPACING * BLADE_SPACING);
    expect(blades.count).toBeGreaterThan(120 * perSquareMetre);
    expect(blades.count).toBeLessThan(65_000);
  });

  it("keeps every blade inside Nobita's wall, off the house, porch and every prop", () => {
    // Collected, not asserted per blade: 40k blades × every keep-out is too many expect calls.
    const strays: { x: number; z: number }[] = [];
    for (let n = 0; n < blades.count; n++) {
      const { x, z } = at(n);
      const inProp = LAWN_KEEP_OUTS.some(
        (r) =>
          x > r.x0 - KEEP_OUT_MARGIN &&
          x < r.x1 + KEEP_OUT_MARGIN &&
          z > r.z0 - KEEP_OUT_MARGIN &&
          z < r.z1 + KEEP_OUT_MARGIN,
      );
      if (!inHeroLot(x, z) || gardenClearance(x, z) < KEEP_OUT_MARGIN || inProp) strays.push({ x, z });
    }
    expect(strays).toEqual([]);
  });

  it('leaves the stones, shed, flower bed and worn earth bare, and grows between them', () => {
    expect(isHeroLawn(-1.4, 4.12)).toBe(false);
    expect(isHeroLawn(5.9, -11.0)).toBe(false);
    expect(isHeroLawn(-5.0, 4.44)).toBe(false);
    // Paving, beds and machinery: the path from gate to porch, the shrub bed under the 洋室
    // window, the gravel and AC unit on the west wall, the heater on the east wall — and the
    // kitchen floor, which is house.
    expect(isHeroLawn(0.9, 4.7)).toBe(false);
    expect(isHeroLawn(-1.6, 3.2)).toBe(false);
    expect(isHeroLawn(-3.85, -1.01)).toBe(false);
    expect(isHeroLawn(3.95, -1.31)).toBe(false);
    expect(isHeroLawn(0, -7.61)).toBe(false);
    // On the path to the shed, beside the washing line, round the tap, and under the east
    // tree. A stray tuft may survive anywhere in the dirt, so each spot is a small
    // neighbourhood.
    const bare = (x: number, z: number) => {
      let grass = 0;
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) if (isHeroLawn(x + i * 0.02, z + j * 0.02)) grass++;
      return grass <= 1;
    };
    expect(bare(5.0, -9.0)).toBe(true);
    expect(bare(-5.35, -7.9)).toBe(true);
    expect(bare(-6.6, 1.95)).toBe(true);
    expect(bare(6.45, -6.1)).toBe(true);
    // Lawn in front of the toilet's bed, in the west garden, east of the house, in the back
    // yard, and in the two notches the kitchen block leaves beside the main block.
    expect(isHeroLawn(3.0, 2.5)).toBe(true);
    expect(isHeroLawn(-6.2, 0.2)).toBe(true);
    expect(isHeroLawn(6.2, 2.0)).toBe(true);
    expect(isHeroLawn(-2.0, -10.8)).toBe(true);
    expect(isHeroLawn(-3.5, -5.0)).toBe(true);
    expect(isHeroLawn(3.5, -5.51)).toBe(true);
  });

  it('fades the lawn into the earth instead of stopping at a line', () => {
    // Across the edge of the worn strip beside the washing line, the grass thins out over a
    // band, not in one step.
    const density = (x: number) => {
      let n = 0;
      for (let j = 0; j < 200; j++) if (isHeroLawn(x, -8.25 + j * 0.005)) n++;
      return n / 200;
    };
    const across = [-6.4, -5.85, -5.75, -5.65, -5.35].map(density);
    expect(across[0]).toBeGreaterThan(0.9);
    expect(across.at(-1)).toBeLessThan(0.05);
    expect(across.some((d) => d > 0.15 && d < 0.85)).toBe(true);
  });

  it('keeps blade heights to a kept lawn', () => {
    const heights = Array.from({ length: blades.count }, (_, n) => at(n).height);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(MIN_HEIGHT);
    expect(Math.max(...heights)).toBeLessThanOrEqual(MAX_HEIGHT);
  });
});

describe('neighbour lawns', () => {
  const lots = layout.neighbours.map((n) => ({
    n,
    blades: placeLawnBlades(n.lot, neighbourLawn(n), NEIGHBOUR_SPACING),
    house: houseTransform(n).bounds,
  }));

  it('plants every neighbour lot, sparser than Nobita’s', () => {
    for (const { blades } of lots) {
      expect(blades.count).toBeGreaterThan(15_000);
      expect(blades.count).toBeLessThan(35_000);
    }
  });

  it('keeps every blade inside its own lot wall and off the house', () => {
    const strays: string[] = [];
    for (const { n, blades, house } of lots) {
      for (let k = 0; k < blades.count; k++) {
        const x = blades.base[k * 4] ?? Number.NaN;
        const z = blades.base[k * 4 + 1] ?? Number.NaN;
        const inLot = x > n.lot.x0 && x < n.lot.x1 && z > n.lot.z0 && z < n.lot.z1;
        const onHouse = x > house.x0 && x < house.x1 && z > house.z0 && z < house.z1;
        if (!inLot || onHouse) strays.push(`${n.id} ${x},${z}`);
      }
    }
    expect(strays).toEqual([]);
  });

  it('leaves the walk, the front door step and the AC unit behind each house bare', () => {
    for (const n of layout.neighbours) {
      const { centre, yaw } = houseTransform(n);
      const v = houseVariants[n.variant];
      const side = n.mirror ? -1 : 1;
      // House-local (along the street, toward it) to world, as neighbours_build.py places them.
      const world = (lx: number, lz: number) =>
        [
          centre[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw),
          centre[1] - lx * Math.sin(yaw) + lz * Math.cos(yaw),
        ] as const;
      const grows = neighbourLawn(n);
      const door = side * v.width * 0.3;
      expect(grows(...world(door, v.depth / 2 + 0.35))).toBe(false);
      expect(grows(...world(-side * (v.width / 2 - 0.9), -v.depth / 2 - 0.22))).toBe(false);
      // The walk runs all the way from the step to the gate in the street wall.
      for (const out of [1, 2, HOUSE_SETBACK - 0.15]) {
        expect(grows(...world(door, v.depth / 2 + out))).toBe(false);
      }
      // Beside the step and either side of the walk, the lawn runs right up to it again.
      expect(grows(...world(-side * v.width * 0.3, v.depth / 2 + 0.4))).toBe(true);
      expect(grows(...world(door + 0.8, v.depth / 2 + 2))).toBe(true);
      expect(grows(...world(door - 0.8, v.depth / 2 + 2))).toBe(true);
    }
  });
});
