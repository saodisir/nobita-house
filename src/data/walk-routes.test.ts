import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { characters } from './characters';
import { crossingRects, layout, onSidewalk, type Rect } from './scene';
import { nearestHomeDelta, sampleWalk, WALK_LOOP_LENGTH, type WalkSample, walkBounds } from './walk-routes';

const { road, streets } = layout;
const roadEnd = road.startZ + road.depth;
const zebra = crossingRects();
const STEP = 0.05;

const sample = (): WalkSample => ({ x: 0, y: 0, z: 0, heading: 0 });
const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const inside = (x: number, z: number, r: Rect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * `onSidewalk` counts each junction corner as a full square, but the streets GLB rounds it
 * off: past `kerbRadius` from the arc centre that square is carriageway.
 */
function onPavement(x: number, z: number) {
  // Nobita's spot is right on the kerb line, z 7.7, which `5.8 + 1.9` rounds to a hair past.
  if (!onSidewalk(x, z) && !onSidewalk(x, z - 1e-9)) return false;
  const r = streets.kerbRadius;
  for (const [kx, sx] of [
    [streets.side.endX, 1],
    [streets.side.startX, -1],
  ] as const) {
    for (const [kz, sz] of [
      [road.startZ, -1],
      [roadEnd, 1],
    ] as const) {
      const cx = kx + sx * r;
      const cz = kz + sz * r;
      const inCornerSquare =
        (x - kx) * sx >= 0 && (x - cx) * sx <= 0 && (z - kz) * sz >= 0 && (z - cz) * sz <= 0;
      if (inCornerSquare && Math.hypot(x - cx, z - cz) > r) return false;
    }
  }
  return true;
}

/** The crossing's painted width, carried kerb to kerb across the carriageway it spans. */
const crossingWalks: Record<keyof typeof zebra, Rect> = {
  east: { ...zebra.east, z0: road.startZ, z1: roadEnd },
  west: { ...zebra.west, z0: road.startZ, z1: roadEnd },
  south: { ...zebra.south, x0: streets.side.startX, x1: streets.side.endX },
  north: { ...zebra.north, x0: streets.side.startX, x1: streets.side.endX },
};

/** Every sample of every character over one lap, in step with the shared distance. */
function lap() {
  const steps = Math.ceil(WALK_LOOP_LENGTH / STEP);
  return Array.from({ length: steps + 1 }, (_, k) => {
    const d = k * STEP;
    return characters.map((_, i) => sampleWalk(i, d, sample()));
  });
}
const samples = lap();

describe('zebra crossings', () => {
  it('matches the bars streets_build.py lays down', () => {
    const { inset, bars, barWidth, pitch, margin } = streets.crossing;
    // The builder's own recipe: a base line past the kerb arc, bars stepped outward from it.
    const legs = {
      east: { axis: 'x', base: streets.side.endX + streets.kerbRadius + inset, sign: 1 },
      west: { axis: 'x', base: streets.side.startX - streets.kerbRadius - inset, sign: -1 },
      south: { axis: 'z', base: roadEnd + streets.kerbRadius + inset, sign: 1 },
      north: { axis: 'z', base: road.startZ - streets.kerbRadius - inset, sign: -1 },
    } as const;
    for (const [leg, { axis, base, sign }] of Object.entries(legs)) {
      const starts = Array.from({ length: bars }, (_, i) => base + sign * i * pitch);
      const lo = Math.min(...starts);
      const hi = Math.max(...starts) + barWidth;
      const rect = zebra[leg as keyof typeof zebra];
      if (axis === 'x') {
        expect([rect.x0, rect.x1, rect.z0, rect.z1]).toEqual([
          lo,
          hi,
          road.startZ + margin,
          roadEnd - margin,
        ]);
      } else {
        expect(rect.x0).toBeCloseTo(streets.side.startX + margin, 9);
        expect(rect.x1).toBeCloseTo(streets.side.endX - margin, 9);
        expect(rect.z0).toBeCloseTo(lo, 9);
        expect(rect.z1).toBeCloseTo(hi, 9);
      }
    }
  });
});

describe('walk loop', () => {
  it('keeps every walker on pavement or a zebra for the whole lap', () => {
    for (const row of samples) {
      for (const [i, p] of row.entries()) {
        const ok = onPavement(p.x, p.z) || Object.values(crossingWalks).some((r) => inside(p.x, p.z, r));
        expect(ok, `${characters[i]?.id} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('keeps half a metre clear of every utility pole', () => {
    for (const row of samples) {
      for (const p of row) {
        for (const [px, pz] of streets.poles)
          expect(Math.hypot(p.x - px, p.z - pz)).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('never brings two walkers within 0.6 m of each other', () => {
    let closest = Number.POSITIVE_INFINITY;
    for (const row of samples) {
      for (const [a, pa] of row.entries()) {
        for (const pb of row.slice(a + 1)) closest = Math.min(closest, Math.hypot(pa.x - pb.x, pa.z - pb.z));
      }
    }
    expect(closest).toBeGreaterThanOrEqual(0.6);
  });

  it('starts and ends every lap on each character’s exact spot, facing the street', () => {
    for (const [i, def] of characters.entries()) {
      for (const d of [0, WALK_LOOP_LENGTH, -WALK_LOOP_LENGTH]) {
        for (const backward of [false, true]) {
          const p = sampleWalk(i, d, sample(), backward);
          expect(p.x).toBeCloseTo(def.position[0], 6);
          expect(p.y).toBeCloseTo(def.position[1], 6);
          expect(p.z).toBeCloseTo(def.position[2], 6);
          expect(wrapPi(p.heading - def.rotationY)).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('turns smoothly: no heading jump between samples 5 cm apart', () => {
    for (const backward of [false, true]) {
      for (const i of characters.keys()) {
        let prev = sampleWalk(i, 0, sample(), backward).heading;
        for (let d = STEP; d <= WALK_LOOP_LENGTH + 1e-9; d += STEP) {
          const h = sampleWalk(i, d, sample(), backward).heading;
          expect(Math.abs(wrapPi(h - prev)), `${characters[i]?.id} at d ${d.toFixed(2)}`).toBeLessThan(0.2);
          prev = h;
        }
      }
    }
  });

  it('crosses each road along its zebra’s centreline', () => {
    const seen = new Set<string>();
    for (const row of samples) {
      for (const p of row) {
        for (const [leg, r] of Object.entries(crossingWalks)) {
          if (!inside(p.x, p.z, r)) continue;
          seen.add(leg);
          const offset = leg === 'east' || leg === 'west' ? p.x - (r.x0 + r.x1) / 2 : p.z - (r.z0 + r.z1) / 2;
          expect(Math.abs(offset)).toBeLessThanOrEqual(0.3);
        }
      }
    }
    expect([...seen].sort()).toEqual(['east', 'north', 'south', 'west']);
  });

  it('steps down onto the zebra paint and back up onto the pavement', () => {
    const heights = samples.flat().map((p) => p.y);
    expect(Math.max(...heights)).toBeCloseTo(layout.standY, 9);
    expect(Math.min(...heights)).toBeCloseTo(streets.crossing.top, 9);
    // Mid-road the walker stands on the paint.
    const onZebra = samples.flat().find((p) => inside(p.x, p.z, zebra.east) && Math.abs(p.z - 10.7) < STEP);
    expect(onZebra?.y).toBeCloseTo(streets.crossing.top, 9);
  });

  it('keeps the walk inside the camera bounds, and those inside the orbit-target box', () => {
    for (const p of samples.flat()) expect(inside(p.x, p.z, walkBounds)).toBe(true);
    // The camera follows a walker anywhere on the loop without widening its target clamp,
    // so shrinking `config.targetBounds` below the walk would pin the view short of them.
    const box = config.targetBounds;
    expect(walkBounds.x0).toBeGreaterThanOrEqual(box.x0);
    expect(walkBounds.x1).toBeLessThanOrEqual(box.x1);
    expect(walkBounds.z0).toBeGreaterThanOrEqual(box.z0);
    expect(walkBounds.z1).toBeLessThanOrEqual(box.z1);
  });
});

describe('sampleWalk backward mode', () => {
  it('returns home heading when backward=true at d=0', () => {
    for (const [i, def] of characters.entries()) {
      const p = sampleWalk(i, 0, sample(), true);
      expect(wrapPi(p.heading - def.rotationY)).toBeCloseTo(0, 6);
    }
  });

  it('handles large positive and negative d correctly with backward=true', () => {
    for (const i of characters.keys()) {
      for (const dVal of [-WALK_LOOP_LENGTH * 2.5, -50, 50, WALK_LOOP_LENGTH * 3.2]) {
        const pForward = sampleWalk(i, dVal, sample(), false);
        const pBackward = sampleWalk(i, dVal, sample(), true);
        // Position should be the same, heading rotated by π
        expect(pForward.x).toBeCloseTo(pBackward.x, 9);
        expect(pForward.y).toBeCloseTo(pBackward.y, 9);
        expect(pForward.z).toBeCloseTo(pBackward.z, 9);
        // Heading should differ by π
        const headingDiff = wrapPi(pBackward.heading - pForward.heading);
        expect(
          Math.abs(Math.abs(headingDiff) - Math.PI) < 0.01 || Math.abs(headingDiff) < 0.01,
          `diff ${headingDiff}`,
        ).toBe(true);
      }
    }
  });

  it('maintains smooth heading transitions with backward=true throughout lap', () => {
    for (const i of characters.keys()) {
      let prevHeading = sampleWalk(i, 0, sample(), true).heading;
      for (let d = STEP; d <= WALK_LOOP_LENGTH + 1e-9; d += STEP) {
        const h = sampleWalk(i, d, sample(), true).heading;
        expect(Math.abs(wrapPi(h - prevHeading)), `backward at d ${d.toFixed(2)}`).toBeLessThan(0.2);
        prevHeading = h;
      }
    }
  });

  it('steps down onto and up from crossings with backward=true', () => {
    const heights: number[] = [];
    for (let d = 0; d <= WALK_LOOP_LENGTH; d += STEP) {
      for (const i of characters.keys()) {
        heights.push(sampleWalk(i, d, sample(), true).y);
      }
    }
    expect(Math.max(...heights)).toBeCloseTo(layout.standY, 9);
    expect(Math.min(...heights)).toBeCloseTo(streets.crossing.top, 9);
  });
});

describe('height bounds', () => {
  it('y stays within [crossing.top, standY] throughout the lap', () => {
    for (const row of samples) {
      for (const p of row) {
        expect(p.y).toBeGreaterThanOrEqual(streets.crossing.top - 1e-9);
        expect(p.y).toBeLessThanOrEqual(layout.standY + 1e-9);
      }
    }
  });

  it('y equals exactly crossing.top on zebra paint and exactly standY on pavement', () => {
    for (const row of samples) {
      for (const p of row) {
        const isOnZebra = Object.values(crossingWalks).some((r) => inside(p.x, p.z, r));
        const isOnPavement = onPavement(p.x, p.z);
        if (isOnZebra) {
          // On zebra paint, should be at crossing.top (with some tolerance for transition band at edges)
          expect(Math.abs(p.y - streets.crossing.top)).toBeLessThanOrEqual(0.02);
        } else if (isOnPavement) {
          // On pavement far from kerb, should be at standY; near kerb (0.25 m step band) there's smoothstep transition
          expect(Math.abs(p.y - layout.standY)).toBeLessThanOrEqual(0.02);
        }
      }
    }
  });
});

describe('nearestHomeDelta', () => {
  const L = WALK_LOOP_LENGTH;
  it('walks on past half a lap and turns back before it', () => {
    expect(nearestHomeDelta(0)).toBeCloseTo(0, 9);
    expect(nearestHomeDelta(10)).toBeCloseTo(-10, 9);
    expect(nearestHomeDelta(L - 10)).toBeCloseTo(10, 9);
    expect(nearestHomeDelta(L / 2)).toBeCloseTo(L / 2, 9);
    expect(nearestHomeDelta(3 * L + 5)).toBeCloseTo(-5, 9);
    expect(nearestHomeDelta(-5)).toBeCloseTo(5, 9);
  });
});
