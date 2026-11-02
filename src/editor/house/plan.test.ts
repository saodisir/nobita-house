import { describe, expect, it } from 'vitest';
import {
  coverRanges,
  DOWNPIPES,
  FURNITURE,
  type Furniture,
  footprintOf,
  HOODS,
  interiorOf,
  isEave,
  LEVEL,
  type Opening,
  type Rect,
  ROOF_BUILD,
  ROOFS,
  ROOMS,
  type Room,
  type RoomId,
  rectRanges,
  roofTopAt,
  roomAt,
  roomById,
  STAIR_WALL,
  STAIRS,
  STOREYS,
  type StoreyId,
  sideToward,
  WALLS,
  type Wall,
  wallAt,
} from './plan';

const EPS = 1e-3;
/** Wall left between an opening and the face of a wall that crosses it: the jamb. */
const JAMB = 0.05;
/** Floor kept clear in front of a doorway, on each side a person stands. */
const DOOR_CLEAR = 0.5;

const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
const contains = (outer: Rect, inner: Rect) =>
  inner.x0 >= outer.x0 - EPS &&
  inner.x1 <= outer.x1 + EPS &&
  inner.z0 >= outer.z0 - EPS &&
  inner.z1 <= outer.z1 + EPS;

/** Points on a grid over `r`, `steps` intervals a side, inset `inset` from its edges. */
function samples(r: Rect, steps: number, inset = 0) {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      out.push([
        r.x0 + inset + ((r.x1 - r.x0 - 2 * inset) * i) / steps,
        r.z0 + inset + ((r.z1 - r.z0 - 2 * inset) * j) / steps,
      ]);
    }
  }
  return out;
}

/** True when every point of `fp` lies on the finished floor of `room`, across all its rectangles. */
function standsIn(room: Room, fp: Rect) {
  const floors = room.rects.map((r) => interiorOf(r, room.storey));
  return samples(fp, 6).every(([x, z]) =>
    floors.some((f) => x >= f.x0 - EPS && x <= f.x1 + EPS && z >= f.z0 - EPS && z <= f.z1 + EPS),
  );
}

/** The walls of its storey standing across `wall`'s line, as positions along it with their half-thickness. */
function crossings(wall: Wall) {
  return WALLS.filter((other) => other.storey === wall.storey && other.axis !== wall.axis)
    .filter((other) => wall.at >= other.from - EPS && wall.at <= other.to + EPS)
    .filter((other) => other.at >= wall.from - EPS && other.at <= wall.to + EPS)
    .map((other) => ({ id: other.id, at: other.at, half: other.thickness / 2 }));
}

/** A plan-space rectangle beside a wall: `along` its axis, `across` measured from its centre line. */
function besideWall(wall: Wall, from: number, to: number, c0: number, c1: number): Rect {
  const lo = wall.at + Math.min(c0, c1);
  const hi = wall.at + Math.max(c0, c1);
  return wall.axis === 'x' ? { x0: from, x1: to, z0: lo, z1: hi } : { x0: lo, x1: hi, z0: from, z1: to };
}

function roomOnSide(wall: Wall, along: number, side: 1 | -1) {
  const across = wall.at + side * (wall.thickness / 2 + 0.1);
  return wall.axis === 'x' ? roomAt(along, across, wall.storey) : roomAt(across, along, wall.storey);
}

/** Openings a person walks through: doors, and the glass doors run down to the floor. */
const passable = (o: Opening) => o.kind === 'door' || o.walkout === true;

const storeyOf = (item: Furniture): StoreyId => roomById(item.room).storey;
const standing = FURNITURE.filter((f) => !f.on && !f.floorCover);

describe('rooms', () => {
  it('never overlap another room on their storey', () => {
    const rects = ROOMS.flatMap((room) => room.rects.map((r) => ({ room, r })));
    for (const [i, a] of rects.entries()) {
      for (const b of rects.slice(i + 1)) {
        if (a.room.id === b.room.id || a.room.storey !== b.room.storey) continue;
        expect(overlapArea(a.r, b.r), `${a.room.id} overlaps ${b.room.id}`).toBeLessThan(EPS);
      }
    }
  });

  it('upstairs all stand over the ground floor, never over the garden', () => {
    for (const room of ROOMS.filter((r) => r.storey === 'upper')) {
      for (const r of room.rects) {
        for (const [x, z] of samples(r, 4, 0.1)) {
          expect(roomAt(x, z, 'ground'), `${room.id} overhangs at (${x}, ${z})`).toBeDefined();
        }
      }
    }
  });

  it('can all be reached from the genkan through doors, open thresholds and the stair', () => {
    const links = new Map<RoomId, Set<RoomId>>();
    const link = (a?: RoomId, b?: RoomId) => {
      if (!a || !b || a === b) return;
      links.set(a, (links.get(a) ?? new Set()).add(b));
      links.set(b, (links.get(b) ?? new Set()).add(a));
    };
    for (const wall of WALLS) {
      for (const door of wall.openings.filter((o) => o.kind === 'door')) {
        const mid = (door.from + door.to) / 2;
        link(roomOnSide(wall, mid, 1)?.id, roomOnSide(wall, mid, -1)?.id);
      }
    }
    // A shared edge with no wall on it is a threshold: the genkan's step up into the hall, the
    // 鏡台 nook open to the 居間, the kitchen's step down to the 勝手口, the stairwell's head.
    for (const a of ROOMS) {
      for (const b of ROOMS) {
        if (a.id === b.id || a.storey !== b.storey) continue;
        for (const ra of a.rects) {
          for (const rb of b.rects) {
            for (const [touch, lo, hi, at] of [
              [Math.abs(ra.z0 - rb.z1) < EPS, Math.max(ra.x0, rb.x0), Math.min(ra.x1, rb.x1), 'z0'],
              [Math.abs(ra.x0 - rb.x1) < EPS, Math.max(ra.z0, rb.z0), Math.min(ra.z1, rb.z1), 'x0'],
            ] as const) {
              if (!touch || hi - lo < 0.3) continue;
              const mid = (lo + hi) / 2;
              const open = at === 'z0' ? !wallAt(mid, ra.z0, a.storey) : !wallAt(ra.x0, mid, a.storey);
              if (open) link(a.id, b.id);
            }
          }
        }
      }
    }
    // The stair: from the hall at its foot to the upstairs room just past its head.
    const mx = (STAIRS.x0 + STAIRS.x1) / 2;
    link(roomAt(mx, STAIRS.foot + 0.3, 'ground')?.id, roomAt(mx, STAIRS.head - 0.1, 'upper')?.id);

    const reached = new Set<RoomId>(['genkan']);
    const queue: RoomId[] = ['genkan'];
    for (let id = queue.shift(); id; id = queue.shift()) {
      for (const next of links.get(id) ?? []) {
        if (reached.has(next)) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    expect([...reached].sort()).toEqual(ROOMS.map((r) => r.id).sort());
  });

  it('open to the outside at the genkan, the 勝手口, and two glass doors onto the garden', () => {
    const exits = WALLS.flatMap((wall) =>
      wall.openings.filter(passable).flatMap((o) => {
        const mid = (o.from + o.to) / 2;
        const sides = [roomOnSide(wall, mid, 1), roomOnSide(wall, mid, -1)];
        return sides.includes(undefined) ? [`${o.kind}:${sides.find(Boolean)?.id}`] : [];
      }),
    );
    expect(exits.sort()).toEqual(['door:doma', 'door:genkan', 'window:kitchen', 'window:living']);
  });
});

describe('openings', () => {
  it.each(WALLS.flatMap((wall) => wall.openings.map((o) => [o.id, wall, o] as const)))(
    '%s sits inside its wall with a jamb clear of every crossing wall',
    (_id, wall, o) => {
      const { floor, top } = STOREYS[wall.storey];
      expect(o.from).toBeLessThan(o.to);
      expect(o.sill).toBeLessThan(o.head);
      expect(o.head).toBeLessThanOrEqual(top - 0.3 + EPS);
      if (wall.storey === 'upper') expect(o.sill).toBeGreaterThanOrEqual(floor - EPS);
      expect(o.from).toBeGreaterThanOrEqual(wall.from);
      expect(o.to).toBeLessThanOrEqual(wall.to);
      for (const c of crossings(wall)) {
        const clear = o.to <= c.at - c.half - JAMB + EPS || o.from >= c.at + c.half + JAMB - EPS;
        expect(clear, `${o.id} runs into ${c.id}`).toBe(true);
      }
      for (const other of wall.openings) {
        if (other === o) continue;
        expect(o.to <= other.from || o.from >= other.to, `${o.id} overlaps ${other.id}`).toBe(true);
      }
    },
  );

  it('are wide and tall enough to walk through', () => {
    for (const wall of WALLS) {
      for (const o of wall.openings.filter(passable)) {
        expect(o.to - o.from, o.id).toBeGreaterThanOrEqual(0.6 - EPS);
        expect((o.kind === 'door' ? (o.transom ?? o.head) : o.head) - o.sill, o.id).toBeGreaterThanOrEqual(
          1.8,
        );
      }
    }
  });

  const doors = WALLS.flatMap((wall) =>
    wall.openings.flatMap((o) => (o.kind === 'door' ? [{ wall, door: o }] : [])),
  );

  it('slide every sliding leaf into solid wall: inside its wall, clear of every other opening', () => {
    for (const { wall, door } of doors) {
      if (door.leaf !== 'sliding') continue;
      // It opens away from its latch, as far as it is wide.
      const width = door.to - door.from;
      const [p0, p1] = door.latch === 'from' ? [door.to, door.to + width] : [door.from - width, door.from];
      expect(p0, `${door.id} slides out of the end of ${wall.id}`).toBeGreaterThanOrEqual(wall.from - EPS);
      expect(p1, `${door.id} slides out of the end of ${wall.id}`).toBeLessThanOrEqual(wall.to + EPS);
      for (const other of wall.openings.filter((o) => o !== door)) {
        const clear = p1 <= other.from - JAMB + EPS || p0 >= other.to + JAMB - EPS;
        expect(clear, `${door.id} slides into ${other.id}`).toBe(true);
      }
    }
  });

  it('swing every hinged leaf into the side it names, through nothing but air', () => {
    for (const { wall, door } of doors) {
      if (door.leaf !== 'hinged') continue;
      const width = door.to - door.from;
      const side = sideToward(wall, (door.from + door.to) / 2, door.swing);
      if (side === undefined)
        throw new Error(`${door.id} swings into ${door.swing}, on neither side of ${wall.id}`);
      const hinge = door.latch === 'to' ? door.from : door.to;
      const toLatch = door.latch === 'to' ? 1 : -1;
      const face = wall.at + side * (wall.thickness / 2);
      // The quarter circle the latch edge sweeps, sampled every 5 cm and 5°.
      for (let r = 0.05; r <= width - 0.02; r += 0.05) {
        for (let deg = 0; deg <= 90; deg += 5) {
          const along = hinge + toLatch * r * Math.cos((deg * Math.PI) / 180);
          const across = face + side * (0.02 + r * Math.sin((deg * Math.PI) / 180));
          const [x, z] = wall.axis === 'x' ? [along, across] : [across, along];
          const at = `${door.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`;
          const room = roomAt(x, z, wall.storey);
          expect(room?.id ?? 'outside', `${at} leaves ${door.swing}`).toBe(door.swing);
          expect(wallAt(x, z, wall.storey)?.id ?? wall.id, `${at} hits a wall`).toBe(wall.id);
          const item = FURNITURE.find(
            (f) =>
              f.room === room?.id &&
              !f.floorCover &&
              contains(footprintOf(f), { x0: x, x1: x, z0: z, z1: z }),
          );
          expect(item?.id, `${at} hits furniture`).toBeUndefined();
        }
      }
    }
  });
});

describe('furniture', () => {
  it.each(FURNITURE.map((f) => [f.id, f] as const))('%s stands inside its room', (_id, item) => {
    const fp = footprintOf(item);
    expect(standsIn(roomById(item.room), fp), `${item.id} ${JSON.stringify(fp)} leaves ${item.room}`).toBe(
      true,
    );
  });

  it('never collides with other free-standing furniture on its floor, or with the stair', () => {
    const stair: Rect = { x0: STAIRS.x0, x1: STAIR_WALL.x1, z0: STAIRS.head, z1: STAIRS.foot };
    for (const [i, a] of standing.entries()) {
      if (storeyOf(a) === 'ground') {
        expect(overlapArea(footprintOf(a), stair), `${a.id} stands on the stair`).toBeLessThan(EPS);
      }
      for (const b of standing.slice(i + 1)) {
        if (storeyOf(a) !== storeyOf(b)) continue;
        expect(overlapArea(footprintOf(a), footprintOf(b)), `${a.id} hits ${b.id}`).toBeLessThan(EPS);
      }
    }
  });

  it('only stands on things it fits on', () => {
    for (const item of FURNITURE.filter((f): f is Furniture & { on: string } => Boolean(f.on))) {
      const host = FURNITURE.find((f) => f.id === item.on);
      expect(host, item.id).toBeDefined();
      if (host)
        expect(contains(footprintOf(host), footprintOf(item)), `${item.id} overhangs ${host.id}`).toBe(true);
    }
  });

  it('keeps the floor in front of every doorway clear', () => {
    for (const wall of WALLS) {
      const t = wall.thickness / 2;
      for (const o of wall.openings.filter(passable)) {
        for (const side of [1, -1] as const) {
          const room = roomOnSide(wall, (o.from + o.to) / 2, side);
          // Closets are not stood in: their shelves fill them right behind their doors.
          if (!room || room.storage) continue;
          const zone = besideWall(wall, o.from, o.to, side * t, side * (t + DOOR_CLEAR));
          for (const item of standing.filter((f) => storeyOf(f) === wall.storey)) {
            expect(overlapArea(zone, footprintOf(item)), `${item.id} blocks ${o.id}`).toBeLessThan(EPS);
          }
        }
      }
    }
  });
});

describe('the roofs', () => {
  /** A point just outside `wall`'s face on `side`, at `along`. */
  const outside = (wall: Wall, along: number, side: 1 | -1): [number, number] => {
    const across = wall.at + side * (wall.thickness / 2 + 0.05);
    return wall.axis === 'x' ? [along, across] : [across, along];
  };
  const openSide = (wall: Wall, along: number): 1 | -1 | null => {
    if (!roomOnSide(wall, along, 1)) return 1;
    if (!roomOnSide(wall, along, -1)) return -1;
    return null;
  };

  it('shelter every room: the upper storey or a roof over each downstairs one, a roof over each upstairs one', () => {
    for (const room of ROOMS) {
      for (const r of room.rects) {
        for (const [x, z] of samples(r, 5, 0.1)) {
          const roofed = (roofTopAt(x, z) ?? 0) > STOREYS[room.storey].top;
          const under = room.storey === 'ground' && roomAt(x, z, 'upper') !== undefined;
          expect(roofed || under, `${room.id} is open to the sky at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(
            true,
          );
        }
      }
    }
  });

  it('never lay two attics on the same plate over the same ground', () => {
    // The upper roof spans the notch the stair leaves in the upper storey, over the lean-to
    // below it; attics a storey apart may share a footprint.
    const rects = ROOFS.flatMap((roof) => roof.rects.map((r) => ({ id: roof.id, plate: roof.plate, r })));
    for (const [i, a] of rects.entries()) {
      for (const b of rects.slice(i + 1).filter((b) => b.plate === a.plate)) {
        expect(overlapArea(a.r, b.r), `${a.id} and ${b.id} overlap`).toBeLessThan(EPS);
      }
    }
  });

  it('leave every outside opening upstairs clear of the lower roofs, flashing included', () => {
    for (const wall of WALLS.filter((w) => w.storey === 'upper')) {
      for (const o of wall.openings) {
        const side = openSide(wall, (o.from + o.to) / 2);
        if (side === null) continue;
        for (let k = 0; k <= 8; k++) {
          const [x, z] = outside(wall, o.from + ((o.to - o.from) * k) / 8, side);
          // The upper roof's own eaves overhang every upstairs window; only the roofs below count.
          const roof = roofTopAt(x, z, 'upper') ?? 0;
          expect(o.sill, `${o.id} sits under the roof below it`).toBeGreaterThanOrEqual(roof + 0.15 - EPS);
        }
      }
    }
  });

  it('hang every hood under the eaves above it, over the opening it shelters', () => {
    for (const hood of HOODS) {
      const wall = WALLS.find((w) => w.id === hood.wall);
      if (!wall) throw new Error(`${hood.id} is on missing wall ${hood.wall}`);
      const side = openSide(wall, (hood.from + hood.to) / 2);
      if (side === null) throw new Error(`${hood.id} is on an inside wall`);
      const [x, z] = outside(wall, (hood.from + hood.to) / 2, side);
      const top = roofTopAt(x, z);
      if (top !== undefined) {
        expect(hood.y + 0.12, `${hood.id} runs into the eave`).toBeLessThanOrEqual(
          top - ROOF_BUILD.cover - ROOF_BUILD.depth,
        );
      }
      const sheltered = wall.openings.filter((o) => o.to > hood.from && o.from < hood.to);
      expect(sheltered.length, `${hood.id} shelters nothing`).toBeGreaterThan(0);
      for (const o of sheltered) {
        expect(o.from, `${hood.id} is narrower than ${o.id}`).toBeGreaterThanOrEqual(hood.from - EPS);
        expect(o.to, `${hood.id} is narrower than ${o.id}`).toBeLessThanOrEqual(hood.to + EPS);
        expect(o.head, `${hood.id} hangs below ${o.id}'s head`).toBeLessThanOrEqual(hood.y + EPS);
      }
    }
  });

  it('drain every downpipe from a real eave', () => {
    for (const pipe of DOWNPIPES) {
      const roof = ROOFS.find((r) => r.id === pipe.roof);
      if (!roof) throw new Error(`no roof ${pipe.roof}`);
      const at = roof.rects.some((r) => {
        const { along } = coverRanges(roof, r);
        return isEave(roof, r, pipe.side) && pipe.at > along[0] + 0.1 && pipe.at < along[1] - 0.1;
      });
      expect(at, `${pipe.roof} ${pipe.side} at ${pipe.at}`).toBe(true);
    }
  });

  it('carry every roof on walls: each eave line stands on an outside wall of the storey below', () => {
    for (const roof of ROOFS) {
      const storey: StoreyId = roof.plate === STOREYS.upper.top ? 'upper' : 'ground';
      expect(roof.plate).toBe(STOREYS[storey].top);
      for (const r of roof.rects) {
        const { across, along } = rectRanges(roof, r);
        for (const side of ['lo', 'hi'] as const) {
          if (!isEave(roof, r, side)) continue;
          const p = side === 'lo' ? across[0] : across[1];
          const mid = (along[0] + along[1]) / 2;
          const [x, z] = roof.axis === 'z' ? [p, mid] : [mid, p];
          expect(wallAt(x, z, storey), `${roof.id} eave at ${p} stands on no wall`).toBeDefined();
        }
      }
    }
  });
});

describe('the stairs', () => {
  const rise = (STAIRS.toY - STAIRS.fromY) / STAIRS.risers;
  const going = (STAIRS.foot - STAIRS.head) / STAIRS.risers;
  const mx = (STAIRS.x0 + STAIRS.x1) / 2;

  it('climb from floor to floor within a Japanese house stair’s limits', () => {
    expect(STAIRS.fromY).toBe(STOREYS.ground.floor);
    expect(STAIRS.toY).toBe(STOREYS.upper.floor);
    // Building Standards Act, houses: risers at most 230 mm, goings at least 150 mm.
    expect(rise).toBeLessThanOrEqual(0.23);
    expect(going).toBeGreaterThanOrEqual(0.15);
    // Two risers and a going near a natural stride.
    expect(2 * rise + going).toBeGreaterThanOrEqual(0.55);
    expect(2 * rise + going).toBeLessThanOrEqual(0.7);
  });

  it('stand in the hallway beside a walkway, with room to turn onto them at the foot', () => {
    const hall = roomById('hallway').rects[0];
    if (!hall) throw new Error('the hallway has no rectangle');
    const inside = interiorOf(hall, 'ground');
    expect(STAIRS.x0).toBeGreaterThanOrEqual(inside.x0 - EPS);
    expect(STAIR_WALL.x0).toBeCloseTo(STAIRS.x1);
    expect(inside.x1 - STAIR_WALL.x1, 'walkway beside the knee wall').toBeGreaterThanOrEqual(0.75);
    expect(STAIRS.head).toBeGreaterThanOrEqual(hall.z0 - EPS);
    expect(inside.z1 - STAIRS.foot, 'landing before the first riser').toBeGreaterThanOrEqual(0.9);
  });

  it('arrive at the edge of the upstairs floor, with only the stairwell over the flight', () => {
    expect(roomAt(mx, STAIRS.head - 0.05, 'upper')?.id).toBe('upperHall');
    expect(roomAt(mx, STAIRS.head + 0.05, 'upper')?.id).toBe('stairwell');
    // Headroom: nothing with a floor stands over any tread.
    const flight: Rect = { x0: STAIRS.x0, x1: STAIRS.x1, z0: STAIRS.head, z1: STAIRS.foot };
    for (const [x, z] of samples(flight, 8, 0.01)) {
      const over = roomAt(x, z, 'upper');
      expect(over === undefined || over.floor === 'void', `${over?.id} over the flight at z ${z}`).toBe(true);
    }
  });

  it('carry the upstairs wall on their knee wall, and leave the kitchen door on the walkway', () => {
    const upEast = WALLS.find((w) => w.id === 'up-east');
    expect(upEast?.at).toBeCloseTo((STAIR_WALL.x0 + STAIR_WALL.x1) / 2);
    expect(upEast?.thickness).toBeCloseTo(STAIR_WALL.x1 - STAIR_WALL.x0);
    expect(LEVEL.top).toBe(STOREYS.upper.base);
    const door = WALLS.flatMap((w) => w.openings).find((o) => o.id === 'door-kitchen');
    if (!door) throw new Error('no kitchen door');
    expect(door.from).toBeGreaterThanOrEqual(STAIR_WALL.x1 + JAMB - EPS);
  });
});
