import { describe, expect, it } from 'vitest';
import {
  baseOf,
  FURNITURE,
  footprintOf,
  interiorOf,
  ROOMS,
  type Room,
  roomAt,
  roomById,
  STAIR_WALL,
  STAIRS,
  WALLS,
  wallAt,
} from './house/plan';
import { ROOM_VIEWS, roomViews, SIGHT } from './room-views';

const within = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }, margin = 0) =>
  x > r.x0 + margin && x < r.x1 - margin && z > r.z0 + margin && z < r.z1 - margin;

const standable = (room: Room) => !room.storage && room.floor !== 'void';
const doorOf = (id: string) => {
  for (const wall of WALLS) {
    const door = wall.openings.find((o) => o.id === id && o.kind === 'door');
    if (door) return { wall, door };
  }
  throw new Error(`no door ${id}`);
};
const all = ROOM_VIEWS.flatMap(({ room, views }) => views.map((view) => ({ room, view })));

describe('room views', () => {
  it('show every room but the stairwell: the ones stood in, and the closets through their doors', () => {
    for (const room of ROOMS.filter(standable)) {
      expect(roomViews(room).length, `${room.id} has no view`).toBeGreaterThan(0);
    }
    for (const room of ROOMS.filter((r) => r.storage)) {
      expect(
        roomViews(room).map((v) => v.label),
        room.id,
      ).toEqual(['Doorway']);
    }
    expect(ROOM_VIEWS.map((entry) => entry.room.id)).toEqual(
      ROOMS.filter((room) => room.floor !== 'void').map((room) => room.id),
    );
  });

  it('show the toilet, washroom and bath first from their doorways', () => {
    for (const room of ROOMS.filter((r) => r.floor === 'bath')) {
      expect(roomViews(room)[0]?.label, room.id).toBe('Doorway');
    }
  });

  it('stand the eye in a room that can be stood in, clear of its walls, at eye height over its floor', () => {
    for (const { room, view } of all) {
      const [x, y, z] = view.eye;
      const at = roomAt(x, z, room.storey);
      if (!at) throw new Error(`${room.id} ${view.label} stands outside`);
      // A corner view stands in its own room; a doorway view in the room it is seen from.
      if (!view.door) expect(at.id, `${room.id} ${view.label}`).toBe(room.id);
      expect(standable(at), `${room.id} ${view.label} stands in ${at.id}`).toBe(true);
      const clear = at.rects.some((r) => within(x, z, interiorOf(r, at.storey), 0.1));
      expect(clear, `${room.id} ${view.label} stands in a wall`).toBe(true);
      expect(y - at.floorY, `${room.id} ${view.label}`).toBeGreaterThan(1);
      expect(y - at.floorY, `${room.id} ${view.label}`).toBeLessThan(2);
    }
  });

  it('never put the eye inside furniture or the stair', () => {
    for (const { room, view } of all) {
      const [x, y, z] = view.eye;
      for (const item of FURNITURE.filter((f) => roomById(f.room).storey === room.storey)) {
        const base = baseOf(item);
        const inside = within(x, z, footprintOf(item)) && y >= base && y <= base + item.h;
        expect(inside, `${room.id} ${view.label} is inside ${item.id}`).toBe(false);
      }
      if (room.storey !== 'ground') continue;
      const onFlight = within(x, z, { x0: STAIRS.x0, x1: STAIR_WALL.x1, z0: STAIRS.head, z1: STAIRS.foot });
      expect(onFlight, `${room.id} ${view.label} stands on the stair`).toBe(false);
    }
  });

  it('look through the doorway itself, into the room it shows', () => {
    for (const { room, view } of all.filter(({ view }) => view.door)) {
      if (!view.door) continue;
      const { wall, door } = doorOf(view.door);
      const [ex, , ez] = view.eye;
      const [ax, , az] = view.aim;
      // Where the line of sight crosses the wall's centre line, it is inside the opening.
      const [e, a] = wall.axis === 'x' ? [ez, az] : [ex, ax];
      const s = (wall.at - e) / (a - e);
      expect(s, `${room.id} looks away from ${door.id}`).toBeGreaterThan(0);
      const along = wall.axis === 'x' ? ex + (ax - ex) * s : ez + (az - ez) * s;
      expect(along, `${room.id} misses ${door.id}`).toBeGreaterThan(door.from);
      expect(along, `${room.id} misses ${door.id}`).toBeLessThan(door.to);
      // 0.3 m through the opening: a closet is only a module deep.
      const [bx, bz] = [ex + (ax - ex) * (s + 0.3), ez + (az - ez) * (s + 0.3)];
      expect(roomAt(bx, bz, room.storey)?.id, `${room.id} ${view.label} looks into the wrong room`).toBe(
        room.id,
      );
    }
  });

  it('give every corner view a clear metre ahead: no wall, nothing near eye height', () => {
    for (const { room, view } of all.filter(({ view }) => !view.door)) {
      const [ex, ey, ez] = view.eye;
      const [ax, , az] = view.aim;
      for (let d = 0.1; d <= SIGHT; d += 0.1) {
        const x = ex + (ax - ex) * d;
        const z = ez + (az - ez) * d;
        const at = `${room.id} ${view.label}, ${d.toFixed(1)} m ahead`;
        expect(wallAt(x, z, room.storey), `${at} is a wall`).toBeUndefined();
        const item = FURNITURE.find(
          (f) =>
            roomById(f.room).storey === room.storey &&
            within(x, z, footprintOf(f)) &&
            !f.floorCover &&
            baseOf(f) + f.h > ey - 0.25,
        );
        expect(item?.id, `${at} is furniture`).toBeUndefined();
      }
    }
  });

  it('look a little down, and name each place once', () => {
    for (const { room, views } of ROOM_VIEWS) {
      const labels = views.map((v) => v.label);
      expect(new Set(labels).size, `${room.id}: ${labels.join(', ')}`).toBe(labels.length);
      for (const view of views) {
        const [ex, ey, ez] = view.eye;
        const [ax, ay, az] = view.aim;
        expect(Math.hypot(ax - ex, az - ez), `${room.id} ${view.label} looks nowhere`).toBeCloseTo(1, 6);
        expect(ay, `${room.id} ${view.label}`).toBeLessThan(ey);
      }
    }
  });
});
