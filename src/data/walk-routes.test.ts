import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { characters } from './characters';
import { crossingRects, layout, onSidewalk, type Rect } from './scene';
import {
  inPlaza,
  nearestHomeDelta,
  sampleWalk,
  WALK_LOOP_LENGTH,
  type WalkSample,
  walkBounds,
} from './walk-routes';

const { road, streets, sandlot } = layout;
const roadEnd = road.startZ + road.depth;
const zebra = crossingRects();
const STEP = 0.05;

/**
 * The middle of the loop's one unpainted crossing, x metres: where the lap goes from the
 * pavement into the vacant lot. Straight opposite the gate there is no zebra, so this is the
 * single stretch of asphalt the children walk on bare road. See `walk-routes.ts`.
 */
const LOT_CROSSING_X = 4.6;
/**
 * The painted crossing they come home over. It is the one on the lot's own side of the
 * junction, `zebra.east`, whose centreline the loop follows.
 */
const ZEBRA_X = (zebra.east.x0 + zebra.east.x1) / 2;

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

const onPaint = (x: number, z: number) => Object.values(crossingWalks).some((r) => inside(x, z, r));
const inLot = (x: number, z: number) => z >= sandlot.lot.z0 && x >= sandlot.lot.x0 && x <= sandlot.lot.x1;
/** The bare-road stretch between the pavement and the lot, a lane's width either side of its x. */
const onBareRoad = (x: number, z: number) =>
  Math.abs(x - LOT_CROSSING_X) <= 0.5 && z > road.startZ - 0.5 && z < sandlot.lot.z0 + 0.5;

/** Every sample of every character over one lap, in step with the shared distance. */
function lap(backward = false) {
  const steps = Math.ceil(WALK_LOOP_LENGTH / STEP);
  return Array.from({ length: steps + 1 }, (_, k) => {
    const d = k * STEP;
    return characters.map((_, i) => sampleWalk(i, d, sample(), backward));
  });
}
const samples = lap();
const backwardSamples = lap(true);
const all = [...samples, ...backwardSamples].flat();

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
  it('stays on pavement, paint, the lot, or the one crossing with no paint on it', () => {
    // The lap is home and the lot and nothing else: one pavement, one crossing, one rectangle
    // of bare earth. The only ground that is neither is the way into the lot straight opposite
    // the gate, where a child goes because it is going there, not because it is crossing.
    for (const p of all) {
      const ok = onPavement(p.x, p.z) || onPaint(p.x, p.z) || inLot(p.x, p.z) || onBareRoad(p.x, p.z);
      expect(ok, `${p.x.toFixed(2)},${p.z.toFixed(2)} at y ${p.y.toFixed(3)}`).toBe(true);
    }
  });

  it('keeps that bare-road crossing free of paint, so it is really only taken once', () => {
    let bare = 0;
    for (const p of all) {
      if (!onBareRoad(p.x, p.z) || onPavement(p.x, p.z) || inLot(p.x, p.z)) continue;
      expect(onPaint(p.x, p.z), `${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(false);
      bare++;
    }
    expect(bare).toBeGreaterThan(0);
  });

  it('keeps half a metre clear of every utility pole', () => {
    for (const p of all) {
      for (const [px, pz] of streets.poles)
        expect(Math.hypot(p.x - px, p.z - pz)).toBeGreaterThanOrEqual(0.5);
    }
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

  it('crosses the road twice: out at the lot’s edge, home along the painted zebra', () => {
    // Every run of samples that is over the carriageway, with the x each one crosses at.
    const runs: { from: number; to: number; xs: number[]; painted: boolean }[] = [];
    for (const [i, def] of characters.entries()) {
      let run: (typeof runs)[number] | null = null;
      let reached = 0;
      for (let d = 0; d <= WALK_LOOP_LENGTH + 1e-9; d += STEP) {
        const p = sampleWalk(i, d, sample());
        const over = p.z > road.startZ && p.z < roadEnd;
        if (over && !run) run = { from: d, to: d, xs: [], painted: onPaint(p.x, p.z) };
        if (over && run) {
          run.to = d;
          run.xs.push(p.x);
          reached = p.z;
        }
        if (!over && run) {
          runs.push(run);
          run = null;
        }
      }
      expect(reached, `${def.id} never reached the far side`).toBeGreaterThan(0);
    }
    // Six children, two crossings each: one at the lot's edge, one on the paint.
    expect(runs.length).toBe(characters.length * 2);
    for (const run of runs) {
      const xs = run.xs;
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      // Straight across: a crossing is a line, not a diagonal through the traffic.
      expect(hi - lo, `crossing at ${run.from.toFixed(1)}`).toBeLessThan(0.6);
      if (run.painted) {
        expect(Math.abs((lo + hi) / 2 - ZEBRA_X)).toBeLessThan(0.3);
      } else {
        expect(Math.abs((lo + hi) / 2 - LOT_CROSSING_X)).toBeLessThan(0.3);
      }
    }
    expect(runs.filter((r) => r.painted).length).toBe(characters.length);
  });

  it('steps down onto the paint, down again onto the lot’s earth, and back up', () => {
    const heights = all.map((p) => p.y);
    expect(Math.max(...heights)).toBeCloseTo(layout.standY, 9);
    expect(Math.min(...heights)).toBeCloseTo(0, 9);
    // Mid-road the walker stands on the paint, and out in the lot on the bare earth.
    const onZebra = all.find((p) => inside(p.x, p.z, zebra.east) && Math.abs(p.z - 10.7) < STEP);
    expect(onZebra?.y).toBeCloseTo(streets.crossing.top, 9);
    const onBare = all.find((p) => Math.abs(p.x - LOT_CROSSING_X) < 0.05 && Math.abs(p.z - 10.7) < STEP);
    expect(onBare?.y).toBeCloseTo(streets.crossing.top, 9);
    const inTheLot = all.find((p) => Math.abs(p.z - (17.4 + 28.6) / 2) < 0.5 && p.x > 4);
    expect(inTheLot?.y).toBeCloseTo(0, 9);
  });

  it('walks the lot and only the lot flat out', () => {
    // The pace is not a timer: it is `inPlaza`, so the test is that the flag lines up with the
    // ground. Everything the lot covers is a run, and nothing on the pavement is.
    for (const [i, def] of characters.entries()) {
      for (let d = 0; d <= WALK_LOOP_LENGTH + 1e-9; d += STEP) {
        const p = sampleWalk(i, d, sample());
        if (p.z > 19 && p.z < 27 && p.x > -7) {
          expect(inPlaza(i, d), `${def.id} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
        }
        if (onPavement(p.x, p.z)) expect(inPlaza(i, d), `${def.id} on the pavement`).toBe(false);
      }
    }
  });

  it('keeps the walk inside the camera bounds, and those inside the orbit-target box', () => {
    for (const p of all) expect(inside(p.x, p.z, walkBounds)).toBe(true);
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

  it('reaches the same heights walking home as walking out', () => {
    const heights = backwardSamples.flat().map((p) => p.y);
    expect(Math.max(...heights)).toBeCloseTo(layout.standY, 9);
    expect(Math.min(...heights)).toBeCloseTo(0, 9);
  });
});

describe('height bounds', () => {
  it('y stays between the lot’s earth and the pavement throughout the lap', () => {
    for (const p of all) {
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeLessThanOrEqual(layout.standY + 1e-9);
    }
  });

  it('sits at standY on the pavement, crossing.top mid-road, and nought in the lot', () => {
    for (const p of all) {
      const nearKerb = Math.abs(p.z - road.startZ) < 0.6 || Math.abs(p.z - roadEnd) < 0.6;
      const nearLotEdge = Math.abs(p.z - sandlot.lot.z0) < 0.6;
      if (nearKerb || nearLotEdge) continue;
      if (onPaint(p.x, p.z)) {
        expect(
          Math.abs(p.y - streets.crossing.top),
          `${p.x.toFixed(2)},${p.z.toFixed(2)}`,
        ).toBeLessThanOrEqual(0.02);
      } else if (inLot(p.x, p.z)) {
        expect(Math.abs(p.y), `${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBeLessThanOrEqual(0.02);
      } else if (onPavement(p.x, p.z)) {
        expect(Math.abs(p.y - layout.standY), `${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBeLessThanOrEqual(
          0.02,
        );
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
