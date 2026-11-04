import { describe, expect, it } from 'vitest';
import { FURNITURE, ROOMS, WALLS, yawOf } from '../editor/house/plan';
import { doorDistance, HOUSE_PATH_LENGTH, housePath, housePathDoors, sampleHousePath } from './house-path';
import { HOUSE_ORIGIN, rectToWorld } from './house-site';
import { layout } from './scene';

const LOT = {
  x0: -layout.lot.width / 2,
  x1: layout.lot.width / 2,
  z0: layout.wall.frontZ - layout.lot.depth,
  z1: layout.wall.frontZ,
};

const inside = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) =>
  x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** World rectangle of a room's first floor area. */
function roomRect(id: string) {
  const room = ROOMS.find((r) => r.id === id);
  const first = room?.rects[0];
  if (!first) throw new Error(`no room ${id}`);
  return rectToWorld(first);
}

/** The opening a door sits in, in world metres, whichever wall holds it. */
function doorOpening(id: string) {
  for (const wall of WALLS) {
    for (const opening of wall.openings) {
      if (opening.kind !== 'door' || opening.id !== id) continue;
      const depth = wall.thickness / 2;
      const plan =
        wall.axis === 'x'
          ? { x0: opening.from, x1: opening.to, z0: wall.at - depth, z1: wall.at + depth }
          : { x0: wall.at - depth, x1: wall.at + depth, z0: opening.from, z1: opening.to };
      return rectToWorld(plan);
    }
  }
  throw new Error(`no door ${id}`);
}

describe('the walk through the house', () => {
  it('starts out in the yard and ends in the 居間', () => {
    const start = sampleHousePath(0, { x: 0, y: 0, z: 0, heading: 0 });
    expect(start.z).toBeGreaterThan(layout.wall.frontZ - layout.lot.depth);
    expect(start.y).toBe(0);

    const end = sampleHousePath(HOUSE_PATH_LENGTH, { x: 0, y: 0, z: 0, heading: 0 });
    expect(inside(end.x, end.z, roomRect('living'))).toBe(true);
    expect(end.y).toBeCloseTo(0.4, 6);
  });

  it('crosses exactly two doors, and both are the ones it names', () => {
    expect([...housePathDoors]).toEqual(['door-front', 'door-living']);
    // Each named door is met before the end of the walk, in the order given.
    expect(doorDistance('door-front')).toBeLessThan(doorDistance('door-living'));
    expect(doorDistance('door-living')).toBeLessThanOrEqual(HOUSE_PATH_LENGTH);
  });

  it('passes through the middle of each door opening, not the wall beside it', () => {
    for (const door of housePathDoors) {
      const at = doorDistance(door);
      const p = sampleHousePath(at, { x: 0, y: 0, z: 0, heading: 0 });
      const opening = doorOpening(door);
      expect(p.x, `${door} x`).toBeGreaterThanOrEqual(opening.x0);
      expect(p.x, `${door} x`).toBeLessThanOrEqual(opening.x1);
      expect(p.z, `${door} z`).toBeGreaterThanOrEqual(opening.z0);
      expect(p.z, `${door} z`).toBeLessThanOrEqual(opening.z1);
    }
  });

  it('stays inside the lot the whole way', () => {
    for (let d = 0; d <= HOUSE_PATH_LENGTH; d += 0.05) {
      const p = sampleHousePath(d, { x: 0, y: 0, z: 0, heading: 0 });
      expect(inside(p.x, p.z, LOT), `off the lot at ${d.toFixed(2)} m`).toBe(true);
    }
  });

  it('rises off the yard onto the 玄関 floor and the hall, and never higher', () => {
    let last = -1;
    let rises = 0;
    for (let d = 0; d <= HOUSE_PATH_LENGTH; d += 0.05) {
      const p = sampleHousePath(d, { x: 0, y: 0, z: 0, heading: 0 });
      expect(p.y, `below the yard at ${d.toFixed(2)}`).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y, `above the hall floor at ${d.toFixed(2)}`).toBeLessThanOrEqual(0.4 + 1e-9);
      if (last >= 0 && p.y > last + 1e-6) rises++;
      last = p.y;
    }
    // Two steps up: the 玄関's sunken floor and the hall's. Not a ramp the whole way.
    expect(rises).toBeGreaterThan(0);
    expect(sampleHousePath(0, { x: 0, y: 0, z: 0, heading: 0 }).y).toBe(0);
  });

  it('clamps outside the walk instead of running off its ends', () => {
    const before = sampleHousePath(-5, { x: 0, y: 0, z: 0, heading: 0 });
    const after = sampleHousePath(HOUSE_PATH_LENGTH + 5, { x: 0, y: 0, z: 0, heading: 0 });
    expect(before).toEqual(sampleHousePath(0, { x: 0, y: 0, z: 0, heading: 0 }));
    expect(after).toEqual(sampleHousePath(HOUSE_PATH_LENGTH, { x: 0, y: 0, z: 0, heading: 0 }));
  });

  it('turns to face the way it is walking', () => {
    for (let d = 0; d < HOUSE_PATH_LENGTH - 0.2; d += 0.2) {
      const a = sampleHousePath(d, { x: 0, y: 0, z: 0, heading: 0 });
      const b = sampleHousePath(d + 0.2, { x: 0, y: 0, z: 0, heading: 0 });
      const travelled = Math.atan2(b.x - a.x, b.z - a.z);
      const gap = Math.min(Math.abs(travelled - a.heading), Math.PI * 2 - Math.abs(travelled - a.heading));
      // A sample that straddles a corner reports the direction of the chord, which is up to a
      // right angle off either leg. The turn itself is smoothed in `use-walker`, not here.
      expect(gap, `facing wrong way at ${d.toFixed(2)} m`).toBeLessThan(Math.PI / 2 + 0.02);
    }
  });

  it('has a spot for the turn at the end', () => {
    expect(housePath.at(-1)?.turn).toBe(true);
  });

  it('stands the child on clear floor, not in the furniture', () => {
    // The 居間 is 3.6 m square and carries a kotatsu, three tansu, a TV stand and a low cabinet.
    // A spot chosen off the room rectangle alone put a child's knees through the kotatsu, which
    // is the kind of thing only a screenshot catches — so the furniture is checked here instead.
    const turn = housePath.at(-1);
    if (!turn) throw new Error('no turn spot');
    const floor = new Set(['floorCushion', 'mat']);
    const body = 0.2;
    for (const item of FURNITURE.filter((f) => f.room === 'living' && !floor.has(f.kind))) {
      // Quarter-turn furniture is placed by yaw, so the footprint swaps its sides.
      const quarter = Math.round(yawOf(item) / (Math.PI / 2)) % 2 === 1;
      const w = (quarter ? (item.d ?? 0) : (item.w ?? 0)) / 2 + body;
      const d = (quarter ? (item.w ?? 0) : (item.d ?? 0)) / 2 + body;
      const x = item.x + HOUSE_ORIGIN.x;
      const z = item.z + HOUSE_ORIGIN.z;
      const clear = turn.x <= x - w || turn.x >= x + w || turn.z <= z - d || turn.z >= z + d;
      expect(clear, `standing in the ${item.kind} at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(true);
    }
  });
});
