import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { HOUSE_FOOTPRINT } from './house-site';
import {
  allLots,
  houseTransform,
  houseVariants,
  inSandlotBare,
  layout,
  NEIGHBOUR_GATE_WIDTH,
  type NeighbourLot,
  neighbourEntry,
  onSidewalk,
  type Rect,
  sandlotProps,
} from './scene';

const { canopyRatio, lot, wall, road, streets, sandlot } = layout;

/** Shortest horizontal distance from a point to a rectangle; 0 when inside it. */
function distanceToRect(x: number, z: number, r: Rect) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}

function inside(x: number, z: number, r: Rect) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

/** Rectangles that share only an edge are not overlapping: lots and sidewalks abut by design. */
function overlaps(a: Rect, b: Rect) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
}

const half = streets.length / 2;
const nobitaLot: Rect = {
  x0: -lot.width / 2,
  x1: lot.width / 2,
  z0: wall.frontZ - lot.depth,
  z1: wall.frontZ,
};
const frontRoad: Rect = { x0: -half, x1: half, z0: road.startZ, z1: road.startZ + road.depth };
const sideRoad: Rect = { x0: streets.side.startX, x1: streets.side.endX, z0: -half, z1: half };
const sidewalkStrips: Rect[] = [
  { x0: -half, x1: half, z0: wall.frontZ, z1: wall.frontZ + layout.sidewalk.depth },
  {
    x0: -half,
    x1: half,
    z0: road.startZ + road.depth,
    z1: road.startZ + road.depth + layout.sidewalk.depth,
  },
  { x0: streets.side.endX, x1: nobitaLot.x0, z0: -half, z1: half },
  { x0: streets.side.startX - layout.sidewalk.depth, x1: streets.side.startX, z0: -half, z1: half },
];

/** The lot a tree stands on, plus the footprint it has to stay clear of. */
function hostLot(x: number, z: number) {
  if (inside(x, z, nobitaLot)) {
    return {
      lot: nobitaLot,
      footprint: HOUSE_FOOTPRINT,
    };
  }
  const n = layout.neighbours.find((c) => inside(x, z, c.lot));
  if (n) return { lot: n.lot, footprint: houseTransform(n as NeighbourLot).bounds };
  // The sandlot has no house: its canopies have to clear the pipe stack instead.
  if (inside(x, z, layout.sandlot.lot)) return { lot: layout.sandlot.lot, footprint: sandlotProps().pipes };
  return undefined;
}

describe('block layout', () => {
  it('keeps every lot clear of the roads and of every other lot', () => {
    const lots = [nobitaLot, ...allLots().slice(1)];
    for (const l of lots) {
      expect(overlaps(l, frontRoad)).toBe(false);
      expect(overlaps(l, sideRoad)).toBe(false);
      for (const strip of sidewalkStrips) expect(overlaps(l, strip)).toBe(false);
    }
    for (const [i, a] of lots.entries()) {
      for (const b of lots.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
  });

  it('stands every neighbour house inside its own lot with room for its eaves', () => {
    for (const n of layout.neighbours as readonly NeighbourLot[]) {
      const { bounds } = houseTransform(n);
      const overhang = 0.5;
      expect(bounds.x0 - overhang).toBeGreaterThan(n.lot.x0);
      expect(bounds.x1 + overhang).toBeLessThan(n.lot.x1);
      expect(bounds.z0 - overhang).toBeGreaterThan(n.lot.z0);
      expect(bounds.z1 + overhang).toBeLessThan(n.lot.z1);
    }
  });

  it('turns every front door toward the street it fronts', () => {
    for (const n of layout.neighbours as readonly NeighbourLot[]) {
      const { centre, yaw } = houseTransform(n);
      // The facade normal is +Z rotated by yaw.
      // Stepping out of the front door has to leave the lot through the facing edge.
      const ahead = [centre[0] + Math.sin(yaw) * 20, centre[1] + Math.cos(yaw) * 20] as const;
      if (n.facing === '+z') expect(ahead[1]).toBeGreaterThan(n.lot.z1);
      if (n.facing === '-z') expect(ahead[1]).toBeLessThan(n.lot.z0);
      if (n.facing === '+x') expect(ahead[0]).toBeGreaterThan(n.lot.x1);
    }
  });

  it('puts the sandlot across the road from the gate and keeps the default camera out of every house', () => {
    expect(inside(wall.gateX, road.startZ + road.depth + 3, sandlot.lot)).toBe(true);
    const [cx, , cz] = config.camera.position;
    for (const n of layout.neighbours as readonly NeighbourLot[]) {
      // Eaves overhang 0.5 m; 0.7 m clears the roof plane. The first frame must not open
      // from inside a neighbour house.
      expect(distanceToRect(cx, cz, houseTransform(n).bounds)).toBeGreaterThan(0.7);
    }
  });

  it('opens the sandlot onto the front sidewalk and fences it along the side road', () => {
    const r = sandlot.lot;
    const mid = (edge: string) =>
      edge === '-z'
        ? ([(r.x0 + r.x1) / 2, r.z0 - 0.5] as const)
        : edge === '+z'
          ? ([(r.x0 + r.x1) / 2, r.z1 + 0.5] as const)
          : edge === '-x'
            ? ([r.x0 - 0.5, (r.z0 + r.z1) / 2] as const)
            : ([r.x1 + 0.5, (r.z0 + r.z1) / 2] as const);
    expect(onSidewalk(...mid(sandlot.open))).toBe(true);
    expect(onSidewalk(...mid(sandlot.fence))).toBe(true);
    expect(sandlot.open).not.toBe(sandlot.fence);
  });

  it('keeps the sandlot props inside its walls, apart, and on the grass', () => {
    const props = Object.entries(sandlotProps());
    for (const [name, p] of props) {
      // Half a metre inside the wall line, so the GLB's walls, fence and the neighbour's wall
      // never cut through a pipe or a bamboo pole.
      expect(p.x0, name).toBeGreaterThan(sandlot.lot.x0 + 0.5);
      expect(p.x1, name).toBeLessThan(sandlot.lot.x1 - 0.5);
      expect(p.z0, name).toBeGreaterThan(sandlot.lot.z0 + 0.5);
      expect(p.z1, name).toBeLessThan(sandlot.lot.z1 - 0.5);
      // The worn patches are where the game is played; nothing stands on them.
      const corners: [number, number][] = [
        [p.x0, p.z0],
        [p.x1, p.z0],
        [p.x0, p.z1],
        [p.x1, p.z1],
      ];
      for (const [x, z] of corners) {
        expect(inSandlotBare(x, z), `${name} corner ${x},${z} on bare earth`).toBe(false);
      }
    }
    for (const [i, [, a]] of props.entries()) {
      for (const [, b] of props.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
    }
    for (const { centre, rx, rz } of sandlot.bare) {
      // The edge wobble never exceeds +20%, so this keeps every patch off the walls.
      expect(centre[0] - rx * 1.2).toBeGreaterThan(sandlot.lot.x0);
      expect(centre[0] + rx * 1.2).toBeLessThan(sandlot.lot.x1);
      expect(centre[1] - rz * 1.2).toBeGreaterThan(sandlot.lot.z0);
      expect(centre[1] + rz * 1.2).toBeLessThan(sandlot.lot.z1);
      expect(inSandlotBare(centre[0], centre[1])).toBe(true);
    }
  });

  it('stands every utility pole on a sidewalk', () => {
    for (const [x, z] of streets.poles) expect(onSidewalk(x, z)).toBe(true);
  });

  it('cuts each sidewalk at the kerb of the road that crosses it', () => {
    // Middle of the junction: carriageway, not pavement.
    expect(onSidewalk(-12.4, 10.7)).toBe(false);
    // Front sidewalk where the side road crosses it.
    expect(onSidewalk(-12.4, 6.5)).toBe(false);
    // Side sidewalk where the front road crosses it.
    expect(onSidewalk(-8.5, 10.7)).toBe(false);
    // The corner block between the two near sidewalks is pavement.
    expect(onSidewalk(-8.5, 6.5)).toBe(true);
  });
});

describe('planting', () => {
  it('plants every tree on a lot, clear of that lot’s house', () => {
    for (const tree of layout.trees) {
      const [x, , z] = tree.position;
      const host = hostLot(x, z);
      expect(host, `tree at ${x},${z} is on no lot`).toBeDefined();
      if (!host) continue;
      expect(distanceToRect(x, z, host.footprint)).toBeGreaterThan(canopyRatio[tree.kind] * tree.height);
    }
  });

  it('keeps every trunk a metre inside its lot wall', () => {
    for (const tree of layout.trees) {
      const [x, , z] = tree.position;
      const host = hostLot(x, z);
      expect(host, `tree at ${x},${z} is on no lot`).toBeDefined();
      if (!host) continue;
      const margin = host.lot === nobitaLot ? lot.wallThickness : 1;
      expect(Math.min(x - host.lot.x0, host.lot.x1 - x)).toBeGreaterThan(margin);
      expect(Math.min(z - host.lot.z0, host.lot.z1 - z)).toBeGreaterThan(margin);
    }
  });

  it('runs every hedge row inside a lot, clear of the neighbour walls', () => {
    for (const row of layout.hedges) {
      for (let i = 0; i < row.count; i++) {
        const alongZ = row.axis === 'z';
        const x = row.start[0] + (alongZ ? 0 : i * row.spacing);
        const z = row.start[2] + (alongZ ? i * row.spacing : 0);
        const host = hostLot(x, z);
        expect(host, `hedge at ${x},${z} is on no lot`).toBeDefined();
        if (!host || host.lot === nobitaLot) continue;
        // Nobita's rows are exempt: his house's footprint is the canopy keep-out for tall
        // trees and swallows the porch, while a 0.8 m shrub row legitimately runs in front of
        // the facade.
        expect(distanceToRect(x, z, host.footprint)).toBeGreaterThan(0.4);
      }
    }
  });
});

describe('neighbour entrances', () => {
  const entries = (layout.neighbours as readonly NeighbourLot[]).map((n) => ({ n, ...neighbourEntry(n) }));

  it('opens each gate on the street edge the house faces, whole inside the wall run', () => {
    for (const { n, gate } of entries) {
      const along = n.facing === '+x' ? gate[1] : gate[0];
      const [lo, hi] = n.facing === '+x' ? [n.lot.z0, n.lot.z1] : [n.lot.x0, n.lot.x1];
      const edge = n.facing === '+z' ? n.lot.z1 : n.facing === '-z' ? n.lot.z0 : n.lot.x1;
      expect(n.facing === '+x' ? gate[0] : gate[1], n.id).toBeCloseTo(edge, 6);
      // Piers, nameplate and lamp stand up to a metre past the leaves on either side.
      expect(along - NEIGHBOUR_GATE_WIDTH / 2 - 1, n.id).toBeGreaterThan(lo);
      expect(along + NEIGHBOUR_GATE_WIDTH / 2 + 1, n.id).toBeLessThan(hi);
    }
  });

  it('keeps every walk from gate to door off the house and clear of trunks and hedges', () => {
    for (const { n, path } of entries) {
      expect(overlaps(path, houseTransform(n).bounds), n.id).toBe(false);
      for (const tree of layout.trees) {
        expect(distanceToRect(tree.position[0], tree.position[2], path), `${n.id} tree`).toBeGreaterThan(0.6);
      }
      for (const row of layout.hedges) {
        for (let i = 0; i < row.count; i++) {
          const x = row.start[0] + (row.axis === 'z' ? 0 : i * row.spacing);
          const z = row.start[2] + (row.axis === 'z' ? i * row.spacing : 0);
          expect(distanceToRect(x, z, path), `${n.id} hedge ${x},${z}`).toBeGreaterThan(0.5);
        }
      }
    }
  });
});

describe('house variants', () => {
  it('roofs every variant with the same 25° pitch it declares', () => {
    for (const v of Object.values(houseVariants)) {
      const span = v.roof.ridgeAxis === 'x' ? v.roof.depth : v.roof.width;
      expect(v.roof.height).toBeCloseTo((span / 2) * Math.tan((25 * Math.PI) / 180), 1);
      const along = v.roof.ridgeAxis === 'x' ? v.roof.width : v.roof.depth;
      expect(v.roof.ridge).toBeLessThanOrEqual(along);
      // The roof has to cover the storey it sits on, overhang included.
      expect(v.roof.width).toBeGreaterThanOrEqual(v.width - 2 * v.upperInset);
      expect(v.roof.depth).toBeGreaterThanOrEqual(v.depth - 2 * v.upperInset);
    }
  });
});
